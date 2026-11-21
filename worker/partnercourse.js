// Partner course slides at /codexhermes-4hr-class/ (Codex + Hermes 4-hour class with Jason Thow).
// No password (Adrian's choice, 2026-11-21): the share link carries a key,
//   /codexhermes-4hr-class/?k=<key>
// The key is derived on the server from SESSION_SECRET and PARTNER_COURSE_LINK_VERSION (or taken from the
// optional secret PARTNER_COURSE_LINK_KEY), so nobody has to type or store it; Adrian copies the full link
// from the admin-only page /my-links/. A matching key sets a signed cookie and redirects to the clean URL,
// so the key leaves the address bar at once. Bumping PARTNER_COURSE_LINK_VERSION revokes old links and cookies.
// The cookie is signed with a key derived from SESSION_SECRET, so it can never act as an admin session.

export const PARTNER_COURSE_PATH = '/codexhermes-4hr-class';
const COOKIE = 'aligor_partner_course';
const MAX_AGE = 7 * 24 * 3600;

export function isPartnerCoursePath(path) {
  return path === PARTNER_COURSE_PATH || path.startsWith(PARTNER_COURSE_PATH + '/');
}

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const keyFor = env => `${env.SESSION_SECRET}|partner-course|codexhermes-4hr-class`;
export async function partnerLinkKey(env) {
  if (env.PARTNER_COURSE_LINK_KEY) return String(env.PARTNER_COURSE_LINK_KEY);
  if (!env.SESSION_SECRET) return '';
  return (await hmac(keyFor(env), `link|${env.PARTNER_COURSE_LINK_VERSION || '1'}`)).slice(0, 22);
}
export async function partnerShareLink(env, origin) {
  const key = await partnerLinkKey(env);
  return key ? `${origin}${PARTNER_COURSE_PATH}/?k=${encodeURIComponent(key)}` : '';
}
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
// The cookie also binds a fingerprint of the current link key, so rotating the key logs everyone out.
async function issue(env, linkKey) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ scope: 'codexhermes-4hr-class', kv: await hmac(keyFor(env), 'kv|' + linkKey), exp: Date.now() + MAX_AGE * 1000 })));
  return `${body}.${await hmac(keyFor(env), body)}`;
}
async function hasSession(request, env, linkKey) {
  const token = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))?.[1];
  if (!token) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig || !(await sameText(sig, await hmac(keyFor(env), body)))) return false;
  try {
    const d = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return d.scope === 'codexhermes-4hr-class' && d.exp > Date.now() && await sameText(d.kv, await hmac(keyFor(env), 'kv|' + linkKey));
  } catch { return false; }
}

const PAGE_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" };

export function partnerClosedPage(message, status) {
  const body = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Codex + Hermes 4 小时实作课</title><style>:root{color-scheme:dark;font-family:system-ui,-apple-system,"PingFang SC",sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071a2d;color:#f7fbff;padding:20px}main{width:min(440px,100%);background:#0e2742;border:1px solid #2a5078;border-radius:22px;padding:30px}h1{margin:0 0 10px;font-size:1.4rem}p{color:#c9d9e8;margin:0;line-height:1.6}</style></head><body><main><h1>Codex + Hermes 4 小时实作课</h1><p>${message}</p></main></body></html>`;
  return new Response(body, { status, headers: PAGE_HEADERS });
}

export async function partnerCourseRoute(request, env) {
  const url = new URL(request.url), path = url.pathname;
  const linkKey = await partnerLinkKey(env);
  if (!linkKey || !env.SESSION_SECRET) return partnerClosedPage('课程页面暂未开放。', 503);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });

  if (url.searchParams.has('k')) {
    if (!(await sameText(url.searchParams.get('k').slice(0, 200), linkKey))) return partnerClosedPage('这个链接已失效，请向 Adrian 索取最新链接。', 401);
    url.searchParams.delete('k');
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    const target = (path === PARTNER_COURSE_PATH ? PARTNER_COURSE_PATH + '/' : path) + (url.search || '');
    return new Response(null, { status: 303, headers: { location: target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'set-cookie': `${COOKIE}=${await issue(env, linkKey)}; Path=${PARTNER_COURSE_PATH}; HttpOnly${secure}; SameSite=Lax; Max-Age=${MAX_AGE}` } });
  }
  if (!(await hasSession(request, env, linkKey))) return partnerClosedPage('请用 Adrian 给你的专属链接打开这个课程。', 401);
  if (path === PARTNER_COURSE_PATH) return Response.redirect(`${url.origin}${PARTNER_COURSE_PATH}/`, 302);
  const page = await env.ASSETS.fetch(request), headers = new Headers(page.headers);
  headers.set('cache-control', 'private, no-store'); headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(page.body, { status: page.status, headers });
}
