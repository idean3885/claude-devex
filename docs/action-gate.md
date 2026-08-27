# 차단 규칙 레퍼런스

`scripts/pre-tool-use.mjs` (PreToolUse hook) 가 실행 전에 막는 세 가지 규칙의 정본입니다. 표현 규칙처럼 알리기만 하는 hook 은 [hooks-config.md](hooks-config.md) 에 있습니다.

이 hook 은 판정만 합니다. 세션 컨텍스트 주입은 `scripts/session-start.mjs` 가 맡습니다.

| 규칙 | 막는 것 | 해제 |
|------|---------|------|
| 대외비 가드 | 공개 표면으로 나가는 대외비 키워드·패턴 | 본문 수정 (해제 플래그는 오탐 조정용) |
| 도메인 What 가드 | 커밋·PR·이슈 본문의 구현 세부 | 본문 수정 |
| 액션 게이트 | 되돌리기 어려운 행위 | 사용자가 세션 허용을 켠다 |

---

## 대외비 가드

검사 대상은 공개 표면으로 나가는 쓰기 명령입니다.

| 명령 | 검사 대상 |
|------|-----------|
| `gh issue` / `gh pr` / `gh release` | 제목·본문·코멘트 |
| `git commit` | 커밋 메시지 + **커밋 대상 diff 의 추가된 줄** |

삭제된 줄은 검사하지 않습니다. 대외비를 제거하는 커밋이 자기 가드에 막히는 모순을 피합니다.

### 검사 시점을 커밋으로 잡은 이유

파일 편집 시점에는 그 파일이 어디로 갈지 알 수 없습니다. gitignore 대상일 수도, 사내 레포일 수도 있습니다. 커밋 시점에는 리모트로 표면을 판정할 수 있고, 추적 대상만 diff 에 올라 로컬 전용 파일이 자연히 제외됩니다. 편집마다가 아니라 커밋당 1회만 돌아 비용도 낮습니다.

편집 시점 검사보다 늦지만 발행 전입니다.

### 표면 셋

호스트만 보면 둘로 갈라져 비공개 저장소가 공개 표면으로 오판됩니다. 그래서 셋으로 나눕니다.

| 표면 | 판정 | 적용 규칙 |
|------|------|-----------|
| `internal` | 사내 호스트 (`internalHosts` 매칭) | `keywords` + `patterns` + `personalDevOnly` |
| `public` | 사내 호스트 아님 + 공개 확인 | `keywords` + `patterns` + `externalOnly` |
| `private` | 사내 호스트 아님 + 비공개 확인 | `keywords` + `patterns` |

두 방향을 같은 강도로 막습니다. 사내 용어가 공개 표면으로 나가는 것은 대외비 위반이고, 개인 환경 흔적이 사내 공유 표면에 드러나는 것도 막습니다.

호스트 인식은 `gh` 명령이면 `GH_HOST` 환경 변수 또는 `-R host/owner/repo` 플래그에서, `git commit` 이면 현재 레포의 origin 리모트에서 가져옵니다. 공개 여부는 `gh repo view` 로 확인해 7일 캐시하고, **조회가 실패하면 public 으로 닫습니다.**

### 키워드 소스

`~/.claude/ops-agent/confidential-keywords.local.json` 이 정본입니다. 스키마와 작성 예시는 [`templates/confidential-keywords.example.json`](../templates/confidential-keywords.example.json) 에 있습니다.

| 항목 | 적용 표면 |
|------|-----------|
| `keywords` / `patterns` | 전 표면 |
| `externalOnly` | public 만 |
| `personalDevOnly` | internal 만 |
| `allowPaths` | 커밋 diff 검사에서 제외할 경로 정규식 |

키워드는 문자열 또는 `{ value, wordBoundary, ignoreCase }` 객체로 씁니다.

- `wordBoundary`: ASCII 3글자 이하면 기본 켜집니다. 다른 식별자 안에 묻힌 등장을 히트로 세지 않습니다.
- `ignoreCase`: 기본 꺼져 있습니다. 켜면 표기형을 따로 등록하지 않아도 됩니다.
- 경계 문자 집합에 한글은 넣지 않습니다. 넣으면 조사가 붙은 정상 등장이 통과해 못 잡습니다. 한글만으로 된 키워드에는 경계 옵션이 듣지 않으므로, 오탐이 나면 목록에서 뺍니다.

레포 안에 실제 키워드를 두지 않습니다. 설정 파일은 홈 디렉토리에만 둡니다.

---

## 도메인 What 가드

커밋·풀리퀘스트·이슈 본문이 "무엇이 달라지는가" 대신 구현 방법을 적는 것을 막습니다. 룰 정본은 `scripts/what-guard-rules.mjs` 이고, 다른 트래커를 쓰는 소비자도 같은 모듈을 불러 씁니다. 룰이 호출부마다 복제되면 같은 본문이 경로에 따라 통과와 차단으로 갈립니다.

| 룰 | 탐지 대상 |
|----|-----------|
| `hexagonal-classname` | `Port`·`Adapter`·`UseCase`·`Service`·`Repository` 등으로 끝나는 클래스명 |
| `annotation` | Spring·Lombok·Jakarta 계열 어노테이션 |
| `tx-phase-const` | 트랜잭션 phase·propagation 상수 |

구현 방법은 본문 최하단 `How` 절에만 씁니다. 형식은 provider 의 풀리퀘스트 템플릿을 따릅니다.

---

## 액션 게이트

되돌리기 어렵거나 외부에 영향이 가는 행위를, 사용자가 그 세션에 허용하기 전까지 막습니다. 목적은 어시스턴트가 권한을 추측해 실행하는 사고를 막는 것입니다.

### 대상

