#!/usr/bin/env node
/**
 * single-relation-ab.js — the per-beat agent A/B a selective rollout needs before a beat gets B (cycle 17). Same
 * protocol as the cycle-15/16 measurements: a narration-only answer key, blind 3-frame strips, fresh describers with 4
 * strips of 4 DIFFERENT beats (the two versions of a beat never to one describer), judges with ≤ 8 items of different
 * beats, two passes, the cycle-13 pilot judge instructions verbatim (data/single-relation-ab-judge.txt).
 * All raters are agents — the result is never a human result.
 *
 *   node scripts/single-relation-ab.js blind  --preview=<dir> --strips=<fetched strips dir>
 *        -> <dir>/ab/{key-input.json, blind/*.png, blind-key.json, PROMPTS.md}   (agents: key, then describers)
 *   node scripts/single-relation-ab.js judge  --preview=<dir>       (needs ab/answer-key.json + ab/desc/*.json)
 *        -> <dir>/ab/judge-in/p{1,2}-J*.task.json; judge prompts appended to PROMPTS.md
 *   node scripts/single-relation-ab.js tally  --preview=<dir>       (needs ab/judge-out-p{1,2}/*.json)
 *        -> <dir>/ab/ab-result.json  {rows: [{sceneIndex, A, B, wiA, wiB, polA, polB, cwA, cwB}]} for rollout `select`
 * <dir> = single-relation-preview.js build output (pairs.json; strips named s<i>-A.png / s<i>-B.png).
 * Regression: scripts/test-single-relation-ab.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const JUDGE = fs.readFileSync(path.join(__dirname, "..", "data", "single-relation-ab-judge.txt"), "utf8").trim();
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function rng(seed) { let k = 0; return () => crypto.createHash("sha256").update(`${seed}|${k++}`).digest().readUInt32BE(0) / 2 ** 32; }
function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/** groups of ≤ size, every member a different beat (so both versions of a beat never share a rater) */
function groups(items, size, r) {
  for (let t = 0; t < 500; t++) {
    const gs = [];
    for (const it of shuffle(items, r)) {
      let g = gs.find((x) => x.length < size && !x.some((y) => y.beat === it.beat));
      if (!g) { g = []; gs.push(g); }
      g.push(it);
    }
    if (gs.length <= Math.ceil(items.length / size) + 1) return gs;
  }
  throw new Error("no grouping found");
}

const describerPrompt = (dir, imgs, out) => `You are a viewer of animated explainer videos about books, watching with the SOUND OFF. Open ONLY these ${imgs.length === 4 ? "four" : imgs.length} images, one at a time (they are ${imgs.length === 4 ? "four" : imgs.length} unrelated scenes). Folder: ${dir}/
${imgs.map((i) => `${i}.png`).join(", ")}
Each shows three moments of the same short scene, left to right (frame 1, frame 2, frame 3). Do not open any other file. Describe each image on its own; do not let one scene inform another.
Write ONLY a JSON array of ${imgs.length === 4 ? "four" : imgs.length} objects, one per image, to ${out} , each object:
{"img":"<the image file name without .png>","sees":["frame 1: …","frame 2: …","frame 3: …"],
 "changed":"what changed between frame 1 and frame 3 (or 'nothing')",
 "cause":"what caused that change, as you understand it (or 'unclear')",
 "effect":"what the result / consequence is (or 'unclear')",
 "message":"in one sentence, what you think the narrator is saying here",
 "wouldConfuse":"anything that could mislead a viewer, or 'none'"}
Describe only what is visible; if something is unclear, say so. Reply with one line: "written".`;

