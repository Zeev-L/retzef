// Generates a monochrome "thread loop" tray icon as a template PNG (black + alpha).
// macOS recolors template images automatically for light/dark menu bars.
// Run: node assets/gen-icon.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, y * w * 4 + w * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Draw an open loop (ring with a small gap) to evoke a thread being tied.
function ring(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const rOut = size * 0.40, rIn = size * 0.22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    const outA = Math.min(1, Math.max(0, rOut - d + 0.5));
    const inA = Math.min(1, Math.max(0, d - rIn + 0.5));
    let a = Math.min(outA, inA);
    // small gap at lower-right so it reads as a loose thread, not a solid O
    const ang = Math.atan2(dy, dx);
    if (ang > 0.35 && ang < 1.15) a = 0;
    const i = (y * size + x) * 4;
    rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = Math.round(a * 255);
  }
  return rgba;
}

const outDir = __dirname;
fs.writeFileSync(path.join(outDir, 'trayTemplate.png'), encodePNG(22, 22, ring(22)));
fs.writeFileSync(path.join(outDir, 'trayTemplate@2x.png'), encodePNG(44, 44, ring(44)));
console.log('wrote trayTemplate.png (22) and @2x (44)');
