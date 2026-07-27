// 마크다운 리포트 렌더링.
//
// 핏 후보 / 추천 전용 / 존재 확인을 나눠 적는다. 추천 전용을 지우지 않고 따로 적는 이유는
// 그 회사에 자리가 있다는 사실 자체가 정보이기 때문이다.

function esc(title) {
  return (title || '').replace(/\|/g, '\\|').slice(0, 100);
}

function reasonText(job) {
  return job.reasons.map((x) => `${x.label}(${x.delta > 0 ? '+' : ''}${x.delta})`).join(', ');
}

function renderReport(results, ctx) {
  const lines = [];
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  lines.push(`# 채용 공고 크롤링 결과 (${ts})`);
  lines.push('');
  lines.push(`- 임계값: score >= ${ctx.threshold}`);
  lines.push(`- 대상 수: ${results.length}`);
  lines.push('');

  for (const r of results) {
    lines.push(`## ${r.name}`);
    lines.push('');
    lines.push(`- URL: ${r.url}`);
    lines.push(`- 공고 수: **${r.count}건**${r.fallback ? ' (selector 미매칭 → 링크 heuristic)' : ''}`);
    if (r.error) {
      lines.push(`- **에러**: ${r.error}`);
      lines.push('');
      continue;
    }
    if (r.count === 0) {
      lines.push('- (공고 없음 또는 selector 미매칭)');
      lines.push('');
      continue;
    }

    const fits = r.jobs.filter((j) => j.score >= ctx.threshold && !j.referralOnly);
    const referral = r.jobs.filter((j) => j.referralOnly);
    const rest = r.jobs.filter((j) => j.score < ctx.threshold && !j.referralOnly);

    if (r.detailSkipped) {
      lines.push(`- 상세 미확인 ${r.detailSkipped}건 (detail-cap ${ctx.detailCap} 초과)`);
    }

    if (fits.length > 0) {
      lines.push('');
      lines.push('### 핏 후보 (score >= 임계)');
      lines.push('');
      lines.push('| score | 판정 | 제목 | 근거 |');
      lines.push('|---|---|---|---|');
      for (const j of fits) {
        lines.push(`| ${j.score} | ${j.verdict} | [${esc(j.title)}](${j.url}) | ${reasonText(j)} |`);
      }

      const withDetail = fits.filter((j) => j.detail);
      if (withDetail.length > 0) {
        lines.push('');
        lines.push('### 핏 후보 공고 상세');
        for (const j of withDetail) {
          lines.push('');
          lines.push(`#### ${esc(j.title)}`);
          lines.push('');
          lines.push(`- ${j.url}`);
          lines.push('');
          lines.push('```text');
          lines.push(j.detail);
          lines.push('```');
        }
      }
    }

    if (referral.length > 0) {
      lines.push('');
      lines.push('### 추천 전용 (자가 지원 불가, 제외)');
      lines.push('');
      lines.push('| score | 제목 |');
      lines.push('|---|---|');
      for (const j of referral) {
        lines.push(`| ${j.score} | [${esc(j.title)}](${j.url}) |`);
      }
    }

    if (rest.length > 0) {
      lines.push('');
      lines.push(`### 존재 확인 (score < ${ctx.threshold}, 상위 ${ctx.restCap}건만)`);
      lines.push('');
      lines.push('| score | 판정 | 제목 |');
      lines.push('|---|---|---|');
      for (const j of rest.slice(0, ctx.restCap)) {
        lines.push(`| ${j.score} | ${j.verdict} | [${esc(j.title)}](${j.url}) |`);
      }
      if (rest.length > ctx.restCap) {
        lines.push('');
        lines.push(`> 임계 미만 ${rest.length - ctx.restCap}건은 생략했습니다.`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderDetailFile(company, job, stamp) {
  return [
    `# ${company} 공고 상세 (크롤 ${stamp})`,
    '',
    `- URL: ${job.url}`,
    `- 핏 score: ${job.score} (${job.reasons.map((x) => x.label).join(', ')})`,
    '',
    '## 공고 원문 (innerText)',
    '',
    '```text',
    job.detail,
    '```',
  ].join('\n');
}

module.exports = { renderReport, renderDetailFile };
