// Run from the repo root: node --no-warnings --test worker/test/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import worker from '../index.js';

const BASE = 'https://aligor.test';
const SURVEY_SCHEMA = `
CREATE TABLE course_survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL DEFAULT '',
  course_date TEXT NOT NULL,
  cohort TEXT NOT NULL,
  practical_learning INTEGER NOT NULL,
  overall_satisfaction INTEGER NOT NULL,
  ai_agent_confidence INTEGER NOT NULL,
  course_length TEXT NOT NULL,
  teaching_speed TEXT NOT NULL,
  unnecessary_content INTEGER NOT NULL,
  example_amount TEXT NOT NULL,
  hands_on_time INTEGER NOT NULL,
  explanation_clarity INTEGER NOT NULL,
  helpful_parts TEXT NOT NULL,
  difficult_parts TEXT NOT NULL,
  reduce_topics TEXT NOT NULL DEFAULT '',
  work_applicability INTEGER NOT NULL,
  first_use TEXT NOT NULL DEFAULT '',
  recommend_score INTEGER NOT NULL,
  improvement TEXT NOT NULL DEFAULT '',
  testimonial TEXT NOT NULL DEFAULT '',
  publicity_consent TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE course_survey_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  course_date TEXT NOT NULL,
  cohort TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  whatsapp_message_id TEXT
);`;

const TOKEN = 'A'.repeat(43);
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(SURVEY_SCHEMA);
  db.prepare('INSERT INTO course_survey_invites(token_hash,student_name,phone_normalized,course_date,cohort,created_at) VALUES(?,?,?,?,?,?)').run(TOKEN_HASH, '测试学生', '60123456789', '2026-10-18', 'Aligor AI Agent – Cohort 01', '2026-10-18T00:00:00.000Z');
  return {
    raw: db,
    prepare(sql) {
      let params = [];
      const st = {
        bind(...values) { params = values; return st; },
        async run() { const result = db.prepare(sql).run(...params); return { success: true, meta: { changes: result.changes } }; },
        async first() { return db.prepare(sql).get(...params) ?? null; },
        async all() { return { results: db.prepare(sql).all(...params) }; }
      };
      return st;
    }
  };
}

const makeEnv = () => ({ DB: makeDb() });
async function call(env, method, path, body) {
  return worker.fetch(new Request(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env, { waitUntil() {} });
}

const valid = (overrides = {}) => ({
  t: TOKEN,
  practical_learning: 5,
  overall_satisfaction: 4,
  ai_agent_confidence: 4,
  course_length: 'just_right',
  teaching_speed: 'just_right',
  unnecessary_content: 2,
  example_amount: 'just_right',
  hands_on_time: 3,
  explanation_clarity: 4,
  helpful_parts: ['telegram', 'whatsapp'],
  difficult_parts: ['github_cloudflare'],
  reduce_topics: '可以减少重复例子',
  work_applicability: 5,
  first_use: '自动回复顾客',
  recommend_score: 5,
  improvement: '增加实作时间',
  testimonial: '今天终于知道怎样把 AI Agent 用在生意里。',
  publicity_consent: 'anonymous_only',
  ...overrides
});

test('personal survey link shows the student name without a name field', async () => {
  const response = await call(makeEnv(), 'GET', `/survey?t=${TOKEN}`);
  const page = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.ok(page.includes('AI Agent一天实战课程｜学员反馈调查'));
  for (const text of ['大约需要2分钟完成', '课程时间怎么样', '不必要的内容', '例子数量', '实际操作的时间', '用于宣传']) assert.ok(page.includes(text), text);
  assert.ok(page.includes('name="viewport"'));
  assert.ok(page.includes('action="/api/survey"'));
  assert.ok(page.includes('测试学生，你好'));
  assert.ok(!page.includes('name="student_name"'));
});

test('survey page rejects missing or invalid personal links', async () => {
  for (const path of ['/survey', '/survey?t=invalid']) {
    const response = await call(makeEnv(), 'GET', path);
    assert.equal(response.status, 404);
    assert.ok((await response.text()).includes('链接无效'));
  }
});

test('valid response uses identity from the personal link, not submitted identity', async () => {
  const env = makeEnv();
  const response = await call(env, 'POST', '/api/survey', valid({ student_name: '冒充名字' }));
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.ok, true);
  assert.match(data.submission_id, /^AISV-[A-Z0-9]{8}$/);
  const row = env.DB.raw.prepare('SELECT * FROM course_survey_responses').get();
  assert.equal(row.submission_id, data.submission_id);
  assert.equal(row.course_date, '2026-10-18');
  assert.equal(row.cohort, 'Aligor AI Agent – Cohort 01');
  assert.equal(row.student_name, '测试学生');
  assert.deepEqual(JSON.parse(row.helpful_parts), ['telegram', 'whatsapp']);
  assert.equal(row.publicity_consent, 'anonymous_only');
});

test('survey validates required answers, ranges and allowed options', async () => {
  const env = makeEnv();
  for (const payload of [
    valid({ practical_learning: 6 }),
    valid({ course_length: 'forever' }),
    valid({ helpful_parts: [] }),
    valid({ publicity_consent: 'yes_to_everything' }),
    valid({ t: 'invalid' })
  ]) {
    const response = await call(env, 'POST', '/api/survey', payload);
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.ok(data.error);
  }
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) count FROM course_survey_responses').get().count, 0);
});

test('same idempotency key cannot create duplicate survey responses', async () => {
  const env = makeEnv();
  const first = await call(env, 'POST', '/api/survey', valid());
  const second = await call(env, 'POST', '/api/survey', valid());
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).submission_id, (await second.json()).submission_id);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) count FROM course_survey_responses').get().count, 1);
});
