---
name: usage-snap
description: 활성 작업의 현재 토큰 사용량 스냅샷을 표시합니다. 트리거 "스냅샷", "snap", "현재 사용량".
---

# usage:snap

Show how much the current (or specified) task has consumed so far.

## Trigger

- "usage snap"
- "usage check"
- "얼마나 썼나"
- "토큰 사용량"

## Parameters

- **taskId** (optional): Specific task ID. If omitted, shows all active tasks.

## Procedure

### 1. Load tasks

```bash
cat "$HOME/.claude/usage-tracker/tasks.json"
```

Filter to active tasks (status = "active"). If taskId specified, filter to that one.

### 2. Query ccusage for each task's sessions

For each task, get session data:

```bash
ccusage session --since {task.startedAt as YYYYMMDD} --json --breakdown
```

Parse the JSON output. Match sessions by sessionId from the task's sessions array.

**Matching logic:**
- ccusage sessions have `sessionId` field (project path based, e.g., `-Users-me-git-project-example-repo`)
- Task sessions have `id` field (UUID, e.g., `ebedca79-...`)
- Match: task session `id` should appear as a JSONL filename under the ccusage session's project path
- For simplicity: aggregate ALL ccusage sessions whose `sessionId` matches any of the task's binding projects

### 3. Calculate metrics

For each task:
- **Total tokens**: sum of totalTokens across matched sessions
- **Total cost**: sum of totalCost
- **Input/Output/Cache breakdown**
- **Session count**: number of sessions
- **Duration**: startedAt to now
- **Cost per day**: totalCost / days active

### 4. Output

```
[Usage Tracker] Snapshot - {label}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Metric          | Value        |
|-----------------|--------------|
| Total Cost      | ${cost}      |
| Total Tokens    | {tokens}     |
| Input Tokens    | {input}      |
| Output Tokens   | {output}     |
| Cache Read      | {cacheRead}  |
| Cache Create    | {cacheCreate}|
| Sessions        | {count}      |
| Duration        | {days}d      |
| Cost/Day        | ${perDay}    |
| Approach        | {approach}   |
```

If multiple active tasks, show a comparison table.
