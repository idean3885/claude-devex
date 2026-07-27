// 룰 기반 스코어러 (엔진).
//
// 엔진은 판정 기준을 갖지 않는다. 룰은 전부 프로파일이 공급하며 여기서는
// 매칭·합산·등급 산출만 한다. 같은 label 은 한 번만 가산한다 — 한 공고 안에서
// 같은 근거가 여러 번 걸려도 점수가 부풀지 않게 한다.

// 프로파일의 { pattern, flags, delta, label } 을 실행 가능한 룰로 변환한다.
function compileRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error('프로파일에 rules 가 없습니다. 점수 기준은 소비 프로젝트가 공급합니다.');
  }
  return rules.map((r, i) => {
    if (!r || typeof r.pattern !== 'string') {
      throw new Error(`rules[${i}].pattern 이 문자열이 아닙니다.`);
    }
    if (typeof r.delta !== 'number') {
      throw new Error(`rules[${i}].delta 가 숫자가 아닙니다.`);
    }
    let re;
    try {
      re = new RegExp(r.pattern, r.flags || 'i');
    } catch (e) {
      throw new Error(`rules[${i}].pattern 정규식 오류: ${e.message}`);
    }
    return { re, delta: r.delta, label: r.label || r.pattern };
  });
}

function score(text, compiled) {
  const reasons = [];
  const seen = new Set();
  let total = 0;
  for (const rule of compiled) {
    if (!rule.re.test(text)) continue;
    if (seen.has(rule.label)) continue;
    seen.add(rule.label);
    total += rule.delta;
    reasons.push({ label: rule.label, delta: rule.delta });
  }
  return { score: total, reasons };
}

// 임계값 기준 4등급. strong 은 임계 + strongMargin 이상.
function classify(value, threshold, strongMargin = 5) {
  if (value >= threshold + strongMargin) return '핏 강';
  if (value >= threshold) return '핏 후보';
  if (value >= 0) return '존재 확인';
  return '불일치';
}

module.exports = { compileRules, score, classify };
