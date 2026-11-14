// 공개 대문 앱 카드의 순서·숨김.
// GET : 누구나. 저장한 값이 있으면 { ok: true, order: [id…], hidden: [id…], updated_at }, 없으면 order: null(빈 order도 같은 뜻)
//       (그때는 화면이 site/apps.json 순서를 그대로 쓴다). 못 읽으면 503 — 화면은 이때도 파일 순서를 쓴다.
//       관리자 쿠키가 있으면 hasPrev(되돌릴 직전 값이 있는지)도 준다.
// PUT : 관리자만(쿠키 ak) · 같은 출처만. 본문 { order, hidden } 으로 전체를 바꾼다.
//       저장 직전 값은 home-v1-prev에 남긴다. 본문 { restore: true } 는 그 직전 값으로 되돌린다(두 값을 맞바꿈).
// GET은 「앱 관리」에서 저장한 앱 카드 내용도 같이 준다: apps([...] 또는 저장본이 없으면 null), updated('YYYY-MM-DD').
//       공개 대문에 그대로 보이는 내용이다. **내려받기 링크(links-v1)는 여기서 읽지도 주지도 않는다**(/api/get, /api/catalog만).
import { isAdmin, sameOrigin, json } from '../../lib/auth.js';
import { KV_KEY, KV_PREV, MAX_BODY, sanitize, read } from '../../lib/home.js';
import { readApps, appsOf } from '../../lib/catalog.js';

const view = (v, extra = {}) => ({ ok: true, order: v ? v.order : null, hidden: v ? v.hidden : [], updated_at: v ? v.updated_at || null : null, ...extra });

export async function onRequestGet({ request, env }) {
  if (!env.ORDERS) return json({ ok: false, error: 'not-configured' }, 500);
  const admin = await isAdmin(request, env);
  try {
    const [v, a] = await Promise.all([read(env, KV_KEY), readApps(env)]);
    const apps = { apps: appsOf(a), updated: appsOf(a) ? a.updated || null : null };
    return json(view(v, admin ? { ...apps, hasPrev: !!(await read(env, KV_PREV)) } : apps));
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'bad-origin' }, 403);
  if (!(await isAdmin(request, env))) {
    await new Promise(r => setTimeout(r, 600));
    return json({ ok: false, error: 'locked' }, 401);
  }
  if (!env.ORDERS) return json({ ok: false, error: 'not-configured' }, 500);
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY * 4) return json({ ok: false, error: 'too-large' }, 413);
  let raw = '';
  try { raw = await request.text(); } catch {}
  if (!raw || raw.length > MAX_BODY) return json({ ok: false, error: 'bad-request' }, 400);
  let body = null;
  try { body = JSON.parse(raw); } catch {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'bad-request' }, 400);

  const restore = body.restore === true;
  const clean = restore ? null : sanitize(body);
  if (!restore && !clean) return json({ ok: false, error: 'bad-request' }, 400);

  let cur = null, prev = null;
  try {
    cur = await read(env, KV_KEY);
    if (restore) prev = await read(env, KV_PREV);
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }

  try {
    if (restore) {
      if (!prev) return json({ ok: false, error: 'no-previous' }, 404);
      await env.ORDERS.put(KV_KEY, JSON.stringify(prev));
      // 되돌린 뒤 다시 되돌릴 수 있게 맞바꾼다. 처음 저장을 되돌린 경우(cur 없음)는 직전 값을 그대로 둔다.
      if (cur) await env.ORDERS.put(KV_PREV, JSON.stringify(cur));
      return json(view(prev, { hasPrev: true }));
    }
    const stored = { v: 1, updated_at: new Date().toISOString(), ...clean };
    // 처음 저장이면 직전 값으로 "고친 것 없음"(빈 순서 = apps.json 순서)을 남겨, 「직전 저장으로」가 파일 순서로 돌아가게 한다.
    await env.ORDERS.put(KV_PREV, JSON.stringify(cur || { v: 1, updated_at: null, order: [], hidden: [] }));
    await env.ORDERS.put(KV_KEY, JSON.stringify(stored));
    return json(view(stored, { hasPrev: true }));
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}
