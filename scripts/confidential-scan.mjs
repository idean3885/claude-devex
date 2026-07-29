#!/usr/bin/env node
/**
 * confidential-scan.mjs — 레포 전수 대외비 스캔
 *
 * 가드(pre-tool-use.mjs)는 커밋 diff 의 **추가된 줄**만 본다. 가드 도입 이전에 이미
 * 커밋된 내용, 또는 가드가 무동작이던 기간에 들어간 내용은 다시 검사되지 않는다.
 * 이 스크립트는 추적 파일 전체를 같은 규칙으로 훑는다.
 *
 * 규칙 로딩과 표면 판정은 confidential-rules.mjs 를 가드와 공유한다.
 *
 * ── 값 비출력 원칙 ──
 * 출력은 규칙 식별자·길이·건수·파일 경로만이다. 키워드 값도, 매칭 문맥도 내지 않는다.
 * 스캔 결과를 붙여 공유하는 순간 그 자체가 유출이 되기 때문이다.
 * 출력 직전 자기 검사(assertNoValueLeak)로 이 원칙을 강제한다.
 *
 * Usage:
 *   node scripts/confidential-scan.mjs [레포경로...] [--history] [--json] [--max-bytes N]
 *
 * Exit:
 *   0  조치 대상 히트 없음
 *   1  조치 대상 히트 있음
 *   2  설정·사용법 오류
 */

import { execSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import {
  loadConfig, isEmptyConfig, parseRemote, lookupVisibility, lookupSelfOwners, shellQuote,
  findKeywordHits, boundaryApplicable,
} from './confidential-rules.mjs';

// 바이너리 확장자. 확장자만 믿지 않고 NUL 바이트 검사를 함께 한다 —
// 확장자 없는 바이너리에서 나온 우연 일치를 실제 노출로 세면 우선순위가 뒤집힌다.
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'avif', 'heic',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'wav', 'flac', 'ogg',
  'so', 'dylib', 'dll', 'exe', 'bin', 'o', 'a', 'class', 'pyc', 'wasm',
  'sqlite', 'db', 'keystore', 'jks', 'p12', 'pfx',
]);

const NUL_PROBE_BYTES = 8192;
const DEFAULT_MAX_BYTES = 1024 * 1024;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (opts.error) {
    process.stderr.write(`✘ ${opts.error}\n\n${usage()}\n`);
    return 2;
  }

  const cfg = loadConfig();
  if (isEmptyConfig(cfg)) {
    process.stderr.write('✘ 대외비 규칙이 비어 있습니다. ~/.claude/ops-agent/confidential-keywords.local.json 을 확인하세요.\n');
    return 2;
  }

  const results = opts.dirs.map(dir => scanRepo(dir, cfg, opts));

  const values = ruleValues(cfg);
  const out = opts.json ? renderJson(results, opts, values) : renderText(results, opts, values);
  const leak = assertNoValueLeak(out, cfg);
  if (leak) {
    // 값이 출력에 섞이면 리포트를 내지 않는다. 원칙이 구현 실수로 깨진 상태다.
    process.stderr.write(`✘ 값 비출력 원칙 위반 — 출력에 규칙 값이 포함되었습니다 (${leak}). 리포트를 중단합니다.\n`);
    return 2;
  }
  process.stdout.write(out);

  // 검사하지 못한 대상을 0(깨끗함)으로 돌리면 경로 오타가 "이상 없음" 으로 보고된다.
  // 미검사와 검사해서 깨끗함은 같은 상태가 아니다.
  if (results.some(r => r.error)) return 2;

  // 외부 소유 레포는 조치 대상이 아니므로 종료 코드에 넣지 않는다.
  const actionable = results.filter(r => !r.external && r.hitCount > 0);
  return actionable.length > 0 ? 1 : 0;
}

function usage() {
  return [
    'Usage: node scripts/confidential-scan.mjs [레포경로...] [옵션]',
    '',
    '  경로 생략 시 현재 디렉토리를 검사한다. 여러 개를 넘기면 순서대로 검사한다.',
    '',
    '  --history        키워드별 히스토리 커밋 수를 함께 센다 (git log -S). 기본은 HEAD 만',
    '  --json           기계 판독 출력',
    `  --max-bytes N    파일 크기 상한 (기본 ${DEFAULT_MAX_BYTES})`,
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { dirs: [], history: false, json: false, maxBytes: DEFAULT_MAX_BYTES };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--history') opts.history = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--max-bytes') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) return { error: `--max-bytes 값이 잘못되었습니다: ${argv[i]}` };
      opts.maxBytes = n;
    } else if (a === '-h' || a === '--help') return { help: true, dirs: [] };
    else if (a.startsWith('-')) return { error: `알 수 없는 옵션: ${a}` };
    else opts.dirs.push(a);
  }
  if (opts.dirs.length === 0) opts.dirs.push('.');
  return opts;
}

