import { cleanText, csvEscape, htmlEscape } from './lib.js';
import { redactSecrets } from './notify.js';

export const REGIONS = ['JOHOR', 'SELANGOR', 'PENANG'];
// Server-side source of truth. Amounts are whole RM integers; the browser never supplies them.
export const PACKAGES = {
  solo_1pc: { title: '一个人 · 一台电脑', participants: 1, computers: 1, original: 399, discount: 0, final: 399 },
  pair_1pc: { title: '两个人 · 共用一台电脑', participants: 2, computers: 1, original: 698, discount: 199, final: 499 },
  pair_2pc: { title: '两个人 · 各带一台电脑', participants: 2, computers: 2, original: 798, discount: 99, final: 699 },
};
export const PAYMENT_STATUSES = ['awaiting_payment', 'payment_submitted', 'payment_confirmed', 'payment_rejected', 'cancelled'];
export const STATUS_LABELS = { awaiting_payment: '等待付款', payment_submitted: '已提交付款资料', payment_confirmed: '付款已确认', payment_rejected: '付款资料不符', cancelled: '已取消' };

const list = values => values.map(v => `'${v}'`).join(',');
export const CLASS_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS class_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_order_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  payment_token_hash TEXT NOT NULL UNIQUE,
  primary_name TEXT NOT NULL,
  primary_phone_normalized TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN (${list(REGIONS)})),
  package_code TEXT NOT NULL CHECK (package_code IN (${list(Object.keys(PACKAGES))})),
  participant_count INTEGER NOT NULL CHECK (participant_count IN (1,2)),
  computer_count INTEGER NOT NULL CHECK (computer_count IN (1,2)),
  second_name TEXT,
  second_phone_normalized TEXT,
  original_amount INTEGER NOT NULL,
  discount_amount INTEGER NOT NULL,
  final_amount INTEGER NOT NULL,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (payment_status IN (${list(PAYMENT_STATUSES)})),
  registration_status TEXT NOT NULL DEFAULT 'registered' CHECK (registration_status IN ('registered','cancelled')),
  telegram_notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (telegram_notification_status IN ('pending','sending','sent','failed','skipped')),
  telegram_attempted_at TEXT,
  admin_notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  payment_submitted_at TEXT,
  payment_confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  'CREATE INDEX IF NOT EXISTS idx_class_reg_status ON class_registrations(payment_status, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_class_reg_phone ON class_registrations(primary_phone_normalized)',
  `CREATE TABLE IF NOT EXISTS class_registration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (registration_id) REFERENCES class_registrations(id)
)`,
  'CREATE INDEX IF NOT EXISTS idx_class_events_reg ON class_registration_events(registration_id, id)',
  `CREATE TRIGGER IF NOT EXISTS class_events_no_update BEFORE UPDATE ON class_registration_events BEGIN SELECT RAISE(ABORT,'class_registration_events is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS class_events_no_delete BEFORE DELETE ON class_registration_events BEGIN SELECT RAISE(ABORT,'class_registration_events is append-only'); END`,
];

const ensured = new WeakSet();
export async function ensureClassTables(env) {
  const db = env.DB;
  if (ensured.has(db)) return;
  for (const sql of CLASS_SCHEMA) await db.prepare(sql).run();
  ensured.add(db);
}

