# CLAUDE.md

AI 기반 프로젝트 협업 가이드 (범용)

## 작업 방식

**AI-Native Development (Spec-Driven Workflow)**

```
spec(Markdown) → implement(AI) → review → commit → PR → merge
```

마크다운 명세를 기반으로 AI 에이전트가 구현하며, 커밋/푸시는 사용자 검토 후에만 수행합니다.

## Git Flow

브랜치 전략, 작업 플로우 상세는 각 스킬 호출 시 안내됩니다.

> 브랜치명은 provider 정의에 따른 패턴을 사용한다. 기본값: `{타입}/{이슈번호}`.

### 커밋 전 필수 확인

- [ ] 변경 파일 목록 확인
- [ ] 커밋 메시지 사용자 승인
- [ ] 브랜치 확인

## 이슈 플로우 (Issue Flow)

```
Issue → Spec → Implement → Commit → PR
```

이슈 하나의 생애주기를 관리하는 플로우입니다.
수정 요청을 자연어로 받은 경우, `/flow` 스킬로 전체 플로우를 안내한다.

### Provider 시스템

이슈 트래커별 동작을 provider로 추상화합니다.

| 위치 | 용도 |
|------|------|
| `providers/github.md` | 기본 내장 provider (GitHub) |
| `providers/PROVIDER.md` | 커스텀 provider 작성 템플릿 |
| `~/.claude/ops-agent/providers/` | 로컬 전용 커스텀 provider |
| `~/.claude/ops-agent/overlays/` | host별 오버레이 설정 |

provider는 SessionStart 훅에서 git remote host 기반으로 자동 감지됩니다.

### 스킬 목록

| 스킬 | 역할 | 트리거 |
|------|------|--------|
| `/flow` | 이슈 플로우 단일 진입점 (issue → spec → 구현 → commit → pr) | "flow", "플로우", 자연어 수정 요청 |
| `/org-flow` | 멀티레포 오케스트레이션 + 사내/퍼블릭 provider 분기 | "org-flow", "멀티레포" |
| `/setup` | provider 등록, 상태 확인, overlay 설정 | "setup", "설정" |
| `/content-write` | 콘텐츠 작성 엔진 (성격 파악, 시리즈 구조, 인라인 검증) | "콘텐츠 작성", "글 작성" |
| `/content-verify` | 마크다운 검증 (AI 티·가독성·톤·구두점) | "검증", "가독성 검사" |
| `/content-publish` | 블로그 발행 (Jekyll 변환) | "블로그 발행", "publish" |
| `/cross-verify` | 교차 검증 (의사결정·설계·문서·구현 4축) | "교차 검증", "크로스 체크" |
| `/usage-*` | ticket 단위 토큰·비용 추적 (start/checkpoint/snap/complete/report) | "사용량 추적", "스냅샷" |

issue · spec · commit · pr 은 별도 스킬이 아니라 `/flow` 내부의 단계 가이드(`skills/flow/guides/`)로 통합되어 있다. 단계 진입 시에만 로딩된다.

## 핵심 규칙

1. **명세 우선**: 코드 작성 전 명세 문서 먼저
2. **사용자 승인**: 커밋/푸시는 사용자 요청 시에만
3. **동기화 유지**: 문서와 코드는 항상 일치

## 검증

교차 검증은 새로운 기준이나 규칙을 세울 때, 아키텍처를 결정할 때 적용한다. 근거 유효성, 범주 오류, 실무 적용성을 다시 본다.

일반 구현·문서 작업에는 별도 검증 단계를 두지 않는다. 되돌리기 어려운 행위(대외비 노출, 머지, 릴리즈)를 막는 게이트는 검증 단계가 아니라 안전장치이므로 그대로 유지한다.

## 다이어그램

| 용도 | 도구 |
|------|------|
| 플로우, 시퀀스, 구조도 | Mermaid (README 임베딩) |
| 클래스, ERD 등 상세 | PlantUML + SVG |

PlantUML 사용 시: `example.puml` → `example.svg` 필수 생성

