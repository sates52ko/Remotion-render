#!/usr/bin/env node
/**
 * vox-image-recovery.js — recover Vox images that Flux refused / failed / never made (skill: vox-image-recovery).
 * Standing operator decision 2026-11-13 (data/vox-image-recovery-policy.json): no approval needed, hard caps —
 * at most `maxRoundsPerBeat` recovery rounds per beat and `maxCallsPerBook` Flux calls per book; past that the beat
 * becomes a text beat (authored), reported in the hand-off.
 *
 *   node scripts/vox-image-recovery.js status --slug=<s> [--root=<checkout>] [--json] [--read-only] [--soft]
 *       lost images, class, what to re-author (file + beat), budget left; records the baseline subject of each newly
 *       lost beat in books/<s>/image-recovery.json (so a "rewrite" is checked to be one). Exit 0 = nothing lost,
 *       1 = work to do, 3 = only text conversions left (budget used), 4 = OPERATOR (Flux key / quota / credits).
 *   node scripts/vox-image-recovery.js run --slug=<s> [--root=<checkout>] [--dry]
 *       one recovery round: make-book (re-plans from designs.json, so the rewritten subjects reach the config) with
 *       --image-beats=<ready beats> --image-max-calls=<cap>; then records the calls spent and the outcome per beat.
 *       Refuses while a beat that needs a rewrite still has its old subject, waits for its text conversion, or the
 *       storyboard is not merged. After a batch that failed everywhere without a filter verdict it sends ONE probe call.
 *
 * Never edits config.vox.json or the storyboard, never touches engine code. Exit 2 = usage / refused.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const R = require("./lib/vox-image-recovery");

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, ...v] = a.slice(2).split("="); return [k, v.length ? v.join("=") : true]; }));
const cmd = process.argv.slice(2).find((a) => !a.startsWith("--")) || "status";
const SLUG = args.slug;
const ROOT = path.resolve(typeof args.root === "string" ? args.root : path.join(__dirname, ".."));
if (!SLUG || !["status", "run"].includes(cmd)) {
  console.error("Usage: node scripts/vox-image-recovery.js status|run --slug=<slug> [--root=<checkout>] [--json] [--read-only] [--dry]");
  process.exit(2);
}
const B = path.join(ROOT, "books", SLUG);
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function print(diag) {
  const p = diag.policy;
  console.log(`\nVox image recovery — ${SLUG}   budget: ${diag.spent}/${p.maxCallsPerBook} Flux calls spent, ${diag.left} left · max ${p.maxRoundsPerBeat} rounds per beat (operator standing decision ${p.date || ""})`);
  if (diag.state === "not-vox") { console.log("  not a Vox book — nothing to do."); return; }
  if (diag.state === "no-config") { console.log("  no config.vox.json / designs.json yet — run make-book first."); return; }
  if (diag.structural) { console.log(`  ✗ ${diag.structural}\n  → re-run make-book (the config is not from this storyboard), then status again.`); return; }
  if (diag.state === "clean") { console.log("  ✓ every authored image is in the config and on disk — nothing lost."); return; }
  const by = {};
  for (const x of diag.lost) (by[x.action] = by[x.action] || []).push(x);
  for (const x of diag.lost) {
    console.log(`\n  ${x.beat} [${x.type}] ${x.cls} → ${x.action}${x.rounds ? `  (rounds used ${x.rounds}/${p.maxRoundsPerBeat})` : ""}`);
    console.log(`    subject (${x.subjectChars} ch): ${x.subject.slice(0, 160)}${x.subject.length > 160 ? "…" : ""}`);
    if (x.triggers.length) console.log(`    filter words: ${x.triggers.join(", ")}`);
    if (x.lastError) console.log(`    last error: ${x.lastError}`);
    if (x.authoredFile) console.log(`    author it in: ${x.authoredFile}  (entry "i": ${x.i})`);
    console.log(`    ${R.ADVICE[x.action === "GENERATE" ? (x.needsRewrite ? "READY" : x.cls) : x.action === "REWRITE" ? x.cls : x.action]}`);
    if (x.action === "REWRITE" && x.needsRewrite && !x.rewritten && x.tried) console.log("    (the current subject was already tried — it must change)");
  }
  if (diag.apiProblem) console.log(`\n  ⚠ the last Flux batch (${diag.apiProblem.at}) failed on all ${diag.apiProblem.images} image(s) with no filter verdict — an API problem, not the storyboard: ${diag.apiProblem.lastError}. The next run sends ONE probe call first; no beat is converted to text for it.`);
  console.log("\n  NEXT:");
  if (by.OPERATOR) { console.log(`   STOP — OPERATOR: Flux refused the call itself (${by.OPERATOR[0].lastError}). The key / quota / credits are the operator's; report this line, never print the key.`); return; }
  if (by.REWRITE) console.log(`   1. Re-author ${by.REWRITE.map((x) => x.beat).join(", ")} in the authored-K.json files named above (same moment, new subject).`);
  if (by.TO_TEXT) console.log(`   ${by.REWRITE ? "2" : "1"}. Convert ${by.TO_TEXT.map((x) => x.beat).join(", ")} to text beats (type + text from the narration, no image).`);
  if (by.REWRITE || by.TO_TEXT) console.log(`   then: node scripts/storyboard.js merge --slug=${SLUG} --write`);
  if (by.CUTOUT) console.log(`   cut-outs: python scripts/cutout.py books/${SLUG}/config.vox.json  (after deleting the empty -cut.png of ${by.CUTOUT.map((x) => x.beat).join(", ")})`);
  if (by.REWRITE || by.GENERATE) console.log(`   then: node scripts/vox-image-recovery.js run --slug=${SLUG}   (make-book + capped Flux, no approval needed)`);
  else console.log(`   then: make-book as usual (preview-state.js status prints it) — no Flux call needed.`);
  console.log("   afterwards: node scripts/preview-state.js status --slug=" + SLUG + "  (a changed config needs a FRESH mute holdout — status names it)");
}

const WRITE = !args["read-only"];
const POLICY = R.loadPolicy(path.join(__dirname, ".."));   // the operator's decision travels with the TOOLS, not the book
const diagnose = (l) => R.diagnose({ root: ROOT, slug: SLUG, policy: POLICY, ledger: l });
if (!WRITE && cmd === "run") { console.error("✗ run records the round — it cannot be --read-only"); process.exit(2); }
const ledger = R.loadLedger(ROOT, SLUG);
let diag = diagnose(ledger);
if (fs.existsSync(B) && diag.lost.length && R.recordBaseline(ledger, diag)) { if (WRITE) R.saveLedger(ROOT, SLUG, ledger); diag = diagnose(ledger); }
try { if (WRITE && fs.existsSync(B) && !["not-vox", "no-config"].includes(diag.state)) fs.writeFileSync(path.join(B, "image-recovery.report.json"), JSON.stringify({ at: new Date().toISOString(), state: diag.state, spent: diag.spent, left: diag.left, apiProblem: diag.apiProblem, lost: diag.lost }, null, 1)); } catch {}
const EXIT = { clean: 0, "not-vox": 0, "no-config": 2, work: 1, exhausted: 3, operator: 4 };

if (cmd === "status") {
  if (args.json) console.log(JSON.stringify(diag, null, 1)); else print(diag);
  process.exit(args.soft ? 0 : EXIT[diag.state] ?? 1);   // --soft (make-book 6.1): report, never block
}

// ── run: one capped recovery round ──────────────────────────────────────────
if (diag.state === "not-vox" || diag.state === "no-config" || diag.state === "clean") { print(diag); process.exit(diag.state === "clean" ? 0 : 2); }
if (diag.state === "operator") { print(diag); process.exit(4); }
if (diag.staleMerge) { console.error(`✗ an authored-K.json is newer than designs.json — merge first: node scripts/storyboard.js merge --slug=${SLUG} --write`); process.exit(2); }
const pending = diag.lost.filter((x) => x.action === "REWRITE" || x.action === "TO_TEXT");
if (pending.length) {
  print(diag);
  console.error(`\n✗ refused: ${pending.map((x) => `${x.beat} (${x.action})`).join(", ")} — re-author first (a refused subject only spends calls again; a beat still waiting for its text conversion would come back into the config without an image), merge, then run.`);
  process.exit(2);
}
const ready = diag.lost.filter((x) => x.action === "GENERATE");
if (!ready.length) { print(diag); console.log("\nNothing to generate in this round."); process.exit(EXIT[diag.state] ?? 1); }
const probe = !!diag.apiProblem;   // the last batch failed everywhere without a filter verdict: ask Flux ONCE before spending more
// one image per problem line (a compare beat can miss one side or both), `attemptsPerImage` calls each
const need = ready.reduce((a, x) => a + Math.max(1, x.problems.filter((p) => !/cut-out/.test(p)).length) * POLICY.attemptsPerImage, 0);
const cap = probe ? Math.min(1, diag.left) : Math.min(diag.left, need);
if (cap <= 0) { print(diag); console.error("\n✗ the book's Flux budget is used — convert the remaining beats to text (status lists them)."); process.exit(3); }
const book = readJSON(path.join(B, "book.json")) || {};
const q = (s) => `"${String(s || "").replace(/"/g, '\\"')}"`;
const beats = (probe ? ready.slice(0, 1) : ready).map((x) => x.beat);
const mb = ["scripts/make-book.js", `--slug=${SLUG}`, `--title=${book.title || ""}`, `--author=${book.author || ""}`, `--genre=${book.genre || "fiction"}`, "--skip-pack", `--image-beats=${beats.join(",")}`, `--image-max-calls=${cap}`];
console.log(probe
  ? `\nProbe round: the last Flux batch failed on every image without a filter verdict (${diag.apiProblem.lastError}). One call on ${beats[0]} first — not counted as a beat round.`
  : `\nRecovery round: ${beats.length} beat(s), at most ${cap} Flux call(s) (book budget left ${diag.left}).`);
console.log(`  node ${mb.map((a, k) => (k > 0 && /^--(title|author)=/.test(a) ? a.replace(/=(.*)$/, (_, v) => "=" + q(v)) : a)).join(" ")}`);
if (args.dry) { console.log("DRY: nothing run, nothing recorded."); process.exit(0); }

const startedAt = new Date().toISOString();
const r = spawnSync(process.execPath, mb, { cwd: ROOT, stdio: "inherit" });
const rep = (readJSON(path.join(B, "images.report.json")) || {}).images || [];
const mine = rep.filter((x) => beats.includes(x.beat) && x.at && x.at.slice(0, 19) >= startedAt.slice(0, 19) && x.outcome !== "skipped-existing");
const calls = mine.reduce((a, x) => a + (x.attempts || 0), 0);
const results = Object.fromEntries(beats.map((b) => {
  const xs = mine.filter((x) => x.beat === b);
  return [b, !xs.length || xs.every((x) => x.outcome === "not-attempted-cap") ? "not-attempted" : xs.every((x) => x.outcome === "ok") ? "ok" : "failed"];
}));
const led = R.loadLedger(ROOT, SLUG);
led.rounds.push({ at: startedAt, probe, beats, maxCalls: cap, calls, results, subjectSha: Object.fromEntries(ready.map((x) => [x.beat, x.subjectSha])), makeBookExit: r.status });
R.saveLedger(ROOT, SLUG, led);
console.log(`\nRound recorded: ${calls} Flux call(s) — ${Object.entries(results).map(([b, o]) => `${b} ${o}`).join(", ")}.`);
const after = diagnose(R.loadLedger(ROOT, SLUG));
print(after);
if (r.status !== 0) { console.error(`\n⚠ make-book exited ${r.status}: read its ❌ line (a gate is a storyboard fix; a crash is transient → run again).`); process.exit(1); }
process.exit(EXIT[after.state] ?? 1);
