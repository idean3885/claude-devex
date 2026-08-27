# claude-ops-agent

> **전부 막으면 일이 멈추고 전부 권고로 두면 지켜지지 않습니다. 되돌릴 수 없는 것만 막고 나머지는 알립니다.**

개발 운영 규칙을 계층으로 나눠 배포하는 Claude Code 플러그인입니다. 왜 그렇게 하는지를 먼저 정하고 그 판단이 반복되면 규칙으로 정리합니다. 생산성과 일관성은 목표로 두고 쓰면서 다듬어 갑니다.

## 되돌릴 수 없는 것은 사람이 판정합니다

- 대외비 유출·머지·릴리즈·force push·기본 브랜치 직접 push·리소스 삭제는 실행 전에 막습니다
- 문장 표현과 문서 구조는 막지 않고 어긴 자리만 알립니다. 기계로 판정하면 정상인 것까지 걸리고 자동으로 고치면 뜻이 틀어집니다

```
도구 실행 ─► 되돌릴 수 있나 ─┬─ 없다 ─► 차단 (사람이 허용할 때까지)
                            └─ 있다 ─► 실행 후 위반 위치 통지
```

**효과**: 승인한 행위와 통과한 행위가 어긋나는 순간을 실행 전에 잡습니다.

## 규칙은 계층으로 나눠 배포합니다

- 공통 규칙은 이 레포에 두고 조직·팀 특화는 별도 플러그인에 둡니다
- 나누는 기준은 재사용 범위와 노출 경계입니다. 한 벌로 합치면 조직 전용 정보가 공개 표면에 노출됩니다

```
공통 · 이 레포        워크플로우 골격 · 작성 규칙 · 차단 규칙
   │ 골격 상속
   ├─► 조직 · 개인    조직 전용 어댑터 · 개인 데이터 원천
   └─► 팀 · 프로젝트  언어 컨벤션 · 브랜치 규칙 · 태스크 템플릿
```

**효과**: 규칙을 한 곳에서 고치고 받는 쪽은 필요한 지점만 재정의합니다.

## 규칙은 판단이 쌓인 뒤에 생깁니다

- 교정된 대목은 후보로 전부 남기고 그중 무엇을 규칙으로 올릴지는 사람이 정합니다
- 기각한 것도 근거와 함께 남깁니다. 판정이 뒤집힐 수 있어 근거를 지우지 않습니다

```
교정 감지 ─► 후보 적립 ─► 사실·모순·일반화 판정 ─┬─ 통과 ─► 규칙 승격 ─► 다음 세션 적용
                                               └─ 기각 ─► 근거와 함께 기록
```

**효과**: 한 번 내린 판단을 다음 작업이 읽습니다 → [레슨런 자산화](docs/lessons.md)

## 글도 판단이 먼저입니다

- 착수 전에 답할 질문 한 문장·남길 결론 개수·분량 하한·상한·시각 요소 개수를 적습니다. 분량 값은 같은 유형 실측에서 나옵니다
- 신규 작성과 기존 문서 구조 변경 모두 이 게이트를 지납니다. 문장 한두 개 교정은 면제입니다

```
계획 ─► 초고 ─► 퇴고 ─► 교정
게이트          판단     규칙 대조
```

단계 이름은 국어과 교육과정의 쓰기 과정을 그대로 씁니다. 스킬 이름을 외우지 않아도 단계 이름으로 도달합니다.

**효과**: 완성 후에 공백이 드러나 재작성하는 왕복이 줄어듭니다 → [ADR 0005](docs/adr/0005-planning-gate-covers-edits.md)

## 한계와 대가

