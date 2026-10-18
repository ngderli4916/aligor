import { cleanText } from './lib.js';

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

export async function saveSurvey(env, data = {}) {
  const key = cleanText(data.idempotency_key, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) return { status: 400, body: { ok: false, error: '提交资料无效，请刷新页面后重试。' } };
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
    submissionId, key, cleanText(data.student_name, 80), COURSE_DATE, COHORT,
    Number(data.practical_learning), Number(data.overall_satisfaction), Number(data.ai_agent_confidence), String(data.course_length), String(data.teaching_speed), Number(data.unnecessary_content), String(data.example_amount), Number(data.hands_on_time), Number(data.explanation_clarity),
    JSON.stringify(helpful), JSON.stringify(difficult), cleanText(data.reduce_topics, 800), Number(data.work_applicability), cleanText(data.first_use, 800), Number(data.recommend_score), cleanText(data.improvement, 800), cleanText(data.testimonial, 800), String(data.publicity_consent), createdAt
  ).run();
  return { status: 201, body: { ok: true, submission_id: submissionId } };
}

const options = (name, values) => `<div class="options">${values.map(([value, label]) => `<label class="option"><input type="radio" name="${name}" value="${value}" required><span>${label}</span></label>`).join('')}</div>`;
const score = (name, low, high) => `<div class="scale-labels"><span>${low}</span><span>${high}</span></div><div class="scale">${[1,2,3,4,5].map(n => `<label><input type="radio" name="${name}" value="${n}" required><span>${n}</span></label>`).join('')}</div>`;
const checks = (name, values) => `<div class="checks">${values.map(([value, label]) => `<label><input type="checkbox" name="${name}" value="${value}"><span>${label}</span></label>`).join('')}</div>`;
const q = (number, title, body, optional = false) => `<fieldset><legend><span class="number">${number}</span><span>${title}${optional ? '<small>选填</small>' : ''}</span></legend>${body}</fieldset>`;

