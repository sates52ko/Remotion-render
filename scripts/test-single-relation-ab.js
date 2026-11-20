#!/usr/bin/env node
// test-single-relation-ab.js — per-beat agent A/B (cycle 17): blinding never gives one rater both versions of a beat,
// judge tasks carry the verbatim instructions + the narration-only key, tally scores like cycles 15/16. Temp dir, < 1 s.
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const AB = require("./single-relation-ab");

let fail = 0;
const ok = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { fail++; console.log(`✗ ${name}\n    ${e.message}`); } };
const W = (p, j) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof j === "string" ? j : JSON.stringify(j, null, 1)); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-ab-"));
const beats = [3, 7, 11, 20, 31];
W(path.join(dir, "pairs.json"), { slug: "zz", pairs: beats.map((i) => ({ sceneIndex: i, narration: `narration ${i}`, previousNarration: `before ${i}`, bContractHash: `h${i}` })) });
for (const i of beats) for (const a of ["A", "B"]) W(path.join(dir, "strips", `s${i}-${a}.png`), `png ${i}${a}`);

const r = AB.blind(dir, path.join(dir, "strips"));
const bk = JSON.parse(fs.readFileSync(path.join(dir, "ab", "blind-key.json"), "utf8"));
ok("blind: one blind strip per version, names reveal nothing", () => {
  assert.strictEqual(r.items, 10); assert.strictEqual(Object.keys(bk.key).length, 10);
  assert(Object.keys(bk.key).every((n) => /^[0-9a-f]{10}$/.test(n)));
});
ok("blind: no describer or judge ever gets both versions of a beat", () => {
  const beatOf = (img) => bk.key[img].sceneIndex;
  for (const g of [...bk.describers.map((d) => d.imgs), ...bk.judges.p1, ...bk.judges.p2]) assert.strictEqual(new Set(g.map(beatOf)).size, g.length, JSON.stringify(g));
  assert(bk.describers.every((d) => d.imgs.length <= 4)); assert([...bk.judges.p1, ...bk.judges.p2].every((g) => g.length <= 8));
});
ok("blind: the key input is narration only; PROMPTS.md names no version", () => {
  const ki = JSON.parse(fs.readFileSync(path.join(dir, "ab", "key-input.json"), "utf8"));
  assert.deepStrictEqual(Object.keys(ki.scenes[0]).sort(), ["id", "narration", "previousNarration"]);
  const md = fs.readFileSync(path.join(dir, "ab", "PROMPTS.md"), "utf8");
  assert(!/single-relation contract|version B|arm B|\bnew version\b/i.test(md.split("## 1.")[1]), "prompts must not reveal which version is new");
});

W(path.join(dir, "ab", "answer-key.json"), { items: beats.map((i) => ({ id: String(i), understanding: "u", cause: "c", effect: "e", supportsCausality: true, asserted: "a", notAsserted: [], keyFacts: ["k"], wrong: ["w"] })) });
bk.describers.forEach((d) => W(path.join(dir, "ab", "desc", `${d.d}.json`), d.imgs.map((img) => ({ img, sees: [], changed: "x", cause: "x", effect: "x", message: "x", wouldConfuse: "none" }))));
const j = AB.judge(dir);
ok("judge: tasks carry the verbatim pilot instructions and the key", () => {
  const t = JSON.parse(fs.readFileSync(path.join(dir, "ab", "judge-in", "p1-J1.task.json"), "utf8"));
  assert(/You judge whether muted viewers understood/.test(t.instructions)); assert.strictEqual(t.items[0].answerKey.cause, "c"); assert(j.tasks >= 2);
});

// B correct on everything, A only a partial message; one beat with a wrong inference on B
for (const p of ["p1", "p2"]) bk.judges[p].forEach((g, k) => W(path.join(dir, "ab", `judge-out-${p}`, `J${k + 1}.json`), g.map((img) => {
  const { sceneIndex: i, arm } = bk.key[img];
  return arm === "B" ? { img, cause: "CORRECT", effect: "CORRECT", message: "MATCH", wrongInference: i === 31 ? "YES" : "NO", polarityError: "NO" } : { img, cause: "NOT_SHOWN", effect: "NOT_SHOWN", message: "PARTIAL", wrongInference: "NO", polarityError: "NO" };
})));
const t = AB.tally(dir);
ok("tally: primary = mean(cause, effect, message) over two passes; safety counted per version", () => {
  const row = t.rows.find((x) => x.sceneIndex === 3);
  assert.deepStrictEqual([row.A, row.B, row.wiA, row.wiB], [16.7, 100, 0, 0]);
  assert.strictEqual(t.rows.find((x) => x.sceneIndex === 31).wiB, 2); assert.strictEqual(t.raters, "agents (never human)");
  assert.strictEqual(t.rows.find((x) => x.sceneIndex === 3).bContractHash, "h3"); // the B these ratings are for (cycle 19)
});
ok("narration review (cycle 18): blind writes X/Y pairs + items; tally turns a wrong-object / action / causality on B into a veto, keeps 'unclear' as no veto", () => {
  const avDir = path.join(dir, "ab", "av");
  assert(fs.existsSync(path.join(avDir, "items.json")) && fs.existsSync(path.join(avDir, "S3-X.png")) && fs.existsSync(path.join(avDir, "S3-Y.png")));
  const map = bk.av;
  const side = (i, arm) => (map["S" + i].X === arm ? "X" : "Y");
  const review = beats.map((i) => ({ id: "S" + i, [side(i, "A")]: { contracts: false }, [side(i, "B")]: i === 7 ? { contradicts: true, kind: "wrong-object", narrationPart: "narration 7", onScreen: "a mask" } : i === 11 ? { contradicts: true, kind: "unclear", narrationPart: "x", onScreen: "y" } : { contradicts: false } }));
  W(path.join(avDir, "review.json"), review);
  const t2 = AB.tally(dir);
  assert.deepStrictEqual(t2.rows.find((x) => x.sceneIndex === 7).veto, { kind: "wrong-object", narrationPart: "narration 7", onScreen: "a mask" });
  assert(!t2.rows.find((x) => x.sceneIndex === 11).veto && t2.rows.every((x) => x.avReviewed === true));
});
ok("tally: a beat with only one judge pass is refused", () => {
  const f = path.join(dir, "ab", "judge-out-p2", "J1.json"); fs.writeFileSync(f, "[]");
  assert.throws(() => AB.tally(dir), /two judge passes/);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} A/B check(s) FAILED` : "\nall single-relation A/B checks passed");
process.exit(fail ? 1 : 0);
