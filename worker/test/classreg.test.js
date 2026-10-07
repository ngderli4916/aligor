// Run from the repo root:  node --no-warnings --test worker/test/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../index.js';
import { normalizeClassPhone, CLASS_SCHEMA } from '../classreg.js';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return { raw: db, prepare(sql) { let params = []; const st = {
    bind(...a) { params = a; return st; },
    async run() { const r = db.prepare(sql).run(...params); return { success: true, meta: { changes: r.changes } }; },
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params) }; } }; return st; } };
}
const SECRET = 'session-secret-for-tests-0123456789', TG = 'TESTTOKEN123:abcdef', CHAT = '999000111';
const makeEnv = (extra = {}) => ({ DB: makeDb(), SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'adminpw-test', TELEGRAM_BOT_TOKEN: TG, TELEGRAM_CHAT_ID: CHAT, PUBLIC_BASE_URL: 'https://aligor.test', ...extra });
const BASE = 'https://aligor.test';
let calls; let tgMode;
const realFetch = globalThis.fetch;
test.beforeEach(() => { calls = []; tgMode = 'ok'; globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); if (tgMode === 'fail') return new Response('{"ok":false}', { status: 500 }); if (tgMode === 'throw') throw new Error(`network down ${TG}`); return new Response('{"ok":true}', { status: 200 }); }; });
test.after(() => { globalThis.fetch = realFetch; });

