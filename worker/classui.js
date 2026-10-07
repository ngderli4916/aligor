import { htmlEscape as h } from './lib.js';
import { PACKAGES, STATUS_LABELS } from './classreg.js';

const css = `
:root{--cream:#fcfaf1;--paper:#fffdf7;--ink:#080808;--muted:#68645c;--gold:#d8a11d;--yellow:#ffce32;--line:#d9d1c1;--green:#17392b;--red:#b8462e;--sans:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;--serif:"Songti SC","Noto Serif SC",serif;--mono:"SFMono-Regular",Menlo,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
.top{background:#080808;color:#fff;padding:18px 24px}.top-in{max-width:1080px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:18px}.brand{font-family:var(--serif);font-size:24px;font-weight:900;letter-spacing:.02em}.brand small{font:500 11px var(--mono);color:#ccc;display:block;margin-top:2px;letter-spacing:.12em}
.hero{border-bottom:1px solid var(--line);background:radial-gradient(circle at 85% 15%,rgba(216,161,29,.12),transparent 25%)}.hero-in{max-width:1080px;margin:auto;padding:48px 24px 38px;display:grid;grid-template-columns:1fr 280px;gap:44px;align-items:end}
.eyebrow{display:inline-flex;background:#000;color:#fff;border:1px solid var(--gold);padding:7px 12px;font:700 11px var(--mono);letter-spacing:.12em;margin-bottom:18px}
.hero h1{font:900 clamp(32px,5vw,56px)/1.12 var(--serif);letter-spacing:-.03em;margin:0 0 14px;max-width:14ch}.hero h1 em{font-style:normal;color:#8a6100}.hero p{max-width:600px;margin:0;color:#3f3c36;font-size:16px}
.hero-note{border:1px solid #000;background:#fff;padding:20px;box-shadow:8px 8px 0 var(--yellow)}.hero-note strong{display:block;font:900 26px var(--serif);margin-bottom:6px}.hero-note span{display:block;font-size:13px;color:var(--muted)}
.layout{max-width:1080px;margin:auto;padding:36px 24px 80px;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:28px;align-items:start}.main{display:flex;flex-direction:column;gap:20px;min-width:0}
.card{background:var(--paper);border:1px solid var(--line);padding:28px;box-shadow:0 8px 28px rgba(25,20,10,.045)}.step-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:22px}.step-no{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;background:#000;color:var(--yellow);font:800 14px var(--mono)}.step-head h2{font:800 22px/1.2 var(--serif);margin:0 0 4px}.step-head p{font-size:13px;color:var(--muted);margin:0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:flex;flex-direction:column;gap:7px;min-width:0}.field.full{grid-column:1/-1}label{font-size:13px;font-weight:800}
input,select,textarea{width:100%;border:1px solid #bcb4a5;background:#fff;padding:13px 14px;border-radius:0;font:500 16px var(--sans);color:#111;outline:none}input:focus,select:focus{border-color:#000;box-shadow:0 0 0 3px rgba(255,206,50,.5)}
.btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid #000;background:#000;color:#fff;padding:13px 18px;font:800 14px var(--sans);cursor:pointer;min-height:49px;text-decoration:none}.btn:hover{background:#282828}.btn.gold{background:var(--yellow);color:#000}.btn.gold:hover{background:#ffe06f}.btn:disabled{opacity:.55;cursor:wait}
.hint{font-size:12px;color:var(--muted);margin-top:10px}
.packages{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.package{position:relative;border:1px solid var(--line);background:#fff;padding:18px 15px;cursor:pointer;min-height:150px;display:block}.package:hover{border-color:#000}.package.active{border:2px solid #000;background:#fff9df;box-shadow:6px 6px 0 var(--yellow)}.package input{position:absolute;opacity:0;width:1px;height:1px}
.package .tag{font:700 10px var(--mono);letter-spacing:.08em;color:#766525}.package .original{display:block;margin-top:8px;font-size:12px;color:var(--muted)}.package .save{display:inline-block;margin-top:8px;background:#000;color:var(--yellow);padding:4px 7px;font:700 10px var(--mono)}.package h3{font:800 17px/1.35 var(--serif);margin:8px 0 12px}.price{font:800 28px/1 var(--serif)}.price small{font:600 12px var(--sans);color:var(--muted)}
.second{display:none;margin-top:22px;padding-top:20px;border-top:1px dashed var(--line)}.second.show{display:block}
.summary{position:sticky;top:16px;background:#070707;color:#fff;border:1px solid var(--gold);padding:24px}.summary .kicker{font:700 10px var(--mono);letter-spacing:.14em;color:var(--yellow)}.summary h2{font:800 24px var(--serif);margin:10px 0 18px}.sum-row{display:flex;justify-content:space-between;gap:16px;border-top:1px solid #333;padding:12px 0;font-size:13px}.sum-row span{color:#aaa}.sum-row strong{text-align:right}
.sum-total{margin-top:14px;border:1px solid #555;padding:16px;background:#151515}.sum-total span{font-size:12px;color:#aaa}.sum-total strong{display:block;font:900 38px var(--serif);color:var(--yellow);margin-top:3px}.sum-total small{display:block;color:#bbb;margin-top:4px;font-size:12px}
.flow{margin-top:20px}.flow div{display:grid;grid-template-columns:25px 1fr;gap:10px;align-items:start;margin:10px 0;font-size:12px;color:#d2d2d2}.flow b{display:grid;place-items:center;width:22px;height:22px;border:1px solid #555;color:var(--yellow);font:700 10px var(--mono)}
.err{display:none;margin-top:14px;padding:12px 14px;border-left:4px solid var(--red);background:#fdeae4;font-size:14px}.err.show{display:block}
.success{display:none;border:2px solid #000;background:#fff;padding:32px;text-align:center;box-shadow:10px 10px 0 var(--yellow)}.success.show{display:block}.success .tick{width:56px;height:56px;margin:0 auto 14px;display:grid;place-items:center;background:var(--green);color:#fff;border-radius:50%;font-size:28px}.success h2{font:900 28px var(--serif);margin:0 0 8px}.success p{margin:6px 0;color:var(--muted)}
.result-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px auto;max-width:520px;text-align:left}.result-item{border:1px solid var(--line);padding:14px;background:var(--paper)}.result-item span{display:block;font-size:11px;color:var(--muted);margin-bottom:5px}.result-item strong{font:800 17px var(--mono);word-break:break-all}
.footer{background:#080808;color:#aaa;text-align:center;padding:26px 20px;font-size:12px}
.hidden{display:none!important}
/* payment */
.pay-wrap{max-width:860px;margin:36px auto 70px;padding:0 20px}.pay-card{background:#fff;border:1px solid var(--line);padding:30px;display:grid;grid-template-columns:300px minmax(0,1fr);gap:30px;box-shadow:9px 9px 0 var(--yellow)}
.qr{border:1px solid #000;padding:12px;background:#fff;align-self:start}.qr img{width:100%;display:block;height:auto}.qr p{font:600 12px var(--sans);text-align:center;margin:10px 0 2px;color:var(--muted)}
.pay-copy h1{font:900 30px var(--serif);margin:0 0 4px}.order{font:800 15px var(--mono);background:#000;color:var(--yellow);display:inline-block;padding:5px 10px;margin:6px 0 14px}.amount{font:900 46px/1 var(--serif);color:#8a6100;margin:10px 0}.meta{font-size:14px;color:#3f3c36;margin:3px 0}.meta b{color:#000}
.notice{margin:16px 0;padding:12px 14px;border-left:4px solid var(--gold);background:#fff4cc;font-size:13px}.ok{border-left-color:var(--green);background:#e6f2ea}.bad{border-left-color:var(--red);background:#fdeae4}
.bank{margin:16px 0;border:1px solid var(--line);background:#fffdf7;padding:14px 16px}.bank h3{font:800 14px var(--sans);margin:0 0 8px}.bank .row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0}.bank .row span{color:var(--muted)}.bank .acc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px}.bank .acc b{font:900 22px var(--mono);letter-spacing:.04em}.bank .btn{min-height:0;padding:6px 12px;font-size:12px}
.invalid{max-width:520px;margin:90px auto;padding:34px;background:#fff;border:1px solid var(--line);text-align:center}.invalid h1{font:900 26px var(--serif);margin:0 0 10px}
@media(max-width:900px){.hero-in{grid-template-columns:1fr}.hero-note{max-width:360px}.layout{grid-template-columns:1fr}.summary{position:relative;top:auto;order:-1}.packages{grid-template-columns:1fr 1fr}}
@media(max-width:700px){.pay-card{grid-template-columns:1fr;padding:20px;box-shadow:6px 6px 0 var(--yellow)}.qr{max-width:300px;margin:auto}}
@media(max-width:620px){.top{padding:14px 17px}.brand{font-size:21px}.hero-in{padding:34px 18px 28px}.hero h1{font-size:36px}.layout{padding:22px 14px 60px}.card{padding:20px 16px}.grid2,.result-grid{grid-template-columns:1fr}.packages{grid-template-columns:1fr}.package{min-height:0}.amount{font-size:40px}.pay-wrap{padding:0 14px;margin-top:22px}}
`;

