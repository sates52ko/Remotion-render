#!/usr/bin/env node
/**
 * p9b2c-contact-sheet.cjs — P9-B.2c+: single-file contact sheet for the
 * 20-beat ITW pilot stills, so the operator can review the renders from
 * GitHub without the (gitignored) per-frame PNGs.
 *
 * Pure Node: decode via scripts/lib/render-truth.js (zlib + defilter),
 * encode via a minimal RGB PNG writer (zlib.deflateSync + CRC32).
 * No native/image deps, no LLM/Vision — measurement/asset tooling only.
 *
 * Tiles are labeled with the beat id ONLY (pilot-NNN). Mode / evidence type
 * are deliberately NOT drawn on the sheet so the operator's blind Part A pass
 * keeps its value; the group mapping lives in the evaluation doc instead.
 *
 * Usage: node scripts/p9b2c-contact-sheet.cjs
 *   [--stills=audit/visionless-10x/p9b2c-pilot/stills]
 *   [--report=audit/visionless-10x/p9b2c-pilot/p9b2c-pilot-report.json]
 *   [--out=audit/visionless-10x/p9b2c-pilot/contact-sheet.png]
 *   [--tile-w=640] [--cols=4]
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { decodePng } = require("./lib/render-truth.js");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const root = process.cwd();
const stillsDir = path.resolve(root, args.stills || "audit/visionless-10x/p9b2c-pilot/stills");
const reportPath = path.resolve(root, args.report || "audit/visionless-10x/p9b2c-pilot/p9b2c-pilot-report.json");
const outPath = path.resolve(root, args.out || "audit/visionless-10x/p9b2c-pilot/contact-sheet.png");
const TILE_W = Number(args["tile-w"] || 640);
const COLS = Number(args.cols || 4);

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const beats = report.beats
  .slice()
  .sort((a, b) => a.i - b.i)
  .filter((b) => b.render && b.render.status === "rendered");

const TILE_H = Math.round(TILE_W * 9 / 16);
const LABEL_H = 40; // label bar under each tile
const PAD = 8;
const ROWS = Math.ceil(beats.length / COLS);
const W = COLS * (TILE_W + PAD) + PAD;
const H = ROWS * (TILE_H + LABEL_H + PAD) + PAD;

// ── canvas (RGB) ────────────────────────────────────────────────────────────
const img = Buffer.alloc(W * H * 3, 0x10); // #101216 background
function setPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  img[o] = r; img[o + 1] = g; img[o + 2] = b;
}
function fillRect(x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(x, y, r, g, b);
}

// ── box-filter downscale RGBA → RGB tile ────────────────────────────────────
function downscale(dec, tw, th) {
  const { width, height, data } = dec;
  const out = Buffer.alloc(tw * th * 3);
  const sx = width / tw, sy = height / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = Math.floor(ty * sy), y1 = Math.max(y0 + 1, Math.floor((ty + 1) * sy));
    for (let tx = 0; tx < tw; tx++) {
      const x0 = Math.floor(tx * sx), x1 = Math.max(x0 + 1, Math.floor((tx + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * width + x) * 4;
          r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
        }
      }
      const o = (ty * tw + tx) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

// ── minimal 5x7 bitmap font (only the chars a label needs) ──────────────────
const FONT = {
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"],
  "3": ["11110","00001","00001","01110","00001","00001","11110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["00110","01000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00010","01100"],
  p: ["11110","10001","10001","11110","10000","10000","10000"],
  i: ["00100","00000","00100","00100","00100","00100","00100"],
  l: ["01000","01000","01000","01000","01000","01000","01110"],
  o: ["01110","10001","10001","10001","10001","10001","01110"],
  t: ["11110","00100","00100","00100","00100","00100","00110"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
};
function drawText(x0, y0, text, scale, [r, g, b]) {
  let x = x0;
  for (const ch of String(text)) {
    const glyph = FONT[ch];
    if (!glyph) { x += 6 * scale; continue; }
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === "1") {
          fillRect(x + gx * scale, y0 + gy * scale, scale, scale, [r, g, b]);
        }
      }
    }
    x += 6 * scale;
  }
  return x - x0;
}

// ── render tiles ────────────────────────────────────────────────────────────
beats.forEach((b, idx) => {
  const pngPath = path.join(stillsDir, `${b.id}.png`);
  if (!fs.existsSync(pngPath)) {
    console.error(`MISSING still: ${pngPath}`);
    process.exit(1);
  }
  const dec = decodePng(fs.readFileSync(pngPath));
  const tile = downscale(dec, TILE_W, TILE_H);
  const col = idx % COLS, row = Math.floor(idx / COLS);
  const ox = PAD + col * (TILE_W + PAD);
  const oy = PAD + row * (TILE_H + LABEL_H + PAD);
  // frame border + tile
  fillRect(ox - 1, oy - 1, TILE_W + 2, TILE_H + 2, [0x2a, 0x2f, 0x36]);
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const s = (y * TILE_W + x) * 3;
      setPx(ox + x, oy + y, tile[s], tile[s + 1], tile[s + 2]);
    }
  }
  // label bar: beat id only (blind-review-safe)
  drawText(ox + 2, oy + TILE_H + (LABEL_H - 7 * 4) / 2 | 0, b.id, 4, [0xe8, 0xea, 0xed]);
});

// ── minimal PNG encoder (RGB, filter 0) ─────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, RGB
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = encodePng(W, H, img);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`contact sheet: ${beats.length} tiles, ${COLS}x${ROWS}, ${W}x${H}px, ${(png.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`→ ${path.relative(root, outPath)}`);
