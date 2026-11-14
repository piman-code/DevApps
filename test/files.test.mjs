// 확인 명령: node --test test/*.test.mjs
// 설치 파일 직접 올리기(lib/files.js, functions/api/files.js)와 올린 파일 내려받기(functions/api/get.js). 가짜 R2·KV와 임시 키.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, makeKey, LIMIT_BYTES, MAX_FILE, PART, R2_KEY } from '../lib/files.js';
import { sanitizeLinks } from '../site/private/catalog-rules.js';
import { adminToken, tokenFor } from '../lib/auth.js';
import * as files from '../functions/api/files.js';
import * as catalog from '../functions/api/catalog.js';
import * as get from '../functions/api/get.js';

test('cleanName·makeKey: 영문·숫자·.-_ 만 남기고, 허용한 확장자만', () => {
  assert.equal(cleanName('BlurAction 0.9.6 (mac).zip'), 'BlurAction-0.9.6-mac.zip');
  assert.equal(cleanName('C:\\Users\\a\\Setup.EXE'), 'Setup.exe');
  assert.equal(cleanName('../../etc/passwd.zip'), 'passwd.zip');
  assert.equal(cleanName('평가잇다.zip'), 'file.zip');
  assert.equal(cleanName('a'.repeat(200) + '.dmg').length, 74);
  for (const bad of ['a.html', 'a.js', 'a.zip.html', 'zip', '.zip', 'a', '', null, 5, 'a.svg', 'a.php']) assert.equal(cleanName(bad), null, String(bad));
  const key = makeKey('blur', 'mac', 'Blur Action.zip', Date.UTC(2026, 10, 14, 5, 6, 7));
  assert.equal(key, 'apps/blur/mac/20261114050607-Blur-Action.zip');
  assert.ok(R2_KEY.test(key));
  for (const [a, o, n] of [['Blur', 'mac', 'a.zip'], ['blur', 'linux', 'a.zip'], ['blur', 'mac', 'a.html'], ['../x', 'mac', 'a.zip'], ['folder/x', 'mac', 'a.zip']]) assert.equal(makeKey(a, o, n), null, [a, o, n].join());
});

test('링크 검사: 올린 파일은 그 앱·그 os 것만 가리킬 수 있다', () => {
  const ids = ['blur', 'memo'], k = 'r2:apps/blur/mac/20261114050607-a.zip';
  assert.deepEqual(sanitizeLinks({ 'blur:mac': k }, ids).value, { 'blur:mac': k });
  for (const bad of [
    { 'blur:windows': k },                                   // 다른 os의 파일
    { 'memo:mac': k },                                       // 다른 앱의 파일
    { folder: k },                                           // 폴더 링크는 주소만
    { 'blur:mac': 'r2:apps/blur/mac/a.zip' },                // 시각 없음
    { 'blur:mac': 'r2:apps/blur/mac/20261114050607-a.zip/../x' },
    { 'blur:mac': 'r2:other/blur/mac/20261114050607-a.zip' },
    { 'blur:mac': 'r2:' }, { 'blur:mac': 'R2:apps/blur/mac/20261114050607-a.zip' },
  ]) assert.equal(sanitizeLinks(bad, ids).ok, false, JSON.stringify(bad));
});

