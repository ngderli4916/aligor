// Send only a reference; the receiver reads the authoritative registration.
export async function notifyPartnerRegistration(env, leadId) {
  const endpoint = env.PARTNER_SIGNUP_WEBHOOK_URL;
  const secret = env.PARTNER_SIGNUP_WEBHOOK_SECRET;
  if (!endpoint || !secret) return;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        url.pathname !== '/webhook/aligor-partner-registration' || !Number.isSafeInteger(leadId) || leadId <= 0) {
      console.error('Partner registration webhook configuration invalid');
      return;
    }
    const body = JSON.stringify({event:'aligor.partner-registration.created',leadId});
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.href, {
          method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${secret}`},
          body, redirect:'error', signal:AbortSignal.timeout(25000)
        });
        if (response.ok) return;
        if (response.status < 500) break;
      } catch { /* A repeated event is deduplicated by the receiver. */ }
    }
    console.error('Partner registration webhook delivery not confirmed', leadId);
  } catch {
    console.error('Partner registration webhook configuration invalid');
  }
}
