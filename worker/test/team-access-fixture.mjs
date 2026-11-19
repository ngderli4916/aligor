// Synthetic-only helpers for the team dashboard: an in-memory D1 stand-in, a throwaway
// RSA key that signs Cloudflare Access-style JWTs, and fake lead rows. No real data or secrets.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const TEAM_DOMAIN = 'https://aligor-test.cloudflareaccess.com';
export const TEAM_AUD = 'synthetic-test-audience';
export const MEMBER = 'member@example.test';
export const STRANGER = 'stranger@example.test';

export function memoryDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) { const bound = args => ({
    first: async () => raw.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...args) }),
    run: async () => raw.prepare(sql).run(...args),
  }); return { ...bound([]), bind: (...args) => bound(args) }; } };
  return { raw, DB };
}

// Fake numbers in the 60100000xxx range; never real customers.
export function seedLeads(raw) {
  const add = raw.prepare('INSERT INTO leads(public_id,name,phone_e164,batch,course,company,industry,source,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const rows = [
    ['T001', '甲 同学', '60100000101', 'AI-AGENT-REGISTRATION', 'AI Agent Course', '示例贸易', '零售', 'ai-agent-registration', 'new', '2026-11-18T02:00:00.000Z'],
    ['T002', 'Beta Sample', '60100000202', 'AI-AGENT-REGISTRATION', 'AI Agent Course', 'Sample Works', 'Manufacturing', 'ai-agent-registration', 'contacted', '2026-11-19T05:30:00.000Z'],
    ['T003', 'Cancelled Person', '60100000303', 'AI-AGENT-REGISTRATION', 'AI Agent Course', 'Gone Co', 'F&B', 'ai-agent-registration', 'cancelled', '2026-11-19T06:00:00.000Z'],
    ['T004', 'Preview Only', '60100000404', 'PREVIEW-1118', 'Preview', 'Other Batch', 'Retail', 'aligor', 'new', '2026-11-19T07:00:00.000Z'],
    ['T005', 'Wrong Source', '60100000505', 'AI-AGENT-REGISTRATION', 'AI Agent Course', 'Imported', 'Retail', 'manual-import', 'new', '2026-11-19T08:00:00.000Z'],
    ['T006', 'Class Lead', '60100000606', 'CLASS-1126', 'One-day class', 'Class Co', 'Retail', 'ai-agent-registration', 'new', '2026-11-19T09:00:00.000Z'],
  ];
  for (const [id, name, phone, batch, course, company, industry, source, status, at] of rows) add.run(id, name, phone, batch, course, company, industry, source, status, at, at);
  return rows;
}

const b64url = bytes => Buffer.from(bytes).toString('base64url');

export async function accessKeys(kid = 'synthetic-kid') {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const certs = { keys: [{ kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] };
  async function sign(claims = {}, { headerKid = kid, alg = 'RS256' } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg, kid: headerKid, typ: 'JWT' }));
    const body = b64url(JSON.stringify({ iss: TEAM_DOMAIN, aud: [TEAM_AUD], email: MEMBER, type: 'app', iat: now, nbf: now, exp: now + 3600, ...claims }));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
  }
  return { certs, sign };
}

export const teamEnv = DB => ({ DB, TEAM_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, TEAM_ACCESS_AUD: TEAM_AUD, TEAM_DASHBOARD_EMAILS: `${MEMBER}, Lead.Two@example.test` });