## 커밋 컨벤션

`/flow` 의 commit 단계에서 커밋 컨벤션이 자동 적용됩니다.

타입: `init`, `feat`, `fix`, `docs`, `refactor`, `chore`

## 설정 파일

| 파일 | 범위 | Git |
|------|------|-----|
| `.claude/settings.json` | 공통 설정 | 추적 |
| `.claude/settings.local.json` | 로컬 전용 | 무시 |
| `.claude/skills/` | 워크플로우 스킬 | 추적 |

## 프로젝트별 커스텀

프로젝트 전용 설정이 필요하면:

- `CLAUDE.md` 하단에 프로젝트 고유 규칙 추가
- `README.md`에 기술 스택, 디렉토리 구조, 실행 방법 등 작성
- `.claude/settings.local.json`에 로컬 전용 설정 추가

## 워크트리 분기

여러 브랜치를 동시에 작업하거나 같은 레포의 다른 PR 을 병렬로 검토할 때 워크트리를 분기한다.

| 자원 | 위치 | 비고 |
|------|------|------|
| 워크트리 생성 | `scripts/worktree-create.sh <state-file>` | clone-on-demand + 워크트리 일괄 생성 + vcs.xml 매핑 |
| 워크트리 정리 | `scripts/worktree-cleanup.sh` | bare clone 포함 정리 |
| state 파일 포맷 | `.ops-agent/state/org-flow-{ticket}.json` | 경로 컨벤션 (이름 잔재, 리네임은 별 이슈) |
| 하네스 자체 워크트리 | Claude Code `Agent` 도구의 `isolation: "worktree"` | 단발 isolation 작업용 — 위 스크립트와 무관 |

분기 판단:
- 같은 이슈의 단일 PR → 일반 브랜치
- 같은 레포의 여러 PR 병렬 검토 → `scripts/worktree-create.sh`
- 단발 isolation (실험·임시 빌드) → `Agent` 도구 isolation

`.ops-agent/state/` 경로명은 이전 자산 호환을 위해 유지한다. 추후 `.ops-agent/state/` 로 리네임할 가능성이 있으며 별 이슈로 추적한다.

---

## 이 프로젝트 (claude-ops-agent)

이슈 플로우 워크플로우를 제공하는 ops-agent 플러그인입니다.

### 버전 관리

