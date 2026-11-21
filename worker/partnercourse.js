// Password-protected partner course slides at /codexhermes-4hr-class/ (Codex + Hermes 4-hour class).
// The password lives in the Cloudflare secret PARTNER_COURSE_PASSWORD (Adrian sets it himself).
// While it is unset, the slides stay closed. The session cookie is signed with a key derived
// from SESSION_SECRET, so it can never be used as an admin session.

export const PARTNER_COURSE_PATH = '/codexhermes-4hr-class';
const COOKIE = 'aligor_partner_course';
const LOGIN_API = '/api/codexhermes-4hr-class/login';
const MAX_AGE = 12 * 3600;

export function isPartnerCoursePath(path) {
  return path === PARTNER_COURSE_PATH || path.startsWith(PARTNER_COURSE_PATH + '/') || path === LOGIN_API;
}

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const keyFor = env => `${env.SESSION_SECRET}|partner-course|codexhermes-4hr-class`;
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
async function sameText(a, b) {
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(v)))));
  const p = new Uint8Array(x), q = new Uint8Array(y); let d = 0;
  for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}
async function issue(env) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ scope: 'codexhermes-4hr-class', exp: Date.now() + MAX_AGE * 1000 })));
  return `${body}.${await hmac(keyFor(env), body)}`;
}
async function hasSession(request, env) {
  const token = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))?.[1];
  if (!token) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig || !(await sameText(sig, await hmac(keyFor(env), body)))) return false;
  try { const d = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))); return d.scope === 'codexhermes-4hr-class' && d.exp > Date.now(); } catch { return false; }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PAGE_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };

export function partnerLoginPage(message = '', status = 200) {
  const body = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>课程登入｜Codex + Hermes 4 小时实作课</title><style>:root{color-scheme:dark;font-family:system-ui,-apple-system,"PingFang SC",sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071a2d;color:#f7fbff;padding:20px}form{width:min(420px,100%);background:#0e2742;border:1px solid #2a5078;border-radius:22px;padding:30px}h1{margin:0 0 6px;font-size:1.5rem}p{color:#c9d9e8;margin:0}label{display:block;margin:22px 0 8px}input,button{width:100%;font:inherit;padding:13px;border-radius:11px}input{background:#071a2d;color:#fff;border:1px solid #2a5078}button{margin-top:14px;border:0;background:#20d6e7;color:#071a2d;font-weight:800;cursor:pointer}.msg{color:#ffb45c;margin-top:14px}</style></head><body><form method="post" action="${LOGIN_API}"><h1>Codex + Hermes 4 小时实作课</h1><p>请输入课程密码继续。</p>${message ? `<p class="msg">${esc(message)}</p>` : ''}<label for="password">密码</label><input id="password" name="password" type="password" required autocomplete="current-password" autofocus><button type="submit">进入课程</button></form></body></html>`;
  return new Response(body, { status, headers: PAGE_HEADERS });
}

export async function partnerCourseRoute(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (!env.PARTNER_COURSE_PASSWORD || !env.SESSION_SECRET) return partnerLoginPage('课程页面暂未开放', 503);

  if (path === LOGIN_API) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const form = await request.formData().catch(() => null);
    const password = String(form?.get('password') || '').slice(0, 200);
    if (!(await sameText(password, env.PARTNER_COURSE_PASSWORD))) return partnerLoginPage('密码不正确，请再试一次。', 401);
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return new Response(null, { status: 303, headers: { location: PARTNER_COURSE_PATH + '/',
      'set-cookie': `${COOKIE}=${await issue(env)}; Path=${PARTNER_COURSE_PATH}; HttpOnly${secure}; SameSite=Lax; Max-Age=${MAX_AGE}` } });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
  if (!(await hasSession(request, env))) return partnerLoginPage('', 401);
  if (path === PARTNER_COURSE_PATH) return Response.redirect(`${url.origin}${PARTNER_COURSE_PATH}/`, 302);
  const page = await env.ASSETS.fetch(request), headers = new Headers(page.headers);
  headers.set('cache-control', 'private, no-store'); headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(page.body, { status: page.status, headers });
}
