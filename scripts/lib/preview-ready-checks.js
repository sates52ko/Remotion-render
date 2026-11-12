/**
 * preview-ready-checks.js — pure checks used by scripts/preview-ready.js (unit-tested in
 * scripts/test-preview-ready-checks.js).
 *
 *   voxImageCoverage — every image the authored designs.json asks for must reach the config and the disk.
 *     gen-vox-images.py drops an image ref whose file did not generate ("reconciled: dropped N") and exits 0;
 *     cutout.py keeps any cut it wrote, even an empty one. Without this check a beat the author staged with a
 *     picture silently renders text-only (their-eyes-were-watching-god, 2026-10-27: 5 authored images missing,
 *     one compare side gone, beat-134-a-cut.png = 15 opaque pixels of 1,048,576). Missing evidence is not a PASS.
 *   pipelineHeads — which code the pipeline steps ran on, scoped to THIS production (runs at/after the
 *     production-base.json pin), so runs from before the pin never produce a false "MIXED code" line.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Fraction of pixels with alpha > 10 (cutout.py's own trim threshold). null = cannot tell (not a PNG / interlaced /
// unsupported); 1 = no alpha channel (fully opaque).
function pngOpaqueFraction(buf) {
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf || buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return null;
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0, trns = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("latin1", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!w || !h || interlace) return null;
  if (ctype !== 6 && ctype !== 4 && !(ctype === 3 && trns)) return 1;      // no alpha channel at all
  if (depth !== 8) return null;
  const ch = ctype === 6 ? 4 : ctype === 4 ? 2 : 1, stride = w * ch;
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return null; }
  if (raw.length < h * (stride + 1)) return null;
  let prev = Buffer.alloc(stride), opaque = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let p;
      if (ft === 0) p = 0; else if (ft === 1) p = a; else if (ft === 2) p = b; else if (ft === 3) p = (a + b) >> 1;
      else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else return null;
      line[x] = (line[x] + p) & 255;
    }
    for (let x = 0; x < w; x++) {
      const al = ctype === 6 ? line[x * 4 + 3] : ctype === 4 ? line[x * 2 + 1] : (line[x] < trns.length ? trns[line[x]] : 255);
      if (al > 10) opaque++;
    }
    prev = line;
  }
  return opaque / (w * h);
}

const MIN_OPAQUE = 0.01; // a cut-out with < 1% visible pixels shows nothing on screen

// designs.json is either a bare design[] or the emit-beats payload {beats:[{design}]} (plan-vox.js), aligned by index
// with config.vox.json beats (plan-vox merges short VTT cues BEFORE reading designs, so the order is the same).
function voxImageCoverage({ designs, config, publicDir }) {
  const arr = Array.isArray(designs) ? designs : ((designs && designs.beats) || []).map((b) => (b && b.design) || b);
  const beats = (config && config.beats) || [];
  const findings = [];
  if (arr.length !== beats.length) {
    findings.push({ beat: "-", problem: `designs.json has ${arr.length} designs, config has ${beats.length} beats — authored images cannot be verified` });
    return { ok: false, findings, asked: 0 };
  }
  const fileOk = (rel) => { try { return fs.statSync(path.join(publicDir, rel)).size > 8000; } catch { return false; } };
  let asked = 0;
  beats.forEach((b, i) => {
    const d = arr[i] || {};
    const id = b.id || `beat-${String(i).padStart(3, "0")}`;
    const imgs = (b.images || []).filter((im) => im && im.path);
    const cmp = d.compare && d.compare.left && d.compare.right;
    const twoSided = cmp && (b.type === "compare" || b.type === "duo");
    if (twoSided) {
      asked += 2;
      for (const [side, suf] of [["left", "-a.png"], ["right", "-b.png"]]) {
        if (!imgs.some((im) => im.path.endsWith(suf))) findings.push({ beat: id, problem: `compare ${side} side (${suf.slice(1, 2)}) authored but not in config (image dropped or never generated)` });
      }
    } else if (d.image && d.image.subject) {
      asked += 1;
      if (!imgs.length) findings.push({ beat: id, problem: "authored image not in config (dropped or never generated)" });
    }
    for (const im of imgs) {
      if (!fileOk(im.path)) findings.push({ beat: id, problem: `image file missing on disk: public/${im.path}` });
      if (im.cut) {
        let buf = null; try { buf = fs.readFileSync(path.join(publicDir, im.cut)); } catch {}
        const f = buf ? pngOpaqueFraction(buf) : null;
        if (f != null && f < MIN_OPAQUE) findings.push({ beat: id, problem: `cut-out nearly empty: public/${im.cut} (${(f * 100).toFixed(3)}% opaque)` });
      }
    }
  });
  return { ok: findings.length === 0, findings, asked };
}

// heads of the pipeline steps of THIS production: runs before the pin (production-base.json `at`) are another
// production's history (same rule as preview-state.js's mute-run scope)
function pipelineHeads(runs, pin) {
  const from = pin && pin.at ? Date.parse(pin.at) || 0 : 0;
  const scoped = (runs || []).filter((r) => (Date.parse(r.at) || 0) >= from);
  const heads = [...new Set(scoped.map((r) => (r.head || "").slice(0, 7)).filter(Boolean))];
  return { scoped, heads, mixed: heads.length > 1, before: (runs || []).length - scoped.length };
}

/**
 * Will the narration this book uses fit a render bundle? (2026-10-27: a 106 MB .m4a was refused by 9 of 10 workers at
 * render time, after the whole preview was done.) Size only — the bundle decodes it before any push (render-bundle.js).
 * Returns { ok, rel, bytes, detail, alt } — alt: another encode on disk under the limit (switch: audio-source.js --use).
 */
function narrationFitsBundle({ root, slug }) {
  const { rawAudioFor, rawCandidates, GITHUB_FILE_LIMIT } = require("./audio-source");
  // the audio the CONFIG names (what the bundle ships), resolved to its raw source; no config yet → the slug's file
  let named = `audio/${slug}.mastered.m4a`;
  for (const c of ["config.antidote.json", "config.vox.json"]) {
    try { const a = JSON.parse(fs.readFileSync(path.join(root, "books", slug, c), "utf8")).meta.audio; if (typeof a === "string" && a) { named = a; break; } } catch {}
  }
  const rel = "public/" + rawAudioFor(root, named, slug);
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return { ok: false, rel, bytes: 0, detail: `${rel} not on disk`, alt: null };
  const bytes = fs.statSync(abs).size;
  const mb = (n) => (n / 1048576).toFixed(1) + " MB";
  if (bytes <= GITHUB_FILE_LIMIT) return { ok: true, rel, bytes, detail: `${rel} ${mb(bytes)} (under GitHub's 100 MB file limit)`, alt: null };
  const alt = rawCandidates(root, slug).filter((r) => r !== rel).map((r) => ({ rel: r, bytes: fs.statSync(path.join(root, r)).size })).find((c) => c.bytes <= GITHUB_FILE_LIMIT) || null;
  return { ok: false, rel, bytes, alt, detail: `${rel} is ${mb(bytes)} — every render worker would refuse it` + (alt ? `; ${alt.rel} (${mb(alt.bytes)}) is on disk: if it is the same recording, node scripts/lib/audio-source.js --slug=${slug} --use=${path.extname(alt.rel).slice(1)} (checks the length; render input unchanged)` : "; export a smaller MP3 of the same recording") };
}

module.exports = { pngOpaqueFraction, voxImageCoverage, pipelineHeads, narrationFitsBundle, MIN_OPAQUE };
