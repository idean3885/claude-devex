#!/usr/bin/env bash
# Stop hook: 직전 사용자 발화에서 교정 신호를 검출해 교훈 후보로 적립한다.
#
# 적립까지만 한다. 판정·등재는 /learn 이 사람 확인을 거쳐 수행한다.
# 자동 등재를 하지 않는 이유와 원본 포인터를 남기는 이유는 docs/lessons.md 참조.
#
# 규칙 머지: 플러그인 기본(${CLAUDE_PLUGIN_ROOT}/config/lesson-signals.json)
#          + 개인(~/.claude/lesson-signals.local.json)
# 후보 파일: ~/.claude/lesson-candidates.jsonl (append, 로컬 전용 · 발화 원문 포함)
set -euo pipefail

INPUT=$(cat)
PLUGIN_SIGNALS="${CLAUDE_PLUGIN_ROOT}/config/lesson-signals.json"
LOCAL_SIGNALS="$HOME/.claude/lesson-signals.local.json"
CANDIDATES="$HOME/.claude/lesson-candidates.jsonl"

[[ -f "$PLUGIN_SIGNALS" ]] || exit 0

HOOK_INPUT="$INPUT" PLUGIN_SIGNALS="$PLUGIN_SIGNALS" LOCAL_SIGNALS="$LOCAL_SIGNALS" CANDIDATES="$CANDIDATES" python3 <<'PYEOF'
import json, os, re, sys
from datetime import datetime

input_data = json.loads(os.environ.get("HOOK_INPUT", "{}"))
transcript = input_data.get("transcript_path", "")
if not transcript or not os.path.exists(transcript):
    sys.exit(0)

with open(os.environ["PLUGIN_SIGNALS"]) as f:
    base = json.load(f)
signals = list(base.get("signals", []))
max_per_session = int(base.get("maxPerSession", 30))

local_path = os.environ["LOCAL_SIGNALS"]
if os.path.exists(local_path):
    try:
        with open(local_path) as f:
            signals += json.load(f).get("signals", [])
    except Exception:
        pass

if not signals:
    sys.exit(0)

# 마지막 사용자 발화 추출. tool_result·하네스 주입 블록은 사용자 의도가 아니라 제외한다.
# 턴 중간에 끼워 넣은 발화는 type=user 가 아니라 queue-operation(operation=enqueue) 으로 기록된다.
# 그쪽이 교정일 확률이 오히려 높으므로 함께 본다.
SKIP_MARKERS = ("<local-command", "<system-reminder", "<command-name", "<bash-input",
                "<bash-stdout", "This session is being continued")
last_text = ""
session_id = ""
with open(transcript) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except Exception:
            continue
        if entry.get("sessionId"):
            session_id = entry["sessionId"]
        etype = entry.get("type")
        if etype == "queue-operation":
            if entry.get("operation") != "enqueue":
                continue
            texts = [entry.get("content") or ""]
        elif etype == "user" and not entry.get("isMeta"):
            content = entry.get("message", {}).get("content", [])
            if isinstance(content, str):
                texts = [content]
            elif isinstance(content, list):
                texts = [c.get("text", "") for c in content
                         if isinstance(c, dict) and c.get("type") == "text"]
            else:
                continue
        else:
            continue
        joined = "\n".join(t for t in texts if t).strip()
        if not joined or joined.startswith(SKIP_MARKERS):
            continue
        last_text = joined

if not last_text:
    sys.exit(0)

matched = []
for sig in signals:
    pat = sig.get("pattern")
    if not pat:
        continue
    try:
        if re.search(pat, last_text):
            matched.append(sig.get("label") or pat)
    except re.error:
        continue

if not matched:
    sys.exit(0)

candidates_path = os.environ["CANDIDATES"]
excerpt = last_text[:400]

# 같은 세션 상한, 같은 발화 중복 적립 방지
seen_same = 0
if os.path.exists(candidates_path):
    with open(candidates_path) as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            if rec.get("session") != session_id:
                continue
            seen_same += 1
            if rec.get("excerpt") == excerpt:
                sys.exit(0)
if seen_same >= max_per_session:
    sys.exit(0)

record = {
    "capturedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    "session": session_id,
    "transcript": transcript,
    "cwd": input_data.get("cwd", ""),
    "signals": sorted(set(matched)),
    "excerpt": excerpt,
}
try:
    os.makedirs(os.path.dirname(candidates_path), exist_ok=True)
    with open(candidates_path, "a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    os.chmod(candidates_path, 0o600)
except OSError as exc:
    # 적립 실패가 세션을 막지 않는다. 다만 조용히 넘기면 후보가 없는 것과 구분되지 않는다.
    print(f"[lesson-capture] 후보 적립 실패: {exc}", file=sys.stderr)
PYEOF
