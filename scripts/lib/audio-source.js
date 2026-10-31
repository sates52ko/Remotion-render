/**
 * audio-source.js — which narration file a book is built from, and is it sound? (MP3 support, 2026-10-26)
 *
 * NotebookLM audio arrives as .m4a or .mp3. An MP3 of the same recording is usually much smaller, which matters
 * because a render bundle is a git push and GitHub refuses any file over 100 MB. Rules:
 *   - the REAL format is read with ffprobe, never trusted from the extension;
 *   - the narration must decode cleanly end to end and last as long as its captions — a gap is an error, never silent;
 *   - MP3-FIRST: when a book has both an .mp3 and an .m4a of one recording (same length ± MATCH_S), the valid .mp3
 *     wins (it fits a render bundle; 2026-10-27 a 106 MB .m4a was refused by 9 of 10 workers) — unless it alone is
 *     over GitHub's limit; two different lengths mean two different recordings → stop, a person picks;
 *   - a PLANNED book keeps its file; switching it is explicit (--use=mp3, below): same recording (length), captions
 *     covered, and the render input unchanged (renderInputHash names the mastered file, not the raw) — recorded in
 *     book.json → audioSourceHistory;
 *   - the choice is written to books/<slug>/book.json → audioSource ONLY for a new book (no config yet). A planned
 *     or published book keeps the file it was built from: findAudio() falls back to the old order m4a → mp3 → wav.
 *   - mastering (master-audio.js) reads the chosen raw directly: an MP3 is transcoded to AAC exactly once.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAW_EXTS = [".m4a", ".mp3", ".wav"]; // legacy order — what every existing book was built from
const GITHUB_FILE_LIMIT = 100 * 1024 * 1024;
const MATCH_S = 0.5; // two encodes of one recording differ by encoder padding (tens of ms), never by half a second
const MIN_SECONDS = 30;
const EXPECT = { ".mp3": /^mp3$/, ".m4a": /^(aac|alac)$/, ".wav": /^pcm_/ };

const isMastered = (p) => /\.mastered\.[a-z0-9]+$/i.test(String(p));

/** ffprobe → { format, codec, duration, bytes, bitRate, sampleRate, channels } or null (not audio / unreadable) */
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return null;
  let j;
  try { j = JSON.parse(r.stdout); } catch { return null; }
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  if (!a) return null;
  const f = j.format || {};
  return {
    format: String(f.format_name || ""), codec: String(a.codec_name || ""),
    duration: parseFloat(f.duration ?? a.duration), bytes: Number(f.size) || fs.statSync(file).size,
    bitRate: Number(f.bit_rate) || null, sampleRate: Number(a.sample_rate) || null, channels: Number(a.channels) || null,
  };
}

/** decode the whole audio stream: { seconds, errors[] } — the true length (an MP3 header length is often an estimate) */
function decode(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-v", "error", "-progress", "pipe:1", "-i", file, "-map", "0:a:0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const t = [...String(r.stdout || "").matchAll(/out_time_us=(\d+)/g)].map((m) => Number(m[1]));
  const errors = String(r.stderr || "").split(/\r?\n/).filter(Boolean);
  if (r.status !== 0 && !errors.length) errors.push(`ffmpeg exit ${r.status}`);
  return { seconds: t.length ? t[t.length - 1] / 1e6 : null, errors };
}