const AV_PROMPT = (dir) => `You check short scenes of animated book-summary videos against what the narrator SAYS over them. Open ONLY ${dir}/items.json (per scene id: the narration and the line before) and the images ${dir}/<id>-X.png and ${dir}/<id>-Y.png (two versions of each scene, three moments left to right). Open no other file; one image at a time.
For EACH version decide whether what is shown CONTRADICTS the narration in one of three ways:
 - "wrong-object": a thing on screen reads as something other than what the narration names (e.g. a mask where the narration says clothes)
 - "wrong-action": the action shown is not the action narrated (or the opposite)
 - "wrong-causality": the screen shows a cause / result the narration does not state, or reverses them
Low appeal, a plain picture, or something merely unclear is NOT a contradiction (answer no).
Write ONLY JSON to ${dir}/review.json : [{"id","X":{"contradicts":true|false,"kind":"wrong-object|wrong-action|wrong-causality|null","narrationPart":"the narration's own words it contradicts","onScreen":"what is shown instead"},"Y":{...}}]. Reply with one line: "written".`;
// C19 sequences (operator 2026-11-09): the same review also asks, per version, whether the beat's MAIN IDEA is still on
// screen and whether the object the narrated action needs can be told apart at this size — both are vetoes for B
const AV_PROMPT_C19 = (dir) => AV_PROMPT(dir).replace(/Write ONLY JSON[\s\S]*$/, `ALSO, for EACH version:
 - "mainIdea": first write, in one sentence, the narrator's MAIN point in this moment (what the line is about — not every detail it mentions); then say whether this version shows THAT point ("shown": true) or loses it / shows only a side detail ("shown": false).
 - "object": name the object the narrated action needs (or null if none); is it distinguishable at this size ("readable": "yes" | "no" | "unclear"), and what does it look like ("looksLike")?
Write ONLY JSON to ${dir}/review.json : [{"id","X":{"contradicts":true|false,"kind":"wrong-object|wrong-action|wrong-causality|null","narrationPart":"…","onScreen":"…","mainIdea":{"idea":"…","shown":true|false},"object":{"needed":"…|null","readable":"yes|no|unclear","looksLike":"…"}},"Y":{...}}]. Reply with one line: "written".`);

const KEY_PROMPT = (inp, out) => `You write an answer key for a reading-comprehension check. Read ONLY ${inp} (scenes: id, narration, previousNarration). Open no other file. For each scene write what the NARRATION says (previous only as context). Write ${out} as {"items":[{"id","understanding":"one sentence: what this moment says","cause":"what acts / the cause, in plain words","effect":"what changes / the result","supportsCausality":true|false,"asserted":"what the narration actually asserts","notAsserted":[{"text","why"}] (hypotheticals, negations, questions, quoted opinions that are NOT asserted),"keyFacts":["2-4 short facts"],"wrong":["3 plausible WRONG readings, incl. reversed cause/effect"]}]}. Be literal to the narration; do not invent. Reply in ≤ 2 lines.`;

function blind(previewDir, stripsDir, { seed = null } = {}) {
  const pairs = readJSON(path.join(previewDir, "pairs.json"));
  const AB = path.join(previewDir, "ab");
  fs.mkdirSync(path.join(AB, "blind"), { recursive: true });
  for (const d of ["desc", "judge-in", "judge-out-p1", "judge-out-p2"]) fs.mkdirSync(path.join(AB, d), { recursive: true });
  seed = seed || `sr-ab|${pairs.slug}|${pairs.pairs.map((p) => p.sceneIndex).join(",")}`;
  const items = [], key = {};
  for (const p of pairs.pairs) for (const arm of ["A", "B"]) {
    const f = path.join(stripsDir, `s${p.sceneIndex}-${arm}.png`);
    if (!fs.existsSync(f)) throw new Error(`missing strip ${f}`);
    const img = crypto.createHash("sha256").update(`${seed}|${p.sceneIndex}|${arm}`).digest("hex").slice(0, 10);
    fs.copyFileSync(f, path.join(AB, "blind", `${img}.png`));
    key[img] = { sceneIndex: p.sceneIndex, arm };
    items.push({ img, beat: p.sceneIndex });
  }
  const scenes = pairs.pairs.map((p) => ({ id: String(p.sceneIndex), narration: p.narration, previousNarration: p.previousNarration || "" }));
  fs.writeFileSync(path.join(AB, "key-input.json"), JSON.stringify({ scenes }, null, 1));
  const r = rng(seed);
  // narration review (cycle 18 veto): both versions of each beat as X / Y in a seeded order, WITH the narration
  fs.mkdirSync(path.join(AB, "av"), { recursive: true });
  const av = {};
  for (const p of pairs.pairs) {
    const flip = r() < 0.5, id = `S${p.sceneIndex}`;
    for (const [slot, arm] of [["X", flip ? "B" : "A"], ["Y", flip ? "A" : "B"]]) fs.copyFileSync(path.join(stripsDir, `s${p.sceneIndex}-${arm}.png`), path.join(AB, "av", `${id}-${slot}.png`));
    av[id] = { sceneIndex: p.sceneIndex, X: flip ? "B" : "A", Y: flip ? "A" : "B" };
  }
  fs.writeFileSync(path.join(AB, "av", "items.json"), JSON.stringify({ items: pairs.pairs.map((p) => ({ id: `S${p.sceneIndex}`, narration: p.narration, previousNarration: p.previousNarration || "" })) }, null, 1));
  const D = groups(items, 4, r).map((g, k) => ({ d: `D${k + 1}`, imgs: g.map((x) => x.img) }));
  const J = { p1: groups(items, 8, r).map((g) => g.map((x) => x.img)), p2: groups(items, 8, r).map((g) => g.map((x) => x.img)) };
  fs.writeFileSync(path.join(AB, "blind-key.json"), JSON.stringify({ seed, key, describers: D, judges: J, av }, null, 1));
  const abs = (p) => path.resolve(p).replace(/\\/g, "/");
  const md = [`# Single-relation A/B — ${pairs.slug} (agents only; never tell an agent which version is new)`, "",
    "## 1. Answer key (ONE fresh agent, before any description is read)", "", "```", KEY_PROMPT(abs(path.join(AB, "key-input.json")), abs(path.join(AB, "answer-key.json"))), "```", "",
    `## 2. Describers (${D.length} fresh sonnet agents, one prompt each, in parallel)`, "",
    ...D.flatMap((d) => ["```", describerPrompt(abs(path.join(AB, "blind")), d.imgs, abs(path.join(AB, "desc", `${d.d}.json`))), "```", ""]),
    "## 3. Narration review (ONE fresh agent; the veto — it sees the narration)", "", "```", (pairs.kind === "c19" ? AV_PROMPT_C19 : AV_PROMPT)(abs(path.join(AB, "av"))), "```", "",
    "## 4. Judges — run `single-relation-ab.js judge`, then the prompts it appends below", ""];
  fs.writeFileSync(path.join(AB, "PROMPTS.md"), md.join("\n"));
  return { items: items.length, describers: D.length };
}

