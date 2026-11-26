import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { CHECKIN_EVENT, workshopCheckin, checkinDigest } from '../workshop-checkin.js';
import { TEAM_DASHBOARD_PATH, teamDashboardRoute } from '../team-dashboard.js';
import { AI_AGENT_BATCH } from '../notify.js';

const now=Date.parse('2026-11-26T12:00:00+08:00');
const qkey='synthetic_qr_key_1234567890abcdef123456789';
const tkey='synthetic_team_key_1234567890abcdef123456';
const origin='https://example.test';

test('workshop checkout: auth, attendance, duplicate, cancelled, walk-in over cap and protected list', async()=>{
  const sqlite=new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  const seed=(phone,batch=AI_AGENT_BATCH,status='new')=>sqlite.prepare(`INSERT INTO leads(public_id,name,company,phone_e164,batch,source,status,created_at,updated_at) VALUES(?,?,?,?,?,'ai-agent-registration',?,?,?)`).run(crypto.randomUUID(),'Test Learner','Private Co',phone,batch,status,new Date(now).toISOString(),new Date(now).toISOString());
  for(let i=0;i<20;i++)seed('6012345'+String(i).padStart(4,'0'));
  seed('60123456666','OTHER');seed('60123457777',AI_AGENT_BATCH,'cancelled');
  const DB={prepare(sql){const st=sqlite.prepare(sql);return {bind(...args){return {first:async()=>st.get(...args)??null,all:async()=>({results:st.all(...args)}),sync:()=>({results:st.all(...args)})}}}},async batch(items){sqlite.exec('BEGIN IMMEDIATE');try{const r=items.map(x=>x.sync());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const env={DB,WORKSHOP_CHECKIN_KEY_SHA256:await checkinDigest(qkey),TEAM_DASHBOARD_LINK_KEY:tkey};
  const send=async (data,key=qkey,t=now)=>workshopCheckin(new Request(origin+'/api/workshop-checkin',{method:'POST',headers:{origin,'content-type':'application/json','x-workshop-key':key},body:JSON.stringify(data)}),env,t);
  assert.equal((await send({action:'checkin',phone:'0123450000'},tkey)).status,403);
  const existing={action:'checkin',phone:'012-345 0000'};
  const body=await (await send(existing)).json();assert.equal(body.state,'checked_in');assert.ok(!JSON.stringify(body).includes('Private Co')&&!JSON.stringify(body).includes('Test Learner'));
  assert.equal((await send(existing)).status,200);
  assert.equal((await send({action:'checkin',phone:'0123457777'})).status,409);
  assert.equal((await (await send({action:'checkin',phone:'0123456666'})).json()).state,'walkin_required');
  const walker={action:'walkin',phone:'0123459999',name:'Walk-in',company:'Walk-in Co'};
  assert.equal((await send(walker)).status,201);assert.equal((await send(walker)).status,200);
  assert.equal((await send(existing,qkey,Date.parse('2026-11-26T17:00:00+08:00'))).status,410);
  const path=origin+TEAM_DASHBOARD_PATH+'/api/attendance';
  assert.equal((await teamDashboardRoute(new Request(path),env)).status,401);
  const detail=await(await teamDashboardRoute(new Request(path,{headers:{'x-team-link-key':tkey}}),env)).json();
  assert.equal(detail.total,21);assert.equal(detail.registrations.filter(r=>r.checked_at_myt).length,2);assert.equal(detail.registrations.find(r=>r.walkin).company,'Walk-in Co');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM lead_events WHERE event_type=?').get(CHECKIN_EVENT).n,2); sqlite.close();
});
