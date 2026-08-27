# 이슈 익스텐션

> **Base**: `base/readability.md` + `base/tone.md` + `base/punctuation.md` + `base/ai-tells.md`
> **Adds**: 사내 이슈(이슈 트래커 태스크·GitHub issue) 작성 특화 규칙
> **Profile**: 적용 대상·base 대비 적용 강도·합격선은 [profiles.md](profiles.md) 가 정본이다.

연계 스킬:
- 사내 트래커 어댑터의 태스크 스킬 (조회·생성·수정)
- `ops-agent:flow` / `ops-agent:issue` (GitHub issue 흐름)

---

## ISS1. 5요소 필수 (재현·영향·기대·실제·환경)

이슈 본문은 다음 5요소를 모두 포함한다. 누락 시 합격선 미달.

| 요소 | 설명 |
|------|------|
| 재현 절차 | 1·2·3·... 순서 목록으로 |
| 환경 | 버전·OS·브라우저·설정 (해당되는 경우) |
| 기대 동작 | "~해야 한다" 또는 "~여야 한다" |
| 실제 동작 | 관측된 결과 (로그·스크린샷 첨부) |
| 영향 범위 | 사용자·시스템·데이터 범위 |

---

## ISS2. 제목 = 한 문장 요약

제목은 50자 이내. "무엇이 어떻게 잘못됐는가" 한 문장으로.

Bad:
```
버그 발생
```

Good:
```
PR 머지 시 CI 워크플로 시작 안 됨 (main 브랜치 한정)
```

---

## ISS3. 우선순위·라벨

조직 컨벤션에 따라 우선순위를 부여한다. 사내 이슈 트래커 provider 는 해당 어댑터가 정의한 우선순위 코드를 참조한다.

라벨 사용 시 다음 카테고리만 권장:
- `bug` / `feat` / `chore` / `docs` / `refactor` / `test`
- `priority/{high,medium,low}` (별 컨벤션 있으면 그쪽 우선)

---

## ISS4. 재현 절차는 명령어·코드 그대로

재현 절차에는 명령어·요청 payload 를 코드 블록으로 기재한다.
"~을 시도했다" 같은 추상 표현 금지.

Bad:
```
API 를 호출해보면 에러가 납니다.
```

Good:
````
1. 다음 요청 실행:
   ```bash
   curl -X POST https://api.example.com/v1/items \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"name": "test"}'
   ```
2. 응답: `500 Internal Server Error`
````

---

## ISS5. 기능 이슈(feat/chore): 도메인 What/Why 까지만

ISS1 5요소(재현·환경·기대·실제·영향)는 **버그 리포트** 형식. 기능 추가·운영 개선·옵저버빌리티 등 **버그가 아닌 이슈** 는 ISS1 대신 본 ISS5 를 따른다.

### 필수 구조

```markdown
## What
{도메인 수준 한 줄 변경 — "무엇이 바뀌는가"}

## Why
- {배경 사실 1}
- {배경 사실 2}
```

### 도메인 추상화: 다음 항목은 이슈 본문에서 금지

| 금지 항목 | 이유 | 적합한 위치 |
|---|---|---|
| 파일 경로 (`*.java`, `*.gradle`, `*.yml`, `*.tsx`, …) | 파일 단위는 PR 의 영역 | PR diff / 커밋 메시지 |
| 클래스명·메서드 시그니처 (`FooEntity`, `BarService#create()`) | 구현 단위는 PR 의 영역 | PR diff |
| 어노테이션 (`@Column`, `@Override`) | 구현 표식 | PR diff |
| 라이브러리·dependency 이름 (`micrometer-registry-prometheus`, `implementation '…'`) | 구현 선택지 | PR diff |
| yml/properties key (`management.endpoints.web.exposure.include`) | 구현 선택지 | PR diff |
| 메트릭 이름·필드명 (`jvm_memory_used_bytes`, `failed_reason`) | 구현 명명 | PR diff |
| 검증 절차 단계 (`./gradlew test`, `curl /actuator/prometheus`) | 검수 책임은 PR | PR Checklist |
| 일정·소요 시간 추정치를 본문에 풀어 쓰는 형태 | 이슈 트래커 우선순위 / 소요시간 필드 별도 존재 | provider 의 필드 |

### Bad / Good

