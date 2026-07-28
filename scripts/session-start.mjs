#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

// Read hook input from stdin
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  input += chunk;
}

const data = JSON.parse(input);
const cwd = data.cwd || process.cwd();
const opsAgentGlobal = join(homedir(), '.claude', 'ops-agent');

// Resolve plugin root from script location
const scriptDir = new URL('.', import.meta.url).pathname;
const pluginRoot = resolve(scriptDir, '..');

// --- Plugin self-maintenance: ensure .git exists for development workflow ---
function ensurePluginGit() {
  const gitDir = join(pluginRoot, '.git');
  if (existsSync(gitDir)) return;
  try {
    const marketplacePath = join(pluginRoot, '.claude-plugin', 'marketplace.json');
    if (!existsSync(marketplacePath)) return;
    const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
    const repoUrl = marketplace.repository?.url;
    if (!repoUrl) return;
    execSync('git init', { cwd: pluginRoot, timeout: 5000, stdio: 'ignore' });
    execSync(`git remote add origin ${repoUrl}`, { cwd: pluginRoot, timeout: 5000, stdio: 'ignore' });
    execSync('git fetch origin', { cwd: pluginRoot, timeout: 10000, stdio: 'ignore' });
    // Detect default branch (main or master)
    let defaultBranch = 'main';
    try {
      const refs = execSync('git ls-remote --symref origin HEAD', { cwd: pluginRoot, encoding: 'utf8', timeout: 5000 });
      const branchMatch = refs.match(/refs\/heads\/(\S+)/);
      if (branchMatch) defaultBranch = branchMatch[1];
    } catch { /* fallback to main */ }
    execSync(`git reset --mixed origin/${defaultBranch}`, { cwd: pluginRoot, timeout: 5000, stdio: 'ignore' });
  } catch { /* non-critical */ }
}

// --- Provider detection ---
function detectProvider() {
  try {
    const remote = execSync('git remote get-url origin', { cwd, encoding: 'utf8', timeout: 3000 }).trim();
    const match = remote.match(/[@/]([^:/]+)[:/]/);
    if (match) return match[1];
  } catch { /* No git or no remote */ }
  return null;
}

function findProvider(host) {
  if (!host) return { name: 'github', source: 'default' };

  // Local providers first (~/.claude/ops-agent/providers/)
  const localProviders = join(opsAgentGlobal, 'providers');
  if (existsSync(localProviders)) {
    for (const file of readdirSync(localProviders).filter(f => f.endsWith('.md'))) {
      try {
        const content = readFileSync(join(localProviders, file), 'utf8');
        const hostMatch = content.match(/hostPattern\s*\|?\s*[`"]([^`"]+)[`"]/i);
        if (hostMatch && host.includes(hostMatch[1].trim())) {
          return { name: file.replace('.md', ''), source: 'local', host: hostMatch[1].trim() };
        }
      } catch { /* skip */ }
    }
  }

  // Built-in providers (plugin/providers/)
  const builtinProviders = join(pluginRoot, 'providers');
  if (existsSync(builtinProviders)) {
    for (const file of readdirSync(builtinProviders).filter(f => f.endsWith('.md') && f !== 'PROVIDER.md')) {
      try {
        const content = readFileSync(join(builtinProviders, file), 'utf8');
        const hostMatch = content.match(/hostPattern\s*\|?\s*[`"]([^`"]+)[`"]/i);
        if (hostMatch && host.includes(hostMatch[1].trim())) {
          return { name: file.replace('.md', ''), source: 'builtin', host: hostMatch[1].trim() };
        }
      } catch { /* skip */ }
    }
  }

  return { name: 'github', source: 'default' };
}

function loadOverlay(host) {
  if (!host) return null;
  const overlayPath = join(opsAgentGlobal, 'overlays', `${host}.json`);
  if (existsSync(overlayPath)) {
    try { return JSON.parse(readFileSync(overlayPath, 'utf8')); }
    catch { /* skip */ }
  }
  return null;
}