const head = (title, extra = '') => `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#080808">${extra}<title>${title}</title><style>${css}</style></head>`;
const topBar = '<header class="top"><div class="top-in"><div class="brand">阿理哥 · Aligor<small>AI AGENT PRACTICAL CLASS</small></div></div></header>';
const jsonForScript = v => JSON.stringify(v).replace(/</g, '\\u003c');

export function classRegisterPage() {
  const cards = Object.entries(PACKAGES).map(([code, p], i) => {
    const tag = code === 'solo_1pc' ? 'SOLO' : code === 'pair_1pc' ? 'DOUBLE · SHARE' : 'DOUBLE · 2 COMPUTERS';
    const lines = p.title.split(' · ');
    return `<label class="package${i === 0 ? ' active' : ''}" data-code="${code}"><input type="radio" name="package" value="${code}"${i === 0 ? ' checked' : ''}><span class="tag">${tag}</span><h3>${lines[0]}<br>${lines[1]}</h3>${p.discount ? `<span class="original">原价 <del>RM${p.original}</del></span>` : '<span class="original">标准课程价格</span>'}<div class="price">RM${p.final} <small>${p.participants === 2 ? '／两人总价' : '／总价'}</small></div>${p.discount ? `<span class="save">优惠 RM${p.discount}</span>` : ''}</label>`;
  }).join('');
  return head('Aligor｜一天实战课程报名') + `<body>${topBar}
<section class="hero"><div class="hero-in"><div><span class="eyebrow">一天实战课程 · 报名</span><h1>从 0 开始建立你的 <em>AI 个人助理</em></h1><p>填写资料，选择上课方式，提交后取得订单编号和付款页面。</p></div><aside class="hero-note"><strong>星期天</strong><span>9AM–6PM · 新山<br>实际日期与地点，会在报名后第二天或第三天通知</span></aside></div></section>
<div class="layout"><form class="main" id="form" novalidate>
<section class="card"><div class="step-head"><span class="step-no">01</span><div><h2>填写报名资料</h2><p>只需要基本资料。</p></div></div><div class="grid2"><div class="field"><label for="name">姓名</label><input id="name" name="name" autocomplete="name" maxlength="80" placeholder="请输入姓名"></div><div class="field"><label for="phone">WhatsApp 电话号码</label><input id="phone" name="phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="例如：016 787 1902"></div><div class="field full"><label for="region">上课地区</label><select id="region" name="region"><option value="">请选择地区</option><option value="JOHOR">JOHOR</option><option value="SELANGOR">SELANGOR</option><option value="PENANG">PENANG</option></select></div></div><p class="hint">我们会根据各地区的报名人数安排上课地点。</p></section>
<section class="card"><div class="step-head"><span class="step-no">02</span><div><h2>选择上课方式</h2><p>选择后，费用会马上更新。</p></div></div><div class="packages" id="packages">${cards}</div>
<div class="second" id="second"><h3 style="font:800 18px var(--serif);margin:0 0 14px">第二位参加者</h3><div class="grid2"><div class="field"><label for="second_name">第二位姓名</label><input id="second_name" maxlength="80" placeholder="请输入姓名"></div><div class="field"><label for="second_phone">第二位 WhatsApp</label><input id="second_phone" inputmode="tel" maxlength="20" placeholder="例如：012 345 6789"></div></div></div></section>
<section class="card"><div class="step-head"><span class="step-no">03</span><div><h2>提交报名</h2><p>提交后会直接带你到付款页面。</p></div></div>
<input class="hidden" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn gold" style="width:100%;font-size:16px;padding:16px" type="submit" id="submit">提交报名</button><div class="err" id="err" role="alert"></div></section>
<section class="success" id="success"><div class="tick">✓</div><h2>报名已建立</h2><p>正在带你到付款页面…如果没有自动跳转，请按下面的按钮。</p><div class="result-grid"><div class="result-item"><span>订单编号</span><strong id="rOrder"></strong></div><div class="result-item"><span>应付金额</span><strong id="rAmount"></strong></div></div><a class="btn gold" id="rPay" href="#">前往付款页面</a></section>
</form>
<aside class="summary"><span class="kicker">REGISTRATION SUMMARY</span><h2>报名摘要</h2><div class="sum-row"><span>上课方式</span><strong id="sumPackage"></strong></div><div class="sum-row"><span>参加人数</span><strong id="sumPeople"></strong></div><div class="sum-row"><span>电脑数量</span><strong id="sumPc"></strong></div><div class="sum-total"><span>应付金额</span><strong id="sumTotal"></strong><small id="sumSave"></small></div><div class="flow"><div><b>1</b><span>填写姓名、电话、地区</span></div><div><b>2</b><span>选择上课方式</span></div><div><b>3</b><span>提交后取得订单编号</span></div><div><b>4</b><span>扫 QR 付款，再 WhatsApp 通知我们</span></div></div></aside></div>
<footer class="footer">Aligor · 阿理哥</footer>
<script>(()=>{'use strict';
const P=${jsonForScript(PACKAGES)};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const form=$('#form'),err=$('#err'),btn=$('#submit');
let pick='solo_1pc',attempt=null;
function show(){const p=P[pick],pair=p.participants===2;$('#second').classList.toggle('show',pair);$('#sumPackage').textContent=p.title;$('#sumPeople').textContent=p.participants+' 人';$('#sumPc').textContent=p.computers+' 台';$('#sumTotal').textContent='RM'+p.final;$('#sumSave').textContent=p.discount?'原价 RM'+p.original+'，已优惠 RM'+p.discount:''}
$$('.package').forEach(el=>el.addEventListener('click',()=>{pick=el.dataset.code;$$('.package').forEach(x=>x.classList.toggle('active',x===el));el.querySelector('input').checked=true;show()}));show();
const params=new URLSearchParams(location.search);
const phoneOk=v=>{const raw=v.trim();if(!/^\\+?[\\d\\s\\-()]+$/.test(raw))return false;const d=raw.replace(/\\D/g,'');const n=raw.startsWith('+')||d.startsWith('60')?d:d.startsWith('0')?'60'+d.slice(1):'';return /^601\\d{8,9}$/.test(n)};
const uuid=()=>crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
function fail(m){err.textContent=m;err.classList.add('show');btn.disabled=false;btn.textContent='提交报名'}
form.addEventListener('submit',async e=>{e.preventDefault();err.classList.remove('show');
const d={name:$('#name').value.trim(),phone:$('#phone').value,region:$('#region').value,package:pick,second_name:'',second_phone:'',website:$('#website').value,source:params.get('source')||params.get('ref')||'',utm_source:params.get('utm_source')||'',utm_medium:params.get('utm_medium')||'',utm_campaign:params.get('utm_campaign')||''};
if(P[pick].participants===2){d.second_name=$('#second_name').value.trim();d.second_phone=$('#second_phone').value}
if(d.name.length<2)return fail('请填写姓名');if(!phoneOk(d.phone))return fail('请填写有效的马来西亚 WhatsApp 电话号码，例如 016 787 1902');if(!d.region)return fail('请选择上课地区');
if(P[pick].participants===2){if(d.second_name.length<2)return fail('请填写第二位参加者姓名');if(!phoneOk(d.second_phone))return fail('请填写第二位参加者有效的 WhatsApp 电话号码')}
const sig=JSON.stringify(d);if(!attempt||attempt.sig!==sig)attempt={sig,key:uuid()};d.idempotency_key=attempt.key;
btn.disabled=true;btn.textContent='提交中…';
try{const r=await fetch('/api/classregister',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const out=await r.json().catch(()=>({}));if(!r.ok||!out.ok)return fail(out.error||'提交失败，请稍后重试');
$('#rOrder').textContent=out.order_id;$('#rAmount').textContent='RM'+out.amount;$('#rPay').href=out.payment_url;$('#success').classList.add('show');btn.textContent='前往付款页面…';location.href=out.payment_url;
}catch(x){fail('网络出现问题，请检查网络后再按一次提交（不会重复报名）')}});
})();</script></body></html>`;
}