export function surveyPage() {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>AI Agent一天实战课程｜学员反馈调查</title><style>
  :root{--ink:#172033;--muted:#667085;--paper:#fff;--bg:#f5f3ff;--purple:#6d3ce8;--purple-dark:#4b25b8;--line:#ded8f5;--yellow:#ffd84d;--green:#16794b;--red:#b42318}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,"Noto Sans SC","PingFang SC",system-ui,sans-serif;line-height:1.55}.top{height:8px;background:var(--purple)}main{max-width:760px;margin:auto;padding:22px 16px 64px}.hero{background:var(--ink);color:white;border-radius:24px;padding:28px 24px;box-shadow:0 12px 34px #3c2b7330;position:relative;overflow:hidden}.hero:after{content:"";position:absolute;width:120px;height:120px;border:24px solid var(--yellow);border-radius:50%;right:-55px;top:-48px;z-index:0;pointer-events:none}.hero>*{position:relative;z-index:1}.tag{display:inline-block;background:var(--yellow);color:#332600;font-size:12px;font-weight:900;letter-spacing:.08em;padding:5px 10px;border-radius:999px;text-transform:uppercase}.hero h1{font-size:clamp(26px,7vw,42px);line-height:1.12;margin:15px 0 12px;max-width:610px}.hero p{margin:0;color:#e6e1f8;max-width:610px}.meta{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.meta span{font-size:13px;border:1px solid #ffffff42;padding:6px 10px;border-radius:999px}form{margin-top:18px}.section-title{margin:32px 4px 12px}.section-title b{font-size:21px}.section-title p{margin:3px 0;color:var(--muted);font-size:14px}fieldset{border:1px solid var(--line);border-radius:18px;background:var(--paper);padding:18px;margin:0 0 14px;box-shadow:0 3px 12px #4b25b80b}legend{display:flex;align-items:flex-start;gap:10px;width:100%;font-weight:800;padding:0 0 13px}.number{display:grid;place-items:center;min-width:28px;height:28px;background:#ede9fe;color:var(--purple-dark);border-radius:9px;font-size:13px}legend small{margin-left:8px;color:var(--muted);font-weight:600;font-size:12px}.options,.checks{display:grid;gap:9px}.option,.checks label{display:flex;align-items:center;gap:10px;border:1px solid #e5e2ef;padding:12px 13px;border-radius:12px;cursor:pointer;transition:.15s}.option:has(input:checked),.checks label:has(input:checked){border-color:var(--purple);background:#f0ebff;box-shadow:0 0 0 1px var(--purple)}input[type=radio],input[type=checkbox]{accent-color:var(--purple);width:18px;height:18px;flex:none}.scale-labels{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin:0 3px 7px}.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.scale label{cursor:pointer}.scale input{position:absolute;opacity:0}.scale span{display:grid;place-items:center;height:46px;border:1px solid #ddd8ed;border-radius:11px;font-weight:800}.scale input:checked+span{background:var(--purple);border-color:var(--purple);color:#fff}.text-input,textarea{width:100%;border:1px solid #d8d3e8;border-radius:12px;padding:13px 14px;font:inherit;color:var(--ink);background:#fff;outline:none}.text-input:focus,textarea:focus{border-color:var(--purple);box-shadow:0 0 0 3px #6d3ce81c}textarea{min-height:100px;resize:vertical}.optional-name{margin:18px 0;background:#fff9da;border:1px solid #f0d967;border-radius:16px;padding:16px}.optional-name label{font-weight:800;display:block;margin-bottom:8px}.optional-name small{display:block;color:#6e633a;margin-top:7px}.honeypot{position:absolute;left:-9999px}.submit-card{background:white;border:1px solid var(--line);border-radius:20px;padding:18px;margin-top:20px}.submit{width:100%;border:0;border-radius:14px;background:var(--purple);color:white;padding:15px 20px;font-size:17px;font-weight:900;cursor:pointer;box-shadow:0 8px 18px #6d3ce83d}.submit:hover{background:var(--purple-dark)}.submit:disabled{opacity:.6;cursor:wait}.privacy{font-size:12px;color:var(--muted);text-align:center;margin:11px 0 0}.message{display:none;border-radius:14px;padding:14px;margin-bottom:14px;font-weight:700}.message.error{display:block;background:#fff0ef;color:var(--red)}.success{display:none;background:white;border:1px solid #b7e2ca;border-radius:22px;padding:30px 22px;text-align:center;margin-top:18px}.success.show{display:block}.success .tick{margin:auto;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#dcfce7;color:var(--green);font-size:28px;font-weight:900}.success h2{margin:14px 0 6px}.success p{color:var(--muted)}@media(min-width:620px){.options{grid-template-columns:repeat(2,1fr)}.checks{grid-template-columns:repeat(2,1fr)}fieldset{padding:22px}.hero{padding:34px}}
  </style></head><body><div class="top"></div><main><section class="hero"><span class="tag">课程反馈 · 约2分钟</span><h1>AI Agent一天实战课程<br>学员反馈调查</h1><p>感谢你参加今天的课程。请根据真实感受填写，所有意见都会帮助我们改进下一次课程。大约需要2分钟完成。</p><div class="meta"><span>2026年10月18日</span><span>Aligor AI Agent – Cohort 01</span><span>手机友好</span></div></section>
  <form id="survey" action="/api/survey" method="post" novalidate><div class="optional-name"><label for="student_name">你的名字 <small>（选填）</small></label><input class="text-input" id="student_name" name="student_name" maxlength="80" placeholder="不填写也可以匿名提交"><small>如选择公开姓名和感想，我们才会连同姓名使用。</small></div><input class="honeypot" name="website" tabindex="-1" autocomplete="off">
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
  <section id="success" class="success"><div class="tick">✓</div><h2>谢谢你的真实反馈！</h2><p>你的意见已经成功保存，会帮助我们改进下一次课程。</p><small id="submission"></small></section></main>
  <script>(()=>{const form=document.querySelector('#survey'),button=form.querySelector('button'),message=document.querySelector('#message'),success=document.querySelector('#success');const key='survey_'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(36).slice(2));form.addEventListener('submit',async e=>{e.preventDefault();message.className='message';message.textContent='';if(!form.reportValidity())return;const fd=new FormData(form);const payload=Object.fromEntries(fd);payload.idempotency_key=key;payload.helpful_parts=fd.getAll('helpful_parts');payload.difficult_parts=fd.getAll('difficult_parts');if(!payload.helpful_parts.length||!payload.difficult_parts.length){message.textContent='请至少选择一个最有帮助及最难的部分。';message.className='message error';return}button.disabled=true;button.textContent='提交中…';try{const r=await fetch('/api/survey',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||'提交失败，请稍后重试。');form.style.display='none';success.classList.add('show');document.querySelector('#submission').textContent='提交编号：'+data.submission_id;window.scrollTo({top:0,behavior:'smooth'})}catch(err){message.textContent=err.message;message.className='message error';button.disabled=false;button.textContent='重新提交课程反馈'}})})();</script></body></html>`;
}
