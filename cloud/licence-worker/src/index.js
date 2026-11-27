// PinchDrop licence service (Cloudflare Worker, free plan).
//
// Buyers pay on the PinchDrop website through Dodo Payments, which emails them a licence key.
// They paste it in PinchDrop → Pro. The app sends it here:
//
// POST /redeem { licenseKey, instanceId?, instanceName?, plan? }
//   • no instanceId (first time on this PC): activates the key with Dodo (which enforces the
//     2-PCs-per-key limit), reads which product it's for, and answers with a PinchDrop key signed
//     with the PinchDrop private key (Ed25519), which the app checks offline.
//   • instanceId (a subscription renewing): asks Dodo if the key and this PC's activation are still
//     valid (a subscription key stops being valid when the subscription ends), and answers with a
//     fresh 40-day key.
//   ← { key: "PD1-…", instanceId, plan, expires }  or  { error: "…" }
//
// Dodo's activate / validate calls are public (no API key needed here).

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

function planOf(productId, env) {
  if (productId && productId === String(env.DODO_PRODUCT_LIFETIME)) return 'lifetime';
  // Family / team packs are lifetime keys; Dodo enforces their bigger PC limit.
  if (productId && productId === String(env.DODO_PRODUCT_FAMILY)) return 'lifetime';
  if (productId && productId === String(env.DODO_PRODUCT_YEARLY)) return 'year';
  if (productId && productId === String(env.DODO_PRODUCT_MONTHLY)) return 'month';
  return null;
}

async function dodo(env, path, body) {
  const base = env.DODO_BASE || 'https://live.dodopayments.com';
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
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
    const licenseKey = String(b.licenseKey ?? '').trim().slice(0, 120);
    if (!licenseKey) return json({ error: 'Missing licence key.' }, 400);
    const now = Math.floor(Date.now() / 1000);

    // Renewing a subscription on a PC that's already activated.
    if (b.instanceId) {
      const { data } = await dodo(env, '/licenses/validate', {
        license_key: licenseKey,
        license_key_instance_id: String(b.instanceId).slice(0, 120),
      });
      if (data.valid !== true) return json({ error: 'This licence is no longer active. Renew it to keep Pro.' });
      // Only subscriptions renew; the plan name is just a label, the expiry is always short.
      const plan = b.plan === 'year' ? 'year' : 'month';
      const key = await sign(
        { v: 1, id: `dodo-${String(b.instanceId).slice(0, 40)}`, name: String(b.name ?? '').slice(0, 60), plan, issued: now, expires: now + SUB_DAYS * 86400 },
        env.PD_SIGNING_KEY,
      );
      return json({ key, instanceId: b.instanceId, plan, expires: now + SUB_DAYS * 86400 });
    }

    // First time on this PC.
    const { status, data } = await dodo(env, '/licenses/activate', {
      license_key: licenseKey,
      name: String(b.instanceName ?? 'PinchDrop').slice(0, 80),
    });
    if (status === 404) return json({ error: "That licence key wasn't found. Check that it was copied in full." });
    if (status === 422) return json({ error: 'This key is already used on its maximum number of PCs. Remove it from an old PC first (PinchDrop → Pro → Remove key).' });
    if (status === 403) return json({ error: 'This licence is no longer active.' });
    if (status >= 300 || !data.id) return json({ error: 'That licence key could not be used. Try again, or contact support.' });

    const plan = planOf(String(data.product?.product_id ?? ''), env);
    if (!plan) {
      // Not a PinchDrop Pro key: give the seat back.
      await dodo(env, '/licenses/deactivate', { license_key: licenseKey, license_key_instance_id: data.id });
      return json({ error: "That key isn't for a PinchDrop Pro plan." });
    }
    const expires = plan === 'lifetime' ? null : now + SUB_DAYS * 86400;
    const name = String(data.customer?.name ?? '').slice(0, 60);
    const key = await sign({ v: 1, id: `dodo-${String(data.license_key_id ?? data.id).slice(0, 40)}`, name, plan, issued: now, expires }, env.PD_SIGNING_KEY);
    return json({ key, instanceId: data.id, plan, expires, name });
  },
};
