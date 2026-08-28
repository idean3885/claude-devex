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
 * 3. 한시 권한: 되돌리기 어려운/외부 영향 행위(클러스터 mutation·PR 머지·릴리즈·force push
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
import { join, dirname } from 'path';
import { homedir } from 'os';
import { scanWhatViolations, snippet } from './what-guard-rules.mjs';
import { detectGitRiskActions } from './git-guard-rules.mjs';
// 규칙 로딩·공개 여부 판정은 confidential-scan.mjs 와 공유한다.
// 복제하면 가드와 스캐너의 판정이 갈라진다.
import {
  loadConfig, isEmptyConfig, parseRemote, lookupVisibility, shellQuote, findKeywordHits,
} from './confidential-rules.mjs';

// ─── 실행 예산 ───
// 훅이 하네스 타임아웃에 잘리면 그 호출의 검사는 성립하지 않고, 잘렸다는 사실도 남지 않는다.
// 가드가 걸려야 할 자리에서 조용히 빠지는 상태다. 그래서 잘리기 전에 스스로 답한다.
//
// 정상 경로 실측은 전체 37ms 이고 그중 노드 기동이 35ms 다. git 호출은 각 11ms 다.
// 예산 1500ms 는 그 40배이므로 정상 판정을 자르지 않는다. 예산을 넘기는 상황은
// 검사 대상이 커서가 아니라 머신 경합·입력 지연 쪽이고, 그때는 판정을 포기하고 알린다.
const HOOK_START = Date.now();
const HOOK_BUDGET_MS = Number(process.env.OPS_AGENT_HOOK_BUDGET_MS) || 1500;
const remainingMs = () => HOOK_BUDGET_MS - (Date.now() - HOOK_START);
// 하위 프로세스 타임아웃은 남은 예산 안에서만 준다. 내부 타임아웃 합이 예산을 넘으면
// 각 호출은 제 시간을 지켜도 훅 전체가 잘린다 (remote 2000 + diff 1200 > 예산이었다).
const budgeted = (want) => Math.max(150, Math.min(want, remainingMs()));
let budgetExceeded = false;
// 검사를 마치지 못한 채 통과시키는 것은 통과가 아니라 미검사다. 둘을 같은 모양으로 두지 않는다.
function noteBudgetExceeded(where) {
  if (budgetExceeded) return;
  budgetExceeded = true;
  process.stderr.write(`[ops-agent 훅] 실행 예산 ${HOOK_BUDGET_MS}ms 초과 — ${where} 검사를 마치지 못했습니다. 이 호출은 검사되지 않았습니다.\n`);
}

// ─── stdin 수집 ───
// EOF 를 기다리는 자리라 호출 측이 닫지 않으면 여기서 멈춘다. 예산 안에서만 기다린다.
let input = '';
process.stdin.setEncoding('utf8');
{
  let timer;
  const stdinDeadline = new Promise(res => { timer = setTimeout(() => res('deadline'), Math.max(150, remainingMs())); });
  const collect = (async () => {
    for await (const chunk of process.stdin) { input += chunk; }
    return 'eof';
  })();
  const which = await Promise.race([collect, stdinDeadline]);
  clearTimeout(timer);
  if (which === 'deadline') {
    noteBudgetExceeded('입력 수집');
    process.exit(0); // 판정 없음. 하네스 기본 동작(통과)에 맡기고 사실만 남긴다
  }
}

// ─── 대외비 가드 ───
const DISABLE = process.env.OPS_AGENT_CONFIDENTIAL_DISABLE === '1';
const DRYRUN = process.env.OPS_AGENT_CONFIDENTIAL_DRYRUN === '1';

const WHAT_GUARD_DISABLE = process.env.OPS_AGENT_WHAT_GUARD_DISABLE === '1';
const WHAT_GUARD_DRYRUN = process.env.OPS_AGENT_WHAT_GUARD_DRYRUN === '1';

// 한시 권한 플래그 (레거시 OPS_AGENT_CLUSTER_GUARD_* 도 계속 인식)
const GATE_DISABLE = process.env.OPS_AGENT_ACTION_GATE_DISABLE === '1' || process.env.OPS_AGENT_CLUSTER_GUARD_DISABLE === '1';
const GATE_DRYRUN = process.env.OPS_AGENT_ACTION_GATE_DRYRUN === '1' || process.env.OPS_AGENT_CLUSTER_GUARD_DRYRUN === '1';

// 운영 클러스터 쓰기 가드 — mutating verb / 값 취하는 플래그 세트.
// (가드 호출이 최상위 await 컨텍스트라 const 초기화가 먼저 끝나도록 상단에 선언 — TDZ 회피)
// 동거 검사(#386)용 패턴. 게이트 호출보다 먼저 초기화되어야 하므로 여기 둔다.
// 갈래 앞에 와도 판정 출력이 없는 명령: 주석·디렉토리 이동·환경 설정.
const COHABIT_BENIGN = /^(?:#|cd\b|export\b|set\b|umask\b|source\b|\.\s|true$|:$)/;
// 예외: 판정을 **종료 코드로** 돌려주는 검사 스크립트. `&&` 로 물리면 검출 시 다음 명령이
// 실행되지 않으므로, 사람이 출력을 읽지 않아도 결과가 집행된다. 문자열로만 알리는 스니펫과
// 다른 것은 이 한 가지다.
const COHABIT_GATE_CHECK = /(?:^|[\/\s])pre-merge-check\.sh(?:\s|$)/;

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
// `git commit` 판정. git 과 서브커맨드 사이에는 전역 옵션이 올 수 있다.
// `\bgit\s+commit\b` 만 쓰면 `git -C <path> commit` 이 커밋으로 인식되지 않아
// 파일 내용 검사가 통째로 건너뛰어진다. 알려진 전역 옵션 형태만 허용해
// `git log --grep commit` 같은 조회 명령을 오인하지 않는다.
const GIT_GLOBAL_OPT = String.raw`(?:-[cC]\s+\S+|--(?:git-dir|work-tree|namespace|exec-path)(?:=\S+|\s+\S+)|--no-pager|--no-replace-objects|--bare|--literal-pathspecs|-p|--paginate)`;
const GIT_COMMIT_RE = new RegExp(String.raw`\bgit\s+(?:${GIT_GLOBAL_OPT}\s+)*commit\b`);
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
        const scope = result.target ? result.target.scope : 'public';
        const what = result.undeterminable
          ? '커밋 대상 레포를 판별할 수 없어 파일 내용을 검사하지 못함'
          : scope === 'internal'
            ? '사내 공유 표면 쓰기에서 개인 환경 흔적 히트'
            : '공개 표면 쓰기에서 대외비 히트';
        const targetInfo = result.target
          ? `\n표면: ${scope} (${result.target.reason})`
          : '';
        const msg = result.undeterminable
          ? `${header} ${what}:\n  ${result.undeterminable}\n\n`
            + `해결: 아래 중 하나로 다시 실행한다.\n`
            + `  - 그 레포를 작업 디렉토리로 두고 셸 변수 없이 실행\n`
            + `  - \`cd\` · \`git -C\` 인자에 실제 경로를 쓴다 (훅은 셸 변수를 확장할 수 없다)\n`
            + `검사하지 못한 상태를 통과로 두지 않는다. 대외비 가드에서 미검사와 무해는 다르다.`
          : `${header} ${what}:${targetInfo}\n${hitLines}\n\n`
            + `해결: 본문·제목·메시지 또는 커밋 대상 파일에서 해당 키워드 제거 후 재시도.\n`
            + `커밋 대상 diff 는 추가된 줄만 검사한다. 키워드를 정당하게 다루는 경로는 설정의 allowPaths 로 제외.\n`
            + (scope === 'internal'
              ? `개인 인프라·부트스트랩 세부는 본인 공간에만 남긴다. 규칙 목록: 설정의 personalDevOnly\n`
              : `비공개 저장소면 표면이 private 로 잡혀야 한다. 잘못 잡혔으면 캐시를 확인한다:\n`
                + `  ~/.claude/ops-agent/cache/repo-visibility.json\n`)
            + `허용 리스트 조정: ~/.claude/ops-agent/confidential-keywords.local.json`;
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
      if (!WHAT_GUARD_DISABLE && remainingMs() <= 0) noteBudgetExceeded('What 추상화 가드');
      if (!WHAT_GUARD_DISABLE && remainingMs() > 0) {
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
            `가이드: ~/.claude/ops-agent/current/skills/flow/guides/commit.md 의 "도메인 What 추상화" 섹션\n` +
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

      // 한시 권한: 되돌리기 어려운/외부 영향 행위(클러스터 mutation·PR 머지·릴리즈·force push
      // ·리소스 삭제)는 세션 명시 허용 없으면 차단한다. 권한을 추측해 실행하는 사고를 기계적으로 막는다.
      if (!GATE_DISABLE && remainingMs() <= 0) noteBudgetExceeded('한시 권한');
      if (!GATE_DISABLE && remainingMs() > 0) {
        const gateResult = runActionGate(command, hookInput.session_id, hookInput.cwd);
        if (gateResult.blocked) {
          const header = GATE_DRYRUN
            ? '[ops-agent 한시 권한 · 드라이런]'
            : '[ops-agent 한시 권한 · 차단]';
          // 대체 경로가 있는 룰은 함께 싣는다. 금지만 통보하면 다음 행동이 정해지지 않는다.
          const opLines = gateResult.ops.map(o => {
            const head = `  - [${o.category}] ${o.tool} ${o.verb}`;
            if (!o.why && !o.alt) return head;
            return `${head}\n      이유: ${o.why}\n      대신: ${o.alt}`;
          }).join('\n');
          // 안내 경로에 버전을 넣지 않는다. CLAUDE_PLUGIN_ROOT 는 캐시의 버전 디렉토리라
          // 갱신 뒤 이 문구를 복사해 둔 사용자가 옛 스크립트를 켜게 된다 (#202).
          // 고정 경로는 SessionStart 의 linkCurrentRoot 가 활성 버전으로 유지한다.
          // 큰따옴표 안의 ~ 는 확장되지 않으므로 경로를 따옴표로 감싸지 않는다. 이 경로에는 공백이 없다.
          const gateRoot = '~/.claude/ops-agent/current';
          // 이 메시지는 자립해야 한다. 정본 절차(GATE 3)는 flow 스킬 안에 있어 /flow 를
          // 거치지 않은 세션에는 로딩되지 않는다. 게이트가 발동하는 순간 컨텍스트에 있다고
          // 보장되는 것은 이 문자열뿐이므로, 실행 주체·형식·차단 사실을 여기서 다 말한다.
          // 개방 명령에는 감지된 갈래와 **이미 열려 있던 갈래**를 함께 싣는다.
          // `on` 은 마커를 새로 쓰므로 감지된 갈래만 싣으면 앞서 연 갈래가 지워진다. 그러면
          // 한 작업에서 두 갈래가 순차로 필요할 때 개방 → 차단 → 개방이 반복되고, 같은 종류의
          // 요청이 사람에게 네 번 간다 (#353). 합집합을 스크립트에서 자동으로 만들지 않는 이유는
          // TTL 이 함께 연장되어 먼저 연 갈래의 창이 사람이 의도한 길이를 넘기기 때문이다.
          // 마커는 사람이 마지막으로 승인한 것을 그대로 담고, 합치는 일은 이 메시지가 한다.
          const blockedScopes = [...new Set(gateResult.ops.map(o => o.scope).filter(Boolean))];
          const openScopes = (gateResult.allowed || []).filter(s => s && s !== 'all' && s !== 'unscoped');
          const carried = openScopes.filter(s => !blockedScopes.includes(s));
          const scopeArg = [...blockedScopes, ...carried].join(',') || 'all';
          const msg = `${header} 되돌리기 어려운/외부 영향 행위를 감지했습니다:\n${opLines}\n\n` +
            `권한 개방은 사용자만 실행할 수 있습니다. 아래를 그대로 제시하고 기다리세요:\n` +
            `  !bash ${gateRoot}/scripts/action-gate-allow.sh on ${scopeArg}\n\n` +
            `이 명령은 위 갈래(${scopeArg})만 엽니다. 다른 갈래는 계속 차단되고 다시 사람에게 옵니다.\n` +
            (carried.length
              ? `\`on\` 은 열려 있던 갈래를 대체합니다. 이미 열린 갈래(${carried.join(',')})를 위 명령에 함께 담았으니 이 한 줄로 필요한 갈래가 모두 열립니다.\n`
              : '') +
            `어시스턴트가 이 스크립트를 실행하면 자기 수정으로 차단됩니다. 정상 동작이며 우회하지 않습니다.\n` +
            `자연어 승인("승인합니다"·"머지 승인" 등)은 권한을 열지 않습니다. 마커 파일 생성만이 개방 신호입니다.\n` +
            `read-only·가역 명령(git commit, 브랜치 push, gh pr create 등)은 통과합니다.\n` +
            `전체 절차: docs/action-gate.md · 해제: action-gate-allow.sh off · 파이프라인 비활성: OPS_AGENT_ACTION_GATE_DISABLE=1`;
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

        // 동거 검사: 갈래가 열려 있어도, 앞선 명령의 출력을 읽어야 하는 블록이면 막는다 (#386).
        // 열린 창에서만 의미가 있다. 닫혀 있으면 위 갈래 차단이 먼저 걸린다.
        if (!gateResult.blocked && (gateResult.detected || []).length) {
          const co = detectGateCohabitation(command, hookInput.cwd);
          if (co) {
            const header = GATE_DRYRUN
              ? '[ops-agent 한시 권한 · 드라이런]'
              : '[ops-agent 한시 권한 · 차단]';
            const msg = `${header} 되돌리기 어려운 행위(${co.op.tool} ${co.op.verb})가 다른 명령과 한 블록에 있습니다.\n` +
              `앞선 명령:\n${co.preceding.map(s => `  - ${s.length > 120 ? s.slice(0, 120) + '…' : s}`).join('\n')}\n\n` +
              `앞선 명령의 출력을 읽기 전에 이 행위가 실행됩니다. 게이트가 판정을 내려도 같은 블록의\n` +
              `다음 줄이 그대로 실행되면 판정이 아무것도 막지 못합니다 (실측: 버전 대조가 「멈춤」을\n` +
              `출력한 블록에서 머지가 실행되어 기본 브랜치의 버전이 뒤로 밀렸습니다).\n\n` +
              `해결: 앞선 명령을 먼저 단독 실행해 출력을 읽고, 그 다음 호출에서 이 행위만 실행하세요.\n` +
              `예외: 판정을 종료 코드로 돌려주는 검사(scripts/pre-merge-check.sh)는 \`&&\` 로 물려도 됩니다.\n` +
              `      검출 시 종료 코드 1 이라 다음 명령이 실행되지 않습니다.\n` +
              `디렉토리 이동(cd)·환경 설정(export·set)·주석은 앞에 와도 통과합니다.`;
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
    GIT_COMMIT_RE,
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

  // 대상 디렉토리를 한 번 구해 표면 판정과 diff 검사가 같은 경로를 쓰게 한다.
  // 규칙 로딩보다 먼저 해소해야 한다. 레포가 선언하는 제외 경로를 읽으려면
  // 어느 레포인지부터 정해져야 한다.
  const resolved = resolveCommandCwd(command, cwd);

  const cfg = loadConfig(findRepoRoot(resolved.cwd));
  if (isEmptyConfig(cfg)) {
    return { blocked: false, hits: [] };
  }

  // 경로를 해소하지 못했으면 커밋 대상 파일을 읽을 수 없다. 통과시키면
  // "검사하지 못함" 이 "검사해서 깨끗함" 과 같아진다. 커밋이면 막는다.
  if (!resolved.ok && GIT_COMMIT_RE.test(command)) {
    return {
      blocked: true,
      undeterminable: resolved.reason,
      hits: [{
        keyword: '(커밋 대상 레포 판별 불가)',
        source: resolved.source,
        context: resolved.reason,
      }],
      target: { scope: 'public', reason: resolved.reason },
    };
  }

  // 커밋 대상 파일 내용도 커밋·푸시로 공개된다. 메시지만 보면 파일로 들어간
  // 대외비를 놓친다 (예시 문자열이 주요 유입 경로). 커밋 시점에 diff 를 검사한다.
  const diffTruncated = collectCommitDiffTexts(command, resolved.cwd, cfg.allowPaths, texts);

  if (texts.length === 0) {
    return { blocked: false, hits: [], diffTruncated };
  }

  // 표면 판정 — public · private · internal
  const target = resolveTarget(command, resolved.cwd, cfg.internalHosts);

  // 항상 차단되는 규칙 (존재 자체가 대외비인 키워드)
  const alwaysRules = { keywords: cfg.keywords, patterns: cfg.patterns };
  // 표면별 추가 규칙. private 는 본인 비공개 공간이라 추가 규칙이 없다.
  let surfaceRules = { keywords: [], patterns: [] };
  if (target.scope === 'public') {
    surfaceRules = cfg.externalOnly;                 // 사내 → 공개 (대외비 위반)
  } else if (target.scope === 'internal') {
    surfaceRules = cfg.personalDevOnly;              // 개인 → 사내 (개인 환경 노출)
  }

  const hits = [];
  for (const t of texts) {
    collectHits(t, alwaysRules.keywords, alwaysRules.patterns, hits);
    collectHits(t, surfaceRules.keywords, surfaceRules.patterns, hits);
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
  if (!GIT_COMMIT_RE.test(command)) return false;

  // -a / --all / -am 은 추적 파일의 미스테이징 변경까지 커밋한다.
  const includeUnstaged = new RegExp(GIT_COMMIT_RE.source + String.raw`[^&|;]*?(?:\s-{1,2}(?:a|all)\b|\s-[a-zA-Z]*a[a-zA-Z]*\b)`).test(command);
  const range = includeUnstaged ? 'HEAD' : '--cached';

  let out = '';
  try {
    out = execSync(`git diff ${range} --unified=0 --no-color`, {
      cwd, encoding: 'utf8', timeout: budgeted(1200), maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // 최초 커밋(HEAD 없음)·git 아님 등. --cached 로 한 번 더 시도한다.
    if (range === 'HEAD') {
      try {
        out = execSync('git diff --cached --unified=0 --no-color', {
          cwd, encoding: 'utf8', timeout: budgeted(1200), maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
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
    if (!kw || !kw.value) continue;
    // 매칭은 findKeywordHits 가 담당한다. 단어 경계·대소문자 옵션이 스캐너와 같은
    // 판정을 쓰도록 매처 자체를 공유한다.
    for (const h of findKeywordHits(t.value, kw)) {
      hits.push({
        // 등록된 값이 아니라 실제 등장 표기형을 담는다. ignoreCase 로 걸린 경우
        // 어떤 표기가 들어갔는지가 정정에 필요하다.
        keyword: t.value.slice(h.index, h.index + h.length),
        source: t.source,
        context: snippet(t.value, h.index, h.length),
      });
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
  return resolveCommandCwd(command, fallbackCwd).cwd;
}

/**
 * 명령이 가리키는 작업 디렉토리를 구하고, 해소 가능했는지도 함께 돌려준다.
 *
 * 표면 판정과 커밋 diff 검사는 **같은 경로**를 봐야 한다. 예전에는 표면 판정만 `cd`·`git -C` 를
 * 해석하고 diff 검사는 원본 cwd 를 써서, `cd <repo> && git commit` 이 다른 레포의 diff 를 읽었다.
 * 원본 cwd 에 스테이징된 게 없으면 검사할 텍스트가 없어 그대로 통과했다.
 *
 * 셸 변수(`cd "$DIR"`)는 훅이 확장할 수 없다. 그런 경우 `ok: false` 로 알린다.
 * 판별 불가를 통과로 취급하면 "검사하지 못함" 과 "검사해서 깨끗함" 이 같아진다.
 */
/**
 * `.git` 이 있는 상위 디렉토리를 찾는다. 레포 선언 파일(`.ops-agent/confidential.json`)과
 * allowPaths 정규식이 맞춰 보는 경로가 둘 다 레포 루트 기준이라 루트가 필요하다.
 * 서브프로세스를 띄우지 않는다. 이 훅은 매 Bash 호출마다 돈다.
 */
function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; dir && i < 40; i++) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveCommandCwd(command, fallbackCwd) {
  const cdMatch = command.match(/\bcd\s+["']?([^\s"'&;|]+)["']?/);
  const gitCMatch = command.match(/\bgit\s+-C\s+["']?([^\s"'&;|]+)["']?/);
  const raw = (cdMatch && cdMatch[1]) || (gitCMatch && gitCMatch[1]);
  if (!raw) return { cwd: fallbackCwd, ok: true, source: 'hook cwd' };

  const source = cdMatch ? 'cd' : 'git -C';
  // 미확장 셸 표현이 남아 있으면 경로가 아니다.
  if (/[$`*?]/.test(raw)) {
    return { cwd: fallbackCwd, ok: false, source, reason: `${source} 인자에 미확장 셸 표현: ${raw}` };
  }
  const path = expandHome(raw);
  if (!existsSync(path)) {
    return { cwd: fallbackCwd, ok: false, source, reason: `${source} 경로 없음: ${path}` };
  }
  return { cwd: path, ok: true, source };
}

// 표면은 셋이다. 호스트만 보면 둘로만 갈라져 비공개 저장소가 공개 표면으로 오판된다.
//
//   internal — 사내 호스트. 개인 환경 흔적(personalDevOnly)을 막는다.
//   public   — 사내 호스트 아님 + 공개 확인. 사내 용어(externalOnly)를 막는다.
//   private  — 사내 호스트 아님 + 비공개 확인. 본인 비공개 공간이므로 양쪽 다 통과.
//
// 두 방향을 같은 강도로 막는다. 사내 → public 은 대외비 위반이고,
// 개인 → internal 은 개인 환경이 사내 공유 표면에 드러나는 문제다.
// cwd 는 호출자가 resolveCommandCwd 로 이미 해소한 경로다. 여기서 다시 추출하지 않는다.
// 두 곳이 각자 추출하면 표면과 검사 대상이 어긋날 수 있다.
function resolveTarget(command, cwd, internalHosts) {
  const hosts = internalHosts || [];
  const effectiveCwd = cwd;
  const isInternalHost = host => hosts.some(h => host === h || host.endsWith('.' + h));

  // 1. gh 명령: GH_HOST 환경 변수 접두어 우선
  const ghHostMatch = command.match(/\bGH_HOST=([^\s'"]+)/);
  const ghRepoMatch = command.match(/\bgh\s+\S+[^&|;]*?\s(?:-R|--repo)[\s=]+["']?([^\s"']+)/);
  const repoArg = ghRepoMatch ? ghRepoMatch[1].split('/') : null;

  if (ghHostMatch) {
    const host = ghHostMatch[1];
    if (isInternalHost(host)) return { scope: 'internal', reason: `GH_HOST=${host}` };
    // -R owner/repo 가 함께 오면 슬러그를 만들 수 있다.
    const slug = repoArg && repoArg.length === 2 ? `${host}/${repoArg.join('/')}` : null;
    return classifyExternal(slug, `GH_HOST=${host}`, host);
  }

  // 2. gh -R 에 호스트가 붙은 형태 (host/owner/repo)
  if (repoArg && repoArg.length >= 3) {
    const host = repoArg[0];
    if (isInternalHost(host)) return { scope: 'internal', reason: `-R host=${host}` };
    return classifyExternal(repoArg.slice(0, 3).join('/'), `-R host=${host}`, host);
  }

  // 3. gh (호스트 미지정) · git commit: 레포 리모트로 판정한다.
  //
  // gh 는 GH_HOST 도 host 붙은 -R 도 없으면 현재 디렉토리의 git 리모트에서 레포를 해소한다.
  // 따라서 판정 근거도 리모트여야 한다. 이전 구현은 `gh auth status` 출력 전문에 사내 호스트
  // 문자열이 있는지만 봤는데, 그 출력에는 로그인된 **모든** 호스트가 나열된다.
  // 사내·개인 계정을 함께 쓰는 머신에서는 항상 사내로 판정되어 externalOnly 규칙이
  // 통째로 건너뛰어졌다. 퍼블릭 레포 대상 명령이 사내 용어를 통과시키는 fail-open 이었다.
  if (/\bgh\s+(issue|pr|release)\b/.test(command) || GIT_COMMIT_RE.test(command)) {
    let url = '';
    try {
      url = execSync('git remote get-url origin 2>/dev/null', {
        cwd: effectiveCwd, encoding: 'utf8', timeout: budgeted(900),
      }).trim();
    } catch {
      // 판별 불가는 public 으로 닫는다. 대외비 가드에서 fail-open 은 방향이 거꾸로다.
      return { scope: 'public', reason: `origin remote 조회 실패 (cwd=${effectiveCwd})` };
    }
    if (!url) return { scope: 'public', reason: `origin remote 없음 (cwd=${effectiveCwd})` };

    const parsed = parseRemote(url);
    if (parsed && isInternalHost(parsed.host)) {
      return { scope: 'internal', reason: `origin remote=${parsed.host}` };
    }
    // 리모트 URL 이 파싱되지 않아도 사내 호스트 문자열이 들어 있으면 사내로 본다.
    for (const host of hosts) {
      if (url.includes(host)) return { scope: 'internal', reason: `origin remote=${host}` };
    }
    return classifyExternal(parsed && parsed.slug, `origin remote=${url.substring(0, 60)}`, parsed && parsed.host);
  }

  // 4. 기본값: 안전하게 public
  return { scope: 'public', reason: '타겟 미확인' };
}

// 사내 호스트가 아닌 대상의 공개 여부를 판정한다.
// 슬러그를 못 만들거나 조회가 실패하면 public 으로 닫는다.
function classifyExternal(slug, reason, host) {
  if (!slug) return { scope: 'public', reason: `${reason} · 레포 식별 불가` };
  const vis = lookupVisibility(slug, host);
  if (vis === 'PRIVATE' || vis === 'INTERNAL') {
    return { scope: 'private', reason: `${reason} · 비공개(${vis})` };
  }
  if (vis === 'PUBLIC') return { scope: 'public', reason: `${reason} · 공개` };
  return { scope: 'public', reason: `${reason} · 공개 여부 미확인` };
}

// loadConfig · isEmptyConfig · parseRemote · lookupVisibility · shellQuote 와
// 공개 여부 캐시는 confidential-rules.mjs 로 옮겼다. confidential-scan.mjs 가 같은
// 규칙·같은 표면 판정을 써야 하고, 복제하면 두 판정이 갈라진다.

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
    GIT_COMMIT_RE,
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

// ─── 한시 권한 ───
// 되돌리기 어려운/외부 영향 행위를 감지해 세션 명시 허용 전까지 차단한다.
// 목적: 어시스턴트가 권한을 추측해 되돌리기 어려운 행위(클러스터 mutation·PR 머지·릴리즈·
//   force push·리소스 삭제)를 실행하는 사고를 기계적으로 막는다. 명확한 승인 = 세션 허용 플래그.
// 세션 허용: OPS_AGENT_ACTION_GATE_ALLOW=1 (또는 레거시 OPS_AGENT_CLUSTER_WRITE_ALLOW=1),
//   ~/.claude/ops-agent/.cache/action-gate-allow.json 마커(TTL·선택적 session 바인딩).
// 한계: `bash deploy.sh` 처럼 스크립트 내부에서 실행되는 명령은 최상위 명령만 보므로 탐지 못 함
//   (의도된 배포 스크립트 경로는 sanctioned 로 간주). 직접 타이핑하는 ad-hoc 명령을 막는 안전망.
// verb 세트/플래그 세트는 파일 상단(게이트 호출보다 먼저 초기화되어야 함)에 선언.
// 게이트는 시간만이 아니라 **승인된 행위 갈래**로도 열린다. 시간만으로 열면 그 창 안에서
// 승인 대상이 아니었던 갈래까지 함께 통과한다. 실제로 PR 머지를 위해 연 창에서 기본 브랜치
// 직접 push 가 통과했다. 둘 다 category 는 `repo` 라 category 단위로는 나뉘지 않는다.
// 그래서 갈래 키를 category 보다 좁게 둔다 (scope).
function runActionGate(command, sessionId, hookCwd) {
  const allowed = allowedScopes(sessionId);
  // `all` 이 열려 있어도 탐지는 한다. 동거 검사(#386)가 열린 창에서만 발동하기 때문이다.
  const ops = detectGatedActions(command, hookCwd);
  const outside = allowed.has('all') ? [] : ops.filter(o => !allowed.has(o.scope || 'unscoped'));
  return { blocked: outside.length > 0, ops: outside, detected: ops, allowed: [...allowed] };
}

// 게이트 대상 행위 앞에 **출력을 읽어야 하는 명령**이 같은 블록에 있으면 차단한다.
//
// 게이트가 판정을 정확히 내려도 같은 명령 블록의 다음 줄이 그대로 실행되면 판정이 아무것도
// 막지 못한다. 실제로 GATE 6 이 「멈춤」 두 줄을 출력한 블록에서 `gh pr merge` 가 실행되어
// main 의 버전이 뒤로 밀렸다 (#386). 「분리해서 실행하라」를 지시로 두는 것과 기계가 거르는
// 것은 강도가 다르다. 잊어도 걸리는 쪽을 택한다.
//
// 앞 세그먼트만 본다. 뒤에 오는 정리 명령(브랜치 삭제 등)은 이미 실행된 행위의 결과에
// 딸린 것이라 판정 대상이 아니다.
function detectGateCohabitation(command, hookCwd) {
  const segs = gateSegments(command);
  if (segs.length < 2) return null;
  const dir = extractCwdFromCommand(command, hookCwd);
  const runGit = args => {
    try {
      return execSync(`git ${args}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: budgeted(800) });
    } catch {
      return null;
    }
  };
  for (let i = 0; i < segs.length; i++) {
    const ops = [
      ...detectClusterMutations(segs[i]),
      ...detectRepoActions(segs[i]),
      ...detectGitRiskActions([segs[i]], { runGit }),
    ];
    if (!ops.length) continue;
    const preceding = segs.slice(0, i)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .filter(s => !COHABIT_BENIGN.test(s) && !COHABIT_GATE_CHECK.test(s));
    if (preceding.length) {
      return { op: ops[0], preceding };
    }
  }
  return null;
}

// 마커가 담은 허용 갈래 집합. 비어 있으면 아무것도 열려 있지 않다.
function allowedScopes(sessionId) {
  if (process.env.OPS_AGENT_ACTION_GATE_ALLOW === '1'
    || process.env.OPS_AGENT_CLUSTER_WRITE_ALLOW === '1') return new Set(['all']);
  const cacheDir = join(homedir(), '.claude', 'ops-agent', '.cache');
  // 신규 마커 우선, 레거시 마커도 인식
  for (const name of ['action-gate-allow.json', 'cluster-write-allow.json']) {
    const markerPath = join(cacheDir, name);
    if (!existsSync(markerPath)) continue;
    try {
      const m = JSON.parse(readFileSync(markerPath, 'utf8'));
      if (m.sessionId && sessionId && m.sessionId !== sessionId) continue;
      if (m.expiresAt && Date.now() > m.expiresAt) continue;
      // 갈래가 없는 마커는 이 변경 이전 형식이다. 전체 허용으로 읽어 진행 중인 창을 끊지 않는다.
      const scopes = Array.isArray(m.scopes) && m.scopes.length ? m.scopes : ['all'];
      return new Set(scopes);
    } catch { /* 다음 후보 */ }
  }
  return new Set();
}

// 게이트 대상 행위 = 클러스터 mutation + 레포 되돌리기 어려운 행위 + git 위험 조작
//
// git 판정은 대상 디렉토리를 알아야 한다. 기본 브랜치도 현재 브랜치도 레포마다 다르므로
// 명령 문자열만으로는 정해지지 않는다. 표면 판정·diff 검사와 같은 해석기를 써서
// `cd <path> && git push` 형태가 다른 레포를 보는 사고를 막는다.
function detectGatedActions(command, hookCwd) {
  const dir = extractCwdFromCommand(command, hookCwd);
  const runGit = args => {
    try {
      return execSync(`git ${args}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: budgeted(800) });
    } catch {
      return null;
    }
  };
  return [
    ...detectClusterMutations(command),
    ...detectRepoActions(command),
    ...detectGitRiskActions(gateSegments(command), { runGit }),
  ];
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
      if (verb && KUBECTL_WRITE.has(verb)) ops.push({ category: 'cluster', scope: 'cluster-write', tool: 'kubectl', verb });
    } else if ((m = seg.match(/^(?:\S*\/)?argocd\s+(app|proj|repo|cluster|account|admin)\s+(.*)$/s))) {
      const verb = firstPositional(m[2]);
      if (verb && ARGOCD_WRITE.has(verb)) ops.push({ category: 'cluster', scope: 'cluster-write', tool: `argocd ${m[1]}`, verb });
    } else if ((m = seg.match(/^(?:\S*\/)?helm\s+(.*)$/s))) {
      const verb = firstPositional(m[1]);
      if (verb && HELM_WRITE.has(verb)) ops.push({ category: 'cluster', scope: 'cluster-write', tool: 'helm', verb });
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
      ops.push({ category: 'repo', scope: 'repo-merge', tool: 'gh pr', verb: 'merge' });
    } else if ((m = seg.match(/^(?:\S*\/)?gh\s+release\s+(create|edit|delete)\b/))) {
      ops.push({ category: 'repo', scope: 'repo-release', tool: 'gh release', verb: m[1] });
    } else if ((m = seg.match(/^(?:\S*\/)?gh\s+repo\s+(delete|archive)\b/))) {
      ops.push({ category: 'repo', scope: 'repo-delete', tool: 'gh repo', verb: m[1] });
    } else if (/^(?:\S*\/)?git\s+push\b/.test(seg)) {
      if (/(?:^|\s)(?:--force|--force-with-lease|-f)\b/.test(seg)) ops.push({ category: 'repo', scope: 'git-force', tool: 'git push', verb: 'force' });
      else if (/(?:^|\s)(?:--delete|-d)\b/.test(seg)) ops.push({ category: 'repo', scope: 'git-force', tool: 'git push', verb: 'delete' });
      else if (/\s:[^\s]+/.test(seg)) ops.push({ category: 'repo', scope: 'git-force', tool: 'git push', verb: 'delete-refspec' });
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
