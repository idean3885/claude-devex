// 상세 페이지 확인 — 원문 확보 + 묶음 공고 펼치기 + 추천 전용 공고 감지.
//
// 목록 텍스트만으로는 지원 가능 여부를 모른다. 지인·임직원 추천으로만 받는 공고는
// 점수가 높아도 직접 지원할 수 없어 후보에서 빠져야 한다. 상세를 여는 김에 원문도
// 남겨 캡쳐 없이 후속 문서의 재료로 쓴다.
//
// 목록 한 건이 실제로는 여러 지원 단위를 묶은 것일 때가 있다. 그때는 상세를 여는
// 김에 자식 공고로 펼쳐 각자 채점한다 (expand.js).

const { newPage } = require('./browser');
const { expandGrouped } = require('./expand');

// 신호 1: 추천 전용을 명시한 문구.
const REFERRAL_PHRASE =
  /(지인\s*추천\s*전용|임직원[^]{0,12}추천|사내[^]{0,6}추천\s*전용|추천\s*전용\s*(?:공고|채용)|internal\s*referral\s*only)/i;
// 신호 2: 추천서 CTA 만 있고 일반 지원 CTA 가 없음.
const REFERRAL_CTA = /추천서\s*작성/;
const APPLY_CTA = /(지원하기|입사\s*지원|지원서\s*작성|바로\s*지원|apply\s*now|apply\s*for)/i;

function detectReferralOnly(text) {
  const t = (text || '').replace(/\s+/g, ' ');
  if (REFERRAL_PHRASE.test(t)) return true;
  return REFERRAL_CTA.test(t) && !APPLY_CTA.test(t);
}

// innerText 를 리포트에 넣기 좋게 압축한다 — 공백 정리 + 연속 빈 줄 축약 + 상한.
function compactDetail(text, maxChars) {
  return (text || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l || (arr[i - 1] || '').length)
    .join('\n')
    .trim()
    .slice(0, maxChars);
}

// 원문과 함께 SSR 캐시(__NEXT_DATA__)도 꺼낸다. 묶음 공고는 자식 정보가 화면이 아니라
// 캐시에 있어 innerText 만으로는 펼칠 수 없다.
async function fetchPage(browser, url) {
  const page = await newPage(browser);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    return await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return { text: document.body.innerText || '', embedded: el ? el.textContent : null };
    });
  } finally {
    await page.close();
  }
}

async function fetchDetail(browser, url) {
  return (await fetchPage(browser, url)).text;
}

// 핏 후보만 상세를 연다. 추천 전용으로 판정되면 verdict 를 바꿔 후보에서 빼고,
// 상한(cap)을 둬 대상이 많을 때 실행 시간이 발산하지 않게 한다.
//
// 펼쳐진 자식은 원문이 부모 페이지의 캐시에서 이미 나왔으므로 페이지를 다시 열지
// 않는다. 부모는 지원 단위가 아니므로 결과에서 자식으로 갈아끼운다.
async function enrichDetails(browser, result, ctx, cfg = {}) {
  const fits = result.jobs.filter(
    (j) => j.score >= ctx.threshold && j.url && /^https?:/.test(j.url)
  );
  const targeted = fits.slice(0, ctx.detailCap);
  let expanded = 0;

  for (const j of targeted) {
    let page;
    try {
      page = await fetchPage(browser, j.url);
    } catch (e) {
      j.detailError = e.message;
      continue;
    }

    const children = expandGrouped(j, page.embedded, cfg.expand, ctx);
    if (children) {
      for (const c of children) {
        c.referralOnly = detectReferralOnly(c.body || page.text);
        c.detail = compactDetail(c.body, ctx.detailMaxChars);
        if (c.referralOnly) c.verdict = '추천전용';
        delete c.body;
      }
      j.replacedBy = children;
      expanded += children.length;
      continue;
    }

    j.referralOnly = detectReferralOnly(page.text);
    j.detail = compactDetail(page.text, ctx.detailMaxChars);
    if (j.referralOnly) j.verdict = '추천전용';
  }

  if (expanded > 0) {
    result.jobs = result.jobs.flatMap((j) => j.replacedBy || [j]).sort((a, b) => b.score - a.score);
    result.count = result.jobs.length;
  }

  return { examined: targeted.length, skipped: fits.length - targeted.length, expanded };
}

module.exports = { detectReferralOnly, compactDetail, fetchPage, fetchDetail, enrichDetails };
