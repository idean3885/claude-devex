# Issue Skill

이슈 생애주기 관리 - 생성, 시작, 완료

## 트리거

- "이슈", "issue"

## Provider 참조

provider 파일에 인증 방식, API endpoint, request body 형식, 필드 보존 규칙이 정의되어 있다. API 호출 전에 읽고 그 정의를 따른다. 추측한 인증 헤더나 endpoint 로 호출하면 트래커마다 실패 양상이 달라 원인 추적이 어려워진다.

탐색 순서는 다음과 같다.

1. 로컬 provider: `~/.claude/ops-agent/providers/` 에서 현재 host와 매칭되는 `.md` 파일
2. 내장 provider: 플러그인 `providers/` 디렉토리
3. 기본값: `providers/github.md`

## 대외비 가드 (GATE 0)

이슈 관련 모든 텍스트(제목, 본문, 코멘트)는 공개 API로 전송되기 **직전** [../references/confidential-guard.md](../references/confidential-guard.md)의 검증 절차를 통과해야 한다.

검증 시점:
- `/issue create` 본문 작성 직후, API 호출 직전
- `/issue start` 시작 일시 코멘트 작성 직후, 기록 전
- `/issue complete` 결과 요약·완료 코멘트 작성 직후, 기록 전
- 모든 `gh issue edit` / `gh issue comment` 직전

히트 시 하드 차단하고 사용자에게 정정 요청. 훅(`scripts/pre-tool-use.mjs`)이 최종 방어선이지만, 가이드 단계에서 미리 키워드를 피해 작성하여 훅 단계까지 끌고 가지 않는다.

**키워드 소스 우선순위**:
1. `~/.claude/ops-agent/confidential-keywords.local.json` (로컬, 조직 특화)
2. 현재 레포 `CLAUDE.md`의 "대외비" 섹션 (레포 특화)
3. 기본 패턴 (플러그인 내장, 일반 원칙)

## 서브커맨드

### `/issue create`

이슈를 생성한다.

**워크플로우**:
1. provider 정의 파일 읽기
2. 이슈 제목 및 내용 파악 (사용자에게 질문)
3. **상위-하위 관계 체크**:
   - 상위 이슈가 존재하는지 확인 (사용자에게 질문 또는 컨텍스트에서 파악)
   - 상위 이슈가 있으면 `parentPostId`를 포함하여 하위 이슈로 생성
   - 기존 이슈 조회 시 상위 판단은 API 응답의 `parent` 객체 사용 (`parent.id`, `parent.number`, `parent.subject`)
   - 상위 이슈가 없으면 독립 이슈로 생성
4. provider 정의에 따라 라벨/태그 매핑
5. 이슈 본문 작성 (provider의 본문 템플릿 사용)
6. **대외비 가드 (GATE 0)**: 제목·본문 전체에 대해 `references/confidential-guard.md` 검증. 히트 시 사용자 정정 후 재검증
7. provider의 이슈 생성 API/명령 실행 (provider에 정의된 인증·endpoint·body 그대로 사용)
8. **Extensions 실행**: provider에 post-create Extensions이 정의되어 있으면 실행

### `/issue start`

이슈 작업을 시작한다. 이슈 번호 또는 URL을 인자로 받는다.

**워크플로우**:
1. provider 정의 파일 읽기
2. 이슈 식별 (번호, URL, 또는 사용자에게 질문)
3. provider의 상태 변경 API로 "진행 중" 전환 (provider의 dedicated API 사용)
4. 담당자 설정 (provider의 assignee 설정)
5. 시작 일시 텍스트 작성 (본문 추가용 또는 코멘트용)
6. **대외비 가드 (GATE 0)**: 위 5에서 생성된 텍스트에 대해 검증. 기존 필드를 수정하는 경우 새로 덧붙이는 텍스트만 검증 대상
7. provider API로 시작 일시 기록 (본문 추가 또는 코멘트, 기존 필드 보존)
8. **코드 작업 여부 확인**: "코드 작업이 필요한 이슈입니까?"
   - **Yes**: provider의 브랜치 패턴으로 브랜치 생성 (`origin/{base}` 에서 분기)
     - 워크트리 (권장): `git fetch origin && git worktree add ../{프로젝트}-{타입}-{번호} -b {브랜치명} origin/{base}`
     - 직접 체크아웃: `git fetch origin && git checkout -b {브랜치명} origin/{base}`
   - **No**: 브랜치 생성 스킵
