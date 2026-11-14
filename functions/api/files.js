// 설치 파일 올리기·목록·지우기(「앱 관리」 화면이 부른다). **관리자(쿠키 ak)만**, 바꾸는 요청은 같은 출처만.
// 큰 파일을 16MB 조각으로 나눠 사이트를 거쳐 R2에 올린다(API 토큰이 필요 없다).
// GET                                        → { ok, used, limit, maxFile, part, exts, files: [{ key, size, uploaded, inUse, inPrev }] }
// POST { action: 'start', app, os, name, size } → 용량·확장자 검사 뒤 올리기 시작 { key, uploadId, size, sig, part }
// PUT  ?key=&uploadId=&size=&sig=&part=N  (본문 = 조각) → { partNumber, etag }
// POST { action: 'complete', key, uploadId, size, sig, parts } → 합치기. 크기가 다르거나 한도를 넘으면 지우고 거절
// POST { action: 'abort', key, uploadId, size, sig }           → 올리다 만 것 정리
// DELETE ?key=                                  → 파일 지우기(지금 저장본이 쓰는 파일은 거절)
// 올린 파일을 내보내는 곳은 여기가 아니라 /api/get(다운로드 잠금 뒤)뿐이다. 한도는 lib/files.js.
//
// ── 올리다 만 조각이 한도 밖에서 쌓이지 않게 ── (미완료 조각은 버킷 목록에 안 잡혀서 용량 집계에 들어가지 않는다)
//   · sig = 관리자 키로 만든 서명(key|uploadId|size). start가 준 올리기에만, 신고한 크기만큼의 조각만 받는다.
//   · 올리기는 한 번에 하나: start는 앞서 시작해 끝나지 않은 올리기(KV 'upload-pending')를 먼저 정리(abort)한다.
//   · complete가 실패하면 그 자리에서 정리한다. 그래도 남은 것은 R2가 7일 뒤 지운다.
import { isAdmin, sameOrigin, json, tokenFor, sameText } from '../../lib/auth.js';
import { readLinks, linksOf, envLinks, KV_LINKS_PREV } from '../../lib/catalog.js';
import { LIMIT_BYTES, MAX_FILE, PART, EXTS, R2_KEY, makeKey, usage, keysIn } from '../../lib/files.js';

const KV_PENDING = 'upload-pending'; // { key, uploadId, size, at } 지금 진행 중인 올리기 하나

async function guard(request, env, write) {
  if (write && !sameOrigin(request)) return json({ ok: false, error: 'bad-origin' }, 403);
  if (!(await isAdmin(request, env))) {
    await new Promise(r => setTimeout(r, 600));
    return json({ ok: false, error: 'locked' }, 401);
  }
  if (!env.FILES || (write && !env.ORDERS)) return json({ ok: false, error: 'not-configured' }, 500);
  return null;
}
const bad = (error = 'bad-request', status = 400, extra = {}) => json({ ok: false, error, ...extra }, status);
const validKey = k => typeof k === 'string' && R2_KEY.test(k);
const validId = v => typeof v === 'string' && v.length > 0 && v.length <= 1024 && /^[\x21-\x7e]+$/.test(v);
const validSize = n => Number.isInteger(n) && n >= 1 && n <= MAX_FILE;
const sign = (env, key, uploadId, size) => tokenFor(env.ADMIN_KEY, `upload|${key}|${uploadId}|${size}`);
// start가 내준 올리기인지(그리고 그때 신고한 크기인지) 서명으로 확인한다
async function signed(env, key, uploadId, size, sig) {
  return validKey(key) && validId(uploadId) && validSize(size) && typeof sig === 'string' && sameText(sig, await sign(env, key, uploadId, size));
}
async function clearPending(env, uploadId) {
  try { const p = await env.ORDERS.get(KV_PENDING, 'json'); if (p && p.uploadId === uploadId) await env.ORDERS.put(KV_PENDING, JSON.stringify({ none: true })); } catch {}
}

