#!/usr/bin/env node
// MECHANISM 3.0 — a feedback loop whose state changes lap by lap (src/engines/antidote/causalLedger.ts,
// components/CausalLoop.tsx), 2026-10-28. The rules that matter: each loop cue fires the NEXT burst of authored laps;
// laps run one after another and faster after each rename; a lap writes a PERMANENT ledger column (tile when the door
// opens; a bar only once the meter is born, rising from the lap's own start — never before it); earlier beats' laps are
// settled; one shared qualitative scale; the contrast lane has its own ledger and a check; merge refuses a ledger cue
// without its data; the planner carries the chain's firing counts.
// Run: node scripts/test-causal-loop.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const LG = require("../src/engines/antidote/causalLedger.ts");
const { causalSchema } = require("../src/engines/antidote/schema.ts");

const LOOP = {
  stations: [{ label: "LEVER", glyph: "lever", figure: "rat" }, { label: "FOOD", glyph: "pellet", mark: "?" }, { label: "DOPAMINE", glyph: "brain" }],
  token: { glyph: "bolt", tag: "PRESS", tagTo: ["COMPULSIVELY", "MASHING"], from: 0 },
  loop: { to: 0 },
  ledger: { label: "VARIABLE RATIO", labelTo: "UNPREDICTABLE", meter: "DOPAMINE", bursts: [
    { laps: [{ o: "reward" }] }, { laps: [{ o: "empty" }] }, { laps: [{ o: "empty" }, { o: "empty" }, { o: "reward" }] },
    { laps: [{ o: "reward", bar: "high" }, { o: "empty", bar: "stub" }] }, { laps: [{ o: "empty", bar: "stub" }, { o: "reward", bar: "max" }] },
  ] },
  contrast: { label: "100% PREDICTABLE", glyph: "pellet", bursts: [{ laps: [{ o: "reward", bar: "high" }] }, { laps: [{ o: "reward", bar: "medium" }, { o: "reward", bar: "low" }, { o: "reward", bar: "flat" }] }] },
};

// ── (A) schema ───────────────────────────────────────────────────────────────
t("schema: a loop with a ledger and a contrast ledger parses", causalSchema.safeParse(LOOP).success, JSON.stringify(causalSchema.safeParse(LOOP).error?.issues?.slice(0, 2)));
t("schema: bar levels are words, never numbers", !causalSchema.safeParse({ ...LOOP, ledger: { ...LOOP.ledger, bursts: [{ laps: [{ o: "reward", bar: 7 }] }] } }).success);
t("schema: an outcome is reward or empty (nothing 'destroyed')", !causalSchema.safeParse({ ...LOOP, ledger: { ...LOOP.ledger, bursts: [{ laps: [{ o: "broken" }] }] } }).success);

// ── (B) laps: bursts in firing order, one after another, faster after each rename ─────────────────────────────────
const b1 = { ...LOOP, at: { n0: 0, n1: 10, token: 0, loop: [20, 40, 60], relabel: [100] } };
let s = LG.ledgerState(b1, 0);
t("before the first loop cue: no lap, nothing written", s.main.every((l) => l.tile === 0) && s.lap === null);
s = LG.ledgerState(b1, 400);
t("three loop cues fire bursts 1-3: 5 laps written in order (reward, empty, empty, empty, reward)", s.main.length === 5 && s.main.map((l) => l.o).join() === "reward,empty,empty,empty,reward" && s.main.every((l) => l.tile === 1), JSON.stringify(s.main.map((l) => l.o)));
const L0 = LG.ledgerState(b1, 0).main;
t("laps never overlap: each starts when the previous ends (a burst queues behind a running lap)", L0.every((l, i) => i === 0 || l.start >= L0[i - 1].start + L0[i - 1].dur - 1e-9), JSON.stringify(L0.map((l) => [l.start, l.dur])));
let early = 0;
for (let f = 0; f < 400; f++) { const st = LG.ledgerState(b1, f); st.main.forEach((l) => { if (f < l.start && (l.tile > 0 || l.barP > 0)) early++; }); }
t("a lap writes nothing before it starts (400 frames swept)", early === 0, String(early));
const fast = { ...LOOP, at: { n0: 0, n1: 0, token: 0, loop: [0, 300], relabel: [200] } };
const fl = LG.ledgerState(fast, 0).main;
t("after a rename the laps run faster (LAP_LEN calm > fast)", fl[0].dur === LG.LAP_LEN[0] && fl[1].dur === LG.LAP_LEN[1], JSON.stringify(fl.map((l) => l.dur)));
t("the tag index follows the renames (press -> compulsively)", LG.ledgerState(fast, 199).tagIndex === 0 && LG.ledgerState(fast, 201).tagIndex === 1);

