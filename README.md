# HoshimiStation Translator

`res/masterdb`와 `res/adv/resource`에서 일본어 원문을 추출해 SQLite DB에 넣고, SvelteKit 웹 UI에서 번역한 뒤 `output` 폴더로 다시 내보내는 번역 관리 도구입니다.

## 폴더 구조

- `app/`: SvelteKit 번역 UI
- `scripts/`: DB import, 한섭 데이터 prefill, export, 일괄 치환 스크립트
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
