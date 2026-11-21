// /codexhermes-4hr-class/ opens only through the share link ?k=<PARTNER_COURSE_LINK_KEY>.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

const BASE = 'https://aligor.test';
const env = {
  SESSION_SECRET: 'session-secret-for-tests-0123456789', ADMIN_PASSWORD: 'adminpw-test', PARTNER_COURSE_LINK_KEY: 'link-key-test-123',
  ASSETS: { fetch: async req => new Response('<h1>SLIDES ' + new URL(req.url).pathname + '</h1>', { headers: { 'content-type': 'text/html' } }) },
};
const get = (path, cookie, e = env) => worker.fetch(new Request(BASE + path, { headers: cookie ? { cookie } : {} }), e, {});
const cookieOf = res => res.headers.get('set-cookie').split(';')[0];

test('without the link the slides stay closed', async () => {
  for (const path of ['/codexhermes-4hr-class', '/codexhermes-4hr-class/', '/codexhermes-4hr-class/01-opening.html', '/codexhermes-4hr-class/assets/js/course.js']) {
    const res = await get(path);
    assert.equal(res.status, 401, path);
    assert.ok(!(await res.text()).includes('SLIDES'), path);
  }
});

test('a wrong key does not open the slides', async () => {
  const res = await get('/codexhermes-4hr-class/?k=wrong');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.ok((await res.text()).includes('链接已失效'));
});

test('the share link opens the slides and the key leaves the address bar', async () => {
  for (const [path, target] of [['/codexhermes-4hr-class/?k=link-key-test-123', '/codexhermes-4hr-class/'], ['/codexhermes-4hr-class?k=link-key-test-123', '/codexhermes-4hr-class/']]) {
    const res = await get(path);
    assert.equal(res.status, 303, path);
    assert.equal(res.headers.get('location'), target);
    assert.ok(res.headers.get('set-cookie').includes('Path=/codexhermes-4hr-class'));
  }
  const cookie = cookieOf(await get('/codexhermes-4hr-class/?k=link-key-test-123'));
  const page = await get('/codexhermes-4hr-class/04-phase-3-company-role.html', cookie);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('SLIDES /codexhermes-4hr-class/04-phase-3-company-role.html'));
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('rotating the key revokes old links and old cookies', async () => {
  const cookie = cookieOf(await get('/codexhermes-4hr-class/?k=link-key-test-123'));
  const rotated = { ...env, PARTNER_COURSE_LINK_KEY: 'new-key-456' };
  assert.equal((await get('/codexhermes-4hr-class/', cookie, rotated)).status, 401);
  assert.equal((await get('/codexhermes-4hr-class/?k=link-key-test-123', '', rotated)).status, 401);
});

test('a course cookie is not an admin session', async () => {
  const token = cookieOf(await get('/codexhermes-4hr-class/?k=link-key-test-123')).split('=')[1];
  const list = await (await get('/list/', `aligor_session=${token}`)).text();
  assert.ok(!list.includes('SLIDES') && list.includes('name="password"'));
});

test('slides stay closed while the link key is not set', async () => {
  const { PARTNER_COURSE_LINK_KEY, ...noKey } = env;
  const res = await get('/codexhermes-4hr-class/?k=', '', noKey);
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes('SLIDES'));
});
