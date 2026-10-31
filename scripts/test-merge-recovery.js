#!/usr/bin/env node
// MERGE RECOVERY + SEMANTIC AUTHORING INTEGRITY (2026-10-29), on fixtures built from the real failures:
//  - essentialism 2026-10-28: 38 refused beats (11 callout FRAGMENT, 8 TELEGRAPHIC, 4 FILLER_TOKEN, 1 FILLER+FRAGMENT,
//    1 label FRAGMENT, 1 label FILLER, 6 onScreenText missing, 4 continue-without-hold, 2 beforeAfter) — the agent asked
//    "Do you want me to continue?"; all 38 were routine authoring fixes.
//  - Antigravity create-space / crazy-rich-asians: `"continue": false` x30 / x37, onScreenText missing x13 / x20.
//  - the-magician-s-nephew (Vox): after the refusals, empty fields were filled with copies of other fields; merge PASSED.
// What must hold: every refusal has a code, a class, its authored-K.json and its fix; none of these is an OPERATOR stop;
// the stop message and preview-state say "fix it yourself, no approval"; a field filled with a copy after a refusal
// passes merge (no gate change) but is REVIEW_REQUIRED, and stays so across a passing dry run; readcheck's blind reading
// confirms (WRONG) or clears (CORRECT) a flag.
// Run: node scripts/test-merge-recovery.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 600)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const MR = require("./lib/merge-recovery.js");
const { integrityReview } = require("./lib/authoring-integrity.js");

// ── (A) the real essentialism refusal mix (message shapes as merge prints them) ─────────────────────────────────────
const ESS = [
  ...[3, 44, 46, 56, 99, 127, 198, 207, 230, 285, 296].map((i) => `${i}: callout "THE WAY TO": FRAGMENT`),
  ...[104, 113, 134, 172, 232, 271, 283, 307].map((i) => `${i}: callout "CHOOSE, DISCARD, FOCUS": TELEGRAPHIC`),
  ...[18, 125, 177, 298].map((i) => `${i}: callout "THINGS AND STUFF": FILLER_TOKEN`),
  "135: callout \"STUFF OF\": FILLER_TOKEN,FRAGMENT", "49: diagram label \"Of the\": FRAGMENT", "181: diagram label \"Things\": FILLER_TOKEN",
  ...[88, 94, 110, 111, 268, 277].map((i) => `${i}: storyboard.onScreenText missing`),
  ...[55, 80, 90, 291].map((i) => `${i}: continues mckeown after taking "phone" in beat ${i - 1} — set "holds": "phone" (it stays in hand) or drop continue`),
  "58: shotOverride \"beforeAfter\" draws only ONE icon on an authored beat (no after-state, no arrow)",
  "59: shotOverride \"beforeAfter\" draws only ONE icon on an authored beat (no after-state, no arrow)",
];
const rep = MR.buildReport({ slug: "ess", engine: "antidote", problems: ESS, warnings: [], owner: new Map(ESS.map((p) => [Number(p.split(":")[0]), `authored-${1 + Math.floor(Number(p.split(":")[0]) / 40)}.json`])), review: [] });
t("essentialism's 38 refusals: 38 items, every one coded (no OTHER)", rep.problems === 38 && rep.items.every((x) => x.code !== "OTHER"), JSON.stringify(rep.items.filter((x) => x.code === "OTHER")));
t("essentialism's 38: none is an OPERATOR stop", rep.byClass.OPERATOR === 0 && rep.operatorNeeded === false, JSON.stringify(rep.byClass));
t("essentialism's 38: classes as measured (screen text 26 + fields 6 re-authored; 4 hold carries routine; 2 beforeAfter re-authored)",
  rep.byCode.find((g) => g.code === "SCREEN_TEXT").n === 26 && rep.byCode.find((g) => g.code === "STORYBOARD_FIELD").n === 6 && rep.byCode.find((g) => g.code === "HOLD_CARRY").cls === "ROUTINE" && rep.byCode.find((g) => g.code === "BEFORE_AFTER").n === 2, JSON.stringify(rep.byCode.map((g) => [g.code, g.cls, g.n])));
