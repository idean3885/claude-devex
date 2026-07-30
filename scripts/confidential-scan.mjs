#!/usr/bin/env node
/**
 * confidential-scan.mjs — 레포 전수 대외비 스캔
 *
 * 가드(pre-tool-use.mjs)는 커밋 diff 의 **추가된 줄**만 본다. 가드 도입 이전에 이미
 * 커밋된 내용, 또는 가드가 무동작이던 기간에 들어간 내용은 다시 검사되지 않는다.
 * 이 스크립트는 추적 파일 전체를 같은 규칙으로 훑는다.
 *
 * 규칙 로딩·매처·표면 판정은 confidential-rules.mjs 를 가드와 공유한다.
 *
 * ── 검사 범위를 사람이 정하지 않는다 ──
 * 점검 대상을 손으로 열거하면 빠진다. 실측: 공개 레포 17개 중 12개만 열거해 점검하고
 * "전부 깨끗함" 으로 결론냈는데, 누락된 5개 중 한 곳에 448건이 있었다.
 * 또 기본 브랜치만 보면 정리 이전 커밋을 가리키는 잔재 브랜치가 남는다. 실측: 기본
 * 브랜치가 깨끗한 레포에서 잔재 브랜치 3개가 각각 74·75·74건이었다.
 * 그래서 `--owner` 로 레포 목록을, `--branches` 로 브랜치 전체를 도구가 수집한다.
 *
 * ── 값 비출력 원칙 ──
 * 출력은 규칙 식별자·길이·건수·파일 경로만이다. 키워드 값도, 매칭 문맥도 내지 않는다.
 * 스캔 결과를 붙여 공유하는 순간 그 자체가 유출이 되기 때문이다.
 * 출력 직전 자기 검사(assertNoValueLeak)로 이 원칙을 강제한다.
 *
 * Usage:
 *   node scripts/confidential-scan.mjs [레포경로...] [옵션]
 *   node scripts/confidential-scan.mjs --owner <소유자> --branches
 *
 * Exit:
 *   0  조치 대상 히트 없음
 *   1  조치 대상 히트 있음
 *   2  설정·사용법 오류, 또는 검사하지 못한 대상 존재
 */

import { execSync } from 'child_process';
import { readFileSync, statSync, mkdtempSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
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
const CLONE_TIMEOUT_MS = 300000;
const MAX_FILES_PER_RULE = 8;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(`${usage()}\n`); return 0; }
  if (opts.error) {
    process.stderr.write(`✘ ${opts.error}\n\n${usage()}\n`);
    return 2;
  }

  const cfg = loadConfig();
  if (isEmptyConfig(cfg)) {
    process.stderr.write('✘ 대외비 규칙이 비어 있습니다. ~/.claude/ops-agent/confidential-keywords.local.json 을 확인하세요.\n');
    return 2;
  }

  const targets = resolveTargets(opts);
  if (targets.error) {
    process.stderr.write(`✘ ${targets.error}\n`);
    return 2;
  }

  const results = [];
  for (const t of targets.list) {
    if (opts.progress) process.stderr.write(`  … ${t.label}\n`);
    results.push(scanTarget(t, cfg, opts));
  }

  const values = ruleValues(cfg);
  const out = opts.json ? renderJson(results, opts, values) : renderText(results, opts, values);
  const leak = assertNoValueLeak(out, cfg);
  if (leak) {
    // 값이 출력에 섞이면 리포트를 내지 않는다. 원칙이 구현 실수로 깨진 상태다.
    process.stderr.write(`✘ 값 비출력 원칙 위반 — 출력에 규칙 값이 포함되었습니다 (${leak}). 리포트를 중단합니다.\n`);
    return 2;
  }
  process.stdout.write(out);

  // 검사하지 못한 대상을 0(깨끗함)으로 돌리면 경로 오타·클론 실패가 "이상 없음" 이 된다.
  // 미검사와 검사해서 깨끗함은 같은 상태가 아니다.
  if (results.some(r => r.error)) return 2;

  // 외부 소유·포크 레포는 조치 대상이 아니므로 종료 코드에 넣지 않는다.
  return results.some(r => !isReference(r) && actionableHits(r) > 0) ? 1 : 0;
}

function isReference(r) {
  return r.external === true || r.isFork === true;
}

