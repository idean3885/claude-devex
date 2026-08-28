/**
 * git 위험 조작 룰. 기본 브랜치 직접 push 와 작업 손실 명령을 탐지한다.
 *
 * 이 모듈이 룰의 단일 출처다. `pre-tool-use.mjs` 의 한시 권한 판정이 호출하고,
 * 다른 소비자(사내 어댑터 등)도 같은 판정을 쓰도록 분리했다.
 * 룰이 호출부마다 복제되면 한쪽만 갱신되어 같은 명령이 경로에 따라 통과·차단으로 갈린다.
 *
 * 두 부류를 다룬다.
 *
 * 1. 기본 브랜치 직접 push: 원격에 올라간 뒤에는 되돌리기가 force push 를 요구한다.
 *    브랜치 이름을 `main` 으로 하드코딩하지 않는다. 레포마다 기본 브랜치가 다르고,
 *    하드코딩하면 `master`·`develop` 레포에서 가드가 조용히 통과한다.
 * 2. 작업 손실 명령: `reset --hard` · `clean -fd` · `branch -D` · `restore`/`checkout --`.
 *    외부로 나가지 않지만 커밋되지 않은 작업을 복구 경로 없이 지운다.
 *
 * 사용:
 *   import { detectGitRiskActions } from './git-guard-rules.mjs';
 *   const ops = detectGitRiskActions(segments, { runGit });
 */

// 작업 손실 명령. verb 는 게이트 메시지에 그대로 실린다.
const DESTRUCTIVE = [
  {
    verb: 'reset --hard',
    test: seg => /^(?:\S*\/)?git\s+(?:-\S+\s+|--\S+(?:=\S+|\s+\S+)\s+)*reset\b/.test(seg)
      && /(?:^|\s)--hard\b/.test(seg),
    why: '커밋되지 않은 변경과 인덱스를 함께 버립니다',
    alt: 'git stash 로 대피시킨 뒤 필요한 것만 되돌립니다',
  },
  {
    verb: 'clean',
    test: seg => /^(?:\S*\/)?git\s+(?:-\S+\s+|--\S+(?:=\S+|\s+\S+)\s+)*clean\b/.test(seg)
      && /(?:^|\s)-[a-zA-Z]*[fdx]/.test(seg),
    why: '추적되지 않는 파일을 지웁니다. 되돌릴 기록이 남지 않습니다',
    alt: 'git clean -n 으로 지워질 목록을 먼저 확인합니다',
  },
  {
    verb: 'branch -D',
    test: seg => /^(?:\S*\/)?git\s+(?:-\S+\s+|--\S+(?:=\S+|\s+\S+)\s+)*branch\b/.test(seg)
      && /(?:^|\s)(?:-D|--delete\s+--force|-\w*D\w*)\b/.test(seg),
    why: '머지되지 않은 브랜치를 확인 없이 지웁니다',
    alt: 'git branch -d 로 머지 여부를 확인하게 둡니다',
  },
  {
    verb: 'restore',
    test: seg => (/^(?:\S*\/)?git\s+(?:-\S+\s+|--\S+(?:=\S+|\s+\S+)\s+)*restore\b/.test(seg)
      && !/(?:^|\s)--staged\b/.test(seg))
      || /^(?:\S*\/)?git\s+(?:-\S+\s+|--\S+(?:=\S+|\s+\S+)\s+)*checkout\s+.*(?:^|\s)--(?:\s|$)/.test(seg),
    why: '워킹 트리의 수정을 파일 단위로 되돌립니다. 편집 내용이 사라집니다',
    alt: '되돌릴 파일을 먼저 git diff 로 확인합니다',
  },
];

/**
 * 원격 기본 브랜치를 구한다. 네트워크를 타지 않는 로컬 조회만 쓴다
 * (`git remote show origin` 은 원격을 조회해 훅 타임아웃을 넘긴다).
 * 구하지 못하면 null 을 돌려주고, 호출부는 기본 브랜치 판정을 건너뛴다.
 * 추측한 이름으로 차단하면 오탐이 되고, 오탐이 반복되면 가드가 꺼진다.
 */
export function resolveDefaultBranch(runGit) {
  const ref = runGit('symbolic-ref --short refs/remotes/origin/HEAD');
  if (ref) {
    const short = ref.trim().replace(/^origin\//, '');
    if (short) return short;
  }
  const configured = runGit('config --get init.defaultBranch');
  if (configured && configured.trim()) return configured.trim();
  return null;
}

/**
 * push 세그먼트에서 밀어 넣을 대상 브랜치를 뽑는다.
 * `git push origin main` · `git push origin HEAD:main` · `git push` (현재 브랜치) 를 구분한다.
 * 대상을 확정하지 못하면 null 이고, 호출부가 판정을 건너뛴다.
 */
export function pushTargetBranch(seg, runGit) {
  const tokens = seg.trim().split(/\s+/).slice(1).filter(t => !t.startsWith('-'));
  // tokens[0] 은 push, 그 뒤가 remote·refspec
  const rest = tokens.slice(1);
  const refspec = rest[1];
  if (refspec) {
    // src:dst 형태면 dst 가 원격 브랜치다
    const dst = refspec.includes(':') ? refspec.split(':').pop() : refspec;
    return dst.replace(/^refs\/heads\//, '') || null;
  }
  // 인자 없는 push 는 현재 브랜치를 upstream 으로 민다
  const cur = runGit('rev-parse --abbrev-ref HEAD');
  return cur && cur.trim() && cur.trim() !== 'HEAD' ? cur.trim() : null;
}

/**
 * 세그먼트 목록에서 git 위험 조작을 찾는다.
 * @param {string[]} segments 파이프·논리연산자로 분리된 명령 세그먼트
 * @param {{runGit: (args: string) => string|null}} ctx 대상 디렉토리에서 git 을 실행하는 함수
 * @returns {Array<{category: string, tool: string, verb: string, why: string, alt: string}>}
 */
export function detectGitRiskActions(segments, ctx) {
  const runGit = (ctx && ctx.runGit) || (() => null);
  const ops = [];
  let defaultBranch;

  for (const seg of segments) {
    if (/^(?:\S*\/)?git\s+(?:-\S+\s+|--\S+(?:=\S+|\s+\S+)\s+)*push\b/.test(seg)) {
      // force·delete push 는 기존 repo 룰이 이미 잡으므로 여기서는 일반 push 만 본다
      if (/(?:^|\s)(?:--force|--force-with-lease|-f|--delete|-d)\b/.test(seg)) continue;
      if (defaultBranch === undefined) defaultBranch = resolveDefaultBranch(runGit);
      if (!defaultBranch) continue;
      const target = pushTargetBranch(seg, runGit);
      if (target && target === defaultBranch) {
        ops.push({
          category: 'repo',
          scope: 'git-default-push',
          tool: 'git push',
          verb: `기본 브랜치(${defaultBranch}) 직접 push`,
          why: '원격에 올라간 뒤에는 force push 없이 되돌릴 수 없습니다',
          alt: '브랜치에서 PR 을 올리고 웹에서 머지합니다',
        });
      }
      continue;
    }

    for (const rule of DESTRUCTIVE) {
      if (rule.test(seg)) {
        ops.push({ category: 'worktree', scope: 'worktree-destructive', tool: 'git', verb: rule.verb, why: rule.why, alt: rule.alt });
        break;
      }
    }
  }
  return ops;
}
