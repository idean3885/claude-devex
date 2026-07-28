# hook·설정 레퍼런스

README 의 [3. 규칙 자동 적용](../README.md#3-규칙-자동-적용) 에서 요약한 hook 의 설정 상세와 플러그인 자체 관리 동작입니다. 설계 배경은 [design-philosophy.md](design-philosophy.md) 를 참조하세요.

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

## content-verify 자동 점검 (opt-in)

문서 편집(Edit/Write) 직후 content-verify 관점(AI 티·가독성·톤·구두점) 자가 점검을 유도하는 PostToolUse hook 입니다. 프로젝트 루트에 마커 파일(`.ops-agent/content-verify.json`)이 있을 때만 작동합니다.

```json
{
  "include": ["**/*.md", "resume/*.html"],
  "exclude": ["node_modules/**", "CHANGELOG.md"],
  "note": "프로젝트별 추가 안내 (선택, 리마인더에 함께 출력)"
}
```

- `include` 생략 시 기본값은 `["**/*.md"]` 입니다.
- em dash·AI 슬롭 표현은 hook 이 기계 검출해 즉시 플래그합니다.
- 도메인 특화 검증(예: 이력서 ATS·PDF 동기)은 소비 레포의 프로젝트 스코프 hook 으로 별도 구성합니다.

## 플러그인 자체 관리

SessionStart 훅이 플러그인 캐시 상태를 확인해 자동 복구합니다.

| 기능 | 동작 |
|------|------|
| git 자동 복원 | `.git` 없으면 자동 init + fetch |
| 버전 자동 동기화 | VERSION ↔ 캐시 디렉토리명 불일치 시 자동 갱신 |
| git identity 자동 설정 | 플러그인 리모트 호스트의 provider identity 로 자동 설정 |
| 구버전 정리 | 캐시 내 이전 버전 디렉토리 자동 삭제 |
