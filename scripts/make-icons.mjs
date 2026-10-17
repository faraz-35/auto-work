// Generates the app's PNG assets with a minimal hand-rolled PNG encoder
// (RGBA, zlib via node:zlib — no image deps): the Auto Work mark (a house
// outline with a checkmark inside, bone on near-black) for the launcher icon,
// adaptive layers, and the alpha-only status-bar icon.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePng = (w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(Buffer.from([0]), rgba.subarray(y * w * 4, (y + 1) * w * 4));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// The mark, in unit space (y down). Strokes: roof, walls, check.
const ROOF = [[0.17, 0.45], [0.5, 0.17], [0.83, 0.45]];
const WALLS = [[0.25, 0.42], [0.25, 0.82], [0.75, 0.82], [0.75, 0.42]];
const CHECK = [[0.35, 0.62], [0.465, 0.735], [0.64, 0.53]];
const STROKE = 0.03;  // half-width, 5.6% of canvas

const dist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return Math.sqrt(x * x + y * y);
};
const polylineDist = (px, py, pts) => {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    d = Math.min(d, dist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return d;
};

// Stroked-mark coverage: distance to the nearest stroke, softened ~2px.
const markCoverage = (px, py, size, scale = 1) => {
  const x = 0.5 + (px / size - 0.5) / scale;
  const y = 0.5 + (py / size - 0.5) / scale;
  const d = Math.min(polylineDist(x, y, ROOF), polylineDist(x, y, WALLS), polylineDist(x, y, CHECK));
  return Math.max(0, Math.min(1, (STROKE - d) * size / 2 + 0.5));
};

// Filled-mark coverage for tiny sizes: solid silhouette, check knocked out.
const fillCoverage = (px, py, size, scale = 1) => {
  const x = 0.5 + (px / size - 0.5) / scale;
  const y = 0.5 + (py / size - 0.5) / scale;
  const inRoof = y >= 0.17 && y <= 0.47 && Math.abs(x - 0.5) <= ((y - 0.17) / 0.30) * 0.36;
  const inBody = x >= 0.24 && x <= 0.76 && y >= 0.44 && y <= 0.82;
  if (!(inRoof || inBody)) return 0;
  const checkDist = polylineDist(x, y, CHECK);
  return checkDist > STROKE * 0.9 ? 1 : 0;
};

const BONE = [231, 229, 228];   // #e7e5e4, the app's accent
const DARK = [9, 9, 11];        // #09090b, the app's background

const make = (size, mode) => encodePng(size, size, rawPixels(size, mode));

// raw RGBA pixels for one frame of the mark
const rawPixels = (size, mode) => {
  // adaptive foreground/monochrome must sit inside Android's safe zone
  // (a 66/108 circle) or launchers clip the roof
  const scale = mode === 'bg' ? 1 : 0.82;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const a = mode === 'alpha' ? fillCoverage(px, py, size, scale) : markCoverage(px, py, size, scale);
      const i = (py * size + px) * 4;
      if (mode === 'alpha') {
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255;
        rgba[i + 3] = Math.round(a * 255);
      } else if (mode === 'fg') {
        rgba[i] = BONE[0]; rgba[i + 1] = BONE[1]; rgba[i + 2] = BONE[2];
        rgba[i + 3] = Math.round(a * 255);
      } else {
        rgba[i] = DARK[0]; rgba[i + 1] = DARK[1]; rgba[i + 2] = DARK[2]; rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
};

// the legacy launcher icon: mark composited onto the background, at pixel level
const legacyIcon = (size) => {
  const fg = rawPixels(size, 'fg');
  const bg = rawPixels(size, 'bg');
  for (let i = 0; i < fg.length; i += 4) {
    const a = fg[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      fg[i + c] = Math.round(fg[i + c] * a + bg[i + c] * (1 - a));
    }
    fg[i + 3] = 255;
  }
  return encodePng(size, size, fg);
};

const out = (p, buf) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf); console.log(p); };
out('app/assets/icon.png', legacyIcon(1024));
out('app/assets/android-icon-foreground.png', make(1024, 'fg'));
out('app/assets/android-icon-background.png', make(1024, 'bg'));
out('app/assets/android-icon-monochrome.png', make(1024, 'fg'));
out('app/assets/favicon.png', legacyIcon(48));
out('packages/motor-alarms/android/src/main/res/drawable/ic_motor_stat.png', make(96, 'alpha'));
