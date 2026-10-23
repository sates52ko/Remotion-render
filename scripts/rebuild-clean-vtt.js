/**
 * rebuild-clean-vtt.js — rebuild a YouTube-ready .clean.vtt from the book's own
 * config captions (word-timed, the same data the film burns in).
 *
 * Needed because render-github-cleanup.js --all also removes the local upload
 * captions; the config copy is committed and is the authoritative narration.
 *
 * Usage: node scripts/rebuild-clean-vtt.js <slug>
 */
const fs = require("fs");
const path = require("path");

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/rebuild-clean-vtt.js <slug>");
  process.exit(1);
}
const ROOT = path.join(__dirname, "..");
const cfg = JSON.parse(
  fs.readFileSync(path.join(ROOT, "books", slug, "config.antidote.json"), "utf8").replace(/^\uFEFF/, "")
);
const FPS = cfg.meta.fps || 30;
const caps = cfg.captions || [];
if (!caps.length) {
  console.error("no captions in config");
  process.exit(1);
}

const ts = (f) => {
  const s = Math.max(0, f) / FPS;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.toFixed(3).padStart(6, "0")}`;
};

// A cue must be readable: 2 lines max, ~42 chars each, and 0.7s-7s on screen.
const MIN = Math.round(0.7 * FPS);
const MAX = Math.round(7 * FPS);
const MAXCHARS = 84;

function wrap(text) {
  if (text.length <= MAXCHARS) return [text];
  const words = text.split(/\s+/);
  const lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur && (cur.length + 1 + w.length) > MAXCHARS && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
  }
  return lines;
}

const out = [];
for (const c of caps) {
  let s = Math.round(c.startFrame);
  let e = Math.round(c.endFrame);
  if (e <= s) e = s + MIN;
  // Enforce a minimum readable dwell without overlapping the next cue.
  if (e - s < MIN) e = s + MIN;
  const text = String(c.text).replace(/\s+/g, " ").trim();
  if (!text) continue;
  out.push({ s, e, lines: wrap(text) });
}

// Keep cues strictly sequential and non-overlapping.
for (let i = 0; i < out.length; i++) {
  if (i + 1 < out.length && out[i].e > out[i + 1].s) out[i].e = out[i + 1].s;
  if (out[i].e <= out[i].s) out[i].e = out[i].s + 1;
  if (out[i].e - out[i].s > MAX) out[i].e = out[i].s + MAX;
}

const vtt = [
  "WEBVTT",
  "",
  `NOTE Generated from ${slug}/config.antidote.json (word-timed narration captions).`,
  "",
  // Blank line between cues: legal WebVTT, and the most conservative input for
  // YouTube's manual caption uploader.
  ...out.map((c) => `${ts(c.s)} --> ${ts(c.e)}\n${c.lines.join("\n")}\n`),
  "",
].join("\n");

const dest = path.join(ROOT, "public", "captions", `${slug}.clean.vtt`);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, vtt, "utf8");

const durs = out.map((c) => (c.e - c.s) / FPS);
console.log(`✓ ${path.relative(ROOT, dest)} — ${out.length} cues`);
console.log(`  duration: ${(durs.reduce((a, b) => a + b, 0) / 60).toFixed(2)} min of caption time`);
console.log(`  cue length: min ${Math.min(...durs).toFixed(2)}s · max ${Math.max(...durs).toFixed(2)}s · avg ${(durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(2)}s`);
console.log(`  last cue ends: ${ts(out[out.length - 1].e)} (video ${(cfg.meta.durationInFrames / FPS).toFixed(1)}s)`);
