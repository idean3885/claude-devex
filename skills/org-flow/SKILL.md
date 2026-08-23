---
name: org-flow
description: 멀티레포 오케스트레이션 + 사내/퍼블릭 provider 분기. 최초 호출 시 org 셋업 마법사로 매니페스트 생성. 트리거 "org-flow", "멀티레포", "multi-repo", "/org-flow", "org 셋업".
---

# Multi-Repo Orchestration (org-flow)

멀티레포 프로젝트 오케스트레이션 + 사내/퍼블릭 provider 분기.
`ops-agent:flow`의 단일 레포 이슈 라이프사이클 위에서 동작한다.

## 트리거

이 스킬 호출 자체가 **"현재 디렉토리를 조직 작업 대상으로 취급한다"는 사용자 컨펌**이다.

조직 식별은 **원격 저장소 주소의 소유자 구간**으로 한다. 디렉토리 이름은 클론 위치·진입 경로·실행 환경에 따라 달라지므로 전제하지 않는다. 원격이 없을 때만 디렉토리 이름으로 떨어지고, 그때는 사용자에게 확인한다.

식별과 매니페스트 발견은 [`scripts/resolve-manifest.mjs`](../../scripts/resolve-manifest.mjs) 가 수행한다. commit 단계의 컨벤션 슬롯 해석과 같은 해석기를 쓴다.

- "/org-flow", "org-flow", "멀티레포", "multi-repo", "org 셋업"

## 최초 호출: 셋업 마법사

해석기를 실행해 소유자와 매니페스트를 얻는다.

```bash
node ~/.claude/ops-agent/current/scripts/resolve-manifest.mjs
```

| 출력 | 뜻 |
|------|-----|
| `manifests` | 발견된 매니페스트를 해석 순서대로 담은 목록 |
| `ownerSource` | `remote` 면 확정, `directory` 면 사용자 확인이 필요하다 |
| `notes` | 해석 실패·대체 경로 사용 사유. 비어 있지 않으면 그대로 사용자에게 보인다 |

`manifests` 가 비어 있으면 셋업 마법사로 진입한다. **`notes` 를 넘기고 조용히 기본값으로 진행하지 않는다.**

**Step 1: 단일 질문 (사내/퍼블릭 분기)**

> "`{org}` 는 사내(외부 어댑터) 인가 퍼블릭(ops-agent) 인가?"

사용자 응답에 따라 매니페스트 생성 위치 결정.

**Step 2: 매니페스트 생성**

선택한 위치에 `<org>.json` 작성. 스키마는 아래 컨벤션 참조.

외부 어댑터 분기면 해석기 출력의 `adapterRoots` 아래에 `<adapter>/orgs/` 를 만든다. 어댑터 루트는 이름을 추측하지 않고 `~/.claude/ops-agent/adapters.json` 의 선언에서 읽는다. 선언이 없으면 기본값 하나가 쓰이고, 설치 위치가 다르면 그 파일에 적는다.

```json
{ "roots": ["~/.claude/toolkits"] }
```

**Step 3: 프로젝트 로컬 매니페스트 안내**

`.ops-agent/project.json` 이 없으면 멀티레포 구조 정의를 안내한다 (repos / domains / worktreeRoot: "전제조건" 섹션 참조).

**Step 4: 셋업 종료**

이후 같은 cwd 에서 호출하면 매니페스트 로딩 후 본문 흐름으로 직접 진입한다.

## orgs/<org>.json 매니페스트 컨벤션

사내 예시 (외부 어댑터 식별자 사용):

```json
{
  "org": "<org>",
  "scope": "internal",
  "githubHost": "<internal-host>",
  "rootDir": "/path/to/<org>",
  "providers": {
    "issue": "<adapter-id>",
    "notify": "<adapter-id>",
    "dailylog": "<adapter-id>",
    "apiGuard": "<adapter-id>"
  },
  "scriptOverrides": {
    "worktreeCleanup": "<adapter-id>:scripts/<script>.sh"
  }
}
```

퍼블릭 예시 (ops-agent 내장 provider):

```json
{
  "org": "<org>",
  "scope": "public",
  "githubHost": "github.com",
  "rootDir": "/path/to/<org>",
  "providers": {
    "issue": "github"
  }
}
```

