#!/usr/bin/env node
/**
 * c19.js — the C19 sequence step of the operator-approved rollout (runbook §2d): the narrated action and its result
 * followed across consecutive shots inside a beat (and into the next beat when the set stays). Same chain as
 * Relational Motion 2.0, same gates; a sequence ships only where its own A/B wins, the narration review finds no
 * contradiction and every state change sits on the narrator's word. No cap, no per-book approval.
 *
 *   scan     --slug [--book-root]   → books/<s>/single-relation/c19/candidates.json (beats naming an action + an object)
 *   validate --slug [--book-root]   → c19/contracts.json (each contract in c19/contracts/<firstBeat>.json on its own)
 *   preview  --slug [--book-root] --out=<dir>  → isolated A/B configs + stills manifest + pairs.json (single-relation-ab)
 *            A = the beats as they are NOW (a Motion 2.0 scene stays the A arm); B = the sequence applied
 *   select   = single-relation-rollout.js select --contracts=<book>/single-relation/c19 --ab=<dir>/ab/ab-result.json
 *   apply    --slug [--book-root] --selection=<sel.json> [--write]  → every chosen sequence applied ATOMICALLY, recorded
 *            in single-relation/active.json (kind "c19": all beats, their previous versions, provenance)
 *   revert / status / reapply = single-relation-rollout.js (a sequence reverts as one unit; make-book 1.885 re-applies)
 * Regression: scripts/test-c19.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const C19 = require("./lib/c19-sequence");
const { wordsOf } = require("./lib/shot-plan");

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const cmd = process.argv[2];
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const sha = (x) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
const tc = (f) => { const s = f / 30; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s * 10) % 10)}`; };

// an action the narration states on a nameable object (the scan proposes; the author decides)
const VERBS = /\b(swing|swings|swinging|strike|strikes|split|splits|chop|chops|hack|hacking|throw|throws|threw|toss|tosses|tossed|hurl|take off|takes off|remove|removes|removed|pull|pulls|pulled|push|pushes|drop|drops|dropped|kick|kicks|open|opens|opened|smash|smashes|shatter|break|breaks|broke|hand|hands|handed|give|gives|gave|pick up|picks up|put down|puts down|catch|catches|caught|stop running|resume running)\b/i;

const OPENING_SEC = 90;
function scan(root, slug) {
  const B = path.join(root, "books", slug), cfg = readJSON(path.join(B, "config.antidote.json"));
  const motifs = readJSON(path.join(B, "motifs.json"), {}) || {};
  const objWords = [...new Set([...Object.values(C19.HAND_WORDS).flat(), ...Object.entries(motifs).flatMap(([k, m]) => (m && m.words) || [k])])];
  const candidates = [], rejected = [];
  cfg.scenes.forEach((s, i) => {
    const n = String(s._narration || "");
    const verb = (n.match(VERBS) || [])[0];
    const objs = objWords.filter((w) => new RegExp(`\\b${w}s?\\b`, "i").test(n));
    // the opening (operator 2026-11-09): a narrated action in the first 90 s is where a sequence earns the most — flagged
    // so the author decides it first (it still has to be stated, drawable and win its own A/B like any other)
    const opening = (s.fromFrame || 0) < OPENING_SEC * ((cfg.meta && cfg.meta.fps) || 30);
    if (verb && objs.length) candidates.push({ sceneIndex: i, sceneId: s.id, verb, objects: objs, narration: n, next: (cfg.scenes[i + 1] || {})._narration || "", set: (s.bg || {}).set || null, singleRelation: !!s.singleRelation, ...(opening ? { opening: true } : {}) });
    else if (verb) rejected.push({ sceneIndex: i, reason: `action "${verb}" but no drawable object named (hand props / motifs.json words)` });
  });
  const out = path.join(B, "single-relation", "c19");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "candidates.json"), JSON.stringify({ schema: "c19-candidates/1", slug, at: new Date().toISOString(), candidates, rejected }, null, 1));
  return { candidates, rejected, out };
}

function validateAll(root, slug) {
  const B = path.join(root, "books", slug), cfg = readJSON(path.join(B, "config.antidote.json"));
  const motifs = readJSON(path.join(B, "motifs.json"), {}) || {}, dir = path.join(B, "single-relation", "c19");
  const files = fs.existsSync(path.join(dir, "contracts")) ? fs.readdirSync(path.join(dir, "contracts")).filter((f) => /^\d+\.json$/.test(f)) : [];
  const rec = { schema: "c19-contracts/1", slug, at: new Date().toISOString(), valid: [], invalid: [], contracts: {} };
  for (const f of files) {
    const i = Number(f.replace(".json", "")), c = readJSON(path.join(dir, "contracts", f));
    const errors = C19.validate(c, cfg, { motifs });
    if (c && c.beats && c.beats[0] && c.beats[0].sceneIndex !== i) errors.push(`file ${f} must be named after the first beat (${c.beats[0].sceneIndex})`);
    rec.contracts[i] = { valid: !errors.length, errors, contractHash: sha(c), beats: (c && c.beats || []).map((b) => b.sceneIndex), author: c && c._author };
    (errors.length ? rec.invalid : rec.valid).push(i);
  }
  fs.writeFileSync(path.join(dir, "contracts.json"), JSON.stringify(rec, null, 1));
  return rec;
}

function preview(root, slug, out) {
  const B = path.join(root, "books", slug), cfg = readJSON(path.join(B, "config.antidote.json"));
  const motifs = readJSON(path.join(B, "motifs.json"), {}) || {}, dir = path.join(B, "single-relation", "c19");
  const rec = readJSON(path.join(dir, "contracts.json"));
  fs.mkdirSync(path.join(out, "configs"), { recursive: true });
  const jobs = [], pairs = [];
  for (const i of rec.valid || []) {
    const c = readJSON(path.join(dir, "contracts", `${i}.json`));
    const r = C19.apply(cfg, c, { motifs });
    if (!r.ok) continue;
    const idxs = c.beats.map((b) => b.sceneIndex), a = Math.max(0, idxs[0] - 1), z = idxs[idxs.length - 1];
    const off = cfg.scenes[a].fromFrame;
    const win = (conf) => { const scenes = conf.scenes.slice(a, z + 1).map((s) => ({ ...s, fromFrame: s.fromFrame - off })); const l = scenes[scenes.length - 1], T = l.fromFrame + l.durationFrames; return { ...conf, scenes, captions: [], audioEvents: [], totalFrames: T, meta: { ...conf.meta, durationInFrames: T } }; };
    const A = win(cfg), Bc = win(r.config);
    // the critical frames: every cued moment (cut, action, split) + 6 frames after, and the start of each later beat
    const crit = new Set();
    for (const idx of idxs) for (const sh of r.config.scenes[idx].shots) {
      const base = cfg.scenes[idx].fromFrame - off + sh.from;
      crit.add(base + 2);
      for (const ch of sh.characters) if (ch.actionAt != null) { crit.add(base + ch.actionAt); crit.add(base + ch.actionAt + 6); }
      for (const p of sh.props) if (p.motionAt != null && p.motionAt >= 0) { crit.add(base + p.motionAt + 2); crit.add(base + p.motionAt + 14); }
    }
    const frames = [...crit].filter((f) => f < A.totalFrames).sort((x, y) => x - y);
    for (const [arm, conf] of [["A", A], ["B", Bc]]) {
      const id = `s${i}-${arm}`;
      fs.writeFileSync(path.join(out, "configs", `${id}.json`), JSON.stringify(conf));
      jobs.push({ id, config: `configs/${id}.json`, frames, strip: true, ...(args.clips ? { clip: { from: 0, to: conf.totalFrames - 1 } } : {}) });
    }
    pairs.push({ sceneIndex: i, beats: idxs, narration: idxs.map((k) => cfg.scenes[k]._narration).join(" "), previousNarration: (cfg.scenes[a] || {})._narration || "", frames, bContractHash: sha(c) });
  }
  // the clips carry the scene sounds: stills-cloud bundles THIS repo, so the sfx come from here (an isolated --book-root has none)
  const SFX = path.join(__dirname, "..", "public", "sfx");
  const extra = fs.existsSync(SFX) ? fs.readdirSync(SFX).filter((f) => f.endsWith(".wav")).map((f) => `public/sfx/${f}`) : [];
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ schema: "stills/1", name: `C19 A/B ${slug}`, composition: "Antidote-lab", entry: "src/index.ts", silent: true, shards: Math.max(1, Math.min(10, jobs.length / 2)), extra, jobs }, null, 1));
  fs.writeFileSync(path.join(out, "pairs.json"), JSON.stringify({ schema: "single-relation-preview/1", kind: "c19", slug, pairs, timingDropped: [] }, null, 1));
  return { pairs: pairs.length };
}

/** apply the chosen sequences atomically; returns {config, entries, kept} (nothing written) */
function plan(root, slug, cfg, selection, now = new Date().toISOString()) {
  const B = path.join(root, "books", slug), motifs = readJSON(path.join(B, "motifs.json"), {}) || {};
  let conf = cfg; const entries = [], kept = [...(selection.kept || [])];
  const used = new Set();
  for (const ch of selection.chosen) {
    const c = readJSON(ch.contract);
    if (!c) { kept.push({ sceneIndex: ch.sceneIndex, keep: "A", why: "contract file unreadable" }); continue; }
    if (!ch.ab || ch.ab.bContractHash !== sha(c)) { kept.push({ sceneIndex: ch.sceneIndex, keep: "A", why: "no valid narration review for this sequence (it reviewed a different contract)" }); continue; }
    // one sequence per beat (a selection that skipped select, or a sequence already live from an earlier apply)
    const busy = c.beats.map((b) => b.sceneIndex).filter((i) => used.has(i) || ((conf.scenes[i] || {})._c19 && conf.scenes[i]._c19.contractHash !== sha(c)));
    if (busy.length) { kept.push({ sceneIndex: ch.sceneIndex, keep: "A", why: `beat(s) ${busy.join(", ")} already carry another C19 sequence (one per beat, chosen whole — revert that one first)` }); continue; }
    const r = C19.apply(conf, c, { motifs });
    if (!r.ok) { kept.push({ sceneIndex: ch.sceneIndex, keep: "A", why: `invalid at apply (no beat changed): ${r.errors.slice(0, 3).join("; ")}` }); continue; }
    for (const b of c.beats) used.add(b.sceneIndex);
    entries.push({ kind: "c19", sceneIndex: ch.sceneIndex, beats: c.beats.map((b) => b.sceneIndex), contractHash: r.contractHash, mechanism: c.mechanism || null, ab: ch.ab, at: now,
      previousBeats: r.previous, narrationHashes: Object.fromEntries(c.beats.map((b) => [b.sceneIndex, crypto.createHash("sha256").update(String(conf.scenes[b.sceneIndex]._narration || "")).digest("hex").slice(0, 16)])),
      preview: c.beats.map((b) => { const s = conf.scenes[b.sceneIndex]; return { sceneIndex: b.sceneIndex, timecode: `${tc(s.fromFrame)}–${tc(s.fromFrame + s.durationFrames)}`, shots: r.config.scenes[b.sceneIndex].shots.map((sh) => ({ at: tc(s.fromFrame + sh.from), cutAt: sh.cutAt })) }; }) });
    conf = r.config;
  }
  return { config: conf, entries, kept };
}

