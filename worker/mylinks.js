// /my-links/ — Adrian's private bookmarks for pages that need a special link or password.
// Behind the same admin password and session as /list/ and /4916. Share links are built on the
// server from secrets, so nobody has to copy keys around by hand.
import { partnerShareLink } from './partnercourse.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function myLinks(env, origin) {
  const teamKey = String(env.TEAM_DASHBOARD_LINK_KEY || '').trim();
  return [
    { title: '合作课 Slide：Codex + Hermes 4 小时实作课', note: '和 Jason Thow 的半天课（12–4PM）。把这条链接发给 partner；打开后号码会自动从网址消失。', url: await partnerShareLink(env, origin), share: true },
    { title: '合作 Team Dashboard（AI 个人助理报名）', note: '给合作团队看的报名名单链接。', url: /^[A-Za-z0-9_-]{32,256}$/.test(teamKey) ? `${origin}/team/ai-personal-assistant#k=${teamKey}` : '', share: true },
    { title: '网页清单', note: '网站所有页面的目录（用管理员密码）。', url: `${origin}/list/` },
    { title: 'Aligor 管理后台', note: '报名、付款、问卷、发票（用管理员密码）。', url: `${origin}/4916` },
  ];
}

export function myLinksPage(links) {
  const cards = links.map((x, i) => `<article class="card"><h2>${esc(x.title)}</h2><p>${esc(x.note)}</p>${x.url
    ? `<div class="row"><input id="l${i}" readonly value="${esc(x.url)}"><button type="button" data-copy="l${i}">复制</button><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">打开</a></div>${x.share ? '<small>这是专属链接，只发给需要的人。</small>' : ''}`
    : '<p class="off">还没开通（服务器上没有设置这个链接）。</p>'}</article>`).join('');
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>我的私人链接｜Aligor</title><style>:root{color-scheme:light;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;--ink:#1A0E08;--mute:rgba(26,14,8,.6);--line:rgba(26,14,8,.12);--orange:#E8590C}*{box-sizing:border-box}body{margin:0;background:#F8F4EE;color:var(--ink)}main{max-width:880px;margin:0 auto;padding:40px 16px 60px}h1{margin:0 0 6px;font-size:1.9rem}header p{margin:0 0 26px;color:var(--mute)}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;margin:0 0 14px}.card h2{margin:0 0 6px;font-size:1.1rem}.card p{margin:0 0 12px;color:var(--mute);line-height:1.5}.row{display:flex;gap:8px;flex-wrap:wrap}input{flex:1 1 280px;min-width:0;font:inherit;font-size:.9rem;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#FBF8F4;color:var(--ink)}button,a{font:inherit;font-weight:700;padding:10px 16px;border-radius:10px;border:0;cursor:pointer;text-decoration:none}button{background:var(--ink);color:#fff}a{background:var(--orange);color:#fff}small{display:block;margin-top:8px;color:var(--mute)}.off{color:#a14b14}</style></head><body><main><header><h1>我的私人链接</h1><p>只有你登入后看得到。要给别人的链接，按「复制」再发出去。</p></header>${cards}</main><script>document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;const i=document.getElementById(b.dataset.copy);i.select();(navigator.clipboard?navigator.clipboard.writeText(i.value):Promise.reject()).catch(()=>document.execCommand('copy')).finally(()=>{b.textContent='已复制';setTimeout(()=>b.textContent='复制',1500)})})</script></body></html>`;
}
