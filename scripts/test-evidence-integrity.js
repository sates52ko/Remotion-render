#!/usr/bin/env node
// evidence-integrity (2026-11-03, lib/evidence-integrity.js): mute-test / readcheck evidence filled in from one template
// is EVIDENCE_INVALID (not PASS, not FAIL); an honest run — varied words, stock judge phrases beside varied verdicts,
// files copied together (0 s apart) — never trips. Fixtures: templated -> trips, honest -> passes, borderline either
// side of each threshold; then the real mute-test.js tally and readcheck.js tally on fixtures (exit 3, record fields,
// no engine-outcomes row). If the-most-important-thing's pinned worktree is on disk, its real fabricated run must trip.
// Run: node scripts/test-evidence-integrity.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const EI = require("./lib/evidence-integrity");

let failed = 0, passed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (ok) passed++; else failed++; };
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 1)); };
const at = (p, sec) => fs.utimesSync(p, sec, sec);

// ── fixtures ─────────────────────────────────────────────────────────────────
const N = 30;
const WHO = ["a woman", "an old man", "two kids", "a clerk", "a soldier", "a nurse", "a farmer", "a boy", "a couple", "a teacher"];
const DO = ["holding a lantern", "staring at a ledger", "running down a road", "sitting by a hospital bed", "pointing at a chart", "hugging", "arguing across a desk", "planting a tree", "reading a letter", "climbing stairs"];
const WHERE = ["in a kitchen", "at night outdoors", "in an office", "on a beach", "in a classroom", "under a storm cloud"];
const MEAN = ["grief after a loss", "a deal going wrong", "someone escaping", "care for a sick parent", "a market falling", "a reunion", "an old feud", "a fresh start", "bad news arriving", "an effort to climb out"];
const caps = (k) => ["IS THE PERMANENT", "MEAN YOU RISK", "SECOND LEVEL", "THE PENDULUM", "CYCLES RETURN", "NOT A FORECAST"][k % 6];
const honestBlind = () => Array.from({ length: N }, (_, k) => ({ img: `img-${String(k + 1).padStart(2, "0")}.png`, text: caps(k),
  sees: `${WHO[k % 10]} ${DO[(k * 3) % 10]} ${WHERE[k % 6]}; the words "${caps(k)}" at the top${k % 4 ? "" : ", a clock icon beside them"}.`,
  message: `Probably about ${MEAN[(k * 7) % 10]}${k % 3 ? "" : " — the face reads worried"}${k >= 10 ? ` (${WHO[(k + 3) % 10]})` : ""}.`, confidence: k % 5 ? "high" : "medium", wouldConfuse: "none" }));
const templBlind = () => Array.from({ length: N }, (_, k) => ({ img: `img-${String(k + 1).padStart(2, "0")}.png`, text: caps(k),
  sees: `An animated figure is presented on stage with clear graphic elements and the typography '${caps(k)}'.`,
  message: "The narrator explains investment principles: Investment discipline and risk management.", confidence: "high", wouldConfuse: "none" }));
const VERD = (k) => (k % 9 === 0 ? "WRONG" : k % 5 === 0 ? "NEUTRAL" : "CORRECT");
const CONT = (k) => (k % 4 === 0 ? "ECHOES" : k % 11 === 0 ? "NONE" : "ADDS");
const honestJudge = () => Array.from({ length: N }, (_, k) => ({ id: `item-${String(k + 1).padStart(2, "0")}`, V: { correctness: VERD(k),
  why: `${VERD(k) === "CORRECT" ? "Matches" : "Misses"} the narration about ${MEAN[(k * 7) % 10]}${k % 2 ? " — the figure carries it" : ""}.`,
  contribution: CONT(k), whyC: `${CONT(k) === "ADDS" ? "The picture shows" : "Only the words give"} ${DO[(k * 3) % 10]}.`, explains: k % 3 ? "YES" : "NO" } }));
const templJudge = () => Array.from({ length: N }, (_, k) => ({ id: `item-${String(k + 1).padStart(2, "0")}`, V: { correctness: "CORRECT",
  why: "The understood visual message and on-screen elements accurately convey the narration's core meaning.", contribution: "ADDS",
  whyC: "The visual staging, character actions, and graphical motifs add concrete explanatory value beyond raw text.", explains: "YES" } }));

