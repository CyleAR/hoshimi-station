#!/usr/bin/env python3
"""Export the translation DB and publish it to the public data repo.

  publish_release.py [--mirror DIR] [--push]

Without --push: exports, updates the mirror working tree, prints the diff summary, and
leaves everything uncommitted for inspection (use `git -C DIR checkout . && git clean -fd`
to discard). With --push: bumps version.txt, commits "Release <VER>" and pushes to origin.
release.yml in the data repo then builds the GitHub release.

The DB is the source of truth. Only the DB-exported parts of the mirror are replaced
(local-files/masterTrans, localization.json, resource/adv); other shipped files
(genericTrans, phoneSubtitles.json, resource/img) are left untouched. The mirror's own
files serve as format reference so unchanged files stay byte-identical.

Env: PUBLISH_MIRROR (default ~/ipr-translation-data-en-public),
     PUBLISH_REQUIRE_REVIEW=1 refuses to publish while ai_suggestions are pending acceptance.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "hoshimi.sqlite3"
PARTS = ["masterTrans", "localization.json", "resource/adv"]


def run(*a: str, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(list(a), cwd=cwd, check=check, capture_output=True, text=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, default=DB)
    ap.add_argument("--mirror", type=Path, default=Path(os.environ.get("PUBLISH_MIRROR", "~/ipr-translation-data-en-public")).expanduser())
    ap.add_argument("--push", action="store_true")
    args = ap.parse_args()
    mirror: Path = args.mirror
    if not (mirror / ".git").exists():
        print(f"mirror {mirror} is not a git checkout", file=sys.stderr)
        return 2
    if run("git", "status", "--porcelain", cwd=mirror).stdout.strip():
        print("mirror has uncommitted changes; clean it first", file=sys.stderr)
        return 2
    run("git", "pull", "--ff-only", cwd=mirror)

    if os.environ.get("PUBLISH_REQUIRE_REVIEW") == "1":
        conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
        pending = conn.execute("SELECT COUNT(*) FROM ai_suggestions WHERE accepted_at IS NULL").fetchone()[0]
        conn.close()
        if pending:
            print(f"review required: {pending} AI suggestions not yet accepted", file=sys.stderr)
            return 3

    ref = mirror / "local-files"
    with tempfile.TemporaryDirectory(prefix="hoshimi-export-") as tmp:
        out = Path(tmp) / "out"
        r = run(sys.executable, str(ROOT / "scripts" / "export_output.py"), "--db", str(args.db), "--out", str(out),
                "--overwrite", "--format-reference", str(ref / "masterTrans"), "--shipped-keys-only",
                "--adv-reference", str(ref / "resource" / "adv"))
        print(r.stdout.strip().splitlines()[-1])
        for part in PARTS:
            src, dst = out / "local-files" / part, ref / part
            if not src.exists():
                print(f"export missing {part}; aborting", file=sys.stderr)
                run("git", "checkout", ".", cwd=mirror)
                return 4
            if src.is_dir():
                keep = [f for f in dst.rglob(".gitkeep")]
                shutil.rmtree(dst, ignore_errors=True)
                shutil.copytree(src, dst)
                for f in keep:
                    f.touch()
            else:
                shutil.copy2(src, dst)

    stat = run("git", "diff", "--stat", cwd=mirror).stdout.strip().splitlines()
    status = run("git", "status", "--porcelain", cwd=mirror).stdout.strip()
    if not status:
        print("no changes to publish")
        return 0
    print("\n".join(stat[-1:] or [f"{len(status.splitlines())} files changed"]))
    if not args.push:
        print("dry run: mirror working tree updated, nothing committed")
        return 0
    ver = datetime.now().strftime("%Y%m%d_%H%M%S")
    (mirror / "version.txt").write_text(ver + "\n")
    run("git", "add", "-A", cwd=mirror)
    run("git", "commit", "-m", f"Release {ver}", cwd=mirror)
    run("git", "push", "origin", "HEAD", cwd=mirror)
    print(f"published {ver}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