// ── (C) the meter: bars only once born, rising from the lap's own start, peaking after the door ───────────────────
const b4 = { ...LOOP, before: { loop: 3, relabel: 2 }, done: ["n0", "n1", "token", "loop", "relabel"], at: { n2: 0, meter: 5, loop: [30, 90] } };
s = LG.ledgerState(b4, 1000);
t("continued beat: the earlier beats' 5 laps are settled, this beat adds 4", s.main.length === 9 && s.main.slice(0, 5).every((l) => l.start < -1000 && l.tile === 1) && s.main.slice(5).every((l) => l.start >= 30), JSON.stringify(s.main.map((l) => l.start)));
t("laps from before the meter have no bar; laps after it carry their authored bar", s.main.slice(0, 5).every((l) => l.bar === null) && s.main.slice(5).map((l) => l.bar).join() === "high,stub,stub,max");
t("frantic after two renames: this beat's laps are the shortest", s.main.slice(5).every((l) => l.dur === LG.LAP_LEN[2]));
const lap6 = LG.ledgerState(b4, 0).main[5];
t("anticipation: the bar starts rising after its lap starts, before the door opens", LG.ledgerState(b4, lap6.start).main[5].barP === 0 && LG.ledgerState(b4, lap6.start + lap6.dur * 0.38).main[5].barP > 0 && LG.ledgerState(b4, lap6.start + lap6.dur * 0.38).main[5].tile === 0);
t("a reward bar reaches its level after the door opens", LG.ledgerState(b4, lap6.start + lap6.dur).main[5].barP === 1);
t("one shared scale: max > high > medium > low > stub > flat", LG.BAR_LEVELS.every((l, i) => i === 0 || LG.BAR_H[l] > LG.BAR_H[LG.BAR_LEVELS[i - 1]]));
const maxLap = LG.ledgerState(b4, 0).main[8];
t("a max bar flares when it peaks", LG.ledgerState(b4, maxLap.start + maxLap.dur * 0.75).flare > 0 && LG.ledgerState(b4, maxLap.start - 1).flare === 0);

// ── (D) the contrast lane: its own ledger, the staircase, the check ───────────────────────────────────────────────
const b5 = { ...b4, before: { loop: 5, relabel: 2 }, done: ["n0", "n1", "n2", "token", "loop", "relabel", "meter"], at: { contrast: 0, clap: [10, 60], csolved: 200 } };
s = LG.ledgerState(b5, 400);
t("contrast: 4 laps, a pellet every lap, bars step down high -> medium -> low -> flat", s.contrast.map((l) => l.o + ":" + l.bar).join() === "reward:high,reward:medium,reward:low,reward:flat", JSON.stringify(s.contrast.map((l) => [l.o, l.bar])));
t("contrast check only after its word", LG.ledgerState(b5, 199).solved === 0 && LG.ledgerState(b5, 230).solved === 1);
t("the main ledger keeps every earlier lap while the contrast runs (append-only)", s.main.length === 9 && s.main.every((l) => l.tile === 1));

