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

`skills/` 하위 디렉토리와 각 `SKILL.md` 의 `description` 이 정본이다.

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

타입 기본값: `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`, `perf`, `style`, `test`, `build`

커밋 타입은 체인지로그 분류와 버전 증분을 결정합니다: `feat`→`Added`/MINOR, `fix`→`Fixed`/PATCH, 그 외→`Changed`/PATCH, `!` 또는 `BREAKING CHANGE:`→`Changed`/MAJOR. 상세는 commit 단계 가이드 참조.

표기(타입 어휘·제목 형식·분류 이름)는 레포·org 가 선언하면 그 선언이 기본값을 대체합니다. 선언 위치와 해석 순서는 [docs/conventions-slot.md](docs/conventions-slot.md) 참조.

## 워크트리 분기

분기 판단:
- 같은 이슈의 단일 PR → 일반 브랜치
- 같은 레포의 여러 PR 병렬 검토 → `scripts/worktree-create.sh`
- 단발 isolation (실험·임시 빌드) → `Agent` 도구 isolation

스크립트 사용법, state 파일 포맷, 경로 컨벤션은 [docs/worktree.md](docs/worktree.md) 참조.

---

## 이 프로젝트 (claude-ops-agent)

이슈 플로우 워크플로우를 제공하는 ops-agent 플러그인입니다.

### 버전 관리

[Semantic Versioning](https://semver.org/) 기준.

1인 개발 레포이므로 변경 = 버전업이다. 예외를 두지 않는다.

체인지로그는 [Keep a Changelog 1.1.0](https://keepachangelog.com/ko/1.1.0/) 분류를 따른다. `Unreleased` 섹션은 두지 않는다: 변경을 즉시 버전업하므로 미발행 대기 구간이 없다.

**이 레포의 커밋 타입 선언**: `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`

기본값에서 `build`(빌드 단계 없음), `style`·`test`·`perf`(이력 0건)를 뺀 목록이다. `init`, `release`, `usage` 는 쓰지 않는다.

`scripts/bump-version.sh` 가 아래 4곳을 동시에 갱신한다. 수동 편집하면 4곳이 어긋나 캐시 경로 해석이 깨진다.
- `VERSION`
- `CHANGELOG.md`
- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`

```bash
./scripts/bump-version.sh <version> "<changelog_entry>" [category]
```

`category` 를 생략하면 changelog 항목의 타입 접두에서 유도한다. 유도할 수 없으면 실패하므로, 항목에 `feat:` 같은 접두를 붙이거나 카테고리를 직접 넘긴다. CHANGELOG 삽입 지점은 헤더의 앵커 주석이며, 앵커가 사라지면 스크립트가 멈춘다.

### 산출물 특성

테스트는 빈 디렉토리에 설치해서 검증한다. 빌드 단계는 없다.

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
- [ ] 스킬 파일 존재 확인 (`skills/` 전체 + `skills/flow/guides/`)
- [ ] README.md Mermaid 다이어그램 4개(한눈에·규칙 순서·이슈 플로우·계층) 렌더링 확인
- [ ] CLAUDE.md 템플릿 부분과 프로젝트 부분 구분 유지
- [ ] 적용 사례 레포에서 스킬이 정상 동작하는지 확인

### 플러그인 경량화 정책

플러그인 고도화에 따라 컨텍스트는 자연히 증가한다. 토큰을 아끼면 하나의 세션에서 더 많은 작업을 처리할 수 있으므로, **정확도를 최우선으로 하되 경량화를 추구한다.**

#### 원칙

| 순위 | 원칙 | 설명 |
|------|------|------|
| 1 | **정확도 우선** | 수정된 결과물 기준으로 정확도가 최우선 |
| 2 | **이슈 플로우** | 경량화 작업도 이슈 플로우로 진행 |
| 3 | **필요한 것만 활성화** | 프로젝트에 불필요한 플러그인은 비활성화 |
| 4 | **위임 상한** | 서브 에이전트는 값을 할 때만. 기본은 직접 처리 |

플러그인 활성화 기준, 컨텍스트 예산 의식, 작업 강도(effort) 로 토큰을 조절하는 방법은 [docs/effort-policy.md](docs/effort-policy.md) 참조.

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
