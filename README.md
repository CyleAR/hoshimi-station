# HoshimiStation Translator

`res/masterdb`와 `res/adv/resource`에서 일본어 원문을 추출해 SQLite DB에 넣고, SvelteKit 웹 UI에서 번역한 뒤 `output` 폴더로 다시 내보내는 번역 관리 도구입니다.

## 폴더 구조

- `app/`: SvelteKit 번역 UI
- `scripts/`: DB import, 한섭 데이터 prefill, export, 일괄 치환 스크립트
- `docs/`: 번역 지침, prefill 문장 템플릿과 명칭 사전
- `data/hoshimi.sqlite3`: 번역 작업용 SQLite DB
- `res/`: 원본 MasterDB/ADV 리소스 서브모듈
- `output/`: export 결과 서브모듈

## 설치

처음 한 번만 루트에서 의존성을 설치합니다.

```powershell
npm --prefix app install
```

## 웹 UI 실행

개발 서버:

```powershell
npm run dev
```

기본 주소는 `http://127.0.0.1:5174`입니다.

Vite dev 서버에서 모듈 로딩 문제가 나면 빌드 후 preview 모드로 실행합니다.

```powershell
npm run serve
```

## 서버 배포

SvelteKit은 Node adapter로 빌드됩니다. 기본 운영 포트는 `3042`이고, 기본 바인딩은 로컬 프록시용 `127.0.0.1`입니다.

```bash
npm --prefix app install
npm run build
npm run start
```

외부에서 직접 열어야 하면 실행 전에 `HOST=0.0.0.0`을 지정합니다.

```bash
HOST=0.0.0.0 PORT=3042 npm run start
```

Nginx/Caddy 같은 리버스 프록시를 쓴다면 앱은 `127.0.0.1:3042`에 두고, 도메인과 HTTPS는 프록시에서 처리하면 됩니다. SQLite DB를 저장하는 `data/hoshimi.sqlite3`에는 Node 프로세스의 쓰기 권한이 필요합니다. DB 경로를 직접 지정해야 하면 `DB_PATH=/path/to/hoshimi.sqlite3` 환경 변수를 사용할 수 있습니다.

PM2로 관리하면 `ecosystem.config.cjs` 기준으로 `0.0.0.0:3042`에 바인딩됩니다. LAN IP로 직접 접속하거나, Nginx/Caddy에서 `127.0.0.1:3042` 또는 `localhost:3042`로 프록시할 수 있습니다.

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

## DB import

원본 `res/masterdb`와 `res/adv/resource`를 읽어서 `data/hoshimi.sqlite3`를 재구축합니다.

```powershell
npm run import-db
```

기존 번역은 `unit_id`와 원문이 같은 경우 유지됩니다. 새 원문 파일이 추가되어도 기존 번역을 날리는 용도가 아닙니다.

직접 DB 경로를 지정하려면:

```powershell
python scripts/import_db.py --db data/hoshimi.sqlite3
```

## 최근 작업 API

외부 서비스에서 최근 작업을 조회하려면 서버 환경변수 `RECENT_WORK_API_TOKEN`에 긴 임의 문자열을 설정하고 사이트 프로세스를 재시작합니다. 토큰은 브라우저 코드에 넣지 말고 외부 서비스의 서버에서만 보관하세요.

`GET /api/recent-work`는 번역된 현재 항목을 최신순으로, `GET /api/recent-work?view=changes`는 기록된 번역 수정 내역을 최신순으로 돌려줍니다. `Authorization: Bearer <토큰>` 헤더가 필요합니다. `limit`은 1~200(기본 100), `translator`로 번역자 필터가 가능하며, 응답의 `next_cursor`를 다음 요청의 `cursor`에 전달하면 전체를 순회할 수 있습니다. `next_cursor`가 `null`이면 마지막 페이지입니다.

응답에는 원문, 번역문, 수정 전 번역문, 이전·현재 번역자와 항목 출처 정보가 포함됩니다. 이전 번역자 기록은 이 버전 적용 후의 수정부터 확실히 남습니다. 기존 수정 이력은 기록만으로 복원할 수 있는 경우에만 이전 번역자명이 표시되며, 최초 번역과 이력 기록 이전의 작업은 `view=changes`에 없습니다. 이 기능 때문에 DB를 다시 임포트할 필요는 없습니다.

## 한섭 데이터 prefill

`json-kor`와 `adv-kor`에 있는 번역 데이터를 1차 번역으로 DB에 채웁니다.

```powershell
npm run prefill-kor
```

기본 동작은 비어 있는 번역만 채웁니다. 이미 들어간 번역까지 덮어쓰려면:

```powershell
python scripts/prefill_kor.py --overwrite
```

실제로 쓰지 않고 몇 개가 들어갈지만 확인하려면:

```powershell
python scripts/prefill_kor.py --dry-run
```

## `prefill_translations.json` 템플릿

`docs/prefill_translations.json`은 문장 템플릿을, `docs/prefill_dictionary.json`은
그 안에 넣을 단어의 원문과 번역을 관리합니다. 사전과 템플릿 수정은 다음 DB 임포트부터 반영됩니다.
기본 임포트는 빈 번역만 채우며, 기존 번역 덮어쓰기는 기존처럼 `manage.py`의 6번에서 실행합니다.