let n = 0; const key = () => `k${String(++n).padStart(4, '0')}abcdefghijklmnop`;
const base = (o = {}) => ({ name: 'Ah Test', phone: '0167871902', region: 'JOHOR', package: 'solo_1pc', idempotency_key: key(), ...o });
async function call(env, method, path, body, headers = {}) {
  const ctx = { ps: [], waitUntil(p) { this.ps.push(p); } };
  const res = await worker.fetch(new Request(BASE + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
  await Promise.all(ctx.ps); return res;
}
const register = async (env, o) => { const res = await call(env, 'POST', '/api/classregister', base(o)); return { res, json: await res.json() }; };
async function adminCookie(env) {
  const res = await call(env, 'POST', '/api/admin/login', { password: env.ADMIN_PASSWORD });
  return { cookie: res.headers.get('set-cookie').split(';')[0] };
}
const tokenOf = j => new URL(j.payment_url).searchParams.get('t');
const row = (env, id = 1) => env.DB.raw.prepare('SELECT * FROM class_registrations WHERE id=?').get(id);
const events = (env, id = 1) => env.DB.raw.prepare('SELECT event_type,actor,details FROM class_registration_events WHERE registration_id=? ORDER BY id').all(id);

test('1. phone formats normalise to 60167871902; invalid numbers are rejected', async () => {
  for (const p of ['0167871902', '60167871902', '+60167871902', '016-787 1902', '+60 16 787 1902']) assert.equal(normalizeClassPhone(p), '60167871902');
  for (const p of ['', '12345', '167871902', '0267871902', '+6591234567', 'abc', '01678719', '016787190299999']) assert.throws(() => normalizeClassPhone(p), p);
  const env = makeEnv();
  const { res, json } = await register(env, { phone: '12345' });
  assert.equal(res.status, 400); assert.ok(json.error);
  const ok = await register(env, { phone: '+60167871902' });
  assert.equal(ok.res.status, 201); assert.equal(row(env).primary_phone_normalized, '60167871902');
});

test('2. only JOHOR, SELANGOR, PENANG', async () => {
  const env = makeEnv();
  for (const region of ['JOHOR', 'SELANGOR', 'PENANG', 'penang']) assert.equal((await register(env, { region, phone: `01${Math.floor(10000000 + Math.random() * 89999999)}` })).res.status, 201);
  for (const region of ['KL', '', 'SABAH', 'JOHOR; DROP']) assert.equal((await register(env, { region })).res.status, 400);
});

test('3 & 4. packages: server amounts; tampered amounts are ignored; unknown package rejected', async () => {
  const env = makeEnv();
  const two = { second_name: 'Siti', second_phone: '0123456789' };
  const a = await register(env, { package: 'solo_1pc', amount: 1, final_amount: 1, discount_amount: 999 });
  const b = await register(env, { package: 'pair_1pc', ...two, phone: '0161111111', amount: 1 });
  const c = await register(env, { package: 'pair_2pc', ...two, phone: '0162222222', final_amount: 1 });
  assert.deepEqual([a.json.amount, b.json.amount, c.json.amount], [399, 499, 699]);
  const rs = env.DB.raw.prepare('SELECT package_code,original_amount,discount_amount,final_amount,participant_count,computer_count FROM class_registrations ORDER BY id').all();
  assert.deepEqual(rs.map(r => [r.original_amount, r.discount_amount, r.final_amount, r.participant_count, r.computer_count]), [[399, 0, 399, 1, 1], [698, 199, 499, 2, 1], [798, 99, 699, 2, 2]]);
  assert.equal((await register(env, { package: 'free' })).res.status, 400);
});

test('5. pair packages need the second person; solo ignores it', async () => {
  const env = makeEnv();
  assert.equal((await register(env, { package: 'pair_1pc' })).res.status, 400);
  assert.equal((await register(env, { package: 'pair_1pc', second_name: 'X', second_phone: '0123456789' })).res.status, 400);
  assert.equal((await register(env, { package: 'pair_1pc', second_name: 'Siti', second_phone: '123' })).res.status, 400);
  assert.equal((await register(env, { package: 'pair_1pc', second_name: 'Siti', second_phone: '0167871902' })).res.status, 400);
  assert.equal((await register(env, { package: 'pair_2pc', second_name: 'Siti', second_phone: '012-345 6789' })).res.status, 201);
  const r = row(env); assert.equal(r.second_name, 'Siti'); assert.equal(r.second_phone_normalized, '60123456789');
  const s = await register(env, { phone: '0163333333', second_name: 'Ignored', second_phone: '0124444444' });
  assert.equal(row(env, 2).second_name, null);
});

test('6. order ids AICL00001.. increment, are unique and never reused', async () => {
  const env = makeEnv();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await register(env, { phone: `016000000${i}` })).json.order_id);
  assert.deepEqual(ids, ['AICL00001', 'AICL00002', 'AICL00003', 'AICL00004', 'AICL00005']);
  // Concurrent submits
  const more = await Promise.all([6, 7, 8, 9].map(i => register(env, { phone: `01700000${i}0` })));
  assert.equal(new Set(more.map(m => m.json.order_id)).size, 4);
  // Even if the newest row were removed at the database level, the number is not handed out again.
});
test('6b. a deleted newest row never frees its AICL number', async () => {
  const env = makeEnv();
  await register(env, { phone: '0161000001' }); await register(env, { phone: '0161000002' });
  env.DB.raw.exec('DROP TRIGGER class_events_no_delete'); env.DB.raw.exec('DELETE FROM class_registration_events'); env.DB.raw.exec('DELETE FROM class_registrations WHERE id=2');
  assert.equal((await register(env, { phone: '0161000003' })).json.order_id, 'AICL00003');
});