// ── (a) blind ────────────────────────────────────────────────────────────────
let r = EI.checkMuteRun({ blind: templBlind(), judgeItems: honestJudge() });
t("templated blind (one message, one 'sees' shape) -> EVIDENCE_INVALID", !r.ok && r.status === "EVIDENCE_INVALID" && r.reasons.some((x) => /identical message/.test(x)) && r.reasons.some((x) => /one template/.test(x)), JSON.stringify(r.reasons));
r = EI.checkMuteRun({ blind: honestBlind(), judgeItems: honestJudge() });
t("honest varied blind + judge -> OK, no reasons", r.ok && r.status === "OK" && !r.reasons.length, JSON.stringify(r.reasons));
{ const b = honestBlind(); for (let k = 0; k < 14; k++) b[k].message = "A man is worried about money."; // 14/30 = 47%
  t("borderline: one message on 14/30 (47%) -> OK", EI.checkBlind(b).length === 0, JSON.stringify(EI.checkBlind(b)));
  b[14].message = "a man is WORRIED about money!"; // 15/30 = 50%, case/punctuation never make a copy "different"
  t("borderline: one message on 15/30 (50%, case/punctuation ignored) -> trips", EI.checkBlind(b).some((x) => /15\/30/.test(x)), JSON.stringify(EI.checkBlind(b))); }
{ const b = templBlind().map((d, k) => ({ ...d, message: `${MEAN[k % 10]} ${k}` }));
  t("one 'sees' template alone (on-screen words pasted in) -> trips", EI.checkBlind(b).some((x) => /"sees" follow one template/.test(x)), JSON.stringify(EI.checkBlind(b))); }
{ const b = honestBlind(); for (let k = 0; k < 15; k++) b[k].message = k % 2 ? "" : "N/A";
  t("empty / boilerplate message on 15/30 -> trips", EI.checkBlind(b).some((x) => /empty or boilerplate "message"/.test(x)), JSON.stringify(EI.checkBlind(b)));
  const c = honestBlind(); for (let k = 0; k < 10; k++) delete c[k].sees; // die-with-zero run3: an older describer omitted sees on 10/30
  t("an older blind without 'sees' on 10/30 -> OK", EI.checkBlind(c).length === 0, JSON.stringify(EI.checkBlind(c))); }
t("fewer than 10 entries are never judged (n too small)", EI.checkBlind(templBlind().slice(0, 9)).length === 0);
t("templateOf strips quoted / ALL-CAPS on-screen words", EI.templateOf("A man and the words 'IS THE PERMANENT' on a wall") === EI.templateOf("A man and the words \"MEAN YOU RISK\" on a wall"));

// ── (b) judge ────────────────────────────────────────────────────────────────
r = EI.checkReasons(templJudge());
t("templated judge (one why + one verdict on 30/30) -> blocks (why and whyC)", r.reasons.length === 2, JSON.stringify(r));
{ const j = honestJudge().map((it) => ({ ...it, V: { ...it.V, why: "The image supports the narration well." } }));
  const rr = EI.checkReasons(j);
  t("stock why on 30/30 but verdicts vary (the-new-one-minute-manager / threshing-day shape) -> signal, not a block", !rr.reasons.length && rr.signals.some((x) => /stock phrase/.test(x)), JSON.stringify(rr)); }
{ const j = templJudge(); for (let k = 0; k < 4; k++) j[k].V = { ...j[k].V, correctness: "NEUTRAL", why: `different ${k}`, whyC: `other ${k}` }; // 26/30 = 87%
  t("borderline: one why+verdict on 26/30 (87%) -> no block", !EI.checkReasons(j).reasons.length, JSON.stringify(EI.checkReasons(j)));
  j[3].V = templJudge()[3].V; // 27/30 = 90%
  t("borderline: one why+verdict on 27/30 (90%) -> blocks", EI.checkReasons(j).reasons.length >= 1, JSON.stringify(EI.checkReasons(j))); }
{ const j = honestJudge().map((it) => ({ ...it, V: { correctness: it.V.correctness, why: it.V.why, contribution: it.V.contribution } }));
  t("an old judge without whyC is not 'one template'", EI.checkReasons(j).reasons.length === 0 && EI.checkReasons(j).signals.length === 0); }
{ const j = Array.from({ length: N }, (_, k) => ({ id: `item-${k}`, X: { correctness: "CORRECT", why: "same", contribution: "ADDS", whyC: `c${k}` }, Y: { correctness: "CORRECT", why: "same", contribution: "ECHOES", whyC: `d${k}` } }));
  t("--vs items (X and Y) are read too", EI.checkReasons(j).reasons.some((x) => /"why"/.test(x))); }

