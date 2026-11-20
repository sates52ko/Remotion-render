// merge-recovery.js — every storyboard merge problem gets a CODE, a CLASS and the fix, so a refused merge is a work
// list the agent clears by itself, not a question for the operator (2026-10-29).
//
// Why: essentialism, 2026-10-28 — 8 chunks authored, merge refused 38 beats, and the agent asked the operator
// "Do you want me to continue on that basis?". Every one of the 38 was a routine authoring fix; after the operator said
// "DEVAM ET" the merge went 38 -> 8 -> 2 -> 0 in about 90 s. Other books hit 40-105 problems the same way (the art of
// saying no 40, thinking in systems 49, crazy rich asians 105). The tool's own line "ask the chunk's author" read as
// "ask someone"; nothing said a beat COUNT is never a reason to stop.
//
// Classes (who acts; none of the first three needs the operator):
//   ROUTINE     fix the named field in the beat's authored-K.json (the message says what is wrong)
//   REAUTHOR    re-read the beat's narration and author it again (a different staging, a spoken cue, a sentence)
//   AGENT_STEP  run a pipeline step yourself (storyboard prep, a fresh author agent, gate-b), then re-merge
//   OPERATOR    a real stop: the fix needs something only the operator can give (credential, cost, another agent's
//               files, a change to the narration/recording) — report it, do not work around it
// A problem no rule knows is REAUTHOR (agent-owned): unknown never means "ask".
// Mechanical filling is NOT a fix: authoring-integrity.js flags fields filled with copies after a refusal (REVIEW_REQUIRED).

