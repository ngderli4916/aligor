import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker from '../index.js';
import { memoryDb, seedLeads } from './team-access-fixture.mjs';

const page = async (env, q = '') => (await worker.fetch(new Request('https://course.test/register-ai-agent' + q), env, { waitUntil() {} })).text();

test('registration page shows only the course headcount, never names or phones', async () => {
  const { raw, DB } = memoryDb(); seedLeads(raw);
  const zh = await page({ DB });
  assert.match(zh, /<p class="headcount" data-count="2">目前已有 <strong>2<\/strong> 人报名<\/p>/);
  for (const leak of ['甲 同学', 'Beta Sample', '60100000', 'Cancelled Person', 'Sample Works']) assert.ok(!zh.includes(leak), leak);
  const en = await page({ DB }, '?lang=en');
  assert.match(en, /<strong>2<\/strong> people have registered so far/);
  raw.prepare("UPDATE leads SET status='cancelled' WHERE public_id='T002'").run();
  assert.match(await page({ DB }, '?lang=en'), /<strong>1<\/strong> person has registered so far/);
});

test('headcount hides itself when zero or when the database fails', async (t) => {
  const { DB } = memoryDb();
  assert.doesNotMatch(await page({ DB }), /class="headcount"/);
  const errors = []; t.mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
  const broken = { prepare() { throw new Error('D1 down 60123456789'); } };
  const r = await worker.fetch(new Request('https://course.test/register-ai-agent'), { DB: broken }, { waitUntil() {} });
  assert.equal(r.status, 200);
  assert.doesNotMatch(await r.text(), /class="headcount"/);
  assert.ok(errors.every(e => !e.includes('60123456789')));
});

test('registration page script still parses', async () => {
  const { raw, DB } = memoryDb(); seedLeads(raw);
  const html = await page({ DB });
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
