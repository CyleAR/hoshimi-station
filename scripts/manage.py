from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "hoshimi.sqlite3"
BACKUP_DIR = ROOT / "backups"
SUBMODULES = [ROOT / "res" / "adv", ROOT / "res" / "masterdb", ROOT / "output"]


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def run(command: list[str], cwd: Path = ROOT, check: bool = True) -> subprocess.CompletedProcess[str]:
    print(f"$ {' '.join(command)}")
    return subprocess.run(command, cwd=cwd, check=check, text=True)


def capture(command: list[str], cwd: Path = ROOT, check: bool = True) -> str:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=check)
    return result.stdout.strip()


def python() -> str:
    return sys.executable


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def submodule_paths() -> list[Path]:
    paths: list[Path] = []
    gitmodules = ROOT / ".gitmodules"
    if gitmodules.exists():
        result = subprocess.run(
            ["git", "config", "--file", str(gitmodules), "--get-regexp", r"^submodule\..*\.path$"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        for line in result.stdout.splitlines():
            parts = line.split(maxsplit=1)
            if len(parts) == 2:
                paths.append((ROOT / parts[1]).resolve())
    return paths or [path.resolve() for path in SUBMODULES]


def git_hash(path: Path) -> str:
    return capture(["git", "-C", str(path), "rev-parse", "HEAD"])


def try_git_hash(path: Path) -> str | None:
    if not path.exists():
        return None
    result = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def git_short(path: Path, commit: str) -> str:
    return capture(["git", "-C", str(path), "rev-parse", "--short", commit])


def git_status(path: Path) -> str:
    return capture(["git", "-C", str(path), "status", "--porcelain"])


def current_branch(path: Path) -> str:
    return capture(["git", "-C", str(path), "rev-parse", "--abbrev-ref", "HEAD"])


def remote_default_branch(path: Path) -> str:
    run(["git", "-C", str(path), "fetch", "--prune", "origin"])
    head = capture(["git", "-C", str(path), "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], check=False)
    if head.startswith("origin/"):
        return head.removeprefix("origin/")

    remote_info = capture(["git", "-C", str(path), "remote", "show", "origin"], check=False)
    for line in remote_info.splitlines():
        line = line.strip()
        if line.startswith("HEAD branch:"):
            return line.split(":", 1)[1].strip()

    for candidate in ("main", "master"):
        exists = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "--verify", f"origin/{candidate}"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
        if exists.returncode == 0:
            return candidate

    raise SystemExit(f"Cannot determine default branch for {rel(path)}")


def checkout_pullable_branch(path: Path) -> str:
    branch = current_branch(path)
    if branch != "HEAD":
        return branch

    default_branch = remote_default_branch(path)
    print(f"HEAD is detached. Checking out a branch based on origin/{default_branch}.")
    local_exists = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "--verify", default_branch],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
        check=False,
    )
    if local_exists.returncode == 0:
        run(["git", "-C", str(path), "checkout", default_branch])
    else:
        run(["git", "-C", str(path), "checkout", "-B", default_branch, f"origin/{default_branch}"])
    return default_branch


def print_submodule_diff(path: Path, before: str, after: str) -> None:
    name = rel(path)
    before_short = git_short(path, before)
    after_short = git_short(path, after)
    print()
    print(f"[{name}]")
    print(f"  Previous hash: {before_short}")
    print(f"  Current hash: {after_short}")

    if before == after:
        print("  No changes")
        return

    print("  New commits:")
    log = capture(["git", "-C", str(path), "log", "--oneline", "--decorate", f"{before}..{after}"], check=False)
    print(indent(log or "(no commit log)", "    "))

    print("  Change summary:")
    stat = capture(["git", "-C", str(path), "diff", "--stat", before, after], check=False)
    print(indent(stat or "(no diff stat)", "    "))

    changed = capture(["git", "-C", str(path), "diff", "--name-status", before, after], check=False)
    if changed:
        print("  Files affecting import/export:")
        for line in changed.splitlines()[:80]:
            print(f"    {line}")
        if len(changed.splitlines()) > 80:
            print(f"    ...and {len(changed.splitlines()) - 80} more")


def indent(text: str, prefix: str) -> str:
    return "\n".join(f"{prefix}{line}" for line in text.splitlines())


def pull_submodules(paths: list[Path] | None = None) -> bool:
    paths = paths or submodule_paths()
    before_hashes = {path: try_git_hash(path) for path in paths}
    for path, before in before_hashes.items():
        if before is None:
            continue
        dirty = git_status(path)
        if dirty:
            print()
            print(f"[{rel(path)}] has local changes. Check them before pulling.")
            print(indent(dirty, "  "))
            raise SystemExit("Aborted: a submodule has local changes.")

    run(["git", "submodule", "update", "--init", "--recursive"])
    changed_any = False

    for path in paths:
        if not path.exists():
            raise SystemExit(f"Submodule path does not exist: {path}")

        before = before_hashes.get(path)
        print()
        print(f"== {rel(path)} update ==")
        if before is None:
            print("Hash before start: (not initialized)")
        else:
            print(f"Hash before start: {git_short(path, before)}")
        branch = checkout_pullable_branch(path)
        print(f"branch: {branch}")
        run(["git", "-C", str(path), "pull", "--ff-only"])
        after = git_hash(path)
        if before is None:
            print()
            print(f"[{rel(path)}]")
            print(f"  Current hash: {git_short(path, after)}")
            print("  Newly initialized")
            changed_any = True
        else:
            print_submodule_diff(path, before, after)
            changed_any = changed_any or before != after

    return changed_any


def import_db() -> None:
    print()
    print("== Starting DB import ==")
    run([python(), "scripts/import_db.py", "--db", str(DB_PATH)])


def backup_db() -> Path:
    if not DB_PATH.exists():
        raise SystemExit(f"Database not found: {DB_PATH}")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_dir = BACKUP_DIR / stamp
    target_dir.mkdir(parents=True, exist_ok=False)
    target_db = target_dir / DB_PATH.name

    print()
    print("== Starting DB backup ==")
    print(f"Source: {rel(DB_PATH)}")
    print(f"Backup: {rel(target_db)}")

    source = sqlite3.connect(DB_PATH)
    target = sqlite3.connect(target_db)
    try:
        source.execute("PRAGMA wal_checkpoint(PASSIVE)")
        source.backup(target)
        integrity = target.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        target.close()
        source.close()

    manifest = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "source": str(DB_PATH.relative_to(ROOT)),
        "backup": str(target_db.relative_to(ROOT)),
        "integrity_check": integrity,
        "method": "sqlite3.Connection.backup with WAL-aware source connection",
    }
    (target_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Backup complete: {rel(target_dir)}")
    print(f"integrity_check={integrity}")
    return target_dir


def checkpoint_db() -> None:
    if not DB_PATH.exists():
        raise SystemExit(f"Database not found: {DB_PATH}")

    wal_path = DB_PATH.with_name(DB_PATH.name + "-wal")
    before_size = wal_path.stat().st_size if wal_path.exists() else 0

    print()
    print("== SQLite WAL checkpoint ==")
    print(f"DB: {rel(DB_PATH)}")
    print(f"WAL before: {before_size:,} bytes")

    conn = sqlite3.connect(DB_PATH)
    try:
        result = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
    finally:
        conn.close()

    after_size = wal_path.stat().st_size if wal_path.exists() else 0
    print(f"result: {result}")
    print(f"WAL after: {after_size:,} bytes")


def bulk_replace_translation() -> None:
    print()
    print("== Bulk replace in translation_text ==")
    old = input("String to search for > ")
    if not old:
        print("Search string is empty; cancelling.")
        return
    new = input("Replacement string > ")
    if old == new:
        print("Search and replacement strings are identical; cancelling.")
        return

    print()
    print("== Change preview ==")
    preview = run(
        [python(), "scripts/replace_translation.py", old, new, "--db", str(DB_PATH), "--limit", "30"],
        check=False,
    )
    if preview.returncode != 0:
        raise SystemExit("Preview failed.")

    answer = input("Apply the changes above? [y/N] > ").strip().lower()
    if answer not in {"y", "yes"}:
        print("Change cancelled.")
        return

    print()
    print("== Applying changes ==")
    run([python(), "scripts/replace_translation.py", old, new, "--db", str(DB_PATH), "--apply"])


def cleanup_message_title_quotes() -> None:
    print()
    print("== Remove stray single quotes from message titles ==")
    print("Removes only outer single quotes from translated Message.name entries whose source is not wrapped in 「」.")
    print("Untranslated items and titles whose source is wrapped in 「」 are left unchanged.")
    print()
    run([python(), "scripts/cleanup_message_title_quotes.py", "--db", str(DB_PATH), "--limit", "30"])
    print()
    answer = input("Apply the changes above for real? [y/N] ").strip().lower()
    if answer not in {"y", "yes"}:
        print("Change cancelled.")
        return
    print()
    print("== Applying changes ==")
    run([python(), "scripts/cleanup_message_title_quotes.py", "--db", str(DB_PATH), "--apply"])


def overwrite_prefill_translations(*, confirm: bool = True) -> None:
    print()
    print("== Overwrite all translations from prefill ==")
    print("This overwrites every existing translation matching scripts/prefill_translations.json.")
    print("Hand-edited translations are overwritten too if they match, so back up the DB first.")
    print()
    if confirm:
        answer = input("Continue? [y/N] > ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Cancelled.")
            return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = ROOT / "tmp" / "reports" / f"prefill_overwrite_{stamp}.tsv"
    print()
    print("== Starting prefill overwrite import ==")
    run(
        [
            python(),
            "scripts/import_db.py",
            "--db",
            str(DB_PATH),
            "--overwrite-prefill",
            "--prefill-log",
            str(log_path),
        ]
    )


def run_skill_translation(mode: str, apply: bool, audit: bool = True) -> None:
    report_dir = ROOT / "tmp" / "reports"
    report = report_dir / (
        "auto_translate_skills_overwrite_report.md" if mode == "overwrite" else "auto_translate_skills_report.md"
    )
    command = [
        python(),
        "scripts/auto_translate_skills.py",
        "--db",
        str(DB_PATH),
        "--mode",
        mode,
        "--preview-limit",
        "300",
        "--report",
        str(report),
    ]
    if audit:
        command.extend(["--audit-report", str(report_dir / "auto_translate_skills_audit_report.md")])
    if apply:
        command.append("--apply-review")

    run(command)


def skill_translation_menu() -> None:
    print()
    print("== Skill auto translation ==")
    print()
    print("1. New translations dry-run")
    print("   - Report candidates that would fill empty translations only.")
    print("2. Apply new translations")
    print("   - Auto-generate empty translations only and write them to the DB.")
    print("3. Full translations dry-run")
    print("   - Report normalization candidates including existing translations.")
    print("4. Apply full translations")
    print("   - Overwrite existing translations too and write them to the DB.")
    print("5. Audit report only")
    print("   - Check current DB translations for leftover Japanese, number mismatches and spacing issues.")
    print("q. Cancel")
    choice = input("Enter number > ").strip().lower()

    if choice == "1":
        run_skill_translation("missing", apply=False)
    elif choice == "2":
        run_skill_translation("missing", apply=True)
    elif choice == "3":
        run_skill_translation("overwrite", apply=False)
    elif choice == "4":
        answer = input("This overwrites existing translations too. Continue? [y/N] > ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Cancelled.")
            return
        run_skill_translation("overwrite", apply=True)
    elif choice == "5":
        run_skill_translation("overwrite", apply=False, audit=True)
    elif choice in {"q", "quit", "exit"}:
        return
    else:
        raise SystemExit("Enter one of 1, 2, 3, 4, 5, q.")


def export_output() -> None:
    output_dir = ROOT / "output"
    if not output_dir.exists():
        raise SystemExit(f"Output submodule not found: {output_dir}")

    print()
    print("== output submodule update ==")
    before = git_hash(output_dir)
    branch = checkout_pullable_branch(output_dir)
    print(f"branch: {branch}")
    run(["git", "-C", str(output_dir), "pull", "--ff-only"])
    after = git_hash(output_dir)
    print_submodule_diff(output_dir, before, after)

    print()
    print("== Generating output from DB ==")
    run([python(), "scripts/export_output.py", "--db", str(DB_PATH), "--out", str(output_dir), "--overwrite"])

    status = git_status(output_dir)
    if not status:
        print("No output changes; not pushing.")
        return

    print()
    print("== Output changes ==")
    print(indent(status, "  "))
    stat = capture(["git", "-C", str(output_dir), "diff", "--stat"], check=False)
    if stat:
        print()
        print(indent(stat, "  "))

    run(["git", "-C", str(output_dir), "add", "-A"])
    message = f"Update translation output {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    run(["git", "-C", str(output_dir), "commit", "-m", message])
    run(["git", "-C", str(output_dir), "push"])


def menu() -> str:
    print()
    print("What would you like to run?")
    print()
    print("1. Update sources + DB import")
    print("   - git pull the res/adv, res/masterdb and output submodules.")
    print("   - Compare commit hashes before/after the pull and show new commits, changed files and a diff summary.")
    print("   - Then rebuild the DB. Existing translations are preserved by import_db's preservation logic.")
    print()
    print("2. DB backup")
    print("   - Create backups/YYYYMMDD_HHMMSS and back up the current DB.")
    print("   - Uses the SQLite backup API so the latest data in the WAL is included.")
    print("   - After a successful backup, run a WAL checkpoint on the source DB.")
    print()
    print("3. Generate output + push output submodule")
    print("   - git pull output, then generate Localify output from the DB.")
    print("   - If there are changes, commit and push in the output submodule.")
    print()
    print("4. SQLite WAL checkpoint")
    print("   - Run PRAGMA wal_checkpoint(TRUNCATE) from Python, no sqlite3 CLI needed.")
    print("   - Flush data/hoshimi.sqlite3-wal into the main DB and shrink the WAL.")
    print()
    print("5. Bulk replace translations")
    print("   - Enter a search string and a replacement; replaces in translation_text.")
    print("   - Shows a preview first and applies only after confirmation.")
    print()
    print("6. Overwrite all translations from prefill")
    print("   - Overwrite existing translations too, based on scripts/prefill_translations.json.")
    print("   - Write a change log to tmp/reports/prefill_overwrite_*.tsv.")
    print()
    print("7. Skill auto translation")
    print("   - Run new / full translation or the audit report.")
    print()
    print("8. Remove stray single quotes from message titles")
    print("   - Remove outer single quotes from translated message titles whose source has no 「」.")
    print("   - Shows a preview, then applies to the DB after confirmation.")
    print()
    print()
    print("q. Quit")
    print()
    return input("Enter number > ").strip().lower()


def main() -> None:
    configure_stdio()
    parser = argparse.ArgumentParser(description="HoshimiStation maintenance helper.")
    parser.add_argument(
        "action",
        nargs="?",
        choices=[
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "skill-missing-dry",
            "skill-missing",
            "skill-overwrite-dry",
            "skill-overwrite",
            "skill-audit",
            "prefill-overwrite",
        ],
        help="Action to run without interactive menu.",
    )
    args = parser.parse_args()

    choice = args.action or menu()
    if choice == "1":
        changed = pull_submodules()
        if changed:
            import_db()
        else:
            print()
            print("No submodule hash changes; skipping DB import.")
    elif choice == "2":
        backup_db()
        checkpoint_db()
    elif choice == "3":
        export_output()
    elif choice == "4":
        checkpoint_db()
    elif choice == "5":
        bulk_replace_translation()
    elif choice == "6":
        overwrite_prefill_translations()
    elif choice == "7":
        skill_translation_menu()
    elif choice == "8":
        cleanup_message_title_quotes()
    elif choice == "skill-missing-dry":
        run_skill_translation("missing", apply=False)
    elif choice == "skill-missing":
        run_skill_translation("missing", apply=True)
    elif choice == "skill-overwrite-dry":
        run_skill_translation("overwrite", apply=False)
    elif choice == "skill-overwrite":
        run_skill_translation("overwrite", apply=True)
    elif choice == "skill-audit":
        run_skill_translation("overwrite", apply=False, audit=True)
    elif choice == "prefill-overwrite":
        overwrite_prefill_translations(confirm=False)
    elif choice in {"q", "quit", "exit"}:
        return
    else:
        raise SystemExit("Enter one of 1, 2, 3, 4, 5, 6, 7, 8, q.")


if __name__ == "__main__":
    main()
