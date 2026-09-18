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
 * analyzeEngineFromVtt — score VTT text for Vox vs Antidote.
 * Returns { pick: "vox"|"antidote", confidence: "strong"|"moderate"|"weak", antidoteScore, voxScore }
 */
function analyzeEngineFromVtt(vttText) {
  const words = parseWords(vttText);
  const text = words.map((w) => w.w).join(" ");
  const tokens = text.split(/\s+/).filter(Boolean);
  const n = tokens.length || 1;

  const PRONOUNS = new Set("he she they him her his hers their them we i you".split(" "));
  const STORY = /\b(story|man|woman|boy|girl|father|mother|son|daughter|friend|day|night|room|door|walked|looked|said|asked|felt|remember|years?|old|home|house|street|car|hands?|face|eyes)\b/gi;
  const DATA = /\b(percent|percentage|study|studies|research|data|average|statistics?|rate|ratio|billion|million|thousand|dollars?|economy|market|number|graph|chart)\b/gi;

  let pron = 0, proper = 0;
  tokens.forEach((t, i) => {
    const raw = t.replace(/[^A-Za-z']/g, "");
    if (!raw) return;
    if (PRONOUNS.has(raw.toLowerCase())) pron++;
    if (/^[A-Z][a-z]{2,}$/.test(raw) && i > 0 && !/[.!?]$/.test(tokens[i - 1])) proper++;
  });
  const numbers = (text.match(/\$?\d[\d,.]*%?/g) || []).length;
  const story = (text.match(STORY) || []).length;
  const data = (text.match(DATA) || []).length;

  const per1k = (x) => +((x / n) * 1000).toFixed(1);
  // Proper nouns (named characters/places) are a VOX signal — photoreal cut-outs
  // of nameable figures is Vox's strength. Pronouns + generic story words push
  // toward Antidote (everyman characters, no specific people to depict).
  // Numbers/data are also Vox signals (data visualization, stats).
  const antidoteScore = per1k(pron) * 0.6 + per1k(story) * 0.8;
  const voxScore = per1k(proper) * 2.0 + per1k(numbers) * 1.3 + per1k(data) * 1.5;
  const pick = antidoteScore >= voxScore ? "antidote" : "vox";
  const margin = Math.abs(antidoteScore - voxScore);
  const confidence = margin > 20 ? "strong" : margin > 8 ? "moderate" : "weak";
  return { pick, confidence, antidoteScore: +antidoteScore.toFixed(1), voxScore: +voxScore.toFixed(1), words: n };
}

module.exports = { tc, parseWords, buildCaptions, analyzeEngineFromVtt };
