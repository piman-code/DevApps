// 설치 파일을 사이트에 직접 올리기(「앱 관리」 화면). 저장소: R2 버킷 묶음 FILES(piman-devapps-files, 비공개).
// 파일은 'apps/<앱 id>/<os>/<올린 시각>-<파일 이름>' 으로 두고, 링크 값 'r2:<key>'(lib/catalog.js links-v1)가 가리킨다.
// 내보내는 곳은 functions/api/get.js 하나뿐이다(다운로드 잠금 뒤, 항상 첨부 파일로).
//
// ── 요금이 나오지 않게 하는 한도 ── Cloudflare에는 자동으로 막는 기능이 없어서 여기서 막는다.
// R2 무료 구간: 저장 10GB, 쓰기 요청 월 100만 건, 읽기 요청 월 1,000만 건, 전송 무료(2026-11 기준).
import { R2, R2_KEY, r2Key, ID, OSES } from '../site/private/catalog-rules.js';
export { R2, R2_KEY, r2Key };

const MB = 1024 * 1024, GB = 1024 * MB;
export const LIMIT_BYTES = 8 * GB;   // 버킷 전체. 넘으면 올리기를 거절한다(무료 10GB보다 여유 있게).
export const MAX_FILE = 2 * GB;      // 파일 하나
export const PART = 16 * MB;         // 조각 크기(요청 본문 한도 100MB보다 작게). 마지막 조각만 더 작을 수 있다.
export const EXTS = ['zip', 'exe', 'msi', 'dmg', 'pkg', '7z'];

// 보낸 파일 이름에서 영문·숫자·.-_ 만 남긴다. 확장자가 허용 목록에 없거나 남는 이름이 없으면 null.
export function cleanName(name) {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop(), dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  if (!EXTS.includes(ext)) return null;
  // 한글 이름처럼 남는 글자가 없으면 'file'로 둔다(무슨 파일인지는 앱·운영체제 폴더와 화면의 버전 칸이 알려 준다)
  const stem = base.slice(0, dot).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 70).replace(/[-.]+$/g, '') || 'file';
  return stem + '.' + ext;
}

// 서버가 정하는 파일 이름(key). 틀린 앱 id·os·파일 이름이면 null.
export function makeKey(app, os, name, now = Date.now()) {
  const clean = cleanName(name);
  if (typeof app !== 'string' || !ID.test(app) || !OSES.includes(os) || !clean) return null;
  const stamp = new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDhhmmss (UTC)
  const key = `apps/${app}/${os}/${stamp}-${clean}`;
  return R2_KEY.test(key) ? key : null;
}

// 내려받을 때 보여 줄 파일 이름(시각을 뗀 것)
export const fileName = key => key.split('/').pop().replace(/^[0-9]{14}-/, '');

// 버킷에 있는 파일 전부와 합계. 못 읽으면 던진다(용량을 모르는 채로 올리게 두지 않는다).
export async function usage(env) {
  const files = [];
  let cursor, used = 0;
  do {
    const r = await env.FILES.list({ cursor, limit: 1000 });
    for (const o of r.objects) { files.push({ key: o.key, size: o.size, uploaded: o.uploaded instanceof Date ? o.uploaded.toISOString() : null }); used += o.size; }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return { used, files };
}

// 링크 모음(links-v1의 links)이 가리키는 올린 파일 key들
export function keysIn(links) {
  const out = new Set();
  if (links && typeof links === 'object') for (const k of Object.keys(links)) { const key = r2Key(links[k]); if (key) out.add(key); }
  return out;
}
