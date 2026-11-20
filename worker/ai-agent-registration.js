import { cleanText, normalizePhone } from './lib.js';
import { AI_AGENT_BATCH } from './notify.js';


const SOURCE = 'ai-agent-registration';
const COURSE = 'AI Agent Course';

export async function saveAiAgentRegistration(request, env) {
  const failure = (error, status=400) => ({body:{ok:false,error},status});
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return failure('Please submit from the registration page.',403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure('Please submit from the registration page.',415);
  const reader=request.body?.getReader();
  if (!reader) return failure('Invalid registration.');
  let data;
  try {
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let bytes=0, text='';
    for (;;) {
      const {value,done}=await reader.read();
      if (done) break;
      bytes+=value.byteLength;
      if (bytes>4096) { await reader.cancel(); return failure('Registration is too long.',413); }
      text+=decoder.decode(value,{stream:true});
    }
    data=JSON.parse(text+decoder.decode());
  } catch { return failure('Invalid registration.'); }
  if (!data || typeof data!=='object' || Array.isArray(data)) return failure('Invalid registration.');
  if (data.website) return {status:200,body:{ok:true}};
  const fields={name:80,phone:32,company:100,industry:80};
  if (Object.entries(fields).some(([key,max])=>typeof data[key]!=='string' || !data[key].trim() || data[key].length>max)) return failure('Please complete all four fields.');
  const name=cleanText(data.name,80).trim(), company=cleanText(data.company,100).trim(), industry=cleanText(data.industry,80).trim();
  if (!name || !company || !industry) return failure('Please complete all four fields.');
  let phone;
  try { if (!/^\+?[\d ()-]+$/.test(data.phone.trim())) throw new Error(); phone=normalizePhone(data.phone); }
  catch { return failure('Enter a valid Malaysian contact number.'); }
  const stamp=new Date().toISOString();
  const lead=await env.DB.prepare(`INSERT INTO leads(public_id,name,phone_e164,batch,course,company,industry,source,status,consent_whatsapp,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,'new',0,?,?) ON CONFLICT(phone_e164,batch) DO NOTHING RETURNING id,name,phone_e164,batch,course,company,industry,created_at`)
    .bind(crypto.randomUUID().slice(0,8).toUpperCase(),name,phone,AI_AGENT_BATCH,COURSE,company,industry,SOURCE,stamp,stamp).first();
  // Identical public response for new and repeated numbers; only new leads notify.
  return {status:200,body:{ok:true},lead};
}

// Public headcount for the registration page: same filter as the team board, number only.
export async function countAiAgentRegistrations(env) {
  if (!env?.DB) return null;
  try {
    const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE batch=? AND source=? AND status!='cancelled'").bind(AI_AGENT_BATCH,SOURCE).first();
    const n=Number(row?.n);
    return Number.isInteger(n)&&n>=0?n:null;
  } catch { console.error('ai_agent_count_failed'); return null; }
}

const COPY={
  zh:{lang:'zh-Hans',title:'AI 助理｜课程报名',description:'报名 AI 助理课程，学习如何用 AI 助理处理日常工作。',eyebrow:'课程报名',theme:'AI 助理',intro:'学习如何用 AI 助理处理日常工作。',dateLabel:'日期',date:'2026 年 11 月 26 日（星期四）',timeLabel:'时间',locationLabel:'地点',details:'报名资料',name:'姓名',phone:'联系电话',company:'公司名称',industry:'行业',phoneHint:'例如 +60 12 345 6789',industryHint:'例如：零售或制造业',privacy:'你的联系方式仅用于这堂课的报名跟进。',submit:'提交报名',sending:'提交中…',done:'已收到报名',thanks:'谢谢！我们会联系你，跟进课程安排。',noscript:'请启用 JavaScript 后再提交报名。',failed:'暂时无法提交，请再试一次。',phoneError:'请输入有效的马来西亚联系电话。',requiredError:'请填写全部四项资料。',countOne:'目前已有 {n} 人报名',countMany:'目前已有 {n} 人报名'},
  en:{lang:'en',title:'Register for AI Personal Assistant',description:'Register for the AI Personal Assistant course and learn how AI agents can help with everyday work.',eyebrow:'Course Registration',theme:'AI Personal Assistant',intro:'Learn how AI agents can help with everyday work.',dateLabel:'Date',date:'Thursday, 26 November 2026',timeLabel:'Time',locationLabel:'Location',details:'Your details',name:'Name',phone:'Contact Number',company:'Company Name',industry:'Industry',phoneHint:'e.g. +60 12 345 6789',industryHint:'e.g. Retail or Manufacturing',privacy:'We’ll use your contact details to follow up about this course.',submit:'Submit registration',sending:'Submitting…',done:'Registration received',thanks:'Thank you. We’ll contact you about the class.',noscript:'Please enable JavaScript to submit your registration.',failed:'Could not submit. Please try again.',phoneError:'Enter a valid Malaysian contact number.',requiredError:'Please complete all four fields.',countOne:'{n} person has registered so far',countMany:'{n} people have registered so far'}
};

export function aiAgentRegistrationPage(language, count=null) {
  const initial=language==='en'?'en':'zh', t=COPY[initial];
  const n=Number.isInteger(count)&&count>0?count:0, countText=n?t[n===1?'countOne':'countMany'].replace('{n}',String(n)):'';
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.title}</title><meta name="description" content="${t.description}">
<style>
*{box-sizing:border-box}body{margin:0;background:#eef2ec;color:#17261f;font:16px/1.55 system-ui,sans-serif}main{max-width:1090px;margin:auto;min-height:100svh;display:grid;grid-template-columns:1fr minmax(0,420px);gap:clamp(2rem,7vw,6rem);align-items:center;padding:clamp(1.5rem,6vw,5rem)}.eyebrow{display:flex;align-items:center;gap:10px;color:#335d46;font-size:.76rem;font-weight:780;letter-spacing:.12em;text-transform:uppercase}.eyebrow:before{content:'';width:22px;height:2px;background:#3b7254}h1{font-size:clamp(3rem,7vw,6.3rem);line-height:.96;letter-spacing:-.072em;margin:.3em 0;color:#192a21}h1 em{font-style:normal;color:#316044}.intro{max-width:34ch;color:#46574c;font-size:1.09rem;margin:0}.card{background:#fff;border:1px solid #d8e1d8;border-radius:24px;padding:clamp(1.25rem,4vw,2.3rem);box-shadow:0 20px 55px #17362610}h2{font-size:1.4rem;letter-spacing:-.025em;margin:0 0 .95rem}.field{margin:0 0 .88rem}label{display:block;font-weight:650;font-size:.91rem;margin:0 0 .32rem}input{width:100%;font:inherit;color:inherit;background:#f8faf8;border:1px solid #bac9bd;border-radius:9px;padding:.62rem .78rem}input:focus-visible,button:focus-visible{outline:3px solid #4c8564;outline-offset:2px}.privacy{font-size:.79rem;color:#4c5f54;margin:1rem 0}.trap{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}button{width:100%;font:inherit;font-weight:720;border:0;border-radius:10px;background:#26523a;color:#fff;padding:.74rem;cursor:pointer}button:hover{background:#1b412d}button:disabled{opacity:.65;cursor:wait}#feedback{color:#922e2a;margin:.75rem 0 0}#feedback:empty{display:none}#done p{color:#46574c;margin-bottom:0}[hidden]{display:none!important}@media(max-width:740px){main{min-height:auto;grid-template-columns:1fr;padding:2rem 1.15rem;gap:1.45rem}h1{font-size:clamp(2.8rem,12vw,4.4rem);margin:.22em 0}.intro{font-size:1rem}.card{padding:1.25rem;border-radius:18px}}
/* Deep navy, ice white and cyan from the class artwork. */
:root{color-scheme:dark;--navy:#060f1e;--surface:#101f31;--ice:#eff7ff;--muted:#b5cada;--cyan:#56d8ef;--edge:#304b61}body{background:radial-gradient(ellipse at 72% 25%,#123951 0%,transparent 48%),var(--navy);color:var(--ice)}main{max-width:1170px}.eyebrow{color:var(--cyan);margin-top:0}.eyebrow:before{background:var(--cyan)}h1{color:var(--ice)}h1 em{color:var(--cyan)}.intro,.privacy,#done p{color:var(--muted)}.class-details{display:grid;gap:.6rem;margin:1.65rem 0 0;border-top:1px solid var(--edge);padding-top:1.05rem;max-width:430px}.class-details div{display:grid;grid-template-columns:5rem 1fr;align-items:baseline;gap:.4rem}.class-details dt{color:var(--muted);font-size:.73rem;letter-spacing:.09em;text-transform:uppercase}.class-details dd{margin:0;color:var(--ice);font-weight:650}.card{background:var(--surface);border-color:var(--edge);box-shadow:0 18px 58px #0005}input{background:#0a1828;border-color:#49667d}input::placeholder{color:#97afc3}input:focus-visible,button:focus-visible{outline-color:var(--cyan)}button{background:var(--cyan);color:var(--navy)}button:hover{background:#8beaff}#feedback{color:#ffb9b5}@media(max-width:740px){main{padding-top:1.5rem}.class-details{margin-top:1rem;padding-top:.7rem;gap:.35rem}.intro{max-width:36ch}}
main{min-height:calc(100svh - 72px);padding-top:2rem}.language{max-width:1170px;margin:auto;padding:1.1rem clamp(1.15rem,6vw,5rem) 0;display:flex;justify-content:flex-end;gap:.4rem}.language button{width:auto;padding:.5rem .9rem;min-height:44px;border:1px solid var(--edge);background:#101f31;color:var(--ice);font-size:.85rem}.language button:hover{border-color:var(--cyan)}.language button[aria-pressed=true]{background:var(--cyan);color:var(--navy);border-color:var(--cyan)}html[lang=zh-Hans] h1{letter-spacing:-.045em}.headcount{display:inline-flex;align-items:center;gap:.55rem;margin:1.3rem 0 0;padding:.5rem .95rem;border:1px solid var(--edge);border-radius:999px;background:#0c2236;color:var(--ice);font-weight:650}.headcount:before{content:'';width:9px;height:9px;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 4px #56d8ef33}.headcount strong{color:var(--cyan);font-size:1.15em}@media(max-width:740px){main{min-height:0;padding-top:1rem}}
</style></head><body><nav class="language" aria-label="Language / 语言"><button type="button" lang="zh-Hans" data-language="zh" aria-pressed="${initial==='zh'}">华语</button><button type="button" lang="en" data-language="en" aria-pressed="${initial==='en'}">English</button></nav>
<main><header><p class="eyebrow" data-copy="eyebrow">${t.eyebrow}</p><h1><em data-copy="theme">${t.theme}</em></h1><p class="intro" data-copy="intro">${t.intro}</p>
<dl class="class-details"><div><dt data-copy="dateLabel">${t.dateLabel}</dt><dd><time datetime="2026-11-26" data-copy="date">${t.date}</time></dd></div><div><dt data-copy="timeLabel">${t.timeLabel}</dt><dd>12PM - 4PM</dd></div><div><dt data-copy="locationLabel">${t.locationLabel}</dt><dd>Taman Impian Emas</dd></div></dl>${n?`<p class="headcount" data-count="${n}">${countText.replace(String(n),`<strong>${n}</strong>`)}</p>`:''}</header>
<section class="card"><form id="registration" method="post" action="/api/register-ai-agent"><h2 data-copy="details">${t.details}</h2>
<div class="field"><label for="name" data-copy="name">${t.name}</label><input id="name" name="name" autocomplete="name" maxlength="80" required></div>
<div class="field"><label for="phone" data-copy="phone">${t.phone}</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="32" placeholder="${t.phoneHint}" data-hint="phoneHint" required></div>
<div class="field"><label for="company" data-copy="company">${t.company}</label><input id="company" name="company" autocomplete="organization" maxlength="100" required></div>
<div class="field"><label for="industry" data-copy="industry">${t.industry}</label><input id="industry" name="industry" maxlength="80" placeholder="${t.industryHint}" data-hint="industryHint" required></div>
<div class="trap" aria-hidden="true"><label for="website">Leave this blank</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<p class="privacy" data-copy="privacy">${t.privacy}</p><button type="submit">${t.submit}</button><p id="feedback" role="alert"></p><noscript>${t.noscript}</noscript></form>
<div id="done" role="status" tabindex="-1" hidden><h2 data-copy="done">${t.done}</h2><p data-copy="thanks">${t.thanks}</p></div></section></main>
<script>
const form=document.querySelector('#registration'),button=form.querySelector('button'),feedback=document.querySelector('#feedback'),done=document.querySelector('#done');
const copy=${JSON.stringify(COPY)}, switches=document.querySelectorAll('[data-language]');
let language='${initial}', errorKey='';
function render(){const t=copy[language]; document.documentElement.lang=t.lang;document.title=t.title;document.querySelector('meta[name=description]').content=t.description;document.querySelectorAll('[data-copy]').forEach(el=>el.textContent=t[el.dataset.copy]);document.querySelectorAll('[data-hint]').forEach(el=>el.placeholder=t[el.dataset.hint]);switches.forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.language===language)));button.textContent=t[button.disabled?'sending':'submit'];feedback.textContent=errorKey?t[errorKey]:'';const hc=document.querySelector('[data-count]');if(hc){const n=Number(hc.dataset.count),[a,b]=t[n===1?'countOne':'countMany'].split('{n}'),s=document.createElement('strong');s.textContent=n;hc.replaceChildren(a,s,b);}}
switches.forEach(el=>el.addEventListener('click',()=>{language=el.dataset.language;render();const url=new URL(location.href);if(language==='en')url.searchParams.set('lang','en');else url.searchParams.delete('lang');history.replaceState(null,'',url); }));
form.addEventListener('submit',async e=>{e.preventDefault();if(button.disabled)return;button.disabled=true;errorKey='';render();try{const res=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await res.json();if(!res.ok||!data.ok){errorKey=data.error===copy.en.phoneError?'phoneError':data.error===copy.en.requiredError?'requiredError':'failed';return;}form.reset();form.hidden=true;done.hidden=false;done.focus();}catch{errorKey='failed';}finally{button.disabled=false;render();}});
</script></body></html>`;
}
