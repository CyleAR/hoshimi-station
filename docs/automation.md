# Upstream ingest and publish

Both jobs run on the host as the user that owns `data/` (uid 1001), not in the container.
Needs `python3` and `git`. The DB is the source of truth; the ingest/publish scripts never
modify it except through the verified swap below.

## 1. Detect and ingest — `scripts/upstream_sync.py`

    scripts/upstream_sync.py detect                # exit 10 = upstream moved, 0 = current
    scripts/upstream_sync.py ingest                # dry run on a copy; prints diff and warnings
    scripts/upstream_sync.py ingest --apply --stop-cmd 'docker compose stop' --start-cmd 'docker compose start'

Compares the ADV `revision` and master-diff `!version.txt` with markers stored in the DB table
`upstream_state` (first run always reports "changed"). Ingest shallow-clones both repos into
`data/upstream/`, imports into a copy of the DB, and refuses to swap (exit 3) if any unit id
vanished or any translation was lost while its JP original is unchanged. Rows whose JP original
changed upstream lose their translation and are listed as `WARN`; re-review them.
Before the swap it writes `backups/pre-ingest-*.sqlite3.gz` (3 kept), and aborts (exit 4) if
someone edited the live DB during the run. Takes about 4 min and needs ~3x the DB size free.
New untranslated rows land in `new_import_units`.

## 2. Batch first drafts — `scripts/draft_new.mjs`

Needs Node >= 22.5 (`node:sqlite`). If the host's `node` is older, point `NODE_BIN=/path/to/node22` in `sync.env` and run the script with that binary. `NODE_BIN` may also be a full command, e.g. in `sync.env`:

    NODE_BIN=sudo docker run --rm -u 1001:1001 -v /path/to/repo:/w -w /w --env-file sync.env node:22-slim node

(`sync.env` is sourced by the shell, so use the absolute repo path, not `$PWD`, and no quotes in the `KEY=value` lines meant for `--env-file`.)

    node scripts/draft_new.mjs --dry-run            # list batches, no AI calls
    node scripts/draft_new.mjs --limit 200          # draft up to 200 new units
    DRAFT_AUTO_ACCEPT=1 node scripts/draft_new.mjs  # also accept drafts that pass the gate

Takes untranslated rows from `new_import_units` that have no suggestion yet and drafts them with
the same code as the web UI's AI button (`app/src/lib/server/ai-client.js`): same provider
selection (HYPER > OPENAI > GEMINI), model, guidelines, prompt, `AI_RPM` limiter and output
filters. No daily cap applies. Drafts that fail the quality gate, echo the source or drop
placeholders are discarded. The rest are written to `ai_suggestions` (reason `batch draft`) and
show up for review in the UI. Auto-accept is off by default; accepted drafts are credited to
`DRAFT_ACCEPT_AS` (default `ai-draft`). Options: `--batch N` (default 40, max 150), `--refs N`
(translated neighbours per batch, default 20), `--db PATH`. Re-runs skip units that already have
a suggestion.

## 3. Export and publish — `scripts/publish_release.py`

    scripts/publish_release.py            # export into the mirror working tree, nothing committed (~9 min)
    scripts/publish_release.py --push     # bump version.txt, commit "Release <VER>", push

Mirror defaults to `~/ipr-translation-data-en-public` (`PUBLISH_MIRROR`). Only masterTrans,
localization.json and resource/adv are replaced; the mirror's own files are the format reference.
`PUBLISH_REQUIRE_REVIEW=1` refuses to publish while AI suggestions are unaccepted (default off).
Pushing triggers `release.yml` in the data repo, which builds the GitHub release.

## Unattended chain — `scripts/auto_sync.sh`

detect -> `ingest --apply` (stops/starts the container around the swap) -> `draft_new.mjs`
(auto-accept off). Exits quietly when upstream is unchanged; a refused ingest leaves the live DB
untouched and skips drafting. Uses a lock, so overlapping runs are harmless. Publishing stays manual.

    # crontab of the data-owning user (uid 1001); container control goes through uid 1000, see below
    30 4 * * * cd /path/to/hoshimi-station-en && scripts/auto_sync.sh >> backups/sync.log 2>&1

systemd alternative (`~/.config/systemd/user/hoshimi-sync.{service,timer}`):

    [Service]
    Type=oneshot
    WorkingDirectory=/path/to/hoshimi-station-en
    ExecStart=/path/to/hoshimi-station-en/scripts/auto_sync.sh
    [Timer]
    OnCalendar=*-*-* 04:30
    Persistent=true
    [Install]
    WantedBy=timers.target

Docker is only usable by uid 1000, while `data/` belongs to uid 1001, so the job runs as 1001 and
hands container control to 1000 via sudo. In `/etc/sudoers.d/hoshimi` (replace `svc` with the 1001
account, `dockeruser` with the 1000 account and fix the compose path):

    svc ALL=(dockeruser) NOPASSWD: /usr/bin/docker compose -f /path/to/hoshimi-station-en/compose.yml stop, \
                                   /usr/bin/docker compose -f /path/to/hoshimi-station-en/compose.yml start

and export in the job environment:

    STOP_CMD='sudo -n -u dockeruser docker compose -f /path/to/hoshimi-station-en/compose.yml stop'
    START_CMD='sudo -n -u dockeruser docker compose -f /path/to/hoshimi-station-en/compose.yml start'

(Alternative: run the whole job as uid 1000 and set `HOSHIMI_UID/GID=1000` so the container and
`data/` share that owner.) Set `GEMINI_API_KEY`/`OPENAI_API_KEY`/`HYPER_API_KEY` in the job's environment (cron: top of crontab),
otherwise the draft step exits 2. Rotate `backups/sync.log` (logrotate or `tail -n 2000`).
Leave `--push` publishing to a human.

### `sync.env`

`scripts/auto_sync.sh` sources an optional `sync.env` in the repo root (gitignored, chmod 600) before running, so
cron needs no exported variables. Example:

    STOP_CMD='sudo -n -u aspire docker compose -f /path/to/hoshimi-station-en/compose.yml stop'
    START_CMD='sudo -n -u aspire docker compose -f /path/to/hoshimi-station-en/compose.yml start'
    GEMINI_API_KEY=...
    DRAFT_AUTO_ACCEPT=1
    DRAFT_ACCEPT_AS=ai-draft
