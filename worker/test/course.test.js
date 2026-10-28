// node --no-warnings --test worker/test/course.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

const BASE = 'https://aligor.test';
const ASSETS = { fetch: async req => new Response(`<html>asset ${new URL(req.url).pathname}</html>`, { headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=3600' } }) };
const mk = (extra = {}) => ({ ASSETS, SESSION_SECRET: 'session-secret-for-tests-0123456789', COURSE_PASSWORD: 'open-sesame-test', ...extra });
const call = (env, path, init = {}) => worker.fetch(new Request(BASE + path, { redirect: 'manual', ...init }), env, { waitUntil() {} });
const login = (env, password, next) => call(env, '/api/course/login', { method: 'POST', body: new URLSearchParams({ password, ...(next ? { next } : {}) }) });
const cookieOf = res => res.headers.get('set-cookie').split(';')[0];

test('1. without login every /course page redirects to the password page', async () => {
  const env = mk();
  for (const p of ['/course/', '/course/c01-open.html', '/course/assets/course.css', '/course/anything']) {
    const r = await call(env, p); assert.equal(r.status, 302); assert.match(r.headers.get('location'), /^\/course\/login\?next=/);
  }
  assert.equal((await call(env, '/course')).status, 301);
});
test('2. wrong password: 401, no cookie, no content', async () => {
  const r = await login(mk(), 'nope'); assert.equal(r.status, 401); assert.equal(r.headers.get('set-cookie'), null);
  assert.ok((await r.text()).includes('密码不对'));
});
test('3. right password: cookie, then the asset is served with private/noindex headers', async () => {
  const env = mk(); const r = await login(env, 'open-sesame-test', '/course/c01-open.html');
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), '/course/c01-open.html');
  assert.match(r.headers.get('set-cookie'), /HttpOnly/); assert.match(r.headers.get('set-cookie'), /Max-Age=43200/);
  const ok = await call(env, '/course/c01-open.html', { headers: { cookie: cookieOf(r) } });
  assert.equal(ok.status, 200); assert.ok((await ok.text()).includes('asset /course/c01-open.html'));
  assert.equal(ok.headers.get('cache-control'), 'private, no-store'); assert.match(ok.headers.get('x-robots-tag'), /noindex/);
});
test('4. the password never appears in any response', async () => {
  const env = mk(); const bad = await (await login(env, 'wrong')).text(); const page = await (await call(env, '/course/login')).text();
  assert.ok(!bad.includes('open-sesame-test') && !page.includes('open-sesame-test'));
});
test('5. tampered, expired, and admin cookies are refused', async () => {
  const env = mk(); const good = cookieOf(await login(env, 'open-sesame-test'));
  const [name, val] = good.split('='); const [exp, sig] = val.split('.');
  assert.equal((await call(env, '/course/', { headers: { cookie: `${name}=${Number(exp) + 99999}.${sig}` } })).status, 302);
  assert.equal((await call(env, '/course/', { headers: { cookie: `${name}=${Date.now() - 1000}.${sig}` } })).status, 302);
  assert.equal((await call(env, '/course/', { headers: { cookie: `${name}=${exp}.AAAA` } })).status, 302);
  assert.equal((await call(env, '/course/', { headers: { cookie: 'aligor_session=whatever.value' } })).status, 302);
  assert.equal((await call(env, '/course/', { headers: { cookie: good } })).status, 200);
});
test('6. if COURSE_PASSWORD is not set the whole area stays closed', async () => {
  const env = mk({ COURSE_PASSWORD: undefined });
  assert.equal((await login(env, '')).status, 503); assert.equal((await login(env, 'anything')).status, 503);
  const page = await (await call(env, '/course/login')).text(); assert.ok(page.includes('还没有设置密码'));
  assert.equal((await call(env, '/course/')).status, 302);
});
test('7. "next" cannot send people to another site', async () => {
  const env = mk();
  for (const evil of ['https://evil.test/', '//evil.test', '/register', '/course//evil.test', 'javascript:alert(1)']) {
    const r = await login(env, 'open-sesame-test', evil); assert.equal(r.headers.get('location'), '/course/', evil);
  }
});
test('8. logout clears the cookie; other routes are untouched', async () => {
  const env = mk(); const out = await call(env, '/api/course/logout', { method: 'POST' });
  assert.equal(out.status, 303); assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await call(env, '/health')).status, 200);
});
