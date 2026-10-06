// Prints a fake Telegram notification. Nothing is sent: this only calls the pure builder functions.
import { buildLeadNotification } from '../notify.js';
const lead = { id: 12, name: 'Siti Aminah', phone_e164: '60123456789', course: '免费 AI Preview · 10 月 7 日（星期三）8 PM – 9 PM', batch: 'PREVIEW-1007',
  company: 'Aminah Bakery', industry: '餐饮', used_ai_agent: '有，曾经试过', ai_tools: 'ChatGPT, Claude', ai_tools_other: '', goal: '想自动回复顾客，不想漏掉任何一个询问', created_at: '2026-10-06T13:05:00.000Z' };
const env = { WHATSAPP_GROUP_URL: 'https://chat.whatsapp.com/EXAMPLEGROUPCODE', PUBLIC_BASE_URL: 'https://aligor.aligor.workers.dev' };
const { text, reply_markup, message } = buildLeadNotification(lead, env);
console.log('=== TELEGRAM（HTML 源码）===\n' + text + '\n\n=== 按钮 ===');
for (const row of reply_markup.inline_keyboard) console.log(row.map(b => `[${b.text}] ${b.url ? b.url.slice(0, 90) + (b.url.length > 90 ? '…' : '') : b.callback_data}`).join('  |  '));
console.log('\n=== 顾客 WhatsApp 信息 ===\n' + message);
