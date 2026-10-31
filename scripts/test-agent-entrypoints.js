#!/usr/bin/env node
// ONE PRODUCTION SYSTEM, EVERY HARNESS (2026-10-26). Claude Code, Antigravity, Cursor and any AGENTS.md reader must
// reach the SAME canonical procedure and the SAME deciding commands; the decisions themselves are code.
//   1. structure: each harness's entry resolves to the canonical files (.claude/skills/<name>/SKILL.md); pointer files
//      stay pointers (short, no procedure tables / command blocks); every canonical procedure is reachable from every
//      harness; no entry defines READY any other way than preview-state READY / preview-ready.
//   2. behaviour: the scenario tests behind the decisions (A-G) pass — test-book-start, test-preview-state,
//      test-run-lock, test-mute-resume — and the matrix shows the same command deciding for every harness.
// This proves the CONTRACT (files + code). It does not run Antigravity or Cursor themselves.
// Run: node scripts/test-agent-entrypoints.js [--structure-only]
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${String(extra).slice(0, 500)}` : ""}`); if (!ok) fail++; };
const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return null; } };
const lines = (txt) => txt.split(/\r?\n/).filter((l) => l.trim()).length;

// ── 1. structure ─────────────────────────────────────────────────────────────
const CANON = fs.readdirSync(path.join(ROOT, ".claude", "skills")).filter((d) => fs.existsSync(path.join(ROOT, ".claude", "skills", d, "SKILL.md")));
const PROCS = ["notebooklm-prompt", "preview-hazirla", "antidote-visual-authoring", "antidote-quality-handoff", "render-deliver"];
t("every shared procedure has its canonical text in .claude/skills/", PROCS.every((p) => CANON.includes(p)), CANON.join(","));
const ENTRY = {
  "Claude Code": { file: "CLAUDE.md", reach: (p) => `.claude/skills/${p}/SKILL.md` },
  Antigravity: { file: ".agents/workflows/preview-hazirla.md", reach: (p) => (p === "preview-hazirla" ? ".agents/workflows/preview-hazirla.md" : `.agents/skills/${p}/SKILL.md`) },
  "Cursor / AGENTS.md": { file: ".cursor/rules/antidote-agents.mdc", reach: () => "AGENTS.md" },
};
const agents = read("AGENTS.md") || "";
for (const [h, e] of Object.entries(ENTRY)) t(`${h}: its entry file exists (${e.file})`, !!read(e.file));
t("AGENTS.md routes every shared procedure to its canonical file", PROCS.every((p) => agents.includes(`.claude/skills/${p}/SKILL.md`)));
t("the Cursor rule loads AGENTS.md and the contract (alwaysApply)", /alwaysApply:\s*true/.test(read(".cursor/rules/antidote-agents.mdc") || "") && /AGENTS\.md/.test(read(".cursor/rules/antidote-agents.mdc") || "") && /AGENT-OPERATING-CONTRACT/.test(read(".cursor/rules/antidote-agents.mdc") || ""));
for (const p of PROCS) {
  const ag = ENTRY.Antigravity.reach(p), txt = read(ag);
  t(`Antigravity reaches ${p}: ${ag} points to the canonical file`, !!txt && txt.includes(`.claude/skills/${p}/SKILL.md`), ag);
}
const POINTERS = [...fs.readdirSync(path.join(ROOT, ".agents", "skills")).filter((d) => PROCS.includes(d)).map((d) => `.agents/skills/${d}/SKILL.md`), ".agents/workflows/preview-hazirla.md", ".cursor/rules/antidote-agents.mdc"];
for (const f of POINTERS) {
  const txt = read(f) || "";
  t(`${f} is a pointer, not a second copy (≤ 30 lines, no procedure table or command block)`, lines(txt) <= 30 && !/^\|.*\|\s*$/m.test(txt) && !/```/.test(txt), `${lines(txt)} lines`);
}
const contract = read("docs/AGENT-OPERATING-CONTRACT.md") || "";
t("the contract names every harness entry", /\.cursor\/rules\/antidote-agents\.mdc/.test(contract) && /\.agents\//.test(contract) && /CLAUDE\.md/.test(contract));
// READY has one definition everywhere it is mentioned
const READY_FILES = ["AGENTS.md", "CLAUDE.md", "docs/AGENT-OPERATING-CONTRACT.md", ".claude/skills/preview-hazirla/SKILL.md", ...POINTERS];
const readyBad = READY_FILES.filter((f) => { const x = read(f) || ""; return /\bHAZIR\b|\bREADY\b/.test(x) && !/preview-state|preview-ready/.test(x); });
t("every entry that talks about READY / HAZIR ties it to preview-state READY / preview-ready", readyBad.length === 0, readyBad.join(", "));
const studioReady = READY_FILES.flatMap((f) => (read(f) || "").split(/\r?\n/)
  .filter((l) => /Studio/.test(l) && /\bREADY\b|\bHAZIR\b/.test(l) && !/\bnot\b|\bnever\b|değil/i.test(l)).map((l) => `${f}: ${l.trim().slice(0, 90)}`));
t("no entry treats Studio opening as READY (every line pairing them says it is not)", studioReady.length === 0, studioReady.join(" | "));
const skill = read(".claude/skills/preview-hazirla/SKILL.md") || "";
const ORDER = ["code", "bible", "own icons", "prep", "authors", "merge", "readcheck", "make-book", "sealed mute test", "preview-ready", "hand-off"];
const orderLine = (skill.match(/The order is the same for every harness:([^\n]*\n[^\n]*)/) || [])[1] || "";
t("the canonical skill states ONE order for every harness (start → bible → icons → authoring → merge → readcheck → make-book → sealed mute → preview-ready → hand-off)", ORDER.every((k, i) => i === 0 || orderLine.indexOf(k) > orderLine.indexOf(ORDER[i - 1])), orderLine);
t("the deciding commands exist", ["scripts/preview-state.js", "scripts/preview-ready.js", "scripts/lib/production-guard.js", "scripts/lib/run-lock.js", "scripts/mute-test.js"].every((f) => fs.existsSync(path.join(ROOT, f))));

// ── 2. behaviour: the same commands decide, whatever the harness ─────────────
if (!process.argv.includes("--structure-only")) {
  const SCEN = [
    ["A current code → a new book starts", "test-book-start.js", /✓ A\. /],
    ["B stale code → prep does not start", "test-book-start.js", /✓ B\. engine code behind origin/],
    ["C stale + operator exception → starts, recorded", "test-book-start.js", /✓ C\. \.\.\.the reason is recorded/],
    ["D dirty main checkout → others' files intact", "test-book-start.js", /✓ D\. \.\.\.the other agent's files are byte-identical/],
    ["E pinned book → stays on its SHA", "test-book-start.js", /✓ E\. \.\.\.its pin is unchanged/],
    ["F mute not finished / no recorded PASS → not READY", "test-preview-state.js", /PASS F\. preview-ready's PASS on this config/],
    ["G same render running → not started twice", "test-run-lock.js", /✓ G\. a second render of the same book/],
    ["G' same mute prep running → not started twice", "test-mute-resume.js", /all mute-resume checks passed|PASS/],
    ["H debt accepted for THIS config → not asked again", "test-gate-routing.js", /✓ H\. the operator's decision for THIS config incl\. the NOT READY preview → COVERED/],
    ["P2 preview NOT READY, no decision → no automatic production render", "test-gate-routing.js", /✓ P2\. preview NOT READY, decision covers only the REVIEW findings → NEEDS_DECISION/],
    ["H' new config / new finding / BLOCK → never covered", "test-gate-routing.js", /✓ H\. a BLOCK is never covered/],
    ["I Step 0: engine decided + prompt READY, no question", "test-step0.js", /✓ skill: no 'stop and discuss'/],
    ["J Vox book: the firewall does not apply (no fake BLOCK)", "test-gate-routing.js", /✓ firewall: a Vox book is NOT_APPLICABLE/],
    // preview autonomy (2026-10-29, the-magician-s-nephew asked after the seal): each routine stage says "without asking"
    ["K make-book PASS → seal: routine, no question", "test-preview-state.js", /PASS K. make-book PASS -> seal is a routine step/],
    ["L seal → render → describer → judge → tally: routine", "test-preview-state.js", /PASS L\. blind describer \/ judge \/ tally: every sub-step is routine/],
    ["M tally FAIL → allowed fix round: routine", "test-preview-state.js", /PASS M. tally FAIL -> the allowed fix round is routine/],
    ["N a real operator state → reported, not run", "test-preview-state.js", /PASS N. a real operator state is reported as one/],
    ["O pinned book → told the procedure moved on", "test-preview-autonomy.js", /✓ O. pinned behind origin and the skill changed/],
    ["P every stage tool routes back to status", "test-preview-autonomy.js", /all preview-autonomy checks passed/],
    // 2026-10-30: Trust Fall + The Art of Strategy asked after the bible, the-magician-s-nephew stuck on an old mute run
    ["Q story bible PASS → prep: routine, never end the turn", "test-plan-bible-grounding.js", /PASS --bible: the review is not a refusal \(exit 0\) and the next step \+ contract follow/],
    ["R wrong bible draft → source-grounded rewrite, no question", "test-plan-bible-grounding.js", /PASS --emit prints the routine contract/],
    ["S merge errors → autonomous repair", "test-merge-recovery.js", /all merge-recovery checks passed/],
    ["T old incomplete mute run → the valid current run", "test-mute-verdict.js", /PASS run3 \(untallied, stills of another config\) is STALE/],
    ["U preview READY → await the operator's render authorization", "test-render-book-root.js", /PASS render-decision: preview READY, no debt, no authorization → NO_DEBT/],
    ["V pinned book → current tools, no credential copy", "test-render-book-root.js", /PASS credentials: the book worktree finds the main checkout's render-accounts\.json in place/],
  ];
  const ran = {};
  for (const [, f] of SCEN) if (!ran[f]) { const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8", timeout: 600000 }); ran[f] = { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") }; }
  console.log("\n scenario                                              | command that decides        | Claude Code | Antigravity | Cursor/AGENTS.md");
  for (const [name, f, re] of SCEN) {
    const ok = ran[f].ok && re.test(ran[f].out);
    const cmd = { "test-book-start.js": "production-guard / preview-state", "test-preview-state.js": "preview-state + preview-ready", "test-run-lock.js": "render.js run-lock", "test-mute-resume.js": "mute-test.js prep lock", "test-gate-routing.js": "render-decision / firewall CLI", "test-step0.js": "make-prompt --check", "test-preview-autonomy.js": "preview-state + stage tools", "test-plan-bible-grounding.js": "plan-bible --emit / --bible", "test-merge-recovery.js": "storyboard.js merge", "test-mute-verdict.js": "preview-state + mute-verdict", "test-render-book-root.js": "render-decision / render.js" }[f];
    const cell = ok ? "same ✓" : "✗";
    console.log(` ${name.padEnd(53)} | ${cmd.padEnd(27)} | ${cell.padEnd(11)} | ${cell.padEnd(11)} | ${cell}`);
    if (!ok) fail++;
  }
  console.log(" (every harness runs the same command; a cell is ✓ when that command's executable scenario test passes — not a run of the harness itself)");
}
console.log(fail ? `\n${fail} FAILED` : "\nall agent-entrypoint checks passed");
process.exit(fail ? 1 : 0);
