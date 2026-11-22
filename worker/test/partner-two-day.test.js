import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

const url='https://aligorvibe.com';
const api='/api/2days-botsclass/reservations';
const payload={name:'Test Only',phone:'0100000148',seats:2,companyInvoice:true,companyName:'Test Company'};
function setup(){
  const inserts=[];
  const env={PARTNER_TWO_DAY_OPEN:'1',get DB(){throw new Error('existing CRM must not be accessed');},PARTNER_TWO_DAY_DB:{prepare(sql){assert.match(sql,/^INSERT INTO reservations/);return {bind(...params){return {async run(){inserts.push(params);return {success:true};}};}};}}};
  return {env,inserts};
}
const post=(env,body,origin=url)=>worker.fetch(new Request(url+api,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),env);

test('partner reservation stores two requested seats with optional second name and billing address in isolated binding',async()=>{
  const {env,inserts}=setup(); const r=await post(env,payload);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match((await r.json()).message,/无需付款/);assert.deepEqual(inserts[0].slice(0,7),['Test Only','60100000148',2,null,1,'Test Company',null]);
});
test('unselected phone companions and billing data do not land in local records',async()=>{
  const {env,inserts}=setup(); const r=await post(env,{...payload,seats:1,secondName:'Ignored',companyInvoice:false,companyAddress:'Ignored'});assert.equal(r.status,200);assert.deepEqual(inserts[0].slice(2,7),[1,null,0,null,null]);
});
test('missing dedicated binding fails closed even when main CRM is present',async()=>{
  const {env,inserts}=setup();delete env.PARTNER_TWO_DAY_DB;assert.equal((await post(env,payload)).status,503);assert.equal(inserts.length,0);
  const page=await worker.fetch(new Request(url+'/2days-botsclass/'),env);const html=await page.text();assert.match(html,/暂未开放/);assert.doesNotMatch(html,/<form/);
});
test('server rejects invalid inputs, cross-origin submissions and payload inflation',async()=>{
  const {env,inserts}=setup();assert.equal((await post(env,payload,'https://example.invalid')).status,403);for(const invalid of [{companyName:''},{phone:'not a phone'},{name:''},{seats:3},{companyInvoice:'yes'}])assert.equal((await post(env,{...payload,...invalid})).status,422);
  assert.equal((await post(env,{...payload,garbage:'a'.repeat(5000)})).status,413);assert.equal(inserts.length,0);
});
