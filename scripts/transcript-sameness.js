#!/usr/bin/env node
/**
 * transcript-sameness.js — how much a narration is told in the channel's repeated way (the transcript view of
 * "repetitive, templated narratives" — Google Research S-CTS; YPP "inauthentic content", 2026-11-23).
 *
 *   node scripts/transcript-sameness.js --all [--extra=<dir>,…] [--json]        the channel table: every narration's run rate + nearest neighbours
 *   node scripts/transcript-sameness.js --slug=<slug> [--book-root=<checkout>]  this book → books/<slug>/transcript-sameness.json (exit 1 on REVIEW)
 *   node scripts/transcript-sameness.js --vtt=<file.vtt>                        a recording that is not a book yet (report only)
 *   node scripts/transcript-sameness.js --slug=<slug> --accept="<operator's words>"   the operator keeps a REVIEW recording (recorded)
 * Bar: data/quality-policy.json → transcriptSameness.reviewRunsPer1000 (operator). Method + what was measured: scripts/lib/transcript-sameness.js.
 */
const fs = require("fs");
const path = require("path");
const TS = require("./lib/transcript-sameness");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/s); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, ".."));
const extra = typeof args.extra === "string" ? args.extra.split(",").map((s) => s.trim()).filter(Boolean) : [];
// a linked worktree holds few VTTs: the main checkout's public/captions is the operator's drop folder (read only)
try {
  const { execFileSync } = require("child_process");
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  const main = path.resolve(common, "..");
  if (main !== path.resolve(ROOT) && fs.existsSync(path.join(main, "public", "captions"))) extra.push(path.join(main, "public", "captions"));
} catch {}
const policy = TS.policyOf(ROOT);
const pct = (x) => (x * 100).toFixed(1).padStart(5) + " %";
const f1 = (x) => Number(x).toFixed(1);

const docs = TS.corpus({ root: ROOT, extra, minWords: policy.minWords });
if (!docs.length) { console.error("no narration on disk (books/*/config.*.json captions, public/captions/*.vtt)"); process.exit(2); }

if (args.all) {
  const m = TS.measure(docs);
  if (args.json) { console.log(JSON.stringify(m, null, 2)); process.exit(0); }
  console.log(`── transcript sameness · ${docs.length} narrations · ${m.census.runs} channel runs (5 words, in ≥ 15 % of films) · REVIEW ≥ ${policy.reviewRunsPer1000} runs / 1000 words`);
  const rows = m.docs.slice().sort((a, b) => b.runs.per1000 - a.runs.per1000);
  for (const r of rows) console.log(`   ${r.runs.per1000 >= policy.reviewRunsPer1000 ? "✗" : "·"} ${r.id.padEnd(44).slice(0, 44)} runs ${f1(r.runs.per1000).padStart(4)}/1000  answer ${f1(r.answerWords).padStart(5)}/1000  style ${pct(r.style.sim)} ← ${String(r.style.nn).slice(0, 24).padEnd(24)}  topic ${pct(r.topic.sim)} ← ${String(r.topic.nn).slice(0, 24)}`);
  console.log(`\n   channel median: runs ${f1(m.median.runs)}/1000 · answer words ${f1(m.median.answerWords)}/1000 · style ${pct(m.median.style)} · topic ${pct(m.median.topic)} · ${rows.filter((r) => r.runs.per1000 >= policy.reviewRunsPer1000).length} of ${rows.length} at or over the bar`);
  console.log(`   (style and topic are reported only: measured 2026-11-23, no cosine separates a formed recording from the template — the hosts talk the same way in every film; the run rate does)`);
  process.exit(0);
}

let id, text;
if (typeof args.vtt === "string") { id = path.basename(args.vtt).replace(/\.clean\.vtt$|\.vtt$/, ""); text = TS.vttText(fs.readFileSync(args.vtt, "utf8")); }
else if (typeof args.slug === "string") {
  const n = TS.narrationOfBook(ROOT, args.slug);
  if (!n) { console.error(`✗ no narration for ${args.slug} (books/${args.slug}/config.*.json captions or public/captions/${args.slug}.vtt)`); process.exit(2); }
  id = args.slug; text = n.text;
} else { console.error("usage: node scripts/transcript-sameness.js --all | --slug=<slug> [--accept=\"…\"] | --vtt=<file.vtt>"); process.exit(2); }

const words = TS.tokens(text).length;
if (words < policy.minWords) { console.error(`✗ ${id}: ${words} words — under ${policy.minWords}, not a narration`); process.exit(2); }
const r = TS.measureOne({ id, text }, docs);
const verdict = TS.verdictOf(r.me.runs.per1000, policy);
console.log(`── transcript sameness · ${id} (${words} words) against ${r.corpus} narrations (${r.census.runs} channel runs)`);
console.log(`   channel runs:  ${f1(r.me.runs.per1000)} / 1000 words   (channel median ${f1(r.channelMedian.runs)}; REVIEW ≥ ${policy.reviewRunsPer1000})${r.me.runs.said.length ? ` — said: ${r.me.runs.said.slice(0, 4).map(([g, n]) => `"${g}" ×${n}`).join(", ")}` : ""}`);
console.log(`   answer words:  ${f1(r.me.answerWords)} / 1000 (right / exactly / yeah / absolutely; channel median ${f1(r.channelMedian.answerWords)}) — reported`);
console.log(`   style:         ${pct(r.me.style.sim)} ← nearest ${r.me.style.nn}   (channel median ${pct(r.channelMedian.style)}) — reported, no bar`);
console.log(`   topic:         ${pct(r.me.topic.sim)} ← nearest ${r.me.topic.nn}   (channel median ${pct(r.channelMedian.topic)}) — reported`);

if (typeof args.slug === "string") {
  const input = TS.inputHash(ROOT, args.slug);
  const prev = TS.readRecord(ROOT, args.slug);
  const accept = typeof args.accept === "string" && args.accept.trim().length >= 10 ? { by: "operator", words: args.accept.trim(), at: new Date().toISOString() } : null;
  if (typeof args.accept === "string" && !accept) { console.error("✗ --accept needs the operator's own words (≥ 10 characters)"); process.exit(2); }
  const rec = {
    slug: args.slug, at: new Date().toISOString(), input, corpus: r.corpus, policy: { reviewRunsPer1000: policy.reviewRunsPer1000 },
    runs: r.me.runs, answerWords: r.me.answerWords, style: r.me.style, topic: r.me.topic, channelMedian: r.channelMedian, verdict,
    ...(accept ? { accepted: accept } : prev && prev.accepted && prev.input && input && prev.input.sha256 === input.sha256 ? { accepted: prev.accepted } : {}),
  };
  TS.writeRecord(ROOT, args.slug, rec);
  console.log(`   → ${path.relative(ROOT, TS.recordPath(ROOT, args.slug)).replace(/\\/g, "/")}${rec.accepted ? ` · accepted by the operator (${rec.accepted.at.slice(0, 10)}): "${rec.accepted.words}"` : ""}`);
}
console.log(verdict === "REVIEW"
  ? `❌ REVIEW — this narration says the channel's repeated runs ${f1(r.me.runs.per1000)} times per 1000 words (bar ${policy.reviewRunsPer1000}): a transcript reader sees the channel's template. A new recording (Step 0: the form's SPEECH block, a different form) or the operator's --accept="<why>"`
  : `✅ OK — told its own way (${f1(r.me.runs.per1000)} channel runs / 1000 words < ${policy.reviewRunsPer1000})`);
process.exit(verdict === "REVIEW" && !(typeof args.accept === "string") ? 1 : 0);
