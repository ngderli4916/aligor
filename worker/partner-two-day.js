// Two-day course sign-up + bank-transfer proof. Isolated from the personal-course CRM:
// only PARTNER_TWO_DAY_DB (D1) and PARTNER_TWO_DAY_PROOFS (private R2) are touched.
const registrationPath = '/api/2days-botsclass/registrations';
// 2026-11-27 (Fri) 11:59PM Malaysia time (UTC+8); accepted through 23:59:59.
export const PARTNER_TWO_DAY_DEADLINE = '2026-11-27T23:59:59.999+08:00';
export const PARTNER_TWO_DAY_BANK = {
  holder: 'J & J BUSINESS MANAGEMENT SERVICES',
  regNo: 'JM0632306-M',
  bank: 'Hong Leong Bank（HLB）',
  account: '37900006808',
};
const MAX_PROOF = 5 * 1024 * 1024;
const MAX_BODY = MAX_PROOF + 64 * 1024;
const boundary = { 'cache-control':'no-store', 'x-robots-tag':'noindex, nofollow', 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff' };
const reply = (status, data) => Response.json(data, {status, headers:boundary});
const available = env => Boolean(env.PARTNER_TWO_DAY_DB && env.PARTNER_TWO_DAY_OPEN === '1');
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
  return {
    open, deadline, fees, feesSet,
    closed: now >= deadline,
    // Real payment intake needs: fees for both options, private proof bucket, and an explicit switch.
    payable: open && feesSet && Boolean(env.PARTNER_TWO_DAY_PROOFS) && env.PARTNER_TWO_DAY_PAYMENT_OPEN === '1',
    test: env.PARTNER_TWO_DAY_TEST_MODE === '1',
  };
}

// The earlier no-payment reservation endpoint is retired; its stored rows are left untouched.
export async function reservePartnerTwoDay() {
  return reply(410,{ok:false,message:'预留登记已结束，请重新打开报名页面。'});
}

