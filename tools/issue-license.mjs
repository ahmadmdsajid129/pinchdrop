#!/usr/bin/env node
// Makes a PinchDrop Pro licence key. Run on YOUR PC only; the private key never goes in the repo.
//
//   pnpm license --name "Asha Rao" --plan lifetime
//   pnpm license --name "Asha Rao" --plan year
//   pnpm license --name "Asha Rao" --plan month
//
// Private key: %USERPROFILE%\.pinchdrop\license-signing-key.pem (or set PD_LICENSE_KEY to its path).
// Back it up somewhere safe and private. Lose it → you can't make keys the app accepts.
// Leak it → anyone can make keys. The app has only the matching public key (license.rs).

import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const plan = arg('plan') ?? 'lifetime';
if (!['lifetime', 'year', 'month'].includes(plan)) {
  console.error('--plan must be lifetime, year or month');
  process.exit(1);
}
const name = (arg('name') ?? '').trim();
const now = Math.floor(Date.now() / 1000);
const DAY = 86400;
const expires = plan === 'year' ? now + 366 * DAY : plan === 'month' ? now + 31 * DAY : null;

const keyPath = process.env.PD_LICENSE_KEY ?? join(homedir(), '.pinchdrop', 'license-signing-key.pem');
const privateKey = createPrivateKey(readFileSync(keyPath));
const payload = Buffer.from(JSON.stringify({ v: 1, id: randomBytes(8).toString('hex'), name, plan, issued: now, expires }));
const sig = sign(null, payload, privateKey);

console.log(`PD1-${payload.toString('base64url')}.${sig.toString('base64url')}`);
console.error(`\n${plan} licence${name ? ` for ${name}` : ''}${expires ? `, valid until ${new Date(expires * 1000).toDateString()}` : ''}.`);
