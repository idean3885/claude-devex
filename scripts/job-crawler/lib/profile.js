// 프로파일 탐색·검증.
//
// 엔진은 대상·기준·임계값·출력 경로를 모른다. 전부 소비 프로젝트가 프로파일로 공급한다.
// 탐색 순서는 advisor 와 같다 — 유저 스코프가 먼저고, 없으면 프로젝트 스코프를 본다.
// 유저 스코프에 두면 플러그인 업데이트와 무관하게 유지된다.

const fs = require('fs');
const os = require('os');
const path = require('path');

const USER_SCOPE = path.join(os.homedir(), '.claude', 'job-crawler', 'profiles');
const PROJECT_SCOPE = path.join('config', 'job-crawler');

function listJson(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'example.json')
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function readProfile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`프로파일을 읽지 못했습니다: ${file} (${e.message})`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`프로파일 JSON 파싱 실패: ${file} (${e.message})`);
  }
}

// 후보가 여러 개면 project 필드로 현재 디렉토리와 매칭한다. 하나면 그것을 쓴다.
// 어느 쪽도 아니면 추측하지 않고 멈춘다.
function pick(candidates, cwd) {
  if (candidates.length === 1) return candidates[0];
  const here = path.basename(cwd);
  const matched = candidates.filter((f) => {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8')).project === here;
    } catch {
      return false;
    }
  });
  if (matched.length === 1) return matched[0];
  throw new Error(
    `프로파일 후보가 ${candidates.length}개인데 project="${here}" 로 좁혀지지 않았습니다.\n` +
      `  후보: ${candidates.join(', ')}\n` +
      '  --profile 로 직접 지정하거나 프로파일의 project 필드를 맞추세요.'
  );
}

function locate(explicitPath, cwd) {
  if (explicitPath) return path.resolve(cwd, explicitPath);
  const user = listJson(USER_SCOPE);
  if (user.length > 0) return pick(user, cwd);
  const project = listJson(path.join(cwd, PROJECT_SCOPE));
  if (project.length > 0) return pick(project, cwd);
  throw new Error(
    '프로파일이 없습니다. 대상·기준은 엔진이 아니라 소비 프로젝트가 공급합니다.\n' +
      `  유저 스코프: ${USER_SCOPE}/<name>.json\n` +
      `  프로젝트 스코프: ${PROJECT_SCOPE}/<name>.json\n` +
      '  스키마는 ops-agent 의 config/job-crawler/example.json 참조.'
  );
}

function validate(profile, file) {
  const targets = profile.targets;
  if (!targets || typeof targets !== 'object' || Object.keys(targets).length === 0) {
    throw new Error(`${file}: targets 가 비어 있습니다.`);
  }
  for (const [name, cfg] of Object.entries(targets)) {
    if (!cfg || typeof cfg.url !== 'string' || !/^https?:/.test(cfg.url)) {
      throw new Error(`${file}: targets["${name}"].url 이 http(s) URL 이 아닙니다.`);
    }
  }
  if (!Array.isArray(profile.rules) || profile.rules.length === 0) {
    throw new Error(`${file}: rules 가 비어 있습니다.`);
  }
  return profile;
}

function load(explicitPath, cwd = process.cwd()) {
  const file = locate(explicitPath, cwd);
  return { file, profile: validate(readProfile(file), file) };
}

module.exports = { load, USER_SCOPE, PROJECT_SCOPE };