// --- Git identity detection from provider ---
function detectGitIdentity(provider, host) {
  let providerPath;
  if (provider.source === 'local') {
    providerPath = join(opsAgentGlobal, 'providers', `${provider.name}.md`);
  } else {
    providerPath = join(pluginRoot, 'providers', `${provider.name}.md`);
  }

  if (!existsSync(providerPath)) return null;

  const content = readFileSync(providerPath, 'utf8');
  const nameMatch = content.match(/user\.name\s*\|\s*`([^`]+)`/);
  const emailMatch = content.match(/user\.email\s*\|\s*`([^`]+)`/);

  if (!nameMatch || !emailMatch) return null;

  let credentialUser = null;
  if (host) {
    try {
      const ghOutput = execSync(`gh auth status --hostname ${host} 2>&1`, { encoding: 'utf8', timeout: 3000 });
      const userMatch = ghOutput.match(/Logged in to .+ account (\S+)/);
      if (userMatch) credentialUser = userMatch[1];
    } catch { /* gh not available */ }
  }

  return { name: nameMatch[1], email: emailMatch[1], credentialUser, host };
}

// --- Build skill trigger context for message injection ---
function buildSkillContext(provider) {
  const skillsDir = join(pluginRoot, 'skills');
  if (!existsSync(skillsDir)) return '';

  let providerPath = join(pluginRoot, 'providers', 'github.md');
  if (provider.source === 'local') {
    const localPath = join(opsAgentGlobal, 'providers', `${provider.name}.md`);
    if (existsSync(localPath)) providerPath = localPath;
  } else if (provider.source === 'builtin') {
    const builtinPath = join(pluginRoot, 'providers', `${provider.name}.md`);
    if (existsSync(builtinPath)) providerPath = builtinPath;
  }

  return [
    '',
    'Natural language skill triggers — on match, read the guide file and follow its workflow.',
    'Do NOT mention plugin name to the user. Provider file MUST be read before any API call.',
    '',
    `Provider: ${providerPath}`,
    '',
    '| Trigger | Guide |',
    '|---------|-------|',
    `| "flow", "플로우", "이슈", "issue", "커밋", "commit", "PR", "풀리퀘", "spec", "명세", natural language change request | ${join(skillsDir, 'flow', 'SKILL.md')} |`,
    `| "setup", "설정" | ${join(skillsDir, 'setup', 'SKILL.md')} |`,
  ].join('\n');
}

// --- Auto-sync plugin version in installed_plugins.json (no dir rename) ---
function syncPluginVersion() {
  try {
    const versionFile = join(pluginRoot, 'VERSION');
    if (!existsSync(versionFile)) return;
    const currentVersion = readFileSync(versionFile, 'utf8').trim();

    const installedPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
    if (!existsSync(installedPath)) return;

    const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
    const entry = installed.plugins?.['ops-agent@ops-agent']?.[0];
    if (!entry || entry.version === currentVersion) return; // already in sync

    entry.version = currentVersion;
    entry.lastUpdated = new Date().toISOString();
    try {
      const sha = execSync('git rev-parse HEAD', { cwd: pluginRoot, encoding: 'utf8', timeout: 3000 }).trim();
      entry.gitCommitSha = sha;
    } catch { /* skip */ }
    writeFileSync(installedPath, JSON.stringify(installed, null, 2) + '\n');
  } catch { /* non-critical */ }
}

// --- Auto-set git config on plugin repo based on its own remote ---
function ensurePluginGitIdentity() {
  try {
    const remote = execSync('git remote get-url origin', { cwd: pluginRoot, encoding: 'utf8', timeout: 3000 }).trim();
    const hostMatch = remote.match(/[@/]([^:/]+)[:/]/);
    if (!hostMatch) return;
    const pluginHost = hostMatch[1];
    const pluginProvider = findProvider(pluginHost);
    const identity = detectGitIdentity(pluginProvider, pluginHost);
    if (!identity) return;

    const currentName = execSync('git config user.name', { cwd: pluginRoot, encoding: 'utf8', timeout: 1000 }).trim();
    const currentEmail = execSync('git config user.email', { cwd: pluginRoot, encoding: 'utf8', timeout: 1000 }).trim();
    if (currentName !== identity.name) {
      execSync(`git config user.name "${identity.name}"`, { cwd: pluginRoot, timeout: 1000, stdio: 'ignore' });
    }
    if (currentEmail !== identity.email) {
      execSync(`git config user.email "${identity.email}"`, { cwd: pluginRoot, timeout: 1000, stdio: 'ignore' });
    }
  } catch { /* non-critical — git config may not be set yet */ }
}

