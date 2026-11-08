// 사이트 입구. /private/ 아래는 파이맨 전용이라 관리자 쿠키(ak)가 맞을 때만 보여 준다.
// 주소를 끝까지 풀어서 본다: '/%70rivate/…', '/private%2Findex.html', 두 번 인코딩, '//private/' 같은 우회를
// 정적 파일 서버보다 먼저 해석한다(lecture-site lib/guard.js와 같은 방식).
// 잠겨 있으면 공개 대문으로 보내지 않고 여기서 401 로그인 화면을 준다. 공개 쪽에는 전용 영역의 흔적을 남기지 않는다.
import { isAdmin } from '../lib/auth.js';

export function normalizePath(raw) {
  let path = raw;
  for (let i = 0; i < 3; i++) {
    const decoded = decodeURIComponent(path); // 잘못된 %는 여기서 오류 → 400
    if (decoded === path) break;
    path = decoded;
  }
  path = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  return new URL(path.replace(/[?#]/g, '_'), 'http://x').pathname.toLowerCase();
}

const LOGIN = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>잠김</title>
<style>
:root{--bg:#f6f5f2;--surface:#fff;--text:#1d1c1a;--muted:#6b6862;--line:#e3e0d9;--accent:#1d1c1a;--accent-text:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--surface:#1d1d1b;--text:#f0eee9;--muted:#a29f98;--line:#33322f;--accent:#f0eee9;--accent-text:#141413}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.6}
form{width:min(360px,calc(100vw - 32px));background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:26px}
h1{font-size:19px;margin:0 0 6px}p{margin:0 0 14px;font-size:14px;color:var(--muted)}
input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--text)}
.err{color:#c2412d;font-size:13px;min-height:20px;margin:6px 0 4px}
button{width:100%;font:inherit;font-weight:700;font-size:15px;padding:11px;border-radius:12px;border:0;background:var(--accent);color:var(--accent-text);cursor:pointer}
button:disabled{opacity:.6}
</style></head><body>
<form id="f" autocomplete="off">
  <h1>잠겨 있습니다</h1>
  <p>이 페이지는 관리자만 엽니다. 관리자 키를 넣어 주세요.</p>
  <input id="k" type="password" placeholder="관리자 키" aria-label="관리자 키" required autofocus>
  <div class="err" id="e" role="alert"></div>
  <button type="submit" id="b">열기</button>
</form>
<script>
document.getElementById('f').addEventListener('submit',async function(ev){
  ev.preventDefault();var b=document.getElementById('b'),e=document.getElementById('e'),k=document.getElementById('k').value.trim();
  if(!k){e.textContent='관리자 키를 넣어 주세요.';return}
  b.disabled=true;e.textContent='확인하는 중…';
  try{var r=await fetch('/api/admin',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k})});
    if(r.ok){location.reload();return}
    e.textContent=r.status===500?'아직 키가 설정되지 않았습니다.':'관리자 키가 맞지 않습니다.';
  }catch(_){e.textContent='연결이 끊겼습니다. 잠시 후 다시 해 주세요.'}
  b.disabled=false;
});
</script></body></html>`;

export async function onRequest({ request, env, next }) {
  let path;
  try {
    path = normalizePath(new URL(request.url).pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (!(path === '/private' || path.startsWith('/private/'))) return next();

  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!(await isAdmin(request, env))) {
    return new Response(LOGIN, { status: 401, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}
