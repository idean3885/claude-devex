#!/usr/bin/env node
/**
 * selftest-action-gate.mjs — 한시 권한 판정 자체 점검.
 *
 * `pre-tool-use.mjs` 를 고쳤으면 이것을 돌린다. 게이트는 발동할 때만 존재가 드러나므로,
 * 조용히 무력화되면 아무 신호가 없다. 실제로 판정 스니펫의 종료 코드가 뒤집힌 채 배포된
 * 이력이 있다 (#386).
 *
 * 갈래를 모두 열어(OPS_AGENT_ACTION_GATE_ALLOW=1) 돌린다. 동거 검사는 창이 열린 상태에서만
 * 발동하고, 그 상태가 정확히 사고가 난 조건이다.
 *
 * 사용: node scripts/selftest-action-gate.mjs
 * 종료 코드: 실패 1, 전부 통과 0
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, 'pre-tool-use.mjs');
const repoRoot = join(here, '..');

// want: 'pass' = 통과해야 한다, 'deny' = 차단되어야 한다
const CASES = [
  ['gated 행위 단독', 'gh pr merge 386 --merge', 'pass'],
  ['cd 뒤 머지', 'cd /tmp && gh pr merge 386 --merge', 'pass'],
  ['주석 뒤 머지', '# 버전 대조 통과\ngh pr merge 386 --merge', 'pass'],
  ['환경 설정 뒤 머지', 'export GH_HOST=github.com\ngh pr merge 386 --merge', 'pass'],
  ['머지 뒤 정리', 'gh pr merge 386 --merge && git worktree list', 'pass'],
  ['버전 검사 체인', 'bash scripts/pre-merge-check.sh fix/1 main && gh pr merge 1 --merge', 'pass'],
  ['버전 검사 절대경로 체인', 'bash /a/b/scripts/pre-merge-check.sh && gh pr merge 1 --merge', 'pass'],
  ['게이트 무관 명령', 'git log --oneline -3\ngit status', 'pass'],
  // 사고 재현: 판정을 출력하는 스니펫과 머지가 한 블록
  ['판정 스니펫 뒤 머지', 'bv=$(git show origin/main:VERSION)\necho "$bv"\ngh pr merge 386 --merge', 'deny'],
  ['조회 뒤 머지', 'git log --oneline -3\ngh pr merge 386 --merge', 'deny'],
  ['조회 뒤 릴리즈', 'gh release list\ngh release create v1 -n x', 'deny'],
  ['조회 뒤 클러스터 삭제', 'kubectl get pods\nkubectl delete pod x', 'deny'],
  ['파이프 뒤 머지', 'echo y | gh pr merge 386 --merge', 'deny'],
];

// 개방 안내가 「잃는 갈래」만 알리는지. prev → new 로 다시 열 때 사라지는 갈래가 없으면
// 알릴 것이 없다. 알리면 사용자가 그 문구를 실행해 중복된 목록을 마커에 넣는다 (#388).
// 마커를 만들지 않도록 함수만 불러 쓴다(OPS_AGENT_GATE_LIB=1).
const SCOPE_CASES = [
  ['새 목록이 이전을 포함', 'repo-merge', 'repo-merge,worktree-destructive,git-force', ''],
  ['같은 목록', 'repo-merge', 'repo-merge', ''],
  ['이전이 없음', '', 'repo-merge', ''],
  ['새 목록이 전체 개방', 'repo-merge,git-force', 'all', ''],
  ['갈래 하나가 닫힘', 'repo-merge,git-force', 'repo-merge', 'on repo-merge,git-force'],
  ['갈래가 전부 교체', 'repo-merge', 'cluster-write', 'on cluster-write,repo-merge'],
  ['전체 개방이 닫힘', 'all', 'repo-merge', 'on all'],
  ['이전 목록에 공백', 'repo-merge, git-force', 'repo-merge', 'on repo-merge,git-force'],
  ['이름에 all 을 담은 갈래', 'install-write', 'repo-merge', 'on repo-merge,install-write'],
];

let failed = 0;
for (const [name, prev, next, expect] of SCOPE_CASES) {
  const res = spawnSync('bash', ['-c',
    'set -euo pipefail; OPS_AGENT_GATE_LIB=1 . "$1"; warn_lost_scopes "$2" "$3"',
    'selftest', join(here, 'action-gate-allow.sh'), prev, next,
  ], { encoding: 'utf8' });
  const warn = (res.stderr || '').trim();
  const ok = expect ? warn.includes(expect) : warn === '';
  if (!ok) failed++;
  console.log(`${ok ? '  OK' : '  XX'}  개방 안내: ${name} — ${warn || '알림 없음'}`);
}

for (const [name, command, want] of CASES) {
  const res = spawnSync('node', [hook], {
    input: JSON.stringify({
      tool_name: 'Bash',
      cwd: repoRoot,
      session_id: 'selftest',
      tool_input: { command },
    }),
    encoding: 'utf8',
    env: { ...process.env, OPS_AGENT_ACTION_GATE_ALLOW: '1' },
  });

  let got = 'pass';
  let detail = '';
  const out = (res.stdout || '').trim();
  if (out) {
    try {
      const d = JSON.parse(out);
      const hs = d.hookSpecificOutput;
      if (hs && hs.permissionDecision === 'deny') {
        got = 'deny';
        detail = hs.permissionDecisionReason.split('\n')[0];
      } else if (d.systemMessage) {
        got = 'error';
        detail = d.systemMessage.split('\n')[0];
      }
    } catch {
      got = 'unparsed';
      detail = out.slice(0, 160);
    }
  }

  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? '  OK' : '  XX'}  ${name} — want ${want}, got ${got}${detail ? ` · ${detail}` : ''}`);
}

console.log(failed ? `\n실패 ${failed}건` : `\n${CASES.length + SCOPE_CASES.length}건 전부 통과`);
process.exit(failed ? 1 : 0);
