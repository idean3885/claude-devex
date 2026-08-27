#!/usr/bin/env bash
# action-gate-allow.sh — ops-agent 액션 게이트 세션 허용 마커 관리.
#
# pre-tool-use.mjs 의 "액션 게이트" 는 되돌리기 어려운/외부 영향 행위(클러스터 mutation·
# PR 머지·릴리즈·force push·리소스 삭제)를 이 마커가 있을 때만 통과시킨다.
# 사용자 명시 승인 후에만 켤 것.
#
# 사용: action-gate-allow.sh on|off|status [scopes] [ttl_minutes] [session_id]
#   on      마커 생성 (기본 TTL 30분).
#           scopes 를 주면 그 갈래만 열린다. 생략하면 all 이고 모든 갈래가 열린다.
#           두 번째 인자가 숫자면 옛 형식(ttl)으로 읽어 all 로 연다.
#           **기존 마커를 대체한다.** 합집합으로 열지 않는다: 합치면 TTL 도 함께 연장되어
#           먼저 연 갈래의 창이 사람이 의도한 길이를 넘긴다. 두 갈래가 필요하면
#           `on a,b` 로 한 번에 연다. 차단 메시지가 이미 열린 갈래를 담은 명령을 제시한다.
#           살아 있는 마커를 덮어쓸 때 **잃는 갈래가 있으면** 알린다. 새 목록이 이전을
#           모두 포함하면 사라지는 것이 없으므로 알리지 않는다.
#   off     마커 삭제 (즉시 차단 복귀).
#   status  현재 허용 상태 출력.
#
# 갈래 목록 (차단 메시지가 해당 갈래를 담은 명령을 그대로 제시한다):
#   cluster-write         kubectl·argocd·helm mutation
#   repo-merge            gh pr merge
#   repo-release          gh release create/edit/delete
#   repo-delete           gh repo delete/archive
#   git-force             force push · 원격 브랜치 삭제
#   git-default-push      기본 브랜치 직접 push
#   worktree-destructive  git reset --hard · clean · branch -D · restore
#   all                   전부
#
# 시간만으로 열면 그 창 안에서 승인 대상이 아니던 갈래까지 통과한다. 갈래를 함께 담는
# 이유가 그것이다. TTL 은 창의 길이만 정하고 범위는 정하지 않는다.
set -euo pipefail

MARKER="$HOME/.claude/ops-agent/.cache/action-gate-allow.json"

# 살아 있는 마커를 덮어쓸 때 **잃는 갈래만** 알린다. 조용히 대체하면 앞서 연 갈래가
# 사라진 것을 아무도 모르고, 그 갈래가 필요한 명령이 다시 차단된다 (#353).
#
# 새 목록이 이전을 모두 포함하면 사라지는 것이 없으므로 알릴 것이 없다. 그때도 알리면
# 신호가 아니라 소음이고, 제시하는 명령에 같은 갈래가 두 번 들어간다 (#388).
#
# 사용: warn_lost_scopes <이전 갈래 csv> <새 갈래 csv>
warn_lost_scopes() {
  prev_scopes=$(printf '%s' "$1" | tr -d ' ')
  new_scopes="$2"
  [ -n "$prev_scopes" ] || return 0
  new_csv=",$(printf '%s' "$new_scopes" | tr -d ' '),"
  if [ "${new_csv#*,all,}" != "$new_csv" ]; then
    return 0  # 새 목록이 전부 열므로 잃는 갈래가 없다
  fi
  # 부분 문자열이 아니라 항목으로 본다. 이름에 all 을 담은 갈래가 생기면 오판한다.
  prev_csv=",$prev_scopes,"
  if [ "${prev_csv#*,all,}" != "$prev_csv" ]; then
    echo "[action-gate-allow] 전체 개방(all)이 닫히고 갈래 ${new_scopes} 만 열립니다. 전부 열려면 on all 로 실행하세요." >&2
    return 0
  fi
  # 새 목록에 없는 이전 갈래만 고른다.
  lost=$(printf '%s\n' "$prev_scopes" | tr ',' '\n' | while IFS= read -r ps; do
    [ -z "$ps" ] && continue
    if [ "${new_csv#*,$ps,}" = "$new_csv" ]; then printf '%s,' "$ps"; fi
  done)
  lost="${lost%,}"
  [ -n "$lost" ] || return 0
  echo "[action-gate-allow] 이전 갈래 ${lost} 가 닫힙니다. 함께 열려면 on ${new_scopes},${lost} 형태로 실행하세요." >&2
}

# 테스트가 함수만 불러 쓸 때는 여기서 멈춘다. 마커를 만들지 않는다.
[ "${OPS_AGENT_GATE_LIB:-}" = "1" ] && return 0

cmd="${1:-status}"

case "$cmd" in
  on)
    arg2="${2:-}"
    if [[ "$arg2" =~ ^[0-9]+$ ]]; then
      # 옛 형식: on [ttl] [session_id]
      scopes="all"
      ttl="$arg2"
      sid="${3:-}"
    else
      scopes="${arg2:-all}"
      ttl="${3:-30}"
      sid="${4:-}"
    fi

    # 쉼표 목록을 JSON 배열로. 공백은 제거하고 빈 항목은 넣지 않는다.
    # 마지막 항목에 개행이 없으면 read 가 거짓을 돌려주고 그 항목이 사라진다. %s\n 로 닫는다.
    scopes_json=$(printf '%s\n' "$scopes" | tr ',' '\n' | while IFS= read -r s; do
      s="${s// /}"
      [ -n "$s" ] && printf '"%s",' "$s"
    done)
    scopes_json="[${scopes_json%,}]"
    [ "$scopes_json" = "[]" ] && scopes_json='["all"]'

    # 살아 있는 마커만 대상이다. 만료된 마커는 이미 아무것도 열고 있지 않다.
    if [ -f "$MARKER" ]; then
      prev_exp=$(sed -n 's/.*"expiresAt":\([0-9]*\).*/\1/p' "$MARKER")
      prev_scopes=$(sed -n 's/.*"scopes":\[\([^]]*\)\].*/\1/p' "$MARKER" | tr -d '"' | tr -d ' ')
      if [ -n "$prev_exp" ] && [ "$prev_exp" -gt "$(( $(date +%s) * 1000 ))" ] 2>/dev/null; then
        warn_lost_scopes "$prev_scopes" "$scopes"
      fi
    fi

    mkdir -p "$(dirname "$MARKER")"
    now_ms=$(( $(date +%s) * 1000 ))
    exp=$(( now_ms + ttl * 60000 ))
    if [ -n "$sid" ]; then
      printf '{"expiresAt":%s,"scopes":%s,"sessionId":"%s"}\n' "$exp" "$scopes_json" "$sid" > "$MARKER"
    else
      printf '{"expiresAt":%s,"scopes":%s}\n' "$exp" "$scopes_json" > "$MARKER"
    fi
    echo "[action-gate-allow] ON (갈래 ${scopes}, TTL ${ttl}m${sid:+, session ${sid}})"
    ;;
  off)
    rm -f "$MARKER"
    # 레거시 마커도 함께 정리
    rm -f "$HOME/.claude/ops-agent/.cache/cluster-write-allow.json"
    echo "[action-gate-allow] OFF"
    ;;
  status)
    if [ -f "$MARKER" ]; then
      echo "[action-gate-allow] $(cat "$MARKER")"
    else
      echo "[action-gate-allow] OFF (마커 없음)"
    fi
    ;;
  *)
    echo "usage: $0 on|off|status [scopes] [ttl_minutes] [session_id]" >&2
    exit 1
    ;;
esac
