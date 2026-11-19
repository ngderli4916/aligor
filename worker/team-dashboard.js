// Read-only team board for the AI Personal Assistant partner course.
// Two ways in, both checked on the server before any lead data is returned:
//  1. Shared team link (Adrian's choice, 2026-11-20): /team/ai-personal-assistant#k=<key>.
//     The key sits after '#', so browsers never send it in the page request, Referer or logs;
//     the page script sends it only as a header to the data API, compared to the
//     TEAM_DASHBOARD_LINK_KEY secret. Rotating that secret revokes the old link.
//  2. Cloudflare Access application JWT (signature, issuer, audience, expiry) + email allowlist.
// With neither configured, or a missing/wrong key/token, no lead data is returned.
import { AI_AGENT_BATCH, leadCode } from './notify.js';

export const TEAM_DASHBOARD_PATH = '/team/ai-personal-assistant';
export const TEAM_DASHBOARD_API = `${TEAM_DASHBOARD_PATH}/api/registrations`;
// Fixed on the server. No request parameter can widen or switch this filter.
const SOURCE = 'ai-agent-registration';
const MAX_ROWS = 2000;
const CLOCK_SKEW_S = 60;
const CERTS_TTL_MS = 10 * 60 * 1000;
const LINK_KEY_HEADER = 'x-team-link-key';

const NO_STORE = {
  'cache-control': 'no-store, no-cache, must-revalidate, private, max-age=0',
  pragma: 'no-cache',
  expires: '0',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8' } });
const htmlResponse = (body, status = 200) => new Response(body, { status, headers: { ...NO_STORE, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PAGE_CSP } });

export function isTeamDashboardPath(path) {
  return path === TEAM_DASHBOARD_PATH || path.startsWith(`${TEAM_DASHBOARD_PATH}/`);
}

export async function teamDashboardRoute(request, env) {
  const path = new URL(request.url).pathname;
  const isApi = path === TEAM_DASHBOARD_API;
  const isPage = path === TEAM_DASHBOARD_PATH || path === `${TEAM_DASHBOARD_PATH}/`;
  if (!isApi && !isPage) return jsonResponse({ ok: false, error: 'Not found' }, 404);
  if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  if (isPage) {
    // The page shell carries no lead data. In shared-link mode the key is in the URL fragment,
    // which the server never sees, so the shell is served and the data API does the check.
    if (linkKey(env)) return htmlResponse(dashboardPage());
    const access = await verifyTeamAccess(request, env);
    return access.ok ? htmlResponse(dashboardPage()) : htmlResponse(deniedPage(access), access.status);
  }
  const access = await verifyTeamAccess(request, env);
  if (!access.ok) return jsonResponse({ ok: false, error: access.message }, access.status);
  try {
    return jsonResponse({ ok: true, ...(await listCourseRegistrations(env)) });
  } catch (error) {
    // Never log lead rows or tokens; the error class/message is enough to debug.
    console.error('team_dashboard_read_failed', String(error?.name || 'Error'));
    return jsonResponse({ ok: false, error: '暂时无法读取报名名单，请稍后再按刷新。' }, 500);
  }
}

// ---------- data ----------

export async function listCourseRegistrations(env) {
  const where = "WHERE batch=? AND source=? AND status!='cancelled'";
  const binds = [AI_AGENT_BATCH, SOURCE];
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM leads ${where}`).bind(...binds).first())?.n || 0;
  const rows = (await env.DB.prepare(`SELECT id,name,company,industry,phone_e164,created_at FROM leads ${where} ORDER BY created_at DESC, id DESC LIMIT ${MAX_ROWS}`).bind(...binds).all()).results || [];
  return {
    total,
    registrations: rows.map(row => ({
      code: `#${leadCode(row.id)}`,
      name: String(row.name || ''),
      company: String(row.company || ''),
      industry: String(row.industry || ''),
      phone_last4: phoneLast4(row.phone_e164),
      registered_at: String(row.created_at || ''),
      registered_at_myt: malaysiaTime(row.created_at),
    })),
    fetched_at_myt: malaysiaTime(new Date().toISOString()),
  };
}

