#!/usr/bin/env python3
"""구조 가독성 카운터 — `base/readability.md` 의 자동 판별 `가능` 항목만 센다.

판정하지 않고 수치와 위치만 낸다. 상한값의 정본은 `base/readability.md` 이고
이 스크립트는 그 값을 상수로 복제한다. 규칙을 고치면 양쪽을 함께 고친다.

커버 (자동 판별 `가능`):
  P2 문단 2-4문장 · P4 산문 사이 단문 문단 · P7 산문 5문단 연속
  V2 시각 요소 없이 15-20문장 · L1 목록 3-7항목 · L4 테이블 열 5 이하
  H1 단일 H1 · H2 레벨 건너뛰기 · C1 코드 언어 명시

미커버 (`부분`·`불가`): P1 P3 P5 P8 P10 P11 H4 L2 L3 C2 V1 V3 K3
  기계가 의도를 읽어야 하는 항목이다. 구현하면 과검출로 신뢰가 떨어진다.

사용:
  python3 readability_count.py README.md docs/*.md
종료 코드: 검출 0 이면 0, 있으면 1.
"""
import re
import sys
import pathlib

# 상한값 정본: base/readability.md
MAX_SENT_PER_PARA = 4      # P2
MAX_PROSE_RUN = 5          # P7
MAX_SENT_NO_VISUAL = 20    # V2
MAX_LIST_ITEMS = 7         # L1
MAX_TABLE_COLS = 5         # L4

# 한국어 합쇼체·해요체 종결과 ASCII 문장부호를 문장 경계로 본다.
SENT = re.compile(r"(?:다|요)\.(?=\s|$)|[.!?](?=\s|$)")
LIST_ITEM = re.compile(r"^(?:[-*]\s|\d+\.\s)")


def blocks(text):
    """마크다운을 (종류, 시작줄, 줄들, 코드언어) 블록 목록으로 나눈다."""
    out, buf, kind, start, incode, lang = [], [], None, 0, False, ""
    for i, ln in enumerate(text.split("\n"), 1):
        if ln.startswith("```"):
            if incode:
                out.append(("code", start, buf, lang))
                buf, kind, incode = [], None, False
            else:
                if buf:
                    out.append((kind, start, buf, ""))
                lang = ln[3:].strip()
                buf, kind, start, incode = [], "code", i, True
            continue
        if incode:
            buf.append(ln)
            continue
        s = ln.strip()
        if not s:
            if buf:
                out.append((kind, start, buf, ""))
            buf, kind = [], None
            continue
        if s.startswith("#"):
            k = "heading"
        elif s.startswith("|"):
            k = "table"
        elif LIST_ITEM.match(s):
            k = "list"
        elif s.startswith(">"):
            k = "quote"
        else:
            k = "prose"
        if kind and k != kind:
            out.append((kind, start, buf, ""))
            buf, start = [], i
        if not buf:
            start = i
        kind = k
        buf.append(ln)  # 원문 유지 — 들여쓰기로 중첩 목록을 가른다
    if buf:
        out.append((kind, start, buf, ""))
    return out


def check(path):
    bs = blocks(pathlib.Path(path).read_text())
    hits, prose_run, since_visual, h1, prev_level = [], 0, 0, 0, 0

    for idx, (kind, line, body, lang) in enumerate(bs):
        if kind == "heading":
            level = len(re.match(r"^#+", body[0].strip()).group(0))
            if level == 1:
                h1 += 1
            if prev_level and level > prev_level + 1:
                hits.append((line, "H2", f"헤딩 레벨 {prev_level}→{level} 건너뜀"))
            prev_level, prose_run, since_visual = level, 0, 0
            continue

        if kind == "prose":
            n = len(SENT.findall(" ".join(b.strip() for b in body)))
            prose_run += 1
            since_visual += n
            if n > MAX_SENT_PER_PARA:
                hits.append((line, "P2", f"문단 {n}문장 (상한 {MAX_SENT_PER_PARA})"))
            # P4: 단문 문단은 강조·전환·결론에만. 앞뒤가 모두 산문이면 그 자리가 아니다.
            # 섹션 첫·끝 문단은 그 자리일 수 있어 제외한다. 좁히지 않으면 정상 문단을 대량 검출한다.
            prev_prose = idx > 0 and bs[idx - 1][0] == "prose"
            next_prose = idx + 1 < len(bs) and bs[idx + 1][0] == "prose"
            if n <= 2 and prev_prose and next_prose:
                hits.append((line, "P4", f"산문 사이에 낀 단문 문단 ({n}문장)"))
            if prose_run >= MAX_PROSE_RUN:
                hits.append((line, "P7", f"소제목 없이 산문 {prose_run}문단 연속"))
            if since_visual > MAX_SENT_NO_VISUAL:
                hits.append((line, "V2", f"시각 요소 없이 약 {since_visual}문장 경과"))
            continue

        prose_run, since_visual = 0, 0

        if kind == "list":
            # 최상위 항목만 센다. 중첩 항목은 부모에 속하므로 L1 대상이 아니다.
            items = [b for b in body if LIST_ITEM.match(b)]
            if len(items) > MAX_LIST_ITEMS:
                hits.append((line, "L1", f"목록 {len(items)}항목 (상한 {MAX_LIST_ITEMS})"))
        elif kind == "table":
            cols = len(body[0].strip().strip("|").split("|"))
            if cols > MAX_TABLE_COLS:
                hits.append((line, "L4", f"테이블 열 {cols}개 (상한 {MAX_TABLE_COLS})"))
        elif kind == "code" and not lang:
            hits.append((line, "C1", "코드 블록에 언어 미명시"))

    if h1 > 1:
        hits.append((1, "H1", f"H1 {h1}개 (하나만)"))
    return hits


def main(argv):
    if not argv:
        print(__doc__)
        return 0
    total = 0
    for p in argv:
        try:
            hits = check(p)
        except OSError as e:
            print(f"{p}: 읽기 실패 ({e})", file=sys.stderr)
            continue
        total += len(hits)
        for line, rule, msg in sorted(hits):
            print(f"{p}:{line} [{rule}] {msg}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
