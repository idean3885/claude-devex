#!/usr/bin/env bash
# post-merge-sync.sh — ops-agent 플러그인 머지 후 로컬 동기
# PR 머지로 origin/main 에 반영된 새 버전을 로컬 캐시에 반영한다.
# 마켓플레이스 업데이트 → 로컬 캐시 git 복원 → 활성 세션 경로 복원 → 검증
#
# 버전 범프·커밋·직접 push 는 하지 않는다. 그 단계는 워크트리에서 bump-version.sh 로
# 버전 파일을 올린 뒤 커밋 → PR → 웹 머지가 담당한다.
#
# Usage: ./scripts/post-merge-sync.sh
# 선행 조건: 대상 PR 이 origin/main 에 이미 머지되어 있어야 한다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_NAME="ops-agent@ops-agent"
REMOTE_URL="${OPS_AGENT_REMOTE_URL:-https://github.com/idean3885/claude-ops-agent.git}"

# --- 머지된 버전 확인 (origin/main 기준) ---
# 로컬 체크아웃 상태와 무관하게 원격 main 의 VERSION 을 동기 기준으로 삼는다.
git -C "$ROOT_DIR" fetch origin --quiet 2>/dev/null || true
NEW_VERSION=$(git -C "$ROOT_DIR" show origin/main:VERSION 2>/dev/null || cat "$ROOT_DIR/VERSION")
echo "📦 동기 대상 버전: $NEW_VERSION"

# --- 캐시 경로 + update 전 기존 버전 캡처 ---
# PLUGIN_NAME = "{plugin}@{marketplace}" → ~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/
PLUGIN_PART="${PLUGIN_NAME%%@*}"
MARKETPLACE_PART="${PLUGIN_NAME##*@}"
CACHE_BASE="$HOME/.claude/plugins/cache/$MARKETPLACE_PART/$PLUGIN_PART"
# `claude plugins update` 는 옛 버전 캐시 디렉토리를 제거한다. update 후에 "남은 디렉토리"를 순회하면
# 복원 대상이 이미 사라진 뒤다. 활성 세션 hook 경로를 복원하려면 update 직전의 버전 목록을 먼저 기록한다.
BEFORE_VERSIONS=""
[ -d "$CACHE_BASE" ] && BEFORE_VERSIONS=$(ls -1 "$CACHE_BASE" 2>/dev/null || true)

# --- Step 1: 마켓플레이스 업데이트 ---
# `claude plugins update` 는 대상을 찾지 못해 실패해도 exit 0 을 반환한다(실측).
# 종료 코드만 검사하면 실패가 성공으로 통과해 Step 2·3 까지 흘러간 뒤에야 드러난다.
# 실패 문구를 직접 검사해 이 지점에서 끊는다.
UPDATE_OUT=$(claude plugins update "$PLUGIN_NAME" 2>&1) || true
echo "$UPDATE_OUT"
if printf '%s' "$UPDATE_OUT" | grep -qE 'Failed to update|not found'; then
  echo "✘ 마켓플레이스 업데이트 실패 — 플러그인 식별자($PLUGIN_NAME) 를 확인하세요"
  exit 1
fi
echo "✔ 마켓플레이스 업데이트 완료"

# --- Step 2: 새 캐시 디렉토리 git 복원 ---
NEW_CACHE="$CACHE_BASE/$NEW_VERSION"

if [ -d "$NEW_CACHE" ] && [ ! -d "$NEW_CACHE/.git" ]; then
  cd "$NEW_CACHE"
  git init --quiet
  git remote add origin "$REMOTE_URL" 2>/dev/null || true
  git add -A
  git commit -m "init: sync from marketplace $NEW_VERSION" --quiet
  echo "✔ 캐시 git 복원 ($NEW_VERSION)"
fi

# --- Step 2b: update 가 제거한 옛 버전 경로를 신버전 심볼릭으로 복원 ---
# 활성 세션의 PreToolUse / SessionStart hook 은 시작 시점에 결정된 plugin root 경로(옛 버전)를 계속 호출한다.
# update 가 옛 버전 디렉토리를 제거하면 그 경로가 ENOENT 가 되어 활성 세션 hook 이 실패한다.
# 그래서 update 직전 캡처한 BEFORE_VERSIONS 를 기준으로, 사라진 옛 버전 이름마다 신버전을 가리키는
# 심볼릭을 만들어 활성 세션 hook 경로를 유지한다. 다음 hook 호출이 신버전 코드를 해소하므로 reload 가 필요 없다.
# (관련 회귀: 활성 세션 중 릴리스 직후 'Plugin directory does not exist' 에러.)
RESTORED=0
for OLD_NAME in $BEFORE_VERSIONS; do
  [ "$OLD_NAME" = "$NEW_VERSION" ] && continue
  TARGET="$CACHE_BASE/$OLD_NAME"
  # update 가 옛 버전을 실제 디렉토리로 그대로 남겨 두었다면(누적형) 건드리지 않는다.
  [ -e "$TARGET" ] && [ ! -L "$TARGET" ] && continue
  ln -sfn "$NEW_VERSION" "$TARGET"
  echo "✔ 옛 버전 경로 복원: $OLD_NAME → $NEW_VERSION (활성 세션 hook 유지)"
  RESTORED=$((RESTORED + 1))
done
[ "$RESTORED" -eq 0 ] && echo "ℹ 복원할 옛 버전 경로 없음"

# --- Step 3: 검증 ---
INSTALLED_VERSION=$(cat "$NEW_CACHE/VERSION" 2>/dev/null || echo "MISSING")
if [ "$INSTALLED_VERSION" = "$NEW_VERSION" ]; then
  echo "✅ 동기 완료: ops-agent $NEW_VERSION"
else
  echo "✘ 버전 불일치 — 설치: $INSTALLED_VERSION, 기대: $NEW_VERSION"
  exit 1
fi
