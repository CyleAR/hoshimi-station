# Codex 번역 API와 MCP

사이트 서버에 토큰 인증 API가 있고, PC에서 실행하는 로컬 STDIO MCP 서버가 그 API를 호출합니다. MCP가 DB 파일에 직접 접근하지 않으므로 NAS에서 서비스가 돌아가는 동안 인간 번역자와 함께 사용할 수 있습니다. 기존 사이트의 AI 번역 기능은 그대로 유지됩니다.

## 연결 순서

1. NAS의 사이트에 수정한 코드를 반영하고 빌드 후 재시작합니다. 사이트 프로세스에 `CODEX_API_TOKEN` 환경변수를 설정합니다. DB 재임포트는 필요 없습니다.
2. Codex를 실행하는 PC에서 `npm install --prefix mcp`를 실행합니다. Node.js 22.13 이상이 필요합니다.
3. `mcp/env.example`을 `mcp/.env`로 복사하고 `HOSHIMI_SITE_URL`에 실제 사이트 주소, `CODEX_API_TOKEN`에 NAS 서버와 동일한 토큰을 입력합니다. `.env`는 Git에서 제외됩니다. NAS 주소를 사용하면 MCP는 PC에서 실행되어도 NAS 사이트를 이용합니다. 외부 연결에는 HTTPS 사이트 주소를 사용합니다.
4. [설정 예시](../mcp/codex-config.example.toml)의 블록을 Codex 설정에 추가하거나, MCP 설정 화면에서 STDIO 서버를 추가합니다. 명령은 `node`, 인자는 이 저장소의 `mcp/server.mjs` 절대 경로입니다. 저장소 위치가 다르면 경로를 수정합니다.
5. Codex의 MCP 연결을 다시 시작하고 `hoshimi_station` 도구가 나타나는지 확인합니다.

PowerShell에서 의존성 설치와 환경파일 복사:

```powershell
chcp 65001 > $null
npm install --prefix mcp
# 기존 .env를 덮어쓰지 않습니다.
if (!(Test-Path -LiteralPath 'mcp/.env')) {
    Copy-Item -LiteralPath 'mcp/env.example' -Destination 'mcp/.env'
}
```

토큰은 길고 무작위인 값을 사용하고 저장소·채팅·로그에 넣지 않습니다. MCP는 모델 API를 자체 호출하지 않으며 OpenAI API 키도 필요하지 않습니다. 번역과 검토는 연결한 Codex가 수행합니다.

Codex 설정은 공식 문서의 STDIO 설정 형식을 따릅니다: [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp).

## 도구

| MCP 도구 | 동작 |
|---|---|
| `translation_guidelines` | 현재 번역 지침 읽기 |
| `list_translation_units` | 전체·미번역·번역된 항목을 필터링하고 페이지 단위로 탐색 |
| `search_translations` | DB 전역의 일본어 원문·한국어 번역 검색, 동일 대사 검색 |
| `get_translation_unit` | 개별 항목의 현재 번역·작성자·버전·AI 제안 읽기 |
| `get_translation_context` | ADV 파일의 앞뒤 대사 또는 같은 MasterDB 엔티티의 주변 필드 읽기 |
| `submit_ai_suggestion` | 제안문·이유·참고 항목 ID 제출 |
| `mark_translation_reviewed` | 수정이 필요 없는 번역의 검토 완료와 이유 기록 |
| `get_review_progress` | 전체 또는 지정 범위의 완료·미완료·변경·제안 건수와 완료율 조회 |
| `list_phone_subtitles` | 현재 전화 목록, 음성 클립 이름, 자막 수와 초안 상태 조회 |
| `get_phone_subtitle` | 전화별 현재 자막 스냅샷, 캐릭터 정보와 일본어 인식 결과·한국어 초안 조회 |
| `submit_phone_subtitle_draft` | 실제 자막을 변경하지 않고 전화별 초안 저장 |