const PROOF_TYPES = [
  { type:'image/jpeg', ext:'jpg', test:b => b[0]===0xff && b[1]===0xd8 && b[2]===0xff },
  { type:'image/png', ext:'png', test:b => b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47 },
  { type:'image/webp', ext:'webp', test:b => String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP' },
  { type:'image/heic', ext:'heic', test:b => String.fromCharCode(...b.slice(4,8))==='ftyp' && /^(heic|heix|mif1|msf1|hevc)$/.test(String.fromCharCode(...b.slice(8,12))) },
  { type:'application/pdf', ext:'pdf', test:b => String.fromCharCode(...b.slice(0,5))==='%PDF-' },
];

function referenceCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return '2D-' + [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

export async function registerPartnerTwoDay(request, env, now = Date.now()) {
  const state = partnerTwoDayState(env, now);
  if (state.closed) return reply(410,{ok:false,closed:true,message:'报名已截止。'});
  if (!state.open) return reply(503,{ok:false,message:'报名暂未开放。'});
  if (!state.payable) return reply(503,{ok:false,message:'费用待确认，暂未开放付款和提交。'});
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403,{ok:false,message:'请从报名页面提交。'});
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get('content-type') || '')) return reply(415,{ok:false,message:'提交格式不正确。'});
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return reply(411,{ok:false,message:'请从报名页面提交。'});
  if (length > MAX_BODY) return reply(413,{ok:false,field:'proof',message:'付款凭证不能超过 5MB。'});
  let form;
  try { form = await request.formData(); } catch { return reply(400,{ok:false,message:'无法读取表单资料。'}); }
  if (form.get('website')) return reply(400,{ok:false,message:'请重新打开页面提交。'});
  const bad = (field,message) => reply(422,{ok:false,field,message});
  const get = (key,max) => {
    const v = form.get(key);
    if (v == null) return '';
    if (typeof v !== 'string' || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new Error(key);
    return v.trim();
  };
  const labels={name:'请填写姓名（最多 100 字）。',phone:'请填写有效的马来西亚手机号码。',secondName:'第二位姓名最多 100 字。',companyName:'请填写公司开单名称（最多 160 字）。',companyAddress:'公司地址最多 300 字。'};
  const seats = Number(form.get('seats'));
  if (![1,2].includes(seats)) return bad('seats','请选择报名人数。');
  const companyInvoice = form.get('companyInvoice') === 'on';
  let name, phone, secondName, companyName, companyAddress;
  try {
    name=get('name',100); if(!name) throw new Error('name');
    const raw=get('phone',30);
    if(!/^\+?[\d ()-]+$/.test(raw)) throw new Error('phone');
    phone=raw.replace(/[^\d]/g,'').replace(/^00(?=60)/,'').replace(/^0(?=1)/,'60');
    if(!/^601[0-9]{8,9}$/.test(phone)) throw new Error('phone');
    secondName=seats===2 ? get('secondName',100)||null : null;
    companyName=companyInvoice ? get('companyName',160) : null;
    if(companyInvoice&&!companyName) throw new Error('companyName');
    companyAddress=companyInvoice ? get('companyAddress',300)||null : null;
  } catch(e) { return bad(e.message,labels[e.message]||'请检查填写的资料。'); }
  if (form.get('amountConfirmed') !== 'on') return bad('amountConfirmed','请确认应付金额。');
  const amount = state.fees[seats];
  // The page shows the amount it rendered; refuse if the fee changed since the page was opened.
  if (String(form.get('expectedAmount') || '') !== String(amount)) return reply(409,{ok:false,message:'费用已更新，请重新打开页面确认金额。'});
  const proof = form.get('proof');
  if (!proof || typeof proof === 'string' || !proof.size) return bad('proof','请上传付款凭证。');
  if (proof.size > MAX_PROOF) return bad('proof','付款凭证不能超过 5MB。');
  const bytes = new Uint8Array(await proof.arrayBuffer());
  const kind = PROOF_TYPES.find(t => t.test(bytes.subarray(0,16)));
  if (!kind) return bad('proof','付款凭证只接受 JPG、PNG、WEBP、HEIC 或 PDF。');
  const reference = referenceCode();
  const key = `proofs/${new Date(now).toISOString().slice(0,10)}/${crypto.randomUUID()}.${kind.ext}`;
  const db = env.PARTNER_TWO_DAY_DB;
  try {
    const existing = await db.prepare('SELECT 1 FROM registrations WHERE contact_phone = ? LIMIT 1').bind(phone).first();
    if (existing) return reply(409,{ok:false,field:'phone',message:'这个号码已提交过报名和付款凭证。如需补交或修改，请直接联系我们。'});
    await env.PARTNER_TWO_DAY_PROOFS.put(key, bytes, { httpMetadata:{contentType:kind.type}, customMetadata:{reference} });
  } catch { return reply(503,{ok:false,message:'暂时无法保存，请稍后再试。'}); }
  try {
    const result = await db.prepare(
      `INSERT INTO registrations (reference,contact_name,contact_phone,seats,second_name,company_invoice,company_name,company_address,amount_rm,proof_key,proof_type,proof_size,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending_verification',?)`
    ).bind(reference,name,phone,seats,secondName,Number(companyInvoice),companyName,companyAddress,amount,key,kind.type,bytes.byteLength,new Date(now).toISOString()).run();
    if (!result?.success) throw new Error('insert rejected');
  } catch {
    await env.PARTNER_TWO_DAY_PROOFS.delete(key).catch(()=>{});
    return reply(503,{ok:false,message:'暂时无法保存，请稍后再试。'});
  }
  return reply(200,{ok:true,reference,status:'pending_verification',message:'已收到报名资料和付款凭证，状态：待核实。我们核对款项后，会通过你填写的电话联系你确认名额。'});
}

export function partnerTwoDayPage(env,method='GET',now=Date.now()) {
  return new Response(method==='HEAD'?null:renderPartnerTwoDay(partnerTwoDayState(env,now)),{headers:{...boundary,'content-type':'text/html; charset=utf-8','x-frame-options':'DENY','content-security-policy':"default-src 'none';style-src 'unsafe-inline' https://fonts.googleapis.com;script-src 'unsafe-inline';img-src blob:;font-src https://fonts.gstatic.com;connect-src 'self';form-action 'self';frame-ancestors 'none';base-uri 'none'"}});
}

const rm = n => 'RM' + Number(n).toLocaleString('en-US');

