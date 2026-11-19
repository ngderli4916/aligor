import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';
import { TEAM_DASHBOARD_API, TEAM_DASHBOARD_PATH, malaysiaTime, displayPhone, whatsappUrl } from '../team-dashboard.js';
import { TEAM_DOMAIN, MEMBER, STRANGER, memoryDb, seedLeads, accessKeys, teamEnv } from './team-access-fixture.mjs';

const keys = await accessKeys();
const rotated = await accessKeys('rotated-kid');
let certFetches = 0, served = keys.certs;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url) === `${TEAM_DOMAIN}/cdn-cgi/access/certs`) { certFetches++; return new Response(JSON.stringify(served), { headers: { 'content-type': 'application/json' } }); }
  return realFetch(url, opts);
};

const ORIGIN = 'https://aligorvibe.test';
const get = (path, token, headers = {}) => new Request(ORIGIN + path, { headers: { ...(token ? { 'cf-access-jwt-assertion': token } : {}), ...headers } });
const ALL_PHONES = ['60100000101', '60100000202', '60100000303', '60100000404', '60100000505', '60100000606'];
const assertNoFullPhone = text => { for (const phone of ALL_PHONES) { assert.ok(!text.includes(phone), `full phone leaked: ${phone}`); assert.ok(!text.includes(phone.slice(2)), 'local phone leaked'); } };
const assertNoLeadData = text => { assertNoFullPhone(text); for (const word of ['甲 同学', 'Beta Sample', 'Sample Works', 'AIPR']) assert.ok(!text.includes(word), `lead data leaked: ${word}`); };
// Allowed responses carry this course's numbers only; other batches/sources/cancelled never appear.
const OTHER_PHONES = ['60100000303', '60100000404', '60100000505', '60100000606'];
const assertOnlyCoursePhones = text => { for (const phone of OTHER_PHONES) assert.ok(!text.includes(phone.slice(2)), `non-course phone leaked: ${phone}`); };
const assertNoStore = res => { assert.match(res.headers.get('cache-control'), /no-store/); assert.match(res.headers.get('cache-control'), /private/); assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow'); };

function setup() { const { raw, DB } = memoryDb(); seedLeads(raw); return { raw, env: teamEnv(DB) }; }

test('anonymous, forged, expired, wrong-audience and non-member requests get no data', async () => {
  const { env } = setup();
  const expired = await keys.sign({ exp: Math.floor(Date.now() / 1000) - 3600 });
  const wrongAud = await keys.sign({ aud: ['another-app'] });
  const wrongIss = await keys.sign({ iss: 'https://evil-team.cloudflareaccess.com' });
  const future = await keys.sign({ nbf: Math.floor(Date.now() / 1000) + 3600 });
  const good = await keys.sign();
  const tampered = good.split('.').map((part, i) => i === 1 ? Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(part, 'base64url')), email: 'Member@Example.test' })).toString('base64url') : part).join('.');
  const noneAlg = await keys.sign({}, { alg: 'none' });
  const unknownKid = await keys.sign({}, { headerKid: 'not-a-real-kid' });
  const cases = [[undefined, 401], ['not.a.jwt', 401], ['garbage', 401], [expired, 401], [wrongAud, 401], [wrongIss, 401], [future, 401], [tampered, 401], [noneAlg, 401], [unknownKid, 401], [await keys.sign({ email: STRANGER }), 403], [await keys.sign({ email: undefined }), 403]];
  for (const [token, status] of cases) for (const path of [TEAM_DASHBOARD_API, TEAM_DASHBOARD_PATH, `${TEAM_DASHBOARD_PATH}/`]) {
    const res = await worker.fetch(get(path, token), env);
    assert.equal(res.status, status, `${path} ${status}`);
    assertNoStore(res); assertNoLeadData(await res.text());
  }
});

