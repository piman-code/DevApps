// 파이맨 전용 영역(/private/) 열기/닫기. unlock.js와 같은 구조.
// GET: 쿠키가 맞으면 열린 상태.
// POST {key}: 관리자 키가 맞으면 30일 쿠키를 심는다.
// DELETE: 쿠키를 지운다(다시 잠그기).
import { adminToken, sameText, isAdmin, setAdminCookie, clearAdminCookie, json } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  return json({ ok: await isAdmin(request, env) });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_KEY) return json({ ok: false, error: 'not-configured' }, 500);
  let key = '';
  try { key = String((await request.json()).key || '').trim(); } catch {}
  // 키를 직접 비교하지 않고 서명값끼리 비교한다.
  const [given, expected] = await Promise.all([adminToken(key), adminToken(env.ADMIN_KEY)]);
  if (!key || !sameText(given, expected)) {
    await new Promise(r => setTimeout(r, 600));
    return json({ ok: false }, 401);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': setAdminCookie(expected) });
}

export async function onRequestDelete() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearAdminCookie() });
}
