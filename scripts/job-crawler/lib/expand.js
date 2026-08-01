// 묶음 공고 펼치기 — 한 URL 아래 여러 직무가 묶인 공고를 개별 공고로 분해한다.
//
// 목록에서는 한 건으로 보이지만 실제 지원 단위는 그 아래 자식 공고인 채용 페이지가 있다.
// 부모 URL 의 원문은 소개뿐이라 자격요건·전형절차가 없고, 점수도 묶음 제목 하나로만
// 매겨진다. 자식은 <a href> 로 노출되지 않고 쿼리 파라미터로만 갈리므로 링크 추출로도
// 닿지 않는다. 다만 자식의 제목·소속·원문이 부모 페이지의 SSR 캐시에 이미 실려 있는
// 경우가 많아, 그때는 추가 요청 없이 꺼내 쓴다.
//
// 엔진은 어떤 사이트가 이 구조인지 모른다. 적용 대상과 필드 이름은 프로파일의
// targets[].expand 가 공급한다.

const { score, classify } = require('./scorer');

// react-query 의 SSR 캐시는 __NEXT_DATA__ 안에 들어가지만 경로가 프레임워크 버전마다
// 다르다. 고정 경로 대신 queryKey + state 를 가진 배열을 찾아 들어간다.
function findQueries(node, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return out;
  if (Array.isArray(node)) {
    if (node.length > 0 && node.every((x) => x && typeof x === 'object' && 'queryKey' in x)) {
      out.push(node);
      return out;
    }
    for (const child of node) findQueries(child, out, depth + 1);
    return out;
  }
  for (const key of Object.keys(node)) findQueries(node[key], out, depth + 1);
  return out;
}

// queryKey 는 배열이라 문자열로 눌러 부분 일치로 찾는다. 캐시 키에는 파라미터가
// 함께 들어가므로 완전 일치를 요구하면 대상 사이트마다 키를 다시 적어야 한다.
function pickQueryData(embedded, keyPart) {
  let root;
  try {
    root = JSON.parse(embedded);
  } catch {
    return null;
  }
  for (const queries of findQueries(root)) {
    for (const q of queries) {
      const flat = JSON.stringify(q.queryKey || '');
      if (!flat.includes(keyPart)) continue;
      const data = q.state && q.state.data;
      if (data != null) return data;
    }
  }
  return null;
}

function toItems(data, jsonString) {
  let value = data;
  if (jsonString && typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.filter((x) => x && typeof x === 'object');
  return [];
}

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&' };

// 캐시에 담긴 본문은 HTML 이 엔티티로 한 번 더 이스케이프된 경우가 있다.
// amp 를 마지막에 풀어야 &amp;lt; 가 < 로 두 번 풀리지 않는다.
function decodeEntities(raw) {
  return String(raw || '').replace(/&(lt|gt|quot|apos|nbsp|#39|amp);/g, (m, name) =>
    name === '#39' ? "'" : ENTITIES[name]
  );
}

function toPlainText(raw) {
  return decodeEntities(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l || (arr[i - 1] || '').length)
    .join('\n')
    .trim();
}

function fieldText(item, field) {
  if (!field) return '';
  const v = item[field];
  if (v == null) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join(' ');
  return String(v);
}

// 자식 URL = 부모 URL + 선언된 쿼리 파라미터. 부모가 이미 갖고 있는 식별자(job_id 등)를
// 그대로 물려받아야 하므로 새로 조립하지 않고 덧쓴다.
function buildChildUrl(parentUrl, item, params) {
  let u;
  try {
    u = new URL(parentUrl);
  } catch {
    return null;
  }
  let touched = false;
  for (const [param, field] of Object.entries(params || {})) {
    const v = fieldText(item, field);
    if (!v) continue;
    u.searchParams.set(param, v);
    touched = true;
  }
  return touched ? u.toString() : null;
}

// 채점 텍스트는 제목·소속·키워드까지만. 본문 전문으로 채점하면 목록 제목으로 채점되는
// 다른 대상보다 점수가 부풀어 대상 간 비교가 깨진다.
function scoreText(item, cfg) {
  return [
    fieldText(item, cfg.title || 'title'),
    fieldText(item, cfg.group),
    fieldText(item, cfg.keywords),
  ]
    .filter(Boolean)
    .join(' ');
}

function childTitle(item, cfg) {
  const title = fieldText(item, cfg.title || 'title').trim();
  const group = fieldText(item, cfg.group).trim();
  if (!title) return group;
  return group && !title.includes(group) ? `${group} ${title}` : title;
}

// 부모 공고 1건 → 자식 공고 N건. 펼칠 수 없으면 null 을 돌려 호출부가 부모를 그대로 두게 한다.
function expandGrouped(parentJob, embedded, cfg, ctx) {
  if (!cfg || !cfg.queryKey || !embedded) return null;
  const data = pickQueryData(embedded, cfg.queryKey);
  if (data == null) return null;

  const items = toItems(data, cfg.jsonString === true);
  if (items.length === 0) return null;

  const children = [];
  const seen = new Set();
  for (const item of items) {
    const url = buildChildUrl(parentJob.url, item, cfg.params);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = childTitle(item, cfg);
    if (!title) continue;

    const s = score(scoreText(item, cfg), ctx.rules);
    const body = cfg.body ? toPlainText(item[cfg.body]) : '';
    children.push({
      title,
      url,
      score: s.score,
      verdict: classify(s.score, ctx.threshold),
      reasons: s.reasons,
      expandedFrom: parentJob.title,
      body,
    });
  }

  return children.length > 0 ? children : null;
}

module.exports = { expandGrouped, pickQueryData, toPlainText, buildChildUrl };
