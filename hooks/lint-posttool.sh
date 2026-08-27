#!/usr/bin/env bash
# PostToolUse hook: 콘텐츠 파일 편집 직후 lint 자가 수행을 유도한다.
# 수기 호출 없이도 AI 티·가독성·톤·구두점 검증이 걸리게 하는 것이 목적이다.
#
# 발동 조건은 둘 중 하나다.
#   1. opt-in 마커: 프로젝트 루트(또는 상위)에 .ops-agent/lint.json 이 있다.
#      예전 이름 .ops-agent/content-verify.json 도 함께 읽는다.
#      마커가 없으면 조용히 종료한다 (모든 프로젝트 .md 편집마다 리마인더가 뜨는 노이즈 방지).
#   2. 발행물 경로: `_posts/` 아래 마크다운이면 마커 없이도 발동한다.
#      경로가 곧 "발행 대상" 신호라 노이즈 위험이 다르고, 이 갈래에까지 opt-in 을 요구하면
#      backstop 이 가장 필요한 레포일수록 마커가 없어 조용히 꺼진다.
#
# 마커 스키마 (.ops-agent/lint.json):
#   {
#     "include": ["**/*.md", "resume/*.html"],   // glob (생략 시 ["**/*.md"])
#     "exclude": ["node_modules/**", "CHANGELOG.md"],
#     "note": "프로젝트 추가 안내 (선택)"           // 리마인더에 함께 출력
#   }
#
# 비차단(exit 0) + additionalContext 주입. 차단/재작성은 하지 않는다.
set -euo pipefail

INPUT=$(cat)

command -v jq >/dev/null 2>&1 || exit 0

FP=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FP" ] && exit 0

# --- 발행물 판정: 마커 탐색보다 먼저 한다 ---
# 마커 없이도 통과하는 유일한 갈래이므로 게이트 앞에 둔다.
post_doc=""
post_root=""
case "$FP" in
  */_posts/*.md) post_doc=1 ;;
esac
if [ -n "$post_doc" ]; then
  d=$(dirname "$FP")
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    if [ -d "$d/_posts" ]; then post_root="$d"; break; fi
    d=$(dirname "$d")
  done
fi

# --- 마커 탐색: FP 디렉토리부터 위로 올라가며 마커를 찾는다 ---
# 이름이 lint.json 으로 바뀐 뒤에도 예전 이름을 같이 읽는다. 마커가 없으면 이 hook 은
# 조용히 종료하므로, 이름만 바꾸면 소비 레포에서 아무 신호 없이 점검이 꺼진다.
dir=$(dirname "$FP")
marker=""
root=""
while [ "$dir" != "/" ] && [ -n "$dir" ]; do
  for name in lint.json content-verify.json; do
    if [ -f "$dir/.ops-agent/$name" ]; then
      marker="$dir/.ops-agent/$name"
      root="$dir"
      break
    fi
  done
  [ -n "$marker" ] && break
  dir=$(dirname "$dir")
done
if [ -z "$marker" ]; then
  # 마커가 없으면 발행물 갈래만 남고 나머지는 종료한다.
  [ -z "$post_doc" ] && exit 0
  root="${post_root:-$(dirname "$FP")}"
fi

# --- include/exclude glob 매칭 (마커 기준 상대 경로) ---
# 마커가 없는 발행물 갈래에는 판정할 설정이 없으므로 통과시킨다.
# 마커가 있으면 발행물이어도 exclude 를 존중한다. 명시적 설정은 사람의 판단이다.
rel="${FP#"$root"/}"
NOTE=""

if [ -n "$marker" ]; then
  MATCH=$(MARKER="$marker" REL="$rel" python3 <<'PYEOF'
import json, os, fnmatch, sys
marker = os.environ["MARKER"]
rel = os.environ["REL"]
try:
    with open(marker) as f:
        cfg = json.load(f)
except Exception:
    print("no"); sys.exit(0)
include = cfg.get("include") or ["**/*.md"]
exclude = cfg.get("exclude") or []
def m(globs):
    for g in globs:
        if fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(rel, g.replace("**/", "")):
            return True
    return False