function judge(previewDir) {
  const AB = path.join(previewDir, "ab");
  const bk = readJSON(path.join(AB, "blind-key.json"));
  const pairs = readJSON(path.join(previewDir, "pairs.json"));
  const narr = Object.fromEntries(pairs.pairs.map((p) => [p.sceneIndex, p.narration]));
  const keyItems = readJSON(path.join(AB, "answer-key.json")).items;
  const K = Object.fromEntries(keyItems.map((k) => [String(k.id), k]));
  const desc = {};
  for (const f of fs.readdirSync(path.join(AB, "desc"))) for (const d of readJSON(path.join(AB, "desc", f))) desc[d.img] = d;
  const missing = Object.keys(bk.key).filter((i) => !desc[i]);
  if (missing.length) throw new Error(`descriptions missing for ${missing.join(", ")}`);
  const abs = (p) => path.resolve(p).replace(/\\/g, "/");
  const prompts = [];
  for (const p of ["p1", "p2"]) bk.judges[p].forEach((g, k) => {
    const items = g.map((img) => {
      const i = bk.key[img].sceneIndex, a = K[String(i)];
      if (!a) throw new Error(`answer key has no item for scene ${i}`);
      return { img, narration: narr[i], answerKey: { understanding: a.understanding, cause: a.cause, effect: a.effect, keyFacts: a.keyFacts, wrongInferences: a.wrong, supportsCausality: a.supportsCausality, asserted: a.asserted, notAsserted: a.notAsserted }, description: desc[img] };
    });
    const task = path.join(AB, "judge-in", `${p}-J${k + 1}.task.json`);
    fs.writeFileSync(task, JSON.stringify({ instructions: JUDGE, items }, null, 1));
    prompts.push("```", `Open ONLY ${abs(task)} and follow its "instructions" for its "items". Open no other file. Output path: ${abs(path.join(AB, `judge-out-${p}`, `J${k + 1}.json`))} . Reply with one line: "written".`, "```", "");
  });
  fs.appendFileSync(path.join(AB, "PROMPTS.md"), [`(${prompts.length / 4} fresh judge agents — pass 2 judges are different agents from pass 1)`, "", ...prompts].join("\n"));
  return { tasks: prompts.length / 4 };
}

