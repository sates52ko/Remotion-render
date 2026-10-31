#!/usr/bin/env node
/**
 * mute-test.js — the quality metric, as commands. A muted viewer must understand
 * the narration from the picture. Gate PASS is not evidence of that (the old WWL
 * config passed every gate and a blind judge found 9/30 frames WRONG).
 *
 *   node scripts/mute-test.js prep  --slug=<slug> [--label=run1] [--n=30] [--frames-from=<label>]
 *       stratified sample -> stills -> caption band cropped -> shuffled
 *       -> audit/mute/<slug>/<label>/{mute/img-NN.png, key.json, sample.json, PROMPTS.md}
 *   node scripts/mute-test.js prep  --slug=<slug> --label=final --seal   (draw + seal ids, render nothing)
 *   node scripts/mute-test.js prep  --slug=<slug> --label=final          (later: re-render exactly the sealed beats)
 *   [--dry] prints the sample and writes nothing
 *   (a blind agent writes .../<label>/blind.json — prompt in PROMPTS.md)
 *   node scripts/mute-test.js judge --slug=<slug> --label=run1 [--vs=<label>]
 *       -> judge-input.json (+ judge-key.json); prompt appended to PROMPTS.md
 *   (a judge agent writes .../<label>/judge-result.json)
 *   --method=v2 (prep/judge/tally, Antidote): stills WITHOUT the caption layer, full frame (no bottom crop); own tree
 *       audit/mute-v2/ + books/<slug>/mute-test.v2.json; diagnostic only (never a verdict, no --seal). --frames-from=<v1 label>
 *       renders the same beats as that v1 run for a paired comparison.
 *   node scripts/mute-test.js map   --slug=<slug> --label=run1   (read-only: item -> image -> still -> frame -> unit, verified)
 *   node scripts/mute-test.js tally --slug=<slug> --label=run1
 *       -> totals, PASS/FAIL vs the bars, appended to books/<slug>/mute-test.json
 *
 * Bars (operator decision 2026-09-28, two tiers):
 *   BLOCKING  WRONG <= 1 per 30 (a picture that contradicts the narration — the
 *             channel's original complaint) AND dead frames <= 5 per 30
 *             (contribution NONE: neither the picture nor the text carries meaning).
 *             Calibrated on the first 6 books: good films 1-4 dead, SBC 17, Lolita 18.
 *   TARGET    image ADDS >= 60% — reported, not blocking. Story books reach it
 *             (WWL 70%, F451 63%, All the Light 60%); argument-heavy narration sits
 *             at 33-50% with its meaning carried by on-screen text, which a viewer
 *             with sound on still gets. Below target = "text-carried", logged.
 * --vs compares two runs on the SAME frames with one judge (judges differ by ~±4
 * on identical frames; only within-judge comparisons are meaningful).
 *
 * HOLDOUT RULE (2026-09-24): a run on reused frames (--frames-from) is a
 * diagnostic, never the verdict. Fixing the frames that failed and re-testing
 * those same frames is teaching to the test (Fahrenheit 451 run3 fixed exactly
 * its 3 WRONG beats and "passed" on the same 30). A fresh prep draws a NEW
 * sample (seed from the label) that excludes every unit an earlier run of this
 * book already showed; preview-ready only accepts a PASS on such a sample.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CMD = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
const LABEL = args.label || "run1";
// Which code renders the stills? Stops on code that is not a commit (scripts/lib/production-guard.js).
// Measurement unchanged: this only records/guards the code before prep renders.
if (CMD === "prep" && SLUG) require("./lib/production-guard").productionGuard({ slug: SLUG, step: `mute-test prep ${LABEL}` });
if (!["prep", "judge", "tally", "map"].includes(CMD) || !SLUG) {
  console.error("Usage: node scripts/mute-test.js prep|judge|tally|map --slug=<slug> [--label=run1] [--n=30] [--frames-from=<label>] [--seal] [--dry] [--vs=<label>] [--method=v2]");
  process.exit(1);
}
// bars live in data/quality-policy.json (operator decisions only); defaults = policy 2026-09-28
const POLICY = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "quality-policy.json"), "utf8")).muteTest; } catch { return null; } })();
const BARS = { wrongPer30: POLICY?.blocking?.wrongPer30 ?? 1, deadPer30: POLICY?.blocking?.deadPer30 ?? 5, addsTarget: POLICY?.targets?.adds ?? 0.6 };
const MAX_REPEAT_PER30 = POLICY?.holdout?.maxRepeatedPer30 ?? 3;
const BOOK = path.join(ROOT, "books", SLUG);
// METHOD (2026-10-24). v1 (default, unchanged): stills with the caption layer, bottom 24% cropped away.
// v2 (--method=v2, Antidote only): the same frame rendered WITHOUT the caption layer, full height — the crop also cut
// icons placed low in the frame (island final2: 8 low-icon frames, crop WRONG 1 / dead 2 vs full 0 / 0). v2 is a
// DIAGNOSTIC until the operator lists it in quality-policy.json: it lives in its own tree (audit/mute-v2/, books/<slug>/
// mute-test.v2.json) that preview-ready / preview-state never read, has no --seal, and is never a verdict.
const METHOD = args.method == null ? "v1" : String(args.method);
if (!["v1", "v2"].includes(METHOD)) { console.error(`❌ --method=${METHOD}: only v1 (default) or v2`); process.exit(1); }
const V2 = METHOD === "v2";
const MUTE_ROOT = (method) => path.join(ROOT, "audit", method === "v2" ? "mute-v2" : "mute", SLUG);
const DIR = (label) => path.join(MUTE_ROOT(METHOD), label);
const OUT = DIR(LABEL);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const cfgPath = fs.existsSync(path.join(BOOK, "config.antidote.json")) ? path.join(BOOK, "config.antidote.json") : path.join(BOOK, "config.vox.json");
const cfg = readJSON(cfgPath);
if (!cfg) { console.error(`❌ no config for ${SLUG}`); process.exit(1); }
const FPS = (cfg.meta && Number(cfg.meta.fps)) || 30; // the config's own frame rate — never an assumed 30
const units = (cfg.scenes || cfg.beats || []).filter((s) => s.id !== "intro" && s.type !== "title");
const frameOfFile = (f) => +f.match(/-f(\d+)\.png/)[1];

// seeded PRNG — the sample is reproducible
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); }

const hashLabel = (l) => [...String(l)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const seedFor = (label) => parseInt(args.seed || String(label === "run1" ? 20260924 : 20260924 ^ hashLabel(label)), 10);
// every unit an earlier run of this book already showed a judge
// (both method trees: a beat a v2 diagnostic showed a judge is not fresh for a v1 holdout either)
function seenUnits() {
  const seen = new Set();
  for (const m of ["v1", "v2"]) {
    const root = MUTE_ROOT(m);
    for (const l of fs.existsSync(root) ? fs.readdirSync(root) : []) {
      if (l === LABEL && m === METHOD) continue;
      (readJSON(path.join(root, l, "sample.json"), []) || []).forEach((x) => seen.add(x.id));
    }
  }
  return seen;
}

// Beats sealed by ANOTHER label whose verdict has not been tallied yet. Unlike merely-seen units they are a
// hard exclusion: the stratum top-up below may reuse seen units, never these (2026-10-20 review).
function openSealedUnits() {
  const root = MUTE_ROOT("v1"); // seals exist only in v1; a v2 diagnostic must never show a v1 sealed beat
  const sealed = new Set();
  for (const l of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if ((l === LABEL && !V2) || fs.existsSync(path.join(root, l, "totals.json"))) continue;
    const s = readJSON(path.join(root, l, "seal.json"));
    if (s && Array.isArray(s.ids)) s.ids.forEach((id) => sealed.add(id));
  }
  return sealed;
}

// The still is taken when the authored beat is COMPLETE on screen: 70% of the
// scene, or — when the callout is word-synced later than that — just after it
// has fully appeared. At a fixed 70% the F451 holdouts photographed beats before
// their callout existed ("NO" of "NO TIME TO THINK", nothing of "CANNOT REMEMBER
// WHERE THEY MET"), so the judge scored a picture the viewer never gets.
function sampleFrame(u) {
  const texts = Array.isArray(u.texts) ? u.texts : [];
  const lastText = texts.reduce((m, t) => Math.max(m, Number(t.at) || 0), 0);
  const settle = texts.length ? lastText + 30 : 0; // reveal/strike animate ~1s
  const at = Math.max(Math.round(u.durationFrames * 0.7), settle);
  return Math.round(u.fromFrame + Math.min(at, u.durationFrames - 4));
}

function narrationAt(f) {
  return (cfg.captions || []).filter((k) => k.endFrame >= f - 150 && k.startFrame <= f + 150).map((k) => k.text).join(" ");
}

// SEALED HOLDOUT (2026-10-20): `prep --seal` draws the sample, records its beat ids + their sha256 in
// seal.json and renders nothing (nobody sees those beats during development). A later `prep` of the same
// label re-renders EXACTLY those beats from the current config: same ids, fresh frames (sampleFrame of the
// current scene), stale stills/answers removed first. A missing beat or a changed sample stops the run
// (never a silent replacement); a label already tallied as a verdict cannot be re-sampled. Selection
// algorithm, bars and judging are unchanged.
const idsSha = (ids) => require("crypto").createHash("sha256").update(JSON.stringify([...ids].sort())).digest("hex");
// ONE prep per label at a time (2026-10-24): a long prep (one bundle + 30 stills) that is checked, cancelled and
// started again by an impatient agent only ever pays the bundle again (do-over: 4 stills in 51 min). A second prep of
// the same label is refused while the first one's process is alive; a stale lock (dead pid) is taken over.
function takePrepLock() {
  const lock = path.join(OUT, ".prep.lock");
  const held = readJSON(lock);
  if (held && held.pid && held.pid !== process.pid) {
    let alive = false;
    try { process.kill(held.pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
    if (alive) { console.error(`❌ a prep of ${SLUG}/${LABEL} is already running (pid ${held.pid}, since ${held.at}) — wait for it to finish; do not start or cancel another`); process.exit(3); }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  process.on("exit", () => { try { if ((readJSON(lock) || {}).pid === process.pid) fs.rmSync(lock, { force: true }); } catch {} });
}
function prep() {
  if (!args.dry && !args.seal) takePrepLock();
  if (V2 && args.seal) { console.error("❌ v2 is a diagnostic: no --seal (the verdict stays v1 until the operator decides otherwise)"); process.exit(1); }
  if (V2 && cfgPath.endsWith("config.vox.json")) { console.error("❌ --method=v2 is Antidote-only"); process.exit(1); }
  const sealPath = path.join(OUT, "seal.json");
  const seal = readJSON(sealPath);
  if (seal && args.seal) { console.error(`❌ ${LABEL} is already sealed (${sealPath})`); process.exit(1); }
  if (seal && args["frames-from"]) { console.error("❌ a sealed label cannot reuse another run's frames"); process.exit(1); }
  if (args.seal && args["frames-from"]) { console.error("❌ --seal draws a fresh sample; drop --frames-from"); process.exit(1); }
  let sample;
  let sealMeta = null;
  if (seal) {
    if (fs.existsSync(path.join(OUT, "totals.json"))) { console.error(`❌ sealed ${LABEL} was already tallied as a verdict — the next holdout is a fresh label (e.g. --label=run2)`); process.exit(1); }
    if (idsSha(seal.ids) !== seal.idsSha256) { console.error("❌ seal.json was edited: its ids no longer match the recorded sha256"); process.exit(1); }
    const recorded = readJSON(path.join(OUT, "sample.json"), []) || [];
    if (idsSha(recorded.map((x) => x.id)) !== seal.idsSha256) { console.error("❌ sample.json no longer matches the seal (beats were added, removed or swapped)"); process.exit(1); }
    const missing = seal.ids.filter((id) => !units.some((u) => u.id === id));
    if (missing.length) { console.error(`❌ sealed beat(s) no longer in the config: ${missing.join(", ")} — the sealed sample cannot be honoured; do not substitute beats, report it`); process.exit(1); }
    sample = seal.ids.map((id) => ({ id, frame: sampleFrame(units.find((u) => u.id === id)) })).sort((p, q) => p.frame - q.frame);
    sealMeta = { sealed: true, idsSha256: seal.idsSha256, sealedAt: seal.sealedAt };
    console.log(`sealed holdout: re-rendering the ${sample.length} sealed beats from the current config (sha ${seal.idsSha256.slice(0, 12)})`);
    if (!args.dry) {
      // stills are NOT dropped here: prepStills() below keeps them only when they were rendered from this very config
      // (a killed + restarted verdict prep used to re-render all 30 — do-over 2026-10-24)
      fs.rmSync(path.join(OUT, "mute"), { recursive: true, force: true });
      for (const f of ["blind.json", "key.json", "judge-input.json", "judge-key.json", "judge-result.json", "PROMPTS.md"]) fs.rmSync(path.join(OUT, f), { force: true });
    }
  } else if (args["frames-from"]) {
    // v2 may reuse a v1 run's frames: the paired comparison of the two methods on the same beats
    const fromDir = fs.existsSync(path.join(DIR(args["frames-from"]), "sample.json")) || !V2 ? DIR(args["frames-from"]) : path.join(MUTE_ROOT("v1"), args["frames-from"]);
    sample = readJSON(path.join(fromDir, "sample.json"));
    if (!sample) { console.error(`❌ no sample.json in label ${args["frames-from"]}`); process.exit(1); }
    console.log(`⚠ reusing ${args["frames-from"]}'s frames — a DIAGNOSTIC run (with judge --vs). It cannot be the verdict: after fixing, run a fresh prep (no --frames-from).`);
  } else {
    const n = parseInt(args.n || "30", 10);
    const bible = readJSON(path.join(BOOK, "story-bible.json"), {});
    const end = units.length ? units[units.length - 1].fromFrame + units[units.length - 1].durationFrames : 0;
    // strata: the story bible's acts, or five equal time bins
    const spine = Array.isArray(bible.spine) && bible.spine.length ? bible.spine.map((a) => a.fromFrame) : [0, 1, 2, 3, 4].map((k) => Math.round((end * k) / 5));
    const strata = spine.map((from, k) => [from, spine[k + 1] ?? Infinity]);
    const per = Math.ceil(n / strata.length);
    const rnd = rng(seedFor(LABEL));
    const seen = seenUnits();
    const sealedOut = openSealedUnits();
    if (seen.size) console.log(`holdout: excluding ${seen.size} units earlier runs already showed`);
    if (sealedOut.size) console.log(`sealed holdout: ${sealedOut.size} beats of an open seal are never drawn (not even to top up)`);
    sample = [];
    for (const [a, z] of strata) {
      const all = units.filter((u) => u.fromFrame >= a && u.fromFrame < z && !sealedOut.has(u.id));
      const fresh = all.filter((u) => !seen.has(u.id));
      // fresh units first; a short stratum is topped up with seen units only for the shortfall
      const chosen = new Set();
      const pick = (pool, want) => { while (chosen.size < want && pool.some((u) => !chosen.has(u))) chosen.add(pool[Math.floor(rnd() * pool.length)]); };
      pick(fresh, Math.min(per, fresh.length));
      pick(all, Math.min(per, all.length));
      chosen.forEach((u) => sample.push({ id: u.id, frame: sampleFrame(u) }));
    }
    sample = sample.sort((p, q) => p.frame - q.frame).slice(0, n);
    if (sealedOut.size && sample.length < n) {
      console.error(`❌ only ${sample.length} of ${n} beats can be drawn outside the open seal (${sealedOut.size} sealed beats are never substituted in) — use a smaller --n or tally the sealed verdict first`);
      process.exit(1);
    }
  }
  if (args.dry) { sample.forEach((s) => console.log(`   ${s.id} f${s.frame}`)); console.log(`(dry: ${sample.length} units, nothing written)`); return; }
  fs.mkdirSync(path.join(OUT, "mute"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "sample.json"), JSON.stringify(sample, null, 1));
  const prior = args["frames-from"] ? [] : [...seenUnits()];
  fs.writeFileSync(path.join(OUT, "sample-meta.json"), JSON.stringify({ ...(V2 ? { method: "v2" } : {}), framesFrom: args["frames-from"] || null, seed: seedFor(LABEL),
    repeatedUnits: sample.filter((x) => prior.includes(x.id)).length, ...(sealMeta || {}) }, null, 1));
  if (args.seal) {
    let head = null; try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
    const ids = sample.map((s) => s.id);
    fs.writeFileSync(sealPath, JSON.stringify({ label: LABEL, ids, idsSha256: idsSha(ids), sealedAt: new Date().toISOString(), codeHead: head,
      note: "Sealed verdict sample: no stills rendered. Development checks exclude these beats (framecheck --exclude-from=" + LABEL + "). The final prep of this label re-renders exactly these beats." }, null, 2) + "\n");
    fs.rmSync(path.join(OUT, "mute"), { recursive: true, force: true });
    console.log(`✓ sealed ${ids.length} beats in ${path.relative(ROOT, sealPath)} (sha ${idsSha(ids).slice(0, 12)}); nothing rendered. Use framecheck --exclude-from=${LABEL}; run this prep again (no --seal) for the verdict.`);
    return;
  }
  // stills: render-sequence-stills takes <unitId>:<frame>; the id only names the file
  const frames = sample.map((s) => `${(cfg.scenes || cfg.beats).find((u) => s.frame >= u.fromFrame && s.frame < u.fromFrame + u.durationFrames)?.id || s.id}:${s.frame}`).join(",");
  const stillsRoot = path.relative(ROOT, path.join(OUT, "stills"));
  // RESUME SAFELY (2026-10-24): stills already rendered for this label are reused only when they came from the SAME
  // config bytes (stills/.config-sha); otherwise they are stale and removed. render-sequence-stills skips a still that
  // exists, so a restarted prep renders only what is missing.
  const cfgSha = require("crypto").createHash("sha256").update(fs.readFileSync(cfgPath)).digest("hex").slice(0, 16);
  const stillsDir = path.join(OUT, "stills"), shaFile = path.join(stillsDir, ".config-sha");
  if (fs.existsSync(stillsDir) && (!fs.existsSync(shaFile) || fs.readFileSync(shaFile, "utf8").trim() !== cfgSha)) {
    console.log("stills on disk are from another config (or unmarked) — removed");
    fs.rmSync(stillsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stillsDir, { recursive: true });
  fs.writeFileSync(shaFile, cfgSha + "\n");
  const done = fs.existsSync(path.join(stillsDir, SLUG)) ? fs.readdirSync(path.join(stillsDir, SLUG)).filter((f) => f.endsWith(".png")).length : 0;
  if (done) console.log(`resuming: ${done}/${sample.length} stills of this config already rendered — only the rest is rendered`);
  if (process.env.MUTE_TEST_NO_RENDER === "1") { console.log("(test: stopping before the render)"); return; }
  console.log(`rendering ${sample.length} stills${V2 ? " WITHOUT the caption layer (v2)" : ""} (one bundle, several minutes) ...`);
  execFileSync(process.execPath, ["scripts/render-sequence-stills.js", `--slug=${SLUG}`, `--frames=${frames}`, `--out=${stillsRoot}`, ...(V2 ? ["--no-captions"] : [])], { cwd: ROOT, stdio: "inherit" });
  const D = path.join(ROOT, stillsRoot, SLUG);
  const files = fs.readdirSync(D).filter((f) => f.endsWith(".png"));
  const rnd = rng(seedFor(LABEL) ^ 0x5bd1e995);
  const order = files.map((f) => [f, rnd()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const key = {};
  order.forEach((f, k) => {
    const id = `img-${String(k + 1).padStart(2, "0")}.png`;
    key[id] = f;
    // v1: the caption band would give the narration away -> crop it; v2: no caption layer was drawn -> full frame
    if (V2) fs.copyFileSync(path.join(D, f), path.join(OUT, "mute", id));
    else execFileSync("ffmpeg", ["-y", "-v", "error", "-i", path.join(D, f), "-vf", "crop=iw:ih*0.76:0:0", path.join(OUT, "mute", id)]);
  });
  fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify(key, null, 2));
  const imgDir = path.join(OUT, "mute");
  fs.writeFileSync(path.join(OUT, "PROMPTS.md"), `# Mute test — ${SLUG} / ${LABEL}

## 1. Blind describer (a fresh agent; it must not know the book)
You are a blind rater in a mute test. You will look at ${order.length} still frames from an animated explainer video with NO audio and NO other context. Do not read any other files in the repository — only the images listed below. Do not search the repo, do not open JSON/config files, do not look at sibling folders.

Images (read each with the Read tool): ${path.join(imgDir, "img-01.png")} through img-${String(order.length).padStart(2, "0")}.png in the same folder.

Work ONE image at a time: open img-NN, write its entry, then open the next. Never describe from memory of an earlier image.
For EACH image, write: "text" (every word printed on the image, exactly as written, or "none"), "sees" (literal description: people, what they do, their faces, objects, text, diagram, setting; 1-3 sentences), "message" (what the narrator is saying at this moment, one sentence, from the image only), "confidence" (low/medium/high), "wouldConfuse" (anything that could mislead, or "none").

Write ONLY a JSON array [{"img":"img-01.png","text":"...","sees":"...","message":"...","confidence":"...","wouldConfuse":"..."}, ...] to ${path.join(OUT, "blind.json")}. Verify it parses and has ${order.length} entries. Reply with one line: "written ${order.length}".

## 2. Then
    node scripts/mute-test.js judge --slug=${SLUG} --label=${LABEL}
`);
  console.log(`\n✓ ${path.relative(ROOT, OUT)} — ${order.length} frames. Give PROMPTS.md §1 to a fresh agent.`);
}

// Words the config prints on screen around frame f (callouts, diagram labels,
// Vox emphasis/kicker/items/compareLabels — a Vox compare beat prints its two
// compareLabels instead of emphasis, scenes.tsx CompareScene). Used to prove each blind description belongs to
// the image it is filed under.
function screenWordsAt(f) {
  const u = (cfg.scenes || cfg.beats || []).find((x) => f >= x.fromFrame && f < x.fromFrame + x.durationFrames);
  if (!u) return null;
  const p = u.props || {};
  const strs = [
    ...(u.texts || []).map((t) => t.text),
    ...((u.diagram && u.diagram.labels) || []),
    ...[].concat(p.emphasis || [], p.kicker || [], p.items || [], p.title || [], p.compareLabels || []),
  ].filter(Boolean).join(" ").toUpperCase();
  const w = strs.match(/[A-Z]{4,}/g);
  return w && w.length ? new Set(w) : null;
}
function alignmentCheck(label, blind, key) {
  // all-the-light/SBC run4: a sonnet describer filed 8 of 30 descriptions under
  // the wrong image; the judge then scored scene A's picture against scene B's
  // narration and six "WRONG" frames were an artefact. Every printed word the
  // describer reports must exist in the config at that image's frame.
  const bad = [];
  let checked = 0;
  for (const d of blind) {
    const words = screenWordsAt(frameOfFile(key[d.img] || "-f0.png"));
    // older blind.json has no `text`: fall back to the ALL-CAPS words quoted in `sees`
    const said = d.text || (String(d.sees || "").match(/['"]([A-Z][A-Z' -]{3,})['"]/g) || []).join(" ");
    const seen = (String(said).toUpperCase().match(/[A-Z]{4,}/g) || []).filter((x) => !/^(NONE|INSIGHT|TURN)$/.test(x));
    if (!words || seen.length < 2) continue;
    checked++;
    const hit = seen.filter((x) => words.has(x)).length;
    if (hit === 0) bad.push(`${d.img}: reports "${String(said).slice(0, 60)}" — not on this frame`);
  }
  if (checked && bad.length > Math.max(1, Math.floor(checked * 0.1))) {
    console.error(`❌ ${label}: the blind descriptions are filed under the wrong images (${bad.length}/${checked} misaligned):`);
    bad.slice(0, 8).forEach((b) => console.error("   - " + b));
    console.error(`   Re-run PROMPTS.md §1 with a FRESH describer (one image at a time), then judge again. Do not judge this blind.json.`);
    process.exit(1);
  }
  if (bad.length) console.warn(`⚠ ${label}: ${bad.length} description(s) may be misfiled: ${bad.join("; ")}`);
}

function describe(label) {
  const blind = readJSON(path.join(DIR(label), "blind.json"));
  const key = readJSON(path.join(DIR(label), "key.json"));
  if (!blind || !key) { console.error(`❌ ${label}: blind.json or key.json missing`); process.exit(1); }
  // IDENTITY (2026-10-27): a description is joined to its frame by the image NAME, never by position. A missing,
  // repeated or unknown image name used to be silently dropped/overwritten — stop instead.
  const names = blind.map((d) => d.img);
  const dup = names.filter((n, i) => names.indexOf(n) !== i), unknown = names.filter((n) => !key[n]), missing = Object.keys(key).filter((n) => !names.includes(n));
  if (dup.length || unknown.length || missing.length) {
    console.error(`❌ ${label}: blind.json does not cover the images one-to-one${dup.length ? ` — repeated ${[...new Set(dup)].join(", ")}` : ""}${unknown.length ? ` — unknown ${unknown.join(", ")}` : ""}${missing.length ? ` — missing ${missing.join(", ")}` : ""}. Re-run PROMPTS.md §1 with a fresh describer.`);
    process.exit(1);
  }
  alignmentCheck(label, blind, key);
  return Object.fromEntries(blind.map((d) => [frameOfFile(key[d.img]), { sees: d.sees, message: d.message, wouldConfuse: d.wouldConfuse }]));
}

// The ONE identity chain of a run (2026-10-27, their-eyes-were-watching-god final): judge items are numbered in FRAME
// order while the images are SHUFFLED, so item-NN is NOT img-NN. An agent that paired them by position blamed eight
// wrong beats (001 035 044 057 089 182 277 302 instead of 057 091 165 207 216 230 277 283). Every link is by name:
// item -> judge-key frame -> the one still whose file name carries that frame -> its img name (key.json) -> the blind
// entry filed under that img -> the sampled unit (sample.json) whose scene contains the frame.
function identityOf(label, { quiet = false } = {}) {
  const D = DIR(label);
  const key = readJSON(path.join(D, "key.json")), jk = readJSON(path.join(D, "judge-key.json"));
  const ji = readJSON(path.join(D, "judge-input.json"), []) || [], sample = readJSON(path.join(D, "sample.json"), []) || [];
  const blind = readJSON(path.join(D, "blind.json"), []) || [];
  if (!key || !jk) return { rows: [], problems: [`${label}: key.json or judge-key.json missing`] };
  const all = cfg.scenes || cfg.beats || [];
  const problems = [], rows = [];
  for (const it of ji) {
    const k = jk[it.id];
    if (!k) { problems.push(`${it.id}: not in judge-key.json`); continue; }
    const f = k.frame;
    const imgs = Object.keys(key).filter((n) => frameOfFile(key[n]) === f);
    const samp = sample.filter((x) => x.frame === f);
    const ui = all.findIndex((u) => f >= u.fromFrame && f < u.fromFrame + u.durationFrames);
    const unit = ui >= 0 ? all[ui].id : null;
    const filed = blind.filter((d) => imgs.includes(d.img));
    if (imgs.length !== 1) problems.push(`${it.id}: ${imgs.length} images carry frame ${f}`);
    // no sample.json (a hand-built run / fixture): the unit comes from the config; with one, it must name the frame once
    if (sample.length && samp.length !== 1) problems.push(`${it.id}: ${samp.length} sampled units at frame ${f}`);
    // the CURRENT config may have been re-planned since the run: a unit that no longer matches is reported, not "fixed"
    if (samp.length === 1 && unit !== samp[0].id) problems.push(`${it.id}: sampled ${samp[0].id} but frame ${f} is ${unit || "outside every unit"} in the current config (re-planned since this run?)`);
    const V = it.V || null;
    if (V && (filed.length !== 1 || filed[0].sees !== V.sees)) problems.push(`${it.id}: its description is not the one filed under ${imgs.join("|") || "no image"}`);
    rows.push({ item: it.id, frame: f, sec: +(f / FPS).toFixed(2), img: imgs[0] || null, still: imgs[0] ? key[imgs[0]] : null, unit: samp.length === 1 ? samp[0].id : unit, unitIndex: ui });
  }
  if (!quiet) for (const r of rows) console.log(`${r.item} -> ${r.img} (${r.still}) -> frame ${r.frame} (${r.sec}s) -> ${r.unit}`);
  return { rows, problems };
}

const JUDGE_RULES = `For each item give:
A. correctness — CORRECT (the viewer's understood message matches the narration), NEUTRAL (neither matches nor contradicts: just a person, abstract/empty), WRONG (suggests a different or opposite meaning: unrelated object, wrong emotion over tragedy, emphasis where the narration rejects, etc.).
B. contribution — ADDS (the image itself — people's actions/expressions, objects, icons, not only copied text — conveys something the narration means), TEXT_ONLY (only on-screen text carries meaning), NONE.
C. explains — YES only when contribution is ADDS AND the picture itself shows the narration's mechanism, relationship or cause→effect (who does what to whom, what leads to what), not just its subject or mood; otherwise NO.
One short reason each. Be strict and literal; do not reward a version for being prettier or busier.`;

function judge() {
  const A = describe(LABEL);
  const vs = args.vs ? describe(args.vs) : null;
  const rnd = rng(0xC0FFEE);
  const key = {};
  const imgKey = readJSON(path.join(OUT, "key.json"), {}) || {}, sampled = readJSON(path.join(OUT, "sample.json"), []) || [];
  const items = Object.keys(A).map(Number).sort((a, b) => a - b).map((f, n) => {
    const id = `item-${String(n + 1).padStart(2, "0")}`;
    const base = { id, t: `${(f / FPS).toFixed(1)}s`, narration: narrationAt(f) };
    // the identity of the item, by name (identityOf): which image, which still, which sampled unit — never "item-NN = img-NN"
    const img = Object.keys(imgKey).find((n) => frameOfFile(imgKey[n]) === f) || null;
    const ident = { img, still: img ? imgKey[img] : null, unit: (sampled.find((x) => x.frame === f) || {}).id || null };
    if (!vs) { key[id] = { frame: f, ...ident }; return { ...base, V: A[f] }; }
    if (!vs[f]) { console.error(`❌ frame ${f} missing in ${args.vs} — use --frames-from=${args.vs} when preparing ${LABEL}`); process.exit(1); }
    const thisIsX = rnd() < 0.5;
    key[id] = { frame: f, ...ident, thisIsX, vs: args.vs };
    return { ...base, X: thisIsX ? A[f] : vs[f], Y: thisIsX ? vs[f] : A[f] };
  });
  fs.writeFileSync(path.join(OUT, "judge-input.json"), JSON.stringify(items, null, 2));
  fs.writeFileSync(path.join(OUT, "judge-key.json"), JSON.stringify(key, null, 2));
  const idCheck = identityOf(LABEL, { quiet: true });
  if (idCheck.problems.length) { console.error(`❌ identity chain broken:\n   ${idCheck.problems.join("\n   ")}`); process.exit(1); }
  const shape = vs ? `{"items":[{"id":"item-01","X":{"correctness":"...","why":"...","contribution":"...","whyC":"...","explains":"YES|NO"},"Y":{...}}, ...]}` : `{"items":[{"id":"item-01","V":{"correctness":"...","why":"...","contribution":"...","whyC":"...","explains":"YES|NO"}}, ...]}`;
  fs.appendFileSync(path.join(OUT, "PROMPTS.md"), `
## 3. Judge (a fresh agent)
You are an impartial judge in a mute test of an animated book-summary video. Read ONLY this file: ${path.join(OUT, "judge-input.json")}. Do NOT open any other file (never judge-key.json, key.json, books/, scripts/, or image folders).
Each item has the narration spoken around a moment and ${vs ? "two blind descriptions (X and Y, assigned randomly per item) of two versions" : "a blind description (V)"} of what a viewer with the sound OFF saw.
${JUDGE_RULES}
Write ONLY JSON to ${path.join(OUT, "judge-result.json")}: ${shape} (${items.length} items). Verify it parses. Reply with one line: "written ${items.length}".

## 4. Then
    node scripts/mute-test.js tally --slug=${SLUG} --label=${LABEL}
`);
  console.log(`✓ judge-input.json (${items.length} items${vs ? `, vs ${args.vs}` : ""}). Give PROMPTS.md §3 to a fresh agent.`);
}

function tally() {
  const r = readJSON(path.join(OUT, "judge-result.json"));
  const key = readJSON(path.join(OUT, "judge-key.json"));
  if (!r || !key) { console.error("❌ judge-result.json / judge-key.json missing"); process.exit(1); }
  const tOf = Object.fromEntries((readJSON(path.join(OUT, "judge-input.json"), []) || []).map((x) => [x.id, x.t]));
  // Vox diagnostic: which sampled frames had an image at all. The VERDICT stays on
  // the pre-registered bar (ADDS over ALL frames): a muted viewer of a Vox film with
  // images on 44% of the screen time gets no picture on the rest — quantity IS part
  // of the quality. Scoring ADDS only over image frames (all-the-light run5, 14/15)
  // hid exactly that. imageBeats/imageAdds tell you whether to fix coverage or images.
  const sampleBeats = readJSON(path.join(OUT, "sample.json"), []);
  const units = cfg.scenes || cfg.beats || [];
  // Build frame→hasImage lookup so we can tell which items had an image on screen
  const frameHasImage = {};
  for (const s of sampleBeats) {
    const u = units.find((u) => s.frame >= u.fromFrame && s.frame < u.fromFrame + u.durationFrames);
    if (u) frameHasImage[s.frame] = !!(u.images && u.images.length > 0);
  }
  // Map item ids (item-01..) to frames via judge-key
  const itemHasImage = {};
  for (const [itemId, k] of Object.entries(key)) {
    itemHasImage[itemId] = !!frameHasImage[k.frame];
  }
  const T = {}, V = {};
  const idRows = Object.fromEntries(identityOf(LABEL, { quiet: true }).rows.map((x) => [x.item, x]));
  // EXPLAINS is measured only (quality-policy "measured"): no bar, no effect on PASS
  const bump = (t, x) => { t[x.correctness] = (t[x.correctness] || 0) + 1; t[x.contribution] = (t[x.contribution] || 0) + 1; if (x.contribution === "ADDS" && String(x.explains).toUpperCase() === "YES") t.EXPLAINS = (t.EXPLAINS || 0) + 1; };
  const weak = [];
  let imageBeats = 0, imageAdds = 0;
  for (const it of r.items) {
    const k = key[it.id];
    const mine = it.V || (k.thisIsX ? it.X : it.Y);
    bump(T, mine);
    if (k.vs) bump(V, k.thisIsX ? it.Y : it.X);
    if (itemHasImage[it.id]) {
      imageBeats++;
      if (mine.contribution === "ADDS") imageAdds++;
    }
    // name the beat and the image (judge-key identity, or the chain rebuilt by name for an older run) — never a position
    const who = idRows[it.id] ? `${idRows[it.id].unit} [${it.id} = ${idRows[it.id].img}, f${idRows[it.id].frame}, ${tOf[it.id] || ""}]` : (tOf[it.id] || it.id);
    if (mine.correctness !== "CORRECT" || mine.contribution !== "ADDS") weak.push(`${who} ${mine.correctness}/${mine.contribution} — ${mine.why} | ${mine.whyC}`);
  }
  const n = r.items.length;
  const wrong = T.WRONG || 0;
  const adds = (T.ADDS || 0) / n;
  const addsAll = adds;
  const dead = T.NONE || 0;
  const pass = wrong <= Math.floor((BARS.wrongPer30 * n) / 30) && dead <= Math.floor((BARS.deadPer30 * n) / 30);
  const addsMet = adds >= BARS.addsTarget;
  const meta = readJSON(path.join(OUT, "sample-meta.json"), {});
  const vsLabel = args.vs || Object.values(key)[0]?.vs;
  // holdout: only a PASS on frames no earlier run showed can be the verdict
  const fresh = !meta.framesFrom && !vsLabel && (meta.repeatedUnits || 0) <= Math.floor((MAX_REPEAT_PER30 * n) / 30);
  const summary = { label: LABEL, date: new Date().toISOString(), n, totals: T, ...(vsLabel ? { vs: vsLabel, vsTotals: V } : {}), bars: BARS, pass,
    sample: fresh ? "fresh" : "reused", ...(meta.sealed ? { sealed: true, sealSha256: meta.idsSha256 } : {}), verdict: pass && fresh, dead, addsTargetMet: addsMet,
    imageBeats, imageAdds, addsAll: Math.round(addsAll * 100) };
  // v2: never a verdict, never in mute-test.json / the engine-outcomes ledger / cause-ledger (its own history file)
  if (V2) Object.assign(summary, { method: "v2", verdict: false, diagnostic: "v2 full frame, captions not drawn — not a verdict until the operator enables it" });
  fs.writeFileSync(path.join(OUT, "totals.json"), JSON.stringify(summary, null, 2));
  const histFile = path.join(BOOK, V2 ? "mute-test.v2.json" : "mute-test.json");
  const hist = readJSON(histFile, { runs: [] });
  hist.runs = hist.runs.filter((x) => x.label !== LABEL).concat([summary]);
  fs.writeFileSync(histFile, JSON.stringify(hist, null, 2) + "\n");
  if (V2) {
    console.log(`${SLUG}/${LABEL} [v2 diagnostic]: CORRECT ${T.CORRECT || 0} · NEUTRAL ${T.NEUTRAL || 0} · WRONG ${wrong} · dead ${dead} · ADDS ${T.ADDS || 0}/${n} · explains ${T.EXPLAINS || 0}/${n} — not a verdict (books/${SLUG}/mute-test.v2.json)`);
    if (weak.length) { console.log("   not CORRECT+ADDS:"); weak.forEach((w) => console.log("   - " + w)); }
    return;
  }
  // Engine-outcomes ledger: which engine, for which kind of book, produced which
  // mute-test result. The engine-fit weights (lib/engine-fit.js) are a reasoned
  // prior; this ledger is what they get re-fit against.
  const bookMeta = readJSON(path.join(BOOK, "book.json"), {});
  const ledgerPath = path.join(ROOT, "data", "engine-outcomes.json");
  const ledger = readJSON(ledgerPath, { note: "one row per mute-test run; see scripts/lib/engine-fit.js", runs: [] });
  ledger.runs = ledger.runs.filter((x) => !(x.slug === SLUG && x.label === LABEL)).concat([{
    slug: SLUG, label: LABEL, date: summary.date.slice(0, 10),
    engine: cfgPath.endsWith("config.vox.json") ? "vox" : "antidote", genre: bookMeta.genre || null,
    engineDecidedBy: bookMeta.engineDecidedBy || null, engineProfile: bookMeta.engineProfile || null,
    engineCheck: bookMeta.engineCheck ? { fit: bookMeta.engineCheck.fit, confidence: bookMeta.engineCheck.confidence, signals: bookMeta.engineCheck.signals } : null,
    n, correct: T.CORRECT || 0, wrong, adds: T.ADDS || 0, dead, explains: T.EXPLAINS ?? null, pass,
  }]);
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
  const addsLabel = `ADDS ${T.ADDS || 0}/${n} (${Math.round(adds * 100)}%)` + (imageBeats < n && cfgPath.endsWith("config.vox.json")
    ? ` · image on ${imageBeats}/${n} frames, those ADD ${imageAdds}/${imageBeats}${imageBeats < n * 0.6 ? " — COVERAGE is the problem: give more beats an image" : ""}`
    : "");
  console.log(`${SLUG}/${LABEL}: CORRECT ${T.CORRECT || 0} · NEUTRAL ${T.NEUTRAL || 0} · WRONG ${wrong} · dead ${dead} · ${addsLabel} · explains ${T.EXPLAINS || 0}/${n}${addsMet ? "" : " (below the 60% target: text-carried)"} → ${pass ? "PASS" : "FAIL"}${pass && !fresh ? " (reused frames — diagnostic only; run a fresh prep for the verdict)" : ""}`);
  if (summary.vsTotals) console.log(`   vs ${summary.vs}: CORRECT ${V.CORRECT || 0} · WRONG ${V.WRONG || 0} · ADDS ${V.ADDS || 0}/${n}`);
  if (weak.length) { console.log("   not CORRECT+ADDS:"); weak.forEach((w) => console.log("   - " + w)); }
  // Advisory, after the verdict is written: who owns each failure (ENGINE / VOCABULARY / AUTHORING / RATER).
  // Antidote only; never changes the totals above. scripts/cause-ledger.js, STORYBOARD_RUNBOOK §4.
  if (!cfgPath.endsWith("config.vox.json") && (wrong || dead)) {
    const { spawnSync } = require("child_process");
    const r = spawnSync(process.execPath, [path.join(__dirname, "cause-ledger.js"), `--slug=${SLUG}`], { cwd: ROOT, encoding: "utf8" });
    const line = String(r.stdout || "").split("\n").find((l) => /ENGINE|owner/i.test(l));
    console.log(r.status === 0 ? `   cause-ledger (advisory): ${line ? line.trim() : "written to audit/cause-ledger/" + SLUG}` : `   ⚠ cause-ledger did not run (${String(r.stderr || "").split("\n")[0]})`);
  }
}

// map (read-only, 2026-10-27): print and VERIFY the identity chain of a run — item -> image -> still -> frame -> unit.
// Use it whenever you name the beats a judge failed. Works on old runs too (it rebuilds the chain by name); it never
// writes anything, so sealed runs and past verdicts stay exactly as they are.
function map() {
  const { rows, problems } = identityOf(LABEL);
  if (!rows.length && problems.length) { console.error(`❌ ${problems.join("; ")}`); process.exit(1); }
  const r = readJSON(path.join(OUT, "judge-result.json"));
  const verdictOf = (id) => { const it = r && (r.items || r).find((x) => x.id === id); return it ? (it.V || it.X || {}).correctness || "?" : "-"; };
  const weak = rows.filter((x) => !/^(CORRECT|-)$/.test(verdictOf(x.item)));
  if (r) console.log(`not CORRECT: ${weak.map((x) => `${x.unit} (${x.item}=${x.img}, ${verdictOf(x.item)})`).join(", ") || "none"}`);
  if (problems.length) { console.error(`❌ identity chain: ${problems.length} problem(s)\n   ${problems.join("\n   ")}`); process.exit(1); }
  console.log(`✓ ${SLUG}/${LABEL}: ${rows.length} items, each -> one image -> its own description -> its sampled unit`);
}

({ prep, judge, tally, map })[CMD]();
