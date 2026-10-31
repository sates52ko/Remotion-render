#!/usr/bin/env node
// Diagram capacity (2026-10-23, lib/diagram-capacity.js): the renderer draws flow ≤ 3, sorter ≤ 4, spectrum 2 poles,
// matchWave 1 label; anything else was dropped silently. (A) the table matches Diagram.tsx; (B) the REAL merge
// (--root=<temp>) refuses an over-capacity diagram and names the limit + the fix, and merges one that fits;
// (C) readcheck's reader sees only the drawn labels. Run: node scripts/test-diagram-capacity.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { CAPACITY, drawnLabels, capacityProblem } = require("./lib/diagram-capacity");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");

// ── (A) the table is what Diagram.tsx draws (fails if the renderer changes and this table does not) ──────────
const dsrc = fs.readFileSync(path.join(REPO, "src", "engines", "antidote", "components", "Diagram.tsx"), "utf8");
t("Diagram.tsx: sorter draws spec.labels.slice(0, 4)", /const labels = spec\.labels\.length \? spec\.labels\.slice\(0, 4\)/.test(dsrc) && CAPACITY.sorter.max === 4);
t("Diagram.tsx: flow draws spec.labels.slice(0, 3)", /const nodes = spec\.labels\.length \? spec\.labels\.slice\(0, 3\)/.test(dsrc) && CAPACITY.flow.max === 3);
t("Diagram.tsx: spectrum draws poles[0] and poles[1] (labels only when >= 2)", /const poles = spec\.labels\.length >= 2 \? spec\.labels : \["LESS", "MORE"\]/.test(dsrc) && /poles\[1\]/.test(dsrc) && !/poles\[2\]/.test(dsrc) && CAPACITY.spectrum.min === 2 && CAPACITY.spectrum.max === 2);
t("Diagram.tsx: matchWave draws spec.labels[0] only", /spec\.labels\[0\] \|\| "IN SYNC"/.test(dsrc) && !/spec\.labels\[1\]/.test(dsrc.slice(dsrc.indexOf("matchWave"), dsrc.indexOf("flow —") > 0 ? dsrc.indexOf("flow —") : undefined)) && CAPACITY.matchWave.max === 1);

// ── pure rule ────────────────────────────────────────────────────────────────
t("flow 3 fits, 4 refused naming the lost label", !capacityProblem("flow", ["a", "b", "c"]) && /at most 3 nodes \(4 given\) — "d" would not be drawn/.test(capacityProblem("flow", ["a", "b", "c", "d"])));
t("sorter 4 fits, 5 refused", !capacityProblem("sorter", ["a", "b", "c", "d"]) && /at most 4 bins/.test(capacityProblem("sorter", ["a", "b", "c", "d", "e"])));
t("spectrum needs both poles: 1 refused (screen would show LESS / MORE), 3 refused", /exactly 2 poles \(1 given\) — the screen would show "LESS" \/ "MORE"/.test(capacityProblem("spectrum", ["x"])) && !!capacityProblem("spectrum", ["a", "b", "c"]) && !capacityProblem("spectrum", ["a", "b"]));
t("matchWave: 1 fits, 2 refused", !capacityProblem("matchWave", ["sync"]) && /exactly 1 label \(2 given\)/.test(capacityProblem("matchWave", ["a", "b"])));
t("the refusal names both fixes", /Spread the labels over the next beats/.test(capacityProblem("flow", ["a", "b", "c", "d"])) && /rewrite the diagram to fit at most 3 nodes/.test(capacityProblem("flow", ["a", "b", "c", "d"])));
t("drawnLabels mirrors the renderer (cut, defaults)", JSON.stringify(drawnLabels("flow", ["a", "b", "c", "d"])) === '["a","b","c"]' && JSON.stringify(drawnLabels("spectrum", ["x"])) === '["LESS","MORE"]' && JSON.stringify(drawnLabels("matchWave", ["a", "b"])) === '["a"]' && JSON.stringify(drawnLabels("sorter", ["a"])) === '["a"]');

