const EVENT = Object.freeze({
  title: 'Aligor AI Agent 实战课（测试）',
  dateText: '2026年11月19日（星期四）',
  timeText: '9AM – 7PM',
  start: '20261119T090000',
  end: '20261119T190000',
  timezone: 'Asia/Kuala_Lumpur',
  location: '25, Jalan Pertama 4, Pusat Perdagangan Danga Utama, 81200 Johor Bahru, Johor',
  description: 'AI Agent 实体实战课程。请携带电脑和充电器。',
  uid: 'aligor-ai-agent-test-20261119@aligorvibe.com'
});

const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const icsEsc = value => String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');

export function googleCalendarUrl(event = EVENT) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${event.start}/${event.end}`,
    ctz: event.timezone,
    details: event.description,
    location: event.location
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function calendarIcs(event = EVENT) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aligor//Course Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    'DTSTAMP:20261117T024500Z',
    `DTSTART;TZID=${event.timezone}:${event.start}`,
    `DTEND;TZID=${event.timezone}:${event.end}`,
    `SUMMARY:${icsEsc(event.title)}`,
    `DESCRIPTION:${icsEsc(event.description)}`,
    `LOCATION:${icsEsc(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function calendarPage(origin, event = EVENT) {
  const google = googleCalendarUrl(event);
  const ics = `${origin}/calendar/test.ics`;
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>加入 Calendar｜Aligor</title><style>
:root{--wine:#6d1836;--gold:#c79b3b;--cream:#fbf5e9;--ink:#241a1e;--muted:#73666b}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#fff 0,var(--cream) 55%,#f1e2c9 100%);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{width:min(92vw,520px);margin:0 auto;padding:38px 0}.card{background:rgba(255,255,255,.94);border:1px solid rgba(109,24,54,.14);border-radius:24px;padding:28px;box-shadow:0 18px 55px rgba(72,34,38,.13)}.brand{color:var(--wine);font-weight:800;letter-spacing:.12em;font-size:13px}.eyebrow{margin-top:22px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.08em}.title{margin:8px 0 20px;font-size:clamp(26px,7vw,36px);line-height:1.18}.details{background:#fffaf2;border-radius:16px;padding:16px 18px;margin-bottom:24px}.row{display:grid;grid-template-columns:76px 1fr;gap:10px;padding:7px 0;font-size:15px}.row span:first-child{color:var(--muted)}.row strong{overflow-wrap:anywhere}.prompt{text-align:center;font-weight:700;margin:4px 0 14px}.buttons{display:grid;gap:12px}.button{display:flex;align-items:center;justify-content:center;min-height:54px;border-radius:14px;text-decoration:none;font-weight:800;padding:14px 16px;border:1px solid transparent}.google{background:var(--wine);color:white}.apple{background:#171717;color:white}.outlook{background:white;color:var(--wine);border-color:rgba(109,24,54,.3)}.note{margin:18px 4px 0;text-align:center;color:var(--muted);font-size:13px;line-height:1.55}.footer{text-align:center;margin-top:18px;color:var(--wine);font-size:12px;font-weight:700}@media(max-width:390px){.wrap{padding:18px 0}.card{padding:21px;border-radius:20px}.row{grid-template-columns:64px 1fr;font-size:14px}}
</style></head><body><main class="wrap"><section class="card"><div class="brand">ALIGOR</div><div class="eyebrow">ADD TO CALENDAR</div><h1 class="title">${esc(event.title)}</h1><div class="details"><div class="row"><span>日期</span><strong>${esc(event.dateText)}</strong></div><div class="row"><span>时间</span><strong>${esc(event.timeText)}</strong></div><div class="row"><span>地点</span><strong>${esc(event.location)}</strong></div></div><p class="prompt">请选择你使用的 Calendar</p><div class="buttons"><a class="button google" href="${esc(google)}">Google Calendar</a><a class="button apple" href="${esc(ics)}">Apple / iPhone Calendar</a><a class="button outlook" href="${esc(ics)}">Outlook Calendar</a></div><p class="note">点击后会打开对应的 Calendar，请确认资料后按 Save／保存。</p></section><div class="footer">Aligor AI Agent 实战课</div></main></body></html>`;
}
