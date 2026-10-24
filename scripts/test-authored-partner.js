#!/usr/bin/env node
// The SECOND person of an authored two-person beat (2026-10-22, lib/partner-contract.js): the planner no longer
// derives the partner's face / body from the lead's (happy -> worried, celebrate -> slump); the author writes
// `partnerExpression` / `partnerAction`, else neutral / idle; a verb that reads as a pair (fighting, grabbing,
// struggling, embrace) carries its partner; merge refuses a partnerAction that contradicts the pair; the lock seals
// the partner on every authored two-person beat and gate-authorship reports a later change. An authored `split`
// gets the split's two-tone field. Runs the REAL merge (--root=<temp>) and planner (--out) on a word-timed fixture.
// Run: node scripts/test-authored-partner.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const { PAIRED, partnerActionFor, partnerActionProblems } = require("./lib/partner-contract");
const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");

// ── (A) the contract (pure) ──────────────────────────────────────────────────
const ACT = new Set(["idle", "talk", "point", "celebrate", "slump", "think", "walk", "sit", "hold", "reach", "fighting", "struggling", "grabbing", "take", "embrace"]);
t("contract: the four paired verbs", JSON.stringify(PAIRED) === JSON.stringify({ fighting: "fighting", grabbing: "struggling", struggling: "grabbing", embrace: "embrace" }));
t("contract: no author choice -> idle", partnerActionFor("celebrate", undefined) === "idle");
t("contract: the author's choice is kept", partnerActionFor("point", "slump") === "slump");
t("contract: a paired verb carries its partner", partnerActionFor("grabbing", undefined) === "struggling" && partnerActionFor("embrace", undefined) === "embrace");
const two = ["mara", "luther"];
t("contract: a valid partnerAction has no problem", partnerActionProblems({ cast: two, action: "point", partnerAction: "slump" }, ACT).length === 0);
t("contract: an embrace answered with idle is refused, with the fix named", /contradicts action "embrace": its partner is "embrace"/.test(partnerActionProblems({ cast: two, action: "embrace", partnerAction: "idle" }, ACT).join()));
t("contract: partnerAction on a one-person cast is refused", /needs exactly two cast members/.test(partnerActionProblems({ cast: ["mara"], action: "point", partnerAction: "slump" }, ACT).join()));
t("contract: an unknown action is refused", /is not an action/.test(partnerActionProblems({ cast: two, action: "point", partnerAction: "dance" }, ACT).join()));
t("contract: take / a paired verb is never a free partner choice", /needs its own setup/.test(partnerActionProblems({ cast: two, action: "point", partnerAction: "take" }, ACT).join()) && /needs its own setup/.test(partnerActionProblems({ cast: two, action: "talk", partnerAction: "embrace" }, ACT).join()));