| 키 | 타입 | 설명 |
|---|---|---|
| `org` | string | GitHub 조직명 (cwd basename 과 동일) |
| `scope` | "internal" \| "public" | 사내/퍼블릭 분류. 셋업 시 결정 |
| `githubHost` | string | 사내 GHE 호스트 또는 `github.com` |
| `rootDir` | string | 프로젝트 루트 절대 경로 (매니페스트 작성 시점 기준) |
| `providers.*` | string | provider 어댑터 식별자 (선택 키, 미정의 시 fallback) |
| `scriptOverrides.*` | string | 본체 스크립트 대신 사용할 외부 경로 (선택) |
| `conventions` | object | 이 org 의 커밋·체인지로그 표기 기본값 (선택). 레포 선언이 있으면 레포가 이긴다. 스키마·해석 순서는 [docs/conventions-slot.md](../../docs/conventions-slot.md) |
| `pullMainsOnStart` | boolean | `/org-flow start` Step 2 에서 메인 클론 일괄 pull 여부 (기본 true, 메인 클론 미유지 org 는 false) |

`providers.*` 키 미정의 시 ops-agent 의 기존 host 기반 provider 자동 감지로 fallback 한다 (`providers/github.md` 등).

## provider 분기

매니페스트의 `providers.*` 키를 해석하여 어댑터를 위임 호출한다. 어댑터 구현은 외부 어댑터 플러그인 또는 ops-agent 내장 provider.

| 키 | 호출 시점 | 어댑터 책임 |
|----|---------|----------|
| `issue` | ops-agent:flow 위임 시 | 이슈 트래커 API (create/start/complete) |
| `notify` | submit 단계 PR 알림 | 메신저·웹훅 알림 발송 |
| `dailylog` | start 검증 (외부 어댑터 정의 시) | 일일 계획 항목 존재 확인 |
| `apiGuard` | ops-agent:flow 위임 전후 | API 폭주 방지 마커 set/clear |

식별자 prefix 컨벤션:

- 외부 어댑터 플러그인 측: 해당 어댑터의 네임스페이스 prefix (예: `<adapter>-<service>`)
- ops-agent 내장 / 퍼블릭 어댑터: `github`, `slack` 등

어댑터 호출 규약: `<adapter-id>` 를 키로 외부 플러그인의 동명 스킬 또는 스크립트에 위임. 위임 인터페이스는 외부 플러그인 측 가이드에서 정의한다.

## cwd resolver

워크트리 내부 또는 하위 디렉토리에서 호출되어도 부모 추적으로 매니페스트를 발견한다.

```
1. cwd → 부모 순회 (max depth 6)
2. 각 부모에서 .ops-agent/project.json 탐색
3. 각 부모에서 resolve-manifest.mjs 실행 (소유자는 그 디렉토리의 원격에서 얻는다)
4. manifests 가 비지 않은 첫 결과 사용
5. depth 6 까지 미발견 시 셋업 마법사 진입 (Step 1)
```

3번이 소유자를 원격에서 얻으므로 워크트리·하위 디렉토리·임의 클론 경로에서 모두 같은 값이 나온다.

## 역할 분담

```
ops-agent:flow   — 이슈 생성/시작/완료 (이슈 트래커 + 주 레포 브랜치)
org-flow     — 스코핑 + 관련 레포 워크트리 + 파이프라인 추적 + 커밋/PR 오케스트레이션 + provider 분기
```

| 책임 | 담당 |
|------|------|
| 이슈 생성/시작/완료 | `ops-agent:flow`: **org-flow가 직접 수행 금지** |
| 스코핑 (영향 레포 산정) | org-flow |
| 관련 레포 워크트리 생성 | org-flow (`scripts/worktree-create.sh`) |
| 파이프라인 실행 (구현/검증) | org-flow → 프로젝트 스킬 |
| 각 레포 커밋/PR | org-flow → `ops-agent:flow` commit/PR 위임 |
| 워크트리 정리 | org-flow (`scripts/worktree-cleanup.sh` 또는 매니페스트의 `scriptOverrides.worktreeCleanup`) |
| 이슈 트래커 직접 호출 | 매니페스트의 `providers.issue` 어댑터에 위임 |
| PR 알림 | 매니페스트의 `providers.notify` 어댑터에 위임 |

