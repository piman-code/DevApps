// 확인 명령: node --test test/*.test.mjs
// 앱 카드 내용·내려받기 링크의 검사(site/private/catalog-rules.js)와 저장·읽기(functions/api/catalog.js, get.js, home.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeApps, sanitizeLinks, sanitizeCatalog } from '../site/private/catalog-rules.js';
import { adminToken, tokenFor } from '../lib/auth.js';
import * as catalog from '../functions/api/catalog.js';
import * as home from '../functions/api/home.js';
import * as get from '../functions/api/get.js';

const app = (over = {}) => ({ id: 'blur', name: 'BlurAction', symbol: '◐', color: '#7A4FD6', category: '개인정보', summary: '가리는 프로그램', features: ['얼굴 찾기'], requirements: '없음', start: '실행', windows: { version: '0.9.1', size: '131MB' }, mac: null, ...over });
const real = JSON.parse(readFileSync(new URL('../site/apps.json', import.meta.url), 'utf8')).apps;

test('sanitizeApps: 지금 apps.json은 그대로 통과하고 내용이 바뀌지 않는다', () => {
  const r = sanitizeApps(real);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.value.map(a => a.id), real.map(a => a.id));
  for (const [i, a] of real.entries()) {
    const b = r.value[i];
    for (const k of ['name', 'symbol', 'color', 'category', 'summary', 'features', 'requirements', 'start']) assert.deepEqual(b[k], a[k], a.id + '.' + k);
    assert.deepEqual(b.web, a.web, a.id + '.web');
    assert.deepEqual(b.windows, a.windows, a.id + '.windows');
    assert.deepEqual(b.mac, a.mac, a.id + '.mac');
  }
});

test('sanitizeApps: 아는 칸만 정해진 모양으로', () => {
  const r = sanitizeApps([app({ extra: 'x', source: null, web: '', windows: { version: ' 1 ', size: '2MB', sha256: '', start: '', junk: 1 } })]);
  assert.deepEqual(r.value, [{ id: 'blur', name: 'BlurAction', symbol: '◐', color: '#7a4fd6', category: '개인정보', summary: '가리는 프로그램', features: ['얼굴 찾기'], requirements: '없음', start: '실행', windows: { version: '1', size: '2MB' }, mac: null }]);
  assert.equal(sanitizeApps([app({ web: '/order/' })]).value[0].web, '/order/');
  assert.equal(sanitizeApps([app({ web: 'https://example.com/a' })]).value[0].web, 'https://example.com/a');
});

test('sanitizeApps: 틀린 값은 거절하고 어느 앱인지 알려 준다', () => {
  for (const bad of [
    null, {}, [], 'x', [null], [[]],
    [app({ id: 'folder' })],                                          // 전체 파일 폴더 링크의 이름
    [app({ name: 'a\u202eb' })], [app({ name: 'a\u200bb' })], [app({ summary: 'a\u0085b' })],
    [app({ web: 'https:evil.example' })], [app({ web: 'https://u:p@a.com' })], [app({ web: 'https://한글.example' })],
    [app({ id: 'Blur' })], [app({ id: '-a' })], [app({ id: 'a b' })], [app({ id: '' })], [app({ id: 1 })], [app({ id: '__proto__' })],
    [app(), app()],                                                   // id 중복
    [app({ name: '' })], [app({ name: 'x'.repeat(61) })], [app({ name: 'a\nb' })], [app({ name: 5 })],
    [app({ symbol: '12345' })], [app({ symbol: '' })],
    [app({ color: 'red' })], [app({ color: '#fff' })], [app({ color: '#12345g' })], [app({ color: '#123456;background:url(x)' })],
    [app({ category: '' })], [app({ summary: '' })], [app({ summary: 'x'.repeat(201) })],
    [app({ features: 'a' })], [app({ features: [''] })], [app({ features: Array(9).fill('a') })], [app({ features: [1] })], [app({ features: ['x'.repeat(121)] })],
    [app({ requirements: 'x'.repeat(501) })], [app({ start: 'a\u0000b' })],
    [app({ web: 'javascript:alert(1)' })], [app({ web: 'http://example.com' })], [app({ web: '//evil.example' })], [app({ web: '/a/../b' })], [app({ web: 'https://a.com/"onmouseover=' })], [app({ web: 'data:text/html,x' })],
    [app({ windows: 'x' })], [app({ windows: [] })], [app({ windows: { version: '', size: '1MB' } })], [app({ windows: { version: '1', size: '' } })],
    [app({ windows: { version: '1', size: '1MB', sha256: 'abc' } })], [app({ windows: { version: '1', size: '1MB', sha256: 'G'.repeat(64) } })], [app({ mac: { version: 'x'.repeat(21), size: '1MB' } })],
    Array.from({ length: 101 }, (_, i) => app({ id: 'a' + i })),
  ]) {
    const r = sanitizeApps(bad);
    assert.equal(r.ok, false, JSON.stringify(bad).slice(0, 120));
    assert.equal(typeof r.error, 'string');
  }
  assert.equal(sanitizeApps([app({ id: 'a' }), app({ id: 'b', color: 'x' })]).at, 1);
});

