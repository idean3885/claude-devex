/**
 * 대외비 규칙 로딩 · 저장소 공개 여부 판정 (공유 모듈)
 *
 * pre-tool-use.mjs(커밋·이슈·PR 직전 차단)와 confidential-scan.mjs(레포 전수 스캔)가
 * 같은 규칙과 같은 표면 판정을 써야 한다. 복제하면 두 판정이 갈라지고, 스캐너가
 * "깨끗함" 을 보고하는데 가드는 막는(또는 그 반대) 상태가 된다.
 *
 * 규칙 소스는 로컬 전용 파일이다. 공개 레포에 조직 특화 용어를 두지 않는다.
 *   ~/.claude/ops-agent/confidential-keywords.local.json
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// 레포 공개 여부 캐시 유효 기간. 공개 전환은 드물고, 만료 시 재조회한다.
export const VISIBILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 본인 계정·조직 목록 캐시 유효 기간. 소속 변경은 공개 전환보다도 드물다.
export const IDENTITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 이 길이 이하의 ASCII 키워드는 wordBoundary 를 기본 적용한다.
// 실측: 3글자 키워드 하나가 19건 중 12건이 다른 식별자 안에 묻힌 형태였다.
// 오탐이 쌓이면 가드를 끄고 싶어지고, 가드에서 오탐은 결국 무동작으로 이어진다.
export const WORD_BOUNDARY_AUTO_LEN = 3;

/**
 * 단어 경계 문자 집합 — 식별자 문자만 포함한다. 한글은 **넣지 않는다.**
 *
 * 한글을 경계 문자로 넣으면 조사가 붙은 정상 등장이 "묻힌 것" 으로 분류된다.
 * 한국어는 조사가 명사에 직접 붙으므로(`Foo를`, `Foo에서`) 그 형태가 전부 통과하게 되고,
 * 그건 가드에서 오탐이 아니라 **미탐**이다. 오탐은 작업을 막고, 미탐은 대외비를 내보낸다.
 * 두 오류의 비용이 다르므로 경계 판정은 차단 쪽으로 닫는다.
 *
 * 대신 한글만으로 된 키워드에는 경계 판정이 사실상 무력하다(앞뒤가 늘 비경계 문자).
 * 그런 키워드의 오탐은 경계 옵션이 아니라 목록에서 빼는 쪽으로 다룬다.
 */
const WORD_CHAR = /[0-9A-Za-z_]/;

/**
 * 키워드 항목을 정규화한다. 문자열과 객체 양쪽을 받는다.
 *
 *   "abc"                                    → 기본값 적용
 *   { value: "abc", wordBoundary: false }    → 명시 지정
 *   { value: "abc", ignoreCase: true }       → 표기형 무시
 *
 * ignoreCase 를 켜면 대소문자 표기형을 따로 등록할 필요가 없다. 표기형마다 항목을
 * 넣는 방식은 세 번째 표기형이 생기면 빠져나간다.
 */
export function normalizeKeywords(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    let raw, wb, ic;
    if (typeof item === 'string') { raw = item; }
    else if (item && typeof item === 'object' && typeof item.value === 'string') {
      raw = item.value;
      wb = typeof item.wordBoundary === 'boolean' ? item.wordBoundary : undefined;
      ic = typeof item.ignoreCase === 'boolean' ? item.ignoreCase : undefined;
    } else continue;
    if (!raw) continue;
    const asciiWordish = /^[0-9A-Za-z_.-]+$/.test(raw);
    out.push({
      value: raw,
      // 자동 적용은 ASCII 짧은 키워드에만. 한글 키워드는 경계 판정이 무력하므로 켜지 않는다.
      wordBoundary: wb !== undefined ? wb : (asciiWordish && raw.length <= WORD_BOUNDARY_AUTO_LEN),
      ignoreCase: ic !== undefined ? ic : false,
    });
  }
  return out;
}

/**
 * 텍스트에서 키워드 등장 위치를 찾는다. 가드와 스캐너가 같은 매처를 쓴다.
 *
 * 반환: [{ index, length, standalone }]  — standalone 은 경계 판정 결과.
 * 경계 판정을 적용하지 않는 키워드는 standalone 을 null 로 둔다.
 */
export function findKeywordHits(text, kw) {
  const hay = kw.ignoreCase ? text.toLowerCase() : text;
  const needle = kw.ignoreCase ? kw.value.toLowerCase() : kw.value;
  const len = needle.length;
  const hits = [];
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    const standalone = isStandaloneAt(text, idx, len);
    // wordBoundary 가 켜져 있으면 묻힌 등장은 히트로 세지 않는다.
    if (!kw.wordBoundary || standalone) {
      hits.push({ index: idx, length: len, standalone: boundaryApplicable(kw) ? standalone : null });
    }
    idx = hay.indexOf(needle, idx + len);
  }
  return hits;
}

