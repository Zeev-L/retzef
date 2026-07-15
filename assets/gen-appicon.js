// Generates a colored app icon (rounded-square + thread loop) as a macOS .iconset.
// Run: node assets/gen-appicon.js   then:  iconutil -c icns assets/retzef.iconset -o assets/icon.icns
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([len, body, crc]); }
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, y * w * 4 + w * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const clamp = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const ACCENT = [0x2f, 0x6d, 0x8c];   // ink blue
const RING = [0xe9, 0xf2, 0xf6];     // near-white

// signed distance to a full-canvas rounded square, for anti-aliased corners
function roundedAlpha(x, y, size, r) {
  const h = size / 2;
  const qx = Math.abs(x - (size - 1) / 2) - (h - r);
  const qy = Math.abs(y - (size - 1) / 2) - (h - r);
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  return clamp(0.5 - d);
}

function icon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.225, cx = (size - 1) / 2, cy = (size - 1) / 2;
  const rOut = size * 0.30, rIn = size * 0.165;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const bgA = roundedAlpha(x, y, size, r);
    let R = ACCENT[0], G = ACCENT[1], B = ACCENT[2];
    const d = Math.hypot(x - cx, y - cy);
    let ringA = Math.min(clamp(rOut - d + 0.6), clamp(d - rIn + 0.6));
    const ang = Math.atan2(y - cy, x - cx);
    if (ang > 0.35 && ang < 1.15) ringA = 0;      // open loop (loose thread)
    if (ringA > 0) { R = lerp(R, RING[0], ringA); G = lerp(G, RING[1], ringA); B = lerp(B, RING[2], ringA); }
    const i = (y * size + x) * 4;
    rgba[i] = R; rgba[i + 1] = G; rgba[i + 2] = B; rgba[i + 3] = Math.round(bgA * 255);
  }
  return encodePNG(size, size, rgba);
}

const dir = path.join(__dirname, 'retzef.iconset');
fs.mkdirSync(dir, { recursive: true });
const map = {
  16: ['icon_16x16.png'], 32: ['icon_16x16@2x.png', 'icon_32x32.png'], 64: ['icon_32x32@2x.png'],
  128: ['icon_128x128.png'], 256: ['icon_128x128@2x.png', 'icon_256x256.png'],
  512: ['icon_256x256@2x.png', 'icon_512x512.png'], 1024: ['icon_512x512@2x.png']
};
for (const [size, names] of Object.entries(map)) {
  const png = icon(Number(size));
  for (const n of names) fs.writeFileSync(path.join(dir, n), png);
}
console.log('wrote', dir, '(' + fs.readdirSync(dir).length + ' pngs)');
