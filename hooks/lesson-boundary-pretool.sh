#!/usr/bin/env bash
# PreToolUse hook: 재발이 잦은 레슨런의 조치 한 줄을 발동 지점에서 주입한다.
#
# 재발 원인의 다수가 `not-loaded` 다. 자산 내용은 맞았고 판단 시점에 읽히지 않았다.
# 세션 시작에 로드되는 것은 인덱스 한 줄뿐이라, 그 줄이 가리키는 시점과 실제 판단
# 시점이 어긋나면 자산은 있는 채로 작동하지 않는다.
#
# 하지 않는 것 (docs/lessons.md 「고칠 층을 먼저 정한다」):
#   - 차단하지 않는다. 주입까지다
#   - 자산 전문을 넣지 않는다. 조치 한 줄이고 본문은 경로로 연다
#   - 자리를 늘리지 않는다. `not-loaded` 로 두 번 이상 확인된 자산에만 자리를 준다.
#     자리가 늘면 오탐이 늘고 사람이 통지를 끈다
#
# 선언 위치 (둘 다 있으면 합친다. 프로젝트가 뒤에 온다):
#   ~/.claude/ops-agent/lesson-boundaries.json
#   <프로젝트 루트>/.ops-agent/lesson-boundaries.json
#
# 형식:
#   { "boundaries": { "Write|Edit": ["조치 한 줄 — <자산 경로>"] } }
#   키는 도구 이름 정규식, 값은 주입할 줄의 배열.
#
# 선언이 없으면 조용히 종료한다. 자산을 갖지 않은 프로젝트에 문구가 뜨지 않게 한다.
set -euo pipefail

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')
[ -n "$TOOL" ] || exit 0

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
[ -n "$CWD" ] || CWD=$PWD

# 프로젝트 루트 = .ops-agent 를 가진 가장 가까운 상위 디렉토리
root=$CWD
for _ in 1 2 3 4 5 6; do
  [ -d "$root/.ops-agent" ] && break
  parent=$(dirname "$root")
  [ "$parent" = "$root" ] && break
  root=$parent
done

USER_DECL="$HOME/.claude/ops-agent/lesson-boundaries.json"
PROJ_DECL="$root/.ops-agent/lesson-boundaries.json"

lines=""
for decl in "$USER_DECL" "$PROJ_DECL"; do
  [ -f "$decl" ] || continue
  # .key 를 test 인자로 넘길 때는 먼저 변수에 담는다. 파이프 뒤에서는 입력이 $tool 로 바뀌어
  # .key 가 문자열에 대한 접근이 되고, jq 가 조용히 빈 결과를 낸다.
  got=$(jq -r --arg tool "$TOOL" '
    (.boundaries // {}) | to_entries[]
    | select(.key as $k | $tool | test($k))
    | .value[]
  ' "$decl" 2>/dev/null || true)
  [ -n "$got" ] && lines="${lines}${got}"$'\n'
done

[ -n "${lines//[[:space:]]/}" ] || exit 0

msg="[레슨런 · ${TOOL} 경계] 아래는 이 지점에서 재발한 항목의 조치다. 본문은 경로로 연다."$'\n'
msg="${msg}${lines}"

jq -cn --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0