export async function onRequestGet({ request, env }) {
  const no = await guard(request, env, false);
  if (no) return no;
  try {
    const u = await usage(env);
    let cur = new Set(), prev = new Set();
    if (env.ORDERS) {
      cur = keysIn(linksOf(await readLinks(env)) || envLinks(env));
      prev = keysIn(linksOf(await readLinks(env, KV_LINKS_PREV)));
    }
    return json({ ok: true, used: u.used, limit: LIMIT_BYTES, maxFile: MAX_FILE, part: PART, exts: EXTS, files: u.files.map(f => ({ ...f, inUse: cur.has(f.key), inPrev: prev.has(f.key) })) });
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const no = await guard(request, env, true);
  if (no) return no;
  let b = null;
  try { b = await request.json(); } catch {}
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad();
  try {
    if (b.action === 'start') {
      const size = Number(b.size);
      if (!Number.isInteger(size) || size < 1) return bad();
      if (size > MAX_FILE) return bad('too-large', 413, { maxFile: MAX_FILE });
      const key = makeKey(b.app, b.os, b.name);
      if (!key) return bad('bad-name', 400, { exts: EXTS });
      // 올리기는 한 번에 하나: 앞서 시작해 끝나지 않은 것이 있으면 먼저 정리한다(조각이 쌓이지 않게)
      const old = await env.ORDERS.get(KV_PENDING, 'json');
      if (old && validKey(old.key) && validId(old.uploadId)) { try { await env.FILES.resumeMultipartUpload(old.key, old.uploadId).abort(); } catch {} }
      const u = await usage(env);
      // 무료 한도를 넘기지 않게: 지금 쓴 양 + 이번 파일이 한도를 넘으면 시작하지 않는다
      if (u.used + size > LIMIT_BYTES) return bad('quota', 413, { used: u.used, limit: LIMIT_BYTES });
      const up = await env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: 'application/octet-stream' } });
      try {
        await env.ORDERS.put(KV_PENDING, JSON.stringify({ key, uploadId: up.uploadId, size, at: Date.now() }));
      } catch (e) { try { await up.abort(); } catch {} throw e; } // 적어 두지 못한 올리기는 시작하지 않는다
      return json({ ok: true, key, uploadId: up.uploadId, size, sig: await sign(env, key, up.uploadId, size), part: PART });
    }

    const size = Number(b.size);
    if (!(await signed(env, b.key, b.uploadId, size, b.sig))) return bad();
    const up = env.FILES.resumeMultipartUpload(b.key, b.uploadId);
    if (b.action === 'abort') {
      try { await up.abort(); } catch {}
      await clearPending(env, b.uploadId);
      return json({ ok: true });
    }
    if (b.action === 'complete') {
      const max = Math.ceil(size / PART);
      if (!Array.isArray(b.parts) || !b.parts.length || b.parts.length > max) return bad();
      const parts = [];
      for (const p of b.parts) {
        if (!p || !Number.isInteger(p.partNumber) || p.partNumber < 1 || p.partNumber > max || typeof p.etag !== 'string' || !p.etag || p.etag.length > 200) return bad();
        parts.push({ partNumber: p.partNumber, etag: p.etag });
      }
      let obj;
      try { obj = await up.complete(parts); } catch {
        try { await up.abort(); } catch {} // 합치지 못한 조각은 그 자리에서 정리한다
        await clearPending(env, b.uploadId);
        return bad('incomplete', 409);
      }
      await clearPending(env, b.uploadId);
      // 신고한 크기와 다르거나, 한도를 넘었거나, 용량을 확인하지 못했으면 지우고 거절한다(검사 안 된 파일을 남기지 않는다)
      let u = null;
      try { u = await usage(env); } catch {}
      if (!u || obj.size !== size || obj.size > MAX_FILE || u.used > LIMIT_BYTES) {
        await env.FILES.delete(b.key);
        if (!u) return json({ ok: false, error: 'storage' }, 503);
        return obj.size !== size ? bad('size-mismatch', 409) : bad('quota', 413, { used: u.used - obj.size, limit: LIMIT_BYTES });
      }
      return json({ ok: true, key: b.key, size: obj.size, used: u.used, limit: LIMIT_BYTES });
    }
    return bad();
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}

export async function onRequestPut({ request, env }) {
  const no = await guard(request, env, true);
  if (no) return no;
  const q = new URL(request.url).searchParams, key = q.get('key'), uploadId = q.get('uploadId'), size = Number(q.get('size')), n = Number(q.get('part'));
  if (!(await signed(env, key, uploadId, size, q.get('sig')))) return bad();
  // 신고한 크기만큼의 조각만: 번호는 1..ceil(size/PART), 조각 하나는 PART까지
  if (!Number.isInteger(n) || n < 1 || n > Math.ceil(size / PART)) return bad();
  if (Number(request.headers.get('Content-Length') || 0) > PART) return bad('too-large', 413);
  let buf;
  try { buf = await request.arrayBuffer(); } catch { return bad(); }
  if (!buf.byteLength || buf.byteLength > PART) return bad(buf.byteLength ? 'too-large' : 'bad-request', buf.byteLength ? 413 : 400);
  try {
    const part = await env.FILES.resumeMultipartUpload(key, uploadId).uploadPart(n, buf);
    return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}

export async function onRequestDelete({ request, env }) {
  const no = await guard(request, env, true);
  if (no) return no;
  const key = new URL(request.url).searchParams.get('key');
  if (!validKey(key)) return bad();
  try {
    // 지금 선생님이 받는 파일은 지우지 않는다: 저장본이 가리키는 파일, 저장본이 없으면 비밀 변수 LINKS가 가리키는 파일.
    // 저장본을 못 읽으면(예외) 지우지 않는다.
    if (keysIn(linksOf(await readLinks(env)) || envLinks(env)).has(key)) return bad('in-use', 409);
    await env.FILES.delete(key);
    const u = await usage(env);
    return json({ ok: true, used: u.used, limit: LIMIT_BYTES });
  } catch {
    return json({ ok: false, error: 'storage' }, 503);
  }
}
