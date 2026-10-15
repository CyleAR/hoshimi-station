#!/usr/bin/env bash
# Unattended pipeline: detect upstream change -> verified ingest (swap) -> batch first drafts.
# Container control (STOP_CMD/START_CMD) runs as the invoking user; docker is 1000-only, so see docs/automation.md (sudo -u).
# Default: drafts land as pending ai_suggestions for human review and nothing is published.
# Fully automatic: set DRAFT_AUTO_ACCEPT=1 and AUTO_PUBLISH=1 in sync.env.
# Run on the host as the user that owns ./data (uid 1001). Needs python3, git, node.
#   env: STOP_CMD / START_CMD   container control (default: docker compose stop|start)
#        NODE_BIN               node >= 22.5 (node:sqlite) for the draft step; may be a full command (default: node)
#        DRAFT_LIMIT            max units drafted per run (default 500)
#        DRAFT_AUTO_ACCEPT=1    accept gate-passing drafts (as DRAFT_ACCEPT_AS) instead of leaving them pending
#        AUTO_PUBLISH=1         after drafting, export the DB and push a release (scripts/publish_release.py --push);
#                               PUBLISH_MIRROR = public data checkout. With PUBLISH_REQUIRE_REVIEW=1 it is skipped
#                               while any draft is unaccepted (rc 3).
set -uo pipefail
cd "$(dirname "$0")/.."
# Optional settings file (gitignored): STOP_CMD, START_CMD, DRAFT_*, AI keys. Plain KEY=value lines.
if [ -f sync.env ]; then set -a; . ./sync.env; set +a; fi
mkdir -p backups
exec 9>backups/.auto_sync.lock
flock -n 9 || { echo "$(date -Is) another run in progress"; exit 0; }
log() { echo "$(date -Is) $*"; }
STOP_CMD="${STOP_CMD:-docker compose stop}"
START_CMD="${START_CMD:-docker compose start}"

scripts/upstream_sync.py detect; rc=$?
if [ "$rc" -eq 0 ]; then
	log "upstream unchanged; skipping ingest"
elif [ "$rc" -eq 10 ]; then
	log "upstream moved; ingesting"
	scripts/upstream_sync.py ingest --apply --stop-cmd "$STOP_CMD" --start-cmd "$START_CMD"; rc=$?
	if [ "$rc" -ne 0 ]; then log "ingest refused/failed ($rc); live DB untouched; drafting skipped"; exit "$rc"; fi
else
	log "detect failed ($rc)"; exit 1
fi

# Runs every time (also when upstream is unchanged): already-drafted units are skipped, so it only retries leftovers.
log "drafting new units"
${NODE_BIN:-node} scripts/draft_new.mjs --limit "${DRAFT_LIMIT:-500}" || log "draft step failed ($?)"
if [ "${AUTO_PUBLISH:-0}" = "1" ]; then
	log "publishing"
	python3 scripts/publish_release.py --push; prc=$?
	case "$prc" in
		0) log "publish ok (or no changes)" ;;
		3) log "publish skipped: drafts pending review" ;;
		*) log "publish failed ($prc)"; exit "$prc" ;;
	esac
	log "done"
else
	log "done; review drafts in the UI, publish manually"
fi