/** is this file a usable narration? { ok, problems[], warnings[], info } */
function validate(file, { full = true } = {}) {
  const ext = path.extname(file).toLowerCase();
  const problems = [], warnings = [];
  if (!fs.existsSync(file)) return { ok: false, problems: [`${file} does not exist`], warnings, info: null };
  const info = probe(file);
  if (!info) return { ok: false, problems: [`${path.basename(file)}: no audio stream (ffprobe cannot read it as audio)`], warnings, info: null };
  if (EXPECT[ext] && !EXPECT[ext].test(info.codec)) warnings.push(`${path.basename(file)} is really ${info.codec} in ${info.format}, not what "${ext}" says — ffmpeg reads it by content, but rename it`);
  if (full) {
    const d = decode(file);
    if (d.errors.length) problems.push(`${path.basename(file)}: ${d.errors.length} decode error(s), e.g. "${d.errors[0].slice(0, 160)}" — re-download the narration`);
    if (d.seconds != null) {
      if (Number.isFinite(info.duration) && Math.abs(d.seconds - info.duration) > 1) warnings.push(`${path.basename(file)}: header says ${info.duration.toFixed(1)} s, decoding gives ${d.seconds.toFixed(1)} s — the decoded length is used`);
      info.duration = d.seconds;
    }
  }
  if (!Number.isFinite(info.duration) || info.duration < MIN_SECONDS) problems.push(`${path.basename(file)}: ${Number.isFinite(info.duration) ? info.duration.toFixed(1) + " s" : "no duration"} — not a narration`);
  if (info.bitRate && info.bitRate < 64000 && ext !== ".wav") warnings.push(`${path.basename(file)}: ${Math.round(info.bitRate / 1000)} kbps — low; mastering re-encodes it to AAC 192k, it cannot add back what is missing`);
  if (info.sampleRate && info.sampleRate < 22050) warnings.push(`${path.basename(file)}: ${info.sampleRate} Hz sample rate — speech will sound dull`);
  return { ok: !problems.length, problems, warnings, info };
}

/** end of the last caption cue in a WebVTT file, in seconds (null if none) */
function vttEnd(vttFile) {
  if (!vttFile || !fs.existsSync(vttFile)) return null;
  const ts = [...fs.readFileSync(vttFile, "utf8").matchAll(/-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/g)];
  if (!ts.length) return null;
  return Math.max(...ts.map((m) => Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000));
}

