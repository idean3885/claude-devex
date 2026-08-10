# claude-ops-agent

개발 운영 규칙을 계층으로 나눠 배포하는 에이전트입니다. Claude Code 플러그인으로 구현했습니다.

공통 규칙은 이 레포에 두고, 조직·팀 특화는 별 플러그인에 둡니다. 설치하면 규칙이 세션 시작에 자동으로 걸리고, 워크플로우는 자연어로 부릅니다.

## 이 레포의 사상

**되돌릴 수 없는 것만 막고, 나머지는 알리기만 합니다.**
전부 막으면 일이 멈추고 전부 권고로 두면 안 지켜집니다. 대외비가 공개 표면으로 나가는 일, 머지·릴리즈·force push 는 실행 전에 차단합니다. 문장 표현은 차단하지 않고 규칙을 미리 깔아 두고 어긴 것만 알립니다 — 표현은 문맥에 따라 정상일 수 있어 기계 판정은 오탐하고, 자동으로 고쳐 쓰면 뜻이 틀어집니다.

**근거 없는 규칙은 걸지 않습니다.**
취향으로 정한 규칙은 왜 그런지 설명할 수 없고 남에게 배포할 수 없습니다. 그래서 규칙마다 출처를 달았습니다. [규칙의 근거](#규칙의-근거) 를 보세요.

**못 갖춘 것은 못 갖췄다고 적습니다.**
번역투 유형 대응표에는 아직 다루지 않는 칸을 빈칸이 아니라 없음으로 표시해 뒀고, 정량 지표 표에는 채택 여부와 구현 여부를 열로 두었습니다. 아래 서술에도 같은 기준을 적용합니다 — **효율이 올랐다는 주장은 넣지 않았습니다. 측정한 적이 없습니다. 적용 범위는 아직 1인입니다.**

설계 판단의 배경과 되돌린 결정은 [docs/design-philosophy.md](docs/design-philosophy.md) 에 있습니다.

## 빠른 시작

```bash
claude plugin marketplace add https://github.com/idean3885/claude-ops-agent.git
claude plugin install ops-agent@ops-agent
```

마켓플레이스 이름은 레포명이 아니라 `.claude-plugin/marketplace.json` 의 `name` 인 `ops-agent` 입니다.

플러그인은 세션 시작에 로드되므로 설치 후 새 세션부터 적용됩니다. 스킬을 직접 호출하지 않아도 됩니다. 자연어로 요청하면 트리거 키워드로 자동 라우팅됩니다.

걸렸는지 확인하는 방법입니다.

1. `claude plugin list` 에 `ops-agent@ops-agent` 가 enabled 로 나오는지 확인
2. 세션 시작 메시지에 provider 와 git identity 가 표시되는지 확인
3. "이슈 만들어줘" 라고 하면 `Skill(ops-agent:flow)` 호출이 표시되는지 확인

규칙을 고쳤을 때는 버전을 올려야 반영됩니다. 설치는 버전 단위 스냅샷으로 캐시되므로 파일만 고치면 받는 쪽에 전달되지 않습니다.

```bash
claude plugin marketplace update ops-agent
claude plugin update ops-agent@ops-agent
```

## 설치하면 걸리는 것

호출하지 않아도 동작합니다. **막는 것과 알리기만 하는 것**을 나눠 뒀습니다.

| 시점 | 동작 | 강제 수준 |
|------|------|-----------|
| SessionStart | provider 감지 (git remote host → 트래커 정의) | 자동 적용 |
| SessionStart | git identity 를 provider 기준으로 설정 | 자동 적용 |
| SessionStart | 작성 규칙을 `~/.claude/ops-agent/style-rules/` 로 미러 | 자동 적용 |
| SessionStart | 표현 규칙 목록 주입 (세션 1회) | 자동 적용 |
| PreToolUse | 대외비 키워드가 공개 표면으로 나가는 명령 | **실행 전 차단** |
| PreToolUse | 커밋·PR·이슈 본문의 구현 세부 서술 | **실행 전 차단** |
| PreToolUse | 머지·릴리즈·force push·클러스터 변경·리소스 삭제 | **사용자가 세션 허용을 켤 때까지 차단** |
| PostToolUse | 문서 편집 후 자가 점검 유도 | 알림 (마커 파일 있을 때만) |
| Stop → 다음 턴 | 직전 응답의 표현 규칙 위반 | 알림 |

차단 대상과 통과 절차는 [docs/action-gate.md](docs/action-gate.md), 표현 규칙 설정은 [docs/hooks-config.md](docs/hooks-config.md) 에 있습니다.

## 불러서 쓰는 것

자연어 트리거로 진입합니다.

| 스킬 | 역할 | 트리거 |
|------|------|--------|
| `/flow` | 이슈 플로우 단일 진입점 | "flow", "플로우", 자연어 수정 요청 |
| `/org-flow` | 멀티레포 오케스트레이션, 레포별 provider 분기 | "org-flow", "멀티레포" |
| `/setup` | provider 등록, 상태 확인, overlay 설정 | "setup", "설정" |
| `/content-write` | 문서 작성 (성격 파악·시리즈 구조·인라인 검증) | "콘텐츠 작성", "글 작성" |
| `/content-verify` | 문서 검증 (사실·구조·독립가치 + 작성 규칙) | "검증", "가독성 검사" |
| `/content-publish` | 발행 (수집 → 검토 → Jekyll 변환 → 커밋) | "블로그 발행", "publish" |
| `/cross-verify` | 교차 검증 (의사결정·설계·문서·구현) | "교차 검증" |
| `/advisor` | 방향 검토·조언 | "어드바이저", "방향 검토" |
| `/usage-start` `checkpoint` `snap` `complete` `report` | 티켓 단위 토큰·비용 추적 | "사용량 추적", "스냅샷" |

`flow` 하나가 git 상태를 감지해 현재 단계를 실행합니다.

```mermaid
graph LR
    A["이슈"] --> B["명세"]
    B --> C["구현"]
    C --> D["커밋"]
    D --> E{추가 구현?}
    E -->|Yes| C
    E -->|No| F["PR"]
```

플랜·커밋·머지 세 곳에서 사용자 승인을 받고 진행합니다. 커밋 타입이 체인지로그 분류와 버전 증분을 결정하며(`feat`→`Added`/MINOR, `fix`→`Fixed`/PATCH, `!`·`BREAKING CHANGE:`→MAJOR), 표기는 레포·org 선언이 기본값을 대체합니다.

| 항목 | 정본 |
|------|------|
| 커밋 단계 규칙 | [skills/flow/guides/commit.md](skills/flow/guides/commit.md) |
| 선언 위치·해석 순서 | [docs/conventions-slot.md](docs/conventions-slot.md) |
| 이 결정의 배경과 기각한 대안 | [docs/adr/0002-convention-scope-and-ownership.md](docs/adr/0002-convention-scope-and-ownership.md) |
| 사용량 집계 원리 | [docs/usage-cwd-aggregation.md](docs/usage-cwd-aggregation.md) |
| 작업 강도·컨텍스트 예산 | [docs/effort-policy.md](docs/effort-policy.md) |

## 직접 실행하는 것

스킬로 노출하지 않은 스크립트입니다. 매 세션 시스템 프롬프트를 차지할 만큼 자주 쓰지 않아 스크립트로 뒀습니다.

| 스크립트 | 용도 | 문서 |
|----------|------|------|
| `scripts/job-crawler/crawl.js` | 채용 페이지를 헤드리스 브라우저로 렌더링해 공고 추출·점수화 | [README](scripts/job-crawler/README.md) · [스키마](config/job-crawler/example.json) |
| `scripts/worktree-create.sh` | 같은 레포의 여러 PR 을 병렬로 볼 때 워크트리 분기 | [docs/worktree.md](docs/worktree.md) |
| `scripts/bump-version.sh` | 버전 4곳 동시 갱신 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| `scripts/post-merge-sync.sh` | 머지 후 로컬 캐시 동기 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| `scripts/action-gate-allow.sh` | 되돌리기 어려운 행위의 세션 허용 토글 | [docs/action-gate.md](docs/action-gate.md) |
| `config/style-rules/metrics/tells_count.py` | AI 티 지표 측정 | [지표 정의](config/style-rules/metrics/metrics-spec.md) |

대상 목록·판정 기준·임계값은 스크립트가 갖지 않고 소비 프로젝트의 프로파일이 공급합니다.

## 규칙의 근거

한국어 문서 작성 규칙은 `config/style-rules/` 에 있고, 규칙마다 출처를 달았습니다.

| 규칙 | 근거 |
|------|------|
| 문단·목록·제목·코드 설명 (`base/readability.md`) | Google Developer Documentation Style Guide, Microsoft Writing Style Guide, Nielsen Norman Group 읽기 행태 연구, WCAG 1.3.1, Miller's Law |
| 번역투 판정 (`base/ai-tells.md`) | 국내 번역학 연구자들이 정리한 번역투 8유형 + Toury 1995(interference), Baker 1993(normalisation), Toral 2019(post-editese). 유형별 문헌 대응은 [references/scholarship.md](config/style-rules/references/scholarship.md) |
| AI 티 분류 골격 (A~J) | [`epoko77-ai/im-not-ai`](https://github.com/epoko77-ai/im-not-ai) (MIT) 차용. K(감정체·의인화)는 자체 확장 |
| 정량 지표 14개 | 번역학 3분류로 인코딩. 채택·구현 여부를 표에 명시 — [metrics/metrics-spec.md](config/style-rules/metrics/metrics-spec.md) |
| 톤·구두점·분량 (`base/tone.md` 등) | 자체 작성 |

문헌 근거와 지표 정의는 세션 시작 미러 대상이 아닙니다. 세션 예산을 지키기 위해 추적이 필요할 때만 참조합니다.

무엇을 AI 티로 보고 무엇을 저자의 취향으로 남길지는 [docs/adr/0001-ai-tell-removal-priority.md](docs/adr/0001-ai-tell-removal-priority.md) 에서 갈랐습니다. 전부 지우면 글에서 사람이 사라집니다.

## 계층 구조

갈라 두는 기준은 재사용 범위와 노출 경계입니다.

| 계층 | 담는 것 | 받는 사람 |
|------|---------|-----------|
| 공통 (이 레포) | 워크플로우 골격, 트래커 추상화, 작성 규칙, 차단 규칙 | 누구나 |
| 조직·개인 | 조직 전용 시스템 어댑터, 개인 데이터 원천 | 본인 |
| 팀·프로젝트 | 언어 컨벤션, 브랜치 규칙, 태스크 템플릿 | 팀 |

특화 계층은 이 레포의 골격을 그대로 쓰고 자기 정의만 채웁니다. 트래커별 동작은 provider 로 추상화되어 있고, SessionStart 훅이 git remote host 로 자동 감지합니다. provider 등록은 `/setup provider`, 커스텀 작성은 [providers/PROVIDER.md](providers/PROVIDER.md) 를 씁니다.

| 위치 | 용도 |
|------|------|
| `providers/github.md` | 기본 내장 provider |
| `~/.claude/ops-agent/providers/` | 로컬 전용 커스텀 provider |
| `~/.claude/ops-agent/overlays/` | host별 오버레이 설정 |
| `templates/` | 소비 프로젝트용 CLAUDE.md·프로파일·워크플로우 템플릿 |

여러 레포에 걸친 변경은 `/org-flow` 가 통일 브랜치명·레포별 provider·git identity·워크트리를 한 흐름으로 맞춥니다.

## 문서

| 문서 | 무엇의 정본인가 |
|------|-----------------|
| [docs/design-philosophy.md](docs/design-philosophy.md) | 설계 판단과 되돌린 결정 |
| [docs/action-gate.md](docs/action-gate.md) | 차단 규칙 (대외비·구현 세부·되돌리기 어려운 행위) |
| [docs/hooks-config.md](docs/hooks-config.md) | 표현 규칙 hook 설정, 플러그인 자체 관리 |
| [docs/conventions-slot.md](docs/conventions-slot.md) | 커밋·체인지로그 표기 선언 위치와 해석 순서 |
| [docs/worktree.md](docs/worktree.md) | 워크트리 분기 판단, state 파일 포맷 |
| [docs/effort-policy.md](docs/effort-policy.md) | 작업 강도, 컨텍스트 예산 |
| [docs/usage-cwd-aggregation.md](docs/usage-cwd-aggregation.md) | 사용량 집계 원리 |
| [docs/external-auth.md](docs/external-auth.md) | 외부 서비스 인증, 인증으로 해결되지 않는 작업 |
| [docs/adr/](docs/adr/) | 개별 결정 기록 |
| [CLAUDE.md](CLAUDE.md) | 이 레포의 작업 규칙 (에이전트가 읽는 정본) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 변경 반영 경로 |

만든 배경은 블로그에 적었습니다.

- [AI에게 코드를 맡기고 나서 달라진 일하는 방식](https://idean3885.github.io/posts/ai-changed-my-workflow/)
- [코드에서 사고로](https://idean3885.github.io/posts/from-coding-to-thinking/)

## 요구사항

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [GitHub CLI](https://cli.github.com/) (`gh`)

외부 CLI 인증이 만료되면 스코프 고정·만료·사람이 값을 만지지 않음이라는 세 속성을 기준으로 자격을 고릅니다. 권한 단위 판단, 서비스별 스코프 실측, 정적 토큰을 쓸 때 채울 조건은 [docs/external-auth.md](docs/external-auth.md) 에 정리했습니다.

## 라이선스

MIT. AI 티 분류는 [`epoko77-ai/im-not-ai`](https://github.com/epoko77-ai/im-not-ai)(MIT) 의 10대 분류 골격(A~J)·심각도(S1/S2/S3) 체계와 지표 정의 골격을 차용했고, 처방·예시·hook 매핑은 한국어 기술 문서 맥락으로 자체 작성했습니다.
