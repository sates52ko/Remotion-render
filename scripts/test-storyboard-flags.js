// Regression for the storyboard.js flags: default behaviour must not change.
//  - without --root the book root is the repository root (production unchanged)
//  - without --beats-from-art the VTT is still required and plan-antidote still produces beats
//  - the art.json beat source refuses empty narration instead of falling back to callouts
// Run: node scripts/test-storyboard-flags.js
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8").replace(/\r\n/g, "\n");
let failed = 0;
const t = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; };

t("default ROOT is the repository root when --root is absent",
  /: path\.join\(__dirname, "\.\."\);/.test(src) && /process\.argv\.slice\(3\)\.some\(\(a\) => a\.startsWith\("--root="\)\)/.test(src));
t("ART_BEATS is off unless --beats-from-art is passed",
  /const ART_BEATS = !!args\["beats-from-art"\];/.test(src));
t("VTT is required only when beats come from the VTT",
  /if \(!ART_BEATS && !fs\.existsSync\(vtt\)\)/.test(src));
t("VTT engine cross-check is guarded by !ART_BEATS",
  /if \(!ART_BEATS\) \{\n  const \{ analyzeEngineFromVtt \}/.test(src));
t("plan-antidote still runs on the default path",
  /\} else \{\n    execFileSync\(process\.execPath, \[script, \.\.\.common, \.\.\.extra\]/.test(src));
t("artBeats refuses missing narration (no callout fallback)",
  /no authoritative narration in art\.json/.test(src) && !/callout/.test(src.slice(src.indexOf("function artBeats"), src.indexOf("function prep"))));
t("policy record names the beat source",
  /beatSource: ART_BEATS \? "art\.json \(--beats-from-art\)" : "plan-antidote \(VTT\)"/.test(src));
t("git SHA is read from the code repository, not the book root",
  /execFileSync\("git", \["rev-parse", "HEAD"\], \{ cwd: path\.join\(__dirname, "\.\."\)/.test(src));

console.log(failed ? `\n${failed} FAILED` : "\nall storyboard-flag checks passed");
process.exit(failed ? 1 : 0);
