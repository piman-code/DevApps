// 선생님 주문·조사 모으기(/order/) 공통 함수. functions/api/order/ 두 파일이 같이 쓴다.
// 저장소: KV 바인딩 ORDERS.
//   's:<id>'           조사 하나 {id, title, desc, code, open, limit, items:[{name, price, cat, temp, img, desc, hide}], at}
//                      hide가 true인 항목은 가린 것: 담당자 화면에만 보이고 선생님 화면에는 내려가지 않는다(매장에 없거나 품절일 때).
//   'o:<id>:<닉네임>'   그 조사에 낸 한 사람의 주문 {nick, token, items:[{name, temp, qty, price}], memo, at}
// 선생님 비밀번호(code)는 조사마다 담당자가 정하는 단순 입장용이라 그대로 저장한다(DevApps 키와 무관).

export const LIMITS = [0, 1, 2, 3, 5];
export const TEMPS = ['none', 'both', 'ice', 'hot'];

export const surveyKey = id => 's:' + id;
export const orderPrefix = id => `o:${id}:`;
export const orderKey = (id, nick) => orderPrefix(id) + nick.toLowerCase();
export const validId = id => /^[a-z0-9]{4,12}$/.test(String(id || ''));
export const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
export const normNick = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 20);
export const pubOrder = o => ({ nick: o.nick, items: o.items, memo: o.memo || '', at: o.at });
export const pubSurvey = s => ({ id: s.id, title: s.title, desc: s.desc, open: s.open, limit: s.limit, items: s.items.filter(x => !x.hide), options: s.options || [] });

const str = (v, n) => String(v ?? '').trim().slice(0, n);

// 담당자가 보낸 조사 내용을 다듬는다. 잘못된 항목은 버리지 않고 거절한다(조용히 사라지면 헷갈리니까).
export function cleanSurvey(b) {
  const title = str(b.title, 60);
  const code = str(b.code, 40).toLowerCase();
  if (!title) return { error: '제목을 써 주세요.' };
  if (!code) return { error: '선생님 비밀번호를 정해 주세요.' };
  if (!Array.isArray(b.items) || !b.items.length) return { error: '항목을 하나 이상 넣어 주세요.' };
  if (b.items.every(it => it?.hide === true)) return { error: '항목을 전부 가릴 수는 없어요. 하나는 보이게 두세요.' };
  if (b.items.length > 300) return { error: '항목은 300개까지예요.' };
  const items = [], seen = new Set();
  for (const [i, it] of b.items.entries()) {
    const name = str(it?.name, 60);
    if (!name) return { error: `${i + 1}번째 항목에 이름이 없어요.` };
    if (seen.has(name)) return { error: `"${name}" 항목이 두 번 있어요.` };
    seen.add(name);
    const price = Math.floor(Number(it?.price || 0));
    if (!(price >= 0 && price <= 1000000)) return { error: `"${name}" 가격을 확인해 주세요.` };
    const img = str(it?.img, 500);
    if (img && !/^https:\/\/[^\s"'<>]+$/.test(img)) return { error: `"${name}" 사진 주소는 https://로 시작해야 해요.` };
    items.push({ name, price, cat: str(it?.cat, 20), temp: TEMPS.includes(it?.temp) ? it.temp : 'none', img, desc: str(it?.desc, 200), hide: it?.hide === true });
  }
  // 옵션 묶음: {name:'얼음', choices:[{name:'보통',price:0},{name:'적게',price:0}], cats:['커피'], when:'always'|'ice'|'hot'}
  // 첫 선택지가 기본값. cats가 비면 모든 항목, when은 아이스/핫을 고른 경우에만 보이게.
  const options = [];
  const rawOpts = b.options == null ? [] : b.options;
  if (!Array.isArray(rawOpts) || rawOpts.length > 20) return { error: '옵션은 20개까지예요.' };
  for (const [i, g] of rawOpts.entries()) {
    const name = str(g?.name, 20);
    if (!name) return { error: `${i + 1}번째 옵션에 이름이 없어요.` };
    if (options.some(o => o.name === name)) return { error: `"${name}" 옵션이 두 번 있어요.` };
    const raw = Array.isArray(g?.choices) ? g.choices : [];
    if (raw.length < 2 || raw.length > 10) return { error: `"${name}" 옵션은 선택지가 2~10개여야 해요(첫 번째가 기본값).` };
    const choices = [];
    for (const c of raw) {
      const cn = str(c?.name, 20);
      const cp = Math.floor(Number(c?.price || 0));
      if (!cn || !(cp >= 0 && cp <= 100000)) return { error: `"${name}" 옵션의 선택지를 확인해 주세요.` };
      if (choices.some(x => x.name === cn)) return { error: `"${name}" 옵션에 "${cn}"이 두 번 있어요.` };
      choices.push({ name: cn, price: cp });
    }
    const cats = (Array.isArray(g?.cats) ? g.cats : []).map(c => str(c, 20)).filter(Boolean).slice(0, 20);
    options.push({ name, choices, cats, when: ['ice', 'hot'].includes(g?.when) ? g.when : 'always' });
  }
  return {
    survey: {
      title, code, desc: str(b.desc, 300),
      open: b.open !== false,
      limit: LIMITS.includes(Number(b.limit)) ? Number(b.limit) : 0,
      items, options,
    },
  };
}

// 이 항목(그 온도로 고른 경우)에 보이는 옵션 묶음. 선생님 화면에도 같은 규칙이 있다.
export const optsFor = (survey, item, temp) =>
  (survey.options || []).filter(g => (!g.cats.length || g.cats.includes(item.cat)) && (g.when === 'always' || g.when === temp));

export async function listKeys(env, prefix) {
  const names = [];
  let cursor;
  do {
    const r = await env.ORDERS.list({ prefix, cursor });
    names.push(...r.keys.map(k => k.name));
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return names;
}

export const getSurvey = (env, id) => (validId(id) ? env.ORDERS.get(surveyKey(id), 'json') : null);
