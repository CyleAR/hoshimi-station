# Translation Notes

## Top-priority principles

- The authoritative sources are `GLOSSARY.md` (in this folder). Follow existing translations for the same term.
- The official English release is poor quality. Use it only as a hint to disambiguate a term; never copy it verbatim.
- The same sentence, card name, skill name, story title, message, or home line can repeat in several places, so check linked entries together.
- Quality bar: natural, faithful, in-character English. Keep bubbles tight (one UI line where possible).

## Hard format rules (enforced by the quality gate)

Breaking these corrupts the game or fails the save.

- No Japanese kana or kanji may remain in the translation.
- Never introduce these sequences: `[`, `]`, ` name=`, ` clip=`, ` hide=`, ` thumbnial=`.
- `{user}` is kept exactly, with the same count as the source.
- Full-width （ ） are kept only when the source line is entirely wrapped in （…） (gray bubble). Never add them elsewhere.
- Narration lines (`――` at the start) keep the leading `――` (two U+2015 dashes) exactly, followed by English. Mid-sentence `――` becomes `--`.
- No trailing spaces.
- Never translate a speaker name into the dialogue. Speaker names follow the character list in `GLOSSARY.md`.

## Control codes and line breaks

- `\n` is a control code that becomes a real line break in game. Write real line breaks (Enter) instead of the literal `\n`; the app converts them. Keep the same number of line breaks as the source, placed at a sensible point in the English.
- Never delete or translate placeholders such as `{user}` and `{threshold}`.
- Every placeholder in the source must appear in the translation the same number of times.
- English has no particles, so the Korean auto-particle markers do not apply. Leave `{user}` as it stands.

## `{user}` handling

- `{user}くん`, `{user}君`, `{user}さん` -> `{user}`.
- The player is the Manager / Producer. `マネージャーさん` -> `Manager`.

## Punctuation map

| Japanese | English |
| --- | --- |
| 、 | `,` |
| 。 | `.` |
| ！ | `!` |
| ？ | `?` |
| ！？ | `?!` |
| ： | `:` |
| ； | `;` |
| ～ / 〜 | `~` |
| …… / … | `...` |
| 「」 / 『』 | `"` (nested quotes use `'single'`) |
| full-width space | one ASCII space |

- Use ASCII quotes and apostrophes. Convert full-width letters and digits to ASCII.
- Keep `♪` and `♡`.
- Drawled `ー` in dialogue: render naturally (stretched vowel or `~`).
- 26時 style times: `26:00`. 万円 amounts: `¥10,000` style.
- Lyrics: light poetic license is fine, but keep the line-break count.

## Honorifics

- Honorifics are romanized and kept (-san, -chan, -kun, -sama). Do not convert them to Mr./Ms. or older-sister terms.
- First names between close peers; `Lastname-san` where the Japanese uses family name + さん.
- Check linked stories/messages when the form of address is ambiguous.

## Story titles, places and choices

- Card / bond story titles: `<EN name> Episode N <subtitle>`, e.g. `Sumire Okuyama Episode 1 In Front of the Vending Machine`.
- Main story titles: `<Arc> Chapter C Episode E <subtitle>`.
- Group story titles: `<Group> Chapter N Episode M <subtitle>`.
- Titles use sentence case with no trailing period.
- Place lines: join the full-width-space-separated segments with ` - `, e.g. `星見プロ　東京事務所廊下　昼` -> `Hoshimi Pro. Tokyo Office Hallway - Day`.
- Choices: a short imperative with no period, e.g. `Buy it` / `Apologize`.

### Place vocabulary

| JP | EN | JP | EN |
| --- | --- | --- | --- |
| 星見プロ | Hoshimi Pro. | 東京寮 | Tokyo Dorm |
| 東京事務所 | Tokyo Office | スタジオ | Studio |
| 屋上 | Rooftop | 通学路 | Road to School |
| 海 / ビーチ | Beach | 海岸通り | Seaside Promenade |
| 温泉 | Hot Springs | オフィス | Office |
| 廊下 | Hallway | 夜 / 昼 / 朝 / 夕方 | Night / Day / Morning / Evening |

## Character names (JP -> EN, Western order)

| JP | EN | JP | EN |
| --- | --- | --- | --- |
| 奥山すみれ | Sumire Okuyama | 長瀬琴乃 | Kotono Nagase |
| 伊吹渚 | Nagisa Ibuki | 白石沙季 | Saki Shiraishi |
| 成宮すず | Suzu Narumiya | 早坂芽衣 | Mei Hayasaka |
| 川咲さくら | Sakura Kawasaki | 兵藤雫 | Shizuku Hyodo |
| 白石千紗 | Chisa Shiraishi | 一ノ瀬怜 | Rei Ichinose |
| 佐伯遙子 | Haruko Saeki | 天動瑠依 | Rui Tendo |
| 鈴村優 | Yu Suzumura | 神崎莉央 | Rio Kanzaki |
| 井川葵 | Aoi Igawa | 小美山愛 | Ai Komiyama |
| 赤崎こころ | Kokoro Akazaki | 長瀬麻奈 | Mana Nagase |

- kana, miho and fran stay as-is.
- If nothing is established for a name, romanize the Japanese reading.

### Generic speaker labels

