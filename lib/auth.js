// 잠금 공통 함수. 다운로드 잠금(DOWNLOAD_KEY, 쿠키 dk)과 파이맨 전용 영역 잠금(ADMIN_KEY, 쿠키 ak)이 같이 쓴다.
// 비밀키는 Cloudflare 비밀 변수에만 있고, 쿠키에는 그 키로 만든 서명값만 담는다.
// seohae-hackaton/lib/teacher-auth.js와 같은 방식.

const COOKIE = 'dk';        // 다운로드 열림
const ADMIN_COOKIE = 'ak';  // 파이맨 전용 열림

export async function tokenFor(secret, label = 'piman-devapps-v1') {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(label));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function readCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([0-9a-f]{64})`));
  return m ? m[1] : null;
}

// ── 다운로드 잠금 ──
export async function isUnlocked(request, env) {
  if (!env.DOWNLOAD_KEY) return false;
  const c = readCookie(request, COOKIE);
  return !!c && sameText(c, await tokenFor(env.DOWNLOAD_KEY));
}

export function setCookie(token, name = COOKIE) {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

export function clearCookie(name = COOKIE) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ── 파이맨 전용 잠금 ──
// 다운로드 키와 다른 라벨로 서명해, 같은 값을 넣어도 서로의 쿠키가 통하지 않는다.
export const adminToken = secret => tokenFor(secret, 'piman-devapps-admin-v1');

export async function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false;
  const c = readCookie(request, ADMIN_COOKIE);
  return !!c && sameText(c, await adminToken(env.ADMIN_KEY));
}

export const setAdminCookie = token => setCookie(token, ADMIN_COOKIE);
export const clearAdminCookie = () => clearCookie(ADMIN_COOKIE);

// 바꾸는 요청은 같은 출처에서 온 것만 받는다(Origin이 있으면 반드시 같아야 한다).
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