## 전제조건 (프로젝트 로컬 매니페스트)

프로젝트 루트에 `.ops-agent/project.json` 매니페스트가 존재해야 한다.

```json
{
  "repos": {
    "frontend": {
      "path": "frontend",
      "remote": "https://github.com/org/frontend.git",
      "base": "main",
      "role": "fe"
    },
    "backend": {
      "path": "backend",
      "remote": "https://github.com/org/backend.git",
      "base": "main",
      "role": "be"
    }
  },
  "domains": {
    "user": ["frontend", "backend"],
    "auth": ["frontend", "auth-service"]
  },
  "worktreeRoot": "worktrees"
}
```

`orgs/<org>.json` (글로벌 org 단위) 과 `.ops-agent/project.json` (프로젝트 멀티레포 구조) 은 합성되어 동작한다.

## 리모트 원소스 전략

로컬에 베이스 브랜치 디렉토리를 두지 않는다.

- 레포가 로컬에 없으면 `git clone --bare` → 워크트리 생성
- 작업 완료 후 워크트리 + bare clone 모두 삭제
- 모든 브랜치는 `origin/{base}`에서 분기 (로컬 base pull 불필요)

## 서브커맨드

### `/org-flow start {설명 또는 티켓번호}`

스코핑 → ops-agent:flow 위임 → 관련 레포 워크트리 생성.

**Step 1: 셋업 가드**

매니페스트(`orgs/<org>.json` + `.ops-agent/project.json`) 둘 다 존재해야 한다. 부재 시 셋업 마법사 진입.

**Step 2: 메인 클론 pull (사상)**

프로젝트 루트 하위에 워크트리와 별도로 메인 클론(working tree) 디렉토리를 유지하는 org 의 경우, 메인 클론은 분석 참조용이다. 작업·분석 시작 시 stale 본문은 잘못된 결론을 만들기 때문에 일괄 pull 후 진입한다.

```bash
bash scripts/pull-mains.sh <project-root>
```

스크립트 동작:
- `.ops-agent/project.json` 의 `repos.*` 순회
- working tree(`.git/` 보유) 인 레포만 처리, bare clone·미존재·워크트리 디렉토리는 skip
- 현재 브랜치 ≠ base 면 `git checkout {base}` → `git pull --ff-only`
- dirty 레포는 `dirty-skip` (자동 stash·복원 금지)
- JSON 리포트 (`status: ok` + `results[]`) 반환

`dirty-skip` 이 1건 이상이면 메인 에이전트가 사용자에게 레포명·dirty 파일 수를 보고하고 사용자 결정 (stash·커밋·그대로 진행) 대기. 자동 폐기·강제 pull 금지.

매니페스트(`orgs/<org>.json`) 에 `pullMainsOnStart: false` 가 있으면 이 단계를 건너뛴다 (기본 true). 워크트리만 두고 메인 클론을 두지 않는 org 는 false 로 설정.

**Step 3: 스코핑**

`.ops-agent/project.json` 의 `domains` 에서 영향 받는 레포를 조회한다.
주 레포 결정: 사용자 입력 또는 도메인 role 기반.

**Step 4: provider 가드 set (선택)**

매니페스트의 `providers.apiGuard` 가 정의되어 있으면 어댑터에 위임하여 API 가드 마커 설정.

**Step 5: ops-agent:flow 위임 (GATE)**

주 레포 디렉토리에서 ops-agent:flow `issue start` 호출. org-flow 가 이슈 트래커 API 를 직접 호출하지 않는다.

이슈 트래커는 매니페스트의 `providers.issue` 어댑터에 위임된다 (외부 어댑터 또는 ops-agent 내장).

위임 완료 후 검증:
- 주 레포에 `feature/{ticket}` 브랜치 존재
- 이슈 상태가 "진행 중"
- (사내) `providers.dailylog` 정의 시 일일 계획 항목 존재 확인

**Step 6: 워크트리 생성**

```bash
scripts/worktree-create.sh .ops-agent/state/org-flow-{ticket}.json
```

clone-on-demand: 레포가 없으면 bare clone → 워크트리 생성. vcs.xml 매핑 자동 추가.

**Step 7: 상태 저장**

`.ops-agent/state/org-flow-{ticket}.json`:

