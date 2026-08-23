// 목록 획득 방법 — DOM 추출 대신 프로파일이 선언한 경로로 목록을 받는다.
//
// 목록이 DOM 에 없는 대상이 있다. 페이지는 정적 자리표시자만 갖고 실제 목록은 XHR 응답으로만
// 존재한다. 이때 DOM selector 는 아무것도 잡지 못하고 링크 heuristic 이 푸터 링크를 잡아
// 0건 실패가 소수 건수로 보고된다.
//
// 판정 기준을 엔진이 갖지 않는 것과 같은 이유로, 어느 경로가 목록인지도 엔진이 알 수 없다.
// 대상마다 다르므로 프로파일이 선언한다. 선언이 없으면 기존 DOM 경로를 그대로 쓴다.
//
// 선언 형식 (targets[].list):
//   {
//     "method": "POST",
//     "endpoint": "https://.../searchList.fo",
//     "form": { "pageIndex": "300" },
//     "itemsPath": "ds_newRecruitList",
//     "title": "zz_title",
//     "detailUrl": "https://.../detail.fo?id={zz_jo_num}",
//     "openWhen": { "zz_close_yn": "N" }
//   }

// 점 표기 경로로 중첩 값을 꺼낸다. 미지정이면 응답 자체가 배열이라고 본다.
function atPath(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// {필드} 자리를 항목 값으로 채운다. 채우지 못한 자리가 남으면 URL 을 만들지 않는다 —
// 깨진 URL 을 돌려주면 상세 확인이 실패하고 그 실패가 대상 전체로 번진다.
function fillTemplate(tpl, item) {
  let missing = false;
  const url = tpl.replace(/\{([^}]+)\}/g, (_, key) => {
    const v = item[key];
    if (v == null || v === '') { missing = true; return ''; }
    return encodeURIComponent(String(v));
  });
  return missing ? null : url;
}

function isOpen(item, openWhen) {
  if (!openWhen) return true;
  return Object.entries(openWhen).every(([k, v]) => String(item[k]) === String(v));
}

// 페이지 컨텍스트에서 요청한다. 쿠키·세션·리퍼러가 브라우저에 있으므로 밖에서 부르면
// 인증이 필요한 대상에서 빈 응답을 받는다.
async function fetchList(page, decl) {
  const method = (decl.method || 'GET').toUpperCase();
  return page.evaluate(
    async (endpoint, m, form) => {
      const opts = { method: m, credentials: 'include' };
      if (m !== 'GET' && form) {
        opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        opts.body = new URLSearchParams(form).toString();
      }
      const res = await fetch(endpoint, opts);
      const text = await res.text();
      try {
        return { ok: res.ok, status: res.status, json: JSON.parse(text) };
      } catch {
        return { ok: false, status: res.status, json: null, snippet: text.slice(0, 200) };
      }
    },
    decl.endpoint,
    method,
    decl.form || null
  );
}

// 선언된 경로로 목록을 받아 { text, href } 형태로 돌려준다. DOM 추출과 같은 모양이라
// 뒤 단계(dedupe·채점)는 어느 경로로 왔는지 알 필요가 없다.
async function collectFromDeclaration(page, decl) {
  const res = await fetchList(page, decl);
  if (!res.ok || res.json == null) {
    throw new Error(
      `목록 요청 실패 (status ${res.status}${res.snippet ? `, 응답 앞부분: ${res.snippet}` : ''})`
    );
  }

  const rows = atPath(res.json, decl.itemsPath);
  if (!Array.isArray(rows)) {
    throw new Error(`itemsPath "${decl.itemsPath || '(응답 루트)'}" 가 배열이 아닙니다`);
  }

  const items = [];
  let closed = 0;
  for (const row of rows) {
    if (!isOpen(row, decl.openWhen)) { closed++; continue; }
    const title = [decl.title, decl.group]
      .filter(Boolean)
      .map((f) => row[f])
      .filter((v) => v != null && v !== '')
      .join(' · ');
    if (!title) continue;
    items.push({ text: String(title).slice(0, 500), href: decl.detailUrl ? fillTemplate(decl.detailUrl, row) : null });
  }
  return { items, total: rows.length, closed };
}

module.exports = { collectFromDeclaration, atPath, fillTemplate, isOpen };
