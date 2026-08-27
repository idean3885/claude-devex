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

    # 살아 있는 마커를 덮어쓰면 그 사실을 알린다. 조용히 대체하면 앞서 연 갈래가
    # 사라진 것을 아무도 모르고, 그 갈래가 필요한 명령이 다시 차단된다 (#353).
    if [ -f "$MARKER" ]; then
      prev_exp=$(sed -n 's/.*"expiresAt":\([0-9]*\).*/\1/p' "$MARKER")
      prev_scopes=$(sed -n 's/.*"scopes":\[\([^]]*\)\].*/\1/p' "$MARKER" | tr -d '"' | tr -d ' ')
      if [ -n "$prev_exp" ] && [ "$prev_exp" -gt "$(( $(date +%s) * 1000 ))" ] 2>/dev/null; then
        if [ -n "$prev_scopes" ] && [ "$prev_scopes" != "$scopes" ]; then
          echo "[action-gate-allow] 이전 갈래(${prev_scopes})를 대체합니다. 함께 열려면 on ${prev_scopes},${scopes} 형태로 실행하세요." >&2
        fi
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
