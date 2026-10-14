# Card translation review guide (Codex / MCP)

Workflow for reviewing one card's English text through the MCP tools.

## 1. Collect the card material

- Call `translation_guidelines` first.
- Gather: card id/name/character, skill names, episodes (order, title, scenario), story lines with speakers and choices, messages, home talk, call lines, home actions.
- Use `list_translation_units` with `status=all`, `review=all`, and cursor paging; read by episode and `line_no`.
- Use `get_translation_context` only for neighboring lines.

## 2. Processing order

1. Card name
2. Story body
3. Episode titles
4. Descriptions and acquire messages
5. Messages, home talk, actions

Suggest only for untranslated units or clear errors, not taste.

Title length: there is no per-line character limit for English titles. Follow the title formats in the guidelines (`<Name> Episode N <subtitle>`, sentence case, no trailing period).

## 3. Recall / quote check

Use `search_translations` with `match=exact`, then `contains`, to find repeated phrases and keep them consistent. Compare context, cite related units in `reference_unit_ids`, and do not widen the scope of the review.

## 4. Submitting

| Situation | Action |
| --- | --- |
| Clear error or untranslated | `submit_ai_suggestion` |
| Fine as is | `mark_translation_reviewed` |
| Fresh pending suggestion exists | Leave it alone |
| Cannot finish | Leave the unit incomplete |

Re-read the unit with `get_translation_unit` before submitting and pass `base_revision`, `base_original_text`, and `base_translation_text`. Write `reason` / `notes` in English. Keep sentence units, placeholders, control codes, and real line breaks intact.

## 5. Conflicts and resuming

On `409`, re-read the unit and retry. To resume, re-read page one of `review=pending`; never reuse an old cursor.

## 6. Guidelines reminder

See `translation-guidelines.md`. Quick reminders: `。` becomes `.`, `！？` become `!?`, `「」『』` become straight double quotes, `……` becomes `...`.

## 7. Work log and report

Keep a per-card HTML work log. Report counts of new, modified, no-change, and held units, and how many are AI-reviewed versus awaiting a human.
