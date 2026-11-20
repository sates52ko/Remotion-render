#!/usr/bin/env node
// A HAND-OVER reads as one (2026-10-24): the storyboard GIVING recipe (giver `hold` → continued receiver `take` with
// `partnerAction: "reach"`) drew both people facing right on illustration and the object on a stand in front of the
// receiver — blind (inside-out 29-30): who gave NO, whose hand NO. Now the pair faces each other (twoShot, look at
// each other) and the object is in the giver's hand until the take's moment (continuity.ts handOffFrame + Scene.tsx).
// Runs the pure helper and the REAL planner on a word-timed fixture. Run: node scripts/test-hand-over.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { handOffFrame, actionCueFrame, facesEachOther } = require("../src/engines/antidote/continuity.ts");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };

// ── handOffFrame (pure) ──────────────────────────────────────────────────────
const taker = { action: "take", holds: "key", actionAt: 40 };
const giver = { action: "reach" };
t("a take with a reaching partner is a hand-over at the take's moment", handOffFrame([taker, giver], null, 200) === actionCueFrame(taker, 200));
t("no authored moment: the take's default (40% of the beat)", handOffFrame([{ action: "take", holds: "key" }, giver], null, 200) === 80);
t("a take whose partner does not reach is no hand-over (object rests in front, as before)", handOffFrame([taker, { action: "idle" }], null, 200) === null);
t("a take without an object is no hand-over", handOffFrame([{ action: "take" }, giver], null, 200) === null);
t("one person / three people: no hand-over", handOffFrame([taker], null, 200) === null && handOffFrame([taker, giver, giver], null, 200) === null);
t("a crowd is no hand-over", handOffFrame([taker, { action: "reach", crowd: 6 }], null, 200) === null);
t("a carried take keeps its passed moment (already in the receiver's hand)",
  handOffFrame([taker, giver], { chars: [{ carried: true, poseClock: 300, cue: 120 }, { carried: true, poseClock: 300 }] }, 200) === -180);
t("a carried figure that STARTS the take here uses this beat's moment",
  handOffFrame([taker, giver], { chars: [{ carried: true, poseClock: 60 }, { carried: true, poseClock: 300 }] }, 200) === 40);
// the swap is drawn only when the two face each other (else an authored shot that turns them apart would make the
// object jump between hands that never meet — the old drawing stays)
t("twoShot slots face each other (left unflipped, right flipped)", facesEachOther({ x: 566 }, { x: 1354, flip: true }) && facesEachOther({ x: 1354, flip: true }, { x: 566 }));
t("both facing right (illustration overflow) is not facing", !facesEachOther({ x: 356 }, { x: 546 }) && !facesEachOther({ x: 546 }, { x: 356 }));
t("back to back / same spot is not facing", !facesEachOther({ x: 566, flip: true }, { x: 1354 }) && !facesEachOther({ x: 700 }, { x: 700, flip: true }));

