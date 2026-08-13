# 사용자 글로벌 지침

1인 사용자 환경. 자연어 라우팅 + 콘텐츠 SSOT 기반으로 작업한다.

## 자연어 라우팅 정책

스킬을 직접 호출하지 않는다. 자연어로 요청하면 하네스가 스킬 description 의 트리거 키워드를 매칭하여 자동 라우팅한다. 스킬 description 갱신은 각 플러그인 리포에서 한다.

## AI 티·가독성·톤 SSOT

ops-agent 의 `config/style-rules/{base,extensions}/` 가 모든 한국어 문서(블로그·위키·이슈·PoC·데일리로그·동료리뷰·성과평가)의 단일 출처.
세션 시작 시 ops-agent SessionStart hook 이 `~/.claude/ops-agent/style-rules/` 로 미러한다. 외부 소비자는 이 경로를 참조.

| 파일 | 역할 |
|------|------|
| `base/ai-tells.md` | AI 티 분류 (A~K, im-not-ai MIT 차용) |
| `base/readability.md` | 구조 가독성 (P·H·L·C·V·CJ·BQ) |
| `base/tone.md` | 저자 톤 (T1~T17) |
| `base/punctuation.md` | 한국어 구두점 (PN1~PN6) |
| `base/length.md` | 산출물 분량 (LN1~LN2) |
| `base/authoring.md` | `SKILL.md`·`CLAUDE.md`·가이드·provider 정의를 쓰거나 고칠 때 적용 (AU1~AU6, mattpocock/skills MIT 차용) |
| `extensions/profiles.md` | 유형별 적용 대상·적용 강도·합격선 정본 |
| `extensions/{blog,wiki,poc,info,knowledge,issue,deck,architecture,dailylog,peer-review,work-review}.md` | 문서 유형별 고유 규칙 |

`base/authoring.md` 만 **읽는 쪽**이 다르다. 나머지는 사람이 읽는 한국어 산문을 다루고, 이 파일은 모델이 읽고 실행하는 문서를 다룬다. 한 파일이 양쪽 다 읽는 경우(`SKILL.md` 가 그렇다)에는 두 묶음을 함께 적용하고, 충돌하면 그 문서가 존재하는 이유 쪽인 `authoring` 을 따른다.

표현 가드 hook(`forbidden-words.json`)은 응답을 막거나 재작성하지 않는다.

| 시점 | 동작 |
|------|------|
| SessionStart | 룰 목록을 세션당 1회 주입 |
| 출력 직전 | 어시스턴트가 패턴을 자가 대조 |
| Stop | 검출된 위반만 다음 턴에 통지 |

사용자 추가 룰은 `~/.claude/forbidden-words.local.json` 에 작성하면 머지된다. hook 동작 상세는 ops-agent `docs/hooks-config.md` 참조.

## 어시스턴트 발화 분량

문서 분량은 `base/length.md`, 대화 발화는 여기. 작업 강도(effort)를 낮춰도 발화 길이는 줄지 않는다.

- **응답**: 본론이 대부분을 차지한다. 단서·주의는 짧게. 설명 요청에는 요약 먼저, 깊이는 요청받았을 때
- **진행 서술**: 첫 도구 호출 전 한 문장. 작업 중에는 중요한 발견·방향 전환만. 마칠 때 결과를 첫 문장에
- **정정**: 사용자의 코드·판단·결정이 달라지는 오류만. 짧게 고치고 진행. 결과가 같은 실수는 조용히

## 외부 서비스 인증

정적 장기 토큰을 기본값으로 두지 않는다. 세 속성(스코프가 발급 측에 고정·만료와 회전·사람이 값을 손으로 옮기지 않음)을 갖춘 경로가 **그 권한에** 있으면 그것을 쓴다. 브라우저 동의 기반 인증이 여기 해당하고, 그 명령은 사용자에게 제시하며 어시스턴트가 대신 실행하지 않는다.

권한 단위로 판단한다. 서비스가 브라우저 동의를 제공해도 그 권한이 스코프 목록에 없으면 재인증으로 열리지 않는다. 그때는 한 번 하고 끝나는 작업이면 콘솔 작업으로 안내하고, 반복되는 작업이면 스코프·TTL·폐기 경로를 채워 정적 토큰을 쓴다.

판단 순서·서비스별 스코프 실측·정적 토큰 보완 조건은 ops-agent `docs/external-auth.md` 참조.

## ops-agent 개발 룰

- 워킹 카피: `~/git-project/idean3885/claude-ops-agent/`
- 반영 경로: 워크트리 → PR → 웹 머지
- 이슈 플로우를 거친다

되돌리기 어려운 두 가지는 전역 규칙으로 둔다.

- main 직접 push 금지
- 수동 버전 범프 금지 (레포가 제공하는 범프 스크립트 사용)

브랜치 전략·버전 기준·머지 후 동기 절차 등 레포별 상세는 각 레포의 `CLAUDE.md` 를 따른다.

워킹 카피에 `.git` 이 없으면 SessionStart hook 이 복원한다. 급한 경우 캐시에서 워크트리를 분기해도 되지만 반영 경로는 동일하다. 워킹 카피가 있으면 캐시보다 우선한다.