print("yes" if (m(include) and not m(exclude)) else "no")
PYEOF
)
  [ "$MATCH" != "yes" ] && exit 0
  NOTE=$(MARKER="$marker" python3 -c 'import json,os;print(json.load(open(os.environ["MARKER"])).get("note","") or "")' 2>/dev/null || true)
fi

BASE="${FP##*/}"

# --- 표현 검출 (즉시 잡히는 어휘 위반) ---
# 코드블록은 제외한다. 규칙 자체를 예시로 인용한 JSON·설정이 걸려 노이즈가 된다.
PROSE=$(awk '/^```/{c=!c; next} !c' "$FP" 2>/dev/null || true)

viol=""
if printf '%s' "$PROSE" | grep -q "—" 2>/dev/null; then
  viol="${viol} em dash(—) 발견: 마침표/쉼표로 분리."
fi
if printf '%s' "$PROSE" | grep -qE "을 통해|를 통해|활용하여|활용한|포괄적|체계적|효율적|원활(한|히|하게|함)" 2>/dev/null; then
  viol="${viol} AI 슬롭 표현 의심(을/를 통해, 활용, 포괄적, 효율적, 원활 등): 직접 동사로."
fi

# --- 구조 검출 (readability.md 의 자동 판별 `가능` 항목) ---
# 표현 정규식은 어휘만 본다. 산문이 몇 문단 쌓였는지는 세어야 알 수 있다.
# 검출 결과를 수치로 넘겨, 리마인더가 "점검하라" 가 아니라 "여기가 몇이다" 가 되게 한다.
struct=""
case "$FP" in
  *.md)
    counter=""
    for cand in \
      "${CLAUDE_PLUGIN_ROOT:-}/config/style-rules/metrics/readability_count.py" \
      "$(dirname "$0")/../config/style-rules/metrics/readability_count.py"
    do
      [ -n "$cand" ] && [ -f "$cand" ] && counter="$cand" && break
    done
    if [ -n "$counter" ]; then
      # 종료 코드 1 = 검출 있음. set -e 에 걸리지 않게 받는다.
      struct=$(python3 "$counter" "$FP" 2>/dev/null || true)
    fi
    ;;
esac

