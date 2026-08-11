---
name: learn
description: 교훈 후보를 검토해 자산으로 등재한다. Stop 훅이 적립한 후보 중 게이트를 통과한 것만 승격하고, 재발이면 분석으로 보낸다. 트리거 "learn", "교훈", "레슨 정리", "자산화".
trigger: ["learn", "교훈", "레슨 정리", "자산화"]
---

# 교훈 승격

Stop 훅(`hooks/lesson-capture-stop.sh`)이 적립한 후보를 읽어 교훈 자산으로 등재한다. 용어·절차·재발 분석은 [docs/lessons.md](../../docs/lessons.md) 가 정본이며 여기서 재정의하지 않는다.

## 후보 파일

`~/.claude/lesson-candidates.jsonl` 에 한 줄이 후보 1건으로 쌓인다. 사용자 발화 원문이 들어가므로 로컬 전용이고 레포에 커밋하지 않는다.

| 필드 | 내용 |
|------|------|
| `capturedAt` | 적립 시각 |
| `session` · `transcript` | 원본 포인터. 등재 시 그대로 옮긴다 |
| `cwd` | 발생 위치 |
| `signals` | 검출된 신호 라벨 |
| `excerpt` | 사용자 발화 앞 400자 |

## 절차

1. 후보 파일을 읽는다. 없거나 비어 있으면 "후보 없음" 을 보고하고 끝낸다
2. 후보마다 교정인지 판정한다. 단순 방향 전환·취향 변경은 교훈이 아니다
3. 소비 프로젝트의 교훈 버킷과 대조한다. 재발이면 새 파일을 만들지 않고 발생 이력을 더한 뒤 분석으로 보낸다
4. 게이트 3종을 통과시킨다
5. 통과분만 등재한다. 등재와 로컬 인덱스 요약은 한 동작이다
6. 처리한 후보를 원본에서 옮긴다

## 게이트

| 게이트 | 판정 |
|--------|------|
| 사실 확인 | 원천이 실제로 그 파일·그 위치에 있는가. 원천이 최신 사실과 맞는가 |
| 모순 확인 | 기존 교훈과 충돌하지 않는가 |
| 일반화 확인 | 한 번의 변동을 규칙으로 굳히는 건 아닌가 |

통과하지 못한 후보는 기각으로 기록한다. 기각률이 이 절차의 자기 점검 지표다.

## 등재 시 필수

- **원본 포인터를 남긴다.** `session`·`transcript` 를 교훈 파일에 옮긴다. 요약만 남기면 잃은 신호를 되짚을 수 없다
- **로컬 인덱스 요약을 함께 쓴다.** 원격 등재만으로는 다음 판단 시점에 닿지 않는다. 실제로 등재 직후 같은 오판이 재발한 사례가 있다

## 후보 정리

처리분은 지우지 않고 옮긴다. 기각 이력도 지표에 쓰인다.

```bash
python3 - <<'PY'
import json, os
src = os.path.expanduser("~/.claude/lesson-candidates.jsonl")
dst = os.path.expanduser("~/.claude/lesson-candidates.processed.jsonl")
keep, moved = [], []
handled = {"<처리한 excerpt 앞부분>"}   # 승격·기각 판정을 끝낸 후보
for line in open(src):
    rec = json.loads(line)
    (moved if any(h in rec["excerpt"] for h in handled) else keep).append(line)
with open(dst, "a") as f:
    f.writelines(moved)
with open(src, "w") as f:
    f.writelines(keep)
print(f"moved={len(moved)} keep={len(keep)}")
PY
```

## 하지 않는 것

- 자동 등재. 훅은 후보 적립까지만 하고 승격은 사람 확인을 거친다
- 재발을 차단 규칙 추가로 처리. 재발은 분석으로 보낸다
- 후보 파일 커밋

## 경계

버킷 경로와 프론트매터 필드 이름은 소비 프로젝트가 정한다. 정의가 없으면 어디에 둘지 확인하고 멈춘다. 추측해서 새 위치를 만들지 않는다.
