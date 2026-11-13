#!/usr/bin/env node
/**
 * single-relation-rollout.js — operator-approved SELECTIVE production activation of single-relation scenes
 * (cycle 17; policy data/single-relation-rollout.json). Level 2 stays INCONCLUSIVE; this is the operator's separate,
 * reversible rollout for NEW Antidote books only. Runs from the current code against a book worktree (--book-root),
 * like the render-status launcher: a pinned book keeps its pin, its renderer already draws singleRelation (≥ 0296a84d).
 *
 *   check   --slug=<s> --book-root=<wt>                      eligibility (engine, frozen, rendered, pin) — exit 0/2
 *   select  --slug --book-root --contracts=<dir> --ab=<ab-result.json> [--out=<selection.json>]
 *           beats whose contract is VALID and whose A/B shows B > A with no added wrong inference / polarity / wrong
 *           cause; at most policy.perBook.maxScenes; every other beat keeps A, with the reason
 *   apply   --slug --book-root --selection=<selection.json> [--write]
 *           re-validates each contract against its scene's narration, compiles it, seals it as the beat's authored
 *           decision (lib/single-relation sealAuthored), sets meta.singleRelation, records provenance + the previous
 *           scenes in books/<s>/single-relation/active.json (+ active-contracts/). Dry run without --write.
 *   status  --slug --book-root                               ACTIVE / MISSING (config rebuilt → reapply) / NONE
 *   reapply --slug --book-root [--write]                     put the recorded scenes back after a make-book rebuild
 *   revert  --slug --book-root [--scenes=12,40] --write      back to A (all, or the listed scenes)
 *
 * Never: a published / production-rendered / non-Antidote / old-pin book; more than maxScenes; an invalid contract;
 * a beat without an A/B win. Gates (readcheck, firewall, mute, preview-ready) are not touched — run them after apply.
 * Regression: scripts/test-single-relation-rollout.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const SR = require("./lib/single-relation");
const { apply: applyContracts } = require("./apply-single-relation");

const HERE = path.join(__dirname, "..");
const POLICY = JSON.parse(fs.readFileSync(path.join(HERE, "data", "single-relation-rollout.json"), "utf8"));
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
/** frame → m:ss.f at 30 fps (the preview timecode of a B scene) */
const tc = (f) => { const s = f / 30; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s * 10) % 10)}`; };
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

function paths(root, slug) {
  const B = path.join(root, "books", slug);
  return { B, cfg: path.join(B, "config.antidote.json"), dir: path.join(B, "single-relation"), active: path.join(B, "single-relation", "active.json"), contracts: path.join(B, "single-relation", "active-contracts") };
}

/** {ok, reasons[]} — every reason is a refusal */
function eligibility(root, slug, { git = (a) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() } = {}) {
  const P = paths(root, slug), why = [];
  const book = readJSON(path.join(P.B, "book.json"));
  if (!book) why.push(`books/${slug}/book.json missing`);
  else if (book.engine !== POLICY.scope.engine) why.push(`engine ${book.engine || "?"} — the rollout is Antidote only`);
  let frozen = false;
  try { frozen = require("./lib/frozen").isFrozen(slug, root); } catch { try { frozen = new RegExp(`\\b${slug}\\b`).test(fs.readFileSync(path.join(root, "PUBLISHED_BOOKS.md"), "utf8")); } catch {} }
  if (frozen) why.push("published (frozen) book");
  const rendered = [path.join(root, `.render-github-split.${slug}.json`), path.join(root, `.render-github-cloud.${slug}.json`), path.join(root, "out", `${slug}.mp4`)].filter((f) => fs.existsSync(f));
  const dec = readJSON(path.join(P.B, "render-decisions.json"));
  if (dec && JSON.stringify(dec).includes("authoriz")) rendered.push(`books/${slug}/render-decisions.json (render authorization)`);
  if (rendered.length) why.push(`production render started: ${rendered.map((f) => path.basename(f)).join(", ")}`);
  const pin = readJSON(path.join(P.B, "production-base.json"));
  if (!pin || !pin.productionBase) why.push("no engine pin (production-base.json) — the rollout is for pinned production worktrees");
  else for (const need of POLICY.scope.pinContains) {
    try { git(["merge-base", "--is-ancestor", need, pin.productionBase]); } catch { why.push(`pin ${pin.productionBase.slice(0, 8)} does not contain ${need} (the single-relation renderer) — never repin for this`); }
  }
  if (!fs.existsSync(P.cfg)) why.push(`books/${slug}/config.antidote.json missing (plan the book first)`);
  return { ok: why.length === 0, reasons: why, pin: pin && pin.productionBase };
}

/** choose the beats that get B; everything else keeps A with its reason */
function select(contractsDir, ab, { maxScenes = POLICY.perBook.maxScenes } = {}) {
  const rec = readJSON(path.join(contractsDir, "contracts.json"), {}) || {};
  const valid = new Set((rec.valid || []).map(Number));
  const rows = new Map((ab.rows || ab).map((r) => [Number(r.sceneIndex), r]));
  const all = [...new Set([...valid, ...Object.keys(rec.contracts || {}).map(Number), ...rows.keys()])].sort((a, b) => a - b);
  const chosen = [], kept = [];
  for (const i of all) {
    const r = rows.get(i), c = (rec.contracts || {})[i] || {};
    let why = null;
    if (!valid.has(i)) why = "contract invalid";
    else if (r && r.dropped) why = r.dropped;
    else if (!r) why = "no A/B result";
    else if (!(r.B > r.A)) why = `A/B: B ${r.B} not above A ${r.A}`;
    else if ((r.wiB || 0) > (r.wiA || 0)) why = `A/B: more wrong inferences with B (${r.wiB} > ${r.wiA})`;
    else if ((r.polB || 0) > 0) why = `A/B: polarity error with B (${r.polB})`;
    else if ((r.cwB || 0) > 0) why = `A/B: wrong cause with B (${r.cwB})`;
    // cycle 18 veto: the narration review saw a wrong object / action / causality in B (muted score notwithstanding)
    else if (r.veto) why = `narration veto (${r.veto.kind}): narration "${r.veto.narrationPart}" — on screen: ${r.veto.onScreen}`;
    else if (r.avReviewed !== true) why = "no narration review for this beat (single-relation-ab.js PROMPTS §3)";
    if (why) kept.push({ sceneIndex: i, keep: "A", why });
    else chosen.push({ sceneIndex: i, contract: path.join(contractsDir, "contracts", `${i}.json`), contractHash: c.contractHash || null, review: c.review ? c.review.verdict : null, ab: { A: r.A, B: r.B, wiA: r.wiA || 0, wiB: r.wiB || 0, bContractHash: r.bContractHash || null } });
  }
  // C19 sequences (contracts with beats): two winners that share a beat → one chosen WHOLE, the other keeps A (reason)
  const seqBeats = (c) => { const k = readJSON(c.contract); return k && Array.isArray(k.beats) ? k.beats.map((b) => Number(b.sceneIndex)) : null; };
  const seqs = chosen.map((c) => ({ c, beats: seqBeats(c) })).filter((x) => x.beats);
  if (seqs.length > 1) {
    const r = require("./lib/c19-sequence").resolveOverlaps(seqs.map((x) => ({ sceneIndex: x.c.sceneIndex, beats: x.beats, ab: x.c.ab })));
    for (const k of r.kept) { chosen.splice(chosen.findIndex((c) => c.sceneIndex === k.sceneIndex), 1); kept.push(k); }
  }
  // a cap only when the policy sets one (cycle 18: the operator removed it — every B that wins and passes goes in)
  chosen.sort((x, y) => (y.ab.B - y.ab.A) - (x.ab.B - x.ab.A) || x.sceneIndex - y.sceneIndex);
  if (Number.isInteger(maxScenes)) for (const c of chosen.splice(maxScenes)) kept.push({ sceneIndex: c.sceneIndex, keep: "A", why: `over the per-book cap ${maxScenes}` });
  chosen.sort((x, y) => x.sceneIndex - y.sceneIndex);
  kept.sort((x, y) => x.sceneIndex - y.sceneIndex);
  return { schema: "single-relation-selection/1", policy: POLICY.id, maxScenes, chosen, kept };
}

/** build the new config + the provenance record (nothing written) */
function plan(config, selection, { now = new Date().toISOString(), tool = null } = {}) {
  const cap = POLICY.perBook.maxScenes;
  if (Number.isInteger(cap) && selection.chosen.length > cap) return { ok: false, errors: [`${selection.chosen.length} scenes > the per-book cap ${cap}`] };
  const raw = Object.fromEntries(selection.chosen.map((c) => [c.sceneIndex, readJSON(c.contract)]));
  for (const [i, c] of Object.entries(raw)) if (!c) return { ok: false, errors: [`scene ${i}: contract file unreadable`] };
  // cycle 18 timing rule: the narrator's result phrase must be found in the word timings and the compiled change may
  // not start before it (and must fit, held, in the beat) — otherwise THAT B is dropped and its scene keeps A; the
  // others go on. A passing contract goes in anchored (its derived anchors written into it).
  // validity per beat (operator, cycle 19): a contract invalid at apply time keeps ITS scene's A with the validator's
  // reason; the other valid B scenes go on (it used to refuse the whole apply)
  const { wordsOf } = require("./apply-single-relation");
  const contracts = {}, timing = {}, dropped = [];
  for (const [i, c] of Object.entries(raw)) {
    const one = applyContracts(config, { [i]: c });
    if (!one.ok) { dropped.push({ sceneIndex: Number(i), keep: "A", why: `invalid at apply: ${one.errors.slice(0, 3).join("; ")}` }); delete raw[i]; }
  }
  for (const [i, c] of Object.entries(raw)) {
    const v = SR.verifyTiming(c, config.scenes[i], wordsOf(config, config.scenes[i]));
    if (!v.ok) { dropped.push({ sceneIndex: Number(i), keep: "A", why: `timing: ${v.reason}` }); continue; }
    // a narration review counts only for the B it looked at (cycle 19): missing, or made for a different B → keep A
    const sel = selection.chosen.find((x) => x.sceneIndex === Number(i)) || {};
    const reviewed = sel.ab && sel.ab.bContractHash, applying = sha(JSON.stringify(v.contract));
    if (!reviewed) { dropped.push({ sceneIndex: Number(i), keep: "A", why: "no valid narration review: the A/B result does not name the B it reviewed" }); continue; }
    if (reviewed !== applying) { dropped.push({ sceneIndex: Number(i), keep: "A", why: `no valid narration review: it reviewed B ${reviewed}, apply would ship B ${applying} (the contract or its timing changed since)` }); continue; }
    contracts[i] = v.contract; timing[i] = { events: v.events, derived: v.derived || [] };
  }
  selection = { ...selection, chosen: selection.chosen.filter((c) => contracts[c.sceneIndex]), kept: [...(selection.kept || []), ...dropped] };
  if (!selection.chosen.length) return { ok: true, config, contracts: {}, record: { schema: "single-relation-active/1", policy: POLICY.id, at: now, tool, configBefore: sha(JSON.stringify(config)), configAfter: sha(JSON.stringify(config)), scenes: [], kept: selection.kept.sort((a, b) => a.sceneIndex - b.sceneIndex), reverted: [] } };
  const r = applyContracts(config, contracts);
  if (!r.ok) return r;
  const scenes = [];
  for (const sel of selection.chosen) {
    const i = sel.sceneIndex, c = contracts[i];
    const contractHash = sha(JSON.stringify(c));
    const prov = { contractHash, author: c._author || null, mechanism: c.mechanism || null, ab: sel.ab, policy: POLICY.id, at: now };
    r.config.scenes[i] = SR.sealAuthored(r.config.scenes[i], prov);
    const before = config.scenes[i], after = r.config.scenes[i];
    const who = (s) => (s.characters || []).map((x) => x.identity || x.role || "?").join("+") || "none";
    scenes.push({ sceneIndex: i, sceneId: before.id, narrationHash: sha(String(before._narration || "")), contractHash, mechanism: c.mechanism || null, review: sel.review, ab: sel.ab, timing: timing[i],
      preview: { fromFrame: before.fromFrame, toFrame: before.fromFrame + before.durationFrames, timecode: `${tc(before.fromFrame)}–${tc(before.fromFrame + before.durationFrames)}` },
      diff: { shot: `${before.shot}→${after.shot}`, cast: `${who(before)}→${who(after)}`, concept: `${before.concept ?? "none"}→${after.concept ?? "none"}` }, previous: before });
  }
  const record = { schema: "single-relation-active/1", policy: POLICY.id, level2: POLICY.level2, at: now, tool, configBefore: sha(JSON.stringify(config)), configAfter: sha(JSON.stringify(r.config)), scenes, kept: selection.kept || [], reverted: [] };
  return { ok: true, config: r.config, record, contracts };
}

/**
 * Can "no B scene" be recorded? Yes with 0 scan candidates; otherwise every candidate needs an author decision
 * (single-relation/author-decisions.json: [{sceneIndex, decision: "skipped"|"contract", why}]) — a contract that was
 * written must have been validated (contracts.json), and a skip needs its reason.
 */
function noneCoverage(dir) {
  const cand = readJSON(path.join(dir, "candidates.json"));
  if (!cand) return { ok: false, why: "no single-relation/candidates.json — run single-relation-scan.js scan first" };
  const ids = (cand.candidates || []).map((c) => Number(c.sceneIndex ?? c.scene ?? c.index));
  if (!ids.length) return { ok: true, candidates: 0, decided: 0 };
  const dec = readJSON(path.join(dir, "author-decisions.json"), []) || [];
  const byIdx = new Map((Array.isArray(dec) ? dec : dec.decisions || []).map((d) => [Number(d.sceneIndex), d]));
  const missing = ids.filter((i) => { const d = byIdx.get(i); return !d || !String(d.why || "").trim() || !["skipped", "contract"].includes(d.decision); });
  if (missing.length) return { ok: false, why: `${ids.length} candidate(s) but no author decision with a reason for ${missing.length} (${missing.slice(0, 8).join(", ")}${missing.length > 8 ? " …" : ""}) — one fresh author decides each candidate (single-relation.md) and writes single-relation/author-decisions.json [{sceneIndex, decision: "skipped"|"contract", why}]` };
  const wrote = ids.filter((i) => byIdx.get(i).decision === "contract");
  const rec = readJSON(path.join(dir, "contracts.json"));
  if (wrote.length && !rec) return { ok: false, why: `contracts were written for ${wrote.join(", ")} but never validated (single-relation-scan.js validate)` };
  const c19 = c19Coverage(dir);
  if (!c19.ok) return c19;
  return { ok: true, candidates: ids.length + c19.candidates, decided: ids.length + c19.candidates };
}

/** C19 (runbook §2e): every sequence candidate has an author decision too (single-relation/author-decisions-c19.json) */
function c19Coverage(dir) {
  const cand = readJSON(path.join(dir, "c19", "candidates.json"));
  const ids = ((cand && cand.candidates) || []).map((c) => Number(c.sceneIndex));
  if (!ids.length) return { ok: true, candidates: 0 };
  const dec = readJSON(path.join(dir, "author-decisions-c19.json"), []) || [];
  const byIdx = new Map((Array.isArray(dec) ? dec : dec.decisions || []).map((d) => [Number(d.sceneIndex), d]));
  const missing = ids.filter((i) => { const d = byIdx.get(i); return !d || !String(d.why || "").trim() || !["skipped", "contract"].includes(d.decision); });
  if (missing.length) return { ok: false, why: `${ids.length} C19 candidate(s) but no author decision with a reason for ${missing.length} (${missing.slice(0, 8).join(", ")}) — one fresh author (c19-sequence.md) writes single-relation/author-decisions-c19.json` };
  if (ids.some((i) => byIdx.get(i).decision === "contract") && !readJSON(path.join(dir, "c19", "contracts.json"))) return { ok: false, why: "C19 contracts were written but never validated (c19.js validate)" };
  return { ok: true, candidates: ids.length };
}

/** ACTIVE (every recorded scene carries its contract), MISSING (config rebuilt), NONE */
function status(config, record) {
  if (!record || !record.scenes.length) return { state: "NONE", missing: [] };
  const live = record.scenes.filter((s) => !(record.reverted || []).includes(s.sceneIndex));
  // C19 sequences (kind "c19"): live when every beat of the contract carries its shots with this contract's hash
  const C19 = require("./lib/c19-sequence");
  const missing = live.filter((s) => {
    if (s.kind === "c19") return !C19.isLive(config, s);
    const sc = config.scenes[s.sceneIndex]; const L = sc && sc._authorship && sc._authorship.lock; return !(sc && sc.singleRelation && L && L.singleRelation && L.singleRelation.contractHash === s.contractHash);
  });
  const off = live.some((s) => s.kind !== "c19") && !(config.meta && config.meta.singleRelation === true);
  return { state: missing.length || off ? "MISSING" : live.length ? "ACTIVE" : "NONE", missing: missing.map((s) => s.sceneIndex), active: live.length - missing.length, metaOff: !!off };
}

function revert(config, record, only = null) {
  const scenes = config.scenes.slice(), done = [];
  for (const s of record.scenes) {
    if ((record.reverted || []).includes(s.sceneIndex)) continue;
    if (only && !only.includes(s.sceneIndex)) continue;
    // a C19 sequence goes back as ONE unit: every beat of the contract returns to its previous version
    if (s.kind === "c19") for (const [i, prev] of Object.entries(s.previousBeats || {})) scenes[Number(i)] = prev;
    else scenes[s.sceneIndex] = s.previous;
    done.push(s.sceneIndex);
  }
  const reverted = [...(record.reverted || []), ...done];
  const left = record.scenes.filter((s) => !reverted.includes(s.sceneIndex) && s.kind !== "c19").length;
  const meta = { ...config.meta };
  if (!left) delete meta.singleRelation;
  return { config: { ...config, meta, scenes }, record: { ...record, reverted }, done };
}

module.exports = { POLICY, eligibility, select, plan, status, revert, noneCoverage };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
  const cmd = process.argv[2];
  const slug = args.slug, root = path.resolve(args["book-root"] || HERE);
  if (!cmd || !slug) { console.error("usage: single-relation-rollout.js check|select|apply|status|reapply|revert --slug=<s> --book-root=<wt> …"); process.exit(2); }
  const P = paths(root, slug);
  const toolRev = (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: HERE, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } })();
  const writeCfg = (cfg) => fs.writeFileSync(P.cfg, JSON.stringify(cfg, null, 2));
  const gate = () => { const e = eligibility(root, slug); if (!e.ok) { console.error(`✗ ${slug} is not eligible for the selective rollout:\n  ${e.reasons.join("\n  ")}`); process.exit(2); } return e; };
  if (cmd === "check") { const e = eligibility(root, slug); console.log(e.ok ? `ELIGIBLE ${slug} (pin ${String(e.pin).slice(0, 8)}; policy ${POLICY.id}, ${POLICY.perBook.maxScenes == null ? "no scene cap" : `≤ ${POLICY.perBook.maxScenes} scenes`})` : `NOT ELIGIBLE ${slug}:\n  ${e.reasons.join("\n  ")}`); process.exit(e.ok ? 0 : 2); }
  if (cmd === "select") {
    gate();
    const ab = readJSON(path.resolve(args.ab));
    if (!ab) { console.error("--ab=<ab-result.json> (single-relation-ab.js tally) is required"); process.exit(2); }
    const s = select(path.resolve(args.contracts), ab);
    const out = path.resolve(args.out || path.join(P.dir, "selection.json"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(s, null, 2));
    console.log(`${slug}: B for ${s.chosen.length} scene(s) [${s.chosen.map((c) => c.sceneIndex).join(", ")}]; A kept for ${s.kept.length}\n  ${s.kept.map((k) => `${k.sceneIndex}: ${k.why}`).join("\n  ")}\n→ ${out}`);
    process.exit(0);
  }
  if (cmd === "apply") {
    gate();
    const prior = readJSON(P.active);
    if (prior && prior.scenes.some((s) => !(prior.reverted || []).includes(s.sceneIndex))) { console.error(`✗ ${path.relative(root, P.active)} has live scenes — revert them first (one active record per book)`); process.exit(2); }
    const config = readJSON(P.cfg), selection = readJSON(path.resolve(args.selection || path.join(P.dir, "selection.json")));
    if (!selection) { console.error("--selection=<selection.json> (from `select`) is required"); process.exit(2); }
    const r = plan(config, selection, { tool: toolRev });
    if (!r.ok) { console.error(`✗ refused (nothing written):\n  ${r.errors.join("\n  ")}`); process.exit(1); }
    for (const k of r.record.kept) console.log(`  keep A — scene ${k.sceneIndex}: ${k.why}`);
    if (!r.record.scenes.length) {
      if (!args.write) { console.log("dry run: no B scene survives (see the reasons above)"); process.exit(0); }
      fs.mkdirSync(P.dir, { recursive: true });
      fs.writeFileSync(path.join(P.dir, "rollout.json"), JSON.stringify({ schema: "single-relation-decision/1", decision: "none", reason: "authored and A/B'd; no B survived the A/B, the narration veto and the timing rule", kept: r.record.kept, policy: POLICY.id, at: new Date().toISOString() }, null, 1));
      console.log(`✓ ${slug}: no B scene — recorded with every reason (single-relation/rollout.json)`);
      process.exit(0);
    }
    for (const s of r.record.scenes) console.log(`  scene ${s.sceneIndex} @ ${s.preview.timecode} (${s.mechanism || "-"}; A/B ${s.ab.A}→${s.ab.B}; result "${s.timing.events.map((e) => e.effect).join(" / ")}" said at ${s.timing.events.map((e) => e.effectAt).join(", ")}, change at ${s.timing.events.map((e) => e.changeStart).join(", ")}): shot ${s.diff.shot}, cast ${s.diff.cast}, icon ${s.diff.concept}`);
    if (!args.write) { console.log(`dry run: ${r.record.scenes.length} scene(s) would become single-relation (add --write)`); process.exit(0); }
    fs.mkdirSync(P.contracts, { recursive: true });
    for (const [i, c] of Object.entries(r.contracts)) fs.writeFileSync(path.join(P.contracts, `${i}.json`), JSON.stringify(c, null, 1));
    fs.writeFileSync(P.active, JSON.stringify(r.record, null, 1));
    writeCfg(r.config);
    console.log(`✓ applied ${r.record.scenes.length} scene(s); config ${r.record.configBefore} → ${r.record.configAfter}; record ${path.relative(root, P.active)}. Now re-run the gates (preview-hazirla: readcheck stays, mute test + preview-ready on this config).`);
    process.exit(0);
  }
  const config = readJSON(P.cfg), record = readJSON(P.active);
  if (cmd === "status") {
    const s = status(config, record);
    console.log(s.state === "MISSING" ? `MISSING ${slug}: scenes ${s.missing.join(", ") || "-"}${s.metaOff ? " (meta.singleRelation off)" : ""} lost their contract (config rebuilt) → node scripts/single-relation-rollout.js reapply --slug=${slug} --book-root=${root} --write` : `${s.state} ${slug}${s.state === "ACTIVE" ? `: ${s.active} single-relation scene(s)` : ""}`);
    process.exit(s.state === "MISSING" ? 1 : 0);
  }
  if (cmd === "reapply") {
    // --pipeline (make-book step 1.885): the record is the approval already given — no record = nothing to do
    if (!record) { if (args.pipeline) { console.log(`no single-relation rollout record for ${slug} — nothing to re-apply`); process.exit(0); } console.error("no active record"); process.exit(2); }
    if (!args.pipeline) gate();
    const already = new Set(status(config, record).state === "ACTIVE" ? record.scenes.map((s) => s.sceneIndex) : []);
    const liveAll = record.scenes.filter((s) => !(record.reverted || []).includes(s.sceneIndex) && !already.has(s.sceneIndex));
    if (!liveAll.length) { console.log(`${slug}: every recorded B scene is already in the config`); process.exit(0); }
    // C19 sequences first (each atomic, from its recorded contract), then the single-relation scenes on that config
    let cfgNow = config;
    const C19 = require("./lib/c19-sequence");
    let motifs = {}; try { motifs = JSON.parse(fs.readFileSync(path.join(P.B, "motifs.json"), "utf8")); } catch {}
    for (const s of liveAll.filter((x) => x.kind === "c19")) {
      if (C19.isLive(cfgNow, s)) continue;
      const moved = (s.beats || []).filter((i) => sha(String((cfgNow.scenes[i] || {})._narration || "")) !== (s.narrationHashes || {})[i]);
      if (moved.length) { console.error(`✗ C19 ${s.sceneIndex}: the narration of beat(s) ${moved.join(", ")} changed since the apply — re-author (revert first)`); process.exit(1); }
      const c = readJSON(path.join(P.contracts, `c19-${s.sceneIndex}.json`));
      const r = C19.apply(cfgNow, c, { motifs });
      if (!r.ok) { console.error(`✗ C19 ${s.sceneIndex} refused: ${r.errors.join("; ")}`); process.exit(1); }
      cfgNow = r.config;
    }
    const live = liveAll.filter((x) => x.kind !== "c19");
    if (!live.length) { if (!args.write) { console.log("dry run: C19 sequence(s) would be re-applied"); process.exit(0); } writeCfg(cfgNow); console.log(`✓ re-applied C19 sequence(s) [${liveAll.map((s) => s.sceneIndex).join(", ")}]`); process.exit(0); }
    const changed = live.filter((s) => sha(String((config.scenes[s.sceneIndex] || {})._narration || "")) !== s.narrationHash);
    if (changed.length) { console.error(`✗ the narration of scene(s) ${changed.map((s) => s.sceneIndex).join(", ")} changed since the apply — re-author and re-run select / apply (revert first)`); process.exit(1); }
    const selection = { chosen: live.map((s) => ({ sceneIndex: s.sceneIndex, contract: path.join(P.contracts, `${s.sceneIndex}.json`), review: s.review, ab: s.ab })), kept: record.kept };
    const r = plan(cfgNow, selection, { tool: toolRev });
    if (!r.ok) { console.error(`✗ refused:\n  ${r.errors.join("\n  ")}`); process.exit(1); }
    if (!args.write) { console.log(`dry run: ${live.length} scene(s) would be re-applied`); process.exit(0); }
    writeCfg(r.config);
    // the record is a make-book input (marker): a pipeline re-apply leaves it byte-identical
    if (!args.pipeline) fs.writeFileSync(P.active, JSON.stringify({ ...record, reapplied: [...(record.reapplied || []), { at: new Date().toISOString(), configAfter: r.record.configAfter }] }, null, 1));
    // report what is REALLY in the config: a scene the current rules refuse at re-apply keeps A, with its reason
    const c19n = liveAll.filter((x) => x.kind === "c19").map((x) => x.sceneIndex), done = r.record.scenes.map((s) => s.sceneIndex);
    console.log(`✓ re-applied ${done.length} scene(s) [${done.join(", ")}]${c19n.length ? ` + C19 sequence(s) [${c19n.join(", ")}]` : ""}`);
    const lost = (r.record.kept || []).filter((k) => live.some((s) => s.sceneIndex === k.sceneIndex));
    for (const k of lost) console.log(`  ✗ ${k.sceneIndex} kept A at re-apply: ${k.why} — status will say MISSING; re-run its A/B (single-relation-ab.js) or revert --scenes=${k.sceneIndex} --write`);
    process.exit(0);
  }
  if (cmd === "decide") {
    // the rollout ran and chose no B scene (0 candidates / 0 valid / no A/B win): recorded so the workflow moves on
    if (!args.none || typeof args.reason !== "string" || !args.reason.trim()) { console.error('usage: decide --slug=<s> --book-root=<wt> --none --reason="<counts: candidates, contracts, valid, A/B wins>"'); process.exit(2); }
    // "none" is a finding, not a skip (cycle 18: a book recorded none with 16 candidates and 0 contracts — nobody had
    // authored): with candidates, every one needs an author decision with its reason
    const cov = noneCoverage(P.dir);
    if (!cov.ok) { console.error(`✗ refused: ${cov.why}`); process.exit(1); }
    fs.mkdirSync(P.dir, { recursive: true });
    fs.writeFileSync(path.join(P.dir, "rollout.json"), JSON.stringify({ schema: "single-relation-decision/1", decision: "none", reason: args.reason.trim(), candidates: cov.candidates, decided: cov.decided, policy: POLICY.id, at: new Date().toISOString() }, null, 1));
    console.log(`✓ ${slug}: no B scene — recorded (${args.reason.trim()})`);
    process.exit(0);
  }
  if (cmd === "revert") {
    if (!record) { console.error("no active record — nothing to revert"); process.exit(2); }
    const only = args.scenes ? String(args.scenes).split(",").map(Number) : null;
    const r = revert(config, record, only);
    if (!args.write) { console.log(`dry run: would revert scene(s) ${r.done.join(", ")} to A`); process.exit(0); }
    writeCfg(r.config);
    fs.writeFileSync(P.active, JSON.stringify(r.record, null, 1));
    console.log(`✓ reverted scene(s) ${r.done.join(", ")} to A${r.config.meta.singleRelation ? "" : "; meta.singleRelation off"}`);
    process.exit(0);
  }
  console.error(`unknown command ${cmd}`);
  process.exit(2);
}