현재 사전 분류는 `chr`(이름), `chr_full`(성명), `group`(그룹 정식명·약칭),
`costume`(의상명), `hair`(헤어명), `music`(곡명)입니다. 사전의 최상위 분류명을 추가하면 Python 코드를 수정하지 않고
같은 이름의 placeholder를 사용할 수 있습니다. 예를 들어 사전에 다음 분류를 추가하면:

```json
"weather": {
    "晴れ": "맑음",
    "雨": "비"
}
```

prefill 템플릿에서 `"天気：{weather}": "날씨: {weather}"`처럼 참조할 수 있습니다.
사전 단어가 문장 어디에나 치환되는 것은 아니며, 원문 전체가 템플릿과 일치해야 합니다.
단독 명칭도 정확 일치로 선입력됩니다. 분류명은 영문자로 시작하고 영문·숫자·밑줄만 사용합니다.

- `{chr}`와 `{chr_full}`은 각각 이름과 성명 사전에서 찾습니다. `ココア`는 이름으로는 `코코아`, 성명으로는 `호토 코코아`처럼 결과를 구분할 수 있습니다.
- `{group}`은 `月のテンペスト`를 `달의 템페스트`, `月スト`를 `달템`으로 옮깁니다. 기존에 문장별로 다른 번역을 지정한 항목은 그 번역을 우선합니다.
- `{music}`은 곡명 사전에서 찾습니다. 영문처럼 번역이 원문과 같은 곡명도 그대로 유지하며, 사전에 없는 신곡은 자동으로 번역하지 않습니다.
- `{costume}`, `{hair}`, `{music}`은 각각 DB의 `Costume.name`, `Hair.name`, `Music.name`에 쓰인 명칭을 등록합니다. 같은 이름이 여러 분류에 실제로 쓰이면 각 사전에 등록하며, 한 분류에만 임의로 배정하지 않습니다. DB에서 번역을 가져와 사전을 채운 뒤에도 신규 명칭은 별도로 추가해야 합니다.
- `{0}`, `{1}` 등은 반각·전각 숫자를 그대로 캡처하며 앞자리 0도 보존합니다. 같은 placeholder가 반복되면 같은 원문 값이어야 합니다.
- `{threshold}`, `{user}`처럼 등록되지 않은 이름은 리터럴로 유지합니다. `threshold`와 `user`는 사전 분류명으로 사용할 수 없습니다.
- 서로 다른 분류의 placeholder는 독립적으로 매칭합니다. 이름과 성명을 같은 캐릭터 ID로 묶어서 확장하는 이전 하드코딩 방식은 사용하지 않습니다.

`{chr}[와/과]`, `{group}[은/는]`, `{costume}[을/를]`, `{chr_full}[이/가]`처럼
사전 placeholder 바로 뒤에 붙인 네 조사 태그를 처리합니다. 한글 말미는 받침을 계산하고,
사전의 `_batchim`에 같은 번역 문자열이 있으면 해당 값을 우선합니다. 영문 등의 예외는 다음처럼
`true`(받침 있음), `false`(받침 없음)로 지정합니다. `fran`·`TRINITYAiLE` 등의 기존 판정도 이곳으로 옮겼습니다.

```json
"_batchim": {
    "fran": true,
    "miho": false,
    "kana": false,
    "TRINITYAiLE": true
}
```

명시적인 prefill 번역은 사전과 일반 템플릿보다 우선합니다. 같은 원문이 여러 사전에서 다른 뜻이면
단독 선입력만 건너뛰고 `prefill_warning`을 출력하며, 각 placeholder 안에서는 해당 분류의 번역을 사용합니다.
JSON 형식·중복 키·번역문 placeholder 오류는 DB 재구축 전에 검사합니다.

## output export

DB에 저장된 번역을 `output` 폴더 구조로 내보냅니다.

```powershell
npm run export-output
```

현재 npm 스크립트는 `--overwrite`가 포함되어 있어 기존 `output` 내용을 덮어씁니다. `version.txt`도 export 시점의 timestamp로 새로 생성됩니다.

다른 폴더로 테스트 export 하려면:

```powershell
python scripts/export_output.py --out tmp/export-test
```

기존 폴더를 덮어쓰려면:

```powershell
python scripts/export_output.py --out tmp/export-test --overwrite
```

## 번역문 일괄 치환

DB 안의 `translation_text`에서 특정 한국어 문구를 찾아 한 번에 바꿉니다.

먼저 dry-run으로 대상 확인:

```powershell
python scripts/replace_translation.py "도리큔" "도리큥"
```

실제로 적용:

```powershell
python scripts/replace_translation.py "도리큔" "도리큥" --apply
```

샘플 출력 개수를 늘리려면:

```powershell
python scripts/replace_translation.py "도리큔" "도리큥" --limit 30
```

## 일반 작업 순서

1. `npm run import-db`
2. 필요하면 `npm run prefill-kor`
3. `npm run dev` 또는 `npm run serve`
4. 웹 UI에서 번역/저장
5. 문구 일괄 수정이 필요하면 `replace_translation.py`
6. `npm run export-output`

## 주의

- `res`와 `output`은 서브모듈이므로 일반 생성물처럼 삭제하거나 ignore하지 않습니다.
- `data/hoshimi.sqlite3`는 작업 DB라 용량이 클 수 있습니다.
- `adv-kor`와 `json-kor`는 prefill용 임시 데이터입니다. prefill이 끝난 뒤에는 없어도 됩니다.
