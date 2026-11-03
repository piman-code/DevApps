// 다운로드 잠금 공통 함수.
// 비밀키(DOWNLOAD_KEY)는 Cloudflare 비밀 변수에만 있고, 쿠키에는 그 키로 만든 서명값만 담는다.
// seohae-hackaton/lib/teacher-auth.js와 같은 방식.

const COOKIE = 'dk';

export async function tokenFor(secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('piman-devapps-v1'));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function isUnlocked(request, env) {
  if (!env.DOWNLOAD_KEY) return false;
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)dk=([0-9a-f]{64})/);
  return !!m && sameText(m[1], await tokenFor(env.DOWNLOAD_KEY));
}

export function setCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
