# Glossary & Style Guide

Authoritative for translating ADV dialogue slots. Character voice profiles are in
`translation-guidelines.md` (read it too).

## Hard format rules (breaking these corrupts the game)

- Output values contain NO Japanese kana/kanji.
- NEVER introduce these sequences into text: `]` `[` ` name=` ` clip=` ` hide=` ` thumbnial=`.
- Literal two-character `\n` (backslash + n) = in-bubble line break. Preserve each `\n`
  in English at a sensible break point (losing one = validation error).
- `{user}` is the player's name placeholder — keep exactly `{user}`, same count as JP.
- Full-width parens （ ） are wrappers ONLY when the JP line is entirely wrapped in （…）
  (internal thoughts/asides). Keep them around the English. Never add elsewhere.
- `narr` (k=narr) lines keep the leading `――` (two U+2015 dashes) exactly, then English.
  Mid-sentence JP `――` break → `--`.
- No trailing spaces. No raw newlines inside values.
- Punctuation map: 、→ `,`  。→ `.`  ！→ `!`  ？→ `?`  ：→ `:`  ；→ `;`  ～/〜 → `~`
  ……/… → `...`  「」→ `"`  『』→ `"` (nested `'single'`). 　(full-width space) → single
  ASCII space. Use ASCII quotes/apostrophes. Full-width alnum → ASCII.
- NEVER translate a speaker into the dialogue text yourself — `name=` fields are handled
  automatically by the installer.

## Title / place / choice formats

- `title` (episode bar): `<EN name> Episode N <subtitle>` for card/bond stories
  (e.g. `奥山すみれ 1話 自販機の前で` → `Sumire Okuyama Episode 1 In Front of the Vending
  Machine`). Main stories `<Arc> Chapter C Episode E <subtitle>`; group stories
  `<Group> Chapter N Episode M <subtitle>`. Sentence case, no trailing period.
- `place` (location label): JP full-width-space segments joined with ` - `:
  `星見プロ　東京事務所廊下　昼` → `Hoshimi Pro. Tokyo Office Hallway - Day`.
  Vocabulary: 星見プロ = `Hoshimi Pro.`, 東京寮 = `Tokyo Dorm`, 東京事務所 = `Tokyo Office`,
  スタジオ = `Studio`, 屋上 = `Rooftop`, 通学路 = `Road to School`, 海 = `Beach`,
  海岸通り = `Seaside Promenade`, 温泉 = `Hot Springs`, ビーチ = `Beach`,
  夜/昼/朝/夕方 = `Night/Day/Morning/Evening`, オフィス = `Office`, 廊下 = `Hallway`.
- `choice` (player button): short imperative, no period: `Buy it` / `Apologize`.

## Official group names (authoritative)

- 星見プロダクション = `Hoshimi Productions` (formal). Short form: `Hoshimi Pro.`
  (never `Hoshimi Prod`); plural of the short form: `Hoshimi Pros`.

- サニーピース = `Sunny Peace` / サニピー・サニピ = `SunnyP`
- 月のテンペスト = `Tsuki no Tempest` / 月スト = `Tsukisto`
- トリエル = `TriAile` (TRINITYAiLE in formal contexts)
- リズノワ = `LizNoir` (one word, always)
- スリクス / ⅢX = `IIIX` (never Slix/Srikus/Sleek)
- Pick long vs short form by what the JP line actually uses.

## Character names (JP speaker → EN, applied automatically to name= fields)

奥山すみれ=Sumire Okuyama · 長瀬琴乃=Kotono Nagase · 伊吹渚=Nagisa Ibuki ·
白石沙季=Saki Shiraishi · 成宮すず=Suzu Narumiya · 早坂芽衣=Mei Hayasaka ·
川咲さくら=Sakura Kawasaki · 兵藤雫=Shizuku Hyodo · 白石千紗=Chisa Shiraishi ·
一ノ瀬怜=Rei Ichinose · 佐伯遙子=Haruko Saeki · 天動瑠依=Rui Tendo ·
鈴村優=Yu Suzumura · 神崎莉央=Rio Kanzaki · 井川葵=Aoi Igawa · 小美山愛=Ai Komiyama ·
赤崎こころ=Kokoro Akazaki · 長瀬麻奈=Mana Nagase · kana/miho/fran as-is ·
{user} = the Manager/Producer (player). 一同=Everyone · 司会者=Host ·
ナレーション=Narration · ？？？=??? · 犯人役の男性=Man as the Culprit ·
医者=Doctor · 男子生徒=Male Student · お客さん=Customer.

## Voice

Follow the per-character profiles in `translation-guidelines.md` exactly. In short:
Sumire = bright polite former child actress, cute bouncy deferential; {user} (Makino) =
earnest grounded supportive; Kokoro = bratty performatively cute teaser; Yu = smooth
Kansai teasing; Suzu = theatrical ojou-sama `desu wa`; Mei = breezy run-on cat-lady;
Kotono = disciplined polite, stammers when praised; Chisa = shy timid with quiet courage.
Address style: first names between close peers; `Lastname-san` where JP uses family name
+ さん; honorifics stay romanized (-san, -chan, -senpai, -sensei).

## SUMIRE RULE 

Sumire is from Yamagata. Her gentle rural flavor is rendered as **soft, warm plain
English — NEVER Scots**. Banned anywhere in the output: `ye`, `ken`, `birl`,
`braw`, `chuffed`, `lass`, `wee` (as dialect), `dinna`, `aint`, `laddie`, `bonnie`, or
any other region-locked slang. Warmth comes from word choice and rhythm, not accent
spelling. Reference fixes:
- `もう~！びっくりしちゃった~！` → `Oh! You gave me such a fright!` (not `Ye fair gied me a birl there!`)
- manager echoing `ちゃ？` → `Hm?` / `A fright?` (plain, gentle curiosity)
- `それ、すごく恥ずかしいよ~！` → `That's so embarrassing!` (not `pure brawling embarrassing, ye ken!`)

## Misc

- 26時 joke: keep as `26:00`-style. 万円 → `¥10,000`-style numbers.
- Lyrics/rhyme: light poetic license, keep `\n` counts.
- Quality bar: natural faithful in-character English for a native player, not
  word-for-word. Keep bubbles tight — readable in one UI line where possible.
