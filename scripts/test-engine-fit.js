#!/usr/bin/env node
/**
 * test-engine-fit.js — the engine recommendation answers "what must the viewer
 * see, and which engine can draw it", not "are there names and numbers".
 */
const { analyzeEngineFit } = require("./lib/engine-fit");

let passed = 0, failed = 0;
const assert = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`); }
};
const rep = (s, k) => Array.from({ length: k }, () => s).join(" ");

const selfHelp = rep("You can change your habits. Your brain resists new goals, so you should design your system and protect your attention and your energy every day.", 40);
const history = rep("In 1863 the Union army marched south. President Lincoln wrote to his generals in 1864, and historians still read the archives of that war and the soldiers who fought the battle.", 40);
const violentNovel = rep("He killed the old woman with an axe. Blood on the floor, the dead body, the murder he could not forget; he died inside every night after the killing.", 40);
const namesAndStats = rep("Cadence told Gat about the study: 40 percent of the research data said Mirren and Johnny were 3 million times luckier.", 40);
const quietNovel = rep("She walked to the shore and looked at the house where the family spent every summer, and said nothing to her cousins.", 40);

const sh = analyzeEngineFit(selfHelp);
assert("self-help addressed to 'you' → Antidote, strong", sh.pick === "antidote" && sh.confidence === "strong", JSON.stringify(sh));
const hi = analyzeEngineFit(history);
assert("dated real history → Vox", hi.pick === "vox", JSON.stringify(hi));
const vn = analyzeEngineFit(violentNovel);
assert("violent narration flags the Flux-filter risk", vn.risks.length > 0);
assert("violent narration does not recommend Vox", vn.pick === "antidote", JSON.stringify(vn));
const ns = analyzeEngineFit(namesAndStats);
assert("names + statistics alone are NOT a Vox signal (the old scorer's bug)", ns.pick === "antidote", JSON.stringify(ns));
const qn = analyzeEngineFit(quietNovel);
assert("a quiet contemporary novel has no strong signal (never a false stop)", qn.confidence !== "strong", JSON.stringify(qn));
const period = analyzeEngineFit(quietNovel, { era: 1789 });
assert("the same story set in 1789 leans Vox (period realism)", period.voxScore > qn.voxScore && period.reasons.some((r) => /1789/.test(r)));
const advice1913 = analyzeEngineFit(selfHelp, { era: 1913 });
assert("an advice book's bible year does not add period weight", advice1913.voxScore === sh.voxScore);
assert("every result explains itself", [sh, hi, vn, ns, qn].every((r) => r.reasons.length > 0));

// Step 0 — no narration yet: the same axes from what Claude knows about the book
const { analyzeBookProfile, validateProfile } = require("./lib/engine-fit");
const wwl = { kind: "fiction", world: "contemporary", era: 2014, realPeople: false, format: "story", violence: "central", mustSee: ["the island", "the fire", "the family"] };
const river = { kind: "fiction", world: "period", era: 1789, realPeople: true, format: "story", violence: "some", mustSee: ["frozen river", "midwife"] };
const advice = { kind: "nonfiction", world: "ideas", realPeople: false, format: "argument", violence: "none", mustSee: ["a distracted reader", "deep focus"] };
assert("profile: contemporary violent novel → Antidote + risk", analyzeBookProfile(wwl).pick === "antidote" && analyzeBookProfile(wwl).risks.length > 0);
assert("profile: 1789 real-history novel → Vox", analyzeBookProfile(river).pick === "vox");
assert("profile: advice book → Antidote strong", analyzeBookProfile(advice).pick === "antidote" && analyzeBookProfile(advice).confidence === "strong");
assert("profile validation rejects a genre-label-only profile", validateProfile({ kind: "fiction" }).length >= 4);
// 2026-10-27: a portal fantasy whose frame story is dated 1900 got the PERIOD bonus and flipped to Vox; the agent
// disagreed and stopped to ask. The year of a frame story is not a period world.
const portal = { kind: "fiction", world: "speculative", era: 1900, realPeople: false, format: "story", violence: "some", minorHarm: false, mustSee: ["children and magic rings in an attic", "a dead city in another world", "a lion singing a new world into being"] };
assert("profile: speculative world with an early frame year → Antidote (no period bonus)", analyzeBookProfile(portal).pick === "antidote" && analyzeBookProfile(portal).voxScore === 0, JSON.stringify(analyzeBookProfile(portal)));
assert("profile: …the frame year no longer flips the engine", analyzeBookProfile({ ...portal, era: undefined }).pick === analyzeBookProfile(portal).pick);
assert("profile: …while a PERIOD world in 1900 still leans Vox", analyzeBookProfile({ ...portal, world: "period" }).pick === "vox");
assert("profile: the speculative reason says why (invented look, measured books)", analyzeBookProfile(portal).reasons.some((r) => /invented/.test(r)));

// The calibration set every agent compares against must keep its answers.
const ex = require("../data/engine-profile-examples.json").examples;
for (const e of ex) {
  const errs = validateProfile(e.profile);
  const r = analyzeBookProfile(e.profile);
  assert(`reference: ${e.book} → ${e.expect}`, !errs.length && r.pick === e.expect, errs.join(";") || `${r.pick} ${r.confidence}`);
}

// ── 2026-10-29 operator decisions: the year never decides "period" alone; harm to animals alone is never "central" ──
const { effectiveViolence } = require("./lib/engine-fit");
const help = ex.find((e) => /The Help/.test(e.book)).profile, bell = ex.find((e) => /Bell Jar/.test(e.book)).profile;
assert("year alone: the same profile at 1953 and 1940 picks the same engine (periodLook decides)", analyzeBookProfile({ ...bell, era: 1940 }).pick === analyzeBookProfile(bell).pick && analyzeBookProfile({ ...help, era: 1940 }).pick === analyzeBookProfile(help).pick);
assert("year alone: a 1962 world whose look is essential still leans Vox; set to none it does not", analyzeBookProfile(help).pick === "vox" && analyzeBookProfile({ ...help, periodLook: "none" }).voxScore < analyzeBookProfile(help).voxScore);
assert("an interior (ideas) book gets half the period weight", analyzeBookProfile({ ...help, ideaDensity: "ideas" }).voxScore === analyzeBookProfile(help).voxScore - 10);
const yeller = ex.find((e) => /Old Yeller/.test(e.book)).profile;
assert("animals: central animal harm that is not the main conflict / not shown counts as some", effectiveViolence(yeller) === "some" && analyzeBookProfile(yeller).antidoteScore === analyzeBookProfile({ ...yeller, violence: "some" }).antidoteScore);
assert("animals: central ONLY when main conflict AND shown AND heavy", effectiveViolence({ ...yeller, animalHarm: { role: "main-conflict", mustShow: true, weight: "high" } }) === "central" && effectiveViolence({ ...yeller, animalHarm: { role: "main-conflict", mustShow: true, weight: "low" } }) === "some");
assert("people: violence against people is unchanged (both keeps the people rule)", effectiveViolence({ ...wwl }) === "central" && effectiveViolence({ ...wwl, violenceOf: "both" }) === "central");
assert("legacy: a profile without the new fields scores as before (published / pinned books never flip)", analyzeBookProfile(river).voxScore === 50 && analyzeBookProfile({ kind: "nonfiction", world: "real-historical", era: 1940, realPeople: true, format: "story", violence: "none", mustSee: ["a", "b"] }).voxScore === 50);
assert("strict (new Step 0): a 1946-1975 world without periodLook is refused", validateProfile({ ...help, periodLook: undefined }, { strict: true }).some((e) => /periodLook is required/.test(e)) && !validateProfile({ ...help, periodLook: undefined }).length);
assert("strict: animal violence without animalHarm is refused", validateProfile({ ...yeller, animalHarm: undefined }, { strict: true }).some((e) => /animalHarm is required/.test(e)));
assert("strict: a contemporary / speculative profile needs none of the new fields", !validateProfile(wwl, { strict: true }).length && !validateProfile(portal, { strict: true }).length);

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed) process.exit(1);