// ── 가짜 R2 ──
function r2() {
  const objects = new Map(), pending = new Map();
  let seq = 0;
  const up = (key, uploadId) => ({
    key, uploadId,
    async uploadPart(n, buf) { const u = pending.get(uploadId); if (!u || u.key !== key) throw new Error('no upload'); u.parts.set(n, new Uint8Array(buf)); return { partNumber: n, etag: 'e' + n + '-' + buf.byteLength }; },
    async complete(parts) {
      const u = pending.get(uploadId); if (!u || u.key !== key) throw new Error('no upload');
      const chunks = parts.sort((a, b) => a.partNumber - b.partNumber).map(p => { const c = u.parts.get(p.partNumber); if (!c || p.etag !== 'e' + p.partNumber + '-' + c.byteLength) throw new Error('bad part'); return c; });
      const data = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0)); let at = 0; for (const c of chunks) { data.set(c, at); at += c.byteLength; }
      objects.set(key, { data, uploaded: new Date() }); pending.delete(uploadId); return { key, size: data.byteLength };
    },
    async abort() { pending.delete(uploadId); },
  });
  return {
    objects, pending,
    fake(key, size) { objects.set(key, { data: { byteLength: size }, uploaded: new Date() }); },
    async list() { return { objects: [...objects].map(([key, o]) => ({ key, size: o.data.byteLength, uploaded: o.uploaded })), truncated: false }; },
    async createMultipartUpload(key) { const uploadId = 'u' + ++seq; pending.set(uploadId, { key, parts: new Map() }); return up(key, uploadId); },
    resumeMultipartUpload: up,
    async delete(key) { objects.delete(key); },
    async get(key, opt = {}) {
      const o = objects.get(key); if (!o) return null;
      let offset = 0, length = o.data.byteLength;
      const m = opt.range && opt.range.get && /^bytes=(\d+)-(\d*)$/.exec(opt.range.get('Range') || '');
      if (m) { offset = +m[1]; length = (m[2] ? Math.min(+m[2], o.data.byteLength - 1) : o.data.byteLength - 1) - offset + 1; }
      return { key, size: o.data.byteLength, httpEtag: '"etag"', range: { offset, length }, body: o.data.slice(offset, offset + length) };
    },
  };
}
const kv = () => { const m = new Map(); return { m, get: async k => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => { m.set(k, v); } }; };
const makeEnv = () => ({ ADMIN_KEY: 'unit-admin', DOWNLOAD_KEY: 'unit-dl', LINKS: '{}', ORDERS: kv(), FILES: r2() });
const U = 'https://x.test';
const admin = async e => 'ak=' + await adminToken(e.ADMIN_KEY), unlocked = async e => 'dk=' + await tokenFor(e.DOWNLOAD_KEY);
const J = (path, cookie, method, body, extra = {}) => new Request(U + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
const data = async r => ({ status: r.status, ...(await r.json()) });
const app = { id: 'blur', name: 'B', symbol: 'b', color: '#000000', category: 'c', summary: 's', windows: null, mac: { version: '1', size: '1MB' } };

// start가 준 올리기 정보(서명 포함)를 주소·본문에 싣는 모양
const who = s => `key=${encodeURIComponent(s.key)}&uploadId=${s.uploadId}&size=${s.size}&sig=${s.sig}`;
const id = s => ({ key: s.key, uploadId: s.uploadId, size: s.size, sig: s.sig });

async function uploadAll(e, ck, bytes, name = 'Blur.zip', os = 'mac') {
  const s = await data(await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'start', app: 'blur', os, name, size: bytes.byteLength }), env: e }));
  if (s.status !== 200) return s;
  const parts = [];
  for (let n = 1, at = 0; at < bytes.byteLength; n++, at += s.part) {
    const r = await data(await files.onRequestPut({ request: new Request(`${U}/api/files?${who(s)}&part=${n}`, { method: 'PUT', headers: { Cookie: ck }, body: bytes.slice(at, at + s.part) }), env: e }));
    assert.equal(r.status, 200);
    parts.push({ partNumber: r.partNumber, etag: r.etag });
  }
  return data(await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'complete', ...id(s), parts }), env: e }));
}

test('/api/files: 관리자만, 다른 출처는 403, 버킷이 없으면 500', async () => {
  const e = makeEnv(), ck = await admin(e), body = { action: 'start', app: 'blur', os: 'mac', name: 'a.zip', size: 10 };
  assert.equal((await files.onRequestGet({ request: J('/api/files', '', 'GET'), env: e })).status, 401);
  assert.equal((await files.onRequestGet({ request: J('/api/files', await unlocked(e), 'GET'), env: e })).status, 401); // 다운로드 키로는 안 됨
  assert.equal((await files.onRequestPost({ request: J('/api/files', '', 'POST', body), env: e })).status, 401);
  assert.equal((await files.onRequestPost({ request: J('/api/files', ck, 'POST', body, { Origin: 'https://evil.example' }), env: e })).status, 403);
  assert.equal((await files.onRequestPut({ request: new Request(U + '/api/files?key=x&uploadId=y&part=1', { method: 'PUT', body: 'x' }), env: e })).status, 401);
  assert.equal((await files.onRequestDelete({ request: J('/api/files?key=apps/blur/mac/20261114050607-a.zip', '', 'DELETE'), env: e })).status, 401);
  assert.equal(e.FILES.pending.size, 0);
  const none = { ...makeEnv(), FILES: undefined };
  assert.equal((await files.onRequestGet({ request: J('/api/files', await admin(none), 'GET'), env: none })).status, 500);
});

