# Commit Skill

커밋 워크플로우

## 역할

변경사항을 리뷰하고 커밋 메시지를 제안한다.

## 워크플로우

0. **Git Identity 검증** (커밋 전 필수):
   - 세션 컨텍스트에 주입된 Git Identity 확인
   - `git config user.name` && `git config user.email` 로 현재 설정 확인
   - provider의 Git Identity와 불일치 시 자동 수정:
     ```bash
     git config user.name "{provider user.name}"
     git config user.email "{provider user.email}"
     ```
   - 글로벌/로컬 설정과 무관하게 provider 기준으로 강제 설정
1. **변경사항 수집**:
   - `git status`로 변경 파일 목록 확인
   - `git diff`로 staged + unstaged 변경 내용 확인
2. **리뷰 수행**:
   - 관련 설계 문서와 구현이 일치하는지 확인
   - 불필요한 변경, 디버그 코드, 민감정보 포함 여부 확인
   - **대외비 가드 (GATE 0)**: [../references/confidential-guard.md](../references/confidential-guard.md) 기준으로 커밋 메시지와 diff를 검증. 키워드/패턴 히트 시 커밋 차단 후 사용자 정정
   - 로컬 전용 provider 파일의 내용이 퍼블릭 파일에 유입되지 않았는지 확인
   - 컨벤션 준수 여부 확인
3. **리뷰 결과 보고**:
   - 이슈가 있으면 상세히 설명
   - 이슈가 없으면 변경사항 요약 제시
4. **커밋 메시지 제안**: CLAUDE.md 커밋 컨벤션에 따라 작성
5. **사용자 확인 후 커밋**: 승인 시에만 `git add` + `git commit` 실행

## 커밋 메시지 형식

```
{프로젝트 접두 또는 타입}: 짧은 제목 한 줄

{이슈 트래커 링크}

## What

* 변경 항목 1 (도메인 행위)
* 변경 항목 2
* 변경 항목 3

## Why

* 풀어쓸 배경·이유·트레이드오프 (필요 시)
* 후속 위임 (#NNNN)
```

타입: init, feat, fix, docs, refactor, chore.

### 제목 줄 규칙

- **한 줄에 URL 합치지 않는다**. 이슈 링크는 본문 첫 줄에 분리한다 — GitHub PR 카드·이메일 알림·메신저 미리보기에서 제목이 잘리는 사고 재현 방지.
- 제목은 식별·검색용이라 60 자 내외로 짧게. 풀어쓰기는 본문이 담당한다.
- 사내 프로젝트 컨벤션이 이슈 번호 prefix(`{번호} [범주] ...`) 라면 prefix 만 따른다. URL 은 여전히 본문.

### What / Why 분리

- `## What` 은 **bullet (`*`) 요약**. "무엇을" 했는지가 한 눈에 들어와야 한다. 구어체 풀어쓰기 금지 — 가독성이 떨어지고 스캔이 어렵다.
- `## Why` 는 풀어쓸 이야기(배경·결정 사유·트레이드오프·후속 위임)를 담는다. 항목이 없으면 섹션 생략.
- What 한 줄은 동사/명사 단위 도메인 행위. 5~12 단어 권장. 코드 산출물(클래스명·메서드명) 금지는 아래 도메인 What 추상화 룰 그대로.

## 도메인 What 추상화

커밋 본문은 **도메인 행위와 사용자 가치**를 기술한다. 구현 세부(클래스명·메서드명·어노테이션·프레임워크 용어) 를 나열하지 않는다.

### 금지 패턴

| 위반 | 예 |
|------|----|
| 클래스명·메서드명 나열 | `{Domain}{Role}Service 도입 — {methodName} 호출 ...` |
| 어노테이션·프레임워크 키워드 노출 | `@TransactionalEventListener AFTER_COMMIT 으로 처리` |
| Port/Adapter/UseCase/Listener/Service 같은 헥사고날 어휘 | `{X} Port + Adapter 추가` |
| 의존성 파일·yaml 키 나열 | `application-{x}.yml 의 {x}.{y}.* 추가` |
| 구현 산출물 카운트 | `사유별 예외 N종 신규`, `M files changed` |

### 허용 패턴

- 사용자가 보는 행위·상태 변화 (예: "요청 → 진행 잠금 → 사전 검증 → 등록")
- 검증·정책·약속의 도메인 표현 (예: "타입·상태·동시 진행·자원 마진 4 사유")
- 트랜잭션 경계는 행위 단위로만 (예: "커밋 후 비동기 위임 트리거", "실패 시 즉시 보상")
- 후속 이슈 위임 명시 (예: "콜백 처리는 #NNNN")

### 흐름은 mermaid

복잡한 흐름은 본문 텍스트로 나열하지 말고 `mermaid` flowchart/sequenceDiagram 으로 보인다. 단계의 인과만 표현하고 클래스명을 노드에 쓰지 않는다.

### 좋은 예 / 나쁜 예

**나쁜 예** (구현 나열):
```
- XxxUserService 도입 — 잠금 → validate → INSERT → record → publish
- XxxEventListener AFTER_COMMIT + XxxDelegationService REQUIRES_NEW
- XxxDelegationPort + Adapter — k8s-delegator /api/v1/xxx
- application-{x}.yml 의 {x}.{y}.callback-base-url 추가
```

**좋은 예** (도메인 What):
```
사용자가 {대상} 을 요청하면 진행 잠금을 잡은 상태에서 사전 검증(...) 을 수행하고, 통과한 요청만 등록한 뒤 외부 위임을 비동기로 트리거합니다. 위임이 실패하면 동일 행을 즉시 실패로 전환합니다.

콜백·강제 실패 처리는 #NNNN, Controller·단위 테스트는 #MMMM 이 보유합니다.
```

## 리뷰 체크리스트

- [ ] 본문에 클래스명·메서드명이 1개도 없다
- [ ] `@`로 시작하는 어노테이션이 없다
- [ ] `Port`/`Adapter`/`UseCase`/`Listener`/`Service` 같은 헥사고날 어휘가 없다
- [ ] yaml 키·파일 경로 나열이 없다
- [ ] 산출물 카운트(`N종 신규`, `M files changed`) 가 없다
- [ ] 도메인 What (사용자 행위·상태 변화) 이 첫 단락에 명시되어 있다
- [ ] 흐름은 mermaid 또는 1~2 문장의 인과 표현이다
- [ ] 설계 문서와 구현 일치
- [ ] 테스트 통과
- [ ] 컨벤션 준수
- [ ] 불필요한 변경 없음
- [ ] 민감정보(시크릿, 토큰) 미포함
- [ ] 대외비 가드(GATE 0) 통과 — [../references/confidential-guard.md](../references/confidential-guard.md)

## 규칙

- 커밋은 사용자 승인 후에만 실행한다
- 푸시는 사용자가 명시적으로 요청한 경우에만 실행한다
- git log를 읽지 않는다 (CLAUDE.md 컨벤션 사용)
