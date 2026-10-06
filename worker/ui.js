const css = `
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@700;900&display=swap");
:root{--ink:#14110F;--ink2:#3B3731;--muted:#6F6A60;--paper:#FBF8EE;--card:#fff;--yellow:#FFC93C;--green:#0F766E;--line:#E7E1D0;--field:#D9D2BF;--red:#B42318;--serif:"Noto Serif SC","Songti SC","Source Han Serif SC",serif;--sans:"Noto Sans SC","PingFang SC","Microsoft YaHei",-apple-system,system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;font-family:var(--sans);background:var(--paper);color:var(--ink);line-height:1.7;-webkit-font-smoothing:antialiased}
main{width:min(880px,calc(100% - 32px));margin:28px auto 64px}
.brand{display:flex;align-items:center;gap:10px;font-weight:900;font-size:18px}
.brand::before{content:"";width:30px;height:30px;background:url(/assets/logos/aligor-logo-transparent.png) center/contain no-repeat}
.hero{margin:44px 0 28px}
.hero small{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.1em;color:var(--green)}
.hero h1{font-family:var(--serif);font-weight:900;font-size:clamp(32px,6vw,52px);line-height:1.2;margin:10px 0 14px;letter-spacing:-.01em}
.hero p{font-size:18px;color:var(--ink2);max-width:600px;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:30px;box-shadow:0 18px 50px -24px rgba(20,17,15,.22)}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.full{grid-column:1/-1}
label{display:grid;gap:7px;font-weight:700;font-size:15px}
input,select,textarea{width:100%;padding:13px 15px;border:1.5px solid var(--field);border-radius:12px;font:inherit;font-weight:400;background:#fff;color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:3px solid var(--yellow);outline-offset:1px;border-color:var(--ink)}
textarea{min-height:100px;resize:vertical}
input[readonly]{background:#F6F2E6;color:var(--ink2);cursor:default}
fieldset{border:0;padding:0;margin:0;min-width:0}
legend{font-weight:700;font-size:15px;padding:0;margin-bottom:10px}
.choices{display:flex;flex-wrap:wrap;gap:10px}
.choice{display:inline-flex;align-items:center;gap:8px;font-weight:500;font-size:15px;padding:9px 16px;border:1.5px solid var(--field);border-radius:999px;background:#fff;cursor:pointer}
.choice input{width:auto;margin:0;accent-color:var(--ink)}
.choice:has(input:checked){background:var(--yellow);border-color:var(--ink)}
.check{display:flex;align-items:flex-start;gap:10px;font-weight:400;font-size:14px;color:var(--ink2)}
.check input{width:auto;margin-top:5px;accent-color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;border:2px solid var(--ink);border-radius:999px;padding:14px 28px;background:var(--yellow);color:var(--ink);font:700 16px var(--sans);cursor:pointer;text-decoration:none;transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-2px);box-shadow:0 5px 0 var(--ink)}
.btn:disabled{opacity:.6;cursor:wait;transform:none;box-shadow:none}
.btn.dark{background:var(--ink);color:#fff}
.btn.wa{background:#25D366;color:#06260f;border-color:#0b3d1d}
.btn.danger{background:#fff;color:var(--red);border-color:var(--red)}
.btn.small{padding:8px 14px;font-size:13px;border-width:1.5px}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.notice{padding:14px 16px;border-radius:12px;background:#FFF5D1;margin:14px 0}
.error{color:var(--red);font-weight:500}
#message{margin:0;min-height:1.5em;color:var(--ink2)}
.success{text-align:center;padding:56px 22px}
.success h2{font-family:var(--serif);font-weight:900;font-size:30px;margin:0 0 8px}
.success p{color:var(--ink2);margin:0 0 22px}
.hidden{display:none!important}
.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:22px}
.top h1{font-family:var(--serif);font-weight:900;margin:6px 0 0}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}
.stat{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px}
.stat small{color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:12px}
.stat strong{font-family:var(--serif);font-size:30px;display:block;line-height:1.2}
.tools{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
.tools input,.tools select{width:auto;min-width:150px}
.table-wrap{overflow:auto;background:#fff;border:1px solid var(--line);border-radius:18px}
table{border-collapse:collapse;width:100%;min-width:900px}
th,td{text-align:left;padding:13px 14px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
td small{color:var(--muted)}
.status{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#F1ECDD}
@media(max-width:700px){main{width:calc(100% - 28px)}.grid{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.top{align-items:flex-start;flex-direction:column}.tools>*{width:100%!important}.card{padding:20px;border-radius:20px}.hero{margin-top:32px}}
`;

