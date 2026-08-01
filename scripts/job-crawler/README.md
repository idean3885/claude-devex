# job-crawler — 채용 공고 크롤링·핏 스코어링 엔진

SPA 채용 페이지를 헤드리스 Chromium 으로 렌더링해 공고를 추출하고, 프로파일이 공급한 룰로 점수를 매겨 마크다운 리포트를 낸다.

**엔진은 대상·판정 기준·임계값·출력 경로를 갖지 않는다.** 전부 소비 프로젝트의 프로파일이 공급한다. 스킬로 노출하지 않는 이유는 매 세션 시스템 프롬프트를 차지할 만큼 자주 쓰는 도구가 아니어서다 — 필요할 때 스크립트로 직접 실행한다.

## 책임 경계

| 엔진 (여기) | 소비 프로젝트 (프로파일) |
|---|---|
| SPA 렌더 대기·lazy load 스크롤 | 크롤링 대상 목록 (url·selector) |
| selector 추출 + 링크 heuristic fallback | 핏 룰 (pattern·delta·label) |
| 룰 합산·등급 판정 | 임계값 |
| 묶음 공고를 지원 단위로 펼치기 | 어느 대상이 묶음 구조인지 (`expand`) |
| 추천 전용 공고 감지·후보 제외 | 상세 확인 상한, 출력 경로 |
| 공고 원문 저장, 마크다운 리포트 | |

## 준비

`puppeteer-core` 는 소비 프로젝트가 설치한다. 브라우저는 내려받지 않고 이미 설치된 실행 파일을 재사용한다.

```bash
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 npm install puppeteer-core --no-save
```

실행 파일 탐색 순서는 `CHROME_PATH` → macOS/Linux 표준 경로 → `/opt/pw-browsers` 순회. 못 찾으면 `CHROME_PATH` 로 지정한다.

## 프로파일

탐색 순서는 advisor 와 같다.

```bash
# 1. 유저 스코프 (플러그인 업데이트와 무관하게 유지)
~/.claude/job-crawler/profiles/<name>.json
# 2. 프로젝트 스코프
config/job-crawler/<name>.json
```

후보가 여러 개면 `project` 필드로 현재 디렉토리 이름과 매칭한다. 좁혀지지 않으면 추측하지 않고 멈춘다. 스키마와 필드 설명은 [`config/job-crawler/example.json`](../../config/job-crawler/example.json).

## 실행

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/job-crawler/crawl.js            # 프로파일 전체 대상
node .../crawl.js 대상A 대상B                                       # 이름 부분 일치로 좁힘
node .../crawl.js --threshold 3                                    # 임계값 덮어쓰기
node .../crawl.js --url https://... --name 이름                     # 프로파일 없는 대상 즉석 추가
node .../crawl.js --no-detail                                      # 상세 확인 생략 (목록만)
node .../crawl.js --detail-cap 20                                  # 상세 확인 상한
node .../crawl.js --out dir                                        # 출력 경로 덮어쓰기
```

출력은 `{output.dir}/{YYYY-MM-DD-HHMM}.md` 리포트와, 핏 후보 상세가 있으면 `{stamp}-details/` 개별 파일.

종료 코드: `0` 성공 · `1` 실행 오류 · `2` 대상 미매칭 · `3` 브라우저 준비 실패.

## 판정

| 등급 | 조건 |
|---|---|
| 핏 강 | score >= 임계 + 5 |
| 핏 후보 | score >= 임계 |
| 존재 확인 | score >= 0 |
| 불일치 | score < 0 |
| 추천전용 | 상세에서 추천 전용으로 판정 (핏 후보에서 제외) |

추천 전용은 지인·임직원 추천으로만 받는 공고다. 점수가 높아도 직접 지원할 수 없어 후보에서 빼되, 자리가 있다는 사실은 정보라 리포트에는 따로 남긴다. 판정 신호는 두 가지 — 명시 문구, 또는 추천서 CTA 만 있고 일반 지원 CTA 가 없는 경우.

## 묶음 공고 펼치기

목록에서는 한 건인데 그 아래 계열사별·챕터별 자식 공고가 여러 건 달린 채용 페이지가 있다. 부모 URL 만 보면 세 가지가 어긋난다.

- 원문이 소개뿐이라 자격요건·우대사항·전형절차가 잡히지 않는다
- 점수가 묶음 제목 하나로만 매겨져 어느 자식이 맞는지 알 수 없다
- 자식이 `<a href>` 가 아니라 쿼리 파라미터로만 갈려 링크 추출로 닿지 않는다

자식의 제목·소속·키워드·원문이 상세 페이지의 react-query SSR 캐시(`__NEXT_DATA__`)에 통째로 실려 있으면, 프로파일이 `targets[].expand` 를 선언해 부모 1건을 자식 N건으로 갈아끼운다. 자식 페이지를 따로 열지 않으므로 추가 요청이 없고 `detail.cap` 도 소비하지 않는다.

```json
"expand": {
  "queryKey": "sub-positions",
  "jsonString": true,
  "group": "company",
  "keywords": "keywords",
  "body": "description",
  "params": { "sub_position_id": "id", "company": "company" }
}
```

자식 URL 은 부모 URL 에 `params` 를 덧쓴 것이다. 채점 텍스트는 제목·소속·키워드까지로 제한한다 — 본문 전문으로 채점하면 목록 제목으로 채점되는 다른 대상보다 점수가 부풀어 대상 간 비교가 깨진다. 본문은 원문 저장과 추천 전용 감지에만 쓴다. 캐시에서 항목을 찾지 못하면 부모를 그대로 둔다. 필드 설명은 [`config/job-crawler/example.json`](../../config/job-crawler/example.json) 의 `_expandNote`.

## 한계

- 봇 차단(Cloudflare 등)이 걸린 사이트는 뚫지 않는다. 실패는 리포트에 에러로 남는다
- 로그인이 필요한 페이지는 크롤링하지 않는다
- `extract.container` 가 없으면 링크 heuristic 으로 떨어져 정확도가 낮다. 리포트에 fallback 여부를 표기하므로 정제가 필요한 대상을 알 수 있다
- 상세 확인은 `detail.cap` 까지만. 초과분은 리포트에 미확인 건수로 적는다

## MITM 프록시 환경

TLS 를 재종단하는 프록시 뒤에서는 모든 대상이 `net::ERR_CONNECTION_RESET` 으로 실패할 수 있다. 원인은 egress 차단이 아니라 핸드셰이크다 — Chromium(TLS 1.3)의 ClientHello 가 post-quantum key share 때문에 ~1.7KB 로 커지면 프록시가 RST 로 끊는다. curl 은 PQ key share 를 보내지 않아 통과하므로 도메인 도달 자체는 가능하다.

엔진은 launch args 에 `--ssl-version-max=tls1.2` 를 고정해 ClientHello 를 줄인다. `HTTPS_PROXY`/`HTTP_PROXY` 가 설정돼 있으면 `--proxy-server` 로 전달한다.
