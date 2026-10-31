#!/usr/bin/env node
// P3 PUSH / FALL authoring (2026-10-29): falling / collapsed exist; the defects were the author's CHOICE, both ways:
//  - a literal fall staged standing (wonder 30 "fainted, out cold on the floor", fahrenheit-451 250 "thrown to the
//    earth", under-the-dome 26 "pushed violently to the floor" — slump / idle);
//  - a figurative fall staged as a fall (create-space 213 "psychological collapse", red-rising 178 "the truth is a
//    freefall", confidence-gap 277 "the donkey will collapse").
// Authoring A/B (fresh sonnet authors, 3 per arm, real beats): literal falls 15/15 with both texts; figurative falls
// never seen while tuning: old text 5/12 kept standing, new text 12/12. So: the routing row draws the line by a camera
// test; the blind text reader sees the DRAWN body (not the word "slump"); a narrow REVIEW signal points at the rest.
// Run: node scripts/test-body-event.js
const fs = require("fs");
const path = require("path");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const { integrityReview } = require("./lib/authoring-integrity.js");
const flagged = (narration, action, cast = ["mara"]) => integrityReview({ beats: [{ i: 1, narration }], authored: new Map([[1, { i: 1, cast, action, storyboard: {} }]]), engine: "antidote", prev: null }).some((x) => x.code === "BODY_EVENT_STANDING");

// real literal falls staged standing -> REVIEW
t("fahrenheit-451 250: 'Montag is thrown to the earth' staged slump -> flagged", flagged("Meanwhile, out in the country, Montag is thrown to the earth by the concussion of the blast.", "slump"));
t("wonder 30: 'the doctor has fainted. Out cold on the floor.' staged slump -> flagged", flagged("And then they realize the doctor has fainted. Out cold on the floor.", "slump"));
t("under-the-dome 26: 'an old man is pushed violently to the floor' staged idle -> flagged", flagged("He laughs this choppy, cruel laugh as an old man is pushed violently to the floor.", "idle"));
// the same beats staged as the event -> nothing
t("the same fall staged falling / collapsed -> not flagged", !flagged("Montag is thrown to the earth by the blast.", "falling") && !flagged("the doctor has fainted. Out cold on the floor.", "collapsed"));
// correct slump and figurative falls -> nothing
t("the-art-of-saying-no 21: 'your shoulders just slump' (slump is right) -> not flagged", !flagged("You hit send and immediately your shoulders just slump.", "slump"));
t("15-secrets 175: 'falls into a deep depression' -> not flagged", !flagged("loses their job, and falls into a deep depression, they are going to be negative.", "slump"));
t("island 64: 'trips over his words' -> not flagged", !flagged("He has a severe stutter. He trips over his words, constantly anxious.", "slump"));
t("nobody on screen (cast []) -> not flagged (nothing staged to contradict)", !flagged("the doctor has fainted. Out cold on the floor.", "slump", []));
t("Vox books: no body signal (no rig)", integrityReview({ beats: [{ i: 1, narration: "the doctor has fainted" }], authored: new Map([[1, { i: 1, design: { type: "imagefocus", storyboard: {} } }]]), engine: "vox", prev: null }).every((x) => x.code !== "BODY_EVENT_STANDING"));

// the routing row draws the line with a camera test, and says what slump is
const SB = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
t("rules: a body-event row — literal = a camera filming the scene would show it", /a camera filming the scene would show it/.test(SB));
t("rules: not when — a fall caused by failure, grief, money or time (the measured over-correction)", /a fall a camera could NOT film: one caused by failure, grief, money or time/.test(SB) && /knocked off the mountain by failure/.test(SB));
// the measured reading of slump is shared data
const IR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "icon-readings.json"), "utf8"));
t("icon-readings: an 'action slump' row — a standing posture, never a fall", /STANDING person/.test(IR.staging["action slump"] || "") && /never a fall/.test(IR.staging["action slump"] || ""));
// the blind text reader sees the drawn body
const RC = fs.readFileSync(path.join(__dirname, "readcheck.js"), "utf8");
t("readcheck: slump / falling / collapsed are shown as drawn, not by name", /slump: "standing on their feet/.test(RC) && /collapsed: "lying flat on the floor/.test(RC) && /p\.body = bodyOf\(b\.action\)/.test(RC));
console.log(failed ? `\n${failed} FAILED` : "\nall body-event checks passed");
process.exit(failed ? 1 : 0);