| 한계가 있는 자리 | 지금 상태 |
|------------------|-----------|
| 효과 | 효율이 올랐다는 주장은 넣지 않았습니다. 측정한 적이 없습니다 |
| 지표 | 레슨런 자산화의 지표는 항목만 정의하고 값은 비워 뒀습니다 |
| 적용 범위 | 아직 1인입니다. 팀 규모에서 검증되지 않았습니다 |
| 게이트 범위 | 세션 허용은 행위 갈래와 시간 둘로 열립니다. 승인하지 않은 갈래는 계속 차단됩니다 |
| 패턴 판정 | 표현 규칙은 정규식이라 활용형을 빠뜨리면 통과합니다 ([#285](https://github.com/idean3885/claude-ops-agent/issues/285)) |
| 차단의 성질 | 도구 경계에서 명령 문자열을 봅니다. 방어 계층이지 보안 경계가 아닙니다 |
| 훅 비용 | 도구 호출마다 훅이 붙습니다. 느린 기기에서는 지연이 보입니다 |

## 설치

```bash
claude plugin marketplace add https://github.com/idean3885/claude-ops-agent.git
claude plugin install ops-agent@ops-agent
```

새 세션부터 적용됩니다. 확인·갱신 방법과 시점별 동작은 [설치하고 쓰는 법](docs/usage.md) 에 있습니다.

## 문서

| 문서 | 무엇의 정본인가 |
|------|-----------------|
| [docs/usage.md](docs/usage.md) | 설치, 시점별 동작, 스킬·스크립트 목록. 나머지 문서 링크도 여기 |
| [docs/design-philosophy.md](docs/design-philosophy.md) | 설계 판단과 되돌린 결정 |
| [docs/action-gate.md](docs/action-gate.md) | 차단 규칙 |
| [docs/lessons.md](docs/lessons.md) | 레슨런 수집·자산화, 재발 분석 |
| [docs/adr/](docs/adr/) | 개별 결정 기록 |
| [CLAUDE.md](CLAUDE.md) · [CONTRIBUTING.md](CONTRIBUTING.md) | 이 레포의 작업 규칙과 반영 경로 |

만든 배경은 [블로그](https://idean3885.github.io/posts/ai-changed-my-workflow/)와 [후속 글](https://idean3885.github.io/posts/from-coding-to-thinking/)에 적었습니다.

## 규칙의 근거

근거 없는 규칙은 걸지 않습니다. 사람이 읽는 한국어 산문과 모델이 읽고 실행하는 문서에 같은 규칙을 걸지 않습니다. 규칙을 고칠 때 무엇을 근거로 세웠는지 되짚을 수 있게 출처를 답니다.

작성 규칙은 [`config/style-rules/`](config/style-rules/) 에 있습니다. 유형별 적용 대상·강도·분량 기준값·합격선은 [`extensions/profiles.md`](config/style-rules/extensions/profiles.md) 가 정본입니다.

| 규칙 | 근거 |
|------|------|
| 문단·목록·제목·코드 설명 | Google Developer Documentation Style Guide, Microsoft Writing Style Guide, Nielsen Norman Group 읽기 행태 연구, WCAG 1.3.1, Miller's Law |
| 번역투 판정 | 번역투 8유형 + Toury 1995(interference), Baker 1993(normalisation), Toral 2019(post-editese). 문헌 대응은 [references/scholarship.md](config/style-rules/references/scholarship.md) |
| AI 티 분류 골격 (A~J) | [`epoko77-ai/im-not-ai`](https://github.com/epoko77-ai/im-not-ai) (MIT) 차용. K 는 자체 확장 |
| 정량 지표 14개 | 번역학 3분류로 인코딩. [metrics/metrics-spec.md](config/style-rules/metrics/metrics-spec.md) |
| 에이전트가 읽는 문서 | [`mattpocock/skills`](https://github.com/mattpocock/skills) 의 `writing-for-agents` (MIT) 차용 |
| 쓰기 과정 단계 | 국어과 교육과정 쓰기 과정(계획·초고·퇴고). 기계 대조는 산문 린터(Vale·textlint) 계보 |
| 문서의 목적과 범위 | Barbara Minto 「The Pyramid Principle」, Google Technical Writing Course |
| 톤·구두점·분량 | 자체 작성 |

차용 원천의 채택 판본·항목 번호 대응·마지막 대조일은 [references/upstream.md](config/style-rules/references/upstream.md) 가 갖습니다.

무엇을 AI 티로 보고 무엇을 저자의 취향으로 남길지는 [ADR 0001](docs/adr/0001-ai-tell-removal-priority.md) 에서 정했습니다. 전부 지우면 글에서 사람이 사라집니다.

## 라이선스

MIT. 차용 원천의 라이선스와 범위는 위 표에 있습니다.
