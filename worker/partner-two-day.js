// Two-day course sign-up. Isolated from the personal-course CRM: only PARTNER_TWO_DAY_DB (D1) is touched.
// Flow (Adrian 2026-11-26): fill details → see amount → submit → payment info pops up (bank + WhatsApp receipt).
// Sign-ups are stored as pending_payment (待付款); the receipt goes to WhatsApp, not this site.
export const PARTNER_TWO_DAY_CLASS = Object.freeze({title:'两天 AI 企业助理课程',date:'2026 年 12 月 7–8 日',dayNote:'星期一、二 · 暂定',hours:'每天 9AM - 5PM',city:'新山',venueNote:'详细地址待公布'});
const registrationPath = '/api/2days-botsclass/registrations';
// 2026-11-27 (Fri) 11:59PM Malaysia time (UTC+8); accepted through 23:59:59.
export const PARTNER_TWO_DAY_DEADLINE = '2026-11-27T23:59:59.999+08:00';
export const PARTNER_TWO_DAY_BANK = {
  holder: 'J & J BUSINESS MANAGEMENT SERVICES',
  regNo: 'JM0632306-M',
  bank: 'Hong Leong Bank（HLB）',
  account: '37900006808',
};
const DEFAULT_WHATSAPP = '60167871902';
const boundary = { 'cache-control':'no-store', 'x-robots-tag':'noindex, nofollow', 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff' };
const reply = (status, data) => Response.json(data, {status, headers:boundary});
const available = env => Boolean(env.PARTNER_TWO_DAY_DB && env.PARTNER_TWO_DAY_OPEN === '1');
export const PARTNER_TWO_DAY_MAX_SEATS = 20;
// Pairs are charged at the two-seat fee, a leftover single at the one-seat fee (3000/3000 = buy one, get one free).
export const partnerTwoDayPrice = (fees, n) => Math.floor(n/2)*fees[2] + (n%2)*fees[1];
const parseFee = v => (typeof v === 'string' && /^[1-9]\d{0,5}$/.test(v.trim())) ? Number(v.trim()) : null;

export function partnerTwoDayDeadline(env = {}) {
  const t = Date.parse(env.PARTNER_TWO_DAY_DEADLINE || PARTNER_TWO_DAY_DEADLINE);
  return Number.isFinite(t) ? t : Date.parse(PARTNER_TWO_DAY_DEADLINE);
}

export function partnerTwoDayState(env = {}, now = Date.now()) {
  const deadline = partnerTwoDayDeadline(env);
  const fees = { 1: parseFee(env.PARTNER_TWO_DAY_FEE_1), 2: parseFee(env.PARTNER_TWO_DAY_FEE_2) };
  const feesSet = Boolean(fees[1] && fees[2]);
  const open = available(env);
  const wa = /^60\d{8,10}$/.test(env.PARTNER_TWO_DAY_WHATSAPP || '') ? env.PARTNER_TWO_DAY_WHATSAPP : DEFAULT_WHATSAPP;
  return {
    open, deadline, fees, feesSet, wa,
    closed: now >= deadline,
    // Sign-ups need fees for both options and an explicit switch.
    payable: open && feesSet && env.PARTNER_TWO_DAY_PAYMENT_OPEN === '1',
    test: env.PARTNER_TWO_DAY_TEST_MODE === '1',
    whatsappNotices: env.PARTNER_TWO_DAY_NOTIFICATIONS === '1' && env.PARTNER_TWO_DAY_TEST_MODE !== '1',
  };
}

// The earlier no-payment reservation endpoint is retired; its stored rows are left untouched.
export async function reservePartnerTwoDay() {
  return reply(410,{ok:false,message:'预留登记已结束，请重新打开报名页面。'});
}

function referenceCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return '2D-' + [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

export async function registerPartnerTwoDay(request, env, now = Date.now(), onSaved = () => {}) {
  const state = partnerTwoDayState(env, now);
  if (state.closed) return reply(410,{ok:false,closed:true,message:'报名已截止。'});
  if (!state.open) return reply(503,{ok:false,message:'报名暂未开放。'});
  if (!state.payable) return reply(503,{ok:false,message:'费用待确认，暂未开放报名。'});
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403,{ok:false,message:'请从报名页面提交。'});
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return reply(415,{ok:false,message:'提交格式不正确。'});
  if (!request.body) return reply(400,{ok:false,message:'没有收到表单资料。'});
  const reader = request.body.getReader();
  let size=0, text='', data;
  const dec = new TextDecoder('utf-8',{fatal:true});
  try {
    while(true){const {value,done}=await reader.read(); if(done)break; size+=value.byteLength; if(size>4096){await reader.cancel().catch(()=>{});return reply(413,{ok:false,message:'资料过长。'});} text+=dec.decode(value,{stream:true});}
    data=JSON.parse(text+dec.decode());
  } catch { return reply(400,{ok:false,message:'无法读取表单资料。'}); }
  if (!data || typeof data!=='object' || Array.isArray(data)) return reply(400,{ok:false,message:'表单资料不正确。'});
  if (data.website) return reply(400,{ok:false,message:'请重新打开页面提交。'});
  const bad = (field,message) => reply(422,{ok:false,field,message});
  const get = (key,max) => {
    const v = data[key];
    if (v == null) return '';
    if (typeof v !== 'string' || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new Error(key);
    return v.trim();
  };
  const labels={name:'请填写姓名（最多 100 字）。',phone:'请填写有效的马来西亚手机号码。',otherNames:'其他学员姓名最多 1000 字。',companyName:'请填写公司开单名称（最多 160 字）。',companyAddress:'公司地址最多 300 字。'};
  const {seats,companyInvoice} = data;
  if (!Number.isInteger(seats) || seats < 1 || seats > PARTNER_TWO_DAY_MAX_SEATS) return bad('seats',`报名人数请选 1 至 ${PARTNER_TWO_DAY_MAX_SEATS} 位。`);
  if (state.whatsappNotices && data.whatsappConsent !== true) return bad('whatsappConsent','请确认同意接收本次课程的 WhatsApp 报名通知。');
  if (typeof companyInvoice!=='boolean') return bad('companyInvoice','请确认公司开单选项。');
  let name, phone, otherNames, companyName, companyAddress;
  try {
    name=get('name',100); if(!name) throw new Error('name');
    const raw=get('phone',30);
    if(!/^\+?[\d ()-]+$/.test(raw)) throw new Error('phone');
    phone=raw.replace(/[^\d]/g,'').replace(/^00(?=60)/,'').replace(/^0(?=1)/,'60');
    if(!/^601[0-9]{8,9}$/.test(phone)) throw new Error('phone');
    if(seats>1&&typeof data.otherNames==='string')data.otherNames=data.otherNames.replace(/[\r\n\t]+/g,' ');
    otherNames=seats>1 ? (get('otherNames',1000).replace(/ {2,}/g,' ')||null) : null;
    companyName=companyInvoice ? get('companyName',160) : null;
    if(companyInvoice&&!companyName) throw new Error('companyName');
    companyAddress=companyInvoice ? get('companyAddress',300)||null : null;
  } catch(e) { return bad(e.message,labels[e.message]||'请检查填写的资料。'); }
  const amount = partnerTwoDayPrice(state.fees, seats);
  // The page shows the amount it rendered; refuse if the fee changed since the page was opened.
  if (data.expectedAmount !== amount) return reply(409,{ok:false,message:'费用已更新，请重新打开页面确认金额。'});
  const pay = (reference,row) => reply(200,{ok:true,reference,status:'pending_payment',name:row.name,seats:row.seats,amount:row.amount,whatsapp:state.wa,
    message:'报名资料已收到，请按以下资料转账。'});
  const db = env.PARTNER_TWO_DAY_DB;
  try {
    // The dedicated unique phone index makes a concurrent repeat a no-op, without disclosing the original booking.
    const reference = referenceCode();
    const createdAt = new Date(now).toISOString();
    const result = await db.prepare(
      `INSERT INTO signups (reference,contact_name,contact_phone,seats,other_names,company_invoice,company_name,company_address,amount_rm,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,'pending_payment',?) ON CONFLICT(contact_phone) DO NOTHING`
    ).bind(reference,name,phone,seats,otherNames,Number(companyInvoice),companyName,companyAddress,amount,createdAt).run();
    if (!result?.success) throw new Error('insert rejected');
    if (result.meta?.changes === 0) return reply(409,{ok:false,message:'这个号码已经报过名。如需查询报名或付款资料，请联系主办方。'});
    if (result.meta?.changes !== 1) throw new Error('insert not confirmed');
    if (state.whatsappNotices) onSaved({reference,name,phone,seats,amount,createdAt});
    return pay(reference,{name,seats,amount});
  } catch { return reply(503,{ok:false,message:'暂时无法保存，请稍后再试。'}); }
}

export function partnerTwoDayPage(env,method='GET',now=Date.now()) {
  return new Response(method==='HEAD'?null:renderPartnerTwoDay(partnerTwoDayState(env,now)),{headers:{...boundary,'content-type':'text/html; charset=utf-8','x-frame-options':'DENY','content-security-policy':"default-src 'none';style-src 'unsafe-inline' https://fonts.googleapis.com;script-src 'unsafe-inline';font-src https://fonts.gstatic.com;connect-src 'self';form-action 'self';frame-ancestors 'none';base-uri 'none'"}});
}

const rm = n => 'RM' + Number(n).toLocaleString('en-US');

export function renderPartnerTwoDay(state) {
  if (typeof state === 'boolean') state = partnerTwoDayState({PARTNER_TWO_DAY_DB:state?{}:null,PARTNER_TWO_DAY_OPEN:'1'});
  const {open,closed,payable,fees,feesSet,deadline,test,wa,whatsappNotices} = state;
  const live = open && !closed;
  const feeText = n => feesSet ? rm(fees[n]) : '费用待确认';
  const bogo = feesSet && fees[2] < fees[1]*2; // two seats cost less than two singles, e.g. buy one, get one free
  const bank = PARTNER_TWO_DAY_BANK;
  const closedCard = `<div class="closed-card"><strong>报名已截止</strong><p>报名在 2026 年 11 月 27 日（星期五）11:59PM 截止。如有疑问，请直接联系我们。</p></div>`;
  const form = `<noscript><p>请启用 JavaScript 后提交。</p></noscript><form id="signup" autocomplete="on" method="post" action="${registrationPath}" novalidate>
<ol class="steps">
<li class="step"><h3><span class="n">1</span>填写报名资料</h3>
<label for="name">第一位学员姓名</label><input id="name" name="name" required maxlength="100" autocomplete="name">
<label for="phone">联络手机号码（WhatsApp）</label><input id="phone" name="phone" required type="tel" maxlength="30" autocomplete="tel" inputmode="tel" placeholder="012-345 6789">
<fieldset><legend>报名人数</legend><div class="stepper"><button type="button" class="step-btn" data-d="-1" aria-label="减少一位">−</button><label class="seat-box"><input id="seats" name="seats" type="number" inputmode="numeric" min="1" max="${PARTNER_TWO_DAY_MAX_SEATS}" value="1" aria-label="报名人数"><span>位</span></label><button type="button" class="step-btn" data-d="1" aria-label="增加一位">+</button></div>
${bogo&&fees[2]===fees[1]?'<p class="seat-hint">买一送一：每 2 位只收 1 位的价钱。</p>':''}<p class="seat-hint">超过 ${PARTNER_TWO_DAY_MAX_SEATS} 位请直接 WhatsApp 我们。</p></fieldset>
<div id="second" class="conditional" hidden><label for="otherNames">其他学员姓名 <span class="optional">可稍后补，一行一位</span></label><textarea id="otherNames" name="otherNames" maxlength="1000" rows="2" disabled></textarea></div>
<label class="check" for="companyInvoice"><input id="companyInvoice" name="companyInvoice" type="checkbox">需要开单给公司</label>
<div id="company" class="conditional" hidden><label for="companyName">公司开单名称</label><input id="companyName" name="companyName" maxlength="160" autocomplete="organization" disabled><label for="companyAddress">公司地址 <span class="optional">选填</span></label><input id="companyAddress" name="companyAddress" maxlength="300" autocomplete="street-address" disabled><p>其他公司资料，之后需要时再向你确认。</p></div>
</li>
<li class="step"><h3><span class="n">2</span>应付金额</h3>
<div class="amount${feesSet?'':' pending'}"><span id="amountLabel">1 位学员</span><span class="price"><s id="was" hidden></s><strong id="amount">${feeText(1)}</strong></span></div>
<p id="promo" class="promo" hidden></p>
${feesSet?'':'<p class="note">一人和两人的收费确认后才开放报名。</p>'}
<div class="honeypot" aria-hidden="true"><label for="website">请留空</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<p class="privacy">按「报名」后会显示付款资料。你填写的资料只用于本次课程报名、联络和开单，不会公开。</p>
${whatsappNotices?'<label class="check" for="whatsappConsent"><input id="whatsappConsent" name="whatsappConsent" type="checkbox" required>我同意通过 WhatsApp 接收本次课程的报名资料和付款指示。</label>':''}
<button type="submit" id="submit"${payable?'':' disabled'}>${payable?'报名':'费用确认后开放报名'}</button>
</li>
</ol>
</form><div id="result" role="status" aria-live="polite" tabindex="-1"></div>`;
  const bankRows = `<dl class="bank"><div><dt>收款户名</dt><dd>${bank.holder}</dd></div><div><dt>注册编号</dt><dd>${bank.regNo}</dd></div><div><dt>银行</dt><dd>${bank.bank}</dd></div><div><dt>户口号码</dt><dd class="acct"><span>${bank.account}</span><button type="button" class="copy" data-copy="${bank.account}">复制</button></dd></div></dl>`;
  const payTpl = `<template id="payTpl"><div class="pay"><p class="pay-tag">报名成功 · 待付款</p><h3 class="pay-h">请转账完成报名</h3><p class="pay-msg"></p>
<div class="pay-sum"><div><span>报名编号</span><b class="ref"></b></div><div><span>学员</span><b class="who"></b></div><div><span>应付金额</span><b class="amt"></b></div></div>
<p class="pay-step"><i>1</i>转账到以下户口</p>${bankRows}<p class="note">转账备注请写报名编号 <b class="ref"></b>。</p>
<p class="pay-step"><i>2</i>付款后，把付款凭证 WhatsApp 给我们</p><a class="wa" target="_blank" rel="noopener">我已付款，WhatsApp 发付款凭证</a>
<p class="pay-fine">我们核对款项后，会通过 WhatsApp 确认你的名额。</p></div></template>`;
  const script = `<script>
const DEADLINE=${deadline}, FEES=${JSON.stringify(feesSet?fees:null)}, PAYABLE=${payable}, MAX=${PARTNER_TWO_DAY_MAX_SEATS};
const price=n=>Math.floor(n/2)*FEES[2]+(n%2)*FEES[1], money=v=>'RM'+Number(v).toLocaleString('en-US');
const freeOf=n=>FEES&&FEES[2]<FEES[1]*2?n*FEES[1]-price(n):0;
const pad=n=>String(n).padStart(2,'0');
const cd=document.querySelector('#countdown'), cd2=document.querySelector('#cd2');
let paid=false;
function endBar(){cd2.textContent='报名已截止';cd2.closest('.bar').classList.add('ended');document.querySelector('.bar-l').textContent='两天 AI 企业助理课程';}
function closeNow(){endBar();if(paid)return;const box=document.querySelector('#registration');box.querySelector('.form-body').innerHTML=${JSON.stringify(closedCard)};cd.closest('.deadline').classList.add('ended');cd.textContent='报名已截止';document.querySelectorAll('.jump').forEach(j=>j.remove());document.querySelector('.tag').textContent='报名已截止';}
function tick(){const left=DEADLINE-Date.now();if(left<=0){closeNow();cd.closest('.deadline').classList.add('ended');cd.textContent='报名已截止';return;}const s=Math.floor(left/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);cd.innerHTML=cd2.innerHTML=(d?'<b>'+d+'</b> 天 ':'')+'<b>'+pad(h)+'</b> 时 <b>'+pad(m)+'</b> 分 <b>'+pad(s%60)+'</b> 秒';setTimeout(tick,1000-Date.now()%1000);}
const f=document.querySelector('#signup');
function copyBtns(root){root.querySelectorAll('.copy').forEach(b=>b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='已复制';setTimeout(()=>b.textContent='复制',1500);}catch{}}));}
function payPanel(a){const n=document.querySelector('#payTpl').content.cloneNode(true);const rmT='RM'+Number(a.amount).toLocaleString('en-US');const ref='#'+a.reference;const fr=FEES&&FEES[2]===FEES[1]?Math.floor(a.seats/2):0;const who=a.seats+' 位'+(fr?'（买一送一，免费 '+fr+' 位）':'');
n.querySelectorAll('.ref').forEach(e=>e.textContent=ref);n.querySelector('.who').textContent=who;n.querySelector('.amt').textContent=rmT;n.querySelector('.pay-msg').textContent=a.message;
const text='你好，我已完成「两天 AI 企业助理课程」的付款。\\n报名编号：'+ref+'\\n姓名：'+a.name+'\\n人数：'+who+'\\n金额：'+rmT+'\\n（附上付款凭证）';
n.querySelector('.wa').href='https://wa.me/'+a.whatsapp+'?text='+encodeURIComponent(text);copyBtns(n);return n;}
if(f){const result=document.querySelector('#result'), button=f.querySelector('#submit'), label=button.textContent;
const seatsEl=f.elements.seats;
function seatCount(){const n=parseInt(seatsEl.value,10);return Number.isFinite(n)?Math.min(MAX,Math.max(1,n)):1;}
function fields(){const n=seatCount(), many=n>1, bill=f.elements.companyInvoice.checked;document.querySelector('#second').hidden=!many;document.querySelector('#company').hidden=!bill;f.elements.otherNames.disabled=!many;f.elements.companyName.disabled=!bill;f.elements.companyName.required=bill;f.elements.companyAddress.disabled=!bill;
f.querySelector('[data-d="-1"]').disabled=n<=1;f.querySelector('[data-d="1"]').disabled=n>=MAX;
document.querySelector('#amountLabel').textContent=n+' 位学员'+(many?'合计':'');document.querySelector('#amount').textContent=FEES?money(price(n)):'费用待确认';
const save=FEES?freeOf(n):0, fr=FEES&&FEES[2]===FEES[1]?Math.floor(n/2):0;document.querySelector('#was').hidden=!save;document.querySelector('#was').textContent=save?money(n*FEES[1]):'';
const pr=document.querySelector('#promo');pr.hidden=!save;pr.textContent=fr?'买一送一：免费 '+fr+' 位，省 '+money(save):save?'多人同报优惠，省 '+money(save):'';}
f.querySelectorAll('.step-btn').forEach(b=>b.addEventListener('click',()=>{seatsEl.value=Math.min(MAX,Math.max(1,seatCount()+Number(b.dataset.d)));fields();}));
seatsEl.addEventListener('input',fields);seatsEl.addEventListener('blur',()=>{seatsEl.value=seatCount();fields();});
f.addEventListener('input',fields);f.addEventListener('change',fields);fields();
function fail(msg,field){result.dataset.error='';result.textContent=msg;const el=field&&f.elements[field];if(el?.setAttribute){el.setAttribute('aria-invalid','true');el.scrollIntoView({block:'center'});el.focus({preventScroll:true});}else result.focus();}
f.addEventListener('submit',async e=>{e.preventDefault();if(button.disabled||!PAYABLE)return;for(const el of f.querySelectorAll('[aria-invalid]'))el.removeAttribute('aria-invalid');result.textContent='';result.removeAttribute('data-error');
if(Date.now()>=DEADLINE){closeNow();return;}
if(f.elements.whatsappConsent && !f.elements.whatsappConsent.checked)return fail('请确认同意接收本次课程的 WhatsApp 报名通知。','whatsappConsent');
if(!f.elements.name.value.trim())return fail('请填写第一位学员姓名。','name');if(!f.elements.phone.value.trim())return fail('请填写联络手机号码。','phone');if(f.elements.companyInvoice.checked&&!f.elements.companyName.value.trim())return fail('请填写公司开单名称。','companyName');
const n=seatCount(),bill=f.elements.companyInvoice.checked;seatsEl.value=n;
const body={name:f.elements.name.value,phone:f.elements.phone.value,seats:n,otherNames:n>1?f.elements.otherNames.value:undefined,companyInvoice:bill,companyName:bill?f.elements.companyName.value:undefined,companyAddress:bill?f.elements.companyAddress.value:undefined,expectedAmount:FEES?price(n):null,website:f.elements.website.value,whatsappConsent:f.elements.whatsappConsent?.checked};
button.disabled=true;button.textContent='正在提交…';try{const r=await fetch(f.action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const answer=await r.json();if(answer.closed){closeNow();return;}if(!r.ok||!answer.ok)return fail(answer.message||'暂时提交不了，请稍后再试。',answer.field);
paid=true;const card=document.querySelector('#registration');card.querySelector('h2').textContent='付款资料';card.querySelector('.form-body').replaceChildren(payPanel(answer));
const dlg=document.querySelector('#payDlg');dlg.querySelector('.dlg-body').replaceChildren(payPanel(answer));if(dlg.showModal)dlg.showModal();else card.scrollIntoView();}
catch{fail('暂时提交不了，请检查网络后再试。');}finally{button.disabled=false;button.textContent=label;}});}
document.querySelector('#payDlg .dlg-x')?.addEventListener('click',()=>{document.querySelector('#payDlg').close();document.querySelector('#registration').scrollIntoView({block:'start'});});
tick();
</script>`;
  return `<!doctype html><html lang="zh-Hans" data-type="software"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="page-type" content="software"><meta name="site-kind" content="software"><meta name="description" content="两天 AI 企业助理课程报名：12 月 7–8 日，新山。"><meta name="robots" content="noindex,nofollow"><meta property="og:title" content="两天 AI 企业助理课程 · 报名"><meta property="og:description" content="12 月 7–8 日 · 新山 · 报名截止 11 月 27 日 11:59PM。"><meta name="theme-color" content="#160A05"><title>两天 AI 企业助理课程 · 报名</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,400..700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet"><style>
:root{color-scheme:light;--bg:#F8F4EE;--card:#fff;--ink:#1A0E08;--ink2:rgba(26,14,8,.72);--mute:rgba(26,14,8,.55);--line:rgba(26,14,8,.09);--field:rgba(26,14,8,.16);--orange:#E8590C;--orange2:#FF7A1A;--peach:#FDE3CC;--dark:#1A0D07;--cream:#FFF6EF;--sans:"Google Sans Flex","Noto Sans SC",ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--sans);color:var(--ink);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.wrap{width:min(1120px,100% - 40px);margin-inline:auto}h1,h2,h3{font-weight:700;letter-spacing:-.035em;line-height:1.12;text-wrap:balance}
.skip{position:absolute;top:0;left:12px;z-index:80;transform:translateY(-150%);background:#fff;padding:10px;border-radius:9px}.skip:focus{transform:none}
.nav{position:fixed;top:14px;left:0;right:0;z-index:60;pointer-events:none}.nav-in{pointer-events:auto;width:min(760px,100% - 24px);margin-inline:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 7px 7px 14px;border-radius:14px;background:rgba(40,24,16,.62);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.brand{color:var(--cream);font-weight:700;font-size:15px;white-space:nowrap;text-decoration:none}.menu{display:flex;align-items:center;gap:4px}.menu a:not(.btn){color:rgba(255,246,239,.82);text-decoration:none;font-size:14.5px;padding:7px 11px;border-radius:9px}.menu a:not(.btn):hover{background:rgba(255,255,255,.1);color:#fff}.menu .btn{padding:8px 14px;font-size:14.5px;border-radius:9px;margin-left:6px}.bar{padding:9px 16px;min-height:50px;background:rgba(26,13,7,.9)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 10px 30px rgba(26,14,8,.18)!important}.bar-l{color:rgba(255,246,239,.78);font-size:14px;font-weight:600;white-space:nowrap}.bar-cd{color:var(--cream);font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}.bar-cd b{color:#FFB36B;font-size:19px;font-weight:700;margin-left:3px}.bar.ended .bar-cd{color:#FFD9C7;font-weight:700}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 22px;border-radius:12px;font-weight:600;font-size:16px;text-decoration:none;border:0;cursor:pointer;font-family:var(--sans);transition:transform .15s}.btn:hover{transform:translateY(-2px)}.btn:active{transform:translateY(0) scale(.98)}.btn-w{background:#fff;color:var(--ink);box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 8px 24px rgba(0,0,0,.18)}
.hero{position:relative;padding:136px 0 96px;text-align:center;color:var(--cream);background:radial-gradient(60% 46% at 50% 100%,rgba(255,170,90,.8),rgba(255,122,26,0) 70%),linear-gradient(180deg,#160A05 0%,#2B1308 24%,#6A260A 52%,#C2480B 82%,#E8590C 100%)}
.badge{display:inline-flex;align-items:center;gap:9px;padding:5px 14px 5px 6px;border-radius:999px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);font-size:14px;color:rgba(255,246,239,.88)}.badge i{width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#FFB36B,var(--orange))}
.hero h1{font-size:clamp(40px,7vw,84px);letter-spacing:-.045em;line-height:1.08;margin:24px auto 0;max-width:15ch;text-shadow:0 2px 30px rgba(0,0,0,.18)}.hl{background:linear-gradient(180deg,#FFF6EF 20%,#FFC79A);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .lead{font-size:clamp(16px,1.6vw,19px);line-height:1.7;color:rgba(255,246,239,.86);margin:20px auto 0;max-width:30em;text-wrap:balance}
.deadline{margin:34px auto 0;max-width:560px;padding:18px 22px;border-radius:20px;background:rgba(20,10,5,.42);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.deadline p{margin:0;font-size:14px;color:rgba(255,246,239,.72)}#countdown{display:block;margin-top:6px;font-size:16px;color:rgba(255,246,239,.8);font-variant-numeric:tabular-nums}#countdown b{font-size:clamp(30px,4.4vw,44px);font-weight:700;letter-spacing:-.03em;color:#FFB36B;margin-left:4px}.deadline.ended{background:rgba(90,20,8,.55)}.deadline.ended #countdown{font-size:24px;font-weight:700;color:#FFD9C7}
.facts{margin:18px auto 0;max-width:900px;display:grid;grid-template-columns:1.1fr .9fr .8fr 1.2fr;gap:10px;text-align:left}.facts div{padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.13)}.facts dt{font-size:13px;font-weight:600;color:#FFB36B}.facts dd{margin:3px 0 0;font-weight:600;line-height:1.45}.facts small{display:block;font-weight:400;font-size:13px;color:rgba(255,246,239,.62)}
.hero .jump{margin-top:30px}
.sign{padding:84px 0 96px}.sign-in{display:grid;grid-template-columns:1fr 1.15fr;gap:56px;align-items:start}.sign-l{position:sticky;top:96px}.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--orange);margin:0 0 14px}.eyebrow::before{content:"";width:14px;height:14px;border-radius:4px;background:linear-gradient(135deg,var(--orange2),var(--orange));box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)}.sign-l h2{margin:0;font-size:clamp(32px,4.4vw,52px);letter-spacing:-.045em}.sign-l .lead{margin:16px 0 0;color:var(--ink2);font-size:17px;max-width:30em}
.flow{list-style:none;margin:26px 0 0;padding:0;display:grid;gap:12px}.flow li{display:flex;gap:14px;align-items:baseline;font-size:16.5px;color:var(--ink2);padding-top:12px;border-top:1px solid var(--line)}.flow i{font-style:normal;font-weight:700;font-size:13px;color:var(--orange);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.form-card{border-radius:28px;background:#fff;box-shadow:0 0 0 1px var(--line),0 30px 80px rgba(26,14,8,.10);padding:30px 32px;scroll-margin-top:84px}.form-card>h2{margin:0 0 6px;font-size:26px}.form-card p{margin:3px 0 14px;color:var(--ink2);font-size:15px}
.test{margin:0 0 16px!important;padding:8px 12px;border-radius:10px;background:#FFF1DE;box-shadow:inset 0 0 0 1px #F3C48F;color:#8A4300!important;font-size:13.5px!important}
.steps{list-style:none;margin:0;padding:0}.step{padding:20px 0;border-top:1px solid var(--line)}.step:first-child{border-top:0;padding-top:6px}.step h3{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:19px;letter-spacing:-.02em}.n{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,var(--orange2),var(--orange));color:#fff;font-size:14px;letter-spacing:0;flex:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)}
label,legend{font-weight:600;font-size:15px}label{display:block;margin:14px 0 6px}input:not([type=checkbox]):not([type=radio]):not([type=file]){font:inherit;width:100%;min-height:48px;border:0;box-shadow:inset 0 0 0 1px var(--field);border-radius:12px;padding:10px 14px;background:#fff;color:var(--ink);transition:box-shadow .15s}input:not([type=checkbox]):not([type=radio]):not([type=file]):focus{outline:none;box-shadow:inset 0 0 0 2px var(--orange)}input::placeholder{color:rgba(26,14,8,.35)}
fieldset{border:0;padding:0;margin:16px 0 0;min-width:0}.choices{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}.choices label,.check{display:flex;align-items:center;gap:10px;min-height:48px;margin:0;padding:8px 14px;border-radius:12px;box-shadow:inset 0 0 0 1px var(--field);cursor:pointer;transition:background .15s,box-shadow .15s}.check{margin-top:14px}.choices label:has(:checked),.check:has(:checked){background:#FFF3E8;box-shadow:inset 0 0 0 2px var(--orange)}.check:has(:disabled){opacity:.5;cursor:default}input[type=radio],input[type=checkbox]{accent-color:var(--orange);width:18px;height:18px;margin:0;flex:none}.optional{font-weight:400;font-size:.87em;color:var(--mute)}.conditional{padding:2px 0 4px}
.amount{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:16px 18px;border-radius:16px;background:var(--bg);margin:10px 0 4px}.amount>span:first-child{color:var(--ink2);font-weight:600;white-space:nowrap}.price{display:flex;align-items:baseline;gap:10px}.price s{font-size:17px;font-weight:600;color:var(--mute);text-decoration-thickness:2px}.promo{display:inline-block;margin:6px 0 2px!important;padding:4px 12px;border-radius:999px;background:var(--orange);color:#fff!important;font-weight:700;font-size:13.5px!important}.free{font-style:normal;margin-left:auto;font-size:12.5px;font-weight:700;color:var(--orange);background:var(--peach);border-radius:999px;padding:2px 9px}.amount strong{font-size:clamp(30px,4vw,40px);letter-spacing:-.04em;font-variant-numeric:tabular-nums}.amount.pending strong{font-size:18px;letter-spacing:0;color:var(--orange);background:var(--peach);padding:3px 12px;border-radius:999px}.note{font-size:14px!important;color:#9A4A12!important;margin:10px 0 0!important}
.bank{margin:10px 0 0;border-radius:16px;background:var(--bg);padding:4px 18px}.bank div{display:grid;grid-template-columns:5.2em 1fr;gap:12px;padding:11px 0;border-top:1px solid var(--line)}.bank div:first-child{border-top:0}.bank dt{color:var(--mute);font-size:14px}.bank dd{margin:0;font-weight:600;overflow-wrap:anywhere}.acct{display:flex;align-items:center;justify-content:space-between;gap:8px}.acct span{font-size:20px;letter-spacing:.03em;font-variant-numeric:tabular-nums;white-space:nowrap}button.copy{font:inherit;font-size:14px;font-weight:600;min-height:34px;padding:3px 14px;border:0;border-radius:9px;background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px var(--field);cursor:pointer;white-space:nowrap;flex:none}
.pay-tag{display:inline-block;margin:0 0 8px!important;padding:3px 12px;border-radius:999px;background:var(--orange);color:#fff!important;font-weight:700;font-size:13px!important}.pay-h{margin:0;font-size:24px}.pay-msg{margin:6px 0 14px!important}.pay-sum{display:grid;gap:0;border-radius:16px;background:var(--bg);padding:4px 18px}.pay-sum div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line)}.pay-sum div:first-child{border-top:0}.pay-sum span{color:var(--mute);font-size:14px}.pay-sum b{font-variant-numeric:tabular-nums}.pay-sum .amt{font-size:22px;letter-spacing:-.02em}.pay-step{display:flex;align-items:center;gap:10px;margin:20px 0 0!important;font-weight:700;color:var(--ink)!important;font-size:16.5px!important}.pay-step i{font-style:normal;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--orange2),var(--orange));color:#fff;font-size:13px}.wa{display:flex;align-items:center;justify-content:center;min-height:54px;margin-top:10px;border-radius:12px;background:#1FA855;color:#fff;font-weight:700;font-size:17px;text-decoration:none;box-shadow:0 8px 20px rgba(31,168,85,.28);transition:transform .15s}.wa:hover{transform:translateY(-2px)}.pay-fine{margin:10px 0 0!important;font-size:13.5px!important;color:var(--mute)!important}#payDlg{width:min(520px,100% - 24px);max-height:calc(100dvh - 24px);padding:0;border:0;border-radius:24px;background:#fff;color:var(--ink);box-shadow:0 30px 80px rgba(26,14,8,.3)}#payDlg::backdrop{background:rgba(20,10,5,.55);backdrop-filter:blur(3px)}.dlg-in{padding:24px 24px 22px;position:relative}.dlg-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:10px;background:var(--bg);color:var(--ink);font-size:20px;cursor:pointer}
.privacy{margin:0 0 14px!important;font-size:14px!important;color:var(--mute)!important}.honeypot{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#submit{font:inherit;width:100%;min-height:54px;border:0;border-radius:12px;background:var(--dark);color:var(--cream);font-weight:600;font-size:17px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 8px 20px rgba(26,13,7,.25);transition:transform .15s}#submit:not(:disabled):hover{transform:translateY(-2px)}#submit:not(:disabled):active{transform:scale(.98)}#submit:disabled{cursor:default;background:rgba(26,14,8,.18);color:rgba(26,14,8,.5);box-shadow:none}
:focus-visible{outline:3px solid var(--orange);outline-offset:3px}#result:not(:empty){margin-top:14px;padding:14px 16px;border-radius:14px;background:#FFF3E8;color:var(--ink)}#result strong{display:inline-block;font-size:13px;color:#fff;background:var(--orange);border-radius:999px;padding:2px 10px;margin-bottom:4px}#result[data-error]:not(:empty){background:#FFF0EA;color:#8A2A14}[aria-invalid=true]{box-shadow:inset 0 0 0 2px #B3341A!important}
.closed-card{padding:22px;border-radius:16px;background:var(--bg)}.closed-card strong{font-size:22px}.closed-card p{margin:6px 0 0!important}
.site-foot{background:#140A05;color:rgba(255,246,239,.5);font-size:14px;padding:28px 0}.site-foot a{color:rgba(255,246,239,.82)}
[hidden]{display:none!important}[data-enter]{animation:opening .5s ease-out both}@keyframes opening{from{transform:translateY(8px);opacity:.6}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto}}
@media(max-width:860px){.sign-in{grid-template-columns:minmax(0,1fr);gap:28px}.sign-l{position:static}.flow{display:none}.facts{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.wrap{width:calc(100% - 32px)}.bar{padding:8px 12px;gap:8px}.bar-l{font-size:12.5px}.bar-cd{font-size:12.5px}.bar-cd b{font-size:17px;margin-left:2px}.amount{padding:14px}.price{gap:6px}.price s{font-size:15px}.amount strong{font-size:28px}.hero{padding:104px 0 64px}.menu a:not(.btn){display:none}.deadline{padding:14px 16px;margin-top:26px}#countdown b{font-size:28px}.facts{gap:8px}.facts div{padding:12px}.hero .jump{width:100%}.sign{padding:48px 0 64px}.form-card{padding:20px 18px;border-radius:22px}.sign-l .lead{font-size:15.5px}.bank{padding:2px 14px}.bank div{grid-template-columns:1fr;gap:2px;padding:10px 0}.bank dt{font-size:13px}.acct span{font-size:19px}}
.page{padding:112px 0 80px;color:var(--cream);background:radial-gradient(70% 40% at 30% 62%,rgba(255,170,90,.55),rgba(255,122,26,0) 70%),linear-gradient(180deg,#160A05 0,#2B1308 160px,#6A260A 380px,#C2480B 560px,#E8590C 680px,#F3B98F 820px,var(--bg) 960px)}.page-in{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,480px);gap:56px;align-items:start}.info{position:sticky;top:92px;padding-top:8px}.info h1{font-size:clamp(40px,5vw,72px);letter-spacing:-.045em;line-height:1.08;margin:22px 0 0;text-shadow:0 2px 30px rgba(0,0,0,.18)}.info .lead{font-size:18px;line-height:1.7;color:rgba(255,246,239,.86);margin:16px 0 0;max-width:30em}.info .deadline{margin:26px 0 0;max-width:none;text-align:left}.info .facts{margin:12px 0 0;max-width:none;grid-template-columns:1fr 1fr}.howpay{margin:14px 0 0;padding:12px 16px;border-radius:14px;background:rgba(20,10,5,.32);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);font-size:14.5px;color:rgba(255,246,239,.86)}.page .form-card{margin-top:4px;color:var(--ink)}.amount{flex-wrap:wrap;row-gap:2px}.amount .price{margin-left:auto;flex-wrap:wrap;justify-content:flex-end}.stepper{display:grid;grid-template-columns:52px 1fr 52px;gap:10px;margin-top:6px}.step-btn{font:inherit;font-size:24px;font-weight:600;min-height:52px;border:0;border-radius:12px;background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px var(--field);cursor:pointer}.step-btn:not(:disabled):hover{background:#FFF3E8;box-shadow:inset 0 0 0 2px var(--orange)}.step-btn:disabled{opacity:.35;cursor:default}.seat-box{display:flex;align-items:center;justify-content:center;gap:6px;margin:0;min-height:52px;border-radius:12px;background:#FFF3E8;box-shadow:inset 0 0 0 2px var(--orange)}.seat-box input{width:3.2ch!important;min-height:0!important;padding:0!important;border:0;background:transparent!important;box-shadow:none!important;text-align:center;font:inherit;font-size:24px!important;font-weight:700;color:var(--ink);-moz-appearance:textfield}.seat-box input::-webkit-inner-spin-button,.seat-box input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.seat-box span{font-weight:600}.seat-hint{margin:8px 0 0!important;font-size:13.5px!important;color:var(--mute)!important}.seat-hint+.seat-hint{margin-top:2px!important}textarea{font:inherit;width:100%;border:0;box-shadow:inset 0 0 0 1px var(--field);border-radius:12px;padding:10px 14px;background:#fff;color:var(--ink);resize:vertical}textarea:focus{outline:none;box-shadow:inset 0 0 0 2px var(--orange)}.info .facts div{background:rgba(26,12,5,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.info .facts dt{color:#FFC48A;font-size:13.5px}.info .facts dd{color:#FFF6EF;font-size:17px}.info .facts small{color:rgba(255,246,239,.78);font-size:13.5px}.howpay{background:rgba(26,12,5,.55)!important;color:#FFF6EF!important}.info .deadline{background:rgba(26,12,5,.55)}@media(max-width:560px){.info .facts dd{font-size:15.5px}.info .facts small{font-size:12.5px}}@media(min-width:901px){.info h1 .hl{display:block}}.info .lead{text-wrap:pretty}@media(max-width:900px){.page-in{grid-template-columns:minmax(0,1fr);gap:28px}.info{position:static}.page{background:radial-gradient(80% 30% at 50% 55%,rgba(255,170,90,.5),rgba(255,122,26,0) 70%),linear-gradient(180deg,#160A05 0,#2B1308 18%,#6A260A 38%,#C2480B 55%,#E8590C 64%,#F3B98F 74%,var(--bg) 82%)}}@media(max-width:560px){.page{padding:104px 0 56px}.info h1{font-size:clamp(34px,10vw,44px)}.info .lead{font-size:15.5px}.info .deadline{display:none}.info .facts{margin-top:20px}.howpay{font-size:13.5px}.nav{top:8px}.bar{flex-direction:column;align-items:center;justify-content:center;gap:0;padding:8px 12px 10px}.bar-l{font-size:12.5px}.bar-cd{font-size:14px}.bar-cd b{font-size:28px;margin-left:4px}}
</style></head><body><a class="skip" href="#registration">跳到报名表单</a><header class="nav"><div class="nav-in bar${closed?' ended':''}" role="timer" aria-live="off"><span class="bar-l">${closed?'两天 AI 企业助理课程':'报名截止 · 11 月 27 日（五）11:59PM'}</span><span id="cd2" class="bar-cd">${closed?'报名已截止':''}</span></div></header>
<main><section class="page" aria-labelledby="title"><div class="wrap page-in">
<div class="info" data-enter><div class="badge"><i></i><span class="tag">${closed?'报名已截止':'报名 · 银行转账'}</span></div><h1 id="title">两天 AI <span class="hl">企业助理课程</span></h1><p class="lead">一个人或多人一起报名都可以，每 2 位只收 1 位的价钱。其他学员的名字可以之后再补。</p>
<div class="deadline${closed?' ended':''}"><p>报名截止：2026 年 11 月 27 日（星期五）11:59PM（马来西亚时间）</p><span id="countdown">${closed?'报名已截止':'计算剩余时间…'}</span></div>
<dl class="facts"><div><dt>日期</dt><dd>${PARTNER_TWO_DAY_CLASS.date}<small>${PARTNER_TWO_DAY_CLASS.dayNote}</small></dd></div><div><dt>时间</dt><dd>${PARTNER_TWO_DAY_CLASS.hours}</dd></div><div><dt>地点</dt><dd>${PARTNER_TWO_DAY_CLASS.city}<small>${PARTNER_TWO_DAY_CLASS.venueNote}</small></dd></div><div><dt>餐饮</dt><dd>包含一顿午餐和一次茶点</dd></div></dl>
<p class="howpay">报名后会显示银行转账资料。付款后，把付款凭证 WhatsApp 给我们，核对后确认名额。</p></div>
<div id="registration" class="form-card" tabindex="-1">${test?'<p class="test">本地测试预览 · 金额和资料都是测试值，不会收款</p>':''}<h2>报名和付款</h2>
<div class="form-body">${closed?closedCard:open?form:'<p>报名暂未开放。</p>'}</div>
</div></div></section></main><footer class="site-foot"><div class="wrap">两天 AI 企业助理课程 · <a href="/2daysclass/">课程介绍</a></div></footer>${live?payTpl+'<dialog id="payDlg" aria-label="付款资料"><div class="dlg-in"><button type="button" class="dlg-x" aria-label="关闭">×</button><div class="dlg-body"></div></div></dialog>':''}${closed?'':script}</body></html>`;
}
