# HoshimiStation Translator

Extracts Japanese source text from `res/masterdb` and `res/adv/resource` into SQLite, lets you translate it in a SvelteKit UI, and exports the result to the `output` folder.

## Folder structure

- `app/` — SvelteKit web app (translation UI and API)
- `scripts/` — Python tools (import, prefill, export, bulk replace)
- `data/hoshimi.sqlite3` — working database
- `res/` — source resources (git submodule)
- `output/` — exported translations (git submodule)

## Install

```bash
npm --prefix app install
```

## Web UI

```bash
npm run dev     # http://127.0.0.1:5174
npm run serve   # build + preview, use this if the Vite dev server hits a module issue
```

## Server deployment

The app uses the Node adapter and listens on port 3042 (bound to 127.0.0.1 by default).

```bash
npm --prefix app install
npm run build
npm run start
HOST=0.0.0.0 PORT=3042 npm run start   # expose on all interfaces
```

- Put nginx or Caddy in front and proxy to `127.0.0.1:3042`.
- The process needs write permission on the database. Override its location with `DB_PATH=/path/to/hoshimi.sqlite3`.
- PM2:

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

This binds `0.0.0.0:3042`.

## Database import

```bash
npm run import-db
python scripts/import_db.py --db data/hoshimi.sqlite3
```

The database is rebuilt on each import. Existing translations are kept when the `unit_id` and the source text are unchanged.

## Recent-work API

Set `RECENT_WORK_API_TOKEN` in the server environment (keep it server-side only).

- `GET /api/recent-work` — translated units, newest first.
- `GET /api/recent-work?view=changes` — recorded edit history.
- Auth header: `Authorization: Bearer <token>`.
- `limit` 1–200 (default 100); `translator` filters by translator.
- Paging: pass `next_cursor` back as `cursor`; `null` means last page.
- Each row has the source, translation, previous translation, previous/current translator, and unit origin.

The previous translator is only reliable for edits made after this version shipped. First translations and edits from before history tracking do not appear in `view=changes`. No re-import is needed.

## Prefill from official English (hint only)

```bash
npm run prefill-en
python scripts/prefill_en.py [--overwrite|--dry-run]
```

Official English is low quality and is never treated as a source of truth (see the translation policy). It is used only as a disambiguation hint and for name canonicalization. By default only empty units are filled.

`scripts/prefill_translations.json` holds pattern templates:

- `{0}`, `{1}` capture digits (half- or full-width).
- `{chr}` is the character's first name and `{chr_full}` the full name, both resolved from the `PREFILL_CHARACTER_NAMES` table in `scripts/import_db.py` and expanded per character ID. This prevents one-character false matches and keeps both placeholders on the same character.
- `{threshold}` and `{user}` are kept literally.
- Group names (サニーピース, 月のテンペスト, TRINITYAiLE, LizNoir, ⅢX) are registered in the same table.

## Output export

```bash
npm run export-output   # includes --overwrite; regenerates version.txt with a timestamp
python scripts/export_output.py --out tmp/export-test [--overwrite]
```

## Bulk replace

```bash
python scripts/replace_translation.py "old" "new" [--apply] [--limit N]
```

Dry run by default. Example: `python scripts/replace_translation.py "Yuu-chan" "Yu-chan" --apply`.

## Typical workflow

1. `npm run import-db`
2. `npm run prefill-en` (if needed)
3. `npm run dev` or `npm run serve`
4. Translate and save in the UI
5. `replace_translation.py` for bulk fixes
6. `npm run export-output`

## Cautions

- `res/` and `output/` are submodules; do not delete or ignore them.
- `data/hoshimi.sqlite3` can get large.
- Prefill source directories are temporary data.
