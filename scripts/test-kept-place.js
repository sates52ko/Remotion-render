#!/usr/bin/env node
// A kept stage keeps its PLACE (2026-10-24): on an authored `continue` beat the planner keeps the previous scene's set
// and texture and drops a split field that is not its own (the director had built the beat's background for its own
// shot pick: island 16 / inside-out 8 showed a two-tone split behind one person — blind: "the split-colour room has no
// clear meaning"). The colour script's mood arc is NOT frozen. Runs the REAL planner on a word-timed fixture.
// Run: node scripts/test-kept-place.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kept-place-"));
const SLUG = `zz-kept-place-${process.pid}`;
const BOOK = path.join(REPO, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const LINES = [
  "Welcome to a story about one long afternoon.",
  "Two ways of living stand side by side in her mind.",
  "She sits in the classroom and stares at the board.",
  "Then she grips her desk with both hands.",
  "She stands up and the whole room goes quiet.",
  "Out comes a scream that lasts a full minute.",
  "The teacher does not know what to say.",
  "Later she walks home along the cold river.",
  "The water is grey and slow under the bridge.",
  "She stops and looks at her reflection.",
  "Nothing about her face looks the same.",
  "At home the kitchen light is already on.",
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
const CAST = { ada: { name: "Ada", role: "the student", look: "teenage girl" }, narrator: { name: "Narrator", role: "host", look: "host" } };
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
try {
  fs.mkdirSync(BOOK, { recursive: true });
  fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
  fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
  fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Place Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
  fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["heart"] } }));
  const base = [path.join(__dirname, "plan-antidote.js"), `--slug=${SLUG}`, "--title=Place Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const em = read(path.join(tmp, "beats.json"));
  const bs = em ? (em.beats || em) : [];
  const at = (re) => (bs.find((b) => re.test(b.narration || "")) || {}).i;
  const I = { split: at(/side by side/), sits: at(/stares at the board/), grips: at(/grips her desk/), stands: at(/stands up/), scream: at(/scream/), river: at(/walks home/), water: at(/water is grey/), stops: at(/looks at her reflection/) };
  t("fixture: every case sentence is its own beat", Object.values(I).every((k) => k > 0) && new Set(Object.values(I)).size === 8, JSON.stringify(bs.map((b) => b.narration)));
  const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
  const beat = (b) => {
    const x = { i: b.i, narration: b.narration, concept: null, diagram: null, callout: null, storyboard: SB };
    if (b.i === I.split) Object.assign(x, { cast: ["ada"], shotOverride: "split" });
    if (b.i === I.sits) Object.assign(x, { cast: ["ada"], action: "sit", continue: true, shotOverride: "medium" }); // kept, re-framed after an authored split
    if (b.i === I.grips) Object.assign(x, { cast: ["ada"], action: "idle", set: "classroom" });
    if (b.i === I.stands) Object.assign(x, { cast: ["ada"], action: "idle", continue: true });
    if (b.i === I.scream) Object.assign(x, { cast: ["ada"], action: "idle", expression: "afraid", continue: true });
    if (b.i === I.river) Object.assign(x, { cast: ["ada"], action: "walk", set: "horizon" });
    if (b.i === I.water) Object.assign(x, { cast: ["ada"], action: "walk", continue: true });
    if (b.i === I.stops) Object.assign(x, { cast: ["ada"], action: "idle", continue: true, set: "street" }); // an authored place change wins
    return x;
  };
  fs.writeFileSync(path.join(tmp, "art.json"), JSON.stringify({ beats: bs.map(beat) }));
  const r = run([...base, `--callouts=${path.join(tmp, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-500));
  if (cfg) {
    const sc = cfg.scenes;
    const kept = sc.map((s, i) => [s, i]).filter(([s, i]) => i > 0 && s.continueFromPrev === true);
    t("fixture: there are kept beats", kept.length >= 5, String(kept.length));
    t("no kept beat shows a split field unless it is a split shot", kept.every(([s]) => s.shot === "split" || !(s.bg && s.bg.split)), JSON.stringify(kept.filter(([s]) => s.shot !== "split" && s.bg && s.bg.split).map(([s]) => s.id)));
    t("a kept beat re-framed after an authored split loses the split field", !sc[I.sits].bg.split && sc[I.sits].bg.set !== "none", JSON.stringify(sc[I.sits].bg));
    t("kept beats keep the place of the beat they continue (set + texture)", [I.stands, I.scream, I.water].every((i) => sc[i].bg.set === sc[i - 1].bg.set && (sc[i].bg.texture || null) === (sc[i - 1].bg.texture || null)), JSON.stringify([I.stands, I.scream, I.water].map((i) => [sc[i - 1].bg.set, sc[i].bg.set, sc[i - 1].bg.texture, sc[i].bg.texture])));
    t("the authored set chain carries: classroom through the scream, horizon along the river", sc[I.scream].bg.set === "classroom" && sc[I.water].bg.set === "horizon", JSON.stringify([sc[I.scream].bg.set, sc[I.water].bg.set]));
    t("an authored set on a kept beat still wins", sc[I.stops].bg.set === "street", sc[I.stops].bg.set);
  }
  const src = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
  t("the colour arc is not frozen (the kept beat does not copy the previous colours)", !/d\.bg = JSON\.parse\(JSON\.stringify\(lastPlannedBg\)\)/.test(src) && /lastPlannedBg\.texture/.test(src));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(BOOK, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall kept-place tests passed");
process.exit(failed ? 1 : 0);
