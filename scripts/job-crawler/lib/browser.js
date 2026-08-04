// 헤드리스 Chromium 탐색·기동.
//
// puppeteer-core 는 브라우저를 내려받지 않는다. 실행 파일은 이미 설치된 것을 재사용하며,
// 환경마다 위치가 달라 후보를 순회한 뒤 마지막으로 /opt/pw-browsers 를 훑는다.

const fs = require('fs');
const path = require('path');

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CHROMIUM_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

function walkForBinary(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = walkForBinary(full);
      if (found) return found;
    } else if (/(chrome|headless_shell)$/.test(entry.name)) {
      try {
        fs.accessSync(full, fs.constants.X_OK);
        return full;
      } catch {
        // 실행 권한 없으면 후보 아님
      }
    }
  }
  return null;
}

function findChromium() {
  for (const p of CHROMIUM_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  const base = '/opt/pw-browsers';
  return fs.existsSync(base) ? walkForBinary(base) : null;
}

// 엔진은 플러그인 캐시 아래에 있고 puppeteer-core 는 소비 프로젝트가 설치한다.
// 기본 해석은 엔진 파일 위치에서 위로 올라가므로 소비 프로젝트의 node_modules 에
// 닿지 않는다 — cwd 를 해석 기준에 넣어야 찾는다.
function requirePuppeteer() {
  for (const paths of [[process.cwd()], undefined]) {
    try {
      return require(paths ? require.resolve('puppeteer-core', { paths }) : 'puppeteer-core');
    } catch {
      // 다음 해석 경로 시도
    }
  }
  const err = new Error(
    'puppeteer-core 가 없습니다. 소비 프로젝트 루트에서 설치하고 그 디렉토리에서 실행하세요:\n' +
      '  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 npm install puppeteer-core --no-save'
  );
  err.code = 'ENOPUPPETEER';
  throw err;
}

async function launch() {
  const puppeteer = requirePuppeteer();
  const executablePath = findChromium();
  if (!executablePath) {
    const err = new Error(
      'Chromium 실행 파일을 찾지 못했습니다. CHROME_PATH 로 경로를 지정하세요.'
    );
    err.code = 'ENOCHROME';
    throw err;
  }

  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-certificate-errors',
    '--ignore-ssl-errors',
    '--disable-web-security',
    // TLS 를 재종단하는 MITM 프록시 뒤에서는 Chromium(TLS 1.3)의 대형 ClientHello
    // (post-quantum key share, ~1.7KB)가 RST 되어 net::ERR_CONNECTION_RESET 이 난다.
    // 1.2 로 상한을 두면 ClientHello 가 작아져 curl 과 동일하게 핸드셰이크된다.
    '--ssl-version-max=tls1.2',
  ];
  if (proxy) args.push(`--proxy-server=${proxy}`);

  const browser = await puppeteer.launch({ executablePath, headless: true, args });
  return { browser, executablePath };
}

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 1600 });
  return page;
}

// 진입 대기 조건. 기본은 networkidle2 지만, 애널리틱스·폴링·웹소켓으로 연결을 계속
// 유지하는 사이트는 렌더가 끝났는데도 idle 에 도달하지 못해 타임아웃한다. 렌더 대기는
// waitFor 셀렉터가 따로 받으므로 대상별로 진입 조건만 느슨하게 열 수 있게 한다.
const GOTO_WAIT_UNTIL = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'];

function resolveGoto(cfg, defaults) {
  const o = (cfg && cfg.goto) || {};
  return {
    waitUntil: o.waitUntil || defaults.waitUntil,
    timeout: Number.isFinite(o.timeout) ? o.timeout : defaults.timeout,
  };
}

// 실패 사유에 적용된 대기 조건을 남긴다. 없으면 타임아웃 메시지만 보고 사이트가 느린
// 것인지 조건이 안 맞는 것인지 구분할 수 없다.
async function gotoWith(page, url, opts) {
  try {
    await page.goto(url, opts);
  } catch (e) {
    e.message = `${e.message} [waitUntil=${opts.waitUntil}, timeout=${opts.timeout}ms]`;
    throw e;
  }
}

module.exports = {
  findChromium,
  launch,
  newPage,
  resolveGoto,
  gotoWith,
  GOTO_WAIT_UNTIL,
  USER_AGENT,
};