test('올리기: 한도와 형식을 넘으면 시작하지 않는다', async () => {
  const e = makeEnv(), ck = await admin(e);
  const start = b => files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'start', app: 'blur', os: 'mac', name: 'a.zip', size: 10, ...b }), env: e }).then(data);
  assert.deepEqual([(await start({ size: MAX_FILE + 1 })).error, (await start({ size: 0 })).status, (await start({ size: 1.5 })).status, (await start({ size: '10; drop' })).status], ['too-large', 400, 400, 400]);
  assert.deepEqual([(await start({ name: 'a.html' })).error, (await start({ app: 'Blur' })).error, (await start({ os: 'linux' })).error], ['bad-name', 'bad-name', 'bad-name']);
  e.FILES.fake('apps/memo/mac/20260101000000-old.zip', LIMIT_BYTES - 100);
  assert.deepEqual([(await start({ size: 101 })).error, (await start({ size: 101 })).status], ['quota', 413]);
  assert.equal((await start({ size: 100 })).status, 200); // 딱 한도까지는 된다
  assert.equal(e.FILES.pending.size, 1);
});

test('올리기 → 저장 → 내려받기: 조각이 합쳐지고, 잠금 뒤에서만 첨부 파일로 나간다', async () => {
  const e = makeEnv(), ck = await admin(e), dl = await unlocked(e);
  const bytes = new Uint8Array(PART + 1000).map((_, i) => i % 251);
  const done = await uploadAll(e, ck, bytes);
  assert.deepEqual([done.status, done.size, done.used], [200, bytes.byteLength, bytes.byteLength]);
  assert.match(done.key, /^apps\/blur\/mac\/\d{14}-Blur\.zip$/);

  let l = await data(await files.onRequestGet({ request: J('/api/files', ck, 'GET'), env: e }));
  assert.deepEqual([l.used, l.limit, l.files.length, l.files[0].inUse], [bytes.byteLength, LIMIT_BYTES, 1, false]);

  // 저장 전에는 받을 수 없다(링크가 없으므로)
  assert.equal((await get.onRequestGet({ request: J('/api/get?app=blur&os=mac', dl, 'GET'), env: e })).status, 404);
  assert.equal((await catalog.onRequestPut({ request: J('/api/catalog', ck, 'PUT', { apps: [app], links: { 'blur:mac': 'r2:' + done.key } }), env: e })).status, 200);
  l = await data(await files.onRequestGet({ request: J('/api/files', ck, 'GET'), env: e }));
  assert.equal(l.files[0].inUse, true);

  assert.equal((await get.onRequestGet({ request: J('/api/get?app=blur&os=mac', '', 'GET'), env: e })).status, 401);
  assert.equal((await get.onRequestGet({ request: J('/api/get?app=blur&os=mac', ck, 'GET'), env: e })).status, 401); // 관리자 쿠키만으로는 안 됨
  const r = await get.onRequestGet({ request: J('/api/get?app=blur&os=mac', dl, 'GET'), env: e });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'application/octet-stream');
  assert.equal(r.headers.get('Content-Disposition'), 'attachment; filename="Blur.zip"');
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(r.headers.get('Content-Length'), String(bytes.byteLength));
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);

  const part = await get.onRequestGet({ request: J('/api/get?app=blur&os=mac', dl, 'GET', undefined, { Range: 'bytes=10-19' }), env: e });
  assert.deepEqual([part.status, part.headers.get('Content-Range'), part.headers.get('Content-Length')], [206, `bytes 10-19/${bytes.byteLength}`, '10']);
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), bytes.slice(10, 20));

  // 다른 os·다른 앱으로는 그 파일이 나가지 않는다
  assert.equal((await get.onRequestGet({ request: J('/api/get?app=blur&os=windows', dl, 'GET'), env: e })).status, 404);
  assert.equal((await get.onRequestGet({ request: J('/api/get?app=folder', dl, 'GET'), env: e })).status, 404);

  // 쓰는 파일은 지울 수 없다 → 링크를 바꿔 저장한 뒤에는 지울 수 있다
  const del = () => files.onRequestDelete({ request: J('/api/files?key=' + encodeURIComponent(done.key), ck, 'DELETE'), env: e }).then(data);
  assert.deepEqual([(await del()).error, e.FILES.objects.size], ['in-use', 1]);
  await catalog.onRequestPut({ request: J('/api/catalog', ck, 'PUT', { apps: [app], links: { 'blur:mac': 'https://drive.example/x' } }), env: e });
  l = await data(await files.onRequestGet({ request: J('/api/files', ck, 'GET'), env: e }));
  assert.deepEqual([l.files[0].inUse, l.files[0].inPrev], [false, true]);
  assert.deepEqual([(await del()).used, e.FILES.objects.size], [0, 0]);
  // 파일을 지운 뒤 직전 저장으로 되돌리면 그 앱은 404(없는 파일)
  await catalog.onRequestPut({ request: J('/api/catalog', ck, 'PUT', { restore: true }), env: e });
  assert.equal((await get.onRequestGet({ request: J('/api/get?app=blur&os=mac', dl, 'GET'), env: e })).status, 404);
});

