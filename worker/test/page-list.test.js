import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../list/index.html', import.meta.url), 'utf8');

test('internal page list includes every reusable Preview and class-registration entry', () => {
  for (const path of ['/register', '/classregister', '/preview-live', '/preview-countdown/', '/4916']) {
    assert.ok(html.includes(`href="${path}"`), `missing ${path}`);
  }
  assert.ok(html.includes('Preview Zoom 入场验证'));
  assert.ok(html.includes('输入报名 WhatsApp 号码'));
  assert.equal((html.match(/href="\/preview-countdown\/"/g) || []).length, 1, 'countdown link is not duplicated');
  assert.ok(html.includes('Last updated: 2026-11-11.'));
});
