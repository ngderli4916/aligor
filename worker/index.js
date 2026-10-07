import { STATUSES, normalizePhone, cleanText, waUrl, csvEscape, htmlEscape, parseBotCommand } from './lib.js';
import { recordView, getStats } from './analytics.js';
import { buildCustomerMessage, buildLeadNotification, leadCode, parseLeadCode, redactSecrets } from './notify.js';
import { registerPage, loginPage, adminPage } from './ui.js';
import { PACKAGES, ClassError, createRegistration, notifyClassRegistration, paymentUrl, findByToken, publicPaymentView, recordPaymentPageOpened, submitPayment, listClassRegistrations, classEvents, classCsv, adminAction, setClassNotes } from './classreg.js';
import { classRegisterPage, paymentPage, invalidPaymentPage } from './classui.js';

const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8',...headers}});
const html = (body,extra={}) => new Response(body,{headers:{...extra,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'",'x-frame-options':'DENY','referrer-policy':'same-origin'}});
const now = () => new Date().toISOString();

export default { async fetch(request, env, ctx) {
  try { return await route(request, env, ctx); }
  catch (error) {
    if (error instanceof ClassError) return json({ok:false,error:error.message},error.status); console.error(error); return json({error:'系统暂时无法处理，请稍后重试'},500); }
}};

async function route(request, env, ctx) {
  const url = new URL(request.url), path=url.pathname;
  if (request.method==='GET' && path==='/') return Response.redirect(`${url.origin}/register`,302);
  if (request.method==='GET' && path==='/register') {
    const tracking=isAdmin(request,env).then(skip=>recordView(env,request,{path:'/register',ref:request.headers.get('referer'),source:'server',skip})).catch(error=>console.error('track_failed',redactSecrets(error?.message,env)));
    if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(tracking); else await tracking;
    return html(registerPage(cleanText(url.searchParams.get('batch'),50),await registrationStats(env)));
  }
  if (request.method==='GET' && path==='/classregister') return html(classRegisterPage(),{'cache-control':'no-store'});
  if (request.method==='GET' && path==='/payment') return paymentRoute(url,env);
  if (request.method==='POST' && path==='/api/classregister') return classRegister(request,env,ctx,url);
  if (request.method==='POST' && path==='/api/payment/submit') return classPaymentSubmit(request,env);
  if (request.method==='POST' && path==='/api/track') return track(request,env,ctx);
  if (request.method==='POST' && path==='/api/leads') return createLead(request,env,ctx);
  if (request.method==='GET' && path==='/4916') return html(await isAdmin(request,env) ? adminPage() : loginPage());
  if (request.method==='POST' && path==='/api/admin/login') return login(request,env);
  if (request.method==='POST' && path==='/api/admin/logout') return new Response(null,{status:204,headers:{'set-cookie':sessionCookie('',request,0)}});
  if (path.startsWith('/api/admin/')) {
    if (!await isAdmin(request,env)) return json({error:'Unauthorized'},401);
    if (request.method==='GET' && path==='/api/admin/leads') return listLeads(url,env);
    if (request.method==='GET' && path==='/api/admin/export.csv') return exportCsv(env);
    if (request.method==='GET' && path==='/api/admin/stats') return json(await getStats(env));
    if (path==='/api/admin/class' && request.method==='GET') return json(await listClassRegistrations(env,url));
    if (path==='/api/admin/class/export.csv' && request.method==='GET') return new Response(await classCsv(env),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="aligor-class-registrations.csv"'}});
    const cm=path.match(/^\/api\/admin\/class\/(\d+)\/(confirm|reject|cancel|notes|telegram|events)$/);
    if (cm) return classAdmin(request,env,ctx,Number(cm[1]),cm[2]);
    const match=path.match(/^\/api\/admin\/leads\/(\d+)$/);
    if (request.method==='PATCH' && match) return updateLead(Number(match[1]),await request.json(),env,'admin');
    if (request.method==='DELETE' && match) return deleteLead(Number(match[1]),env);
  }
  if (request.method==='POST' && path==='/telegram/webhook') return telegramWebhook(request,env);
  if (request.method==='GET' && path==='/health') return json({ok:true,time:now()});
  return json({error:'Not found'},404);
}

const noindex={'x-robots-tag':'noindex, nofollow','cache-control':'no-store','referrer-policy':'no-referrer'};
async function smallJson(request){const text=await request.text();if(text.length>6000)throw new ClassError('资料太长',413);try{return JSON.parse(text||'{}')}catch{throw new ClassError('资料格式不正确')}}

async function classRegister(request,env,ctx,url) {
  const data=await smallJson(request);
  if (cleanText(data.website,100)) return json({ok:true},202);
  const {row,token,created}=await createRegistration(env,data);
  if(created||row.telegram_notification_status==='pending'){const n=notifyClassRegistration(env,row.id).catch(error=>console.error('class_notify_failed',redactSecrets(error?.message,env))); if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(n); else await n;}
  return json({ok:true,order_id:row.public_order_id,amount:row.final_amount,package_title:PACKAGES[row.package_code]?.title,payment_url:paymentUrl(env,request,token)},created?201:200,{'cache-control':'no-store'});
}
async function paymentRoute(url,env) {
  const token=url.searchParams.get('t')||'', row=await findByToken(env,token);
  if(!row){const res=html(invalidPaymentPage(),noindex);return new Response(res.body,{status:404,headers:res.headers})}
  await recordPaymentPageOpened(env,row);
  return html(paymentPage(publicPaymentView(row),token),noindex);
}
async function classPaymentSubmit(request,env) {
  const data=await smallJson(request), view=await submitPayment(env,String(data.t||''),data.reference);
  return json({ok:true,status:view.status},200,{'cache-control':'no-store'});
}
async function classAdmin(request,env,ctx,id,action) {
  if(action==='events'&&request.method==='GET') return json({events:await classEvents(env,id)});
  if(request.method!=='POST') return json({error:'Not found'},404);
  const body=await smallJson(request);
  if(action==='notes'){await setClassNotes(env,id,body.notes);return json({ok:true})}
  if(action==='telegram'){const result=await notifyClassRegistration(env,id,'admin');return json({ok:true,result})}
  return json(await adminAction(env,id,action,body,'admin'));
}

async function bodyData(request) {
  const type=request.headers.get('content-type')||'';
  if (type.includes('application/json')) return request.json();
  const form=await request.formData(); return Object.fromEntries(form);
}

async function createLead(request,env,ctx) {
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
  const existing=await env.DB.prepare('SELECT id FROM leads WHERE phone_e164=? AND batch=?').bind(phone,batch).first();
  await env.DB.prepare(`INSERT INTO leads(public_id,name,phone_e164,batch,course,company,industry,used_ai_agent,ai_tools,ai_tools_other,goal,source,status,consent_whatsapp,consent_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'new',1,?,?,?) ON CONFLICT(phone_e164,batch) DO UPDATE SET name=excluded.name,course=excluded.course,company=excluded.company,industry=excluded.industry,used_ai_agent=excluded.used_ai_agent,ai_tools=excluded.ai_tools,ai_tools_other=excluded.ai_tools_other,goal=excluded.goal,source=excluded.source,consent_whatsapp=1,consent_at=excluded.consent_at,updated_at=excluded.updated_at`)
    .bind(publicId,name,phone,batch,course,values.company,values.industry,values.usedAiAgent,values.aiTools,values.aiToolsOther,values.goal,values.source,timestamp,timestamp,timestamp).run();
  const lead=await env.DB.prepare('SELECT * FROM leads WHERE phone_e164=? AND batch=?').bind(phone,batch).first();
  await addEvent(env,lead.id,existing?'resubmitted':'submitted','customer',`source=${values.source}`);
  const notification=notifyNewLead(env,lead,{resubmitted:Boolean(existing)});
  if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(notification); else await notification;
  return json({ok:true,lead_id:leadCode(lead.id),whatsapp_url:waUrl(env.WHATSAPP_NUMBER||'60167871902',`你好 Adrian，我是 ${name}。我刚报名了 ${course}，报名编号 ${leadCode(lead.id)}。`)},201);
}

// Real numbers only: distinct people overall, and registrations per session. Cancelled sign-ups are not counted.
async function registrationStats(env) {
  try {
    const total=(await env.DB.prepare("SELECT COUNT(DISTINCT phone_e164) n FROM leads WHERE status!='cancelled'").first())?.n||0;
    const rows=(await env.DB.prepare("SELECT batch,COUNT(*) n FROM leads WHERE status!='cancelled' GROUP BY batch").all()).results;
    return {total,byBatch:Object.fromEntries(rows.map(row=>[row.batch,row.n]))};
  } catch(error) { console.error('registration_stats_failed',redactSecrets(error?.message,env)); return null; }
}

async function track(request,env,ctx) {
  let data={}; try{ if((request.headers.get('content-length')||'0')<2000) data=await request.json(); }catch{}
  const tracking=isAdmin(request,env).then(skip=>recordView(env,request,{path:cleanText(data.path,80),ref:cleanText(data.ref,300),source:'beacon',skip})).catch(error=>console.error('track_failed',redactSecrets(error?.message,env)));
  if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(tracking); else await tracking;
  return new Response(null,{status:204});
}

async function listLeads(url,env) {
  const filters=[], binds=[];
  const status=cleanText(url.searchParams.get('status'),20),batch=cleanText(url.searchParams.get('batch'),50),q=cleanText(url.searchParams.get('q'),80);
  if(status){filters.push('status=?');binds.push(status)} if(batch){filters.push('batch LIKE ?');binds.push(`%${batch}%`)} if(q){const byCode=/^#?AIPR\d+$/i.test(q)?parseLeadCode(q):null;if(byCode){filters.push('id=?');binds.push(byCode)}else{filters.push('(name LIKE ? OR phone_e164 LIKE ?)');binds.push(`%${q}%`,`%${q.replace(/\D/g,'')}%`)}}
  const where=filters.length?`WHERE ${filters.join(' AND ')}`:'';
  const result=await env.DB.prepare(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT 300`).bind(...binds).all();
  const counts=await env.DB.prepare('SELECT status,COUNT(*) count FROM leads GROUP BY status').all();
  const stats={total:0,new:0,contacted:0,paid:0}; counts.results.forEach(x=>{stats[x.status]=x.count;stats.total+=x.count});
  return json({leads:result.results.map(x=>({...x,code:leadCode(x.id),whatsapp_url:waUrl(x.phone_e164,buildCustomerMessage(x,env))})),stats});
}

async function deleteLead(id,env) {
  const lead=await env.DB.prepare('SELECT id FROM leads WHERE id=?').bind(id).first(); if(!lead)return json({error:'Lead not found'},404);
  await env.DB.prepare('DELETE FROM lead_events WHERE lead_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM leads WHERE id=?').bind(id).run();
  return json({ok:true});
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
  const cols=['code','id','public_id','name','phone_e164','batch','course','company','industry','used_ai_agent','ai_tools','ai_tools_other','goal','source','status','consent_at','notes','created_at','updated_at'];
  const body='\ufeff'+[cols.join(','),...rows.map(r=>({...r,code:leadCode(r.id)})).map(r=>cols.map(c=>csvEscape(r[c])).join(','))].join('\n');
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
  if(!env.TELEGRAM_WEBHOOK_SECRET||!safeEqual(request.headers.get('x-telegram-bot-api-secret-token')||'',env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Unauthorized'},401);
  const update=await request.json(); const chatId=String(update.message?.chat?.id||update.callback_query?.message?.chat?.id||'');
  if(!env.TELEGRAM_CHAT_ID||chatId!==String(env.TELEGRAM_CHAT_ID))return json({ok:true});
  if(update.callback_query){const [_,id,status]=String(update.callback_query.data||'').split(':');if(_==='status'&&STATUSES.has(status)){const result=await updateLead(Number(id),{status},env,'telegram');await telegram(env,'answerCallbackQuery',{callback_query_id:update.callback_query.id,text:result.status===200?`已更新为 ${status}`:'找不到这位顾客'});}return json({ok:true});}
  if(update.message?.text) await handleCommand(env,chatId,update.message.text); return json({ok:true});
}

async function handleCommand(env,chatId,text) {
  const {command,args}=parseBotCommand(text);
  if(command==='/help'||command==='/start') return sendText(env,chatId,'可用指令：\n/new\n/batch 批次\n/find 姓名或电话\n/stats\n/contacted ID\n/registered ID\n/paid ID\n/attended ID\n/note ID 内容\n/wa ID 自定义信息');
  if(command==='/stats'){const rows=(await env.DB.prepare('SELECT status,COUNT(*) count FROM leads GROUP BY status').all()).results;return sendText(env,chatId,'📊 报名统计\n'+rows.map(x=>`${x.status}: ${x.count}`).join('\n'));}
  if(['/contacted','/registered','/paid','/attended'].includes(command)){const id=Number(args[0]);if(!id)return sendText(env,chatId,'请输入顾客 ID');await updateLead(id,{status:command.slice(1)},env,'telegram');return sendText(env,chatId,`✅ #${id} 已更新为 ${command.slice(1)}`);}
  if(command==='/note'){const id=Number(args.shift());const note=cleanText(args.join(' '),1000);const lead=await env.DB.prepare('SELECT notes FROM leads WHERE id=?').bind(id).first();if(!lead)return sendText(env,chatId,'找不到顾客');await updateLead(id,{notes:[lead.notes,note].filter(Boolean).join('\n')},env,'telegram');return sendText(env,chatId,`📝 #${id} 已加入备注`);}
  if(command==='/wa'){const id=Number(args.shift()),lead=await env.DB.prepare('SELECT * FROM leads WHERE id=?').bind(id).first();if(!lead)return sendText(env,chatId,'找不到顾客');const msg=args.join(' ')||buildCustomerMessage(lead,env);return sendText(env,chatId,`WhatsApp ${lead.name}`,{inline_keyboard:[[{text:'打开并确认发送',url:waUrl(lead.phone_e164,msg)}]]});}
  let sql='SELECT * FROM leads ',binds=[];
  if(command==='/new')sql+="WHERE status='new' ";else if(command==='/batch'){sql+='WHERE batch LIKE ? ';binds=[`%${cleanText(args.join(' '),50)}%`]}else if(command==='/find'){const q=cleanText(args.join(' '),80),byCode=/^#?AIPR\d+$/i.test(q)?parseLeadCode(q):null;if(byCode){sql+='WHERE id=? ';binds=[byCode]}else{sql+='WHERE name LIKE ? OR phone_e164 LIKE ? ';binds=[`%${q}%`,`%${q.replace(/\D/g,'')}%`]}}else return sendText(env,chatId,'无法识别。输入 /help 查看指令。');
  const rows=(await env.DB.prepare(sql+'ORDER BY created_at DESC LIMIT 10').bind(...binds).all()).results;if(!rows.length)return sendText(env,chatId,'没有找到报名资料');
  return sendText(env,chatId,rows.map(leadLine).join('\n\n'));
}

async function notifyNewLead(env,lead,options={}) {
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID){await safeEvent(env,lead.id,'telegram_skipped','system','missing_telegram_config');return;}
  try{
    const {text}=buildLeadNotification(lead,env,options);
    const response=await sendText(env,env.TELEGRAM_CHAT_ID,text);
    if(!response||!response.ok)throw new Error(`telegram_http_${response?.status??'none'}`);
    await safeEvent(env,lead.id,'telegram_sent','system','');
  }catch(error){
    const reason=redactSecrets(error?.message||error,env).slice(0,200);
    console.error('telegram_notify_failed',reason);
    await safeEvent(env,lead.id,'telegram_failed','system',reason);
  }
}
async function safeEvent(env,leadId,type,actor,details){try{await addEvent(env,leadId,type,actor,details)}catch(error){console.error('lead_event_failed',redactSecrets(error?.message,env))}}
function leadLine(x){return `#${leadCode(x.id)} · ${htmlEscape(x.name)}\nWhatsApp：${htmlEscape(x.phone_e164)}\n课程：${htmlEscape(x.course)}\n批次：${htmlEscape(x.batch)}\n用过 Agent：${htmlEscape(x.used_ai_agent||'未填写')}\n目前 AI：${htmlEscape([x.ai_tools,x.ai_tools_other].filter(Boolean).join('、')||'未填写')}\n状态：${htmlEscape(x.status)}`}
async function sendText(env,chatId,text,reply_markup){return telegram(env,'sendMessage',{chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true,...(reply_markup?{reply_markup}: {})})}
async function telegram(env,method,payload){if(!env.TELEGRAM_BOT_TOKEN)return null;const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)console.error('Telegram error',redactSecrets((await r.text()).slice(0,300),env));return r}
async function addEvent(env,leadId,type,actor,details=''){await env.DB.prepare('INSERT INTO lead_events(lead_id,event_type,actor,details,created_at) VALUES(?,?,?,?,?)').bind(leadId,type,actor,details,now()).run()}
