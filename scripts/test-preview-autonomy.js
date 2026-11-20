#!/usr/bin/env node
// PREVIEW AUTONOMY (2026-10-29). The real case: the-magician-s-nephew (Vox, pinned 0a1365c2) — make-book PASS, 30 beats
// sealed, then the agent asked "Seal tamam; mute test'e devam etmemi ister misiniz?". Root cause: the session was
// opened in the stale main checkout and carried THAT checkout's preview-hazirla skill (24d7186d: no autonomy section);
// the pinned worktree's own skill said "the whole mute test … proceed without asking", and preview-state knew the next
// step — the agent never ran it. Fix: the contract travels in the TOOL OUTPUT every harness reads:
//   O. a pinned book is told when the preview PROCEDURE moved on since its pin (engine stays pinned);
//   P. every stage tool ends by pointing at `preview-state status` with "routine, without asking";
//   (K-N, the state machine's CONTINUE / OPERATOR output per stage, are in test-preview-state.js)
// Run: node scripts/test-preview-autonomy.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const PS = path.join(__dirname, "preview-state.js");
const NS = require("./lib/next-step");

// ── P. the stage tools route back to the state machine, with the contract ─────────────────────────────────────────
t("P. the routing line names the status command, 'without asking', and the real gates only", /preview-state\.js status --slug=x/.test(NS.nextStepLine("x", "Seal")) && /without asking the operator/.test(NS.ROUTINE) && /accepting quality debt, the final render, upload \/ publish, cleanup/.test(NS.GATES));
const src = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const MT = src("mute-test.js");
for (const [step, re] of [["seal", /nextStepLine\(SLUG, "Seal"\)/], ["sample render", /nextStepLine\(SLUG, "Sample render"\)/], ["judge input", /nextStepLine\(SLUG, "Judge input"\)/], ["tally (PASS and FAIL)", /nextStepLine\(SLUG, `Tally \(\$\{pass \? "PASS" : "FAIL"\}\)`\)/]])
  t(`P. mute-test ${step} ends with the routing line`, re.test(MT));
t("P. make-book (Vox and Antidote) says it is ONE step of the preview and routes on", (src("make-book.js").match(/make-book is ONE step/g) || []).length === 2 && (src("make-book.js").match(/nextStepLine\(SLUG, "make-book"\)/g) || []).length === 2);
t("P. readcheck tally routes on", /nextStepLine\(SLUG, "Readcheck tally"\)/.test(src("readcheck.js")));