test('admin session cookie and query tricks do not open the team board', async () => {
  const { env } = setup();
  env.SESSION_SECRET = 'synthetic-session-secret';
  const res = await worker.fetch(get(TEAM_DASHBOARD_API, undefined, { cookie: 'aligor_session=x.y' }), env);
  assert.equal(res.status, 401); assertNoLeadData(await res.text());
  // A team token is not an admin session either.
  const admin = await worker.fetch(get('/api/admin/leads', await keys.sign()), env);
  assert.equal(admin.status, 401);
});

test('missing or broken configuration fails closed even with a valid token', async () => {
  const token = await keys.sign();
  for (const patch of [{ TEAM_ACCESS_TEAM_DOMAIN: '' }, { TEAM_ACCESS_AUD: '' }, { TEAM_DASHBOARD_EMAILS: '' }, { TEAM_DASHBOARD_EMAILS: 'not-an-email' }, { TEAM_ACCESS_TEAM_DOMAIN: 'http://aligor-test.cloudflareaccess.com' }, { TEAM_ACCESS_TEAM_DOMAIN: 'https://attacker.example' }]) {
    const { env } = setup(); Object.assign(env, patch);
    for (const path of [TEAM_DASHBOARD_API, TEAM_DASHBOARD_PATH]) {
      const res = await worker.fetch(get(path, token), env);
      assert.equal(res.status, 503, JSON.stringify(patch)); assertNoLeadData(await res.text());
    }
  }
});

test('member sees only valid registrations for this course, newest first, with masked phones', async () => {
  const { env } = setup();
  const res = await worker.fetch(get(`${TEAM_DASHBOARD_API}?batch=PREVIEW-1118&source=aligor&status=cancelled`, await keys.sign({ email: 'LEAD.TWO@example.test' })), env);
  assert.equal(res.status, 200); assertNoStore(res);
  const text = await res.text(); assertOnlyCoursePhones(text);
  const data = JSON.parse(text);
  assert.equal(data.total, 2);
  assert.equal(data.registrations.length, data.total);
  assert.deepEqual(data.registrations.map(r => r.name), ['Beta Sample', '甲 同学']);
  assert.deepEqual(Object.keys(data.registrations[0]).sort(), ['code', 'company', 'industry', 'name', 'phone', 'registered_at', 'registered_at_myt', 'whatsapp_url']);
  assert.deepEqual(data.registrations[0], { code: '#AIPR00002', name: 'Beta Sample', company: 'Sample Works', industry: 'Manufacturing', phone: '+60 100000202', whatsapp_url: 'https://wa.me/60100000202', registered_at: '2026-11-19T05:30:00.000Z', registered_at_myt: '2026-11-19 13:30' });
  assert.equal(data.registrations[1].registered_at_myt, '2026-11-18 10:00');
  for (const hidden of ['Cancelled Person', 'Preview Only', 'Wrong Source', 'Class Lead']) assert.ok(!text.includes(hidden));
});

test('page shell for a member carries no lead data and no full numbers', async () => {
  const { env } = setup();
  const res = await worker.fetch(get(TEAM_DASHBOARD_PATH, await keys.sign()), env);
  assert.equal(res.status, 200); assertNoStore(res);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  const html = await res.text();
  assert.match(html, /<title>团队报名看板<\/title>/);
  for (const label of ['有效报名', '搜索姓名或公司', '刷新', '报名 ID', '报名时间（UTC+8）', '目前还没有人报名', '读取失败']) assert.ok(html.includes(label), label);
  assertNoLeadData(html);
  assert.ok(!/setInterval|setTimeout/.test(html), 'no polling');
  assert.ok(!/\b(edit|delete|export|csv)\b/i.test(html), 'read-only page');
  assert.match(html, /a\.rel='noopener noreferrer'/);
});

