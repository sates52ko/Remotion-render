#!/usr/bin/env node
// READCHECK EVIDENCE BINDING (cycle 10, 2026-11-04; mirrors test-judge-binding.js). The readcheck tally counts a folder
// only when its guess/verdict ids are exactly its visible ids (none missing / extra / twice) — else EVIDENCE_INVALID
// (exit 3, not PASS, not FAIL; bars untouched; never a crash). A token run's verdicts must echo the judge run; a legacy
// folder keeps its old reading for the token / rubric-word rules (signals). A tallied folder is frozen: re-tally only on
// byte-identical evidence, judge refused; a full prep moves the old run to readcheck-history/, never deletes it. Old
// readcheck.json records (no `binding` field) are read by the gates exactly as before.
// Unit (pure checkFolder) + the real readcheck.js prep / judge / tally on a fixture book in a temp dir (--root).
// Run: node scripts/test-readcheck-integrity.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const RB = require("./lib/readcheck-binding");
const EI = require("./lib/evidence-integrity");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info !== undefined ? `  (${String(typeof info === "string" ? info : JSON.stringify(info)).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 1)); };
const R = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const N = 20;
const ids = Array.from({ length: N }, (_, k) => `b${String(k + 1).padStart(3, "0")}`);
const WHO = ["a woman", "an old man", "two kids", "a clerk", "a soldier", "a nurse", "a farmer", "a boy", "a couple", "a teacher"];
const DO = ["holding a lantern", "staring at a ledger", "running down a road", "sitting by a bed", "pointing at a chart", "hugging", "arguing at a desk", "planting a tree", "reading a letter", "climbing stairs"];
const VERD = (k) => (k % 5 === 0 ? "WRONG" : k % 4 === 0 ? "NEUTRAL" : "CORRECT");
const guesses = (list = ids) => list.map((id, k) => ({ id, guess: `${WHO[k % 10]} ${DO[(k * 3) % 10]} (${k})`, misleading: "none" }));
const verdicts = (list = ids) => list.map((id, k) => ({ id, correctness: VERD(k), blame: "icon", why: `reason ${DO[k % 10]} ${k}` }));

// ── unit: checkFolder (pure) ─────────────────────────────────────────────────
{
  const folder = (o = {}) => ({ key: Object.fromEntries(ids.map((id, i) => [id, i])), prepRun: null, judgeRun: null,
    chunks: [{ k: "1", visible: ids.map((id) => ({ id })), guess: guesses(), judge: null, verdict: verdicts() }], ...o });
  const withChunk = (c) => folder({ chunks: [{ ...folder().chunks[0], ...c }] });
  let r = RB.checkFolder(folder());
  t("legacy folder, complete id set -> ok (legacy, signal only)", r.ok && r.legacy && r.counted.size === N && r.signals.some((s) => /^LEGACY/.test(s)), r);
  r = RB.checkFolder(withChunk({ verdict: verdicts().slice(0, N - 3) }));
  t("short verdict file -> INVALID (missing), never a smaller n", !r.ok && r.reasons.some((x) => /missing 3 of 20/.test(x)), r.reasons);
  r = RB.checkFolder(withChunk({ verdict: [...verdicts(), { ...verdicts()[0], correctness: "CORRECT" }] }));
  t("duplicated verdict id -> INVALID (more than once); first answer counted", !r.ok && r.reasons.some((x) => /more than once/.test(x)) && r.counted.get("b001").correctness === "WRONG", r.reasons);
  r = RB.checkFolder(withChunk({ verdict: [...verdicts(), { id: "b999", correctness: "CORRECT" }] }));
  t("unknown verdict id -> INVALID (extra), not crash", !r.ok && r.reasons.some((x) => /never showed/.test(x)) && !r.counted.has("b999"), r.reasons);
  r = RB.checkFolder(withChunk({ verdict: null }));
  t("verdict file missing -> INVALID", !r.ok && r.reasons.some((x) => /verdict-1\.json missing/.test(x)), r.reasons);
  r = RB.checkFolder(withChunk({ guess: guesses().slice(1) }));
  t("short guess file -> INVALID (a judge judged '(no guess)')", !r.ok && r.reasons.some((x) => /guess-1\.json is missing 1/.test(x)), r.reasons);
  r = RB.checkFolder(folder({ key: Object.fromEntries(ids.slice(1).map((id, i) => [id, i])) }));
  t("key.json and visible files disagree -> INVALID", !r.ok && r.reasons.some((x) => /key\.json and the visible files/.test(x)), r.reasons);
  r = RB.checkFolder(withChunk({ verdict: verdicts().map((v, k) => (k === 2 ? { ...v, correctness: "MOSTLY" } : v)) }));
  t("legacy: a non-rubric word is a signal, not INVALID", r.ok && r.signals.some((s) => /LEGACY \(not counted\).*MOSTLY/.test(s)), r);
  r = RB.checkFolder({ key: null, chunks: [] });
  t("no key.json -> INVALID, no crash", !r.ok);
  // token runs
  const tok = (v, o = {}) => folder({ prepRun: { run: "P1" }, judgeRun: { run: "J1", prepRun: "P1", inputs: {} }, chunks: [{ ...folder().chunks[0], judge: ids.map((id) => ({ id })), verdict: v, ...o }] });
  r = RB.checkFolder(tok({ run: "J1", items: verdicts() }));
  t("token run, verdict echoes the run -> ok (BOUND)", r.ok && !r.legacy, r.reasons);
  r = RB.checkFolder(tok(verdicts()));
  t("token run, bare verdict list (no run echoed) -> INVALID", !r.ok && r.reasons.some((x) => /does not echo/.test(x)), r.reasons);
  r = RB.checkFolder(tok({ run: "J0", items: verdicts() }));
  t("token run, verdict of another judge run -> INVALID", !r.ok && r.reasons.some((x) => /not the answer to this judge run/.test(x)), r.reasons);
  r = RB.checkFolder(tok({ run: "J1", items: verdicts().map((v, k) => (k === 2 ? { ...v, correctness: "MOSTLY" } : v)) }));
  t("token run, non-rubric word -> INVALID", !r.ok && r.reasons.some((x) => /MOSTLY/.test(x)), r.reasons);
  r = RB.checkFolder({ ...tok({ run: "J1", items: verdicts() }), prepRun: { run: "P2" } });
  t("token run, folder prepared again after its judge run -> INVALID", !r.ok && r.reasons.some((x) => /prepared again/.test(x)), r.reasons);
}

// ── gates: an old record (no binding field) is read exactly as before ────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rc-int-gate-"));
  try {
    const B = path.join(tmp, "books", "zz-old");
    fs.mkdirSync(B, { recursive: true });
    t("old record without files and without binding -> OK (unchanged)", EI.readcheckEvidence(B, { n: 3, total: 3, totals: {} }).ok);
    // an old incomplete folder on disk (verdict missing) — the gate reading does not apply the new id-set rule
    const RC = path.join(B, "storyboard", "readcheck");
    W(path.join(RC, "key.json"), Object.fromEntries(ids.map((id, i) => [id, i])));
    W(path.join(RC, "visible-1.json"), ids.map((id) => ({ id })));
    W(path.join(RC, "guess-1.json"), guesses());
    W(path.join(RC, "verdict-1.json"), verdicts().slice(0, 10));
    t("old short folder on disk: gate evidence unchanged (OK), no retroactive flip", EI.readcheckEvidence(B, { n: 10, total: 20 }).ok);
    t("a new record with binding INVALID -> gate INVALID", !EI.readcheckEvidence(B, { binding: "INVALID", evidence: { status: "EVIDENCE_INVALID", reasons: ["x"] } }).ok);
    W(path.join(RC, "verdict-1.json"), { run: "J1", items: verdicts() });
    t("object-shaped verdict file is read by checkReadcheckDir (honest -> OK)", EI.checkReadcheckDir(RC).ok);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── wiring: the real readcheck.js on a fixture book (--root=<temp>) ──────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rc-int-"));
  const SLUG = "zz-rc-integrity", B = path.join(tmp, "books", SLUG), RC = path.join(B, "storyboard", "readcheck");
  const rc = (...a) => spawnSync(process.execPath, [path.join(__dirname, "readcheck.js"), ...a, `--slug=${SLUG}`, `--root=${tmp}`], { encoding: "utf8" });
  const out = (x) => (x.stdout || "") + (x.stderr || "");
  try {
    W(path.join(B, "art.json"), { beats: ids.map((_, i) => ({ i, narration: `narration ${i}`, concept: null, callout: null })) });
    W(path.join(B, "story-bible.json"), {});
    let x = rc("prep");
    t("prep writes run.json (run token)", x.status === 0 && !!R(path.join(RC, "run.json")).run, out(x));
    const prepRun = R(path.join(RC, "run.json")).run;
    W(path.join(RC, "guess-1.json"), guesses());
    x = rc("judge");
    const jr = R(path.join(RC, "judge-run.json"));
    t("judge writes judge-run.json bound to the prep run; prompt asks the run to be echoed", x.status === 0 && jr.run && jr.prepRun === prepRun && jr.inputs["1"] && fs.readFileSync(path.join(RC, "PROMPTS.md"), "utf8").includes(`{"run":"${jr.run}","items"`), out(x));
    // a bare list (the old shape) in a token run
    W(path.join(RC, "verdict-1.json"), verdicts());
    x = rc("tally");
    let rec = R(path.join(B, "readcheck.json"));
    t("tally: verdict does not echo the run -> EVIDENCE_INVALID, exit 3, binding INVALID", x.status === 3 && /EVIDENCE_INVALID/.test(x.stdout) && rec.binding === "INVALID" && !EI.readcheckEvidence(B, rec).ok, out(x));
    t("an INVALID tally freezes nothing (the judges can be re-run in place)", !rec.tallied, rec.tallied);
    // short verdict: id-set
    W(path.join(RC, "verdict-1.json"), { run: jr.run, items: verdicts().slice(0, N - 2) });
    x = rc("tally");
    rec = R(path.join(B, "readcheck.json"));
    t("tally: short verdict file -> EVIDENCE_INVALID exit 3 (not a smaller n PASS)", x.status === 3 && rec.binding === "INVALID" && /missing 2 of 20/.test(x.stdout), out(x));
    // duplicate
    W(path.join(RC, "verdict-1.json"), { run: jr.run, items: [...verdicts(), verdicts()[3]] });
    x = rc("tally");
    t("tally: duplicate verdict id -> EVIDENCE_INVALID exit 3", x.status === 3 && /more than once/.test(x.stdout), out(x));
    // honest
    W(path.join(RC, "verdict-1.json"), { run: jr.run, items: verdicts() });
    x = rc("tally");
    rec = R(path.join(B, "readcheck.json"));
    t("tally: exact id set + echoed run -> normal tally exit 0, binding BOUND, folder frozen", x.status === 0 && /readcheck: 20 beats/.test(x.stdout) && rec.binding === "BOUND" && rec.n === 20 && rec.tallied && rec.tallied.folders.readcheck && rec.tallied.baseRun === prepRun, out(x));
    x = rc("tally");
    t("re-tally on byte-identical evidence -> allowed (exit 0)", x.status === 0, out(x));
    x = rc("judge");
    t("judge on a tallied folder -> refused exit 3 (judge inputs are evidence)", x.status === 3 && /never written over/.test(out(x)), out(x));
    const before = fs.readFileSync(path.join(B, "readcheck.json"), "utf8");
    W(path.join(RC, "verdict-1.json"), { run: jr.run, items: verdicts().map((v) => ({ ...v, correctness: "CORRECT" })) });
    x = rc("tally");
    t("re-tally on changed evidence -> refused exit 3, readcheck.json untouched", x.status === 3 && /not overwritten/.test(out(x)) && fs.readFileSync(path.join(B, "readcheck.json"), "utf8") === before, out(x));
    W(path.join(RC, "verdict-1.json"), { run: jr.run, items: verdicts() }); // restore the tallied bytes
    // a re-check adds a folder; the full run stays frozen and untouched
    x = rc("prep", "--beats=3,4");
    t("prep --beats -> recheck-1 with its own run.json; the full run untouched", x.status === 0 && fs.existsSync(path.join(RC, "recheck-1", "run.json")) && fs.existsSync(path.join(RC, "verdict-1.json")), out(x));
    const R1 = path.join(RC, "recheck-1"), rids = Object.keys(R(path.join(R1, "key.json")));
    W(path.join(R1, "guess-1.json"), guesses(rids));
    x = rc("judge", "--recheck=1");
    const jr1 = R(path.join(R1, "judge-run.json"));
    W(path.join(R1, "verdict-1.json"), { run: jr1.run, items: rids.map((id) => ({ id, correctness: "CORRECT", blame: "nothing-fits", why: `fixed ${id}` })) });
    x = rc("tally");
    rec = R(path.join(B, "readcheck.json"));
    t("tally with a re-check -> exit 0, both folders frozen, newest verdict wins", x.status === 0 && rec.tallied.folders["recheck-1"] && rec.beats.every((b) => b.i !== 3 && b.i !== 4), out(x));
    // a full prep keeps the old run (and its re-checks) in readcheck-history/
    x = rc("prep");
    const H = path.join(B, "storyboard", "readcheck-history");
    const kept = fs.existsSync(H) ? fs.readdirSync(H) : [];
    t("full prep moves the previous run to readcheck-history/ (verdicts + re-checks kept, never deleted)", x.status === 0 && kept.length === 1 && fs.existsSync(path.join(H, kept[0], "verdict-1.json")) && fs.existsSync(path.join(H, kept[0], "recheck-1", "verdict-1.json")) && !fs.existsSync(path.join(RC, "verdict-1.json")), out(x));
    t("the new full run has a new run token; the old frozen record no longer applies", R(path.join(RC, "run.json")).run !== prepRun);
    W(path.join(RC, "guess-1.json"), guesses());
    x = rc("judge");
    t("judge on the NEW full run is allowed", x.status === 0, out(x));
    // legacy: a folder without run.json / judge-run.json keeps its old reading for token + rubric words
    for (const f of ["run.json", "judge-run.json"]) fs.rmSync(path.join(RC, f), { force: true });
    W(path.join(RC, "verdict-1.json"), verdicts().map((v, k) => (k === 1 ? { ...v, correctness: "MOSTLY" } : v)));
    fs.rmSync(path.join(B, "readcheck.json"), { force: true });
    x = rc("tally");
    rec = R(path.join(B, "readcheck.json"));
    t("legacy folder (no tokens): bare list + odd word -> tally as before (exit 0, binding LEGACY, signal reported)", x.status === 0 && rec.binding === "LEGACY" && /LEGACY \(not counted\)/.test(x.stdout), out(x));
    W(path.join(RC, "verdict-1.json"), verdicts().slice(0, 15));
    fs.rmSync(path.join(B, "readcheck.json"), { force: true });
    x = rc("tally");
    t("legacy folder: the id-set rule still applies (short verdict file -> EVIDENCE_INVALID exit 3)", x.status === 3 && R(path.join(B, "readcheck.json")).binding === "INVALID", out(x));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
