const path = '/api/2days-botsclass/reservations';
const boundary = { 'cache-control':'no-store', 'x-robots-tag':'noindex, nofollow', 'referrer-policy':'no-referrer', 'x-content-type-options':'nosniff' };
const reply = (status, data) => Response.json(data, {status, headers:boundary});
const available = env => Boolean(env.PARTNER_TWO_DAY_DB && env.PARTNER_TWO_DAY_OPEN === '1');
const received = {ok:true,message:'已收到预留申请，无需付款。我们会通过你填写的电话联系你，确认名额及课程安排。'};

export async function reservePartnerTwoDay(request, env) {
  if (!available(env)) return reply(503,{ok:false,message:'预留登记暂未开放。'});
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply(403,{ok:false,message:'请从报名页面提交。'});
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return reply(415,{ok:false,message:'提交格式不正确。'});
  if (!request.body) return reply(400,{ok:false,message:'没有收到表单资料。'});
  const reader = request.body.getReader();
  let size=0, text='', data;
  const dec = new TextDecoder('utf-8',{fatal:true});
  try {
    while(true){const {value,done}=await reader.read(); if(done)break; size+=value.byteLength; if(size>4096){await reader.cancel().catch(()=>{});return reply(413,{ok:false,message:'资料过长。'});} text+=dec.decode(value,{stream:true});}
    data=JSON.parse(text+dec.decode());
  } catch {return reply(400,{ok:false,message:'无法读取表单资料。'});}
  if (!data || typeof data!=='object' || Array.isArray(data)) return reply(400,{ok:false,message:'表单资料不正确。'});
  if (data.website) return reply(400,{ok:false,message:'请重新打开页面提交。'});
  const get = (key,max) => {
    const v=data[key];
    if(v==null)return '';
    if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw new Error(key);
    return v.trim();
  };
  const bad=(field,message)=>reply(422,{ok:false,field,message});
  const labels={name:'请填写姓名（最多 100 字）。',phone:'请填写有效的马来西亚手机号码。',secondName:'第二位姓名最多 100 字。',companyName:'请填写公司开单名称（最多 160 字）。',companyAddress:'公司地址最多 300 字。'};
  let name, phone, secondName, companyName, companyAddress;
  const {seats,companyInvoice}=data;
  if (![1,2].includes(seats)) return bad('seats','请选择预留人数。');
  if (typeof companyInvoice!=='boolean') return bad('companyInvoice','请确认公司开单选项。');
  try {
    name=get('name',100);if(!name)throw new Error('name');
    const raw=get('phone',30);
    if(!/^\+?[\d ()-]+$/.test(raw))throw new Error('phone');
    phone=raw.replace(/[^\d]/g,'').replace(/^00(?=60)/,'').replace(/^0(?=1)/,'60');
    if(!/^601[0-9]{8,9}$/.test(phone))throw new Error('phone');
    secondName=seats===2 ? get('secondName',100)||null : null;
    companyName=companyInvoice ? get('companyName',160) : null;
    if(companyInvoice&&!companyName)throw new Error('companyName');
    companyAddress=companyInvoice ? get('companyAddress',300)||null : null;
  }catch(e){return bad(e.message,labels[e.message]||'请检查填写的资料。');}
  try {
    const result=await env.PARTNER_TWO_DAY_DB.prepare(
      `INSERT INTO reservations (contact_name,contact_phone,seats,second_name,company_invoice,company_name,company_address,created_at)
       VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(contact_phone) DO NOTHING`
    ).bind(name,phone,seats,secondName,Number(companyInvoice),companyName,companyAddress,new Date().toISOString()).run();
    if(!result?.success)throw new Error('insert rejected');
  } catch {return reply(503,{ok:false,message:'暂时无法保存，请稍后再试。'});}
  return reply(200,received);
}

export function partnerTwoDayPage(env,method='GET') {
  return new Response(method==='HEAD'?null:renderPartnerTwoDay(available(env)),{headers:{...boundary,'content-type':'text/html; charset=utf-8','x-frame-options':'DENY','content-security-policy':"default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';connect-src 'self';form-action 'self';frame-ancestors 'none';base-uri 'none'"}});
}

