// vtt-tail.js — the narrow repair for a VTT whose LAST cue ends past the end of its audio (2026-10-29).
//
// Why: the-magician-s-nephew — MP3 1916.459 s, last cue "who decided not to steal." 1914.720 --> 1918.640: the cue END
// ran 2.18 s past the file, so make-book's audio/VTT gate (captions may not end > 2 s after the audio) stopped the
// book. The speech itself ends at ~1916.11 (silence to EOF), every word onset is inside the audio, and the captions
// line up with the audio's pauses within 6-19 ms: YouTube ASR pads the final cue. 6 of 6 real NotebookLM pairs
// overhang (+1.50 … +2.67 s); 3 exceed the gate.
//
// This module only DECIDES (pure; the caller measures the audio). It never moves a cue start, never changes text,
// never touches any cue but the trailing one(s) past EOF, and never changes the gate's tolerance. It refuses whenever
// the overhang could be a real mismatch (another recording, a cut audio, speech timestamped past the end).

const TS = /(\d+):(\d{2}):(\d{2})[.,](\d{3})|(\d{1,2}):(\d{2})[.,](\d{3})/;
const toSec = (m) => (m[1] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : Number(m[5]) * 60 + Number(m[6]) + Number(m[7]) / 1000);
const fmt = (s) => { const ms = Math.floor(s * 1000 + 1e-6); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };

function parseCues(text) {
  const lines = String(text).split(/\r?\n/);
  const cues = [];
  for (let k = 0; k < lines.length; k++) {
    const m = /^\s*(\S+)\s+-->\s+(\S+)(.*)$/.exec(lines[k]);
    if (!m) continue;
    const a = TS.exec(m[1]), b = TS.exec(m[2]);
    if (!a || !b) continue;
    const body = [];
    // a cue body ends at an EMPTY line (YouTube's rolling cues open with a line holding one space — still body)
    for (let j = k + 1; j < lines.length && lines[j] !== ""; j++) body.push(lines[j]);
    const words = [...body.join("\n").matchAll(/<((?:\d+:)?\d{1,2}:\d{2}[.,]\d{3})>/g)].map((x) => toSec(TS.exec(x[1])));
    cues.push({ line: k, start: toSec(a), end: toSec(b), startText: m[1], endText: m[2], rest: m[3], body, words });
  }
  return { lines, cues };
}

// measured: { audioEnd (decoded seconds), silences: [{start, end|null}] absolute seconds over the tail window,
//             window: [from, to] }   — end null = the silence runs to EOF
function planTailClamp(text, measured, { margin = 0.1, match = 0.15 } = {}) {
  const { cues, lines } = parseCues(text);
  const E = measured.audioEnd;
  const refuse = (code, why) => ({ ok: false, code, why, changes: [] });
  if (!cues.length) return refuse("NO_CUES", "no cues in the VTT");
  if (!Number.isFinite(E) || E <= 0) return refuse("NO_AUDIO", "the audio's decoded length is unknown");
  const maxEnd = Math.max(...cues.map((c) => c.end));
  const over = maxEnd - E;
  if (over <= 0) return { ok: true, code: "NOTHING_TO_DO", why: `the captions end at ${maxEnd.toFixed(3)} s, inside the audio (${E.toFixed(3)} s)`, changes: [], overhang: over };
  const limit = Math.max(5, 0.005 * E);
  if (over > limit) return refuse("TOO_LONG", `the captions run ${over.toFixed(2)} s past the audio (limit ${limit.toFixed(1)} s): another recording or a cut audio — an input problem, not padding`);
  // 1. only the trailing cue(s) may end past EOF
  const past = cues.map((c, k) => ({ c, k })).filter(({ c }) => c.end > E);
  const firstPast = past[0].k;
  if (cues.slice(firstPast).some((c) => c.end <= E)) return refuse("NOT_TRAILING", "a cue past the audio end is followed by a cue inside it — not a padded final cue");
  if (past.length > 2) return refuse("NOT_TRAILING", `${past.length} cues end past the audio — more than the final cue (and its roll-over)`);
  // 2. nothing SPOKEN is timestamped past the end
  const late = cues.filter((c) => c.start >= E - margin);
  if (late.length) return refuse("SPEECH_PAST_END", `cue ${late[0].startText} starts at or after the audio end — speech timestamped past the file`);
  const lateWord = cues.flatMap((c) => c.words).find((w) => w >= E - margin);
  if (lateWord != null) return refuse("SPEECH_PAST_END", `a word is timestamped at ${lateWord.toFixed(3)} s, past the audio end ${E.toFixed(3)} s`);
  // 3. the audio really ends in silence (speech stopped before EOF): a silence that runs to the end of the file
  const sil = measured.silences || [];
  const tail = sil.find((s) => s.end == null || s.end >= E - 0.02);
  if (!tail) return refuse("TAIL_NOT_SILENT", "no silence runs to the end of the audio — speech reaches EOF (a cut recording?); not padding");
  const lastOnset = Math.max(...cues.flatMap((c) => (c.words.length ? c.words : [c.start])));
  if (lastOnset > tail.start + margin) return refuse("TAIL_NOT_SILENT", `the last word (${lastOnset.toFixed(3)} s) is timestamped inside the final silence (${tail.start.toFixed(3)} s)`);
  // 4. the captions belong to THIS audio: an internal pause ends where a word starts
  const onsets = cues.flatMap((c) => (c.words.length ? c.words.concat([c.start]) : [c.start])).filter((t) => t >= (measured.window ? measured.window[0] : 0));
  const inner = sil.filter((s) => s !== tail && s.end != null);
  const hits = inner.filter((s) => onsets.some((t) => Math.abs(t - s.end) <= match));
  if (!inner.length || !hits.length) return refuse("NOT_ALIGNED", `no pause in the last ${measured.window ? (measured.window[1] - measured.window[0]).toFixed(0) : "?"} s ends on a caption word (±${match} s) — cannot show the VTT is of this recording`);
  const newEnd = fmt(Math.floor(E * 1000) / 1000);
  const changes = [];
  for (const { c } of past) {
    if (c.start >= Math.floor(E * 1000) / 1000) return refuse("START_AFTER_END", `cue ${c.startText} would end before it starts`);
    changes.push({ line: c.line, from: lines[c.line], to: `${c.startText} --> ${newEnd}${c.rest}`, cueStart: c.start, oldEnd: c.end });
  }
  return { ok: true, code: "CLAMP", why: `the final cue ends ${over.toFixed(2)} s past the audio; speech ends at ${tail.start.toFixed(3)} s, the file at ${E.toFixed(3)} s; ${hits.length} pause(s) align with caption words`,
    overhang: +over.toFixed(3), changes, evidence: { audioEnd: E, speechEnd: tail.start, lastOnset, alignedPauses: hits.length, pauses: inner.length } };
}

function applyChanges(text, changes) {
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  const lines = String(text).split(/\r?\n/);
  for (const c of changes) { if (lines[c.line] !== c.from) throw new Error(`line ${c.line + 1} changed since it was read`); lines[c.line] = c.to; }
  return lines.join(eol);
}

module.exports = { parseCues, planTailClamp, applyChanges, fmt };