// ─── 레포 단위 스캔 ───

function scanRepo(dir, cfg, opts) {
  const abs = resolve(dir);
  const result = {
    dir: abs, root: null, slug: null, host: null, owner: null,
    external: false, ownerKnown: true, visibility: null, surface: null, surfaceReason: '',
    filesScanned: 0, filesSkipped: { binary: 0, tooLarge: 0, allowPath: 0, unreadable: 0 },
    rules: [], hitCount: 0, error: null, history: null,
  };

  const root = gitOutput(abs, 'rev-parse --show-toplevel');
  if (!root) {
    result.error = 'git 저장소가 아닙니다';
    return result;
  }
  result.root = root;

  // ── 소유자·공개 여부 ──
  const originUrl = gitOutput(abs, 'remote get-url origin');
  const remote = originUrl ? parseRemote(originUrl) : null;
  if (remote) {
    result.host = remote.host;
    result.slug = remote.slug;
    // slug 은 host/owner/repo 형태
    result.owner = remote.slug.split('/')[1] || null;
    const selfOwners = lookupSelfOwners(remote.host);
    if (selfOwners === null) {
      // 판별 불가를 "외부 소유" 로 처리하면 조치 대상이 조용히 빠진다. 조치 대상으로 둔다.
      result.ownerKnown = false;
    } else if (result.owner && !selfOwners.some(o => o.toLowerCase() === result.owner.toLowerCase())) {
      result.external = true;
    }
  } else {
    result.ownerKnown = false;
  }

  // ── 표면 판정 (가드와 동일한 3분류) ──
  const isInternalHost = result.host
    && cfg.internalHosts.some(h => result.host === h || result.host.endsWith('.' + h));
  if (isInternalHost) {
    result.surface = 'internal';
    result.surfaceReason = '사내 호스트';
  } else if (result.slug) {
    result.visibility = lookupVisibility(result.slug, result.host);
    if (result.visibility === 'PRIVATE' || result.visibility === 'INTERNAL') {
      result.surface = 'private';
      result.surfaceReason = `비공개(${result.visibility})`;
    } else if (result.visibility === 'PUBLIC') {
      result.surface = 'public';
      result.surfaceReason = '공개';
    } else {
      result.surface = 'public';
      result.surfaceReason = '공개 여부 미확인 — public 으로 닫음';
    }
  } else {
    result.surface = 'public';
    result.surfaceReason = 'origin 없음 — public 으로 닫음';
  }

  // ── 적용 규칙 ──
  const rules = buildRules(cfg, result.surface);
  if (rules.length === 0) {
    result.error = `표면 ${result.surface} 에 적용할 규칙이 없습니다`;
    return result;
  }

  // ── 파일 순회 ──
  const files = listTrackedFiles(root);
  const agg = new Map();   // ruleId → { rule, total, standalone, substring, files: Map<path, count> }

  for (const rel of files) {
    if (cfg.allowPaths.some(re => re.test(rel))) { result.filesSkipped.allowPath++; continue; }
    const full = join(root, rel);
    const ext = rel.includes('.') ? rel.split('.').pop().toLowerCase() : '';
    if (BINARY_EXT.has(ext)) { result.filesSkipped.binary++; continue; }

    let buf;
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      if (st.size > opts.maxBytes) { result.filesSkipped.tooLarge++; continue; }
      buf = readFileSync(full);
    } catch { result.filesSkipped.unreadable++; continue; }

    if (buf.subarray(0, NUL_PROBE_BYTES).includes(0)) { result.filesSkipped.binary++; continue; }

    const text = buf.toString('utf8');
    result.filesScanned++;
    scanText(text, rel, rules, agg);
  }

  result.rules = [...agg.values()]
    .map(e => ({
      ruleId: e.rule.id, len: e.rule.len, kind: e.rule.kind,
      boundaryApplicable: e.rule.boundaryApplicable === true,
      wordBoundary: e.rule.wordBoundary === true, ignoreCase: e.rule.ignoreCase === true,
      total: e.total, standalone: e.standalone, substring: e.substring,
      files: [...e.files.entries()].map(([p, c]) => ({ path: p, count: c }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => b.total - a.total || a.ruleId.localeCompare(b.ruleId));
  result.hitCount = result.rules.reduce((s, r) => s + r.total, 0);

  if (opts.history) result.history = scanHistory(root, rules);

  return result;
}

/**
 * 표면별 적용 규칙 목록. 항상 적용되는 keywords/patterns 에 표면 규칙을 더한다.
 *
 * private 는 본인 비공개 공간이라 추가 규칙을 걸지 않는다 — 가드와 같은 기준이다.
 */
function buildRules(cfg, surface) {
  const rules = [];
  const push = (group, kind, items) => {
    items.forEach((v, i) => {
      rules.push(kind === 'keyword'
        ? {
            id: `${group}.keywords[${i}]`, kind, len: v.value.length, kw: v,
            // 경계 판정 적용 여부는 공유 매처와 같은 기준을 쓴다.
            boundaryApplicable: boundaryApplicable(v),
            wordBoundary: v.wordBoundary, ignoreCase: v.ignoreCase,
          }
        : { id: `${group}.patterns[${i}]`, kind, len: v.source.length, regex: v });
    });
  };
  push('always', 'keyword', cfg.keywords);
  push('always', 'pattern', cfg.patterns);
  if (surface === 'public') {
    push('externalOnly', 'keyword', cfg.externalOnly.keywords);
    push('externalOnly', 'pattern', cfg.externalOnly.patterns);
  } else if (surface === 'internal') {
    push('personalDevOnly', 'keyword', cfg.personalDevOnly.keywords);
    push('personalDevOnly', 'pattern', cfg.personalDevOnly.patterns);
  }
  return rules;
}

function scanText(text, rel, rules, agg) {
  for (const rule of rules) {
    if (rule.kind === 'keyword') {
      for (const h of findKeywordHits(text, rule.kw)) record(agg, rule, rel, h.standalone);
    } else {
      const re = new RegExp(rule.regex.source, rule.regex.flags.includes('g')
        ? rule.regex.flags : rule.regex.flags + 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        // 패턴은 경계를 스스로 정의한다. 단어 경계 분류를 적용하지 않는다.
        record(agg, rule, rel, null);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
}

function record(agg, rule, rel, standalone) {
  let e = agg.get(rule.id);
  if (!e) {
    e = { rule, total: 0, standalone: 0, substring: 0, files: new Map() };
    agg.set(rule.id, e);
  }
  e.total++;
  if (standalone === true) e.standalone++;
  else if (standalone === false) e.substring++;
  e.files.set(rel, (e.files.get(rel) || 0) + 1);
}

/**
 * 히스토리 검사. 키워드별로 그 값이 등장·소멸한 커밋 수만 센다.
 *
 * 한계: `git log -S` 는 값을 argv 로 받아야 한다. 실행 중 `ps` 에 값이 잠깐 보인다.
 * 그래서 기본이 아니라 명시 옵션이다.
 */
function scanHistory(root, rules) {
  const out = [];
  for (const rule of rules) {
    if (rule.kind !== 'keyword') continue;
    const raw = gitOutput(root, `log --oneline --all -S${shellQuote(rule.kw.value)}`);
    const commits = raw ? raw.split('\n').filter(Boolean).length : 0;
    if (commits > 0) out.push({ ruleId: rule.id, len: rule.len, commits });
  }
  return out.sort((a, b) => b.commits - a.commits || a.ruleId.localeCompare(b.ruleId));
}

function listTrackedFiles(root) {
  const raw = gitOutput(root, 'ls-files -z');
  return raw ? raw.split('\0').filter(Boolean) : [];
}

function gitOutput(cwd, args) {
  try {
    return execSync(`git ${args}`, {
      cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\n$/, '');
  } catch {
    return null;
  }
}

// ─── 출력 ───

function ruleValues(cfg) {
  return [...cfg.keywords, ...cfg.externalOnly.keywords, ...cfg.personalDevOnly.keywords]
    .map(k => k.value);
}

/**
 * 경로 문자열에서 규칙 값을 지운다.
 *
 * 파일·디렉토리 이름 자체에 키워드가 들어간 경우가 있다. 그 경로를 그대로 찍으면
 * 값 비출력 원칙이 경로를 통해 깨진다. 반대로 리포트 전체를 막으면 정작 조치해야 할
 * 그 파일을 못 찾는다. 그래서 막지 않고 해당 부분만 치환한다.
 */
function redactPath(s, values) {
  let out = String(s);
  for (const v of values) {
    if (!v) continue;
    let i = out.toLowerCase().indexOf(v.toLowerCase());
    while (i !== -1) {
      out = out.slice(0, i) + `«redacted:len${v.length}»` + out.slice(i + v.length);
      i = out.toLowerCase().indexOf(v.toLowerCase(), i + 1);
    }
  }
  return out;
}

/**
 * 값 비출력 자기 검사. 출력 문자열에 규칙 값이 남아 있으면 리포트를 막는다.
 *
 * 이 원칙은 주석으로 지켜지지 않는다. 경로는 redactPath 로 미리 치환하므로 이 검사가
 * 걸리면 그건 예상하지 못한 경로로 값이 샌 것이다 — 구현 실수다. 그때는 리포트를 내지 않는다.
 */
function assertNoValueLeak(out, cfg) {
  const values = ruleValues(cfg);
  const lower = out.toLowerCase();
  for (let i = 0; i < values.length; i++) {
    if (lower.includes(values[i].toLowerCase())) return `규칙 값 #${i} (len ${values[i].length})`;
  }
  return null;
}

function renderText(results, opts, values) {
  const lines = [];
  const own = results.filter(r => !r.external);
  const external = results.filter(r => r.external);

  lines.push('대외비 전수 스캔 — 값은 출력하지 않습니다 (규칙 식별자·길이·건수·경로만)');
  lines.push('');

  if (own.length) {
    lines.push('══ 조치 대상 ══');
    own.forEach(r => renderRepo(lines, r, opts, values));
  }
  if (external.length) {
    lines.push('══ 참고 (외부 소유 — 조치 대상 아님, 종료 코드에 넣지 않음) ══');
    external.forEach(r => renderRepo(lines, r, opts, values));
  }

  const total = own.reduce((s, r) => s + r.hitCount, 0);
  lines.push('─'.repeat(60));
  lines.push(total === 0
    ? '조치 대상 히트 0건'
    : `조치 대상 히트 ${total}건 (${own.filter(r => r.hitCount > 0).length}개 레포)`);
  return lines.join('\n') + '\n';
}

function renderRepo(lines, r, opts, values) {
  const owner = r.owner ? `owner=${redactPath(r.owner, values)}` : 'owner=미확인';
  lines.push(`\n▸ ${redactPath(r.dir, values)}`);
  if (r.error) {
    lines.push(`    ✘ ${r.error}`);
    return;
  }
  const visLabel = r.surface === 'internal' ? '사내' : (r.visibility || '미확인');
  lines.push(`    ${owner}  공개여부=${visLabel}  표면=${r.surface} (${r.surfaceReason})`);
  if (!r.ownerKnown) {
    lines.push('    ⚠ 소유자 판별 불가 — 조치 대상으로 취급합니다');
  }
  const sk = r.filesSkipped;
  lines.push(`    파일 ${r.filesScanned}개 검사 · 제외 바이너리 ${sk.binary} / 크기초과 ${sk.tooLarge} / allowPaths ${sk.allowPath} / 읽기실패 ${sk.unreadable}`);

  if (r.hitCount === 0) {
    lines.push('    ✔ 히트 없음');
  } else {
    lines.push(`    히트 ${r.hitCount}건 / 규칙 ${r.rules.length}종`);
    for (const rule of r.rules) {
      let cls;
      if (rule.kind !== 'keyword') cls = '패턴 (경계 분류 없음)';
      else if (!rule.boundaryApplicable) cls = '경계 분류 불가 (비 ASCII 키워드)';
      else cls = `standalone ${rule.standalone} · substring ${rule.substring}`;
      const opt = rule.kind === 'keyword'
        ? ` [wb=${rule.wordBoundary ? 'on' : 'off'} ic=${rule.ignoreCase ? 'on' : 'off'}]` : '';
      lines.push(`      ${rule.ruleId}  len ${rule.len}  hits ${rule.total}  ${cls}${opt}`);
      for (const f of rule.files) lines.push(`        ${redactPath(f.path, values)} (${f.count})`);
    }
  }

  if (opts.history && r.history) {
    lines.push(r.history.length === 0
      ? '    히스토리: 해당 커밋 없음'
      : `    히스토리 (커밋 수): ${r.history.map(h => `${h.ruleId}=${h.commits}`).join(', ')}`);
  }
}

function renderJson(results, opts, values) {
  return JSON.stringify({
    note: '값은 포함하지 않습니다. ruleId 로 로컬 설정을 조회하세요.',
    history: opts.history,
    repos: results.map(r => ({
      dir: redactPath(r.dir, values),
      owner: r.owner ? redactPath(r.owner, values) : null,
      ownerKnown: r.ownerKnown, external: r.external,
      visibility: r.visibility, surface: r.surface, surfaceReason: r.surfaceReason,
      filesScanned: r.filesScanned, filesSkipped: r.filesSkipped,
      hitCount: r.hitCount,
      rules: r.rules.map(rule => ({
        ...rule,
        files: rule.files.map(f => ({ path: redactPath(f.path, values), count: f.count })),
      })),
      history: r.history, error: r.error,
    })),
  }, null, 2) + '\n';
}

process.exit(main());