export function renderPartnerTwoDay(open) {
return `<!doctype html><html lang="zh-Hans" data-type="software"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="page-type" content="software"><meta name="site-kind" content="software"><meta name="description" content="两天 AI 实战合作课，预留一位或两位，无需现在付款。"><meta name="robots" content="noindex,nofollow"><meta property="og:title" content="两天 AI 实战合作课 · 预留登记"><meta property="og:description" content="登记一位或两位，无需现在付款。"><meta name="theme-color" content="#f1f3ed"><title>两天 AI 实战合作课 · 预留登记</title><style>
:root{color-scheme:light;--paper:#f1f3ed;--white:#fff;--ink:#142620;--muted:#475c53;--line:#aabcb1;--green:#164c37;--accent:#d7ec93}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}main{padding:0 0 48px}.wrap{width:calc(100% - clamp(40px,12vw,180px));max-width:1260px;margin-inline:auto}.skip{position:absolute;top:0;left:12px;transform:translateY(-150%);background:var(--white);padding:10px}.skip:focus{transform:none}.mast{font-size:.88rem;font-weight:750;display:flex;align-items:center;gap:12px;padding:22px 0 20px;border-bottom:1px solid var(--line)}.hero{min-height:calc(100svh - 70px)}.dot{width:12px;height:12px;background:var(--green);border-radius:3px}.hero>.wrap{display:grid;grid-template-columns:1fr minmax(320px,460px);gap:clamp(28px,6vw,78px);align-items:start;padding-top:clamp(28px,6vw,70px)}.intro{padding-top:clamp(0px,2vw,28px)}.eyebrow{font-weight:750;color:var(--green);margin:0 0 12px}.intro h1{font-size:clamp(2.13rem,5vw,4rem);line-height:1.16;letter-spacing:-.045em;margin:0 0 20px}.intro p:not(.eyebrow){color:var(--muted);max-width:30ch}.tag{display:inline-block;color:var(--green);font-weight:750;margin:0 0 3px}.jump{display:inline-flex;align-items:center;min-height:46px;padding:5px 14px;background:var(--green);color:white;font-weight:750;border-radius:9px;text-decoration:none;transition:transform .15s}.jump:hover{transform:translateY(-2px)}.form-card{background:var(--white);padding:clamp(18px,4vw,34px);border:1px solid #c8d4c9;border-radius:18px;box-shadow:0 8px 28px #1933280a}.form-card h2{margin:0;font-size:1.45rem}.form-card p{margin:3px 0 16px;color:var(--muted);font-size:.94rem}label,legend{font-weight:650}label{display:block;margin:12px 0 4px}input:not([type=checkbox]):not([type=radio]),button{font:inherit;width:100%;min-height:46px;border:1px solid var(--line);border-radius:9px;padding:8px 12px;background:var(--white);color:var(--ink)}fieldset{border:0;padding:0;margin:15px 0 0;min-width:0}.choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}.choices label,.check{display:flex;align-items:center;gap:8px;min-height:46px;padding:7px 10px;border:1px solid var(--line);border-radius:9px}.choices label:has(:checked){background:#e8f2db;border-color:var(--green)}input[type=radio],input[type=checkbox]{accent-color:var(--green);width:18px;height:18px;margin:0;flex:none}.optional{font-weight:400;font-size:.87em;color:var(--muted)}.conditional{padding:2px 0 6px}.privacy{margin:13px 0!important;font-size:.83rem!important}.honeypot{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}button{background:var(--green);border-color:var(--green);color:white;font-weight:750;cursor:pointer;transition:transform .15s}button:not(:disabled):hover{transform:translateY(-2px)}button:not(:disabled):active{transform:translateY(1px)}button:disabled{cursor:default;opacity:.65}:focus-visible{outline:3px solid #337857;outline-offset:3px}#result:not(:empty){margin-top:12px;padding:10px 12px;border-radius:8px;background:#eef5e9;color:var(--ink)}#result[data-error]:not(:empty){background:#fff0ea;color:#752b17}[aria-invalid=true]{border-color:#a03a21!important}[hidden]{display:none!important}[data-enter]{animation:opening .42s ease-out both}@keyframes opening{from{transform:translateY(6px);opacity:.7}to{transform:none;opacity:1}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}@media(max-width:710px){.hero>.wrap{grid-template-columns:minmax(0,1fr);gap:22px}.mast{padding:14px 0}.intro h1{margin-bottom:12px}}
</style><script>document.documentElement.classList.add("m-enter");</script></head><body><header class="nav"><div class="mast wrap"><a class="skip" href="#registration">跳到预留表单</a><span class="dot" aria-hidden="true"></span>AI 实战合作课</div></header><main><section class="hero" aria-labelledby="title" data-enter><div class="wrap"><div class="intro"><p class="eyebrow">半天工作坊的后续课程</p><h1 id="title">两天 AI 实战合作课</h1><span class="tag">预留登记 · 暂不付款</span><p>可以为自己登记，也可以一起预留两位。第二位还没确定？名字之后再补。我们会联系你确认名额及课程安排。</p>${open?'<a class="jump" href="#registration">开始预留登记 ↓</a>':''}</div><div id="registration" class="form-card" tabindex="-1"><h2>报名预留位置</h2><p>${open?'现在只登记，不用付款。':'预留登记暂未开放。'}</p>
${open?`<noscript><p>请启用 JavaScript 后提交。</p></noscript><form id="reserve" autocomplete="on" method="post" action="${path}"><label for="name">第一位学员姓名</label><input id="name" name="name" required maxlength="100" autocomplete="name"><label for="phone">联络手机号码</label><input id="phone" name="phone" required type="tel" maxlength="30" autocomplete="tel" inputmode="tel"><fieldset><legend>预留人数</legend><div class="choices"><label><input name="seats" type="radio" value="1" checked>一位</label><label><input name="seats" type="radio" value="2">两位</label></div></fieldset><div id="second" class="conditional" hidden><label for="secondName">第二位学员姓名 <span class="optional">可稍后补</span></label><input id="secondName" name="secondName" maxlength="100" disabled></div><label class="check" for="companyInvoice"><input id="companyInvoice" name="companyInvoice" type="checkbox">需要开单给公司</label><div id="company" class="conditional" hidden><label for="companyName">公司开单名称</label><input id="companyName" name="companyName" maxlength="160" autocomplete="organization" disabled><label for="companyAddress">公司地址 <span class="optional">选填</span></label><input id="companyAddress" name="companyAddress" maxlength="300" autocomplete="street-address" disabled><p>其他公司资料，之后需要时再向你确认。</p></div><div class="honeypot" aria-hidden="true"><label for="website">请留空</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div><p class="privacy">你填写的资料只用于本次合作课报名、联络和开单跟进。</p><button type="submit">提交预留登记</button></form><div id="result" role="status" aria-live="polite" tabindex="-1"></div><script>
const f=document.querySelector('#reserve'), result=document.querySelector('#result'), button=f.querySelector('button');
function fields(){const two=f.elements.seats.value==='2', bill=f.elements.companyInvoice.checked;document.querySelector('#second').hidden=!two;document.querySelector('#company').hidden=!bill;f.elements.secondName.disabled=!two;f.elements.companyName.disabled=!bill;f.elements.companyName.required=bill;f.elements.companyAddress.disabled=!bill;}
f.addEventListener('change',fields);fields();
f.addEventListener('submit',async e=>{e.preventDefault();if(button.disabled)return;for(const el of f.querySelectorAll('[aria-invalid]'))el.removeAttribute('aria-invalid');result.textContent='';result.removeAttribute('data-error');button.disabled=true;button.textContent='正在提交…';try{const d=new FormData(f);const r=await fetch('${path}',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...Object.fromEntries(d),seats:Number(d.get('seats')),companyInvoice:f.elements.companyInvoice.checked})});const answer=await r.json();if(!r.ok||!answer.ok){result.dataset.error='';result.textContent=answer.message||'暂时提交不了，请稍后再试。';const el=answer.field&&f.elements[answer.field];if(el?.setAttribute){el.setAttribute('aria-invalid','true');el.focus();}else result.focus();return;}f.hidden=true;result.textContent=answer.message;result.focus();}catch{result.dataset.error='';result.textContent='暂时提交不了，请检查网络后再试。';result.focus();}finally{button.disabled=false;button.textContent='提交预留登记';}});
</script>`:''}</div></div></section></main></body></html>`;
}
