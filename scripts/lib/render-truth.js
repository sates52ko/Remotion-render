/**
 * render-truth.js — Vision-free render truth (Tier 1 of the 2026-10-03 plan).
 *
 * Cheap, deterministic, CPU-only measurements over rendered PNG stills:
 *   - decode: pure Node (zlib + defilter), no native/image deps
 *   - blank frame detection (luma std + content coverage)
 *   - duplicate / near-identical frame detection (16x16 aHash + Hamming)
 *   - content coverage + edge density (empty-wallpaper heuristic)
 *   - colorfulness (grayscale-fallback detection)
 *
 * Nothing here feeds a production gate: measurement only, zero LLM/Vision.
 * Motion-between-frames is the same primitive applied to >=2 frames of one
 * scene (p4 audit reports it whenever the input corpus has sequences).
 */

const fs = require("fs");
const zlib = require("zlib");

const THRESHOLDS = {
  blankStdLuma: 4, // frame is flat if luma std < 4/255
  blankCoverage: 0.05, // ...and < 5% of 16x16 cells carry structure
  lowCoverage: 0.15, // mostly-empty frame (wallpaper suspect)
  nearDuplicateBits: 8, // Hamming distance <= 8/256 bits => near-identical
  duplicateBits: 0,
  grayscaleColorfulness: 2.0, // mean chroma below this reads as grayscale
};

const GRID = 16; // aHash / coverage grid (16x16 = 256-bit hash)

// ── PNG decode (bit depth 8; color types 0/2/6; no interlace) ────────────────

function readChunks(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  const chunks = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, Math.min(off + 8 + len, buf.length));
    chunks.push({ type, data });
    off += 12 + len;
    if (type === "IEND") break;
  }
  return chunks;
}

/** buffer → { width, height, data: Buffer RGBA } */
function decodePng(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr) throw new Error("PNG has no IHDR");
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced PNG unsupported");
  if (![0, 2, 6].includes(colorType)) throw new Error(`unsupported color type ${colorType}`);

  const idat = Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error("truncated PNG pixel data");
  const out = Buffer.alloc(height * stride);

  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[rowStart + x - channels] : 0;
      const b = y > 0 ? out[prevStart + x] : 0;
      const c = y > 0 && x >= channels ? out[prevStart + x - channels] : 0;
      let v = raw[pos + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      out[rowStart + x] = v;
    }
    pos += stride;
  }

  // Normalize everything to RGBA.
  if (channels === 4) return { width, height, data: out };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (channels === 3) {
      rgba[i * 4] = out[i * 3];
      rgba[i * 4 + 1] = out[i * 3 + 1];
      rgba[i * 4 + 2] = out[i * 3 + 2];
    } else {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = out[i];
    }
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

/** decoded RGBA → Uint8 luma (ITU-R 601). */
function lumaOf(decoded) {
  const { width, height, data } = decoded;
  const luma = new Uint8Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    luma[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  }
  return luma;
}

// ── Grid stats: per-cell mean/std on a 16x16 grid ────────────────────────────

function gridStats(luma, width, height, g = GRID) {
  const cellW = width / g;
  const cellH = height / g;
  const means = new Float64Array(g * g);
  const stds = new Float64Array(g * g);
  for (let cy = 0; cy < g; cy++) {
    for (let cx = 0; cx < g; cx++) {
      const x0 = Math.floor(cx * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((cx + 1) * cellW));
      const y0 = Math.floor(cy * cellH);
      const y1 = Math.max(y0 + 1, Math.floor((cy + 1) * cellH));
      let sum = 0, sumSq = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = luma[y * width + x];
          sum += v; sumSq += v * v; n++;
        }
      }
      const mean = sum / n;
      means[cy * g + cx] = mean;
      stds[cy * g + cx] = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    }
  }
  return { g, means, stds };
}

// ── Perceptual hash: 256-bit aHash (cell mean vs global mean) ────────────────

function aHash(luma, width, height, g = GRID) {
  const { means } = gridStats(luma, width, height, g);
  let global = 0;
  for (let i = 0; i < means.length; i++) global += means[i];
  global /= means.length;
  const bits = new Uint8Array(g * g);
  let hex = "";
  for (let i = 0; i < bits.length; i++) {
    bits[i] = means[i] > global ? 1 : 0;
  }
  for (let byte = 0; byte < bits.length; byte += 4) {
    hex += ((bits[byte] << 3) | (bits[byte + 1] << 2) | (bits[byte + 2] << 1) | bits[byte + 3]).toString(16);
  }
  return { bits, hex, g };
}

