import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { renderPartnerTwoDay, partnerTwoDayState, registerPartnerTwoDay } from '../partner-two-day.js';

const url='https://aligorvibe.com';
const api='/api/2days-botsclass/registrations';
const BEFORE=Date.parse('2026-11-27T16:59:59+08:00');
const AFTER=Date.parse('2026-11-27T17:00:00+08:00');
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0,0,0,0]);

function setup(extra={}){
  const inserts=[], puts=[], deletes=[];
  const env={PARTNER_TWO_DAY_OPEN:'1',PARTNER_TWO_DAY_PAYMENT_OPEN:'1',PARTNER_TWO_DAY_FEE_1:'1111',PARTNER_TWO_DAY_FEE_2:'2222',
    get DB(){throw new Error('existing CRM must not be accessed');},
    PARTNER_TWO_DAY_DB:{prepare(sql){return {bind(...params){return {
      async first(){assert.match(sql,/^SELECT 1 FROM registrations/);return inserts.some(p=>p[2]===params[0])?{1:1}:null;},
      async run(){assert.match(sql,/^INSERT INTO registrations/);inserts.push(params);return {success:true};}};}};}},
    PARTNER_TWO_DAY_PROOFS:{async put(k,v,o){puts.push({k,v,o});},async delete(k){deletes.push(k);}},
    ...extra};
  return {env,inserts,puts,deletes};
}
function form(over={}){
  const f=new FormData();
  const base={name:'Test Only',phone:'0100000148',seats:'2',companyInvoice:'on',companyName:'Test Company',amountConfirmed:'on',expectedAmount:'2222',...over};
  for(const [k,v] of Object.entries(base)) if(v!=null) f.set(k,v);
  if(over.proof!==null) f.set('proof',over.proof||new File([PNG],'proof.png',{type:'image/png'}));
  return f;
}
async function post(env,fd,now=BEFORE,origin=url){
  const body=new Request(url+api,{method:'POST',body:fd});
  const buf=await body.arrayBuffer();
  const req=new Request(url+api,{method:'POST',headers:{origin,'content-type':body.headers.get('content-type'),'content-length':String(buf.byteLength)},body:buf});
  return registerPartnerTwoDay(req,env,now);
}

