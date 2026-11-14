// 앱 카드 내용과 내려받기 링크의 검사 규칙. 서버(functions/api/catalog.js → lib/catalog.js)와
// 화면(site/private/apps-admin.html)이 **같은 파일**을 쓴다(화면 검사와 서버 검사가 어긋나지 않게).
// 틀린 값은 고쳐서 받지 않고 거절한다: { ok: false, error: '사람이 읽을 설명', at: 앱 순번(없으면 -1) }.
// 맞으면 { ok: true, value }. value에는 아는 칸만 정해진 순서로 담는다(모르는 칸은 버린다).
// 검사는 test/catalog.test.mjs (node --test).

export const MAX_APPS = 100;
export const MAX_LINKS = 300;
export const ID = /^[a-z0-9][a-z0-9-]{0,39}$/; // lib/home.js(순서·숨김)와 같은 규칙
export const OSES = ['windows', 'mac'];
export const FOLDER = 'folder';
export const LIMITS = { name: 60, symbol: 4, category: 20, summary: 200, requirements: 500, start: 300, feature: 120, features: 8, version: 20, size: 20, url: 500 };

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = (error, at = -1) => ({ ok: false, error, at });

// 한 줄 글자: 앞뒤 공백을 떼고, 줄바꿈·제어 문자가 있거나 너무 길면 null. 비어 있으면 optional일 때만 ''.
function text(v, max, optional = false) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return null;
  const s = v.trim();
  // 줄바꿈·제어 문자, 그리고 글자 방향을 뒤집거나 보이지 않는 글자(표시만 어지럽히는 것)는 받지 않는다. 이모지를 잇는 U+200D는 둔다.
  if (/[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/.test(s)) return null;
  if (!s) return optional ? '' : null;
  return [...s].length > max ? null : s;
}

// https:// 로 시작하는 주소만(javascript: 같은 주소가 단추 링크가 되지 않게).
// 영문·숫자·기호(ASCII)만 받는다: 공백·따옴표·꺾쇠·역슬래시·한글 주소는 안 된다(한글이 든 주소는 302 Location 헤더로
// 보낼 수 없다. 드라이브 공유 링크는 모두 ASCII다). 'https://이름:암호@…' 꼴도 받지 않는다.
export function httpsUrl(v) {
  if (typeof v !== 'string' || v.length > LIMITS.url || !/^https:\/\/[\x21-\x7e]+$/.test(v) || /["'<>\\`]/.test(v)) return null;
  try { const u = new URL(v); return u.protocol === 'https:' && u.hostname && !u.username && !u.password ? v : null; } catch { return null; }
}

// 바로 열기 주소: https 주소이거나 이 사이트 안 경로('/order/' 꼴. '//다른곳'은 안 됨).
function webUrl(v) {
  if (typeof v !== 'string' || !v) return null;
  if (/^\/(?!\/)[A-Za-z0-9/_.-]{0,200}$/.test(v) && !v.includes('..')) return v;
  return httpsUrl(v);
}

function build(v, label) {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (!plain(v)) return fail(`${label} 정보의 모양이 맞지 않습니다.`);
  const version = text(v.version, LIMITS.version), size = text(v.size, LIMITS.size);
  if (version === null) return fail(`${label} 버전을 ${LIMITS.version}자 안으로 적어 주세요.`);
  if (size === null) return fail(`${label} 크기를 ${LIMITS.size}자 안으로 적어 주세요(예: 131MB).`);
  const out = { version, size };
  if (v.sha256 !== undefined && v.sha256 !== null && v.sha256 !== '') {
    if (typeof v.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(v.sha256)) return fail(`${label} 확인값(SHA256)은 0-9·a-f 64자입니다.`);
    out.sha256 = v.sha256;
  }
  const start = text(v.start, LIMITS.start, true);
  if (start === null) return fail(`${label} 실행 방법을 ${LIMITS.start}자 안으로, 한 줄로 적어 주세요.`);
  if (start) out.start = start;
  return { ok: true, value: out };
}

// 앱 목록 전체. 배열 순서 = 파일 순서(화면 순서는 순서·숨김 저장이 따로 정한다).
export function sanitizeApps(list) {
  if (!Array.isArray(list) || !list.length) return fail('앱이 하나도 없습니다. 하나 이상 있어야 합니다.');
  if (list.length > MAX_APPS) return fail(`앱은 ${MAX_APPS}개까지입니다.`);
  const seen = new Set(), apps = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i], bad = m => fail(m, i);
    if (!plain(a)) return bad('앱 정보의 모양이 맞지 않습니다.');
    if (typeof a.id !== 'string' || !ID.test(a.id)) return bad('앱 id는 영문 소문자·숫자·- 만, 40자까지입니다(첫 글자는 영문 소문자나 숫자).');
    // /api/get?app=folder 는 전체 파일 폴더 링크로 가므로 앱 id로는 쓸 수 없다
    if (a.id === FOLDER) return bad(`앱 id로 "${FOLDER}"는 쓸 수 없습니다(전체 파일 폴더 링크의 이름입니다).`);
    if (seen.has(a.id)) return bad(`앱 id "${a.id}"가 두 번 있습니다.`);
    seen.add(a.id);
    const name = text(a.name, LIMITS.name), symbol = text(a.symbol, LIMITS.symbol), category = text(a.category, LIMITS.category), summary = text(a.summary, LIMITS.summary);
    if (name === null) return bad(`이름을 ${LIMITS.name}자 안으로 적어 주세요.`);
    if (symbol === null) return bad(`기호를 ${LIMITS.symbol}자 안으로 적어 주세요(예: ☕).`);
    if (typeof a.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a.color)) return bad('색은 #rrggbb 꼴입니다(예: #2f6fde).');
    if (category === null) return bad(`분류를 ${LIMITS.category}자 안으로 적어 주세요.`);
    if (summary === null) return bad(`한 줄 설명을 ${LIMITS.summary}자 안으로 적어 주세요.`);
    const rawFeatures = a.features === undefined || a.features === null ? [] : a.features;
    if (!Array.isArray(rawFeatures) || rawFeatures.length > LIMITS.features) return bad(`기능은 ${LIMITS.features}줄까지입니다.`);
    const features = [];
    for (const f of rawFeatures) {
      const t = text(f, LIMITS.feature);
      if (t === null) return bad(`기능은 한 줄에 ${LIMITS.feature}자까지이고, 빈 줄은 넣을 수 없습니다.`);
      features.push(t);
    }
    const requirements = text(a.requirements, LIMITS.requirements, true), start = text(a.start, LIMITS.start, true);
    if (requirements === null) return bad(`필요한 것을 ${LIMITS.requirements}자 안으로, 한 줄로 적어 주세요.`);
    if (start === null) return bad(`실행 방법을 ${LIMITS.start}자 안으로, 한 줄로 적어 주세요.`);
    const out = { id: a.id, name, symbol, color: a.color.toLowerCase(), category, summary, features, requirements, start };
    if (a.web !== undefined && a.web !== null && a.web !== '') {
      const web = webUrl(a.web);
      if (!web) return bad('바로 열기 주소는 https:// 로 시작하거나 /order/ 같은 이 사이트 안 경로여야 합니다.');
      out.web = web;
    }
    for (const os of OSES) {
      const b = build(a[os], os === 'mac' ? 'Mac' : 'Windows');
      if (!b.ok) return bad(b.error);
      out[os] = b.value;
    }
    apps.push(out);
  }
  return { ok: true, value: apps };
}

