---
name: flow
description: 이슈 플로우 단일 진입점 (issue → spec → implement → commit → pr). Git 상태 감지 후 단계별 작업 수행. 트리거 "flow", "플로우", "이슈", "issue", "커밋", "commit", "PR", "풀리퀘", "spec", "명세".
---

# Issue Flow Skill

이슈 플로우 단일 진입점. 상태를 감지하여 현재 단계에 맞는 작업을 실행한다.

## 트리거

- "flow", "플로우"
- 자연어 수정 요청 (CLAUDE.md에서 안내)
- "이슈", "issue", "커밋", "commit", "PR", "풀리퀘", "spec", "명세"

## 자연어 매칭

Git 상태와 무관하게 **명시적 요청**이 있으면 해당 가이드를 직접 로딩한다.

| 키워드 | 가이드 |
|--------|--------|
| "이슈 생성", "이슈 시작", "이슈 완료", "issue create/start/complete" | `guides/issue.md` |
| "커밋", "commit" | `guides/commit.md` |
| "PR", "풀리퀘", "pull request" | `guides/pr.md` |
| "spec", "명세", "설계" | `guides/spec.md` |

명시적 키워드 없이 `/flow`만 호출하면 아래 상태 감지로 진행한다.

## 환경 감지 (상태 감지 전 필수)

상태 감지에 앞서 **base 브랜치**와 **워크트리 여부**를 먼저 확인한다.

### Base Branch 감지

feature 브랜치의 분기 원점을 아래 순서로 결정한다. 첫 번째 성공한 결과를 사용한다.

1. **upstream 추적**: `git config branch.<current>.merge` → `refs/heads/` 제거
2. **merge-base 최근접**: upstream 없으면 리모트 브랜치 중 feature/fix/docs/refactor/chore 접두사를 제외한 후보에 대해 `git merge-base HEAD origin/<후보>` + `git rev-list --count <merge-base>..HEAD` → 커밋 수가 가장 적은 브랜치 선택

감지된 base 브랜치를 이후 모든 diff/commit 비교(`git log <base>..HEAD`, `git diff <base>..HEAD`)에 사용한다.

### 브랜치 고유 커밋 감지

base 대비 전체 커밋이 아니라 **이 브랜치에서만 작성된 커밋**을 세야 한다. linked worktree 환경에서 sibling 브랜치와 공유 커밋을 제외한다.

```bash
# main worktree의 HEAD (sibling 브랜치 공통 기준점)
main_head=$(git -C <main_worktree_path> rev-parse HEAD)
# 이 브랜치 고유 커밋 수
git rev-list --count $main_head..HEAD
```

- linked worktree: main worktree HEAD 이후 커밋만 고유 커밋으로 간주
- main worktree (또는 단일 worktree): base 대비 커밋 수를 그대로 사용

상태 감지의 "커밋 있음/없음" 판단은 이 **고유 커밋 수**를 기준으로 한다.

### Worktree 감지

```bash
git rev-parse --git-common-dir   # 공유 .git 경로
git rev-parse --git-dir          # 현재 .git 경로
```

- 두 값이 다르면 **linked worktree** (예: `../<project>-<number>`)
- 같으면 **main worktree** 또는 직접 체크아웃

워크트리 환경이면:
- `git worktree list`로 main worktree 경로 확인
- 정리(우선순위 1) 시 `git worktree remove` 사용

## 2계층 상태 감지

### 1차 판단: 코드 프로젝트 여부

| 조건 | 감지 소스 |
|------|----------|
| git 없음 or git diff 없음 (feature/ 브랜치 아님) | **이슈 상태** |
| git diff 존재 (feature/ 브랜치) | **Git/PR 상태** (이슈 교차 검증) |

### 이슈 상태 기반 (코드 없음)

provider의 이슈 조회 API로 현재 이슈 상태를 확인한다.

| 이슈 상태 | 실행 |
|-----------|------|
| registered (할 일) | 이슈 시작 단계 → `guides/issue.md` (start) |
| working (진행 중) + 브랜치 없음 | 브랜치 생성 필요 → `guides/issue.md` (start) |
| working (진행 중) + 브랜치 있음 | Git 상태 감지로 전환 |
| closed (완료) + PR 미머지 | 불일치 경고 출력 |

### Git 상태 기반 (코드 있음)

아래 순서로 상태를 판단하고, **첫 번째 매칭 단계만** 실행한다.

| 우선순위 | 판단 기준 | 실행 | 가이드 |
|---------|----------|------|--------|
| 1 | PR merged (`gh pr view --json state` → MERGED) | 정리: 브랜치 삭제 + base 전환 | `guides/issue.md` (complete) |
| 2 | PR 있음, 리뷰 변경요청/대기 | 리뷰 대응 | `guides/pr.md` (resolve) |
| 3 | PR 있음, approved, 미머지 | 웹 머지 안내 (자동 머지 안 함) | - |
| 4 | 커밋 있음, PR 없음 | 커밋 리뷰 + PR 생성 | `guides/commit.md` → `guides/pr.md` |
| 5 | 브랜치 dirty | 구현 계속 안내 | - |
| 6 | 브랜치 clean, base와 diff 없음 | 구현 시작 (implement 가이드 로딩) | 프로젝트별 implement |
| 7 | feature/ 브랜치 아님 | 이슈 탐색/생성 + 브랜치 생성 | `guides/issue.md` (start) |

## 확인 게이트