// --- Cleanup stale version directories ---
function cleanupStaleVersions() {
  try {
    const cacheParent = resolve(pluginRoot, '..');
    const currentDir = pluginRoot.split('/').pop();
    const siblings = readdirSync(cacheParent);
    for (const dir of siblings) {
      if (dir !== currentDir && /^\d+\.\d+\.\d+$/.test(dir)) {
        const target = join(cacheParent, dir);
        execSync(`rm -rf "${target}"`, { timeout: 5000, stdio: 'ignore' });
      }
    }
  } catch { /* non-critical */ }
}

// --- Migrate legacy .omc/state/ to .ops-agent/state/ (5.0.0 rename) ---
// 워크트리 state 경로 컨벤션이 5.0.0 에서 변경되었다.
// cwd 또는 worktree 루트에 .omc/state/ 가 남아 있고 .ops-agent/state/ 가 없으면 1회 이동.
// .ops-agent/state/ 가 이미 있으면 사용자가 수동 처리한 것으로 간주하고 건드리지 않음.
function migrateOmcStateToOpsAgent() {
  try {
    const legacy = join(cwd, '.omc', 'state');
    const target = join(cwd, '.ops-agent', 'state');
    if (!existsSync(legacy)) return;
    if (existsSync(target)) return; // 사용자 수동 처리분 보존
    execSync(`mkdir -p "${join(cwd, '.ops-agent')}"`, { timeout: 1000, stdio: 'ignore' });
    execSync(`mv "${legacy}" "${target}"`, { timeout: 2000, stdio: 'ignore' });
    // .omc 디렉토리가 비었으면 정리
    try { execSync(`rmdir "${join(cwd, '.omc')}" 2>/dev/null`, { timeout: 1000, stdio: 'ignore' }); } catch { /* skip */ }
  } catch { /* non-critical */ }
}

// --- Mirror style-rules SSOT to ~/.claude/ops-agent/style-rules/ ---
// ops-agent 의 base/extensions 룰을 사용자 스코프로 미러링한다.
// 외부 어댑터 등 소비자는 이 경로를 참조한다 (ops-agent 캐시 버전 디렉토리는 갱신 시 바뀌므로).
// *.local.* 파일은 사용자 추가 룰이므로 덮어쓰지 않는다.
function mirrorStyleRules() {
  try {
    const src = join(pluginRoot, 'config', 'style-rules');
    if (!existsSync(src)) return;
    const dst = join(opsAgentGlobal, 'style-rules');
    execSync(`mkdir -p "${dst}/base" "${dst}/extensions"`, { timeout: 1000, stdio: 'ignore' });

    for (const sub of ['base', 'extensions']) {
      const subSrc = join(src, sub);
      const subDst = join(dst, sub);
      if (!existsSync(subSrc)) continue;
      for (const file of readdirSync(subSrc)) {
        if (file.includes('.local.')) continue; // 사용자 로컬 룰 보호
        const srcPath = join(subSrc, file);
        const dstPath = join(subDst, file);
        const content = readFileSync(srcPath, 'utf8');
        writeFileSync(dstPath, content);
      }
    }
  } catch { /* non-critical */ }
}

// --- Assemble global ~/.claude/CLAUDE.md from managed fragments ---
// 분리 조립: ops-agent 가 퍼블릭 base 조각을 ~/.claude/global-md/00-ops-agent-base.md 로 기록하고,
// 외부 소비자(사내 어댑터 등)는 NN-*.md 규약으로 같은 디렉토리에 자기 조각을 둔다.
// 조각들을 파일명 순으로 마커와 함께 연결 + 로컬 오버레이(CLAUDE.local.md)를 더해
// ~/.claude/CLAUDE.md 로 조립한다. 결과가 기존과 동일하면 기록을 생략한다 (idempotent).
// 기존 CLAUDE.md 가 이 엔진 생성물(마커 없음)이 아니면 .bak 로 1회 백업 후 전환한다.
const GLOBAL_MD_MARKER = '<!-- ops-agent:global-md assembled — 직접 편집 금지. 원천은 각 조각 -->';

