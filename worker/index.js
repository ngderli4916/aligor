import { STATUSES, normalizePhone, cleanText, maskPhone, waUrl, csvEscape, htmlEscape, parseBotCommand } from './lib.js';
import { registerPage, loginPage, adminPage } from './ui.js';

const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8',...headers}});
const html = body => new Response(body,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'",'x-frame-options':'DENY','referrer-policy':'same-origin'}});
const now = () => new Date().toISOString();

export default { async fetch(request, env) {
  try { return await route(request, env); }
  catch (error) { console.error(error); return json({error:'系统暂时无法处理，请稍后重试'},500); }
}};

async function route(request, env) {
  const url = new URL(request.url), path=url.pathname;
  if (request.method==='GET' && path==='/') return Response.redirect(`${url.origin}/register`,302);
  if (request.method==='GET' && path==='/register') return html(registerPage(cleanText(url.searchParams.get('batch'),50)));
  if (request.method==='POST' && path==='/api/leads') return createLead(request,env);
  if (request.method==='GET' && path==='/4916') return html(await isAdmin(request,env) ? adminPage() : loginPage());
  if (request.method==='POST' && path==='/api/admin/login') return login(request,env);
  if (request.method==='POST' && path==='/api/admin/logout') return new Response(null,{status:204,headers:{'set-cookie':sessionCookie('',request,0)}});
  if (path.startsWith('/api/admin/')) {
    if (!await isAdmin(request,env)) return json({error:'Unauthorized'},401);
    if (request.method==='GET' && path==='/api/admin/leads') return listLeads(url,env);
    if (request.method==='GET' && path==='/api/admin/export.csv') return exportCsv(env);
    const match=path.match(/^\/api\/admin\/leads\/(\d+)$/);
    if (request.method==='PATCH' && match) return updateLead(Number(match[1]),await request.json(),env,'admin');
  }
  if (request.method==='POST' && path==='/telegram/webhook') return telegramWebhook(request,env);
  if (request.method==='GET' && path==='/health') return json({ok:true,time:now()});
  return json({error:'Not found'},404);
}

async function bodyData(request) {
  const type=request.headers.get('content-type')||'';
  if (type.includes('application/json')) return request.json();
  const form=await request.formData(); return Object.fromEntries(form);
}

async function createLead(request,env) {
  const data=await bodyData(request);
  if (cleanText(data.website,100)) return json({ok:true},202);
  const name=cleanText(data.name,80), batch=cleanText(data.batch,50), course=cleanText(data.course||'免费 AI Preview',100);
  let phone;
  try { phone=normalizePhone(data.phone); }
  catch (error) { return json({error:error.message},400); }
  if (name.length<2) return json({error:'请输入姓名'},400);
  if (!batch) return json({error:'请选择或填写批次'},400);
  if (!(data.consent===true || data.consent==='true' || data.consent==='on')) return json({error:'请确认 WhatsApp 联络同意'},400);
  const timestamp=now(), publicId=crypto.randomUUID().slice(0,8).toUpperCase();
  const tools=Array.isArray(data.ai_tools)?data.ai_tools:[data.ai_tools].filter(Boolean);
  const values={company:cleanText(data.company,100),industry:cleanText(data.industry,80),usedAiAgent:cleanText(data.used_ai_agent,40),aiTools:tools.map(x=>cleanText(x,50)).filter(Boolean).slice(0,12).join(', '),aiToolsOther:cleanText(data.ai_tools_other,100),goal:cleanText(data.goal,800),source:cleanText(data.source||'aligor',80)};
  if(!values.usedAiAgent) return json({error:'请选择是否使用过 AI Agent'},400);
  await env.DB.prepare(`INSERT INTO leads(public_id,name,phone_e164,batch,course,company,industry,used_ai_agent,ai_tools,ai_tools_other,goal,source,status,consent_whatsapp,consent_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'new',1,?,?,?) ON CONFLICT(phone_e164,batch) DO UPDATE SET name=excluded.name,course=excluded.course,company=excluded.company,industry=excluded.industry,used_ai_agent=excluded.used_ai_agent,ai_tools=excluded.ai_tools,ai_tools_other=excluded.ai_tools_other,goal=excluded.goal,source=excluded.source,consent_whatsapp=1,consent_at=excluded.consent_at,updated_at=excluded.updated_at`)
    .bind(publicId,name,phone,batch,course,values.company,values.industry,values.usedAiAgent,values.aiTools,values.aiToolsOther,values.goal,values.source,timestamp,timestamp,timestamp).run();
  const lead=await env.DB.prepare('SELECT * FROM leads WHERE phone_e164=? AND batch=?').bind(phone,batch).first();
  await addEvent(env,lead.id,'submitted','customer',`source=${values.source}`);
  await notifyNewLead(env,lead);
  return json({ok:true,lead_id:lead.public_id,whatsapp_url:waUrl(env.WHATSAPP_NUMBER||'60167871902',`你好 Adrian，我是 ${name}。我刚报名了 ${course}，报名编号 ${lead.public_id}。`)},201);
}

async function listLeads(url,env) {
  const filters=[], binds=[];
  const status=cleanText(url.searchParams.get('status'),20),batch=cleanText(url.searchParams.get('batch'),50),q=cleanText(url.searchParams.get('q'),80);
  if(status){filters.push('status=?');binds.push(status)} if(batch){filters.push('batch LIKE ?');binds.push(`%${batch}%`)} if(q){filters.push('(name LIKE ? OR phone_e164 LIKE ?)');binds.push(`%${q}%`,`%${q.replace(/\D/g,'')}%`)}
  const where=filters.length?`WHERE ${filters.join(' AND ')}`:'';
  const result=await env.DB.prepare(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT 300`).bind(...binds).all();
  const counts=await env.DB.prepare('SELECT status,COUNT(*) count FROM leads GROUP BY status').all();
  const stats={total:0,new:0,contacted:0,paid:0}; counts.results.forEach(x=>{stats[x.status]=x.count;stats.total+=x.count});
  return json({leads:result.results.map(x=>({...x,whatsapp_url:waUrl(x.phone_e164,followupText(x))})),stats});
}

async function updateLead(id,data,env,actor) {
  const lead=await env.DB.prepare('SELECT * FROM leads WHERE id=?').bind(id).first(); if(!lead)return json({error:'Lead not found'},404);
  const status=data.status?cleanText(data.status,20):lead.status; if(!STATUSES.has(status))return json({error:'Invalid status'},400);
  const notes=data.notes===undefined?lead.notes:cleanText(data.notes,1500),timestamp=now();
  const contacted=status==='contacted'&&!lead.last_contacted_at?timestamp:lead.last_contacted_at, paid=status==='paid'&&!lead.paid_at?timestamp:lead.paid_at;
  await env.DB.prepare('UPDATE leads SET status=?,notes=?,last_contacted_at=?,paid_at=?,updated_at=? WHERE id=?').bind(status,notes,contacted,paid,timestamp,id).run();
  await addEvent(env,id,'updated',actor,`status=${status}`); return json({ok:true});
}

async function exportCsv(env) {
  const rows=(await env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC').all()).results;
  const cols=['id','public_id','name','phone_e164','batch','course','company','industry','used_ai_agent','ai_tools','ai_tools_other','goal','source','status','consent_at','notes','created_at','updated_at'];
  const body='\ufeff'+[cols.join(','),...rows.map(r=>cols.map(c=>csvEscape(r[c])).join(','))].join('\n');
  return new Response(body,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="aligor-leads.csv"'}});
}

async function login(request,env) {
  const data=await bodyData(request); if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return html(loginPage('服务器尚未设置管理员密码'));
  if(!safeEqual(String(data.password||''),env.ADMIN_PASSWORD))return html(loginPage('密码不正确'));
  const token=await signSession(env.SESSION_SECRET); return new Response(null,{status:303,headers:{location:'/4916','set-cookie':sessionCookie(token,request,28800)}});
}

function sessionCookie(token,request,maxAge){
  const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  return `aligor_session=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`;
}

async function isAdmin(request,env) {
  if(!env.SESSION_SECRET)return false; const token=(request.headers.get('cookie')||'').match(/(?:^|; )aligor_session=([^;]+)/)?.[1]; if(!token)return false;
  const [body,sig]=token.split('.'); if(!body||!sig)return false; const expected=await hmac(env.SESSION_SECRET,body); if(!safeEqual(sig,expected))return false;
  try{return JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/'))).exp>Date.now()}catch{return false}
}

async function signSession(secret){const body=btoa(JSON.stringify({exp:Date.now()+8*3600e3})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');return `${body}.${await hmac(secret,body)}`}
async function hmac(secret,text){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)));return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function safeEqual(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}

async function telegramWebhook(request,env) {
  if(!env.TELEGRAM_WEBHOOK_SECRET||request.headers.get('x-telegram-bot-api-secret-token')!==env.TELEGRAM_WEBHOOK_SECRET)return json({error:'Unauthorized'},401);
  const update=await request.json(); const chatId=String(update.message?.chat?.id||update.callback_query?.message?.chat?.id||'');
  if(!env.TELEGRAM_CHAT_ID||chatId!==String(env.TELEGRAM_CHAT_ID))return json({ok:true});
  if(update.callback_query){const [_,id,status]=String(update.callback_query.data||'').split(':');if(_==='status'&&STATUSES.has(status)){await updateLead(Number(id),{status},env,'telegram');await telegram(env,'answerCallbackQuery',{callback_query_id:update.callback_query.id,text:`已更新为 ${status}`});}return json({ok:true});}
  if(update.message?.text) await handleCommand(env,chatId,update.message.text); return json({ok:true});
}

async function handleCommand(env,chatId,text) {
  const {command,args}=parseBotCommand(text);
  if(command==='/help'||command==='/start') return sendText(env,chatId,'可用指令：\n/new\n/batch 批次\n/find 姓名或电话\n/stats\n/contacted ID\n/registered ID\n/paid ID\n/attended ID\n/note ID 内容\n/wa ID 自定义信息');
  if(command==='/stats'){const rows=(await env.DB.prepare('SELECT status,COUNT(*) count FROM leads GROUP BY status').all()).results;return sendText(env,chatId,'📊 报名统计\n'+rows.map(x=>`${x.status}: ${x.count}`).join('\n'));}
  if(['/contacted','/registered','/paid','/attended'].includes(command)){const id=Number(args[0]);if(!id)return sendText(env,chatId,'请输入顾客 ID');await updateLead(id,{status:command.slice(1)},env,'telegram');return sendText(env,chatId,`✅ #${id} 已更新为 ${command.slice(1)}`);}
  if(command==='/note'){const id=Number(args.shift());const note=cleanText(args.join(' '),1000);const lead=await env.DB.prepare('SELECT notes FROM leads WHERE id=?').bind(id).first();if(!lead)return sendText(env,chatId,'找不到顾客');await updateLead(id,{notes:[lead.notes,note].filter(Boolean).join('\n')},env,'telegram');return sendText(env,chatId,`📝 #${id} 已加入备注`);}
  if(command==='/wa'){const id=Number(args.shift()),lead=await env.DB.prepare('SELECT * FROM leads WHERE id=?').bind(id).first();if(!lead)return sendText(env,chatId,'找不到顾客');const msg=args.join(' ')||followupText(lead);return sendText(env,chatId,`WhatsApp ${lead.name}`,{inline_keyboard:[[{text:'打开并确认发送',url:waUrl(lead.phone_e164,msg)}]]});}
  let sql='SELECT * FROM leads ',binds=[];
  if(command==='/new')sql+="WHERE status='new' ";else if(command==='/batch'){sql+='WHERE batch LIKE ? ';binds=[`%${cleanText(args.join(' '),50)}%`]}else if(command==='/find'){const q=cleanText(args.join(' '),80);sql+='WHERE name LIKE ? OR phone_e164 LIKE ? ';binds=[`%${q}%`,`%${q.replace(/\D/g,'')}%`]}else return sendText(env,chatId,'无法识别。输入 /help 查看指令。');
  const rows=(await env.DB.prepare(sql+'ORDER BY created_at DESC LIMIT 10').bind(...binds).all()).results;if(!rows.length)return sendText(env,chatId,'没有找到报名资料');
  return sendText(env,chatId,rows.map(leadLine).join('\n\n'));
}

async function notifyNewLead(env,lead) {
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return;
  const base=env.PUBLIC_BASE_URL||''; await sendText(env,env.TELEGRAM_CHAT_ID,`🔔 <b>新报名</b>\n\n${leadLine(lead)}\n\n<a href="${htmlEscape(base+'/4916')}">打开 Aligor 后台</a>`,{inline_keyboard:[[{text:'WhatsApp 顾客',url:waUrl(lead.phone_e164,followupText(lead))}],[{text:'标记已联系',callback_data:`status:${lead.id}:contacted`},{text:'标记已报名',callback_data:`status:${lead.id}:registered`}]]});
}
function leadLine(x){return `#${x.id} · ${htmlEscape(x.name)}\n电话：${htmlEscape(maskPhone(x.phone_e164))}\n课程：${htmlEscape(x.course)}\n批次：${htmlEscape(x.batch)}\n用过 Agent：${htmlEscape(x.used_ai_agent||'未填写')}\n目前 AI：${htmlEscape([x.ai_tools,x.ai_tools_other].filter(Boolean).join('、')||'未填写')}\n状态：${htmlEscape(x.status)}`}
function followupText(x){return `你好 ${x.name}，我是 Adrian（阿理哥）。我看到你报名了 ${x.course}（${x.batch}），想先了解你最希望 AI 帮你解决什么工作？`}
async function sendText(env,chatId,text,reply_markup){return telegram(env,'sendMessage',{chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true,...(reply_markup?{reply_markup}: {})})}
async function telegram(env,method,payload){if(!env.TELEGRAM_BOT_TOKEN)return null;const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)console.error('Telegram error',await r.text());return r}
async function addEvent(env,leadId,type,actor,details=''){await env.DB.prepare('INSERT INTO lead_events(lead_id,event_type,actor,details,created_at) VALUES(?,?,?,?,?)').bind(leadId,type,actor,details,now()).run()}
