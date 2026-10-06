// Run from the repo root:  node --test worker/test/
// Every fetch is mocked. Any request that is not the mocked Telegram API throws, so nothing real can be sent.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../index.js';
import { buildLeadNotification, buildCustomerMessage, formatMalaysiaTime, groupLinkState } from '../notify.js';

const COURSE_1 = '免费 AI Preview · 10 月 7 日（星期三）8 PM – 9 PM';
const COURSE_2 = '免费 AI Preview · 10 月 14 日（星期三）8 PM – 9 PM';
const GROUP = 'https://chat.whatsapp.com/TESTGROUP123?s=cl&p=i';
const realFetch = globalThis.fetch;
let telegramCalls;

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

function installFetch(handler) {
  telegramCalls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (!target.startsWith('https://api.telegram.org/bot')) throw new Error(`UNMOCKED fetch blocked: ${target}`);
    const body = JSON.parse(init.body);
    telegramCalls.push({ url: target, method: target.split('/').pop(), body });
    return handler ? handler(target, body) : new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
}

beforeEach(() => installFetch());
afterEach(() => { globalThis.fetch = realFetch; });

const makeEnv = (extra = {}) => ({
  DB: makeDb(),
  TELEGRAM_BOT_TOKEN: 'TEST_BOT_TOKEN_123',
  TELEGRAM_CHAT_ID: '111',
  TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-xyz',
  WHATSAPP_NUMBER: '60167871902',
  WHATSAPP_GROUP_URL: GROUP,
  PUBLIC_BASE_URL: 'https://aligor.aligor.workers.dev',
  SESSION_SECRET: 'session-secret-for-tests-0123456789',
  ADMIN_PASSWORD: 'test-admin-pass',
  ...extra,
});
const makeCtx = () => ({ promises: [], waitUntil(p) { this.promises.push(p); } });
const settle = ctx => Promise.all(ctx.promises);

const payload = (extra = {}) => ({
  name: 'Siti Aminah', phone: '012-345 6789', batch: 'PREVIEW-1007', course: COURSE_1,
  used_ai_agent: '有，曾经试过', ai_tools: ['ChatGPT', 'Claude'], ai_tools_other: 'Gemini',
  company: 'Aminah Bakery', industry: '餐饮', goal: '想自动回复顾客', consent: true, ...extra,
});
async function submit(env, ctx, data) {
  return worker.fetch(new Request('https://aligor.aligor.workers.dev/api/leads', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
  }), env, ctx);
}
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const decodeWa = url => decodeURIComponent(new URL(url).searchParams.get('text'));

test('1. valid registration is written to D1 and logged', async () => {
  const env = makeEnv(), ctx = makeCtx();
  const res = await submit(env, ctx, payload()); await settle(ctx);
  assert.equal(res.status, 201);
  const lead = rows(env, 'SELECT * FROM leads')[0];
  assert.equal(lead.phone_e164, '60123456789');
  assert.equal(lead.course, COURSE_1);
  assert.equal(lead.status, 'new');
  assert.ok(rows(env, "SELECT * FROM lead_events WHERE event_type='submitted'").length === 1);
});

test('2. invalid phone number is rejected and nothing is saved or sent', async () => {
  const env = makeEnv(), ctx = makeCtx();
  const res = await submit(env, ctx, payload({ phone: '12345' })); await settle(ctx);
  assert.equal(res.status, 400);
  assert.equal(rows(env, 'SELECT * FROM leads').length, 0);
  assert.equal(telegramCalls.length, 0);
});

test('3. registration without WhatsApp consent is rejected', async () => {
  const env = makeEnv(), ctx = makeCtx();
  const res = await submit(env, ctx, payload({ consent: false })); await settle(ctx);
  assert.equal(res.status, 400);
  assert.equal(rows(env, 'SELECT * FROM leads').length, 0);
  assert.equal(telegramCalls.length, 0);
});

test('4. Telegram payload has the complete registration data and the unmasked number', async () => {
  const env = makeEnv(), ctx = makeCtx();
  await submit(env, ctx, payload()); await settle(ctx);
  assert.equal(telegramCalls.length, 1);
  const call = telegramCalls[0];
  assert.equal(call.method, 'sendMessage');
  assert.equal(call.body.chat_id, '111');
  assert.equal(call.body.parse_mode, 'HTML');
  const lead = rows(env, 'SELECT * FROM leads')[0];
  const text = call.body.text;
  for (const expected of [
    '🔔 新报名｜免费AI Preview', `报名ID：#${lead.id}`, '姓名：Siti Aminah', 'WhatsApp：60123456789',
    `课程／场次：${COURSE_1}`, '批次：PREVIEW-1007', '公司：Aminah Bakery', '行业：餐饮', '用过AI Agent：有，曾经试过',
    '目前使用的AI工具：ChatGPT, Claude、Gemini', '想让AI解决的问题：想自动回复顾客',
    `报名时间：${formatMalaysiaTime(lead.created_at)}`, '📋 WhatsApp回复（直接复制）',
  ]) assert.ok(text.includes(expected), `missing: ${expected}`);
  assert.ok(!text.includes('***'), 'phone number must not be masked');
  assert.ok(!JSON.stringify(call.body).includes('TEST_BOT_TOKEN_123'), 'token must not be in the payload body');
});

