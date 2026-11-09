// 우지커피 주문: 관리자 쪽. 파이맨 전용 쿠키(ak, ADMIN_KEY)가 있어야 한다.
// GET → 설정과 전체 주문
// POST {action:'settings', open, limit} | {action:'delete', nick} | {action:'reset'} → 바뀐 뒤 상태
import { isAdmin, json } from '../../../lib/auth.js';
import { LIMITS, settingsOf, orderKey, pub, allKeys } from '../../../lib/oozy.js';

async function state(env) {
  const names = await allKeys(env);
  const orders = (await Promise.all(names.map(n => env.OOZY.get(n, 'json'))))
    .filter(Boolean).map(pub).sort((a, b) => a.at - b.at);
  return { ok: true, settings: await settingsOf(env), orders };
}

async function guard(request, env) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (!env.OOZY) return json({ ok: false, error: 'not-configured' }, 500);
  return null;
}

export async function onRequestGet({ request, env }) {
  return (await guard(request, env)) || json(await state(env));
}

export async function onRequestPost({ request, env }) {
  const no = await guard(request, env);
  if (no) return no;
  let b = {};
  try { b = await request.json(); } catch {}
  if (b.action === 'settings') {
    const limit = LIMITS.includes(Number(b.limit)) ? Number(b.limit) : 0;
    await env.OOZY.put('settings', JSON.stringify({ open: !!b.open, limit }));
  } else if (b.action === 'delete') {
    await env.OOZY.delete(orderKey(String(b.nick || '')));
  } else if (b.action === 'reset') {
    await Promise.all((await allKeys(env)).map(n => env.OOZY.delete(n)));
  } else {
    return json({ ok: false, error: 'bad' }, 400);
  }
  return json(await state(env));
}
