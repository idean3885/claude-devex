#!/usr/bin/env bash
# bump-version.sh: 변경 적립(add)과 릴리즈 확정(release).
#
# Usage:
#   ./scripts/bump-version.sh add <changelog_entry> [category]
#   ./scripts/bump-version.sh release <new_version>
#
# add      CHANGELOG.md 의 Unreleased 에 항목만 쌓는다. 버전 파일은 건드리지 않는다.
# release  Unreleased 를 버전 섹션으로 끊고 4곳(VERSION·CHANGELOG.md·plugin.json·
#          marketplace.json)을 함께 갱신한다.
#
# 한 번에 올리는 형태는 두지 않는다. 남겨 두면 쉬운 쪽으로 돌아가고, 그 결과가
# 67일 208 릴리즈(하루 3.1회)였다. 버전 번호가 변경 덩어리를 가리키지 못한다 (#409).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  bump-version.sh add <changelog_entry> [category]
  bump-version.sh release <version>

category: Added Changed Deprecated Removed Fixed Security
  생략하면 changelog_entry 의 커밋 타입 접두에서 유도하고 본문에서 접두를 걷는다.
    feat → Added / fix → Fixed / docs·ci·perf·style·test·build → Changed
    '!' 접미 또는 'BREAKING CHANGE' → Changed (파괴 변경 표시 추가)
    refactor·chore → 기본 제외. 사용자 영향이 있으면 카테고리를 직접 지정한다

add 가 거부하는 것: em dash · 이슈 번호 없음 · refactor/chore 무지정

예시:
  bump-version.sh add 'feat: 상태 조회 서브커맨드 추가 (#406)'
  bump-version.sh add '구 슬롯 경로 제거 (#412)' Removed
  bump-version.sh release 8.11.0
USAGE
}

CMD="${1:-}"
case "$CMD" in
  add)
    [ $# -ge 2 ] || { usage; exit 1; }
    ROOT_DIR="$ROOT_DIR" ENTRY="$2" CATEGORY_ARG="${3:-}" python3 "$SCRIPT_DIR/changelog.py" add
    ;;
  release)
    [ $# -eq 2 ] || { usage; exit 1; }
    NEW_VERSION="$2"
    if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "✘ 버전 형식이 아닙니다: $NEW_VERSION (기대: x.y.z)" >&2
      exit 1
    fi
    PREV_VERSION=$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")
    # CHANGELOG 를 먼저 끊는다. 여기서 멈추면 버전 파일 셋은 그대로라 4곳이 어긋나지 않는다.
    ROOT_DIR="$ROOT_DIR" NEW_VERSION="$NEW_VERSION" PREV_VERSION="$PREV_VERSION" \
      python3 "$SCRIPT_DIR/changelog.py" release
    echo "$NEW_VERSION" > "$ROOT_DIR/VERSION"
    ROOT_DIR="$ROOT_DIR" NEW_VERSION="$NEW_VERSION" python3 - <<'PY'
import json, os, pathlib
root, ver = os.environ['ROOT_DIR'], os.environ['NEW_VERSION']
p = pathlib.Path(root, '.claude-plugin/plugin.json')
d = json.loads(p.read_text()); d['version'] = ver
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
p = pathlib.Path(root, '.claude-plugin/marketplace.json')
d = json.loads(p.read_text()); d['plugins'][0]['version'] = ver
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
PY
    V1=$(cat "$ROOT_DIR/VERSION")
    V2=$(python3 -c "import json;print(json.load(open('$ROOT_DIR/.claude-plugin/plugin.json'))['version'])")
    V3=$(python3 -c "import json;print(json.load(open('$ROOT_DIR/.claude-plugin/marketplace.json'))['plugins'][0]['version'])")
    V4=$(grep -m1 '^## \[[0-9]' "$ROOT_DIR/CHANGELOG.md" | sed 's/.*\[\(.*\)\].*/\1/')
    if [ "$V1" = "$NEW_VERSION" ] && [ "$V2" = "$NEW_VERSION" ] && [ "$V3" = "$NEW_VERSION" ] && [ "$V4" = "$NEW_VERSION" ]; then
      echo "✔ 릴리즈 $NEW_VERSION (4곳 갱신 완료)"
    else
      echo "✘ 버전 불일치: VERSION=$V1 plugin=$V2 marketplace=$V3 CHANGELOG=$V4" >&2
      exit 1
    fi
    ;;
  ''|-h|--help|help)
    usage
    ;;
  *)
    if [[ "$CMD" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "✘ 한 번에 올리는 형태는 없앴습니다 (#409)." >&2
      echo "  적립: bump-version.sh add '<항목>'" >&2
      echo "  릴리즈: bump-version.sh release $CMD" >&2
      exit 1
    fi
    usage
    exit 1
    ;;
esac
