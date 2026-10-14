# Codex MCP / token API

A token-authenticated HTTP API plus a local STDIO MCP server (`mcp/server.mjs`) let an AI agent read translation units, submit suggestions, and mark units reviewed. Suggestions appear in the site's "AI suggestions" panel, and a human clicks "Use" to apply them.

## Connecting

1. Set `CODEX_API_TOKEN` in the site's server environment.
2. `npm install --prefix mcp` (Node >= 22.13).
3. Copy `mcp/env.example` to `mcp/.env` and set `HOSHIMI_SITE_URL` and `CODEX_API_TOKEN`.
4. Add the server to your Codex config using `mcp/codex-config.example.toml` (server name `hoshimi_station`, command `node mcp/server.mjs`).

## Tools

| Tool | Purpose |
| --- | --- |
| `translation_guidelines` | Return the translation guidelines |
| `list_translation_units` | List units with filters and cursor paging |
| `search_translations` | Search source/translation text (`match`: contains or exact) |
| `get_translation_unit` | Read one unit with its current revision |
| `get_translation_context` | Read neighboring units (radius 0-20, default 5) |
| `submit_ai_suggestion` | Submit a suggested translation with a reason |
| `mark_translation_reviewed` | Mark a unit reviewed with notes |
| `get_review_progress` | total, reviewed, unchanged, suggested, pending, changed, unreviewed, percent |

Write `reason` and `notes` in English.

## Resuming a review (`review=pending`)

Always re-read the first page of `review=pending`; never reuse an old cursor. Completion is tied to the unit's revision, original text, and translation, so any change makes the unit pending again.

## Example prompts

- "Fetch the guidelines, then review the pending units for this card. Submit suggestions only for clear errors, with an English reason."
- "Check progress, then continue with `review=pending`."

## HTTP API

| Method | Path |
| --- | --- |
| GET | `/api/codex/units` |
| GET | `/api/codex/unit` |
| GET | `/api/codex/context` (radius 0-20, default 5) |
| GET | `/api/codex/guidelines` |
| GET | `/api/codex/progress` |
| POST | `/api/ai-suggestions` (see `docs/ai-suggestions.md`) |
| POST | `/api/codex/review` — `{unit_id, base_revision, base_original_text, base_translation_text, notes}` |

Filters: `status` (all|translated|untranslated), `review` (all|pending|reviewed|changed|unreviewed), `suggestion` (all|missing|fresh|stale), `q` with `match` (contains|exact), `source_type`, `category`, `speaker`, `scope_type`, `scope_id`, `source_file`, `limit` 1-200 (default 50), `cursor`.

A `409` means the unit changed since you read it: re-read it and retry. Review records are stored in the `ai_reviews` table.

## Verification

```bash
node --test app/tests/codex-api.test.js app/tests/codex-review-persistence.test.js app/tests/ai-suggestions.test.js app/tests/recent-translations.test.js
npm --prefix mcp test
npm run build
```
