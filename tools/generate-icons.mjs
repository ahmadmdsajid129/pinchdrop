/**
 * Pure Node.js zero-dependency icon generator for Tauri and Android.
 * Generates valid RGBA PNGs and Windows ICO files using Node's built-in zlib.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ICONS_DIR = path.resolve('apps/desktop/src-tauri/icons');
fs.mkdirSync(ICONS_DIR, { recursive: true });

function crc32(buf) {
  let table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([len, body, crcBuf]);
}

function generatePng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width(4), height(4), bitDepth(1)=8, colorType(1)=6(RGBA), comp(1)=0, filter(1)=0, interlace(1)=0
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  // Raw image data with filter byte 0 at start of each scanline
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Gradient from Purple (#7C5CFF) to Cyan (#22D3EE)
        const t = (x + y) / (width + height);
        const r = Math.round(124 * (1 - t) + 34 * t);
        const g = Math.round(92 * (1 - t) + 211 * t);
        const b = Math.round(255 * (1 - t) + 238 * t);

        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
        rawData[pxOffset + 3] = 255; // Alpha
      } else {
        // Transparent outside circle
        rawData[pxOffset] = 11;
        rawData[pxOffset + 1] = 16;
        rawData[pxOffset + 2] = 32;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeIco(pngBuffers) {
  // Simple ICO containing PNG images
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = ICO
  header.writeUInt16LE(pngBuffers.length, 4); // count of images

  let offset = 6 + pngBuffers.length * 16;
  const directoryEntries = [];

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = item.size >= 256 ? 0 : item.size; // width (0 = 256)
    entry[1] = item.size >= 256 ? 0 : item.size; // height
    entry[2] = 0; // color palette count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // size of image in bytes
    entry.writeUInt32LE(offset, 12); // file offset
    directoryEntries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...directoryEntries, ...pngBuffers.map(b => b.buffer)]);
}

console.log('🎨 Generating desktop application icons...');

const png32 = generatePng(32, 32);
const png128 = generatePng(128, 128);
const png256 = generatePng(256, 256);
const png512 = generatePng(512, 512);

fs.writeFileSync(path.join(ICONS_DIR, '32x32.png'), png32);
fs.writeFileSync(path.join(ICONS_DIR, '128x128.png'), png128);
fs.writeFileSync(path.join(ICONS_DIR, '128x128@2x.png'), png256);
fs.writeFileSync(path.join(ICONS_DIR, 'icon.png'), png512);

const icoBuffer = makeIco([
  { size: 32, buffer: png32 },
  { size: 128, buffer: png128 },
  { size: 256, buffer: png256 }
]);
fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), icoBuffer);

console.log('✅ Generated:');
console.log('  - apps/desktop/src-tauri/icons/32x32.png');
console.log('  - apps/desktop/src-tauri/icons/128x128.png');
console.log('  - apps/desktop/src-tauri/icons/128x128@2x.png');
console.log('  - apps/desktop/src-tauri/icons/icon.png');
console.log('  - apps/desktop/src-tauri/icons/icon.ico\n');
