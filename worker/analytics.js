// Cookie-free visitor counting. Nothing personal is stored: the visitor id is a one-way hash that changes every day.
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  visitor TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  created_at TEXT NOT NULL
)`;
const INDEX_SQL = 'CREATE INDEX IF NOT EXISTS idx_page_views_day_path ON page_views(day, path)';
const BOT_BEACON = /bot|crawl|spider|slurp|headless|lighthouse/i;
const BOT_SERVER = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|python|wget|monitor/i;
const PATH_PATTERN = /^\/[a-z0-9\-_/]{0,78}$/;
const readyDatabases = new WeakSet();

export const malaysiaDay = (date = new Date()) => new Date(date.getTime() + 8 * 3600e3).toISOString().slice(0, 10);

async function ensureTable(env) {
  if (readyDatabases.has(env.DB)) return;
  await env.DB.prepare(TABLE_SQL).run();
  await env.DB.prepare(INDEX_SQL).run();
  readyDatabases.add(env.DB);
}

async function visitorHash(env, request, day) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const data = new TextEncoder().encode(`${env.SESSION_SECRET || 'aligor'}|${day}|${ip}|${request.headers.get('user-agent') || ''}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function referrerHost(raw, request) {
  try {
    const host = new URL(String(raw || '')).host.replace(/^www\./, '');
    return host === new URL(request.url).host ? '' : host.slice(0, 80);
  } catch { return ''; }
}

// Records one view or click. `skip` is true when the visitor is the logged-in admin.
export async function recordView(env, request, { path, ref = '', source = 'beacon', skip = false } = {}) {
  if (skip || !PATH_PATTERN.test(String(path || ''))) return false;
  const agent = request.headers.get('user-agent') || '';
  if ((source === 'server' ? BOT_SERVER : BOT_BEACON).test(agent)) return false;
  await ensureTable(env);
  const day = malaysiaDay();
  await env.DB.prepare('INSERT INTO page_views(day,path,visitor,referrer,device,created_at) VALUES(?,?,?,?,?,?)')
    .bind(day, path, await visitorHash(env, request, day), referrerHost(ref, request), /Mobi|Android|iPhone|iPad/i.test(agent) ? 'mobile' : 'desktop', new Date().toISOString()).run();
  return true;
}

const HOME = '/', CLICK = '/click/preview', REGISTER = '/register';

export async function getStats(env, days = 14) {
  await ensureTable(env);
  const today = malaysiaDay();
  const since = malaysiaDay(new Date(Date.now() - (days - 1) * 86400e3));
  const perDay = (await env.DB.prepare(
    `SELECT day, path, COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM page_views WHERE day>=? AND path IN (?,?,?) GROUP BY day, path`
  ).bind(since, HOME, CLICK, REGISTER).all()).results;
  const leadsPerDay = (await env.DB.prepare(
    `SELECT substr(datetime(created_at,'+8 hours'),1,10) day, COUNT(*) leads FROM leads GROUP BY day`
  ).all()).results;
  const totals = (await env.DB.prepare(
    `SELECT path, COUNT(*) views, COUNT(DISTINCT day||visitor) visitors FROM page_views WHERE path IN (?,?,?) GROUP BY path`
  ).bind(HOME, CLICK, REGISTER).all()).results;
  const sources = (await env.DB.prepare(
    `SELECT CASE WHEN referrer='' THEN '直接访问' ELSE referrer END source, COUNT(DISTINCT day||visitor) visitors FROM page_views WHERE path=? AND day>=? GROUP BY source ORDER BY visitors DESC LIMIT 6`
  ).bind(HOME, since).all()).results;
  const devices = (await env.DB.prepare(
    `SELECT device, COUNT(DISTINCT day||visitor) visitors FROM page_views WHERE path=? AND day>=? GROUP BY device`
  ).bind(HOME, since).all()).results;
  const leadsTotal = (await env.DB.prepare('SELECT COUNT(*) n FROM leads').first())?.n || 0;
  const firstDay = (await env.DB.prepare('SELECT MIN(day) d FROM page_views').first())?.d || null;

  const dayRows = [];
  for (let i = 0; i < days; i++) {
    const day = malaysiaDay(new Date(Date.now() - i * 86400e3));
    const pick = path => perDay.find(r => r.day === day && r.path === path);
    dayRows.push({
      day,
      home_visitors: pick(HOME)?.visitors || 0,
      clicks: pick(CLICK)?.views || 0,
      register_visitors: pick(REGISTER)?.visitors || 0,
      leads: leadsPerDay.find(r => r.day === day)?.leads || 0,
    });
  }
  const total = path => totals.find(r => r.path === path) || { views: 0, visitors: 0 };
  const homeVisitors = total(HOME).visitors;
  return {
    since, today, first_day: firstDay,
    today_home_visitors: dayRows[0].home_visitors,
    last7_home_visitors: dayRows.slice(0, 7).reduce((n, r) => n + r.home_visitors, 0),
    total_home_visitors: homeVisitors,
    total_home_views: total(HOME).views,
    total_clicks: total(CLICK).views,
    total_register_visitors: total(REGISTER).visitors,
    total_leads: leadsTotal,
    conversion: homeVisitors ? Math.round((leadsTotal / homeVisitors) * 1000) / 10 : null,
    days: dayRows, sources, devices,
  };
}
