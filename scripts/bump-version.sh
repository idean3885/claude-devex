#!/usr/bin/env bash
# bump-version.sh — 4곳 동시 버전 업데이트 (VERSION, CHANGELOG.md, plugin.json, marketplace.json)
#
# Usage: ./scripts/bump-version.sh <new_version> <changelog_entry> [category]
# Example:
#   ./scripts/bump-version.sh 6.22.0 "feat: 카테고리 인자 추가"      # 접두에서 Added 유도
#   ./scripts/bump-version.sh 6.22.1 "구 슬롯 경로 제거" Removed     # 카테고리 직접 지정
#
# category 를 생략하면 changelog_entry 의 커밋 타입 접두에서 유도한다.
# 유도할 수 없으면 실패한다. 고정 카테고리로 조용히 떨어지는 동작이
# CHANGELOG 분류를 내용과 어긋나게 만든 원인이었다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Keep a Changelog 1.1.0 분류
VALID_CATEGORIES=(Added Changed Deprecated Removed Fixed Security)
# CHANGELOG.md 의 삽입 지점. 헤더 문구가 바뀌어도 깨지지 않도록 전용 앵커를 쓴다.
ANCHOR='<!-- bump-version.sh 삽입 지점 -->'

usage() {
  echo "Usage: $0 <version> <changelog_entry> [category]"
  echo "  category: ${VALID_CATEGORIES[*]}"
  echo "  생략 시 changelog_entry 의 커밋 타입 접두에서 유도한다"
  echo "    feat → Added / fix → Fixed / docs·refactor·chore·ci·perf·style·test·build → Changed"
  echo "    '!' 접미 또는 'BREAKING CHANGE' → Changed (파괴 변경 표시 추가)"
  echo
  echo "Example: $0 6.22.0 'feat: 카테고리 인자 추가'"
}

if [ $# -lt 2 ]; then
  usage
  exit 1
fi

NEW_VERSION="$1"
CHANGELOG_ENTRY="$2"
CATEGORY_ARG="${3:-}"
TODAY=$(date +%Y-%m-%d)

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✘ 버전 형식이 아닙니다: $NEW_VERSION (기대: x.y.z)"
  exit 1
fi

# --- 파괴 변경 표기 판정 (Conventional Commits 11~13항) ---
is_breaking() {
  local entry="$1"
  case "$entry" in
    *"BREAKING CHANGE"*|*"BREAKING-CHANGE"*) return 0 ;;
  esac
  local head="${entry%%:*}"
  case "$head" in
    *!) return 0 ;;
  esac
  return 1
}

# --- 커밋 타입 → 체인지로그 분류 유도 ---
derive_category() {
  local entry="$1"
  local type="${entry%%:*}"   # "feat(scope)!: ..." → "feat(scope)!"
  type="${type%%(*}"          # 스코프 제거
  type="${type%!}"            # 파괴 변경 접미 제거
  case "$type" in
    feat) echo "Added" ;;
    fix) echo "Fixed" ;;
    docs|refactor|chore|ci|perf|style|test|build) echo "Changed" ;;
    *) return 1 ;;
  esac
}

BREAKING=false
if is_breaking "$CHANGELOG_ENTRY"; then
  BREAKING=true
fi

if [ -n "$CATEGORY_ARG" ]; then
  CATEGORY=""
  for valid in "${VALID_CATEGORIES[@]}"; do
    if [ "$CATEGORY_ARG" = "$valid" ]; then
      CATEGORY="$valid"
      break
    fi
  done
  if [ -z "$CATEGORY" ]; then
    echo "✘ 유효하지 않은 카테고리: $CATEGORY_ARG"
    echo "  가능한 값: ${VALID_CATEGORIES[*]}"
    exit 1
  fi
elif [ "$BREAKING" = true ]; then
  # 파괴 변경은 기존 동작이 바뀌었다는 뜻이므로 Changed 로 둔다.
  CATEGORY="Changed"
elif CATEGORY=$(derive_category "$CHANGELOG_ENTRY"); then
  :
else
  echo "✘ changelog_entry 에서 카테고리를 유도할 수 없습니다."
  echo "  항목: $CHANGELOG_ENTRY"
  echo "  커밋 타입 접두(feat:, fix: 등)를 붙이거나 3번째 인자로 카테고리를 지정하세요."
  echo "  가능한 값: ${VALID_CATEGORIES[*]}"
  exit 1
fi

