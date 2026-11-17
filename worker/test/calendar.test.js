// node --no-warnings --test worker/test/calendar.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

const BASE = 'https://aligor.test';
const env = { ASSETS: { fetch: async () => new Response('asset') } };
const call = path => worker.fetch(new Request(BASE + path), env, { waitUntil() {} });

test('universal calendar page shows the approved event and provider choices', async () => {
  const response = await call('/calendar/test');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const body = await response.text();
  assert.match(body, /Aligor AI Agent 实战课（测试）/);
  assert.match(body, /2026年11月19日（星期四）/);
  assert.match(body, /9AM\s*[–-]\s*7PM/);
  assert.match(body, /Google Calendar/);
  assert.match(body, /Apple \/ iPhone Calendar/);
  assert.match(body, /Outlook Calendar/);
  assert.match(body, /calendar\.google\.com\/calendar\/render\?/);
  assert.match(body, /\/calendar\/test\.ics/);
});

test('calendar ICS download contains the same Malaysia-time event', async () => {
  const response = await call('/calendar/test.ics');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/calendar/);
  assert.match(response.headers.get('content-disposition'), /aligor-ai-agent-test-2026-11-19\.ics/);
  const body = await response.text();
  assert.match(body, /BEGIN:VCALENDAR\r?\n/);
  assert.match(body, /DTSTART;TZID=Asia\/Kuala_Lumpur:20261119T090000/);
  assert.match(body, /DTEND;TZID=Asia\/Kuala_Lumpur:20261119T190000/);
  assert.match(body, /SUMMARY:Aligor AI Agent 实战课（测试）/);
  assert.match(body, /END:VCALENDAR\r?\n?$/);
});