function actionableHits(r) {
  return (r.tree ? r.tree.hitCount : 0)
    + (r.branches || []).reduce((s, b) => s + (b.tree ? b.tree.hitCount : 0), 0);
}

function usage() {
  return [
    'Usage: node scripts/confidential-scan.mjs [레포경로...] [옵션]',
    '',
    '  경로 생략 시 현재 디렉토리를 검사한다. 여러 개를 넘기면 순서대로 검사한다.',
    '',
    '  --owner <name>      소유자의 레포 목록을 gh 로 받아 전체 순회 (경로 인자 대신)',
    '  --visibility <v>    --owner 와 함께. public|private|internal|all (기본 public)',
    '  --branches          기본 브랜치 외 원격 브랜치도 검사한다',
    '  --history           키워드별 히스토리 커밋 수를 함께 센다 (git log -S)',
    '  --json              기계 판독 출력',
    `  --max-bytes N       파일 크기 상한 (기본 ${DEFAULT_MAX_BYTES})`,
    '  --progress          진행 상황을 stderr 로 출력',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = {
    dirs: [], owner: null, visibility: 'public',
    branches: false, history: false, json: false,
    maxBytes: DEFAULT_MAX_BYTES, progress: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--branches') opts.branches = true;
    else if (a === '--history') opts.history = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--progress') opts.progress = true;
    else if (a === '--owner') {
      opts.owner = argv[++i];
      if (!opts.owner || opts.owner.startsWith('-')) return { error: '--owner 값이 없습니다' };
    } else if (a === '--visibility') {
      opts.visibility = argv[++i];
      if (!['public', 'private', 'internal', 'all'].includes(opts.visibility || '')) {
        return { error: `--visibility 값이 잘못되었습니다: ${opts.visibility}` };
      }
    } else if (a === '--max-bytes') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) return { error: `--max-bytes 값이 잘못되었습니다: ${argv[i]}` };
      opts.maxBytes = n;
    } else if (a === '-h' || a === '--help') return { help: true, dirs: [] };
    else if (a.startsWith('-')) return { error: `알 수 없는 옵션: ${a}` };
    else opts.dirs.push(a);
  }
  if (opts.owner && opts.dirs.length > 0) return { error: '--owner 와 경로 인자는 함께 쓸 수 없습니다' };
  if (!opts.owner && opts.dirs.length === 0) opts.dirs.push('.');
  return opts;
}

// ─── 대상 결정 ───

/**
 * 검사 대상 목록. `--owner` 면 gh 로 레포 목록을 받는다.
 *
 * 사람이 기억하는 레포 목록과 실제 목록은 어긋난다. 목록 수집을 도구에 맡기는 것이
 * 이 옵션의 존재 이유다.
 */
