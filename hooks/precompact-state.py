#!/usr/bin/env python3
"""컴팩트 직전, 그 구간의 재실행 재료를 디스크에 남긴다.

컴팩트 요약은 결론과 파일 경로를 남기고 명령을 버린다 (측정: 컴팩트 11회 세션에서
요약 4건에 판정을 만든 비교 짝이 한 줄도 없었다). 결론이 근거보다 오래 살면
「이미 확인함」으로 읽혀 재확인이 일어나지 않는다. 근거는 ADR-0013.

그래서 요약이 아니라 **다시 만들 수 없는 것**과 **다시 만들 재료**만 파일로 뺀다.
- 사용자 발화 (결정·제약. 다시 만들 수 없다)
- 실행한 명령 (출력은 버린다. 명령이 있으면 출력은 다시 만들어진다)
- 쓰거나 고친 파일 경로

PostCompact 가 이 파일 경로를 컴팩트 직후 컨텍스트에 넣는다.
"""
import json
import os
import re
import sys
from pathlib import Path

STATE = Path.home() / ".claude" / "state" / "compact"
# 단독 잡음만 버린다. `cd X && git Y` 는 체인이 있으므로 남는다
NOISE = re.compile(r"^\s*(cd|ls|pwd|echo|cat|which|clear)\b[^&|;]*$")


def transcript_path(payload):
    p = payload.get("transcript_path")
    if p and Path(p).is_file():
        return Path(p)
    sid = payload.get("session_id")
    if not sid:
        return None
    hits = sorted((Path.home() / ".claude" / "projects").glob(f"*/{sid}.jsonl"))
    return hits[0] if hits else None


def harvest(path, start):
    """start 줄 이후에서 사용자 발화·명령·파일 경로를 뽑는다."""
    users, cmds, files, n = [], [], [], 0
    with path.open(errors="replace") as fh:
        for n, line in enumerate(fh, 1):
            if n <= start:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            msg = d.get("message") or {}
            content = msg.get("content")
            if msg.get("role") == "user" and isinstance(content, str):
                t = content.strip()
                # 도구 결과·리마인더가 아닌 실제 발화만
                if t and "<system-reminder>" not in t and not t.startswith("["):
                    users.append(t[:600])
            if not isinstance(content, list):
                continue
            for b in content:
                if not isinstance(b, dict) or b.get("type") != "tool_use":
                    continue
                name, inp = b.get("name"), b.get("input") or {}
                if name == "Bash":
                    c = (inp.get("command") or "").strip()
                    if c and not NOISE.match(c):
                        cmds.append(c)
                elif name in ("Write", "Edit", "NotebookEdit"):
                    f = inp.get("file_path")
                    if f:
                        files.append(f)
    return users, cmds, files, n


def dedupe(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    path = transcript_path(payload)
    if not path:
        print(json.dumps({"suppressOutput": True}))
        return

    sid = payload.get("session_id") or path.stem
    STATE.mkdir(parents=True, exist_ok=True)
    out = STATE / f"{sid}.md"
    cursor = STATE / f"{sid}.cursor"

    start = int(cursor.read_text().strip()) if cursor.is_file() else 0
    users, cmds, files, end = harvest(path, start)
    cursor.write_text(str(end))

    if not (users or cmds or files):
        print(json.dumps({"suppressOutput": True}))
        return

    seq = len([l for l in out.read_text().splitlines() if l.startswith("## 구간 ")]) + 1 if out.is_file() else 1
    if not out.is_file():
        out.write_text(
            "# 컴팩트 이전 재실행 재료\n\n"
            "요약이 아니다. 컴팩트 요약이 「확인 완료」라고 해도, 여기 명령이 있으면 다시 실행한다.\n"
        )

    with out.open("a") as fh:
        fh.write(f"\n## 구간 {seq} (트리거: {payload.get('trigger', '?')})\n")
        if users:
            fh.write("\n### 사용자 발화 — 다시 만들 수 없다\n\n")
            for u in users:
                fh.write(f"- {u.splitlines()[0][:300]}\n")
        if cmds:
            uniq = dedupe(cmds)
            fh.write(f"\n### 실행한 명령 {len(uniq)}건 — 출력은 버렸다. 필요하면 다시 실행한다\n\n```bash\n")
            for c in uniq[-120:]:
                fh.write(c.replace("\n", " ; ")[:400] + "\n")
            fh.write("```\n")
        if files:
            fh.write("\n### 쓰거나 고친 파일\n\n")
            for f in dedupe(files):
                fh.write(f"- `{f}`\n")

    print(json.dumps({
        "systemMessage": f"컴팩트 재료 보존: {out}",
        "suppressOutput": True,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
