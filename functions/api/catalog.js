// 앱 카드 내용 + 내려받기 링크(전용 대문의 「앱 관리」 화면 /private/apps-admin.html 이 부른다). **관리자만.**
// GET : 관리자 쿠키(ak)가 있어야 한다. 없으면 401(링크가 들어 있으므로 공개하지 않는다).
//       { ok, apps: [...]|null, updated, links: {...}, source: { apps: 'saved'|'file', links: 'saved'|'env' }, updated_at, hasPrev }
//       apps가 null이면 화면이 site/apps.json을 쓴다. links는 저장본이 없으면 비밀 변수 LINKS를 풀어 준 값.
// PUT : 관리자 + 같은 출처. 본문 { apps: [...], links: {...} } 로 둘 다 바꾼다(각각 직전 값 보관).
//       본문 { restore: true } 는 둘을 함께 직전 값으로 되돌린다(맞바꿈).
// 공개 대문은 /api/home 에서 앱 내용만 받고, 링크는 /api/get(다운로드 잠금) 뒤에서만 나간다.
import { isAdmin, sameOrigin, json } from '../../lib/auth.js';
import {
  KV_APPS, KV_APPS_PREV, KV_LINKS, KV_LINKS_PREV, MAX_BODY, NONE,
  sanitizeCatalog, readApps, readLinks, appsOf, linksOf, envLinks, today,
} from '../../lib/catalog.js';

const view = (env, a, l, hasPrev) => ({
  ok: true,
  apps: appsOf(a),
  updated: a && !a.none ? a.updated || null : null,
  links: linksOf(l) || envLinks(env),
  source: { apps: appsOf(a) ? 'saved' : 'file', links: linksOf(l) ? 'saved' : 'env' },
  updated_at: a && !a.none ? a.updated_at || null : null,
  hasPrev,
});

async function guard(request, env, write) {
  if (write && !sameOrigin(request)) return json({ ok: false, error: 'bad-origin' }, 403);
  if (!(await isAdmin(request, env))) {
    await new Promise(r => setTimeout(r, 600));
    return json({ ok: false, error: 'locked' }, 401);
  }
  if (!env.ORDERS) return json({ ok: false, error: 'not-configured' }, 500);
  return null;
}

export async function onRequestGet({ request, env }) {
  const no = await guard(request, env, false);
  if (no) return no;
  try {
    const [a, l, p] = await Promise.all([readApps(env), readLinks(env), readApps(env, KV_APPS_PREV)]);
    return json(view(env, a, l, !!p));
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  const no = await guard(request, env, true);
  if (no) return no;
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY * 4) return json({ ok: false, error: 'too-large' }, 413);
  let raw = '';
  try { raw = await request.text(); } catch {}
  if (!raw || raw.length > MAX_BODY) return json({ ok: false, error: 'bad-request' }, 400);
  let body = null;
  try { body = JSON.parse(raw); } catch {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'bad-request' }, 400);

  const restore = body.restore === true;
  let clean = null;
  if (!restore) {
    const r = sanitizeCatalog(body);
    // detail은 관리자에게만 가는 설명이다(이 줄에 오려면 이미 관리자 쿠키를 통과했다).
    if (!r.ok) return json({ ok: false, error: 'bad-request', detail: r.error, at: r.at }, 400);
    clean = r.value;
  }

  let curA, curL, prevA, prevL;
  try {
    [curA, curL] = await Promise.all([readApps(env), readLinks(env)]);
    if (restore) [prevA, prevL] = await Promise.all([readApps(env, KV_APPS_PREV), readLinks(env, KV_LINKS_PREV)]);
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }

  const put = (key, value) => env.ORDERS.put(key, JSON.stringify(value));
  try {
    if (restore) {
      if (!prevA) return json({ ok: false, error: 'no-previous' }, 404);
      const backL = prevL || NONE;
      // 직전 값을 지금 값으로 올리고, 지금 값을 직전 자리에 둔다(한 번 더 누르면 돌아온다).
      await put(KV_APPS, prevA); await put(KV_LINKS, backL);
      await put(KV_APPS_PREV, curA || NONE); await put(KV_LINKS_PREV, curL || NONE);
      return json(view(env, prevA, backL, true));
    }
    const now = new Date().toISOString();
    const a = { v: 1, updated_at: now, updated: today(), apps: clean.apps };
    const l = { v: 1, updated_at: now, links: clean.links };
    // 처음 저장이면 직전 값으로 "저장본 없음"을 남겨, 「직전 저장으로」가 apps.json·LINKS로 돌아가게 한다.
    await put(KV_APPS_PREV, curA || NONE); await put(KV_LINKS_PREV, curL || NONE);
    await put(KV_APPS, a); await put(KV_LINKS, l);
    return json(view(env, a, l, true));
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}
