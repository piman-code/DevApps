// 우지커피 함송점 주문 모으기 공통 함수. functions/api/oozy/ 두 파일이 같이 쓴다.
// 저장소: KV 바인딩 OOZY. 키 'settings' = {open, limit}, 키 'o:<닉네임 소문자>' = 한 사람의 주문.
// 선생님 비밀번호는 개인정보가 없는 단순 입장용이라 여기 그대로 둔다(DevApps 다운로드 키와 무관).

export const TEACHER_CODE = 'oozy';
export const LIMITS = [0, 1, 2, 3, 5]; // 0 = 제한 없음

export const okCode = request =>
  (request.headers.get('X-Oozy-Code') || '').trim().toLowerCase() === TEACHER_CODE;

export async function settingsOf(env) {
  const s = (await env.OOZY.get('settings', 'json')) || {};
  return { open: s.open !== false, limit: LIMITS.includes(s.limit) ? s.limit : 0 };
}

export const normNick = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 20);
export const orderKey = nick => 'o:' + nick.toLowerCase();
export const pub = o => ({ nick: o.nick, items: o.items, memo: o.memo || '', at: o.at });

export async function allKeys(env) {
  const names = [];
  let cursor;
  do {
    const r = await env.OOZY.list({ prefix: 'o:', cursor });
    names.push(...r.keys.map(k => k.name));
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return names;
}