// ── (c) timing: a signal only ────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-integrity-"));
try {
  const D = path.join(tmp, "run");
  W(path.join(D, "blind.json"), honestBlind()); W(path.join(D, "judge-input.json"), []); W(path.join(D, "judge-result.json"), { items: honestJudge() });
  const base = Date.now() / 1000 - 3600;
  at(path.join(D, "judge-input.json"), base); at(path.join(D, "judge-result.json"), base + 8);
  r = EI.checkMuteDir(D);
  t("timing alone (judge 8 s after its input, honest content) -> OK with a signal, never a block", r.ok && r.signals.some((x) => /written 8 s after/.test(x)), JSON.stringify(r));
  at(path.join(D, "judge-result.json"), base + 1);
  t("files copied together (1 s apart) carry no timing information -> no signal", EI.checkMuteDir(D).signals.length === 0, JSON.stringify(EI.checkMuteDir(D)));
  at(path.join(D, "judge-result.json"), base + 300);
  t("a judge 300 s after its input -> no signal", EI.checkMuteDir(D).signals.length === 0);
  W(path.join(D, "blind.json"), templBlind()); W(path.join(D, "judge-result.json"), { items: templJudge() });
  at(path.join(D, "judge-input.json"), base); at(path.join(D, "judge-result.json"), base + 16);
  r = EI.checkMuteDir(D);
  t("templated run + 16 s judge -> EVIDENCE_INVALID, the timing listed as a signal beside the reasons", !r.ok && r.reasons.some((x) => /^signal — judge: 30 items written 16 s/.test(x)), JSON.stringify(r.reasons));

  // ── runEvidence: the files decide, the record is the fallback ──────────────
  const R0 = path.join(tmp, "root");
  W(path.join(R0, "audit", "mute", "zz", "final", "blind.json"), templBlind()); W(path.join(R0, "audit", "mute", "zz", "final", "judge-result.json"), { items: templJudge() });
  t("runEvidence: a run tallied before this check (no field) is checked from its files", !EI.runEvidence({ root: R0, slug: "zz", run: { label: "final", totals: {} } }).ok);
  t("runEvidence: no files -> the recorded evidence decides", !EI.runEvidence({ root: R0, slug: "zz", run: { label: "gone", evidence: { status: "EVIDENCE_INVALID", reasons: ["x"] } } }).ok
    && EI.runEvidence({ root: R0, slug: "zz", run: { label: "gone" } }).ok);

  // ── (d) readcheck ───────────────────────────────────────────────────────────
  const rcDir = (name, guesses, verdicts) => {
    const d = path.join(tmp, name); const n = guesses.length;
    W(path.join(d, "key.json"), Object.fromEntries(guesses.map((g, k) => [g.id, k])));
    W(path.join(d, "visible-1.json"), guesses.map((g, k) => ({ id: g.id, words: caps(k) })));
    W(path.join(d, "guess-1.json"), guesses); W(path.join(d, "judge-1.json"), []); W(path.join(d, "verdict-1.json"), verdicts);
    return d; };
  const ids = Array.from({ length: 40 }, (_, k) => `b${String(k + 1).padStart(3, "0")}`);
  const hG = ids.map((id, k) => ({ id, guess: `${WHO[k % 10]} ${DO[(k * 7) % 10]}; about ${MEAN[(k * 3) % 10]}` }));
  const tG = ids.map((id, k) => ({ id, guess: `The narrator explains investment principles and market cycle dynamics regarding ${caps(k)}.` }));
  const hV = ids.map((id, k) => ({ id, correctness: VERD(k), blame: "icon", why: VERD(k) === "CORRECT" ? "guess carries the narration meaning" : `misses ${MEAN[k % 10]}` }));
  const tV = ids.map((id) => ({ id, correctness: "CORRECT", blame: "nothing-fits", why: "The on-screen elements accurately convey the thematic meaning of the narration." }));
  r = EI.checkReadcheckDir(rcDir("rc-templ", tG, tV));
  t("templated readcheck (one guess shape + one verdict/why on every beat) -> EVIDENCE_INVALID", !r.ok && r.reasons.some((x) => /readers: 40\/40/.test(x)) && r.reasons.some((x) => /no verdict varies/.test(x)), JSON.stringify(r.reasons));
  r = EI.checkReadcheckDir(rcDir("rc-honest", hG, hV));
  t("honest readcheck (stock reason on the CORRECT beats, varied verdicts) -> OK", r.ok, JSON.stringify(r.reasons));
  r = EI.checkReadcheckDir(rcDir("rc-allok", hG, ids.map((id, k) => ({ id, correctness: "CORRECT", blame: "nothing-fits", why: `reads ${MEAN[k % 10]} ${k}` }))));
  t("every beat CORRECT with its own reason -> OK (zero variation alone is not a template)", r.ok, JSON.stringify(r.reasons));
  const hG2 = hG.map((g, k) => (k < 19 ? { ...g, guess: `A man thinking about ${caps(k)}` } : g)); // 19/40 = 48%
  t("borderline readcheck: one guess template on 19/40 (48%) -> OK", EI.checkReadcheckDir(rcDir("rc-b1", hG2, hV)).ok);
  const hG3 = hG.map((g, k) => (k < 20 ? { ...g, guess: `A man thinking about ${caps(k)}` } : g)); // 20/40 = 50%
  t("borderline readcheck: one guess template on 20/40 (50%) -> trips", !EI.checkReadcheckDir(rcDir("rc-b2", hG3, hV)).ok);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ── wiring: the real readcheck.js tally on a fixture (--root) ─────────────────
{
  const T2 = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-rc-"));
  const SLUG = "zz-ei-rc", B = path.join(T2, "books", SLUG), RC = path.join(B, "storyboard", "readcheck");
  const rc = (cmd) => spawnSync(process.execPath, [path.join(__dirname, "readcheck.js"), cmd, `--slug=${SLUG}`, `--root=${T2}`], { encoding: "utf8" });
  try {
    const ids = Array.from({ length: 20 }, (_, k) => `b${String(k + 1).padStart(3, "0")}`);
    W(path.join(B, "art.json"), { beats: ids.map((_, i) => ({ i, narration: `n${i}`, concept: null, callout: null })) });
    W(path.join(RC, "key.json"), Object.fromEntries(ids.map((id, i) => [id, i])));
    W(path.join(RC, "visible-1.json"), ids.map((id, k) => ({ id, words: caps(k) })));
    W(path.join(RC, "judge-1.json"), []);
    W(path.join(RC, "guess-1.json"), ids.map((id, k) => ({ id, guess: `The narrator explains investment principles regarding ${caps(k)}.` })));
    W(path.join(RC, "verdict-1.json"), ids.map((id) => ({ id, correctness: "CORRECT", blame: "nothing-fits", why: "The on-screen elements convey the meaning." })));
    let x = rc("tally");
    const rec = JSON.parse(fs.readFileSync(path.join(B, "readcheck.json"), "utf8"));
    t("readcheck.js tally on templated readings -> EVIDENCE_INVALID line, exit 3, readcheck.json evidence.status", x.status === 3 && /EVIDENCE_INVALID — not PASS, not FAIL/.test(x.stdout) && rec.evidence && rec.evidence.status === "EVIDENCE_INVALID" && rec.totals.CORRECT === 20, x.stdout + x.stderr);
    W(path.join(RC, "guess-1.json"), ids.map((id, k) => ({ id, guess: `${WHO[k % 10]} ${DO[(k * 3) % 10]} ${WHERE[k % 6]}` })));
    W(path.join(RC, "verdict-1.json"), ids.map((id, k) => ({ id, correctness: VERD(k), blame: "icon", why: `reason ${MEAN[k % 10]} ${k}` })));
    x = rc("tally");
    const rec2 = JSON.parse(fs.readFileSync(path.join(B, "readcheck.json"), "utf8"));
    t("readcheck.js tally on honest readings -> the normal tally, exit 0, no EVIDENCE_INVALID", x.status === 0 && /readcheck: 20 beats · CORRECT/.test(x.stdout) && !(rec2.evidence && rec2.evidence.status === "EVIDENCE_INVALID"), x.stdout + x.stderr);
  } finally { fs.rmSync(T2, { recursive: true, force: true }); }
}

// ── wiring: the real mute-test.js tally on a fixture book (in this tree; removed after; ledger restored) ─────────────
{
  const ROOT = path.join(__dirname, "..");
  const SLUG = `zz-evidence-integrity-${process.pid}`;
  const BOOK = path.join(ROOT, "books", SLUG), MD = path.join(ROOT, "audit", "mute", SLUG);
  const LEDGER = path.join(ROOT, "data", "engine-outcomes.json");
  const ledgerBefore = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER) : null;
  const env = { ...process.env, PRODUCTION_GUARD: "off" };
  const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, "mute-test.js"), ...a, `--slug=${SLUG}`], { cwd: ROOT, encoding: "utf8", env });
  const scenes = Array.from({ length: 40 }, (_, k) => ({ id: `scene-${String(k + 1).padStart(2, "0")}`, fromFrame: k * 90, durationFrames: 90 }));
  const label = (L, blind, items) => {
    const D = path.join(MD, L);
    W(path.join(D, "sample-meta.json"), { framesFrom: null, seed: 1, repeatedUnits: 0 });
    W(path.join(D, "judge-key.json"), Object.fromEntries(items.map((it, k) => [it.id, { frame: k * 90 + 10 }])));
    W(path.join(D, "judge-input.json"), items.map((it, k) => ({ id: it.id, t: `${k * 3}s` })));
    W(path.join(D, "blind.json"), blind); W(path.join(D, "judge-result.json"), { items });
  };
  try {
    W(path.join(BOOK, "config.antidote.json"), { meta: { fps: 30, audio: "audio/x.m4a" }, scenes, captions: [{ startFrame: 0, endFrame: 3600, text: "narration" }] });
    W(path.join(BOOK, "book.json"), { slug: SLUG, engine: "antidote" });
    label("templ", templBlind(), templJudge());
    let x = run("tally", "--label=templ");
    const tot = JSON.parse(fs.readFileSync(path.join(MD, "templ", "totals.json"), "utf8"));
    const hist = JSON.parse(fs.readFileSync(path.join(BOOK, "mute-test.json"), "utf8"));
    t("mute-test.js tally on a templated run -> EVIDENCE_INVALID (not PASS, not FAIL), exit 3", x.status === 3 && /EVIDENCE_INVALID — not PASS, not FAIL/.test(x.stdout) && !/→ PASS|→ FAIL/.test(x.stdout), x.stdout + x.stderr);
    t("…recorded: totals kept, pass false, verdict false, evidence.status + reasons", tot.totals.CORRECT === 30 && tot.pass === false && tot.verdict === false && tot.evidence.status === "EVIDENCE_INVALID" && tot.evidence.reasons.length >= 3 && hist.runs[0].evidence.status === "EVIDENCE_INVALID", JSON.stringify(tot).slice(0, 400));
    const ledgerNow = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : { runs: [] };
    t("…no engine-outcomes row for a run that measured nothing", !ledgerNow.runs.some((y) => y.slug === SLUG), "ledger has a row");
    t("…the record readers see it: runEvidence on the tallied run is not ok", !EI.runEvidence({ root: ROOT, slug: SLUG, run: hist.runs[0] }).ok);
    label("honest", honestBlind(), honestJudge());
    x = run("tally", "--label=honest");
    t("mute-test.js tally on an honest run -> the normal PASS/FAIL line, exit 0", x.status === 0 && /→ (PASS|FAIL)/.test(x.stdout) && !/EVIDENCE_INVALID/.test(x.stdout), x.stdout + x.stderr);
  } finally {
    fs.rmSync(BOOK, { recursive: true, force: true }); fs.rmSync(MD, { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, "audit", "cause-ledger", SLUG), { recursive: true, force: true }); // a FAIL tally runs cause-ledger
    try { fs.rmdirSync(path.join(ROOT, "audit", "cause-ledger")); } catch { /* not empty / not there: leave it */ }
    if (ledgerBefore) fs.writeFileSync(LEDGER, ledgerBefore);
  }
}

// ── the real case, when its pinned worktree is on disk (read-only) ───────────
{
  const W8 = path.resolve(__dirname, "..", "..", "wt-book-the-most-important-thing");
  const D = path.join(W8, "audit", "mute", "the-most-important-thing", "final");
  if (fs.existsSync(path.join(D, "blind.json"))) {
    t("REAL: the-most-important-thing final (fabricated 2026-10-31) -> EVIDENCE_INVALID", !EI.checkMuteDir(D).ok);
    t("REAL: the-most-important-thing readcheck (fabricated) -> EVIDENCE_INVALID", !EI.readcheckEvidence(path.join(W8, "books", "the-most-important-thing")).ok);
  } else console.log("skip  REAL the-most-important-thing (its worktree is not on disk)");
}

console.log(`\n${failed ? "❌" : "✓"} test-evidence-integrity: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
