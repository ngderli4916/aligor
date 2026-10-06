import { htmlEscape, waUrl } from './lib.js';

export const DEFAULT_BASE_URL = 'https://aligor.aligor.workers.dev';
const GROUP_URL_PATTERN = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+(\?\S*)?$/;
const TELEGRAM_BUTTON_URL_LIMIT = 2000;

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

function safeWhatsappUrl(phone, message) {
  const url = waUrl(phone, message);
  return url.length > TELEGRAM_BUTTON_URL_LIMIT ? `https://wa.me/${String(phone).replace(/\D/g, '')}` : url;
}

const orEmpty = (value, fallback = '未填写') => (String(value || '').trim() ? String(value).trim() : fallback);

export function buildLeadNotification(lead, env, { resubmitted = false } = {}) {
  const message = buildCustomerMessage(lead, env);
  const group = groupLinkState(env);
  const tools = [lead.ai_tools, lead.ai_tools_other].filter(Boolean).join('、');
  const base = String(env?.PUBLIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const e = htmlEscape;
  const lines = [
    resubmitted ? '🔁 重复提交｜免费AI Preview' : '🔔 新报名｜免费AI Preview',
    '',
    `报名ID：#${e(lead.id)}`,
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
  if (group.state === 'missing') lines.push('', '⚠️ WhatsApp Group链接尚未设置');
  if (group.state === 'invalid') lines.push('', '⚠️ WhatsApp Group链接格式不正确');
  lines.push('', '📋 WhatsApp回复（直接复制）', '', `<pre>${e(message)}</pre>`);
  // Status buttons use Telegram callbacks, which go to whichever service owns the bot's webhook.
  // When the bot is shared with the personal assistant (Hermes), that is not this Worker, so they stay off
  // unless TELEGRAM_STATUS_BUTTONS=on is set for a bot whose webhook points at /telegram/webhook.
  const statusRow = String(env?.TELEGRAM_STATUS_BUTTONS || '').toLowerCase() === 'on' ? [[
    { text: '标记已联系', callback_data: `status:${lead.id}:contacted` },
    { text: '标记已确认', callback_data: `status:${lead.id}:registered` },
  ]] : [];
  const reply_markup = {
    inline_keyboard: [
      [{ text: '打开WhatsApp顾客', url: safeWhatsappUrl(lead.phone_e164, message) }],
      ...statusRow,
      [{ text: '打开Aligor后台 /4916', url: `${base}/4916` }],
    ],
  };
  return { text: lines.join('\n'), reply_markup, message };
}

export function redactSecrets(text, env) {
  let out = String(text ?? '');
  for (const secret of [env?.TELEGRAM_BOT_TOKEN, env?.TELEGRAM_WEBHOOK_SECRET, env?.ADMIN_PASSWORD, env?.SESSION_SECRET]) {
    if (secret) out = out.split(String(secret)).join('[redacted]');
  }
  return out;
}
