# AI 제안

각 번역 항목에 제안문, 이유, 참고 번역 링크가 표시됩니다. 기존 사이트의 AI 초안 생성 기능은 기존대로 번역 입력란을 채우며, 이 제안 기능과 독립적으로 동작합니다.

제안은 자동으로 생성되지 않습니다. 외부 작업자가 아래 API로 제출하면, 항목을 다시 열 때 표시됩니다. 한 항목당 최신 제안 하나를 보관합니다. ‘사용’ 버튼은 로그인한 번역자 이름으로 즉시 저장하며 기존 번역 수정 이력에도 반영됩니다. 미저장 입력이 있거나 제안 이후 원문·번역이 변경되면 사용할 수 없습니다. 참고 링크는 새 탭에서 열리고 해당 대사 위치로 이동합니다.

## 제출 API

서버 환경변수 `CODEX_API_TOKEN`에 긴 임의 토큰을 설정하고 사이트 프로세스를 재시작합니다. 토큰은 서버 또는 Codex 실행 환경에서 보관하고 브라우저에 넣지 않습니다.

`POST /api/ai-suggestions`, 인증 헤더 `Authorization: Bearer <토큰>`, `Content-Type: application/json`:

```json
{
  "unit_id": "대상 항목 ID",
  "base_revision": 0,
  "base_original_text": "조회했을 때의 원문",
  "base_translation_text": "조회했을 때의 현재 번역",
  "translation_text": "제안할 번역문",
  "reason": "문맥과 화자의 말투를 고려한 이유. 다른 스토리와 통일했다면 그 근거도 설명.",
  "reference_unit_ids": ["참고한 번역 항목 ID"]
}
```

대상의 `revision`, `original_text`, `translation_text`는 기존 `GET /api/units` 응답에서 읽어 스냅샷 필드에 그대로 전달합니다. 오래된 스냅샷은 409로 거부하므로 다시 읽고 검토해야 합니다. 이유와 제안문은 필수이며 각각 최대 20,000자입니다. 참고 항목은 선택 사항이고 최대 20개이며 존재하는 ID만 허용합니다. `{user}` 같은 변수를 누락하면 제출이 거부됩니다. 이유는 일반 텍스트로 표시되고 링크는 서버가 참고 항목에서 구성합니다.

성공 응답은 `{ "ok": true, "created_at": "제안 식별값" }`입니다. `created_at`은 교체된 제안을 구분하는 불투명 식별값으로 취급합니다. 토큰을 가진 작업자는 제안을 교체할 수 있으나 현재 번역을 직접 변경할 수 없습니다. 전체 작업 목록·검색용 API와 MCP 연결은 [Codex MCP 문서](codex-mcp.md)를 참고하세요.

## 사용 API

사이트 UI가 `POST /api/ai-suggestions/accept`로 `unit_id`, 제안의 `created_at`, 로그인 사용자의 `nickname`, `pin`을 제출합니다. 봇 토큰으로 제안을 채택할 수는 없습니다. 저장과 사용 기록은 한 트랜잭션으로 처리됩니다. 제안이 교체·사용되었거나 원문·번역 버전이 달라졌으면 409입니다.

일반 번역 저장은 화면에서 읽은 `expected_revision`을 `POST /api/unit`에 함께 전달합니다. 그 사이 다른 작업자가 수정한 경우 409로 거부하고 작성 중인 입력을 유지합니다. 이전 클라이언트와 외부 스크립트의 호환성을 위해 이 필드는 선택 사항이며, 버전을 전달하지 않는 기존 호출에는 충돌 검사가 적용되지 않습니다.

테이블과 버전 추적 트리거는 사이트 시작 시 자동 추가됩니다. DB 재임포트가 필요하지 않습니다. 외부 도구가 DB를 재구축하면 스냅샷과 제안 테이블 보존 여부를 별도로 확인해야 합니다.

## 검증

```powershell
chcp 65001 > $null
node --test app/tests/ai-suggestions.test.js app/tests/recent-translations.test.js
npm run build
```
