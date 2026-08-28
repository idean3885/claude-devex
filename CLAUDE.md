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

일반 구현·문서 작업에는 별도 검증 단계를 두지 않는다. 되돌리기 어려운 행위(대외비 노출, 머지, 릴리즈)를 막는 차단은 검증 단계가 아니라 안전장치이므로 그대로 유지한다.

## 다이어그램

| 용도 | 도구 |
|------|------|
| 플로우, 시퀀스, 구조도 | Mermaid (README 임베딩) |
| 클래스, ERD 등 상세 | PlantUML + SVG |

PlantUML 사용 시: `example.puml` → `example.svg` 필수 생성

구조를 그릴 때는 **어느 레벨인지 먼저 정한다.** 레벨 선택·정지 조건·다이어그램 자립 조건은 [config/style-rules/extensions/architecture.md](config/style-rules/extensions/architecture.md) 가 정본이다.

렌더 결과를 확인하지 않은 다이어그램은 넘기지 않는다. 선이 상자를 관통하거나 라벨이 겹치는 결함은 소스에서 보이지 않는다.

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

**변경은 `Unreleased` 에 쌓고, 버전은 사용자가 끊을 때 올린다.** PR 하나마다 올리지 않는다.

커밋마다 올리면 버전 번호가 변경 덩어리를 가리키지 못한다. 실제로 67일 동안 208번 올렸고 하루 19번인 날이 있었다. 「8.7.0 에서 8.7.2 로 올리면 무엇이 달라지나」에 답할 수 없으면 번호만 늘어난 것이다 (#409).

체인지로그는 [Keep a Changelog 1.1.0](https://keepachangelog.com/ko/1.1.0/) 을 따른다. 그 규격이 `Unreleased` 를 권하는 근거는 릴리즈 시점의 작성 부담 제거, 다음 버전 예고, 몰아 쓰지 않기, 워크플로 편입 넷이다.

항목은 사용자에게 보이는 영향이 있을 때만 적는다. `refactor` 와 `chore` 는 기본 제외이고, 영향이 있으면 카테고리를 직접 지정해 넣는다. `docs` 는 통과다. 이 레포는 규칙 문서 자체가 제품이다.

**이 레포의 커밋 타입 선언**: `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`

기본값에서 `build`(빌드 단계 없음), `style`·`test`·`perf`(이력 0건)를 뺀 목록이다. `init`, `release`, `usage` 는 쓰지 않는다.

`scripts/bump-version.sh` 가 두 서브커맨드로 나뉜다.

```bash
./scripts/bump-version.sh add "<changelog_entry>" [category]   # 작업 때마다
./scripts/bump-version.sh release <version>                    # 사용자가 끊을 때
```

| 서브커맨드 | 하는 일 |
|---|---|
| `add` | `CHANGELOG.md` 의 `Unreleased` 에 항목만 쌓는다. 버전 파일은 건드리지 않는다 |
| `release` | `Unreleased` 를 버전 섹션으로 끊고 아래 4곳을 함께 갱신한다 |

`release` 가 갱신하는 4곳이다. 수동 편집하면 어긋나 캐시 경로 해석이 깨진다.

- `VERSION`
- `CHANGELOG.md`
- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`

`add` 는 넷을 거부한다. em dash, 이슈 번호 없음, `refactor`·`chore` 무지정, 카테고리를 유도할 수 없는 항목이다. `category` 를 생략하면 타입 접두에서 유도하고 본문에서 그 접두를 걷는다. 분류 헤딩이 이미 접두의 역할을 하기 때문이다.

`release` 는 `Unreleased` 가 비어 있으면 멈춘다. CHANGELOG 삽입 지점은 헤더의 앵커 주석이며, 앵커가 사라지면 스크립트가 멈춘다.

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

반영 경로: 워크트리 → `bump-version.sh add` → 커밋 → PR → 웹 머지. main 직접 push 는 하지 않는다. 릴리즈는 별도이고 사용자가 시점을 정한다.

로컬 `gh pr merge` 를 쓸 때는 `./scripts/pre-merge-check.sh <브랜치> main` 을 앞에 물린다. 브랜치가 타겟보다 오래된 베이스 위에 있으면 머지가 버전을 뒤로 밀어낸다. 검출 시 종료 코드 1 이라 `&&` 체인이 멈춘다. 한시 권한 대상 행위를 다른 명령과 한 블록에 두면 훅이 차단한다 (ADR 0011).

머지 후 `./scripts/post-merge-sync.sh` 로 로컬 캐시를 맞춘다 (마켓플레이스 update + 활성 세션 경로 복원).

작업 단위는 이슈 하나당 자식 PR 하나로 나눈다. 여러 이슈를 한 PR 에 담아야 할 때는 파일 충돌 경계를 기준으로 묶고, PR 을 스택 구조로 쌓아 순차 머지한다.

### 변경 시 검증 체크리스트

- [ ] **`Unreleased` 적립**: `bump-version.sh add` 로 항목을 쌓았는지 확인. PR 에서 버전은 올리지 않는다
- [ ] **릴리즈 시**: `bump-version.sh release` 로 VERSION, CHANGELOG.md, plugin.json, marketplace.json 4곳 갱신 확인
- [ ] 스킬 파일 존재 확인 (`skills/` 전체 + `skills/flow/guides/`)
- [ ] 다이어그램 확인. README 는 아스키 플로우만 쓴다 (mermaid 0장). `docs/usage.md` 의 mermaid 1장은 렌더 확인
- [ ] **`config/style-rules/` 를 고쳤으면 절 번호와 배치 순서가 맞는지 확인** (규칙을 번호로 참조하므로 순서가 어긋나면 새 규칙을 넣을 자리가 정해지지 않는다)
  ```bash
  python3 -c "
  import re,glob,io
  from collections import defaultdict
  for p in sorted(glob.glob('config/style-rules/**/*.md',recursive=True)):
      g=defaultdict(list)
      for l in io.open(p,encoding='utf-8'):
          m=re.match(r'^#{2,3} ([A-Z]{1,3})[-]?(\\d+)[\\.\\s]', l)
          if m: g[m.group(1)].append(int(m.group(2)))
      for k,v in g.items():
          if v!=sorted(v): print(p,k,v)
  "
  ```
- [ ] **`scripts/pre-tool-use.mjs` 를 고쳤으면 자체 점검을 돌린다** (차단은 발동할 때만 존재가 드러나므로 무력화되면 신호가 없다)
  ```bash
  node scripts/selftest-action-gate.mjs
  ```
- [ ] CLAUDE.md 템플릿 부분과 프로젝트 부분 구분 유지
- [ ] 적용 사례 레포에서 스킬이 정상 동작하는지 확인

### 웹 리뷰 범위

머지 전에 변경분을 전수로 읽지 않는다. 레포가 커지면서 규칙 문구 교정이나 용어 통일처럼 기계가 판정한 변경까지 사람이 한 줄씩 읽게 됐고, 그렇게 읽는 눈은 정작 봐야 할 곳에서 이미 지쳐 있다.

읽어야 잡히는 것만 사람이 본다.

| 보는 것 | 이유 |
|---|---|
| `README.md` | 레포의 정체와 진입점. 문구 하나가 첫인상을 정한다 |
| `docs/adr/` 와 `docs/` 의 설계 문서 | 결정과 근거가 담긴다. 뒤집는 비용이 크다 |
| `CLAUDE.md` | 작업 규칙의 정본 |

나머지는 기계가 본다. 스킬 문구 교정·규칙 문서 표현·스크립트 주석이 여기 해당한다.

| 대신 보는 것 | 대상 |
|---|---|
| 위 체크리스트의 자체 점검 | 절 번호 순서 · 버전 4곳 동기 · 차단 판정 |
| 표현 가드 hook | 금지 표현 · AI 티 |
| `pre-merge-check.sh` | 버전 역행 · CHANGELOG 헤더 중복 |

범위 밖에서 사고가 나면 범위를 넓히지 말고 **그것을 잡는 검사를 만든다.** 넓히면 다시 전수로 돌아간다.

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
