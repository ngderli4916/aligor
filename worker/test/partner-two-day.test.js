import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { renderPartnerTwoDay, partnerTwoDayState, registerPartnerTwoDay } from '../partner-two-day.js';

const url='https://aligorvibe.com';
const api='/api/2days-botsclass/registrations';
const BEFORE=Date.parse('2026-11-27T23:59:59+08:00');
const AFTER=Date.parse('2026-11-28T00:00:00+08:00');

function setup(extra={}){
  const inserts=[];
  const env={PARTNER_TWO_DAY_OPEN:'1',PARTNER_TWO_DAY_PAYMENT_OPEN:'1',PARTNER_TWO_DAY_FEE_1:'3000',PARTNER_TWO_DAY_FEE_2:'3000',
    get DB(){throw new Error('existing CRM must not be accessed');},
    PARTNER_TWO_DAY_DB:{prepare(sql){return {bind(...params){return {
      async first(){assert.match(sql,/^SELECT reference,contact_name,contact_phone,seats,amount_rm,created_at/);const r=inserts.find(p=>p[0]===params[0]);return r?{reference:r[0],contact_name:r[1],contact_phone:r[2],seats:r[3],amount_rm:r[8],created_at:r[9]}:null;},
      async run(){assert.match(sql,/^INSERT INTO signups/);assert.match(sql,/ON CONFLICT\(contact_phone\) DO NOTHING/);if(inserts.some(p=>p[2]===params[2]))return {success:true,meta:{changes:0}};inserts.push(params);return {success:true,meta:{changes:1}};}};}};}},
    ...extra};
  return {env,inserts};
}
const payload={name:'Test Only',phone:'0100000148',seats:2,companyInvoice:true,companyName:'Test Company',expectedAmount:3000};
const post=(env,body,now=BEFORE,origin=url)=>registerPartnerTwoDay(new Request(url+api,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),env,now);