test('4b. empty optional fields show 未填写 and time is Malaysia UTC+8', () => {
  assert.equal(formatMalaysiaTime('2026-10-06T13:05:00.000Z'), '2026-10-06 21:05（马来西亚时间 UTC+8）');
  assert.equal(formatMalaysiaTime('2026-10-06T17:30:00.000Z'), '2026-10-07 01:30（马来西亚时间 UTC+8）');
  const lead = { id: 5, name: 'Ali', phone_e164: '60111111111', course: COURSE_2, batch: 'PREVIEW-1014', created_at: '2026-10-06T13:05:00.000Z' };
  const { text } = buildLeadNotification(lead, makeEnv());
  for (const label of ['公司：未填写', '行业：未填写', '用过AI Agent：未填写', '目前使用的AI工具：未填写', '想让AI解决的问题：未填写']) assert.ok(text.includes(label), label);
});

test('5. Telegram carries a copyable WhatsApp reply built from the saved course', async () => {
  const env = makeEnv(), ctx = makeCtx();
  await submit(env, ctx, payload({ course: COURSE_2, batch: 'PREVIEW-1014' })); await settle(ctx);
  const text = telegramCalls[0].body.text;
  const expected = `Hi Siti Aminah，你报名的 ${COURSE_2} 已经成功了 👍\n\n请先加入这个WhatsApp Group，我会在里面发送上课链接和提醒：\n${GROUP}\n\n到时见。`;
  assert.ok(text.includes(`<pre>${expected.replace(/&/g, '&amp;')}</pre>`));
  assert.ok(!text.includes(COURSE_1), 'must not mention the other session');
});

test('6. wa.me button uses the customer number and the exact prefilled reply', async () => {
  const env = makeEnv(), ctx = makeCtx();
  await submit(env, ctx, payload()); await settle(ctx);
  const keyboard = telegramCalls[0].body.reply_markup.inline_keyboard;
  const wa = keyboard[0][0];
  assert.equal(wa.text, '打开WhatsApp顾客');
  assert.ok(wa.url.startsWith('https://wa.me/60123456789?text='));
  assert.equal(decodeWa(wa.url), buildCustomerMessage(rows(env, 'SELECT * FROM leads')[0], env));
  const lead = rows(env, 'SELECT * FROM leads')[0];
  assert.deepEqual(keyboard[1].map(b => [b.text, b.callback_data]), [['标记已联系', `status:${lead.id}:contacted`], ['标记已确认', `status:${lead.id}:registered`]]);
  assert.deepEqual([keyboard[2][0].text, keyboard[2][0].url], ['打开Aligor后台 /4916', 'https://aligor.aligor.workers.dev/4916']);
  assert.ok(wa.url.length <= 2000);
});

test('7. special characters are escaped for Telegram HTML', async () => {
  const env = makeEnv(), ctx = makeCtx();
  await submit(env, ctx, payload({ name: 'A<b>li & "Co" \'x\'', company: '<script>alert(1)</script>', goal: 'a < b && c > d' })); await settle(ctx);
  const text = telegramCalls[0].body.text;
  assert.ok(!text.includes('<script>') && !text.includes('<b>li'));
  assert.ok(text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(text.includes('A&lt;b&gt;li &amp; &quot;Co&quot; &#39;x&#39;'));
  assert.ok(text.includes('a &lt; b &amp;&amp; c &gt; d'));
  const stripped = text.replace(/<\/?pre>/g, '');
  assert.ok(!/<[^>]+>/.test(stripped), 'only the pre tags may remain as raw HTML');
});

test('8. missing Telegram config does not block the registration', async () => {
  const env = makeEnv({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }), ctx = makeCtx();
  const res = await submit(env, ctx, payload()); await settle(ctx);
  assert.equal(res.status, 201);
  assert.equal(telegramCalls.length, 0);
  assert.equal(rows(env, 'SELECT * FROM leads').length, 1);
  assert.equal(rows(env, "SELECT * FROM lead_events WHERE event_type='telegram_skipped'").length, 1);
});

test('9. Telegram failure keeps the registration and logs the error without the token', async () => {
  for (const handler of [
    () => { throw new Error('network down TEST_BOT_TOKEN_123'); },
    () => new Response('{"ok":false,"description":"Bad Request"}', { status: 400 }),
  ]) {
    installFetch(handler);
    const env = makeEnv(), ctx = makeCtx();
    const res = await submit(env, ctx, payload()); await settle(ctx);
    assert.equal(res.status, 201);
    assert.equal(rows(env, 'SELECT * FROM leads').length, 1);
    const failed = rows(env, "SELECT * FROM lead_events WHERE event_type='telegram_failed'");
    assert.equal(failed.length, 1);
    assert.ok(!failed[0].details.includes('TEST_BOT_TOKEN_123'));
    // the customer can retry safely: the same phone and batch updates the row instead of duplicating it
    await submit(env, makeCtx(), payload()).then(r => assert.equal(r.status, 201));
    assert.equal(rows(env, 'SELECT * FROM leads').length, 1);
  }
});

test('9b. works without ctx.waitUntil too', async () => {
  const env = makeEnv();
  const res = await submit(env, undefined, payload());
  assert.equal(res.status, 201);
  assert.equal(telegramCalls.length, 1);
});

test('10. missing or invalid group link never produces an empty or wrong link', async () => {
  for (const [value, warning] of [[undefined, 'WhatsApp Group链接尚未设置'], ['', 'WhatsApp Group链接尚未设置'], ['not a url', 'WhatsApp Group链接格式不正确']]) {
    installFetch();
    const env = makeEnv({ WHATSAPP_GROUP_URL: value }), ctx = makeCtx();
    await submit(env, ctx, payload()); await settle(ctx);
    const body = telegramCalls[0].body;
    assert.ok(body.text.includes(warning));
    assert.ok(!body.text.includes('chat.whatsapp.com') && !body.text.includes('undefined'));
    const message = decodeWa(body.reply_markup.inline_keyboard[0][0].url);
    assert.ok(!message.includes('Group') && !message.includes('undefined') && !message.includes('null'));
    assert.ok(message.includes('已经成功了') && message.endsWith('到时见。'));
  }
  assert.equal(groupLinkState({ WHATSAPP_GROUP_URL: GROUP }).state, 'ok');
});

async function webhook(env, update, secret = env.TELEGRAM_WEBHOOK_SECRET) {
  return worker.fetch(new Request('https://aligor.aligor.workers.dev/telegram/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update),
  }), env, makeCtx());
}
const callback = (chatId, data) => ({ callback_query: { id: 'cb1', data, message: { chat: { id: chatId } } } });

