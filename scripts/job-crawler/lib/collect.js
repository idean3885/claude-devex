// 목록 페이지 수집 — SPA 렌더 대기 → lazy load 스크롤 → 공고 항목 추출.
//
// selector 를 아는 대상은 container 로 뽑고, 모르는 대상은 링크 텍스트 heuristic 으로
// 떨어진다. heuristic 은 "공고처럼 보이는 링크" 를 거르는 사전 필터라 어떤 직군을 찾는지에
// 좌우된다 — 그래서 패턴을 프로파일이 덮어쓸 수 있게 둔다.

const { newPage } = require('./browser');
const { score, classify } = require('./scorer');

const DEFAULT_LINK_PATTERN =
  '(개발|엔지니어|채용|공고|Engineer|Developer|Backend|Frontend|Server|SRE|Data|Cloud|Platform)';

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
}

async function extractByContainer(page, selector) {
  return page.$$eval(selector, (nodes) =>
    nodes
      .map((n) => {
        const rect = n.getBoundingClientRect ? n.getBoundingClientRect() : null;
        const text = (n.innerText || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 500);
        const href = n.getAttribute && n.getAttribute('href');
        return { text, href, hidden: rect && rect.width === 0 && rect.height === 0 };
      })
      .filter((x) => x.text && !x.hidden)
  );
}

async function extractByLinkText(page, patternSource, flags) {
  return page.$$eval(
    'a',
    (nodes, src, fl) => {
      const re = new RegExp(src, fl);
      return nodes
        .map((n) => ({
          text: (n.innerText || '').trim().replace(/\s+/g, ' '),
          href: n.getAttribute('href') || '',
        }))
        .filter((x) => x.text.length > 5 && x.text.length < 300 && re.test(x.text));
    },
    patternSource,
    flags
  );
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function collectOne(browser, name, cfg, ctx) {
  const page = await newPage(browser);
  const result = { name, url: cfg.url, count: 0, jobs: [], error: null, fallback: false };

  try {
    await page.goto(cfg.url, { waitUntil: 'networkidle2', timeout: 45000 });

    if (cfg.waitFor) {
      try {
        await page.waitForSelector(cfg.waitFor, { timeout: 8000 });
      } catch {
        // 대기 실패해도 계속 — 아래 추출에서 fallback 이 받는다
      }
    }

    await scrollThrough(page);
    await new Promise((r) => setTimeout(r, 1500));

    let items = [];
    if (cfg.extract && cfg.extract.container) {
      items = await extractByContainer(page, cfg.extract.container);
    }
    if (items.length === 0) {
      result.fallback = true;
      items = await extractByLinkText(page, ctx.linkPattern.source, ctx.linkPattern.flags);
    }

    result.jobs = dedupe(items)
      .map((it) => {
        const s = score(it.text, ctx.rules);
        const url = it.href
          ? it.href.startsWith('http')
            ? it.href
            : new URL(it.href, cfg.url).toString()
          : cfg.url;
        return {
          title: it.text,
          url,
          score: s.score,
          verdict: classify(s.score, ctx.threshold),
          reasons: s.reasons,
        };
      })
      .sort((a, b) => b.score - a.score);

    result.count = result.jobs.length;
  } catch (e) {
    result.error = e.message;
  } finally {
    await page.close();
  }

  return result;
}

module.exports = { collectOne, DEFAULT_LINK_PATTERN };
