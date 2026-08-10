# 변경 반영 경로

작업 규칙의 정본은 [CLAUDE.md](CLAUDE.md) 입니다. 여기에는 반영 경로와 명령만 둡니다.

## 경로

워크트리 → 버전 범프 → 커밋 → PR → 웹 머지. main 직접 push 는 하지 않습니다.

```bash
git worktree add ../claude-ops-agent-{타입}-{번호} -b {타입}/{번호} origin/main
./scripts/bump-version.sh <version> "<변경 설명>"   # VERSION·CHANGELOG·plugin.json·marketplace.json 동시 갱신
# 커밋 → 브랜치 push → PR → 웹 머지
./scripts/post-merge-sync.sh                        # 머지 후 로컬 캐시 동기
```

이슈 하나당 PR 하나로 나눕니다. `/flow` 를 부르면 이슈 생성부터 PR 까지 단계별로 진행합니다.

## 알아둘 것

| 항목 | 정본 |
|------|------|
| 버전 기준, 커밋 타입 선언, 체인지로그 분류 | [CLAUDE.md](CLAUDE.md) 버전 관리 절 |
| 변경 시 검증 체크리스트 | [CLAUDE.md](CLAUDE.md) 변경 시 검증 체크리스트 절 |
| 워크트리 분기 판단, state 파일 포맷 | [docs/worktree.md](docs/worktree.md) |
| 스킬 변경 규칙 | [CLAUDE.md](CLAUDE.md) 스킬 변경 규칙 절 |

버전은 [Semantic Versioning](https://semver.org/lang/ko/), 체인지로그는 [Keep a Changelog 1.1.0](https://keepachangelog.com/ko/1.1.0/) 을 따릅니다.

`bump-version.sh` 는 체인지로그 분류를 변경 설명의 타입 접두에서 유도합니다. 유도할 수 없으면 4곳을 갱신하기 전에 멈추므로, 설명에 `feat:` 같은 접두를 붙이거나 세 번째 인자로 카테고리를 넘깁니다. 4곳을 수동 편집하면 값이 어긋나 캐시 경로 해석이 깨집니다.
