#!/usr/bin/env node
// SCORECARD (10x pilot A, 2026-10-26): a weighted decision that builds over continued beats (scorecard.ts state,
// continuity.ts carry.prev, schema.ts). Run: node scripts/test-scorecard.js
const { scorecardState, scorecardLabels, stageOf } = require("../src/engines/antidote/scorecard.ts");
const { diagramCarry } = require("../src/engines/antidote/continuity.ts");
const { diagramSchema } = require("../src/engines/antidote/schema.ts");

let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };
const N = { label: "Nature and weather", weight: 0.4, owner: "Steven" };
const F = { label: "Close friends", weight: 0.9, owner: "His wife" };
const O0 = [{ label: "Brooklyn", scores: [null, null] }, { label: "California", scores: [null, null] }];
const O1 = [{ label: "Brooklyn", scores: [3, 9] }, { label: "California", scores: [9, 0], scoreText: [null, "0"] }];
const B306 = { criteria: [N], show: "weights" };
const B307 = { criteria: [N, F], show: "weights" };
const B308 = { criteria: [N, F], options: O0, show: "options" };
const B309 = { criteria: [N, F], options: O1, show: "scores" };
const B310 = { criteria: [N, F], options: O1, show: "totals" };

let s = scorecardState(B306, null);
t("306: one criterion, nothing built yet, no options", s.criteria.length === 1 && !s.criteria[0].built && !s.showOptions);
s = scorecardState(B307, B306);
t("307 continued: the first criterion is built, the new one animates", s.criteria[0].built && !s.criteria[1].built);
t("307: the weights differ the way the narration says (0.9 > 2 x 0.4)", s.criteria[1].weight > 2 * s.criteria[0].weight);
s = scorecardState(B308, B307);
t("308: the two option columns appear (new), criteria built, no scores yet", s.showOptions && !s.showScores && s.options.every((o) => !o.built) && s.criteria.every((c) => c.built));
s = scorecardState(B309, B308);
t("309: options built, scores fill (new); California friends = 0 shown with its stated text", s.options.every((o) => o.built) && s.showScores && s.options[1].cells[1].score === 0 && s.options[1].cells[1].text === "0" && !s.options[1].cells[0].built);
t("309: no score is printed unless the narration states it", s.options[0].cells.every((c) => c.text === null) && s.options[1].cells[0].text === null);
s = scorecardState(B310, B309);
t("310: totals = Σ weight x score (Brooklyn 0.4*3+0.9*9 = 9.3; California 0.4*9+0.9*0 = 3.6)", Math.abs(s.options[0].total - 9.3) < 1e-9 && Math.abs(s.options[1].total - 3.6) < 1e-9 && s.showTotals && !s.totalsBuilt);
t("310: scores carried as built (only the multiplication and the totals animate)", s.options.every((o) => o.cells.every((c) => c.built)));
t("310: no winner is marked unless authored", s.winner === null);
t("a winner is marked only when the author names a valid option", scorecardState({ ...B310, winner: 1 }).winner === 1 && scorecardState({ ...B310, winner: 7 }).winner === null);
t("a stage reached on the previous beat stays built (totals carried)", scorecardState(B310, B310).totalsBuilt === true);
t("a changed score rebuilds only that cell", (() => { const st = scorecardState({ ...B309, options: [O1[0], { ...O1[1], scores: [8, 0] }] }, B309); return st.options[0].cells.every((c) => c.built) && !st.options[1].cells[0].built && st.options[1].cells[1].built; })());
t("a new (not continued) scorecard builds everything", (() => { const st = scorecardState(B310, null); return st.criteria.every((c) => !c.built) && st.options.every((o) => !o.built) && !st.totalsBuilt; })());
t("stage order: weights < options < scores < totals; default weights", stageOf({ criteria: [N] }) === 0 && stageOf(B308) === 1 && stageOf(B309) === 2 && stageOf(B310) === 3);
t("the on-screen words are the criteria, owners, options and stated scores (for merge's label checks)", JSON.stringify(scorecardLabels(B309)) === JSON.stringify(["Nature and weather", "Close friends", "Steven", "His wife", "Brooklyn", "California", "0"]));
// continuity hands the previous diagram over; older archetypes ignore it
const c = diagramCarry({ type: "scorecard", labels: [], scorecard: B309 }, { type: "scorecard", labels: [], scorecard: B310 }, 0, 100);
t("continuity: a continued scorecard's carry holds the previous diagram", !!c && c.prev && c.prev.scorecard === B309);
t("continuity: a different type is a new diagram (no carry)", diagramCarry({ type: "sorter", labels: ["a"] }, { type: "scorecard", labels: [] }) === null);
// schema: backward compatible
t("schema: an old diagram without `scorecard` parses unchanged", (() => { const d = diagramSchema.parse({ type: "flow", labels: ["A", "B"] }); return d.type === "flow" && d.scorecard === undefined; })());
t("schema: a scorecard parses with its defaults", (() => { const d = diagramSchema.parse({ type: "scorecard", scorecard: { criteria: [N] } }); return d.scorecard.show === "weights" && Array.isArray(d.scorecard.options); })());
t("schema: an out-of-range weight / score is refused", !diagramSchema.safeParse({ type: "scorecard", scorecard: { criteria: [{ label: "x", weight: 2 }] } }).success && !diagramSchema.safeParse({ type: "scorecard", scorecard: { criteria: [N], options: [{ label: "y", scores: [11] }] } }).success);
// RESULT ACCURACY (2026-10-26): what the narration has not graded is unknown — never a zero, never a total, never a winner
const C309 = { criteria: [N, F], options: [{ label: "Brooklyn", scores: [null, null] }, { label: "California", scores: [9, 0], scoreText: [null, "0"] }], show: "scores" };
const C310 = { ...C309, show: "totals" };
let c9 = scorecardState(C309, B308);
t("an ungraded option is UNKNOWN at the scores stage (drawn '?'), a stated zero is a zero", c9.options[0].cells.every((x) => x.unknown && x.score === null) && !c9.options[1].cells[1].unknown && c9.options[1].cells[1].score === 0);
t("before the scores stage nothing is 'unknown' (just not shown yet)", scorecardState(B308).options.every((o) => o.cells.every((x) => !x.unknown)));
let c10 = scorecardState(C310, C309);
t("one ungraded option hides EVERY total (a lone total next to a ? still reads as a result)", c10.options[0].totalKnown === false && c10.options[1].totalKnown === false);
t("totals use a fixed scale — the best possible total (0.4*10 + 0.9*10 = 13) — so one known total never fills the row", Math.abs(c10.maxTotal - 13) < 1e-9 && c10.options[1].total / c10.maxTotal < 0.3);
t("no winner over an unknown total, even if authored", scorecardState({ ...C310, winner: 1 }).winner === null);
t("a winner the author names is marked only when every total is known", scorecardState({ ...B310, winner: 0 }).winner === 0);
// a weight NUMBER is printed only when the narration states it (weightText); otherwise the bar alone
t("no weightText: no weight number on screen", scorecardState(B306).criteria[0].weightText === null);
t("weightText (the narration's '×0.4') is printed and checked like any label", scorecardState({ criteria: [{ ...N, weightText: "×0.4" }] }).criteria[0].weightText === "×0.4" && scorecardLabels({ criteria: [{ ...N, weightText: "×0.4" }] }).includes("×0.4"));
// wiring: merge authors it, readcheck describes it
const fs = require("fs"), path = require("path");
const sb = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
t("merge: scorecard is an authorable diagram type, validated against the renderer schema, its words label-checked", /"matchWave", "scorecard"/.test(sb) && /function scorecardProblems/.test(sb) && /scorecardSchema\.safeParse/.test(sb) && /\(scoreWords \|\| a\.diagram\.labels \|\| \[\]\)/.test(sb));
t("rules text tells authors how to build it and never to invent a number or a winner", /SCORECARD — a weighted decision/.test(sb) && /Grade an option ONLY on the beat whose narration grades it/.test(sb) && /carry a grade or a result from a LATER beat/.test(sb) && /set `winner` only when/.test(sb.replace(/\\`/g, "`")));
const rc = fs.readFileSync(path.join(__dirname, "readcheck.js"), "utf8");
t("readcheck: the blind text reader is told what the scorecard draws at its stage", /function scorecardSeen/.test(rc) && /b\.diagram\.type === "scorecard"/.test(rc));
console.log(fail ? `\n${fail} FAILED` : "\nall scorecard checks passed");
process.exit(fail ? 1 : 0);