t("the next step says: fix all yourself, no approval", /fix all 38 yourself — no approval/.test(rep.next), rep.next);
t("every item names the authored-K.json that owns its beat", rep.items.every((x) => /^authored-\d+\.json$/.test(x.file)));
t("Antigravity's continue:false and an unknown message are agent-owned (ROUTINE / REAUTHOR), never OPERATOR",
  MR.classify('7: continue must be true or left out (got false)').cls === "ROUTINE" && MR.classify("9: a message nobody has seen").cls === "REAUTHOR");
t("prep / author / gate-b problems are AGENT_STEP (the agent runs the step), not OPERATOR",
  MR.classify("VOCABULARY: the engine gained action place since this storyboard was prepped").cls === "AGENT_STEP" && MR.classify("12: NOT AUTHORED").cls === "AGENT_STEP" && MR.classify("STALE PREP: story-bible changed").cls === "AGENT_STEP");

// ── (B) end to end on a fixture book: refuse -> report -> fix -> (mechanical fill) -> pass + REVIEW_REQUIRED ─────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "merge-recovery-"));
const SLUG = `zz-merge-recovery-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const SB = path.join(BOOK, "storyboard");
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const LINES = [
  "Welcome to this deep dive today.",
  "She picks up her phone.",
  "She is still holding the phone.",
  "Her answer is a clear no.",
  "One word protects her hours.",
];
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of LINES) {
  const w = sent.split(" "), start = clock; let line = w[0];
  for (let k = 1; k < w.length; k++) line += `<${ts(start + k * 0.3)}><c> ${w[k]}</c>`;
  const end = start + w.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
const CAST = { mara: { name: "Mara", role: "the one who says no", look: "young woman", variant: { hairStyle: "bun", gender: "f" } } };
fs.mkdirSync(SB, { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of fs.readdirSync(path.join(REPO, "data"))) if (/\.json$/.test(f)) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "No Test", author: "A. Writer", genre: "nonfiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const merge = (write = true) => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, ...(write ? ["--write"] : []), `--root=${tmp}`]);
try {
  run([path.join(__dirname, "plan-antidote.js"), `--slug=${SLUG}`, "--title=No Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2", `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const em = read(path.join(tmp, "beats.json")); const beats = em ? (em.beats || em) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iPick = find(/picks up her phone/), iHold = find(/still holding/), iNo = find(/clear no/), iWord = find(/One word protects/);
  t("fixture: the beats exist", [iPick, iHold, iNo, iWord].every((x) => x > 0), JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(SB, "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const good = (b) => ({ i: b.i, concept: null, diagram: null, callout: null, cast: ["mara"], expression: "neutral", action: "talk",
    storyboard: { claim: `Mara at beat ${b.i}.`, concreteVisual: "Mara stands in her kitchen, phone in hand.", onScreenText: "none", relationToPrevious: "continues", addedInformation: "her choice" } });
  const chunk1 = beats.filter((b) => b.i <= iHold), chunk2 = beats.filter((b) => b.i > iHold);
  const writeChunks = (mut) => {
    fs.writeFileSync(path.join(SB, "authored-1.json"), JSON.stringify(chunk1.map((b) => { const x = good(b); if (mut) mut(x, b.i); return x; })));
    fs.writeFileSync(path.join(SB, "authored-2.json"), JSON.stringify(chunk2.map((b) => { const x = good(b); if (mut) mut(x, b.i); return x; })));
  };
  // the refused draft: a hold carry missing, continue:false, a fragment callout, an empty onScreenText on two beats
  writeChunks((x, i) => {
    if (i === iPick) Object.assign(x, { action: "take", holds: "phone", actionCue: "picks up" });
    if (i === iHold) Object.assign(x, { continue: true, action: "talk" }); // no holds -> HOLD_CARRY
    if (i === iNo) Object.assign(x, { continue: false, callout: { text: "THE ANSWER SHE", style: "reveal" } });
    if (i === iNo || i === iWord) x.storyboard = { ...x.storyboard, onScreenText: "" };
  });
  let m = merge();
  let R = read(path.join(SB, "merge-report.json"));
  t("refused draft: exit 1, no art.json, merge-report.json written", m.status === 1 && !fs.existsSync(path.join(BOOK, "art.json")) && !!R, (m.stdout || "").slice(-400) + (m.stderr || "").slice(-300));
  t("report: every problem coded, owned by its authored-K.json, no OPERATOR", R && R.problems >= 5 && R.items.every((x) => x.code !== "OTHER" && /^authored-[12]\.json$/.test(x.file || (x.i == null ? "authored-1.json" : ""))) && !R.operatorNeeded, JSON.stringify(R && R.items));
  t("report: the codes of the real failures", R && ["HOLD_CARRY", "CONTINUE_FALSE", "SCREEN_TEXT", "STORYBOARD_FIELD"].every((c) => R.byCode.some((g) => g.code === c)), JSON.stringify(R && R.byCode.map((g) => g.code)));
  t("stop message: fix them yourself, without asking (no 'ask the chunk's author')", /without asking/.test(m.stderr) && !/ask the chunk's author/.test(m.stderr + m.stdout), m.stderr);
  t("console: a recovery block with class counts and the next step", /recovery \(storyboard\/merge-report\.json\)/.test(m.stdout) && /next: fix all \d+ yourself — no approval/.test(m.stdout), (m.stdout || "").slice(-600));
  t("refusal history recorded (the two empty onScreenText beats)", R && (R.refused[iNo] || []).includes("onScreenText") && (R.refused[iWord] || []).includes("onScreenText"), JSON.stringify(R && R.refused));
  // the fixes: real ones for the routine problems; for the empty fields one MECHANICAL copy, one authored line
  writeChunks((x, i) => {
    if (i === iPick) Object.assign(x, { action: "take", holds: "phone", actionCue: "picks up" });
    if (i === iHold) Object.assign(x, { continue: true, action: "talk", holds: "phone" });
    if (i === iNo) Object.assign(x, { callout: { text: "SHE REFUSES", style: "reveal" }, storyboard: { ...x.storyboard, onScreenText: x.storyboard.claim } }); // copy of the claim
    if (i === iWord) x.storyboard = { ...x.storyboard, onScreenText: "ONE WORD GUARDS HER HOURS" }; // authored
  });
  m = merge(false); // a passing dry run first: must not erase the refusal history
  m = merge();
  R = read(path.join(SB, "merge-report.json"));
  t("after the fixes: merge PASSES (no gate change), art.json written", m.status === 0 && fs.existsSync(path.join(BOOK, "art.json")), (m.stdout || "").slice(-500) + (m.stderr || "").slice(-300));
  const fl = (R && R.review) || [];
  t("REVIEW_REQUIRED: the field filled with a copy of the claim after its refusal is flagged (FILLED_AFTER_REFUSAL)", fl.some((x) => x.i === iNo && x.code === "FILLED_AFTER_REFUSAL" && x.field === "onScreenText"), JSON.stringify(fl));
  t("REVIEW_REQUIRED: the field authored for real after its refusal is NOT flagged", !fl.some((x) => x.i === iWord && x.code === "FILLED_AFTER_REFUSAL"), JSON.stringify(fl));
  t("the flag survives a passing dry run (history kept in merge-report.json)", !!R && !!R.refused && (R.refused[iNo] || []).includes("onScreenText"));
  t("console: REVIEW_REQUIRED is printed as not-a-failure", /REVIEW_REQUIRED \(\d+\) — not a failure/.test(m.stdout), (m.stdout || "").slice(-500));

  // ── (C) readcheck: a blind WRONG confirms the flag, a CORRECT clears it ─────────────────────────────────────────────
  const RC = path.join(SB, "readcheck");
  fs.mkdirSync(RC, { recursive: true });
  fs.writeFileSync(path.join(RC, "key.json"), JSON.stringify({ b1: iNo, b2: iWord, b3: iPick }));
  fs.writeFileSync(path.join(RC, "verdict-1.json"), JSON.stringify([{ id: "b1", correctness: "WRONG", blame: "words", why: "fixture" }, { id: "b2", correctness: "CORRECT", blame: null, why: "fixture" }, { id: "b3", correctness: "CORRECT", blame: null, why: "fixture" }]));
  const rc = run([path.join(__dirname, "readcheck.js"), "tally", `--slug=${SLUG}`, `--root=${tmp}`]);
  const RJ = read(path.join(BOOK, "readcheck.json"));
  t("readcheck tally: the flagged beat read WRONG is listed as confirmed", RJ && RJ.reviewRequired && RJ.reviewRequired.wrong.some((x) => x.i === iNo) && /REVIEW_REQUIRED \(merge-report\)/.test(rc.stdout), (rc.stdout || "") + (rc.stderr || ""));
  t("readcheck tally: the verdict totals are unchanged by the flags (not part of the tally)", RJ && RJ.totals.WRONG === 1 && RJ.totals.CORRECT === 2);
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}