# --- 증분 검사: 파괴 변경인데 MAJOR 가 오르지 않으면 경고 ---
PREV_VERSION=""
if [ -f "$ROOT_DIR/VERSION" ]; then
  PREV_VERSION=$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")
fi
if [ "$BREAKING" = true ] && [ -n "$PREV_VERSION" ]; then
  prev_major="${PREV_VERSION%%.*}"
  new_major="${NEW_VERSION%%.*}"
  if [ "$prev_major" = "$new_major" ]; then
    echo "⚠ 파괴 변경 표기가 있으나 MAJOR 가 오르지 않았습니다 ($PREV_VERSION → $NEW_VERSION)."
    echo "  소비 측이 파괴 변경을 버전만 보고 알 수 없습니다. 의도한 것이면 그대로 진행됩니다."
  fi
fi

ENTRY_LINE="$CHANGELOG_ENTRY"
if [ "$BREAKING" = true ]; then
  ENTRY_LINE="**BREAKING** $CHANGELOG_ENTRY"
fi

# --- 사전 검사: 앵커가 없으면 아무 파일도 건드리지 않고 멈춘다 ---
# 4곳 중 일부만 갱신된 상태로 남으면 캐시 경로 해석이 깨진다.
if ! grep -qF "$ANCHOR" "$ROOT_DIR/CHANGELOG.md"; then
  echo "✘ CHANGELOG.md 에서 삽입 앵커를 찾지 못했습니다: $ANCHOR"
  echo "  헤더에 앵커 주석을 복원한 뒤 다시 실행하세요. (파일은 변경되지 않았습니다)"
  exit 1
fi

# 1. VERSION
echo "$NEW_VERSION" > "$ROOT_DIR/VERSION"

# 2. plugin.json
python3 -c "
import json, pathlib
p = pathlib.Path('$ROOT_DIR/.claude-plugin/plugin.json')
d = json.loads(p.read_text())
d['version'] = '$NEW_VERSION'
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
"

# 3. marketplace.json
python3 -c "
import json, pathlib
p = pathlib.Path('$ROOT_DIR/.claude-plugin/marketplace.json')
d = json.loads(p.read_text())
d['plugins'][0]['version'] = '$NEW_VERSION'
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
"

# 4. CHANGELOG.md (앵커 뒤에 새 항목 삽입)
NEW_VERSION="$NEW_VERSION" TODAY="$TODAY" CATEGORY="$CATEGORY" \
ENTRY_LINE="$ENTRY_LINE" ANCHOR="$ANCHOR" ROOT_DIR="$ROOT_DIR" python3 -c "
import os, pathlib, sys
p = pathlib.Path(os.environ['ROOT_DIR'] + '/CHANGELOG.md')
content = p.read_text()
anchor = os.environ['ANCHOR']
if anchor not in content:
    sys.exit('anchor-missing')
entry = anchor + '''

## [%s] - %s

### %s
- %s''' % (os.environ['NEW_VERSION'], os.environ['TODAY'],
           os.environ['CATEGORY'], os.environ['ENTRY_LINE'])
p.write_text(content.replace(anchor, entry, 1))
" || {
  echo "✘ CHANGELOG.md 에서 삽입 앵커를 찾지 못했습니다: $ANCHOR"
  echo "  헤더에 앵커 주석을 복원한 뒤 다시 실행하세요."
  exit 1
}

# Verify all 4 files have the same version
V1=$(cat "$ROOT_DIR/VERSION")
V2=$(python3 -c "import json; print(json.load(open('$ROOT_DIR/.claude-plugin/plugin.json'))['version'])")
V3=$(python3 -c "import json; print(json.load(open('$ROOT_DIR/.claude-plugin/marketplace.json'))['plugins'][0]['version'])")
V4=$(grep -m1 '^\## \[' "$ROOT_DIR/CHANGELOG.md" | sed 's/.*\[\(.*\)\].*/\1/')

if [ "$V1" = "$NEW_VERSION" ] && [ "$V2" = "$NEW_VERSION" ] && [ "$V3" = "$NEW_VERSION" ] && [ "$V4" = "$NEW_VERSION" ]; then
  echo "✔ All 4 files updated to $NEW_VERSION (### $CATEGORY)"
else
  echo "✘ Version mismatch detected!"
  echo "  VERSION:          $V1"
  echo "  plugin.json:      $V2"
  echo "  marketplace.json: $V3"
  echo "  CHANGELOG.md:     $V4"
  exit 1
fi
