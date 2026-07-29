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

export function loadConfig() {
  const cfgPath = process.env.OPS_AGENT_CONFIDENTIAL_CONFIG_PATH
    || join(homedir(), '.claude', 'ops-agent', 'confidential-keywords.local.json');
  const empty = {
    keywords: [], patterns: [],
    externalOnly: { keywords: [], patterns: [] },
    personalDevOnly: { keywords: [], patterns: [] },
    internalHosts: [], allowPaths: [],
  };
  if (!existsSync(cfgPath)) return empty;
  try {
    const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
    return {
      keywords: toStringArray(raw.keywords),
      patterns: toRegexArray(raw.patterns),
      externalOnly: {
        keywords: toStringArray(raw.externalOnly && raw.externalOnly.keywords),
        patterns: toRegexArray(raw.externalOnly && raw.externalOnly.patterns),
      },
      // 사내 공유 표면에 개인 환경 흔적이 드러나는 것을 막는 규칙.
      // 방향만 반대이고 강도는 externalOnly 와 같다.
      personalDevOnly: {
        keywords: toStringArray(raw.personalDevOnly && raw.personalDevOnly.keywords),
        patterns: toRegexArray(raw.personalDevOnly && raw.personalDevOnly.patterns),
      },
      internalHosts: toStringArray(raw.internalHosts),
      // 커밋 diff 검사에서 제외할 경로 정규식. 키워드를 정당하게 다루는 문서·설정용.
      allowPaths: toRegexArray(raw.allowPaths),
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
