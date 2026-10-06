import { htmlEscape } from './lib.js';

const GROUP_URL_PATTERN = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+(\?\S*)?$/;

export function groupLinkState(env) {
  const raw = String(env?.WHATSAPP_GROUP_URL || '').trim();
  if (!raw) return { state: 'missing' };
  if (!GROUP_URL_PATTERN.test(raw)) return { state: 'invalid' };
  return { state: 'ok', url: raw };
}

// The reply Adrian copies or opens in WhatsApp. The session is read from lead.course, never guessed.
export function buildCustomerMessage(lead, env) {
  const group = groupLinkState(env);
  const lines = [`Hi ${lead.name}，你报名的 ${lead.course} 已经成功了 👍`, ''];
  if (group.state === 'ok') lines.push('请先加入这个WhatsApp Group，我会在里面发送上课链接和提醒：', group.url, '');
  lines.push('到时见。');
  return lines.join('\n');
}

// Malaysia is UTC+8 with no daylight saving, so a fixed offset is exact.
export function formatMalaysiaTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso || '');
  const t = new Date(date.getTime() + 8 * 3600e3), p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}（马来西亚时间 UTC+8）`;
}

const orEmpty = (value, fallback = '未填写') => (String(value || '').trim() ? String(value).trim() : fallback);

// Public lead code used everywhere Adrian and his agent look at a lead: AIPR00003, AIPR00004, ...
export function leadCode(id) {
  return `AIPR${String(Number(id) || 0).padStart(5, '0')}`;
}

// Accepts "AIPR00003", "#aipr3" or "3" and returns the numeric id, or null.
export function parseLeadCode(text) {
  const match = String(text || '').trim().match(/^#?(?:AIPR)?0*(\d+)$/i);
  return match ? Number(match[1]) : null;
}

// Compact message for Adrian's assistant bot. Everything after this is handled by his agent.
export function buildLeadNotification(lead, env, { resubmitted = false } = {}) {
  const tools = [lead.ai_tools, lead.ai_tools_other].filter(Boolean).join('、');
  const e = htmlEscape;
  const lines = [
    resubmitted ? '🔁 重复提交｜免费AI Preview' : '🔔 新报名｜免费AI Preview',
    `报名ID：#${leadCode(lead.id)}`,
    `姓名：${e(lead.name)}`,
    `WhatsApp：${e(lead.phone_e164)}`,
    `课程／场次：${e(lead.course)}`,
    `批次：${e(lead.batch)}`,
    `公司：${e(orEmpty(lead.company))}`,
    `行业：${e(orEmpty(lead.industry))}`,
    `用过AI Agent：${e(orEmpty(lead.used_ai_agent))}`,
    `目前使用的AI工具：${e(orEmpty(tools))}`,
    `想让AI解决的问题：${e(orEmpty(lead.goal))}`,
    `报名时间：${e(formatMalaysiaTime(lead.created_at))}`,
  ];
  return { text: lines.join('\n') };
}

export function redactSecrets(text, env) {
  let out = String(text ?? '');
  for (const secret of [env?.TELEGRAM_BOT_TOKEN, env?.TELEGRAM_WEBHOOK_SECRET, env?.ADMIN_PASSWORD, env?.SESSION_SECRET]) {
    if (secret) out = out.split(String(secret)).join('[redacted]');
  }
  return out;
}
