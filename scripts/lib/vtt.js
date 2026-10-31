/**
 * vtt.js — shared word-level VTT parsing for the pipeline (Vox + Antidote).
 *
 * parseWords: YouTube word-timestamped VTT → [{ t, end, w }] (seconds).
 * buildCaptions: words → caption cues [{ text, startFrame, endFrame, words[] }].
 *
 * (plan-vox.js still carries its own copy for now; new engines use this.)
 */
function tc(t) {
  const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
}

function parseWords(vttText) {
  const lines = vttText.split(/\r?\n/);
  const words = [];
  let cueStart = 0;
  const cueHeader = /(\d+:\d+:\d+\.\d+)\s+-->\s+(\d+:\d+:\d+\.\d+)/;
  const inlineRe = /<(\d+:\d+:\d+\.\d+)><c>\s*([^<]+?)\s*<\/c>/g;
  for (const line of lines) {
    const h = line.match(cueHeader);
    if (h) { cueStart = tc(h[1]); continue; }
    if (!line.includes("<c>")) continue;
    const firstStamp = line.indexOf("<");
    const lead = firstStamp > 0 ? line.slice(0, firstStamp).trim() : "";
    if (lead) lead.split(/\s+/).forEach((w) => words.push({ t: cueStart, w }));
    let m;
    inlineRe.lastIndex = 0;
    while ((m = inlineRe.exec(line))) words.push({ t: tc(m[1]), w: m[2].trim() });
  }
  const seen = new Set();
  const out = [];
  for (const x of words) {
    if (!x.w) continue;
    const key = x.t.toFixed(3) + "|" + x.w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (out.length && out[out.length - 1].w === x.w && Math.abs(out[out.length - 1].t - x.t) < 0.05) continue;
    out.push(x);
  }
  out.sort((a, b) => a.t - b.t);
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].end = next ? Math.max(out[i].t + 0.1, next.t) : out[i].t + 0.5;
    if (out[i].end - out[i].t > 1.2) out[i].end = out[i].t + 0.6;
  }
  return out;
}

function buildCaptions(words, fps, until = Infinity) {
  const caps = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    caps.push({
      text: cur.map((w) => w.w).join(" "),
      startFrame: Math.round(cur[0].t * fps),
      endFrame: Math.round(cur[cur.length - 1].end * fps),
      words: cur.map((w) => ({ w: w.w, s: Math.round(w.t * fps), e: Math.round(w.end * fps) })),
    });
    cur = [];
  };
  for (const w of words) {
    if (w.t > until) break;
    cur.push(w);
    const dur = cur[cur.length - 1].end - cur[0].t;
    if (cur.length >= 9 || dur >= 3.0 || (/[.!?]$/.test(w.w) && cur.length >= 4)) flush();
  }
  flush();
  return caps;
}

/**
 * analyzeEngineFromVtt — which engine SHOWS this narration best (lib/engine-fit.js).
 * The old scorer counted proper nouns and statistics as Vox, so a novel's invented
 * cast and a self-help book's studies both pushed toward photoreal (WWL: "strong Vox"
 * although Flux refuses its central scenes). Kept for its callers (make-prompt,
 * make-book, storyboard). Returns { pick, confidence, antidoteScore, voxScore,
 * reasons[], risks[], signals, words }.
 */
function analyzeEngineFromVtt(vttText, ctx = {}) {
  const { analyzeEngineFit } = require("./engine-fit");
  const text = parseWords(vttText).map((w) => w.w).join(" ");
  const r = analyzeEngineFit(text, ctx);
  return { ...r, words: r.signals.words };
}

module.exports = { tc, parseWords, buildCaptions, analyzeEngineFromVtt };
