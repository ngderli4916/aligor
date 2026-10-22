// Meta Pixel (browser) + Conversions API (server). The same event_id is sent from both sides so Meta counts each sign-up once.
const GRAPH = 'https://graph.facebook.com/v25.0';

export const META_CSP_SCRIPT = 'https://connect.facebook.net';
export const META_CSP_CONNECT = 'https://www.facebook.com https://connect.facebook.net';
export const META_CSP_IMG = 'https://www.facebook.com';

const validPixel = id => /^\d{10,20}$/.test(String(id || ''));

export function pixelHead(pixelId) {
  if (!validPixel(pixelId)) return '';
  return `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');</script>`;
}

// Ad clicks arrive as ?utm_source=facebook&utm_campaign={{campaign.id}}&utm_content={{ad.id}} and/or ?fbclid=...
// Stored compactly in leads.source (max 80 chars) so sign-ups can be matched back to the ad.
export function adSource(data) {
  const clean = v => String(v || '').replace(/[^\w.-]/g, '').slice(0, 24);
  const src = clean(data.utm_source).toLowerCase();
  const fromMeta = ['facebook', 'fb', 'instagram', 'ig', 'meta'].includes(src);
  if (fromMeta) return ['fb', clean(data.utm_campaign), clean(data.utm_content)].filter(Boolean).join(':');
  if (data.fbclid) return 'fb:fbclid';
  if (src) return [src, clean(data.utm_campaign)].filter(Boolean).join(':');
  return '';
}

function cookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function buildLeadEvent(request, lead, { eventId, fbclid = '', eventSourceUrl = '' } = {}) {
  let fbc = cookie(request, '_fbc');
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  const user = {
    ph: [await sha256(String(lead.phone_e164 || '').replace(/\D/g, ''))],
    external_id: [await sha256(String(lead.public_id || lead.id))],
    client_ip_address: request.headers.get('cf-connecting-ip') || undefined,
    client_user_agent: request.headers.get('user-agent') || undefined,
    fbc: fbc || undefined,
    fbp: cookie(request, '_fbp') || undefined,
  };
  const first = String(lead.name || '').trim().toLowerCase().split(/\s+/)[0];
  if (first) user.fn = [await sha256(first)];
  user.country = [await sha256('my')];
  return {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'website',
    event_source_url: eventSourceUrl || request.headers.get('referer') || undefined,
    user_data: user,
    custom_data: { content_name: lead.course, content_category: lead.batch, lead_source: lead.source },
  };
}

export async function sendLeadToMeta(env, request, lead, opts) {
  if (!validPixel(env.META_PIXEL_ID) || !env.META_CAPI_TOKEN) return { skipped: true };
  const event = await buildLeadEvent(request, lead, opts);
  const body = { data: [event] };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
  const res = await fetch(`${GRAPH}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) console.error('meta_capi_failed', res.status, (await res.text()).slice(0, 300));
  return { ok: res.ok, status: res.status };
}