test('two-seat sign-up stores pending_verification with server-computed amount and private proof key',async()=>{
  const {env,inserts,puts}=setup();const r=await post(env,form());const a=await r.json();
  assert.equal(r.status,200);assert.equal(a.status,'pending_verification');assert.match(a.message,/待核实/);assert.doesNotMatch(a.message,/已付款|名额已确认/);
  assert.equal(inserts[0][3],2);assert.equal(inserts[0][8],2222);assert.match(inserts[0][9],/^proofs\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.png$/);
  assert.equal(puts.length,1);assert.equal(puts[0].k,inserts[0][9]);
});
test('one seat uses the one-person fee and drops second name / unselected billing data',async()=>{
  const {env,inserts}=setup();const r=await post(env,form({seats:'1',expectedAmount:'1111',secondName:'Ignored',companyInvoice:null,companyName:null,companyAddress:'x'}));
  assert.equal(r.status,200);assert.deepEqual(inserts[0].slice(3,9),[1,null,0,null,null,1111]);
});
test('no fees configured: page says 费用待确认 and submit is disabled; server refuses',async()=>{
  for(const extra of [{PARTNER_TWO_DAY_FEE_1:undefined,PARTNER_TWO_DAY_FEE_2:undefined},{PARTNER_TWO_DAY_FEE_2:'0'},{PARTNER_TWO_DAY_FEE_1:'3,000'}]){
    const {env,inserts,puts}=setup(extra);
    const html=renderPartnerTwoDay(partnerTwoDayState(env,BEFORE));
    assert.match(html,/费用待确认/);assert.doesNotMatch(html,/RM3,000|RM0\b/);assert.match(html,/<button type="submit" id="submit" disabled>/);assert.match(html,/id="proof"[^>]* disabled/);
    const r=await post(env,form());assert.equal(r.status,503);assert.equal(inserts.length+puts.length,0);
  }
});
test('payment switch, proof bucket and both fees are all required to accept payment',async()=>{
  for(const extra of [{PARTNER_TWO_DAY_PAYMENT_OPEN:undefined},{PARTNER_TWO_DAY_PROOFS:undefined}]){
    const {env,inserts}=setup(extra);assert.equal((await post(env,form())).status,503);assert.equal(inserts.length,0);
  }
});
test('deadline 2026-11-27 5PM +08: server rejects and page shows 报名已截止',async()=>{
  const {env,inserts,puts}=setup();const r=await post(env,form(),AFTER);assert.equal(r.status,410);assert.equal((await r.json()).closed,true);assert.equal(inserts.length+puts.length,0);
  const page=await worker.fetch(new Request(url+'/2days-botsclass/'),setup({PARTNER_TWO_DAY_DEADLINE:'2020-01-01T00:00:00+08:00'}).env);const html=await page.text();
  assert.match(html,/报名已截止/);assert.doesNotMatch(html,/<form/);
  assert.equal((await post(env,form(),BEFORE)).status,200);
});
test('rejects bad proof, unconfirmed amount, stale amount, invalid fields, cross-origin, duplicates',async()=>{
  const {env,inserts,puts,deletes}=setup();
  assert.equal((await post(env,form({proof:new File(['<html>'],'x.png',{type:'image/png'})}))).status,422);
  assert.equal((await post(env,form({proof:null}))).status,422);
  assert.equal((await post(env,form({amountConfirmed:null}))).status,422);
  assert.equal((await post(env,form({expectedAmount:'3000'}))).status,409);
  for(const bad of [{companyName:''},{phone:'not a phone'},{name:''},{seats:'3'}])assert.equal((await post(env,form(bad))).status,422);
  assert.equal((await post(env,form(),BEFORE,'https://example.invalid')).status,403);
  assert.equal(inserts.length+puts.length,0);
  assert.equal((await post(env,form())).status,200);assert.equal((await post(env,form())).status,409);assert.equal(puts.length,1);assert.equal(deletes.length,0);
});
test('oversized proof is refused before upload',async()=>{
  const {env,puts}=setup();const big=new Uint8Array(5*1024*1024+1);big.set(PNG);
  assert.equal((await post(env,form({proof:new File([big],'big.png',{type:'image/png'})}))).status,422);const huge=new Uint8Array(6*1024*1024);huge.set(PNG);assert.equal((await post(env,form({proof:new File([huge],'h.png',{type:'image/png'})}))).status,413);assert.equal(puts.length,0);
});
test('missing dedicated binding fails closed even when main CRM is present; old reservation endpoint retired',async()=>{
  const {env,inserts}=setup({PARTNER_TWO_DAY_DB:undefined,PARTNER_TWO_DAY_DEADLINE:'2099-01-01T00:00:00Z'});
  const page=await worker.fetch(new Request(url+'/2days-botsclass/'),env);const html=await page.text();assert.match(html,/暂未开放/);assert.doesNotMatch(html,/<form/);
  const old=await worker.fetch(new Request(url+'/api/2days-botsclass/reservations',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:'{}'}),setup().env);
  assert.equal(old.status,410);assert.equal(inserts.length,0);
});
test('page shows course facts and bank details',()=>{
  const html=renderPartnerTwoDay(partnerTwoDayState(setup().env,BEFORE));
  for(const s of ['2026 年 12 月 7–8 日','星期一、二 · 暂定','每天 9AM - 5PM','新山','详细地址待公布','一顿午餐和一次茶点','J & J BUSINESS MANAGEMENT SERVICES','JM0632306-M','Hong Leong Bank','37900006808','RM1,111','2026 年 11 月 27 日（星期五）5PM'])assert.ok(html.includes(s),s);
});