function assembleGlobalClaudeMd() {
  try {
    const claudeHome = join(homedir(), '.claude');
    const fragDir = join(claudeHome, 'global-md');
    execSync(`mkdir -p "${fragDir}"`, { timeout: 1000, stdio: 'ignore' });

    // ops-agent base 조각 기록 (플러그인 소유, 갱신 시 덮어씀)
    const baseSrc = join(pluginRoot, 'config', 'global-md', 'base.md');
    if (existsSync(baseSrc)) {
      const baseDst = join(fragDir, '00-ops-agent-base.md');
      const baseContent = readFileSync(baseSrc, 'utf8');
      if (!existsSync(baseDst) || readFileSync(baseDst, 'utf8') !== baseContent) {
        writeFileSync(baseDst, baseContent);
      }
    }

    // 조각 디렉토리에서 *.md 를 파일명 순으로 수집 (00-ops-agent-base, NN-*, ...)
    const fragFiles = readdirSync(fragDir).filter((f) => f.endsWith('.md')).sort();
    if (fragFiles.length === 0) return;

    const sections = [GLOBAL_MD_MARKER, ''];
    for (const f of fragFiles) {
      const content = readFileSync(join(fragDir, f), 'utf8').trim();
      if (!content) continue;
      sections.push(`<!-- BEGIN ${f} -->`);
      sections.push(content);
      sections.push(`<!-- END ${f} -->`);
      sections.push('');
    }

    // 로컬 오버레이 (사용자 소유, 덮어쓰지 않음, 최하단)
    const localOverlay = join(claudeHome, 'CLAUDE.local.md');
    if (existsSync(localOverlay)) {
      const content = readFileSync(localOverlay, 'utf8').trim();
      if (content) {
        sections.push('<!-- BEGIN CLAUDE.local.md (사용자 로컬) -->');
        sections.push(content);
        sections.push('<!-- END CLAUDE.local.md -->');
        sections.push('');
      }
    }

    const assembled = sections.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

    const target = join(claudeHome, 'CLAUDE.md');
    if (existsSync(target)) {
      const current = readFileSync(target, 'utf8');
      if (current === assembled) return; // idempotent — 변경 없음
      // 생성 마커가 없으면 수기 파일 — .bak 로 1회 백업 (덮어쓰지 않음)
      if (!current.startsWith(GLOBAL_MD_MARKER)) {
        const bak = join(claudeHome, 'CLAUDE.md.bak');
        if (!existsSync(bak)) writeFileSync(bak, current);
      }
    }
    writeFileSync(target, assembled);
  } catch { /* non-critical */ }
}