export function phoneLast4(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

export function malaysiaTime(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 8 * 3600e3), p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// ---------- access ----------

function teamConfig(env) {
  const domain = String(env.TEAM_ACCESS_TEAM_DOMAIN || '').trim().replace(/\/+$/, '');
  const aud = String(env.TEAM_ACCESS_AUD || '').trim();
  const members = new Set(String(env.TEAM_DASHBOARD_EMAILS || '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => x.includes('@')));
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain) || !aud || !members.size) return null;
  return { domain, aud, members };
}

function linkKey(env) {
  const key = String(env.TEAM_DASHBOARD_LINK_KEY || '').trim();
  return /^[A-Za-z0-9_-]{32,256}$/.test(key) ? key : null;
}

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text))));
}

async function sameSecret(given, expected) {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyTeamAccess(request, env) {
  const key = linkKey(env), given = request.headers.get(LINK_KEY_HEADER);
  if (given !== null) {
    if (key && given.length <= 512 && await sameSecret(given, key)) return { ok: true, via: 'link' };
    return { ok: false, status: 401, reason: 'bad_link', message: '链接无效或已更换，请向 Adrian 拿最新的看板链接。' };
  }
  const config = teamConfig(env);
  if (!config) {
    if (key) return { ok: false, status: 401, reason: 'no_link_key', message: '链接不完整，请从团队群重新打开完整的看板链接。' };
    return { ok: false, status: 503, reason: 'not_configured', message: '团队看板尚未完成访问设置。' };
  }
  const token = request.headers.get('cf-access-jwt-assertion') || '';
  if (!token) return { ok: false, status: 401, reason: 'no_token', message: '请先通过团队登录。' };
  let claims;
  try { claims = await verifyAccessJwt(token, config); }
  catch { return { ok: false, status: 401, reason: 'invalid_token', message: '登录已失效，请重新打开页面登录。' }; }
  const email = String(claims.email || '').trim().toLowerCase();
  if (!email || !config.members.has(email)) return { ok: false, status: 403, reason: 'not_member', message: '这个账号没有查看权限。' };
  return { ok: true, via: 'access', email };
}

const b64urlBytes = text => {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const b64urlJson = text => JSON.parse(new TextDecoder().decode(b64urlBytes(text)));

async function verifyAccessJwt(token, config) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('format');
  const header = b64urlJson(parts[0]), claims = b64urlJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  const key = await accessKey(config.domain, header.kid);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('signature');
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== config.domain) throw new Error('iss');
  if (!aud.includes(config.aud)) throw new Error('aud');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) throw new Error('exp');
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > now) throw new Error('nbf');
  return claims;
}

