# hook·설정 레퍼런스

README 의 [설치하면 걸리는 것](../README.md#설치하면-걸리는-것) 에서 요약한 표현 규칙 hook 의 설정 상세와 플러그인 자체 관리 동작입니다. 실행 전에 차단하는 규칙은 [action-gate.md](action-gate.md), 설계 배경은 [design-philosophy.md](design-philosophy.md) 를 참조하세요.

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

## content-verify 자동 점검

문서 편집(Edit/Write) 직후 content-verify 관점(AI 티·가독성·톤·구두점) 자가 점검을 유도하는 PostToolUse hook 입니다. 발동 조건은 둘 중 하나입니다.

| 조건 | 동작 |
|------|------|
| 프로젝트 루트(또는 상위)에 마커 파일 `.ops-agent/content-verify.json` | 마커의 `include`/`exclude`/`note` 를 적용해 작동 |
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

| 종류 | 무엇을 보나 | 구현 |
|------|-------------|------|
| 표현 검출 | em dash, AI 슬롭 어휘 | hook 내부 정규식 |
| 구조 검출 | 문단 길이·산문 연속·시각 요소 주기·목록 항목 수·테이블 열 수·헤딩 레벨·코드 언어 | `config/style-rules/metrics/readability_count.py` |

정규식은 어휘만 봅니다. 산문이 몇 문단 쌓였는지는 세어야 알 수 있어 카운터를 따로 둡니다. 검출 결과가 수치로 실려 오므로 리마인더가 "점검하라" 가 아니라 "여기가 몇이다" 가 됩니다.

카운터가 커버하는 항목과 일부러 빼놓은 항목은 `config/style-rules/base/readability.md` 의 검증 표에 있습니다.

## 플러그인 자체 관리

SessionStart 훅이 플러그인 캐시 상태를 확인해 자동 복구합니다.

| 기능 | 동작 |
|------|------|
| git 자동 복원 | `.git` 없으면 자동 init + fetch |
| 버전 자동 동기화 | VERSION ↔ 캐시 디렉토리명 불일치 시 자동 갱신 |
| git identity 자동 설정 | 플러그인 리모트 호스트의 provider identity 로 자동 설정 |
| 구버전 정리 | 캐시 내 이전 버전 디렉토리 자동 삭제 |
