#!/usr/bin/env node
/**
 * ops-agent PreToolUse hook
 *
 * 1. 세션 컨텍스트 주입 (기존 기능)
 * 2. 대외비 가드 (GATE 0): 공개 표면 쓰기 명령(gh issue/pr/release, git commit)의
 *    본문·제목·메시지에서 대외비 키워드/패턴 히트 시 하드 차단.
 *
 *    타겟 호스트 인식:
 *    - `gh` 명령: GH_HOST 환경 변수 또는 `-R host/owner/repo` 플래그에서 호스트 추출
 *    - `git commit`: 현재 레포의 origin remote URL 검사
 *    - 타겟이 `internalHosts` 에 포함되면 `externalOnly` 키워드/패턴은 허용
 *    - `keywords` / `patterns` (루트) 는 타겟 무관 항상 차단 (예: 위키)
 *
 * 3. 도메인 What 추상화 가드: 커밋·PR·이슈 본문의 구현 세부(클래스명·어노테이션·yaml 키 등) 차단.
 * 4. 액션 게이트: 되돌리기 어려운/외부 영향 행위(클러스터 mutation·PR 머지·릴리즈·force push
 *    ·리소스 삭제)를 세션 명시 허용 전까지 차단. 권한 추측 실행을 기계적으로 차단.
 *    세션 허용: OPS_AGENT_ACTION_GATE_ALLOW=1 또는 action-gate-allow.sh on 마커.
 *    드라이런 OPS_AGENT_ACTION_GATE_DRYRUN=1 · 비활성 OPS_AGENT_ACTION_GATE_DISABLE=1.
 *    (레거시 OPS_AGENT_CLUSTER_WRITE_ALLOW / _GUARD_* · cluster-write-allow.json 도 계속 인식)
 *
 * 키워드 소스: ~/.claude/ops-agent/confidential-keywords.local.json
 * 드라이런: OPS_AGENT_CONFIDENTIAL_DRYRUN=1 설정 시 차단 대신 경고만 출력
 * 비활성: OPS_AGENT_CONFIDENTIAL_DISABLE=1 설정 시 가드 전체 스킵
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { scanWhatViolations } from './what-guard-rules.mjs';

// ─── stdin 수집 ───
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) { input += chunk; }

// ─── 세션 컨텍스트 (기존) ───
const cachePath = join(homedir(), '.claude', 'ops-agent', '.cache', 'session-context.txt');
const sessionContext = existsSync(cachePath) ? readFileSync(cachePath, 'utf8') : '';

// ─── 대외비 가드 ───
const DISABLE = process.env.OPS_AGENT_CONFIDENTIAL_DISABLE === '1';
const DRYRUN = process.env.OPS_AGENT_CONFIDENTIAL_DRYRUN === '1';

const WHAT_GUARD_DISABLE = process.env.OPS_AGENT_WHAT_GUARD_DISABLE === '1';
const WHAT_GUARD_DRYRUN = process.env.OPS_AGENT_WHAT_GUARD_DRYRUN === '1';

// 액션 게이트 플래그 (레거시 OPS_AGENT_CLUSTER_GUARD_* 도 계속 인식)
const GATE_DISABLE = process.env.OPS_AGENT_ACTION_GATE_DISABLE === '1' || process.env.OPS_AGENT_CLUSTER_GUARD_DISABLE === '1';
const GATE_DRYRUN = process.env.OPS_AGENT_ACTION_GATE_DRYRUN === '1' || process.env.OPS_AGENT_CLUSTER_GUARD_DRYRUN === '1';

// 운영 클러스터 쓰기 가드 — mutating verb / 값 취하는 플래그 세트.
// (가드 호출이 최상위 await 컨텍스트라 const 초기화가 먼저 끝나도록 상단에 선언 — TDZ 회피)
const KUBECTL_WRITE = new Set([
  'apply', 'patch', 'replace', 'delete', 'edit', 'scale', 'annotate', 'label',
  'set', 'cordon', 'drain', 'uncordon', 'taint', 'rollout', 'create', 'expose',
  'autoscale', 'run', 'exec', 'cp', 'attach', 'certificate',
]);
const ARGOCD_WRITE = new Set([
  'create', 'delete', 'set', 'unset', 'sync', 'rollback', 'patch', 'add', 'rm',
  'terminate-op', 'actions', 'update-password',
]);
const HELM_WRITE = new Set(['install', 'upgrade', 'uninstall', 'delete', 'rollback']);
const VALUE_FLAGS = new Set([
  '-n', '--namespace', '--context', '--cluster', '--user', '--kubeconfig',
  '-o', '--output', '-l', '--selector', '--field-selector', '-f', '--filename',
  '--server', '--token', '--as', '--as-group', '--cache-dir', '--request-timeout',
  '--grpc-web-root-path',
]);

if (!DISABLE) {
  try {
    const hookInput = JSON.parse(input);
    if ((hookInput.tool_name || '') === 'Bash') {
      const command = (hookInput.tool_input && hookInput.tool_input.command) || '';
      const cwd = hookInput.cwd || process.cwd();
      const result = runConfidentialGuard(command, cwd);
      if (result.blocked) {
        const header = DRYRUN ? '[ops-agent 대외비 가드 · 드라이런]' : '[ops-agent 대외비 가드 · 차단]';
        const hitLines = result.hits.map(h =>
          `  - "${h.keyword}" (${h.source}): ${h.context}`).join('\n');
        const targetInfo = result.target
          ? `\n타겟: ${result.target.scope} (${result.target.reason})`
          : '';
        const msg = `${header} 공개 표면 쓰기 명령에서 대외비 히트:${targetInfo}\n${hitLines}\n\n` +
          `해결: 본문/제목/메시지에서 해당 키워드 제거 후 재시도.\n` +
          `허용 리스트 조정: ~/.claude/ops-agent/confidential-keywords.local.json`;
        if (DRYRUN) {
          process.stderr.write(msg + '\n');
          respondContinue(sessionContext);
          process.exit(0);
        } else {
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'PreToolUse',
              permissionDecision: 'deny',
              permissionDecisionReason: msg,
            },
          }));
          process.exit(0);
        }
      }

      // 도메인 What 추상화 가드: 커밋·PR·이슈 본문에서 구현 세부 노출 차단
      if (!WHAT_GUARD_DISABLE) {
        const whatResult = runWhatAbstractionGuard(command);
        if (whatResult.blocked) {
          const header = WHAT_GUARD_DRYRUN
            ? '[ops-agent What 추상화 가드 · 드라이런]'
            : '[ops-agent What 추상화 가드 · 차단]';
          const hitLines = whatResult.hits
            .map(h => `  - [${h.rule}] "${h.match}": ${h.context}`).join('\n');
          const msg = `${header} 본문에 구현 세부가 노출되어 있습니다.\n${hitLines}\n\n` +
            `해결: 도메인 행위·사용자 가치만 기술하세요. 클래스명·메서드명·어노테이션·헥사고날 어휘·yaml 키·산출물 카운트 모두 제거.\n` +
            `흐름은 mermaid flowchart/sequenceDiagram 사용.\n` +
            `가이드: ~/.claude/plugins/cache/claude-ops-agent/ops-agent/*/skills/flow/guides/commit.md 의 "도메인 What 추상화" 섹션\n` +
            `비활성: OPS_AGENT_WHAT_GUARD_DISABLE=1 (예외 상황만)`;
          if (WHAT_GUARD_DRYRUN) {
            process.stderr.write(msg + '\n');
          } else {
            process.stdout.write(JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: msg,
              },
            }));
            process.exit(0);
          }
        }
      }

      // 액션 게이트: 되돌리기 어려운/외부 영향 행위(클러스터 mutation·PR 머지·릴리즈·force push
      // ·리소스 삭제)는 세션 명시 허용 없으면 차단한다. 권한을 추측해 실행하는 사고를 기계적으로 막는다.
      if (!GATE_DISABLE) {
        const gateResult = runActionGate(command, hookInput.session_id);
        if (gateResult.blocked) {
          const header = GATE_DRYRUN
            ? '[ops-agent 액션 게이트 · 드라이런]'
            : '[ops-agent 액션 게이트 · 차단]';
          const opLines = gateResult.ops.map(o => `  - [${o.category}] ${o.tool} ${o.verb}`).join('\n');
          const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '<plugin-root>';
          const msg = `${header} 되돌리기 어려운/외부 영향 행위를 감지했습니다:\n${opLines}\n\n` +
            `사용자의 명확한 승인 없이는 이런 행위를 실행하지 마세요. 게이트를 사용자에게 전달하고 승인을 받으세요.\n` +
            `read-only·가역 명령(git commit, 일반 push, gh pr create 등)은 통과합니다.\n` +
            `사용자 승인 후 세션 허용:\n` +
            `  bash "${pluginRoot}/scripts/action-gate-allow.sh" on\n` +
            `해제: action-gate-allow.sh off · 파이프라인 비활성: OPS_AGENT_ACTION_GATE_DISABLE=1`;
          if (GATE_DRYRUN) {
            process.stderr.write(msg + '\n');
          } else {
            process.stdout.write(JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: msg,
              },
            }));
            process.exit(0);
          }
        }
      }
    }
  } catch (e) {
    if (process.env.OPS_AGENT_HOOK_DEBUG === '1') process.stderr.write('HOOKERR: ' + (e && e.stack || e) + '\n');
    // 입력 파싱 실패 시 가드는 생략하고 기본 응답 (훅이 통신을 망치지 않도록)
  }
}

respondContinue(sessionContext);

// ─────────────────────────────────────────────
function respondContinue(context) {
  if (context) {
    process.stdout.write(JSON.stringify({ continue: true, additionalContext: context }));
  } else {
    process.stdout.write('{"continue":true}');
  }
}

function runConfidentialGuard(command, cwd) {
  // 공개 쓰기 명령 감지 (체인된 명령도 커버)
  const writePatterns = [
    /\bgh\s+issue\s+(create|edit|comment)\b/,
    /\bgh\s+pr\s+(create|edit|comment|review)\b/,
    /\bgh\s+release\s+(create|edit)\b/,
    /\bgit\s+commit\b/,
  ];
  if (!writePatterns.some(re => re.test(command))) {
    return { blocked: false, hits: [] };
  }

  // 본문·제목·메시지 텍스트 추출
  const texts = [];
  extractOption(command, 'body', texts);
  extractOption(command, 'title', texts);
  extractOption(command, 'subject', texts);
  extractShortOption(command, 'm', texts);
  extractFileOption(command, 'body-file', texts);
  extractFileOption(command, 'notes-file', texts);

  if (texts.length === 0) {
    return { blocked: false, hits: [] };
  }

  const cfg = loadConfig();
  if (isEmptyConfig(cfg)) {
    return { blocked: false, hits: [] };
  }

  // 타겟 결정 — internal 이면 externalOnly 규칙은 스킵
  const target = resolveTarget(command, cwd, cfg.internalHosts);

  // 항상 차단되는 규칙 (위키 등 존재 자체가 대외비인 키워드)
  const alwaysRules = { keywords: cfg.keywords, patterns: cfg.patterns };
  // external 타겟에만 차단되는 규칙 (사내 인프라 참조 — 사내 작업엔 허용)
  const externalRules = target.scope === 'external'
    ? { keywords: cfg.externalOnly.keywords, patterns: cfg.externalOnly.patterns }
    : { keywords: [], patterns: [] };

  const hits = [];
  for (const t of texts) {
    collectHits(t, alwaysRules.keywords, alwaysRules.patterns, hits);
    collectHits(t, externalRules.keywords, externalRules.patterns, hits);
  }

  return { blocked: hits.length > 0, hits, target };
}

function collectHits(t, keywords, patterns, hits) {
  for (const kw of keywords) {
    if (!kw) continue;
    let idx = t.value.indexOf(kw);
    while (idx !== -1) {
      hits.push({
        keyword: kw,
        source: t.source,
        context: snippet(t.value, idx, kw.length),
      });
      idx = t.value.indexOf(kw, idx + kw.length);
    }
  }
  for (const pat of patterns) {
    const re = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g');
    let m;
    while ((m = re.exec(t.value)) !== null) {
      hits.push({
        keyword: m[0],
        source: t.source + ' (pattern)',
        context: snippet(t.value, m.index, m[0].length),
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
}

/**
 * 명령 텍스트에서 작업 디렉토리 후보를 추출한다.
 *
 * hookInput.cwd 가 호출자(예: 사용자 셸 또는 도구) 의 진입 디렉토리로 들어오는 경우, 명령 내부에서 워크트리·하위 레포로 cd 한 뒤 git 명령을
 * 실행하는 패턴이면 origin remote 조회 cwd 가 어긋난다. 첫 번째 `cd <path>` 또는 `git -C <path>` 패턴을 우선 사용하고, 없으면
 * 원본 cwd 로 fallback 한다.
 *
 * 셸 expansion 전 텍스트라 `~` 가 리터럴로 들어온다. execSync 의 cwd 로 그대로 넘기면 ENOENT 가 발생하므로
 * `~`/`~/` 를 `$HOME` 으로 치환한다.
 */
function expandHome(path) {
  const home = process.env.HOME;
  if (!home || !path) return path;
  if (path === '~') return home;
  if (path.startsWith('~/')) return home + path.slice(1);
  return path;
}

function extractCwdFromCommand(command, fallbackCwd) {
  const cdMatch = command.match(/\bcd\s+["']?([^\s"'&;|]+)["']?/);
  if (cdMatch) return expandHome(cdMatch[1]);
  const gitCMatch = command.match(/\bgit\s+-C\s+["']?([^\s"'&;|]+)["']?/);
  if (gitCMatch) return expandHome(gitCMatch[1]);
  return fallbackCwd;
}

function resolveTarget(command, cwd, internalHosts) {
  const hosts = internalHosts || [];
  const effectiveCwd = extractCwdFromCommand(command, cwd);
  // 1. gh 명령: GH_HOST 환경 변수 접두어 우선
  const ghHostMatch = command.match(/\bGH_HOST=([^\s'"]+)/);
  if (ghHostMatch) {
    const host = ghHostMatch[1];
    if (hosts.some(h => host === h || host.endsWith('.' + h))) {
      return { scope: 'internal', reason: `GH_HOST=${host}` };
    }
    return { scope: 'external', reason: `GH_HOST=${host}` };
  }

  // 2. gh -R 플래그: owner/repo 형식으로는 호스트 판별 불가 → gh config 조회
  if (/\bgh\s+(issue|pr|release)\b/.test(command)) {
    try {
      const defaultHost = execSync('gh config get -h github.com active_account 2>/dev/null; gh auth status 2>&1', {
        cwd: effectiveCwd, encoding: 'utf8', timeout: 2000,
      });
      for (const host of hosts) {
        if (defaultHost.includes(host)) {
          return { scope: 'internal', reason: `gh default host=${host}` };
        }
      }
    } catch { /* gh 조회 실패 시 external 로 fallback */ }
    return { scope: 'external', reason: 'gh default host 미확인' };
  }

  // 3. git commit: 현재 레포의 origin remote URL 검사
  if (/\bgit\s+commit\b/.test(command)) {
    try {
      const url = execSync('git remote get-url origin 2>/dev/null', {
        cwd: effectiveCwd, encoding: 'utf8', timeout: 2000,
      }).trim();
      for (const host of hosts) {
        if (url.includes(host)) {
          return { scope: 'internal', reason: `origin remote=${host}` };
        }
      }
      return { scope: 'external', reason: `origin remote 외부: ${url.substring(0, 60)}` };
    } catch { return { scope: 'external', reason: `origin remote 조회 실패 (cwd=${effectiveCwd})` }; }
  }

  // 4. 기본값: 안전하게 external
  return { scope: 'external', reason: '타겟 미확인' };
}

function loadConfig() {
  const cfgPath = process.env.OPS_AGENT_CONFIDENTIAL_CONFIG_PATH
    || join(homedir(), '.claude', 'ops-agent', 'confidential-keywords.local.json');
  const empty = {
    keywords: [], patterns: [],
    externalOnly: { keywords: [], patterns: [] },
    internalHosts: [],
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
      internalHosts: toStringArray(raw.internalHosts),
    };
  } catch {
    return empty;
  }
}

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter(v => typeof v === 'string' && v.length > 0)
    : [];
}

function toRegexArray(value) {
  return Array.isArray(value)
    ? value
        .filter(p => typeof p === 'string' && p.length > 0)
        .map(p => { try { return new RegExp(p); } catch { return null; } })
        .filter(Boolean)
    : [];
}

function isEmptyConfig(cfg) {
  return cfg.keywords.length === 0
    && cfg.patterns.length === 0
    && cfg.externalOnly.keywords.length === 0
    && cfg.externalOnly.patterns.length === 0;
}

function extractOption(command, name, out) {
  const re = new RegExp(`--${name}(?:=("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\S+)|\\s+("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\S+))`, 'g');
  let m;
  while ((m = re.exec(command)) !== null) {
    const raw = m[1] || m[2] || '';
    out.push({ source: `--${name}`, value: stripQuotes(raw) });
  }
}

function extractShortOption(command, name, out) {
  const re = new RegExp(`(?:^|\\s)-${name}(?:=("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\S+)|\\s+("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\S+))`, 'g');
  let m;
  while ((m = re.exec(command)) !== null) {
    const raw = m[1] || m[2] || '';
    out.push({ source: `-${name}`, value: stripQuotes(raw) });
  }
}

function extractFileOption(command, name, out) {
  const re = new RegExp(`--${name}(?:=(\\S+)|\\s+(\\S+))`, 'g');
  let m;
  while ((m = re.exec(command)) !== null) {
    const path = stripQuotes(m[1] || m[2] || '');
    if (path && existsSync(path)) {
      try {
        out.push({ source: `--${name}:${path}`, value: readFileSync(path, 'utf8') });
      } catch { /* 읽기 실패는 무시 */ }
    }
  }
}

function stripQuotes(s) {
  if (s.length >= 2) {
    const f = s[0], l = s[s.length - 1];
    if ((f === '"' && l === '"') || (f === "'" && l === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}


// ─── 도메인 What 추상화 가드 ───
// 커밋/PR/이슈 본문에서 구현 세부(클래스명·메서드명·어노테이션·헥사고날 어휘·yaml 키·산출물 카운트) 차단
function runWhatAbstractionGuard(command) {
  const writePatterns = [
    /\bgh\s+issue\s+(create|edit|comment)\b/,
    /\bgh\s+pr\s+(create|edit|comment|review)\b/,
    /\bgh\s+release\s+(create|edit)\b/,
    /\bgit\s+commit\b/,
  ];
  if (!writePatterns.some(re => re.test(command))) {
    return { blocked: false, hits: [] };
  }

  const texts = [];
  // 제목은 이슈/PR 번호 prefix 또는 짧은 도메인 표현이라 검사 대상 아님 — body/m/subject·body-file만
  extractOption(command, 'body', texts);
  extractShortOption(command, 'm', texts);
  extractFileOption(command, 'body-file', texts);
  extractFileOption(command, 'notes-file', texts);

  if (texts.length === 0) return { blocked: false, hits: [] };

  return scanWhatViolations(texts);
}

// ─── 액션 게이트 ───
// 되돌리기 어려운/외부 영향 행위를 감지해 세션 명시 허용 전까지 차단한다.
// 목적: 어시스턴트가 권한을 추측해 되돌리기 어려운 행위(클러스터 mutation·PR 머지·릴리즈·
//   force push·리소스 삭제)를 실행하는 사고를 기계적으로 막는다. 명확한 승인 = 세션 허용 플래그.
// 세션 허용: OPS_AGENT_ACTION_GATE_ALLOW=1 (또는 레거시 OPS_AGENT_CLUSTER_WRITE_ALLOW=1),
//   ~/.claude/ops-agent/.cache/action-gate-allow.json 마커(TTL·선택적 session 바인딩).
// 한계: `bash deploy.sh` 처럼 스크립트 내부에서 실행되는 명령은 최상위 명령만 보므로 탐지 못 함
//   (의도된 배포 스크립트 경로는 sanctioned 로 간주). 직접 타이핑하는 ad-hoc 명령을 막는 안전망.
// verb 세트/플래그 세트는 파일 상단(게이트 호출보다 먼저 초기화되어야 함)에 선언.
function runActionGate(command, sessionId) {
  if (actionGateAllowed(sessionId)) return { blocked: false, ops: [] };
  const ops = detectGatedActions(command);
  return { blocked: ops.length > 0, ops };
}

function actionGateAllowed(sessionId) {
  if (process.env.OPS_AGENT_ACTION_GATE_ALLOW === '1'
    || process.env.OPS_AGENT_CLUSTER_WRITE_ALLOW === '1') return true;
  const cacheDir = join(homedir(), '.claude', 'ops-agent', '.cache');
  // 신규 마커 우선, 레거시 마커도 인식
  for (const name of ['action-gate-allow.json', 'cluster-write-allow.json']) {
    const markerPath = join(cacheDir, name);
    if (!existsSync(markerPath)) continue;
    try {
      const m = JSON.parse(readFileSync(markerPath, 'utf8'));
      if (m.sessionId && sessionId && m.sessionId !== sessionId) continue;
      if (m.expiresAt && Date.now() > m.expiresAt) continue;
      return true;
    } catch { /* 다음 후보 */ }
  }
  return false;
}

// 게이트 대상 행위 = 클러스터 mutation + 레포 되돌리기 어려운 행위
function detectGatedActions(command) {
  return [...detectClusterMutations(command), ...detectRepoActions(command)];
}

// 명령을 체인 세그먼트로 분리하고 선행 env 할당·sudo 를 제거해 각 세그먼트 앞부분을 돌려준다.
function gateSegments(command) {
  return command.split(/&&|\|\||;|\n|\|/).map(raw => raw
    .trim()
    .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*/, '')
    .replace(/^sudo\s+/, ''));
}

function detectClusterMutations(command) {
  const ops = [];
  for (const seg of gateSegments(command)) {
    let m;
    if ((m = seg.match(/^(?:\S*\/)?kubectl\s+(.*)$/s))) {
      const verb = firstPositional(m[1]);
      if (verb && KUBECTL_WRITE.has(verb)) ops.push({ category: 'cluster', tool: 'kubectl', verb });
    } else if ((m = seg.match(/^(?:\S*\/)?argocd\s+(app|proj|repo|cluster|account|admin)\s+(.*)$/s))) {
      const verb = firstPositional(m[2]);
      if (verb && ARGOCD_WRITE.has(verb)) ops.push({ category: 'cluster', tool: `argocd ${m[1]}`, verb });
    } else if ((m = seg.match(/^(?:\S*\/)?helm\s+(.*)$/s))) {
      const verb = firstPositional(m[1]);
      if (verb && HELM_WRITE.has(verb)) ops.push({ category: 'cluster', tool: 'helm', verb });
    }
  }
  return ops;
}

// 레포 되돌리기 어려운 행위: PR 머지·릴리즈·레포 삭제/보관·force/삭제 push
function detectRepoActions(command) {
  const ops = [];
  for (const seg of gateSegments(command)) {
    let m;
    if (/^(?:\S*\/)?gh\s+pr\s+merge\b/.test(seg)) {
      ops.push({ category: 'repo', tool: 'gh pr', verb: 'merge' });
    } else if ((m = seg.match(/^(?:\S*\/)?gh\s+release\s+(create|edit|delete)\b/))) {
      ops.push({ category: 'repo', tool: 'gh release', verb: m[1] });
    } else if ((m = seg.match(/^(?:\S*\/)?gh\s+repo\s+(delete|archive)\b/))) {
      ops.push({ category: 'repo', tool: 'gh repo', verb: m[1] });
    } else if (/^(?:\S*\/)?git\s+push\b/.test(seg)) {
      if (/(?:^|\s)(?:--force|--force-with-lease|-f)\b/.test(seg)) ops.push({ category: 'repo', tool: 'git push', verb: 'force' });
      else if (/(?:^|\s)(?:--delete|-d)\b/.test(seg)) ops.push({ category: 'repo', tool: 'git push', verb: 'delete' });
      else if (/\s:[^\s]+/.test(seg)) ops.push({ category: 'repo', tool: 'git push', verb: 'delete-refspec' });
    }
  }
  return ops;
}

// 명령 뒤 토큰들에서 첫 positional(=서브커맨드/verb) 을 찾는다.
// 플래그(-x)와 값 취하는 플래그의 값 토큰은 건너뛴다. --flag=val 형태는 자체 완결.
function firstPositional(rest) {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.startsWith('-')) {
      if (VALUE_FLAGS.has(tk)) i++;
      continue;
    }
    return tk;
  }
  return null;
}
