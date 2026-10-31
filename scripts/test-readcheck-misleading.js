#!/usr/bin/env node
// readcheck "misleading" notes (2026-10-23, lib/readcheck-misleading.js) — an OPTIONAL DIAGNOSTIC only.
// `readcheck.js tally` and readcheck.json stay exactly as before (no notes, no ranking); `readcheck.js misleading`
// prints the readers' own notes beside the verdicts in beat order and writes only audit/readcheck-misleading/.
// Runs the REAL readcheck.js on a fixture (--root=<temp>).
// Run: node scripts/test-readcheck-misleading.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const { elementOf, readHints, misleadingReport } = require("./lib/readcheck-misleading");

// ── (A) classifier ───────────────────────────────────────────────────────────
t("'none' / empty is no note", elementOf("none") === null && elementOf("") === null && elementOf("None.") === null);
t("an icon noun -> icon", elementOf("tank icon suggests literal warfare") === "icon" && elementOf("trophy suggests an actual award") === "icon");
t("crossed-out words -> words (not the 'cross' icon)", elementOf("the crossed out text reads as agreement") === "words");
t("something absent -> missing", elementOf("no clock shown") === "missing" && elementOf("no visual for decisions") === "missing");
t("a face -> face", elementOf("the smile reads as joy") === "face");
t("'career' is not the 'car' icon", elementOf("career path unclear") !== "icon");

// ── (B) the real readcheck.js on a fixture ───────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rc-misleading-"));
const SLUG = "zz-rc";
const B = path.join(tmp, "books", SLUG), RC = path.join(B, "storyboard", "readcheck");
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
const rc = (cmd) => spawnSync(process.execPath, [path.join(__dirname, "readcheck.js"), cmd, `--slug=${SLUG}`, `--root=${tmp}`], { encoding: "utf8" });
try {
  W(path.join(B, "art.json"), { beats: [0, 1, 2, 3, 4].map((i) => ({ i, narration: `n${i}`, concept: i === 1 ? "war" : null, callout: null })) });
  W(path.join(RC, "key.json"), { b001: 0, b002: 1, b003: 2, b004: 3, b005: 4 });
  const verdicts = [
    { id: "b001", correctness: "CORRECT", blame: "nothing-fits", why: "ok" },
    { id: "b002", correctness: "WRONG", blame: "icon", why: "tank = war" },
    { id: "b003", correctness: "NEUTRAL", blame: "face", why: "vague" },
    { id: "b004", correctness: "CORRECT", blame: "nothing-fits", why: "ok" },
    { id: "b005", correctness: "NEUTRAL", blame: "words", why: "vague" },
  ];
  W(path.join(RC, "verdict-1.json"), verdicts);
  W(path.join(RC, "guess-1.json"), verdicts.map((v) => ({ id: v.id, guess: "g", misleading: "none" })));
  let r = rc("tally");
  const base = fs.readFileSync(path.join(B, "readcheck.json"), "utf8"), baseOut = r.stdout;
  t("tally runs on --root", r.status === 0 && JSON.parse(base).n === 5, r.stderr);
  W(path.join(RC, "guess-1.json"), [
    { id: "b001", guess: "g", misleading: "the coin icon could mean money" },   // CORRECT + flagged = false positive
    { id: "b002", guess: "g", misleading: "tank icon suggests literal warfare" },
    { id: "b003", guess: "g", misleading: "the smile reads as joy" },
    { id: "b004", guess: "g", misleading: "none" },
    { id: "b005", guess: "g", misleading: "no clock shown" },
  ]);
  r = rc("tally");
  const withNotes = fs.readFileSync(path.join(B, "readcheck.json"), "utf8");
  const strip = (j) => { const o = JSON.parse(j); delete o.date; return JSON.stringify(o); };
  t("DEFAULT tally: readcheck.json identical with and without notes (no misleading section)", strip(base) === strip(withNotes) && !("misleading" in JSON.parse(withNotes)));
  t("DEFAULT tally: console output identical — no notes, no ranking", r.stdout === baseOut && !/misleading|review priority/i.test(r.stdout), r.stdout);
  // the optional diagnostic
  const before = fs.readFileSync(path.join(B, "readcheck.json"), "utf8");
  r = rc("misleading");
  const files = fs.readdirSync(path.join(tmp, "audit", "readcheck-misleading", SLUG));
  const M = JSON.parse(fs.readFileSync(path.join(tmp, "audit", "readcheck-misleading", SLUG, files[0]), "utf8"));
  t("`misleading` writes only audit/readcheck-misleading/<slug>/ and leaves readcheck.json untouched", r.status === 0 && files.length === 1 && fs.readFileSync(path.join(B, "readcheck.json"), "utf8") === before, r.stderr);
  t("it says DIAGNOSTIC ONLY, not a verdict, not a ranking, high false-positive rate", M.diagnosticOnly === true && /DIAGNOSTIC, not a verdict and not a risk ranking/.test(M.note) && /false-positive/.test(M.note) && /DIAGNOSTIC ONLY/.test(r.stdout));
  t("counts: flagged 4 — CORRECT 1, NEUTRAL 2, WRONG 1; WRONG caught 1/1; false-positive rate 0.25", M.flagged === 4 && M.byVerdict.CORRECT === 1 && M.byVerdict.NEUTRAL === 2 && M.byVerdict.WRONG === 1 && M.wrongCaught === "1/1" && M.falsePositiveRate === 0.25, JSON.stringify(M));
  t("beats listed in BEAT ORDER (no risk ranking), WRONG included", M.beats.map((x) => x.i).join() === "0,1,2,4", JSON.stringify(M.beats));
  // a re-check replaces its beat's note (newest wins, like the verdicts)
  W(path.join(RC, "recheck-1", "key.json"), { b001: 2 });
  W(path.join(RC, "recheck-1", "guess-1.json"), [{ id: "b001", guess: "g", misleading: "none" }]);
  W(path.join(RC, "recheck-1", "verdict-1.json"), [{ id: "b001", correctness: "CORRECT", blame: "nothing-fits", why: "fixed" }]);
  const hints = readHints([RC, path.join(RC, "recheck-1")]);
  t("readHints: newest per beat (re-check wins)", hints.size === 5 && hints.get(2).from === "recheck-1" && hints.get(2).element === null);
  t("misleadingReport on an empty readcheck is safe", misleadingReport(new Map(), new Map()).flagged === 0);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall readcheck-misleading checks passed");
process.exit(failed ? 1 : 0);
