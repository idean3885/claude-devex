# hook·설정 레퍼런스

[설치하고 쓰는 법](usage.md#설치하면-걸리는-것) 에서 요약한 표현 규칙 hook 의 설정 상세와 플러그인 자체 관리 동작입니다. 실행 전에 차단하는 규칙은 [action-gate.md](action-gate.md), 설계 배경은 [design-philosophy.md](design-philosophy.md) 를 참조하세요.

## 표현 가드 룰

금지 표현(과장형 형용사·보고서체·근거 없는 단언·번역투 등)을 응답 출력 직전에 막거나 자동으로 고쳐 쓰지 않습니다. 출력 직전 패턴 자가 대조는 어시스턴트가 수행하고, hook 은 사전 가이드와 사후 통지를 맡습니다.

주입 주기는 데이터 성격에 맞춥니다. 룰 목록은 세션 중 바뀌지 않으므로 SessionStart 에서 1회만 싣고, 턴마다 달라지는 위반 내역만 UserPromptSubmit 이 통지합니다.

| hook | 시점 | 싣는 것 |
|------|------|---------|
| SessionStart (`scripts/session-start.mjs`) | 세션 1회 | 룰 목록 전체 (플러그인 기본 + 사용자 추가 머지) |
| Stop (`hooks/forbidden-words-stop.sh`) | 응답 종료 시 | 직전 응답 스캔 → 위반을 `.forbidden-violations-pending` 에 기록 |
| UserPromptSubmit (`hooks/forbidden-words-prompt.sh`) | 위반이 있는 턴만 | pending 내역 통지 후 파일 삭제. 위반이 없으면 무출력 종료 |

세션 컨텍스트(provider·git identity·스킬 트리거)도 같은 경로로 SessionStart 에서 1회 전달됩니다. PreToolUse 는 가드 판정만 담당하며 컨텍스트를 싣지 않습니다.

룰은 `config/style-rules/base/ai-tells.md` 의 카테고리 ID(`taxonomyId`)와 1:1 매핑되어, 패턴이 왜 존재하는지 역추적됩니다.

| 위치 | 역할 |
|------|------|
| `config/forbidden-words.json` | 기본 룰 (표현 가드 패턴) |
| `~/.claude/forbidden-words.local.json` | 사용자 추가 룰 (선택, 머지됨) |

룰 추가는 JSON 에 객체 하나만 더하면 즉시 반영됩니다(Python 정규식).

```json
{ "pattern": "포괄적|체계적", "replacement": "구체 표현 (무엇을/어떻게)", "reason": "AI 슬롭 (추상적 과장 형용사)" }
```

신규 패턴은 먼저 `base/ai-tells.md` 분류 체계에 카테고리 ID 를 부여하고, S1 으로 판정될 때 등록합니다.

## lint 자동 점검

문서 편집(Edit/Write) 직후 lint 관점(AI 티·가독성·톤·구두점) 자가 점검을 유도하는 PostToolUse hook 입니다. 발동 조건은 둘 중 하나입니다.

| 조건 | 동작 |
|------|------|
| 프로젝트 루트(또는 상위)에 마커 파일 `.ops-agent/lint.json` | 마커의 `include`/`exclude`/`note` 를 적용해 작동. 예전 이름 `.ops-agent/content-verify.json` 도 읽는다 |
| 편집 대상이 `_posts/` 아래 마크다운 | 마커 없이도 작동 (발행물 갈래) |

마커는 모든 프로젝트의 `.md` 편집마다 리마인더가 뜨는 노이즈를 막는 장치입니다. `_posts/` 는 경로가 곧 발행 대상이라는 신호라 노이즈 위험이 다르고, 이 갈래에까지 opt-in 을 요구하면 발행 규칙 backstop 이 가장 필요한 레포일수록 마커가 없어 조용히 꺼집니다. 마커가 있으면서 `exclude` 로 `_posts` 를 뺀 경우는 그 설정을 존중해 발동하지 않습니다.

```json
{
  "include": ["**/*.md", "resume/*.html"],
  "exclude": ["node_modules/**", "CHANGELOG.md"],
  "note": "프로젝트별 추가 안내 (선택, 리마인더에 함께 출력)"
}
```

- `include` 생략 시 기본값은 `["**/*.md"]` 입니다.
- 도메인 특화 검증(예: 이력서 ATS·PDF 동기)은 소비 레포의 프로젝트 스코프 hook 으로 별도 구성합니다.
- 시점 고정 기록(ADR·spec 스냅샷)은 `exclude` 에 넣습니다. 지난 문장을 지금 기준으로 고치면 기록이 아니게 됩니다.

hook 이 내보내는 검출은 두 종류입니다.

| 검출 갈래 | 무엇을 보나 | 구현 |
|-----------|-------------|------|
| 표현 검출 | em dash, AI 슬롭 어휘 | hook 내부 정규식 |
| 구조 검출 | 문단 길이·산문 연속·시각 요소 주기·목록 항목 수·테이블 열 수·헤딩 레벨·코드 언어 | `config/style-rules/metrics/readability_count.py` |

정규식은 어휘만 봅니다. 산문이 몇 문단 쌓였는지는 세어야 알 수 있어 카운터를 따로 둡니다. 검출 결과가 수치로 실려 오므로 리마인더가 "점검하라" 가 아니라 "여기가 몇이다" 가 됩니다.

카운터가 커버하는 항목과 일부러 빼놓은 항목은 `config/style-rules/base/readability.md` 의 검증 표에 있습니다.

## 레슨런 도구 경계 주입

재발이 잦은 레슨런의 조치 한 줄을 발동 지점에서 주입한다. 근거와 하지 않는 것은 [lessons.md](lessons.md) 에 있다.

선언이 없으면 훅은 조용히 종료한다. 자산을 갖지 않은 프로젝트에 문구가 뜨지 않는다.

| 위치 | 범위 |
|------|------|
| `~/.claude/ops-agent/lesson-boundaries.json` | 유저 |
| `<프로젝트 루트>/.ops-agent/lesson-boundaries.json` | 프로젝트. 유저 선언과 합쳐진다 |

```json
{
  "boundaries": {
    "Write|Edit": ["규모 기준을 먼저 정한다 — knowledge/areas/lessons/scale.md"],
    "AskUserQuestion": ["묻기 전에 조사로 나오는지 본다 — knowledge/areas/lessons/ask.md"]
  }
}
```

키는 도구 이름 정규식이고 값은 주입할 줄의 배열이다. 한 줄에 조치와 자산 경로를 함께 적는다. 본문은 필요할 때 그 경로로 연다.

훅이 반응하는 도구는 `Write` · `Edit` · `MultiEdit` · `NotebookEdit` · `AskUserQuestion` 이다. 그 밖의 도구는 선언해도 걸리지 않는다. **자리를 늘리는 것이 이 장치의 실패 방식이므로 목록을 늘릴 때는 재발 이력을 먼저 본다.**

## 컴팩트 재료 보존

컴팩트 요약은 결론과 파일 경로를 남기고 **그 결론을 만든 명령을 버린다.** 결론이 근거보다 오래 살면 「이미 확인함」으로 읽혀 재확인이 일어나지 않는다. 측정과 결정은 [ADR-0013](adr/0013-compact-preserves-conclusion-not-evidence.md).

| hook | 시점 | 하는 일 |
|------|------|--------|
| PreCompact (`hooks/precompact-state.py`) | 컴팩트 직전 | 그 구간의 사용자 발화·실행한 명령·고친 파일을 `~/.claude/state/compact/<세션ID>.md` 에 덧붙인다 |
| PostCompact (`hooks/postcompact-pointer.py`) | 컴팩트 직후 | 그 파일 **경로**를 컨텍스트에 주입한다 |

기록 기준은 하나다. **다시 만들 수 있는 것은 남기지 않는다.** 도구 출력은 명령이 있으면 다시 만들어지므로 버리고, 사용자 발화는 다시 만들 수 없으므로 원문으로 남긴다.

본문이 아니라 경로를 주입한다. 본문을 넣으면 다음 컴팩트에서 다시 요약되어 같은 손실이 반복된다.

| 항목 | 값 |
|------|-----|
| 산출물 | `~/.claude/state/compact/<세션ID>.md` (구간별 덧붙임) |
| 커서 | 같은 디렉토리의 `<세션ID>.cursor` — 이미 기록한 줄 번호 |
| 명령 상한 | 구간당 최근 120건. 단독 `cd`·`ls`·`echo` 류는 제외하되 체인이 있으면 남긴다 |
| 네트워크 | 없음. 트랜스크립트를 읽고 로컬 파일만 쓴다 |

## 훅 실행 예산

훅이 하네스 타임아웃에 잘리면 그 호출의 검사는 성립하지 않는다. 잘렸다는 사실도 남지 않아, 가드가 걸려야 할 자리에서 조용히 빠진다.

그래서 **잘리기 전에 스스로 답한다.** `pre-tool-use.mjs` 는 시작 시각 기준으로 예산을 두고 그 안에서 판정을 끝낸다.

| 예산 항목 | 값 |
|-----------|-----|
| 예산 | 1500ms (`OPS_AGENT_HOOK_BUDGET_MS` 로 덮어쓴다) |
| 하위 프로세스 타임아웃 | 남은 예산 안에서만 준다 |
| 예산 초과 시 | 판정을 포기하고 통과시키되, 검사되지 않았다는 사실을 stderr 로 남긴다 |

하위 프로세스 타임아웃을 예산에 종속시키는 이유는 합이 예산을 넘던 구간이 있었기 때문이다. 각 호출이 제 시간을 지켜도 훅 전체가 잘린다.

예산을 1500ms 로 둔 근거는 실측이다. 정상 경로 전체가 37ms 이고 그중 노드 기동이 35ms 다. git 호출은 각 11ms 다. 예산은 그 40배이므로 정상 판정을 자르지 않는다.

**미검사 통과를 통과와 같은 모양으로 두지 않는다.** 예산을 넘기는 상황은 검사 대상이 커서가 아니라 머신 경합이나 입력 지연 쪽이고, 그때 조용히 넘어가면 가드가 있었는지 없었는지 뒤에서 알 수 없다.

## 플러그인 자체 관리

SessionStart 훅이 플러그인 캐시 상태를 확인해 자동 복구합니다.

| 기능 | 동작 |
|------|------|
| git 자동 복원 | `.git` 없으면 자동 init + fetch |
| 버전 자동 동기화 | VERSION ↔ 캐시 디렉토리명 불일치 시 자동 갱신 |
| git identity 자동 설정 | 플러그인 리모트 호스트의 provider identity 로 자동 설정 |
| 구버전 정리 | 캐시 내 이전 버전 디렉토리 자동 삭제 |
