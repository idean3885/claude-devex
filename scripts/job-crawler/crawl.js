#!/usr/bin/env node
// 채용 공고 크롤러 엔진 (SPA 렌더링 + 룰 기반 핏 스코어링).
//
// 엔진은 대상·판정 기준·임계값·출력 경로를 소유하지 않는다. 전부 소비 프로젝트의
// 프로파일이 공급하며, 엔진은 렌더링·추출·스코어링·추천 전용 감지·리포트만 한다.
//
// 사용법:
//   node crawl.js                                  # 프로파일 전체 대상
//   node crawl.js 대상A 대상B                       # 이름 부분 일치로 좁힘
//   node crawl.js --profile path/to/profile.json
//   node crawl.js --threshold 3                    # 임계값 덮어쓰기
//   node crawl.js --url https://... --name 이름     # 프로파일 없는 대상 즉석 추가
//   node crawl.js --no-detail                      # 상세 확인 생략 (목록만)
//   node crawl.js --detail-cap 20                  # 상세 확인 상한
//   node crawl.js --out dir                        # 출력 디렉토리 덮어쓰기
//
// 종료 코드: 0 성공, 1 실행 오류, 2 대상 미매칭, 3 브라우저 준비 실패

const fs = require('fs');
const path = require('path');

const { launch } = require('./lib/browser');
const { load } = require('./lib/profile');
const { compileRules } = require('./lib/scorer');
const { collectOne, DEFAULT_LINK_PATTERN } = require('./lib/collect');
const { enrichDetails } = require('./lib/detail');
const { renderReport, renderDetailFile } = require('./lib/report');

function parseArgs(argv) {
  const cli = { only: [], adhoc: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') cli.profile = argv[++i];
    else if (a === '--threshold') cli.threshold = parseInt(argv[++i], 10);
    else if (a === '--url') cli.adhoc.url = argv[++i];
    else if (a === '--name') cli.adhoc.name = argv[++i];
    else if (a === '--no-detail') cli.detail = false;
    else if (a === '--detail-cap') cli.detailCap = parseInt(argv[++i], 10);
    else if (a === '--out') cli.out = argv[++i];
    else if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    else cli.only.push(a);
  }
  return cli;
}

// 프로파일 값 위에 CLI 를 덮어쓴 실행 컨텍스트.
function buildContext(profile, cli) {
  const detailCfg = profile.detail || {};
  const linkCfg = profile.fallbackLinkPattern || {};
  return {
    threshold: cli.threshold != null && !Number.isNaN(cli.threshold)
      ? cli.threshold
      : profile.threshold != null
        ? profile.threshold
        : 5,
    detail: cli.detail != null ? cli.detail : detailCfg.enabled !== false,
    detailCap: cli.detailCap != null && !Number.isNaN(cli.detailCap)
      ? cli.detailCap
      : detailCfg.cap != null
        ? detailCfg.cap
        : 12,
    detailMaxChars: detailCfg.maxChars != null ? detailCfg.maxChars : 4000,
    restCap: (profile.report && profile.report.restCap) != null ? profile.report.restCap : 10,
    linkPattern: new RegExp(linkCfg.pattern || DEFAULT_LINK_PATTERN, linkCfg.flags || 'i'),
    rules: compileRules(profile.rules),
    outDir: cli.out || (profile.output && profile.output.dir) || 'job-crawler-output',
  };
}

function selectTargets(profile, cli) {
  const entries = Object.entries(profile.targets);
  let targets = entries;
  if (cli.only.length > 0) {
    targets = entries.filter(([k]) => cli.only.some((o) => k.includes(o) || o.includes(k)));
    if (targets.length === 0) {
      const err = new Error(
        `일치하는 대상 없음. 후보: ${Object.keys(profile.targets).join(', ')}`
      );
      err.exitCode = 2;
      throw err;
    }
  }
  if (cli.adhoc.url && cli.adhoc.name) {
    targets = targets.concat([[cli.adhoc.name, { url: cli.adhoc.url }]]);
  } else if (cli.adhoc.url || cli.adhoc.name) {
    const err = new Error('--url 과 --name 은 함께 지정해야 합니다.');
    err.exitCode = 1;
    throw err;
  }
  return targets;
}

function writeOutputs(results, ctx, report) {
  const outDir = path.resolve(process.cwd(), ctx.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

  const reportFile = path.join(outDir, `${stamp}.md`);
  fs.writeFileSync(reportFile, report);
  console.error(`\n[output] ${reportFile}`);

  const detailJobs = results.flatMap((r) =>
    r.jobs
      .filter((j) => j.detail && !j.referralOnly && j.score >= ctx.threshold)
      .map((j) => ({ company: r.name, job: j }))
  );
  if (detailJobs.length === 0) return;

  const detailDir = path.join(outDir, `${stamp}-details`);
  fs.mkdirSync(detailDir, { recursive: true });
  detailJobs.forEach(({ company, job }, i) => {
    const slug = String(i + 1).padStart(2, '0');
    fs.writeFileSync(
      path.join(detailDir, `${company}-${slug}.md`),
      renderDetailFile(company, job, stamp)
    );
  });
  console.error(`[details] ${detailJobs.length}건 → ${detailDir}`);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const { file, profile } = load(cli.profile);
  console.error(`[profile] ${file}`);

  const ctx = buildContext(profile, cli);
  const targets = selectTargets(profile, cli);

  let browser;
  let executablePath;
  try {
    ({ browser, executablePath } = await launch());
  } catch (e) {
    e.exitCode = 3;
    throw e;
  }
  console.error(`[chromium] ${executablePath}`);

  const results = [];
  try {
    for (const [name, cfg] of targets) {
      console.error(`[crawl] ${name} ...`);
      const r = await collectOne(browser, name, cfg, ctx);
      if (ctx.detail && !r.error && r.jobs.some((j) => j.score >= ctx.threshold)) {
        const { examined, skipped } = await enrichDetails(browser, r, ctx);
        r.detailSkipped = skipped;
        const dropped = r.jobs.filter((j) => j.referralOnly).length;
        console.error(
          `[detail] ${name}: ${examined}건 확인` +
            (dropped ? `, 추천 전용 ${dropped}건 제외` : '') +
            (skipped ? `, 상한 초과 ${skipped}건 미확인` : '')
        );
      }
      console.error(`[done] ${name}: ${r.count}건${r.error ? ` (에러: ${r.error})` : ''}`);
      results.push(r);
    }
  } finally {
    await browser.close();
  }

  const report = renderReport(results, ctx);
  console.log(report);
  writeOutputs(results, ctx, report);
}

// 프로파일 오류·대상 미매칭처럼 사용자가 고칠 오류가 대부분이라 메시지만 낸다.
// 스택이 필요하면 JOB_CRAWLER_DEBUG=1.
main().catch((e) => {
  console.error(process.env.JOB_CRAWLER_DEBUG ? e : `오류: ${e.message}`);
  process.exit(e.exitCode || 1);
});
