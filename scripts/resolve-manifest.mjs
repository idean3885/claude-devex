#!/usr/bin/env node
/**
 * resolve-manifest.mjs — org·repo 식별과 매니페스트 발견을 한 곳에서 해석한다.
 *
 * org-flow 의 매니페스트 발견과 commit 가이드의 컨벤션 슬롯 해석이 각자 규칙을 갖고 있었다.
 * 규칙이 두 벌이면 한쪽에 선언한 값이 다른 쪽에서 해석되지 않는다. 실제로 외부 어댑터
 * 위치에 선언한 `conventions` 가 commit 단계에서 읽히지 않았다 (#309).
 *
 * 식별은 원격 주소로 한다. 디렉토리 이름은 클론 위치·진입 경로·실행 환경에 따라 달라진다 (#221).
 * 어댑터 루트는 이름을 추측하지 않고 선언에서 읽는다 (#222).
 *
 * 사용: node resolve-manifest.mjs [cwd]
 * 출력: JSON 한 줄
 *   { owner, repo, ownerSource, manifests: [{scope, path}], adapterRoots, notes: [] }
 *   발견 실패는 빈 배열로 돌려주고 notes 에 사유를 담는다. 조용히 기본값으로 떨어지지 않는다.
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';

const cwd = process.argv[2] || process.cwd();
const opsAgentGlobal = join(homedir(), '.claude', 'ops-agent');
const notes = [];

// 어댑터 루트 선언. 없으면 지금까지 쓰던 위치를 기본값으로 둔다 (하위 호환).
// 이름을 코드에 두지 않고 선언에서 읽는 것이 요점이다. 설치 위치가 달라지면 선언만 고친다.
function adapterRoots() {
  const decl = join(opsAgentGlobal, 'adapters.json');
  if (existsSync(decl)) {
    try {
      const parsed = JSON.parse(readFileSync(decl, 'utf8'));
      const roots = Array.isArray(parsed.roots) ? parsed.roots : [];
      if (roots.length) return roots.map(r => r.replace(/^~/, homedir()));
      notes.push(`adapters.json 에 roots 가 비어 있습니다 (${decl})`);
    } catch (e) {
      notes.push(`adapters.json 해석 실패 (${decl}): ${e.message}`);
    }
  }
  return [join(homedir(), '.claude', 'toolkits')];
}

// 소유자·레포는 원격에서 얻는다. 원격이 없을 때만 디렉토리 이름으로 떨어지고, 그 사실을 남긴다.
function identify() {
  let url = '';
  try {
    url = execSync('git remote get-url origin 2>/dev/null', {
      cwd, encoding: 'utf8', timeout: 1500,
    }).trim();
  } catch { /* 원격 없음 */ }

  if (url) {
    const m = url.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (m) return { owner: m[1], repo: m[2], ownerSource: 'remote' };
    notes.push(`origin remote 형식을 해석하지 못했습니다: ${url}`);
  } else {
    notes.push('origin remote 가 없습니다');
  }
  // 대체 경로. 사용자 확인 없이 이 값을 최종으로 쓰지 않는다.
  return { owner: basename(resolve(cwd, '..')), repo: basename(resolve(cwd)), ownerSource: 'directory' };
}

const { owner, repo, ownerSource } = identify();
const roots = adapterRoots();
const found = [];

// 해석 순서: 레포 선언 > org 선언(ops-agent) > org 선언(외부 어댑터).
// 레포가 항상 이긴다. 근거는 docs/conventions-slot.md.
const repoDecl = join(opsAgentGlobal, 'repos', `${owner}--${repo}.json`);
if (existsSync(repoDecl)) found.push({ scope: 'repo', path: repoDecl });

const orgDecl = join(opsAgentGlobal, 'orgs', `${owner}.json`);
if (existsSync(orgDecl)) found.push({ scope: 'org', path: orgDecl });

for (const root of roots) {
  if (!existsSync(root)) continue;
  let entries = [];
  try { entries = readdirSync(root); } catch { continue; }
  for (const entry of entries) {
    const p = join(root, entry, 'orgs', `${owner}.json`);
    if (existsSync(p)) found.push({ scope: 'org-adapter', path: p, adapter: entry });
  }
}

if (!found.length) notes.push(`매니페스트를 찾지 못했습니다 (owner=${owner})`);
if (ownerSource === 'directory') notes.push('소유자를 디렉토리 이름에서 얻었습니다. 사용자 확인 없이 확정하지 않습니다');

process.stdout.write(JSON.stringify({
  owner, repo, ownerSource, manifests: found, adapterRoots: roots, notes,
}) + '\n');
