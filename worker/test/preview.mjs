// Prints a fake Telegram notification. Nothing is sent: this only calls the pure builder function.
import { buildLeadNotification } from '../notify.js';
const lead = { id: 3, name: 'NG DER LI', phone_e164: '60167871902', course: '免费 AI Preview · 10 月 7 日（星期三）8 PM – 9 PM', batch: 'PREVIEW-1007',
  company: '', industry: '', used_ai_agent: '有，曾经试过', ai_tools: 'ChatGPT, Claude, Gemini, DeepSeek, Codex', ai_tools_other: '', goal: '', created_at: '2026-10-06T03:58:00.000Z' };
console.log(buildLeadNotification(lead, {}).text);
