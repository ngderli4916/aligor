export const STATUSES = new Set(['new', 'contacted', 'registered', 'paid', 'attended', 'cancelled']);

export function normalizePhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `60${digits.slice(1)}`;
  if (!digits.startsWith('60') && digits.length >= 9 && digits.length <= 11) digits = `60${digits}`;
  if (!/^60\d{8,11}$/.test(digits)) throw new Error('请输入有效的马来西亚 WhatsApp 电话号码');
  return digits;
}

export function cleanText(value, max = 200) {
  return String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max);
}

export function maskPhone(phone) {
  const digits = String(phone || '');
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

export function waUrl(phone, message = '') {
  return `https://wa.me/${encodeURIComponent(String(phone || '').replace(/\D/g, ''))}?text=${encodeURIComponent(message)}`;
}

export function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

export function parseBotCommand(text) {
  const parts = String(text || '').trim().split(/\s+/);
  const command = (parts.shift() || '').split('@')[0].toLowerCase();
  return { command, args: parts };
}
