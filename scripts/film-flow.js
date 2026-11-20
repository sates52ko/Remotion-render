#!/usr/bin/env node
/**
 * film-flow.js — the flow numbers of a film, from its config (no render, no model call). Film Flow slice 0, 2026-11-12.
 *
 *   node scripts/film-flow.js --slug=<a>,<b> [--book-root=<checkout>] [--window=0-90] [--json]
 *   node scripts/film-flow.js --config=<path>[,<path>] [--name=A,B] [--window=0-90]     (isolated copies, A/B)
 *   node scripts/film-flow.js --recent=4
 *
 * What a still cannot show: how much of the film is a figure and a text, whether anybody does anything, how often a
 * scene repeats the one before, whether the rhythm is a metronome, whether the camera has a purpose, whether a cut
 * carries anything. Report-only (lib/film-flow.js); every Film Flow slice is shown against this table, next to the
 * before / after clip. `--window` is in seconds of film and selects a passage (the first 90 s: --window=0-90).
 */
const fs = require("fs");
const path = require("path");
const { filmFlow, flowTable } = require("./lib/film-flow");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(args["book-root"] && args["book-root"] !== true ? args["book-root"] : path.join(__dirname, ".."));
const win = typeof args.window === "string" && /^\d+(\.\d+)?-\d+(\.\d+)?$/.test(args.window) ? args.window.split("-").map(Number) : null;
if (args.window && !win) { console.error("--window=<fromSec>-<toSec>"); process.exit(2); }

const configOf = (slug) => ["config.antidote.json", "config.vox.json"].map((f) => path.join(ROOT, "books", slug, f)).find((f) => fs.existsSync(f));
let targets = [];
if (typeof args.config === "string") {
  const names = typeof args.name === "string" ? args.name.split(",") : [];
  targets = args.config.split(",").map((p, i) => [names[i] || path.basename(path.dirname(path.resolve(p))) || p, path.resolve(p)]);
} else if (typeof args.slug === "string") {
  targets = args.slug.split(",").map((s) => [s, configOf(s)]);
} else if (args.recent) {
  const n = Number(args.recent) || 4, dir = path.join(ROOT, "books");
  targets = fs.readdirSync(dir).map((s) => [s, configOf(s)]).filter(([, f]) => f)
    .sort((a, b) => fs.statSync(b[1]).mtimeMs - fs.statSync(a[1]).mtimeMs).slice(0, n);
} else {
  console.log("usage: node scripts/film-flow.js --slug=<a>,<b> | --config=<path>,<path> [--name=A,B] | --recent=4   [--window=0-90] [--book-root=<checkout>] [--json]");
  process.exit(2);
}
const missing = targets.filter(([, f]) => !f || !fs.existsSync(f));
if (missing.length) { console.error(`film-flow: no config for ${missing.map(([n]) => n).join(", ")} under ${ROOT}`); process.exit(1); }

const named = targets.map(([name, file]) => [name, filmFlow(JSON.parse(fs.readFileSync(file, "utf8")), { window: win })]);
if (args.json) console.log(JSON.stringify(Object.fromEntries(named), null, 2));
else {
  console.log(`Film flow${win ? ` — passage ${win[0]}–${win[1]} s` : ""} (report only; lower is better unless marked ↑)\n`);
  console.log(flowTable(named));
}
