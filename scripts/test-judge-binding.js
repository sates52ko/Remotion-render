#!/usr/bin/env node
// JUDGE BINDING + SEALED-EVIDENCE GUARD (cycle 9 P0b, 2026-11-04). The tally counts a result only when it answers exactly
// this judge input, of this judge run and label, for the film the run records; otherwise EVIDENCE_INVALID (not PASS,
// not FAIL — bars untouched). A sealed, tallied label is never overwritten: re-tally only on byte-identical evidence,
// judge refused. Legacy runs (no judge-run.json) keep their old reading. Unit + the real mute-test.js tally on a fixture
// book in this tree (removed after; ledger restored). Run: node scripts/test-judge-binding.js
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const JB = require("./lib/judge-binding");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info !== undefined ? `  (${String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 1)); };
const N = 30;
const id = (k) => `item-${String(k + 1).padStart(2, "0")}`;
const WHO = ["a woman", "an old man", "two kids", "a clerk", "a soldier", "a nurse", "a farmer", "a boy", "a couple", "a teacher"];
const DO = ["holding a lantern", "staring at a ledger", "running down a road", "sitting by a hospital bed", "pointing at a chart", "hugging", "arguing across a desk", "planting a tree", "reading a letter", "climbing stairs"];
const MEAN = ["grief after a loss", "a deal going wrong", "someone escaping", "care for a sick parent", "a market falling", "a reunion", "an old feud", "a fresh start", "bad news arriving", "an effort to climb out"];
const blind = () => Array.from({ length: N }, (_, k) => ({ img: `img-${String(k + 1).padStart(2, "0")}.png`, text: "",
  sees: `${WHO[k % 10]} ${DO[(k * 3) % 10]}${k % 4 ? "" : ", a clock icon beside them"}.`, message: `Probably about ${MEAN[(k * 7) % 10]}${k % 3 ? "" : " — the face reads worried"}${k >= 10 ? ` (${WHO[(k + 3) % 10]})` : ""}.`, confidence: k % 5 ? "high" : "medium", wouldConfuse: "none" }));
const VERD = (k) => (k % 9 === 0 ? "WRONG" : k % 5 === 0 ? "NEUTRAL" : "CORRECT");
const CONT = (k) => (k % 4 === 0 ? "TEXT_ONLY" : k % 11 === 0 ? "NONE" : "ADDS");
const items = () => Array.from({ length: N }, (_, k) => ({ id: id(k), V: { correctness: VERD(k), why: `${VERD(k) === "CORRECT" ? "Matches" : "Misses"} the narration about ${MEAN[(k * 7) % 10]}${k % 2 ? " — the figure carries it" : ""}.`,
  contribution: CONT(k), whyC: `${CONT(k) === "ADDS" ? "The picture shows" : "Only the words give"} ${DO[(k * 3) % 10]}.`, explains: k % 3 ? "YES" : "NO" } }));
const input = () => Array.from({ length: N }, (_, k) => ({ id: id(k), t: `${k * 3}s` }));
const key = () => Object.fromEntries(Array.from({ length: N }, (_, k) => [id(k), { frame: k * 90 + 10 }]));
const RUN = { run: "L-abc", label: "L", inputSha256: null };

// ── unit ────────────────────────────────────────────────────────────────────
{
  const B = (o) => JB.checkBinding({ input: input(), key: key(), result: { run: "L-abc", label: "L", items: items() }, runFile: RUN, label: "L", ...o });
  t("a complete, bound result → ok", B({}).ok);
  const short = items().slice(0, 25);
  t("missing items → INVALID (a short result would shrink n and the bars)", !B({ result: { run: "L-abc", items: short } }).ok);
  const dup = items(); dup.push({ ...dup[3] });
  t("an item answered twice → INVALID", B({ result: { run: "L-abc", items: dup } }).reasons.some((r) => /more than once/.test(r)));
  const ext = items(); ext.push({ id: "item-99", V: ext[0].V });
  t("an item the input never asked → INVALID", B({ result: { run: "L-abc", items: ext } }).reasons.some((r) => /never asked/.test(r)));
  t("another run's token → INVALID", B({ result: { run: "L-zzz", items: items() } }).reasons.some((r) => /not the answer to this judge run/.test(r)));
  t("judge-run.json of another label → INVALID", !B({ runFile: { ...RUN, label: "M" } }).ok);
  t("judge-input changed after the token was issued → INVALID", !B({ runFile: { ...RUN, inputSha256: "a" }, inputSha256: "b" }).ok);
  t("judge-key of other items → INVALID", !B({ key: { ...key(), "item-77": { frame: 1 } } }).ok);
  const word = items(); word[2].V.contribution = "ECHOES";
  t("a non-rubric word in a bound run → INVALID", !B({ result: { run: "L-abc", items: word } }).ok);
  t("stills rendered from another config than the run records → INVALID", !B({ meta: { configSha256: "1111222233334444ffff" }, stillsConfigSha: "aaaabbbbccccdddd\n" }).ok);
  const legacy = JB.checkBinding({ input: input(), key: key(), result: { items: word }, runFile: null, label: "L", meta: { configSha256: "1111222233334444ffff" }, stillsConfigSha: "aaaabbbbccccdddd" });
  t("LEGACY run (no judge-run.json): rubric/stills rules are signals, the run stays ok", legacy.ok && legacy.legacy && legacy.signals.some((s) => /LEGACY \(not counted\)/.test(s)));
  t("LEGACY run with a missing item → still INVALID (objective corruption)", !JB.checkBinding({ input: input(), key: key(), result: { items: short }, runFile: null, label: "L" }).ok);
}

// ── the real mute-test.js judge/tally on a fixture book ──────────────────────
{
  const ROOT = path.join(__dirname, "..");
  const SLUG = `zz-judge-binding-${process.pid}`;
  const BOOK = path.join(ROOT, "books", SLUG), MD = path.join(ROOT, "audit", "mute", SLUG);
  const LEDGER = path.join(ROOT, "data", "engine-outcomes.json");
  const ledgerBefore = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER) : null;
  const env = { ...process.env, PRODUCTION_GUARD: "off" };
  const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, "mute-test.js"), ...a, `--slug=${SLUG}`], { cwd: ROOT, encoding: "utf8", env });
  const sha = (p) => require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const label = (L, { token = true, result = null, sealed = false } = {}) => {
    const D = path.join(MD, L);
    W(path.join(D, "sample-meta.json"), { framesFrom: null, seed: 1, repeatedUnits: 0, ...(sealed ? { sealed: true, idsSha256: "x" } : {}) });
    W(path.join(D, "judge-key.json"), key()); W(path.join(D, "judge-input.json"), input()); W(path.join(D, "blind.json"), blind());
    if (token) W(path.join(D, "judge-run.json"), { run: `${L}-tok`, label: L, inputSha256: sha(path.join(D, "judge-input.json")) });
    W(path.join(D, "judge-result.json"), result || { ...(token ? { run: `${L}-tok`, label: L } : {}), items: items() });
    return D;
  };
  const tot = (L) => JSON.parse(fs.readFileSync(path.join(MD, L, "totals.json"), "utf8"));
  try {
    W(path.join(BOOK, "config.antidote.json"), { meta: { fps: 30, audio: "audio/x.m4a" }, scenes: Array.from({ length: 40 }, (_, k) => ({ id: `scene-${k}`, fromFrame: k * 90, durationFrames: 90 })), captions: [{ startFrame: 0, endFrame: 3600, text: "narration" }] });
    W(path.join(BOOK, "book.json"), { slug: SLUG, engine: "antidote" });
    label("bound");
    let x = run("tally", "--label=bound");
    t("tally: a bound run → the normal PASS/FAIL line, binding BOUND, evidence hash recorded", x.status === 0 && /→ (PASS|FAIL)/.test(x.stdout) && tot("bound").binding === "BOUND" && /^[0-9a-f]{64}$/.test(tot("bound").evidenceSha256), x.stdout + x.stderr);
    label("short", { result: { run: "short-tok", label: "short", items: items().slice(0, 24) } });
    x = run("tally", "--label=short");
    t("tally: a short result → EVIDENCE_INVALID (exit 3), not counted, binding INVALID", x.status === 3 && /EVIDENCE_INVALID/.test(x.stdout) && tot("short").binding === "INVALID" && tot("short").verdict === false, x.stdout);
    const dupItems = items(); dupItems.push({ ...dupItems[0] });
    label("dup", { result: { run: "dup-tok", label: "dup", items: dupItems } });
    x = run("tally", "--label=dup");
    t("tally: a duplicated answer → EVIDENCE_INVALID, and n is still 30 (the duplicate never counts twice)", x.status === 3 && tot("dup").n === 30, `${x.status} n=${tot("dup").n}`);
    const ex = items(); ex.push({ id: "item-99", V: ex[0].V });
    label("extra", { result: { run: "extra-tok", label: "extra", items: ex } });
    x = run("tally", "--label=extra");
    t("tally: an unknown id → EVIDENCE_INVALID, no crash", x.status === 3 && /EVIDENCE_INVALID/.test(x.stdout), x.stdout + x.stderr);
    label("wrongrun", { result: { run: "someone-else", label: "wrongrun", items: items() } });
    x = run("tally", "--label=wrongrun");
    t("tally: another judge run's result → EVIDENCE_INVALID", x.status === 3 && /not the answer to this judge run/.test(x.stdout), x.stdout);
    label("legacy", { token: false });
    x = run("tally", "--label=legacy");
    t("tally: a LEGACY run (no judge-run.json) → read as before, binding LEGACY", x.status === 0 && tot("legacy").binding === "LEGACY", x.stdout + x.stderr);
    // sealed + tallied: the record is final
    const SD = label("sealed", { sealed: true });
    x = run("tally", "--label=sealed");
    const first = fs.readFileSync(path.join(SD, "totals.json"), "utf8");
    x = run("tally", "--label=sealed");
    t("sealed: a re-tally on byte-identical evidence is allowed (same numbers)", x.status === 0 && JSON.parse(fs.readFileSync(path.join(SD, "totals.json"), "utf8")).evidenceSha256 === JSON.parse(first).evidenceSha256, x.stderr);
    const changed = items(); changed[1].V.correctness = "WRONG"; // item-02 is CORRECT in the fixture
    W(path.join(SD, "judge-result.json"), { run: "sealed-tok", label: "sealed", items: changed });
    const before = fs.readFileSync(path.join(SD, "totals.json"), "utf8");
    x = run("tally", "--label=sealed");
    t("sealed: a re-tally on other judge evidence → refused (exit 3), the recorded totals unchanged", x.status === 3 && fs.readFileSync(path.join(SD, "totals.json"), "utf8") === before, `exit ${x.status} ${x.stdout.slice(0, 300)} ${x.stderr}`);
    x = run("judge", "--label=sealed");
    t("sealed: judge on a tallied sealed label → refused (exit 3), judge-input/key not written over", x.status === 3 && /never written over/.test(x.stderr), x.stderr);
  } finally {
    fs.rmSync(BOOK, { recursive: true, force: true }); fs.rmSync(MD, { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, "audit", "cause-ledger", SLUG), { recursive: true, force: true });
    try { fs.rmdirSync(path.join(ROOT, "audit", "cause-ledger")); } catch { /* not empty / not there */ }
    if (ledgerBefore) fs.writeFileSync(LEDGER, ledgerBefore);
  }
}

console.log(failed ? `\n${failed} FAILED` : "\nall judge-binding checks passed");
process.exit(failed ? 1 : 0);
