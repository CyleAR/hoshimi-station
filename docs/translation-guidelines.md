# Translation Notes

## Top-priority principles

- The authoritative sources are `agency-adv/GLOSSARY.md`, `glossary/names.json` and `glossary/terms.json`. Follow existing translations for the same term.
- The official English release is poor quality. Use it only as a hint to disambiguate a term; never copy it verbatim.
- The same sentence, card name, skill name, story title, message, or home line can repeat in several places, so check linked entries together.

## Control codes and line breaks

- `\n` is a control code that becomes a real line break in game. Write real line breaks (Enter) instead of the literal `\n`; the app converts them.
- Never delete or translate placeholders such as `{user}` and `{threshold}`.
- Every placeholder in the source must appear in the translation the same number of times.
- English has no particles, so the Korean auto-particle markers do not apply. Leave `{user}` as it stands.

## `{user}` handling

- `{user}くん`, `{user}君`, `{user}さん` -> `{user}`.
- The player is the Manager / Producer.

## Ellipses and symbols

- `……` -> `...`
- Mid-sentence `――` -> `--`. Narration lines that start with `――` keep the leading `――`.
- Drawled `ー` in dialogue: render naturally (stretched vowel or `~`).
- `♪`, `♡`, `!`, `?` are kept as appropriate; re-enter full-width forms as ASCII `!` and `?`. `！？` -> `?!`.
- Lines wrapped in （…） show as gray bubbles; keep the full-width parentheses.
- 「」 and 『』 -> double quotes `"`; nested quotes use single quotes `'`.

## Honorifics

- Honorifics are romanized and kept (-san, -chan, -kun, -sama). Do not convert them to Mr./Ms. or older-sister terms.
- `マネージャーさん` -> `Manager`.
- Check linked stories/messages when the form of address is ambiguous.

## Character ages

Use this table when judging register and address.

- 24: miho
- 22: Rio Kanzaki, fran, Manager (Makino Kohei, user), Mana Nagase (19 at time of death)
- 20: Haruko Saeki, kana
- 18: Saki Shiraishi, Rei Ichinose
- 17: Kotono Nagase, Nagisa Ibuki, Rui Tendo, Chisa Shiraishi, Sakura Kawasaki, Aoi Igawa
- 16: Ai Komiyama, Yu Suzumura, Shizuku Hyodo, Mei Hayasaka
- 15: Sumire Okuyama, Suzu Narumiya
- 14: Kokoro Akazaki

## Character voices

- Sumire: bright, polite, ex-child-actress. Her dialect is gentle rural plain English. Never use Scots or Scots-like words.
- Suzu: ojou-sama; refined, noble-lady diction. When she addresses others, follow the source's form of address.
- kana: sarcastic and sharp; casual, with polite register for sarcasm.
- Yu: Kansai-flavored teasing, rendered as playful English, not a regional dialect.

## Proper nouns

- Use the glossary spelling. Names are in Western order (given name first).
- If nothing is established, romanize the Japanese reading.

## Group and company names

- Hoshimi Pro. / Hoshimi Pros / Hoshimi Productions; Sunny Peace (SunnyP); Tsuki no Tempest (Tsukisto); TriAile (formal: TRINITYAiLE); LizNoir; IIIX.

## Before saving

- Check that control codes and placeholders from the source are still present.
- For card stories, also check the card name, skill names, messages, home lines, and Story/MasterDB titles.
- Check that wording matches existing translations.