test('7. token is unguessable; stored only as a hash; invalid tokens reveal nothing', async () => {
  const env = makeEnv();
  const { json } = await register(env);
  const t = tokenOf(json);
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  const r = row(env);
  assert.notEqual(r.payment_token_hash, t); assert.match(r.payment_token_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(r).includes(t));
  const t2 = tokenOf((await register(env, { phone: '0162000000' })).json); assert.notEqual(t, t2);
  const good = await call(env, 'GET', `/payment?t=${t}`, undefined); const goodHtml = await good.text();
  assert.equal(good.status, 200); assert.ok(goodHtml.includes('AICL00001') && goodHtml.includes('RM399'));
  assert.ok(!goodHtml.includes('60167871902') && !goodHtml.includes('0167871902') && !goodHtml.includes('Ah Test'));
  assert.match(good.headers.get('x-robots-tag'), /noindex/); assert.ok(goodHtml.includes('name="robots" content="noindex'));
  const bad = [`/payment?t=${'A'.repeat(43)}`, '/payment?t=AICL00001', '/payment?t=', '/payment', '/payment?order=AICL00001'];
  const bodies = [];
  for (const p of bad) { const res = await call(env, 'GET', p, undefined); assert.equal(res.status, 404); bodies.push(await res.text()); }
  assert.equal(new Set(bodies).size, 1); assert.ok(!bodies[0].includes('AICL'));
});

test('8. duplicate submit protection (same key, same data in 10 minutes, tampered replay)', async () => {
  const env = makeEnv();
  const k = key();
  const r = await Promise.all([1, 2, 3].map(() => register(env, { idempotency_key: k })));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) c FROM class_registrations').get().c, 1);
  assert.equal(new Set(r.map(x => x.json.order_id)).size, 1); assert.equal(new Set(r.map(x => tokenOf(x.json))).size, 1);
  // new key, identical details soon after (refresh)
  const again = await register(env); assert.equal(again.json.order_id, 'AICL00001');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) c FROM class_registrations').get().c, 1);
  // same key but different data
  const clash = await register(env, { idempotency_key: k, package: 'pair_1pc', second_name: 'Siti', second_phone: '0123456789' });
  assert.equal(clash.res.status, 409);
  // bad key shape
  assert.equal((await register(env, { idempotency_key: 'x' })).res.status, 400);
  // honeypot
  const hp = await call(env, 'POST', '/api/classregister', base({ phone: '0165555555', website: 'http://spam' })); assert.equal(hp.status, 202);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) c FROM class_registrations').get().c, 1);
});

test('9. D1 rows and append-only event log', async () => {
  const env = makeEnv();
  const { json } = await register(env, { source: 'ig', utm_source: 'insta' });
  const r = row(env); assert.equal(r.payment_status, 'awaiting_payment'); assert.equal(r.registration_status, 'registered'); assert.equal(r.utm_source, 'insta');
  assert.deepEqual(events(env).map(e => e.event_type), ['registration_created', 'telegram_notification_sent']);
  assert.throws(() => env.DB.raw.exec("UPDATE class_registration_events SET actor='x'"), /append-only/);
  assert.throws(() => env.DB.raw.exec('DELETE FROM class_registration_events'), /append-only/);
  assert.ok(!JSON.stringify(events(env)).includes(tokenOf(json)));
});

test('10. Telegram success: one message, exact content, secrets only from env', async () => {
  const env = makeEnv();
  await register(env, { package: 'pair_1pc', second_name: 'Siti <b>', second_phone: '0123456789' });
  const tg = calls.filter(c => c.url.includes('api.telegram.org')); assert.equal(tg.length, 1);
  assert.ok(tg[0].url.endsWith(`/bot${TG}/sendMessage`)); assert.equal(tg[0].body.chat_id, CHAT);
  const t = tg[0].body.text;
  for (const s of ['新的 Aligor 一天课程报名', 'AICL00001', '60167871902', 'JOHOR', '两个人 · 共用一台电脑', '2 人／1 台', 'Siti &lt;b&gt;', '60123456789', '原价：RM698', '优惠：RM199', '应付：RM499', '等待付款', 'https://aligor.test/4916']) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('/payment') && !t.includes(TG));
  assert.equal(row(env).telegram_notification_status, 'sent');
});