// ── (D) Vox: the magician's-nephew pattern (pure function; Vox has no readcheck — its blind check is the mute test) ──
const vb = [{ i: 1, narration: "The rings hum on the red tray in the attic." }, { i: 2, narration: "What happens when a girl named Lucy opens its door?" }, { i: 3, narration: "Digory swings the hammer at the bell." }];
const VA = new Map([
  [1, { i: 1, design: { type: "imagefocus", kicker: "RINGS THAT HUM", emphasis: ["RINGS"], image: { subject: "A red wooden tray with shiny yellow and green rings in a dusty attic" }, storyboard: { claim: "The rings hum.", concreteVisual: "A red tray holding yellow and green rings.", onScreenText: "RINGS", relationToPrevious: "r", addedInformation: "a" } } }],
  [2, { i: 2, design: { type: "imagefocus", kicker: "NEXT", emphasis: ["LUCY"], image: { subject: "A wardrobe door ajar in a dark spare room, a little girl's hand on the handle" }, storyboard: { claim: "What happens when Lucy opens the wardrobe.", concreteVisual: "Question card asking what happens when Lucy opens the wardrobe.", onScreenText: "LUCY", relationToPrevious: "r", addedInformation: "a" } } }],
  [3, { i: 3, design: { type: "imagefocus", kicker: "THE BELL", emphasis: ["STRIKES"], image: { subject: "Digory swinging a small golden hammer at a bell on a stone pillar" }, storyboard: { claim: "Digory wakes the sleeping queen.", concreteVisual: "Digory swings a hammer at the bell.", onScreenText: "HE STRIKES THE BELL", relationToPrevious: "r", addedInformation: "a" } } }],
]);
const vr = integrityReview({ beats: vb, authored: VA, engine: "vox", prev: { items: [{ i: 1, msg: "storyboard.onScreenText missing" }, { i: 3, msg: "storyboard.onScreenText missing" }] } });
t("Vox: onScreenText filled with the emphasis word after its refusal -> FILLED_AFTER_REFUSAL", vr.some((x) => x.i === 1 && x.code === "FILLED_AFTER_REFUSAL"), JSON.stringify(vr));
t("Vox: an onScreenText authored as a real line after its refusal -> not flagged", !vr.some((x) => x.i === 3), JSON.stringify(vr));
t("Vox: an image beat whose picture is a 'question card' of the claim -> VISUAL_IS_CLAIM", vr.some((x) => x.i === 2 && x.code === "VISUAL_IS_CLAIM"), JSON.stringify(vr));
t("Vox: onScreenText = emphasis WITHOUT a refusal is not flagged (their-eyes authored 176/323 so on purpose)", integrityReview({ beats: vb, authored: VA, engine: "vox", prev: null }).every((x) => x.code !== "FILLED_AFTER_REFUSAL"));
t("Vox: an honest text card on a text-led beat is not flagged", integrityReview({ beats: [{ i: 5, narration: "x" }], authored: new Map([[5, { i: 5, design: { type: "statement", storyboard: { claim: "The thesis.", concreteVisual: "Text card with the thesis." } } }]]), engine: "vox", prev: null }).length === 0);

// ── (E) the agent-facing texts route a refused merge to recovery, not to the operator ────────────────────────────────
const PS = fs.readFileSync(path.join(__dirname, "preview-state.js"), "utf8");
t("preview-state: a fresh merge report -> 'fix all N yourself, NO approval'", /Merge recovery — fix all \$\{mr\.problems\} yourself, NO approval/.test(PS));
const SK = fs.readFileSync(path.join(REPO, ".claude", "skills", "preview-hazirla", "SKILL.md"), "utf8");
t("skill: merge recovery is written down (classes, no approval for any count, the real stops)", /Merge recovery/.test(SK) && /no approval/i.test(SK) && /OPERATOR/.test(SK) && /REVIEW_REQUIRED/.test(SK));

console.log(failed ? `\n${failed} FAILED` : "\nall merge-recovery checks passed");
process.exit(failed ? 1 : 0);