test('sanitizeLinks: https만, 아는 앱의 windows·mac과 folder만', () => {
  const ids = ['blur', 'memo'];
  assert.deepEqual(sanitizeLinks({ 'blur:mac': 'https://drive.google.com/x', folder: 'https://drive.google.com/f' }, ids).value, { 'blur:mac': 'https://drive.google.com/x', folder: 'https://drive.google.com/f' });
  assert.deepEqual(sanitizeLinks({}, ids).value, {});
  for (const bad of [
    null, [], 'x',
    { 'blur:mac': 'http://drive.google.com/x' }, { 'blur:mac': 'javascript:alert(1)' }, { 'blur:mac': '' }, { 'blur:mac': 5 }, { 'blur:mac': 'https://a.com/ b' }, { 'blur:mac': 'https://a.com/"' },
    { 'blur:mac': 'https://a.com/' + 'x'.repeat(500) },
    { 'blur:mac': 'https:a.com' }, { 'blur:mac': 'https://u:p@a.com/x' }, { 'blur:mac': 'https://a.com/한글' }, { 'blur:mac': 'https://' },
    { 'folder:windows': 'https://a.com' },   // folder는 앱 id가 될 수 없다
    { 'gone:mac': 'https://a.com' },        // 목록에 없는 앱
    { 'blur:linux': 'https://a.com' }, { blur: 'https://a.com' }, { ':mac': 'https://a.com' }, { 'blur:mac:mac': 'https://a.com' }, { Folder: 'https://a.com' },
    JSON.parse('{"__proto__":"https://a.com"}'), JSON.parse('{"constructor":"https://a.com"}'),
  ]) assert.equal(sanitizeLinks(bad, ids).ok, false, JSON.stringify(bad));
});

test('sanitizeCatalog: apps와 links 칸이 둘 다 있어야 한다', () => {
  assert.equal(sanitizeCatalog({ apps: [app()], links: {} }).ok, true);
  for (const bad of [null, {}, { apps: [app()] }, { links: {} }, { restore: 'true' }, { apps: [app()], links: { 'memo:mac': 'https://a.com' } }]) assert.equal(sanitizeCatalog(bad).ok, false, JSON.stringify(bad));
});