/** 경계 판정이 의미를 갖는 키워드인지. ASCII 식별자 문자를 포함해야 한다. */
export function boundaryApplicable(kw) {
  return WORD_CHAR.test(kw.value);
}

function isStandaloneAt(text, idx, len) {
  const before = idx > 0 ? text[idx - 1] : '';
  const after = idx + len < text.length ? text[idx + len] : '';
  return !(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after));
}

/**
 * 레포가 스스로 선언하는 제외 경로를 읽는다.
 *
 * 키워드는 머신 로컬 설정에만 두고, 제외 경로는 레포에 둔다. 둘의 성격이 다르다.
 * 키워드는 감추려는 문자열 자체라 레포에 커밋하면 그 파일이 곧 유출이다.
 * 제외 경로는 그 레포의 디렉토리 이름 목록이라 공개해도 잃을 것이 없고,
 * 어느 경로가 그 단어를 정당하게 다루는지는 머신이 아니라 레포의 성질이다.
 *
 * 로컬 설정에만 두면 머신을 옮길 때 사라져 같은 커밋이 다시 막힌다.
 * 그래서 이 층은 레포를 따라다닌다.
 *
 * `allowPaths` 만 읽는다. 레포 파일의 keywords·patterns 는 무시한다.
 */
export function loadRepoAllowPaths(repoRoot) {
  if (!repoRoot) return [];
  const p = join(repoRoot, '.ops-agent', 'confidential.json');
  if (!existsSync(p)) return [];
  try {
    return toRegexArray(JSON.parse(readFileSync(p, 'utf8')).allowPaths);
  } catch {
    return [];
  }
}

export function loadConfig(repoRoot) {
  const cfgPath = process.env.OPS_AGENT_CONFIDENTIAL_CONFIG_PATH
    || join(homedir(), '.claude', 'ops-agent', 'confidential-keywords.local.json');
  const repoAllowPaths = loadRepoAllowPaths(repoRoot);
  const empty = {
    keywords: [], patterns: [],
    externalOnly: { keywords: [], patterns: [] },
    personalDevOnly: { keywords: [], patterns: [] },
    internalHosts: [], allowPaths: repoAllowPaths,
  };
  if (!existsSync(cfgPath)) return empty;
  try {
    const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
    return {
      keywords: normalizeKeywords(raw.keywords),
      patterns: toRegexArray(raw.patterns),
      externalOnly: {
        keywords: normalizeKeywords(raw.externalOnly && raw.externalOnly.keywords),
        patterns: toRegexArray(raw.externalOnly && raw.externalOnly.patterns),
      },
      // 사내 공유 표면에 개인 환경 흔적이 드러나는 것을 막는 규칙.
      // 방향만 반대이고 강도는 externalOnly 와 같다.
      personalDevOnly: {
        keywords: normalizeKeywords(raw.personalDevOnly && raw.personalDevOnly.keywords),
        patterns: toRegexArray(raw.personalDevOnly && raw.personalDevOnly.patterns),
      },
      internalHosts: toStringArray(raw.internalHosts),
      // 커밋 diff 검사에서 제외할 경로 정규식. 키워드를 정당하게 다루는 문서·설정용.
      // 로컬 선언과 레포 선언을 합친다. 어느 쪽도 다른 쪽을 덮지 않는다.
      allowPaths: [...toRegexArray(raw.allowPaths), ...repoAllowPaths],
    };
  } catch {
    return empty;
  }
}

export function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter(v => typeof v === 'string' && v.length > 0)
    : [];
}

export function toRegexArray(value) {
  return Array.isArray(value)
    ? value
        .filter(p => typeof p === 'string' && p.length > 0)
        .map(p => { try { return new RegExp(p); } catch { return null; } })
        .filter(Boolean)
    : [];
}

export function isEmptyConfig(cfg) {
  return cfg.keywords.length === 0
    && cfg.patterns.length === 0
    && cfg.externalOnly.keywords.length === 0
    && cfg.externalOnly.patterns.length === 0
    && cfg.personalDevOnly.keywords.length === 0
    && cfg.personalDevOnly.patterns.length === 0;
}

// git 리모트 URL 에서 host 와 owner/repo 를 뽑는다.
// scp 형태(git@host:owner/repo)와 URL 형태 양쪽을 받는다.
export function parseRemote(url) {
  const scp = url.match(/^[^@/]+@([^:/]+):(.+?)(?:\.git)?\/?$/);
  if (scp) {
    const path = scp[2].replace(/^\/+/, '');
    return path.split('/').length >= 2 ? { host: scp[1], slug: `${scp[1]}/${path}` } : null;
  }
  const m = url.match(/^[a-z+]+:\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/i);
  if (m) {
    const path = m[2].replace(/^\/+/, '');
    return path.split('/').length >= 2 ? { host: m[1], slug: `${m[1]}/${path}` } : null;
  }
  return null;
}