Bad (구현 상세 누출):
```
## 변경 범위
- gradle/scheduler.gradle 에 micrometer-registry-prometheus dependency 추가
- scheduler/application.yml 에 management.endpoints.web.exposure.include: health, prometheus
- SchedulerMetricsConfig.java 신설하여 JvmMemoryMetrics binder 등록

## 검증
- /actuator/prometheus 200 응답 확인
- jvm_memory_used_bytes 시계열 확인
```

Good (도메인 What/Why):
```
## What
scheduler 에 메트릭 노출.

## Why
- scheduler 가 메트릭 미노출 상태라 배치 실패율·메모리·DB 풀 등 자체 알람 근거 없음
- Prometheus scraper 가 매 분 메트릭 endpoint 를 호출하나 404 응답 → WARN 누적
```

### 합격선

- What 1줄 + Why bullet 2~5개. 이를 초과하는 본문은 PR 본문으로 미룬다
- 위 금지 항목 표의 정규식 패턴이 1건이라도 검출되면 합격선 미달
- "변경 범위"·"구현 방안"·"검증 절차" 섹션 자체를 이슈에 두지 않는다

---

## ISS6. 보고 목적 이슈: 발견 순서를 따른다

측정·시험 결과를 근거로 판단을 요청하는 이슈는 ISS1(버그)도 ISS5(기능)도 아니다. 버그가 아니고 구현 요청도 아니다.

이 이슈에는 미룰 PR 이 없다. ISS5 의 합격선(What 1줄 + Why 2~5개, 초과분은 PR 로)을 적용하면 판단의 근거인 조건·측정값·판정 기준이 통째로 사라진다. 리뷰어는 결론만 받는다.

### 구조

IMRaD 를 따른다. 결과를 먼저 놓지 않는다. 읽는 사람이 발견 과정의 타당성을 확인할 자리가 없어진다.

```markdown
## 측정 조건
{대상·조건·규모}

## 합격 기준
{판정선과 그 출처}

## 결과
{측정값 표}

## 발견 사항
{결함·관측. 상세는 하위 이슈가 갖고 여기는 한 줄과 링크}
```

**절 이름은 명사형으로 둔다.** `무엇을 측정했나`·`나온 것` 처럼 문장형·구어형으로 바꾸면 `readability.md H4` 에 걸린다. 같은 문서의 `합격 기준`·`결과` 가 명사형이라 한 문서 안에서 헤딩 형태가 섞이고, `~나` 어미는 독자를 대상에서 빠뜨려 혼잣말 톤이 된다.

**판정을 요청할 항목은 절로 예약하지 않는다.** 요청할 것이 실제로 있으면 `확인 요청` 절을 더하고, 없으면 두지 않는다. 빈 절을 필수로 두면 본문에서 추론해 채우게 되는데, 무엇을 판단해 달라고 할지는 이슈를 올린 사람의 것이고 본문에서 유도되지 않는다.

### ISS6 합격선

- 합격 기준의 출처를 적는다. 판정선이 어디서 왔는지 없으면 결과를 해석할 수 없다
- 측정하지 않은 항목을 결과에 두지 않는다. `미측정 항목` 절에 이유와 함께 적는다
- 결함 상세를 본문에 옮겨 적지 않는다. 하위 이슈가 갖고 여기는 링크만 둔다
- 절 이름이 명사형인지 본다. 문장형·구어형 절 이름은 `readability.md H4` 위반이다
- `확인 요청` 절이 있으면 그 항목이 이슈를 올린 사람이 정한 것인지 본다. 본문에서 유도한 항목은 뺀다

---

## 필수 구조

### 버그 (bug): ISS1 적용

```markdown
## 증상
{ISS2 한 문장 요약}

## 재현 절차 (ISS1, ISS4)
1. ...
2. ...

## 기대 동작 (ISS1)
...

## 실제 동작 (ISS1)
...

## 환경 (ISS1)
...

## 영향 범위 (ISS1)
...

## 우선순위 (ISS3)
...
```

### 보고 (측정·시험 결과): ISS6 적용

```markdown
## 측정 조건
## 합격 기준
## 결과
## 발견 사항
```

### 기능·운영 (feat/chore/refactor 등): ISS5 적용

```markdown
## What
{도메인 수준 한 줄}

## Why
- {배경 사실}
- {배경 사실}
```
