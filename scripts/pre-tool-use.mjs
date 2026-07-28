#!/usr/bin/env node
/**
 * ops-agent PreToolUse hook
 *
 * 세션 컨텍스트 주입은 SessionStart 훅(scripts/session-start.mjs)이 담당한다.
 * 이 훅은 가드 판정만 수행한다.
 *
 * 1. 대외비 가드 (GATE 0): 공개 표면 쓰기 명령(gh issue/pr/release, git commit)의
 *    본문·제목·메시지에서 대외비 키워드/패턴 히트 시 하드 차단.
 *    git commit 은 메시지 외에 **커밋 대상 diff 의 추가된 줄**도 검사한다. 파일로 들어간
 *    대외비(예시 문자열 등)가 메시지 검사만으로는 걸러지지 않기 때문이다.
 *    삭제된 줄은 검사하지 않는다 — 대외비를 제거하는 커밋이 막히면 안 된다.
 *    제외 경로: 설정의 `allowPaths` 정규식.
 *
 *    타겟 호스트 인식:
 *    - `gh` 명령: GH_HOST 환경 변수 또는 `-R host/owner/repo` 플래그에서 호스트 추출
 *    - `git commit`: 현재 레포의 origin remote URL 검사
 *    - 타겟이 `internalHosts` 에 포함되면 `externalOnly` 키워드/패턴은 허용
 *    - `keywords` / `patterns` (루트) 는 타겟 무관 항상 차단 (예: 위키)
 *
 * 2. 도메인 What 추상화 가드: 커밋·PR·이슈 본문의 구현 세부(클래스명·어노테이션·yaml 키 등) 차단.
 * 3. 액션 게이트: 되돌리기 어려운/외부 영향 행위(클러스터 mutation·PR 머지·릴리즈·force push
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
import { scanWhatViolations, snippet } from './what-guard-rules.mjs';

// ─── stdin 수집 ───
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) { input += chunk; }

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
// 커밋 diff 검사 상한 (같은 TDZ 사유로 상단 선언)
const DIFF_SCAN_LIMIT = 256 * 1024;
const VALUE_FLAGS = new Set([
  '-n', '--namespace', '--context', '--cluster', '--user', '--kubeconfig',
  '-o', '--output', '-l', '--selector', '--field-selector', '-f', '--filename',
  '--server', '--token', '--as', '--as-group', '--cache-dir', '--request-timeout',
  '--grpc-web-root-path',
]);

let truncationNotice = '';

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
          `해결: 본문·제목·메시지 또는 커밋 대상 파일에서 해당 키워드 제거 후 재시도.\n` +
          `커밋 대상 diff 는 추가된 줄만 검사한다. 키워드를 정당하게 다루는 경로는 설정의 allowPaths 로 제외.\n` +
          `허용 리스트 조정: ~/.claude/ops-agent/confidential-keywords.local.json`;
        if (DRYRUN) {
          process.stderr.write(msg + '\n');
          respondContinue();
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

      // 검사 한도를 넘겨 일부만 본 경우, 차단하지 않아도 그 사실을 알린다.
      // 조용히 넘기면 "전부 검사됨" 으로 읽힌다.
      if (result.diffTruncated && !result.blocked) {
        truncationNotice = `[ops-agent 대외비 가드] 커밋 대상 diff 가 검사 한도(`
          + `${Math.floor(DIFF_SCAN_LIMIT / 1024)}KB)를 넘어 일부만 검사했습니다.\n`
          + `한도 이후 내용은 확인되지 않았습니다. 공개 표면 대상이면 직접 확인하세요.`;
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
    // 훅 내부 오류는 통신을 망치지 않도록 통과시키되, 조용히 삼키지 않는다.
    // 과거 `snippet` 미정의로 키워드 가드가 통째로 무력화됐는데도 드러나지 않은 사례가 있다.
    // 가드가 판정하지 못한 사실 자체를 사용자에게 보인다.
    const detail = (e && e.message) || String(e);
    if (process.env.OPS_AGENT_HOOK_DEBUG === '1') process.stderr.write('HOOKERR: ' + (e && e.stack || e) + '\n');
    process.stdout.write(JSON.stringify({
      continue: true,
      systemMessage: `[ops-agent 가드 내부 오류] 가드가 판정하지 못했습니다: ${detail}\n`
        + `이 명령은 검사 없이 통과합니다. 공개 표면 대상이면 직접 확인하세요.\n`
        + `상세: OPS_AGENT_HOOK_DEBUG=1`,
    }));
    process.exit(0);
  }
}

respondContinue();

// ─────────────────────────────────────────────
// 세션 컨텍스트는 SessionStart 훅이 1회 주입한다 (scripts/session-start.mjs).
// 이 훅은 가드 판정만 담당하고, 통과 시 추가 컨텍스트를 싣지 않는다.
function respondContinue() {
  if (truncationNotice) {
    process.stdout.write(JSON.stringify({ continue: true, systemMessage: truncationNotice }));
    return;
  }
  process.stdout.write('{"continue":true}');
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
  extractOption(command, 'notes', texts);       // gh release 본문
  extractShortOption(command, 'm', texts);
  extractShortOption(command, 'b', texts);      // gh --body
  extractShortOption(command, 't', texts);      // gh --title
  extractShortOption(command, 'n', texts);      // gh release --notes
  extractFileOption(command, 'body-file', texts);
  extractFileOption(command, 'notes-file', texts);
  extractFileOption(command, 'file', texts);
  extractShortFileOption(command, 'F', texts);  // git commit -F · gh --body-file 단축

  const cfg = loadConfig();
  if (isEmptyConfig(cfg)) {
    return { blocked: false, hits: [] };
  }

  // 커밋 대상 파일 내용도 커밋·푸시로 공개된다. 메시지만 보면 파일로 들어간
  // 대외비를 놓친다 (예시 문자열이 주요 유입 경로). 커밋 시점에 diff 를 검사한다.
  const diffTruncated = collectCommitDiffTexts(command, cwd, cfg.allowPaths, texts);

  if (texts.length === 0) {
    return { blocked: false, hits: [], diffTruncated };
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

  return { blocked: hits.length > 0, hits, target, diffTruncated };
}

// 커밋 대상 diff 의 **추가된 줄만** 검사 대상으로 모은다.
//
// 추가된 줄만 보는 이유: 삭제된 줄까지 검사하면 대외비를 **제거하는** 커밋이 차단된다.
// 정리 작업이 자기 가드에 막히는 모순을 피한다.
//
// 검사 시점을 파일 편집이 아니라 커밋으로 잡은 이유:
//   - 편집 시점에는 그 파일이 어디로 갈지 알 수 없다. gitignore 대상일 수도, 사내 레포일 수도 있다.
//     커밋 시점에는 레포 리모트로 타겟(internal·external)을 판정할 수 있고, 기존 판정 로직을 그대로 쓴다.
//   - 추적 대상만 diff 에 오르므로 로컬 전용 파일이 자연히 제외된다.
//   - 편집마다가 아니라 커밋당 1회만 돌아 비용이 낮다.
//   - 커밋 전에 막으면 아직 공개되지 않은 상태다. 편집 시점 검사 대비 늦지만 발행 전이다.
function collectCommitDiffTexts(command, cwd, allowPaths, texts) {
  if (!/\bgit\s+commit\b/.test(command)) return false;

  // -a / --all / -am 은 추적 파일의 미스테이징 변경까지 커밋한다.
  const includeUnstaged = /\bgit\s+commit\b[^&|;]*?(?:\s-{1,2}(?:a|all)\b|\s-[a-zA-Z]*a[a-zA-Z]*\b)/.test(command);
  const range = includeUnstaged ? 'HEAD' : '--cached';

  let out = '';
  try {
    out = execSync(`git diff ${range} --unified=0 --no-color`, {
      cwd, encoding: 'utf8', timeout: 1200, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // 최초 커밋(HEAD 없음)·git 아님 등. --cached 로 한 번 더 시도한다.
    if (range === 'HEAD') {
      try {
        out = execSync('git diff --cached --unified=0 --no-color', {
          cwd, encoding: 'utf8', timeout: 1200, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch { return false; }
    } else {
      return false;
    }
  }
  if (!out) return false;

  const perFile = new Map();
  let file = null;
  let scanned = 0;
  let truncated = false;

  for (const line of out.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '').trim();
      file = path === '/dev/null' ? null : path;
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('@@') || line.startsWith('diff --git')) continue;
    if (!file || line.charCodeAt(0) !== 43 /* '+' */) continue;

    const body = line.slice(1);
    if (!body) continue;
    if (allowPaths.some(re => re.test(file))) continue;

    scanned += body.length;
    if (scanned > DIFF_SCAN_LIMIT) { truncated = true; break; }
    perFile.set(file, (perFile.get(file) || '') + body + '\n');
  }

  for (const [path, value] of perFile) {
    texts.push({ source: `커밋 대상 ${path}`, value });
  }
  return truncated;
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

  // 2. gh -R 에 호스트가 붙은 형태 (host/owner/repo)
  const ghRepoMatch = command.match(/\bgh\s+\S+[^&|;]*?\s(?:-R|--repo)[\s=]+["']?([^\s"']+)/);
  if (ghRepoMatch) {
    const parts = ghRepoMatch[1].split('/');
    // host/owner/repo 3단이면 첫 단이 호스트. owner/repo 2단은 호스트 정보가 없다.
    if (parts.length >= 3) {
      const host = parts[0];
      if (hosts.some(h => host === h || host.endsWith('.' + h))) {
        return { scope: 'internal', reason: `-R host=${host}` };
      }
      return { scope: 'external', reason: `-R host=${host}` };
    }
  }

  // 3. gh (호스트 미지정) · git commit: 레포 리모트로 판정한다.
  //
  // gh 는 GH_HOST 도 host 붙은 -R 도 없으면 현재 디렉토리의 git 리모트에서 레포를 해소한다.
  // 따라서 판정 근거도 리모트여야 한다. 이전 구현은 `gh auth status` 출력 전문에 사내 호스트
  // 문자열이 있는지만 봤는데, 그 출력에는 로그인된 **모든** 호스트가 나열된다.
  // 사내·개인 계정을 함께 쓰는 머신에서는 항상 사내로 판정되어 externalOnly 규칙이
  // 통째로 건너뛰어졌다. 퍼블릭 레포 대상 명령이 사내 용어를 통과시키는 fail-open 이었다.
  if (/\bgh\s+(issue|pr|release)\b/.test(command) || /\bgit\s+commit\b/.test(command)) {
    try {
      const url = execSync('git remote get-url origin 2>/dev/null', {
        cwd: effectiveCwd, encoding: 'utf8', timeout: 2000,
      }).trim();
      if (!url) {
        return { scope: 'external', reason: `origin remote 없음 (cwd=${effectiveCwd})` };
      }
      for (const host of hosts) {
        if (url.includes(host)) {
          return { scope: 'internal', reason: `origin remote=${host}` };
        }
      }
      return { scope: 'external', reason: `origin remote 외부: ${url.substring(0, 60)}` };
    } catch {
      // 판별 불가는 external 로 닫는다. 대외비 가드에서 fail-open 은 방향이 거꾸로다.
      return { scope: 'external', reason: `origin remote 조회 실패 (cwd=${effectiveCwd})` };
    }
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
      internalHosts: toStringArray(raw.internalHosts),
      // 커밋 diff 검사에서 제외할 경로 정규식. 키워드를 정당하게 다루는 문서·설정용.
      allowPaths: toRegexArray(raw.allowPaths),
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

// 단축 파일 옵션 (`git commit -F <path>`, `gh ... -F <path>`).
// 이 경로가 빠져 있어 -F 로 넘긴 커밋 메시지·본문이 검사되지 않았다.
function extractShortFileOption(command, name, out) {
  const re = new RegExp(`(?:^|\\s)-${name}(?:=(\\S+)|\\s+(\\S+))`, 'g');
  let m;
  while ((m = re.exec(command)) !== null) {
    const path = stripQuotes(m[1] || m[2] || '');
    if (path && existsSync(path)) {
      try {
        out.push({ source: `-${name}:${path}`, value: readFileSync(path, 'utf8') });
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
  extractOption(command, 'notes', texts);
  extractShortOption(command, 'm', texts);
  extractShortOption(command, 'b', texts);
  extractFileOption(command, 'body-file', texts);
  extractFileOption(command, 'notes-file', texts);
  extractFileOption(command, 'file', texts);
  extractShortFileOption(command, 'F', texts);

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
