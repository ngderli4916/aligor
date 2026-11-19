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

export function aiAgentRegistrationPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Register for AI Agent</title><meta name="description" content="Register for an AI Agent course and receive the class details when available.">
<style>
*{box-sizing:border-box}body{margin:0;background:#eef2ec;color:#17261f;font:16px/1.55 system-ui,sans-serif}main{max-width:1090px;margin:auto;min-height:100svh;display:grid;grid-template-columns:1fr minmax(0,420px);gap:clamp(2rem,7vw,6rem);align-items:center;padding:clamp(1.5rem,6vw,5rem)}.eyebrow{display:flex;align-items:center;gap:10px;color:#335d46;font-size:.76rem;font-weight:780;letter-spacing:.12em;text-transform:uppercase}.eyebrow:before{content:'';width:22px;height:2px;background:#3b7254}h1{font-size:clamp(3rem,7vw,6.3rem);line-height:.96;letter-spacing:-.072em;margin:.3em 0;color:#192a21}h1 em{font-style:normal;color:#316044}.intro{max-width:34ch;color:#46574c;font-size:1.09rem;margin:0}.card{background:#fff;border:1px solid #d8e1d8;border-radius:24px;padding:clamp(1.25rem,4vw,2.3rem);box-shadow:0 20px 55px #17362610}h2{font-size:1.4rem;letter-spacing:-.025em;margin:0 0 .95rem}.field{margin:0 0 .88rem}label{display:block;font-weight:650;font-size:.91rem;margin:0 0 .32rem}input{width:100%;font:inherit;color:inherit;background:#f8faf8;border:1px solid #bac9bd;border-radius:9px;padding:.62rem .78rem}input:focus-visible,button:focus-visible{outline:3px solid #4c8564;outline-offset:2px}.privacy{font-size:.79rem;color:#4c5f54;margin:1rem 0}.trap{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}button{width:100%;font:inherit;font-weight:720;border:0;border-radius:10px;background:#26523a;color:#fff;padding:.74rem;cursor:pointer}button:hover{background:#1b412d}button:disabled{opacity:.65;cursor:wait}#feedback{color:#922e2a;margin:.75rem 0 0}#feedback:empty{display:none}#done p{color:#46574c;margin-bottom:0}[hidden]{display:none!important}@media(max-width:740px){main{min-height:auto;grid-template-columns:1fr;padding:2rem 1.15rem;gap:1.45rem}h1{font-size:clamp(2.8rem,12vw,4.4rem);margin:.22em 0}.intro{font-size:1rem}.card{padding:1.25rem;border-radius:18px}}
</style></head><body><main><header><p class="eyebrow">AI Agent Course</p><h1>Register for<br><em>AI Agent</em></h1><p class="intro">Learn how AI agents can help with everyday work. Leave your details and we’ll contact you about the class.</p></header>
<section class="card" aria-label="Course registration"><form id="registration" method="post" action="/api/register-ai-agent"><h2>Your details</h2>
<div class="field"><label for="name">Name</label><input id="name" name="name" autocomplete="name" maxlength="80" required></div>
<div class="field"><label for="phone">Contact Number</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="32" placeholder="e.g. +60 12 345 6789" required></div>
<div class="field"><label for="company">Company Name</label><input id="company" name="company" autocomplete="organization" maxlength="100" required></div>
<div class="field"><label for="industry">Industry</label><input id="industry" name="industry" maxlength="80" placeholder="e.g. Retail or Manufacturing" required></div>
<div class="trap" aria-hidden="true"><label for="website">Leave this blank</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<p class="privacy">We’ll use your contact details to follow up about this course.</p><button type="submit">Submit registration</button><p id="feedback" role="alert"></p><noscript>Please enable JavaScript to submit your registration.</noscript></form>
<div id="done" role="status" tabindex="-1" hidden><h2>Registration received</h2><p>Thank you. We’ll contact you with class details when available.</p></div></section></main>
<script>
const form=document.querySelector('#registration'),button=form.querySelector('button'),feedback=document.querySelector('#feedback'),done=document.querySelector('#done');
form.addEventListener('submit',async e=>{e.preventDefault();if(button.disabled)return;button.disabled=true;button.textContent='Submitting…';feedback.textContent='';try{const res=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await res.json();if(!res.ok||!data.ok){feedback.textContent=res.status<500&&data.error?data.error:'Could not submit. Please try again.';return;}form.reset();form.hidden=true;done.hidden=false;done.focus();}catch{feedback.textContent='Could not submit. Please try again.';}finally{button.disabled=false;button.textContent='Submit registration';}});
</script></body></html>`;
}
