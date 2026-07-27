# 이슈 익스텐션

> **Base**: `base/readability.md` + `base/tone.md` + `base/punctuation.md` + `base/ai-tells.md`
> **Adds**: 사내 이슈(이슈 트래커 태스크·GitHub issue) 작성 특화 규칙

연계 스킬:
- `ops-agent-vault:dooray-api` (이슈 트래커 태스크 조회·생성·수정)
- `ops-agent:flow` / `ops-agent:issue` (GitHub issue 흐름)

---

## 적용 대상

| 매체 | 적용 |
|------|------|
| 이슈 트래커 태스크 본문 | 본 익스텐션 |
| GitHub issue (사내·퍼블릭) | 본 익스텐션 |
| GitLab/Jira 이슈 | 본 익스텐션 |

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

조직 컨벤션에 따라 우선순위를 부여한다. 사내 이슈 트래커 provider 는 `ops-agent-vault:dooray-api` 의 우선순위 코드 참조.

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

## ISS5. 기능 이슈(feat/chore) — 도메인 What/Why 까지만

ISS1 5요소(재현·환경·기대·실제·영향)는 **버그 리포트** 형식. 기능 추가·운영 개선·옵저버빌리티 등 **버그가 아닌 이슈** 는 ISS1 대신 본 ISS5 를 따른다.

### 필수 구조

```markdown
## What
{도메인 수준 한 줄 변경 — "무엇이 바뀌는가"}

## Why
- {배경 사실 1}
- {배경 사실 2}
```

### 도메인 추상화 — 다음 항목은 이슈 본문에서 금지

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

## 필수 구조

### 버그 (bug) — ISS1 적용

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

### 기능·운영 (feat/chore/refactor 등) — ISS5 적용

```markdown
## What
{도메인 수준 한 줄}

## Why
- {배경 사실}
- {배경 사실}
```

---

## base 대비 적용 강도

| 규칙 | base | 이슈 | 비고 |
|------|------|-----|------|
| L1 (목록 항목 수 3-7개) | 부분 판별 | 완화 | 재현 절차는 8개 이상 허용 |
| P6 (코드 블록 설명) | 필수 | 필수 + 강화 | 재현 절차 모든 명령어가 설명과 함께 |
| V3 (TL;DR) | 권장 | 면제 | 이슈 본문은 짧음 |
| ai-tells D-1~D-6 (관용구·과장) | S1 차단 | 강화 | 평가 톤 회피, 사실 위주 |

---

## 합격선

### 버그
- 5요소 (ISS1) 모두 포함: 필수
- 재현 절차 명령어·코드 형태: 필수
- 영향 범위 명시: 필수

### 기능·운영
- ISS5 의 What/Why 구조: 필수
- ISS5 도메인 추상화 금지 항목 표의 정규식 미히트: 필수
- "변경 범위"·"구현 방안"·"검증 절차" 섹션 부재: 필수
