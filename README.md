# claude-ops-agent

혼자 하는 개발과 글쓰기를 제 원칙대로 처리하는 개인 AI 작업 비서입니다. Claude Code 플러그인으로 구현했습니다.

AI 에게 코드·문서를 맡기면 편하지만, 같은 요청에도 매번 다르게 답하고 어제 합의한 규칙을 오늘 잊습니다. 매번 사람이 교정하면 그 교정이 일이 됩니다. 그래서 일회성 프롬프트로 쓰는 대신, 제 판단과 규칙을 하네스에 심어 AI 가 매 세션 같은 원칙 위에서 시작하게 만들었습니다. 개발 워크플로우·글쓰기·검증을 이 비서에게 맡깁니다.

## 왜 믿고 맡기나

비서에게 일을 맡기려면 매번 같은 품질이 나와야 합니다. 그래서 네 가지를 넣었습니다.

- **출력 가드레일**: AI 특유의 표현·과장·번역투를 규칙으로 잡아내고 문서 편집마다 자가 점검을 겁니다.
- **세션 간 일관성**: 규칙을 세션 시작에 자동으로 걸어 매번 같은 상태에서 작업을 시작합니다.
- **사람 승인 게이트**: 플랜·커밋·머지를 사람이 확인한 뒤 진행합니다. 자동화하되 판단은 사람이 쥡니다.
- **쌓이는 규칙**: 작성 규칙·AI 티 분류·의사결정 기록이 자산으로 남아 비서가 제 방식으로 수렴합니다.

구현은 Claude Code 의 hook·스킬·SSOT 미러링으로 했고 왜 이렇게 만들었는지는 [docs/design-philosophy.md](docs/design-philosophy.md) 에 적었습니다. 쌓인 규칙·지식을 재사용 자산으로 관리하는 PARA 구조는 다음 방향으로 준비 중입니다.