[Semantic Versioning](https://semver.org/) 기준:

| 버전 | 증가 조건 | 예시 |
|------|-----------|------|
| MAJOR (x.0.0) | 하위 호환 깨지는 변경 | 스킬 삭제, 인터페이스 변경 |
| MINOR (0.x.0) | 하위 호환 새 기능 추가 | 새 스킬 추가, 기존 스킬 기능 확장 |
| PATCH (0.0.x) | 하위 호환 버그 수정 | 오타 수정, 동작 변경 없는 문서 정리 |

**버전업은 모든 변경에 필수이며 예외 없음.**
1인 개발 레포이므로 변경 = 버전업이다.

변경 시 반드시 `scripts/bump-version.sh`를 사용하여 아래 4곳을 **동시에** 업데이트한다:
- `VERSION`
- `CHANGELOG.md`
- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`

```bash
./scripts/bump-version.sh <version> "<changelog_entry>"
```

**수동 버전 범프 금지.** 반드시 스크립트를 사용한다.

### 산출물 특성

| 구분 | 내용 |
|------|------|
| 주요 산출물 | 마크다운 (스킬, 가이드), 쉘 스크립트 |
| 빌드 | 없음 |
| 테스트 | 빈 디렉토리에서 설치하여 검증 |

### Git Flow (이 레포)

```
main ────────────────●─────
       \            /
        feature/12 ─
```

- `develop` 브랜치 없음 (소규모 도구 레포)
- PR 타겟: `main` 직접
- 이슈 플로우 동일 적용: `/flow` 단일 진입 (issue → spec → 구현 → commit → pr)

반영 경로: 워크트리 → `bump-version.sh` → 커밋 → PR → 웹 머지. main 직접 push 는 하지 않는다.

머지 후 `./scripts/post-merge-sync.sh` 로 로컬 캐시를 맞춘다 (마켓플레이스 update + 활성 세션 경로 복원).

작업 단위는 이슈 하나당 자식 PR 하나로 나눈다. 여러 이슈를 한 PR 에 담아야 할 때는 파일 충돌 경계를 기준으로 묶고, PR 을 스택 구조로 쌓아 순차 머지한다.

### 변경 시 검증 체크리스트

- [ ] **버전 범프**: VERSION, CHANGELOG.md, plugin.json, marketplace.json 4곳 모두 갱신 확인
- [ ] 스킬 파일 존재 확인 (flow, org-flow, setup, content-write/verify/publish, cross-verify, usage-* + flow guides: issue/spec/commit/pr)
- [ ] README.md Mermaid 다이어그램 렌더링 확인
- [ ] CLAUDE.md 템플릿 부분과 프로젝트 부분 구분 유지
- [ ] 적용 사례 레포에서 스킬이 정상 동작하는지 확인

### 플러그인 경량화 정책

플러그인 고도화에 따라 컨텍스트는 자연히 증가한다. 토큰을 아끼면 하나의 세션에서 더 많은 작업을 처리할 수 있으므로, **정확도를 최우선으로 하되 경량화를 추구한다.**

#### 원칙

| 순위 | 원칙 | 설명 |
|------|------|------|
| 1 | **정확도 우선** | 수정된 결과물 기준으로 정확도가 최우선 |
| 2 | **이슈 플로우 필수** | 경량화 작업도 반드시 이슈 플로우를 통해 진행 |
| 3 | **필요한 것만 활성화** | 프로젝트에 불필요한 플러그인은 비활성화 |
| 4 | **위임 상한** | 서브 에이전트는 값을 할 때만. 기본은 직접 처리 |

#### 플러그인 활성화 기준

| 판단 | 조건 |
|------|------|
| **활성화** | 매 세션 도구를 실제로 사용하는 플러그인 |
| **비활성화** | 시스템 프롬프트만 차지하고 간헐적으로만 사용하는 플러그인 |
| **재검토** | 3세션 연속 미사용 시 비활성화 검토 |

#### 컨텍스트 예산 의식

- 플러그인이 추가하는 시스템 프롬프트 토큰을 인지할 것
- 매 턴 고정 비용이 큰 플러그인(1만 토큰 이상)은 ROI를 검증할 것
- 같은 텍스트를 여러 턴·여러 도구 호출에 반복해 싣지 않을 것. 정적인 내용은 세션 1회, 변하는 내용만 그때그때
- MEMORY.md는 200행 이내, 핵심 패턴만 유지

작업 강도(effort) 로 토큰을 조절하는 방법은 [docs/effort-policy.md](docs/effort-policy.md) 참조.

#### 서브 에이전트 위임 상한

기본값은 직접 처리다. 위임은 값을 할 때만 한다.

| 상황 | 판단 |
|------|------|
| 몇 번의 도구 호출로 끝나는 일 | 직접 처리 |
| 자기 결과 검증·재확인 | 위임하지 않음. 검증 목적 위임은 비용만 늘린다 |
| 하나로 되는 일 | 하나만. 여럿 띄우지 않는다 |
| 넓은 다중 파일 조사 등 실제로 독립적이고 규모 있는 작업 | 위임 |

위임할 때는 결과 요약만 메인 컨텍스트에 반영한다.

`agents/cross-verifier.md`·`agents/advisor.md` 의 "결과가 사용자에게 보이지 않으니 호출자가 즉시 전달한다" 안내는 하네스 동작 사실이므로 유지한다.

### 스킬 변경 규칙

스킬 파일은 이 레포의 **제품**입니다.

- 스킬 변경 시 적용 사례 레포에도 동기화
- 범용성 유지: 특정 프로젝트에 종속되는 내용 금지
- `/spec` 단계에서 스킬 변경 명세를 먼저 작성