/** the narration must cover its captions; a much longer recording means the captions are of another (shorter) cut */
function durationVsVtt(seconds, vttSeconds) {
  if (seconds == null || vttSeconds == null) return { problems: [], warnings: [] };
  const problems = [], warnings = [];
  // the tolerance is unchanged; a SMALL overhang may be ASR padding of the final cue — the message names the check that
  // proves it (fix-vtt-tail.js: speech ends inside the audio, pauses align) instead of a hand edit (2026-10-29)
  if (vttSeconds > seconds + 2) problems.push(`captions run to ${vttSeconds.toFixed(1)} s but the audio ends at ${seconds.toFixed(1)} s — the VTT belongs to another recording${vttSeconds - seconds <= Math.max(5, 0.005 * seconds) ? ` (or only its final cue's END is padded past the audio: verify with node scripts/fix-vtt-tail.js --slug=<slug> --dry — it clamps only when the speech provably ends inside the audio; never edit the timestamps by hand)` : ""}`);
  else if (seconds - vttSeconds > Math.max(30, 0.05 * seconds)) problems.push(`audio is ${seconds.toFixed(1)} s but the captions end at ${vttSeconds.toFixed(1)} s — ${(seconds - vttSeconds).toFixed(0)} s of narration has no captions`);
  else if (seconds - vttSeconds > 10) warnings.push(`audio runs ${(seconds - vttSeconds).toFixed(1)} s past the last caption (an outro?)`);
  return { problems, warnings };
}

const rawCandidates = (root, slug) => RAW_EXTS.map((e) => `public/audio/${slug}${e}`).filter((r) => fs.existsSync(path.join(root, r)));

/**
 * Pick the narration for a NEW book. Returns { rel, reason, problems[], warnings[], checked[] }; rel is null when
 * nothing usable exists. Never throws on bad audio — the caller stops on problems.
 */
function chooseNarration(root, slug, { vtt = null, full = true } = {}) {
  const checked = rawCandidates(root, slug).map((rel) => ({ rel, ...validate(path.join(root, rel), { full }) }));
  const problems = [], warnings = [];
  for (const c of checked) warnings.push(...c.warnings);
  const valid = checked.filter((c) => c.ok);
  for (const c of checked.filter((x) => !x.ok)) (valid.length ? warnings : problems).push(...c.problems.map((p) => (valid.length ? `ignored: ${p}` : p)));
  if (!checked.length) problems.push(`no narration: put public/audio/${slug}.mp3 (or .m4a)`);
  if (!valid.length) return { rel: null, reason: null, problems, warnings, checked };
  // two encodes of ONE recording, or two recordings? never pick silently between different lengths
  const lens = valid.map((c) => c.info.duration);
  if (Math.max(...lens) - Math.min(...lens) > MATCH_S) {
    problems.push(`different recordings: ${valid.map((c) => `${path.basename(c.rel)} ${c.info.duration.toFixed(1)} s`).join(" vs ")} — keep only the one the captions were made from`);
    return { rel: null, reason: null, problems, warnings, checked };
  }
  const compressed = valid.filter((c) => c.rel.endsWith(".mp3") || c.rel.endsWith(".m4a"));
  const pool = compressed.length ? compressed : valid;
  const fits = (c) => c.info.bytes <= GITHUB_FILE_LIMIT;
  const mp3 = pool.find((c) => c.rel.endsWith(".mp3") && fits(c));
  const best = mp3 || pool.slice().sort((a, b) => a.info.bytes - b.info.bytes)[0];
  const mb = (c) => (c.info.bytes / 1048576).toFixed(1) + " MB";
  const reason = valid.length === 1 ? `only ${path.extname(best.rel)} (${best.info.codec}, ${mb(best)})` : `${best === mp3 ? "MP3-first" : "smaller"} of ${valid.map((c) => `${path.extname(c.rel)} ${mb(c)}`).join(" / ")}, same length`;
  const v = durationVsVtt(best.info.duration, vtt ? vttEnd(path.isAbsolute(vtt) ? vtt : path.join(root, vtt)) : null);
  problems.push(...v.problems); warnings.push(...v.warnings);
  if (best.info.bytes > GITHUB_FILE_LIMIT) problems.push(`${best.rel} is ${mb(best)} — over GitHub's 100 MB file limit, a render bundle cannot carry it (export a smaller MP3)`);
  return { rel: best.rel, reason, duration: best.info.duration, problems, warnings, checked };
}

/**
 * The RAW file a config's meta.audio (relative to public/) was mastered from — what a render bundle must ship.
 * Prefers the book's recorded audioSource; otherwise the legacy order m4a → mp3 → wav (every existing book).
 */
function rawAudioFor(root, audioRel, slug) {
  const a = String(audioRel || "").replace(/^public\//, "");
  if (!isMastered(a)) return a;
  const stem = a.replace(/\.mastered\.[a-z0-9]+$/i, "");
  let src = null;
  try { src = JSON.parse(fs.readFileSync(path.join(root, "books", slug || path.basename(stem), "book.json"), "utf8")).audioSource || null; } catch {}
  if (src) {
    const s = String(src).replace(/^public\//, "");
    if (s.replace(/\.[a-z0-9]+$/i, "") === stem && fs.existsSync(path.join(root, "public", s))) return s;
  }
  return RAW_EXTS.map((e) => stem + e).find((c) => fs.existsSync(path.join(root, "public", c))) || stem + ".m4a";
}

/** files (repo-relative) over GitHub's 100 MB limit: [{ rel, bytes }] */
function oversize(root, rels) {
  return rels.map((rel) => { let b = 0; try { const st = fs.statSync(path.join(root, rel)); b = st.isFile() ? st.size : 0; } catch {} return { rel, bytes: b }; }).filter((f) => f.bytes > GITHUB_FILE_LIMIT);
}

/**
 * Switch a PLANNED book's narration to another encode of the SAME recording (e.g. its .mp3), explicitly.
 * Checks: the target decodes cleanly; it lasts as long as the file the book uses now (± MATCH_S) — the same timings;
 * it covers the captions; it fits a render bundle. The config is not touched and the render input does not change
 * (renderInputHash names the mastered file), so seals and accepted decisions keyed on that hash stay valid — this is
 * verified, not assumed. Writes book.json → audioSource + audioSourceHistory[]. Returns { ok, problems[], record }.
 */
function switchNarration(root, slug, toExt, { reason = null, now = new Date().toISOString(), full = true } = {}) {
  const ext = "." + String(toExt).replace(/^\./, "").toLowerCase();
  const to = `public/audio/${slug}${ext}`;
  const bookFile = path.join(root, "books", slug, "book.json");
  const problems = [];
  let book;
  try { book = JSON.parse(fs.readFileSync(bookFile, "utf8")); } catch { return { ok: false, problems: [`books/${slug}/book.json unreadable`], record: null }; }
  const from = "public/" + rawAudioFor(root, `audio/${slug}.mastered.m4a`, slug);
  if (from === to) return { ok: true, problems: [], record: null, unchanged: true };
  const a = validate(path.join(root, from), { full });
  const b = validate(path.join(root, to), { full });
  if (!b.ok) problems.push(...b.problems);
  const d1 = a.info && a.info.duration, d2 = b.info && b.info.duration;
  if (!a.ok) problems.push(...a.problems.map((p) => `current narration: ${p}`));
  else if (d2 != null && Math.abs(d1 - d2) > MATCH_S) problems.push(`${path.basename(to)} lasts ${d2.toFixed(2)} s but the book was built on ${path.basename(from)} (${d1.toFixed(2)} s) — a different recording, its timings would not match the captions and the plan`);
  const vtt = path.join(root, "public", "captions", `${slug}.vtt`);
  const v = durationVsVtt(d2, vttEnd(vtt));
  problems.push(...v.problems);
  if (b.info && b.info.bytes > GITHUB_FILE_LIMIT) problems.push(`${to} is over GitHub's 100 MB limit too`);
  // the render input must not move: same hash with the raw named either way
  const cfgFile = ["config.antidote.json", "config.vox.json"].map((c) => path.join(root, "books", slug, c)).find((p) => fs.existsSync(p));
  let hash = null;
  if (cfgFile) {
    const { renderInputHash } = require("./render-input");
    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    const h = (raw) => renderInputHash({ ...cfg, meta: { ...cfg.meta, audio: raw.replace(/^public\//, "") } });
    hash = h(from);
    if (h(to) !== hash) problems.push(`the render input would change (${hash} → ${h(to)}) — not a raw-only switch`);
  }
  if (problems.length) return { ok: false, problems, record: null };
  const record = { at: now, from, to, fromSeconds: Number(d1.toFixed(3)), toSeconds: Number(d2.toFixed(3)), fromBytes: a.info.bytes, toBytes: b.info.bytes, renderInputHash: hash, reason };
  book.audioSource = to;
  book.audioSourceHistory = [...(book.audioSourceHistory || []), record];
  fs.writeFileSync(bookFile, JSON.stringify(book, null, 2) + "\n");
  return { ok: true, problems: [], record };
}

module.exports = { switchNarration, RAW_EXTS, GITHUB_FILE_LIMIT, MATCH_S, isMastered, probe, decode, validate, vttEnd, durationVsVtt, rawCandidates, chooseNarration, rawAudioFor, oversize };

// CLI: node scripts/lib/audio-source.js --slug=<slug> --use=mp3 [--reason="..."]   (explicit switch of a planned book)
if (require.main === module) {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const m = x.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [x.replace(/^--/, ""), true]; }));
  if (!a.slug || !a.use) { console.error('usage: node scripts/lib/audio-source.js --slug=<slug> --use=mp3 [--reason="..."]'); process.exit(2); }
  const r = switchNarration(path.join(__dirname, "..", ".."), a.slug, a.use, { reason: typeof a.reason === "string" ? a.reason : null });
  if (!r.ok) { console.error("❌ narration NOT switched:\n" + r.problems.map((p) => "   " + p).join("\n")); process.exit(1); }
  if (r.unchanged) { console.log("✓ the book already uses that file"); process.exit(0); }
  console.log(`✓ ${a.slug}: narration ${r.record.from} → ${r.record.to} (${r.record.toSeconds} s, same recording; render input ${r.record.renderInputHash} unchanged) — recorded in book.json`);
}
