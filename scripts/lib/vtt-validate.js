/**
 * vtt-validate.js — is this caption file what YouTube's "Upload file → With timing" accepts and shows cleanly?
 *
 * 2026-10-28 (The Fine Print / TFS regression): YouTube rejected an upload that still carried the raw ASR format —
 * inline `<c>` / `<00:00:01.234>` word-timing tags and "rolling" cues (each cue repeats the previous cue's line and
 * adds the next one), so every sentence appeared twice. clean-vtt.js produces the upload file; this checks it.
 * Deterministic; used by post-render.js, package-youtube.js, lint-titles.js --pack and check-clean-vtt.js.
 */
const fs = require("fs");

const toSec = (t) => { const p = t.split(":").map(parseFloat); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

function parseCues(text) {
  const cues = [];
  for (const b of String(text || "").replace(/\r\n/g, "\n").split(/\n\n+/)) {
    const lines = b.split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const m = lines[ti].match(/((?:\d+:)?\d\d:\d\d\.\d+)\s*-->\s*((?:\d+:)?\d\d:\d\d\.\d+)/);
    if (!m) { cues.push({ bad: lines[ti] }); continue; }
    cues.push({ start: toSec(m[1]), end: toSec(m[2]), lines: lines.slice(ti + 1).filter((l) => l.trim()) });
  }
  return cues;
}

const normText = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * @returns {{ok:boolean, errors:string[], warnings:string[], cues:number}}
 */
function validateUploadVtt(text) {
  const errors = [], warnings = [];
  const src = String(text || "").replace(/^\uFEFF/, "");
  if (!/^WEBVTT/.test(src)) errors.push("NO_HEADER: the file must start with WEBVTT");
  const cues = parseCues(src);
  if (!cues.length) errors.push("NO_CUES: no timed cues");
  const bad = cues.filter((c) => c.bad);
  if (bad.length) errors.push(`BAD_TIMING_LINE: ${bad.length} cue(s) with an unreadable timing line (e.g. "${bad[0].bad}")`);
  const ok = cues.filter((c) => !c.bad);
  const tagged = ok.filter((c) => c.lines.some((l) => /<\/?c[\s.>]|<\d\d:\d\d[:.]/.test(l)));
  if (tagged.length) errors.push(`INLINE_TAGS: ${tagged.length} cue(s) still carry ASR word-timing tags (<c> / <00:00:01.234>) — this is the raw VTT, not the upload file (scripts/clean-vtt.js)`);
  const empty = ok.filter((c) => !c.lines.length);
  if (empty.length) errors.push(`EMPTY_CUES: ${empty.length} cue(s) without text`);
  let back = 0, inverted = 0, overlap = 0, dup = 0, rolling = 0, repeated = 0;
  for (let i = 0; i < ok.length; i++) {
    const c = ok[i];
    if (c.end <= c.start) inverted++;
    if (i === 0) continue;
    const p = ok[i - 1];
    if (c.start < p.start) back++;
    else if (c.start < p.end - 0.001) overlap++;
    const a = normText(p.lines.join(" ")), b = normText(c.lines.join(" "));
    if (a && b === a) dup++;
    // a cue that extends an UNFINISHED previous line is the rolling artifact; one that repeats a finished sentence
    // can be speech ("Let him cough. Let him cough.") — an error only when it recurs (the old joiner did it ~100×)
    else if (a && a.split(" ").length >= 3 && b.startsWith(a + " ")) { if (/[.!?…"”')\]]$/.test(a)) repeated++; else rolling++; }
    else if (c.lines.length > 1 && p.lines.length && normText(c.lines[0]) === normText(p.lines[p.lines.length - 1])) rolling++;
  }
  if (inverted) errors.push(`INVERTED_TIMING: ${inverted} cue(s) end before they start`);
  if (back) errors.push(`NOT_SEQUENTIAL: ${back} cue(s) start before the previous cue`);
  if (overlap) errors.push(`OVERLAPPING: ${overlap} cue(s) overlap the previous cue`);
  if (dup) errors.push(`DUPLICATE_CUES: ${dup} cue(s) repeat the previous cue's text`);
  if (rolling) errors.push(`ROLLING_CUES: ${rolling} cue(s) repeat the previous cue's line (raw ASR rolling format — every sentence would show twice)`);
  if (repeated >= 3) errors.push(`ROLLING_CUES: ${repeated} cue(s) start with the whole previous cue (joined rolling lines — every sentence would show twice)`);
  else if (repeated) warnings.push(`REPEATED_SENTENCE: ${repeated} cue(s) start with the previous sentence (speech repetition?)`);
  const tiny = ok.filter((c) => c.end - c.start < 0.05).length;
  if (tiny) warnings.push(`TINY_CUES: ${tiny} cue(s) shorter than 50 ms`);
  return { ok: !errors.length, errors, warnings, cues: ok.length };
}

function validateUploadVttFile(file) {
  if (!fs.existsSync(file)) return { ok: false, errors: [`MISSING: ${file}`], warnings: [], cues: 0 };
  return validateUploadVtt(fs.readFileSync(file, "utf8"));
}

module.exports = { validateUploadVtt, validateUploadVttFile, parseCues };
