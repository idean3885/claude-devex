#!/usr/bin/env bash
# pre-merge-check.sh: 머지 전 버전 대조 (flow GATE 6).
#
# 원격 브랜치와 타겟의 버전 파일을 비교하고 CHANGELOG 버전 헤더 중복을 본다.
#
# 버전이 같은 것은 정상이다. 적립 PR 은 Unreleased 에 항목만 쌓고 버전을 올리지 않는다.
# 막는 것은 **뒤로 미는 것** 하나다. 브랜치가 타겟보다 오래된 베이스 위에서 범프하면
# 머지가 타겟의 버전을 낮춘다 (#409 이전에는 「같으면 멈춤」이라 적립 PR 을 전부 막았다).
# 검출하면 종료 코드 1, 통과하면 0 이다. `&& gh pr merge` 로 물리면 검출 시 머지가 실행되지
# 않는다. 판정을 문자열로만 알리면 출력을 읽지 않은 채 다음 명령이 실행된다 (#386).
#
# 사용: pre-merge-check.sh [branch] [target]
#   branch  기본값 현재 브랜치
#   target  기본값 origin/HEAD 가 가리키는 브랜치, 없으면 main
#
# 환경변수:
#   VERSION_FILE    버전 파일 이름 (기본 VERSION). 이 이름의 파일이 없으면 버전 비교를 건너뛴다
#   CHANGELOG_FILE  체인지로그 파일 이름 (기본 CHANGELOG.md)
#
# 로컬 작업 트리가 아니라 **원격 브랜치의 내용**을 본다. 푸시하지 않은 로컬 리베이스는
# PR 에 반영되지 않는데 머지 가능으로 보인다. 그 상태를 통과시킨 사고가 이 검사의 출발점이다.
set -uo pipefail

VERSION_FILE="${VERSION_FILE:-VERSION}"
CHANGELOG_FILE="${CHANGELOG_FILE:-CHANGELOG.md}"

branch="${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
if [ -z "${2:-}" ]; then
  target=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
  target="${target:-main}"
else
  target="$2"
fi

if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
  echo "멈춤: 브랜치를 정할 수 없다 (detached HEAD). 첫 인자로 브랜치를 넘긴다" >&2
  exit 1
fi
if [ "$branch" = "$target" ]; then
  echo "멈춤: 브랜치와 타겟이 같다 ($branch)" >&2
  exit 1
fi

git fetch -q origin || { echo "멈춤: git fetch 실패" >&2; exit 1; }

# 원격에 브랜치가 없으면 대조할 대상이 없다. 이때 「파일 없음」으로 건너뛰면 검사하지 않은
# 상태가 통과와 같은 모양이 된다. 푸시하지 않은 로컬 수정이 이 사고의 원인이었다.
for ref in "$branch" "$target"; do
  if ! git rev-parse -q --verify "refs/remotes/origin/$ref" >/dev/null; then
    echo "멈춤: origin/$ref 이 없다. 푸시하지 않았거나 이름이 다르다" >&2
    exit 1
  fi
done

fail=0

bv=$(git show "origin/$branch:$VERSION_FILE" 2>/dev/null | tr -d ' \n')
tv=$(git show "origin/$target:$VERSION_FILE" 2>/dev/null | tr -d ' \n')
if [ -z "$bv" ] || [ -z "$tv" ]; then
  echo "건너뜀: $VERSION_FILE 없음 (브랜치 '${bv:-없음}', 타겟 '${tv:-없음}')"
elif [ "$bv" = "$tv" ]; then
  echo "통과: 버전 동일 ($bv). 적립 PR 이다"
elif [ "$(printf '%s\n%s\n' "$bv" "$tv" | sort -V | tail -1)" != "$bv" ]; then
  echo "멈춤: 브랜치 $bv 가 타겟 $tv 보다 낮다. 머지가 버전을 뒤로 밀어낸다" >&2
  fail=1
else
  echo "통과: 릴리즈 PR ($tv → $bv)"
fi

changelog=$(git show "origin/$branch:$CHANGELOG_FILE" 2>/dev/null)
if [ -z "$changelog" ]; then
  echo "건너뜀: $CHANGELOG_FILE 없음"
else
  dup=$(printf '%s\n' "$changelog" | grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' | sort | uniq -d)
  if [ -n "$dup" ]; then
    echo "멈춤: $CHANGELOG_FILE 버전 헤더 중복 $(printf '%s' "$dup" | tr '\n' ' ')" >&2
    fail=1
  else
    echo "통과: $CHANGELOG_FILE 버전 헤더 중복 없음"
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "브랜치를 타겟 위로 다시 올린 뒤 푸시하고 다시 실행한다" >&2
  exit 1
fi
exit 0