제안은 사이트의 ‘AI의 제안’에 표시됩니다. 사람이 ‘사용’을 눌러 현재 번역에 반영합니다. 제출은 해당 항목의 이전 제안을 교체합니다. 최신 제안이 있는 항목은 특별한 이유가 없으면 다시 제출하지 않습니다. MCP에는 현재 번역을 직접 저장하거나 제안을 자동 채택하는 도구가 없습니다.

## 전화 자막 초안

기존 `CODEX_API_TOKEN`과 MCP 연결을 그대로 사용합니다. 서버에 최신 코드를 반영해
`npm run build` 후 PM2를 재시작하고, PC에서도 최신 `mcp/tools.mjs`를 받은 뒤 MCP 연결을
재시작하세요. 새 환경변수나 DB 재임포트는 필요 없고 초안 테이블은 자동 생성됩니다.

1. `translation_guidelines`를 읽고 `list_phone_subtitles`로 전화 목록을 조회합니다.
   WAV 파일명은 `audio_clip_name + '.wav'`와 대조합니다. 제목만으로 연결하지 않습니다.
2. `get_phone_subtitle`의 `snapshot` 전체를 제출의 `base`로 전달합니다.
   `expected_draft_id`는 첫 제출 시 `null`, 교체 시 읽은 초안의 `draft_id`입니다.
3. `audio_clip_name`, WAV의 `audio_sha256`, `transcript`, 한국어 `lines`를 제출합니다.
   `transcript`는 `{model, segments: [{start, end, text}]}`이며 시각은 초 단위입니다.
   일본어 인식 결과는 한국어 자막과 별도 보관하고 export하지 않습니다.
4. 사이트의 전화 자막 창에 입력된 초안을 검토·수정하고 **일괄 저장**을 누릅니다.
   저장은 로그인한 작업자만 가능하며 MCP에는 적용 도구가 없습니다.
   적용된 자막만 기존 `phoneSubtitles.json`으로 출력합니다.

`lines`는 `{line, time, text, source_segments, needs_review, note?}` 배열입니다.
`line`과 `source_segments`는 **1부터 시작하는 번호**이며, 후자는 일본어 인식 구간 번호입니다.
한국어가 한 줄이라도 있으면 **기존 빈 줄 번호와 기존 시각만** 제안할 수 있습니다.
한국어가 전혀 없으면 새 시각으로 1번부터 연속된 줄을 만듭니다.
연결이 불확실한 줄은 `needs_review: true`, `text: ''`, `note: '검토 사유'`로 남깁니다.
적용 시에도 검토 대상 줄은 비워 두며, 모든 줄이 검토 대상이면 적용하지 못합니다.

목록 필터: `character_id`, `translation_status=all|empty|partial|complete`,
`draft_status=all|missing|pending|stale|applied`, `limit`(1~200, 기본 50), `cursor`.
`empty`에는 자막이 없거나 전부 빈 전화도 포함됩니다. 목록은 전화 ID순이며 `next_cursor`를 그대로 넘깁니다.
`counts`는 캐릭터·번역 상태 필터 범위에서 초안 상태 필터와 커서 적용 전 집계입니다.
새 초안 제작을 재개할 때는 `draft_status=missing`의 첫 페이지를 반복해 이미 저장한 전화를 건너뜁니다.
`stale`은 자막·시각·버전·연결 또는 음성 assetId가 달라진 미적용 초안으로 다시 검토해야 합니다.

동일 내용의 재전송은 같은 초안 ID를 반환합니다. 다른 초안으로 교체하려면 정확한
`expected_draft_id`가 필요합니다. 중간에 자막이나 연결이 바뀌면 제출·적용 모두 409로 거부합니다.
네트워크 실패 후에는 재전송 전에 개별 조회로 저장 여부를 확인합니다.
초안과 적용 기록은 DB 재시작 및 기존 DB 재임포트 후에도 유지됩니다.

