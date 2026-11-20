/**
 * channel-phrases.js — the sentences the channel's films share (2026-11-19, YPP "generic or repetitive content").
 *
 * A channel is read as a whole: the same linking lines in most of its narrations ("which brings us to the" — 67 of 86
 * films) are a template a reader of transcripts sees at once. census() finds the 5-word runs said in at least 15 % of
 * the films; rate() says how often ONE narration says such a run, per 1000 words. Pure; data/channel-phrases.json is
 * built by scripts/build-channel-phrases.js. Reports only.
 */
const N = 5;
const clean = (t) => String(t || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
const runsOf = (words) => { const s = []; for (let i = 0; i + N <= words.length; i++) s.push(words.slice(i, i + N).join(" ")); return s; };

/** texts: one narration per film → { films, runs: [{ run, films }], median (channel-common runs per 1000 words) } */
function census(texts, { share = 0.15, floor = 5, minWords = 1500 } = {}) {
  const films = texts.map(clean).map((t) => t.split(" ")).filter((w) => w.length > minWords), df = new Map();
  for (const w of films) for (const g of new Set(runsOf(w))) df.set(g, (df.get(g) || 0) + 1);
  const runs = [...df.entries()].filter(([, c]) => c >= Math.max(floor, films.length * share)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([run, c]) => ({ run, films: c }));
  const set = new Set(runs.map((r) => r.run));
  const rates = films.map((w) => (runsOf(w).filter((g) => set.has(g)).length / w.length) * 1000).sort((a, b) => a - b);
  return { films: films.length, runs, median: rates.length ? Math.round(rates[rates.length >> 1] * 10) / 10 : 0 };
}

/** how often this narration says a channel-common run: { per1000, said: [[run, times]…] } (null when too short) */
function rate(text, data) {
  const w = clean(text).split(" ");
  if (w.length < 300 || !data || !Array.isArray(data.runs)) return null;
  const set = new Set(data.runs.map((r) => r.run)), said = new Map();
  for (const g of runsOf(w)) if (set.has(g)) said.set(g, (said.get(g) || 0) + 1);
  const hits = [...said.values()].reduce((a, b) => a + b, 0);
  return { per1000: Math.round((hits / w.length) * 10000) / 10, said: [...said.entries()].sort((a, b) => b[1] - a[1]) };
}

function load() {
  try { return JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "data", "channel-phrases.json"), "utf8")); } catch { return null; }
}

module.exports = { N, clean, census, rate, load };