// ── (B) the real merge ───────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-capacity-"));
const SLUG = `zz-diagram-capacity-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const LINES = [
  "Welcome to this deep dive into how one choice spreads.",
  "First the thrones burned, then twenty houses turned away, then the campaign went unfunded, then the army starved.",
  "Steel, rations, supply lines and funded battalions all depend on the treasury.",
  "On one end a tiny closet, on the other an open stadium.",
  "Two rhythms slowly fall into sync.",
];
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of LINES) {
  const w = sent.split(" "), start = clock;
  let line = w[0];
  for (let k = 1; k < w.length; k++) line += `<${ts(start + k * 0.3)}><c> ${w[k]}</c>`;
  const end = start + w.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 2.5;
}
const CAST = { narrator: { name: "Narrator", role: "host", look: "host" } };
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Capacity Test", author: "A. Writer", genre: "nonfiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["heart"] } }));
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
try {
  run([path.join(__dirname, "plan-antidote.js"), `--slug=${SLUG}`, "--title=Capacity Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, "--scene-secs=2", `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const em = read(path.join(tmp, "beats.json"));
  const bs = em ? (em.beats || em) : [];
  const at = (re) => (bs.find((b) => re.test(b.narration || "")) || {}).i;
  const I = { flow: at(/thrones burned/), sorter: at(/Steel, rations/), spec: at(/tiny closet/), wave: at(/fall into sync/) };
  t("fixture: every case sentence is its own beat", Object.values(I).every((k) => k > 0) && new Set(Object.values(I)).size === 4, JSON.stringify(bs.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: bs.map((b) => ({ i: b.i, narration: b.narration })) }));
  const D = (bad) => ({
    [I.flow]: { type: "flow", labels: bad ? ["Thrones burned", "Houses turned", "Campaign unfunded", "Army starved"] : ["Thrones burned", "Houses turned", "Campaign unfunded"] },
    [I.sorter]: { type: "sorter", labels: bad ? ["Steel", "Rations", "Supply lines", "Battalions", "Treasury"] : ["Steel", "Rations", "Supply lines", "Battalions"] },
    [I.spec]: { type: "spectrum", labels: bad ? ["Tiny closet"] : ["Tiny closet", "Open stadium"], values: [0.1] },
    [I.wave]: { type: "matchWave", labels: bad ? ["Two rhythms", "In sync"] : ["Two rhythms"] },
  });
  const beat = (b, bad) => ({ i: b.i, concept: null, callout: null, storyboard: SB, diagram: D(bad)[b.i] || null, ...(D(bad)[b.i] ? { cast: [] } : {}) });
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(bs.map((b) => beat(b, true))));
  let r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const out = r.stdout || "";
  t("merge: a 4-node flow is refused, naming the undrawn label", r.status !== 0 && new RegExp(`${I.flow}.*diagram flow draws at most 3 nodes \\(4 given\\) — "Army starved" would not be drawn`).test(out), out.slice(-800));
  t("merge: a 5-bin sorter is refused", new RegExp(`${I.sorter}.*diagram sorter draws at most 4 bins \\(5 given\\)`).test(out));
  t("merge: a one-pole spectrum is refused", new RegExp(`${I.spec}.*diagram spectrum draws exactly 2 poles \\(1 given\\)`).test(out));
  t("merge: a two-label matchWave is refused", new RegExp(`${I.wave}.*diagram matchWave draws exactly 1 label \\(2 given\\)`).test(out));
  t("merge: the author is told the fix", /Spread the labels over the next beats/.test(out));
  t("merge: nothing is written on a problem", !fs.existsSync(path.join(BOOK, "art.json")));
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(bs.map((b) => beat(b, false))));
  r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const art = read(path.join(BOOK, "art.json"));
  t("merge: diagrams within capacity merge unchanged", r.status === 0 && !!art && (art.beats.find((b) => b.i === I.flow) || {}).diagram.labels.length === 3 && (art.beats.find((b) => b.i === I.sorter) || {}).diagram.labels.length === 4, (r.stdout || "").slice(-600));

  // ── (C) readcheck shows the reader only what is drawn ──────────────────────
  const over = { i: 1, diagram: { type: "flow", labels: ["Thrones burned", "Houses turned", "Campaign unfunded", "Fake confession"] }, cast: [] };
  fs.writeFileSync(path.join(BOOK, "art.json"), JSON.stringify({ ...art, beats: art.beats.map((b) => (b.i === I.flow ? { ...b, diagram: over.diagram } : b)) }));
  r = run([path.join(__dirname, "readcheck.js"), "prep", `--slug=${SLUG}`, `--root=${tmp}`]);
  const prepOut = (r.stdout || "") + (r.stderr || "");
  const rcDir = path.join(BOOK, "storyboard", "readcheck");
  const files = fs.existsSync(rcDir) ? fs.readdirSync(rcDir, { recursive: true }).map(String) : [];
  const text = files.filter((f) => /\.(json|md)$/.test(f)).map((f) => { try { return fs.readFileSync(path.join(rcDir, f), "utf8"); } catch { return ""; } }).join("\n");
  t("readcheck: the reader's diagram line holds the 3 drawn labels", /Thrones burned \/ Houses turned \/ Campaign unfunded/.test(text), prepOut.slice(-400) + " files=" + files.join(","));
  t("readcheck: the undrawn label never reaches the reader", text.length > 0 && !/Fake confession/.test(text));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall diagram-capacity tests passed");
process.exit(failed ? 1 : 0);