## 전체 검토와 중단 후 재개

`list_translation_units`에 `review=pending`을 지정해 첫 페이지부터 가져옵니다. 수정이 필요 없으면 `mark_translation_reviewed`로 이유와 검토한 스냅샷을 저장하고, 수정이 필요하면 `submit_ai_suggestion`으로 제출합니다. 제안 제출은 같은 트랜잭션에서 해당 버전의 검토 완료도 기록합니다. 미번역 항목은 ‘수정 불필요’로 완료할 수 없습니다.

처리 후에는 **이전 커서를 사용하지 않고 `review=pending`의 첫 페이지를 다시 읽습니다.** 완료된 항목은 목록에서 빠지므로 다음 묶음이 나옵니다. Codex나 사이트를 재시작해도 완료 기록이 DB에 남아 있고, 앞쪽 항목에 인간의 수정이나 신규 항목 추가가 발생해도 다시 선택됩니다. `pending` 목록이 비어 있으면 해당 시점·범위의 검토가 완료된 것입니다.

완료는 항목의 원문·현재 번역·버전에 연결됩니다. 사람이 원문이나 번역을 변경하면 자동으로 `changed` 상태가 되어 다시 검토해야 합니다. 변경 후 원래 문자열로 되돌려도 버전이 달라지므로 재검토됩니다. 사람이 AI 제안을 사용해 현재 번역이 바뀐 경우도 새 버전 검토 대상으로 처리합니다. 다른 항목의 문맥이나 번역 지침 변화만으로 모든 완료 기록이 무효화되지는 않습니다.

`get_review_progress`는 `total`, `reviewed`, `unchanged`, `suggested`, `pending`, `changed`, `unreviewed`, `percent`를 반환합니다. 완료율은 현재 항목 기준이며 새 항목이나 변경이 생기면 내려갈 수 있습니다. 동일한 필터를 유지하면 특정 스토리나 카테고리만 이어서 검토할 수도 있습니다. 모델이 실제로 검토했는지는 판단 기록과 이유를 통해 확인하며, 완료 건수는 번역 품질을 보증하는 점수가 아닙니다.

작업 지시 예:

> 번역 지침부터 읽고, 미번역이며 유효한 AI 제안이 없는 항목 30개를 처리해 줘. 각 항목의 앞뒤 문맥과 다른 스토리의 동일·유사 표현을 확인해서 AI 제안으로 제출해. 이유를 한국어로 적고, 참고 번역이 있으면 그 항목 ID를 첨부해. 현재 번역은 수정하지 마.

> 이 스토리의 기존 번역을 검토해서 의미 오류·용어 불일치·부자연스러운 말투가 있는 항목만 수정안을 제안해. 단순한 취향 차이는 수정하지 말고, 다른 스토리와 통일할 때는 근거가 되는 번역을 연결해.

전체 검토·재개 지시 예:

> 번역 지침을 읽고 전체 DB의 review=pending 항목을 첫 페이지부터 30개씩 검토해. 수정이 필요 없으면 이유를 적어 검토 완료로 기록하고, 수정이 필요하면 참고 번역을 확인해서 AI 제안으로 제출해. 처리할 때마다 pending의 첫 페이지를 다시 읽고, 오래된 커서는 재사용하지 마. 중단했다가 다시 시작해도 이 방식으로 이어가고, 마지막에 전체 진행 상황을 알려줘.

## HTTP API

모든 아래 요청은 `Authorization: Bearer <CODEX_API_TOKEN>` 인증이 필요합니다. 데이터는 번역 항목과 제안 정보만 포함하며 사용자 PIN이나 다른 테이블을 노출하지 않습니다.

