#!/usr/bin/env node
// AUTONOMY AUDIT (2026-10-30): a real session counts as an L3 PASS only when no turn ended while preview-state said
// CONTINUE. Fixture transcripts in the Claude Code .jsonl shape. Run: node scripts/test-autonomy-audit.js
const { audit } = require("./autonomy-audit");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info !== undefined ? `  (${JSON.stringify(info)})` : ""}`); if (!ok) failed++; };
const user = (text) => ({ type: "user", message: { role: "user", content: text } });
const result = (text) => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: text }] } });
const say = (text, tools = []) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }, ...tools.map((x) => ({ type: "tool_use", ...x }))] } });
const status = (st, stage = "prep") => `── preview state · zz [antidote] → ${st}\n   ✓ bible done\n\nNEXT (${stage}): run it\n   CONTINUE = routine`;

let r = audit([user("dosyalar hazır"), say("ok", [{ name: "Bash", input: {} }]), result(status("CONTINUE", "seal")), say("Seal tamam; mute test'e devam etmemi ister misiniz?"), user("devam")]);
t("a turn that ends while status says CONTINUE = STOP_ON_CONTINUE (the MN 'seal' case)", r.stopOnContinue === 1 && r.verdict === "FAIL" && r.stops[0].stage === "seal");

r = audit([user("go"), say("", [{ name: "Bash", input: {} }]), result(status("CONTINUE", "bible")), say("", [{ name: "mcp__ccd_turn__wrap_up", input: {} }])]);
t("a wrap-up tool call on CONTINUE is a stop (the Trust Fall / Art of Strategy case)", r.stopOnContinue >= 1 && r.verdict === "FAIL");

const res = (id, text) => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: text }] } });
r = audit([user("go"), say("", [{ name: "Bash", input: {} }]), result(status("CONTINUE", "mute")), say("readers started", [{ name: "Workflow", id: "w1", input: {} }]), res("w1", "Workflow launched in background. Task ID: x"), user("<task-notification><status>completed</status></task-notification>"), say("", [{ name: "Bash", input: {} }]), result("── preview state · zz [antidote] → READY"), say("HAZIR")]);
t("waiting for background agents it started is allowed; READY then a report = PASS", r.waiting === 1 && r.stopOnContinue === 0 && r.verdict === "PASS", r);

r = audit([user("go"), say("", [{ name: "Agent", id: "a1", input: {} }]), res("a1", "the author wrote 40 beats"), say("", [{ name: "Bash", input: {} }]), result(status("CONTINUE", "seal")), say("Seal tamam; mute test'e devam etmemi ister misiniz?"), user("evet")]);
t("a FOREGROUND agent that already returned is not pending work: the MN seal question stays a STOP", r.stopOnContinue === 1, r);

r = audit([user("go"), say("", [{ name: "Agent", id: "a2", input: {} }]), res("a2", "Async agent launched successfully. agentId: q"), say("", [{ name: "Bash", input: {} }]), result(status("CONTINUE", "prep")), say("author 3 finished; waiting for the rest"), user("<task-notification><status>completed</status></task-notification>")]);
t("a background agent from an EARLIER turn that has not reported yet = WAITING", r.waiting === 1 && r.stopOnContinue === 0, r);

r = audit([user("go"), say("", [{ name: "Bash", input: {} }]), result("── preview state · zz [antidote] → OPERATOR\n\nOPERATOR · NEEDS_FLUX_BUDGET: cost"), say("Operatör onayı gerekiyor: Flux maliyeti")]);
t("stopping at an OPERATOR gate is correct", r.atGate === 1 && r.verdict === "PASS");

r = audit([user("go"), say("", [{ name: "Bash", input: {} }]), result(status("CONTINUE", "readcheck")), say("The audio and the VTT do not match. Which do you want?"), user("a")]);
t("a question naming a real gate (audio/VTT mismatch) = CLAIMED_GATE → REVIEW, never an automatic PASS", r.claimedGate === 1 && r.verdict === "REVIEW", r);

r = audit([user("hi"), say("hello")]);
t("a session without any preview-state status is NO_EVIDENCE, never PASS", r.verdict === "NO_EVIDENCE");

r = audit([user("go"), say("", [{ name: "Bash", input: {} }]), result(status("CONTINUE")), say("still working", [{ name: "Bash", input: {} }])]);
t("a session that stops mid-pipeline (transcript ends on CONTINUE) is a stop, not INCOMPLETE PASS", r.stopOnContinue === 1 && r.verdict === "FAIL");

r = audit([user("go"), say("", [{ name: "Bash", input: {} }]), result(status("CONTINUE").replace(/zz/g, "other")), say("done?")], "zz");
t("--slug ignores another book's status lines", r.verdict === "NO_EVIDENCE");
console.log(failed ? `\n${failed} FAILED` : "\nall autonomy-audit checks passed");
process.exit(failed ? 1 : 0);
