# PARA 스켈레톤

advisor 엔진이 참조하는 방법론 골격이다. **구조와 규칙(사상)만 여기 두고, 실제 데이터는 소비 프로젝트가 자기 스코프에 채운다.** 방법론을 새로 만드는 게 아니라 PARA(Projects/Areas/Resources/Archives)를 엔진 템플릿으로 제공한다.

## 네 버킷

| 버킷 | 담는 것 | 판별 질문 |
|------|---------|-----------|
| Projects | 끝이 있는 목표. 마감·완료 조건이 있는 일. | "언제 끝나는가?"에 답할 수 있는가 |
| Areas | 지속 책임. 기준을 유지하는 영역. | 끝나지 않고 계속 관리하는가 |
| Resources | 관심 주제·참고 자료. 당장 실행 대상 아님. | 나중에 쓸 수 있는 참고인가 |
| Archives | 위 셋에서 비활성화된 것. | 지금은 안 쓰지만 이력으로 남기는가 |

## 파일링 규칙

- 항목은 한 버킷에만 둔다. 애매하면 "지금 실행 대상인가(Project) / 유지 책임인가(Area) / 참고인가(Resource)" 순으로 판별.
- Project가 끝나면 산출물은 Resource로, 프로젝트 기록은 Archive로 옮긴다.
- Area는 주기적으로 검토해 새 Project를 파생시킬 수 있다.
- 버킷 경로는 소비 프로젝트의 direction profile `para.buckets`가 정한다. 이 문서는 경로를 강제하지 않는다.

## 소비 프로젝트 배치 (데이터)

소비 프로젝트는 profile의 `para.root` 아래에 버킷 디렉토리를 만들어 실제 항목을 둔다. 엔진은 데이터를 소유하지 않고 이 구조를 읽어 조언·정리에 쓴다.

```
<para.root>/
  projects/    # 끝이 있는 목표
  areas/       # 지속 책임
  resources/   # 참고 자료
  archives/    # 비활성 이력
```

## advisor 연동

- advise 모드: 방향(direction) 대비 현재 Projects·Areas의 정렬을 보고 다음 액션을 제안한다.
- review 모드: 산출물을 lenses로 비판할 때, 관련 Area의 기준·Resource 근거를 참조한다.