test('two seats (buy one get one) stores pending_payment at RM3,000 and returns payment info with WhatsApp number',async()=>{
  const {env,inserts}=setup();const r=await post(env,payload);const a=await r.json();
  assert.equal(r.status,200);assert.equal(a.status,'pending_payment');assert.equal(a.amount,3000);assert.equal(a.seats,2);assert.equal(a.whatsapp,'60167871902');assert.match(a.reference,/^2D-[A-Z2-9]{6}$/);
  assert.deepEqual(inserts[0].slice(1,10),['Test Only','60100000148',2,null,1,'Test Company',null,3000,BEFORE&&inserts[0][9]]);
});
test('one seat drops second name and unselected billing data',async()=>{
  const {env,inserts}=setup();const r=await post(env,{...payload,seats:1,secondName:'Ignored',companyInvoice:false,companyAddress:'x'});
  assert.equal(r.status,200);assert.deepEqual(inserts[0].slice(3,9),[1,null,0,null,null,3000]);
});
test('same phone again does not disclose the first booking or create a new row',async()=>{
  const {env,inserts}=setup();const first=await (await post(env,payload)).json();const again=await (await post(env,{...payload,seats:1,expectedAmount:3000})).json();
  assert.ok(first.reference);assert.equal(again.ok,false);assert.equal(again.reference,undefined);assert.equal(again.seats,undefined);assert.match(again.message,/已经报过名/);assert.equal(inserts.length,1);
});
test('no fees or payment switch: page disables 报名 and server refuses',async()=>{
  for(const extra of [{PARTNER_TWO_DAY_FEE_1:undefined},{PARTNER_TWO_DAY_FEE_2:'0'},{PARTNER_TWO_DAY_PAYMENT_OPEN:undefined}]){
    const {env,inserts}=setup(extra);
    const html=renderPartnerTwoDay(partnerTwoDayState(env,BEFORE));
    assert.match(html,/<button type="submit" id="submit" disabled>/);
    assert.equal((await post(env,payload)).status,503);assert.equal(inserts.length,0);
  }
});
test('deadline 2026-11-27 11:59PM +08: server rejects and page shows 报名已截止',async()=>{
  const {env,inserts}=setup();const r=await post(env,payload,AFTER);assert.equal(r.status,410);assert.equal((await r.json()).closed,true);assert.equal(inserts.length,0);
  const page=await worker.fetch(new Request(url+'/2days-botsclass/'),setup({PARTNER_TWO_DAY_DEADLINE:'2020-01-01T00:00:00+08:00'}).env);const html=await page.text();
  assert.match(html,/报名已截止/);assert.doesNotMatch(html,/<form/);assert.doesNotMatch(html,/<dialog/);
});
test('rejects stale amount, invalid fields, cross-origin, oversized body',async()=>{
  const {env,inserts}=setup();
  assert.equal((await post(env,{...payload,expectedAmount:6000})).status,409);
  for(const bad of [{companyName:''},{phone:'not a phone'},{name:''},{seats:21},{companyInvoice:'yes'}])assert.equal((await post(env,{...payload,...bad})).status,422);
  assert.equal((await post(env,payload,BEFORE,'https://example.invalid')).status,403);
  assert.equal((await post(env,{...payload,garbage:'a'.repeat(5000)})).status,413);
  assert.equal(inserts.length,0);
});
test('missing dedicated binding fails closed; old reservation endpoint retired',async()=>{
  const {env}=setup({PARTNER_TWO_DAY_DB:undefined,PARTNER_TWO_DAY_DEADLINE:'2099-01-01T00:00:00Z'});
  const html=await (await worker.fetch(new Request(url+'/2days-botsclass/'),env)).text();assert.match(html,/暂未开放/);assert.doesNotMatch(html,/<form/);
  const old=await worker.fetch(new Request(url+'/api/2days-botsclass/reservations',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:'{}'}),setup().env);
  assert.equal(old.status,410);
});
test('form has no amount tick and no upload; payment panel has bank details and WhatsApp button',()=>{
  const html=renderPartnerTwoDay(partnerTwoDayState(setup().env,BEFORE));
  assert.doesNotMatch(html,/amountConfirmed|type="file"|上传付款凭证/);
  for(const s of ['2026 年 12 月 7–8 日','星期一、二 · 暂定','每天 9AM - 5PM','新山','详细地址待公布','一顿午餐和一次茶点','J & J BUSINESS MANAGEMENT SERVICES','JM0632306-M','Hong Leong Bank','37900006808','RM3,000','买一送一：每 2 位只收 1 位的价钱','超过 20 位请直接 WhatsApp 我们','2026 年 11 月 27 日（星期五）11:59PM','我已付款，WhatsApp 发付款凭证','两天 AI 企业助理课程'])assert.ok(html.includes(s),s);
  assert.doesNotMatch(html,/合作/);
  assert.ok(html.includes("const ref='#'+a.reference"));assert.ok(html.includes("报名编号：'+ref+"));
});


