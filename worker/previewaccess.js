import { normalizePhone } from './lib.js';

const noAccess = () => ({ status: 404, body: { ok: false, error: '找不到这场 Preview 的报名记录，请检查号码后再试。' } });
const nowIso = () => new Date().toISOString();

export function previewAccessPage() {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Aligor AI Agent Preview 入场</title><style>
  @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@700;900&display=swap");
  :root{--ink:#17120f;--muted:#6d665e;--paper:#fbf7ed;--card:#fff;--yellow:#ffc93c;--green:#147568;--line:#e7dfce;--red:#b42318;--sans:"Noto Sans SC","PingFang SC",system-ui,sans-serif;--serif:"Noto Serif SC","Songti SC",serif}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top right,#fff2bd 0,transparent 34%),var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.65;-webkit-font-smoothing:antialiased}
  main{width:min(620px,calc(100% - 28px));margin:0 auto;padding:28px 0 56px}.brand{display:flex;align-items:center;gap:10px;font-weight:900}.brand:before{content:"";width:34px;height:34px;background:url(/assets/logos/aligor-logo-transparent.png) center/contain no-repeat}
  .hero{padding:46px 2px 24px}.tag{display:inline-flex;padding:6px 12px;border-radius:999px;background:#fff3c7;color:#745500;font-size:13px;font-weight:800}.hero h1{font:900 clamp(34px,8vw,54px)/1.16 var(--serif);margin:14px 0 12px}.hero p{font-size:18px;color:#3e3934;margin:0}
  .card{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:28px;box-shadow:0 20px 60px -34px rgba(23,18,15,.45)}label{display:grid;gap:8px;font-weight:800}input{width:100%;padding:14px 16px;border:1.5px solid #d7cebb;border-radius:13px;font:500 17px var(--sans);color:var(--ink);background:#fff}input:focus{outline:3px solid var(--yellow);outline-offset:1px;border-color:var(--ink)}
  button,.join{display:flex;width:100%;align-items:center;justify-content:center;margin-top:18px;padding:14px 22px;border:2px solid var(--ink);border-radius:999px;background:var(--yellow);color:var(--ink);font:800 16px var(--sans);text-decoration:none;cursor:pointer}button:hover,.join:hover{transform:translateY(-2px);box-shadow:0 5px 0 var(--ink)}button:disabled{opacity:.6;cursor:wait;transform:none;box-shadow:none}.hint{font-size:13px;color:var(--muted);font-weight:500}.message{min-height:1.5em;margin:14px 0 0;color:var(--muted)}.error{color:var(--red);font-weight:700}
  .success{text-align:center}.success .tick{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 14px;border-radius:50%;background:#daf4ed;color:var(--green);font-size:32px;font-weight:900}.success h2{font:900 30px/1.3 var(--serif);margin:0 0 8px}.success p{color:#47413b;margin:0}.join{background:#25d366;border-color:#123d20;color:#082b13}.hidden{display:none!important}.privacy{margin:18px 4px 0;font-size:12px;color:var(--muted);text-align:center}
  @media(max-width:520px){main{padding-top:20px}.hero{padding-top:34px}.card{padding:22px;border-radius:20px}}
  </style></head><body><main><div class="brand">阿理哥 · Aligor</div><section class="hero"><span class="tag">AI Agent Preview</span><h1>输入报名号码，<br>进入今晚课程</h1><p>只有这次 Preview 已报名的学生，才会看到上课链接。</p></section>
  <form id="accessForm" class="card"><label>输入报名时使用的 WhatsApp 号码<input name="phone" inputmode="tel" autocomplete="tel" maxlength="30" required placeholder="例如 0167871902"><span class="hint">可以输入 016…、6016… 或 +6016…</span></label><button type="submit">验证号码</button><p id="message" class="message" role="status"></p></form>
  <section id="success" class="card success hidden"><div class="tick">✓</div><h2>号码验证成功</h2><p>点击下面的按钮进入 AI Agent Preview。</p><a id="join" class="join" href="#" target="_blank" rel="noopener noreferrer">进入 Preview 课程</a></section>
  <p class="privacy">号码只用于核对本次报名，不会在网页上公开显示。</p></main><script>
  const form=document.querySelector('#accessForm'),message=document.querySelector('#message'),button=form.querySelector('button');
  form.addEventListener('submit',async event=>{event.preventDefault();message.textContent='正在核对报名资料…';message.className='message';button.disabled=true;try{const response=await fetch('/api/preview-access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:new FormData(form).get('phone')})});const out=await response.json();if(!response.ok)throw new Error(out.error||'暂时无法验证，请稍后再试');document.querySelector('#join').href=out.join_url;form.classList.add('hidden');document.querySelector('#success').classList.remove('hidden');}catch(error){message.textContent=error.message;message.className='message error';button.disabled=false;}});
  </script></body></html>`;
}

export async function verifyPreviewAccess(env, data) {
  let phone;
  try { phone = normalizePhone(data?.phone); }
  catch (error) { return { status: 400, body: { ok: false, error: error.message } }; }
  const batch = String(env.PREVIEW_ACCESS_BATCH || '').trim();
  const joinUrl = String(env.PREVIEW_JOIN_URL || '').trim();
  if (!batch || !/^https:\/\//i.test(joinUrl)) return { status: 503, body: { ok: false, error: '课程链接暂时还没开放，请稍后再试。' } };
  const lead = await env.DB.prepare("SELECT id FROM leads WHERE phone_e164=? AND batch=? AND status!='cancelled' LIMIT 1").bind(phone, batch).first();
  if (!lead) return noAccess();
  await env.DB.prepare('INSERT INTO lead_events(lead_id,event_type,actor,details,created_at) VALUES(?,?,?,?,?)').bind(lead.id, 'preview_access_granted', 'customer', `batch=${batch}`, nowIso()).run();
  return { status: 200, body: { ok: true, join_url: joinUrl } };
}
