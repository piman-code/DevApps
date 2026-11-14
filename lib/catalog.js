// 앱 카드 내용과 내려받기 링크를 전용 대문의 「앱 관리」 화면에서 고친 저장본. 배포 없이 반영된다.
// 저장소: KV 바인딩 ORDERS(주문 앱은 's:'·'o:' 접두어만 쓰므로 겹치지 않는다).
//   'apps-v1'  / 'apps-v1-prev'   { v, updated_at, updated: 'YYYY-MM-DD', apps: [...] }   공개 대문에 보이는 내용
//   'links-v1' / 'links-v1-prev'  { v, updated_at, links: { 'blur:mac': 'https://…', folder: 'https://…' } }
// **링크는 다른 키에 둔다.** 공개 응답을 만드는 코드(functions/api/home.js)는 links-v1을 아예 읽지 않는다.
// 링크를 읽는 곳은 둘뿐이다: functions/api/get.js(다운로드 잠금을 푼 사람에게 302)와 functions/api/catalog.js(관리자).
// 저장본이 없으면 지금까지처럼 site/apps.json과 비밀 변수 LINKS를 쓴다. { v: 1, none: true }는 "저장본 없음"을 뜻하는 표시로,
// 처음 저장을 「직전 저장으로」 되돌릴 때 쓴다.
export { sanitizeCatalog, sanitizeApps, sanitizeLinks, httpsUrl } from '../site/private/catalog-rules.js';

export const KV_APPS = 'apps-v1';
export const KV_APPS_PREV = 'apps-v1-prev';
export const KV_LINKS = 'links-v1';
export const KV_LINKS_PREV = 'links-v1-prev';
export const MAX_BODY = 400000; // 글자 수. 지금 apps.json은 8천 자 안팎.
export const NONE = { v: 1, none: true };

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);

// 저장한 적이 없으면 null. KV를 못 읽으면 던진다. "저장본 없음" 표시는 그대로 돌려준다(appsOf/linksOf가 null로 풀어 준다).
export async function readApps(env, key = KV_APPS) {
  const v = await env.ORDERS.get(key, 'json');
  return plain(v) && (v.none === true || (Array.isArray(v.apps) && v.apps.length)) ? v : null;
}
export async function readLinks(env, key = KV_LINKS) {
  const v = await env.ORDERS.get(key, 'json');
  return plain(v) && (v.none === true || plain(v.links)) ? v : null;
}
export const appsOf = v => (v && !v.none ? v.apps : null);
export const linksOf = v => (v && !v.none ? v.links : null);

// 비밀 변수 LINKS(JSON)를 풀어 글자 값만 남긴다. 저장본이 없을 때의 기본값.
export function envLinks(env) {
  let raw = {};
  try { raw = JSON.parse(env.LINKS || '{}'); } catch {}
  const out = {};
  if (plain(raw)) for (const k of Object.keys(raw)) if (typeof raw[k] === 'string') out[k] = raw[k];
  return out;
}

// 저장한 날(한국 시간) 'YYYY-MM-DD': 공개 대문의 "마지막 업데이트"
export function today(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
