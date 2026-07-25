# 정량 지표 정의 SSOT

이 문서는 AI 티 정량 지표의 **정의** 단일 출처(SSOT)다. 실행 카운터는 아니다.

- **정의**: 이 문서. 각 지표가 무엇을 재고, 우리 `base/ai-tells.md` 패턴과 어떻게 연계되는지 규정한다.
- **실행**: 같은 디렉토리의 `tells_count.py`. 슬림 카운터로, baseline 코퍼스에 의존하지 않는다.

번역학 3축(simplification·normalisation·interference)을 지표 축으로 인코딩한다. 출처는 Baker(1993, normalisation), Toury(1995, law of interference), Toral(2019, post-editese simplification)이다.

> **출처**: 지표 골격과 14개 함수 정의는 [`epoko77-ai/im-not-ai`](https://github.com/epoko77-ai/im-not-ai) 의 `metrics_v2.py`(MIT)에서 차용했다. 본 문서는 그 정의를 우리 SSOT 맥락(ai-tells A~K 패턴 연계, 철칙 #4 변경률 게이트)으로 재기술한 파생물이며 동일 MIT 로 배포된다.

> **미러 정책**: 이 문서는 `base/` 미러 대상이 아니다. 세션 예산(SessionStart hook 이 `~/.claude/ops-agent/style-rules/` 로 복사하는 base/extensions)을 보호하기 위해 `metrics/` 는 필요 시에만 참조한다.

---

## 14 지표 표

| # | 축 | 지표명 | 정의(한 줄) | ai-tells 연계 | tells_count.py 구현 | speculative |
|---|----|--------|-------------|---------------|---------------------|-------------|
| 1 | simplification | `lexical_diversity_ttr` | 어절 TTR(고유 어절 ÷ 전체 어절). 낮을수록 반복적 | (직접 연계 없음, 관찰만) | 정의만 | true |
| 2 | simplification | `lexical_density` | 내용어 비율. 한자 명사화 접미사·서술 종결 기준 프록시. 낮을수록 기능어 과다 | F-3, F-4 | 정의만 | true |
| 3 | simplification | `ending_diversity` | 고유 종결어미 ÷ 전체 문장. 낮을수록 종결 단조 | E-2 | 정의만 | true |
| 4 | normalisation | `normalisation_score` | 문장 종결이 `-한다`/`-된다`/`-이다`인 비율. 높을수록 정규화 | E-2 | 정의만 | true |
| 5 | normalisation | `da_streak_rate` | `-다` 종결 4문장 이상 연속 구간의 개수 | E-2 | 정의만 | false |
| 6 | interference(T1) | `inanimate_subject_rate` | 무정물 주어 + 보편 서술어(보여준다·시사한다 등) 문장 비율 | A-10 | 정의만 | false |
| 7 | interference(T2a) | `by_passive_count` | `~에 의해` + 피동 동사 공기 횟수. 단순 `에 의해`는 제외 | A-5 | 정의만 | false |
| 8 | interference(T2b) | `double_passive_count` | 이중 피동(되어진다·보여진다·잊혀진 등) 표층 횟수 | A-4 | 구현 | false |
| 9 | interference(T3) | `pronoun_density` | 문단 평균 인칭대명사(그/그녀/그것/그들) 밀도 | A-6 | 구현 | false |
| 10 | interference(T4) | `deul_overuse_rate` | 무정·추상명사 + `-들` 과용 비율(데이터들·결과들 등) | (A 계열 보류, 관찰만) | 정의만 | false |
| 11 | interference(T5) | `relative_clause_nesting` | 관형절 3중 이상 중첩 문장의 개수 | A-8 | 정의만 | false |
| 12 | interference(T6) | `have_make_literal_count` | have/make 경동사 직역(가지고 있다·결정을 내리다 등) 횟수 | A-7 | 구현 | false |
| 13 | interference(T7) | `double_particle_count` | 이중 조사(에서의·으로의·에의·으로부터의 등) 횟수 | A-9 | 구현 | false |
| 14 | interference(T8b) | `progressive_aspect_rate` | 문장당 `~고 있다` 진행형 비율 | E-3 | 정의만 | false |

### 열 설명

- **축**: 번역학 3축. simplification(단순화·반복), normalisation(정규화·표준 종결 집중), interference(원문 통사 간섭). 괄호 안 `T*`는 im-not-ai 보고서의 번역투 유형 번호.
- **ai-tells 연계**: 우리 `base/ai-tells.md` 카테고리 번호. `deul_overuse_rate`는 아직 전용 카테고리를 두지 않고 관찰만 한다.
- **tells_count.py 구현**: `구현`은 `tells_count.py` 에 실제 함수가 있는 지표(8·9·12·13번 + 부가 지표 `change_rate`·`antithesis_count`). 나머지는 정의만 두고 구현을 유보한다.
- **speculative**: `true`는 우리가 아직 채택하지 않은 지표. baseline 코퍼스가 있어야 값을 해석할 수 있는 분포형 비율(simplification 3종 + `normalisation_score`)이 해당한다. `false`는 표층 매칭 절대 카운트로, baseline 없이도 존재만으로 판정 가능한 지표다.

---

## 부가 지표

14 지표 밖이지만 게이트에 직접 쓰이는 두 카운터. 둘 다 `tells_count.py` 에 구현한다.

### change_rate (철칙 #4 변경률 SSOT)

윤문 전후 문자 기반 변경률의 단일 진실 원천. 에이전트의 눈대중 자가 산출을 대체한다.

- 계산: `difflib.SequenceMatcher` 문자 단위 유사도의 보수(`1 - ratio`). 범위 0.0(동일) ~ 1.0(전면 교체).
- 게이트: 0.30 초과 시 경고(과윤문 점검), 0.50 초과 시 강제 중단. `base/ai-tells.md` 4대 철칙 #4 와 1:1 대응.
- `ignore_markup=True` 옵션: 마크업 전용 줄(코드 펜스·수평선·표 구분선)과 줄머리 장식(헤딩·불릿·번호·인용)을 제거한 뒤 본문만 비교한다. 헤딩·마크업 삭제가 본문 변경률을 부풀리는 문제 보정용.

### antithesis_count (C-10 대구 게이트)

부정-긍정 대구(`X가 아니라 Y`, `~이기 이전에` 류) 카운트. 진단 앵커 전용.

- **절대치 판정 금지**. 대구는 사람 글에도 흔한 정상 수사다.
- 용도: `before >= 5 AND after == 0`(윤문이 수사 구조를 몰살) 판정에만 쓴다. 문자 diff 가 못 보는 구조 편집을 잡는 보조 신호다.

---

## 미채택 명시

다음은 im-not-ai `metrics_v2.py` 에 있으나 우리가 **채택하지 않은** 요소다.

| 미채택 요소 | 사유 |
|-------------|------|
| z-score(`_z_simple`, `v2_z_scores`) | 한국어 비번역 baseline 코퍼스 부재. 평균·표준편차 기준이 없어 정규화 불가 |
| `interference_index` 가중 합성 | 하위 T1~T8 신호를 임의 가중치로 합산한 서술적 지표. 우리 판정은 개별 카운트로만 한다 |
| baseline 비교(`baseline_v2.json`) | 업스트림 baseline 은 전 셀이 `_placeholder: true`(calibration 미완). 추정치 기반 비교는 도입하지 않는다 |

**도입 조건**: 위 요소는 한국어 baseline 코퍼스(세종 말뭉치·국립국어원 모두의 말뭉치 등) 실측 calibration 이 선행되어야 한다. baseline 확보 전까지 speculative `true` 지표는 정의만 유지하고 판정 게이트에 넣지 않는다.

---

## 변경 이력

| 날짜 | 변경 | 출처 |
|------|------|------|
| 2026-07-26 | 초안 작성. metrics_v2.py 14 지표 정의 + 부가 지표(change_rate·antithesis_count) + 미채택 명시 | epoko77-ai/im-not-ai (MIT) |
