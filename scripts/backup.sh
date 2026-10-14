#!/usr/bin/env bash
# Online SQLite backup with retention. Usage: scripts/backup.sh [DB] [BACKUP_DIR] [KEEP_DAYS]
# Run as the user that owns ./data (uid 1001). Safe while the app is running.
# Uses the sqlite3 CLI if present, otherwise python3's sqlite3 backup API.
set -euo pipefail
DB="${1:-data/hoshimi.sqlite3}"
DIR="${2:-backups}"
KEEP="${3:-7}"
mkdir -p "$DIR"
OUT="$DIR/hoshimi-$(date +%F-%H%M).sqlite3"
if command -v sqlite3 >/dev/null; then
  sqlite3 "$DB" ".backup '$OUT'"
  [ "$(sqlite3 "$OUT" 'PRAGMA integrity_check;')" = ok ]
else
  python3 - "$DB" "$OUT" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True, timeout=30)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
ok = dst.execute("PRAGMA integrity_check").fetchone()[0]
dst.close()
sys.exit(0 if ok == "ok" else "integrity_check failed: " + ok)
PY
fi
gzip -f "$OUT"
find "$DIR" -name 'hoshimi-*.sqlite3.gz' -mtime +"$KEEP" -delete
echo "backup ok: $OUT.gz"
