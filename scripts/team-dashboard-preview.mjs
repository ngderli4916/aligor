#!/usr/bin/env node
// Local preview of /team/ai-personal-assistant with SYNTHETIC data only (in-memory SQLite).
// It stands in for Cloudflare Access by signing a throwaway JWT for the chosen viewer;
// production code is unchanged and still verifies every token.
//   node --no-warnings scripts/team-dashboard-preview.mjs            # signed-in member
//   PREVIEW_AS=stranger node --no-warnings scripts/team-dashboard-preview.mjs
//   PREVIEW_AS=anon     node --no-warnings scripts/team-dashboard-preview.mjs
//   PREVIEW_AS=link     node --no-warnings scripts/team-dashboard-preview.mjs   # shared team link (#k=...)
// Open http://127.0.0.1:8799/team/ai-personal-assistant . The public form at /register-ai-agent
// writes to the same in-memory list, so "register, then press 刷新" can be tried locally.
import { createServer } from 'node:http';
import worker from '../worker/index.js';
import { TEAM_DOMAIN, MEMBER, STRANGER, memoryDb, seedLeads, accessKeys, teamEnv } from '../worker/test/team-access-fixture.mjs';

const PORT = Number(process.env.PORT || 8799), AS = process.env.PREVIEW_AS || 'member';
const { raw, DB } = memoryDb(); seedLeads(raw);
const keys = await accessKeys();
const LINK_KEY = 'local-preview-only-' + crypto.randomUUID().replaceAll('-', '');
const env = AS === 'link' ? { DB, TEAM_DASHBOARD_LINK_KEY: LINK_KEY } : teamEnv(DB);
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => String(url) === `${TEAM_DOMAIN}/cdn-cgi/access/certs` ? new Response(JSON.stringify(keys.certs)) : realFetch(url, opts);

createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
  headers.delete('cf-access-jwt-assertion');
  if (AS !== 'anon' && AS !== 'link') headers.set('cf-access-jwt-assertion', await keys.sign({ email: AS === 'stranger' ? STRANGER : MEMBER }));
  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const response = await worker.fetch(request, env, { waitUntil() {} });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => console.log(`Team board preview (${AS}, synthetic data): http://127.0.0.1:${PORT}/team/ai-personal-assistant${AS === 'link' ? `#k=${LINK_KEY}` : ''}`));