module.exports = { scan, validateAll, preview, plan, VERBS };

if (require.main === module) {
  const slug = args.slug, root = path.resolve(args["book-root"] || path.join(__dirname, ".."));
  if (!cmd || !slug) { console.error("usage: c19.js scan|validate|preview|apply --slug=<s> [--book-root=<wt>] …"); process.exit(2); }
  const RO = require("./single-relation-rollout");
  const B = path.join(root, "books", slug), SR = path.join(B, "single-relation");
  if (cmd === "scan") { const r = scan(root, slug); const op = r.candidates.filter((c) => c.opening).map((c) => c.sceneIndex); console.log(`${slug}: ${r.candidates.length} C19 candidate(s)${op.length ? ` (opening ≤ ${OPENING_SEC}s: ${op.join(", ")} — decide these first)` : " (none in the opening 90 s)"}, ${r.rejected.length} rejected → ${path.relative(root, r.out)}/candidates.json`); process.exit(0); }
  if (cmd === "validate") { const r = validateAll(root, slug); console.log(`${slug}: ${r.valid.length} valid, ${r.invalid.length} invalid C19 contract(s)`); for (const i of r.invalid) console.log(`  ${i}: ${r.contracts[i].errors.join(" | ")}`); process.exit(0); }
  if (cmd === "preview") { if (!args.out) { console.error("--out=<dir>"); process.exit(2); } const r = preview(root, slug, path.resolve(args.out)); console.log(`${slug}: ${r.pairs} C19 A/B pair(s) → ${args.out} (stills-cloud push; then single-relation-ab.js blind/judge/tally)`); process.exit(0); }
  if (cmd === "apply") {
    const e = RO.eligibility(root, slug);
    if (!e.ok) { console.error(`✗ not eligible: ${e.reasons.join("; ")}`); process.exit(2); }
    // the book's own worktree renders it: a pin without the scene.shots renderer would silently ignore the sequence
    if (!/scene\.id\}#\$\{k \+ 1\}/.test(fs.readFileSync(path.join(root, "src/engines/antidote/index.tsx"), "utf8"))) { console.error("✗ not eligible for C19: this worktree's renderer has no scene.shots (pinned before C19) — never repin silently"); process.exit(2); }
    const cfgPath = path.join(B, "config.antidote.json"), cfg = readJSON(cfgPath), sel = readJSON(path.resolve(args.selection || path.join(SR, "c19", "selection.json")));
    if (!sel) { console.error("--selection (single-relation-rollout.js select --contracts=<book>/single-relation/c19 …)"); process.exit(2); }
    const r = plan(root, slug, cfg, sel);
    for (const k of r.kept) console.log(`  keep — sequence ${k.sceneIndex}: ${k.why}`);
    for (const en of r.entries) console.log(`  C19 sequence ${en.sceneIndex} (beats ${en.beats.join("+")}; A/B ${en.ab.A}→${en.ab.B}): ${en.preview.map((p) => `#${p.sceneIndex} ${p.timecode} [${p.shots.map((s) => s.at).join(", ")}]`).join(" · ")}`);
    if (!args.write) { console.log(`dry run: ${r.entries.length} sequence(s) would be applied`); process.exit(0); }
    if (!r.entries.length) { console.log("no C19 sequence applied (reasons above)"); process.exit(0); }
    const active = readJSON(path.join(SR, "active.json")) || { schema: "single-relation-active/1", policy: RO.POLICY.id, scenes: [], kept: [], reverted: [] };
    fs.mkdirSync(path.join(SR, "active-contracts"), { recursive: true });
    for (const en of r.entries) fs.copyFileSync(path.join(SR, "c19", "contracts", `${en.sceneIndex}.json`), path.join(SR, "active-contracts", `c19-${en.sceneIndex}.json`));
    active.scenes = [...active.scenes.filter((s) => !(s.kind === "c19" && r.entries.some((en) => en.sceneIndex === s.sceneIndex))), ...r.entries];
    // a sequence applied again after a revert is live again (status / revert skip the scenes listed as reverted)
    active.reverted = (active.reverted || []).filter((i) => !r.entries.some((en) => en.sceneIndex === i));
    active.keptC19 = r.kept; active.at = new Date().toISOString();
    fs.writeFileSync(path.join(SR, "active.json"), JSON.stringify(active, null, 1));
    fs.writeFileSync(cfgPath, JSON.stringify(r.config, null, 2));
    console.log(`✓ applied ${r.entries.length} C19 sequence(s) — recorded in single-relation/active.json (revert: single-relation-rollout.js revert --scenes=<first beat> --write)`);
    process.exit(0);
  }
  console.error(`unknown command ${cmd}`); process.exit(2);
}
