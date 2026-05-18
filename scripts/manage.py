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
    print(f"detached HEAD 상태입니다. origin/{default_branch} 기준으로 브랜치를 체크아웃합니다.")
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
    print(f"  이전 해시: {before_short}")
    print(f"  현재 해시: {after_short}")

    if before == after:
        print("  변경 없음")
        return

    print("  새 커밋:")
    log = capture(["git", "-C", str(path), "log", "--oneline", "--decorate", f"{before}..{after}"], check=False)
    print(indent(log or "(커밋 로그 없음)", "    "))

    print("  변경 요약:")
    stat = capture(["git", "-C", str(path), "diff", "--stat", before, after], check=False)
    print(indent(stat or "(diff stat 없음)", "    "))

    changed = capture(["git", "-C", str(path), "diff", "--name-status", before, after], check=False)
    if changed:
        print("  import/export 영향 파일:")
        for line in changed.splitlines()[:80]:
            print(f"    {line}")
        if len(changed.splitlines()) > 80:
            print(f"    ...외 {len(changed.splitlines()) - 80}개")


def indent(text: str, prefix: str) -> str:
    return "\n".join(f"{prefix}{line}" for line in text.splitlines())


def pull_submodules(paths: list[Path] | None = None) -> None:
    paths = paths or submodule_paths()
    run(["git", "submodule", "update", "--init", "--recursive"])

    for path in paths:
        if not path.exists():
            raise SystemExit(f"Submodule path does not exist: {path}")

        dirty = git_status(path)
        if dirty:
            print()
            print(f"[{rel(path)}] 로컬 변경사항이 있습니다. pull 전에 확인하세요.")
            print(indent(dirty, "  "))
            raise SystemExit("서브모듈에 로컬 변경사항이 있어 중단했습니다.")

        before = git_hash(path)
        print()
        print(f"== {rel(path)} 최신화 ==")
        print(f"pull 전 해시: {git_short(path, before)}")
        branch = checkout_pullable_branch(path)
        print(f"branch: {branch}")
        run(["git", "-C", str(path), "pull", "--ff-only"])
        after = git_hash(path)
        print_submodule_diff(path, before, after)


def import_db() -> None:
    print()
    print("== DB import 시작 ==")
    run([python(), "scripts/import_db.py", "--db", str(DB_PATH)])


def backup_db() -> Path:
    if not DB_PATH.exists():
        raise SystemExit(f"Database not found: {DB_PATH}")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_dir = BACKUP_DIR / stamp
    target_dir.mkdir(parents=True, exist_ok=False)
    target_db = target_dir / DB_PATH.name

    print()
    print("== DB 백업 시작 ==")
    print(f"원본: {rel(DB_PATH)}")
    print(f"백업: {rel(target_db)}")

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
    print(f"백업 완료: {rel(target_dir)}")
    print(f"integrity_check={integrity}")
    return target_dir


def export_output() -> None:
    output_dir = ROOT / "output"
    if not output_dir.exists():
        raise SystemExit(f"Output submodule not found: {output_dir}")

    print()
    print("== output submodule 최신화 ==")
    before = git_hash(output_dir)
    branch = checkout_pullable_branch(output_dir)
    print(f"branch: {branch}")
    run(["git", "-C", str(output_dir), "pull", "--ff-only"])
    after = git_hash(output_dir)
    print_submodule_diff(output_dir, before, after)

    print()
    print("== DB에서 output 생성 ==")
    run([python(), "scripts/export_output.py", "--db", str(DB_PATH), "--out", str(output_dir), "--overwrite"])

    status = git_status(output_dir)
    if not status:
        print("output 변경사항이 없어 push하지 않습니다.")
        return

    print()
    print("== output 변경사항 ==")
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
    print("무엇을 실행할까요?")
    print()
    print("1. 원본 최신화 + DB import")
    print("   - res/adv, res/masterdb, output 서브모듈을 git pull 합니다.")
    print("   - pull 전후 커밋 해시를 비교하고, 새 커밋/변경 파일/diff 요약을 보여줍니다.")
    print("   - 그 다음 DB를 재구축합니다. 기존 번역은 import_db 보존 로직으로 유지됩니다.")
    print()
    print("2. DB 백업")
    print("   - backups/YYYYMMDD_HHMMSS 폴더를 만들고 현재 DB를 백업합니다.")
    print("   - SQLite backup API를 사용해서 WAL에 있는 최신 저장분도 포함합니다.")
    print()
    print("3. output 생성 + output 서브모듈 push")
    print("   - output을 git pull 한 뒤 DB에서 Localify output을 생성합니다.")
    print("   - 변경사항이 있으면 output 서브모듈에서 commit 후 push 합니다.")
    print()
    print("q. 종료")
    print()
    return input("번호 입력 > ").strip().lower()


def main() -> None:
    configure_stdio()
    parser = argparse.ArgumentParser(description="HoshimiStation maintenance helper.")
    parser.add_argument("action", nargs="?", choices=["1", "2", "3"], help="Action to run without interactive menu.")
    args = parser.parse_args()

    choice = args.action or menu()
    if choice == "1":
        pull_submodules()
        import_db()
    elif choice == "2":
        backup_db()
    elif choice == "3":
        export_output()
    elif choice in {"q", "quit", "exit"}:
        return
    else:
        raise SystemExit("1, 2, 3, q 중 하나를 입력하세요.")


if __name__ == "__main__":
    main()
