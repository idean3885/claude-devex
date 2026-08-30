# Changelog

이 프로젝트의 주요 변경사항을 기록합니다.

- 형식: [Keep a Changelog 1.1.0](https://keepachangelog.com/ko/1.1.0/). 분류는 `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` 6종
- 버전: [Semantic Versioning](https://semver.org/lang/ko/)
- `Unreleased` 에 쌓았다가 릴리즈 시점에 끊는다. 커밋마다 올리면 버전 번호가 변경 덩어리를 가리키지 못한다 (#409)
- 항목은 `scripts/bump-version.sh add` 가 쌓고 `release` 가 끊는다. 아래 앵커가 삽입 지점이다
- 분류 기준은 **6.22.0 부터** 적용한다. 그 이전 항목은 카테고리가 내용과 어긋날 수 있으며 소급 정정하지 않는다. 짧은 제목만으로 재분류하면 또 다른 추측이 되고, 이미 발행된 릴리즈 노트와 어긋난다
- 타입 접두(`feat:` 등)는 **8.11.0 부터** 걷는다. 분류 헤딩이 이미 그 역할을 하기 때문이다. 그 이전 항목은 발행된 릴리즈 노트와 어긋나므로 그대로 둔다

<!-- bump-version.sh 삽입 지점 -->

## [Unreleased]

### Changed
* 1레벨 다이어그램 이름을 시스템 컨텍스트 다이어그램으로 바꾼다. context 가 이름의 일부일 때 음차하는 한국어 개발 문서 관행에 맞춘다 (#418)

## [8.11.1] - 2026-08-30

### Changed
* 아키텍처 익스텐션의 다이어그램 이름과 레벨 표기를 C4 정본 명칭에 맞춘다 (#408)

## [8.11.0] - 2026-08-28

### Added
* 변경을 Unreleased 에 쌓았다가 릴리즈 시점에 끊는다. bump-version.sh 를 add·release 로 나누고 적립 시 em dash·이슈 번호·큐레이션을 검사한다 (#409)

### Changed
* 웹 리뷰 범위를 README·설계 문서·CLAUDE.md 로 줄이고, 범위 밖을 무엇이 대신 보는지 함께 적는다 (#410)

### Fixed
* 머지 전 버전 대조가 브랜치와 타겟의 버전이 같은 것을 정상으로 본다. 적립 PR 을 전부 막던 판정을 뒤로 미는 경우만 남긴다 (#409)
* 한시 권한 개방에서 갈래를 공백으로 나열하면 사용법을 돌려준다. 종전에는 둘째 갈래가 TTL 자리로 들어가 bash 내부 오류로 죽고 첫 갈래만 열린 채 남았다 (#414)

## [8.10.0] - 2026-08-28

### Added
* feat: 되돌리기 어려운 행위의 권한을 게이트와 분리해 한시 권한으로 부르고, 개방 절차 앞에 상태 조회를 세운다

## [8.9.0] - 2026-08-28

### Added
* feat: 컴팩트 재료 보존 훅 추가 (PreCompact/PostCompact)

## [8.8.2] - 2026-08-27

### Fixed
* fix: 「축」 금지 패턴이 숫자 결합형(4축·2축으로)을 잡도록 보강. 이 저장소의 잔여 1건 교정 (#397)

## [8.8.1] - 2026-08-27

### Changed
* docs: 규칙 문서·레퍼런스 문서의 표 열 이름 13건 교정. 키-값 표의 값 열을 L8 대상에서 제외 (#393)

## [8.8.0] - 2026-08-27

### Added
* feat: 계획 게이트의 분량 하한·상한을 유형별 실측에서 뽑는다. 측정 도구 length_stats.py 와 9개 유형 463편 기준값 표 (#364)

## [8.7.2] - 2026-08-27

### Fixed
* fix: 게이트 개방 안내가 잃는 갈래만 알리도록 교정. 새 목록이 이전을 모두 포함하면 알리지 않는다 (#388)

## [8.7.1] - 2026-08-27

### Changed
* docs: skills/ 의 표 열 이름 23건이 담는 값을 지목하도록 교정 (#389)

## [8.7.0] - 2026-08-27

### Added
* feat: 게이트 대상 행위를 다른 명령과 한 블록에 두면 갈래가 열려 있어도 차단. 머지 전 버전 대조를 종료 코드로 판정하는 scripts/pre-merge-check.sh 로 분리 (#386)
* feat: 액션 게이트 판정 자체 점검 `scripts/selftest-action-gate.mjs` 추가 (#386)

## [8.6.2] - 2026-08-27

### Changed
* refactor: 검증 범주·규칙 계열·지표 계열의 「축」 표기를 실물 이름으로 바꾼다. 비이력 문서 축 표기 0건. 함께 검출된 가르다·나가다·뽑다·경계를 넘어 28건도 교정. 예외는 두지 않는다 (ADR 0010, #383)

## [8.6.1] - 2026-08-27

### Fixed
* fix: 흡수 를 금지 표현으로 등록하고 스타일 룰 자체 용례 3곳 교정

## [8.6.0] - 2026-08-27

### Added
* feat: readability L8(표 열 설계) 신설. 열 이름 구체성·행 식별 열 위치·적용 범위·열 안 형태 통일·열 이름과 셀 관계·셀 분량. Microsoft·Google·Chicago·Open Group 을 근거로 대조하고 이슈가 제안한 열 이름 명사형 고정은 근거 부재로 좁혔다. 제네릭 열 이름 10건 교정. ADR 0009 신설 (#347)

## [8.5.0] - 2026-08-27

### Added
* feat: flow 에 제출 전 변경분 자체 검증(GATE 5) 추가. 8.4.0 에서 버전 대조에 붙인 번호가 기존 GATE 1(플랜 승인)과 충돌해 GATE 6 으로 옮기고 두 게이트를 SKILL.md 확인 게이트 목록에 등재 (#357)

## [8.4.0] - 2026-08-27

### Added
* feat: flow pr 단계에 머지 전 버전 대조 게이트(GATE 1) 추가. 원격 브랜치와 타겟의 버전을 비교하고 CHANGELOG 버전 헤더 중복을 본다 (#376)

## [8.3.1] - 2026-08-27

### Changed
* refactor: style-rules 의 절 번호와 배치 순서를 맞춘다 (purpose PU5·PU6, readability L5·L6, ai-tells I-3·I-7, authoring AU7·AU8). CLAUDE.md 체크리스트에 순서 검사 명령 추가 (#374)

## [8.3.0] - 2026-08-27

### Added
* feat: I-7(지시 대상 없는 평가 명사로 문장 닫기)·L7(불릿 개조식) 신설, K-4 에 서다 등록, purpose.md 시점 표에 PU6 조사 중 행 추가 (#355, #358, #359)

## [8.2.0] - 2026-08-27

### Added
* feat: 이슈 익스텐션에 판정 목적 유형(ISS7)을 세우고, 트래커 표준 템플릿이 섹션 집합을 정하도록 ISS5 예외를 둔다. ISS2 에 제목·본문 중복 판정 추가, profiles.md 합격선 표에 보고·판정·공통 행 추가. ADR 0008 신설 (#348, #351, #354, #356)

## [8.1.1] - 2026-08-27

### Fixed
* fix: 액션 게이트 차단 메시지가 이미 열린 갈래를 개방 명령에 함께 실어 개방 → 차단 → 개방 왕복을 없앤다. on 은 대체로 유지하고(합치면 TTL 이 함께 연장됨) 스크립트는 살아 있는 마커를 덮어쓸 때 이전 갈래를 알린다. ADR 0007 신설 (#353)

## [8.1.0] - 2026-08-27

### Added
* feat: 물리 이동 동사가 트래픽·데이터 경로 서술을 대신하는 형태를 표현 가드에 등록한다

## [8.0.1] - 2026-08-27

### Fixed
* fix: 보고 목적 이슈(ISS6) 필수 구조에서 문장형 절 이름과 추론으로 채워지는 절을 걷는다

## [8.0.0] - 2026-08-27

### Changed
* **BREAKING** refactor!: 스킬 이름에서 content- 접두를 걷는다. content-write→write, content-verify→lint, content-publish→publish. BREAKING: ops-agent:content-* 호출 이름 제거. hook 은 hooks/lint-posttool.sh 로 개명하고 마커는 .ops-agent/lint.json 우선 + 예전 이름 .ops-agent/content-verify.json 병행 읽기. 이력 문서의 옛 표기는 유지. ADR 0006 신설 (#365)

## [7.30.1] - 2026-08-26

### Changed
* docs: README 를 대전제 한 문장과 아스키 플로우로 줄이고 mermaid 를 제거

## [7.30.0] - 2026-08-26

### Added
* feat: 계획 게이트를 문서 수정 경로까지 넓히고 단계 어휘를 계획·초고·퇴고·교정으로 고정

## [7.29.2] - 2026-08-26

### Changed
* docs: README 를 사상과 흐름 중심으로 재구성하고 설치·레퍼런스를 docs/usage.md 로 분리

## [7.29.1] - 2026-08-26

### Fixed
* fix: 세션 시작 트리거 표를 SKILL.md 원천에서 생성하고 org-flow 를 표에 포함. 서브커맨드 이름(리뷰 요청·submit)을 트리거로 등록

## [7.29.0] - 2026-08-24

### Added
* feat: 판정과 근거를 파일에 남기는 규약 신설 (근거 확인 상태·항목 색인·미측정 구분)

## [7.28.0] - 2026-08-24

### Added
* feat: 차용 원천 개정분 반영. 대구 역치·명사화 접미사·당위 결말 보존

## [7.27.0] - 2026-08-24

### Added
* feat: 문서 목적 분류를 외부 표준 기반으로 신설하고 리듬 규칙에 목적별 게이트를 건다

## [7.26.0] - 2026-08-24

### Added
* feat: 완곡 규칙의 표적을 근거와의 관계로 바꾸고 과장 항목을 신설

## [7.25.1] - 2026-08-24

### Changed
* docs: 차용 원천의 채택 판본과 항목 번호 대응을 기록하는 대장 신설

## [7.25.0] - 2026-08-23

### Added
* feat: 프로파일이 상세 원문 실격 패턴을 공급할 수 있게 한다

## [7.24.0] - 2026-08-23

### Added
* feat: 프로파일이 목록 획득 방법을 선언할 수 있게 한다

## [7.23.0] - 2026-08-23

### Added
* feat: job-crawler 리포트가 수집 실패와 상세 확인 실패를 결과와 구분해 적는다

## [7.22.0] - 2026-08-23

### Added
* feat: org-flow 가 통합 브랜치 흐름과 브랜치명 패턴을 다룬다

## [7.21.0] - 2026-08-23

### Added
* feat: 이슈 생성에 승인 게이트를 넣는다

## [7.20.1] - 2026-08-23

### Changed
* docs: 쌓인 PR 의 머지 순서와 브랜치 삭제 시점을 PR 가이드에 넣는다

## [7.20.0] - 2026-08-23

### Added
* feat: 참조 사실을 자산 타입으로 인정하고 착수에 기존 수단 확인을 넣는다

## [7.19.0] - 2026-08-23

### Added
* feat: 재발이 잦은 레슨런을 도구 경계에서 주입한다

## [7.18.1] - 2026-08-23

### Fixed
* fix: 재발 횟수를 발생 이력에만 두어 표면이 어긋나지 않게 한다

## [7.18.0] - 2026-08-23

### Added
* feat: 기존 규칙으로 판정되지 않던 한국어 AI 티 패턴 4종을 규칙으로 넣는다

## [7.17.0] - 2026-08-23

### Added
* feat: T8 물리 조작 동사 의미 범위를 넓히고 앵커에 6종을 더한다

## [7.16.0] - 2026-08-23

### Added
* feat: 금지 표현 패턴을 어간 더하기 어미 묶음으로 쓴다

## [7.15.1] - 2026-08-23

### Fixed
* fix: 유저 스코프 자원 디렉토리를 SessionStart 가 만든다

## [7.15.0] - 2026-08-23

### Added
* feat: 소유자 식별과 매니페스트 발견을 해석기 한 곳으로 모은다

## [7.14.0] - 2026-08-23

### Added
* feat: 액션 게이트를 시간과 함께 승인 갈래로도 연다

## [7.13.5] - 2026-08-23

### Fixed
* fix: 훅이 하네스 타임아웃에 잘리기 전에 스스로 답하게 한다

## [7.13.4] - 2026-08-23

### Fixed
* fix: 소비자에게 주는 경로에서 버전을 없애고 고정 진입점을 둔다

## [7.13.3] - 2026-08-23

### Changed
* docs: 정적 토큰 보완 조건에 발급 기록을 넣는다

## [7.13.2] - 2026-08-23

### Changed
* docs: 결함을 고칠 층을 위에서부터 고르는 규칙을 ADR 로 정하고 재발 분석에 연결

## [7.13.1] - 2026-08-21

### Fixed
* fix: 물리 분할 동사 패턴이 어절 중간에 걸려 오검출하던 것을 정정

## [7.13.0] - 2026-08-21

### Changed
* docs: 표현 룰에 제목 수사·수량 표기·비유적 계수 항목 추가

## [7.12.1] - 2026-08-20

### Fixed
* fix: 대화 응답에 용어 선택 규칙(T5·T6·T17)이 적용됨을 tone.md 적용 범위에 선언한다

## [7.12.0] - 2026-08-19

### Added
* feat: 단순 정보를 문장으로 늘린 표기를 잡는 P12 를 넣는다

## [7.11.0] - 2026-08-18

### Added
* feat: 같은 명사 반복을 대상 동일성으로 판정하는 F-6 을 넣는다. 고유명사·식별자는 세지 않는다

## [7.10.2] - 2026-08-18

### Fixed
* fix: 미러에 규칙 버전을 기록해 소비자가 어느 버전을 읽는지 알게 한다

## [7.10.1] - 2026-08-18

### Fixed
* fix: T17 에 통용되지 않는 한자어를 쓰지 않는 판정 기준을 넣는다

## [7.10.0] - 2026-08-18

### Changed
* docs: 리드미를 어필 순으로 재배치 (#287)
  - 작성자가 "무엇을 어필하려는지 핵심을 모르겠다" 고 판정했다. 내용이 아니라 지면 배분 문제였다. 기능이 겹치는 오픈소스 8곳(2,654줄)의 리드미를 읽고 상단 구성을 실측해 대조했다
  - 실측 둘. 설치 명령까지 걸리는 줄이 어필이 선 5편은 L34 안이고 이 레포는 L80 이었다. 도표는 그 5편 합계가 2개인데 이 레포 혼자 4개였고 둘째 화면 전체를 전체 구조도 51줄이 차지했다
  - 「왜 만들었나」를 신설했다. 강한 리드미는 독자가 이미 겪은 일로 연다. 열린 게이트 창에서 기본 브랜치 직접 push 가 통과한 실제 사건을 적었다. 가드가 정상 동작한 상태에서 났으므로 사상 진술보다 사실 진술이다
  - 사상 표 5행을 소제목 4개로 해체했다. 다섯이 같은 무게로 놓여 세 가지를 한 벌로 갖는다는 것이 읽히지 않았다
  - 「한계와 대가」를 신설했다. 측정하지 않았다·1인 사용·지표 비움이 사상 절 안에 4줄로 섞여 있었다. 오탐·훅 지연·게이트 범위처럼 안 적혀 있던 대가를 더했다
  - 전체 구조도 51줄을 걷었다. 그 도표가 하던 일은 「설치하면 걸리는 것」과 「불러서 쓰는 것」의 표가 이미 한다. 총량은 305줄에서 294줄로 늘지 않았다

## [7.9.0] - 2026-08-18

### Added
* feat: 레슨런 용어와 자산화 시점 정의 (#286)
  - 「교훈」은 과도한 한글화라 실제로 쓰이지 않는다. 파일명·스킬명·훅명은 이미 `lessons`·`learn` 인데 한국어 산문에서만 옮겨 적고 있었다. 원어는 lessons learned 이고 프로젝트 관리 표준이 쓰는 이름이며, 「레슨런」은 국내에서도 회고와 짝지어 쓰인다
  - `docs/lessons.md` 의 「셋만 쓴다」 제약을 지켜 용어 수를 늘리지 않았다. 회고(retrospective)는 행위, 레슨런은 그 자리에서 나온 항목이라는 갈래만 용어 절에 적었다
  - **언제 하는가**를 용어 절에 붙였다. 절차 안에 흩어져 있어 세션 어느 시점에 걸리는 일인지 문서 앞에서 안 보였다. 세션을 마치기 전이고, 자동 등재 경로는 없다
  - 트리거에서 "교훈"을 빼지 않고 "레슨런"을 더했다. 사용자가 실제로 칠 수 있는 말을 없애면 스킬이 안 걸린다
  - `CHANGELOG.md` 과거 항목은 그대로 뒀다. 발행된 릴리즈 노트를 소급 정정하지 않는다

## [7.8.0] - 2026-08-15

### Added
* feat: 어조가 튀지 않는 물리 동사 계열을 검증 대상으로 넣는다 (#280)
  - `tone.md` T8 이 물리 조작 동사를 이미 금지하지만 등록 예시가 `쪼개다`·`때려박다`처럼 어조가 튀는 것에 몰려 있었다. 같은 물리 어근이면서 어조는 평범한 `잇다`·`붙이다`·`가르다`·`벗기다`·`뽑다`·`빠지다`·`넘기다` 는 검출 없이 통과했다. 산출물 한 편에서 21회가 잡히지 않았다
  - 대체어가 1:1 인 `가르다`·`뽑다` 와 오탐이 낮은 `경계 너머`·`하방`·`비자바` 계열을 `forbidden-words.json` 에 등록. 나머지 다섯은 일상 용례가 흔해 정규식으로 판정하지 않고 `physical_verb_count` 지표로 밀도만 보고한다
  - `가르다` 를 T8 예외에서 제거했다. 관용구로 통하지만 대체어가 그대로 있어 예외를 둘 이유가 없었고, 예외로 둔 동안 규칙이 오히려 통과시켰다

## [7.7.1] - 2026-08-14

### Fixed
* fix: 발행물 갈래는 opt-in 마커 없이도 발동한다 (#276)
  - 7.6.0 에서 넣은 `_posts/` 발행물 갈래가 `.ops-agent/content-verify.json` 마커 없는 레포에서 꺼져 있었다. 훅이 마커를 못 찾으면 진행 전에 종료했기 때문이다. backstop 자체가 레포별 opt-in 이라 갭이 닫힌 게 아니라 옮겨간 상태였다
  - `_posts/` 아래 마크다운은 경로가 곧 발행 대상 신호이므로 마커 없이 진행한다. 마커가 있으면 기존대로 `include`/`exclude`/`note` 를 적용하고, `exclude` 로 뺀 경우는 그 설정을 존중한다

## [7.7.0] - 2026-08-14

### Added
* feat: 문서 착수 단계의 목적·범위 확정 게이트 (base/purpose.md PU1~PU5)

## [7.6.0] - 2026-08-14

### Added
* feat: 집행 지점 자립. 액션 게이트 메시지를 GATE 3 정본과 정합하게 고치고, 발행물 편집 시 대상 레포 하우스 규칙과 `date` 미래 여부를 알린다. T1 em dash 계측 추가

## [7.5.3] - 2026-08-14

### Fixed
* fix: 지표 분모 단위 고정, 작업 식별자 구분 가능 값 요구, 후보 훅 알림 오탐 제거

## [7.5.2] - 2026-08-14

### Changed
* docs: 교훈 지표 입력 필드를 규약에 명시 (발생 이력 작업 식별자, 승격 판정 요약)

## [7.5.1] - 2026-08-14

### Changed
* docs: 아키텍처 규칙에 넓이 축(초점) 추가. 줄일 때는 지우지 않고 접는다

## [7.5.0] - 2026-08-14

### Added
* feat: 아키텍처 문서의 시점 층과 정지 조건을 규칙으로 둔다 (C4)

## [7.4.2] - 2026-08-13

### Fixed
* fix: `authoring`·`deck` 규칙이 적용 시점에 호출되지 않던 배선을 연결. 규칙 파일만 추가하고 그 규칙이 걸릴 순간을 잇지 않아, `SKILL.md` 를 편집해도 `AU1~AU6` 가 자가 점검에 들어오지 않았고 장표를 만들어도 `D1~D4` 가 검증되지 않았다
  - `hooks/content-verify-posttool.sh` 가 경로로 읽는 쪽을 판정한다. `SKILL.md`·`CLAUDE.md`·`AGENTS.md`·`skills/**`·`providers/**`·`agents/**` 면 `authoring` 축을 함께 지시한다. 파일 내용으로 추론하지 않는다. 같은 파일이 편집마다 다르게 잡히지 않게 하기 위해서다
  - `skills/content-verify/SKILL.md` 에 읽는 쪽 판정 절과 검증 순서 11번(`AU1~AU6`)을 추가. 유형 판별 표에 장표를 넣어 `extensions/deck.md` 와 `profiles.md` 의 장표 행이 선택되게 했다
  - 한 파일이 사람과 모델 양쪽에 읽히면 `authoring` 이 이긴다. 그 문서가 존재하는 이유가 모델의 실행이므로 실행 쪽을 지킨다
* docs: `config/global-md/base.md` 의 `authoring.md` 포인터를 도달 조건이 담긴 문구로 교체. 목록 항목은 무엇이 있는지만 말하고 언제 읽으라고 말하지 않아 발화하지 않았다 (`AU1` 컨텍스트 포인터)
* docs: README 에 읽는 쪽에 따라 규칙이 갈린다는 사상 항목과 `/re-pitch` 트리거, `authoring` 자동 적용 행 추가

## [7.4.1] - 2026-08-13

### Fixed
* fix: 이슈 플로우에 교훈 인덱스 로드·대조 단계 추가 (작업 단위·브랜치 결정 지점, 미정의와 0건 구분 표시)

## [7.4.0] - 2026-08-13

### Added
* feat: 에이전트가 읽는 문서 규칙(`base/authoring.md` AU1~AU6). 사람이 읽는 산문이 아니라 `SKILL.md`·`CLAUDE.md`·가이드를 대상으로 하는 유일한 base 파일
* feat: 문서 유형 프로필(`extensions/profiles.md`). 익스텐션 9개가 반복하던 적용 대상·적용 강도·합격선 세 절을 표로 흡수. 유형이 늘면 파일이 아니라 행이 하나 는다
* feat: 장표 익스텐션(`extensions/deck.md`). 새 골격의 첫 사용례
* feat: `readability.md L5`(비교는 결론과 함께). PoC 전용이던 요구를 전 유형으로 승격
* feat: `re-pitch` 스킬. 답변이 전달되지 않았을 때 요약이 아니라 재설명을 요구한다
* feat: git 위험 조작 가드. 기본 브랜치 직접 push 와 `reset --hard`·`clean`·`branch -D`·`restore` 를 액션 게이트로 보낸다. 기본 브랜치는 원격에서 조회하고 이름을 하드코딩하지 않는다
* feat: 대외비 가드에 레포 선언 층 추가(`.ops-agent/confidential.json`). `allowPaths` 만 읽는다. 키워드는 감추려는 문자열 자체라 레포에 커밋하면 그 파일이 곧 유출이므로 로컬 설정에만 둔다. 제외 경로는 레포의 성질이라 머신을 옮겨도 남아야 한다
* fix: `readability` 의 `K1~K3`·`B1` 이 `knowledge`·`blog` 의 같은 ID 와 충돌하던 것을 `CJ1~CJ3`·`BQ1` 로 해소. 나머지 76개 ID 는 그대로 둔다
* fix: `readability` 의 유형별 TL;DR 표가 익스텐션 값과 어긋나 있었다(성과평가 면제 vs 필수, PoC 권장 vs 필수). 익스텐션을 정본으로 두고 중복 표를 걷었다
* fix: `ai-tells` 의 `J-3`·`J-4` 가 `tone` 규칙을 `readability` 로 잘못 가리켰다
* fix: `ai-tells` 의 확장 가이드가 폐기된 익스텐션 골격을 안내하고 있었다
* fix: 이슈 가이드가 구현에 없는 규칙 소스 층(레포 `CLAUDE.md` 대외비 절, 플러그인 내장 기본 패턴)을 안내하고 있었다. 실제 두 자리로 정정
* docs: ADR 0003. 라우터 스킬과 wizard 스킬 기각 판단과 다시 여는 조건
* docs: `design-philosophy` 결정 6·7. 규칙 묶음을 구간별로 다르게 처방한 근거와 에이전트 문서 규칙의 자리
* docs: em dash 121줄 교정(T1). 규칙 예시와 표의 해당 없음 표기는 보존

## [7.3.0] - 2026-08-12

### Added
* feat: 교훈 승격 판정을 세션 대조로 넓히고 무효화 갈래 추가

## [7.2.0] - 2026-08-11

### Added
* feat: PoC 익스텐션에 안티패턴 3종 + 후보 비교 규칙 추가

## [7.1.0] - 2026-08-11

### Added
* feat: 턴 종료 시 교정 신호를 교훈 후보로 적립하고 /learn 으로 승격 (자동 등재 없음, 원본 포인터 필수)

## [7.0.0] - 2026-08-11

### Removed
* **BREAKING** chore!: 사용량 추적 제거 (스킬 5종·집계 문서·org-flow usage 슬롯). 실사용 없음

## [6.26.0] - 2026-08-11

### Added
* feat: 작업 완료 시 교훈 수집·자산화 절차 추가 (재발은 차단 규칙 추가가 아니라 원인 분석으로 보낸다)

## [6.25.1] - 2026-08-11

### Fixed
* fix: gitignore 부정 규칙이 런타임 상태까지 추적 대상으로 만드는 문제 수정 (#236)

## [6.25.0] - 2026-08-11

### Added
* feat: 구조 가독성 카운터 추가 및 편집 후 점검 hook 에 연결 (#235)

## [6.24.4] - 2026-08-11

### Changed
* docs: README 를 계층 배포 정체·사상 중심으로 전면 개편 (#230)

## [6.24.3] - 2026-08-10

### Changed
* docs: 외부 인증 판단을 수단 지정에서 속성 기준으로 재작성

## [6.24.2] - 2026-08-09

### Changed
* docs: 미링크 문서 4건을 README 진입점에 연결. 워크트리·작업 강도 정책·ADR 0001·외부 인증

## [6.24.1] - 2026-08-09

### Changed
* docs: 커밋·체인지로그 정책 레퍼런스를 README 에 노출. commit 가이드·선언 슬롯·ADR 0002 링크 연결

## [6.24.0] - 2026-08-06

### Added
* feat: style-rules T3 에 항목 나열 블록(개조식) 예외 추가. 블록 단위 판정으로 인덱스형 표기 허용, 산문 문단은 예외 없음

## [6.23.0] - 2026-08-05

### Added
* feat: org·repo 단위 커밋·체인지로그 컨벤션 선언 슬롯 (#218)

## [6.22.0] - 2026-08-05

### Added
* feat: 커밋 타입에서 체인지로그 분류와 버전 증분을 유도 (#217)

## [6.21.0] - 2026-08-04

### Fixed
* feat: job-crawler 진입 대기 조건을 대상별로 덮어쓰기 (#214)

## [6.20.0] - 2026-08-01

### Fixed
* feat: 추상 차원 명사 축 금지 (D-16 신설, forbidden 등록)

## [6.19.0] - 2026-08-01

### Fixed
* fix: T17 을 도메인 용어 우선으로 개정 (재다 금지어 등록, H4 예문 동반 수정)

## [6.18.0] - 2026-08-01

### Fixed
* feat: 여러 직무가 묶인 공고를 지원 단위로 펼치는 job-crawler expand 옵션

## [6.17.0] - 2026-07-31

### Fixed
* feat: 문장 전달성 검증 항목 추가 (P10 지시 대상 · P11 한 번에 읽히는가 · T17 어휘 층위 고정, H4 어미·시제 확장)

## [6.16.0] - 2026-07-30

### Fixed
* feat: 전수 스캔에서 아카이빙 레포를 「참고」 구획으로 분리하고 --exclude·--include-archived 추가. 조치할 수 없거나 유지하기로 정한 대상이 조치 대상에 남으면 새 노출과 판단이 끝난 노출을 구분할 수 없다

## [6.15.0] - 2026-07-30

### Fixed
* feat: 전수 스캔에 --owner(레포 목록 자동 수집)·--branches(원격 브랜치 전체) 추가. 잔재 브랜치를 고유 커밋 0건 기준으로 '삭제 안전' 판정하고, archived+PUBLIC 조합에 경고를 붙인다

## [6.14.0] - 2026-07-30

### Fixed
* feat: 외부 서비스 인증 만료 시 재인증 요청 플로우 문서화 (docs/external-auth.md). 토큰 발급 대신 정식 인증 명령을 제시하고, 스코프 밖 작업은 콘솔 작업으로 안내한다

## [6.13.0] - 2026-07-30

### Fixed
* feat: 대외비 키워드 단어 경계·대소문자 옵션 추가. ASCII 3글자 이하는 wordBoundary 기본 적용해 다른 식별자에 묻힌 오탐을 억제. 경계 문자에 한글은 넣지 않는다. 조사가 붙은 정상 등장이 통과하면 미탐이 된다

## [6.12.0] - 2026-07-30

### Fixed
* feat: 레포 전수 대외비 스캔 명령 추가 (confidential-scan.mjs). 규칙 로딩·표면 판정을 confidential-rules.mjs 로 분리해 가드와 공유. 값 비출력 강제, 바이너리·단어 경계 오탐 억제, 외부 소유 레포 구분

## [6.11.2] - 2026-07-29

### Fixed
* fix: post-merge-sync 의 옛 버전 경로 정렬을 존재 형태 대신 semver 비교로 판정. 하위 버전 실디렉토리를 신버전 심볼릭으로 교체해 활성 세션이 구버전 안전장치 코드를 계속 실행하던 문제를 막는다

## [6.11.1] - 2026-07-29

### Fixed
* cd·git -C 로 이동한 커밋이 다른 레포 diff 를 검사하던 우회 수정, 경로 판별 불가 시 차단

## [6.11.0] - 2026-07-29

### Fixed
* 대외비 가드 표면 3분류(public·private·internal) 및 개인→사내 방향 규칙 집행 추가

## [6.10.2] - 2026-07-29

### Fixed
* 루트 CLAUDE.md 유도 가능 내용 삭제 및 참조 자료 docs 이전 (59행, 약 837 토큰/세션 절감)

## [6.10.1] - 2026-07-29

### Fixed
* 레포 내 외부 노출 부적합 표현 9건 중립화 (어댑터 네임스페이스·시스템명·브랜치 예시)

## [6.10.0] - 2026-07-29

### Fixed
* 대외비 가드 타겟 판정 fail-open 수정 및 본문 옵션 추출 5종 추가

## [6.9.0] - 2026-07-28

### Fixed
* feat: 커밋 대상 diff 대외비 검사 추가. fix: 키워드 가드 미차단 결함 및 내부 오류 무언 통과 수정

## [6.8.2] - 2026-07-28

### Fixed
* fix: 캐시 정리가 자기 버전보다 낮은 버전만 제거하도록 변경. 신규 설치 버전 삭제 방지

## [6.8.1] - 2026-07-28

### Fixed
* fix: 문서·스킬 예시 문자열의 조직 고유 식별자 중립 표기로 치환, 가드 미검사 경로 명시

## [6.8.0] - 2026-07-28

### Fixed
* feat: 산출물 분량 축(LN1~LN2) 신설, 어시스턴트 발화 분량 지침 추가, 강제 지시어 하향

## [6.7.0] - 2026-07-28

### Fixed
* refactor: 과검증 스캐폴딩 제거, 서브 에이전트 위임 상한 전환, 작업 강도 정책 추가

## [6.6.0] - 2026-07-28

### Fixed
* fix: 훅 컨텍스트 반복 주입 제거. 룰·세션 컨텍스트를 SessionStart 1회 주입으로 이관, 지침 문서 3중 중복 해소

## [6.5.0] - 2026-07-27

### Fixed
* 채용 공고 크롤링·핏 스코어링 엔진 추가. 대상·기준·임계값은 소비 프로젝트 프로파일이 공급

## [6.4.5] - 2026-07-27

### Fixed
* refactor: What 추상화 룰을 재사용 가능한 모듈로 분리

## [6.4.4] - 2026-07-27

### Fixed
* feat: K-4(추상 대상 물리 조작 동사) 신설 및 T8 판정 기준 명시

## [6.4.3] - 2026-07-27

### Fixed
* fix: post-merge-sync 가 마켓플레이스 업데이트 실패를 감지하지 못하던 문제 수정

## [6.4.2] - 2026-07-27

### Fixed
* docs: 스타일 규칙 SSOT 교차 참조·카운트 정합 및 요약 규칙 유형 프로필화

## [6.4.1] - 2026-07-27

### Fixed
* fix: tells_count.py 변경률·분석 인자가 리터럴 텍스트와 파일 경로를 모두 수용 (인메모리 윤문 비교 가능)

## [6.4.0] - 2026-07-26

### Fixed
* feat: AI 티 SSOT 를 im-not-ai v2.3 와 정합. 신규 서브패턴(C-10 대칭 대구 등), 심각도 재조정, 정량 인프라(metrics/tells_count.py·metrics-spec, references/scholarship) 추가, content-verify 축4 AI 티 정량화 + change_rate 게이트. ADR 0001(AI 티 제거 우선순위와 저자 취향 경계) 신설. A-1 `통해` 는 실증상 AI 티 아님으로 판정되어 forbidden-words hook 에서 제거

## [6.3.6] - 2026-07-21

### Fixed
* fix: PR 본문 표준 정합. provider 템플릿을 이슈링크 최상단·What/Why·How 최하단 구조로 교체(자가검증 표 제거), pr.md에 How 최하단·so-what 명문화 (#150)

## [6.3.5] - 2026-07-20

### Fixed
* feat: 블로그 익스텐션 B10 추가. 글 분할 단위를 독자의 문제(검색 의도) 기준으로 명문화, content-write/verify 반영 (#148)

## [6.3.4] - 2026-07-19

### Fixed
* chore: 외부 어댑터 스킬 참조 네임스페이스 현행화 (toolkit → 사내 어댑터 네임스페이스) + 제네릭 명칭 중립화

## [6.3.3] - 2026-07-17

### Fixed
* docs: 액션 게이트 통과 프로토콜(GATE 3)을 flow SKILL에 명문화

## [6.3.2] - 2026-07-17

### Fixed
* fix: 세션 시작 스크립트 식별자 구문오류·로컬 동기 마켓플레이스명 정정

## [6.3.1] - 2026-07-16

### Fixed
* feat: content-verify 명사 연속 나열(P9)·개념 병렬 '+' (T16) 탐지 규칙 추가

## [6.3.0] - 2026-07-16

### Fixed
* feat: 블로그 본문 메타 어필 표현 검출 룰 신설 (tone T15, blog B9)

## [6.2.0] - 2026-07-13

### Fixed
* feat: 클러스터 쓰기 가드를 액션 게이트로 일반화. PR 머지·릴리즈·force push·리소스 삭제까지 세션 승인 전 차단

## [6.1.0] - 2026-07-13

### Fixed
* feat: 운영 클러스터 쓰기 가드 추가. mutating kube/argocd/helm 명령 세션 명시 허용 전 차단

## [6.0.0] - 2026-07-08

### Changed
* devex → ops-agent 전면 개명 (breaking): plugin id·마켓플레이스명·repo·hook 미러 경로(~/.claude/ops-agent)·env 접두어(OPS_AGENT_)를 일괄 전환. 보조 개발도구(DevEx)에서 내가 주도해 고도화하는 개인 개발 운영 에이전트로 역할을 재정의(DevEx→ops 축).

## [5.11.0] - 2026-07-08

### Added
* feat: 방향성 기반 advisor 엔진 (설정 구동 리뷰/조언 + PARA 스켈레톤 템플릿). 엔진은 devex, 방향·데이터는 소비 프로젝트 스코프 (#129)

## [5.10.16] - 2026-07-07

### Fixed
* docs: README 잔여 중복 제거. flow 문자열·im-not-ai·design-philosophy 링크 (#127)

## [5.10.15] - 2026-07-07

### Fixed
* docs: README org-flow 에 멀티레포 실사용 예시 추가 (인증서 자동 갱신, #125)

## [5.10.14] - 2026-07-07

### Fixed
* docs: README 상단 인용구 제거. 글-인용구-글 과도한 강조 해소 (#123)

## [5.10.13] - 2026-07-07

### Fixed
* docs: README 포지셔닝 재정의. 기능 나열에서 개인 AI 작업 비서로, 역량 중심 재구성 (#121)

## [5.10.12] - 2026-07-07

### Fixed
* docs: design-philosophy 를 의사결정 기록으로 재구성 (톤 다운 + 판단력 프레이밍, #113)

## [5.10.11] - 2026-07-07

### Fixed
* docs: README 강한 정리 (279→110줄, 가치 우선 재구성) + hook·설정 상세를 docs/hooks-config.md 로 이전 (#116)

## [5.10.10] - 2026-07-02

### Fixed
* docs(style-rules): 저자 톤 T14 신설 (방어적·변명조 프레이밍·과장 금지)

## [5.10.9] - 2026-07-02

### Fixed
* fix: release.sh 를 post-merge-sync.sh 로 축소. git add -A + main 직접 push 제거, 버전 범프는 PR 안에서 처리 (#111)

## [5.10.8] - 2026-07-02

### Fixed
* docs: README 를 프로젝트 소개 중심으로 재정돈 + org-flow 오케스트레이션 노출, 3축 명칭 정리 (#109)

## [5.10.7] - 2026-07-02

### Fixed
* fix(content-publish): 대상 레포 CLAUDE.md 필수 푸터(AI 협업 표기) 자동 삽입 규칙 + Phase 6 확인 항목 추가. 발행 경로 무관 누락 방지 (#108)

## [5.10.6] - 2026-06-05

### Fixed
* feat(org-flow): start 시 state에 startedAt(tz-aware ISO) 기록. usage 집계 기준점 확보 및 finish 단계 tz-naive 혼합 비교 방지

## [5.10.5] - 2026-05-31

### Fixed
* worktree-create: clone-on-demand bare clone 의 원격 추적 ref 누락으로 워크트리 생성이 실패하던 문제 수정. fetch 직전에 추적 참조를 보장해 origin/{base} 해석 실패를 막는다 (#93, #94·#99 통합)

## [5.10.4] - 2026-05-31

### Fixed
* 프로젝트 CLAUDE.md 스킬 인벤토리 정합화: 실재하지 않는 thinking 스킬(decision-record·verify·dependency-map) 표기 제거, 스킬 목록을 flow·org-flow·setup·content-*·cross-verify·usage-* 로 정정, issue·spec·commit·pr 은 flow 내부 가이드로 명시 (#105)

## [5.10.3] - 2026-05-31

### Fixed
* 구두점 SSOT 에 PN6 신설: 가운뎃점(·) 병렬 허용, 슬래시 병렬 지양 (기술 관용 표기는 예외). PN 참조 PN1~PN6 으로 일괄 갱신 (#107)

## [5.10.2] - 2026-05-31

### Fixed
* README·design-philosophy 저자 톤 정합: 본문 합쇼체 통일 + em dash 제거 (tone.md T1 / readability.md K2 준수). About 설명 em dash 도 제거 (#106)

## [5.10.1] - 2026-05-31

### Fixed
* README 를 통합 개발 어시스턴트 관점으로 재구성 + docs/design-philosophy.md 신설. 이슈 플로우·콘텐츠 작성·교차 검증·사상 주입 하네스 3축으로 묶고 누락 스킬 편입, 실재 안 하는 thinking 표기 제거 (#104). CLAUDE.md 정합화는 #105

## [5.10.0] - 2026-05-30

### Fixed
* content-verify opt-in PostToolUse hook 추가 (#102). 문서 편집 후 AI 티·가독성·톤·구두점 자가 점검 유도, .devex/content-verify.json 마커 기반

## [5.9.0] - 2026-05-30

### Fixed
* 글로벌 ~/.claude/CLAUDE.md 조립 엔진. SessionStart 가 ~/.claude/global-md/ 조각을 마커 조립 (idempotent, 수기 파일 .bak 백업). 퍼블릭 base 조각 분리, 외부 소비자 NN-*.md 규약 (#101)

## [5.8.5] - 2026-05-30

### Fixed
* forbidden-words: '응답 차단' 표현을 사전 가이드 + 사후 통지 실제 동작에 맞게 정합. prompt hook 에 출력 직전 자가 대조 의무 한 줄 주입 (#100)

## [5.8.4] - 2026-05-29

### Fixed
* release.sh: update 가 제거한 옛 버전 캐시 경로를 심볼릭으로 복원. 활성 세션 hook 유지

## [5.8.3] - 2026-05-29

### Fixed
* forbidden-words: 저속어 '땜빵/땜방' 금지 룰 추가 (T8)

## [5.8.2] - 2026-05-27

### Fixed
* worktree-create.sh 워크트리 생성 후 post-worktree-create.d hook 디렉토리 호출

## [5.8.1] - 2026-05-27

### Fixed
* pre-tool-use 가드 cwd ~ expand + release.sh 옛 버전 심볼릭 보존

## [5.8.0] - 2026-05-27

### Fixed
* org-flow start Step 2. 메인 클론 일괄 pull 일반 골격 (pull-mains.sh + pullMainsOnStart 매니페스트 키)

## [5.7.1] - 2026-05-26

### Fixed
* confidential-guard 의 cwd 추출에 명령 텍스트 fallback 추가 (#95)

## [5.7.0] - 2026-05-20

### Fixed
* 콘텐츠 룰: 시리즈 베이스 → 단편 베이스 전환, 드래프트 단계 도입 (blog.md B6/B7, content-write·content-publish 반영)

## [5.6.0] - 2026-05-19

### Added
* usage:* 에 cwd-based aggregation 모드 추가. worktree-per-task 환경에서 ticket 단위 분리 (#91)
* docs/usage-cwd-aggregation.md 신규

### Fixed
* usage:* cwd-based aggregation 모드 추가 (#91)

## [5.5.0] - 2026-05-19

### Fixed
* org-flow 에 usage 어댑터 위임 단계 추가. 추적 단위를 이슈로 정렬 (#90)

## [5.4.3] - 2026-05-18

### Fixed
* 이슈 익스텐션 ISS5 추가. 기능·운영 이슈는 도메인 What/Why 까지만, 파일 경로·클래스명·어노테이션·dependency·yml key·메트릭 이름·검증 절차 금지

## [5.4.2] - 2026-05-18

### Fixed
* pr.md PR 본문 특화 금지 패턴·자가 점검 강화. 변경 파일·시그니처·검증 게이트 표 차단

## [5.4.1] - 2026-05-15

### Fixed
* K 카테고리 (감정체·의인화) 신설, K-1 `멀쩡` forbidden 등록 (#89)

## [5.4.0] - 2026-05-14

### Fixed
* PreToolUse 도메인 What 추상화 가드 추가 (커밋/PR 본문에 클래스명·어노테이션·헥사고날 어휘·yaml 경로·산출물 카운트·메서드 시그니처 차단, mermaid 블록 제외)

## [5.3.1] - 2026-05-14

### Fixed
* 커밋·PR 메시지 도메인 What 추상화 룰 추가 (mermaid 권장, 클래스명·헥사고날 어휘·산출물 카운트 금지)

## [5.3.0] - 2026-05-13

### Fixed
* feat: flow/setup description + org-flow 셋업 마법사 · provider 분기 + worktree-cleanup 안전 보강 (#83/#84/#85)

## [5.2.0] - 2026-05-12

### Fixed
* feat: patch-hud 이관. claude-hud 0.1.0 wrapWidth 변경 반영하여 compact-nowrap 패치 갱신 + SessionStart hook 등록 (#81)

## [5.1.0] - 2026-05-12

### Fixed
* feat: extension 4개 본문(issue·dailylog·peer-review·work-review) + .omc/state 마이그레이션 hook

## [5.0.0] - 2026-05-12

### Fixed
* feat: .devex/state 경로 리네임 + usage-tracker 5스킬 흡수 (devex:usage-*)

## [4.1.0] - 2026-05-12

### Fixed
* feat: content-verify 사실 정확성 축에 의미 보존 13항 체크리스트 보강 (im-not-ai MIT 차용, #62)

## [4.0.0] - 2026-05-12

### Fixed
* feat: content-publisher + cross-verify 흡수, 글로벌 OMC 가이드 제거, 단일 prefix(devex:*). BREAKING: content:* / cross-verify:* prefix 제거, devex:content-* / devex:cross-verify 로 통합. (#66 마일스톤)

## [3.12.0] - 2026-05-12

### Fixed
* feat: style-rules SSOT 기반 구조 신설 (base+extensions). im-not-ai 차용 분류(MIT), 가독성·톤·구두점·AI 티 통합, session-start 미러 hook (#59 회고)

## [3.11.1] - 2026-05-08

### Fixed
* docs: README에 '표현 가드' 섹션 추가 + 파일 구조 갱신 (forbidden-words hook)

## [3.11.0] - 2026-05-08

### Fixed
* feat: 금지 표현/AI 슬롭 hook 추가 (UserPromptSubmit 룰 주입 + Stop 사후 탐지, 사용자 추가 룰은 ~/.claude/forbidden-words.local.json 머지)

## [3.10.8] - 2026-05-08

### Fixed
* fix(worktree-cleanup): heredoc 인용 + argv 전달로 본문 백틱 명령 치환 차단

## [3.10.7] - 2026-05-07

### Fixed
* fix: claude-devex-update 워크플로 템플릿을 templates/workflows/로 이동. 본 레포 .github/workflows/에서 제거하여 자기 자신 cron 트리거 차단 (#57)

## [3.10.6] - 2026-05-06

### Fixed
* fix(worktree-cleanup): 자동 orphan sweep 제거 + --sweep-stale 서브커맨드로 분리 (멀티레포 안전성)

## [3.10.5] - 2026-05-06

### Fixed
* release.sh: 검증 단계 cache 경로를 PLUGIN_NAME 기반 절대경로로. cache 외부 호출에서도 정상 검증

## [3.10.4] - 2026-05-06

### Fixed
* release.sh: origin URL 하드코딩 제거 (idean3885 HTTPS 기본값 + DEVEX_REMOTE_URL env override)

## [3.10.3] - 2026-05-06

### Fixed
* worktree-cleanup: bare clone 브랜치 삭제 시 -D 사용 (not-fully-merged false negative 제거)

## [3.10.2] - 2026-04-17

### Fixed
* 대외비 가드 타겟 호스트 인식. 사내 레포·사내 트래커 쓰기는 externalOnly 패턴 허용

## [3.10.1] - 2026-04-17

### Fixed
* fix: worktree 스크립트 PROJECT_ROOT 감지를 state 파일 기준으로 변경. 플러그인 캐시에서 호출 시 실패 해소

## [3.10.0] - 2026-04-17

### Added
* devex:flow에 대외비 가드 (GATE 0) 추가
  - `skills/flow/SKILL.md`: GATE 0 선언 및 규칙 업데이트
  - `skills/flow/references/confidential-guard.md` 신설: 원칙, 키워드 소스 우선순위, 검증 절차, 드라이런 모드
  - `skills/flow/guides/issue.md`: create/start/complete 각 워크플로우에 GATE 0 단계 삽입
  - `skills/flow/guides/commit.md`, `pr.md`: 기존 대외비 검증을 confidential-guard 참조로 일관화
  - `scripts/pre-tool-use.mjs`: `gh issue/pr/release` 쓰기 명령 및 `git commit`의 본문/제목/메시지 스캔, 히트 시 `permissionDecision: deny`로 차단
  - `templates/confidential-keywords.example.json` 제공 (로컬 설정 템플릿)
  - 환경 변수 지원: `DEVEX_CONFIDENTIAL_DRYRUN=1` (경고만), `DEVEX_CONFIDENTIAL_DISABLE=1` (전체 스킵), `DEVEX_CONFIDENTIAL_CONFIG_PATH` (키워드 파일 경로 오버라이드)

## [3.9.0] - 2026-04-14

### Fixed
* 멀티레포 오케스트레이션(org-flow) 흡수 + 리모트 원소스 워크트리 전략

## [3.8.2] - 2026-04-14

### Fixed
* 브랜치 분기 시 origin/{base} 기준 강제

## [3.8.0] - 2026-03-31

### Fixed
* feat: PR Closes 규칙 추가. GitHub Issues 사용 시 자동 닫힘

## [3.7.4] - 2026-03-27

### Fixed
* 버전 범프 스크립트 추가. 4곳 동시 업데이트 강제

## [3.7.3] - 2026-03-27

### Fixed
* issue complete post-action을 provider Extensions 의존으로 통일
* Extensions이 정의되어 있으면 실행, 없으면 스킵

## [3.7.2] - 2026-03-26

### Fixed
* flow 스킬 워크트리 환경 커밋 감지 보정: sibling 공유 커밋 제외, 브랜치 고유 커밋만 카운트
* 이슈 불일치 감지 추가: 다른 이슈 작업 요청 시 워크트리 분기 권장

## [3.7.1] - 2026-03-26

### Added
* flow 스킬에 환경 감지 단계 추가 (상태 감지 전 필수)
  - Base Branch 감지: upstream 추적 → merge-base 최근접 순서로 분기 원점 결정
  - Worktree 감지: git-common-dir vs git-dir 비교로 linked worktree 판별

## [3.7.0] - 2026-03-25

### Changed
* flow 스킬을 Git 상태 기반 디스패처로 전환
  - 순차 7-Phase 파이프라인 → 상태 감지 테이블 (7 우선순위)
  - GATE 3개 → 2개 (머지 승인 제거, 사용자 웹 머지 = 세이프티가드)
  - issue complete 시 머지 체크 1회 (브랜치 삭제 보호)
  - 121줄 → 55줄 컨텍스트 경량화

## [3.6.0] - 2026-03-20

### Added
* PreToolUse 훅으로 세션 컨텍스트 주입 방식 전환
  - SessionStart 훅은 출력 주입을 지원하지 않음 (Claude Code 플랫폼 제약)
  - SessionStart: 사이드이펙트 전담 (버전 동기화, git identity, 캐시 파일 생성)
  - PreToolUse: 캐시 파일을 읽어 `additionalContext`로 주입
  - 버전, provider, Git Identity, 스킬 트리거 매핑이 매 툴 사용 시 컨텍스트에 포함

## [3.5.5] - 2026-03-20

### Fixed
* SessionStart 훅 stdout 출력을 `process.stdout.write` → `console.log`로 변경
  - Claude Code가 줄바꿈으로 출력 완료를 판단하는 것으로 추정
  - OMC bash 훅의 `echo`와 동일하게 줄바꿈 포함 출력

## [3.5.4] - 2026-03-20

### Fixed
* SessionStart 훅 matcher를 `""` → `"*"`로 변경. 세션 컨텍스트 미주입 근본 원인 해소
  - 빈 문자열 matcher로는 훅이 실행되지만 출력이 세션에 주입되지 않음
  - OMC 플러그인과 동일한 `"*"` 와일드카드 사용

## [3.5.3] - 2026-03-20

### Added
* SessionStart 훅 컨텍스트에 `devex: v{version}` 명시적 출력
  - VERSION 파일 기반으로 실제 버전을 세션 컨텍스트 첫 줄에 주입
  - 디렉토리명과 무관하게 AI가 정확한 버전을 인식

## [3.5.2] - 2026-03-20

### Fixed
* syncPluginVersion에서 디렉토리 리네임 제거
  - 리네임이 Claude Code의 경로 캐싱과 충돌하여 재설치/롤백 유발
  - installed_plugins.json의 version, gitCommitSha만 갱신 (경로 유지)
  - renameSync, dirname import 제거, pluginRoot를 const로 복원

## [3.5.1] - 2026-03-20

### Fixed
* README에서 사내 도메인 유출 제거 (Mermaid 다이어그램 예시를 generic으로 교체)

### Added
* commit 스킬 리뷰에 대외비 검증 단계 추가
  - 퍼블릭 리모트 대상: 사내 도메인, 내부 API URL, 조직명 등 diff 검증
  - 로컬 전용 provider 내용이 퍼블릭 파일에 유입되지 않았는지 확인
  - 리뷰 체크리스트에 대외비 미포함 항목 추가

## [3.5.0] - 2026-03-20

### Changed
* README.md 전면 재작성. v3.x 플러그인 구조 반영
  - 이슈 사이클 → 이슈 플로우 용어 통일
  - 구버전 스킬명(/github-issue, /github-pr, /implement) 제거
  - setup.sh/템플릿 설치 방식 → 플러그인 마켓플레이스 설치로 전환
  - project-profile 설명 제거 (v3.0.0에서 삭제됨)
  - Provider 시스템, Git Identity, 플러그인 자체 관리 기능 문서화
  - Mermaid 다이어그램 현행화

## [3.4.2] - 2026-03-20

### Fixed
* syncPluginVersion 후 pluginRoot 미갱신으로 cleanupStaleVersions가 새 디렉토리 삭제하는 치명적 버그 수정
  - pluginRoot를 let으로 변경, 리네임 후 즉시 갱신
  - 실행 순서 변경: cleanupStaleVersions → syncPluginVersion (안전한 순서)

## [3.4.1] - 2026-03-20

### Added
* SessionStart 훅에서 플러그인 버전 자동 동기화
  - VERSION 파일과 캐시 디렉토리명 불일치 시 자동 리네임
  - installed_plugins.json의 version, installPath, gitCommitSha 자동 갱신
  - 수동 marketplace update나 재설치 불필요
* SessionStart 훅에서 플러그인 캐시 디렉토리 git identity 자동 설정
  - 플러그인 리모트 호스트의 provider Git Identity 기반
  - 재설치 후에도 올바른 계정으로 자동 커밋 가능

## [3.4.0] - 2026-03-20

### Added
* Git Identity 시스템. 크리덴셜 기반 커밋 계정 자동 검증
  - Provider에 `## Git Identity` 섹션 추가 (user.name, user.email)
  - SessionStart 훅에서 `gh auth status`로 크리덴셜 계정 감지 후 컨텍스트 주입
  - 커밋/푸시 전 provider의 Git Identity와 repo git config 자동 검증 및 수정
  - 글로벌/로컬 git config에 의존하지 않고 크리덴셜 → identity 매핑으로 계정 오류 원천 차단
* Provider 템플릿(PROVIDER.md)에 Git Identity 섹션 추가

### Fixed
* SessionStart 훅 출력 필드를 `additionalContext` → `message`로 변경. 세션 복원 시 컨텍스트 미주입 버그 해소
* `ensurePluginGit()`에서 `origin/master` 하드코딩 → 리모트 기본 브랜치 자동 감지로 변경

## [3.3.0] - 2026-03-19

### Added
* SessionStart 훅에서 스킬 트리거 매핑을 additionalContext로 주입
  - 프로젝트 enabledPlugins 설정과 무관하게 스킬 동작 보장
  - 어떤 디렉토리에서든 자연어로 스킬 트리거 가능
  - 디스크 쓰기 없음. 세션 메모리에만 존재

### Fixed
* provider 감지 regex 수정. 마크다운 테이블 형식 hostPattern 파싱 실패 해소

## [3.2.2] - 2026-03-19

### Fixed
* .claude/ 디렉토리를 .gitignore에 추가하여 플러그인 캐시에서 제외
  - 플러그인 캐시에 .claude/skills/가 존재하면 Claude Code가 plugin.json의 skills 등록을 무시하는 문제 해소
  - devex 스킬(issue, commit, pr, flow, spec, setup)이 세션 스킬 목록에 정상 노출되도록 수정

## [3.2.1] - 2026-03-18

### Added
* SessionStart 훅에서 이전 버전 캐시 디렉토리 자동 정리
  - marketplace update 후 잔여 버전 디렉토리 누적 방지

## [3.2.0] - 2026-03-18

### Added
* 릴리스 자동화 워크플로우 (`release.yml`). main 브랜치 VERSION 변경 시 태그 + GitHub Release 자동 생성
* CHANGELOG에서 해당 버전 섹션을 자동 추출하여 릴리스 노트 생성

### Fixed
* master/main 브랜치 분리로 인한 v3.0.0~v3.1.1 미배포 해소
* 자기 참조 auto-update PR 정리 (#35, #38, #46)
* 스테일 브랜치 정리 (master, chore/devex-update-*)
* 커밋 히스토리 author 정보 정규화

## [3.1.1] - 2026-03-18

### Fixed
* issue 스킬에 provider 참조 필수 규칙 강제. API 추측 호출 방지
* provider 파일 미참조 시 API 호출 금지 명시
* 본문 업데이트 시 기존 cc·태그 보존 필수 규칙 추가
* workflow.json currentIssue 제거 단계 추가

## [3.1.0] - 2026-03-18

### Added
* `/issue` 서브커맨드 확장. create/start/complete 이슈 생애주기 전체 관리
* 코드 없는 이슈 지원. start 시 브랜치 생성 선택 (조사/문서 이슈 대응)
* github provider에 이슈 start/complete 생애주기 추가
* SessionStart 훅에서 plugin git 자동 복원 (marketplace update 후 수동 절차 불필요)
* marketplace.json에 repository.url 추가

### Removed
* `/implement` 스킬 제거. 프로젝트별 구현 스킬 + cross-verify 구현축으로 대체

### Changed
* 플러그인명 `devex`로 통일 (plugin.json + marketplace.json)

## [3.0.0] - 2026-03-18

### Breaking Changes
* 이슈 사이클 → 이슈 플로우(issue flow) 용어 전환
* `/cycle` → `/flow`, `/github-issue` → `/issue`, `/github-pr` → `/pr` 스킬 리네이밍
* `/implement` 스킬 제거. 프로젝트별 구현 스킬 + cross-verify 구현축으로 대체
* Provider 추상화 도입. 플랫폼별 이슈 동작을 provider로 분리

### Added
* `providers/` 디렉토리. PROVIDER.md 템플릿 + github.md 기본 내장
* `/setup` 스킬. provider 등록, 상태 확인, overlay 설정
* `/issue` 서브커맨드 확장. create/start/complete 이슈 생애주기 전체 관리
* 코드 없는 이슈 지원. start 시 브랜치 생성 선택, 조사/문서 이슈 대응
* SessionStart 훅에서 git remote host 기반 provider 자동 감지
* 로컬 provider 시스템 (`~/.claude/devex/providers/`, `~/.claude/devex/overlays/`)

### Changed
* github provider에 이슈 start/complete 생애주기 추가
* plugin.json + marketplace.json 플러그인명 `devex`로 통일
* CLAUDE.md 전면 갱신 (이슈 플로우 용어, provider 시스템 설명)

## [2.0.0] - 2026-03-08

### Breaking Changes
* `/post` 스킬을 배포 범위에서 제거 (신규 설치 시 미포함)
  - post는 블로그 레포 전용 보조 도구로, 범용 DevEx 플러그인의 core 범위 밖
  - 기존 설치 레포는 `--update` 시 삭제되지 않음 (수동 삭제 필요)
  - core 스킬 9종 확정: 이슈 사이클 6종 + thinking 3종

### Changed
* cycle 스킬에서 spec/implement 의존성 제거 (플랜 기반 구현으로 단순화)
* cycle 스킬 인라인 중복 제거: 명시적 파일 경로 위임으로 전환
  - github-issue, commit, github-pr 규칙을 인라인 재작성 → Read 위임
  - 단일 진실 원천(single source of truth) 확보
* README cycle 다이어그램 "명세 + 구현" → "구현" 동기화

## [1.5.0] - 2026-02-19

### Added
* `/post` 스킬에 비평가 검토 단계(Phase 4) 추가
  - 품질 기준 5개: 주제 선명도, 분량 적절성, 톤 적합성, 저자 관점, 중복 여부
  - 가독성 기준 7개 (A4 PDF 최적화): 문단 단위, 문단 길이, 주제문 선행, 단문 문단, 열거 vs 산문, 코드 블록, 산문 연속
  - 문단 분리 판단 기준: 연관 문장의 문단 유지/분리 테스트
  - 근거: Google/Microsoft Style Guide, NN/G, WCAG CJK 권장사항

## [1.4.0] - 2026-02-18

### Added
* 사이클/이슈 브랜치 생성 시 워크트리 우선 안내
  - 워크트리(권장): 로컬 상태 보존, 별도 디렉토리에서 작업
  - 직접 체크아웃: uncommitted changes 확인 후 전환
  - Phase 7 정리 단계에 워크트리/체크아웃 분기 추가

## [1.3.1] - 2026-02-18

### Changed
* README 가독성 개선: 독립 문장 개행 분리, blockquote 한 줄 통합 (업계 관례 기반)

## [1.3.0] - 2026-02-18

### Added
* Thinking 스킬 3종: `/decision-record`, `/verify`, `/dependency-map`
  - `/decision-record`: MADR 기반 아키텍처 의사결정 기록 (파기 조건 포함)
  - `/verify`: 3-Layer(Philosophy → Strategy → Tactics) 정합성 검증 + Devil's Advocate
  - `/dependency-map`: Mermaid 의존성 맵 생성 및 변경 영향도 분석
* 프로젝트 설명 업데이트: 자연어 호출 중심, 기본 가이드라인 + 오버라이드 자유도 사상 반영
* `skills/thinking/` 디렉토리로 기존 이슈 사이클과 물리적 분리
* setup.sh에 thinking 스킬 설치 포함

## [1.2.2] - 2026-02-15

### Added
* README에 GitHub 인증 설정 가이드 추가 (제로 트러스트 / 클래식 토큰)

## [1.2.1] - 2026-02-15

### Changed
* CLAUDE.md 템플릿 경량화: 스킬과 중복되는 Git Flow, 브랜치 전략, 커밋 컨벤션 상세를 참조 링크로 대체 (228줄 → 172줄)
* 검증 섹션 추가: 자가 검증/비판적 검증 구분 가이드

## [1.2.0] - 2026-02-13

### Added
* `/cycle` 스킬: 전체 이슈 사이클 오케스트레이션
  - 7단계 워크플로우 (이슈 탐색 → 플랜 → 구현 → 리뷰 → PR → 검증 → 머지)
  - 3개 확인 게이트 (플랜 승인, 커밋 승인, 머지 승인)
  - 시스템 리마인더와 무관하게 GATE에서 사용자 응답 대기

## [1.1.0] - 2026-02-12

### Added
* 자동 업데이트 구독 (`setup.sh --subscribe`)
  - GitHub Actions 워크플로우로 매일 09:00 KST 자동 확인
  - 변경 감지 시 PR 자동 생성
* `/github-pr` 스킬: PR 머지 후 타겟 브랜치 이동 및 최신화 단계 추가

### Changed
* README.md 포지셔닝 개선: 프로젝트 설명을 구체화

## [1.0.0] - 2026-02-11

### Added
* 이슈 사이클 스킬 5종: github-issue, spec, implement, commit, github-pr
* 프로젝트 프로필 (`project-profile.md`) 지원: 스킬 동작을 프로젝트에 맞게 오버라이드
  - `/spec`, `/implement` 스킬이 프로필에 따라 동작 조정
* 버전 관리 체계 도입
  - `VERSION` 파일 (semver)
  - `setup.sh` 업데이트 모드 (`--check`, `--update`)
  - 다운스트림 프로젝트 `.devex-version` 기록
* `setup.sh` 설치 스크립트
* CLAUDE.md 템플릿 (AI 협업 가이드)
* README.md 프로젝트 문서
