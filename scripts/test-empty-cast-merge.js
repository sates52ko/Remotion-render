#!/usr/bin/env node
// Authored cast semantics END TO END (2026-10-19, burn-of-the-everflame scene-111):
//   authored-K.json -> storyboard.js merge --write -> art.json -> plan-antidote
//   -> _authorship.lock -> post-plan engines -> gate-authorship (+ --restore)
//   cast ABSENT   = the author did not choose: the engine may cast, nothing is sealed
//   cast []       = the author wants NOBODY on screen: no step may add a figure, the gate
//                   FAILs on any figure (named or not), --restore removes it
//   cast [a, b]   = exactly these people, sealed
// Bug this guards: merge dropped `cast: []` (it only kept a non-empty list, or [] on a
// relationship-staged beat), so art.json had no cast, the lock sealed null and the
// planner put Luther on burn 111 — and the gate passed, because nothing was sealed. The
// gate also joined figures by `identity` only, so a role-only narrator added by a post-plan
// engine compared equal to an empty cast.
// Runs the REAL storyboard merge (--root=<temp>) and the REAL planner (--out) on a tiny
// word-timed fixture; nothing under books/ is touched.
// Run: node scripts/test-empty-cast-merge.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "empty-cast-merge-"));
const SLUG = `zz-empty-cast-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };

// ── fixture VTT (8 words = one caption = one scene at --scene-secs=2) ───────────
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "These people are covered in soot and blood.",
  "Luther waits by the gate for the queen.",
  "Luther argues with Teller about the old war.",
  "The crowd stares up at their silent queen.",
];
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" ");
  const start = clock;
  let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${ts(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
const CAST = {
  luther: { name: "Luther", role: "Diem's devoted mate, a commander", look: "tall man, dark coat" },
  teller: { name: "Teller", role: "Dean's mortal brother, grieving", look: "young man, grey tunic" },
  narrator: { name: "Narrator", role: "the host voice that frames the argument", look: "host" },
};
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Fire Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["compass"] } }));

const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Fire Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB_FIELDS = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };

try {
  let r = run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  t("fixture: the planner segments the fixture VTT", beats.length >= 4, (r.stderr || "").slice(-400));
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iEmpty = find(/covered in soot/), iAbsent = find(/waits by the gate/), iTwo = find(/argues with Teller/), iCrowd = find(/crowd stares/);
  t("fixture: every case sentence is its own beat", [iEmpty, iAbsent, iTwo, iCrowd].every((k) => k > 0) && new Set([iEmpty, iAbsent, iTwo, iCrowd]).size === 4, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  // authored-1.json: the storyboard authors' output (burn 111 shape: expression authored, cast [])
  const authored = beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, set: "horizon", expression: "neutral", action: "idle", storyboard: SB_FIELDS };
    if (b.i === iEmpty) Object.assign(x, { cast: [], expression: "worried" });           // nobody, deliberately
    else if (b.i === iCrowd) Object.assign(x, { cast: [], expression: undefined, action: undefined }); // nobody, no face fields
    else if (b.i === iTwo) Object.assign(x, { cast: ["luther", "teller"] });              // exactly these two
    else if (b.i === iAbsent) delete x.cast;                                               // not chosen
    else x.cast = ["narrator"];
    return x;
  });
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authored));
  r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const art = read(path.join(BOOK, "art.json"));
  t("merge --write writes art.json", !!art, (r.stdout || "").slice(-600) + (r.stderr || "").slice(-400));
  const ab = (i) => ((art && art.beats) || []).find((b) => b.i === i) || {};
  t("merge: authored cast [] reaches art.json as []", Array.isArray(ab(iEmpty).cast) && ab(iEmpty).cast.length === 0, JSON.stringify(ab(iEmpty).cast));
  t("merge: authored cast [] without face fields reaches art.json as []", Array.isArray(ab(iCrowd).cast) && ab(iCrowd).cast.length === 0, JSON.stringify(ab(iCrowd).cast));
  t("merge: an ABSENT cast stays absent (the engine may cast)", ab(iAbsent).i === iAbsent && !("cast" in ab(iAbsent)), JSON.stringify(ab(iAbsent).cast));
  t("merge: a filled cast is carried exactly", JSON.stringify(ab(iTwo).cast) === JSON.stringify(["luther", "teller"]), JSON.stringify(ab(iTwo).cast));
  // unsupported fields (burn scene-218: "shot" instead of "shotOverride" was silently dropped)
  {
    const ap = path.join(BOOK, "storyboard", "authored-1.json");
    const a0 = fs.readFileSync(ap, "utf8");
    const art0 = fs.readFileSync(path.join(BOOK, "art.json"), "utf8");
    fs.writeFileSync(ap, JSON.stringify(JSON.parse(a0).map((b) => (b.i === iTwo ? { ...b, shot: "close", mood: "tense" } : b))));
    r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
    const o = (r.stdout || "") + (r.stderr || "");
    t("merge: authored \"shot\" is refused with a shotOverride hint", r.status !== 0 && new RegExp(`${iTwo}: unsupported field "shot" — use "shotOverride"`).test(o), o.slice(-400));
    t("merge: any other unknown field is refused by name", /unsupported field "mood"/.test(o));
    t("merge: \"shot\" is not converted (art.json untouched)", fs.readFileSync(path.join(BOOK, "art.json"), "utf8") === art0);
    fs.writeFileSync(ap, a0);
    r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, `--root=${tmp}`]);
    t("merge: valid records raise no unsupported-field problem", !/unsupported field/.test((r.stdout || "") + (r.stderr || "")));
  }
  // STALE PREP (2026-10-20 review): a prep made before the story bible was final is refused at merge
  {
    const sha = (p) => (fs.existsSync(p) ? require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null);
    const vp = path.join(BOOK, "storyboard", "vocab.json");
    const bp = path.join(BOOK, "story-bible.json");
    const inputs = { "story-bible.json": sha(bp), "motifs.json": sha(path.join(BOOK, "motifs.json")) };
    fs.writeFileSync(vp, JSON.stringify({ icons: [], expressions: [], actions: [], holds: [], shots: [], sets: [], cast: Object.keys(CAST).map((key) => ({ key })), inputs }));
    r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, `--root=${tmp}`]);
    t("merge: a prep made from the current bible is not stale", /problems \(/.test(r.stdout || "") && !/STALE PREP/.test((r.stdout || "") + (r.stderr || "")), (r.stderr || "").slice(-300));
    const bible0 = fs.readFileSync(bp, "utf8");
    fs.writeFileSync(bp, JSON.stringify({ ...JSON.parse(bible0), cast: { ...CAST, guard: { name: "Guard", role: "gate guard", look: "helmet" } } }));
    const art0 = fs.readFileSync(path.join(BOOK, "art.json"), "utf8");
    r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
    t("merge --write on a stale prep leaves art.json untouched", fs.readFileSync(path.join(BOOK, "art.json"), "utf8") === art0);
    t("merge: a bible changed after prep is refused (STALE PREP)", r.status !== 0 && /STALE PREP: story-bible\.json/.test((r.stdout || "") + (r.stderr || "")), ((r.stdout || "") + (r.stderr || "")).slice(-500));
    fs.writeFileSync(bp, bible0);
    fs.rmSync(vp, { force: true });
  }

  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: the planner writes the config from the merged art.json", !!cfg, (r.stderr || r.stdout || "").slice(-600));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    const ids = (s) => (s.characters || []).map((c) => c.identity || c.role);
    const L = (s) => (s._authorship && s._authorship.lock) || {};
    for (const [name, i] of [["burn-111 shape", iEmpty], ["no face fields", iCrowd]]) {
      t(`plan (${name}): authored cast [] -> no figure in the config`, ids(sc(i)).length === 0, `${sc(i).shot}: ${ids(sc(i)).join("+")}`);
      t(`plan (${name}): the lock seals cast []`, Array.isArray(L(sc(i)).cast) && L(sc(i)).cast.length === 0, JSON.stringify(L(sc(i)).cast));
    }
    t("plan: an ABSENT cast is not sealed (engine's choice)", !Array.isArray(L(sc(iAbsent)).cast), JSON.stringify(L(sc(iAbsent)).cast));
    t("plan: a filled cast is drawn and sealed exactly", ids(sc(iTwo)).join("+") === "luther+teller" && (L(sc(iTwo)).cast || []).join("+") === "luther+teller", `${ids(sc(iTwo)).join("+")} / ${JSON.stringify(L(sc(iTwo)).cast)}`);

    const { stagingDrift, restoreAuthoredStaging, evaluateAuthorship } = require("./lib/authorship");
    const castDrift = (s) => stagingDrift(s).filter((d) => d.startsWith("cast "));
    t("gate: the planned empty-cast beat has no cast drift", castDrift(sc(iEmpty)).length === 0, JSON.stringify(stagingDrift(sc(iEmpty))));
    // post-plan engines: stage occupancy (visual-intent step 5) and mustShow repair (visual-contract)
    const { enforceSemanticRelevance } = require("./lib/visual-intent");
    const post = { meta: cfg.meta, scenes: JSON.parse(JSON.stringify([sc(iEmpty), sc(iCrowd)])) };
    post.scenes.forEach((s) => { s.props = []; delete s.concept; });
    enforceSemanticRelevance(post);
    t("post-plan: stage occupancy does not fill an authored empty cast", post.scenes.every((s) => (s.characters || []).length === 0), post.scenes.map((s) => ids(s).join("+")).join(" | "));
    const { applyContractRepair } = require("./lib/visual-contract");
    const rep = applyContractRepair(JSON.parse(JSON.stringify(sc(iEmpty))), { mustShow: ["characters"], mustNotShow: [] });
    t("post-plan: mustShow characters reports UNRESOLVED instead of adding a figure", (rep.scene.characters || []).length === 0 && rep.problems.some((p) => p.field === "cast"), JSON.stringify(rep.problems));
    const pre = JSON.parse(JSON.stringify(sc(iEmpty))); delete pre._authorship.lock;
    const rep2 = applyContractRepair(pre, { mustShow: ["characters"], mustNotShow: [] }, undefined, { castEmpty: true });
    t("plan-time (before the lock): castEmpty keeps the repair from adding a figure", (rep2.scene.characters || []).length === 0 && rep2.problems.some((p) => p.field === "cast"), JSON.stringify(rep2.problems));
    // the gate: ANY figure on an authored-empty beat fails — a named one and a role-only one
    for (const [name, fig] of [
      ["a named figure (luther)", { id: "x", rig: "everyman", identity: "luther", role: "luther", expression: "neutral", action: "idle" }],
      ["the stage-occupancy narrator (role only, no identity)", { role: "narrator", action: "talk", expression: "neutral", scale: 0.9 }],
      ["the contract-repair figure (role only)", { id: "c-x-0", rig: "everyman", role: "luther", expression: "neutral", enter: "fade", action: "talk", lookAt: "motif" }],
    ]) {
      const later = JSON.parse(JSON.stringify(sc(iEmpty)));
      later.characters = [fig];
      t(`gate: ${name} added later is cast drift`, castDrift(later).length > 0, JSON.stringify(stagingDrift(later)));
      const v = evaluateAuthorship({ meta: cfg.meta, scenes: [later] }, { engine: "antidote" }).violations;
      t(`gate: ${name} -> STAGING_OVERRIDDEN`, v.some((x) => x.code === "STAGING_OVERRIDDEN" && /cast /.test(x.message)), JSON.stringify(v.map((x) => x.code)));
      restoreAuthoredStaging({ scenes: [later] });
      t(`gate --restore: ${name} is removed`, (later.characters || []).length === 0 && castDrift(later).length === 0, JSON.stringify(later.characters));
    }
    // control: an engine-cast beat (cast absent) is free to change — no cast drift
    const free = JSON.parse(JSON.stringify(sc(iAbsent)));
    free.characters = [{ id: "y", rig: "everyman", identity: "teller", role: "teller" }];
    t("control: an ABSENT-cast beat may be recast by the engine (no cast drift)", castDrift(free).length === 0, JSON.stringify(stagingDrift(free)));
    // control: the filled cast is still guarded
    const swapped = JSON.parse(JSON.stringify(sc(iTwo)));
    swapped.characters = swapped.characters.slice(0, 1);
    t("control: dropping one of an authored two-person cast is cast drift", castDrift(swapped).length > 0, JSON.stringify(stagingDrift(swapped)));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : "\nall empty-cast merge checks passed");
process.exit(failed ? 1 : 0);
