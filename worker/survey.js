import { cleanText, htmlEscape } from './lib.js';

export const COURSE_DATE = '2026-10-18';
export const COHORT = 'Aligor AI Agent – Cohort 01';

const COURSE_LENGTH = new Set(['too_short', 'slightly_short', 'just_right', 'slightly_long', 'too_long']);
const TEACHING_SPEED = new Set(['too_slow', 'slightly_slow', 'just_right', 'slightly_fast', 'too_fast']);
const EXAMPLE_AMOUNT = new Set(['too_few', 'slightly_few', 'just_right', 'slightly_many', 'too_many']);
const PUBLICITY = new Set(['name_and_quote', 'anonymous_only', 'no_publicity']);
const HELPFUL = new Set(['install_setup', 'company_context', 'telegram', 'whatsapp', 'automation', 'website', 'github_cloudflare', 'other']);
const DIFFICULT = new Set(['install_setup', 'agent_usage', 'telegram', 'whatsapp', 'github_cloudflare', 'prompting', 'none', 'other']);

const isScore = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5;
const isAllowed = (value, allowed) => allowed.has(String(value || ''));
const cleanList = (value, allowed) => Array.isArray(value) ? [...new Set(value.map(String).filter(item => allowed.has(item)))].slice(0, 12) : [];

