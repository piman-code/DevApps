// 잠금이 풀린 사람만 실제 다운로드로 보낸다.
// GET ?app=blur&os=mac  또는  ?app=folder
// 링크 목록은 전용 대문 「앱 관리」에서 저장한 값(KV links-v1)을 쓰고,
// 저장본이 없거나 저장소를 못 읽으면 지금까지처럼 Cloudflare 비밀 변수 LINKS(JSON)를 쓴다.
// 링크 값이 'https://…'면 그 주소로 302, 'r2:<key>'(사이트에 올린 파일)면 R2 버킷에서 꺼내 **첨부 파일로** 내보낸다.
// 올린 파일은 항상 application/octet-stream + attachment + nosniff 로만 나간다(이 사이트 주소에서 화면으로 열리지 않게).
// 링크와 파일은 여기(잠금 뒤)와 관리자용 API로만 나간다.
import { isUnlocked, json } from '../../lib/auth.js';
import { readLinks, linksOf, envLinks } from '../../lib/catalog.js';
import { r2Key, fileName } from '../../lib/files.js';

export async function onRequestGet({ request, env }) {
  if (!(await isUnlocked(request, env))) return json({ ok: false, error: 'locked' }, 401);
  const q = new URL(request.url).searchParams;
  const app = q.get('app') || '', os = q.get('os') || '';
  const id = app === 'folder' ? 'folder' : `${app}:${os}`;
  let links = null;
  if (env.ORDERS) {
    try { links = linksOf(await readLinks(env)); } catch { links = null; }
  }
  if (!links) links = envLinks(env);
  const url = Object.prototype.hasOwnProperty.call(links, id) ? links[id] : null;
  const notFound = () => json({ ok: false, error: 'not-found' }, 404);
  if (typeof url !== 'string') return notFound();

  // 사이트에 올린 파일: 그 앱·그 os로 올린 것만
  const key = app === 'folder' ? null : r2Key(url, app, os);
  if (key) {
    if (!env.FILES) return notFound();
    let obj;
    try { obj = await env.FILES.get(key, { range: request.headers }); } catch { return json({ ok: false, error: 'storage' }, 503); }
    if (!obj || !obj.body) return notFound();
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName(key)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
      ETag: obj.httpEtag,
    });
    const r = obj.range, partial = request.headers.has('Range') && r && typeof r.offset === 'number' && typeof r.length === 'number' && r.length < obj.size;
    if (partial) headers.set('Content-Range', `bytes ${r.offset}-${r.offset + r.length - 1}/${obj.size}`);
    headers.set('Content-Length', String(partial ? r.length : obj.size));
    return new Response(obj.body, { status: partial ? 206 : 200, headers });
  }

  if (!/^https:\/\//.test(url)) return notFound();
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}
