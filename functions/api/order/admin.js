// 담당자 쪽. 파이맨 전용 쿠키(ak, ADMIN_KEY)가 있어야 한다.
// GET           → 조사 목록(제출 수 포함)
// GET ?s=<id>   → 조사 하나(비밀번호 포함)와 주문 전체
// POST {action}
//   create {survey}           → 새 조사
//   update {s, survey}        → 조사 고치기(제목·비밀번호·항목·제한·마감)
//   setOpen {s, open}         → 받기/마감만 바꾸기
//   remove {s}                → 조사와 주문 모두 지우기
//   delOrder {s, nick}        → 한 사람 주문 지우기
//   resetOrders {s}           → 그 조사의 주문 모두 지우기
import { isAdmin, json } from '../../../lib/auth.js';
import { cleanSurvey, getSurvey, surveyKey, orderPrefix, orderKey, pubOrder, listKeys, newId, validId } from '../../../lib/order.js';

async function list(env) {
  const names = await listKeys(env, 's:');
  const all = (await Promise.all(names.map(n => env.ORDERS.get(n, 'json')))).filter(Boolean);
  const surveys = await Promise.all(all.sort((a, b) => b.at - a.at).map(async s => ({
    id: s.id, title: s.title, open: s.open, items: s.items.length, at: s.at,
    orders: (await listKeys(env, orderPrefix(s.id))).length,
  })));
  return { ok: true, surveys };
}

async function detail(env, id) {
  const survey = await getSurvey(env, id);
  if (!survey) return null;
  const names = await listKeys(env, orderPrefix(id));
  const orders = (await Promise.all(names.map(n => env.ORDERS.get(n, 'json'))))
    .filter(Boolean).map(pubOrder).sort((a, b) => a.at - b.at);
  return { ok: true, survey, orders };
}

async function guard(request, env) {
  if (!(await isAdmin(request, env))) return json({ ok: false }, 401);
  if (!env.ORDERS) return json({ ok: false, error: 'not-configured' }, 500);
  return null;
}

export async function onRequestGet({ request, env }) {
  const no = await guard(request, env);
  if (no) return no;
  const id = new URL(request.url).searchParams.get('s');
  if (!id) return json(await list(env));
  const d = await detail(env, id);
  return d ? json(d) : json({ ok: false, error: 'no-survey' }, 404);
}

export async function onRequestPost({ request, env }) {
  const no = await guard(request, env);
  if (no) return no;
  let b = {};
  try { b = await request.json(); } catch {}
  const put = s => env.ORDERS.put(surveyKey(s.id), JSON.stringify(s));

  if (b.action === 'create') {
    const c = cleanSurvey(b.survey || {});
    if (c.error) return json({ ok: false, error: c.error }, 400);
    let id = newId();
    while (await getSurvey(env, id)) id = newId();
    const s = { id, ...c.survey, at: Date.now() };
    await put(s);
    return json(await detail(env, id));
  }

  if (!validId(b.s)) return json({ ok: false, error: 'no-survey' }, 404);
  const cur = await getSurvey(env, b.s);
  if (!cur) return json({ ok: false, error: 'no-survey' }, 404);

  if (b.action === 'update') {
    const c = cleanSurvey(b.survey || {});
    if (c.error) return json({ ok: false, error: c.error }, 400);
    await put({ ...cur, ...c.survey });
  } else if (b.action === 'setOpen') {
    await put({ ...cur, open: !!b.open });
  } else if (b.action === 'remove') {
    await Promise.all((await listKeys(env, orderPrefix(cur.id))).map(n => env.ORDERS.delete(n)));
    await env.ORDERS.delete(surveyKey(cur.id));
    return json(await list(env));
  } else if (b.action === 'delOrder') {
    await env.ORDERS.delete(orderKey(cur.id, String(b.nick || '')));
  } else if (b.action === 'resetOrders') {
    await Promise.all((await listKeys(env, orderPrefix(cur.id))).map(n => env.ORDERS.delete(n)));
  } else {
    return json({ ok: false, error: 'bad' }, 400);
  }
  return json(await detail(env, cur.id));
}
