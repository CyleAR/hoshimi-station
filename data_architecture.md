# Idoly Pride Localization Data Architecture

본 문서는 현재까지 Hoshimi-Station (및 Idoly Pride 번역 파이프라인)에서 구축해오신 **데이터 연결 구조**와 **번역 흐름**을 전체적으로 조망하기 위해 작성되었습니다.

---

## 1. 전반적인 파이프라인 흐름

현재 진행 중인 파이프라인은 원본 리소스를 추출하여 번역한 뒤, Hoshimi-Localify에서 인식할 수 있는 모듈로 패키징하는 과정을 거칩니다.

1. **원본 추출 (Extract)**: `res/masterdb/` 및 `res/adv/resource/` (또는 Google Drive/서버에서 다운로드)
2. **사전 작업 (Prefill/Track)**: `json-kor`, `adv-kor` 등 초기 번역 데이터를 병합. (현재는 과도기적 단계로 점차 배제 중)
3. **번역 편집 (Edit)**: Next.js 프론트엔드를 통해 ID 기반으로 텍스트 편집 및 저장 (`output/local-files/masterTrans/` 및 ADV 포맷).
4. **빌드 (Build/Convert)**: `main.py --convert`를 통해 최종적으로 Hoshimi-Localify가 인식할 수 있는 JSON/TXT 파일 구조로 컴파일.

---

## 2. 데이터 요소간 연결 구조 (Data Bindings)

게임 내의 각 텍스트 요소는 **마스터 데이터베이스(MasterDB)** 와 시나리오 스크립트(**ADV**)가 매우 복잡하게 얽혀있습니다.

### 📌 아이돌 (Character) 중심의 계층

캐릭터는 게임 내의 가장 상위 개념으로, 카드뿐만 아니라 팬 소통 등 다양한 텍스트를 파생시킵니다.

- **기본 프로필**: 이름, CV, 취미, 한줄 소개 등 (`Character.json`)
- **소속 카드 (Cards)**: 해당 캐릭터가 보유한 카드 목록 (아래 카드 중심 계층으로 이어짐)
- **홈 대화 (HomeTalks - 비카드형)**: 카드에 종속되지 않은 공통 홈 대화. 조건부로 매니저의 대답과 이어짐.
- **문자/전화 (Messages / Telephones - 비카드형)**: 카드 획득 없이도 발생하는 캐릭터 공통 메시지 스레드.
- **접속 대사 (CallPatterns)**: 게임 접속 시 재생되는 인사말 등.
  **그 외 데이터들**

### 📌 카드 (Card) 중심의 계층

카드는 게임의 핵심 수집 요소이며, 획득 시 해금되는 수많은 데이터를 거느리고 있습니다.

- **카드 기본 정보**: 카드명, 획득 대사, 카드 설명 등 (`Card.json`)
- **개화 대사 (EvolutionMessages)**: 카드 등급 상승 시 재생되는 대사 모음.
- **스킬 (Skills)**: 액티브/패시브/스페셜 스킬 이름과 레벨별 상세/요약 설명.
- **의상 (Costumes)**: 카드와 연동된 3D 의상명.
- **연결 스토리 (Stories)**: 카드를 읽으면 해금되는 에피소드.
  - ↳ **ADV 스크립트 연결**: 에피소드 재생 시 연결된 시나리오 파일 (`adv/*.txt`).
- **연결 문자 (Messages)**: 카드를 획득/성장시키면 수신되는 문자 스레드.
  - ↳ **문자 내용 (MessageDetails)**: 매니저의 선택지와 아이돌의 답장 텍스트.
- **연결 전화 (Telephones)**: 수신되는 전화 텍스트/음성.
- **카드 전용 홈 대화 (HomeTalks)**: 이 카드를 메인에 배치했을 때만 나오는 홈 대사.
  **그 외 데이터들**

### 📌 그룹 채팅 (Group Chats) 중심의 계층

단일 캐릭터가 아닌, 여러 캐릭터가 모여 대화하는 특수 항목입니다.

- **그룹 문자 (GroupMessages)**: 그룹명과 여러 캐릭터가 송수신하는 문자열 조합.
- **그룹 통화 (GroupTelephones)**: 다자간 통화 텍스트.

### 📌 어드벤처 (ADV) 스크립트

ADV 파일은 실제 화면에 출력되는 대사, 나레이션, 선택지를 담고 있는 파일입니다.

- 단독으로 존재하기보다는 **메인 스토리, 사무소 스토리, 카드 스토리, 이벤트 스토리**의 DB 항목(에피소드)과 파일명(`adv/xxx.txt`)으로 맵핑되어 있습니다.
- `masterDB` (스토리 타이틀, 해금 조건 등) ↔ `ADV` (실제 대화 내용) 간의 상호 참조가 이루어집니다.

---

## 3. ID 맵핑 규칙 (Key Mapping Rule)

웹 프론트엔드 편집기에서 관리하기 쉽도록, 복잡한 트리 구조를 **고유 ID**로 평탄화하여 저장합니다.

- `char_profile_{field}_{charId}` ➜ `Character.json`의 프로필.
- `card-{id}|name` ➜ `Card.json`의 카드 이름.
- `sk-{id}|level.{lvl}.description` ➜ `Skill.json`의 레벨별 설명.
- `message-{id}|detail.{detailId}.text` ➜ `Message.json` 내 특정 문자의 텍스트.
- `st-{id}|branchChoice.{index}.text` ➜ `Story.json` 내 스토리 분기 선택지.

이 ID들을 기반으로 `getKVMapping` 함수가 동작하여, 프론트엔드의 텍스트에어리어와 `masterTrans/{category}.json` 내의 실제 번역 데이터를 1:1로 매칭해주는 방식입니다.

---

## 4. 해결 과제 및 나아갈 방향

1. **DB와 ADV의 명확한 분리 및 연동**: 스토리를 편집할 때, DB 단의 '에피소드 제목/설명'과 ADV 단의 '대본'이 따로 노는 문제를 막기 위해 현재의 Card Tracker 구조처럼 함께 묶어서 보여주는 뷰가 매우 효과적입니다.
2. **레거시 의존성 탈피**: 엑셀, `json-kor`, `adv-kor` 등 초기 한섭 데이터를 덮어씌우는 방식에서 벗어나, 순수하게 원본 일본어 MasterDB를 기준으로 `output/local-files/`에 번역된 델타(Delta)만 저장하고 빌드하는 시스템이 안정성을 높입니다.
3. **규칙 자동화**: Josa 처리(은/는)나 특수 변수 치환 등을 MasterDB 변환기(`main.py`) 단에서 일관되게 처리하여 프론트엔드는 텍스트 편집에만 집중할 수 있게 구성됩니다.