test('a new public registration shows up on the next refresh; cancelling removes it from the count', async () => {
  const { raw, env } = setup();
  const token = await keys.sign();
  const before = await (await worker.fetch(get(TEAM_DASHBOARD_API, token), env)).json();
  const reg = await worker.fetch(new Request(`${ORIGIN}/api/register-ai-agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Newest Synthetic', phone: '010 0000 0909', company: 'Fresh Co', industry: 'Services' }) }), env);
  assert.equal(reg.status, 200);
  const after = await (await worker.fetch(get(TEAM_DASHBOARD_API, token), env)).json();
  assert.equal(after.total, before.total + 1);
  assert.equal(after.registrations[0].name, 'Newest Synthetic');
  assert.equal(after.registrations[0].phone, '+60 1000000909');
  assert.equal(after.registrations[0].whatsapp_url, 'https://wa.me/601000000909');
  raw.prepare("UPDATE leads SET status='cancelled' WHERE name='Newest Synthetic'").run();
  const cancelled = await (await worker.fetch(get(TEAM_DASHBOARD_API, token), env)).json();
  assert.equal(cancelled.total, before.total);
  assert.ok(!cancelled.registrations.some(r => r.name === 'Newest Synthetic'));
});

test('empty list and database failure', async () => {
  const { raw, env } = setup();
  raw.exec("DELETE FROM leads WHERE batch='AI-AGENT-REGISTRATION'");
  const empty = await (await worker.fetch(get(TEAM_DASHBOARD_API, await keys.sign()), env)).json();
  assert.deepEqual([empty.ok, empty.total, empty.registrations], [true, 0, []]);
  const broken = { ...env, DB: { prepare() { throw new Error('D1 down 60100000101'); } } };
  const logged = [], realError = console.error; console.error = (...a) => logged.push(a.join(' '));
  try {
    const res = await worker.fetch(get(TEAM_DASHBOARD_API, await keys.sign()), broken);
    assert.equal(res.status, 500); assertNoStore(res);
    const body = await res.json(); assert.equal(body.ok, false); assert.match(body.error, /暂时无法读取/);
  } finally { console.error = realError; }
  assert.ok(logged.every(line => !line.includes('60100000101')), 'no lead data in logs');
});

test('Access key rotation is picked up; non-GET is rejected', async () => {
  const { env } = setup();
  served = { keys: [...keys.certs.keys, ...rotated.certs.keys] };
  const n = certFetches;
  const res = await worker.fetch(get(TEAM_DASHBOARD_API, await rotated.sign()), env);
  assert.equal(res.status, 200); assert.ok(certFetches > n);
  served = keys.certs;
  const post = await worker.fetch(new Request(ORIGIN + TEAM_DASHBOARD_API, { method: 'POST', headers: { 'cf-access-jwt-assertion': await keys.sign() } }), env);
  assert.equal(post.status, 405); assertNoLeadData(await post.text());
});

test('helpers', () => {
  assert.equal(displayPhone('60123456789'), '+60 123456789');
  assert.equal(displayPhone(''), '');
  assert.equal(whatsappUrl('60123456789'), 'https://wa.me/60123456789');
  assert.equal(whatsappUrl('abc'), '');
  assert.equal(malaysiaTime('2026-11-19T16:30:00.000Z'), '2026-11-20 00:30');
  assert.equal(malaysiaTime('nope'), '');
});

// ---------- shared team link (#k=<key>) ----------
const LINK_KEY = 'synthetic-link-key-0123456789abcdefABCDEF_-xyz';
const linkEnv = DB => ({ DB, TEAM_DASHBOARD_LINK_KEY: LINK_KEY });
const withKey = (path, key) => new Request(ORIGIN + path, { headers: key === undefined ? {} : { 'x-team-link-key': key } });

test('shared link: correct key reads the course list; missing, wrong or partial keys get nothing', async () => {
  const { raw, DB } = memoryDb(); seedLeads(raw); const env = linkEnv(DB);
  const ok = await worker.fetch(withKey(TEAM_DASHBOARD_API, LINK_KEY), env);
  assert.equal(ok.status, 200); assertNoStore(ok);
  const text = await ok.text(); assertOnlyCoursePhones(text);
  assert.ok(text.includes('https://wa.me/60100000202'));
  const data = JSON.parse(text);
  assert.equal(data.total, 2); assert.deepEqual(data.registrations.map(r => r.name), ['Beta Sample', '甲 同学']);
  for (const hidden of ['Cancelled Person', 'Preview Only', 'Wrong Source', 'Class Lead']) assert.ok(!text.includes(hidden));
  for (const key of [undefined, '', 'wrong', LINK_KEY.slice(0, -1), LINK_KEY + 'x', LINK_KEY.toUpperCase(), 'x'.repeat(600)]) {
    const res = await worker.fetch(withKey(TEAM_DASHBOARD_API, key), env);
    assert.equal(res.status, 401, String(key)); assertNoStore(res); assertNoLeadData(await res.text());
  }
  // The key is never accepted from the query string (it would land in logs).
  const viaQuery = await worker.fetch(new Request(`${ORIGIN}${TEAM_DASHBOARD_API}?k=${LINK_KEY}`), env);
  assert.equal(viaQuery.status, 401); assertNoLeadData(await viaQuery.text());
});

test('shared link: page shell is served without data and never contains the key', async () => {
  const { raw, DB } = memoryDb(); seedLeads(raw); const env = linkEnv(DB);
  const res = await worker.fetch(new Request(ORIGIN + TEAM_DASHBOARD_PATH), env);
  assert.equal(res.status, 200); assertNoStore(res);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  const html = await res.text();
  assertNoLeadData(html); assert.ok(!html.includes(LINK_KEY));
  assert.match(html, /location\.hash/); assert.match(html, /x-team-link-key/);
});

test('shared link: rotating the secret revokes the old link; weak secrets are ignored', async () => {
  const { raw, DB } = memoryDb(); seedLeads(raw);
  const rotatedEnv = { DB, TEAM_DASHBOARD_LINK_KEY: 'a-brand-new-synthetic-key-0123456789ABCDEFGH' };
  assert.equal((await worker.fetch(withKey(TEAM_DASHBOARD_API, LINK_KEY), rotatedEnv)).status, 401);
  assert.equal((await worker.fetch(withKey(TEAM_DASHBOARD_API, rotatedEnv.TEAM_DASHBOARD_LINK_KEY), rotatedEnv)).status, 200);
  for (const weak of ['short', '1234', 'has spaces in it but is definitely long enough!!']) {
    const env = { DB, TEAM_DASHBOARD_LINK_KEY: weak };
    const res = await worker.fetch(withKey(TEAM_DASHBOARD_API, weak), env);
    assert.equal(res.status, 401, weak); assertNoLeadData(await res.text());
    const page = await worker.fetch(new Request(ORIGIN + TEAM_DASHBOARD_PATH), env);
    assert.equal(page.status, 503); assertNoLeadData(await page.text());
  }
});

test('shared link and Access can coexist; a wrong link key does not fall through to Access', async () => {
  const { raw, DB } = memoryDb(); seedLeads(raw);
  const env = { ...teamEnv(DB), TEAM_DASHBOARD_LINK_KEY: LINK_KEY };
  assert.equal((await worker.fetch(get(TEAM_DASHBOARD_API, await keys.sign()), env)).status, 200);
  assert.equal((await worker.fetch(withKey(TEAM_DASHBOARD_API, LINK_KEY), env)).status, 200);
  const mixed = new Request(ORIGIN + TEAM_DASHBOARD_API, { headers: { 'x-team-link-key': 'wrong', 'cf-access-jwt-assertion': await keys.sign() } });
  assert.equal((await worker.fetch(mixed, env)).status, 401);
});

test('page script parses as valid JavaScript', async () => {
  const { DB } = memoryDb();
  const html = await (await worker.fetch(new Request(ORIGIN + TEAM_DASHBOARD_PATH), { DB, TEAM_DASHBOARD_LINK_KEY: LINK_KEY })).text();
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
});