function resolveTargets(opts) {
  if (!opts.owner) {
    return { list: opts.dirs.map(d => ({ kind: 'local', dir: d, label: d })) };
  }
  const vis = opts.visibility === 'all' ? '' : `--visibility ${opts.visibility}`;
  let raw;
  try {
    raw = execSync(
      `gh repo list ${shellQuote(opts.owner)} ${vis} --limit 500 --json name,defaultBranchRef,isFork,isArchived,visibility`,
      { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (e) {
    return { error: `gh repo list 실패: ${firstLine(e)}` };
  }
  let repos;
  try { repos = JSON.parse(raw); } catch { return { error: 'gh repo list 출력을 해석할 수 없습니다' }; }
  if (!Array.isArray(repos) || repos.length === 0) return { error: `대상 레포가 없습니다 (owner=${opts.owner})` };
  return {
    list: repos.map(r => ({
      kind: 'remote',
      owner: opts.owner,
      name: r.name,
      label: `${opts.owner}/${r.name}`,
      defaultBranch: (r.defaultBranchRef && r.defaultBranchRef.name) || null,
      isFork: r.isFork === true,
      isArchived: r.isArchived === true,
      visibility: r.visibility || null,
    })),
  };
}

function firstLine(e) {
  return String((e && e.message) || e).split('\n')[0].slice(0, 90);
}

// ─── 대상 단위 스캔 ───

function scanTarget(t, cfg, opts) {
  const base = {
    label: t.label, host: null, slug: null, owner: null, ownerKnown: true, external: false,
    visibility: t.visibility || null, isFork: t.isFork === true, isArchived: t.isArchived === true,
    surface: null, surfaceReason: '', defaultBranch: t.defaultBranch || null,
    tree: null, branches: [], error: null,
  };

  let tmp = null;
  try {
    let root;
    if (t.kind === 'local') {
      const abs = resolve(t.dir);
      root = gitOutput(abs, 'rev-parse --show-toplevel');
      if (!root) { base.error = 'git 저장소가 아닙니다'; return base; }
      base.label = root;
      base.defaultBranch = base.defaultBranch || detectDefaultBranch(root);
    } else {
      if (!t.defaultBranch) { base.error = '기본 브랜치가 없습니다 (빈 레포)'; return base; }
      tmp = mkdtempSync(join(tmpdir(), 'ops-scan-'));
      root = join(tmp, t.name);
      // 브랜치 검사를 위해 단일 브랜치로 받지 않는다. 레포당 네트워크 왕복 1회.
      try {
        execSync(`git clone -q https://github.com/${t.owner}/${t.name}.git ${shellQuote(root)}`, {
          timeout: CLONE_TIMEOUT_MS, stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch (e) {
        base.error = `클론 실패: ${firstLine(e)}`;
        return base;
      }
    }

    applyRepoMeta(base, root, cfg);

    const rules = buildRules(cfg, base.surface);
    if (rules.length === 0) {
      base.error = `표면 ${base.surface} 에 적용할 규칙이 없습니다`;
      return base;
    }

    base.tree = scanTree(root, rules, cfg, opts);
    if (opts.history) base.tree.history = scanHistory(root, rules);
    if (opts.branches) base.branches = scanBranches(root, base, rules, cfg, opts);
  } finally {
    if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* 정리 실패는 무시 */ } }
  }
  return base;
}

function applyRepoMeta(base, root, cfg) {
  const originUrl = gitOutput(root, 'remote get-url origin');
  const remote = originUrl ? parseRemote(originUrl) : null;
  if (remote) {
    base.host = remote.host;
    base.slug = remote.slug;
    base.owner = remote.slug.split('/')[1] || null;
    const selfOwners = lookupSelfOwners(remote.host);
    if (selfOwners === null) {
      // 판별 불가를 "외부 소유" 로 처리하면 조치 대상이 조용히 빠진다. 조치 대상으로 둔다.
      base.ownerKnown = false;
    } else if (base.owner && !selfOwners.some(o => o.toLowerCase() === base.owner.toLowerCase())) {
      base.external = true;
    }
  } else {
    base.ownerKnown = false;
  }

  const isInternalHost = base.host
    && cfg.internalHosts.some(h => base.host === h || base.host.endsWith('.' + h));
  if (isInternalHost) {
    base.surface = 'internal';
    base.surfaceReason = '사내 호스트';
  } else if (base.slug) {
    base.visibility = base.visibility || lookupVisibility(base.slug, base.host);
    if (base.visibility === 'PRIVATE' || base.visibility === 'INTERNAL') {
      base.surface = 'private';
      base.surfaceReason = `비공개(${base.visibility})`;
    } else if (base.visibility === 'PUBLIC') {
      base.surface = 'public';
      base.surfaceReason = '공개';
    } else {
      base.surface = 'public';
      base.surfaceReason = '공개 여부 미확인 — public 으로 닫음';
    }
  } else {
    base.surface = 'public';
    base.surfaceReason = 'origin 없음 — public 으로 닫음';
  }
}

function detectDefaultBranch(root) {
  const ref = gitOutput(root, 'symbolic-ref --quiet --short refs/remotes/origin/HEAD');
  if (ref) return ref.replace(/^origin\//, '');
  return gitOutput(root, 'rev-parse --abbrev-ref HEAD');
}

/**
 * 기본 브랜치 외 원격 브랜치를 워크트리로 검사한다.
 *
 * 체크아웃으로 작업 트리를 바꾸지 않는다 — 로컬 경로를 넘긴 사용자의 작업 상태를
 * 건드리면 안 된다.
 *
 * 잔재 판정: 고유 커밋이 0건이고 기본 브랜치의 조상이면 그 브랜치는 정리 이전
 * 커밋을 가리키는 ref 일 뿐이다. 지워도 잃는 게 없다.
 */
function scanBranches(root, base, rules, cfg, opts) {
  const def = base.defaultBranch;
  // --format 값은 반드시 인용한다. `%(refname:short)` 의 괄호를 셸이 문법으로 해석해
  // 명령이 실패하면 브랜치 목록이 빈 배열이 되고, 검사하지 않은 상태가 "0건" 으로 보고된다.
  const raw = gitOutput(root, `for-each-ref --format=${shellQuote('%(refname:short)')} refs/remotes/origin`);
  if (raw === null) {
    return [{ name: '(브랜치 목록 조회 실패)', tree: null, merged: null, unique: null, safeDelete: false, error: 'for-each-ref 실패' }];
  }
  const names = raw.split('\n')
    // refs/remotes/origin/HEAD 는 `origin` 으로 나온다. 브랜치가 아니므로 뺀다.
    .filter(s => s.startsWith('origin/'))
    .map(s => s.slice('origin/'.length))
    .filter(n => n && n !== 'HEAD' && n !== def);

  const out = [];
  for (const name of names) {
    const entry = { name, tree: null, merged: null, unique: null, safeDelete: false, error: null };
    if (opts.progress) process.stderr.write(`      ↳ ${name}\n`);
    const wt = join(root, '.ops-scan-wt');
    try {
      execSync(`git worktree add -q --detach ${shellQuote(wt)} ${shellQuote('origin/' + name)}`, {
        cwd: root, timeout: 120000, stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (e) {
      entry.error = `워크트리 실패: ${firstLine(e)}`;
      out.push(entry);
      continue;
    }
    try {
      entry.tree = scanTree(wt, rules, cfg, opts);
      if (def) {
        const cnt = gitOutput(root, `rev-list --count ${shellQuote('origin/' + def)}..${shellQuote('origin/' + name)}`);
        entry.unique = cnt === null ? null : Number(cnt);
        entry.merged = runOk(root, `merge-base --is-ancestor ${shellQuote('origin/' + name)} ${shellQuote('origin/' + def)}`);
        entry.safeDelete = entry.merged === true && entry.unique === 0;
      }
    } finally {
      try {
        execSync(`git worktree remove --force ${shellQuote(wt)}`, { cwd: root, timeout: 60000, stdio: 'ignore' });
      } catch { /* 정리 실패는 무시 */ }
    }
    out.push(entry);
  }
  return out;
}

// ─── 트리 단위 스캔 ───

function scanTree(dir, rules, cfg, opts) {
  const res = {
    filesScanned: 0,
    filesSkipped: { binary: 0, tooLarge: 0, allowPath: 0, unreadable: 0 },
    rules: [], hitCount: 0, history: null,
  };
  const agg = new Map();

  for (const rel of listTrackedFiles(dir)) {
    if (cfg.allowPaths.some(re => re.test(rel))) { res.filesSkipped.allowPath++; continue; }
    const ext = rel.includes('.') ? rel.split('.').pop().toLowerCase() : '';
    if (BINARY_EXT.has(ext)) { res.filesSkipped.binary++; continue; }

    const full = join(dir, rel);
    let buf;
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      if (st.size > opts.maxBytes) { res.filesSkipped.tooLarge++; continue; }
      buf = readFileSync(full);
    } catch { res.filesSkipped.unreadable++; continue; }

    if (buf.subarray(0, NUL_PROBE_BYTES).includes(0)) { res.filesSkipped.binary++; continue; }

    res.filesScanned++;
    scanText(buf.toString('utf8'), rel, rules, agg);
  }

  res.rules = [...agg.values()]
    .map(e => ({
      ruleId: e.rule.id, len: e.rule.len, kind: e.rule.kind,
      boundaryApplicable: e.rule.boundaryApplicable === true,
      wordBoundary: e.rule.wordBoundary === true, ignoreCase: e.rule.ignoreCase === true,
      total: e.total, standalone: e.standalone, substring: e.substring,
      files: [...e.files.entries()].map(([p, c]) => ({ path: p, count: c }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => b.total - a.total || a.ruleId.localeCompare(b.ruleId));
  res.hitCount = res.rules.reduce((s, r) => s + r.total, 0);
  return res;
}

/**
 * 표면별 적용 규칙 목록. 항상 적용되는 keywords/patterns 에 표면 규칙을 더한다.
 *
 * private 는 본인 비공개 공간이므로 추가 규칙을 걸지 않는다 — 가드와 같은 기준이다.
 */
function buildRules(cfg, surface) {
  const rules = [];
  const push = (group, kind, items) => {
    items.forEach((v, i) => {
      rules.push(kind === 'keyword'
        ? {
            id: `${group}.keywords[${i}]`, kind, len: v.value.length, kw: v,
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
      cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\n$/, '');
  } catch {
    return null;
  }
}

function runOk(cwd, args) {
  try {
    execSync(`git ${args}`, { cwd, timeout: 30000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
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
 * 파일·디렉토리·브랜치 이름 자체에 키워드가 들어간 경우가 있다. 그 이름을 그대로 찍으면
 * 값 비출력 원칙이 경로를 통해 깨진다. 반대로 리포트 전체를 막으면 정작 조치해야 할
 * 그 대상을 못 찾는다. 그래서 막지 않고 해당 부분만 치환한다.
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
 * 경로는 redactPath 로 미리 치환하므로 이 검사가 걸리면 예상하지 못한 경로로 값이
 * 샌 것이다 — 구현 실수다. 그때는 리포트를 내지 않는다.
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
  const own = results.filter(r => !isReference(r));
  const ref = results.filter(r => isReference(r));

  lines.push('대외비 전수 스캔 — 값은 출력하지 않습니다 (규칙 식별자·길이·건수·경로만)');
  lines.push(`범위: ${opts.owner ? `owner=${opts.owner} visibility=${opts.visibility}` : '지정 경로'}`
    + (opts.branches ? ' · 원격 브랜치 전체' : ' · 기본 브랜치만'));

  if (own.length) {
    lines.push('');
    lines.push('══ 조치 대상 ══');
    own.forEach(r => renderRepo(lines, r, opts, values));
  }
  if (ref.length) {
    lines.push('');
    lines.push('══ 참고 (외부 소유·포크 — 조치 대상 아님, 종료 코드에 넣지 않음) ══');
    ref.forEach(r => renderRepo(lines, r, opts, values));
  }

  const total = own.reduce((s, r) => s + actionableHits(r), 0);
  const dirty = own.filter(r => actionableHits(r) > 0);
  const failed = results.filter(r => r.error);
  lines.push('');
  lines.push('─'.repeat(64));
  lines.push(`검사 대상 ${results.length}곳 (조치 대상 ${own.length} · 참고 ${ref.length})`);
  lines.push(total === 0 ? '조치 대상 히트 0건' : `조치 대상 히트 ${total}건 (${dirty.length}개 레포)`);
  if (failed.length) lines.push(`검사 실패 ${failed.length}건 — 종료 코드 2`);

  const safe = own.flatMap(r => (r.branches || [])
    .filter(b => b.safeDelete && b.tree && b.tree.hitCount > 0)
    .map(b => `${r.label}\t${b.name}`));
  if (safe.length) {
    lines.push('');
    lines.push('삭제 안전 브랜치 (고유 커밋 0건 + 기본 브랜치 조상, 히트 있음):');
    safe.forEach(s => {
      const [repo, br] = s.split('\t');
      lines.push(`  ${redactPath(repo, values)}  ${redactPath(br, values)}`);
    });
  }
  return lines.join('\n') + '\n';
}

function renderRepo(lines, r, opts, values) {
  lines.push(`\n▸ ${redactPath(r.label, values)}`);
  if (r.error) { lines.push(`    ✘ ${r.error}`); return; }

  const owner = r.owner ? `owner=${redactPath(r.owner, values)}` : 'owner=미확인';
  const visLabel = r.surface === 'internal' ? '사내' : (r.visibility || '미확인');
  const tags = [r.isArchived ? 'archived' : null, r.isFork ? 'fork' : null].filter(Boolean);
  lines.push(`    ${owner}  공개여부=${visLabel}  표면=${r.surface} (${r.surfaceReason})`
    + (tags.length ? `  [${tags.join(' ')}]` : ''));
  // 아카이빙은 읽기 전용으로 만드는 것이고 공개 열람을 막지 않는다.
  if (r.isArchived && r.visibility === 'PUBLIC') {
    lines.push('    ⚠ archived + PUBLIC — 읽기 전용일 뿐 공개 열람은 그대로입니다');
  }
  if (!r.ownerKnown) lines.push('    ⚠ 소유자 판별 불가 — 조치 대상으로 취급합니다');

  renderTree(lines, r.tree, `기본 브랜치 (${r.defaultBranch || '?'})`, opts, values);
  for (const b of r.branches || []) {
    const label = redactPath(b.name, values);
    if (b.error) { lines.push(`    ▪ ${label}: ✘ ${b.error}`); continue; }
    const meta = b.safeDelete
      ? '삭제 안전 (고유 커밋 0건, 기본 브랜치 조상)'
      : `고유 커밋 ${b.unique === null ? '?' : b.unique}건 · ${b.merged ? '머지됨' : '미머지'}`;
    renderTree(lines, b.tree, `${label} — ${meta}`, opts, values);
  }
}

function renderTree(lines, tree, label, opts, values) {
  if (!tree) return;
  const sk = tree.filesSkipped;
  lines.push(`    ▪ ${label}`);
  lines.push(`        파일 ${tree.filesScanned}개 · 제외 바이너리 ${sk.binary}/크기 ${sk.tooLarge}/allowPaths ${sk.allowPath}/읽기실패 ${sk.unreadable}`);
  if (tree.hitCount === 0) { lines.push('        ✔ 히트 없음'); return; }
  lines.push(`        히트 ${tree.hitCount}건 / 규칙 ${tree.rules.length}종`);
  for (const rule of tree.rules) {
    let cls;
    if (rule.kind !== 'keyword') cls = '패턴 (경계 분류 없음)';
    else if (!rule.boundaryApplicable) cls = '경계 분류 불가 (비 ASCII 키워드)';
    else cls = `standalone ${rule.standalone} · substring ${rule.substring}`;
    const opt = rule.kind === 'keyword'
      ? ` [wb=${rule.wordBoundary ? 'on' : 'off'} ic=${rule.ignoreCase ? 'on' : 'off'}]` : '';
    lines.push(`          ${rule.ruleId}  len ${rule.len}  hits ${rule.total}  ${cls}${opt}`);
    for (const f of rule.files.slice(0, MAX_FILES_PER_RULE)) {
      lines.push(`            ${redactPath(f.path, values)} (${f.count})`);
    }
    // 상한을 두면 잘린 사실을 반드시 알린다. 조용히 자르면 전체를 본 것으로 오인된다.
    if (rule.files.length > MAX_FILES_PER_RULE) {
      lines.push(`            … 외 ${rule.files.length - MAX_FILES_PER_RULE}개 파일 (--json 으로 전체 확인)`);
    }
  }
  if (opts.history && tree.history) {
    lines.push(tree.history.length === 0
      ? '        히스토리: 해당 커밋 없음'
      : `        히스토리 (커밋 수): ${tree.history.map(h => `${h.ruleId}=${h.commits}`).join(', ')}`);
  }
}

function renderJson(results, opts, values) {
  const redactTree = tree => tree && ({
    ...tree,
    rules: tree.rules.map(rule => ({
      ...rule,
      files: rule.files.map(f => ({ path: redactPath(f.path, values), count: f.count })),
    })),
  });
  return JSON.stringify({
    note: '값은 포함하지 않습니다. ruleId 로 로컬 설정을 조회하세요.',
    scope: { owner: opts.owner, visibility: opts.visibility, branches: opts.branches, history: opts.history },
    repos: results.map(r => ({
      label: redactPath(r.label, values),
      owner: r.owner ? redactPath(r.owner, values) : null,
      ownerKnown: r.ownerKnown, external: r.external, isFork: r.isFork, isArchived: r.isArchived,
      visibility: r.visibility, surface: r.surface, surfaceReason: r.surfaceReason,
      defaultBranch: r.defaultBranch, error: r.error,
      tree: redactTree(r.tree),
      branches: (r.branches || []).map(b => ({
        name: redactPath(b.name, values), merged: b.merged, unique: b.unique,
        safeDelete: b.safeDelete, error: b.error, tree: redactTree(b.tree),
      })),
    })),
  }, null, 2) + '\n';
}

process.exit(main());
