// /list/ is behind the same admin password and session as /4916.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

const BASE = 'https://aligor.test';
const env = {
  SESSION_SECRET: 'session-secret-for-tests-0123456789', ADMIN_PASSWORD: 'adminpw-test',
  ASSETS: { fetch: async () => new Response('<h1>LIST PAGE</h1>', { headers: { 'content-type': 'text/html' } }) },
};
const get = (path, cookie) => worker.fetch(new Request(BASE + path, { headers: cookie ? { cookie } : {} }), env, {});
const login = (password, next) => worker.fetch(new Request(BASE + '/api/admin/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password, next }) }), env, {});

test('/list/ without a session shows the password form, not the list', async () => {
  for (const path of ['/list', '/list/', '/list/index.html']) {
    const body = await (await get(path)).text();
    assert.ok(!body.includes('LIST PAGE'), path);
    assert.ok(body.includes('name="password"') && body.includes('name="next" value="/list/"'), path);
  }
});

test('the admin password opens /list/ and goes back there', async () => {
  const bad = await login('wrong', '/list/');
  assert.ok((await bad.text()).includes('密码不正确'));
  const ok = await login('adminpw-test', '/list/');
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/list/');
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  const page = await get('/list/', cookie);
  assert.ok((await page.text()).includes('LIST PAGE'));
  assert.equal(page.headers.get('cache-control'), 'no-store');
});

test('login from /4916 still lands on /4916; next cannot point elsewhere', async () => {
  assert.equal((await login('adminpw-test')).headers.get('location'), '/4916');
  assert.equal((await login('adminpw-test', 'https://evil.example/')).headers.get('location'), '/4916');
});
