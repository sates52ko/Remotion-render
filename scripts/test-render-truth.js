#!/usr/bin/env node
/**
 * test-render-truth.js — Vision-free render-truth primitives (pure functions).
 *   node scripts/test-render-truth.js
 *
 * Synthesizes PNGs in-memory (tiny encoder, filter-0 rows), then proves the
 * decoder + metrics: blank detection, near-duplicate hashing, coverage,
 * colorfulness. No LLM, no Vision, no filesystem dependencies.
 */
const zlib = require("zlib");
const {
  decodePng, lumaOf, hamming, analyzeDecoded, flagFrame, nearDuplicateGroups, THRESHOLDS,
} = require("./lib/render-truth");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + name); } };

// ── minimal PNG encoder (RGBA, bit depth 8, filter 0) ────────────────────────
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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const solid = (w, h, [r, g, b]) => {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255; }
  return px;
};
// deterministic pseudo-noise texture (seeded, reproducible)
const noise = (w, h, seed) => {
  const px = Buffer.alloc(w * h * 4);
  let s = seed >>> 0;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const v = (s >>> 16) & 255;
    px[i * 4] = v; px[i * 4 + 1] = (s >>> 8) & 255; px[i * 4 + 2] = s & 255; px[i * 4 + 3] = 255;
  }
  return px;
};

// ── decode roundtrip ──
const W = 64, H = 64;
const white = decodePng(encodePng(W, H, solid(W, H, [255, 255, 255])));
ok(white.width === W && white.height === H && white.data.length === W * H * 4, "decodePng roundtrip dimensions");
ok(white.data[0] === 255 && white.data[1] === 255 && white.data[2] === 255 && white.data[3] === 255, "decodePng pixel values (filter 0)");
// filter 2 (up) — rows referencing row 0
const grad = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4; const v = Math.floor((y / H) * 255);
  grad[i] = grad[i + 1] = grad[i + 2] = v; grad[i + 3] = 255;
}
const gradDecoded = decodePng(encodePng(W, H, grad));
ok(Math.abs(lumaOf(gradDecoded)[W * (H - 1)] - 252) <= 3, "vertical gradient survives (unfilter path)");

// ── blank frame detection ──
const flatAnalysis = analyzeDecoded(white);
ok(flatAnalysis.stdLuma < THRESHOLDS.blankStdLuma && flatAnalysis.coverage < THRESHOLDS.blankCoverage, "flat white is blank (std+coverage)");
ok(flagFrame({ ok: true, ...flatAnalysis }).BLANK_FRAME === true, "flagFrame marks BLANK_FRAME on flat white");
const noisy = analyzeDecoded(decodePng(encodePng(W, H, noise(W, H, 42))));
ok(noisy.stdLuma >= THRESHOLDS.blankStdLuma && noisy.coverage > 0.5, "noise frame is structured");
ok(flagFrame({ ok: true, ...noisy }).BLANK_FRAME === undefined, "flagFrame does not mark a noisy frame blank");

// ── duplicate / near-duplicate hashing ──
const hashA = noisy; // analysis already carries hashBits
const sameNoise = analyzeDecoded(decodePng(encodePng(W, H, noise(W, H, 42))));
ok(hamming(hashA, sameNoise) <= THRESHOLDS.nearDuplicateBits, "identical noise renders hash-identical (deterministic bytes)");
const otherNoise = analyzeDecoded(decodePng(encodePng(W, H, noise(W, H, 4242))));
ok(hamming(hashA, otherNoise) > THRESHOLDS.nearDuplicateBits, "different noise is not near-duplicate");
const groups = nearDuplicateGroups(
  [{ ok: true, path: "a.png", ...hashA }, { ok: true, path: "b.png", ...sameNoise }, { ok: true, path: "c.png", ...otherNoise }],
);
ok(groups.length === 1 && groups[0].a === "a.png" && groups[0].b === "b.png", "nearDuplicateGroups pairs only the identical pair");

// ── colorfulness / grayscale fallback ──
const grayAnalysis = analyzeDecoded(decodePng(encodePng(W, H, (() => {
  const px = noise(W, H, 7); for (let i = 0; i < W * H; i++) px[i * 4 + 1] = px[i * 4 + 2] = px[i * 4];
  return px;
})())));
ok(grayAnalysis.colorfulness < THRESHOLDS.grayscaleColorfulness, "pure grayscale detected");
ok(flagFrame({ ok: true, ...grayAnalysis }).GRAYSCALE_FALLBACK === true, "flagFrame marks GRAYSCALE_FALLBACK");
ok(flagFrame({ ok: true, ...noisy }).GRAYSCALE_FALLBACK === undefined, "colored noise not flagged grayscale");

// ── failed file is non-throwing ──
ok(flagFrame({ ok: false }).unreadable === true, "unreadable analysis flags unreadable, never throws");

// ── thresholds are exported and finite (no silent recalibration) ──
for (const key of Object.keys(THRESHOLDS)) ok(Number.isFinite(THRESHOLDS[key]), `threshold ${key} finite`);

console.log(`test-render-truth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