function shell(title, body, script = '') {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

export function registerPage(defaultBatch = '') {
  return shell('Aligor Preview 报名', `
    <a class="brand" href="/" style="text-decoration:none;color:inherit">阿理哥 · Aligor</a>
    <section class="hero"><small>Preview 报名</small><h1>留下 WhatsApp，<br>我会直接联络你</h1><p>选择你想参加的场次，填写资料后，我会通过 WhatsApp 联络你。</p></section>
    <form id="leadForm" class="card grid">
      <label>姓名<input name="name" required maxlength="80" autocomplete="name"></label>
      <label>WhatsApp 号码<input name="phone" required maxlength="30" inputmode="tel" placeholder="例如 0167871902" autocomplete="tel"></label>
      <label class="full">报名项目<select name="course" id="course"><option value="免费 AI Preview · 10 月 7 日（星期三）8 PM – 9 PM" data-batch="PREVIEW-1007">免费 AI Preview · 10 月 7 日（星期三）8 PM – 9 PM</option><option value="免费 AI Preview · 10 月 14 日（星期三）8 PM – 9 PM" data-batch="PREVIEW-1014">免费 AI Preview · 10 月 14 日（星期三）8 PM – 9 PM</option></select></label>
      <input type="hidden" name="batch" id="batch" value="${defaultBatch||'PREVIEW-1007'}">
      <label>公司名称（选填）<input name="company" maxlength="100"></label>
      <label>行业（选填）<input name="industry" maxlength="80"></label>
      <fieldset class="full"><legend>你有用过 AI Agent 吗？</legend><div class="choices">
        <label class="choice"><input type="radio" name="used_ai_agent" value="有，正在使用" required>有，正在使用</label>
        <label class="choice"><input type="radio" name="used_ai_agent" value="有，曾经试过">有，曾经试过</label>
        <label class="choice"><input type="radio" name="used_ai_agent" value="听过，但还没用过">听过，但还没用过</label>
        <label class="choice"><input type="radio" name="used_ai_agent" value="完全没用过">完全没用过</label>
      </div></fieldset>
      <fieldset class="full"><legend>你目前使用哪些 AI？（可以多选）</legend><div class="choices">
        <label class="choice"><input type="checkbox" name="ai_tools" value="ChatGPT">ChatGPT</label>
        <label class="choice"><input type="checkbox" name="ai_tools" value="Claude">Claude</label>
        <label class="choice"><input type="checkbox" name="ai_tools" value="Gemini">Gemini</label>
        <label class="choice"><input type="checkbox" name="ai_tools" value="DeepSeek">DeepSeek</label>
        <label class="choice"><input type="checkbox" name="ai_tools" value="Microsoft Copilot">Microsoft Copilot</label>
        <label class="choice"><input type="checkbox" name="ai_tools" value="Codex">Codex</label>
        <label class="choice"><input type="checkbox" name="ai_tools" value="其他 AI Agent">其他 AI Agent</label>
        <label class="choice"><input type="checkbox" name="ai_tools" value="还没有使用任何 AI">还没有使用任何 AI</label>
      </div><label style="margin-top:12px">其他（选填）<input name="ai_tools_other" maxlength="100" placeholder="填写其他 AI 工具"></label></fieldset>
      <label class="full">你最想让 AI 帮你解决什么？<textarea name="goal" maxlength="800"></textarea></label>
      <input class="hidden" name="website" tabindex="-1" autocomplete="off">
      <label class="check full"><input type="checkbox" name="consent" required value="true"><span>我同意 Aligor 使用以上资料处理 Preview 报名，并通过 WhatsApp 联络我。我可以随时要求停止联络或删除资料。</span></label>
      <div class="full actions"><button class="btn" type="submit">提交报名</button></div>
      <p id="message" class="full" role="status"></p>
    </form>
    <section id="success" class="card success hidden"><h2>报名成功！</h2><p id="successNote"></p><a id="wa" class="btn wa" target="_blank" rel="noopener">打开 WhatsApp</a></section>
  `, `
    const form=document.querySelector('#leadForm'),msg=document.querySelector('#message');
    const qb=new URLSearchParams(location.search).get('batch'),sel=document.querySelector('#course'),bt=document.querySelector('#batch');
    function syncBatch(){if(!qb)bt.value=sel.selectedOptions[0].dataset.batch}
    sel.addEventListener('change',syncBatch);syncBatch();
    form.addEventListener('submit',async e=>{e.preventDefault();msg.textContent='提交中…';const button=form.querySelector('button');button.disabled=true;try{const fd=new FormData(form),data=Object.fromEntries(fd);data.ai_tools=fd.getAll('ai_tools');data.consent=form.consent.checked;const r=await fetch('/api/leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const out=await r.json();if(!r.ok)throw new Error(out.error||'提交失败');form.classList.add('hidden');document.querySelector('#success').classList.remove('hidden');document.querySelector('#wa').href=out.whatsapp_url;document.querySelector('#successNote').textContent='你报名的是：'+data.course+'。我会通过 WhatsApp 联络你，也可以现在直接 WhatsApp 我，获得更快回复。';}catch(err){msg.textContent=err.message;msg.className='full error';button.disabled=false;}});
  `);
}

export function loginPage(error = '') {
  return shell('Aligor 后台登入', `<div class="brand">阿理哥 · Aligor</div><section class="hero"><h1>报名后台</h1><p>只有管理员可以查看完整顾客资料。</p></section><form class="card" method="post" action="/api/admin/login"><label>管理员密码<input type="password" name="password" required autocomplete="current-password"></label>${error?`<p class="error">${error}</p>`:''}<p><button class="btn dark">登入</button></p></form>`);
}

export function adminPage() {
  return shell('Aligor 报名后台', `
    <div class="top"><div><div class="brand">阿理哥 · Aligor</div><h1>报名后台</h1></div><div class="actions"><a class="btn small" href="/api/admin/export.csv">导出 CSV</a><button id="logout" class="btn dark small">登出</button></div></div>
    <div id="traffic"></div>
    <div id="stats" class="stats"></div>
    <div class="tools"><input id="q" placeholder="姓名、电话或报名ID"><input id="batch" placeholder="批次"><select id="status"><option value="">全部状态</option><option>new</option><option>contacted</option><option>registered</option><option>paid</option><option>attended</option><option>cancelled</option></select><button id="search" class="btn small">查询</button></div>
    <div id="message"></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>顾客</th><th>课程 / 批次</th><th>状态</th><th>报名时间</th><th>操作</th></tr></thead><tbody id="rows"></tbody></table></div>
  `, `
    const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const q=document.querySelector('#q'),batch=document.querySelector('#batch'),status=document.querySelector('#status'),stats=document.querySelector('#stats'),rows=document.querySelector('#rows'),search=document.querySelector('#search'),logout=document.querySelector('#logout');
    async function load(){const p=new URLSearchParams({q:q.value,batch:batch.value,status:status.value});const r=await fetch('/api/admin/leads?'+p);if(r.status===401){location='/4916';return}const out=await r.json();stats.innerHTML=Object.entries(out.stats).map(([k,v])=>'<div class="stat"><small>'+esc(k)+'</small><strong>'+v+'</strong></div>').join('');rows.innerHTML=out.leads.map(x=>'<tr><td><b>'+esc(x.code)+'</b></td><td><b>'+esc(x.name)+'</b><br><a href="tel:+'+esc(x.phone_e164)+'">+'+esc(x.phone_e164)+'</a><br><small>'+esc(x.company||x.industry)+'</small></td><td>'+esc(x.course)+'<br><small>'+esc(x.batch)+'</small><br><small>Agent：'+esc(x.used_ai_agent||'未填写')+'</small><br><small>AI：'+esc([x.ai_tools,x.ai_tools_other].filter(Boolean).join('、')||'未填写')+'</small></td><td><span class="status">'+esc(x.status)+'</span></td><td>'+new Date(x.created_at).toLocaleString()+'</td><td><div class="actions"><a class="btn wa small" target="_blank" href="'+esc(x.whatsapp_url)+'">WhatsApp</a><button class="btn small" data-id="'+x.id+'" data-status="contacted">已联系</button><button class="btn small" data-id="'+x.id+'" data-status="paid">已付款</button><button class="btn small danger" data-del="'+x.id+'" data-name="'+esc(x.name)+'">删除</button></div></td></tr>').join('')||'<tr><td colspan="6">没有资料</td></tr>';}
    document.addEventListener('click',async e=>{const d=e.target.closest('[data-del]');if(d){if(!confirm('确定要删除「'+d.dataset.name+'」（#'+d.dataset.del+'）的报名资料吗？\\n删除后无法恢复。'))return;const r=await fetch('/api/admin/leads/'+d.dataset.del,{method:'DELETE'});if(!r.ok)alert('删除失败，请重试');load();return}const b=e.target.closest('[data-id]');if(!b)return;await fetch('/api/admin/leads/'+b.dataset.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:b.dataset.status})});load();});
    const traffic=document.querySelector('#traffic');
    async function loadTraffic(){try{const r=await fetch('/api/admin/stats');if(!r.ok)return;const s=await r.json();
      const card=(l,v,n)=>'<div class="stat"><small>'+l+'</small><strong>'+v+'</strong>'+(n?'<small>'+n+'</small>':'')+'</div>';
      const days=s.days.map(d=>'<tr><td>'+esc(d.day)+'</td><td>'+d.home_visitors+'</td><td>'+d.clicks+'</td><td>'+d.register_visitors+'</td><td>'+d.leads+'</td></tr>').join('');
      const sources=s.sources.map(x=>'<span class="status">'+esc(x.source)+' · '+x.visitors+'</span>').join(' ')||'暂无';
      const devices=s.devices.map(x=>'<span class="status">'+(x.device==='mobile'?'手机':'电脑')+' · '+x.visitors+'</span>').join(' ')||'暂无';
      traffic.innerHTML='<h2 style="font-family:var(--serif);margin:26px 0 0">访客统计</h2><p style="color:var(--muted);margin:4px 0 0">统计从 '+esc(s.first_day||'今天')+' 开始。不用 Cookie，不记录个人资料；管理员自己的访问不计算。</p>'
        +'<div class="stats">'+card('今日首页访客',s.today_home_visitors)+card('近 7 天首页访客',s.last7_home_visitors)+card('累计首页访客',s.total_home_visitors,'每天各算一次')+card('累计点击报名',s.total_clicks)+'</div>'
        +'<div class="stats">'+card('报名页访客',s.total_register_visitors)+card('累计报名',s.total_leads)+card('转化率',s.conversion==null?'-':s.conversion+'%','报名 ÷ 首页访客')+card('首页浏览次数',s.total_home_views)+'</div>'
        +'<div class="table-wrap"><table style="min-width:520px"><thead><tr><th>日期</th><th>首页访客</th><th>点击报名</th><th>报名页访客</th><th>报名</th></tr></thead><tbody>'+days+'</tbody></table></div>'
        +'<p style="margin:14px 0 0"><b>来源（近 14 天）</b>　'+sources+'</p><p style="margin:6px 0 26px"><b>设备（近 14 天）</b>　'+devices+'</p>';}catch(e){}}
    search.onclick=load;logout.onclick=async()=>{await fetch('/api/admin/logout',{method:'POST'});location='/4916'};load();loadTraffic();
  `);
}