// ── fixture ──────────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "authored-partner-"));
const SLUG = `zz-authored-partner-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const LINES = [
  "Welcome to this deep dive into hard choices.",
  "Mara celebrates the win while Luther stands beside her.",
  "Mara points at him and Luther slumps in shame.",
  "Mara accuses him and Luther glares back in anger.",
  "Then the two of them start fighting outside.",
  "Mara grabs Luther by the arm with force.",
  "Luther struggles while Mara holds his coat.",
  "At last they hold each other close and cry.",
  "Two ways of living stand side by side here.",
  "The old house and the city split her life.",
  "Later Mara talks quietly while Luther listens.",
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
const CAST = { mara: { name: "Mara", role: "the daughter", look: "young woman" }, luther: { name: "Luther", role: "the father", look: "older man" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Pair Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["heart"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Pair Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const em = read(path.join(tmp, "beats.json"));
  const bs = em ? (em.beats || em) : [];
  const at = (re) => (bs.find((b) => re.test(b.narration || "")) || {}).i;
  const I = { cel: at(/celebrates the win/), slump: at(/slumps in shame/), glare: at(/glares back/), fight: at(/start fighting/), grab: at(/grabs Luther/),
    strug: at(/struggles while/), emb: at(/hold each other/), split: at(/side by side here/), splitSet: at(/split her life/), legacy: at(/talks quietly/) };
  t("fixture: every case sentence is its own beat", Object.values(I).every((k) => k > 0) && new Set(Object.values(I)).size === Object.keys(I).length, JSON.stringify(bs.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: bs.map((b) => ({ i: b.i, narration: b.narration })) }));
  const beat = (b, bad) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB };
    if (b.i === I.cel) Object.assign(x, { cast: two, expression: "happy", action: "celebrate" });                                  // no partner fields
    if (b.i === I.slump) Object.assign(x, { cast: two, expression: "angry", action: "point", partnerExpression: "sad", partnerAction: "slump" });
    if (b.i === I.glare) Object.assign(x, { cast: two, expression: "worried", action: "talk", partnerExpression: "angry", partnerAction: "point" });
    if (b.i === I.fight) Object.assign(x, { cast: two, action: "fighting" });
    if (b.i === I.grab) Object.assign(x, { cast: two, action: "grabbing" });
    if (b.i === I.strug) Object.assign(x, { cast: ["luther", "mara"], action: "struggling" });
    if (b.i === I.emb) Object.assign(x, { cast: two, action: "embrace", actionCue: "hold each other", partnerExpression: "sad", ...(bad ? { partnerAction: "idle" } : {}) });
    if (b.i === I.split) Object.assign(x, { cast: two, shotOverride: "split" });
    if (b.i === I.splitSet) Object.assign(x, { cast: ["mara"], shotOverride: "split", set: "abstract" });                // one person: warned, kept
    if (b.i === I.legacy) Object.assign(x, { expression: "happy" });                                                               // cast left to the engine
    if (bad && b.i === I.slump) x.cast = ["mara"];                                                                                // partnerAction on one person
    return x;
  };
  // ── (B) merge ──────────────────────────────────────────────────────────────
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(bs.map((b) => beat(b, true))));
  let r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  t("merge: an embrace answered with partnerAction idle is refused, naming the fix", r.status !== 0 && /partnerAction "idle" contradicts action "embrace": its partner is "embrace"/.test(r.stdout), (r.stdout || "").slice(-600));
  t("merge: partnerAction on a one-person cast is refused", /partnerAction is the second cast member's body: it needs exactly two cast members/.test(r.stdout));
  t("merge: nothing is written on a problem", !fs.existsSync(path.join(BOOK, "art.json")));
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(bs.map((b) => beat(b, false))));
  r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const art = read(path.join(BOOK, "art.json"));
  t("merge: a one-person split is a WARNING (empty second panel), not a problem; a two-person split is not warned", r.status === 0 && new RegExp(`${I.splitSet}: shotOverride "split" with one person`).test(r.stdout) && !new RegExp(`${I.split}: shotOverride "split"`).test(r.stdout), (r.stdout || "").slice(-400));
  t("merge: the one-person split stays as authored in art.json", !!art && (art.beats.find((b) => b.i === I.splitSet) || {}).shotOverride === "split");
  t("merge: valid partner fields merge and reach art.json", r.status === 0 && !!art && (art.beats.find((b) => b.i === I.slump) || {}).partnerAction === "slump" && (art.beats.find((b) => b.i === I.glare) || {}).partnerAction === "point", (r.stdout || "").slice(-600));
  // ── (C) plan ───────────────────────────────────────────────────────────────
  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-600));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    const P = (i) => (sc(i).characters || [])[1] || {};
    const L = (i) => ((sc(i)._authorship || {}).lock) || {};
    t("plan: no partner fields -> neutral / idle (no worried beside happy, no slump beside celebrate)", P(I.cel).expression === "neutral" && P(I.cel).action === "idle", JSON.stringify(P(I.cel)));
    t("plan: authored partner #1 kept (sad + slump)", P(I.slump).expression === "sad" && P(I.slump).action === "slump", JSON.stringify(P(I.slump)));
    t("plan: authored partner #2 kept (angry + point)", P(I.glare).expression === "angry" && P(I.glare).action === "point", JSON.stringify(P(I.glare)));
    t("plan: fighting -> partner fighting", P(I.fight).action === "fighting");
    t("plan: grabbing -> partner struggling", P(I.grab).action === "struggling");
    t("plan: struggling -> partner grabbing", P(I.strug).action === "grabbing");
    t("plan: embrace -> partner embraces back on the same cue, with the authored face", P(I.emb).action === "embrace" && P(I.emb).actionAt != null && P(I.emb).actionAt === (sc(I.emb).characters[0] || {}).actionAt && P(I.emb).expression === "sad", JSON.stringify(sc(I.emb).characters));
    t("plan: an authored split gets the two-tone field", sc(I.split).shot === "split" && Array.isArray((sc(I.split).bg || {}).split) && sc(I.split).bg.split.length === 2 && sc(I.split).bg.set === "none", JSON.stringify(sc(I.split).bg));
    t("plan: an authored split with an authored set keeps the set", sc(I.splitSet).shot === "split" && Array.isArray((sc(I.splitSet).bg || {}).split) && sc(I.splitSet).bg.set === "abstract", JSON.stringify(sc(I.splitSet).bg));
    t("plan: no split field on any scene that is not a split", cfg.scenes.every((s) => s.shot === "split" || !(s.bg && s.bg.split)), cfg.scenes.filter((s) => s.shot !== "split" && s.bg && s.bg.split).map((s) => s.id).join());
    // ── (D) lock + gate ───────────────────────────────────────────────────────
    t("lock: every authored two-person beat seals the partner (default, authored, paired)", [I.cel, I.slump, I.glare, I.fight, I.grab, I.strug, I.emb].every((i) => L(i).partnerAction === P(i).action && L(i).partnerExpression === P(i).expression), JSON.stringify([I.cel, I.glare].map((i) => [L(i).partnerAction, L(i).partnerExpression])));
    t("gate: the planned partners are not drift (a legitimate default is no FAIL)", [I.cel, I.slump, I.glare, I.fight, I.grab, I.strug, I.emb].every((i) => !stagingDrift(sc(i)).some((d) => /^partner/.test(d))), JSON.stringify([I.cel, I.emb].map((i) => stagingDrift(sc(i)))));
    const moved = JSON.parse(JSON.stringify(sc(I.cel)));
    moved.characters[1].expression = "worried"; moved.characters[1].action = "slump";
    t("gate: an engine that invents the partner's face and body is drift", stagingDrift(moved).some((d) => /^partner face neutral→worried/.test(d)) && stagingDrift(moved).some((d) => /^partner idle→slump/.test(d)), JSON.stringify(stagingDrift(moved)));
    restoreAuthoredStaging({ scenes: [moved] });
    t("gate --restore: the sealed partner is put back", moved.characters[1].expression === "neutral" && moved.characters[1].action === "idle");
    const old = JSON.parse(JSON.stringify(sc(I.cel)));
    delete old._authorship.lock.partnerAction; delete old._authorship.lock.partnerExpression;
    old.characters[1].expression = "worried";
    t("gate: an old config (no partner seal) is not judged on the partner", !stagingDrift(old).some((d) => /^partner/.test(d)));
    t("legacy: a beat whose cast the author left out keeps no partner seal", !("partnerAction" in L(I.legacy)) && !("partnerExpression" in L(I.legacy)), JSON.stringify(L(I.legacy)));
  }
  // ── (E) the rules authors read ────────────────────────────────────────────
  const sbSrc = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
  t("rules: the output schema offers partnerExpression and partnerAction", /"partnerExpression": "<expression>", \/\/ optional, two-person cast/.test(sbSrc) && /"partnerAction": "<action>",\s+\/\/ optional, two-person cast/.test(sbSrc));
  t("rules: authors are told to stage the second person on purpose; unwritten stays neutral; pairs named; no quota", /stage the SECOND person's reaction on purpose/.test(sbSrc) && /What you leave out stays neutral \/ idle/.test(sbSrc) && /grabbing <-> struggling, embrace <-> embrace/.test(sbSrc) && /There is no\s+gesture quota/.test(sbSrc));
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall authored-partner checks passed");
process.exit(failed ? 1 : 0);