// ── 저장·읽기: 가짜 KV와 임시 키 ──
const SECRET = 'https://drive.example/SECRET-LINK-windows', ENV_LINK = 'https://drive.example/ENV-LINK-windows';
const kv = () => { const m = new Map(); let fail = false; return { m, break: v => { fail = v; }, get: async k => { if (fail) throw new Error('kv'); return m.has(k) ? JSON.parse(m.get(k)) : null; }, put: async (k, v) => { if (fail) throw new Error('kv'); m.set(k, v); } }; };
const makeEnv = () => ({ ADMIN_KEY: 'unit-admin', DOWNLOAD_KEY: 'unit-dl', LINKS: JSON.stringify({ 'blur:windows': ENV_LINK, folder: 'https://drive.example/ENV-FOLDER' }), ORDERS: kv() });
const U = 'https://x.test';
const req = (path, { cookie = '', method = 'GET', body, origin } = {}) => new Request(U + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const admin = async e => 'ak=' + await adminToken(e.ADMIN_KEY), unlocked = async e => 'dk=' + await tokenFor(e.DOWNLOAD_KEY);
const read = async r => ({ status: r.status, body: r.status === 302 ? r.headers.get('Location') : await r.text() });

test('/api/catalog: 관리자만 읽고 쓴다', async () => {
  const e = makeEnv(), body = { apps: [app()], links: { 'blur:windows': SECRET } };
  assert.equal((await catalog.onRequestGet({ request: req('/api/catalog'), env: e })).status, 401);
  assert.equal((await catalog.onRequestGet({ request: req('/api/catalog', { cookie: await unlocked(e) }), env: e })).status, 401); // 다운로드 키로는 안 됨
  assert.equal((await catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', body }), env: e })).status, 401);
  assert.equal((await catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', body, cookie: await admin(e), origin: 'https://evil.example' }), env: e })).status, 403);
  assert.equal(e.ORDERS.m.size, 0);
  for (const bad of [{}, { apps: [], links: {} }, { apps: [app({ web: 'javascript:1' })], links: {} }, { apps: [app()], links: { 'blur:windows': 'http://a.com' } }, [1]]) {
    const r = await catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', body: bad, cookie: await admin(e) }), env: e });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', body: { restore: true }, cookie: await admin(e) }), env: e })).status, 404);
  assert.equal(e.ORDERS.m.size, 0);
});

test('저장 전: 관리자는 LINKS 값을 기본으로 받고, 공개 응답·내려받기는 지금과 같다', async () => {
  const e = makeEnv();
  const c = JSON.parse((await read(await catalog.onRequestGet({ request: req('/api/catalog', { cookie: await admin(e) }), env: e }))).body);
  assert.deepEqual([c.apps, c.source, c.hasPrev, c.links['blur:windows']], [null, { apps: 'file', links: 'env' }, false, ENV_LINK]);
  const h = JSON.parse((await read(await home.onRequestGet({ request: req('/api/home'), env: e }))).body);
  assert.deepEqual([h.apps, h.updated, h.order], [null, null, null]);
  assert.equal((await get.onRequestGet({ request: req('/api/get?app=blur&os=windows'), env: e })).status, 401);
  assert.deepEqual(await read(await get.onRequestGet({ request: req('/api/get?app=blur&os=windows', { cookie: await unlocked(e) }), env: e })), { status: 302, body: ENV_LINK });
  assert.equal((await get.onRequestGet({ request: req('/api/get?app=blur&os=mac', { cookie: await unlocked(e) }), env: e })).status, 404);
});

