// 다운로드 잠금 열기/닫기.
// GET: 쿠키가 맞으면 열린 상태.
// POST {key}: 비밀키가 맞으면 30일 쿠키를 심는다.
// DELETE: 쿠키를 지운다(다시 잠그기).
import { tokenFor, sameText, isUnlocked, setCookie, clearCookie, json } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  return json({ ok: await isUnlocked(request, env) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DOWNLOAD_KEY) return json({ ok: false, error: 'not-configured' }, 500);
  let key = '';
  try { key = String((await request.json()).key || '').trim().toLowerCase(); } catch {}
  // 키를 직접 비교하지 않고 서명값끼리 비교한다.
  const [given, expected] = await Promise.all([tokenFor(key), tokenFor(env.DOWNLOAD_KEY)]);
  if (!key || !sameText(given, expected)) {
    await new Promise(r => setTimeout(r, 600));
    return json({ ok: false }, 401);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(expected) });
}

export async function onRequestDelete() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}
