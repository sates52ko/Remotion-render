#!/usr/bin/env node
// single-relation-scan.js + single-relation-preview.js (Level 1 discovery / preview; read-only on the book).
//   node scripts/test-single-relation-scan.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { splitRelation } = require("./single-relation-scan");
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ok", name); };

ok("a stated relation splits into cause / effect (forward and because)", () => {
  const f = splitRelation("Every notification you answer drains the focus you need for deep work.");
  assert(f && /notification/.test(f.cause) && /focus/.test(f.effect));
  const b = splitRelation("The adrenaline clears from your body because you stop resisting the feeling.");
  assert(b && /stop resisting/.test(b.cause) && /adrenaline/.test(b.effect));
});
ok("host chatter, 'let's', 'made up of' and caption fragments are not relations", () => {
  assert.strictEqual(splitRelation("Okay, I have to stop here because I think people will object to this."), null);
  assert.strictEqual(splitRelation("This sounds great in theory, but let's look at the actual numbers here."), null);
  assert.strictEqual(splitRelation("The crowd is made up of thousands of quants with supercomputers today."), null);
  assert.strictEqual(splitRelation("because if a piece of information is"), null);
});

ok("author-reject classes (cycles 14–15) are filtered; the accepted shapes are kept", () => {
  const { rejectClass } = require("./single-relation-scan");
  assert.match(rejectClass("You have to outthink the crowd because first level thinking is simplistic and superficial.") || "", /obligation/);
  assert.match(rejectClass("If your tone remains perfectly flat, it forces the interrogator to hear the echo of their own aggression.") || "", /conditional/);
  assert.match(rejectClass("The iron jaw posture proves you are a force to be reckoned with.") || "", /evaluation/);
  assert.match(rejectClass('He said "this destroys everything" and it made the room go silent.') || "", /quoted/);
  assert.strictEqual(rejectClass("And once you stop resisting, the adrenaline starts to clear."), null);
  assert.strictEqual(rejectClass("An overwhelming noise that vibrates in your chest and makes it impossible to think clearly."), null);
  assert.strictEqual(rejectClass("Rejecting a friend to their face triggers the same pain receptors as physical injury."), null);
});

// a tiny book in a temp root: scan proposes only the people-only causal beat; validate is per contract
const root = fs.mkdtempSync(path.join(os.tmpdir(), "srscan-"));
const B = path.join(root, "books", "tbook"); fs.mkdirSync(B, { recursive: true });
fs.writeFileSync(path.join(root, "PUBLISHED_BOOKS.md"), "| published-one |\n");
const scene = (i, narration, extra = {}) => ({ id: `s${i}`, fromFrame: i * 200, durationFrames: 200, shot: "twoShot", bg: {}, characters: [{ role: "everyman" }], texts: [{ text: "X" }], props: [], _narration: narration, ...extra });
const cfg = { meta: { slug: "tbook", cast: { everyman: { name: "You" } } }, captions: [], scenes: [
  scene(0, "Welcome back to the show everyone, it is good to be here."),
  scene(1, "Every notification you answer drains the focus you need for deep work."),
  scene(2, "Every notification you answer drains the focus you need for deep work.", { props: [{ icon: "smartphone" }] }),
  scene(3, "If you planned it well, the schedule would prevent every distraction from reaching you."),
] };
fs.writeFileSync(path.join(B, "config.antidote.json"), JSON.stringify(cfg));
const run = (...a) => execFileSync(process.execPath, [path.join(__dirname, "single-relation-scan.js"), ...a, "--slug=tbook", `--book-root=${root}`], { encoding: "utf8" });
ok("scan: a people-only causal beat is a candidate; a beat with an object, or with a planned cue, is rejected with a reason", () => {
  run("scan");
  const r = JSON.parse(fs.readFileSync(path.join(B, "single-relation", "candidates.json"), "utf8"));
  assert.deepStrictEqual(r.candidates.map((c) => c.sceneIndex), [1]);
  for (const k of ["sceneId", "evidence", "cause", "effect", "currentLimitation", "proposedRepresentation", "expectedUnderstanding", "risk", "inputHash"]) assert(r.candidates[0][k], k);
  assert(r.rejected.some((x) => x.sceneIndex === 2 && /already shows/.test(x.reason)));
  assert(r.rejected.some((x) => x.sceneIndex === 3 && /planned/.test(x.reason)));
  assert.strictEqual(fs.readFileSync(path.join(B, "config.antidote.json"), "utf8"), JSON.stringify(cfg), "the book is not edited");
});
ok("validate: each contract on its own — an invalid one does not block a valid one; provenance recorded", () => {
  const dir = path.join(B, "single-relation", "contracts"); fs.mkdirSync(dir, { recursive: true });
  const good = { schema: "single-relation/1", type: "B", understanding: "Notifications drain focus.", evidence: "Every notification you answer drains the focus you need",
    claim: { asserted: "Notifications drain focus.", polarity: "asserted", speaker: "narrator", notAsserted: [] }, before: "b", transformation: "t", after: "a", camera: { purpose: "both in one frame" },
    entities: [{ id: "p", kind: "object", glyph: "smartphone", label: "notification" }, { id: "f", kind: "stock", label: "focus", value: 1 }],
    events: [{ at: 0.3, cause: "p", effects: [{ entity: "f", value: 0.2 }] }], required: ["x"], omitted: [], _author: "test-author" };
  fs.writeFileSync(path.join(dir, "1.json"), JSON.stringify(good));
  fs.writeFileSync(path.join(dir, "3.json"), JSON.stringify({ ...good, evidence: "the schedule would prevent every distraction from reaching you" }));
  run("validate");
  const v = JSON.parse(fs.readFileSync(path.join(B, "single-relation", "contracts.json"), "utf8"));
  assert.deepStrictEqual(v.valid, [1]); assert.deepStrictEqual(v.invalid, [3]);
  assert.strictEqual(v.contracts[1].author, "test-author"); assert.strictEqual(v.contracts[1].previousSceneId, "s0"); assert(v.contracts[1].inputHash && v.contracts[1].contractHash);
});
ok("preview: isolated A / B configs for VALID contracts only; B opts in, A does not; the book config is untouched", () => {
  const out = path.join(root, "ab");
  execFileSync(process.execPath, [path.join(__dirname, "single-relation-preview.js"), "build", "--slug=tbook", `--book-root=${root}`, `--out=${out}`], { encoding: "utf8" });
  const m = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
  assert.deepStrictEqual(m.jobs.map((j) => j.id), ["s1-A", "s1-B"]);
  const a = JSON.parse(fs.readFileSync(path.join(out, "configs", "s1-A.json"), "utf8")), b = JSON.parse(fs.readFileSync(path.join(out, "configs", "s1-B.json"), "utf8"));
  assert.notStrictEqual(a.meta.singleRelation, true); assert.strictEqual(b.meta.singleRelation, true); assert(b.scenes[1].singleRelation && !a.scenes[1].singleRelation);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(B, "config.antidote.json"), "utf8")).meta.singleRelation, undefined);
});
ok("a published book is refused", () => {
  const P = path.join(root, "books", "published-one"); fs.mkdirSync(P, { recursive: true }); fs.writeFileSync(path.join(P, "config.antidote.json"), JSON.stringify(cfg));
  assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, "single-relation-scan.js"), "scan", "--slug=published-one", `--book-root=${root}`], { stdio: "pipe" }));
});
fs.rmSync(root, { recursive: true, force: true });
console.log(`single-relation-scan: ${n} passed`);
