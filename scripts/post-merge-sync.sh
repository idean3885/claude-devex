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

# --- Step 2b: 신버전보다 낮은 버전 경로를 신버전 심볼릭으로 맞춘다 ---
# 활성 세션의 PreToolUse / SessionStart hook 은 시작 시점에 결정된 plugin root 경로(옛 버전)를
# 계속 호출한다. 그 경로가 사라지면 hook 이 ENOENT 로 실패하고, 옛 실디렉토리로 남아 있으면
# 세션이 끝날 때까지 옛 코드가 돈다.
#
# 이 스크립트는 안전장치(대외비 가드·액션 게이트) 코드를 배치한다. 옛 경로 잔존은 곧 옛 가드
# 잔존이다. 실제로 가드를 두 번 고친 뒤에도 옛 경로에는 첫 결함이 남아 있었다. 버전 표시는
# 최신인데 검사는 고쳐지기 전 코드가 수행하고 있었다.
#
# 그래서 판정 기준은 존재 형태(심볼릭인가)가 아니라 버전 비교다. session-start.mjs 의
# cleanupStaleVersions() 가 같은 기준을 쓰지만 다음 세션에만 적용된다. 이 단계는 머지 직후
# 그 자리에서 맞춘다.

# "1.2.3" → 비교 가능한 정수 키. 각 자리 1000 미만 전제 (VERSION 컨벤션).
# macOS 기본 sort 에 -V 가 없어 자리별로 직접 만든다.
semver_key() {
  local major minor patch
  IFS=. read -r major minor patch <<< "$1"
  printf '%d%03d%03d\n' "$((10#${major:-0}))" "$((10#${minor:-0}))" "$((10#${patch:-0}))"
}

NEW_KEY=$(semver_key "$NEW_VERSION")
# update 가 제거한 이름(BEFORE)과 남긴 이름(현재 목록)이 모두 대상이다. 한쪽만 보면 누락된다.
CANDIDATES=$(printf '%s\n%s\n' "$BEFORE_VERSIONS" "$(ls -1 "$CACHE_BASE" 2>/dev/null || true)" \
  | grep -v '^$' | sort -u || true)

RESTORED=0
for OLD_NAME in $CANDIDATES; do
  [ "$OLD_NAME" = "$NEW_VERSION" ] && continue
  # 버전 디렉토리가 아니면(워크트리·개발 경로) 비교 기준이 없다. 건드리지 않는다.
  [[ "$OLD_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
  # 신버전보다 높으면 보존한다. 다른 세션이 상위 버전을 쓰는 중일 수 있다.
  [ "$(semver_key "$OLD_NAME")" -gt "$NEW_KEY" ] && continue

  TARGET="$CACHE_BASE/$OLD_NAME"
  if [ -L "$TARGET" ]; then
    ln -sfn "$NEW_VERSION" "$TARGET"
  elif [ -d "$TARGET" ]; then
    # 디렉토리를 심볼릭으로 원자 교체하는 수단은 없다 — rename 은 디렉토리 위에 심볼릭을 덮지 못한다.
    # 대신 실패 창을 줄인다. mv 로 비켜두고 즉시 심볼릭을 만든 뒤, 오래 걸리는 삭제를 마지막에 한다.
    # 반대 순서(rm -rf 먼저)면 트리 삭제에 걸리는 시간 전체가 hook 실패 창이 된다.
    STALE="$TARGET.stale.$$"
    mv "$TARGET" "$STALE"
    ln -sfn "$NEW_VERSION" "$TARGET"
    rm -rf "$STALE"
  else
    ln -sfn "$NEW_VERSION" "$TARGET"
  fi
  echo "✔ 옛 버전 경로 정렬: $OLD_NAME → $NEW_VERSION (활성 세션 hook 유지)"
  RESTORED=$((RESTORED + 1))
done
[ "$RESTORED" -eq 0 ] && echo "ℹ 정렬할 옛 버전 경로 없음"

# --- Step 3: 검증 ---
INSTALLED_VERSION=$(cat "$NEW_CACHE/VERSION" 2>/dev/null || echo "MISSING")
if [ "$INSTALLED_VERSION" = "$NEW_VERSION" ]; then
  echo "✅ 동기 완료: ops-agent $NEW_VERSION"
else
  echo "✘ 버전 불일치 — 설치: $INSTALLED_VERSION, 기대: $NEW_VERSION"
  exit 1
fi
