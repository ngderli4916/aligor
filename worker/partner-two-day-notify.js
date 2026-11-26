import { htmlEscape } from './lib.js';
import { formatMalaysiaTime } from './notify.js';
import { dispatchPartnerEvent } from './partner-webhook.js';
import { PARTNER_TWO_DAY_BANK, PARTNER_TWO_DAY_CLASS, PARTNER_TWO_DAY_MAX_SEATS, partnerTwoDayState } from './partner-two-day.js';

const EVENT = 'aligor.two-day-registration.created';
const referencePattern = /^2D-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const phonePattern = /^601[0-9]{8,9}$/;
const response = (status, data) => Response.json(data,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex','referrer-policy':'no-referrer'}});
const rm = n => 'RM'+n.toLocaleString('en-MY');

export async function notifyPartnerTwoDay(env,row,sendTelegram) {
  const telegram = async () => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('not configured');
    const e = htmlEscape;
    const r = await sendTelegram([
      `🔔 新报名｜${PARTNER_TWO_DAY_CLASS.title}`, `报名编号：#${e(row.reference)}`, `姓名：${e(row.name)}`,
      `WhatsApp：+${e(row.phone)}`, `人数：${row.seats} 位`, `应付：${rm(row.amount)}（待付款）`,
      `报名时间：${e(formatMalaysiaTime(row.createdAt))}`,
    ].join('\n'));
    if (!r?.ok || !(await r.json()).ok) throw new Error('not accepted');
  };
  const whatsapp = async () => {
    if (!await dispatchPartnerEvent(env,{event:EVENT,reference:row.reference},row.reference)) throw new Error('not accepted');
  };
  const results = await Promise.allSettled([telegram(),whatsapp()]);
  results.forEach((v,i)=>{if(v.status==='rejected')console.error('two_day_notice_unconfirmed',row.reference,i===0?'telegram':'whatsapp');});
}

// The trusted receiver reads payment instructions and status from the dedicated course store.
// D1 is not accessed without the server-to-server bearer; clients cannot override routing or templates.
export async function partnerTwoDayNoticeLookup(request,env) {
  const secret = env.PARTNER_SIGNUP_WEBHOOK_SECRET;
  const state = partnerTwoDayState(env);
  if (!state.whatsappNotices || !state.open || !secret) return response(404,{ok:false});
  const header = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  let same = header.length===expected.length ? 0 : 1;
  for (let i=0;i<expected.length;i++) same |= (header.charCodeAt(i)||0)^expected.charCodeAt(i);
  if (same) return response(401,{ok:false});
  if (new URL(request.url).search || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'') || !request.body) return response(400,{ok:false});
  let body;
  const reader=request.body.getReader();
  try {
    const chunks=[]; let size=0;
    while (true) {const {value,done}=await reader.read(); if(done)break; size+=value.byteLength;
      if(size>192){await reader.cancel();return response(400,{ok:false});} chunks.push(value);}
    body=JSON.parse(await new Blob(chunks).text());
  } catch {return response(400,{ok:false});}
  if (!body || Object.keys(body).length!==1 || typeof body.reference!=='string' || !referencePattern.test(body.reference)) return response(400,{ok:false});
  const row = await env.PARTNER_TWO_DAY_DB.prepare(`SELECT reference,contact_name,contact_phone,seats,amount_rm,created_at
    FROM signups WHERE reference=? AND status='pending_payment'`).bind(body.reference).first();
  if (!row) return response(404,{ok:false});
  if (!phonePattern.test(row.contact_phone) || !Number.isSafeInteger(row.amount_rm) || row.amount_rm<1 || !(Number.isInteger(row.seats)&&row.seats>=1&&row.seats<=PARTNER_TWO_DAY_MAX_SEATS) || !Number.isFinite(Date.parse(row.created_at))) return response(503,{ok:false});
  const c=PARTNER_TWO_DAY_CLASS, b=PARTNER_TWO_DAY_BANK;
  const customer = [
    `你好 ${row.contact_name}，我们已收到你「${c.title}」的报名，目前待付款。`, '',
    `报名编号：#${row.reference}`, `报名人数：${row.seats} 位`, `上课日期：${c.date}（暂定）`,
    `时间：${c.hours}`, `地点：${c.city}（${c.venueNote}）`, '', `应付金额：${rm(row.amount_rm)}`,
    `银行：${b.bank}`, `户名：${b.holder}`, `户口号码：${b.account}`,
    `转账备注请写 #${row.reference}。付款后请把凭证 WhatsApp 给 +${state.wa}（https://wa.me/${state.wa}）。我们核对款项后会确认名额。`,
  ].join('\n');
  const partner = [
    `🔔 新报名｜${c.title}`, `报名编号：#${row.reference}`, `第一位学员：${row.contact_name}`,
    `人数：${row.seats} 位`, `应付：${rm(row.amount_rm)}（待付款）`,
    `报名时间：${formatMalaysiaTime(row.created_at)}`,
  ].join('\n');
  return response(200,{reference:row.reference,createdAt:row.created_at,phone:row.contact_phone,customer,partner});
}