test('11. status buttons update D1 and write lead events; secret and chat id are enforced', async () => {
  const env = makeEnv(), ctx = makeCtx();
  await submit(env, ctx, payload()); await settle(ctx);
  const lead = rows(env, 'SELECT * FROM leads')[0];
  telegramCalls.length = 0;

  assert.equal((await webhook(env, callback(111, `status:${lead.id}:contacted`), 'wrong-secret')).status, 401);
  assert.equal(rows(env, 'SELECT status FROM leads')[0].status, 'new');
  await webhook(env, callback(999, `status:${lead.id}:contacted`));
  assert.equal(rows(env, 'SELECT status FROM leads')[0].status, 'new', 'other chats are ignored');

  assert.equal((await webhook(env, callback(111, `status:${lead.id}:contacted`))).status, 200);
  let row = rows(env, 'SELECT * FROM leads')[0];
  assert.equal(row.status, 'contacted'); assert.ok(row.last_contacted_at);
  assert.equal((await webhook(env, callback(111, `status:${lead.id}:registered`))).status, 200);
  assert.equal(rows(env, 'SELECT status FROM leads')[0].status, 'registered');
  const events = rows(env, "SELECT * FROM lead_events WHERE event_type='updated' ORDER BY id");
  assert.deepEqual(events.map(e => [e.actor, e.details]), [['telegram', 'status=contacted'], ['telegram', 'status=registered']]);
  assert.ok(telegramCalls.every(c => c.method === 'answerCallbackQuery'));

  await webhook(env, callback(111, `status:${lead.id}:hacked`));
  assert.equal(rows(env, 'SELECT status FROM leads')[0].status, 'registered', 'unknown statuses are ignored');
});

test('12. the mocked fetch blocks every non-Telegram host', async () => {
  await assert.rejects(() => fetch('https://wa.me/60123456789'), /UNMOCKED/);
  await assert.rejects(() => fetch('https://example.com'), /UNMOCKED/);
  const env = makeEnv(), ctx = makeCtx();
  await submit(env, ctx, payload()); await settle(ctx);
  assert.ok(telegramCalls.every(c => c.url === 'https://api.telegram.org/botTEST_BOT_TOKEN_123/sendMessage'));
});

test('13. a duplicate submit is labelled and does not create a second row', async () => {
  const env = makeEnv(), ctx = makeCtx();
  await submit(env, ctx, payload()); await submit(env, ctx, payload({ goal: '更新后的问题' })); await settle(ctx);
  assert.equal(rows(env, 'SELECT * FROM leads').length, 1);
  assert.equal(rows(env, "SELECT * FROM lead_events WHERE event_type='resubmitted'").length, 1);
  assert.ok(telegramCalls[1].body.text.startsWith('🔁 重复提交｜免费AI Preview'));
});

test('14. very long answers keep the Telegram button URL inside the limit', () => {
  const lead = { id: 9, name: '长'.repeat(80), phone_e164: '60123456789', course: COURSE_1.repeat(3), batch: 'B', created_at: '2026-10-06T13:05:00.000Z' };
  const { reply_markup } = buildLeadNotification(lead, makeEnv());
  assert.ok(reply_markup.inline_keyboard[0][0].url.length <= 2000);
  assert.ok(reply_markup.inline_keyboard[0][0].url.startsWith('https://wa.me/60123456789'));
});