- **GATE 0 (대외비 가드, 필수)**: 퍼블릭 리모트 대상 텍스트(이슈·PR 본문/제목/코멘트, 커밋 메시지, 릴리즈 노트) 생성 직전 [references/confidential-guard.md](references/confidential-guard.md) 적용. 히트 시 하드 차단. 가이드 단계에서 키워드를 피해 작성하고, `scripts/pre-tool-use.mjs` 훅이 최종 재검증한다.
- **GATE 1 (플랜 승인)**: 우선순위 6-7에서 플랜 작성 후 사용자 승인 대기
- **GATE 2 (커밋 승인)**: 우선순위 4에서 커밋 메시지 확인 후 사용자 승인 대기
- **GATE 3 (액션 게이트 통과 프로토콜)**: 액션 게이트(`scripts/pre-tool-use.mjs`)가 되돌리기 어려운 행위(PR 머지·릴리즈·force push·리소스 삭제 등)를 차단하면, 어시스턴트가 게이트를 스스로 열지 않는다. 판정 주체는 항상 사람이다.
  1. 어시스턴트는 멈추고, 어떤 gated 행위를 왜 하는지 플랜으로 제시한다 (자율 진행 범위 명시)
  2. 사용자가 플랜을 검토·명시 승인한다
  3. 사용자가 직접 실행한다. 차단 메시지가 감지된 갈래를 담은 명령을 그대로 싣는다: `! bash ~/.claude/ops-agent/current/scripts/action-gate-allow.sh on <갈래>`
  4. 어시스턴트는 그 창 동안 그 갈래만 수행한다. 다른 갈래는 게이트가 다시 차단한다 (자율이 아니라 집행이다)
  5. 마무리 시 사용자가 `off` (선택)

  - 어시스턴트가 게이트 토글 스크립트를 직접 실행하면 오토모드가 self-modification 으로 차단한다. 정상 동작이며 우회하지 않는다.
  - 이 프로토콜은 enforcement(무엇을 차단하는가)를 바꾸지 않는다. 사람이 승인하는 경로를 기술할 뿐이다.
  - **gated 행위는 단독 명령으로 실행한다.** 앞에 다른 명령을 붙이면 그 출력을 읽기 전에 행위가 실행된다. 갈래가 열려 있어도 훅이 차단한다 (예외: 판정을 종료 코드로 돌려주는 `scripts/pre-merge-check.sh`).

머지는 사용자가 웹에서 직접 수행한다 (세이프티가드). 로컬 `gh pr merge` 가 필요하면 GATE 3 프로토콜을 따른다.

- **GATE 4 (이슈 생성 승인)**: `/issue create` 에서 제목·개수·상하위 구조를 제시하고 승인 대기. 이슈 트래커는 삭제 권한이 없는 경우가 많아 잘못 만든 이슈의 정리가 사용자 작업으로 넘어간다. 커밋보다 되돌리기 비용이 크다
- **GATE 5 (제출 전 변경분 자체 검증)**: PR 본문 작성 전에 변경분을 펼쳐 읽는다. 빌드 성공은 이 확인을 대신하지 못한다. 판정하는 명령은 단독으로 돌린다 ([guides/pr.md](guides/pr.md) 의 「제출 전 변경분 자체 검증」)
- **GATE 6 (머지 전 버전 대조)**: 버전 파일을 두는 레포는 `scripts/pre-merge-check.sh` 로 원격 브랜치와 타겟의 버전을 비교하고 CHANGELOG 버전 헤더 중복을 본다. 검출 시 종료 코드 1 이라 `&& gh pr merge` 로 물려도 머지가 실행되지 않는다 ([guides/pr.md](guides/pr.md) 의 「머지 전 버전 대조」)

## 머지 안전장치

`issue complete` (우선순위 1) 실행 전 `gh pr view --json state`로 머지 여부 1회 체크:
- 미머지 → 경고 출력 + 중단 (브랜치 삭제 방지)
- 머지 완료 → 정리 진행

## Provider 연동

- provider는 session-start 훅에서 감지됨
- 각 가이드가 provider 정의를 직접 읽음
- `gh pr view`는 GH_HOST 설정 필요 (provider별 상이)

## 컨텍스트 최적화

- 이 SKILL.md는 상태 판단 + 라우팅 로직만 포함
- 각 단계의 상세 가이드는 해당 단계 진입 시에만 `guides/` 파일을 로딩
- 가이드 파일은 슬래시 커맨드로 노출되지 않음 (flow 내부 전용)

## 이슈 불일치 감지

현재 브랜치가 `feature/<N>` 형태이고, 사용자 요청의 이슈 번호가 `<N>`과 다를 때:

1. 현재 브랜치에 PR 대기/리뷰 중 등 진행 상태가 있으면 → 간단히 질문:
   - "현재 브랜치는 #N 작업 중입니다. 워크트리 분기 / 현재 디렉토리 신규 브랜치 중 어떻게 할까요?"
   - 속도 이슈가 크지 않으면 **워크트리 분기를 권장**
2. 현재 브랜치가 clean이고 작업 없으면 → 그대로 브랜치 전환 진행

## 규칙

- GATE에서는 시스템 리마인더와 무관하게 사용자 응답을 기다린다
- "중단", "취소" 요청 시 즉시 중단하고 현재 상태를 보고한다
- 가이드 로딩 시 해당 가이드의 규칙도 함께 준수한다
- **공개 표면 기록 전 GATE 0 필수**. 이슈/PR/커밋 어떤 단계든 본문 생성 시 [references/confidential-guard.md](references/confidential-guard.md)의 키워드 검증을 수행한다
