# 워크트리 분기

여러 브랜치를 동시에 작업하거나 같은 레포의 다른 PR 을 병렬로 검토할 때 워크트리를 분기한다.

분기 판단 기준은 루트 `CLAUDE.md` 의 「워크트리 분기」 에 있다. 이 문서는 자원 위치와 포맷을 다룬다.

## 자원

| 자원 | 위치 | 비고 |
|------|------|------|
| 워크트리 생성 | `scripts/worktree-create.sh <state-file>` | clone-on-demand + 워크트리 일괄 생성 + vcs.xml 매핑 |
| 워크트리 정리 | `scripts/worktree-cleanup.sh` | bare clone 포함 정리 |
| state 파일 포맷 | `.ops-agent/state/org-flow-{ticket}.json` | 경로 컨벤션 |
| 하네스 자체 워크트리 | Claude Code `Agent` 도구의 `isolation: "worktree"` | 단발 isolation 작업용 — 위 스크립트와 무관 |

## 경로 컨벤션

`.ops-agent/state/` 경로명은 이전 자산 호환을 위해 유지한다. 리네임 가능성이 있으며 별 이슈로 추적한다.

state 파일 이름의 `org-flow-` 접두는 멀티레포 오케스트레이션에서 왔다. 단일 레포 작업에도 같은 포맷을 쓴다.

## 주의

워크트리를 만든 레포에서 `scripts/worktree-cleanup.sh` 를 돌리면 bare clone 까지 지운다. 다른 워크트리가 그 clone 을 공유하고 있으면 함께 끊긴다. 정리 전에 남은 워크트리를 확인한다.

```bash
git worktree list
```