```json
{
  "ticket": "123",
  "taskId": "...",
  "domain": "user",
  "primaryRepo": "frontend",
  "startedAt": "2026-01-01T09:00:00+09:00",
  "repos": {
    "frontend": {
      "branch": "feature/NNN",
      "base": "main",
      "worktree": "worktrees/frontend/feature-NNN"
    }
  },
  "pipeline": [],
  "currentStage": ""
}
```

- `startedAt` 은 `scripts/worktree-create.sh` 가 start 시점에 tz-aware ISO 8601 로 1회 자동 기록한다(없을 때만). tz 를 포함하므로 finish 단계에서 tz-naive 혼합 비교가 발생하지 않는다.

**Step 8: provider 가드 clear**

`providers.apiGuard` 정의 시 가드 마커 해제.

### `/org-flow status`

관련 레포의 git 상태 + 파이프라인 진행률을 통합 조회한다.

### `/org-flow submit`

검증 → 커밋 → PR → 알림. 각 레포에서 `ops-agent:flow` commit/PR 위임.

**Step 1: 완료 게이트**

프로젝트별 완료 조건 확인 (빌드, 테스트, 린트 등).

**Step 2: 각 레포 커밋/PR**

변경 있는 레포마다 해당 레포의 `ops-agent:flow` commit → PR 위임. 커밋 메시지는 기능 변경(What) 기술.

**Step 3: PR 알림**

매니페스트의 `providers.notify` 어댑터에 위임 (외부 어댑터 또는 ops-agent 내장).

### `/org-flow finish`

머지 후 이슈 완료 + 워크트리 정리.

**Step 1: 머지 확인 (GATE)**

모든 관련 레포의 PR 머지 확인.

**Step 2: dirty 워크트리 사전 게이트 (권장)**

cleanup 은 `git worktree remove --force` + `shutil.rmtree(ignore_errors=True)` 로 untracked·modified 파일을 무조건 삭제한다. 진입 전 현재 티켓의 워크트리만 대상으로 dirty 검사 권장 (`git status --porcelain` 비어 있어야 PASS).

dirty 발견 시 finish 호출 금지: 사용자 검토 후 명시적 커밋/푸시 또는 폐기 동의 필요.

**Step 3: ops-agent:flow 위임 (GATE)**

주 레포에서 ops-agent:flow `issue complete` 호출. 매니페스트의 `providers.issue` 어댑터가 완료 처리.

위임 완료 후 검증:
- 이슈 상태가 "closed"
- 외부 어댑터 측이 추가 검증을 정의한 경우 그 어댑터에 위임 (예: 사내 트래커 의 워크플로우 클래스 검증)

**Step 4: 워크트리 정리**

```bash
# 매니페스트의 scriptOverrides.worktreeCleanup 정의 시 그 스크립트 사용
# 미정의 시 본체 scripts/worktree-cleanup.sh 사용
<cleanup-script> .ops-agent/state/org-flow-{ticket}.json
```

워크트리 제거 + bare clone 삭제 + vcs.xml 정리 + 상태 파일 삭제.

## 파이프라인 연동

프로젝트별 파이프라인은 `.ops-agent/project.json` 또는 프로젝트 CLAUDE.md 에서 정의한다.
org-flow 는 `currentStage` 를 추적하고 다음 단계를 안내한다.

## 프로젝트별 오버라이드

프로젝트 고유 동작(파이프라인 세부 단계, 프로젝트별 검증)은 프로젝트의
`.claude/skills/org-flow/SKILL.md` 에서 이 스킬을 확장한다.

ops-agent 의 org-flow 는 범용 골격이며, 프로젝트 레벨에서 매니페스트 + 로컬 SKILL 로 오버라이드할 수 있다.

## 규칙

- ops-agent:flow 위임 없이 이슈 트래커 API 를 직접 호출하지 않는다
- 워크트리 생성/정리는 스크립트로 원자 실행한다
- provider 분기는 매니페스트의 `providers.*` 키로만 결정한다 (하드코딩된 호스트 분기 금지)
- 하드코딩된 URL, 조직명, 제품명을 본체에 두지 않는다: 매니페스트로 외부화
- 매니페스트 부재 시 셋업 마법사 외 경로로 진입하지 않는다