// 내려받기 링크. 키는 '<앱 id>:windows|mac' 또는 'folder', 앱 id는 ids(보낸 앱 목록의 id)에 있는 것만. 값은 https 주소만.
export function sanitizeLinks(links, ids) {
  if (!plain(links)) return fail('링크의 모양이 맞지 않습니다.');
  const keys = Object.keys(links), known = new Set(ids), out = {};
  if (keys.length > MAX_LINKS) return fail(`링크는 ${MAX_LINKS}개까지입니다.`);
  for (const key of keys) {
    if (key !== FOLDER) {
      const cut = key.lastIndexOf(':'), id = key.slice(0, cut), os = key.slice(cut + 1);
      if (cut < 1 || !OSES.includes(os) || !ID.test(id)) return fail(`링크 이름 "${key}"이(가) 맞지 않습니다.`);
      if (!known.has(id)) return fail(`"${id}" 앱이 목록에 없는데 그 링크가 있습니다.`);
    }
    const url = httpsUrl(links[key]);
    if (!url) return fail(`${key === FOLDER ? '전체 파일 폴더' : key} 링크는 https:// 로 시작하는 주소여야 합니다(공백·따옴표 없이, ${LIMITS.url}자까지).`, key === FOLDER ? -1 : ids.indexOf(key.slice(0, key.lastIndexOf(':'))));
    out[key] = url;
  }
  return { ok: true, value: out };
}

// 한 번에: { apps, links } → { ok, value: { apps, links } }
export function sanitizeCatalog(body) {
  if (!plain(body) || !own(body, 'apps') || !own(body, 'links')) return fail('보낸 내용의 모양이 맞지 않습니다.');
  const a = sanitizeApps(body.apps);
  if (!a.ok) return a;
  const l = sanitizeLinks(body.links, a.value.map(x => x.id));
  if (!l.ok) return l;
  return { ok: true, value: { apps: a.value, links: l.value } };
}