test('올리기: 서명 없는 조각·크기를 속인 파일·큰 조각은 받지 않고, 취소하면 남지 않는다', async () => {
  const e = makeEnv(), ck = await admin(e);
  const start = (size, name = 'a.zip') => files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'start', app: 'blur', os: 'mac', name, size }), env: e }).then(data);
  const s = await start(5);
  const put = (n, body, q = who(s)) => files.onRequestPut({ request: new Request(`${U}/api/files?${q}&part=${n}`, { method: 'PUT', headers: { Cookie: ck }, body }), env: e });
  assert.equal((await put(1, new Uint8Array(PART + 1))).status, 413);
  assert.equal((await put(0, new Uint8Array(5))).status, 400);
  assert.equal((await put(2, new Uint8Array(5))).status, 400);                       // 5바이트 파일에는 조각이 하나뿐
  assert.equal((await put(1, new Uint8Array(0))).status, 400);
  // 서명이 맞지 않으면(다른 크기·다른 key·다른 uploadId·서명 없음) 받지 않는다
  for (const q of [who({ ...s, size: 2 * PART }), who({ ...s, key: 'apps/blur/mac/20260101000000-x.zip' }), who({ ...s, uploadId: 'other' }), who({ ...s, sig: '' }), who({ ...s, sig: 'a'.repeat(64) }), `key=${encodeURIComponent(s.key)}&uploadId=${s.uploadId}`]) {
    assert.equal((await put(1, new Uint8Array(5), q)).status, 400, q);
  }
  const p = await data(await put(1, new Uint8Array(50)));
  // 5바이트라고 하고 50바이트를 올림 → 합친 뒤 지우고 거절
  const c = await data(await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'complete', ...id(s), parts: [{ partNumber: 1, etag: p.etag }] }), env: e }));
  assert.deepEqual([c.status, c.error, e.FILES.objects.size, e.FILES.pending.size], [409, 'size-mismatch', 0, 0]);

  // 합치기가 실패하면(틀린 etag) 조각을 그 자리에서 정리한다
  const s1 = await start(5);
  await put(1, new Uint8Array(5), who(s1));
  const f = await data(await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'complete', ...id(s1), parts: [{ partNumber: 1, etag: 'wrong' }] }), env: e }));
  assert.deepEqual([f.status, f.error, e.FILES.pending.size, e.FILES.objects.size], [409, 'incomplete', 0, 0]);

  const s2 = await start(5);
  assert.equal(e.FILES.pending.size, 1);
  assert.equal((await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'abort', key: s2.key, uploadId: s2.uploadId }), env: e })).status, 400); // 서명 없는 취소
  assert.equal((await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'abort', ...id(s2) }), env: e })).status, 200);
  assert.equal(e.FILES.pending.size, 0);
  for (const bad of [{ action: 'complete', key: 'x', uploadId: 'y', size: 5, parts: [] }, { action: 'nope', ...id(s2) }, { action: 'complete', ...id(s2), parts: [{ partNumber: 'a', etag: 1 }] }, { action: 'complete', ...id(s2), parts: [{ partNumber: 2, etag: 'e' }] }, []]) {
    assert.equal((await files.onRequestPost({ request: J('/api/files', ck, 'POST', bad), env: e })).status, 400, JSON.stringify(bad));
  }
});

