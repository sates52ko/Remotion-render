// next-step.js — every preview stage tool ends by pointing at the state machine, with the contract spelled out
// (2026-10-29). Why: the-magician-s-nephew sealed its mute sample and the agent asked "Seal tamam; mute test'e devam
// etmemi ister misiniz?". The state machine already knew the next step (render the sealed sample); the agent never ran
// it, and its in-context skill was the stale main-checkout copy (no autonomy section). The tool output is the one text
// every harness reads at every step, whichever skill copy its session loaded — so the routing lives here too.
//
// 2026-10-30: the contract now also says WHEN the turn may end. Trust Fall (after the bible draft, and again after merge)
// and The Art of Strategy (after the bible PASS) both received CONTINUE + the next command + this contract — and ended
// the turn anyway with a question ("Devam edeyim mi?", "Storyboard'a devam etmemi ister misiniz?") through the
// harness's wrap-up / ask tool. Knowing the next step was not the gap; nothing said the turn may not end on CONTINUE.
const GATES = "cost (a new or uncertain paid use), data loss, a credential change, another agent's WIP, an input mismatch the tools cannot resolve, accepting quality debt, the final render, upload / publish, cleanup";

const KEEP_GOING = "Do NOT end your turn while status says CONTINUE: no wrap-up / ask tool, no \"Devam edeyim mi?\", no interim \"HAZIR DEĞİL\" report — a long pipeline is never a reason to stop. The turn ends only at READY (report HAZIR), at an OPERATOR stop (report it), or while you wait for background agents you started (then continue when they finish).";

const ROUTINE = `routine step — run it now, without asking the operator (preview-hazirla §3 Autonomy). A long step is started in the background and waited for. Stop ONLY on an OPERATOR state: ${GATES}. ${KEEP_GOING}`;

/** the line a stage tool prints when it finished (or stopped) inside the preview flow */
function nextStepLine(slug, done) {
  return `\n→ ${done ? `${done} done. ` : ""}Next: node scripts/preview-state.js status --slug=${slug} — then run the command it prints. ${ROUTINE}`;
}

module.exports = { nextStepLine, ROUTINE, GATES, KEEP_GOING };