const nowIso = () => new Date().toISOString();
export const orderCode = id => `AICL${String(Number(id) || 0).padStart(5, '0')}`;
export function parseOrderCode(text) {
  const m = String(text || '').trim().match(/^#?AICL0*(\d+)$/i);
  return m ? Number(m[1]) : null;
}

// Accepts 0167871902, 60167871902, +60167871902 (spaces and dashes allowed). Malaysian mobile numbers only.
export function normalizeClassPhone(input) {
  const raw = String(input ?? '').trim();
  if (!/^\+?[\d\s\-()]+$/.test(raw)) throw new Error('请输入有效的马来西亚 WhatsApp 电话号码');
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  let out;
  if (hasPlus) out = digits;
  else if (digits.startsWith('60')) out = digits;
  else if (digits.startsWith('0')) out = `60${digits.slice(1)}`;
  else out = '';
  if (!/^601\d{8,9}$/.test(out)) throw new Error('请输入有效的马来西亚 WhatsApp 电话号码');
  return out;
}

export function validateRegistration(data) {
  const name = cleanText(data.name, 80);
  if (name.length < 2) throw new ClassError('请输入姓名');
  let phone;
  try { phone = normalizeClassPhone(data.phone); } catch (e) { throw new ClassError(e.message); }
  const region = String(data.region || '').trim().toUpperCase();
  if (!REGIONS.includes(region)) throw new ClassError('请选择上课地区');
  const pkgCode = String(data.package || data.package_code || '').trim();
  if (!Object.prototype.hasOwnProperty.call(PACKAGES, pkgCode)) throw new ClassError('请选择上课方式');
  const pkg = PACKAGES[pkgCode];
  let secondName = null, secondPhone = null;
  if (pkg.participants === 2) {
    secondName = cleanText(data.second_name, 80);
    if (secondName.length < 2) throw new ClassError('请填写第二位参加者姓名');
    try { secondPhone = normalizeClassPhone(data.second_phone); } catch { throw new ClassError('请填写第二位参加者有效的 WhatsApp 电话号码'); }
    if (secondPhone === phone) throw new ClassError('两位参加者需要使用不同的电话号码');
  }
  const key = String(data.idempotency_key || '').trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new ClassError('页面已过期，请刷新后再提交');
  return { name, phone, region, pkgCode, pkg, secondName, secondPhone, key,
    source: cleanText(data.source, 80), utm_source: cleanText(data.utm_source, 80), utm_medium: cleanText(data.utm_medium, 80), utm_campaign: cleanText(data.utm_campaign, 120) };
}

export class ClassError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Payment token = HMAC(server secret, idempotency key): unguessable without the secret, and a replayed submit
// returns the same link. Only its SHA-256 is stored.
export async function derivePaymentToken(env, key) {
  if (!env.SESSION_SECRET) throw new ClassError('系统暂时无法处理，请稍后重试', 500);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`classpay:${key}`))));
}
export const isTokenShape = t => /^[A-Za-z0-9_-]{43}$/.test(String(t || ''));

export async function addClassEvent(env, id, type, actor, details = '') {
  await env.DB.prepare('INSERT INTO class_registration_events(registration_id,event_type,actor,details,created_at) VALUES(?,?,?,?,?)').bind(id, type, actor, String(details).slice(0, 500), nowIso()).run();
}
async function safeClassEvent(env, id, type, actor, details) {
  try { await addClassEvent(env, id, type, actor, details); } catch (e) { console.error('class_event_failed', redactSecrets(e?.message, env)); }
}

const sameRegistration = (row, v) => row.primary_phone_normalized === v.phone && row.package_code === v.pkgCode && row.region === v.region && row.primary_name === v.name && (row.second_phone_normalized || null) === v.secondPhone;

const INSERT_SQL = `INSERT INTO class_registrations(public_order_id,idempotency_key,payment_token_hash,primary_name,primary_phone_normalized,region,package_code,participant_count,computer_count,second_name,second_phone_normalized,original_amount,discount_amount,final_amount,payment_status,registration_status,telegram_notification_status,source,utm_source,utm_medium,utm_campaign,created_at,updated_at)
VALUES((SELECT 'AICL'||printf('%05d',MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name='class_registrations'),0),COALESCE((SELECT MAX(id) FROM class_registrations),0))+1)),?,?,?,?,?,?,?,?,?,?,?,?,?,'awaiting_payment','registered','pending',?,?,?,?,?,?)`;

