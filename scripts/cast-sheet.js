#!/usr/bin/env node
/**
 * cast-sheet.js — SEE a told book's people before anyone authors with them, and have them told apart BLIND
 * (Film Flow 4 / told v3, 2026-11-17; the same idea as own-icons-sheet.js for drawings).
 *
 * dracula's eight people were eight figures a viewer told apart by reading their name plates. A person of
 * storyboard/entities.json has a signature — `look` (the silhouette, the dress), `holds` (a hand prop) or `carries`
 * (one of the book's own drawings) — and `reads`: what a stranger may call them, written BEFORE the test.
 *
 *   node scripts/cast-sheet.js --slug=<slug> [--book-root=<checkout>] [--cloud]
 *     one picture per person: the figure as the told stage draws it, alone, WITHOUT a name, no HUD, no words.
 *     The rig needs the engine, so the pictures are stills rendered on GitHub Actions (never on this PC):
 *       without --cloud  writes storyboard/own-people/sheet/{manifest.json, configs/cast.json} and prints the two
 *                        commands (stills-cloud.js push, then this script with --collect=<fetched dir>);
 *       with --cloud     pushes, waits, fetches and collects (5–15 min).
 *     → storyboard/own-people/NN.png + own-people.key.json + OWN-PEOPLE-PROMPT.md
 *   node scripts/cast-sheet.js --slug=<slug> --collect=<dir of a stills-cloud fetch>
 *   node scripts/cast-sheet.js --slug=<slug> --judge=<answers.json>          { "1": "man in a black cape", … }
 *     → storyboard/own-people.verdict.json (each answer against the person's `reads`, bound to the look's hash).
 *       Exit 1 when someone was read as something else. `storyboard.js merge` refuses a told beat that puts such a
 *       person on stage. Give them a signature a stranger sees, run the sheet and the test again.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const OD = require("./lib/own-drawings");
const { compileTold } = require("./lib/told-compile");

const CODE = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
if (typeof SLUG !== "string") { console.error("usage: node scripts/cast-sheet.js --slug=<slug> [--book-root=<checkout>] [--cloud | --collect=<dir> | --judge=<answers.json>]"); process.exit(2); }
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : CODE);
const BOOK = path.join(ROOT, "books", SLUG), SB = path.join(BOOK, "storyboard"), DIR = path.join(SB, "own-people"), SHEET = path.join(DIR, "sheet");
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return d; } };
const num = (n) => String(n + 1).padStart(2, "0");
const KEY = path.join(SB, "own-people.key.json"), ANSWERS = path.join(SB, "own-people.answers.json");

const own = OD.readBook(BOOK), people = own.people;
if (!people.length) { console.log(`no people in ${rel(path.join(SB, "entities.json"))} — nothing to check`); process.exit(0); }
const FRAMES = 60, AT = 45; // each person stands alone for 2 s; the picture is taken when they have come to rest

if (args.judge) {
  if (typeof args.judge !== "string" || !fs.existsSync(args.judge)) { console.error(`✗ --judge=<answers.json>: a file { "<number>": "<who the picture shows>" } (${args.judge} not found)`); process.exit(1); }
  const key = readJSON(KEY, null);
  const stale = !key ? ["the cast sheet was never made"] : people.filter((p, n) => !key[n + 1] || key[n + 1].key !== p.key || key[n + 1].hash !== p.hash).map((p) => `"${p.entity}" changed after the sheet was made`);
  if (stale.length) { console.error(`✗ ${stale.join("; ")} — make the sheet again (without --judge) and have it seen again`); process.exit(1); }
  const verdict = { ...OD.judge(people, readJSON(args.judge, {}) || {}), slug: SLUG, at: new Date().toISOString() };
  fs.writeFileSync(own.peopleVerdictFile, JSON.stringify(verdict, null, 2));
  for (const [k, r] of Object.entries(verdict.drawings)) console.log(`  ${r.ok ? "✓" : "✗"} ${String(r.n).padStart(2)}  ${k.padEnd(24)} seen as "${r.answer == null ? "— (no answer)" : r.answer}"${r.ok ? "" : `   wanted: ${r.accepted.join(" / ")}`}`);
  console.log(`${verdict.named} of ${verdict.total} people seen as intended → ${rel(own.peopleVerdictFile)}`);
  if (verdict.named < verdict.total) { console.log(`Give the ✗ ones a signature a stranger sees (look: outfit / hair / headwear / beard / glasses / height; holds; carries), make the sheet and test again. Never add the misreading to "reads".`); process.exit(1); }
  process.exit(0);
}

function collect(dir) {
  const raw = [path.join(dir, "raw"), dir].find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => /^cast-f\d+\.png$/.test(f)));
  if (!raw) { console.error(`✗ no cast-f<frame>.png under ${dir} — is this the folder of the stills-cloud fetch?`); process.exit(1); }
  fs.mkdirSync(DIR, { recursive: true });
  people.forEach((p, n) => {
    const src = path.join(raw, `cast-f${n * FRAMES + AT}.png`);
    if (!fs.existsSync(src)) { console.error(`✗ ${path.basename(src)} is missing (person ${n + 1}, ${p.entity})`); process.exit(1); }
    fs.copyFileSync(src, path.join(DIR, `${num(n)}.png`));
  });
  fs.writeFileSync(path.join(SB, "OWN-PEOPLE-PROMPT.md"), `# Who is this? — ${SLUG} (told v3)

Give ONE picture to ONE fresh agent (model: sonnet) that has seen neither entities.json, the key file nor the book:

You are a blind rater. Read exactly one image: ${DIR}/NN.png. It shows one person from an animated explainer, alone. In 2-6 words, who is this — what a stranger would call them from what they SEE (their dress, hair, hat, beard, glasses, age, what they hold): e.g. "old man with a cane". Do not guess a name or a story, do not open any other file. Reply with ONLY those words.

Collect the answers in ${ANSWERS} as { "1": "<words>", "2": "<words>", … } (pictures 01 … ${num(people.length - 1)}), then:
  node scripts/cast-sheet.js --slug=${SLUG} --judge=${ANSWERS}
A person read as something else gets a clearer signature in entities.json (look / holds / carries) and the sheet is made again — a told beat that puts them on stage is refused at merge. Never add the misreading to "reads".
`);
  console.log(`✓ ${rel(DIR)}/ — ${people.length} people, one picture each. Have them seen blind: ${rel(path.join(SB, "OWN-PEOPLE-PROMPT.md"))}`);
}

if (typeof args.collect === "string") { if (!readJSON(KEY, null)) { console.error("✗ make the sheet first (without --collect)"); process.exit(1); } collect(path.resolve(args.collect)); process.exit(0); }

// ── the sheet: one told stage per person, alone, as the film draws them — and no name ───────────────────────────────
const problems = OD.peopleProblems(people, own.entities);
if (problems.length) { for (const m of problems) console.error(`  ✗ ${m}`); console.error(`❌ ${problems.length} problem(s) with the people of ${rel(path.join(SB, "entities.json"))} — fix them first. Nothing was made.`); process.exit(1); }
const beats = people.map((p, n) => ({ id: `cast-${num(n)}`, frames: FRAMES, words: [], told: { stage: { layout: "solo", who: [p.entity] } } }));
// each person on an empty stage of their own (a carried stage would walk the last one off in the next one's picture)
const stages = beats.map((b) => compileTold([b], own.entities, { motifs: own.motifs, palette: own.palette }));
const bad = stages.flatMap((r) => r.errors);
if (bad.length) { for (const e of bad) console.error(`  ✗ ${e.message}`); process.exit(1); }
const scenes = stages.map((r, n) => {
  const stage = r.stages[0];
  for (const it of stage.items) if (it.kind === "figure") delete it.label; // WITHOUT the name
  stage.cam = [{ at: 0, dur: 1, x: 960, y: 590, s: 1.75 }]; // close on the person: in the whole frame they are a tenth of the picture
  return { id: `cast-${num(n)}`, fromFrame: n * FRAMES, durationFrames: FRAMES, _narration: "", shot: "single", transition: { type: "cut", frames: 0 },
    bg: { type: "gradient", colors: ["rgb(243,241,236)", "rgb(239,237,230)"], set: "office", texture: "grid", accent: "#1C1917", act: "setup" },
    camera: { zoom: [1, 1], panX: [0, 0], panY: [0, 0] }, characters: [], props: [], texts: [], told: stage };
});
const total = scenes.length * FRAMES;
const config = { meta: { slug: `${SLUG}-cast-sheet`, title: "", author: "", genre: "", fps: 30, width: 1920, height: 1080, durationInFrames: total, flow: 2, hud: { enabled: false } }, scenes, captions: [], promises: [], audioEvents: [], totalFrames: total };
fs.mkdirSync(path.join(SHEET, "configs"), { recursive: true });
fs.writeFileSync(path.join(SHEET, "configs", "cast.json"), JSON.stringify(config));
const manifest = path.join(SHEET, "manifest.json");
fs.writeFileSync(manifest, JSON.stringify({ schema: "stills/1", name: `cast sheet ${SLUG}`, composition: "Antidote-lab", entry: "src/index.ts", silent: true, gl: "default", shards: 1,
  jobs: [{ id: "cast", config: "configs/cast.json", frames: people.map((_, n) => n * FRAMES + AT) }] }, null, 2));
fs.writeFileSync(KEY, JSON.stringify(Object.fromEntries(people.map((p, n) => [n + 1, { key: p.key, intended: p.intended, accepted: p.accepted, hash: p.hash, file: `own-people/${num(n)}.png` }])), null, 2));
const TAG = `cast-${SLUG}-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)}`.slice(0, 60);
if (!args.cloud) {
  console.log(`✓ ${rel(manifest)} — ${people.length} people. Render it in the cloud (nothing renders on this PC):`);
  console.log(`    node scripts/stills-cloud.js push --manifest=${manifest} --tag=${TAG}`);
  console.log(`    node scripts/stills-cloud.js fetch --tag=${TAG} --out=${path.join(SHEET, "stills")}`);
  console.log(`    node scripts/cast-sheet.js --slug=${SLUG}${args["book-root"] ? ` --book-root=${args["book-root"]}` : ""} --collect=${path.join(SHEET, "stills")}`);
  console.log(`  (or run this script with --cloud: it does the three steps and waits)`);
  process.exit(0);
}
const run = (label, argv) => { console.log(`\n── ${label}`); const r = spawnSync(process.execPath, [path.join(__dirname, "stills-cloud.js"), ...argv], { cwd: CODE, stdio: "inherit" }); if (r.status !== 0) { console.error(`cast-sheet: ${label} failed (exit ${r.status}). Nothing was rendered on this PC.`); process.exit(r.status || 1); } };
run("1/2 push to GitHub Actions", ["push", `--manifest=${manifest}`, `--tag=${TAG}`]);
run("2/2 wait + download", ["fetch", `--tag=${TAG}`, `--out=${path.join(SHEET, "stills")}`, "--wait-min=60"]);
collect(path.join(SHEET, "stills"));