- 一同 = Everyone · 司会者 = Host · ナレーション = Narration · ？？？ = ??? · 犯人役の男性 = Man as the Culprit · 医者 = Doctor · 男子生徒 = Male Student · お客さん = Customer.

## Group and company names

- 星見プロダクション = `Hoshimi Productions` (formal); short form `Hoshimi Pro.` (never `Hoshimi Prod`); plural short form `Hoshimi Pros`.
- サニーピース = `Sunny Peace`; short form サニピー / サニピ = `SunnyP`.
- 月のテンペスト = `Tsuki no Tempest`; short form 月スト = `Tsukisto`.
- トリエル = `TriAile` (formal: `TRINITYAiLE`).
- リズノワ = `LizNoir` (one word).
- スリクス / ⅢX = `IIIX` (never Slix, Srikus or Sleek).
- Pick the long or short form according to what the Japanese line uses.

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

Keep each character's voice consistent across lines.

| Character | Voice |
|---|---|
| Kouhei Makino (Manager) | earnest, supportive and grounded; calm, respectful reliability, never imposing decisions or stealing the spotlight. |
| Kotono Nagase | disciplined, proud and emotionally reserved; strict and polite, but easily stammers or gets flustered when praised or teased. |
| Nagisa Ibuki | warm, deeply affectionate and perceptive; gentle, excitable, caring tone, often fixating romantically on friendships and memories. |
| Saki Shiraishi | diligent, polite honor student and caretaker; methodical and practical, earnest and analytical, awkward around spontaneous or casual topics. |
| Suzu Narumiya | haughty, theatrical ojou-sama; flamboyant aristocratic phrasing (desu wa, gokigenyou) rendered as refined noble-lady diction, yet crumbles into childish panic and poutiness when teased or ignored. When she addresses others, follow the source's form of address. |
| Mei Hayasaka | spontaneous, high-energy and affectionately transparent; breezy, playful, run-on style full of informal warmth, cat sounds and immediate honesty. |
| Sakura Kawasaki | cheerful, intuitive and radiant; infectious, sunny excitement, heart worn openly on her sleeve, prioritizes shared joy. |
| Shizuku Hyodo | soft-spoken, hesitant and melancholic at a glance; quiet and reserved, but rapidly becomes passionate, knowledgeable and intense about idols or special interests. |
| Chisa Shiraishi | shy, timid and soft-spoken; stammers and second-guesses herself, yet shows earnest courage, quiet resolve and a surprising love for horror. |
| Rei Ichinose | stoic, formal, strictly composed traditional dancer; sharp technical discipline and dignified restraint, cutely flustered when praised personally. |
| Haruko Saeki | reassuring, gentle, mature big-sister figure; seasoned warmth, self-deprecating humor about her age/veteran status, persistent kindness. |
| Rui Tendo | decisive, aloof and proudly uncompromising; concise, commanding, regal declarations, abruptly flustered and defensive when expressing private affection. |
| Yu Suzumura | shrewd, teasing and effortlessly charming; smooth, playful Kansai/Kyoto-flavored speech with a relaxed, calculating demeanor, rendered as playful English, not a regional dialect. |
| Sumire Okuyama | bright, polite former child actress; cute, bouncy and deferential, balancing seasoned professional manners with earnest youthful innocence. |
| Rio Kanzaki | fierce, uncompromising perfectionist; razor-sharp authority, competitive pride, and aloof tsundere awkwardness when caught caring for others. |
| Aoi Igawa | cool, laconic and deadpan; speaks sparingly with dry, unbothered directness, playfully teasing while keeping an unflappable exterior. |
| Ai Komiyama | earnest, anxious and deeply loyal; self-conscious hesitance and humble politeness, always trying her hardest while fretting over her adequacy. |
| Kokoro Akazaki | mischievous, provocative and media-savvy; bratty, performatively cute, sharp-tongued phrasing, constantly teasing and pushing buttons for a reaction. |
| fran | glamorous, haughty, transaction-minded fashion diva; haughty international confidence, sharp entitlement and dramatic flair, defensive about her mundane background. |
| miho | austere, razor-sharp, uncompromising veteran; clipped, strictly professional, no-nonsense cadence valuing pragmatism over sentimentality. |
| kana | bratty, sharp-tongued and calculating; shifts rapidly between an exaggeratedly sugary public idol persona and cynical, venomous, manipulative private speech (casual register, polite register for sarcasm). |
| Mana Nagase | charismatic, effortless and radiant; breezy, natural confidence and teasing warmth, disarmingly direct, makes anyone smile. |

### Sumire's dialect

Sumire is from Yamagata. Render her rural gentleness as soft, warm, plain English, never Scots or any other region-locked slang.

- Never use: `ye`, `ken`, `birl`, `braw`, `chuffed`, `lass`, `wee` (as dialect), `dinna`, `aint`, `laddie`, `bonnie`.
- Examples: `もう~！びっくりしちゃった~！` -> `Oh! You gave me such a fright!`; the manager's echo `ちゃ？` -> `Hm?` or `A fright?`; `それ、すごく恥ずかしいよ~！` -> `That's so embarrassing!`.

## Before saving

- Check that control codes and placeholders from the source are still present.
- For card stories, also check the card name, skill names, messages, home lines, and Story/MasterDB titles.
- Check that wording matches existing translations.