test('저장 뒤: 대문은 새 내용, 내려받기는 새 링크, 링크는 공개 응답 어디에도 없다', async () => {
  const e = makeEnv(), ck = await admin(e);
  const saved = await catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', cookie: ck, origin: U, body: { apps: [app({ name: '새 이름' }), app({ id: 'memo', windows: null })], links: { 'blur:windows': SECRET } } }), env: e });
  assert.equal(saved.status, 200);
  const j = JSON.parse(await saved.text());
  assert.deepEqual([j.apps.map(a => a.name), j.source, j.hasPrev, j.links], [['새 이름', 'BlurAction'], { apps: 'saved', links: 'saved' }, true, { 'blur:windows': SECRET }]);
  assert.match(j.updated, /^\d{4}-\d{2}-\d{2}$/);

  for (const cookie of ['', await unlocked(e)]) {
    const h = await read(await home.onRequestGet({ request: req('/api/home', { cookie }), env: e }));
    assert.equal(h.status, 200);
    assert.ok(!h.body.includes('SECRET-LINK') && !h.body.includes('drive.example') && !h.body.includes('links'), '공개 응답에 링크가 없어야 한다');
    assert.deepEqual(JSON.parse(h.body).apps.map(a => a.name), ['새 이름', 'BlurAction']);
  }
  assert.ok(!(await read(await home.onRequestGet({ request: req('/api/home', { cookie: ck }), env: e }))).body.includes('SECRET-LINK'), '관리자의 /api/home 에도 링크는 없다');
  assert.ok(!e.ORDERS.m.get('apps-v1').includes('drive.example'), '공개용 키(apps-v1)에는 링크가 들어가지 않는다');

  assert.equal((await get.onRequestGet({ request: req('/api/get?app=blur&os=windows'), env: e })).status, 401);
  assert.equal((await get.onRequestGet({ request: req('/api/get?app=blur&os=windows', { cookie: ck }), env: e })).status, 401); // 관리자 쿠키만으로는 내려받기가 열리지 않는다(지금과 같음)
  assert.deepEqual(await read(await get.onRequestGet({ request: req('/api/get?app=blur&os=windows', { cookie: await unlocked(e) }), env: e })), { status: 302, body: SECRET });
  // 저장본이 정본: LINKS에만 있던 folder는 더 이상 나가지 않는다
  assert.equal((await get.onRequestGet({ request: req('/api/get?app=folder', { cookie: await unlocked(e) }), env: e })).status, 404);
  for (const q of ['app=__proto__', 'app=constructor&os=', 'app=blur', 'app=blur&os=linux', '']) assert.equal((await get.onRequestGet({ request: req('/api/get?' + q, { cookie: await unlocked(e) }), env: e })).status, 404, q);
});

test('직전 저장으로: 처음 저장을 되돌리면 apps.json·LINKS로, 한 번 더 누르면 다시 저장본으로', async () => {
  const e = makeEnv(), ck = await admin(e), dl = await unlocked(e);
  const put = body => catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', cookie: ck, body }), env: e });
  await put({ apps: [app({ name: 'A' })], links: { 'blur:windows': SECRET } });
  let j = JSON.parse(await (await put({ restore: true })).text());
  assert.deepEqual([j.apps, j.source, j.links['blur:windows'], j.hasPrev], [null, { apps: 'file', links: 'env' }, ENV_LINK, true]);
  assert.equal(JSON.parse(await (await home.onRequestGet({ request: req('/api/home'), env: e })).text()).apps, null);
  assert.equal((await read(await get.onRequestGet({ request: req('/api/get?app=blur&os=windows', { cookie: dl }), env: e }))).body, ENV_LINK);
  j = JSON.parse(await (await put({ restore: true })).text());
  assert.deepEqual([j.apps[0].name, j.links], ['A', { 'blur:windows': SECRET }]);
  await put({ apps: [app({ name: 'B' })], links: {} });
  j = JSON.parse(await (await put({ restore: true })).text());
  assert.deepEqual([j.apps[0].name, j.links], ['A', { 'blur:windows': SECRET }]);
});

test('저장소를 못 읽으면: 내려받기는 LINKS로, /api/home·/api/catalog는 503, 저장하지 않는다', async () => {
  const e = makeEnv(), ck = await admin(e);
  await catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', cookie: ck, body: { apps: [app()], links: { 'blur:windows': SECRET } } }), env: e });
  const before = new Map(e.ORDERS.m);
  e.ORDERS.break(true);
  assert.equal((await read(await get.onRequestGet({ request: req('/api/get?app=blur&os=windows', { cookie: await unlocked(e) }), env: e }))).body, ENV_LINK);
  assert.equal((await home.onRequestGet({ request: req('/api/home'), env: e })).status, 503);
  assert.equal((await catalog.onRequestGet({ request: req('/api/catalog', { cookie: ck }), env: e })).status, 503);
  assert.equal((await catalog.onRequestPut({ request: req('/api/catalog', { method: 'PUT', cookie: ck, body: { apps: [app({ name: 'X' })], links: {} } }), env: e })).status, 503);
  e.ORDERS.break(false);
  assert.deepEqual([...e.ORDERS.m], [...before]);
});
