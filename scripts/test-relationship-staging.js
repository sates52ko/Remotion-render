// Regression for authored relationship staging (flag-gated). Run: node scripts/test-relationship-staging.js
// Behavioural Gate B checks (missing / FALLBACK / stale verdict refused by storyboard.js merge) were run
// end to end on a sandbox copy of red-rising (AGENT_LOG 2026-10-16); this file pins the contracts.
const fs = require("fs");
const path = require("path");
const { gateBInputSha, fieldsOf } = require("./gate-b-relationship");

let failed = 0;
const t = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; };
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

const rel = {
  source: { value: "the rulers", evidence: { beat: 17, quote: "the rulers" } },
  relation: { value: "keep subjugated", evidence: { beat: 17, quote: "keep them down" } },
  target: { value: "the Reds", evidence: [{ beat: 16, quote: "the reds" }, { beat: 17, quote: "them" }] },
  means: { value: "a false story about the future", label: { beat: 17, quote: "a story about the future" }, falseMarker: { beat: 17, quote: "lie" } },
  rejectedMethod: { value: "guns", scope: "not with guns", evidence: { beat: 17, quote: "not with guns" } },
  modality: { value: "asserted" },
};
const narr = "And the rulers keep them down not with guns but by giving them a story about the future. A very specific lie.";

// 1) Gate B verdicts are tied to the exact record and narration
const h = gateBInputSha(rel, narr);
t("Gate B input hash is stable", h === gateBInputSha(JSON.parse(JSON.stringify(rel)), narr));
t("editing the record invalidates the verdict", h !== gateBInputSha({ ...rel, relation: { ...rel.relation, value: "rule" } }, narr));
t("changing the narration invalidates the verdict", h !== gateBInputSha(rel, narr + " More."));

// 2) every used field is sent to the judge, with its quotes
const f = fieldsOf(rel);
const names = f.map((x) => x.field);
t("judge gets source, relation, target, means, rejectedMethod, modality, means.isFalse",
  ["source", "relation", "target", "means", "rejectedMethod", "modality", "means.isFalse"].every((n) => names.includes(n)));
t("target carries both quotes", (f.find((x) => x.field === "target").quotes || []).length === 2);
t("absent optional fields are not invented", !names.includes("negation") && !names.includes("purpose"));

// 3) merge refuses staging without a current STAGE verdict (source contract)
const sb = read("scripts/storyboard.js");
t("merge reports a missing Gate B", /Gate B missing: run node scripts\/gate-b-relationship\.js/.test(sb));
t("merge refuses a non-STAGE decision", /gb\.decision !== "STAGE"/.test(sb));
t("merge refuses a stale verdict", /gb\.inputSha256 !== gateBInputSha\(rel, narration\)/.test(sb));
t("conflicts are reported, never edited", /set `cast` to \[\]/.test(sb) && /set `callout` to null/.test(sb));
t("Check A neighbours come from beats.json", /readJSON\(path\.join\(SB, "beats\.json"\)/.test(sb.slice(sb.indexOf("function relationshipProblems"))));

// 4) on by default (=0 turns it off); still inert unless the author selected staging
const pa = read("scripts/plan-antidote.js");
t("relationship carry-through unless ANTIDOTE_EXPERIMENT_RELATIONSHIP=0, and only when the art beat has one", /process\.env\.ANTIDOTE_EXPERIMENT_RELATIONSHIP !== "0" && ART && ART\[i\] && ART\[i\]\.relationship/.test(pa));
t("staging only for an authored selection (and unless ANTIDOTE_EXPERIMENT_RELATIONSHIP_STAGING=0)", /process\.env\.ANTIDOTE_EXPERIMENT_RELATIONSHIP_STAGING !== "0" && ART && ART\[i\] && ART\[i\]\.relationship && ART\[i\]\.stageRelationship === true/.test(pa));

// 5) the renderer draws what is written; it does not hide authored elements
const scene = read("src/engines/antidote/components/Scene.tsx");
t("Scene renders RelationshipStage when staging is present", /scene\.relationshipStaging \? \(/.test(scene));
t("Scene does not hide cast or texts for staged scenes", !/relationshipStaging[^\n]*(bodies = \[\]|texts = \[\])/.test(scene));

console.log(failed ? `\n${failed} FAILED` : "\nall relationship-staging checks passed");
process.exit(failed ? 1 : 0);
