#!/usr/bin/env python3
"""CHANGELOG.md 의 Unreleased 적립과 릴리즈 확정.

`bump-version.sh` 가 부른다. 파일 조작과 검사를 여기 모은 이유는 bash 로 절 단위를
찾아 넣는 코드가 길어지고, 길어진 만큼 조용히 어긋나기 때문이다.

검사는 통과가 아니라 **실패**로 알린다. 경고만 하면 그대로 쌓인다 (#409).
"""
import os
import pathlib
import re
import sys
from datetime import date

ANCHOR = '<!-- bump-version.sh 삽입 지점 -->'
UNRELEASED = '## [Unreleased]'
# Keep a Changelog 1.1.0 의 분류와 그 배치 순서.
CATEGORIES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']
# 커밋 타입 → 분류. refactor·chore 는 넣지 않는다. 사용자에게 보이는 영향이 있을 때만
# 카테고리를 직접 지정해 넣는다. 이 레포는 규칙 문서 자체가 제품이라 docs 는 통과다.
TYPE_MAP = {
    'feat': 'Added',
    'fix': 'Fixed',
    'docs': 'Changed', 'ci': 'Changed', 'perf': 'Changed',
    'style': 'Changed', 'test': 'Changed', 'build': 'Changed',
}
CURATED_OUT = ('refactor', 'chore')


def die(msg, *hints):
    print('✘ ' + msg, file=sys.stderr)
    for h in hints:
        print('  ' + h, file=sys.stderr)
    sys.exit(1)


def changelog_path():
    return pathlib.Path(os.environ['ROOT_DIR'], 'CHANGELOG.md')


def split_head(text):
    """앵커를 기준으로 헤더와 본문을 나눈다."""
    if ANCHOR not in text:
        die('CHANGELOG.md 에서 삽입 앵커를 찾지 못했습니다: ' + ANCHOR,
            '헤더에 앵커 주석을 복원한 뒤 다시 실행하세요. (파일은 변경되지 않았습니다)')
    head, body = text.split(ANCHOR, 1)
    return head + ANCHOR, body


def unreleased_block(body):
    """Unreleased 절의 (시작, 끝) 인덱스. 없으면 None.

    **앵커 바로 다음 절만 본다.** 파일 어디서나 찾으면 끊지 않고 남은 옛 Unreleased 에
    붙는다. 실제로 5.6.0 아래에 잔재가 있어 새 항목이 파일 중간에 쌓였다 (#409).
    """
    m = re.search(r'^## \[', body, re.M)
    if not m or not body.startswith('## [Unreleased]', m.start()):
        return None
    head_end = m.start() + len('## [Unreleased]')
    nxt = re.search(r'^## \[', body[head_end:], re.M)
    end = head_end + nxt.start() if nxt else len(body)
    return m.start(), end


def parse_type(entry):
    """`feat(scope)!: 본문` → ('feat', True, '본문'). 접두가 없으면 (None, False, 원문)."""
    m = re.match(r'^([a-z]+)(\([^)]*\))?(!)?:\s*(.+)$', entry, re.S)
    if not m:
        return None, 'BREAKING CHANGE' in entry or 'BREAKING-CHANGE' in entry, entry
    t, _scope, bang, rest = m.groups()
    breaking = bool(bang) or 'BREAKING CHANGE' in entry or 'BREAKING-CHANGE' in entry
    if t not in TYPE_MAP and t not in CURATED_OUT:
        return None, breaking, entry
    return t, breaking, rest.strip()