- [AI에게 코드를 맡기고 나서 달라진 일하는 방식](https://idean3885.github.io/posts/ai-changed-my-workflow/): 이슈 플로우의 배경
- [코드에서 사고로](https://idean3885.github.io/posts/from-coding-to-thinking/): 검증·사고 도구의 배경

## 빠른 시작

```bash
claude plugins marketplace add claude-ops-agent --source git --url https://github.com/idean3885/claude-ops-agent.git
claude plugins add ops-agent@claude-ops-agent --marketplace claude-ops-agent
```

스킬을 직접 호출하지 않아도 됩니다. 자연어로 요청하면 트리거 키워드로 자동 라우팅됩니다.

## 1. 이슈·멀티레포 플로우

```mermaid
graph LR
    A["/issue"] --> B["/spec"]
    B --> C["구현"]
    C --> D["/commit"]
    D --> E{추가 구현?}
    E -->|Yes| C
    E -->|No| F["/pr"]
```

`flow` 하나가 git 상태를 감지해 현재 단계를 실행하고, 3개 게이트(플랜·커밋·머지)에서 사용자 승인을 받은 뒤 진행합니다.

| 스킬 | 역할 | 트리거 |
|------|------|--------|
| `/flow` | 이슈 플로우 단일 진입점 (위 도식) | "flow", "플로우", 자연어 수정 요청 |
| `/org-flow` | 멀티레포 오케스트레이션 + 사내/퍼블릭 provider 분기 | "org-flow", "멀티레포" |
| `/setup` | provider 등록, 상태 확인, overlay 설정 | "setup", "설정" |

- **org-flow**: 여러 레포에 걸친 변경에서 통일 브랜치명·레포별 provider·Git Identity·워크트리를 한 흐름으로 맞춥니다.
- **provider 시스템**: 이슈 트래커별 동작을 추상화하고 SessionStart 훅이 git remote host 로 자동 감지합니다. provider별 Git Identity 를 커밋 전 자동 검증·수정해, 글로벌 git config 에 의존한 계정 오류를 막습니다.
- **커밋·체인지로그 컨벤션**: 커밋 타입이 체인지로그 분류와 버전 증분을 결정합니다 (`feat`→`Added`/MINOR, `fix`→`Fixed`/PATCH, `!`·`BREAKING CHANGE:`→MAJOR). 표기(타입 어휘·제목 형식·분류 이름)는 org·repo 가 선언하면 그 선언이 기본값을 대체합니다. 사슬은 [skills/flow/guides/commit.md](skills/flow/guides/commit.md), 선언 위치·해석 순서는 [docs/conventions-slot.md](docs/conventions-slot.md), 결정 배경과 기각한 대안은 [docs/adr/0002-convention-scope-and-ownership.md](docs/adr/0002-convention-scope-and-ownership.md) 에 있습니다.

예를 들어 인증서 자동 갱신 기능은 서로 다른 두 도메인 서비스에 걸칩니다.

```
acme/                        # org = 현재 디렉토리
├── cert-service/            # 인증서 발급·갱신 도메인
└── notification-service/    # 갱신 결과 알림 도메인
```

이슈 #42 "만료 임박 인증서 자동 갱신"에서 cert-service 는 갱신 스케줄러와 발급 로직을, notification-service 는 갱신 완료·실패 알림을 맡습니다. `/org-flow "#42 인증서 자동 갱신"` 한 번이면 두 레포에 통일 브랜치(`feature/42`)로 워크트리를 격리 생성하고 레포별 provider·Git Identity 를 자동 분기한 뒤, 각 레포에서 `flow` 를 병렬로 진행합니다.

## 2. 콘텐츠 작성·검증

블로그·위키·이슈·PoC 등 한국어 문서를 작성하고 검증하는 흐름입니다.

| 스킬 | 역할 | 트리거 |
|------|------|--------|
| `/content-write` | 범용 작성 엔진 (성격 파악·시리즈 구조·인라인 검증) | "콘텐츠 작성", "글 작성" |
| `/content-verify` | 검증 (사실·구조·독립가치 + 가독성·톤·구두점·AI 티) | "검증", "가독성 검사" |
| `/content-publish` | 발행 (수집 → 비평가 검토 → Jekyll 변환 → 커밋) | "블로그 발행", "publish" |
| `/cross-verify` | 교차 검증 (의사결정·설계·문서·구현 4축) | "교차 검증" |
| `/advisor` | 방향성 검토·조언 (소비 프로젝트 방향 프로파일 + PARA 골격) | "어드바이저", "방향 검토" |

- **cross-verify**: 자동화가 아니라 개발자가 의도적으로 멈추고 확인하는 행위를 구조화한 것입니다. 도구가 측정 못 하는 의미적 판단에 집중합니다.
- **advisor**: 엔진은 방향 렌즈와 방법론 골격(PARA)만 담고, 실제 방향·데이터는 소비 프로젝트가 자기 스코프에 채웁니다. 산출물을 선언된 방향·렌즈로 비판(review)하거나 성장 방향 대비 다음 액션을 조언(advise)합니다.
- **스타일 룰(SSOT)**: 모든 한국어 문서에 적용되는 작성 단일 출처입니다. base(공통) + extensions(유형별) 구조로, SessionStart hook 이 `~/.claude/ops-agent/style-rules/` 로 미러링해 외부 소비자가 참조합니다.

```
config/style-rules/
├── base/         # ai-tells · readability · tone · punctuation
└── extensions/   # blog · wiki · poc · issue · dailylog · peer-review · work-review …
```

## 3. 규칙 자동 적용

작성 원칙과 워크플로우 규칙을 세 시점에 겁니다. 시점마다 막는 실수가 다릅니다.

| hook | 시점 | 동작 |
|------|------|------|
| `forbidden-words-prompt.sh` | UserPromptSubmit | 금지 표현 룰을 사전 주입 |
| `forbidden-words-stop.sh` | Stop | 직전 응답 위반을 다음 턴에 통지 |
| `content-verify-posttool.sh` | PostToolUse(Edit/Write) | 문서 편집 후 자가 점검 유도 (opt-in) |
| `pre-tool-use.mjs` | PreToolUse | 퍼블릭 표면으로 가는 대외비 키워드 하드 차단 |

표현 가드는 응답을 막거나 자동으로 고쳐 쓰지 않고, 사전 주입 + 사후 통지로 동작합니다. 출력 직전 자가 대조는 어시스턴트의 몫입니다. 룰 포맷·마커 스키마 등 설정 상세는 [docs/hooks-config.md](docs/hooks-config.md).

## 4. 채용 공고 크롤링 엔진

SPA 채용 페이지를 헤드리스 Chromium 으로 렌더링해 공고를 추출하고, 룰로 점수를 매겨 마크다운 리포트를 냅니다. 대상 목록·판정 기준·임계값·출력 경로는 엔진이 갖지 않고 소비 프로젝트의 프로파일이 공급합니다.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/job-crawler/crawl.js --profile config/job-crawler/mine.json
```

스킬이 아니라 스크립트로 둔 이유는 매 세션 시스템 프롬프트를 차지할 만큼 자주 쓰는 도구가 아니어서입니다. 스키마는 [config/job-crawler/example.json](config/job-crawler/example.json), 사용법·한계는 [scripts/job-crawler/README.md](scripts/job-crawler/README.md).

## Usage Tracking

ticket 단위로 토큰·비용을 추적합니다. worktree-per-task 환경에서 정확히 분리됩니다. `/usage-start · checkpoint · snap · complete · report` 5종을 제공하며, 집계 원리는 [docs/usage-cwd-aggregation.md](docs/usage-cwd-aggregation.md) 를 참조하세요.

## 로컬 개발

변경은 워크트리에서 작업하고 PR 로 머지합니다. main 직접 push 는 하지 않습니다.

```bash
git worktree add ../claude-ops-agent-{타입}-{번호} -b {타입}/{번호} origin/main
./scripts/bump-version.sh <version> "<변경 설명>"   # VERSION·CHANGELOG·plugin.json·marketplace.json 동시 갱신
# 커밋 → 브랜치 push → PR → 웹 머지
./scripts/post-merge-sync.sh                        # 머지 후 로컬 캐시 동기
```

체인지로그 분류는 변경 설명의 타입 접두에서 유도하며, 유도할 수 없으면 4곳을 갱신하기 전에 멈춥니다. 버전은 [Semantic Versioning](https://semver.org/lang/ko/), 체인지로그는 [Keep a Changelog 1.1.0](https://keepachangelog.com/ko/1.1.0/) 을 따릅니다.

## 요구사항

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- [GitHub CLI](https://cli.github.com/) (`gh`)

## 라이선스

MIT. AI 티 분류는 [`epoko77-ai/im-not-ai`](https://github.com/epoko77-ai/im-not-ai)(MIT) 의 10대 분류 골격(A~J)·심각도(S1/S2/S3) 체계를 차용했고, 처방·예시·hook 매핑은 한국어 기술 문서 맥락으로 자체 작성했습니다.
