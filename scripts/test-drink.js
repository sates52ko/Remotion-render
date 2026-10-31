#!/usr/bin/env node
// DRINK (10x P2, 2026-10-28): "he takes a drink" — the held object goes to the drinker's OWN mouth on the cue word.
// Blind v1 (under-the-dome 52): `take` + `hold` read only as "holding a mug". Checks, with the rig's own arm chain
// (Everyman.tsx: shoulder (304,322), elbow +88, hand +88, SVG clockwise degrees): nothing before the cue; at the sip the
// HAND is at the mouth (~200,218) and the arm is drawn in front of the face; the cup tips toward the lips; it comes
// back to the chest; a carried seat survives (upper-body action); the planner times it on the actionCue word.
// Run: node scripts/test-drink.js
const fs = require("fs");
const path = require("path");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const M = require("../src/engines/antidote/movements.ts");
const ES = require("../src/engines/antidote/endState.ts");
const { charAction } = require("../src/engines/antidote/schema.ts");
const rad = (d) => (d * Math.PI) / 180;
// forward kinematics of the right arm: rest vector (0,+88) rotated clockwise by armR, then the forearm by armR+elbowR
const hand = (p) => {
  const a = rad(p.armR), b = rad(p.armR + (p.elbowR || 0));
  const ex = 304 - 88 * Math.sin(a), ey = 322 + 88 * Math.cos(a);
  return { x: ex - 88 * Math.sin(b), y: ey + 88 * Math.cos(b) };
};
const MOUTH = { x: 205, y: 220 };
const dist = (h) => Math.hypot(h.x - MOUTH.x, h.y - MOUTH.y);
const fps = 30, cue = 120;

t("schema: drink is an authorable action", charAction.safeParse("drink").success);
t("before the cue: the hold pose (cup at the chest), never at the mouth early", [0, 60, 119].every((f) => !M.pose("drink", f, fps, cue).front && dist(hand(M.pose("drink", f, fps, cue))) > 120));
const sip = M.pose("drink", cue + M.DRINK_UP + 10, fps, cue);
t("the sip: the hand is AT the mouth (rig kinematics, < 25 px)", dist(hand(sip)) < 25, `${JSON.stringify(hand(sip))} d=${dist(hand(sip)).toFixed(1)}`);
t("the sip: the arm and cup are drawn in front of the face", sip.front === 1);
t("the sip: the cup tips toward the lips, the head tips back, eyes half close", sip.propTilt < -20 && sip.headY < 0 && sip.blink >= 0.5, JSON.stringify({ tilt: sip.propTilt, headY: sip.headY, blink: sip.blink }));
const after = M.pose("drink", cue + M.DRINK_UP + M.DRINK_SIP + M.DRINK_DOWN + 5, fps, cue);
const held = M.pose("hold", cue + M.DRINK_UP + M.DRINK_SIP + M.DRINK_DOWN + 5, fps);
t("afterwards: back to the chest (the hold pose), behind-face drawing again", !after.front && Math.abs(after.armR - held.armR) < 1 && dist(hand(after)) > 120);
let jumps = 0; let prev = hand(M.pose("drink", cue, fps, cue));
for (let f = cue; f < cue + M.DRINK_UP + M.DRINK_SIP + M.DRINK_DOWN + 4; f++) { const h = hand(M.pose("drink", f, fps, cue)); if (Math.hypot(h.x - prev.x, h.y - prev.y) > 45) jumps++; prev = h; }
t("the hand travels continuously (a 0.47 s lift peaks ~37 rig px a frame; nothing jumps > 45)", jumps === 0, String(jumps));
t("a carried seat survives a drink (upper-body action)", ES.keepsRest("seated", "drink") === true || ES.UPPER_BODY.has("drink"));
const plan = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
t("planner: drink takes its moment from the author's actionCue word", /L\.action === "drink"/.test(plan));
const sb = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
t("rules: authors are told drink vs take/hold", /"action": "drink"/.test(sb.replace(/\\`/g, "`")) && /takes a drink" read only as "holding a mug"/.test(sb));
console.log(failed ? `\n${failed} FAILED` : "\nall drink checks passed");
process.exit(failed ? 1 : 0);