const ce = (v) => (v === "CORRECT" ? 1 : 0), ms = (v) => (v === "MATCH" ? 1 : v === "PARTIAL" ? 0.5 : 0);
function tally(previewDir) {
  const AB = path.join(previewDir, "ab");
  const bk = readJSON(path.join(AB, "blind-key.json"));
  const per = {};
  for (const p of ["p1", "p2"]) {
    const dir = path.join(AB, `judge-out-${p}`);
    for (const f of fs.readdirSync(dir)) for (const j of readJSON(path.join(dir, f))) {
      const k = bk.key[j.img];
      if (!k) throw new Error(`judge output names an unknown image ${j.img}`);
      const o = per[`${k.sceneIndex}|${k.arm}`] || (per[`${k.sceneIndex}|${k.arm}`] = { s: [], wi: 0, pol: 0, cw: 0 });
      o.s.push((ce(j.cause) + ce(j.effect) + ms(j.message)) / 3);
      o.wi += j.wrongInference === "YES" ? 1 : 0; o.pol += j.polarityError === "YES" ? 1 : 0; o.cw += j.cause === "WRONG" ? 1 : 0;
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const beats = [...new Set(Object.values(bk.key).map((k) => k.sceneIndex))].sort((a, b) => a - b);
  const rows = beats.map((i) => {
    const a = per[`${i}|A`], b = per[`${i}|B`];
    if (!a || !b || a.s.length < 2 || b.s.length < 2) throw new Error(`scene ${i}: needs two judge passes for both versions`);
    return { sceneIndex: i, A: +(100 * mean(a.s)).toFixed(1), B: +(100 * mean(b.s)).toFixed(1), wiA: a.wi, wiB: b.wi, polA: a.pol, polB: b.pol, cwA: a.cw, cwB: b.cw };
  });
  // the narration-review veto: a B shown to contradict the narration (wrong object / action / causality) never ships,
  // however it scored muted; the reason keeps the narration's words and what was on screen instead
  const avr = (() => { try { return readJSON(path.join(AB, "av", "review.json")); } catch { return null; } })();
  const VETO = ["wrong-object", "wrong-action", "wrong-causality"];
  const isC19 = (() => { try { return readJSON(path.join(previewDir, "pairs.json")).kind === "c19"; } catch { return false; } })();
  for (const row of rows) {
    const id = `S${row.sceneIndex}`, map = (bk.av || {})[id], r = avr && avr.find((x) => x.id === id);
    if (!map || !r) { row.avReviewed = false; continue; }
    row.avReviewed = true;
    const b = r[map.X === "B" ? "X" : "Y"] || {};
    if (b.contradicts === true && VETO.includes(b.kind)) row.veto = { kind: b.kind, narrationPart: String(b.narrationPart || ""), onScreen: String(b.onScreen || "") };
    // C19: B that loses the beat's main idea, or whose needed object cannot be told apart, keeps A (operator 2026-11-09)
    else if (isC19 && b.mainIdea && b.mainIdea.shown === false) row.veto = { kind: "lost-main-idea", narrationPart: String(b.mainIdea.idea || ""), onScreen: "B does not show the beat's main idea" };
    else if (isC19 && b.object && b.object.needed && b.object.readable && b.object.readable !== "yes") row.veto = { kind: "unreadable-object", narrationPart: String(b.object.needed), onScreen: `${b.object.readable}: ${String(b.object.looksLike || "")}` };
    if (isC19) row.review = { mainIdeaB: b.mainIdea || null, objectB: b.object || null, mainIdeaA: (r[map.X === "A" ? "X" : "Y"] || {}).mainIdea || null, objectA: (r[map.X === "A" ? "X" : "Y"] || {}).object || null };
  }
  // the fingerprint of the B these ratings and the narration review are FOR (cycle 19)
  try { const ph = Object.fromEntries((readJSON(path.join(previewDir, "pairs.json")).pairs || []).map((p) => [p.sceneIndex, p.bContractHash])); for (const row of rows) if (ph[row.sceneIndex]) row.bContractHash = ph[row.sceneIndex]; } catch {}
  // beats the preview did not render because the timing rule kept A — carried so select names the real reason
  try { for (const d of readJSON(path.join(previewDir, "pairs.json")).timingDropped || []) rows.push({ sceneIndex: d.sceneIndex, dropped: d.why }); } catch {}
  const out = { schema: "single-relation-ab/1", raters: "agents (never human)", rows };
  fs.writeFileSync(path.join(AB, "ab-result.json"), JSON.stringify(out, null, 1));
  return out;
}

module.exports = { blind, judge, tally, groups, rng };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
  const cmd = process.argv[2], dir = args.preview && path.resolve(args.preview);
  if (!dir || !["blind", "judge", "tally"].includes(cmd)) { console.error("usage: single-relation-ab.js blind|judge|tally --preview=<dir> [--strips=<dir>]"); process.exit(2); }
  try {
    if (cmd === "blind") { const r = blind(dir, path.resolve(args.strips || path.join(dir, "out", "strips"))); console.log(`${r.items} blind strips, ${r.describers} describer prompt(s) → ${path.join(dir, "ab", "PROMPTS.md")} (key agent first)`); }
    if (cmd === "judge") { const r = judge(dir); console.log(`${r.tasks} judge task(s) → PROMPTS.md`); }
    if (cmd === "tally") { const r = tally(dir); for (const x of r.rows) console.log(`  scene ${x.sceneIndex}: A ${x.A} → B ${x.B}  WI ${x.wiA}/${x.wiB}  polarity ${x.polA}/${x.polB}  wrong cause ${x.cwA}/${x.cwB}`); console.log(`→ ${path.join(dir, "ab", "ab-result.json")} (then single-relation-rollout.js select --ab=…)`); }
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
