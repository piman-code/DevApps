// 잠금이 풀린 사람만 실제 다운로드 링크로 보낸다.
// GET ?app=blur&os=mac  또는  ?app=folder
// 링크 목록은 전용 대문 「앱 관리」에서 저장한 값(KV links-v1)을 쓰고,
// 저장본이 없거나 저장소를 못 읽으면 지금까지처럼 Cloudflare 비밀 변수 LINKS(JSON)를 쓴다.
// 링크는 여기(잠금 뒤)와 관리자용 /api/catalog 로만 나간다.
import { isUnlocked, json } from '../../lib/auth.js';
import { readLinks, linksOf, envLinks } from '../../lib/catalog.js';

export async function onRequestGet({ request, env }) {
  if (!(await isUnlocked(request, env))) return json({ ok: false, error: 'locked' }, 401);
  const q = new URL(request.url).searchParams;
  const app = q.get('app') || '';
  const id = app === 'folder' ? 'folder' : `${app}:${q.get('os') || ''}`;
  let links = null;
  if (env.ORDERS) {
    try { links = linksOf(await readLinks(env)); } catch { links = null; }
  }
  if (!links) links = envLinks(env);
  const url = Object.prototype.hasOwnProperty.call(links, id) ? links[id] : null;
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return json({ ok: false, error: 'not-found' }, 404);
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}
