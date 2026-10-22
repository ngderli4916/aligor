// Run from the repo root:  node --test worker/test/meta.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../index.js';
import { adSource, buildLeadEvent } from '../meta.js';

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
const PIXEL = '1697028392130040';
const makeEnv = (extra = {}) => ({ DB: makeDb(), SESSION_SECRET: 'session-secret-for-tests-0123456789', ADMIN_PASSWORD: 'x', META_PIXEL_ID: PIXEL, ...extra });
const makeCtx = () => ({ promises: [], waitUntil(p) { this.promises.push(p); } });
const lead = (body = {}) => ({ name: 'Ali Tan', phone: '0167871902', batch: 'PREVIEW-1028', course: '免费 AI Preview', used_ai_agent: '完全没用过', consent: true, ...body });

function withFetch(fn) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{"events_received":1}', { status: 200 }); };
  return fn(calls).finally(() => { globalThis.fetch = original; });
}
async function submit(env, body, headers = {}) {
  const ctx = makeCtx();
  const res = await worker.fetch(new Request('https://aligor.aligor.workers.dev/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4', 'user-agent': 'UA', ...headers }, body: JSON.stringify(body) }), env, ctx);
  await Promise.all(ctx.promises);
  return { res, out: await res.json() };
}

test('1. register page loads the Pixel and fires Lead with the lead code as eventID', async () => {
  const res = await worker.fetch(new Request('https://aligor.aligor.workers.dev/register'), makeEnv(), makeCtx());
  const html = await res.text();
  assert.ok(html.includes(`fbq('init','${PIXEL}')`));
  assert.ok(html.includes("fbq('track','Lead'") && html.includes('eventID:out.lead_id'));
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp.includes('script-src \'unsafe-inline\' https://connect.facebook.net'));
  assert.ok(csp.includes('connect-src \'self\' https://www.facebook.com'));
});

test('2. no Pixel ID configured: no Pixel code on the page', async () => {
  const html = await (await worker.fetch(new Request('https://aligor.aligor.workers.dev/register'), makeEnv({ META_PIXEL_ID: '' }), makeCtx())).text();
  assert.ok(!html.includes('fbevents.js'));
});

test('3. ad parameters are saved as the lead source', () => {
  assert.equal(adSource({ utm_source: 'facebook', utm_campaign: '120247817933370295', utm_content: '120248000129150295' }), 'fb:120247817933370295:120248000129150295');
  assert.equal(adSource({ fbclid: 'abc' }), 'fb:fbclid');
  assert.equal(adSource({ utm_source: 'google', utm_campaign: 'x' }), 'google:x');
  assert.equal(adSource({}), '');
});

test('4. a sign-up is sent to the Conversions API once, hashed, with the same event_id as the browser', () => withFetch(async calls => {
  const env = makeEnv({ META_CAPI_TOKEN: 'capi-token' });
  const { res, out } = await submit(env, lead({ utm_source: 'facebook', utm_campaign: '111', utm_content: '222', page_url: 'https://aligor.aligor.workers.dev/register?utm_source=facebook' }), { cookie: '_fbp=fb.1.1.99; _fbc=fb.1.1.CLICK' });
  assert.equal(res.status, 201);
  const capi = calls.filter(c => c.url.includes(`/${PIXEL}/events`));
  assert.equal(capi.length, 1);
  const ev = capi[0].body.data[0];
  assert.equal(ev.event_name, 'Lead');
  assert.equal(ev.event_id, out.lead_id);
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.user_data.fbp, 'fb.1.1.99');
  assert.equal(ev.user_data.fbc, 'fb.1.1.CLICK');
  assert.match(ev.user_data.ph[0], /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(ev).includes('0167871902') && !JSON.stringify(ev).includes('60167871902'));
  const row = env.DB.raw.prepare('SELECT source FROM leads').get();
  assert.equal(row.source, 'fb:111:222');
}));

test('5. without a CAPI token nothing is sent, and the sign-up still succeeds', () => withFetch(async calls => {
  const { res } = await submit(makeEnv(), lead());
  assert.equal(res.status, 201);
  assert.equal(calls.filter(c => c.url.includes('graph.facebook.com')).length, 0);
}));

test('6. resubmitting without ad parameters keeps the original Facebook source', () => withFetch(async () => {
  const env = makeEnv();
  await submit(env, lead({ utm_source: 'facebook', utm_campaign: '111', utm_content: '222' }));
  await submit(env, lead());
  assert.equal(env.DB.raw.prepare('SELECT source FROM leads').get().source, 'fb:111:222');
}));

test('7. fbclid without the _fbc cookie becomes an fbc value', async () => {
  const req = new Request('https://aligor.aligor.workers.dev/api/leads', { method: 'POST' });
  const ev = await buildLeadEvent(req, { phone_e164: '60167871902', public_id: 'X', name: 'Ali' }, { eventId: 'AIPR00001', fbclid: 'CLICKID' });
  assert.match(ev.user_data.fbc, /^fb\.1\.\d+\.CLICKID$/);
});
