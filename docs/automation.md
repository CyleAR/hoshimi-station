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

## 2. Export and publish — `scripts/publish_release.py`

    scripts/publish_release.py            # export into the mirror working tree, nothing committed (~9 min)
    scripts/publish_release.py --push     # bump version.txt, commit "Release <VER>", push

Mirror defaults to `~/ipr-translation-data-en-public` (`PUBLISH_MIRROR`). Only masterTrans,
localization.json and resource/adv are replaced; the mirror's own files are the format reference.
`PUBLISH_REQUIRE_REVIEW=1` refuses to publish while AI suggestions are unaccepted (default off).
Pushing triggers `release.yml` in the data repo, which builds the GitHub release.

## Cron example

    30 4 * * * cd ~/hoshimi-station-en && scripts/upstream_sync.py detect >/dev/null; [ $? -eq 10 ] && scripts/upstream_sync.py ingest >> backups/sync.log 2>&1

Leave `--apply` and `--push` to a human until the dry runs look right.
