// 공개 대문 앱 카드의 "순서와 숨김" 저장(functions/api/home.js가 쓴다).
// 저장소: KV 바인딩 ORDERS의 키 'home-v1'(지금 값)과 'home-v1-prev'(저장 직전 값).
//   주문 앱은 같은 KV에서 's:'·'o:' 접두어만 쓰므로 겹치지 않는다.
// 저장하는 것은 앱 id 목록뿐이다: { v: 1, updated_at, order: [id…], hidden: [id…] }.
// 앱 이름·내용은 계속 site/apps.json이 정본이고, 화면이 site/arrange.js로 이 순서를 덧씌운다.

export const KV_KEY = 'home-v1';
export const KV_PREV = 'home-v1-prev';
export const MAX_ITEMS = 100;
export const MAX_BODY = 20000; // 글자 수. id 100개가 두 번 들어가도 1만 자가 안 된다.
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

// 형식이 조금이라도 틀리면 null(조용히 고쳐서 받지 않는다).
// order: 화면 순서대로 적은 앱 id 전부. hidden: 그중 대문에서 뺄 id. 전부 숨길 수는 없다.
export function sanitize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { order, hidden = [] } = body;
  if (!Array.isArray(order) || !order.length || order.length > MAX_ITEMS || !Array.isArray(hidden)) return null;
  const seen = new Set();
  for (const id of order) {
    if (typeof id !== 'string' || !ID.test(id) || seen.has(id)) return null;
    seen.add(id);
  }
  const hid = new Set();
  for (const id of hidden) {
    if (typeof id !== 'string' || !seen.has(id) || hid.has(id)) return null;
    hid.add(id);
  }
  if (hid.size >= seen.size) return null;
  return { order: [...order], hidden: order.filter(id => hid.has(id)) };
}

// 저장한 적이 없으면 null. KV를 못 읽으면 던진다(못 읽은 것을 "없음"으로 알고 덮어쓰지 않게).
export async function read(env, key) {
  const v = await env.ORDERS.get(key, 'json');
  return v && Array.isArray(v.order) && Array.isArray(v.hidden) ? v : null;
}
