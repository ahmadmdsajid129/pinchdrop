// Checks the Worker's signing with a real key file, verified with the app's public key.
// node test.mjs   (needs %USERPROFILE%\.pinchdrop\license-signing-key.pem)
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { sign } from './src/index.js';

const PUBLIC_HEX = '4696cacafcf53605bcd5ebe84fa07d9860ce1f4d059d6fd832f57a62c87873ec';
const pem = readFileSync(join(homedir(), '.pinchdrop', 'license-signing-key.pem'), 'utf8');
const key = await sign({ v: 1, id: 'ls-test', name: 'Test', plan: 'year', issued: 1000, expires: 2000 }, pem);
const [p, s] = key.slice(4).split('.');
const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(PUBLIC_HEX, 'hex')]), format: 'der', type: 'spki' });
const ok = crypto.verify(null, Buffer.from(p, 'base64url'), pub, Buffer.from(s, 'base64url'));
console.log(ok ? 'OK: the app will accept keys from this Worker' : 'FAIL');
console.log(key);
process.exit(ok ? 0 : 1);
