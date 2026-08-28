#!/usr/bin/env python3
"""컴팩트 직후, 보존 파일 경로를 새 컨텍스트에 넣는다.

PreCompact 가 파일을 남겨도 그 존재를 모르면 쓰이지 않는다. 경로가 요약에 남는
경우도 있으나 그건 우연이고, 이 훅은 그것을 확정한다. 근거는 ADR-0013.

파일 본문을 넣지 않는다 — 본문을 넣으면 다음 컴팩트에서 다시 요약된다. 경로만
넣고, 필요할 때 읽게 한다.
"""
import json
import sys
from pathlib import Path

STATE = Path.home() / ".claude" / "state" / "compact"


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    sid = payload.get("session_id")
    f = STATE / f"{sid}.md" if sid else None
    if not (f and f.is_file()):
        print(json.dumps({"suppressOutput": True}))
        return

    n = sum(1 for l in f.read_text(errors="replace").splitlines() if l.startswith("## 구간 "))
    print(json.dumps({
        "suppressOutput": True,
        "hookSpecificOutput": {
            "hookEventName": "PostCompact",
            "additionalContext": (
                f"[컴팩트 재료] 이 세션은 {n}회 컴팩트됐다. 요약이 버린 명령·사용자 발화가 "
                f"`{f}` 에 남아 있다.\n"
                "위 요약에 「확인했다」·「문제 없다」·판정이 있는데 그것을 만든 명령이 "
                "지금 컨텍스트에 없으면, 그 결론은 미확인으로 다룬다. 이 파일에서 명령을 찾아 "
                "다시 실행하고 나서 판단한다."
            ),
        },
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
