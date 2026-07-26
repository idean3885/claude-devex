#!/usr/bin/env python3
"""AI 티 슬림 카운터 — baseline·외부 의존 없는 순수 정량 지표.

일부 로직을 epoko77-ai/im-not-ai (MIT) metrics_v2.py 에서 재구현했다.
우리 SSOT 맥락에 맞게 baseline 의존을 제거했다: z-score·합성 지수
(interference_index/post-editese)·baseline 비교는 baseline 코퍼스가
부재하므로 전부 제외하고, baseline 없이도 자기완결로 계산 가능한
순수 카운터만 추출·재구현했다.

원본 저작권 고지 (MIT):
    Copyright (c) epoko77-ai/im-not-ai contributors.
    본 파일은 im-not-ai 의 metrics_v2.py / metrics.py 로직 일부를
    재구현한 파생물이며 MIT License 조건을 계승한다.

하드 룰: Python 3 표준 라이브러리만 사용 (difflib/re/json/argparse/sys 등).
외부 패키지·baseline json·다른 모듈 import 없음. 형태소 분석은 정규식 +
접미사/표층 사전으로 근사한다. Levenshtein 은 difflib.SequenceMatcher 로 대체.

각 카운터가 대응하는 우리 SSOT 패턴은 config/style-rules/base/ai-tells.md 참조:
    change_rate                       → 4대 철칙 #4 (변경률 게이트 SSOT)
    double_passive_count              → A-4 이중 피동 (S1)
    double_particle_count             → A-9 이중 조사 (S2)
    pronoun_density                   → A-6 대명사 강박 매핑 (S2)
    have_make_literal_count           → A-7 Light verb 분리 구문 (S2)
    trailing_comma_conjunction_count  → C-5 연결어미 뒤 쉼표 (S1)
    comma_ratio                       → C-6 쉼표 포함률 과다 (S2)
    antithesis_count                  → C-10 대칭 대구 (S1 구조 게이트, 신규)

한국어 처리 근사:
    - 어절: 공백 기준 분리 후 양끝 구두점 제거
    - 문장: [.!?…] 및 줄바꿈 기준 단순 분리
    - 코드 블록(``` / ~~~ fence)·인라인 코드(`...`)는 카운트에서 제외
      (ai-tells.md Do-NOT 리스트 준수)

CLI:
    python3 tells_count.py <파일경로>              # 전 지표 JSON → stdout
    python3 tells_count.py --before A --after B    # change_rate 단독 계산
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from typing import Any

VERSION = "slim-1.0"

# ---------------------------------------------------------------------------
# 정규식·표층 사전 상수
# ---------------------------------------------------------------------------

# 문장 경계: . ! ? … + 줄바꿈. 세미콜론은 한국어에서 드물어 제외.
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[\.!?…])\s+|\n+")

# 어절 분리(공백) 및 양끝 구두점 제거.
_EOJEOL_SPLIT_RE = re.compile(r"\s+")
_PUNCT_STRIP_RE = re.compile(r"[\.,!?;:\(\)\[\]\{\}\"'`~、。“”‘’\-]+")

# 코드 블록(펜스)·인라인 코드 제거용.
_FENCE_RE = re.compile(r"(?ms)^[ \t]*(?:```|~~~).*?(?:^[ \t]*(?:```|~~~)[ \t]*$|\Z)")
_INLINE_CODE_RE = re.compile(r"`[^`\n]*`")

# A-4 이중 피동 표층 어휘. 단순 "되다" 는 정상 표현이므로 제외.
_DOUBLE_PASSIVE_TOKENS = (
    "되어진다", "되어졌다", "되어진", "되어지는",
    "여지다", "여진다", "여졌다", "여진",
    "잊혀진", "잊혀졌", "잊혀진다",
    "보여진다", "보여졌다", "보여진",
    "쓰여진다", "쓰여졌다", "쓰여진",
    "닫혀진", "열려진", "불려진", "놓여진",
    "지어진다", "지어졌다", "지어진",
)

# A-9 이중 조사 결합 6종. 단일 ~의는 구조상 절대 매칭 안 됨.
_DOUBLE_PARTICLE_RE = re.compile(r"(?:에서의|에로의|으로의|에의|으로부터의|로부터의)")

# A-6 인칭 대명사 — 영어 he/she/it/they 1대1 매핑.
# "그" 단독은 지시사·관형사로도 쓰이므로, 뒤에 조사가 붙은 경우만 인칭으로 본다.
# 그녀/그것/그들 은 거의 항상 인칭이므로 단독 매칭.
_PRONOUN_RE = re.compile(
    r"(?:그녀(?:는|가|를|의|에게|와|도|만)?"
    r"|그것(?:은|이|을|의|에|에게)?"
    r"|그들(?:은|이|을|의|에게|과|도)?"
    r"|그(?:는|가|를|의|에게|와|도|만)(?=\s|[\.,!?…]|$))"
)

# A-7 light verb 직역(have/make 류) 표층 어휘.
_HAVE_MAKE_LITERAL_TOKENS = (
    "가지고 있다", "가지고있다", "가지고 있는", "가지고있는",
    "가지고 있었", "가지고있었", "가지고 있으", "가지고있으",
    "갖고 있다", "갖고있다", "갖고 있는", "갖고있는",
    "을 가지다", "를 가지다", "을 가졌", "를 가졌",
    "을 가진다", "를 가진다",
    "을 만들다", "를 만들다", "을 만들었", "를 만들었",
    "을 만들어 낸", "를 만들어 낸", "을 만들어낸", "를 만들어낸",
    "을 만들어 준다", "를 만들어 준다", "을 만들어준다", "를 만들어준다",
    "회의를 가지", "회의를 가졌", "결정을 내리", "결정을 내렸",
)

# C-5 연결어미(-고/-며/-지만/-면서/-아서/-어서) 뒤 쉼표.
_TRAILING_COMMA_CONJ_RE = re.compile(r"(?:고|며|지만|면서|아서|어서)\s*,")

# C-10 대칭 대구 표층형: "X가/이 아니라 Y", "A인가, B인가", "~이기 이전에",
# "~되기 이전에", "~이기보다". 사람 글에도 흔한 정상 수사이므로 절대치
# 판정 금지 — before/after 전멸(대구 몰살) 게이트의 진단 앵커로만 쓴다.
_ANTITHESIS_RE = re.compile(
    r"(?:가|이)\s*아니라"
    r"|[가-힣]+인가\s*,\s*[가-힣]+인가"
    r"|이기\s*이전에|되기\s*이전에|이기보다"
)

# 4대 철칙 #4 게이트 임계값. change_rate() 반환값과 직접 비교한다.
CHANGE_RATE_WARN = 0.30   # 30% 초과 — 경고, 과윤문 점검
CHANGE_RATE_ABORT = 0.50  # 50% 초과 — 강제 중단

# 마크업 전용 줄(코드 펜스·수평선·표 구분선)과 줄머리 장식 — ignore_markup 모드용.
_MARKUP_ONLY_LINE_RE = re.compile(
    r"^\s*(?:```.*|~~~.*|-{3,}|\*{3,}|={3,}|\|[\s:\-|]*)\s*$"
)
_MARKUP_PREFIX_RE = re.compile(r"^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d{1,3}[.)]\s+)")


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------


def strip_code(text: str) -> str:
    """코드 블록(펜스)·인라인 코드를 제거한다 (ai-tells.md Do-NOT 준수)."""
    text = _FENCE_RE.sub("\n", text)
    text = _INLINE_CODE_RE.sub(" ", text)
    return text


def _split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]


def _eojeols(text: str) -> list[str]:
    return [tok for tok in _EOJEOL_SPLIT_RE.split(text.strip()) if tok]


def _strip_punct(token: str) -> str:
    return _PUNCT_STRIP_RE.sub("", token)


def _all_tokens(text: str) -> list[str]:
    toks = [_strip_punct(t) for t in _eojeols(text)]
    return [t for t in toks if t]


def _strip_markup(text: str) -> str:
    """마크업 전용 줄을 버리고 줄머리 장식을 벗기되 본문은 보존한다."""
    kept: list[str] = []
    for line in text.splitlines():
        if _MARKUP_ONLY_LINE_RE.match(line):
            continue
        kept.append(_MARKUP_PREFIX_RE.sub("", line))
    return "\n".join(kept)


# ---------------------------------------------------------------------------
# 1. change_rate — 4대 철칙 #4 변경률 게이트 SSOT
# ---------------------------------------------------------------------------


def change_rate(before: str, after: str, ignore_markup: bool = False) -> float:
    """윤문 전후 문자 기반 변경률 — 4대 철칙 #4 게이트의 SSOT.

    이 반환값이 변경률의 단일 진실 원천이며 에이전트 눈대중 산출을 대체한다.
    계산은 difflib.SequenceMatcher 문자 단위 유사도의 보수(1 - ratio)로,
    Levenshtein 편집거리 비율의 표준 라이브러리 대체다. 0.0(동일) ~ 1.0(전면 교체).

    ignore_markup=True 이면 양쪽에서 마크업 전용 줄(코드 펜스·수평선·표 구분선)을
    제거하고 줄머리 장식(헤딩 #·불릿·번호·인용 >)을 벗긴 뒤 비교한다 — 마크업 삭제가
    본문 변경률을 부풀리는 문제 보정용. 기본값은 순수 문자 diff.
    """
    if ignore_markup:
        before = _strip_markup(before)
        after = _strip_markup(after)
    if not before and not after:
        return 0.0
    matcher = difflib.SequenceMatcher(None, before, after, autojunk=False)
    return 1.0 - matcher.ratio()


def change_rate_verdict(rate: float) -> str:
    """change_rate 값을 게이트 판정으로 매핑한다.

    "abort"  : CHANGE_RATE_ABORT(0.50) 초과 — 강제 중단
    "warn"   : CHANGE_RATE_WARN(0.30) 초과 — 경고, 과윤문 점검
    "ok"     : 그 이하 — 통과
    """
    if rate > CHANGE_RATE_ABORT:
        return "abort"
    if rate > CHANGE_RATE_WARN:
        return "warn"
    return "ok"


# ---------------------------------------------------------------------------
# 2. double_passive_count — A-4 이중 피동
# ---------------------------------------------------------------------------


def double_passive_count(text: str) -> int:
    """A-4 이중 피동(되어지다·지어지다·잊혀지다·보여지다 …) 표층 카운트.

    단순 '되다' 는 자연 표현이므로 제외. 표층 어휘 사전 매칭. int >= 0.
    """
    if not text.strip():
        return 0
    return sum(text.count(tok) for tok in _DOUBLE_PASSIVE_TOKENS)


# ---------------------------------------------------------------------------
# 3. double_particle_count — A-9 이중 조사
# ---------------------------------------------------------------------------


def double_particle_count(text: str) -> int:
    """A-9 이중 조사(에서의·에로의·으로의·에의·으로부터의·로부터의) 카운트.

    단일 ~의는 정규식 구조상 절대 매칭되지 않는다. int >= 0.
    """
    if not text.strip():
        return 0
    return len(_DOUBLE_PARTICLE_RE.findall(text))


# ---------------------------------------------------------------------------
# 4. pronoun_density — A-6 대명사 강박 매핑
# ---------------------------------------------------------------------------


def pronoun_density(text: str) -> float:
    """A-6 인칭 대명사(그·그녀·그것·그들) 밀도 — 1000어절당 출현 수.

    '그' 단독은 지시사·관형사와 혼동되므로 조사(는/가/를/의/에게/와/도/만)가
    붙은 경우만 인칭으로 센다. 그녀/그것/그들은 단독 매칭. 어절 0이면 0.0.
    """
    toks = _all_tokens(text)
    if not toks:
        return 0.0
    hits = len(_PRONOUN_RE.findall(text))
    return hits / len(toks) * 1000.0


# ---------------------------------------------------------------------------
# 5. have_make_literal_count — A-7 Light verb 분리 구문
# ---------------------------------------------------------------------------


def have_make_literal_count(text: str) -> int:
    """A-7 light verb 직역(가지고 있다·만들어 준다·~을 가지다 류) 카운트.

    have/make 를 '가지다/만들다 + 보조' 로 분리 번역한 표층형. int >= 0.
    """
    if not text.strip():
        return 0
    return sum(text.count(tok) for tok in _HAVE_MAKE_LITERAL_TOKENS)


# ---------------------------------------------------------------------------
# 6. trailing_comma_conjunction_count — C-5 연결어미 뒤 쉼표
# ---------------------------------------------------------------------------


def trailing_comma_conjunction_count(text: str) -> int:
    """C-5 연결어미 뒤 쉼표(~하고, ~지만, ~면서, …) 카운트.

    -고/-며/-지만/-면서/-아서/-어서 직후에 쉼표가 오는 표층 패턴. int >= 0.
    """
    if not text.strip():
        return 0
    return len(_TRAILING_COMMA_CONJ_RE.findall(text))


# ---------------------------------------------------------------------------
# 7. comma_ratio — C-6 쉼표 포함률 과다
# ---------------------------------------------------------------------------


def comma_ratio(text: str) -> float:
    """C-6 쉼표를 1개 이상 포함한 문장의 비율 (0~1).

    50% 초과 시 호흡 장식 쉼표 과다 신호. 문장 0이면 0.0.
    """
    sents = _split_sentences(text)
    if not sents:
        return 0.0
    with_comma = sum(1 for s in sents if "," in s)
    return with_comma / len(sents)


# ---------------------------------------------------------------------------
# 8. antithesis_count — C-10 대칭 대구 (S1 구조 게이트, 신규)
# ---------------------------------------------------------------------------


def antithesis_count(text: str) -> int:
    """C-10 대칭 대구('A가 아니라 B', 'A인가, B인가' 류) 카운트.

    절대치 판정 금지 — 대구는 사람 글에도 흔한 정상 수사다. 문자 diff가
    못 보는 구조 편집(대구 몰살)을 잡는 진단 앵커로, before>=N & after==0
    전멸 게이트 판정 전용이다. int >= 0.
    """
    if not text.strip():
        return 0
    return len(_ANTITHESIS_RE.findall(text))


# ---------------------------------------------------------------------------
# 집계
# ---------------------------------------------------------------------------


def compute_all(text: str, strip_code_blocks: bool = True) -> dict[str, Any]:
    """전 카운터를 계산해 dict 로 반환한다.

    strip_code_blocks=True(기본) 이면 코드 블록·인라인 코드를 제거한 뒤
    카운트한다 (ai-tells.md Do-NOT 준수). change_rate 는 before/after 전용이므로
    여기 포함하지 않는다.
    """
    scan = strip_code(text) if strip_code_blocks else text
    return {
        "version": VERSION,
        "char_count": len(text),
        "scanned_char_count": len(scan),
        "metrics": {
            "double_passive_count": double_passive_count(scan),          # A-4
            "double_particle_count": double_particle_count(scan),        # A-9
            "pronoun_density_per_1k": pronoun_density(scan),             # A-6
            "have_make_literal_count": have_make_literal_count(scan),    # A-7
            "trailing_comma_conjunction_count":
                trailing_comma_conjunction_count(scan),                  # C-5
            "comma_ratio": comma_ratio(scan),                            # C-6
            "antithesis_count": antithesis_count(scan),                  # C-10
        },
        "thresholds": {
            "change_rate_warn": CHANGE_RATE_WARN,
            "change_rate_abort": CHANGE_RATE_ABORT,
            "comma_ratio_warn": 0.50,
        },
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _resolve_input(value: str) -> str:
    """경로가 실재하면 파일 내용을, 아니면 리터럴 텍스트로 취급한다.

    윤문 중 인메모리 문자열(원문/교정본)을 임시 파일 없이 바로 넘길 수 있게 한다.
    파일명과 같은 짧은 리터럴이 cwd 에 실재하면 파일로 읽히는 경계 케이스가 있으나,
    윤문 대상은 대개 여러 줄 산문이라 실무상 충돌하지 않는다.
    """
    try:
        with open(value, "r", encoding="utf-8") as f:
            return f.read()
    except (OSError, ValueError):
        return value


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="AI 티 슬림 카운터 (baseline·외부 의존 없음)"
    )
    parser.add_argument("path", nargs="?", help="분석할 텍스트 또는 파일 경로")
    parser.add_argument("--before", help="change_rate 단독 계산용 원문 (텍스트 또는 파일 경로)")
    parser.add_argument("--after", help="change_rate 단독 계산용 윤문 (텍스트 또는 파일 경로)")
    parser.add_argument(
        "--ignore-markup", action="store_true",
        help="change_rate 계산 시 마크업 전용 줄·줄머리 장식 제거",
    )
    parser.add_argument(
        "--no-strip-code", action="store_true",
        help="코드 블록·인라인 코드를 제거하지 않고 카운트",
    )
    args = parser.parse_args(argv)

    if args.before is not None or args.after is not None:
        if args.before is None or args.after is None:
            parser.error("--before 와 --after 는 함께 지정해야 합니다")
        before = _resolve_input(args.before)
        after = _resolve_input(args.after)
        rate = change_rate(before, after, ignore_markup=args.ignore_markup)
        out = {
            "change_rate": rate,
            "verdict": change_rate_verdict(rate),
            "thresholds": {
                "warn": CHANGE_RATE_WARN,
                "abort": CHANGE_RATE_ABORT,
            },
            "ignore_markup": args.ignore_markup,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0

    if not args.path:
        parser.error("텍스트·파일 경로 또는 --before/--after 를 지정하세요")

    text = _resolve_input(args.path)
    result = compute_all(text, strip_code_blocks=not args.no_strip_code)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(_main())
