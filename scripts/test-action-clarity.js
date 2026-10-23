#!/usr/bin/env node
// Who does it, and the object stays visible (2026-10-20, after the action lab's blind check):
//   (A) a HELD object (hold / take after the cue) is lifted clear of the burned-in caption band (groundFit holdLift):
//       real shot staging; already-clear holds are untouched; a take's end and a continued hold meet in the same pose
//   (B) embrace: the LEAD (cast[0], who does it) reaches early and wraps HIGH and is drawn in FRONT; the PARTNER (to
//       whom) receives low, opens only as the lead arrives, wraps LOW at the waist
// Run: node scripts/test-action-clarity.js
const fs = require("fs");
const path = require("path");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const G = require("../src/engines/antidote/groundFit.ts");
const M = require("../src/engines/antidote/movements.ts");
const { stageChar, resolveBody } = require("../src/engines/antidote/shots.ts");
const fps = 30;
const hold = M.pose("hold", 100000, fps);
const boxOf = (st, p, body) => G.stagedBox(G.heldPropBox(p, body), st, body);
const inBand = (b) => b.y1 > G.CAPTION_BAND.y0 - G.CAPTION_MARGIN && b.x1 > G.CAPTION_BAND.x0 && b.x0 < G.CAPTION_BAND.x1;

// ── (A) captions ────────────────────────────────────────────────────────────
{
  const spec = { action: "hold", holds: "phone" };
  const cases = [["medium", 0], ["closeUp", 0], ["twoShot", 0], ["twoShot", 1], ["wide", 0], ["illustration", 0]];
  let anyLifted = 0;
  for (const [shot, slot] of cases) {
    const st = stageChar(shot, spec, slot), body = resolveBody(shot, spec);
    const before = boxOf(st, hold, body);
    const k = G.holdLift(st, hold, body);
    const after = boxOf(st, G.liftHold(hold, k), body);
    if (shot === "closeUp") {
      // the face fills the frame (scale 3.1): a chest-height object is BELOW the frame; the full lift brings it only
      // partly into view — a recorded limit (an object beat wants a shot that shows hands), not a pass
      t(`captions: closeUp — the object was off-frame; the full lift brings it partly into view (limit, k ${k})`, before.y0 > 1080 && k === 1 && after.y0 < 1080, JSON.stringify({ before, after, k }));
      continue;
    }
    if (inBand(before)) {
      anyLifted++;
      t(`captions: ${shot}[${slot}] — the held object sat in the caption band and is lifted clear (k ${k})`, k > 0 && !inBand(after), JSON.stringify({ before, after, k }));
    } else {
      t(`captions: ${shot}[${slot}] — already clear: untouched (k 0)`, k === 0, JSON.stringify({ before, k }));
    }
  }
  t("captions: the measured case (medium, centre figure) is one that needed the lift", inBand(boxOf(stageChar("medium", spec, 0), hold, resolveBody("medium", spec))), "medium hold was already clear?");
  t("captions: at least one real shot needed the lift", anyLifted > 0);
  t("captions: liftHold(…, 0) returns the pose unchanged", G.liftHold(hold, 0) === hold);
  // take: the lift follows the bring-in, ending exactly where the continued hold starts
  const CUE = 60;
  const st = stageChar("medium", spec, 0), body = resolveBody("medium", spec), k = G.holdLift(st, hold, body);
  const endTake = G.liftHold(M.pose("take", CUE + M.TAKE_BRING + 40, fps, CUE), k * (M.pose("take", CUE + M.TAKE_BRING + 40, fps, CUE).bring ?? 1));
  const contHold = G.liftHold(hold, k);
  t("captions: a take's end = the continued hold (same lifted arm — no jump at the cut)", Math.abs(endTake.armR - contHold.armR) < 0.5 && Math.abs((endTake.elbowR ?? 0) - (contHold.elbowR ?? 0)) < 0.5, JSON.stringify([endTake.armR, endTake.elbowR, contHold.armR, contHold.elbowR]));
  let mono = true;
  for (let f = CUE; f <= CUE + M.TAKE_BRING; f++) if ((M.pose("take", f + 1, fps, CUE).bring ?? 0) < (M.pose("take", f, fps, CUE).bring ?? 0)) mono = false;
  t("captions: take bring progress only rises (the lift never dips)", mono);
  t("captions: holdLift is pure (same staging -> same k)", G.holdLift(st, hold, body) === k);
}

// ── (B) embrace actor / target ──────────────────────────────────────────────
{
  const CUE = 80, A = M.EMBRACE_APPROACH;
  const lead = (f) => M.pose("embrace", f, fps, CUE, "lead"), partner = (f) => M.pose("embrace", f, fps, CUE, "partner");
  t("embrace: the lead reaches out early (arm forward well before contact)", lead(20).armR < -60, String(lead(20).armR));
  t("embrace: the partner's arms stay low until the lead arrives", partner(CUE - A - 2).armR > -15 && partner(20).armR > -15, JSON.stringify([partner(20).armR, partner(CUE - A - 2).armR]));
  t("embrace: the lead wraps HIGH, the partner LOW (different arms)", lead(CUE + 30).armR < -115 && partner(CUE + 30).armR > -85 && partner(CUE + 30).armR < -55, JSON.stringify([lead(CUE + 30).armR, partner(CUE + 30).armR]));
  t("embrace: both carry the same contact progress", [0, 40, CUE - 9, CUE, CUE + 40].every((f) => lead(f).contact === partner(f).contact));
  t("embrace: default role is the lead (old calls unchanged in shape)", JSON.stringify(M.pose("embrace", 50, fps, CUE)) === JSON.stringify(lead(50)));
  const sc = fs.readFileSync(path.join(REPO, "src/engines/antidote/components/Scene.tsx"), "utf8");
  t("wiring: an embrace draws its lead last (in front)", /bodies\.length === 2 && bodies\[0\]\.action === "embrace" \? \[1, 0\]/.test(sc));
  t("wiring: cast[1] of an embrace gets the partner role", /embraceRole=\{c\.action === "embrace" && bodies\.length === 2 && ci === 1 \? "partner" : "lead"\}/.test(sc));
  t("wiring: the pose receives the role", /pose\(spec\.action, frame \+ clockOff, fps, cue, embraceRole\)/.test(sc));
  t("wiring: the caption lift runs for hold and for a take after its cue", /spec\.holds && \(spec\.action === "hold" \|\| \(spec\.action === "take" && p\.take === 1\)\)/.test(sc));
}
console.log(failed ? `\n${failed} FAILED` : "\nall action-clarity checks passed");
process.exit(failed ? 1 : 0);