| 분류 | 명령 | 대상 동작 |
|------|------|-----------|
| 레포 | `gh pr merge` | 머지 |
| 레포 | `gh release` | `create` · `edit` · `delete` |
| 레포 | `gh repo` | `delete` · `archive` |
| 레포 | `git push` | `--force` · `--force-with-lease` · `-f` · `--delete` · 삭제 refspec |
| 클러스터 | `kubectl` | `apply` `patch` `replace` `delete` `edit` `scale` `annotate` `label` `set` `cordon` `drain` `uncordon` `taint` `rollout` `create` `expose` `autoscale` `run` `exec` `cp` `attach` `certificate` |
| 클러스터 | `argocd app/proj/repo/cluster/account/admin` | `create` `delete` `set` `unset` `sync` `rollback` `patch` `add` `rm` `terminate-op` `actions` `update-password` |
| 클러스터 | `helm` | `install` `upgrade` `uninstall` `delete` `rollback` |

명령은 체인 세그먼트(`&&` `||` `;` `|` 개행)로 나눠 각각 판정하고, 앞에 붙은 환경 변수 할당과 `sudo` 는 떼고 봅니다.

### 통과 절차

어시스턴트가 게이트를 스스로 열지 않습니다. 판정 주체는 항상 사람입니다.

1. 어시스턴트는 멈추고, 어떤 행위를 왜 하는지 플랜으로 제시한다
2. 사용자가 플랜을 검토하고 승인한다
3. 사용자가 직접 실행한다. 차단 메시지가 **감지된 갈래를 담은 명령**을 그대로 제시한다
4. 어시스턴트는 그 창 동안 그 갈래만 수행한다. 다른 갈래는 다시 차단된다
5. 마무리할 때 사용자가 `off` (선택)

```bash
! bash ~/.claude/ops-agent/current/scripts/action-gate-allow.sh on repo-merge
```

어시스턴트가 이 스크립트를 직접 실행하면 자기 수정으로 차단됩니다. 정상 동작이며 우회하지 않습니다.

세션 허용은 환경 변수 `OPS_AGENT_ACTION_GATE_ALLOW=1` 또는 마커 파일(`~/.claude/ops-agent/.cache/action-gate-allow.json`, 만료 시각·허용 갈래·세션 바인딩을 가짐)로 판정합니다.

#### 갈래

시간만으로 열면 그 창 안에서 승인 대상이 아니던 행위까지 통과합니다. PR 머지를 위해 연 창에서 기본 브랜치 직접 push 가 통과한 사례가 있습니다. 둘 다 되돌리기 어려운 행위이고 전역 금지 규칙이 있는 쪽이 뒤였습니다.

| 갈래 | 대상 |
|------|------|
| `cluster-write` | kubectl · argocd · helm mutation |
| `repo-merge` | `gh pr merge` |
| `repo-release` | `gh release create/edit/delete` |
| `repo-delete` | `gh repo delete/archive` |
| `git-force` | force push · 원격 브랜치 삭제 |
| `git-default-push` | 기본 브랜치 직접 push |
| `worktree-destructive` | `git reset --hard` · `clean` · `branch -D` · `restore` |
| `all` | 전부 |

갈래는 `category` 보다 좁습니다. `repo-merge` 와 `git-default-push` 는 둘 다 `repo` 라 category 단위로는 나뉘지 않습니다.

갈래를 사람이 고르지 않습니다. 차단 메시지가 감지된 갈래를 담은 명령을 싣고, 사용자는 그대로 실행합니다. 갈래를 좁히면서 열기 절차가 무거워지지 않게 하는 자리가 여기입니다.

`on` 은 **기존 마커를 대체합니다.** 합집합으로 열지 않습니다. 합치면 TTL 도 함께 연장되어 먼저 연 갈래의 창이 사람이 의도한 길이를 넘습니다. 마커는 사람이 마지막으로 승인한 것을 그대로 담습니다.

그래서 합치는 일은 차단 메시지가 합니다. 이미 열려 있는 갈래가 있으면 그것을 개방 명령에 함께 실어 한 줄로 제시합니다. 두 갈래가 순차로 필요한 작업에서 개방 → 차단 → 개방이 반복되던 문제(ADR 0007)를 이 자리에서 막습니다. 스크립트도 살아 있는 마커를 덮어쓸 때 이전 갈래를 알립니다.

TTL 은 창의 길이만 정하고 범위는 정하지 않습니다. 옛 형식(`on 30`)은 전체 개방으로 계속 읽어 진행 중인 창을 끊지 않습니다.

### 한계

최상위 명령만 봅니다. `bash deploy.sh` 처럼 스크립트 내부에서 실행되는 명령은 탐지하지 못합니다. 의도된 배포 스크립트 경로는 승인된 것으로 간주하고, 직접 타이핑하는 일회성 명령을 막는 안전망으로 둡니다.

---

## 플래그

오탐 조정과 파이프라인 실행용입니다. 상시 사용을 전제하지 않습니다.

| 규칙 | 드라이런 (경고만) | 비활성 |
|------|------------------|--------|
| 대외비 가드 | `OPS_AGENT_CONFIDENTIAL_DRYRUN=1` | `OPS_AGENT_CONFIDENTIAL_DISABLE=1` |
| What 가드 | `OPS_AGENT_WHAT_GUARD_DRYRUN=1` | `OPS_AGENT_WHAT_GUARD_DISABLE=1` |
| 액션 게이트 | `OPS_AGENT_ACTION_GATE_DRYRUN=1` | `OPS_AGENT_ACTION_GATE_DISABLE=1` |

새 키워드를 등록할 때는 드라이런으로 먼저 돌려 오탐을 확인합니다.