// ── the planner on a fixture ─────────────────────────────────────────────────
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hand-over-"));
const SLUG = `zz-hand-over-${process.pid}`;
const BOOK = path.join(REPO, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const LINES = [
  "Welcome to a story about growing up too fast.",
  "By thirteen her mother is handing her the car keys.",
  "Her mother tells her to drive to a club in the valley.",
  "So the girl becomes the driver for her parents.",
  "Years later a friend shows her an old photograph.",
  "She picks up the photograph and studies it.",
  "Nothing in it looks the way she remembers.",
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
const CAST = { mother: { name: "Mother", role: "the mother", look: "woman" }, demi: { name: "Demi", role: "the girl", look: "teenage girl" }, friend: { name: "Friend", role: "a friend", look: "woman" }, narrator: { name: "Narrator", role: "host", look: "host" } };
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
try {
  fs.mkdirSync(BOOK, { recursive: true });
  fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
  fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
  fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Hand Test", author: "A. Writer", genre: "nonfiction", engine: "antidote" }));
  fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["key"] } }));
  const base = [path.join(__dirname, "plan-antidote.js"), `--slug=${SLUG}`, "--title=Hand Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
  run([...base, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const em = read(path.join(tmp, "beats.json"));
  const bs = em ? (em.beats || em) : [];
  const at = (re) => (bs.find((b) => re.test(b.narration || "")) || {}).i;
  const I = { give: at(/handing her the car keys/), take: at(/drive to a club/), after: at(/becomes the driver/), shows: at(/old photograph/), picks: at(/picks up the photograph/) };
  t("fixture: every case sentence is its own beat", Object.values(I).every((k) => k > 0) && new Set(Object.values(I)).size === 5, JSON.stringify(bs.map((b) => b.narration)));
  const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
  const art = (handOver) => ({ beats: bs.map((b) => {
    const x = { i: b.i, narration: b.narration, concept: null, diagram: null, callout: null, storyboard: SB };
    if (b.i === I.give) Object.assign(x, { cast: ["mother", "demi"], action: "hold", holds: "key", expression: "smirk", partnerExpression: "surprised" });
    if (b.i === I.take) Object.assign(x, { cast: ["demi", "mother"], action: "take", holds: "key", continue: true, actionCue: "drive", ...(handOver ? { partnerAction: "reach", partnerExpression: "smirk" } : {}) });
    if (b.i === I.after) Object.assign(x, { cast: ["demi"], action: "hold", holds: "key", continue: true });
    // a two-person hold that is NOT followed by a hand-over, and a lone take: untouched
    if (b.i === I.shows) Object.assign(x, { cast: ["friend", "demi"], action: "hold", holds: "photo" });
    if (b.i === I.picks) Object.assign(x, { cast: ["demi"], action: "take", holds: "photo" });
    return x;
  }) });
  const plan = (name, handOver) => {
    fs.writeFileSync(path.join(tmp, `${name}.art.json`), JSON.stringify(art(handOver)));
    const r = run([...base, `--callouts=${path.join(tmp, `${name}.art.json`)}`, `--out=${path.join(tmp, `${name}.json`)}`]);
    const cfg = read(path.join(tmp, `${name}.json`));
    t(`plan (${name}): config written`, !!cfg, (r.stderr || r.stdout || "").slice(-400));
    return cfg;
  };
  const H = plan("handover", true), N = plan("plain", false);
  if (H && N) {
    const g = H.scenes[I.give], k = H.scenes[I.take];
    t("the giver's hold beat faces the receiver (twoShot)", g.shot === "twoShot", g.shot);
    t("the hand-over beat is the same two-shot, continued", k.shot === "twoShot" && k.continueFromPrev === true, `${k.shot} ${k.continueFromPrev}`);
    t("receiver first, takes the object; the giver reaches", k.characters[0].identity === "demi" && k.characters[0].action === "take" && k.characters[0].holds === "key" && k.characters[1].identity === "mother" && k.characters[1].action === "reach", JSON.stringify(k.characters.map((c) => [c.identity, c.action, c.holds])));
    t("on both beats the two look at each other", [g, k].every((s) => s.characters.every((c) => c.lookAt === "partner")), JSON.stringify([g, k].map((s) => s.characters.map((c) => c.lookAt))));
    t("the giver's smirk is the partner reaction on the hand-over", k.characters[1].expression === "smirk", k.characters[1].expression);
    t("the authored moment lands on its word", typeof k.characters[0].actionAt === "number" && k.characters[0].actionAt > 0, String(k.characters[0].actionAt));
    t("the receiver keeps holding it after (kept beat)", H.scenes[I.after].characters[0].holds === "key" && H.scenes[I.after].continueFromPrev === true);
    const strip = (s) => JSON.stringify({ shot: s.shot, characters: s.characters, bg: s.bg, props: s.props, texts: s.texts });
    const others = H.scenes.map((s, i) => i).filter((i) => i !== I.give && i !== I.take && i !== I.after);
    t("every other beat is planned exactly as without a hand-over (incl. a 2-person hold and a lone take)", others.every((i) => strip(H.scenes[i]) === strip(N.scenes[i])), JSON.stringify(others.filter((i) => strip(H.scenes[i]) !== strip(N.scenes[i]))));
    t("without partnerAction the GIVING beats keep the old staging (no forced two-shot)", N.scenes[I.give].characters.every((c) => c.lookAt !== "partner") || N.scenes[I.give].shot === "twoShot");
    t("handOffFrame finds the planned hand-over", handOffFrame(k.characters, null, k.durationFrames) === actionCueFrame(k.characters[0], k.durationFrames) && handOffFrame(N.scenes[I.take].characters, null, 100) === null);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(BOOK, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall hand-over tests passed");
process.exit(failed ? 1 : 0);
