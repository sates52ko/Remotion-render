#!/usr/bin/env node
// readcheck: what the blind reader is shown (2026-10-23). The SECOND person of an authored two-person cast is shown
// as plan-antidote draws them (lib/partner-contract.js: the verb's pair, else partnerAction, else idle;
// partnerExpression, else neutral); a cast on an authored cast-dropping shot is off screen; a person without a
// `look` is described from the drawn costume, never by the cast key (a name). The blindness contract holds: no
// narration, explainedBy, storyboard text, cast key or name reaches the reader. Runs the REAL prep (--root=<temp>).
// Run: node scripts/test-readcheck-visible.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rc-visible-"));
const SLUG = "zz-rcv", B = path.join(tmp, "books", SLUG);
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
try {
  const SECRET = "THE NARRATION SAYS THE DAUGHTER FORGIVES HIM";
  const sb = { claim: "SECRET-CLAIM", concreteVisual: "SECRET-VISUAL", onScreenText: "none", relationToPrevious: "SECRET-REL", addedInformation: "SECRET-ADDED" };
  const beat = (i, x) => ({ i, narration: `${SECRET} ${i}`, explainedBy: "SECRET-EXPLAINED", storyboard: sb, concept: null, diagram: null, callout: null, ...x });
  W(path.join(B, "art.json"), { beats: [
    beat(0, { cast: ["mara", "luther"], expression: "angry", action: "point", partnerExpression: "sad", partnerAction: "slump" }),
    beat(1, { cast: ["mara", "luther"], action: "embrace" }),
    beat(2, { cast: ["mara", "luther"], action: "grabbing" }),
    beat(3, { cast: ["mara", "luther"], expression: "happy", action: "celebrate" }),
    beat(4, { cast: ["mara"], expression: "sad", action: "hold", holds: "letter" }),
    beat(5, { cast: ["mara", "luther"], shotOverride: "insert", concept: "heart" }),
    beat(6, { cast: ["cruz", "nobody"], action: "talk" }),
    beat(7, { cast: ["luther", "mara"], action: "fighting", shotOverride: "twoShot" }),
  ] });
  W(path.join(B, "story-bible.json"), { cast: {
    mara: { name: "Mara", look: "young woman in a green coat, dark ponytail" },
    luther: { name: "Luther", look: "old man in a grey suit" },
    cruz: { name: "Cruz", variant: { gender: "m", age: "old", outfit: "suit" } },
    nobody: { name: "Nobody" },
  } });
  const r = spawnSync(process.execPath, [path.join(__dirname, "readcheck.js"), "prep", `--slug=${SLUG}`, `--root=${tmp}`], { encoding: "utf8" });
  const visRaw = fs.readFileSync(path.join(B, "storyboard", "readcheck", "visible-1.json"), "utf8");
  const vis = JSON.parse(visRaw);
  const key = JSON.parse(fs.readFileSync(path.join(B, "storyboard", "readcheck", "key.json"), "utf8"));
  const at = (i) => vis.find((v) => key[v.id] === i);
  t("prep runs on --root", r.status === 0 && vis.length === 8, r.stderr);
  // the body is shown AS DRAWN (2026-10-29): "slump" is a standing lean, never a fall — the word alone hid that
  t("authored partner: face sad + the slump shown as drawn (standing, bowed — not a fall)", at(0).people[1].looks === "old man in a grey suit" && at(0).people[1].face === "sad" && /standing on their feet, leaning forward, head bowed/.test(at(0).people[1].body) && /not a fall/.test(at(0).people[1].body), JSON.stringify(at(0).people));
  t("the lead is shown exactly as before", JSON.stringify(at(0).people[0]) === JSON.stringify({ looks: "young woman in a green coat", face: "angry", body: "point" }));
  t("embrace: the partner embraces back", at(1).people[1].body === "embrace" && at(1).people[1].face === "neutral");
  t("grabbing: the partner struggles", at(2).people[1].body === "struggling");
  t("fighting: both fight (cast order kept)", at(7).people[1].body === "fighting" && at(7).people[0].looks === "old man in a grey suit");
  t("no partner fields: the partner is shown neutral / idle (what the planner draws)", at(3).people[1].face === "neutral" && at(3).people[1].body === "idle" && at(3).people[0].face === "happy");
  t("one person: unchanged, no partner fields invented", at(4).people.length === 1 && JSON.stringify(at(4).people[0]) === JSON.stringify({ looks: "young woman in a green coat", face: "sad", body: "hold", holds: "letter" }));
  t("authored cast-dropping shot (insert): nobody is shown on screen", !at(5).people && at(5).icon === "a heart", JSON.stringify(at(5)));
  t("no look: described from the drawn costume, never by the cast key", at(6).people[0].looks === "an old man in a suit" && at(6).people[1].looks === "a person", JSON.stringify(at(6).people));
  t("blindness: no narration, explainedBy or storyboard text in what the reader gets", !/NARRATION|SECRET/.test(visRaw));
  t("blindness: no cast key or name (mara, luther, cruz, Nobody) in what the reader gets", !/\b(mara|luther|cruz|nobody)\b/i.test(visRaw), visRaw.match(/\b(mara|luther|cruz|nobody)\b/i));
  t("people carry only looks / face / body / holds", vis.every((v) => (v.people || []).every((p) => Object.keys(p).every((k) => ["looks", "face", "body", "holds"].includes(k)))));
  const prompts = fs.readFileSync(path.join(B, "storyboard", "readcheck", "PROMPTS.md"), "utf8");
  t("the reader prompt is the same (only the data changed)", /You are a blind rater\. Read ONLY/.test(prompts) && /what is the narrator saying at this moment/.test(prompts) && !/SECRET|NARRATION/.test(prompts));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall readcheck-visible checks passed");
process.exit(failed ? 1 : 0);