/** Accepts a raw aHash ({bits}) or an analysis ({hashBits}). */
function bitsOf(hash) {
  if (!hash) return null;
  const bits = hash.bits || hash.hashBits;
  return bits && bits.length ? bits : null;
}

function hamming(hashA, hashB) {
  const a = bitsOf(hashA);
  const b = bitsOf(hashB);
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] ^ b[i];
  return d;
}

// ── Frame-level analysis ─────────────────────────────────────────────────────

function meanChroma(decoded, sampleStep = 97) {
  const { data } = decoded;
  const n = decoded.width * decoded.height;
  let sum = 0, count = 0;
  for (let i = 0; i < n; i += sampleStep) {
    const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
    sum += Math.abs(r - gg) + Math.abs((r + b) / 2 - gg);
    count++;
  }
  return count ? sum / count : 0;
}

/** decoded → cheap structural metrics (no semantics, no Vision). */
function analyzeDecoded(decoded) {
  const luma = lumaOf(decoded);
  const { g, means, stds } = gridStats(luma, decoded.width, decoded.height);
  let globalMean = 0;
  for (let i = 0; i < means.length; i++) globalMean += means[i];
  globalMean /= means.length;
  let varianceSum = 0;
  for (let i = 0; i < means.length; i++) varianceSum += (means[i] - globalMean) ** 2;
  const stdLuma = Math.sqrt(varianceSum / means.length);
  let structured = 0;
  for (let i = 0; i < stds.length; i++) if (stds[i] > 8) structured++;
  const coverage = structured / (g * g);

  // edge density: mean |Δ| between horizontally adjacent cell means
  let edgeSum = 0, edgeCount = 0;
  for (let cy = 0; cy < g; cy++) {
    for (let cx = 1; cx < g; cx++) {
      edgeSum += Math.abs(means[cy * g + cx] - means[cy * g + cx - 1]);
      edgeCount++;
    }
  }
  const hash = aHash(luma, decoded.width, decoded.height, g);
  const colorfulness = meanChroma(decoded);
  return {
    width: decoded.width,
    height: decoded.height,
    meanLuma: round(globalMean),
    stdLuma: round(stdLuma),
    coverage: round(coverage, 4),
    edgeDensity: round(edgeCount ? edgeSum / edgeCount : 0, 4),
    colorfulness: round(colorfulness, 3),
    hashHex: hash.hex,
    hashBits: hash.bits,
  };
}

/** path → analysis or { ok:false, error } — never throws. */
function analyzePngFile(p) {
  try {
    const buf = fs.readFileSync(p);
    return {
      ok: true, path: p, bytes: buf.length, ...analyzeDecoded(decodePng(buf)),
      flags: null, // filled by flagFrame()
    };
  } catch (error) {
    return { ok: false, path: p, bytes: 0, error: String(error.message || error), flags: null };
  }
}

/** Deterministic per-frame flags from THRESHOLDS. */
function flagFrame(analysis) {
  if (!analysis.ok) return { unreadable: true };
  const flags = [];
  if (analysis.stdLuma < THRESHOLDS.blankStdLuma && analysis.coverage < THRESHOLDS.blankCoverage) flags.push("BLANK_FRAME");
  if (analysis.coverage < THRESHOLDS.lowCoverage && analysis.stdLuma >= THRESHOLDS.blankStdLuma) flags.push("LOW_STRUCTURE");
  if (analysis.colorfulness < THRESHOLDS.grayscaleColorfulness) flags.push("GRAYSCALE_FALLBACK");
  return Object.fromEntries(flags.map((f) => [f, true]));
}

/** analyses → duplicate / near-identical groups (by Hamming distance). */
function nearDuplicateGroups(analyses, maxDistance = THRESHOLDS.nearDuplicateBits) {
  const groups = [];
  for (let i = 0; i < analyses.length; i++) {
    for (let j = i + 1; j < analyses.length; j++) {
      const a = analyses[i], b = analyses[j];
      if (!a.ok || !b.ok) continue;
      const d = hamming(a, b);
      if (d <= maxDistance) {
        groups.push({ a: a.path, b: b.path, distance: d, duplicate: d <= THRESHOLDS.duplicateBits });
      }
    }
  }
  return groups;
}

function round(v, digits = 2) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

module.exports = {
  THRESHOLDS, GRID,
  decodePng, lumaOf, gridStats, aHash, hamming,
  analyzeDecoded, analyzePngFile, flagFrame, nearDuplicateGroups, meanChroma,
};
