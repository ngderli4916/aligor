import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../index.js';
import { CLASS_SCHEMA } from '../classreg.js';
import { ONLINE_PATH, ONLINE_API, onlineClassCsv, verifyOnlineClass } from '../online-class.js';

const origin = 'https://aligorvibe.com';
const invite = 'https://us06web.zoom.us/j/12345678901?pwd=test-only';
const time = Date.parse('2026-11-29T08:30:00+08:00');
const request = (phone, source = origin) => new Request(origin + ONLINE_API, { method:'POST', headers:{ 'Content-Type':'application/json', Origin:source,'CF-Connecting-IP':'192.0.2.1' }, body:JSON.stringify({phone}) });
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(()=>sqlite.close());
  for (const sql of CLASS_SCHEMA) sqlite.exec(sql);
  const insert=sqlite.prepare(`INSERT INTO class_registrations (public_order_id,idempotency_key,payment_token_hash,primary_name,primary_phone_normalized,region,session_code,package_code,participant_count,computer_count,second_name,second_phone_normalized,original_amount,discount_amount,final_amount,payment_status,registration_status,created_at,updated_at) VALUES (?,?,?,?,?,'SELANGOR',?, ?,?,1,?,?,100,0,100,?,?,'2026-11-24','2026-11-24')`);
  const pkg = CLASS_SCHEMA[0].match(/package_code TEXT NOT NULL CHECK \(package_code IN \('([^']+)'/)[1];
  const add=(id,phone,opts={})=>insert.run(id,id,id,opts.name||'Student '+id,phone,opts.session||'KL-1129',pkg,opts.second?2:1,opts.second?'Partner':null,opts.second||null,opts.payment||'payment_confirmed',opts.registration||'registered');
  add('T1','601155550001',{second:'601155550002',name:'=1+1'});
  add('T2','601155550003',{session:'JB-1213'});
  add('T3','601155550004',{payment:'payment_submitted'});
  add('T4','601155550005',{registration:'cancelled'});
  add('T5','601155550006',{second:'601155550006'});
  const DB={prepare(sql){const stmt=sqlite.prepare(sql);return{bind(...args){return{all:async()=>({results:stmt.all(...args)}),run:async()=>stmt.run(...args)}}}}};
  return {sqlite,env:{DB,ONLINE_CLASS_LIMIT:{limit:async()=>({success:true})},ONLINE_CLASS_1129_ZOOM_URL:{get:async()=>invite}}};
}

test('page and CSV authorization; no invite embedded in HTML',async t=>{
  const {env}=fixture(t);
  for(const path of [ONLINE_PATH,ONLINE_PATH+'/']){
    const r=await worker.fetch(new Request(origin+path),env); assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'no-store');
    const h=await r.text(); assert.ok(h.includes('8:30 AM')); assert.ok(h.includes('method="post"')); assert.ok(!h.includes(invite));
  }
  const r=await worker.fetch(new Request(origin+'/api/admin/online-class/attendance.csv'),env); assert.equal(r.status,401);
});

test('only the confirmed session roster; records each participant once; report masks formulas',async t=>{
  const {env,sqlite}=fixture(t);
  for(const phone of ['011-5555 0001','+60 11 5555 0001','01155550002']){
    const {status,body}=await verifyOnlineClass(request(phone),env,time); assert.equal(status,200); assert.equal(body.join_url,invite);
  }
  for(const phone of ['01155550003','01155550004','01155550005','01155550006','01155559999']){
    const {status,body}=await verifyOnlineClass(request(phone),env,time); assert.equal(status,404); assert.ok(!('join_url' in body));
  }
  assert.deepEqual(sqlite.prepare('SELECT details FROM class_registration_events ORDER BY id').all().map(r=>r.details),['primary','second']);
  const csv=await onlineClassCsv(env); assert.match(csv,/T1,'=1\+1,2026-11-29T08:30:00\.000\+08:00/); assert.match(csv,/T1,Partner,/); assert.ok(!csv.includes('6011'));
});

test('time window, origins, bad inputs, unavailable secret, and throttling',async t=>{
  const {env,sqlite}=fixture(t); const phone='01155550001';
  assert.equal((await verifyOnlineClass(request(phone),env,Date.parse('2026-11-28T23:59:59+08:00'))).status,403);
  assert.equal((await verifyOnlineClass(request(phone),env,Date.parse('2026-11-30T00:00:00+08:00'))).status,403);
  assert.equal((await verifyOnlineClass(request(phone,'https://other.example'),env,time)).status,400);
  assert.equal((await verifyOnlineClass(request('x'.repeat(800)),env,time)).status,400);
  assert.equal((await verifyOnlineClass(request(phone),{...env,ONLINE_CLASS_1129_ZOOM_URL:{get:async()=>'https://zoom.us.example/j/123'}},time)).status,503);
  assert.equal((await verifyOnlineClass(request(phone),{...env,ONLINE_CLASS_LIMIT:{limit:async()=>({success:false})}},time)).status,429);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM class_registration_events').get().n,0);
});