test('11. Telegram failure keeps the registration; 12. retry sends once and never twice', async () => {
  const env = makeEnv(); tgMode = 'fail';
  const { res, json } = await register(env); assert.equal(res.status, 201); assert.equal(json.order_id, 'AICL00001');
  assert.equal(row(env).telegram_notification_status, 'failed');
  assert.ok(events(env).some(e => e.event_type === 'telegram_notification_failed'));
  tgMode = 'throw'; const cookie = await adminCookie(env);
  await call(env, 'POST', '/api/admin/class/1/telegram', {}, cookie);
  assert.equal(row(env).telegram_notification_status, 'failed');
  assert.ok(!JSON.stringify(events(env)).includes(TG), 'token redacted from events');
  tgMode = 'ok'; const sent0 = calls.length;
  const [a, b] = await Promise.all([call(env, 'POST', '/api/admin/class/1/telegram', {}, cookie), call(env, 'POST', '/api/admin/class/1/telegram', {}, cookie)]);
  assert.equal(calls.length - sent0, 1, 'exactly one Telegram message');
  assert.equal(row(env).telegram_notification_status, 'sent');
  const again = await (await call(env, 'POST', '/api/admin/class/1/telegram', {}, cookie)).json(); assert.equal(again.result, 'already_handled');
  assert.equal(calls.length - sent0, 1);
  // a re-submit of the same registration does not notify again
  await register(env, { idempotency_key: row(env).idempotency_key }); assert.equal(calls.length - sent0, 1);
});
test('11b. missing Telegram config is recorded as skipped and can be retried later', async () => {
  const env = makeEnv({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined });
  assert.equal((await register(env)).res.status, 201); assert.equal(row(env).telegram_notification_status, 'skipped');
  env.TELEGRAM_BOT_TOKEN = TG; env.TELEGRAM_CHAT_ID = CHAT; const cookie = await adminCookie(env);
  await call(env, 'POST', '/api/admin/class/1/telegram', {}, cookie); assert.equal(row(env).telegram_notification_status, 'sent');
});