9. **Extensions 실행**: provider에 post-start Extensions이 정의되어 있으면 실행

### `/issue complete`

이슈를 완료 처리한다. 이슈 번호 또는 URL을 인자로 받는다.

**워크플로우**:
1. provider 정의 파일 읽기
2. 이슈 식별 (번호, URL, 또는 사용자에게 질문)
3. 작업 결과 정리:
   - 사용자에게 작업 결과 요약 질문
   - provider의 완료 기록 형식에 따라 본문에 "작업 결과" 섹션 추가
4. 소요 시간 기록:
   - 시작 일시 ~ 현재 기준으로 실 작업 시간 계산
   - 점심(1h), 주말/공휴일 제외
   - 정수 올림, 일별 분배 형식 (예: `소요 시간: 8h (03/17 4h + 03/18 4h)`)
5. **대외비 가드 (GATE 0)**: 작업 결과 요약·소요 시간 코멘트 포함 모든 추가 텍스트 검증. 사용자 제공 요약이 핵심 방어 지점 (내부 용어 유입 가능성)
6. provider의 완료 상태 변경 API 실행 (provider의 dedicated API 사용)
7. 본문 업데이트 (provider의 PUT API, 기존 cc·태그·본문 보존 필수)
8. 브랜치가 있었으면 정리, 없었으면 스킵
9. workflow.json의 `currentIssues` 맵에서 현재 브랜치 항목 제거 (`del currentIssues[branch]`)
10. **Extensions 실행**: provider에 post-complete Extensions이 정의되어 있으면 실행
11. **교훈 수집**: 이 이슈 기간에 기록된 교정 항목을 수집한다 ([../../../docs/lessons.md](../../../docs/lessons.md))
    - 0건이면 아무것도 만들지 않는다
    - 기존 교훈과 대조해 신규는 자산화하고, 재발은 분석으로 보낸다. 재발을 가드 추가로 처리하지 않는다
    - 수집 구현·버킷 경로는 소비 프로젝트가 정한다. 미정의 시 이 단계를 건너뛴다

## Provider 연동 상세

이슈 생애주기의 구체적 동작은 provider에 위임한다:

| 항목 | provider에서 참조 |
|------|-------------------|
| 인증 헤더 | `Authentication` 섹션 |
| 이슈 생성 API | `Issue Lifecycle > create` |
| 라벨/태그 매핑 | `Issue Lifecycle > create > 라벨 매핑` |
| 본문 템플릿 | `Issue Lifecycle > create > 본문 템플릿` |
| 상태 변경 (dedicated API) | `Issue Lifecycle > start/complete > Workflow Change` |
| 본문 업데이트 (PUT) | `Issue Lifecycle > start/complete > Update` |
| 필드 보존 규칙 | `Known Bugs` 섹션 |
| 브랜치 패턴 | `Branch Pattern` 섹션 |
| 완료 기록 형식 | `Issue Lifecycle > complete > 결과 기록 형식` |
| 소요 시간 형식 | `Issue Lifecycle > complete > 소요 시간 기록 방법` |
| 기본 태그/CC | `Extensions` (있으면 적용) |
| post-action 확장 | `Extensions` (있으면 실행) |

## 규칙

- provider 파일을 읽고 API 를 호출한다
- **공개 표면으로 가는 모든 텍스트는 GATE 0 검증 후 송신** ([../references/confidential-guard.md](../references/confidential-guard.md))
- 이슈 생성/상태 변경은 사용자 승인 후에만
- 브랜치 생성은 코드 작업 이슈에서만 (사용자 확인)
- provider 정의에 라벨 자동 생성이 있으면 실행
- 완료 시 소요 시간은 정수 올림 (8h 초과 허용)
- 본문 업데이트 시 기존 cc, 태그, 본문 내용을 보존한다. PUT 은 전체 치환이라 누락분이 사라진다