async function tokenHash(token) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function findSurveyInvite(env, token) {
  token = String(token || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return env.DB.prepare('SELECT id,student_name,course_date,cohort FROM course_survey_invites WHERE token_hash=?').bind(await tokenHash(token)).first();
}

export async function saveSurvey(env, data = {}) {
  const invite = await findSurveyInvite(env, data.t);
  if (!invite) return { status: 400, body: { ok: false, error: '专属链接无效，请使用老师发给你的链接。' } };
  const key = await tokenHash(String(data.t));
  if (cleanText(data.website, 100)) return { status: 202, body: { ok: true } };

  const scoreFields = ['practical_learning', 'overall_satisfaction', 'ai_agent_confidence', 'unnecessary_content', 'hands_on_time', 'explanation_clarity', 'work_applicability', 'recommend_score'];
  if (scoreFields.some(field => !isScore(data[field]))) return { status: 400, body: { ok: false, error: '请完成所有1–5分的题目。' } };
  if (!isAllowed(data.course_length, COURSE_LENGTH) || !isAllowed(data.teaching_speed, TEACHING_SPEED) || !isAllowed(data.example_amount, EXAMPLE_AMOUNT)) return { status: 400, body: { ok: false, error: '请完成课程时间、速度与例子数量题目。' } };
  if (!isAllowed(data.publicity_consent, PUBLICITY)) return { status: 400, body: { ok: false, error: '请选择课程感想的宣传授权。' } };

  const helpful = cleanList(data.helpful_parts, HELPFUL);
  const difficult = cleanList(data.difficult_parts, DIFFICULT);
  if (!helpful.length || !difficult.length) return { status: 400, body: { ok: false, error: '请至少选择一个最有帮助及最难的部分。' } };

  const existing = await env.DB.prepare('SELECT submission_id FROM course_survey_responses WHERE idempotency_key=?').bind(key).first();
  if (existing) return { status: 200, body: { ok: true, submission_id: existing.submission_id } };

  const submissionId = `AISV-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO course_survey_responses(
    submission_id,idempotency_key,student_name,course_date,cohort,practical_learning,overall_satisfaction,ai_agent_confidence,course_length,teaching_speed,unnecessary_content,example_amount,hands_on_time,explanation_clarity,helpful_parts,difficult_parts,reduce_topics,work_applicability,first_use,recommend_score,improvement,testimonial,publicity_consent,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    submissionId, key, cleanText(invite.student_name, 80), invite.course_date || COURSE_DATE, invite.cohort || COHORT,
    Number(data.practical_learning), Number(data.overall_satisfaction), Number(data.ai_agent_confidence), String(data.course_length), String(data.teaching_speed), Number(data.unnecessary_content), String(data.example_amount), Number(data.hands_on_time), Number(data.explanation_clarity),
    JSON.stringify(helpful), JSON.stringify(difficult), cleanText(data.reduce_topics, 800), Number(data.work_applicability), cleanText(data.first_use, 800), Number(data.recommend_score), cleanText(data.improvement, 800), cleanText(data.testimonial, 800), String(data.publicity_consent), createdAt
  ).run();
  return { status: 201, body: { ok: true, submission_id: submissionId } };
}

const options = (name, values) => `<div class="options">${values.map(([value, label]) => `<label class="option"><input type="radio" name="${name}" value="${value}" required><span>${label}</span></label>`).join('')}</div>`;
const score = (name, low, high) => `<div class="scale-labels"><span>${low}</span><span>${high}</span></div><div class="scale">${[1,2,3,4,5].map(n => `<label><input type="radio" name="${name}" value="${n}" required><span>${n}</span></label>`).join('')}</div>`;
const checks = (name, values) => `<div class="checks">${values.map(([value, label]) => `<label><input type="checkbox" name="${name}" value="${value}"><span>${label}</span></label>`).join('')}</div>`;
const q = (number, title, body, optional = false) => `<fieldset><legend><span class="number">${number}</span><span>${title}${optional ? '<small>选填</small>' : ''}</span></legend>${body}</fieldset>`;

export function invalidSurveyPage() {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Survey链接无效</title><style>body{margin:0;background:#fbf8ee;color:#14110f;font-family:system-ui,"PingFang SC",sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:430px;background:#fffef9;border:2px solid #14110f;border-radius:22px;padding:30px;box-shadow:7px 7px 0 #ffca32;text-align:center}h1{font-size:24px;margin:0 0 10px}p{color:#736d62;line-height:1.7;margin:0}</style></head><body><div class="card"><h1>这个Survey链接无效</h1><p>请使用老师私下发给你的专属链接。如果链接无法打开，请联络老师。</p></div></body></html>`;
}

export function surveyPage(invite) {
  const studentName = htmlEscape(invite.student_name);
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>AI Agent一天实战课程｜学员反馈调查</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;700;900&family=Noto+Serif+SC:wght@600;700;900&display=swap" rel="stylesheet"><style>
  :root{--cream:#fbf8ee;--cream-deep:#f0eadc;--paper:#fffef9;--ink:#14110f;--ink2:#3b3731;--muted:#736d62;--line:#ded6c5;--yellow:#ffca32;--yellow-deep:#e4a900;--teal:#0f766e;--teal-soft:#dff3ef;--red:#b42318;--serif:"Noto Serif SC","Songti SC",Georgia,serif;--sans:"Noto Sans SC","PingFang SC",system-ui,sans-serif}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--cream);color:var(--ink);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased}.brandbar{position:sticky;top:0;z-index:30;background:rgba(251,248,238,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.brandbar-in{height:62px;max-width:760px;margin:auto;padding:0 17px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.02em}.brand img{width:27px;height:27px;object-fit:contain}.brand span{font-size:16px}.brand small{color:var(--muted);font-weight:600}.page-step{font-size:12px;font-weight:800;background:var(--ink);color:#fff;border-radius:999px;padding:6px 10px}main{max-width:760px;margin:auto;padding:18px 14px 64px}.hero{background:var(--paper);border:2px solid var(--ink);border-radius:22px;padding:24px 20px 22px;box-shadow:7px 7px 0 var(--yellow);position:relative;overflow:hidden}.hero:before{content:"AI";position:absolute;right:-11px;top:-28px;font-family:Georgia,serif;font-size:118px;font-weight:900;line-height:1;color:rgba(20,17,15,.045);pointer-events:none}.hero>*{position:relative}.tag{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:#fff;font-size:11px;font-weight:800;letter-spacing:.08em;padding:7px 12px;border-radius:999px}.tag:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--yellow)}.hero h1{font-family:var(--serif);font-size:clamp(26px,7vw,45px);line-height:1.25;letter-spacing:-.025em;margin:18px 0 12px;max-width:620px}.hero h1 mark{color:inherit;background:linear-gradient(transparent 65%,var(--yellow) 65%);padding:0 2px}.hero p{margin:0;color:var(--ink2);font-size:14px;line-height:1.8;max-width:610px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.meta span{font-size:12px;font-weight:700;border-top:1px solid var(--line);padding-top:9px;color:var(--muted)}.meta span:last-child{display:none}.form-intro{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:25px 3px 12px}.form-intro strong{font-family:var(--serif);font-size:19px}.form-intro span{font-size:12px;color:var(--muted)}form{margin-top:0}.optional-name{margin:0 0 28px;background:#fff6cc;border:1px solid #dec55e;border-radius:16px;padding:16px}.optional-name label{font-weight:900;display:block;margin-bottom:8px}.optional-name small{display:block;color:#726638;margin-top:7px;font-size:12px}.section-title{margin:38px 2px 14px;padding-top:4px;display:grid;grid-template-columns:auto 1fr;column-gap:11px;align-items:center}.section-title:before{content:"";width:7px;height:32px;background:var(--yellow);border:1px solid var(--ink)}.section-title b{font-family:var(--serif);font-size:21px;line-height:1.2}.section-title p{grid-column:2;margin:3px 0 0;color:var(--muted);font-size:12px}fieldset{min-width:0;border:1px solid var(--line);border-radius:17px;background:var(--paper);padding:17px 15px 16px;margin:0 0 12px;box-shadow:0 3px 0 rgba(20,17,15,.04)}legend{display:flex;align-items:flex-start;gap:10px;width:100%;font-weight:800;font-size:15px;line-height:1.5;padding:0 0 14px}.number{display:grid;place-items:center;min-width:29px;height:29px;background:var(--yellow);color:var(--ink);border:1px solid var(--ink);border-radius:50%;font-family:Georgia,serif;font-size:14px;font-weight:900}legend small{display:inline-block;margin-left:7px;color:var(--muted);font-weight:600;font-size:11px;background:var(--cream-deep);padding:2px 6px;border-radius:999px}.options,.checks{display:grid;gap:8px}.option,.checks label{display:flex;align-items:center;gap:10px;border:1px solid var(--line);background:#fff;padding:12px 12px;border-radius:12px;cursor:pointer;transition:.15s;min-height:48px;font-size:14px}.option:has(input:checked),.checks label:has(input:checked){border-color:var(--ink);background:var(--yellow);box-shadow:3px 3px 0 var(--ink);font-weight:800;transform:translate(-1px,-1px)}input[type=radio],input[type=checkbox]{accent-color:var(--ink);width:18px;height:18px;flex:none}.scale-labels{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin:0 2px 8px}.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.scale label{cursor:pointer}.scale input{position:absolute;opacity:0}.scale span{display:grid;place-items:center;height:47px;border:1px solid var(--line);border-radius:10px;background:#fff;font-family:Georgia,serif;font-size:17px;font-weight:900;transition:.15s}.scale input:checked+span{background:var(--ink);border-color:var(--ink);color:var(--yellow);box-shadow:0 4px 0 var(--yellow-deep);transform:translateY(-2px)}.text-input,textarea{width:100%;border:1px solid var(--line);border-radius:12px;padding:13px 14px;font:inherit;font-size:14px;color:var(--ink);background:#fff;outline:none}.text-input:focus,textarea:focus{border-color:var(--ink);box-shadow:0 0 0 3px rgba(255,202,50,.45)}textarea{min-height:105px;resize:vertical}.honeypot{position:absolute;left:-9999px}.submit-card{background:var(--ink);color:#fff;border-radius:20px;padding:18px;margin-top:24px;border:2px solid var(--ink);box-shadow:7px 7px 0 var(--yellow)}.submit{width:100%;border:2px solid var(--yellow);border-radius:999px;background:var(--yellow);color:var(--ink);padding:15px 20px;font-size:16px;font-weight:900;cursor:pointer}.submit:active{transform:translateY(1px)}.submit:disabled{opacity:.65;cursor:wait}.privacy{font-size:11px;color:#d2cdc3;text-align:center;margin:11px 3px 0}.message{display:none;border-radius:12px;padding:12px;margin-bottom:12px;font-weight:700;font-size:13px}.message.error{display:block;background:#fff0ef;color:var(--red)}.success{display:none;background:var(--paper);border:2px solid var(--ink);border-radius:22px;padding:34px 22px;text-align:center;margin-top:20px;box-shadow:7px 7px 0 var(--yellow)}.success.show{display:block}.success .tick{margin:auto;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:var(--yellow);border:2px solid var(--ink);color:var(--ink);font-size:28px;font-weight:900}.success h2{font-family:var(--serif);margin:15px 0 7px}.success p{color:var(--muted)}.success small{display:block;margin-top:12px;font-family:ui-monospace,monospace}.survey-footer{text-align:center;color:var(--muted);font-size:11px;padding:34px 0 0}.survey-footer b{color:var(--ink)}@media(min-width:620px){main{padding:30px 20px 80px}.hero{padding:32px}.hero p{font-size:15px}.meta{display:flex;gap:18px}.meta span:last-child{display:block}.options,.checks{grid-template-columns:repeat(2,1fr)}fieldset{padding:21px}.brandbar-in{padding-inline:20px}}
  </style></head><body><header class="brandbar"><div class="brandbar-in"><div class="brand"><img src="/assets/logos/aligor-logo-transparent.png" alt="阿理哥"><span>阿理哥 <small>· Aligor</small></span></div><span class="page-step">课程反馈</span></div></header><main><section class="hero"><span class="tag">COURSE FEEDBACK · 约2分钟</span><h1>AI Agent一天实战课程<br><mark>学员反馈调查</mark></h1><p><strong>${studentName}，你好。</strong> 感谢你参加今天的课程。请根据真实感受填写，所有意见都会帮助我们改进下一次课程。大约需要2分钟完成。</p><div class="meta"><span>2026年10月18日</span><span>Aligor AI Agent – Cohort 01</span><span>手机优先设计</span></div></section><div class="form-intro"><strong>你的真实意见很重要</strong><span>共18题</span></div>
  <form id="survey" action="/api/survey" method="post" novalidate><input class="honeypot" name="website" tabindex="-1" autocomplete="off">
  <div class="section-title"><b>一、整体感受</b><p>先告诉我们今天整体学得怎么样。</p></div>
  ${q(1,'今天的课程，你认为自己有学到实用的东西吗？',score('practical_learning','1 完全没有','5 学到很多'))}
  ${q(2,'你对今天课程的整体满意度是多少？',score('overall_satisfaction','1 非常不满意','5 非常满意'))}
  ${q(3,'上完课程后，你对使用AI Agent有信心吗？',score('ai_agent_confidence','1 完全没有信心','5 非常有信心'))}
  <div class="section-title"><b>二、时间与内容</b><p>这些答案会帮助我们调整课程节奏。</p></div>
  ${q(4,'你觉得今天的课程时间怎么样？',options('course_length',[['too_short','太短'],['slightly_short','有点短'],['just_right','刚刚好'],['slightly_long','有点长'],['too_long','太长']]))}
  ${q(5,'你觉得老师的讲课速度怎么样？',options('teaching_speed',[['too_slow','太慢'],['slightly_slow','有点慢'],['just_right','刚刚好'],['slightly_fast','有点快'],['too_fast','太快']]))}
  ${q(6,'你觉得课程有没有讲太多不必要的内容？',score('unnecessary_content','1 完全没有','5 非常多'))}
  ${q(7,'你觉得课堂上的例子数量怎么样？',options('example_amount',[['too_few','太少'],['slightly_few','有点少'],['just_right','刚刚好'],['slightly_many','有点多'],['too_many','太多']]))}
  ${q(8,'你觉得实际操作的时间够吗？',score('hands_on_time','1 完全不够','5 非常充足'))}
  ${q(9,'老师的讲解是否清楚、容易跟上？',score('explanation_clarity','1 很难理解','5 非常清楚'))}
  <div class="section-title"><b>三、课程内容</b><p>可选择一个或多个答案。</p></div>
  ${q(10,'今天哪一个部分对你最有帮助？',checks('helpful_parts',[['install_setup','安装及设置AI Agent'],['company_context','让AI Agent了解自己和公司'],['telegram','使用Telegram控制AI Agent'],['whatsapp','建立WhatsApp AI客服'],['automation','建立自动化工作流程'],['website','制作Landing Page／网站'],['github_cloudflare','GitHub及Cloudflare'],['other','其他']]))}
  ${q(11,'今天哪一个部分最难理解或最难操作？',checks('difficult_parts',[['install_setup','安装及电脑设置'],['agent_usage','AI Agent操作'],['telegram','Telegram连接'],['whatsapp','WhatsApp AI客服设置'],['github_cloudflare','GitHub及Cloudflare'],['prompting','Prompt的使用方法'],['none','没有，整体都能跟上'],['other','其他']]))}
  ${q(12,'你觉得哪一个部分可以减少或不用讲？','<textarea name="reduce_topics" maxlength="800" placeholder="如果没有，可以留空"></textarea>',true)}
  <div class="section-title"><b>四、应用与推荐</b><p>我们想知道课程能否真正帮到你的工作或生意。</p></div>
  ${q(13,'今天学到的内容，可以应用在自己的工作或生意上吗？',score('work_applicability','1 完全不能','5 一定可以'))}
  ${q(14,'课程结束后，你最想先用AI Agent完成什么工作？','<textarea name="first_use" maxlength="800" placeholder="例如：回复顾客、做报告、整理资料……"></textarea>',true)}
  ${q(15,'你会推荐这堂课程给朋友或同事吗？',score('recommend_score','1 不会推荐','5 一定会推荐'))}
  <div class="section-title"><b>五、改进建议</b><p>最后几题，帮助我们把下一堂课做得更好。</p></div>
  ${q(16,'如果课程只能改进一个地方，你希望改进什么？','<textarea name="improvement" maxlength="800" placeholder="请写下最重要的一点"></textarea>',true)}
  ${q(17,'请用一句话写下你今天上课后的感想。','<textarea name="testimonial" maxlength="800" placeholder="你的真实感想"></textarea>',true)}
  ${q(18,'你是否同意我们将你的课程感想用于宣传？',options('publicity_consent',[['name_and_quote','同意公开姓名和感想'],['anonymous_only','只同意公开感想，不公开姓名'],['no_publicity','不同意用于宣传']]))}
  <div class="submit-card"><div id="message" class="message"></div><button class="submit" type="submit">提交课程反馈</button><p class="privacy">你的答案会安全保存至Aligor的Cloudflare云端数据库。</p></div></form>
  <section id="success" class="success"><div class="tick">✓</div><h2>谢谢你的真实反馈！</h2><p>你的意见已经成功保存，会帮助我们改进下一次课程。</p><small id="submission"></small></section><footer class="survey-footer"><b>阿理哥 · Aligor</b><br>把AI真正用进工作与生意里</footer></main>
  <script>(()=>{const form=document.querySelector('#survey'),button=form.querySelector('button'),message=document.querySelector('#message'),success=document.querySelector('#success'),token=new URLSearchParams(location.search).get('t');form.addEventListener('submit',async e=>{e.preventDefault();message.className='message';message.textContent='';if(!form.reportValidity())return;const fd=new FormData(form);const payload=Object.fromEntries(fd);payload.t=token;payload.helpful_parts=fd.getAll('helpful_parts');payload.difficult_parts=fd.getAll('difficult_parts');if(!payload.helpful_parts.length||!payload.difficult_parts.length){message.textContent='请至少选择一个最有帮助及最难的部分。';message.className='message error';return}button.disabled=true;button.textContent='提交中…';try{const r=await fetch('/api/survey',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||'提交失败，请稍后重试。');form.style.display='none';success.classList.add('show');document.querySelector('#submission').textContent='提交编号：'+data.submission_id;window.scrollTo({top:0,behavior:'smooth'})}catch(err){message.textContent=err.message;message.className='message error';button.disabled=false;button.textContent='重新提交课程反馈'}})})();</script></body></html>`;
}
