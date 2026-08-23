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
  // 상세 확인이 꺼진 회차와 켜진 회차의 리포트가 같은 모양이면, 추천 전용이 걸러지지
  // 않은 결과를 걸러진 것으로 읽는다.
  lines.push(`- 상세 확인: ${ctx.detail ? `켜짐 (상한 ${ctx.detailCap}건)` : '**꺼짐 — 추천 전용·상세 실격 판정이 수행되지 않았습니다**'}`);
  lines.push('');

  for (const r of results) {
    lines.push(`## ${r.name}`);
    lines.push('');
    lines.push(`- URL: ${r.url}`);
    const source = r.listSource === 'declared'
      ? ` (프로파일 선언 경로, 응답 ${r.listTotal}건 중 마감 ${r.listClosed}건 제외)`
      : r.fallback ? ' (selector 미매칭 → 링크 heuristic)' : '';
    lines.push(`- 공고 수: **${r.count}건**${source}`);
    if (r.listUnreached) {
      lines.push(`- **목록 도달 실패**: ${r.listUnreached}`);
      lines.push('  - 위 건수는 공고 수가 아닙니다. 수집 실패이므로 수기 확인이 필요합니다');
    }
    if (r.detailFailed) {
      lines.push(`- **상세 확인 실패 ${r.detailFailed}건**: ${(r.detailFailReasons || []).join(' · ')}`);
    }
    if (r.expanded) {
      lines.push(`- 묶음 공고를 지원 단위 **${r.expanded}건**으로 펼침`);
    }
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

    const unchecked = r.jobs.filter((j) => j.detailError);
    const fits = r.jobs.filter((j) => j.score >= ctx.threshold && !j.referralOnly && !j.detailError);
    const referral = r.jobs.filter((j) => j.referralOnly);
    const rest = r.jobs.filter((j) => j.score < ctx.threshold && !j.referralOnly && !j.detailError);

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

    if (unchecked.length > 0) {
      lines.push('');
      lines.push('### 상세 미확인 (판정 보류)');
      lines.push('');
      lines.push('점수는 임계 이상이나 상세를 열지 못해 추천 전용 여부를 판정하지 못했습니다. 핏 후보와 같은 자리에 두지 않습니다.');
      lines.push('');
      lines.push('| score | 제목 | 사유 |');
      lines.push('|---|---|---|');
      for (const j of unchecked) {
        lines.push(`| ${j.score} | [${esc(j.title)}](${j.url}) | ${esc(j.detailError)} |`);
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
  const head = [
    `# ${company} 공고 상세 (크롤 ${stamp})`,
    '',
    `- URL: ${job.url}`,
    `- 핏 score: ${job.score} (${job.reasons.map((x) => x.label).join(', ')})`,
  ];
  if (job.expandedFrom) {
    head.push(`- 묶음 공고에서 펼침: ${job.expandedFrom}`);
  }
  return head
    .concat([
      '',
      job.expandedFrom ? '## 공고 원문 (묶음 공고 캐시)' : '## 공고 원문 (innerText)',
      '',
      '```text',
      job.detail,
      '```',
    ])
    .join('\n');
}

module.exports = { renderReport, renderDetailFile };
