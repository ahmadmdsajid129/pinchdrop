// PinchDrop licence service (Cloudflare Worker, free plan).
//
// POST /redeem { licenseKey, instanceId?, instanceName? }
//   → checks the key with Lemon Squeezy's public licence API (activate the first time on a PC,
//     validate after that), makes sure it's for this store and a Pro plan, and answers with a
//     PinchDrop key signed with the PinchDrop private key (Ed25519), which the app checks offline.
//   ← { key: "PD1-…", instanceId, plan, expires }  or  { error: "…" }
//
// Lifetime keys never expire. Yearly / monthly keys get a 40-day PinchDrop key that the app
// renews in the background while the subscription is active, so a cancelled subscription stops
// working within weeks.

const LS = 'https://api.lemonsqueezy.com/v1/licenses/';
const SUB_DAYS = 40;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function sign(payload, pkcs8Base64) {
  const der = Uint8Array.from(atob(pkcs8Base64.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, bytes));
  return `PD1-${b64url(bytes)}.${b64url(sig)}`;
}

function friendly(err) {
  const e = String(err ?? '').toLowerCase();
  if (e.includes('activation limit')) return 'This key is already used on its maximum number of PCs. Remove it from an old PC first (PinchDrop → Pro → Remove key).';
  if (e.includes('not found') || e.includes('invalid')) return "That licence key wasn't found. Check that it was copied in full.";
  if (e.includes('expired')) return 'This licence has run out. Renew it to keep Pro.';
  if (e.includes('disabled')) return 'This licence is disabled.';
  return 'That licence key could not be used. Check it, or contact support.';
}

function planOf(variant, env) {
  if (variant && variant === String(env.LS_VARIANT_LIFETIME)) return 'lifetime';
  if (variant && variant === String(env.LS_VARIANT_YEARLY)) return 'year';
  if (variant && variant === String(env.LS_VARIANT_MONTHLY)) return 'month';
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/redeem') return json({ error: 'Not found' }, 404);
    let b;
    try {
      b = await req.json();
    } catch {
      return json({ error: 'Bad request' }, 400);
    }
    const licenseKey = String(b.licenseKey ?? '').trim().slice(0, 100);
    if (!licenseKey) return json({ error: 'Missing licence key.' }, 400);

    const form = new URLSearchParams({ license_key: licenseKey });
    let endpoint = 'activate';
    if (b.instanceId) {
      endpoint = 'validate';
      form.set('instance_id', String(b.instanceId).slice(0, 100));
    } else {
      form.set('instance_name', String(b.instanceName ?? 'PinchDrop').slice(0, 80));
    }
    const r = await fetch(LS + endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const d = await r.json().catch(() => ({}));
    const ok = endpoint === 'activate' ? d.activated : d.valid;
    if (!ok) return json({ error: friendly(d.error) });
    if (String(d.meta?.store_id) !== String(env.LS_STORE_ID)) return json({ error: "That key isn't for PinchDrop." });

    const lk = d.license_key ?? {};
    if (lk.status === 'expired') return json({ error: 'This licence has run out. Renew it to keep Pro.' });
    if (lk.status === 'disabled') return json({ error: 'This licence is disabled.' });
    const plan = planOf(String(d.meta?.variant_id ?? ''), env);
    if (!plan) return json({ error: "That key isn't for a PinchDrop Pro plan." });

    const now = Math.floor(Date.now() / 1000);
    let expires = plan === 'lifetime' ? null : now + SUB_DAYS * 86400;
    if (lk.expires_at) {
      const e = Math.floor(Date.parse(lk.expires_at) / 1000);
      if (!expires || e < expires) expires = e;
    }
    const payload = {
      v: 1,
      id: `ls-${lk.id ?? licenseKey.slice(0, 8)}`,
      name: String(d.meta?.customer_name ?? '').slice(0, 60),
      plan,
      issued: now,
      expires,
    };
    const key = await sign(payload, env.PD_SIGNING_KEY);
    return json({ key, instanceId: d.instance?.id ?? b.instanceId ?? null, plan, expires });
  },
};
