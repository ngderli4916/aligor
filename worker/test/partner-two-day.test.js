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
      async first(){assert.match(sql,/^SELECT reference,contact_name,seats,amount_rm FROM signups/);const r=inserts.find(p=>p[2]===params[0]);return r?{reference:r[0],contact_name:r[1],seats:r[3],amount_rm:r[8]}:null;},
      async run(){assert.match(sql,/^INSERT INTO signups/);inserts.push(params);return {success:true};}};}};}},
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
test('same phone again shows the first sign-up payment info without a new row',async()=>{
  const {env,inserts}=setup();const first=await (await post(env,payload)).json();const again=await (await post(env,{...payload,seats:1,expectedAmount:3000})).json();
  assert.equal(again.reference,first.reference);assert.equal(again.seats,2);assert.match(again.message,/已经报过名/);assert.equal(inserts.length,1);
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
  for(const bad of [{companyName:''},{phone:'not a phone'},{name:''},{seats:3},{companyInvoice:'yes'}])assert.equal((await post(env,{...payload,...bad})).status,422);
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
  for(const s of ['2026 年 12 月 7–8 日','星期一、二 · 暂定','每天 9AM - 5PM','新山','详细地址待公布','一顿午餐和一次茶点','J & J BUSINESS MANAGEMENT SERVICES','JM0632306-M','Hong Leong Bank','37900006808','RM3,000','RM6,000','买一送一：第二位学员免费','送一位','2026 年 11 月 27 日（星期五）11:59PM','我已付款，WhatsApp 发付款凭证','两天 AI 企业助理课程'])assert.ok(html.includes(s),s);
  assert.doesNotMatch(html,/合作/);
});
