#!/usr/bin/env node
// The official mute-test rubric text is pinned (cycle 7, 2026-11-02): scripts/lib/mute-rubric.js holds it for both
// mute-test.js and the cloud rater (visual-ab.js --rubric=official). A wording change is an operator decision.
// Run: node scripts/test-mute-rubric.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const R = require("./lib/mute-rubric");
let failed = 0;
const t = (name, ok, info) => { console.log((ok ? "✓ " : "✗ ") + name + (!ok && info ? "  (" + info + ")" : "")); if (!ok) failed++; };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
t("JUDGE_RULES unchanged (sha256 pinned)", sha(R.JUDGE_RULES) === "b996b0085b791d049d4edf51bf0807fc80ded6d407ca83605fcc844d5e7e70d6", sha(R.JUDGE_RULES));
t("DESCRIBER_FIELDS unchanged (sha256 pinned)", sha(R.DESCRIBER_FIELDS) === "86b11641592e2081fc4893d7ea677b047404fdcb79d8f0782b0190361c5b17d2", sha(R.DESCRIBER_FIELDS));
const mt = fs.readFileSync(path.join(__dirname, "mute-test.js"), "utf8");
t("mute-test.js reads the judge rules from the shared file", mt.includes('const { JUDGE_RULES } = require("./lib/mute-rubric")') && !mt.includes("const JUDGE_RULES = " + String.fromCharCode(96)));
t("mute-test.js reads the describer fields from the shared file", mt.includes('require("./lib/mute-rubric").DESCRIBER_FIELDS'));
const one = R.describerOne(), j = R.judgeOne("the narration", { sees: "s", message: "m", wouldConfuse: "none", text: "x" });
t("the one-image describer asks for the official fields", one.includes("wouldConfuse") && one.includes("confidence") && one.includes("For this image, write:"));
t("the one-item judge carries the official rules verbatim and sees only sees/message/wouldConfuse", j.includes(R.JUDGE_RULES) && !j.includes("\"text\":\"x\""));
console.log(failed ? "\n" + failed + " FAILED" : "\nall mute-rubric checks passed");
process.exit(failed ? 1 : 0);
