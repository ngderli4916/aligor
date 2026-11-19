import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../index.js';
import {buildCustomerMessage} from '../notify.js';

const path='/api/register-ai-agent';
const request=(data,headers={})=>new Request('https://course.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
const valid={name:'Test Student',phone:'012 345 6789',company:'Demo & Co',industry:'Retail',batch:'PREVIEW-1118',source:'wrong'};

test('registration defaults to Chinese, offers English, and stays standalone',async()=>{
  const zh=await (await worker.fetch(new Request('https://course.test/register-ai-agent'),{})).text();
  assert.match(zh,/<html lang="zh-Hans">/);
  assert.match(zh,/<title>AI Agent 课程报名<\/title>/);
  assert.match(zh,/11 月 26 日（星期四）/);
  assert.match(zh,/<button[^>]*>华语<\/button>/);
  assert.match(zh,/<button[^>]*>English<\/button>/);
  for (const label of ['姓名','联系电话','公司名称','行业','提交报名']) assert.ok(zh.includes(label));
  for(const suffix of ['','/']){
    const r=await worker.fetch(new Request('https://course.test/register-ai-agent'+suffix+'?lang=en'),{});
    assert.equal(r.status,200);
    const text=await r.text();
    assert.match(text,/<title>Register for AI Agent<\/title>/);
    assert.doesNotMatch(text,/aligor|阿理哥|阿里哥|preview/i);
    assert.match(text,/Thursday, 26 November 2026/);
    assert.match(text,/12PM - 4PM/);
    assert.match(text,/Taman Impian Emas/);
    for(const [key,label] of Object.entries({name:'Name',phone:'Contact Number',company:'Company Name',industry:'Industry'})) {
      assert.match(text,new RegExp(`<label for="${key}"[^>]*>${label}</label><input[^>]+required>`));
    }
  }
});

test('stores a separate CRM lead, sends one operator notification and keeps Preview intact',async(t)=>{
  const raw=new DatabaseSync(':memory:');t.after(()=>raw.close());
  raw.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
  raw.prepare("INSERT INTO leads(public_id,name,phone_e164,batch,course,created_at,updated_at) VALUES('prev','Existing','60123456789','PREVIEW-1118','Preview','a','a')").run();
  const DB={prepare(sql){return{bind(...args){return{first:async()=>raw.prepare(sql).get(...args)??null,run:async()=>raw.prepare(sql).run(...args)};}};}};
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{calls.push([url,JSON.parse(opts.body)]);return new Response('{}',{status:200});});
  const env={DB,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'test-chat'};
  for(const [data,status,headers] of [[null,400],[{...valid,company:''},400],[{...valid,phone:'abc0123456789'},400],[valid,403,{origin:'https://other.test'}],[{...valid,foo:'x'.repeat(4096)},413],[{...valid,website:'spam'},200]])assert.equal((await worker.fetch(request(data,headers),env)).status,status);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM leads').get().n,1);
  assert.equal(calls.length,0);
  for(const phone of ['012 345 6789','+60 12 345 6789']){
    const jobs=[];
    const r=await worker.fetch(request({...valid,phone}),env,{waitUntil(p){jobs.push(p);}});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});await Promise.all(jobs);
  }
  const rows=raw.prepare('SELECT * FROM leads ORDER BY id').all();
  assert.equal(rows.length,2);assert.equal(rows[0].name,'Existing');
  const lead=rows[1]; assert.equal(lead.batch,'AI-AGENT-REGISTRATION');assert.equal(lead.source,'ai-agent-registration');assert.equal(lead.phone_e164,'60123456789');assert.equal(lead.company,'Demo & Co');assert.equal(lead.industry,'Retail');assert.equal(lead.consent_whatsapp,0);
  assert.equal(calls.length,1);assert.match(calls[0][0],/\/sendMessage$/);assert.equal(calls[0][1].chat_id,'test-chat');assert.match(calls[0][1].text,/AI Agent Course[\s\S]*Test Student[\s\S]*60123456789[\s\S]*Demo &amp; Co[\s\S]*Retail/);assert.doesNotMatch(calls[0][1].text,/Preview/);
  assert.deepEqual(raw.prepare('SELECT event_type FROM lead_events ORDER BY id').all().map(x=>x.event_type),['submitted','telegram_sent']);
  assert.doesNotMatch(buildCustomerMessage(lead,{WHATSAPP_GROUP_URL:'https://chat.whatsapp.com/shouldnotshow'}),/https:\/\//);
});
