---
name: usage-start
description: 새 작업의 사용량 추적을 시작합니다. 현재 세션을 기록하고 프로젝트+브랜치를 자동 등록합니다. 트리거 "사용량 추적", "추적 시작", "usage-start".
---

# usage:start

Start tracking token usage for a new task.

## Trigger

- "usage start {label}"
- "usage tracking {label}"
- "작업 추적 시작 {label}"

## Parameters

- **label** (required): Human-readable task name (e.g., "GPU Live 프로젝트 CRUD 정책서")
- **approach** (optional): Method being used (e.g., "manual", "workflow-runner", "autopilot"). Default: "manual"
- **tags** (optional): Comma-separated tags for grouping (e.g., "spec,planning")

## Procedure

### 1. Detect current context

```bash
# Get absolute cwd (worktree path is preserved here — required for cwd-based aggregation)
CWD=$(pwd)

# Path-encoded project key (legacy ccusage matching fallback)
PROJECT_PATH=$(echo "$CWD" | sed "s|$HOME/||" | sed 's|/|-|g' | sed 's|^|-|')

# Most recent session JSONL — Claude Code stores traces under the parent project dir,
# not under the worktree path. cwd-based aggregation does not depend on this lookup,
# but it is kept for ccusage fallback.
SESSION_ID=$(ls -t ~/.claude/projects/${PROJECT_PATH}/*.jsonl 2>/dev/null | head -1 | xargs basename 2>/dev/null | sed 's/.jsonl//')

# Get current git branch (if git project)
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "none")
```

### 2. Read or create tasks.json

```bash
TRACKER_DIR="$HOME/.claude/usage-tracker"
mkdir -p "$TRACKER_DIR/reports"
cat "$TRACKER_DIR/tasks.json" 2>/dev/null || echo '{"tasks":{}}'
```

### 3. Generate task ID

Create a short, URL-safe ID from the label:
- Lowercase, replace spaces with hyphens
- Max 30 chars
- If duplicate, append `-2`, `-3`, etc.

### 4. Write task entry

Add to tasks.json:

```json
{
  "tasks": {
    "{taskId}": {
      "label": "{label}",
      "approach": "{approach}",
      "tags": ["{tag1}", "{tag2}"],
      "bindings": [
        {
          "cwd": "{CWD}",
          "project": "{PROJECT_PATH}",
          "branch": "{GIT_BRANCH}"
        }
      ],
      "sessions": [
        {
          "id": "{SESSION_ID}",
          "addedAt": "{ISO timestamp}",
          "auto": false
        }
      ],
      "startedAt": "{ISO timestamp}",
      "status": "active"
    }
  }
}
```

### 5. Report

Output:
```
[Usage Tracker] Task started
- ID: {taskId}
- Label: {label}
- Approach: {approach}
- Session: {SESSION_ID}
- Binding: {CWD} ({project} @ {branch})

`cwd` 가 bindings 에 포함되어야 worktree-per-task 환경에서 ticket 단위 분리가 동작한다.
상세는 [docs/usage-cwd-aggregation.md](../../docs/usage-cwd-aggregation.md) 참조.
```

## 관련

이 스킬은 소비량을 사후에 기록한다. 사전에 조절하려면 작업 강도(effort)를 쓴다 — [docs/effort-policy.md](../../docs/effort-policy.md).
