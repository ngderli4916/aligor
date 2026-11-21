// /codexhermes-4hr-class/ is behind its own course password (PARTNER_COURSE_PASSWORD).
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

const BASE = 'https://aligor.test';
const env = {
  SESSION_SECRET: 'session-secret-for-tests-0123456789', ADMIN_PASSWORD: 'adminpw-test', PARTNER_COURSE_PASSWORD: 'course-pw-test',
  ASSETS: { fetch: async req => new Response('<h1>SLIDES ' + new URL(req.url).pathname + '</h1>', { headers: { 'content-type': 'text/html' } }) },
};
const get = (path, cookie, e = env) => worker.fetch(new Request(BASE + path, { headers: cookie ? { cookie } : {} }), e, {});
const login = (password, e = env) => {
  const body = new FormData(); body.set('password', password);
  return worker.fetch(new Request(BASE + '/api/codexhermes-4hr-class/login', { method: 'POST', body }), e, {});
};

test('without a session the slides show the password form', async () => {
  for (const path of ['/codexhermes-4hr-class', '/codexhermes-4hr-class/', '/codexhermes-4hr-class/01-opening.html', '/codexhermes-4hr-class/assets/js/x.js']) {
    const res = await get(path);
    const body = await res.text();
    assert.equal(res.status, 401, path);
    assert.ok(!body.includes('SLIDES') && body.includes('name="password"'), path);
  }
});

test('the course password opens the slides', async () => {
  const bad = await login('wrong');
  assert.equal(bad.status, 401);
  assert.ok((await bad.text()).includes('密码不正确'));
  const ok = await login('course-pw-test');
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/codexhermes-4hr-class/');
  assert.ok(ok.headers.get('set-cookie').includes('Path=/codexhermes-4hr-class'));
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  const page = await get('/codexhermes-4hr-class/04-phase-3-company-role.html', cookie);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('SLIDES /codexhermes-4hr-class/04-phase-3-company-role.html'));
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('the admin password does not open the slides, and a course cookie is not an admin session', async () => {
  assert.equal((await login('adminpw-test')).status, 401);
  const cookie = (await login('course-pw-test')).headers.get('set-cookie').split(';')[0];
  const token = cookie.split('=')[1];
  const list = await (await get('/list/', `aligor_session=${token}`)).text();
  assert.ok(!list.includes('SLIDES') && list.includes('name="password"'));
});

test('slides stay closed while the course password is not set', async () => {
  const { PARTNER_COURSE_PASSWORD, ...noPw } = env;
  const res = await get('/codexhermes-4hr-class/', '', noPw);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes('SLIDES'));
  assert.equal((await login('', noPw)).status, 503);
});
