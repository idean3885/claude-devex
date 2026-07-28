---
name: usage-complete
description: 작업을 완료 처리하고 최종 사용량 리포트를 생성합니다. 트리거 "작업 완료", "사용량 완료", "complete task".
---

# usage:complete

추적 중인 작업을 완료 처리하고, 최종 사용량 리포트를 로컬에 저장합니다.

## 트리거

- "usage complete"
- "usage done"
- "작업 추적 종료"

## 파라미터

- **taskId** (선택): 완료할 작업. 생략 시 진행 중인 작업이 하나면 자동 선택하고, 여러 개면 사용자에게 확인합니다.
- **summary** (선택): 작업 결과에 대한 간단한 설명.

## 절차

### 1. 작업 식별

```bash
cat "$HOME/.claude/usage-tracker/tasks.json"
```

대상 작업을 찾습니다. 모호한 경우 진행 중인 작업 목록을 보여주고 확인합니다.

### 2. 최종 사용량 데이터 조회

`bindings[].cwd` 가 있으면 trace jsonl 의 `cwd` 필드로 ticket 단위 합산한다 (`usage:report` Mode A 와 동일). 없으면 ccusage fallback.

```bash
# Mode A — cwd-based (default for new tasks)
# python3 으로 ~/.claude/projects/*/*.jsonl 순회 → assistant entry 의 cwd 필드 일치 시 합산
# 알고리즘은 docs/usage-cwd-aggregation.md 참조

# Mode B — ccusage fallback (bindings[].cwd 가 없는 legacy task 한정)
ccusage session --since {task.startedAt as YYYYMMDD} --json --breakdown
```

### 3. 리포트 생성

`~/.claude/usage-tracker/reports/{taskId}-{date}.md`에 마크다운 리포트를 생성합니다:

```markdown
# 사용량 리포트: {label}

## 요약

- **작업명**: {label}
- **작업 방식**: {approach}
- **기간**: {startedAt} ~ {completedAt}
- **소요 일수**: {days}일
- **태그**: {tags}

## 토큰 사용량

| 항목 | 값 |
|------|-----|
| 총 비용 | ${cost} |
| 총 토큰 | {tokens} |
| 입력 토큰 | {input} |
| 출력 토큰 | {output} |
| 캐시 읽기 | {cacheRead} |
| 캐시 생성 | {cacheCreate} |

## 구간별 사용량

체크포인트가 기록된 경우에만 이 섹션을 포함합니다.
체크포인트가 없으면 이 섹션을 생략합니다.

| # | 구간 | 토큰 | 비용 | 비율 |
|---|------|------|------|------|
| 1 | {checkpoint1.label} | {segmentTokens} | ${segmentCost} | {percent}% |
| 2 | {checkpoint2.label} | {segmentTokens} | ${segmentCost} | {percent}% |
| - | (마지막 체크포인트 이후) | {remainingTokens} | ${remainingCost} | {percent}% |
| | **합계** | **{totalTokens}** | **${totalCost}** | **100%** |

구간별 비율은 각 구간의 비용을 총 비용으로 나눈 값입니다.
"마지막 체크포인트 이후" 구간은 마지막 체크포인트의 누적값과 최종 누적값의 차이입니다.

## 모델별 내역

| 모델 | 비용 | 토큰 |
|------|------|------|
| {model} | ${cost} | {tokens} |

## 세션 목록

| # | 세션 ID | 등록일 | 자동 등록 |
|---|---------|--------|-----------|
| 1 | {id} | {date} | {예/아니오} |

## 효율 지표

- **일일 비용**: ${cost/days}
- **세션당 출력 토큰**: {output/sessions}
- **캐시 적중률**: {cacheRead / (cacheRead + cacheCreate + input)}%

## 메모

{사용자가 제공한 summary}
```

### 4. tasks.json 업데이트

작업 상태를 "completed"로 변경하고, completedAt 타임스탬프를 추가합니다.

### 5. 결과 출력

```
[Usage Tracker] 작업이 완료되었습니다
- 리포트 저장: ~/.claude/usage-tracker/reports/{taskId}-{date}.md
- 총 비용: ${cost}
- 소요 기간: {days}일
- 세션 수: {count}
```

리포트 전체 내용도 함께 출력합니다.

## 관련

리포트 값이 예상보다 크면 다음 같은 유형의 작업에서 작업 강도를 한 단계 낮춰 본다. 품질이 유지되면 그 단계를 새 기본값으로 삼는다 — [docs/effort-policy.md](../../docs/effort-policy.md).