test('real insert triggers Telegram and one reference-only event; duplicates and omitted consent do not',async(t)=>{
  const config={PARTNER_TWO_DAY_NOTIFICATIONS:'1',PARTNER_TWO_DAY_DEADLINE:'2099-01-01T00:00:00Z',TELEGRAM_BOT_TOKEN:'not-a-bot',TELEGRAM_CHAT_ID:'test-adrian',PARTNER_SIGNUP_WEBHOOK_URL:'https://receiver.invalid/webhook/aligor-partner-registration',PARTNER_SIGNUP_WEBHOOK_SECRET:'local-secret'};
  const {env,inserts}=setup(config);
  const caught=[];
  t.mock.method(globalThis,'fetch',async (target,init)=>{caught.push({target,body:JSON.parse(init.body)});assert.equal(inserts.length,1);return Response.json({ok:true});});
  const jobs=[]; const ctx={waitUntil(p){jobs.push(p);}};
  const run=body=>worker.fetch(new Request(url+api,{method:'POST',headers:{origin:url,'content-type':'application/json'},body:JSON.stringify(body)}),env,ctx);
  assert.equal((await run(payload)).status,422);assert.equal(inserts.length,0);
  const r=await run({...payload,whatsappConsent:true,name:'Test <b>Not HTML</b>'});assert.equal(r.status,200);const a=await r.json();await Promise.all(jobs);
  assert.equal(caught.length,2);const tg=caught.find(v=>v.target.startsWith('https://api.telegram.org/'));assert.equal(tg.body.chat_id,'test-adrian');assert.match(tg.body.text,/Test &lt;b&gt;Not HTML&lt;\/b&gt;/);assert.match(tg.body.text,/待付款/);assert.ok(tg.body.text.includes(`报名编号：#${a.reference}`));
  assert.deepEqual(caught.find(v=>v.target.startsWith('https://receiver.invalid/')).body,{event:'aligor.two-day-registration.created',reference:a.reference});
  assert.equal((await run({...payload,phone:'+60 10-000 0148',whatsappConsent:true})).status,409);assert.equal(caught.length,2);
  const form=renderPartnerTwoDay(partnerTwoDayState(env,BEFORE));assert.match(form,/同意通过 WhatsApp/);assert.doesNotMatch(form,/0175659153|60175659153/);
});

test('notification lookup is bearer-gated, isolated and uses the exact course payment record',async()=>{
  const secret='local-secret';const {env}=setup({PARTNER_TWO_DAY_NOTIFICATIONS:'1',PARTNER_SIGNUP_WEBHOOK_SECRET:secret});
  const first=await (await post(env,{...payload,whatsappConsent:true})).json();
  const lookup=(reference,token)=>worker.fetch(new Request(url+'/api/internal/2days-botsclass/notice',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({reference})}),env);
  assert.equal((await lookup(first.reference,'wrong')).status,401);
  assert.equal((await lookup('2D-000000',secret)).status,400);
  const r=await lookup(first.reference,secret); assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store'); const data=await r.json();
  assert.equal(data.phone,'60100000148');assert.match(data.customer,/Hong Leong Bank.*\n户名：J & J BUSINESS MANAGEMENT SERVICES\n户口号码：37900006808/);
  assert.match(data.customer,/12 月 7–8 日（暂定）/);assert.match(data.customer,/应付金额：RM3,000/);assert.match(data.customer,/核对款项后会确认名额/);
  for(const channel of [data.customer,data.partner])assert.ok(channel.includes(`报名编号：#${first.reference}`));
  assert.ok(data.customer.includes(`转账备注请写 #${first.reference}`));
  assert.match(data.partner,/2 位/);assert.doesNotMatch(data.partner,/60100000148|37900006808|Test Company/);
  env.PARTNER_TWO_DAY_TEST_MODE='1';assert.equal((await lookup(first.reference,secret)).status,404);
});

test('more seats: price = pairs at two-seat fee + leftover single (4→RM6,000, 5→RM9,000, 20→RM30,000)',async()=>{
  for(const [n,amt] of [[3,6000],[4,6000],[5,9000],[6,9000],[20,30000]]){
    const {env,inserts}=setup();const r=await post(env,{...payload,phone:'01000001'+String(n).padStart(2,'0'),seats:n,otherNames:'A\nB',expectedAmount:amt});const a=await r.json();
    assert.equal(r.status,200,String(n));assert.equal(a.amount,amt);assert.equal(a.seats,n);assert.equal(inserts[0][3],n);assert.equal(inserts[0][4],'A B');assert.equal(inserts[0][8],amt);
  }
  const {env}=setup();assert.equal((await post(env,{...payload,seats:4,expectedAmount:12000})).status,409);
  for(const bad of [0,21,2.5,'4'])assert.equal((await post(env,{...payload,seats:bad})).status,422,String(bad));
});
