#!/usr/bin/env bash
# Unattended pipeline: detect upstream change -> verified ingest (swap) -> batch first drafts.
# Container control (STOP_CMD/START_CMD) runs as the invoking user; docker is 1000-only, so see docs/automation.md (sudo -u).
# Drafts land as pending ai_suggestions for human review; nothing is published.
# Run on the host as the user that owns ./data (uid 1001). Needs python3, git, node.
#   env: STOP_CMD / START_CMD   container control (default: docker compose stop|start)
#        DRAFT_LIMIT            max units drafted per run (default 500)
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
exec 9>backups/.auto_sync.lock
flock -n 9 || { echo "$(date -Is) another run in progress"; exit 0; }
log() { echo "$(date -Is) $*"; }
STOP_CMD="${STOP_CMD:-docker compose stop}"
START_CMD="${START_CMD:-docker compose start}"

scripts/upstream_sync.py detect; rc=$?
if [ "$rc" -eq 0 ]; then log "upstream unchanged"; exit 0; fi
[ "$rc" -eq 10 ] || { log "detect failed ($rc)"; exit 1; }

log "upstream moved; ingesting"
scripts/upstream_sync.py ingest --apply --stop-cmd "$STOP_CMD" --start-cmd "$START_CMD"; rc=$?
if [ "$rc" -ne 0 ]; then log "ingest refused/failed ($rc); live DB untouched; drafting skipped"; exit "$rc"; fi

log "drafting new units"
node scripts/draft_new.mjs --limit "${DRAFT_LIMIT:-500}" || log "draft step failed ($?)"
log "done; review drafts in the UI, publish manually"