export function invalidPaymentPage() {
  return head('Aligor 付款', '<meta name="robots" content="noindex,nofollow">') + `<body>${topBar}<div class="invalid"><h1>这个付款链接无效</h1><p>链接可能不完整或已经失效。请回到报名页面重新报名，或联络 Adrian。</p><a class="btn gold" href="/classregister">回到报名页面</a></div></body></html>`;
}

export function paymentPage(view, token, waNumber = '60167871902') {
  const s = view.status;
  const done = s === 'payment_confirmed';
  const waMsg = `你好 Adrian，我已完成付款。\n订单编号：${view.order_id}\n配套：${view.package_title}\n金额：RM${view.amount}`;
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`;
  const banner = s === 'payment_confirmed' ? '<div class="notice ok">付款已由 Aligor 核对确认。谢谢你！上课日期与地点，会在报名后第二天或第三天通知。</div>'
    : s === 'payment_submitted' ? '<div class="notice">已收到你的付款通知。请记得 WhatsApp 把付款收据发给我们，核对到账后会再通知你。</div>'
    : s === 'payment_rejected' ? '<div class="notice bad">你提交的付款资料我们暂时对不上。请检查后重新付款，再按“我已完成付款”，并 WhatsApp 我们。</div>' : '';
  const form = done ? '' : `<div class="err" id="err" role="alert"></div><button class="btn gold" style="width:100%;margin-top:14px" id="go" type="button">我已完成付款</button><p class="hint">付款后按这个按钮，会打开 WhatsApp：请把付款收据发给我们，我们核对后确认。</p><a class="btn" style="width:100%;margin-top:10px" id="wa" href="${h(waUrl)}">WhatsApp 发付款收据给 Adrian</a>`;
  return head('Aligor 付款', '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">') + `<body>${topBar}
<div class="pay-wrap"><div class="pay-card">
<div class="qr"><img src="/assets/payment/duitnow-nili-resources.jpg" alt="DuitNow 付款二维码" width="839" height="1280"><p>收款名称：NILI RESOURCES</p></div>
<div class="pay-copy"><h1>课程付款</h1><span class="order">${h(view.order_id)}</span>
<p class="meta">配套：<b>${h(view.package_title)}</b></p><p class="meta">人数：<b>${view.participants} 人</b> · 电脑：<b>${view.computers} 台</b></p>
<div class="amount">RM${view.amount}</div>${view.discount ? `<p class="meta">原价 RM${view.original}，已优惠 RM${view.discount}</p>` : ''}
<p class="meta">收款名称：<b>NILI RESOURCES</b>（DuitNow）</p>
<p class="meta">请用银行 App 扫描二维码，付款金额必须是 <b>RM${view.amount}</b>。</p>
<div class="bank"><h3>或使用银行转账（Maybank）</h3><div class="row"><span>户口名称</span><b>NILI RESOURCES</b></div><div class="row"><span>银行</span><b>Maybank</b></div><div class="acc"><b id="acc">5512 0352 7689</b><button class="btn" type="button" id="copy">复制户口号码</button></div><p class="hint" style="margin:8px 0 0">转账金额必须是 RM${view.amount}，并保留转账收据。</p></div>
${banner}${form}
<p class="hint">提交付款资料不代表付款已经确认。我们核对到账后会再通知你。</p></div></div></div>
<script>(()=>{const cp=document.querySelector('#copy');if(cp)cp.addEventListener('click',async()=>{try{await navigator.clipboard.writeText('551203527689');cp.textContent='已复制'}catch(e){cp.textContent='请手动复制'}setTimeout(()=>cp.textContent='复制户口号码',2000)});const go=document.querySelector('#go');if(!go)return;const T=${jsonForScript(token)},WA=${jsonForScript(waUrl)},err=document.querySelector('#err');
go.addEventListener('click',async()=>{err.classList.remove('show');go.disabled=true;const label=go.textContent;go.textContent='提交中…';
try{const r=await fetch('/api/payment/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({t:T})});const out=await r.json().catch(()=>({}));
if(!r.ok||!out.ok){err.textContent=out.error||'提交失败，请稍后重试';err.classList.add('show');go.disabled=false;go.textContent=label;return}
go.textContent='正在打开 WhatsApp…';location.href=WA;setTimeout(()=>{go.disabled=false;go.textContent='我已完成付款'},3000)}
catch(x){err.textContent='网络出现问题，请再按一次';err.classList.add('show');go.disabled=false;go.textContent=label}});})();</script></body></html>`;
}

export const classAdminTabHtml = `
<section class="view" id="tab-class">
  <div class="page-head"><div><h1>一天课程报名</h1><p class="sub">核对银行到账后，才按“确认付款成功”</p></div><div class="actions"><a class="btn small" href="/api/admin/class/export.csv">导出 CSV</a></div></div>
  <div id="cstats" class="stats"></div>
  <div class="tools"><input id="cq" placeholder="订单编号、姓名或电话"><select id="cregion"><option value="">全部地区</option><option>JOHOR</option><option>SELANGOR</option><option>PENANG</option></select><select id="cpkg"><option value="">全部配套</option>${Object.entries(PACKAGES).map(([c, p]) => `<option value="${c}">${p.title}</option>`).join('')}</select><select id="cstatus"><option value="">全部付款状态</option>${Object.entries(STATUS_LABELS).map(([c, l]) => `<option value="${c}">${l}</option>`).join('')}</select><button id="csearch" class="btn small">查询</button></div>
  <div class="table-wrap"><table style="min-width:1000px"><thead><tr><th>订单</th><th>联络人</th><th>地区 / 配套</th><th>金额</th><th>付款</th><th>Telegram</th><th>操作</th></tr></thead><tbody id="crows"></tbody></table></div>
</section>`;

export const classAdminScript = `
const STATUS_LABELS=${jsonForScript(STATUS_LABELS)};
const TABS={overview:['#tab-overview','#nav-overview'],class:['#tab-class','#btn-class'],preview:['#tab-preview','#btn-preview']};
function openTab(w){if(!TABS[w])w='overview';for(const k in TABS){const on=k===w;document.querySelector(TABS[k][0]).classList.toggle('on',on);document.querySelector(TABS[k][1]).classList.toggle('on',on)}if(w==='class'||w==='overview')loadClass();try{history.replaceState(null,'','#'+w)}catch(e){}}
for(const k in TABS)document.querySelector(TABS[k][1]).onclick=()=>openTab(k);
async function loadClass(){const p=new URLSearchParams({q:document.querySelector('#cq').value,region:document.querySelector('#cregion').value,package:document.querySelector('#cpkg').value,status:document.querySelector('#cstatus').value});
const r=await fetch('/api/admin/class?'+p);if(r.status===401){location='/4916';return}const out=await r.json(),s=out.stats;
const card=(l,v)=>'<div class="stat"><small>'+l+'</small><strong>'+v+'</strong></div>';
const cards=card('全部报名',s.total)+card('等待付款',s.awaiting_payment||0)+card('已提交付款资料',s.payment_submitted||0)+card('已确认付款',(s.payment_confirmed||0)+' 笔 · RM'+s.confirmed_amount);document.querySelector('#cstats').innerHTML=cards;const o=document.querySelector('#ostats');if(o)o.innerHTML='<div class="stat"><small>一天课程 · 待核对付款</small><strong>'+(s.payment_submitted||0)+'</strong></div><div class="stat"><small>一天课程 · 等待付款</small><strong>'+(s.awaiting_payment||0)+'</strong></div><div class="stat"><small>一天课程 · 已确认</small><strong>'+(s.payment_confirmed||0)+'</strong><small>RM'+s.confirmed_amount+'</small></div><div class="stat"><small>一天课程 · 全部报名</small><strong>'+s.total+'</strong></div>';
document.querySelector('#crows').innerHTML=out.registrations.map(x=>{const open=x.payment_status!=='cancelled';
const tg={sent:'已发送',failed:'失败',skipped:'未设置',pending:'等待中',sending:'发送中'}[x.telegram_notification_status]||x.telegram_notification_status;
return '<tr><td><b>'+esc(x.public_order_id)+'</b><br><small>'+new Date(x.created_at).toLocaleString()+'</small></td>'
+'<td><b>'+esc(x.primary_name)+'</b><br><a href="tel:+'+esc(x.primary_phone_normalized)+'">+'+esc(x.primary_phone_normalized)+'</a>'+(x.second_name?'<br><small>第二位：'+esc(x.second_name)+' · +'+esc(x.second_phone_normalized)+'</small>':'')+'</td>'
+'<td>'+esc(x.region)+'<br><small>'+esc(x.package_title)+'<br>'+x.participant_count+' 人 / '+x.computer_count+' 台</small></td>'
+'<td><b>RM'+x.final_amount+'</b><br><small>原价 RM'+x.original_amount+' · 优惠 RM'+x.discount_amount+'</small></td>'
+'<td><span class="status s-'+esc(x.payment_status)+'">'+esc(x.status_label)+'</span><br><small>参考：'+esc(x.payment_reference||'-')+'</small>'+(x.admin_notes?'<br><small>备注：'+esc(x.admin_notes)+'</small>':'')+'</td>'
+'<td><span class="status">'+tg+'</span>'+(x.telegram_notification_status!=='sent'&&open?'<br><button class="btn small" data-cact="telegram" data-cid="'+x.id+'">重发</button>':'')+'</td>'
+'<td><div class="actions">'+(['awaiting_payment','payment_submitted','payment_rejected'].includes(x.payment_status)?'<button class="btn small dark" data-cact="confirm" data-cid="'+x.id+'" data-o="'+esc(x.public_order_id)+'" data-a="'+x.final_amount+'">确认付款成功</button>':'')+(x.payment_status==='payment_submitted'?'<button class="btn small" data-cact="reject" data-cid="'+x.id+'" data-o="'+esc(x.public_order_id)+'" data-a="'+x.final_amount+'">付款资料不符</button>':'')+(open?'<button class="btn small danger" data-cact="cancel" data-cid="'+x.id+'" data-o="'+esc(x.public_order_id)+'" data-a="'+x.final_amount+'">取消报名</button>':'')+'<button class="btn small" data-cact="note" data-cid="'+x.id+'" data-n="'+esc(x.admin_notes||'')+'">备注</button><button class="btn small" data-cact="events" data-cid="'+x.id+'">事件记录</button></div><div id="ev'+x.id+'"></div></td></tr>'}).join('')||'<tr><td colspan="7">没有资料</td></tr>'}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-cact]');if(!b)return;const id=b.dataset.cid,act=b.dataset.cact,o=b.dataset.o,a=b.dataset.a;
const post=async(path,body)=>{const r=await fetch('/api/admin/class/'+id+'/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const out=await r.json().catch(()=>({}));if(!r.ok)alert(out.error||'操作失败');loadClass()};
if(act==='confirm'){if(!confirm('确认付款成功？\\n订单 '+o+'，金额 RM'+a+'\\n\\n只有你在银行户口里实际看到这笔入账，才可以按确定。'))return;if(!confirm('再确认一次：银行户口已经收到 RM'+a+'（订单 '+o+'）吗？'))return;return post('confirm',{confirm:true})}
if(act==='reject'){if(!confirm('把订单 '+o+' 标记为“付款资料不符”？顾客可以重新提交参考编号。'))return;return post('reject',{confirm:true})}
if(act==='cancel'){if(!confirm('取消订单 '+o+'？取消后付款链接会失效。'))return;if(!confirm('再确认一次：真的要取消 '+o+' 吗？'))return;return post('cancel',{confirm:true})}
if(act==='telegram')return post('telegram',{});
if(act==='note'){const v=prompt('内部备注（顾客看不到）',b.dataset.n||'');if(v===null)return;return post('notes',{notes:v})}
if(act==='events'){const box=document.querySelector('#ev'+id);if(box.innerHTML){box.innerHTML='';return}const r=await fetch('/api/admin/class/'+id+'/events');const out=await r.json();box.innerHTML='<small>'+out.events.map(v=>esc(new Date(v.created_at).toLocaleString())+' · '+esc(v.event_type)+' · '+esc(v.actor)+(v.details?' · '+esc(v.details):'')).join('<br>')+'</small>'}});
document.querySelector('#csearch').onclick=loadClass;
openTab((location.hash||'').slice(1)||'overview');
`;