def cmd_add():
    entry = os.environ['ENTRY'].strip()
    cat_arg = os.environ.get('CATEGORY_ARG', '').strip()

    if '—' in entry or '―' in entry:
        die('항목에 em dash 가 있습니다. tone.md T1 의 합격선은 0 입니다.',
            '대체: 마침표 · 쉼표 · 괄호 · 줄바꿈',
            '항목: ' + entry)
    if not re.search(r'#\d+', entry):
        die('항목에 이슈 번호가 없습니다.',
            '어떤 논의에서 나온 변경인지 추적할 수 없습니다. `(#409)` 형태로 붙이세요.',
            '항목: ' + entry)

    ctype, breaking, text = parse_type(entry)

    if cat_arg:
        if cat_arg not in CATEGORIES:
            die('유효하지 않은 카테고리: ' + cat_arg, '가능한 값: ' + ' '.join(CATEGORIES))
        category = cat_arg
    elif breaking:
        # 파괴 변경은 기존 동작이 바뀌었다는 뜻이므로 Changed 로 둔다.
        category = 'Changed'
    elif ctype in CURATED_OUT:
        die(f'`{ctype}` 는 기본 제외입니다. 사용자에게 보이는 영향이 없으면 적지 않습니다.',
            '영향이 있으면 카테고리를 직접 지정하세요:',
            f"  bump-version.sh add '{text}' Changed")
    elif ctype in TYPE_MAP:
        category = TYPE_MAP[ctype]
    else:
        die('카테고리를 유도할 수 없습니다.',
            '커밋 타입 접두(feat:, fix: 등)를 붙이거나 카테고리를 인자로 넘기세요.',
            '가능한 값: ' + ' '.join(CATEGORIES),
            '항목: ' + entry)

    line = '* ' + ('**BREAKING** ' + text if breaking else text)

    p = changelog_path()
    head, body = split_head(p.read_text(encoding='utf-8'))
    span = unreleased_block(body)
    if span is None:
        body = '\n\n' + UNRELEASED + '\n' + body.lstrip('\n')
        span = unreleased_block(body)
    start, end = span
    block = body[start:end]

    sub = re.search(r'^### %s\s*$' % re.escape(category), block, re.M)
    if sub:
        nxt = re.search(r'^### ', block[sub.end():], re.M)
        ins = sub.end() + (nxt.start() if nxt else len(block) - sub.end())
        block = block[:ins].rstrip('\n') + '\n' + line + '\n\n' + block[ins:].lstrip('\n')
    else:
        # 분류는 Keep a Changelog 순서로 배치한다. 순서가 흔들리면 같은 절을 찾는 눈이 매번 새로 훑는다.
        later = [c for c in CATEGORIES[CATEGORIES.index(category) + 1:]
                 if re.search(r'^### %s\s*$' % re.escape(c), block, re.M)]
        new_sub = '### %s\n%s\n\n' % (category, line)
        if later:
            at = re.search(r'^### %s\s*$' % re.escape(later[0]), block, re.M).start()
            block = block[:at] + new_sub + block[at:]
        else:
            block = block.rstrip('\n') + '\n\n' + new_sub
    p.write_text(head + body[:start] + block + body[end:], encoding='utf-8')
    print('✔ Unreleased · %s 에 적립' % category)
    print('  ' + line)


def cmd_release():
    ver = os.environ['NEW_VERSION']
    prev = os.environ.get('PREV_VERSION', '')
    p = changelog_path()
    head, body = split_head(p.read_text(encoding='utf-8'))

    span = unreleased_block(body)
    if span is None:
        die('Unreleased 섹션이 없습니다.', "먼저 적립하세요: bump-version.sh add '<항목>'")
    start, end = span
    block = body[start:end]
    if not re.search(r'^\* ', block, re.M):
        die('Unreleased 가 비어 있습니다.', "끊을 것이 없습니다. 먼저 적립하세요: bump-version.sh add '<항목>'")

    if '**BREAKING**' in block and prev and prev.split('.')[0] == ver.split('.')[0]:
        print('⚠ 파괴 변경이 쌓여 있으나 MAJOR 가 오르지 않았습니다 (%s → %s).' % (prev, ver),
              file=sys.stderr)
        print('  소비 측이 버전만 보고 알 수 없습니다. 의도한 것이면 그대로 진행됩니다.', file=sys.stderr)

    released = block.replace(UNRELEASED, '## [%s] - %s' % (ver, date.today().isoformat()), 1)
    new_body = '\n\n' + UNRELEASED + '\n\n' + released.strip('\n') + '\n\n' + body[end:]
    p.write_text(head + new_body, encoding='utf-8')
    print('✔ Unreleased → [%s] 로 끊음 (%d건)' % (ver, len(re.findall(r'^\* ', block, re.M))))


if __name__ == '__main__':
    {'add': cmd_add, 'release': cmd_release}[sys.argv[1]]()
