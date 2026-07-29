# 사용자 글로벌 지침

1인 사용자 환경. 자연어 라우팅 + 콘텐츠 SSOT 기반으로 작업한다.

## 자연어 라우팅 정책

스킬을 직접 호출하지 않는다. 자연어로 요청하면 하네스가 스킬 description 의 트리거 키워드를 매칭하여 자동 라우팅한다. 스킬 description 갱신은 각 플러그인 리포에서 한다.

## AI 티·가독성·톤 SSOT

ops-agent 의 `config/style-rules/{base,extensions}/` 가 모든 한국어 문서(블로그·위키·이슈·PoC·데일리로그·동료리뷰·성과평가)의 단일 출처.
세션 시작 시 ops-agent SessionStart hook 이 `~/.claude/ops-agent/style-rules/` 로 미러한다. 외부 소비자는 이 경로를 참조.

| 파일 | 역할 |
|------|------|
| `base/ai-tells.md` | AI 티 분류 (A~J, im-not-ai MIT 차용) |
| `base/readability.md` | 구조 가독성 (P/H/L/C/V/K/B) |
| `base/tone.md` | 저자 톤 (T1~T13) |
| `base/punctuation.md` | 한국어 구두점 (PN1~PN6) |
| `base/length.md` | 산출물 분량 (LN1~LN2) |
| `extensions/{blog,wiki,poc,info,knowledge,issue,dailylog,peer-review,work-review}.md` | 문서 유형별 추가 규칙 |

표현 가드 hook(`forbidden-words.json`)은 응답을 막거나 재작성하지 않는다. 룰 목록은 SessionStart 에서 세션당 1회 주입되고, Stop 이 검출한 위반만 다음 턴에 통지된다. 출력 직전 패턴 자가 대조는 어시스턴트가 수행한다. 사용자 추가 룰은 `~/.claude/forbidden-words.local.json` 에 작성하면 머지된다. hook 동작 상세는 ops-agent `docs/hooks-config.md` 참조.

## 어시스턴트 발화 분량

문서 분량은 `base/length.md`, 대화 발화는 여기. 작업 강도(effort)를 낮춰도 발화 길이는 줄지 않는다.

- **응답**: 본론이 대부분을 차지한다. 단서·주의는 짧게. 설명 요청에는 요약 먼저, 깊이는 요청받았을 때
- **진행 서술**: 첫 도구 호출 전 한 문장. 작업 중에는 중요한 발견·방향 전환만. 마칠 때 결과를 첫 문장에
- **정정**: 사용자의 코드·판단·결정이 달라지는 오류만. 짧게 고치고 진행. 결과가 같은 실수는 조용히

## 외부 서비스 인증

외부 CLI 가 인증 만료로 실패하면 **API 토큰 발급을 권하지 않는다.** 그 서비스의 정식 인증 명령(브라우저 동의)을 사용자에게 제시하고, 어시스턴트가 대신 실행하지 않는다.

정식 인증 스코프를 넘는 작업은 인증을 다시 해도 되지 않는다. 권한을 넓히려고 별도 비밀값을 만들지 말고 처음부터 콘솔 작업으로 안내한다.

서비스별 인증 명령·지원 그랜트·스코프 밖 항목, 토큰 보관이 불가피한 경우의 조건은 ops-agent `docs/external-auth.md` 참조.

## ops-agent 개발 룰

- 워킹 카피: `~/git-project/idean3885/claude-ops-agent/`
- 반영 경로: 워크트리 → PR → 웹 머지
- 이슈 플로우를 거친다

되돌리기 어려운 두 가지는 전역 규칙으로 둔다.

- main 직접 push 금지
- 수동 버전 범프 금지 (레포가 제공하는 범프 스크립트 사용)

브랜치 전략·버전 기준·머지 후 동기 절차 등 레포별 상세는 각 레포의 `CLAUDE.md` 를 따른다.

워킹 카피에 `.git` 이 없으면 SessionStart hook 이 복원한다. 급한 경우 캐시에서 워크트리를 분기해도 되지만 반영 경로는 동일하다. 워킹 카피가 있으면 캐시보다 우선한다.
