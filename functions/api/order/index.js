// 선생님 쪽.
// GET               → 받는 중인 조사 목록 [{id, title}] (제목만, 항목은 비밀번호 뒤)
// POST {s, action, nick, token} + 헤더 X-Code(그 조사의 선생님 비밀번호)
//   get    → 조사 내용, 내가 낸 주문
//   submit → 주문 저장(같은 닉네임·같은 기기면 덮어쓰기)
//   cancel → 내 주문 취소
import { json } from '../../../lib/auth.js';
import { getSurvey, orderKey, normNick, pubOrder, pubSurvey, listKeys, optsFor } from '../../../lib/order.js';

export async function onRequestGet({ env }) {
  if (!env.ORDERS) return json({ ok: false, error: 'not-configured' }, 500);
  const names = await listKeys(env, 's:');
  const all = (await Promise.all(names.map(n => env.ORDERS.get(n, 'json')))).filter(Boolean);
  const surveys = all.filter(s => s.open).sort((a, b) => b.at - a.at).map(s => ({ id: s.id, title: s.title }));
  return json({ ok: true, surveys });
}

function cleanItems(items, survey) {
  if (!Array.isArray(items) || !items.length || items.length > 50) return null;
  const byName = new Map(survey.items.map(x => [x.name, x]));
  const out = [];
  for (const it of items) {
    const m = byName.get(String(it?.name || ''));
    const qty = Math.floor(Number(it?.qty));
    if (!m || m.hide || !(qty >= 1 && qty <= 20)) return null; // 가린 항목은 받지 않는다
    let temp = '';
    if (m.temp === 'both') temp = it?.temp === 'hot' ? 'hot' : 'ice';
    else if (m.temp === 'ice' || m.temp === 'hot') temp = m.temp;
    // 옵션: 이 항목에 보이는 묶음만, 없는 선택지는 기본값으로. 기본값이 아닌 것만 저장한다.
    const given = it?.opts && typeof it.opts === 'object' ? it.opts : {};
    const opts = [];
    let extra = 0;
    for (const g of optsFor(survey, m, temp)) {
      const c = g.choices.find(x => x.name === given[g.name]) || g.choices[0];
      extra += c.price;
      if (c !== g.choices[0]) opts.push({ g: g.name, c: c.name, p: c.price });
    }
    out.push({ name: m.name, temp, qty, price: m.price + extra, opts }); // 이름·가격은 조사에 있는 값으로
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  if (!env.ORDERS) return json({ ok: false, error: 'not-configured' }, 500);
  let b = {};
  try { b = await request.json(); } catch {}
  const survey = await getSurvey(env, b.s);
  if (!survey) return json({ ok: false, error: 'no-survey' }, 404);
  if ((request.headers.get('X-Code') || '').trim().toLowerCase() !== survey.code) {
    await new Promise(r => setTimeout(r, 400));
    return json({ ok: false, error: 'code' }, 401);
  }
  const nick = normNick(b.nick);
  const token = String(b.token || '').slice(0, 64);
  const key = nick ? orderKey(survey.id, nick) : '';
  const cur = nick ? await env.ORDERS.get(key, 'json') : null;
  const taken = !!cur && cur.token !== token;

  if (b.action === 'get') {
    return json({ ok: true, survey: pubSurvey(survey), taken, mine: cur && !taken ? pubOrder(cur) : null });
  }
  if (!nick || token.length < 8) return json({ ok: false, error: 'bad' }, 400);
  if (taken) return json({ ok: false, error: 'taken' }, 409);
  if (!survey.open) return json({ ok: false, error: 'closed' }, 403);

  if (b.action === 'submit') {
    const items = cleanItems(b.items, survey);
    if (!items) return json({ ok: false, error: 'bad' }, 400);
    const n = items.reduce((s, x) => s + x.qty, 0);
    if (survey.limit > 0 && n > survey.limit) return json({ ok: false, error: 'limit', limit: survey.limit }, 400);
    const won = items.reduce((s, x) => s + x.qty * x.price, 0);
    if (survey.maxWon > 0 && won > survey.maxWon) return json({ ok: false, error: 'maxWon', maxWon: survey.maxWon }, 400);
    const o = { nick, token, items, memo: String(b.memo || '').trim().slice(0, 100), at: Date.now() };
    await env.ORDERS.put(key, JSON.stringify(o));
    return json({ ok: true, mine: pubOrder(o) });
  }
  if (b.action === 'cancel') {
    if (cur) await env.ORDERS.delete(key);
    return json({ ok: true });
  }
  return json({ ok: false, error: 'bad' }, 400);
}
