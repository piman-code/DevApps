// 우지커피 주문: 선생님 쪽. POST {action, nick, token, ...}
//  get    → 설정(마감·개수 제한)과 내가 낸 주문
//  submit → 주문 저장(같은 닉네임·같은 기기면 덮어쓰기)
//  cancel → 내 주문 취소
// 닉네임은 처음 제출한 기기(token)만 고치거나 취소할 수 있다. 관리자는 /api/oozy/admin에서 모두 지울 수 있다.
import { json } from '../../../lib/auth.js';
import { okCode, settingsOf, normNick, orderKey, pub } from '../../../lib/oozy.js';

function cleanItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 30) return null;
  const out = [];
  for (const it of items) {
    const name = String(it?.name || '').trim().slice(0, 40);
    const qty = Math.floor(Number(it?.qty));
    const price = Math.floor(Number(it?.price));
    const temp = it?.temp === 'ice' || it?.temp === 'hot' ? it.temp : '';
    if (!name || !(qty >= 1 && qty <= 20) || !(price >= 0 && price <= 100000)) return null;
    out.push({ name, temp, qty, price });
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  if (!env.OOZY) return json({ ok: false, error: 'not-configured' }, 500);
  if (!okCode(request)) {
    await new Promise(r => setTimeout(r, 400));
    return json({ ok: false, error: 'code' }, 401);
  }
  let b = {};
  try { b = await request.json(); } catch {}
  const nick = normNick(b.nick);
  const token = String(b.token || '').slice(0, 64);
  const settings = await settingsOf(env);
  const cur = nick ? await env.OOZY.get(orderKey(nick), 'json') : null;
  const taken = !!cur && cur.token !== token;

  if (b.action === 'get') {
    return json({ ok: true, ...settings, taken, mine: cur && !taken ? pub(cur) : null });
  }
  if (!nick || token.length < 8) return json({ ok: false, error: 'bad' }, 400);
  if (taken) return json({ ok: false, error: 'taken' }, 409);
  if (!settings.open) return json({ ok: false, error: 'closed' }, 403);

  if (b.action === 'submit') {
    const items = cleanItems(b.items);
    if (!items) return json({ ok: false, error: 'bad' }, 400);
    const n = items.reduce((s, x) => s + x.qty, 0);
    if (settings.limit > 0 && n > settings.limit) return json({ ok: false, error: 'limit', limit: settings.limit }, 400);
    const o = { nick, token, items, memo: String(b.memo || '').trim().slice(0, 100), at: Date.now() };
    await env.OOZY.put(orderKey(nick), JSON.stringify(o));
    return json({ ok: true, mine: pub(o) });
  }
  if (b.action === 'cancel') {
    if (cur) await env.OOZY.delete(orderKey(nick));
    return json({ ok: true });
  }
  return json({ ok: false, error: 'bad' }, 400);
}