const certCache = new Map(); // domain -> {at, keys: Map(kid -> CryptoKey)}
async function accessKey(domain, kid) {
  let entry = certCache.get(domain);
  if (!entry || Date.now() - entry.at > CERTS_TTL_MS || !entry.keys.has(kid)) {
    // Fetch on miss so Access key rotation is picked up without a deploy.
    const res = await fetch(`${domain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error('certs');
    const body = await res.json(), keys = new Map();
    for (const jwk of body.keys || []) {
      if (jwk.kty !== 'RSA' || !jwk.kid) continue;
      keys.set(jwk.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    entry = { at: Date.now(), keys };
    certCache.set(domain, entry);
  }
  const key = entry.keys.get(kid);
  if (!key) throw new Error('kid');
  return key;
}

// ---------- pages ----------

const BASE_CSS = `*{box-sizing:border-box}:root{--bg:#f4f6f8;--card:#fff;--ink:#14212b;--muted:#5b6b78;--line:#dde3e8;--accent:#0f6e8c;--accent-ink:#fff;--warn-bg:#fff4e5;--warn:#8a4b00;--err-bg:#fdecec;--err:#9b1c1c}
@media(prefers-color-scheme:dark){:root{--bg:#0b141c;--card:#121f2a;--ink:#e8eff5;--muted:#9fb2c2;--line:#26384a;--accent:#56c8e6;--accent-ink:#06131c;--warn-bg:#33240d;--warn:#ffcf8a;--err-bg:#3a1414;--err:#ffb4b4}}
html{color-scheme:light dark}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}`;

function deniedPage(access) {
  const title = access.status === 503 ? '看板尚未开放' : access.status === 403 ? '没有查看权限' : '需要团队登录';
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${title}</title><style>${BASE_CSS}main{max-width:440px;margin:12vh auto;padding:0 16px}h1{font-size:1.4rem;margin:0 0 .5rem}p{color:var(--muted);margin:0}</style></head><body><main><h1>${title}</h1><p>${access.message}</p></main></body></html>`;
}

function dashboardPage() {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>团队报名看板</title>
<style>${BASE_CSS}
header,main{max-width:1100px;margin:0 auto;padding:0 16px}
header{padding-top:24px}.eyebrow{margin:0;color:var(--accent);font-size:.78rem;font-weight:700;letter-spacing:.08em}h1{margin:.2rem 0 1rem;font-size:clamp(1.4rem,4vw,1.9rem);letter-spacing:-.01em}
.summary{display:flex;min-width:0;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.total{margin:0}.total b{display:block;font-size:2.6rem;line-height:1;font-variant-numeric:tabular-nums}.total span{color:var(--muted);font-size:.85rem}
.meta{color:var(--muted);font-size:.8rem;margin:.35rem 0 0;overflow-wrap:anywhere}
.tools{display:flex;gap:8px;margin:16px 0 12px}.tools input{flex:1;min-width:0;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.6rem .8rem}
button{font:inherit;font-weight:650;border:0;border-radius:10px;background:var(--accent);color:var(--accent-ink);padding:.6rem 1rem;min-height:44px;cursor:pointer;white-space:nowrap}button:disabled{opacity:.6;cursor:wait}
input:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.notice{border-radius:10px;padding:.75rem 1rem;margin:0 0 12px}.notice.warn{background:var(--warn-bg);color:var(--warn)}.notice.err{background:var(--err-bg);color:var(--err)}.notice:empty{display:none}
.count{color:var(--muted);font-size:.85rem;margin:0 0 8px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
th,td{text-align:left;padding:.7rem .85rem;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.78rem;color:var(--muted);font-weight:650;background:color-mix(in srgb,var(--card) 92%,var(--ink))}tr:last-child td{border-bottom:0}
td.code,td.phone,td.time{font-variant-numeric:tabular-nums;white-space:nowrap}td.code{font-weight:650}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:2rem 1rem;text-align:center;color:var(--muted)}
footer{max-width:1100px;margin:0 auto;padding:16px;color:var(--muted);font-size:.78rem}
@media(max-width:720px){
 table,tbody{display:block;width:100%}td{display:block;min-width:0;overflow-wrap:anywhere}table{background:none;border:0}thead{display:none}
 tr{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0 0 10px;display:grid;grid-template-columns:1fr auto;gap:2px 12px}
 td{border:0;padding:0}td.name{grid-column:1;font-weight:700;font-size:1.05rem}td.code{grid-column:2;grid-row:1;text-align:right;color:var(--muted);font-size:.85rem;white-space:nowrap}
 td.company,td.industry,td.phone,td.time{grid-column:1/-1;font-size:.9rem}td[data-label]:before{content:attr(data-label)"：";color:var(--muted)}
}
[hidden]{display:none!important}
</style></head><body>
<header><p class="eyebrow">团队看板 · 只读</p><h1>AI 个人助理｜报名名单</h1>
<section class="summary" aria-live="polite"><p class="total"><span>有效报名</span><b id="total">—</b></p><p class="meta" id="meta">读取中…</p></section></header>
<main><div class="tools"><input id="q" type="search" placeholder="搜索姓名或公司" aria-label="搜索姓名或公司" autocomplete="off"><button id="refresh" type="button">刷新</button></div>
<p id="notice" class="notice" role="alert"></p><p id="count" class="count"></p>
<div id="empty" class="empty" hidden></div>
<table id="table" hidden><thead><tr><th>报名 ID</th><th>姓名</th><th>公司</th><th>行业</th><th>联系电话</th><th>报名时间（UTC+8）</th></tr></thead><tbody id="rows"></tbody></table></main>
<footer>只显示「AI 个人助理」课程的有效报名（已排除取消）。电话只显示尾四位。</footer>
<script>
const $=s=>document.querySelector(s),q=$('#q'),btn=$('#refresh'),rows=$('#rows'),table=$('#table'),empty=$('#empty'),notice=$('#notice'),count=$('#count');
let list=[],loaded=false;
let linkKey=new URLSearchParams(location.hash.slice(1)).get('k');
const cell=(cls,text,label)=>{const td=document.createElement('td');td.className=cls;td.textContent=text;if(label)td.dataset.label=label;return td};
function render(){
  const term=q.value.trim().toLowerCase();
  const shown=term?list.filter(r=>r.name.toLowerCase().includes(term)||r.company.toLowerCase().includes(term)):list;
  rows.replaceChildren(...shown.map(r=>{const tr=document.createElement('tr');tr.append(cell('code',r.code),cell('name',r.name),cell('company',r.company||'—','公司'),cell('industry',r.industry||'—','行业'),cell('phone',r.phone_last4?'•••• '+r.phone_last4:'—','电话'),cell('time',r.registered_at_myt,'报名时间'));return tr}));
  const none=loaded&&!shown.length;
  table.hidden=!shown.length;empty.hidden=!none;
  empty.textContent=list.length?'没有符合「'+q.value.trim()+'」的报名。':'目前还没有人报名。';
  count.textContent=loaded&&list.length?(term?'找到 '+shown.length+' / '+list.length+' 笔':'共 '+list.length+' 笔，按报名时间由新到旧'):'';
}
async function load(){
  btn.disabled=true;btn.textContent='读取中…';notice.textContent='';notice.className='notice';
  try{
    const res=await fetch('${TEAM_DASHBOARD_API}',{cache:'no-store',credentials:'same-origin',headers:linkKey?{accept:'application/json','${LINK_KEY_HEADER}':linkKey}:{accept:'application/json'}});
    let data=null;try{data=await res.json()}catch{}
    if(!res.ok||!data||!data.ok){
      notice.className='notice '+(res.status===401||res.status===403?'warn':'err');
      notice.textContent=(data&&data.error)||(res.status===401?'链接无效或已失效，请向 Adrian 拿最新的看板链接。':'读取失败，请稍后再按刷新。');
      if(res.status===401||res.status===403){list=[];loaded=false;$('#total').textContent='—';$('#meta').textContent='';}
      else $('#meta').textContent=loaded?'以下仍是上次读取的名单':'';
      return;
    }
    list=data.registrations;loaded=true;
    $('#total').textContent=data.total;$('#meta').textContent='更新于 '+data.fetched_at_myt+'（马来西亚时间）';
  }catch{
    notice.className='notice err';notice.textContent='网络连接失败，请检查网络后再按刷新。';
    $('#meta').textContent=loaded?'以下仍是上次读取的名单':'';
  }finally{btn.disabled=false;btn.textContent='刷新';render()}
}
q.addEventListener('input',render);btn.addEventListener('click',load);
addEventListener('hashchange',()=>{linkKey=new URLSearchParams(location.hash.slice(1)).get('k');list=[];loaded=false;$('#total').textContent='—';load()});load();
</script></body></html>`;
}