// ── (E) the token's legs on a lap ──────────────────────────────────────────────────────────────────────────────────
t("lap legs: to the door, at the door, to the brain (reward), back along the arc", LG.lapLeg(0.2, true).leg === 0 && LG.lapLeg(0.47, true).leg === 1 && LG.lapLeg(0.6, true).leg === 2 && LG.lapLeg(0.9, true).leg === 3);
t("an empty lap never reaches the brain: from the door straight back", LG.lapLeg(0.6, false).leg === 3);

// ── (F) merge + planner on a word-timed fixture ───────────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "causal-loop-"));
const SLUG = `zz-causal-loop-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into habits.",
  "The rat pressed the lever and got food sometimes, then nothing, then food again.",
  "It pressed compulsively, again and again, chasing the reward.",
  "Its brain released dopamine, and the next reward hit harder.",
];
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" "); const start = clock; let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${ts(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
const CAST = { narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Loop Test", author: "A. Writer", genre: "nonfiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const baseArgs = [PLAN, `--slug=${SLUG}`, "--title=Loop Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
const SPEC = { stations: LOOP.stations, token: { glyph: "bolt", tag: "PRESS", tagTo: ["COMPULSIVELY"], from: 0 }, loop: { to: 0 }, ledger: { label: "SOMETIMES", meter: "DOPAMINE", bursts: [{ laps: [{ o: "reward" }] }, { laps: [{ o: "empty" }] }, { laps: [{ o: "reward" }] }, { laps: [{ o: "empty" }, { o: "empty" }] }, { laps: [{ o: "reward", bar: "high" }] }] } };
try {
  run([...baseArgs, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iA = find(/pressed the lever/), iB = find(/compulsively/), iC = find(/released dopamine/);
  t("fixture: three consecutive beats", iA > 0 && iB === iA + 1 && iC === iB + 1, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const CUES = { [iA]: { n0: "lever", token: "pressed", n1: "food", loop: ["food", "nothing", "food again"] }, [iB]: { relabel: "compulsively", loop: "again and again" }, [iC]: { n2: "brain", meter: "dopamine", loop: "next reward" } };
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, cast: [] };
    if (CUES[b.i]) Object.assign(x, { diagram: { type: "causal", labels: [], causal: { ...JSON.parse(JSON.stringify(SPEC)), cues: { ...CUES[b.i] } } }, ...(b.i === iA ? {} : { continue: true }) });
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iC) delete x.diagram.causal.ledger.meter; });
  let r = merge();
  t("merge: a meter cue without ledger.meter is refused", r.status !== 0 && /cue meter without ledger\.meter/.test(r.stdout), (r.stdout || "").slice(-300));
  write(null);
  r = merge();
  t("merge: the authored loop is accepted", r.status === 0, (r.stdout || "").slice(-600));
  r = run([...baseArgs, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-400));
  if (cfg) {
    const cA = cfg.scenes[iA].diagram.causal, cB = cfg.scenes[iB].diagram.causal, cC = cfg.scenes[iC].diagram.causal;
    t("plan: every loop firing is kept (3 in the first beat, in spoken order)", Array.isArray(cA.at.loop) && cA.at.loop.length === 3 && cA.at.loop.every((f, k) => k === 0 || f > cA.at.loop[k - 1]), JSON.stringify(cA.at));
    t("plan: continued beats carry the chain's firing counts (before)", !cA.before && cB.before && cB.before.loop === 3 && cC.before && cC.before.loop === 4 && cC.before.relabel === 1, JSON.stringify([cA.before, cB.before, cC.before]));
    const end = LG.ledgerState(cC, 10000);
    t("render state of the last beat: all 6 laps written, only the post-meter lap has a bar", end.main.length === 6 && end.main.filter((l) => l.bar).length === 1 && end.main[5].bar === "high", JSON.stringify(end.main));
  }
  const RC = fs.readFileSync(path.join(__dirname, "readcheck.js"), "utf8");
  t("readcheck: the ledger's laps are counted for the blind text reader", /set\.counts = \{ \.\.\.cnt \}/.test(RC));
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true });
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall causal-loop checks passed");
process.exit(failed ? 1 : 0);