const RULES = [
  [/^VOCABULARY: /, "VOCABULARY", "AGENT_STEP", "run storyboard.js prep (keeps authored-K.json), read the new rules.md, re-author the beats the new vocabulary fits, re-merge"],
  [/^STALE PREP: /, "STALE_PREP", "AGENT_STEP", "run storyboard.js prep again (keeps authored-K.json); have the beats checked against the new rules.md / cast; re-merge"],
  [/NOT AUTHORED/, "NOT_AUTHORED", "AGENT_STEP", "run that chunk's author prompt again (a fresh agent, storyboard/PROMPTS.md); never write the beats by filling fields"],
  [/unsupported field "continue"/, "UNSUPPORTED_FIELD", "ROUTINE", "remove the field (this engine's schema has no such field)"],
  [/unsupported field/, "UNSUPPORTED_FIELD", "ROUTINE", "rename it to the field the message names, or remove it"],
  [/continue must be true or left out/, "CONTINUE_FALSE", "ROUTINE", "delete the \"continue\" key (never write false)"],
  [/"continue": true on the first beat/, "CONTINUE_FIRST", "ROUTINE", "delete \"continue\" on the first beat"],
  [/storyboard\.(claim|concreteVisual|onScreenText|relationToPrevious|addedInformation) missing/, "STORYBOARD_FIELD", "REAUTHOR", "write the field FROM the beat's narration and its staging: concreteVisual = the drawable picture, onScreenText = the words that add meaning (or \"none\") — never a copy of another field"],
  [/not in this book's vocabulary|^(set|shotOverride|expression|action|holds) "[^"]*"$|^callout style "|^diagram type "/, "OUT_OF_VOCAB", "ROUTINE", "pick a value from rules.md -> Vocabulary; if none fits, re-author the beat (REAUTHOR)"],
  [/cast "[^"]*" not in story bible/, "CAST_NOT_IN_BIBLE", "REAUTHOR", "use a bible cast key; if the narration really names a new person, add them to the story bible (then prep) — never invent one"],
  [/shotOverride "beforeAfter"/, "BEFORE_AFTER", "REAUTHOR", "use conceptMotion, a diagram, or two beats (the message explains)"],
  [/with cast \[\] — nobody on screen does it/, "ACTION_NO_PERSON", "REAUTHOR", "name who does it (cast[0]) from the narration, or drop the action and stage the object as the concept icon"],
  [/needs two cast members|needs exactly two|needs a destination/, "PAIR_ACTION", "REAUTHOR", "give the action its second person / destination from the narration, or choose a one-person action"],
  [/needs "holds"/, "HOLDS_MISSING", "ROUTINE", "add the object the narration names as holds"],
  [/continues .* (DOWN|LYING) \(beat \d+\)/, "BODY_STATE", "REAUTHOR", "re-read the narration: still down -> a face action (idle, talk, think); time has passed -> drop continue; never stand them up unless the narration says they get up"],
  [/set the .* down in beat \d+; .*without a take/, "PLACE_RELEASED", "ROUTINE", "the object stays where it was set down: use action \"take\" if the narration picks it up again, otherwise drop holds"],
  [/continues .* after (taking|holding|drinking)/, "HOLD_CARRY", "ROUTINE", "set holds to the carried object (the message names it) or drop continue"],
  [/conceptMotion|conceptMotionCue/, "CONCEPT_MOTION", "ROUTINE", "match the motion to the icon / put the cue on a spoken word (the message says which)"],
  [/actionCue .*not spoken|cue .*not spoken|is not spoken in this beat/, "CUE_NOT_SPOKEN", "REAUTHOR", "put the cue on a phrase spoken IN this beat (copy it from the narration)"],
  [/actionCue is only read by/, "CUE_UNUSED", "ROUTINE", "remove actionCue or use an action that reads it"],
  [/partnerExpression|partnerAction/, "PARTNER", "ROUTINE", "fix the second person's field as the message says"],
  [/carried|seated IN|lifts again|teleport/, "LIFT_CARRY", "ROUTINE", "keep the carried state as the message says (continue, cast, shot)"],
  [/leave\/flee|"leave"|"flee"/, "LEAVE", "ROUTINE", "drop the diagram / closeUp on a leave beat, as the message says"],
  [/draws at most|would not be drawn|both poles/, "DIAGRAM_CAPACITY", "REAUTHOR", "spread the labels over continued beats (one per beat) or choose a diagram that holds them"],
  [/diagram beat also has/, "DIAGRAM_EXTRA", "ROUTINE", "keep the diagram (cast: [], no icon/callout) or the person (no diagram) — the message says which"],
  [/diagram without labels/, "DIAGRAM_LABELS", "REAUTHOR", "write the labels the narration says"],
  [/: (EMPTY|CONSTANT_TEMPLATE|FILLER_TOKEN|FRAGMENT|TELEGRAPHIC|LENGTH|UNGROUNDED)/, "SCREEN_TEXT", "REAUTHOR", "rewrite the line as a short narration-true phrase (or drop the callout) — not a fragment, filler or template"],
  [/^.*: (scorecard|refute|mechanism|causal)\b|prints \d+|verdict repeats|second trial|no factor|station|token|ledger|meter|clap|lane/, "DIAGRAM_SPEC", "REAUTHOR", "fix the diagram's data from the narration (every cue spoken, no unsaid number) — rules.md section of that diagram"],
  [/Gate B is stale|run gate-b-relationship/, "GATE_B", "AGENT_STEP", "run node scripts/gate-b-relationship.js; if it cannot run (no key), drop stageRelationship and author the beat normally"],
  [/decision FALLBACK/, "GATE_B_FALLBACK", "ROUTINE", "remove stageRelationship and author the beat normally"],
  [/relationship|evidence quote|not verbatim|modality|means\.label|speaker/, "RELATIONSHIP", "REAUTHOR", "fix the relationship record from verbatim quotes, or drop stageRelationship"],
  [/image\.subject is a keyword bag/, "VOX_IMAGE_SUBJECT", "REAUTHOR", "describe the photograph in a sentence (who, what, where), from the narration"],
  [/^type "/, "VOX_TYPE", "ROUTINE", "use a Vox design type from rules.md"],
];

const CLASS_ORDER = ["OPERATOR", "AGENT_STEP", "REAUTHOR", "ROUTINE"];

function classify(problem) {
  const m = String(problem).match(/^([^:]+): ([\s\S]*)$/);
  const i = m && /^\d+$/.test(m[1]) ? Number(m[1]) : null;
  const msg = m && i != null ? m[2] : String(problem);
  for (const [re, code, cls, fix] of RULES) if (re.test(msg) || re.test(String(problem))) return { i, msg, code, cls, fix };
  return { i, msg, code: "OTHER", cls: "REAUTHOR", fix: "read the message, re-read the beat's narration and fix the beat in its authored-K.json" };
}

// problems: merge's "i: msg" strings; owner: Map(i -> authored-K.json); review: authoring-integrity findings
function buildReport({ slug, engine, problems, warnings, owner, review, write, written }) {
  const items = problems.map((p) => { const c = classify(p); return { ...c, file: c.i != null && owner ? owner.get(c.i) || null : null }; });
  const byCode = new Map();
  for (const x of items) {
    if (!byCode.has(x.code)) byCode.set(x.code, { code: x.code, cls: x.cls, n: 0, fix: x.fix, beats: [] });
    const g = byCode.get(x.code); g.n++; if (x.i != null && g.beats.length < 40) g.beats.push(x.i);
  }
  const byClass = Object.fromEntries(CLASS_ORDER.map((c) => [c, items.filter((x) => x.cls === c).length]));
  const byFile = {};
  items.forEach((x) => { if (x.file) (byFile[x.file] = byFile[x.file] || []).push(x.i); });
  const operatorNeeded = byClass.OPERATOR > 0;
  const next = !items.length ? (written ? "merged — next: node scripts/preview-state.js status (it names the next step: readcheck for Antidote, make-book for Vox); routine, never end the turn" : "no problems — run merge --write")
    : operatorNeeded ? "STOP: report the OPERATOR problems (each says why); fix the rest meanwhile"
      : `fix all ${items.length} yourself — no approval: ${CLASS_ORDER.filter((c) => byClass[c]).map((c) => `${byClass[c]} ${c}`).join(", ")}; then merge --write`;
  return {
    slug, engine, at: new Date().toISOString(), write: !!write, written: !!written,
    problems: items.length, byClass, byCode: [...byCode.values()].sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls) || b.n - a.n),
    byFile, operatorNeeded, next,
    items: items.map(({ i, code, cls, file, msg }) => ({ i, code, cls, file, msg })),
    warnings: warnings.length,
    review: review || [],
  };
}

function printReport(rep, log = console.log) {
  if (!rep.problems) return;
  log(`\nrecovery (storyboard/merge-report.json): ${rep.problems} problem(s) — ${CLASS_ORDER.filter((c) => rep.byClass[c]).map((c) => `${c} ${rep.byClass[c]}`).join(" · ")}`);
  for (const g of rep.byCode) log(`  ${g.cls.padEnd(10)} ${String(g.n).padStart(3)} × ${g.code.padEnd(18)} beats ${g.beats.slice(0, 12).join(",")}${g.n > 12 ? ",…" : ""} — ${g.fix}`);
  log(`  files: ${Object.entries(rep.byFile).map(([f, is]) => `${f} (${is.length})`).join(", ")}`);
  log(`  next: ${rep.next}`);
}

module.exports = { classify, buildReport, printReport, RULES, CLASS_ORDER };
