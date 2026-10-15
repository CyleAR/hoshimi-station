# Glossary & Style Guide

Authoritative for translating ADV dialogue slots. Character voice profiles are in
`translation-guidelines.md` (read it too).

## Hard format rules (breaking these corrupts the game)

- Output values contain NO Japanese kana/kanji.
- NEVER introduce these sequences into text: `]` `[` ` name=` ` clip=` ` hide=` ` thumbnial=`.
- Literal two-character `\n` (backslash + n) = in-bubble line break. Preserve each `\n`
  in English at a sensible break point (losing one = validation error when `GATE_LINE_BREAKS=1`; the check is off by default).
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

## Speaker names (JP → EN)

Speaker names are applied automatically to `name=` fields. Never write a speaker name into the dialogue yourself, and use these exact forms whenever a character is mentioned.

| JP | EN |
|---|---|
| DJばぁば | DJ Granny |
| fran | fran |
| kana | kana |
| miho | miho |
| {user} | {user} |
| {user}？ | {user}? |
| お客さん | Customer |
| ごま鯖ンナちゃん | Gomasabunna-chan |
| もう一人の僕 | Another Me |
| カップル女性 | Woman in the Couple |
| カップル男性 | Man in the Couple |
| カメラマン | Photographer |
| クロミ | Kuromi |
| シナモロール | Cinnamoroll |
| タンク岡本 | Tank Okamoto |
| ダンスコーチA | Dance Coach A |
| ダンスコーチB | Dance Coach B |
| ナレーション | Narration |
| ハローキティ | Hello Kitty |
| パロちゃん | Paro-chan |
| ヒラメイ子 | Hirameiko |
| ファンA | Fan A |
| ファンB | Fan B |
| ブリ山ブリスケ | Buriyama Buriske |
| プロデューサー | Producer |
| マイメロディ | My Melody |
| マグ田マグロウ | Maguda Maguro |
| モモ | Momo |
| ララ | Lala |
| リングアナウンサー鈴木 | Ring Announcer Suzuki |
| 一ノ瀬怜 | Rei Ichinose |
| 一同 | Everyone |
| 三枝信司 | Shinji Saegusa |
| 三毛猫 | Calico Cat |
| 井川葵 | Aoi Igawa |
| 伊吹渚 | Nagisa Ibuki |
| 佐伯遙子 | Haruko Saeki |
| 兵藤雫 | Shizuku Hyodo |
| 医者 | Doctor |
| 古手川唯 | Kotegawa Yui |
| 叶の父 | Kana's Father |
| 司会者 | Host |
| 大須賀れもん | Lemon Oska |
| 天動瑠依 | Rui Tendo |
| 奥山すみれ | Sumire Okuyama |
| 女子高生A | Schoolgirl A |
| 小南来夢 | Laim Kominami |
| 小泉ひばり | Hibari Koizumi |
| 小美山愛 | Ai Komiyama |
| 川咲さくら | Sakura Kawasaki |
| 平島エリカ | Erika Hiramashima |
| 店内放送 | Store Broadcast |
| 成宮すず | Suzu Narumiya |
| 日辻森明梨 | Akari Hitsujimori |
| 早坂芽衣 | Mei Hayasaka |
| 朝倉恭一 | Kyoichi Asakura |
| 朝日りんご | Ringo Asahi |
| 未来の未来の芽衣 | Future Future Mei |
| 未来の芽衣 | Future Mei |
| 犯人役の男性 | Man as the Culprit |
| 猫 | Cat |
| 男子生徒 | Male Student |
| 白石千紗 | Chisa Shiraishi |
| 白石沙季 | Saki Shiraishi |
| 神崎莉央 | Rio Kanzaki |
| 莉央の母 | Rio's Mother |
| 記者A | Reporter A |
| 赤崎こころ | Kokoro Akazaki |
| 遠い未来の芽衣 | Mei from a Far Future |
| 遥か未来の芽衣 | Mei from the Distant Future |
| 金色の闇 | Golden Darkness |
| 鈴木 | Suzuki |
| 鈴村久美子 | Kumiko Suzumura |
| 鈴村優 | Yu Suzumura |
| 長瀬琴乃 | Kotono Nagase |
| 長瀬麻奈 | Mana Nagase |
| 館内アナウンス | PA Announcement |
| 魚 | Fish |
| 鮫島郁乃 | Ikuno Samejima |
| ？？？ | ??? |

## Groups and agency

| JP | EN |
|---|---|
| 星見プロダクション | Hoshimi Productions |
| 星見プロ | Hoshimi Pro. |
| サニーピース | Sunny Peace |
| サニピー | SunnyP |
| サニピ | SunnyP |
| 月のテンペスト | Tsuki no Tempest |
| 月スト | Tsukisto |
| トリエル | TriAile |
| TRINITYAiLE | TRINITYAiLE |
| リズノワ | LizNoir |
| スリクス | IIIX |
| ⅢX | IIIX |

- Plural short form: `Hoshimi Pros`.
- Never use: `Hoshimi Prod`, `Slix`, `Srikus`, `Sleek`, `Liz Noir`.
- Joke kept as-is: `Hoshimi Productioooon`.
- Pick long vs short by what the JP line actually uses.

## Places and times of day

| JP | EN |
|---|---|
| 星見プロ | Hoshimi Pro. |
| 東京寮 | Tokyo Dorm |
| 東京事務所 | Tokyo Office |
| スタジオ | Studio |
| 屋上 | Rooftop |
| 通学路 | Road to School |
| 海 | Beach |
| 海岸通り | Seaside Promenade |
| 温泉 | Hot Springs |
| ビーチ | Beach |
| オフィス | Office |
| 廊下 | Hallway |
| 夜 | Night |
| 昼 | Day |
| 朝 | Morning |
| 夕方 | Evening |

Place labels join the JP full-width-space segments with ` - `, e.g. `星見プロ　東京事務所スタジオ　昼` → `Hoshimi Pro. Tokyo Office Studio - Day`; `星見プロ　東京寮リビング　夜` → `Hoshimi Pro. Tokyo Dorm Lounge - Night`; `楽屋` → `Dressing Room`; `舞台袖` → `Stage Wings`; `撮影スタジオ　昼` → `Photo Studio - Day`; `東京　都心　昼` → `Downtown Tokyo - Day`; `星見市　高台　公園　夜` → `Hoshimi City - Hilltop Park - Night`; `星見まつり会場　夜` → `Hoshimi Festival Venue - Night`. Narration example: `――翌日` → `――The Next Day`.

## Fixed terms

| JP | EN |
|---|---|
| 三枝 | Saegusa-san |
| プレタポルテ | Preta Porte |
| ぎょぎょっとさん | Gyogyotto-san |
| エルフォルク | ERFOLG |
| イソマン | Isoman |
| サータン | Saatan |

## Banned dialect words

Never use these (Sumire does not speak Scots): `ye`, `ken`, `birl`, `braw`, `chuffed`, `lass`, `wee`, `dinna`, `aint`, `laddie`, `bonnie`.
