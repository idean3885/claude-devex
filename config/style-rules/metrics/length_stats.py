#!/usr/bin/env python3
"""유형별 분량 기준값 측정 — 착수 전 하한·상한을 실측으로 잡는 도구.

`base/length.md` 의 기준값 결정과 `base/purpose.md` 계획 게이트의 분량 항목이 이 값을 쓴다.
실측 없이 적은 상한은 두 방향으로 퇴고를 왜곡한다: 낮으면 필요한 내용을 깎고, 높으면
아무것도 제약하지 않는다. 그래서 값을 추측하지 않고 같은 유형의 기존 산출물에서 뽑는다.

단위는 **행**이다. 같은 코퍼스를 행과 글자로 재서 행의 분산이 작았다 (변동계수 0.57 대
0.65, 9개 유형 중 7개). 코드 블록과 front matter 는 세지 않는다 (length.md 적용 범위).

기준값은 **중앙값**이다. 평균은 한 편의 이상치에 끌려간다. 실측에서 어떤 유형은 평균이
중앙값보다 92% 높았다.

사용:
    length_stats.py 'docs/adr/*.md'
    length_stats.py 'docs/*.md' 'README.md'          # 여러 패턴을 한 유형으로 묶는다
    length_stats.py --json 'skills/*/SKILL.md'
    gh issue list --state all --limit 200 --json body | length_stats.py --stdin-json

하드 룰: Python 3 표준 라이브러리만 사용.
"""
import argparse
import glob
import io
import json
import statistics as st
import sys

MIN_SAMPLES = 3


def strip_front_matter(text):
    """YAML front matter 를 걷는다. 발행 메타는 산출물 분량이 아니다."""
    if not text.startswith('---'):
        return text
    parts = text.split('\n---', 2)
    return parts[1].lstrip('-\n') if len(parts) >= 2 else text


def count_lines(text):
    """코드 블록을 뺀 행 수. 빈 행은 남긴다 — 문단 경계가 읽는 부담의 일부다."""
    body, in_code = [], False
    for line in strip_front_matter(text).split('\n'):
        if line.strip().startswith('```'):
            in_code = not in_code
            continue
        if not in_code:
            body.append(line)
    return len(body)


def percentile(sorted_values, q):
    """하위 q 분위. 표본이 적으면 최솟값·최댓값으로 수렴한다."""
    if not sorted_values:
        return 0
    idx = max(0, int(len(sorted_values) * q) - 1)
    return sorted_values[min(idx, len(sorted_values) - 1)]


def summarize(counts):
    counts = sorted(counts)
    n = len(counts)
    median = st.median(counts)
    lo, hi = median * 0.5, median * 1.5
    return {
        'n': n,
        'floor': percentile(counts, 0.1) if n >= 10 else counts[0],
        'median': round(median),
        'cap': percentile(counts, 0.9),
        'min': counts[0],
        'max': counts[-1],
        'mean': round(st.mean(counts)),
        # 실측 범위가 중앙값 ±50% 안에 얼마나 들어오는지. length.md 의 허용 폭과 같은 대역이다.
        'within_band': round(sum(1 for v in counts if lo <= v <= hi) / n, 2),
        'enough': n >= MIN_SAMPLES,
    }


def main():
    ap = argparse.ArgumentParser(description='유형별 분량 기준값(행) 측정')
    ap.add_argument('patterns', nargs='*', help='한 유형으로 묶을 glob 패턴')
    ap.add_argument('--json', action='store_true', help='JSON 으로 출력')
    ap.add_argument('--stdin-json', action='store_true',
                    help='표준 입력의 JSON 배열을 읽는다. 문자열 배열이거나 body 키를 가진 객체 배열'
                         ' (`gh issue list --json body` 출력을 그대로 받는다)')
    args = ap.parse_args()

    counts = []
    if args.stdin_json:
        # 구분자로 나누지 않는다. 본문에 어떤 문자가 들어올지 정해지지 않고,
        # NUL 은 인자로 넘길 수도 없다. 경계를 입력 형식이 갖는다.
        try:
            items = json.loads(sys.stdin.read() or '[]')
        except json.JSONDecodeError as e:
            print(f'표준 입력이 JSON 이 아니다: {e}', file=sys.stderr)
            return 2
        for it in items:
            body = it if isinstance(it, str) else (it or {}).get('body') or ''
            if body.strip():
                counts.append(count_lines(body))
    for pattern in args.patterns:
        for path in sorted(glob.glob(pattern, recursive=True)):
            try:
                counts.append(count_lines(io.open(path, encoding='utf-8').read()))
            except (OSError, UnicodeDecodeError) as e:
                print(f'건너뜀: {path} ({e})', file=sys.stderr)

    if not counts:
        print('대상 없음', file=sys.stderr)
        return 2

    s = summarize(counts)
    if args.json:
        print(json.dumps(s, ensure_ascii=False))
    elif not s['enough']:
        print(f"표본 {s['n']}편 — {MIN_SAMPLES}편 미만이므로 기준값을 내지 않는다.")
        print('상한을 적지 않고 LN1·LN2 만 적용한다. 표본 없이 만든 상한은 근거가 아니라 추측이다.')
    else:
        print(f"표본 {s['n']}편 · 실측 {s['min']}~{s['max']}행")
        print(f"하한 {s['floor']}행 · 중앙 {s['median']}행 · 상한 {s['cap']}행")
        print(f"중앙값 ±50% 대역 포함률 {s['within_band']:.0%}"
              f" · 평균 {s['mean']}행 ({(s['mean'] - s['median']) / s['median']:+.0%})")
        if s['within_band'] < 0.8:
            print('포함률이 낮다 — 이 유형은 편차가 크다. 상한을 넘겨도 원인부터 가린다 (length.md 2단계)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