// ── O. procedure drift on a pinned worktree: told, never changed ──────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preview-autonomy-"));
try {
  const g = (...a) => execFileSync("git", a, { cwd: tmp, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  const skill = path.join(tmp, ".claude", "skills", "preview-hazirla", "SKILL.md");
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, "old procedure\n"); g("add", "-A"); g("commit", "-q", "-m", "pin");
  const pin = g("rev-parse", "HEAD");
  fs.writeFileSync(skill, "old procedure\n\n**Autonomy** Routine, proceed without asking\n"); g("commit", "-q", "-am", "newer procedure");
  g("update-ref", "refs/remotes/origin/god-mode", g("rev-parse", "HEAD"));
  g("checkout", "-q", "--detach", pin);
  const before = fs.readFileSync(skill, "utf8");
  const r = spawnSync(process.execPath, [PS, "status", "--slug=zz-pinned", `--root=${tmp}`], { encoding: "utf8" });
  const j = JSON.parse(spawnSync(process.execPath, [PS, "status", "--slug=zz-pinned", `--root=${tmp}`, "--json"], { encoding: "utf8" }).stdout);
  t("O. pinned behind origin and the skill changed -> told to follow origin's canonical skill (engine stays pinned)", /the preview PROCEDURE changed on origin since this pin \(\.claude\/skills\/preview-hazirla\/SKILL\.md\)/.test(r.stdout) && /The engine stays pinned/.test(r.stdout) && j.procedureDrift && j.procedureDrift.pin === pin.slice(0, 8), r.stdout.slice(0, 500));
  t("O. status changed nothing: HEAD and the pinned skill are untouched", g("rev-parse", "HEAD") === pin && fs.readFileSync(skill, "utf8") === before);
  g("checkout", "-q", "--detach", "origin/god-mode");
  t("O. on the current procedure -> no drift note", !JSON.parse(spawnSync(process.execPath, [PS, "status", "--slug=zz-pinned", `--root=${tmp}`, "--json"], { encoding: "utf8" }).stdout).procedureDrift);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ── the entry files say the same (every harness) ─────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, "..");
for (const f of ["CLAUDE.md", "AGENTS.md"]) t(`entry ${f}: the engine stays pinned, the procedure follows origin; routine steps without asking`, /The ENGINE stays the book's pin; the preview PROCEDURE does not age with it/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
for (const f of [".agents/workflows/preview-hazirla.md", ".cursor/rules/antidote-agents.mdc"]) t(`entry ${f}: driven by preview-state status`, /preview-state\.js status/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
// 2026-10-30: Trust Fall + The Art of Strategy knew the next step and still ended the turn with a question
for (const f of ["CLAUDE.md", "AGENTS.md", ".agents/workflows/preview-hazirla.md", ".cursor/rules/antidote-agents.mdc"])
  t(`entry ${f}: the turn never ends on CONTINUE (no "Devam edeyim mi?", no interim report)`, /turn never ends on CONTINUE/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
{
  const sk = fs.readFileSync(path.join(ROOT, ".claude", "skills", "preview-hazirla", "SKILL.md"), "utf8");
  t("canonical skill: §2 'Never end your turn on CONTINUE' + §5 HAZIR DEĞİL only at an OPERATOR stop", /Never end your turn on CONTINUE/.test(sk) && /HAZIR DEĞİL report is written ONLY at an OPERATOR stop/.test(sk));
  t("canonical skill: the bible draft's heuristic fields are routine to correct", /correcting them from the narration is routine, never a question/.test(sk));
  t("canonical skill: COVERED / AUTHORIZED and --authorize-render (the render go is its own record)", /COVERED \/ AUTHORIZED/.test(sk) && /--authorize-render/.test(sk));
  const NS = require("./lib/next-step");
  t("tool contract (every stage tool): 'Do NOT end your turn while status says CONTINUE'", /Do NOT end your turn while status says CONTINUE/.test(NS.ROUTINE) && NS.nextStepLine("x", "Y").includes(NS.KEEP_GOING));
  const src = (f) => fs.readFileSync(path.join(ROOT, "scripts", f), "utf8");
  t("merge --write routes to status (no longer 'next: make-book' — wrong for Antidote, where status says readcheck)", /nextStepLine\(SLUG, "Merge"\)/.test(src("storyboard.js")) && !/art\.json — next: node scripts\/make-book/.test(src("storyboard.js")) && /preview-state\.js status \(it names the next step/.test(src("lib/merge-recovery.js")));
  t("prep, readcheck readers / judges, own-icon naming print the routine contract", /Running the authors is a/.test(src("storyboard.js")) && /Running the blind readers is a/.test(src("readcheck.js")) && /Running the judges is a/.test(src("readcheck.js")) && /Naming the icons \(a fresh blind agent\) is a/.test(src("own-icons-sheet.js")));
  t("plan-bible --emit and --bible print the contract; preview-ready READY routes to the hand-off + YouTube pack, the render stays the operator's", /Rewriting this draft is a/.test(src("plan-bible.js")) && /nextStepLine\(SLUG, "Story bible"\)/.test(src("plan-bible.js")) && /READY recorded\. Next \(routine, no question\)/.test(src("preview-ready.js")) && /The production render is NOT routine/.test(src("preview-ready.js")));
}
console.log(failed ? `\n${failed} FAILED` : "\nall preview-autonomy checks passed");
process.exit(failed ? 1 : 0);
