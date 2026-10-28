// 密码保护的课程网页（/course/…）。密码放在 Cloudflare Secret COURSE_PASSWORD，不写进代码。
// 登入后发一个签名 cookie（用 SESSION_SECRET 签名，内容带 "course:" 前缀，不能拿来登入后台）。
const COOKIE = 'aligor_course';
const MAX_AGE = 12 * 3600;
const enc = new TextEncoder();

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
function same(a, b) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i]; return x === 0; }

// 先各自 HMAC 成固定长度再比较，避免泄露密码长度。
async function passwordOk(input, env) {
  if (!env.COURSE_PASSWORD || !env.SESSION_SECRET) return false;
  const a = await hmac(env.SESSION_SECRET, `pw:${input}`), b = await hmac(env.SESSION_SECRET, `pw:${env.COURSE_PASSWORD}`);
  return same(a, b);
}
async function makeCookie(env, exp) {
  const body = `course:${exp}`;
  return `${exp}.${b64url(await hmac(env.SESSION_SECRET, body))}`;
}
export async function isCourseUser(request, env) {
  if (!env.SESSION_SECRET || !env.COURSE_PASSWORD) return false;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const want = await hmac(env.SESSION_SECRET, `course:${exp}`);
  let got; try { got = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); } catch { return false; }
  return same(want, got);
}
const cookieHeader = (value, request, maxAge) => `${COOKIE}=${value}; Path=/; HttpOnly${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}; SameSite=Lax; Max-Age=${maxAge}`;
const safeNext = n => (typeof n === 'string' && /^\/course\/[A-Za-z0-9_\-./]*(\?[^\s]*)?(#\S*)?$/.test(n) && !n.includes('//') ? n : '/course/');
const baseHeaders = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };

export function coursePasswordPage({ error = '', next = '/course/', notSet = false } = {}) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>课程网页</title><style>
:root{--bg:#071A2D;--panel:#0E2742;--line:#2A5078;--cyan:#20D6E7;--white:#F7FBFF;--mist:#C9D9E8;--red:#FF6B6B}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;color:var(--white);font-family:"PingFang SC","Heiti SC","Microsoft YaHei",system-ui,sans-serif;background:radial-gradient(800px 500px at 80% -10%,rgba(32,214,231,.25),transparent 70%),radial-gradient(600px 400px at -10% 110%,rgba(124,140,255,.22),transparent 70%),var(--bg)}
.card{width:min(420px,100%);padding:34px 30px;border-radius:26px;background:linear-gradient(160deg,#12314F,var(--panel));border:1px solid var(--line);box-shadow:0 30px 70px -30px #000;text-align:center}
.emoji{font-size:54px;animation:bob 3s ease-in-out infinite}@keyframes bob{50%{transform:translateY(-8px) rotate(-5deg)}}
h1{margin:10px 0 6px;font-size:26px}p{margin:0 0 20px;color:var(--mist);font-size:15px}
input{width:100%;padding:14px 16px;border-radius:14px;border:2px solid var(--line);background:#081d33;color:var(--white);font:600 17px inherit;text-align:center;outline:none}
input:focus{border-color:var(--cyan)}button{margin-top:14px;width:100%;padding:14px;border:0;border-radius:14px;background:var(--cyan);color:#04111f;font:800 17px inherit;cursor:pointer}
.err{margin-top:14px;color:var(--red);font-weight:700;font-size:14px}</style></head><body>
<form class="card" method="post" action="/api/course/login"><div class="emoji">🔐</div><h1>课程网页</h1><p>输入密码，进入一天实作课</p>
<input type="hidden" name="next" value="${esc(next)}"><input type="password" name="password" placeholder="密码" autocomplete="current-password" ${notSet ? 'disabled' : 'autofocus required'}>
<button ${notSet ? 'disabled' : ''}>进入</button>${notSet ? '<div class="err">服务器还没有设置密码，暂时不能进入。</div>' : error ? `<div class="err">${esc(error)}</div>` : ''}</form></body></html>`;
}
const htmlResponse = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", ...baseHeaders, ...extra } });

export async function handleCourse(request, env) {
  const url = new URL(request.url), path = url.pathname;
  const configured = Boolean(env.COURSE_PASSWORD && env.SESSION_SECRET);

  if (path === '/api/course/login' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const next = safeNext(String(form?.get('next') || ''));
    if (!configured) return htmlResponse(coursePasswordPage({ notSet: true }), 503);
    if (!await passwordOk(String(form?.get('password') || ''), env)) {
      await new Promise(r => setTimeout(r, 700)); // 拖慢乱猜
      return htmlResponse(coursePasswordPage({ error: '密码不对，请再试一次', next }), 401);
    }
    const exp = Date.now() + MAX_AGE * 1000;
    return new Response(null, { status: 303, headers: { location: next, 'set-cookie': cookieHeader(await makeCookie(env, exp), request, MAX_AGE), ...baseHeaders } });
  }
  if (path === '/api/course/logout' && request.method === 'POST') {
    return new Response(null, { status: 303, headers: { location: '/course/login', 'set-cookie': cookieHeader('', request, 0), ...baseHeaders } });
  }
  if (path === '/course') return new Response(null, { status: 301, headers: { location: '/course/' } });
  if (path === '/course/login') {
    if (await isCourseUser(request, env)) return new Response(null, { status: 302, headers: { location: '/course/', ...baseHeaders } });
    return htmlResponse(coursePasswordPage({ notSet: !configured, next: safeNext(url.searchParams.get('next') || '') }));
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: baseHeaders });
  if (!await isCourseUser(request, env)) {
    return new Response(null, { status: 302, headers: { location: `/course/login?next=${encodeURIComponent(path + url.search)}`, ...baseHeaders } });
  }
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(baseHeaders)) out.headers.set(k, v);
  out.headers.set('cache-control', 'private, no-store');
  return out;
}
