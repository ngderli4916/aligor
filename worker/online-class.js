import { csvEscape, normalizePhone } from './lib.js';

export const ONLINE_PATH = '/online-class';
export const ONLINE_API = '/api/online-class/check-in';
const SESSION = 'KL-1129';
const START = Date.parse('2026-11-29T00:00:00+08:00');
const END = Date.parse('2026-11-30T00:00:00+08:00');
const EVENT = 'online_class_checkin_20261129';
const deny = (status, error) => ({ status, body: { ok: false, error } });
const unavailable = () => deny(503, '签到暂时无法使用，请联系老师。');

export async function verifyOnlineClass(request, env, now = Date.now()) {
  if (now < START || now >= END) return deny(403, '签到只在 11 月 29 日（马来西亚时间）开放。');
  let zoom;
  try { zoom = new URL(await env.ONLINE_CLASS_1129_ZOOM_URL.get()); } catch { return unavailable(); }
  if (zoom.protocol !== 'https:' || !/(^|\.)zoom\.us$/i.test(zoom.hostname) || zoom.username || zoom.password || zoom.port || !/^\/j\/\d+\/?$/.test(zoom.pathname)) return unavailable();
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !env.ONLINE_CLASS_LIMIT) return unavailable();
  if (!(await env.ONLINE_CLASS_LIMIT.limit({key: ip})).success) return deny(429, '尝试次数太多，请稍后再试。');
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '') || request.headers.get('origin') !== new URL(request.url).origin) return deny(400, '请从课程签到页面提交。');
  let phone;
  try {
    const length = Number(request.headers.get('content-length'));
    if (length > 512 || !request.body) throw new Error();
    const reader = request.body.getReader(); const bytes = new Uint8Array(512); let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > bytes.length) { await reader.cancel(); throw new Error(); }
        bytes.set(value, offset); offset += value.length;
      }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(new TextDecoder().decode(bytes.subarray(0, offset)));
    if (typeof body?.phone !== 'string' || !/^[+\d ().-]{8,30}$/.test(body.phone.trim())) throw new Error();
    phone = normalizePhone(body.phone);
  } catch { return deny(400, '请输入报名时使用的有效 WhatsApp 号码。'); }
  const rows = (await env.DB.prepare(`
    SELECT id, 'primary' AS slot FROM class_registrations
    WHERE session_code=? AND payment_status='payment_confirmed' AND registration_status='registered' AND primary_phone_normalized=?
    UNION ALL
    SELECT id, 'second' AS slot FROM class_registrations
    WHERE session_code=? AND payment_status='payment_confirmed' AND registration_status='registered' AND participant_count=2 AND second_phone_normalized=?
    LIMIT 2`).bind(SESSION, phone, SESSION, phone).all()).results;
  if (rows.length !== 1) return deny(404, '无法核对本场报名，请检查号码或联系老师。');
  const { id, slot } = rows[0];
  await env.DB.prepare(`INSERT INTO class_registration_events (registration_id,event_type,actor,details,created_at)
    SELECT ?,?,?,?,? WHERE NOT EXISTS (
      SELECT 1 FROM class_registration_events WHERE registration_id=? AND event_type=? AND details=?
    )`).bind(id, EVENT, 'customer', slot, new Date(now).toISOString(), id, EVENT, slot).run();
  return { status: 200, body: { ok: true, join_url: zoom.href } };
}

export async function onlineClassCsv(env) {
  const { results } = await env.DB.prepare(`SELECT r.public_order_id AS order_id,
    CASE e.details WHEN 'primary' THEN r.primary_name ELSE r.second_name END AS name,
    MIN(e.created_at) AS checked_in_utc FROM class_registration_events e JOIN class_registrations r ON r.id=e.registration_id
    WHERE e.event_type=? AND r.session_code=? AND e.details IN ('primary','second')
    GROUP BY r.id,e.details ORDER BY checked_in_utc,r.id,e.details`).bind(EVENT, SESSION).all();
  const safe = value => csvEscape(/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(String(value??'')) ? "'" + value : value);
  return '\uFEFF'+['order_id,name,check_in_myt', ...results.map(r=>[
    r.order_id,r.name,new Date(Date.parse(r.checked_in_utc)+8*3600_000).toISOString().replace('Z','+08:00')
  ].map(safe).join(','))].join('\r\n');
}

export function onlineClassPage() {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>阿理哥｜Online Class 签到</title><style>
  *{box-sizing:border-box}body{margin:0;background:#fbf7ed;color:#241b14;font:16px/1.6 system-ui,sans-serif}main{width:min(100% - 32px,560px);margin:clamp(24px,8vh,85px) auto}.brand{font-weight:800}.tag{color:#684800;background:#fff0ba;border-radius:16px;padding:4px 12px;display:inline-block}h1{font-size:clamp(32px,8vw,50px);line-height:1.12;margin:18px 0 10px}.panel{margin:24px 0;background:white;padding:clamp(16px,5vw,30px);border:1px solid #e8dcc8;border-radius:20px}label{display:block;font-weight:700}input{width:100%;margin:10px 0;padding:12px;border:1px solid #756956;border-radius:9px;font:inherit}button,#join{display:block;width:100%;padding:12px;text-align:center;background:#ffc93c;color:#211a12;border:1px solid #241b14;border-radius:10px;font:inherit;font-weight:800;cursor:pointer}button:disabled{opacity:.6}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #a04809;outline-offset:3px}small{color:#635a50}.error{color:#9d2418}[hidden]{display:none!important}</style></head>
  <body><main><p class="brand">阿理哥 · Aligor</p><p class="tag">ONLINE CLASS</p><h1>AI Agent 一天实战课</h1><p>2026 年 11 月 29 日（星期日）｜Zoom 会议 8:30 AM（马来西亚时间）</p>
  <form class="panel" id="checkin" method="post" action="${ONLINE_API}"><label>报名时的 WhatsApp 号码<input required type="tel" name="phone" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="01… / +601…"></label><button type="submit">验证号码并签到</button><p id="status" role="status"></p><small>号码只用于核对本场报名及记录签到，不会公开显示。</small></form>
  <section class="panel" id="success" hidden><h2 tabindex="-1">签到成功</h2><p>点击下方打开 Zoom。</p><a id="join" rel="noreferrer noopener" href="#">进入 Zoom</a></section><noscript>请启用 JavaScript 后再签到，或联系老师。</noscript>
  <script>const f=document.querySelector('#checkin'),s=document.querySelector('#status'),b=f.querySelector('button'),done=document.querySelector('#success');f.addEventListener('submit',async e=>{e.preventDefault();b.disabled=true;s.className='';s.textContent='正在核对报名资料…';try{const res=await fetch(f.action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:f.elements.phone.value}),cache:'no-store'});const data=await res.json();if(!res.ok||!data.join_url){s.textContent=data.error||'暂时无法签到，请重试。';s.className='error';return;}document.querySelector('#join').href=data.join_url;f.reset();f.hidden=true;done.hidden=false;done.querySelector('h2').focus();}catch{s.className='error';s.textContent='暂时无法连线，请重试。';}finally{b.disabled=false;}});</script></main></body></html>`;
}
