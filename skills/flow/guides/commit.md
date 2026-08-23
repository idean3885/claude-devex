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

타입은 **레포의 컨벤션 선언**을 우선한다. 선언이 없으면 아래 기본값을 쓴다.

기본값: `feat` · `fix` · `docs` · `refactor` · `chore` · `ci` · `perf` · `style` · `test` · `build`

### 표기 판정 순서

타입 어휘·제목 형식·체인지로그 분류 이름은 아래 순서로 정한다. 첫 번째로 발견한 것을 쓴다.

1. **선언 슬롯**: 해석기가 발견한 매니페스트의 `conventions` 키. 스키마와 병합 규칙은 [../../../docs/conventions-slot.md](../../../docs/conventions-slot.md)

   ```bash
   node ~/.claude/ops-agent/current/scripts/resolve-manifest.mjs
   ```

   `manifests` 를 나온 순서대로 병합한다 (레포 선언 > org 선언 > 외부 어댑터 org 선언). `notes` 가 비어 있지 않으면 그대로 사용자에게 보인다. org-flow 의 매니페스트 발견과 같은 해석기다
2. **레포 문서 선언**: 레포 `CLAUDE.md` 에 타입 목록이 적혀 있으면 그것
3. **최근 이력 표본**: 위 둘이 없으면 최근 커밋 제목에서 표기를 추정하고 **사용자에게 확인한 뒤** 쓴다
4. **기본값**: 전부 없으면 위 기본 목록

이미 컨벤션이 정착된 레포에 다른 표기를 들이미면 이력 조회와 자동화 결합면이 끊긴다. 그래서 선언이 항상 기본값을 이긴다.

> Conventional Commits 가 규정하는 것은 `feat`·`fix` 둘뿐이고, 나머지는 Angular 커밋 컨벤션에서 굳은 업계 관행이다. 레포에 존재하지 않는 단계(빌드 단계가 없는 레포의 `build` 등)는 선언에서 빼는 쪽이 맞다.

## 타입 → 체인지로그 분류 → 버전 증분

세 층은 하나의 사슬이다. 커밋 타입을 정하면 체인지로그 분류와 버전 증분이 따라온다.

| 커밋 타입 | 체인지로그 분류 | 최소 버전 증분 |
|---|---|---|
| `feat` | `Added` | MINOR |
| `fix` | `Fixed` | PATCH |
| `docs`·`refactor`·`chore`·`ci`·`perf`·`style`·`test`·`build` | `Changed` | PATCH |
| `!` 접미 또는 `BREAKING CHANGE:` 푸터 (타입 무관) | `Changed` | MAJOR |

증분은 **하한**이다. 레포가 이보다 크게 올리는 정책을 두는 것은 레포 선언 사항이고, 이보다 낮추면 소비 측이 변경 성격을 버전만 보고 판단할 수 없다.

기능 제거는 `Removed`, 취약점 대응은 `Security`, 예고된 제거는 `Deprecated` 로 분류한다. 커밋 타입에서 유도되지 않으므로 체인지로그 도구에 직접 지정한다.

### 파괴 변경 표기

소비 측이 버전만 보고 파괴 변경을 알 수 있어야 한다. 둘 중 하나로 표기한다.

- 제목 접두에 `!`: `feat!: 슬롯 경로 스키마 교체`
- 본문 푸터에 `BREAKING CHANGE: {설명}`: 대문자 고정. 하이픈 형(`BREAKING-CHANGE`)도 동일하게 취급

`!` 를 쓰면 푸터를 생략할 수 있다. 표기가 있으면 MAJOR 를 올린다. 표기 없이 파괴 변경을 넣으면 소비 측이 마이너 업데이트로 받아 깨진다.

### 제목 줄 규칙

- **한 줄에 URL 합치지 않는다**. 이슈 링크는 본문 첫 줄에 분리한다: GitHub PR 카드·이메일 알림·메신저 미리보기에서 제목이 잘리는 사고 재현 방지.
- 제목은 식별·검색용이라 60 자 내외로 짧게. 풀어쓰기는 본문이 담당한다.
- 사내 프로젝트 컨벤션이 이슈 번호 prefix(`{번호} [범주] ...`) 라면 prefix 만 따른다. URL 은 여전히 본문.

### What / Why 분리

- `## What` 은 **bullet (`*`) 요약**. "무엇을" 했는지가 한 눈에 들어와야 한다. 구어체 풀어쓰기 금지: 가독성이 떨어지고 스캔이 어렵다.
- `## Why` 는 풀어쓸 이야기(배경·결정 사유·트레이드오프·후속 위임)를 담는다. 항목이 없으면 섹션 생략.
- What 한 줄은 동사/명사 단위 도메인 행위. 5~12 단어 권장. 코드 산출물(클래스명·메서드명) 금지는 아래 도메인 What 추상화 룰 그대로.

## 도메인 What 추상화

커밋 본문은 **도메인 행위와 사용자 가치**를 기술한다. 구현 세부(클래스명·메서드명·어노테이션·프레임워크 용어) 를 나열하지 않는다.

### 금지 패턴

| 위반 | 예 |
|------|----|
| 클래스명·메서드명 나열 | `{Domain}{Role}Service 도입: {methodName} 호출 ...` |
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
- XxxDelegationPort + Adapter — 외부 시스템 /api/v1/xxx
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
- [ ] 파괴 변경이면 `!` 또는 `BREAKING CHANGE:` 표기가 있다 (표기 없이 넘기면 소비 측이 깨진다)
- [ ] 도메인 What (사용자 행위·상태 변화) 이 첫 단락에 명시되어 있다
- [ ] 흐름은 mermaid 또는 1~2 문장의 인과 표현이다
- [ ] 설계 문서와 구현 일치
- [ ] 테스트 통과
- [ ] 컨벤션 준수
- [ ] 불필요한 변경 없음
- [ ] 민감정보(시크릿, 토큰) 미포함
- [ ] 대외비 가드(GATE 0) 통과: [../references/confidential-guard.md](../references/confidential-guard.md)

## 규칙

- 커밋은 사용자 승인 후에만 실행한다
- 푸시는 사용자가 명시적으로 요청한 경우에만 실행한다
- **이력을 컨벤션의 정본으로 삼지 않는다.** 선언(슬롯·레포 문서)이 있으면 그것을 쓰고, 없을 때만 이력 표본으로 추정한 뒤 사용자에게 확인한다. 이력은 여러 시대가 섞여 있을 수 있어 그대로 따르면 중단된 관행을 되살린다 (판정 순서는 위 "표기 판정 순서" 참조)
