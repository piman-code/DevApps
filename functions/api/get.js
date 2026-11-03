// 잠금이 풀린 사람만 실제 다운로드 링크로 보낸다.
// GET ?app=blur&os=mac  또는  ?app=folder
// 링크 목록은 Cloudflare 비밀 변수 LINKS(JSON)에만 있다.
import { isUnlocked, json } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await isUnlocked(request, env))) return json({ ok: false, error: 'locked' }, 401);
  const q = new URL(request.url).searchParams;
  const app = q.get('app') || '';
  const id = app === 'folder' ? 'folder' : `${app}:${q.get('os') || ''}`;
  let links = {};
  try { links = JSON.parse(env.LINKS || '{}'); } catch {}
  const url = links[id];
  if (!url || !/^https:\/\//.test(url)) return json({ ok: false, error: 'not-found' }, 404);
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}