// Returns { row, token, created }. Safe to call twice with the same payload (browser retry, double click).
export async function createRegistration(env, data) {
  await ensureClassTables(env);
  const v = validateRegistration(data);
  const token = await derivePaymentToken(env, v.key);
  const existing = await env.DB.prepare('SELECT * FROM class_registrations WHERE idempotency_key=?').bind(v.key).first();
  if (existing) {
    if (!sameRegistration(existing, v)) throw new ClassError('页面已过期，请刷新后再提交', 409);
    return { row: existing, token, created: false };
  }
  // Same person, same details, within 10 minutes (e.g. refreshed page, new key): return the existing order.
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  const dup = await env.DB.prepare(`SELECT * FROM class_registrations WHERE primary_phone_normalized=? AND package_code=? AND region=? AND primary_name=? AND COALESCE(second_phone_normalized,'')=? AND registration_status='registered' AND payment_status IN ('awaiting_payment','payment_submitted') AND created_at>=? ORDER BY id DESC LIMIT 1`)
    .bind(v.phone, v.pkgCode, v.region, v.name, v.secondPhone || '', since).first();
  if (dup) return { row: dup, token: await derivePaymentToken(env, dup.idempotency_key), created: false };
  const hash = await sha256Hex(token), t = nowIso();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await env.DB.prepare(INSERT_SQL).bind(v.key, hash, v.name, v.phone, v.region, v.pkgCode, v.pkg.participants, v.pkg.computers, v.secondName, v.secondPhone, v.pkg.original, v.pkg.discount, v.pkg.final, v.source, v.utm_source, v.utm_medium, v.utm_campaign, t, t).run();
      break;
    } catch (e) {
      const msg = String(e?.message || '');
      if (!/UNIQUE/i.test(msg)) throw e;
      // A concurrent submit with the same key won the race (the token hash is derived from the key too).
      const row = await env.DB.prepare('SELECT * FROM class_registrations WHERE idempotency_key=?').bind(v.key).first();
      if (row) return { row, token, created: false };
      if (attempt === 2) throw e;
    }
  }
  const row = await env.DB.prepare('SELECT * FROM class_registrations WHERE idempotency_key=?').bind(v.key).first();
  await safeClassEvent(env, row.id, 'registration_created', 'customer', `package=${v.pkgCode} amount=RM${v.pkg.final}`);
  return { row, token, created: true };
}

export const paymentUrl = (env, request, token) => `${(env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')}/payment?t=${token}`;

// ---- Telegram (to Adrian only) ----
export function buildClassNotification(row, env) {
  const e = htmlEscape;
  const base = (env.PUBLIC_BASE_URL || 'https://aligor.aligor.workers.dev').replace(/\/$/, '');
  const lines = [
    '🔔 新的 Aligor 一天课程报名',
    `订单编号：${row.public_order_id}`,
    `联络人：${e(row.primary_name)}`,
    `WhatsApp：${e(row.primary_phone_normalized)}`,
    `地区：${e(row.region)}`,
    `配套：${e(PACKAGES[row.package_code]?.title || row.package_code)}`,
    `人数／电脑：${row.participant_count} 人／${row.computer_count} 台`,
  ];
  if (row.second_name) lines.push(`第二位：${e(row.second_name)}（${e(row.second_phone_normalized)}）`);
  lines.push(`原价：RM${row.original_amount}`, `优惠：RM${row.discount_amount}`, `应付：RM${row.final_amount}`, `付款状态：${STATUS_LABELS[row.payment_status] || row.payment_status}`, `后台：${base}/4916`);
  return lines.join('\n');
}

// Claims the row first so two concurrent calls (or a retry) can never send the same notification twice.
export async function notifyClassRegistration(env, id, actor = 'system') {
  await ensureClassTables(env);
  const staleBefore = new Date(Date.now() - 5 * 60e3).toISOString();
  const claim = await env.DB.prepare(`UPDATE class_registrations SET telegram_notification_status='sending',telegram_attempted_at=? WHERE id=? AND (telegram_notification_status IN ('pending','failed','skipped') OR (telegram_notification_status='sending' AND telegram_attempted_at<?))`).bind(nowIso(), id, staleBefore).run();
  if (!claim?.meta?.changes) return 'already_handled';
  const row = await env.DB.prepare('SELECT * FROM class_registrations WHERE id=?').bind(id).first();
  const setStatus = status => env.DB.prepare('UPDATE class_registrations SET telegram_notification_status=?,updated_at=? WHERE id=?').bind(status, nowIso(), id).run();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    await setStatus('skipped'); await safeClassEvent(env, id, 'telegram_notification_skipped', actor, 'missing_telegram_config'); return 'skipped';
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: buildClassNotification(row, env), parse_mode: 'HTML', disable_web_page_preview: true }) });
    if (!res.ok) throw new Error(`telegram_http_${res.status}`);
    await setStatus('sent'); await safeClassEvent(env, id, 'telegram_notification_sent', actor, ''); return 'sent';
  } catch (error) {
    const reason = redactSecrets(error?.message || error, env).slice(0, 200);
    console.error('class_telegram_failed', reason);
    try { await setStatus('failed'); } catch {}
    await safeClassEvent(env, id, 'telegram_notification_failed', actor, reason); return 'failed';
  }
}