| 메서드 / 경로 | 매개변수 |
|---|---|
| `GET /api/codex/units` | 아래 필터와 커서 |
| `GET /api/codex/unit` | `unit_id` |
| `GET /api/codex/context` | `unit_id`, `radius` (0~20, 기본 5) |
| `GET /api/codex/guidelines` | 없음 |
| `POST /api/ai-suggestions` | [제안 제출 형식](ai-suggestions.md) |
| `POST /api/codex/review` | `unit_id`, `base_revision`, `base_original_text`, `base_translation_text`, `notes` (수정 불필요 판정 이유) |
| `GET /api/codex/progress` | 목록과 동일한 범위 필터. `review`, `suggestion`, `limit`, `cursor`는 집계에서 제외 |
| `GET /api/codex/phone-subtitles` | `telephone_id`가 있으면 개별 전화, 없으면 위의 전화 목록 필터 |
| `POST /api/codex/phone-subtitles` | 전화 초안 제출. 스냅샷·음성 식별·일본어 인식 결과·한국어 제안 |

목록 필터:

- `status`: `all` (기본), `translated`, `untranslated`
- `review`: `all` (기본), `pending` (미검토+변경), `reviewed` (현재 버전 완료), `changed` (완료 후 변경), `unreviewed` (검토 기록 없음)
- `suggestion`: `all` (기본), `missing`, `fresh`, `stale`. `missing`은 유효한 대기 제안이 없는 항목을 뜻하며 제안이 이미 사용되었거나 오래된 경우도 포함합니다.
- `q`: 원문 또는 번역 검색. 기본 `match=contains`는 부분 문자열 검색이며 `%`, `_`, `!`도 문자 그대로 검색합니다. `match=exact`는 완전 일치입니다.
- `source_type`, `category`, `speaker`, `scope_type`, `scope_id`, `source_file`: 해당 필드의 완전 일치 필터
- `limit`: 1~200, 기본 50
- `cursor`: 응답의 `next_cursor`를 그대로 전달. 필터를 유지하고 `null`이 될 때까지 순회하면 전체를 읽을 수 있습니다.

결과는 `unit_id`순입니다. 운영 중인 DB를 매번 조회하므로 전체 순회는 고정 스냅샷이 아닙니다. 번역을 제안하기 직전에 항목을 다시 읽고 그때 검토한 `revision`, `original_text`, `translation_text`를 스냅샷 필드에 전달합니다. 409는 중간에 변경되었다는 뜻이므로 최신 내용을 다시 읽고 검토합니다. 네트워크 실패 후에는 제출 결과가 불확실할 수 있으므로 기존 제안을 먼저 조회합니다.

검토 기록은 `ai_reviews` 테이블에 항목별 최신 판정으로 저장합니다. 기존 유효한 대기 제안도 사이트 재시작 시 검토 완료로 등록합니다. DB 재임포트 없이 테이블이 자동 추가됩니다. 상시 실행 스케줄러와 여러 봇의 독점 작업 배정은 포함되지 않습니다. 여러 봇이 동시에 같은 항목을 읽으면 중복 검토할 수 있으므로 전체 순회는 한 작업자로 실행하는 것을 권장합니다.

## 검증

```powershell
chcp 65001 > $null
node --test app/tests/codex-api.test.js app/tests/codex-review-persistence.test.js app/tests/ai-suggestions.test.js app/tests/recent-translations.test.js
npm --prefix mcp test
node --test app/tests/phone-subtitles.test.js app/tests/phone-subtitle-drafts.test.js
python -m unittest discover -s scripts -p test_phone_subtitles.py
npm run build
```

API 테스트는 메모리 DB에서 실행하고, 재개 테스트는 임시 DB 파일을 닫았다가 다시 열어 완료 기록 유지와 기존 제안의 마이그레이션을 확인합니다. MCP 테스트는 실제 SDK 클라이언트와 STDIO 프로세스를 연결하고 테스트 HTTP 서버로 조회·제안 요청을 확인합니다. 운영 DB에는 테스트 제안을 기록하지 않습니다.
