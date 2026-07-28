# Usage Tracking — cwd-based Aggregation

`usage:start`, `usage:report`, `usage:complete` 가 worktree-per-task 레이아웃에서 정확히 동작하도록 하는 집계 방식이다.

## 배경

`org-flow` 는 한 ticket 당 한 worktree 를 표준으로 한다 (`worktrees/<repo>/feature-<n>/`). 그러나 Claude Code 는 trace jsonl 파일을 cwd 와 무관하게 **부모 프로젝트 디렉토리 한 곳**에 저장한다.

```
cwd: /Users/<user>/git-project/<org>/worktrees/<repo>/feature-NNN/
                            ↓
trace 저장: ~/.claude/projects/-Users-<user>-git-project-<org>/<sessionUuid>.jsonl
```

`ccusage session` 명령은 디렉토리명을 `sessionId` 로 노출하므로 여러 ticket 의 trace 가 한 `sessionId` 로 누적된다. 결과적으로 `ccusage` 기반 매칭은 `1세션 = 1ticket = N레포` 레이아웃에서 ticket 단위 분리를 못 한다.

## 해결

trace jsonl 의 entry 마다 실제 `cwd` 필드가 자동 기록된다. 워크트리 path 가 그대로 보존된다.

```json
{"type":"assistant","cwd":"/Users/<user>/git-project/<org>/worktrees/<repo>/feature-NNN",
 "timestamp":"2026-05-19T05:11:27Z","sessionId":"3012248b-...",
 "message":{"usage":{"input_tokens":6,"output_tokens":213,
                     "cache_creation_input_tokens":31870,"cache_read_input_tokens":18276}}}
```

`usage:*` 는 ccusage 대신 trace jsonl 을 직접 파싱하여 `cwd` 별로 토큰을 합산한다. ccusage 매칭은 미설정 환경의 fallback 으로만 사용된다.

## 알고리즘

### 입력

- `tasks.json` 의 task 항목 (각 task 의 `bindings[].cwd` 가 워크트리 path)
- `~/.claude/projects/<encoded-parent>/<sessionUuid>.jsonl` 트레이스 파일 집합

### 절차

1. 각 task 의 `bindings[].cwd` 를 수집 → 매핑 테이블 `cwd → taskId`
2. 모든 trace jsonl 을 한 번 순회하면서 `type == "assistant"` 인 entry 만 추출
3. 각 entry 의 `cwd` 필드로 매핑 테이블 조회 → 해당 taskId 의 누적 합계에 token/cost 추가
4. cost 계산은 모델별 단가표 (Anthropic 공시) 와 토큰 4종 (input / output / cache_creation / cache_read) 곱

### Sample (python)

```python
import json, glob, os
from collections import defaultdict

# 가격표 (예: claude-opus-4-7, USD per 1M tokens)
PRICING = {
    "claude-opus-4-7":     {"input": 15.0, "output": 75.0, "cache_creation": 18.75, "cache_read":  1.50},
    "claude-sonnet-4-6":   {"input":  3.0, "output": 15.0, "cache_creation":  3.75, "cache_read":  0.30},
}

tasks = json.load(open(os.path.expanduser("~/.claude/usage-tracker/tasks.json")))["tasks"]
cwd_to_task = {b["cwd"]: tid for tid, t in tasks.items() for b in t.get("bindings", []) if b.get("cwd")}

agg = defaultdict(lambda: {"tokens": 0, "cost": 0.0, "entries": 0})
for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
    for line in open(f):
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get("type") != "assistant":
            continue
        cwd = d.get("cwd")
        tid = cwd_to_task.get(cwd)
        if tid is None:
            continue
        u = (d.get("message") or {}).get("usage") or d.get("usage") or {}
        model = (d.get("message") or {}).get("model", "claude-opus-4-7")
        p = PRICING.get(model, PRICING["claude-opus-4-7"])
        toks = (u.get("input_tokens", 0)
                + u.get("output_tokens", 0)
                + u.get("cache_creation_input_tokens", 0)
                + u.get("cache_read_input_tokens", 0))
        cost = (u.get("input_tokens", 0)              * p["input"]
              + u.get("output_tokens", 0)             * p["output"]
              + u.get("cache_creation_input_tokens",0) * p["cache_creation"]
              + u.get("cache_read_input_tokens", 0)   * p["cache_read"]) / 1_000_000
        agg[tid]["tokens"] += toks
        agg[tid]["cost"] += cost
        agg[tid]["entries"] += 1

for tid, v in agg.items():
    print(f"{tid:40} entries={v['entries']:>6}  tokens={v['tokens']:>14,}  cost=${v['cost']:>9.2f}")
```

## 등록 시점 (`usage:start`)

`bindings[]` 에 `cwd` 를 채워야 매칭이 동작한다. `pwd` 결과를 그대로 저장한다.

```json
"bindings": [
  {
    "cwd": "/Users/<user>/git-project/<org>/worktrees/<repo>/feature-NNN",
    "project": "-Users--user--git-project--org",
    "branch": "feature/NNN"
  }
]
```

기존 `project` 필드는 ccusage fallback 용으로 유지한다.

## ccusage Fallback

`tasks.json` 의 task 에 `bindings[].cwd` 가 없거나 trace jsonl 이 손실되었을 때만 기존 `ccusage session` 매칭으로 떨어진다. 새 task 는 자동으로 cwd-based 모드를 우선한다.

## 폐기 조건

- trace jsonl 의 `cwd` 라벨이 Claude Code 향후 버전에서 사라지거나 비어 보고된다면 cwd-based 모드 폐기. fallback (ccusage) 은 남기되 `usage:report` 가 "ticket 단위 분리 불가" 경고를 출력한다.
- 한 워크트리 안에서 여러 ticket 을 분리 작업하는 패턴이 표준이 되면 cwd 단일 매핑 가정이 깨진다. 그 시점에 별도 마커 (예: `usage:checkpoint`) 로 ticket 전환 명시 필요.

## 검증

PoC 시점 실측:

```
unique cwds: 96
  project-a 루트:                        9590 assistant entries
  worktrees/project-a-be/feature-NNNN     260 entries  ← #NNNN 작업
  worktrees/project-a-fe/feature-MMMM     776 entries  ← #MMMM FE 작업
  ...
```

워크트리 path 가 cwd 라벨로 정확히 분리되어 ticket 단위 합산이 동작함을 확인.
