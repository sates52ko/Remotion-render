#!/usr/bin/env node
// test-c19.js — C19 sequences (2026-11-07): an action and its result across shots inside a beat / over consecutive
// beats. Validation, atomic apply (all beats or none), the beat keeps id / start / length / transition, carried state
// and the set-change rule, status after a rebuild, revert of the whole sequence. In memory, < 1 s.
const assert = require("assert");
const C19 = require("./lib/c19-sequence");
const RO = require("./single-relation-rollout");

let fail = 0;
const ok = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { fail++; console.log(`✗ ${name}\n    ${e.message}`); } };
const clone = (x) => JSON.parse(JSON.stringify(x));

// three beats on one shore: 0 sets up, 1 says the strike and the split, 2 is after it
const N = ["Luther walks to the log with his axe.", "Swing, strike, split. The wood falls apart.", "He stacks the pieces by the door."];
const timed = (text, from) => text.split(" ").map((w, k) => ({ w, s: from + 10 + k * 12 }));
const beat = (i) => ({ id: `s${i}`, fromFrame: i * 200, durationFrames: 200, shot: "medium", bg: { kind: "outdoor", set: "shore" },
  transition: { type: i ? "fade" : "cut", frames: i ? 12 : 0 }, characters: [{ identity: "luther", role: "luther", action: "idle" }], props: [], texts: [{ text: "WORK" }], _narration: N[i] });
const config = () => ({ meta: { cast: { luther: {} } }, scenes: [0, 1, 2].map(beat), captions: N.map((t, i) => ({ words: timed(t, i * 200) })) });
const motifs = { log: { viewBox: "0 0 100 40", paths: [{ d: "M0 0h100v40H0z" }], words: ["log", "wood"] } };
const ctx = { motifs };
const wordAt = (cfg, i, w) => cfg.captions[i].words.find((x) => x.w.replace(/[^a-z]/gi, "").toLowerCase() === w).s - cfg.scenes[i].fromFrame;

const luther = (extra = {}) => ({ identity: "luther", action: "hold", holds: "axe", ...extra });
const contract = () => ({ schema: C19.SCHEMA, _author: "test", mainIdea: "Luther splits the log he came to chop.", howShown: "The axe strikes and the halves fall apart on the word.", actionIsCentral: true, evidence: "Swing, strike, split.",
  beats: [
    { sceneIndex: 1, shots: [
      { at: null, stage: "keep" },
      { at: "Swing,", cues: { 0: "strike," }, motionCues: { 0: "split." }, stage: { shot: "wide", bg: { set: "shore" }, characters: [luther({ action: "chop" })], props: [{ motif: "log", x: 900, y: 760, scale: 0.8 }] } },
      { at: "The wood", stage: { shot: "wide", bg: { set: "shore" }, characters: [luther()], props: [{ motif: "log", x: 900, y: 760, scale: 0.8, startState: "split" }] } }] },
    { sceneIndex: 2, shots: [{ at: null, stage: { shot: "wide", bg: { set: "shore" }, characters: [luther()], props: [{ motif: "log", x: 900, y: 760, scale: 0.8, startState: "split" }] } }] }] });
// the split motion is a prop motion; it needs its own prop field in the stage
const withSplit = (c) => { c.beats[0].shots[1].stage.props[0].motion = "split"; return c; };

ok("a valid two-beat contract has no errors", () => assert.deepStrictEqual(C19.validate(withSplit(contract()), config(), ctx), []));

ok("shots are beat-relative and cut on the narrator's words; cues sit exactly on the word", () => {
  const cfg = config(), shots = C19.compileBeat(cfg, withSplit(contract()).beats[0], motifs);
  assert.strictEqual(shots[0].from, 0); assert.strictEqual(shots[2].to, 200);
  assert.strictEqual(shots[1].from, wordAt(cfg, 1, "swing")); assert.strictEqual(shots[2].from, wordAt(cfg, 1, "the"));
  assert.strictEqual(shots[1].characters[0].actionAt, wordAt(cfg, 1, "strike") - shots[1].from);
  assert.strictEqual(shots[1].characters[0].cueExact, true);
  assert.strictEqual(shots[1].props[0].motionAt, wordAt(cfg, 1, "split") - shots[1].from);
  assert.ok(shots[2].props[0].motionAt < 0, "a carried result starts already split");
  assert.ok(shots[0].kept && shots[0].texts.length === 1, "keep = the beat's own staging");
});

