// Run from the repo root: node --no-warnings --test worker/test/preview-access.test.js
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

const JOIN_URL = 'https://us06web.zoom.us/j/87094206138?pwd=test-placeholder';
const makeEnv = (extra = {}) => ({
  DB: makeDb(),
  SESSION_SECRET: 'session-secret-for-tests-0123456789',
  ADMIN_PASSWORD: 'x',
  PREVIEW_ACCESS_BATCH: 'PREVIEW-1028',
  PREVIEW_JOIN_URL: JOIN_URL,
  ...extra,
});
const makeCtx = () => ({ promises: [], waitUntil(p) { this.promises.push(p); } });

function addLead(env, { phone = '60167871902', batch = 'PREVIEW-1028', status = 'new', name = 'Test Student' } = {}) {
  const now = new Date().toISOString();
  env.DB.raw.prepare("INSERT INTO leads(public_id,name,phone_e164,batch,course,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(crypto.randomUUID().slice(0, 8), name, phone, batch, '免费 AI Preview', status, now, now);
}

async function call(env, method, path, body, headers = {}) {
  const ctx = makeCtx();
  const res = await worker.fetch(new Request(`https://aligor.test${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, ctx);
  await Promise.all(ctx.promises);
  return res;
}

test('preview access page hides the meeting link until phone verification succeeds', async () => {
  const res = await call(makeEnv(), 'GET', '/preview-live');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.ok(html.includes('输入报名时使用的 WhatsApp 号码'));
  assert.ok(html.includes('/api/preview-access'));
  assert.ok(!html.includes(JOIN_URL));
  assert.ok(!html.includes('87094206138'));
});

test('a phone registered for the current Preview receives the configured join link', async () => {
  const env = makeEnv();
  addLead(env);
  const res = await call(env, 'POST', '/api/preview-access', { phone: '016-787 1902' });
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(out, { ok: true, join_url: JOIN_URL });
  const events = env.DB.raw.prepare("SELECT event_type,actor,details FROM lead_events ORDER BY id").all().map(row => ({ ...row }));
  assert.deepEqual(events, [{ event_type: 'preview_access_granted', actor: 'customer', details: 'batch=PREVIEW-1028' }]);
});

test('wrong phone, another batch, and cancelled registrations are denied without revealing which check failed', async () => {
  const cases = [
    env => addLead(env, { phone: '60111111111' }),
    env => addLead(env, { batch: 'PREVIEW-1104' }),
    env => addLead(env, { status: 'cancelled' }),
  ];
  const bodies = [];
  for (const setup of cases) {
    const env = makeEnv(); setup(env);
    const res = await call(env, 'POST', '/api/preview-access', { phone: '0167871902' });
    assert.equal(res.status, 404);
    bodies.push(await res.text());
  }
  assert.equal(new Set(bodies).size, 1);
  assert.ok(!bodies[0].includes('batch') && !bodies[0].includes('cancelled'));
});

test('invalid phone input is rejected and a missing join-link setting never grants access', async () => {
  const bad = await call(makeEnv(), 'POST', '/api/preview-access', { phone: 'abc' });
  assert.equal(bad.status, 400);
  const env = makeEnv({ PREVIEW_JOIN_URL: '' });
  addLead(env);
  const missing = await call(env, 'POST', '/api/preview-access', { phone: '0167871902' });
  assert.equal(missing.status, 503);
  assert.ok(!(await missing.text()).includes(JOIN_URL));
});

test('admin can identify students who obtained the link and see first, last, and total access', async () => {
  const env = makeEnv();
  addLead(env, { phone: '60167871902', name: 'Came Student' });
  addLead(env, { phone: '60111111111', name: 'Absent Student' });
  await call(env, 'POST', '/api/preview-access', { phone: '0167871902' });
  await call(env, 'POST', '/api/preview-access', { phone: '0167871902' });

  const login = await call(env, 'POST', '/api/admin/login', { password: 'x' });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const granted = await call(env, 'GET', '/api/admin/leads?batch=PREVIEW-1028&access=granted', undefined, { cookie });
  assert.equal(granted.status, 200);
  const grantedRows = (await granted.json()).leads;
  assert.equal(grantedRows.length, 1);
  assert.equal(grantedRows[0].name, 'Came Student');
  assert.equal(grantedRows[0].preview_access_count, 2);
  assert.ok(grantedRows[0].preview_first_access_at);
  assert.ok(grantedRows[0].preview_last_access_at);

  const missing = await call(env, 'GET', '/api/admin/leads?batch=PREVIEW-1028&access=missing', undefined, { cookie });
  assert.equal(missing.status, 200);
  const missingRows = (await missing.json()).leads;
  assert.equal(missingRows.length, 1);
  assert.equal(missingRows[0].name, 'Absent Student');
  assert.equal(missingRows[0].preview_access_count, 0);

  const page = await call(env, 'GET', '/4916', undefined, { cookie });
  const html = await page.text();
  assert.ok(html.includes('已领取链接'));
  assert.ok(html.includes('首次领取时间'));
});
