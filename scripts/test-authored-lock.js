#!/usr/bin/env node
// Every AUTHORED beat is sealed, not only staged ones (2026-10-20; burn 217/236, the-courage-to-be-disliked 19/19:
// an engine stamped a chapter card over authored beats — the card replaces the whole scene — and the gate never saw
// it, because a beat with only an icon + callout had no lock and a "chapterCard" shot made the scene exempt).
//   icon + callout beat -> lock seals concept/props + the callout text + planShot (NOT the engine's shot/set/cast)
//   chapter arcs never place a card on an authored beat or an untitled chapter (reported, not moved)
//   gate: a locked beat is never exempt; "authored beat replaced by a chapter card" / "callout dropped" are drift
//   --restore: removes the card, puts the shot back, re-adds the callout
// Runs the REAL merge (--root=<temp>) and planner (--out) on a word-timed fixture.
// Run: node scripts/test-authored-lock.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const { stagingDrift, restoreAuthoredStaging, evaluateAuthorship } = require("./lib/authorship");
const { planChapterArcs } = require("./lib/antidote-chapter-arcs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "authored-lock-"));
const SLUG = `zz-authored-lock-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "The old fire still burns across the land.",
  "Luther waits by the gate for the queen.",
  "The crowd stares up at their silent queen.",
  "A storm gathers over the northern mountain pass.",
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
const CAST = { luther: { name: "Luther", role: "a commander", look: "tall man, dark coat" }, narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Fire Test", author: "A. Writer", genre: "fiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["fire", "storm"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const base = [PLAN, `--slug=${SLUG}`, "--title=Fire Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
try {
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iIcon = find(/fire still burns/), iStaged = find(/waits by the gate/), iStorm = find(/storm gathers/);
  t("fixture: case sentences are their own beats", [iIcon, iStaged, iStorm].every((k) => k > 0) && new Set([iIcon, iStaged, iStorm]).size === 3, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const authored = beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB };
    if (b.i === iIcon) Object.assign(x, { concept: "fire", callout: { text: "The old fire burns", style: "reveal" } }); // icon + callout ONLY
    if (b.i === iStaged) Object.assign(x, { cast: ["luther"], expression: "worried", action: "idle", set: "forest", callout: { text: "Luther waits", style: "highlight" } });
    if (b.i === iStorm) Object.assign(x, { concept: "storm", callout: { text: "A storm gathers", style: "reveal" } });
    return x;
  });
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authored));
  let r = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  t("merge --write writes art.json", fs.existsSync(path.join(BOOK, "art.json")), (r.stdout || "").slice(-500));
  r = run([...base, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-500));
  if (cfg) {
    const sc = (i) => cfg.scenes[i] || {};
    const Li = sc(iIcon)._authorship && sc(iIcon)._authorship.lock;
    const Ls = sc(iStaged)._authorship && sc(iStaged)._authorship.lock;
    t("lock: an icon + callout beat is sealed now", !!Li, JSON.stringify(sc(iIcon)._authorship));
    if (Li) {
      t("lock: it seals the icon (concept + props)", Li.concept === "fire" && (Li.propTypes || []).includes("fire"), JSON.stringify(Li));
      t("lock: it seals the callout text", (Li.artTexts || []).some((x) => /OLD FIRE BURNS/i.test(x.text)), JSON.stringify(Li.artTexts));
      t("lock: it does NOT seal the engine's shot/set/cast (the author left staging to the engine)", !("shot" in Li) && !("set" in Li) && !("cast" in Li) && Li.planShot === sc(iIcon).shot, JSON.stringify(Li));
      t("gate: the freshly planned icon beat has no drift", stagingDrift(sc(iIcon)).length === 0, JSON.stringify(stagingDrift(sc(iIcon))));
      // an engine changes only the shot of the icon beat: allowed (not authored)
      const shotOnly = JSON.parse(JSON.stringify(sc(iIcon))); shotOnly.shot = shotOnly.shot === "medium" ? "wide" : "medium";
      t("gate: the engine may still choose the shot of an icon-only beat", stagingDrift(shotOnly).length === 0, JSON.stringify(stagingDrift(shotOnly)));
    }
    t("lock: a staged beat keeps its full staging lock (+ callout seal)", !!Ls && Ls.shot && Array.isArray(Ls.cast) && (Ls.artTexts || []).length > 0, JSON.stringify(Ls));

    // a chapter card stamped over the authored beats (what apply-semantic-arcs did before)
    const carded = JSON.parse(JSON.stringify(cfg));
    for (const i of [iIcon, iStaged]) { carded.scenes[i].shot = "chapterCard"; carded.scenes[i].chapterCard = { category: "CHAPTER", number: "02", title: "" }; }
    const dI = stagingDrift(carded.scenes[iIcon]), dS = stagingDrift(carded.scenes[iStaged]);
    t("drift: a chapter card over the icon beat is drift", dI.some((x) => /replaced by a chapter card/.test(x)), JSON.stringify(dI));
    t("drift: a chapter card over the staged beat is drift", dS.some((x) => /replaced by a chapter card/.test(x)), JSON.stringify(dS));
    const ev = evaluateAuthorship(carded, { engine: "antidote" });
    const so = (ev.violations || []).filter((v) => v.code === "STAGING_OVERRIDDEN").map((v) => v.sceneId);
    t("gate: both carded authored beats are reported (a locked beat is never exempt)", so.includes(carded.scenes[iIcon].id) && so.includes(carded.scenes[iStaged].id), JSON.stringify(ev.violations && ev.violations.slice(0, 4)));
    // drop the callout of the storm beat too
    carded.scenes[iStorm].texts = (carded.scenes[iStorm].texts || []).filter((x) => x.src !== "art");
    t("drift: a dropped authored callout is drift", stagingDrift(carded.scenes[iStorm]).some((x) => /callout ".*" dropped/.test(x)));
    const n = restoreAuthoredStaging(carded);
    t("restore: repaired the three beats", n === 3, String(n));
    t("restore: the cards are gone and the planned shots are back", [iIcon, iStaged].every((i) => !carded.scenes[i].chapterCard && carded.scenes[i].shot === cfg.scenes[i].shot), JSON.stringify([iIcon, iStaged].map((i) => [carded.scenes[i].shot, cfg.scenes[i].shot, !!carded.scenes[i].chapterCard])));
    t("restore: the callout is back", (carded.scenes[iStorm].texts || []).some((x) => /STORM GATHERS/i.test(x.text)));
    t("restore: idempotent, no drift left", [iIcon, iStaged, iStorm].every((i) => stagingDrift(carded.scenes[i]).length === 0) && restoreAuthoredStaging(carded) === 0);

    // chapter arcs: never a card on an authored beat or an untitled chapter
    const fps = 30;
    const scenes = JSON.parse(JSON.stringify(cfg.scenes));
    const atScene = (i) => scenes[i].fromFrame / fps;
    const res = planChapterArcs(scenes, [{ t: 0, label: "Intro" }, { t: atScene(iIcon), label: "The Fire" }, { t: atScene(iStorm), label: "" }], fps);
    t("chapter arcs: no card on the authored beat", !scenes[iIcon].chapterCard && scenes[iIcon].shot !== "chapterCard");
    t("chapter arcs: no untitled card", !scenes[iStorm].chapterCard && scenes[iStorm].shot !== "chapterCard");
    t("chapter arcs: the skipped card is reported with its reason", (res.skippedCards || []).some((x) => x.sceneId === scenes[iIcon].id && x.reason === "authored beat"), JSON.stringify(res.skippedCards));
    // an untitled chapter on an UNAUTHORED boundary: no bare "CHAPTER N" card either, reported as untitled
    const bare = JSON.parse(JSON.stringify(cfg.scenes)).map((s) => ({ ...s, _authorship: s._authorship ? { ...s._authorship, src: "none" } : undefined }));
    const resU = planChapterArcs(bare, [{ t: 0, label: "Intro" }, { t: bare[iIcon].fromFrame / fps, label: "" }], fps);
    t("chapter arcs: an untitled chapter gets no card, reported", !bare[iIcon].chapterCard && bare[iIcon].shot !== "chapterCard" && (resU.skippedCards || []).some((x) => x.sceneId === bare[iIcon].id && x.reason === "untitled chapter"), JSON.stringify(resU.skippedCards));
    // an UNAUTHORED boundary with a title still gets its card (behaviour for books without a storyboard)
    const plain = JSON.parse(JSON.stringify(cfg.scenes)).map((s) => ({ ...s, _authorship: s._authorship ? { ...s._authorship, src: "none" } : undefined }));
    planChapterArcs(plain, [{ t: 0, label: "Intro" }, { t: plain[iIcon].fromFrame / fps, label: "The Fire" }], fps);
    t("chapter arcs: an unauthored titled boundary still gets its card", plain[iIcon].shot === "chapterCard" && plain[iIcon].chapterCard && plain[iIcon].chapterCard.title === "THE FIRE", JSON.stringify(plain[iIcon].chapterCard));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall authored-lock checks passed");
process.exit(failed ? 1 : 0);
