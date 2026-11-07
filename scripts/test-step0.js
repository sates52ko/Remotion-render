#!/usr/bin/env node
// STEP 0 (NotebookLM prompt) — the agent decides the engine and finishes the prompt; the operator is not asked to pick
// (2026-10-27, The Magician's Nephew: the rubric gave a fantasy Vox because of its frame year, the agent disagreed,
// asked the operator, and the prompt stayed a scaffold that looked "done"). Proves on a throwaway slug:
//   profile → rubric decision + rationale recorded; a contradicting override needs an argument and is recorded next
//   to the rubric's pick; a scaffold is NOT READY; the finished, book-specific English prompt is READY; a prompt
//   written for the other engine is NOT READY. Run: node scripts/test-step0.js
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 300)})` : ""}`); if (!ok) failed++; };
const ROOT = path.join(__dirname, "..");
const SLUG = `zz-step0-test-${process.pid}`;
const DIR = path.join(ROOT, "books", SLUG);
const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, "make-prompt.js"), ...a], { cwd: ROOT, encoding: "utf8", env: { ...process.env, USE_NVIDIA: "0" } });
const PORTAL = { kind: "fiction", world: "speculative", era: 1900, realPeople: false, format: "story", violence: "some", minorHarm: false, mustSee: ["two children with magic rings in an attic", "a dead city in another world", "a lion singing a new world into being"] };
const base = ["--title=Zz Portal Probe", "--author=A. Writer", "--genre=fantasy", `--slug=${SLUG}`];
try {
  let r = run(...base, `--profile=${JSON.stringify(PORTAL)}`);
  const book = () => JSON.parse(fs.readFileSync(path.join(DIR, "book.json"), "utf8"));
  t("decision: a speculative world with an early frame year → antidote, from the profile", r.status === 0 && book().engine === "antidote" && book().engineDecidedBy === "book-profile", r.stderr || r.stdout);
  t("decision: the rubric's pick, scores and reasons are recorded", book().engineRubric && book().engineRubric.pick === "antidote" && book().engineRubric.reasons.some((x) => /invented/.test(x)));
  r = run("--check", `--slug=${SLUG}`);
  t("scaffold: Step 0 is NOT READY (a scaffold is not done)", r.status === 1 && /STEP 0 NOT READY/.test(r.stdout) && /scaffold sentence/.test(r.stdout), r.stdout);
  // finish it the way an agent does: a book-specific thesis, opening image, setup and beats — English
  const md = fs.readFileSync(path.join(DIR, "prompt.notebooklm.md"), "utf8")
    .replace(/- Build the discussion around one arguable thesis about how "[^"]+" works as [^,\n]*, not a summary\./, '- Thesis: "Zz Portal Probe" is a creation story told as a children\'s adventure, and its real subject is what a person does with power they cannot undo.')
    .replace("open mid-thought on the single most provocative idea.", "open mid-thought on a boy in a dusty attic holding a yellow ring and a green ring, not knowing where either sends him.")
    .replace("who/what the book puts in play (concrete names, stakes).", "the two children, the uncle's study, the rings, the dead city and its silent queen.")
    .replace("BEATS: 8 beats, each ONE specific claim from the book.", "BEATS: 8 beats, each ONE claim tied to a concrete place: the attic, the wood between the worlds, the bell in the dead city, the London street, the dark before creation, the singing lion, the garden and its apple, the return home.");
  fs.writeFileSync(path.join(DIR, "prompt.notebooklm.md"), md);
  r = run("--check", `--slug=${SLUG}`);
  t("finished: the book-specific English prompt is STEP 0 READY", r.status === 0 && /STEP 0 READY/.test(r.stdout), r.stdout);
  // the audio is recorded for the engine: a prompt written for the other engine is not done
  fs.writeFileSync(path.join(DIR, "prompt.notebooklm.md"), md.replace(/\*\*Engine:\*\* antidote/, "**Engine:** vox"));
  r = run("--check", `--slug=${SLUG}`);
  t("engine mismatch: a prompt written for vox on an antidote book is NOT READY", r.status === 1 && /written for vox but book.json says antidote/.test(r.stdout), r.stdout);
  fs.writeFileSync(path.join(DIR, "prompt.notebooklm.md"), md.replace("English only (US audience).", "Sadece İngilizce değil, Türkçe konuşun."));
  r = run("--check", `--slug=${SLUG}`);
  t("language: a paste block that is not English is NOT READY", r.status === 1 && /not English/.test(r.stdout), r.stdout);
  // the agent's own override: refused without an argument, recorded with one — never an operator question
  r = run(...base, `--profile=${JSON.stringify(PORTAL)}`, "--engine=vox", "--engine-why=short");
  t("override: against the rubric without a capability argument → refused", r.status === 1 && /overrides the rubric/.test(r.stderr), r.stderr);
  const why = "every mustSee is a painted landscape (attic, dead city, newborn world) that photoreal Flux scenes show and a flat-vector rig cannot";
  r = run(...base, `--profile=${JSON.stringify(PORTAL)}`, "--engine=vox", `--engine-why=${why}`);
  t("override: with an argument it is the agent's decision, recorded from → to + why next to the rubric", r.status === 0 && book().engine === "vox" && book().engineOverride && book().engineOverride.from === "antidote" && book().engineOverride.to === "vox" && book().engineRubric.pick === "antidote", JSON.stringify(book().engineOverride));
  r = run(...base, `--profile=${JSON.stringify(PORTAL)}`);
  t("re-run without the override clears it (the record says what decided)", r.status === 0 && book().engine === "antidote" && !book().engineOverride);
  // the canonical procedure never sends the engine choice to the operator
  const skill = fs.readFileSync(path.join(ROOT, ".claude", "skills", "notebooklm-prompt", "SKILL.md"), "utf8");
  t("skill: no 'stop and discuss' about the engine; the decision is the agent's; done = --check READY", !/stop and discuss|then discuss/i.test(skill) && /never ask the operator to (choose|pick) the engine/i.test(skill) && /make-prompt\.js --check/.test(skill));
} finally {
  fs.rmSync(DIR, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall step-0 checks passed");
process.exit(failed ? 1 : 0);
