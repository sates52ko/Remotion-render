#!/usr/bin/env node
/**
 * build-channel-phrases.js — which sentences do the channel's narrations share? (lib/channel-phrases.js)
 *
 *   node scripts/build-channel-phrases.js [--root=<checkout>] [--write]
 *
 * Reads the captions of every books/<slug>/config.{antidote,vox}.json of the checkout → data/channel-phrases.json
 * (the 5-word runs said in at least 15 % of the films, and the channel's median rate). Read by originality-report.js
 * and narration-form-check.js. Reports; nothing refuses on it. Re-run after a batch of new films.
 */
const fs = require("fs");
const path = require("path");
const { census } = require("./lib/channel-phrases");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = args.root ? path.resolve(String(args.root)) : path.join(__dirname, "..");

const texts = [];
for (const d of fs.readdirSync(path.join(ROOT, "books")).sort()) for (const f of ["config.antidote.json", "config.vox.json"]) {
  try { const c = JSON.parse(fs.readFileSync(path.join(ROOT, "books", d, f), "utf8")); const t = (c.captions || []).map((x) => x.text).join(" "); if (t.split(/\s+/).length > 1500) { texts.push(t); break; } } catch {}
}
const r = census(texts);
console.log(`${r.films} narrations · ${r.runs.length} five-word runs said in at least 15 % of them · median ${r.median} per 1000 words`);
for (const x of r.runs.slice(0, 30)) console.log(`  ${String(x.films).padStart(3)} films  ${x.run}`);
if (r.films < 10) { console.error("✗ fewer than 10 narrations: not a channel — nothing written"); process.exit(1); }
if (args.write) {
  const out = path.join(__dirname, "..", "data", "channel-phrases.json");
  fs.writeFileSync(out, JSON.stringify({ _doc: "Five-word runs said in at least 15 % of the channel's narrations (scripts/build-channel-phrases.js). A new narration should say almost none of them.", films: r.films, median: r.median, runs: r.runs }, null, 1) + "\n");
  console.log(`→ ${out}`);
}