# --- 독자 판정: 에이전트가 읽는 문서면 authoring 축을 함께 지시한다 ---
#
# 같은 마크다운이라도 읽는 쪽이 사람인지 모델인지에 따라 걸리는 규칙이 다르다.
# 네 축(ai-tells·readability·tone·punctuation)은 사람이 읽는 한국어 산문을 다루고
# authoring(AU1~AU6)은 모델이 읽는 문서를 다룬다. 판정 없이 네 축만 지시하면
# SKILL.md 를 편집해도 포인터 문구·정보 계층·완료 조건이 점검 대상에 들어오지 않는다.
#
# 경로로 판정한다. 파일 내용으로 추론하면 같은 파일이 편집마다 다르게 잡힌다.
agent_doc=""
case "$rel" in
  SKILL.md|*/SKILL.md) agent_doc=1 ;;
  CLAUDE.md|*/CLAUDE.md|AGENTS.md|*/AGENTS.md) agent_doc=1 ;;
  skills/*|*/skills/*) agent_doc=1 ;;
  providers/*|*/providers/*) agent_doc=1 ;;
  agents/*|*/agents/*) agent_doc=1 ;;
esac

# --- 발행물: 대상 레포의 하우스 규칙을 편집 시점에 띄운다 ---
#
# 하우스 규칙(front matter 필수 필드·요약 블록 마크업·필수 푸터·날짜 규칙)을 지키는
# 로직은 publish Phase 5 에 있다. 그런데 그 스킬을 거치지 않고 파일을 직접
# 만드는 경로(수기 작성·다른 스킬 경유·직접 편집)에는 아무 backstop 이 없어서,
# 규칙 누락이 발행 직전 사람 눈에서야 잡힌다. 집행 지점에서 규칙의 소재를 알린다.
# post_doc·post_root 판정은 마커 게이트 앞에서 이미 끝났다.
#
# 미래 날짜는 기계적으로 판정한다. Jekyll `future: false` 에서 빌드 제외 → 배포 404 이고,
# 발행 후에 발견하면 되돌리는 비용이 크다. 나머지 규칙은 대상 CLAUDE.md 로 보낸다.
post_note=""
if [ -n "$post_doc" ]; then
  post_note=$(python3 - "$FP" <<'PY' 2>/dev/null || true
import datetime, re, sys
try:
    head = open(sys.argv[1], encoding="utf-8").read(2000)
except OSError:
    sys.exit(0)
m = re.search(r"^date:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s*([+-]\d{4})?", head, re.M)
if not m:
    print("front matter `date` 없음. 대상 레포 규칙 확인 필요")
    sys.exit(0)
tz = m.group(2) or "+0900"
stamp = datetime.datetime.strptime(
    f"{m.group(1).replace('T', ' ')} {tz}", "%Y-%m-%d %H:%M:%S %z")
now = datetime.datetime.now(stamp.tzinfo)
if stamp > now:
    print(f"date 가 미래다 ({stamp:%Y-%m-%d %H:%M:%S %z} > 현재 {now:%Y-%m-%d %H:%M:%S %z}). "
          "Jekyll future:false 에서 빌드 제외되어 배포 404 가 난다. 현재보다 과거로 내려라")
PY
)
fi

msg="[lint 하네스] ${BASE} 편집됨. 수기 호출 없이 lint 관점으로 자가 점검하라: "
msg="${msg}AI 티(style-rules base/ai-tells), 가독성(readability), 저자 톤(tone), 한국어 구두점(punctuation). "
msg="${msg}구조를 먼저 본다: 문서가 세운 전제와 문서의 구성 방식이 어긋나는 쌍이 있는가(purpose PU5). "
msg="${msg}걸리면 통째로 빠질 절이므로 문장 교정보다 이쪽이 먼저다. "
if [ -n "$agent_doc" ]; then
  msg="${msg}[에이전트가 읽는 문서] authoring(base/authoring.md AU1~AU6) 도 함께 적용하라: "
  msg="${msg}포인터 문구가 갈래당 하나인가(AU1) · 일부 갈래만 쓰는 참조가 단계를 덮고 있는가(AU3) · "
  msg="${msg}각 단계의 끝을 판별할 수 있고 빠뜨림이 드러나는가(AU4) · 금지형만 있고 목표 동작이 없는 지시가 있는가(AU5) · "
  msg="${msg}환경을 옮겨 적은 줄과 기본값과 같은 지시가 있는가(AU6). "
  msg="${msg}두 묶음이 충돌하면 읽는 쪽을 기준으로 authoring 이 이긴다. "
fi
if [ -n "$post_doc" ]; then
  msg="${msg}[발행물] 대상 레포의 하우스 규칙을 적용하라"
  if [ -n "$post_root" ] && [ -f "$post_root/CLAUDE.md" ]; then
    msg="${msg} (정본: ${post_root}/CLAUDE.md 포스팅 규칙)"
  fi
  msg="${msg}: front matter 필수 필드 · 요약 블록 마크업(테마 고유 형식이 있으면 범용 헤딩보다 우선) · "
  msg="${msg}본문 최하단 필수 표기 · date 규칙. 이 네 가지는 범용 기본값과 다를 수 있다. "
  msg="${msg}publish 를 거치지 않은 경로에서도 동일하게 적용된다. "
  [ -n "$post_note" ] && msg="${msg}[date 검출] ${post_note} "
fi
msg="${msg}SSOT: ~/.claude/ops-agent/style-rules/. 위반은 즉시 교정, 사실/주장/코드 로직은 보존."
[ -n "$NOTE" ] && msg="${msg} [프로젝트 노트] ${NOTE}"
[ -n "$viol" ] && msg="${msg} [표현 검출]${viol}"
if [ -n "$struct" ]; then
  count=$(printf '%s\n' "$struct" | grep -c . || true)
  msg="${msg} [구조 검출 ${count}건] $(printf '%s' "$struct" | tr '\n' ' ')"
  msg="${msg} 표·목록으로 바꿀지 먼저 판단하라. 규칙 정본: readability.md."
fi

jq -cn --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
exit 0