test('올리기는 한 번에 하나: 새로 시작하면 앞서 끝나지 않은 올리기를 정리한다(조각이 한도 밖에서 쌓이지 않게)', async () => {
  const e = makeEnv(), ck = await admin(e);
  const start = () => files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'start', app: 'blur', os: 'mac', name: 'a.zip', size: 3 * PART }), env: e }).then(data);
  const first = await start();
  for (let i = 0; i < 20; i++) await start();
  assert.equal(e.FILES.pending.size, 1);
  // 정리된 올리기에는 서명이 맞아도 조각이 붙지 않는다(R2가 없는 올리기로 거절)
  const r = await files.onRequestPut({ request: new Request(`${U}/api/files?${who(first)}&part=1`, { method: 'PUT', headers: { Cookie: ck }, body: new Uint8Array(10) }), env: e });
  assert.equal(r.status, 503);
  assert.equal(e.FILES.objects.size, 0);
});

test('한도: 올리는 사이에 다른 파일이 들어와 넘거나 용량을 확인하지 못하면 합친 뒤 지우고 거절한다', async () => {
  for (const mode of ['quota', 'list-fails']) {
    const e = makeEnv(), ck = await admin(e);
    const s = await data(await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'start', app: 'blur', os: 'mac', name: 'a.zip', size: 10 }), env: e }));
    const p = await data(await files.onRequestPut({ request: new Request(`${U}/api/files?${who(s)}&part=1`, { method: 'PUT', headers: { Cookie: ck }, body: new Uint8Array(10) }), env: e }));
    e.FILES.fake('apps/memo/mac/20260101000000-big.zip', mode === 'quota' ? LIMIT_BYTES - 5 : 100);
    if (mode === 'list-fails') e.FILES.list = async () => { throw new Error('r2 list'); };
    const c = await data(await files.onRequestPost({ request: J('/api/files', ck, 'POST', { action: 'complete', ...id(s), parts: [{ partNumber: 1, etag: p.etag }] }), env: e }));
    assert.deepEqual([c.status, c.error, e.FILES.objects.size], mode === 'quota' ? [413, 'quota', 1] : [503, 'storage', 1], mode);
  }
});

test('지우기: 저장본이 없을 때는 비밀 변수 LINKS가 가리키는 파일도 지우지 않는다', async () => {
  const e = makeEnv(), ck = await admin(e), key = 'apps/blur/mac/20260101000000-a.zip';
  e.FILES.fake(key, 10); e.LINKS = JSON.stringify({ 'blur:mac': 'r2:' + key });
  const r = await data(await files.onRequestDelete({ request: J('/api/files?key=' + encodeURIComponent(key), ck, 'DELETE'), env: e }));
  assert.deepEqual([r.status, r.error, e.FILES.objects.size], [409, 'in-use', 1]);
  const l = await data(await files.onRequestGet({ request: J('/api/files', ck, 'GET'), env: e }));
  assert.equal(l.files[0].inUse, true);
});

test('버킷이 묶이지 않아도 드라이브 링크 내려받기는 그대로다', async () => {
  const e = { ...makeEnv(), FILES: undefined, LINKS: JSON.stringify({ 'blur:mac': 'https://drive.example/x' }) };
  const r = await get.onRequestGet({ request: J('/api/get?app=blur&os=mac', await unlocked(e), 'GET'), env: e });
  assert.deepEqual([r.status, r.headers.get('Location')], [302, 'https://drive.example/x']);
});