// 공개 여부 조회 결과를 레포 단위로 캐시한다.
//
// 조회는 `gh repo view` 네트워크 왕복이라 수백 ms 가 붙는다. 훅은 매 Bash 호출마다
// 돌지만 조회는 커밋·이슈·PR·릴리즈에만, 그리고 레포당 최초 1회만 일어난다.
//
// 캐시 파일은 저장소 단위 예외를 표현하는 수단도 된다. 조회가 안 되는 환경에서는
// 항목을 직접 넣어 고정할 수 있고, allowPaths 와 달리 다른 저장소로 새지 않는다.
export function lookupVisibility(slug, host) {
  const cache = readVisibilityCache();
  const entry = cache.entries[slug];
  const now = nowMs();
  if (entry && typeof entry.checkedAt === 'number' && now - entry.checkedAt < VISIBILITY_TTL_MS) {
    return entry.visibility;
  }

  // slug 은 host/owner/repo 형태. gh 는 -R 에 그 형태를 그대로 받는다.
  let vis = null;
  try {
    const out = execSync(`gh repo view ${shellQuote(slug)} --json visibility --jq .visibility`, {
      encoding: 'utf8', timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GH_HOST: host || '' },
    }).trim();
    if (/^(PUBLIC|PRIVATE|INTERNAL)$/.test(out)) vis = out;
  } catch { /* 조회 실패는 미확인으로 둔다 */ }

  cache.entries[slug] = { visibility: vis, checkedAt: now };
  writeVisibilityCache(cache);
  return vis;
}

/**
 * 본인 계정·조직 로그인 목록. 레포 소유자가 본인인지 판별하는 데 쓴다.
 *
 * 조회 실패는 `null` 로 돌려준다. 빈 배열로 돌리면 모든 레포가 "외부 소유" 로 분류돼
 * 조치 대상에서 조용히 빠진다. 호출자는 null 을 "판별 불가 → 전부 조치 대상" 으로 다뤄야 한다.
 */
export function lookupSelfOwners(host) {
  const cache = readIdentityCache();
  const key = host || 'github.com';
  const entry = cache.entries[key];
  const now = nowMs();
  if (entry && typeof entry.checkedAt === 'number' && now - entry.checkedAt < IDENTITY_TTL_MS) {
    return Array.isArray(entry.owners) ? entry.owners : null;
  }

  let owners = null;
  try {
    const env = { ...process.env, GH_HOST: key };
    const login = execSync('gh api user --jq .login', {
      encoding: 'utf8', timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'], env,
    }).trim();
    const orgs = execSync('gh api user/orgs --paginate --jq ".[].login"', {
      encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'], env,
    }).trim();
    if (login) {
      owners = [login, ...orgs.split('\n').map(s => s.trim()).filter(Boolean)];
    }
  } catch { /* 조회 실패는 판별 불가로 둔다 */ }

  // 실패는 캐시하지 않는다. 일시적 네트워크 실패를 7일 동안 물고 있으면
  // 그 기간 내내 외부 소유 구분이 사라진다.
  if (owners) {
    cache.entries[key] = { owners, checkedAt: now };
    writeIdentityCache(cache);
  }
  return owners;
}

function cachePath(file, envVar) {
  return process.env[envVar]
    || join(homedir(), '.claude', 'ops-agent', 'cache', file);
}

export function visibilityCachePath() {
  return cachePath('repo-visibility.json', 'OPS_AGENT_VISIBILITY_CACHE_PATH');
}

export function identityCachePath() {
  return cachePath('gh-identity.json', 'OPS_AGENT_IDENTITY_CACHE_PATH');
}

function readJsonCache(p) {
  if (!existsSync(p)) return { entries: {} };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return raw && typeof raw.entries === 'object' && raw.entries ? raw : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

function writeJsonCache(p, cache) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(cache, null, 2));
  } catch { /* 캐시 실패는 판정에 영향을 주지 않는다 */ }
}

export function readVisibilityCache() {
  return readJsonCache(visibilityCachePath());
}

export function writeVisibilityCache(cache) {
  writeJsonCache(visibilityCachePath(), cache);
}

function readIdentityCache() {
  return readJsonCache(identityCachePath());
}

function writeIdentityCache(cache) {
  writeJsonCache(identityCachePath(), cache);
}

// Date.now 를 함수로 감싼다. 테스트에서 TTL 만료를 고정 시각으로 재현하기 위함.
export function nowMs() {
  const forced = Number(process.env.OPS_AGENT_NOW_MS);
  return Number.isFinite(forced) && forced > 0 ? forced : Date.now();
}

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