ok("apply is atomic and the beat keeps id, start, length and transition", () => {
  const cfg = config(), r = C19.apply(cfg, withSplit(contract()), ctx);
  assert.ok(r.ok);
  for (const i of [1, 2]) {
    const a = cfg.scenes[i], b = r.config.scenes[i];
    for (const k of ["id", "fromFrame", "durationFrames", "transition", "_narration", "characters", "texts"]) assert.deepStrictEqual(b[k], a[k], `${i}.${k}`);
    assert.ok(b.shots.length && b._c19.contractHash === r.contractHash);
    assert.deepStrictEqual(b._c19.beats, [1, 2]);
  }
  assert.strictEqual(r.config.scenes[0], cfg.scenes[0]);
  assert.ok(!cfg.scenes[1].shots, "the input config is not mutated");
});

ok("one failing beat = no beat changes", () => {
  const c = withSplit(contract()); c.beats[1].shots[0].stage.characters[0].identity = "stranger";
  const r = C19.apply(config(), c, ctx);
  assert.ok(!r.ok && r.errors.some((e) => /not in the book's cast/.test(e)));
  assert.ok(!r.config);
});

ok("the timing rule: a cued action without its word, and a cut word the narrator never says, are refused", () => {
  const c = withSplit(contract()); delete c.beats[0].shots[1].cues;
  assert.ok(C19.validate(c, config(), ctx).some((e) => /"chop" must be cued/.test(e)));
  const d = withSplit(contract()); d.beats[0].shots[1].at = "Hammer,";
  assert.ok(C19.validate(d, config(), ctx).some((e) => /cut word "Hammer,"/.test(e)));
  const e = withSplit(contract()); e.beats[0].shots[1].cues = { 0: "falls" };
  assert.ok(C19.validate(e, config(), ctx).some((m) => /cue "falls" is not said inside the shot/.test(m)));
});

ok("grounding: an object the narration never names is refused; evidence must be verbatim; no hypothetical", () => {
  const c = withSplit(contract()); c.beats[0].shots[1].stage.characters[0].holds = "sword";
  assert.ok(C19.validate(c, config(), ctx).some((e) => /"sword" is drawn but the narration never names it/.test(e)));
  const d = withSplit(contract()); d.evidence = "He swings the axe.";
  assert.ok(C19.validate(d, config(), ctx).some((e) => /VERBATIM/.test(e)));
  const cfg = config(); cfg.scenes[1]._narration = "He could swing, strike, split. The wood falls apart."; const e = withSplit(contract()); e.evidence = "He could swing, strike, split.";
  assert.ok(C19.validate(e, cfg, ctx).some((m) => /hypothetical/.test(m)));
});

ok("one character, one look; no new on-screen words", () => {
  const c = withSplit(contract()); c.beats[1].shots[0].stage.characters[0].variant = { beard: "full" };
  assert.ok(C19.validate(c, config(), ctx).some((e) => /changes look/.test(e)));
  const d = withSplit(contract()); d.beats[1].shots[0].stage.texts = [{ text: "SPLIT" }];
  assert.ok(C19.validate(d, config(), ctx).some((e) => /no new on-screen words/.test(e)));
});

ok("carried state: a result needs its cause earlier in the sequence, in the SAME set", () => {
  const c = contract(); // no split motion anywhere → the carried pieces have no cause
  assert.ok(C19.validate(c, config(), ctx).some((e) => /starts split but no earlier shot/.test(e)));
  const d = withSplit(contract()); d.beats[1].shots[0].stage.bg.set = "kitchen";
  assert.ok(C19.validate(d, config(), ctx).some((e) => /the set changes \(shore → kitchen\)/.test(e)));
  const e = withSplit(contract()); e.beats[1].sceneIndex = 0;
  assert.ok(C19.validate(e, config(), ctx).some((m) => /consecutive/.test(m)));
});

ok("framing: full body only in a full-body shot (a waist-up shot keeps the head in frame); legs need a full shot", () => {
  const cfg = config(), b = { sceneIndex: 1, shots: [{ at: null, stage: { shot: "medium", characters: [{ identity: "luther", action: "hold", holds: "axe" }] } }] };
  assert.strictEqual(C19.compileBeat(cfg, b, motifs)[0].characters[0].body, undefined);
  b.shots[0].stage.shot = "wide";
  assert.strictEqual(C19.compileBeat(cfg, b, motifs)[0].characters[0].body, "full");
  const c = withSplit(contract()); c.beats[0].shots[1].stage.shot = "medium";
  assert.ok(C19.validate(c, config(), ctx).some((e) => /"chop" needs the legs/.test(e)));
});

ok("status after a rebuild and revert of the whole sequence", () => {
  const cfg = config(), r = C19.apply(cfg, withSplit(contract()), ctx);
  const record = { scenes: [{ kind: "c19", sceneIndex: 1, beats: [1, 2], contractHash: r.contractHash, previousBeats: r.previous }] };
  assert.strictEqual(RO.status(r.config, record).state, "ACTIVE");
  assert.deepStrictEqual(RO.status(cfg, record).missing, [1], "a rebuilt config without the shots is MISSING");
  const half = clone(r.config); delete half.scenes[2].shots;
  assert.strictEqual(RO.status(half, record).state, "MISSING", "one beat without its shots = the sequence is not live");
  const back = RO.revert(r.config, record);
  assert.deepStrictEqual(back.config.scenes, cfg.scenes, "both beats return to their previous versions together");
  assert.deepStrictEqual(back.done, [1]);
  assert.strictEqual(RO.status(back.config, back.record).state, "NONE");
});

ok("the author's reading is required: main idea + how the action shows it; a side-detail action keeps A", () => {
  const c = withSplit(contract()); delete c.mainIdea; delete c.howShown;
  const e = C19.validate(c, config(), ctx);
  assert.ok(e.some((m) => /mainIdea/.test(m)) && e.some((m) => /howShown/.test(m)));
  const d = withSplit(contract()); d.actionIsCentral = false;
  assert.ok(C19.validate(d, config(), ctx).some((m) => /side detail keeps A/.test(m)));
  const f = withSplit(contract()); f.beats[0].dropTexts = "no";
  assert.ok(C19.validate(f, config(), ctx).some((m) => /dropTexts needs the reason/.test(m)));
});

ok("the beat's own words survive the inner cuts with their ORIGINAL in / out frames", () => {
  const cfg = config(); cfg.scenes[1].texts = [{ text: "WORK", at: 20, duration: 100 }, { text: "LATE", at: 150 }];
  const shots = C19.compileBeat(cfg, withSplit(contract()).beats[0], motifs);
  for (const sh of shots) for (const t of sh.texts) {
    const orig = cfg.scenes[1].texts.find((x) => x.text === t.text);
    assert.strictEqual(sh.from + t.at, orig.at, `${t.text}: same absolute entry frame`);
    assert.strictEqual(t.duration, orig.duration, `${t.text}: same exit`);
  }
  // WORK (20–120) shows in every shot it overlaps, LATE (150–) only from where it starts
  const has = (sh, w) => sh.texts.some((t) => t.text === w);
  assert.ok(shots.filter((sh) => sh.from < 120 && sh.to > 20).every((sh) => has(sh, "WORK")));
  assert.ok(shots.filter((sh) => sh.to <= 150).every((sh) => !has(sh, "LATE")));
  const d = withSplit(contract()); d.beats[0].dropTexts = "the callout names a different beat's idea";
  assert.ok(C19.compileBeat(cfg, d.beats[0], motifs).filter((sh) => !sh.kept).every((sh) => !sh.texts.length));
});

ok("a small hand object is drawn larger in a full-body shot and every C19 hand object is outlined", () => {
  const cfg = config(), b = { sceneIndex: 1, shots: [{ at: null, stage: { shot: "wide", characters: [{ identity: "luther", action: "hold", holds: "coin" }] } }] };
  const ch = C19.compileBeat(cfg, b, motifs)[0].characters[0];
  assert.strictEqual(ch.holdScale, C19.SMALL_SCALE); assert.strictEqual(ch.holdHalo, true);
  b.shots[0].stage.shot = "medium";
  const m = C19.compileBeat(cfg, b, motifs)[0].characters[0];
  assert.strictEqual(m.holdScale, undefined); assert.strictEqual(m.holdHalo, true);
});

// two winners on the same beat: 0–1 (walk to the log) and 1–2 (the split carried on)
const fs = require("fs"), os = require("os"), path = require("path");
const overlapping = () => ({ schema: C19.SCHEMA, _author: "test", mainIdea: "Luther splits the log he came to chop.", howShown: "The axe strikes and the halves fall apart on the word.", actionIsCentral: true, evidence: "Luther walks to the log with his axe.",
  beats: [{ sceneIndex: 0, shots: [{ at: null, stage: { shot: "wide", bg: { set: "shore" }, characters: [luther()], props: [{ motif: "log", x: 900, y: 760, scale: 0.8 }] } }] },
    { sceneIndex: 1, shots: [{ at: null, stage: "keep" }] }] });

ok("overlap: two winners sharing a beat → the larger B−A is chosen WHOLE, the other keeps A naming it", () => {
  const r = C19.resolveOverlaps([
    { sceneIndex: 0, beats: [0, 1], ab: { A: 10, B: 30 } },
    { sceneIndex: 1, beats: [1, 2], ab: { A: 10, B: 50 } },
    { sceneIndex: 5, beats: [5], ab: { A: 0, B: 5 } }]);
  assert.deepStrictEqual(r.chosen.map((x) => x.sceneIndex), [1, 5]);
  assert.strictEqual(r.kept.length, 1);
  assert.ok(/overlaps C19 sequence 1 \(beats 1\+2\) on beat\(s\) 1/.test(r.kept[0].why), r.kept[0].why);
  // a tie on the margin: fewer wrong inferences, then the earlier first beat
  const t = C19.resolveOverlaps([{ sceneIndex: 1, beats: [1, 2], ab: { A: 0, B: 20, wiB: 1 } }, { sceneIndex: 0, beats: [0, 1], ab: { A: 0, B: 20, wiB: 0 } }]);
  assert.deepStrictEqual(t.chosen.map((x) => x.sceneIndex), [0]);
});

// a book on disk for select / apply (temp dir)
const tmpBook = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "c19-")), B = path.join(root, "books", "t"), D = path.join(B, "single-relation", "c19");
  fs.mkdirSync(path.join(D, "contracts"), { recursive: true });
  fs.writeFileSync(path.join(B, "motifs.json"), JSON.stringify(motifs));
  const cs = { 0: overlapping(), 1: withSplit(contract()) };
  for (const [i, c] of Object.entries(cs)) fs.writeFileSync(path.join(D, "contracts", `${i}.json`), JSON.stringify(c));
  fs.writeFileSync(path.join(D, "contracts.json"), JSON.stringify({ valid: [0, 1], contracts: {} }));
  const row = (i, A, B) => ({ sceneIndex: i, A, B, wiA: 0, wiB: 0, avReviewed: true, bContractHash: crypto.createHash("sha256").update(JSON.stringify(cs[i])).digest("hex").slice(0, 16) });
  return { root, D, cs, rows: [row(0, 10, 30), row(1, 10, 50)] };
};
const crypto = require("crypto");

