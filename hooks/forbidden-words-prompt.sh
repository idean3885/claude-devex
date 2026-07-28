#!/usr/bin/env bash
# UserPromptSubmit hook: 직전 응답에서 검출된 금지 표현 위반만 통지한다.
#
# 룰 목록 자체는 SessionStart 훅(scripts/session-start.mjs)이 세션당 1회 주입한다.
# 룰은 세션 중 바뀌지 않으므로 턴마다 재주입하면 같은 텍스트가 대화에 누적될 뿐이다.
# 위반은 턴마다 달라지므로 이 훅이 담당한다.
#
# 입력: Stop 훅(hooks/forbidden-words-stop.sh)이 기록한 위반 목록
#       ~/.claude/.forbidden-violations-pending
#       파일에 패턴·매칭어·대체어가 이미 들어 있어 룰 재조회가 필요 없다.
set -euo pipefail

PENDING_FILE="$HOME/.claude/.forbidden-violations-pending"

[[ -f "$PENDING_FILE" ]] || exit 0

VIOLATIONS=$(cat "$PENDING_FILE")
rm -f "$PENDING_FILE"

[[ -n "${VIOLATIONS//[[:space:]]/}" ]] || exit 0

cat <<EOF
[직전 응답에서 검출된 금지 표현]
$VIOLATIONS
→ 다음 응답 작성 시 위 패턴을 먼저 자가 점검한다. 사과는 1회만, 반복하지 않는다.
EOF
