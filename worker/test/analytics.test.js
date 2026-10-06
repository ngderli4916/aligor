// Run from the repo root:  node --test worker/test/analytics.test.js
// Uses an in-memory SQLite database in place of D1. No network access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../index.js';
import { getStats, malaysiaDay } from '../analytics.js';

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
const makeEnv = () => ({ DB: makeDb(), SESSION_SECRET: 'session-secret-for-tests-0123456789', ADMIN_PASSWORD: 'test-admin-pass' });
const makeCtx = () => ({ promises: [], waitUntil(p) { this.promises.push(p); } });
const MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function track(env, { ip = '1.1.1.1', agent = MOBILE, path = '/', ref = '', cookie } = {}) {
  const ctx = makeCtx();
  const res = await worker.fetch(new Request('https://aligor.aligor.workers.dev/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'user-agent': agent, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ path, ref }),
  }), env, ctx);
  await Promise.all(ctx.promises);
  return res;
}
async function adminCookie(env) {
  const res = await worker.fetch(new Request('https://aligor.aligor.workers.dev/api/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'test-admin-pass' }) }), env, makeCtx());
  return res.headers.get('set-cookie').split(';')[0];
}
// the table is created on the first recorded view, so it may not exist yet
const views = env => { try { return env.DB.raw.prepare('SELECT * FROM page_views ORDER BY id').all(); } catch { return []; } };

test('1. a home visit is counted once per visitor per day, and no raw IP is stored', async () => {
  const env = makeEnv();
  assert.equal((await track(env, { ip: '1.1.1.1' })).status, 204);
  await track(env, { ip: '1.1.1.1' });
  await track(env, { ip: '2.2.2.2', agent: DESKTOP });
  const stats = await getStats(env);
  assert.equal(stats.today_home_visitors, 2);
  assert.equal(stats.total_home_views, 3);
  assert.equal(stats.total_home_visitors, 2);
  const rows = views(env);
  assert.ok(rows.every(r => r.visitor.length === 16 && !JSON.stringify(r).includes('1.1.1.1') && !JSON.stringify(r).includes('2.2.2.2')));
  assert.deepEqual(stats.devices.map(d => d.device).sort(), ['desktop', 'mobile']);
});

test('2. bots and invalid paths are ignored', async () => {
  const env = makeEnv();
  await track(env, { agent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' });
  for (const path of ['/../etc', 'http://evil.example', '', '/' + 'a'.repeat(100), '/Upper?x=1']) await track(env, { ip: '3.3.3.3', path });
  assert.equal(views(env).length, 0);
});

test('3. the logged-in admin is not counted', async () => {
  const env = makeEnv();
  const cookie = await adminCookie(env);
  await track(env, { cookie });
  assert.equal(views(env).length, 0);
  await track(env, {});
  assert.equal(views(env).length, 1);
});

test('4. /register is counted on the server, link-preview fetchers are not', async () => {
  const env = makeEnv();
  const get = async (agent, extra = {}) => {
    const ctx = makeCtx();
    const res = await worker.fetch(new Request('https://aligor.aligor.workers.dev/register', { headers: { 'user-agent': agent, 'cf-connecting-ip': '4.4.4.4', ...extra } }), env, ctx);
    await Promise.all(ctx.promises);
    return res;
  };
  assert.equal((await get(MOBILE, { referer: 'https://aligor.aligor.workers.dev/' })).status, 200);
  await get('WhatsApp/2.23 A');
  await get('Mozilla/5.0 (compatible; facebookexternalhit/1.1)');
  const rows = views(env);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, '/register');
  assert.equal(rows[0].referrer, '', 'same-site referrer is stored as direct');
});

test('5. stats combine visits, clicks, registrations, sources and conversion', async () => {
  const env = makeEnv();
  await track(env, { ip: '1.1.1.1', ref: 'https://www.instagram.com/' });
  await track(env, { ip: '2.2.2.2', ref: 'https://l.facebook.com/l.php?u=x' });
  await track(env, { ip: '3.3.3.3' });
  await track(env, { ip: '3.3.3.3', path: '/click/preview' });
  await track(env, { ip: '3.3.3.3', path: '/register' });
  const now = new Date().toISOString();
  env.DB.raw.prepare("INSERT INTO leads(public_id,name,phone_e164,batch,course,created_at,updated_at) VALUES('A1','Ali','60111111111','B','C',?,?)").run(now, now);
  const stats = await getStats(env);
  assert.equal(stats.total_home_visitors, 3);
  assert.equal(stats.total_clicks, 1);
  assert.equal(stats.total_register_visitors, 1);
  assert.equal(stats.total_leads, 1);
  assert.equal(stats.conversion, 33.3);
  assert.equal(stats.first_day, malaysiaDay());
  assert.deepEqual(stats.sources.map(s => s.source).sort(), ['instagram.com', 'l.facebook.com', '直接访问'].sort());
  assert.deepEqual(stats.days[0], { day: malaysiaDay(), home_visitors: 3, clicks: 1, register_visitors: 1, leads: 1 });
  assert.equal(stats.days.length, 14);
});

test('6. the stats API needs the admin login', async () => {
  const env = makeEnv();
  const anon = await worker.fetch(new Request('https://aligor.aligor.workers.dev/api/admin/stats'), env, makeCtx());
  assert.equal(anon.status, 401);
  const cookie = await adminCookie(env);
  const ok = await worker.fetch(new Request('https://aligor.aligor.workers.dev/api/admin/stats', { headers: { cookie } }), env, makeCtx());
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).total_home_visitors, 0);
});

test('7. malaysiaDay uses UTC+8', () => {
  assert.equal(malaysiaDay(new Date('2026-10-06T17:30:00Z')), '2026-10-07');
  assert.equal(malaysiaDay(new Date('2026-10-06T15:59:00Z')), '2026-10-06');
});