export function renderPartnerTwoDay(state) {
  if (typeof state === 'boolean') state = partnerTwoDayState({PARTNER_TWO_DAY_DB:state?{}:null,PARTNER_TWO_DAY_OPEN:'1'});
  const {open,closed,payable,fees,feesSet,deadline,test} = state;
  const live = open && !closed;
  const feeText = n => feesSet ? rm(fees[n]) : '费用待确认';
  const bogo = feesSet && fees[2] < fees[1]*2; // two seats cost less than two singles, e.g. buy one, get one free
  const closedText = feesSet ? '付款通道开通后开放' : '费用确认后开放';
  const bank = PARTNER_TWO_DAY_BANK;
  const closedCard = `<div class="closed-card"><strong>报名已截止</strong><p>报名在 2026 年 11 月 27 日（星期五）11:59PM 截止。如有疑问，请直接联系我们。</p></div>`;
  const form = `<noscript><p>请启用 JavaScript 后提交。</p></noscript><form id="signup" autocomplete="on" method="post" action="${registrationPath}" enctype="multipart/form-data" novalidate>
<ol class="steps">
<li class="step"><h3><span class="n">1</span>填写报名资料</h3>
<label for="name">第一位学员姓名</label><input id="name" name="name" required maxlength="100" autocomplete="name">
<label for="phone">联络手机号码</label><input id="phone" name="phone" required type="tel" maxlength="30" autocomplete="tel" inputmode="tel" placeholder="012-345 6789">
<fieldset><legend>报名人数</legend><div class="choices"><label><input name="seats" type="radio" value="1" checked>一位</label><label><input name="seats" type="radio" value="2">两位${bogo&&fees[2]===fees[1]?'<em class="free">送一位</em>':''}</label></div></fieldset>
<div id="second" class="conditional" hidden><label for="secondName">第二位学员姓名 <span class="optional">可稍后补</span></label><input id="secondName" name="secondName" maxlength="100" disabled></div>
<label class="check" for="companyInvoice"><input id="companyInvoice" name="companyInvoice" type="checkbox">需要开单给公司</label>
<div id="company" class="conditional" hidden><label for="companyName">公司开单名称</label><input id="companyName" name="companyName" maxlength="160" autocomplete="organization" disabled><label for="companyAddress">公司地址 <span class="optional">选填</span></label><input id="companyAddress" name="companyAddress" maxlength="300" autocomplete="street-address" disabled><p>其他公司资料，之后需要时再向你确认。</p></div>
</li>
<li class="step"><h3><span class="n">2</span>确认应付金额</h3>
<div class="amount${feesSet?'':' pending'}"><span id="amountLabel">一位学员</span><span class="price"><s id="was" hidden>${bogo?rm(fees[1]*2):''}</s><strong id="amount">${feeText(1)}</strong></span></div>
<p id="promo" class="promo" hidden>${bogo&&fees[2]===fees[1]?'买一送一：第二位学员免费':bogo?'两位同报优惠':''}</p>
${feesSet?'':'<p class="note">一人和两人的收费确认后才开放付款，请先不要转账。</p>'}
<label class="check"><input id="amountConfirmed" name="amountConfirmed" type="checkbox"${payable?'':' disabled'}>我已确认应付金额</label>
<input type="hidden" id="expectedAmount" name="expectedAmount" value="${feesSet?fees[1]:''}">
</li>
<li class="step"><h3><span class="n">3</span>银行转账</h3>
<dl class="bank">
<div><dt>收款户名</dt><dd>${bank.holder}</dd></div>
<div><dt>注册编号</dt><dd>${bank.regNo}</dd></div>
<div><dt>银行</dt><dd>${bank.bank}</dd></div>
<div><dt>户口号码</dt><dd class="acct"><span id="acct">${bank.account}</span><button type="button" class="copy" data-copy="${bank.account}">复制</button></dd></div>
</dl>
<p class="note">${payable?'转账备注请写第一位学员姓名。':feesSet?'付款通道开通后才可转账，请先不要转账。':'费用确认前请勿转账。'}</p>
</li>
<li class="step"><h3><span class="n">4</span>上传付款凭证</h3>
<label class="drop" for="proof"><span id="proofText">${payable?'选择截图或 PDF':closedText+'上传'}</span><small>JPG、PNG、WEBP、HEIC 或 PDF，5MB 以内</small></label>
<input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"${payable?' required':' disabled'}>
<img id="preview" alt="付款凭证预览" hidden>
</li>
<li class="step"><h3><span class="n">5</span>提交</h3>
<div class="honeypot" aria-hidden="true"><label for="website">请留空</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<p class="privacy">你填写的资料和付款凭证只用于本次课程报名、核对款项和开单跟进，不会公开。提交后状态为「待核实」，我们核对款项后才确认名额。</p>
<button type="submit" id="submit"${payable?'':' disabled'}>${payable?'提交报名和付款凭证':closedText+'提交'}</button>
</li>
</ol>
</form><div id="result" role="status" aria-live="polite" tabindex="-1"></div>`;
  const script = `<script>
const DEADLINE=${deadline}, FEES=${JSON.stringify(feesSet?fees:null)}, PAYABLE=${payable};
const pad=n=>String(n).padStart(2,'0');
const cd=document.querySelector('#countdown');
function closeNow(){const box=document.querySelector('#registration');box.querySelector('.form-body').innerHTML=${JSON.stringify(closedCard)};cd.closest('.deadline').classList.add('ended');cd.textContent='报名已截止';document.querySelectorAll('.jump').forEach(j=>j.remove());document.querySelector('.tag').textContent='报名已截止';}
function tick(){const left=DEADLINE-Date.now();if(left<=0){closeNow();return;}const s=Math.floor(left/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);cd.innerHTML=(d?'<b>'+d+'</b> 天 ':'')+'<b>'+pad(h)+'</b> 时 <b>'+pad(m)+'</b> 分 <b>'+pad(s%60)+'</b> 秒';setTimeout(tick,1000-Date.now()%1000);}
const f=document.querySelector('#signup');
if(f){const result=document.querySelector('#result'), button=f.querySelector('#submit'), label=button.textContent;
function fields(){const two=f.elements.seats.value==='2', bill=f.elements.companyInvoice.checked;document.querySelector('#second').hidden=!two;document.querySelector('#company').hidden=!bill;f.elements.secondName.disabled=!two;f.elements.companyName.disabled=!bill;f.elements.companyName.required=bill;f.elements.companyAddress.disabled=!bill;
document.querySelector('#amountLabel').textContent=two?'两位学员合计':'一位学员';document.querySelector('#amount').textContent=FEES?'RM'+FEES[two?2:1].toLocaleString('en-US'):'费用待确认';const deal=!!FEES&&two&&FEES[2]<FEES[1]*2;document.querySelector('#was').hidden=!deal;document.querySelector('#promo').hidden=!deal;f.elements.expectedAmount.value=FEES?FEES[two?2:1]:'';}
f.addEventListener('change',e=>{if(e.target.name==='seats'&&f.elements.amountConfirmed.checked)f.elements.amountConfirmed.checked=false;fields();});fields();
document.querySelector('.copy').addEventListener('click',async e=>{try{await navigator.clipboard.writeText(e.target.dataset.copy);e.target.textContent='已复制';setTimeout(()=>e.target.textContent='复制',1500);}catch{}});
const proof=f.elements.proof, pv=document.querySelector('#preview');
proof.addEventListener('change',()=>{const file=proof.files[0];proof.removeAttribute('aria-invalid');pv.hidden=true;if(!file){document.querySelector('#proofText').textContent='选择截图或 PDF';return;}document.querySelector('#proofText').textContent=file.name+' · '+(file.size<1048576?Math.max(1,Math.round(file.size/1024))+'KB':(file.size/1048576).toFixed(1)+'MB');if(file.size>5242880){proof.setAttribute('aria-invalid','true');document.querySelector('#proofText').textContent='文件超过 5MB，请换一张';}else if(/^image\\/(jpeg|png|webp)$/.test(file.type)){pv.src=URL.createObjectURL(file);pv.hidden=false;}});
function fail(msg,field){result.dataset.error='';result.textContent=msg;const el=field&&f.elements[field];if(el?.setAttribute){el.setAttribute('aria-invalid','true');(el.type==='file'?document.querySelector('.drop'):el).scrollIntoView({block:'center'});el.focus({preventScroll:true});}else result.focus();}
f.addEventListener('submit',async e=>{e.preventDefault();if(button.disabled||!PAYABLE)return;for(const el of f.querySelectorAll('[aria-invalid]'))el.removeAttribute('aria-invalid');result.textContent='';result.removeAttribute('data-error');
if(Date.now()>=DEADLINE){closeNow();return;}
if(!f.elements.name.value.trim())return fail('请填写第一位学员姓名。','name');if(!f.elements.phone.value.trim())return fail('请填写联络手机号码。','phone');if(f.elements.companyInvoice.checked&&!f.elements.companyName.value.trim())return fail('请填写公司开单名称。','companyName');if(!f.elements.amountConfirmed.checked)return fail('请确认应付金额。','amountConfirmed');if(!proof.files[0])return fail('请上传付款凭证。','proof');if(proof.files[0].size>5242880)return fail('付款凭证不能超过 5MB。','proof');
button.disabled=true;button.textContent='正在上传…';try{const r=await fetch(f.action,{method:'POST',body:new FormData(f)});const answer=await r.json();if(answer.closed){closeNow();return;}if(!r.ok||!answer.ok)return fail(answer.message||'暂时提交不了，请稍后再试。',answer.field);f.hidden=true;result.innerHTML='<strong>待核实</strong><br>'+answer.message.replace(/[<>&]/g,'')+'<br>报名编号：<b>'+answer.reference+'</b>';result.focus();}catch{fail('暂时提交不了，请检查网络后再试。');}finally{button.disabled=false;button.textContent=label;}});}
tick();
</script>`;
  return `<!doctype html><html lang="zh-Hans" data-type="software"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="page-type" content="software"><meta name="site-kind" content="software"><meta name="description" content="两天 AI 企业助理课程报名：12 月 7–8 日，新山。"><meta name="robots" content="noindex,nofollow"><meta property="og:title" content="两天 AI 企业助理课程 · 报名"><meta property="og:description" content="12 月 7–8 日 · 新山 · 报名截止 11 月 27 日 11:59PM。"><meta name="theme-color" content="#160A05"><title>两天 AI 企业助理课程 · 报名</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,400..700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet"><style>
:root{color-scheme:light;--bg:#F8F4EE;--card:#fff;--ink:#1A0E08;--ink2:rgba(26,14,8,.72);--mute:rgba(26,14,8,.55);--line:rgba(26,14,8,.09);--field:rgba(26,14,8,.16);--orange:#E8590C;--orange2:#FF7A1A;--peach:#FDE3CC;--dark:#1A0D07;--cream:#FFF6EF;--sans:"Google Sans Flex","Noto Sans SC",ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--sans);color:var(--ink);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.wrap{width:min(1120px,100% - 40px);margin-inline:auto}h1,h2,h3{font-weight:700;letter-spacing:-.035em;line-height:1.12;text-wrap:balance}
.skip{position:absolute;top:0;left:12px;z-index:80;transform:translateY(-150%);background:#fff;padding:10px;border-radius:9px}.skip:focus{transform:none}
.nav{position:fixed;top:14px;left:0;right:0;z-index:60;pointer-events:none}.nav-in{pointer-events:auto;width:min(760px,100% - 24px);margin-inline:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 7px 7px 14px;border-radius:14px;background:rgba(40,24,16,.62);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.brand{color:var(--cream);font-weight:700;font-size:15px;white-space:nowrap;text-decoration:none}.menu{display:flex;align-items:center;gap:4px}.menu a:not(.btn){color:rgba(255,246,239,.82);text-decoration:none;font-size:14.5px;padding:7px 11px;border-radius:9px}.menu a:not(.btn):hover{background:rgba(255,255,255,.1);color:#fff}.menu .btn{padding:8px 14px;font-size:14.5px;border-radius:9px;margin-left:6px}
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
.drop{display:grid;gap:2px;place-items:center;text-align:center;margin:10px 0 0;padding:24px 14px;border:1.5px dashed rgba(232,89,12,.4);border-radius:16px;background:#FFF8F1;cursor:pointer;font-weight:600}.drop small{font-weight:400;color:var(--mute)}#proof{position:absolute;width:1px;height:1px;opacity:0}.drop:has(+#proof:focus-visible){outline:3px solid var(--orange);outline-offset:3px}#proof:disabled{pointer-events:none}.drop:has(+#proof:disabled){opacity:.5;cursor:default;border-color:var(--field);background:var(--bg)}.drop:has(+#proof[aria-invalid=true]){border-color:#B3341A;background:#FFF0EA}#preview{display:block;max-width:100%;max-height:220px;margin:12px auto 0;border-radius:12px;box-shadow:0 0 0 1px var(--line)}
.privacy{margin:0 0 14px!important;font-size:14px!important;color:var(--mute)!important}.honeypot{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#submit{font:inherit;width:100%;min-height:54px;border:0;border-radius:12px;background:var(--dark);color:var(--cream);font-weight:600;font-size:17px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 8px 20px rgba(26,13,7,.25);transition:transform .15s}#submit:not(:disabled):hover{transform:translateY(-2px)}#submit:not(:disabled):active{transform:scale(.98)}#submit:disabled{cursor:default;background:rgba(26,14,8,.18);color:rgba(26,14,8,.5);box-shadow:none}
:focus-visible{outline:3px solid var(--orange);outline-offset:3px}#result:not(:empty){margin-top:14px;padding:14px 16px;border-radius:14px;background:#FFF3E8;color:var(--ink)}#result strong{display:inline-block;font-size:13px;color:#fff;background:var(--orange);border-radius:999px;padding:2px 10px;margin-bottom:4px}#result[data-error]:not(:empty){background:#FFF0EA;color:#8A2A14}[aria-invalid=true]{box-shadow:inset 0 0 0 2px #B3341A!important}
.closed-card{padding:22px;border-radius:16px;background:var(--bg)}.closed-card strong{font-size:22px}.closed-card p{margin:6px 0 0!important}
.site-foot{background:#140A05;color:rgba(255,246,239,.5);font-size:14px;padding:28px 0}.site-foot a{color:rgba(255,246,239,.82)}
[hidden]{display:none!important}[data-enter]{animation:opening .5s ease-out both}@keyframes opening{from{transform:translateY(8px);opacity:.6}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}html{scroll-behavior:auto}}
@media(max-width:860px){.sign-in{grid-template-columns:minmax(0,1fr);gap:28px}.sign-l{position:static}.flow{display:none}.facts{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.wrap{width:calc(100% - 32px)}.amount{padding:14px}.price{gap:6px}.price s{font-size:15px}.amount strong{font-size:28px}.hero{padding:104px 0 64px}.menu a:not(.btn){display:none}.deadline{padding:14px 16px;margin-top:26px}#countdown b{font-size:28px}.facts{gap:8px}.facts div{padding:12px}.hero .jump{width:100%}.sign{padding:48px 0 64px}.form-card{padding:20px 18px;border-radius:22px}.sign-l .lead{font-size:15.5px}.bank{padding:2px 14px}.bank div{grid-template-columns:1fr;gap:2px;padding:10px 0}.bank dt{font-size:13px}.acct span{font-size:19px}}
</style></head><body><a class="skip" href="#registration">跳到报名表单</a><header class="nav"><div class="nav-in"><a class="brand" href="/2daysclass/">两天 AI 企业助理课程</a><nav class="menu"><a href="/2daysclass/">课程介绍</a>${live?'<a class="btn btn-w jump" href="#registration">马上报名</a>':''}</nav></div></header>
<main><section class="hero" aria-labelledby="title"><div class="wrap" data-enter><div class="badge"><i></i><span class="tag">${closed?'报名已截止':'报名 · 银行转账'}</span></div><h1 id="title">两天 AI <span class="hl">企业助理课程</span></h1><p class="lead">可以为自己报名，也可以一起报两位。第二位还没确定？名字之后再补。</p>
<div class="deadline${closed?' ended':''}"><p>报名截止：2026 年 11 月 27 日（星期五）11:59PM（马来西亚时间）</p><span id="countdown">${closed?'报名已截止':'计算剩余时间…'}</span></div>
<dl class="facts"><div><dt>日期</dt><dd>2026 年 12 月 7–8 日<small>星期一、二 · 暂定</small></dd></div><div><dt>时间</dt><dd>每天 9AM - 5PM</dd></div><div><dt>地点</dt><dd>新山<small>详细地址待公布</small></dd></div><div><dt>餐饮</dt><dd>包含一顿午餐和一次茶点</dd></div></dl>
${live?'<a class="btn btn-w jump" href="#registration">开始报名 ↓</a>':''}</div></section>
<section class="sign"><div class="wrap sign-in"><div class="sign-l"><p class="eyebrow">报名流程</p><h2>五步完成报名</h2><p class="lead">填好资料、确认金额、银行转账、上传付款凭证。提交后状态是「待核实」，我们核对款项后再联系你确认名额。</p><ol class="flow"><li><i>01</i>填写报名资料</li><li><i>02</i>确认应付金额</li><li><i>03</i>银行转账</li><li><i>04</i>上传付款凭证</li><li><i>05</i>提交，等待核实</li></ol></div>
<div id="registration" class="form-card" tabindex="-1">${test?'<p class="test">本地测试预览 · 金额和资料都是测试值，不会收款</p>':''}<h2>报名和付款</h2>
<div class="form-body">${closed?closedCard:open?form:'<p>报名暂未开放。</p>'}</div>
</div></div></section></main><footer class="site-foot"><div class="wrap">两天 AI 企业助理课程 · <a href="/2daysclass/">课程介绍</a></div></footer>${closed?'':script}</body></html>`;
}