// ---- Payment page (customer) ----
export async function findByToken(env, token) {
  if (!isTokenShape(token)) return null;
  await ensureClassTables(env);
  const row = await env.DB.prepare('SELECT * FROM class_registrations WHERE payment_token_hash=?').bind(await sha256Hex(token)).first();
  if (!row || row.registration_status === 'cancelled' || row.payment_status === 'cancelled') return null;
  return row;
}
export const publicPaymentView = row => ({ order_id: row.public_order_id, package_title: PACKAGES[row.package_code]?.title || '', participants: row.participant_count, computers: row.computer_count, original: row.original_amount, discount: row.discount_amount, amount: row.final_amount, status: row.payment_status, reference: row.payment_reference || '' });

export async function recordPaymentPageOpened(env, row) {
  const seen = await env.DB.prepare("SELECT 1 x FROM class_registration_events WHERE registration_id=? AND event_type='payment_page_opened' LIMIT 1").bind(row.id).first();
  if (!seen) await safeClassEvent(env, row.id, 'payment_page_opened', 'customer', '');
}

export function validReference(input) {
  const ref = cleanText(input, 60).replace(/\s+/g, ' ');
  if (ref.length < 4 || !/^[A-Za-z0-9][A-Za-z0-9 \-_/.#]*$/.test(ref)) throw new ClassError('请填写银行转账的付款参考编号（至少 4 个字符）');
  return ref;
}

// The customer can only move awaiting/rejected/submitted -> payment_submitted. Never to confirmed.
export async function submitPayment(env, token, referenceInput) {
  const row = await findByToken(env, token);
  if (!row) throw new ClassError('这个付款链接无效或已失效', 404);
  if (row.payment_status === 'payment_confirmed') throw new ClassError('这个订单的付款已经确认，不需要再提交', 409);
  const ref = validReference(referenceInput);
  if (row.payment_status === 'payment_submitted' && row.payment_reference === ref) return publicPaymentView(row);
  const t = nowIso();
  const res = await env.DB.prepare(`UPDATE class_registrations SET payment_reference=?,payment_status='payment_submitted',payment_submitted_at=?,updated_at=? WHERE id=? AND payment_status IN ('awaiting_payment','payment_rejected','payment_submitted') AND registration_status='registered'`).bind(ref, t, t, row.id).run();
  if (!res?.meta?.changes) throw new ClassError('这个订单目前不能提交付款资料', 409);
  await safeClassEvent(env, row.id, 'payment_submitted', 'customer', `before=${row.payment_status} after=payment_submitted ref=${ref}`);
  return publicPaymentView({ ...row, payment_status: 'payment_submitted', payment_reference: ref });
}

// ---- Admin ----
export async function listClassRegistrations(env, url) {
  await ensureClassTables(env);
  const f = [], b = [];
  const q = cleanText(url.searchParams.get('q'), 80), region = cleanText(url.searchParams.get('region'), 20).toUpperCase(), pkg = cleanText(url.searchParams.get('package'), 20), status = cleanText(url.searchParams.get('status'), 30);
  if (q) {
    const code = parseOrderCode(q);
    if (code) { f.push('id=?'); b.push(code); }
    else { const digits = q.replace(/\D/g, ''); f.push(`(primary_name LIKE ? OR second_name LIKE ?${digits ? ' OR primary_phone_normalized LIKE ? OR second_phone_normalized LIKE ?' : ''})`); b.push(`%${q}%`, `%${q}%`); if (digits) b.push(`%${digits}%`, `%${digits}%`); }
  }
  if (REGIONS.includes(region)) { f.push('region=?'); b.push(region); }
  if (PACKAGES[pkg]) { f.push('package_code=?'); b.push(pkg); }
  if (PAYMENT_STATUSES.includes(status)) { f.push('payment_status=?'); b.push(status); }
  const where = f.length ? `WHERE ${f.join(' AND ')}` : '';
  const rows = (await env.DB.prepare(`SELECT * FROM class_registrations ${where} ORDER BY id DESC LIMIT 500`).bind(...b).all()).results;
  const counts = (await env.DB.prepare('SELECT payment_status s,COUNT(*) n FROM class_registrations GROUP BY payment_status').all()).results;
  const confirmed = (await env.DB.prepare("SELECT COALESCE(SUM(final_amount),0) n FROM class_registrations WHERE payment_status='payment_confirmed'").first())?.n || 0;
  const stats = { total: 0, confirmed_amount: confirmed }; for (const c of counts) { stats[c.s] = c.n; stats.total += c.n; }
  return { registrations: rows.map(adminRow), stats };
}
export const adminRow = r => { const { payment_token_hash, idempotency_key, ...rest } = r; return { ...rest, package_title: PACKAGES[r.package_code]?.title || r.package_code, status_label: STATUS_LABELS[r.payment_status] || r.payment_status }; };

export async function classEvents(env, id) {
  await ensureClassTables(env);
  return (await env.DB.prepare('SELECT event_type,actor,details,created_at FROM class_registration_events WHERE registration_id=? ORDER BY id').bind(id).all()).results;
}

const FORMULA = /^[=+\-@\t\r]/;
export async function classCsv(env) {
  await ensureClassTables(env);
  const rows = (await env.DB.prepare('SELECT * FROM class_registrations ORDER BY id').all()).results;
  const cols = ['public_order_id', 'created_at', 'primary_name', 'primary_phone_normalized', 'region', 'package_code', 'participant_count', 'computer_count', 'second_name', 'second_phone_normalized', 'original_amount', 'discount_amount', 'final_amount', 'payment_reference', 'payment_status', 'registration_status', 'telegram_notification_status', 'payment_confirmed_at', 'admin_notes', 'source', 'utm_source', 'utm_medium', 'utm_campaign'];
  const cell = v => { const s = String(v ?? ''); return csvEscape(FORMULA.test(s) ? `'${s}` : s); };
  return '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
}

const ACTIONS = {
  confirm: { from: ['awaiting_payment', 'payment_submitted', 'payment_rejected'], to: 'payment_confirmed', event: 'payment_confirmed' },
  reject: { from: ['payment_submitted'], to: 'payment_rejected', event: 'payment_rejected' },
  cancel: { from: ['awaiting_payment', 'payment_submitted', 'payment_rejected', 'payment_confirmed'], to: 'cancelled', event: 'registration_cancelled' },
};
// Manual only. `confirm:true` must be sent explicitly (the admin UI asks twice before sending it).
export async function adminAction(env, id, action, body, adminName = 'admin') {
  await ensureClassTables(env);
  const rule = ACTIONS[action];
  if (!rule) throw new ClassError('不支持的操作', 404);
  if (body?.confirm !== true) throw new ClassError('需要二次确认', 400);
  const row = await env.DB.prepare('SELECT * FROM class_registrations WHERE id=?').bind(id).first();
  if (!row) throw new ClassError('找不到这笔报名', 404);
  if (!rule.from.includes(row.payment_status)) throw new ClassError(`目前状态（${STATUS_LABELS[row.payment_status]}）不能执行这个操作`, 409);
  const t = nowIso(), reg = action === 'cancel' ? 'cancelled' : row.registration_status;
  const res = await env.DB.prepare(`UPDATE class_registrations SET payment_status=?,registration_status=?,payment_confirmed_at=CASE WHEN ?='payment_confirmed' THEN ? ELSE payment_confirmed_at END,updated_at=? WHERE id=? AND payment_status=?`).bind(rule.to, reg, rule.to, t, t, id, row.payment_status).run();
  if (!res?.meta?.changes) throw new ClassError('状态刚刚被更改，请刷新后再试', 409);
  await addClassEvent(env, id, rule.event, adminName, `before=${row.payment_status} after=${rule.to}${body.note ? ` note=${cleanText(body.note, 200)}` : ''}`);
  return { ok: true, payment_status: rule.to };
}
export async function setClassNotes(env, id, notes) {
  await ensureClassTables(env);
  const res = await env.DB.prepare('UPDATE class_registrations SET admin_notes=?,updated_at=? WHERE id=?').bind(cleanText(notes, 1500), nowIso(), id).run();
  if (!res?.meta?.changes) throw new ClassError('找不到这笔报名', 404);
  await addClassEvent(env, id, 'notes_updated', 'admin', '');
}