ok("select: overlapping C19 winners → one sequence chosen whole, the other kept A with the reason", () => {
  const t = tmpBook(), sel = RO.select(t.D, { rows: t.rows });
  assert.deepStrictEqual(sel.chosen.map((c) => c.sceneIndex), [1]);
  const k = sel.kept.find((x) => x.sceneIndex === 0);
  assert.ok(k && /overlaps C19 sequence 1/.test(k.why), JSON.stringify(sel.kept));
});

ok("apply refuses a sequence whose beat already carries another one (no partial overlap reaches the config)", () => {
  const t = tmpBook(), { plan } = require("./c19");
  const cfg = config(), mk = (i, r) => ({ sceneIndex: i, contract: path.join(t.D, "contracts", `${i}.json`), ab: { A: r.A, B: r.B, bContractHash: r.bContractHash } });
  const r = plan(t.root, "t", cfg, { chosen: [mk(1, t.rows[1]), mk(0, t.rows[0])], kept: [] });
  assert.deepStrictEqual(r.entries.map((e) => e.sceneIndex), [1]);
  assert.ok(r.kept.some((k) => k.sceneIndex === 0 && /already carry another C19 sequence/.test(k.why)));
  assert.ok(!r.config.scenes[0].shots, "beat 0 keeps A");
  // a later apply of the loser on the config that already carries the winner is refused the same way
  const again = plan(t.root, "t", r.config, { chosen: [mk(0, t.rows[0])], kept: [] });
  assert.strictEqual(again.entries.length, 0);
});

ok("integrity: the chosen sequence survives a rebuild whole (re-applied from its record) and reverts whole", () => {
  const t = tmpBook(), { plan } = require("./c19"), cfg = config();
  const r = plan(t.root, "t", cfg, { chosen: [{ sceneIndex: 1, contract: path.join(t.D, "contracts", "1.json"), ab: { A: 10, B: 50, bContractHash: t.rows[1].bContractHash } }], kept: [] });
  const record = { scenes: r.entries };
  // rebuild: a freshly planned config (no shots) + make-book 1.885's re-apply from the recorded contract
  const rebuilt = C19.apply(config(), t.cs[1], ctx).config;
  for (const i of [1, 2]) assert.deepStrictEqual(rebuilt.scenes[i], r.config.scenes[i], `beat ${i} identical after the rebuild`);
  assert.ok(!rebuilt.scenes[0].shots && !rebuilt.scenes[0]._c19, "the loser's beat stays A");
  assert.strictEqual(RO.status(rebuilt, record).state, "ACTIVE");
  const back = RO.revert(rebuilt, record, [1]);
  assert.deepStrictEqual(back.config.scenes, cfg.scenes, "every beat of the sequence back together, nothing else touched");
});

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log("\nall C19 sequence tests passed");
