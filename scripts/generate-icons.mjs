/**
 * Generates the Corrector extension icons with no image dependencies.
 * Run: npm run icons
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "apps/extension/public/icons");
mkdirSync(outDir, { recursive: true });

const QUESTION = [
  "0111110",
  "1100011",
  "1000011",
  "0000011",
  "0000110",
  "0001100",
  "0011000",
  "0011000",
  "0000000",
  "0011000",
  "0011000",
];

function render(size) {
  const S = size * 4;
  const pixels = new Float32Array(S * S * 4);

  const blend = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const srcA = a / 255;
    const dstA = pixels[i + 3];
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    pixels[i] = (r * srcA + pixels[i] * dstA * (1 - srcA)) / outA;
    pixels[i + 1] = (g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA;
    pixels[i + 2] = (b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA;
    pixels[i + 3] = outA;
  };

  const radius = S * 0.225;
  const insideRounded = (x, y) => {
    const cx = Math.min(Math.max(x, radius), S - radius);
    const cy = Math.min(Math.max(y, radius), S - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  // Rounded panel with a soft vertical gradient.
  for (let y = 0; y < S; y += 1) {
    const t = y / S;
    const r = Math.round(10 + t * 8);
    const g = Math.round(18 + t * 14);
    const b = Math.round(31 + t * 26);
    for (let x = 0; x < S; x += 1) {
      if (insideRounded(x, y)) blend(x, y, r, g, b, 255);
    }
  }

  // Subtle mint glow in the top-left.
  const glowR = S * 0.46;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const dx = x - S * 0.24;
      const dy = y - S * 0.18;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < glowR && insideRounded(x, y)) {
        const alpha = Math.round(26 * (1 - d / glowR));
        blend(x, y, 94, 234, 212, alpha);
      }
    }
  }

  // Mint ring.
  const cx = S / 2;
  const cy = S / 2;
  const ringRadius = S * 0.372;
  const ringWidth = Math.max(1, S * 0.013);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      if (!insideRounded(x, y)) continue;
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const edge = Math.abs(distance - ringRadius);
      if (edge <= ringWidth) {
        const alpha = Math.round(235 * (1 - edge / ringWidth));
        blend(x, y, 94, 234, 212, alpha);
      }
    }
  }

  // Question mark bitmap.
  const cell = Math.round(S * 0.05);
  const glyphWidth = QUESTION[0].length * cell;
  const glyphHeight = QUESTION.length * cell;
  const x0 = Math.round((S - glyphWidth) / 2);
  const y0 = Math.round((S - glyphHeight) / 2);
  for (let row = 0; row < QUESTION.length; row += 1) {
    for (let col = 0; col < QUESTION[row].length; col += 1) {
      if (QUESTION[row][col] !== "1") continue;
      for (let dy = 0; dy < cell; dy += 1) {
        for (let dx = 0; dx < cell; dx += 1) {
          blend(x0 + col * cell + dx, y0 + row * cell + dy, 240, 255, 252, 255);
        }
      }
    }
  }

  // Box downsample with premultiplied alpha.
  const out = Buffer.alloc(size * size * 4);
  const factor = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const i = ((y * factor + sy) * S + (x * factor + sx)) * 4;
          const alpha = pixels[i + 3];
          r += pixels[i] * alpha;
          g += pixels[i + 1] * alpha;
          b += pixels[i + 2] * alpha;
          a += alpha;
        }
      }
      const count = factor * factor;
      const outIndex = (y * size + x) * 4;
      if (a > 0) {
        out[outIndex] = Math.round(r / a);
        out[outIndex + 1] = Math.round(g / a);
        out[outIndex + 2] = Math.round(b / a);
      }
      out[outIndex + 3] = Math.round((a / count) * 255);
    }
  }

  return out;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, render(size));
  writeFileSync(resolve(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png`);
}
