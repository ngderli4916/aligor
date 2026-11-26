import { cleanText, normalizePhone } from './lib.js';
import { AI_AGENT_BATCH } from './notify.js';

export const CHECKIN_PATH = '/workshop-checkin';
export const CHECKIN_API = '/api/workshop-checkin';
export const CHECKIN_EVENT = 'workshop_checkin_20261126';
const SOURCE = 'ai-agent-registration';
const START = Date.parse('2026-11-26T09:00:00+08:00');
const END = Date.parse('2026-11-26T17:00:00+08:00');
const headers = {'cache-control':'no-store, private','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff','x-frame-options':'DENY'};
const reply = (status, data) => Response.json(data, {status, headers});
const fail = (status, message) => reply(status,{ok:false,message});
export async function checkinDigest(key) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),x=>x.toString(16).padStart(2,'0')).join('');
}
async function boundedInput(request) {
  const reader=request.body?.getReader(); let size=0, text=''; const decoder=new TextDecoder('utf-8',{fatal:true});
  if (!reader) throw Error();
  for (;;) { const {done,value}=await reader.read(); if (done) break; size+=value.length; if(size>2048){await reader.cancel();throw Error();} text+=decoder.decode(value,{stream:true}); }
  const data=JSON.parse(text+decoder.decode()); if (!data || typeof data!=='object' || Array.isArray(data)) throw Error(); return data;
}
export async function workshopCheckin(request, env, now=Date.now()) {
  const hash=String(env.WORKSHOP_CHECKIN_KEY_SHA256 || '');
  if (!env.DB || !/^[a-f0-9]{64}$/.test(hash) || now<START || now>=END) return fail(410,'本场签到未开放或已结束。');
  if (request.method!=='POST') return fail(405,'请从签到页面提交。');
  if (request.headers.get('origin')!==new URL(request.url).origin || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') return fail(403,'请从签到页面提交。');
  const key=request.headers.get('x-workshop-key')||'';
  if(!/^[A-Za-z0-9_-]{32,96}$/.test(key)) return fail(403,'请重新扫描现场的签到二维码。');
  const digest=await checkinDigest(key); let diff=0; for(let i=0;i<64;i++) diff|=digest.charCodeAt(i)^hash.charCodeAt(i);
  if(diff) return fail(403,'请重新扫描现场的签到二维码。');
  let data,phone;
  try { data=await boundedInput(request); if(typeof data.phone!=='string'||data.phone.length>32||!/^\+?[\d ()-]+$/.test(data.phone.trim()))throw Error(); phone=normalizePhone(data.phone); }catch{return fail(422,'请输入有效的手机号码。');}
  if(!['checkin','walkin'].includes(data.action))return fail(422,'请重新从签到页面提交。');
  const db=env.DB, read=db.prepare('SELECT id,name,source,status FROM leads WHERE batch=? AND phone_e164=?').bind(AI_AGENT_BATCH,phone);
  const before=await read.first();
  if(before&&(before.source!==SOURCE||before.status==='cancelled'))return fail(409,'这个号码需要工作人员核对，请到签到处处理。');
  if(!before && data.action==='checkin')return reply(200,{ok:true,state:'walkin_required',message:'没有报名，需要当场报名签到。'});
  const stamp=new Date(now).toISOString();
  const addEvent=(details,id,publicId)=>db.prepare(`INSERT INTO lead_events(lead_id,event_type,actor,details,created_at)
    SELECT id,?,'workshop-checkin',?,? FROM leads WHERE batch=? AND source=? AND status!='cancelled' AND ${id?'id':'public_id'}=?
    AND NOT EXISTS(SELECT 1 FROM lead_events e WHERE e.lead_id=leads.id AND e.event_type=?) RETURNING lead_id`).bind(CHECKIN_EVENT,details,stamp,AI_AGENT_BATCH,SOURCE,id||publicId,CHECKIN_EVENT);
  if(before){
    const record=await addEvent('pre_registered',before.id).first();
    if(!record&&!(await db.prepare('SELECT 1 AS checked FROM lead_events WHERE lead_id=? AND event_type=?').bind(before.id,CHECKIN_EVENT).first()))return fail(409,'请找工作人员协助签到。');
    return reply(200,{ok:true,state:'checked_in',message:'签到成功：'+Array.from(before.name.trim()).slice(0,1).join('')+'＊＊'});
  }
  const field=(value,size)=>typeof value==='string'&&value.length<=size?cleanText(value,size).trim():'';
  const name=field(data.name,80),company=field(data.company,100),industry=field(data.industry,80);
  if(!name||!company)return fail(422,'请填写姓名及公司名称。');
  const publicId=crypto.randomUUID().slice(0,8).toUpperCase();
  const save=db.prepare(`INSERT INTO leads(public_id,name,phone_e164,batch,course,company,industry,source,status,consent_whatsapp,created_at,updated_at)
    VALUES (?,?,?,?,'AI Agent Course',?,?,?,'new',0,?,?) ON CONFLICT(phone_e164,batch) DO NOTHING RETURNING id`).bind(publicId,name,phone,AI_AGENT_BATCH,company,industry,SOURCE,stamp,stamp);
  const results=await db.batch([save,addEvent('walkin',null,publicId)]);
  if(results[0]?.results?.length!==1 || results[1]?.results?.length!==1)return fail(409,'号码已被登记，请返回并再次点击「签到」。');
  return reply(201,{ok:true,state:'walkin_checked_in',message:'现场报名及签到成功！'});
}

export function workshopCheckinPage() {
  return new Response(`<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 助理｜现场签到</title><style>
  *{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f3f6f4;color:#10251b;font:16px/1.55 system-ui,sans-serif}main{max-width:440px;margin:7vh auto;padding:24px}section{background:#fff;border:1px solid #d3e1d9;border-radius:18px;padding:24px}h1{line-height:1.2;margin:0}label{display:block;margin-top:12px;font-weight:600}input,button{font:inherit;width:100%;min-height:46px;border-radius:8px;padding:9px 12px}input{border:1px solid #8caaa0}button{margin-top:16px;background:#14523d;color:white;border:0;font-weight:700;cursor:pointer}button:disabled{opacity:.6}#message{font-weight:600;min-height:1.6em}small{display:block;color:#465a51}
  </style><main><section><h1>AI 助理｜现场签到</h1><p>11 月 26 日 · 12PM - 4PM</p><form id="form" method="post" action="${CHECKIN_API}"><label for="phone">报名时的手机号码</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="32" required><div id="fields" hidden><label for="name">姓名</label><input id="name" name="name" maxlength="80" disabled autocomplete="name"><label for="company">公司名称</label><input id="company" name="company" maxlength="100" disabled autocomplete="organization"><label for="industry">行业（选填）</label><input id="industry" name="industry" maxlength="80" disabled></div><button id="submit" type="submit">签到</button></form><p id="message" role="status" aria-live="polite"></p><small>资料仅用于本场报名与签到。号码有误请找工作人员。</small></section></main><script>
  const form=document.querySelector('#form'), fields=document.querySelector('#fields'), button=document.querySelector('#submit'), msg=document.querySelector('#message'), phone=document.querySelector('#phone');
  const key=new URLSearchParams(location.hash.slice(1)).get('k'); if(!key){msg.textContent='请扫描现场的签到二维码。';button.disabled=true;}
  let action='checkin'; function toggle(walk){action=walk?'walkin':'checkin';fields.hidden=!walk;for(const e of fields.querySelectorAll('input')){e.disabled=!walk;e.required=walk&&e.name!=='industry';}button.textContent=walk?'现场报名并签到':'签到';}
  phone.addEventListener('input',()=>{if(action==='walkin')toggle(false);});
  form.addEventListener('submit',async e=>{e.preventDefault();if(button.disabled)return;button.disabled=true;msg.textContent='正在处理…';try{const r=await fetch(form.action,{method:'POST',headers:{'content-type':'application/json','x-workshop-key':key},body:JSON.stringify({...Object.fromEntries(new FormData(form)),action})});const d=await r.json();msg.textContent=d.message||'暂时无法签到。';if(d.state==='walkin_required'){toggle(true);fields.querySelector('input').focus();}else if(d.ok){form.hidden=true;}else if(r.status===409){toggle(false);}}catch{msg.textContent='暂时无法签到，请重试或找工作人员。';}finally{button.disabled=false;}});
  </script></html>`,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"}});
}