test('13. admin: auth required; list, search, filters, CSV, events; no token leaks', async () => {
  const env = makeEnv();
  await register(env, { name: 'Alice', phone: '0161111111', region: 'JOHOR' });
  await register(env, { name: '=HYPERLINK("x")', phone: '0162222222', region: 'PENANG', package: 'pair_2pc', second_name: 'Bob', second_phone: '0123456789' });
  assert.equal((await call(env, 'GET', '/api/admin/class', undefined)).status, 401);
  assert.equal((await call(env, 'GET', '/api/admin/class/export.csv', undefined)).status, 401);
  assert.equal((await call(env, 'POST', '/api/admin/class/1/confirm', { confirm: true })).status, 401);
  const cookie = await adminCookie(env);
  const q = async s => (await (await call(env, 'GET', `/api/admin/class${s}`, undefined, cookie)).json());
  assert.equal((await q('')).registrations.length, 2);
  assert.deepEqual((await q('?region=PENANG')).registrations.map(r => r.public_order_id), ['AICL00002']);
  assert.deepEqual((await q('?package=solo_1pc')).registrations.map(r => r.public_order_id), ['AICL00001']);
  assert.deepEqual((await q('?q=AICL00002')).registrations.map(r => r.public_order_id), ['AICL00002']);
  assert.deepEqual((await q('?q=Alice')).registrations.map(r => r.public_order_id), ['AICL00001']);
  assert.deepEqual((await q('?q=0162222222')).registrations.map(r => r.public_order_id), ['AICL00002']);
  assert.deepEqual((await q('?q=Bob')).registrations.map(r => r.public_order_id), ['AICL00002']);
  assert.equal((await q('?status=payment_confirmed')).registrations.length, 0);
  const all = JSON.stringify(await q('')); assert.ok(!all.includes('payment_token_hash') && !all.includes('idempotency_key'));
  const csv = await (await call(env, 'GET', '/api/admin/class/export.csv', undefined, cookie)).text();
  assert.ok(csv.includes('AICL00001') && csv.includes('60161111111') && csv.includes('699'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'formula injection neutralised');
  assert.ok(!/[0-9a-f]{64}/.test(csv));
  const ev = await (await call(env, 'GET', '/api/admin/class/1/events', undefined, cookie)).json(); assert.equal(ev.events[0].event_type, 'registration_created');
  const notes = await call(env, 'POST', '/api/admin/class/1/notes', { notes: 'WhatsApp 过了' }, cookie); assert.equal(notes.status, 200);
  assert.equal((await q('?q=AICL00001')).registrations[0].admin_notes, 'WhatsApp 过了');
});

test('14/15. customer submits a reference -> payment_submitted only; only the admin confirms', async () => {
  const env = makeEnv();
  const { json } = await register(env); const t = tokenOf(json);
  const sub = async (ref, tok = t) => call(env, 'POST', '/api/payment/submit', { t: tok, reference: ref });
  assert.equal((await sub('ab')).status, 400); assert.equal((await sub('<script>x</script>')).status, 400);
  assert.equal((await sub('REF1234', 'A'.repeat(43))).status, 404);
  const ok = await sub('DUITNOW 998877'); assert.equal(ok.status, 200);
  let r = row(env); assert.equal(r.payment_status, 'payment_submitted'); assert.equal(r.payment_reference, 'DUITNOW 998877'); assert.equal(r.payment_confirmed_at, null);
  assert.equal((await sub('DUITNOW 998877')).status, 200);
  assert.equal(events(env).filter(e => e.event_type === 'payment_submitted').length, 1, 'same reference twice is one event');
  // hostile payloads cannot confirm
  for (const body of [{ t, reference: 'REF1234', payment_status: 'payment_confirmed' }, { t, reference: 'REF1234', status: 'payment_confirmed', confirmed: true }]) await call(env, 'POST', '/api/payment/submit', body);
  assert.equal(row(env).payment_status, 'payment_submitted');
  assert.equal((await call(env, 'POST', '/api/admin/class/1/confirm', { confirm: true })).status, 401);
  const page = await (await call(env, 'GET', `/payment?t=${t}`, undefined)).text();
  assert.ok(page.includes('已收到你的付款参考编号') && page.includes('提交付款资料不代表付款已经确认。我们核对到账后会再通知你。') && !page.includes('付款已由 Aligor 核对确认'));
  // admin
  const cookie = await adminCookie(env);
  assert.equal((await call(env, 'POST', '/api/admin/class/1/confirm', {}, cookie)).status, 400, 'needs confirm:true');
  assert.equal(row(env).payment_status, 'payment_submitted');
  const done = await call(env, 'POST', '/api/admin/class/1/confirm', { confirm: true }, cookie); assert.equal(done.status, 200);
  r = row(env); assert.equal(r.payment_status, 'payment_confirmed'); assert.ok(r.payment_confirmed_at);
  const ev = events(env).find(e => e.event_type === 'payment_confirmed'); assert.equal(ev.actor, 'admin'); assert.match(ev.details, /before=payment_submitted after=payment_confirmed/);
  assert.equal((await call(env, 'POST', '/api/admin/class/1/confirm', { confirm: true }, cookie)).status, 409, 'cannot confirm twice');
  assert.equal((await sub('NEWREF99')).status, 409, 'customer cannot change a confirmed payment');
  assert.ok((await (await call(env, 'GET', `/payment?t=${t}`, undefined)).text()).includes('付款已由 Aligor 核对确认'));
});

test('14b. reject lets the customer resubmit; cancel kills the payment link', async () => {
  const env = makeEnv(); const cookie = await adminCookie(env);
  const { json } = await register(env); const t = tokenOf(json);
  assert.equal((await call(env, 'POST', '/api/admin/class/1/reject', { confirm: true }, cookie)).status, 409, 'nothing submitted yet');
  await call(env, 'POST', '/api/payment/submit', { t, reference: 'WRONG-111' });
  assert.equal((await call(env, 'POST', '/api/admin/class/1/reject', { confirm: true }, cookie)).status, 200); assert.equal(row(env).payment_status, 'payment_rejected');
  assert.equal((await call(env, 'POST', '/api/payment/submit', { t, reference: 'RIGHT-222' })).status, 200); assert.equal(row(env).payment_status, 'payment_submitted');
  assert.equal((await call(env, 'POST', '/api/admin/class/1/cancel', { confirm: true }, cookie)).status, 200);
  assert.equal(row(env).payment_status, 'cancelled'); assert.equal(row(env).registration_status, 'cancelled');
  assert.equal((await call(env, 'GET', `/payment?t=${t}`, undefined)).status, 404);
  assert.equal((await call(env, 'POST', '/api/payment/submit', { t, reference: 'RIGHT-333' })).status, 404);
  assert.deepEqual(events(env).filter(e => /reject|cancel/.test(e.event_type)).map(e => e.event_type), ['payment_rejected', 'registration_cancelled']);
});

test('16. the QR asset is a real, sizeable JPEG and the payment page references the local copy', async () => {
  const jpg = fs.readFileSync(new URL('../../assets/payment/duitnow-nili-resources.jpg', import.meta.url));
  assert.equal(jpg[0], 0xff); assert.equal(jpg[1], 0xd8); assert.ok(jpg.length > 50000);
  const env = makeEnv(); const { json } = await register(env);
  const page = await (await call(env, 'GET', `/payment?t=${tokenOf(json)}`, undefined)).text();
  assert.ok(page.includes('src="/assets/payment/duitnow-nili-resources.jpg"') && page.includes('NILI RESOURCES') && !/Downloads|https?:\/\/[^"' ]*\.jpg/.test(page));
  assert.ok(!page.includes(TG) && !page.includes(SECRET));
});

test('18. registration page, old /register, admin, health still work; migrations are idempotent', async () => {
  const env = makeEnv();
  const reg = await call(env, 'GET', '/classregister', undefined); const h = await reg.text();
  assert.equal(reg.status, 200); assert.ok(h.includes('RM399') && h.includes('RM499') && h.includes('RM699') && h.includes('JOHOR') && h.includes('SELANGOR') && h.includes('PENANG'));
  assert.ok(!/SpiderMan|Hermes|Demo|DEMO/.test(h)); assert.ok(!h.includes('qr') || !h.includes('duitnow-nili'), 'no QR before submit');
  assert.equal((await call(env, 'GET', '/register', undefined)).status, 200);
  assert.equal((await call(env, 'GET', '/4916', undefined)).status, 200);
  assert.equal((await call(env, 'GET', '/health', undefined)).status, 200);
  const cookie = await adminCookie(env); const admin = await (await call(env, 'GET', '/4916', undefined, cookie)).text();
  assert.ok(admin.includes('一天课程报名') && admin.includes('免费 Preview 报名') && admin.includes('确认付款成功'));
  assert.equal((await call(env, 'GET', '/api/admin/leads', undefined, cookie)).status, 200);
  for (const s of CLASS_SCHEMA) env.DB.raw.exec(s);
  const sql = fs.readFileSync(new URL('../migrations/0002_class_registrations.sql', import.meta.url), 'utf8');
  const fresh = new DatabaseSync(':memory:'); fresh.exec(sql); fresh.exec(sql);
  assert.equal(fresh.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name IN ('class_registrations','class_registration_events')").get().c, 2);
  // old lead flow untouched
  const lead = await call(env, 'POST', '/api/leads', { name: 'Old Lead', phone: '0161234567', batch: 'PREVIEW-1007', course: 'x', used_ai_agent: '有', consent: true });
  assert.equal(lead.status, 201); assert.match((await lead.json()).lead_id, /^AIPR\d{5}$/);
});
