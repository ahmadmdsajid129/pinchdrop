// The Worker against a pretend Dodo (no network): node test-flows.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import worker from './src/index.js';

const PUBLIC_HEX = '4696cacafcf53605bcd5ebe84fa07d9860ce1f4d059d6fd832f57a62c87873ec';
const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(PUBLIC_HEX, 'hex')]), format: 'der', type: 'spki' });
const verify = (k) => {
  const [p, s] = k.slice(4).split('.');
  return crypto.verify(null, Buffer.from(p, 'base64url'), pub, Buffer.from(s, 'base64url')) && JSON.parse(Buffer.from(p, 'base64url'));
};
const env = {
  PD_SIGNING_KEY: readFileSync(join(homedir(), '.pinchdrop', 'license-signing-key.pem'), 'utf8'),
  DODO_PRODUCT_LIFETIME: 'pdt_life', DODO_PRODUCT_YEARLY: 'pdt_year', DODO_PRODUCT_MONTHLY: 'pdt_month',
};
let dodoReply;
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push([url, JSON.parse(init.body)]);
  const r = dodoReply(url, JSON.parse(init.body));
  return new Response(JSON.stringify(r.body), { status: r.status });
};
const redeem = async (body) => (await worker.fetch(new Request('https://x/redeem', { method: 'POST', body: JSON.stringify(body) }), env)).json();
let fails = 0;
const check = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) fails++; };

dodoReply = () => ({ status: 201, body: { id: 'lki_1', license_key_id: 'lic_1', product: { product_id: 'pdt_life' }, customer: { name: 'Asha' } } });
let r = await redeem({ licenseKey: 'KEY-1', instanceName: 'PinchDrop on PC' });
let p = verify(r.key);
check('lifetime key activates, signed, never expires', p && p.plan === 'lifetime' && p.expires === null && p.name === 'Asha' && r.instanceId === 'lki_1');
check('activation went to Dodo live', calls.at(-1)[0] === 'https://live.dodopayments.com/licenses/activate' && calls.at(-1)[1].license_key === 'KEY-1');

dodoReply = () => ({ status: 201, body: { id: 'lki_2', license_key_id: 'lic_2', product: { product_id: 'pdt_month' }, customer: { name: 'Ravi' } } });
r = await redeem({ licenseKey: 'KEY-2' });
p = verify(r.key);
check('monthly key gets a ~40-day key', p && p.plan === 'month' && p.expires - p.issued === 40 * 86400);

dodoReply = () => ({ status: 404, body: {} });
r = await redeem({ licenseKey: 'NOPE' });
check('unknown key → clear error', !r.key && /wasn't found/.test(r.error));

dodoReply = () => ({ status: 422, body: {} });
r = await redeem({ licenseKey: 'FULL' });
check('limit reached → clear error', !r.key && /maximum number of PCs/.test(r.error));

dodoReply = (url) => (url.endsWith('/activate') ? { status: 201, body: { id: 'lki_9', product: { product_id: 'pdt_other' }, customer: {} } } : { status: 200, body: {} });
r = await redeem({ licenseKey: 'OTHER' });
check("another product's key is refused and its seat given back", !r.key && calls.at(-1)[0].endsWith('/licenses/deactivate') && calls.at(-1)[1].license_key_instance_id === 'lki_9');

dodoReply = () => ({ status: 200, body: { valid: true } });
r = await redeem({ licenseKey: 'KEY-2', instanceId: 'lki_2', plan: 'lifetime' });
p = verify(r.key);
check('renewal: valid subscription → fresh 40-day key, never lifetime', p && p.plan === 'month' && p.expires - p.issued === 40 * 86400);
check('renewal asked Dodo to validate this PC', calls.at(-1)[0].endsWith('/licenses/validate') && calls.at(-1)[1].license_key_instance_id === 'lki_2');

dodoReply = () => ({ status: 200, body: { valid: false } });
r = await redeem({ licenseKey: 'KEY-2', instanceId: 'lki_2' });
check('cancelled subscription → no key', !r.key && /no longer active/.test(r.error));

// The key is tied to the PC that asked (its fingerprint), and junk fingerprints are ignored.
const FP = '0123456789abcdef0123456789abcdef';
dodoReply = () => ({ status: 201, body: { id: 'lki_3', license_key_id: 'lic_3', product: { product_id: 'pdt_life' }, customer: { name: 'Asha' } } });
r = await redeem({ licenseKey: 'KEY-3', machine: FP });
p = verify(r.key);
check('key carries the PC fingerprint', p && p.m === FP);
r = await redeem({ licenseKey: 'KEY-3', machine: '<script>' });
p = verify(r.key);
check('a bad fingerprint is left out, not copied', p && p.m === undefined);
dodoReply = () => ({ status: 200, body: { valid: true } });
r = await redeem({ licenseKey: 'KEY-2', instanceId: 'lki_2', machine: FP });
p = verify(r.key);
check('renewed key keeps the PC fingerprint', p && p.m === FP);

// Abuse: oversized and malformed requests are refused without calling Dodo.
const before = calls.length;
let res = await worker.fetch(new Request('https://x/redeem', { method: 'POST', body: 'x'.repeat(10000) }), env);
check('oversized request refused', res.status === 413);
res = await worker.fetch(new Request('https://x/redeem', { method: 'POST', body: 'null' }), env);
check('junk JSON refused', res.status === 400);
res = await worker.fetch(new Request('https://x/other', { method: 'GET' }), env);
check('other paths are 404', res.status === 404);
check('none of that reached Dodo', calls.length === before);

process.exit(fails ? 1 : 0);
