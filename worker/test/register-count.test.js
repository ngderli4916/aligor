// Run from the repo root:  node --test worker/test/register-count.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../index.js';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare(sql) {
      let params = [];
      const stmt = {
        bind(...args) { params = args; return stmt; },
        async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: r.changes } }; },
        async first() { return db.prepare(sql).get(...params) ?? null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
      };
      return stmt;
    },
  };
}
const makeEnv = (extra = {}) => ({ DB: makeDb(), SESSION_SECRET: 'session-secret-for-tests-0123456789', ADMIN_PASSWORD: 'x', ...extra });
const makeCtx = () => ({ promises: [], waitUntil(p) { this.promises.push(p); } });
const AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';

function addLead(env, { phone, batch = 'PREVIEW-1007', status = 'new' }) {
  const now = new Date().toISOString();
  env.DB.raw.prepare("INSERT INTO leads(public_id,name,phone_e164,batch,course,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(`P${Math.random().toString(36).slice(2, 8)}`, 'Test', phone, batch, '免费 AI Preview', status, now, now);
}
async function page(env) {
  const ctx = makeCtx();
  const res = await worker.fetch(new Request('https://aligor.aligor.workers.dev/register', { headers: { 'user-agent': AGENT } }), env, ctx);
  await Promise.all(ctx.promises);
  return { status: res.status, html: await res.text() };
}

test('1. no registrations yet: the page shows no count and no "0 人"', async () => {
  const { status, html } = await page(makeEnv());
  assert.equal(status, 200);
  assert.ok(!html.includes('class="proof"') && !html.includes('已有 <b>0'));
});

test('2. the page shows the real number of people who registered', async () => {
  const env = makeEnv();
  addLead(env, { phone: '60111111111' });
  addLead(env, { phone: '60122222222' });
  addLead(env, { phone: '60133333333', batch: 'PREVIEW-1014' });
  const { html } = await page(env);
  assert.ok(html.includes('已有 <b>3</b> 人报名免费 AI Preview'));
  assert.ok(html.includes('const counts={"PREVIEW-1007":2,"PREVIEW-1014":1}'));
});

test('3. one person who joins both sessions is counted once in the total', async () => {
  const env = makeEnv();
  addLead(env, { phone: '60111111111', batch: 'PREVIEW-1007' });
  addLead(env, { phone: '60111111111', batch: 'PREVIEW-1014' });
  const { html } = await page(env);
  assert.ok(html.includes('已有 <b>1</b> 人报名'));
  assert.ok(html.includes('"PREVIEW-1007":1') && html.includes('"PREVIEW-1014":1'));
});

test('4. cancelled sign-ups are not counted', async () => {
  const env = makeEnv();
  addLead(env, { phone: '60111111111' });
  addLead(env, { phone: '60122222222', status: 'cancelled' });
  const { html } = await page(env);
  assert.ok(html.includes('已有 <b>1</b> 人报名'));
});

test('5. a new registration raises the number shown', async () => {
  const env = makeEnv();
  const submit = phone => worker.fetch(new Request('https://aligor.aligor.workers.dev/api/leads', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ali Ahmad', phone, batch: 'PREVIEW-1007', course: '免费 AI Preview', used_ai_agent: '完全没用过', consent: true }),
  }), env, makeCtx());
  assert.equal((await submit('0123456781')).status, 201);
  assert.ok((await page(env)).html.includes('已有 <b>1</b> 人报名'));
  assert.equal((await submit('0123456782')).status, 201);
  assert.ok((await page(env)).html.includes('已有 <b>2</b> 人报名'));
});

test('6. no names or phone numbers are placed on the page', async () => {
  const env = makeEnv();
  addLead(env, { phone: '60199998888' });
  const { html } = await page(env);
  assert.ok(!html.includes('60199998888') && !html.includes('9998888'));
});

test('7. a hostile batch value cannot break out of the script tag', async () => {
  const env = makeEnv();
  addLead(env, { phone: '60111111111', batch: '</script><img src=x onerror=alert(1)>' });
  const { html } = await page(env);
  assert.ok(!html.includes('</script><img'));
  assert.ok(html.includes('\\u003c/script>'));
});

test('8. if the count cannot be read the page still loads, without a count', async () => {
  const env = makeEnv();
  env.DB = { prepare() { throw new Error('D1 unavailable'); } };
  const { status, html } = await page(env);
  assert.equal(status, 200);
  assert.ok(!html.includes('class="proof"'));
  assert.ok(html.includes('提交报名'));
});