// --- Forbidden-word rules: session-scoped injection ---
// 룰 목록은 세션 중 바뀌지 않으므로 SessionStart 에서 1회만 주입한다.
// UserPromptSubmit 훅은 직전 응답 위반 통지만 담당한다 (hooks/forbidden-words-prompt.sh).
function buildForbiddenWordsContext() {
  try {
    const rules = [];
    const sources = [
      join(pluginRoot, 'config', 'forbidden-words.json'),
      join(homedir(), '.claude', 'forbidden-words.local.json'),
    ];
    for (const path of sources) {
      if (!existsSync(path)) continue;
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        if (Array.isArray(parsed.rules)) rules.push(...parsed.rules);
      } catch { /* 손상된 로컬 룰은 무시 */ }
    }
    if (rules.length === 0) return '';

    const lines = [
      '',
      '[금지 표현 — 어시스턴트 응답에 포함하지 않는다]',
      '이 룰은 세션 시작 시 1회 주입된다. 출력 직전 패턴 자가 대조는 어시스턴트가 수행한다.',
      '훅은 응답을 막거나 재작성하지 않으며, 위반이 검출되면 다음 턴에 해당 항목만 통지한다.',
    ];
    for (const rule of rules) {
      lines.push(`  - 패턴 \`${rule.pattern || ''}\` → 대체 \`${rule.replacement || ''}\` (${rule.reason || ''})`);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

// --- Sync marketplace metadata to latest remote (prevents stale version path) ---
function syncMarketplace() {
  try {
    // Derive marketplace name from cache path: .../cache/{marketplace}/{plugin}/{version}
    const marketplaceName = resolve(pluginRoot, '..', '..').split('/').pop();
    const marketplaceDir = join(homedir(), '.claude', 'plugins', 'marketplaces', marketplaceName);
    if (!existsSync(join(marketplaceDir, '.git'))) return;

    // Check if remote has newer commits
    execSync('git fetch origin', { cwd: marketplaceDir, timeout: 10000, stdio: 'ignore' });
    let defaultBranch = 'main';
    try {
      const refs = execSync('git ls-remote --symref origin HEAD', { cwd: marketplaceDir, encoding: 'utf8', timeout: 5000 });
      const m = refs.match(/refs\/heads\/(\S+)/);
      if (m) defaultBranch = m[1];
    } catch { /* fallback */ }

    const local = execSync('git rev-parse HEAD', { cwd: marketplaceDir, encoding: 'utf8', timeout: 3000 }).trim();
    const remote = execSync(`git rev-parse origin/${defaultBranch}`, { cwd: marketplaceDir, encoding: 'utf8', timeout: 3000 }).trim();
    if (local === remote) return; // already up to date

    execSync(`git reset --hard origin/${defaultBranch}`, { cwd: marketplaceDir, timeout: 5000, stdio: 'ignore' });
  } catch { /* non-critical */ }
}

// --- Execute ---
ensurePluginGit();
cleanupStaleVersions();
syncMarketplace();
syncPluginVersion();
ensurePluginGitIdentity();
mirrorStyleRules();
assembleGlobalClaudeMd();
migrateOmcStateToOpsAgent();

const host = detectProvider();
const provider = findProvider(host);
const overlay = loadOverlay(host);

// Read actual version from VERSION file (not directory name)
let pluginVersion = 'unknown';
try {
  const vf = join(pluginRoot, 'VERSION');
  if (existsSync(vf)) pluginVersion = readFileSync(vf, 'utf8').trim();
} catch { /* skip */ }

const parts = [`ops-agent: v${pluginVersion}`, `provider: ${provider.name} (${provider.source})`];
if (overlay) parts.push('overlay: loaded');

const identity = detectGitIdentity(provider, host);
if (identity) {
  parts.push('');
  parts.push('Git Identity (MUST verify before commit/push):');
  parts.push(`  user.name: ${identity.name}`);
  parts.push(`  user.email: ${identity.email}`);
  if (identity.credentialUser) {
    parts.push(`  credential: ${identity.credentialUser}@${identity.host}`);
  }
  parts.push(`  Verify: git config user.name && git config user.email`);
  parts.push(`  Fix: git config user.name "${identity.name}" && git config user.email "${identity.email}"`);
}

parts.push(buildSkillContext(provider));
parts.push(buildForbiddenWordsContext());

const context = parts.filter(Boolean).join('\n');

// 외부 소비자용 캐시 (어댑터가 세션 컨텍스트를 참조할 수 있도록 유지)
try {
  const cacheDir = join(opsAgentGlobal, '.cache');
  if (!existsSync(cacheDir)) {
    execSync(`mkdir -p "${cacheDir}"`, { timeout: 1000, stdio: 'ignore' });
  }
  writeFileSync(join(cacheDir, 'session-context.txt'), context);
} catch { /* non-critical */ }

// SessionStart 는 hookSpecificOutput.additionalContext 로 컨텍스트를 전달한다.
// 이전 구현은 PreToolUse 최상위 additionalContext 로 매 툴 호출마다 재전송했으나,
// 해당 위치는 지원 필드가 아니어서 실제로는 한 번도 전달되지 않았다.
console.log(JSON.stringify({
  continue: true,
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: context,
  },
}));
