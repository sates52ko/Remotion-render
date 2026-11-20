#!/usr/bin/env node
/**
 * test-requirement-staging.js — P1.5 tests (operator implementation sign-off scope).
 *   node scripts/test-requirement-staging.js
 *
 * Scope locked by the operator: solo SAFE → diorama · two-character SAFE → closeUp
 * (a fallback acceptance ONLY, never "better staging" in general) · copy-bearing
 * absence → strategy-aware strike · copy-less absence → shrink/closein arc on an
 * EXISTING motif · concrete → the existing icon-shot path · state → expression
 * lever · authored staging → LOCK (UNMET stays visible) · firewall untouched ·
 * `_visualStrategy.staging` plan tag mandatory · NO invented capability.
 */
const fs = require("fs");
const path = require("path");
const { decideStrategy, requirementFor, stageRequirement, measuredSafeFallback } = require("./lib/visual-strategy");
const { validateScene } = require("./lib/narrative-visual-firewall");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), `${name} (got ${JSON.stringify(a).slice(0, 130)})`);

// the REAL capability map — P1.5 accepts only measured levers (no pretending)
const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "visual-capability.json"), "utf8"));

// ── cast-aware fallback levers, on the real map ──
eq(measuredSafeFallback(REAL, 1), { lever: "shot:diorama", confidence: 0.938 }, "solo → measured diorama 0.938");
eq(measuredSafeFallback(REAL, 2), { lever: "shot:closeUp", confidence: 0.917 }, "two-person → measured closeUp 0.917 (diorama draws ONE char slot)");
ok(measuredSafeFallback(REAL, 2).lever !== "shot:diorama", "two-person never demands the one-slot diorama preset");

// ── fixtures ──
const MAP = REAL;
const soloScene = (over = {}) => ({ id: "scene-01", shot: "split", bg: { set: "room" }, characters: [{ identity: "x", action: "talk", expression: "neutral" }], props: [], texts: [], ...over });
const twoScene = (over = {}) => ({ id: "scene-02", shot: "twoShot", bg: { set: "room" }, characters: [{ identity: "x", action: "talk", expression: "neutral" }, { identity: "y", action: "idle", expression: "neutral" }], props: [], texts: [], ...over });
const safeRec = (scene) => decideStrategy({ atom: { text: "plain claim" }, scene: JSON.parse(JSON.stringify(scene)), narration: "plain claim", capabilityMap: MAP });

// ── A. fallback staging ──
{
  const s = soloScene();
  const rec = safeRec(s);
  const req = requirementFor(rec, MAP, s);
  eq(req.lever, "diorama", "A: solo SAFE requirement demands diorama");
  const st = stageRequirement(req, { scene: s });
  eq(s.shot, "diorama", "A: solo SAFE staged to diorama");
  eq(st.staged.map((x) => `${x.field}:${x.from}->${x.to}`), ["shot:split->diorama"], "A: staging is plan-tagged (field, from→to)");
  const s2 = twoScene();
  const rec2 = safeRec(s2);
  const req2 = requirementFor(rec2, MAP, s2);
  eq(req2.lever, "closeUp", "A: two-person SAFE requirement demands closeUp (cast-aware)");
  stageRequirement(req2, { scene: s2 });
  eq(s2.shot, "closeUp", "A: two-person SAFE staged to closeUp");
  ok(s2.characters.length === 2, "A: both characters preserved (closeUp draws two — verified on the preset)");
  // already-satisfied scene → no restage
  const s3 = soloScene({ shot: "diorama" });
  const st3 = stageRequirement(requirementFor(safeRec(s3), MAP, s3), { scene: s3 });
  eq(st3.staged, [], "A: already-satisfying scene is not restaged");
}

// ── B. absence ──
{
  const absRec = decideStrategy({ atom: { text: "Robots cannot knowingly lie." }, scene: { shot: "medium", characters: [{ action: "talk" }] }, narration: "Robots cannot knowingly lie.", capabilityMap: MAP });
  const req = requirementFor(absRec, MAP);
  // copy exists → strike the EXISTING operative line — and per P9-A A4 the
  // strike may only carry a phrase the scene's own narration says (the quoted-
  // false-thought pattern): "too late" is a contiguous span of the narration.
  const s1 = soloScene({ _narration: "Everyone told him the door was closed forever. Everyone believed it was too late.", texts: [{ text: "TOO LATE", style: "reveal" }] });
  const before = JSON.stringify(s1);
  stageRequirement(req, { scene: s1 });
  eq(s1.texts[0].style, "strike", "B: copy-bearing absence → strategy-aware strike on the existing line (grounded per A4)");
  ok(s1.texts.length === 1 && s1.props.length === 0, "B: nothing added (no invented copy/prop)");
  // P9-A A4: the same requirement on a scene whose narration never says the
  // phrase → the strike is REFUSED (stays reveal, refusal recorded) — a silent
  // frame is honest, an invented rejection is not.
  const s1b = soloScene({ _narration: "Robots cannot knowingly lie.", texts: [{ text: "TOO LATE", style: "reveal" }] });
  const stB = stageRequirement(req, { scene: s1b });
  eq(s1b.texts[0].style, "reveal", "B/A4: ungrounded strike refused — the phrase is not in the scene narration");
  ok(stB.staged.some((x) => String(x.reason || "").includes("strike refused")), "B/A4: the refusal is plan-tagged in the staging record (observable, not silent)");
  // no copy + motif → arc on the EXISTING motif
  const s2 = soloScene({ props: [{ type: "coin", arc: "none", at: 4 }] });
  stageRequirement(req, { scene: s2 });
  eq(s2.props[0].arc, "shrink", "B: copy-less absence → shrink/closein arc on the existing motif");
  ok(s2.texts.length === 0 && s2.props.length === 1, "B: no text invented, no prop added");
  // no copy, no motif → stays unmet, honestly
  const s3 = soloScene();
  const st3 = stageRequirement(req, { scene: s3 });
  ok(st3.staged.some((x) => x.field === "none") && /stays unmet/.test(st3.staged[0].reason || ""), "B: no copy + no motif → stays unmet (invention forbidden), reason recorded");
  // arc-only is NOT claimed when copy exists
  const s4 = soloScene({ texts: [{ text: "X", style: "box" }], props: [{ type: "coin", arc: "rise" }] });
  stageRequirement(req, { scene: s4 });
  eq(s4.props[0].arc, "rise", "B: with copy present the motif arc is untouched (copy lever wins)");
}

// ── C. concrete ──
{
  const conRec = decideStrategy({ atom: { text: "The company became a prison." }, scene: { shot: "medium", characters: [{ action: "talk" }] }, narration: "The company became a prison.", capabilityMap: MAP });
  const req = requirementFor(conRec, MAP);
  const s1 = soloScene({ shot: "overShoulder", characters: [{ identity: "x", action: "talk" }] });
  stageRequirement(req, { scene: s1 });
  ok(["illustration", "diorama"].includes(s1.shot), "C: concrete routed through the existing icon-shot path");
  const s2 = twoScene({ shot: "medium" });
  const st2 = stageRequirement(req, { scene: s2 });
  eq(s2.shot, "medium", "C: two-person concrete scene NOT forced into a one-slot icon shot");
  ok(st2.staged.length === 0, "C: nothing staged where the renderer cannot serve it");
}

// ── D. state ──
{
  const stRec = decideStrategy({ atom: { text: "He was devastated, but remained composed." }, scene: { shot: "medium", characters: [{ action: "sit", expression: "neutral" }] }, narration: "He was devastated, but remained composed.", capabilityMap: MAP });
  const req = requirementFor(stRec, MAP);
  const s = soloScene({ characters: [{ identity: "x", action: "sit", expression: "neutral" }] });
  stageRequirement(req, { scene: s });
  eq(s.characters[0].expression, "sad", "D: explicit-state lever staged (the strategy's own lever list — sad; no invention, schema enum)");
}

// ── E. authored + title are NEVER restaged (operator decision 3) ──
{
  const s = soloScene({ _authorship: { src: "art" } });
  const before = JSON.stringify(s);
  const st = stageRequirement({ kind: "fallback", lever: "diorama", confidence: 0.938 }, { scene: s });
  eq(JSON.stringify(s), before, "E: authored beat untouched — byte-identical");
  eq(st.skipped, "authored", "E: skip recorded as 'authored' (the UNMET stays visible for the operator)");
  const t = soloScene();
  const st2 = stageRequirement({ kind: "fallback", lever: "diorama", confidence: 0.938 }, { scene: t, isTitle: true });
  eq(st2.skipped, "title", "E: titles are never restaged");
  eq(stageRequirement(null, { scene: soloScene() }).skipped, "no_requirement", "E: no requirement → skip recorded");
}

// ── F. firewall integration: staged scenes satisfy the REAL firewall ──
{
  const PROV = { bookId: "s", worldId: "w", sourceChapter: "c", narrativeSubject: "x", narrativeRelation: "r", narrativeState: "s", allowedMotifs: ["m"], forbiddenMotifs: [], allowedCharacters: ["x", "y"], allowedLocations: ["room"], allowedProps: ["coin"] };
  const BIBLE = { world: { era: "now", worldId: "w" }, visualProvenance: { bookId: "s", worldId: "w", allowedMotifs: ["m"], forbiddenMotifs: [], allowedCharacters: ["x", "y"], allowedLocations: ["room"], allowedProps: ["coin"] }, cast: { x: { name: "X", look: "l", variant: { v: 1 } }, y: { name: "Y", look: "l", variant: { v: 2 } } }, places: { room: { set: "room", look: "l" } }, objects: [] };
  const fw = (scene) => {
    const s = JSON.parse(JSON.stringify(scene));
    s.narrativeAtom = { ...PROV }; s.visualIntent = { ...PROV };
    s.visualContract = { ...PROV, visualEvidence: { subjects: ["x"], relations: ["r"], states: ["s"], characterIntent: [], representation: requirementFor(safeRec(scene), MAP, scene) } };
    return validateScene(s, 0, BIBLE, "s").filter((e) => e.reasonCode.startsWith("STRATEGY_"));
  };
  const a = soloScene(); stageRequirement(requirementFor(safeRec(a), MAP, a), { scene: a });
  eq(fw(a), [], "F: staged solo SAFE scene → zero STRATEGY_* violations (evidence ⇄ scene holds)");
  const b = twoScene(); stageRequirement(requirementFor(safeRec(b), MAP, b), { scene: b });
  eq(fw(b), [], "F: staged two-person SAFE scene (closeUp) → zero STRATEGY_* violations");
  // an UNSAFE shot with the same evidence still fails — staging did the work, not the metadata
  const c = soloScene({ shot: "wide" });
  ok(fw(c).some((e) => e.reasonCode === "STRATEGY_REQUIREMENT_UNMET"), "F: unstaged scene with identical record → STRATEGY_REQUIREMENT_UNMET (the staging, not the metadata, satisfies the firewall)");
}

// ── G. planner wiring: stageRequirement runs BEFORE the lock ──
{
  const src = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
  const iStage = src.indexOf("const staging = stageRequirement(");
  const iLock = src.indexOf("out._authorship.lock = {");
  ok(iStage > 0 && iLock > iStage, "SOURCE GUARD: stageRequirement runs before the staging lock (the lock seals the staged representation)");
  ok(src.includes("staging: { staged: staging.staged, skipped: staging.skipped || null }"), "SOURCE GUARD: the staging is plan-tagged on the record");
}

// ── H. P9-A A1: closeUp second-cast staging (no slot stacking) ──
// Root cause of the measured A1 bug (the-second-mountain: 18 closeUp scenes with
// two unstaged cast members): the closeUp preset listed BOTH slots at the exact
// same coordinate (1300,900) — identical slots defeat stageChar's overflow
// fan-out (overflow = index - (slots.length - 1) = 0 for a 2-slot table), so
// cast member 2 was drawn straight on top of member 1.
{
  const { stageChar, SHOTS, resolveBody } = require("../src/engines/antidote/shots.ts");
  // slot 0 is byte-identical — every single-cast closeUp keeps its framing
  eq(stageChar("closeUp", { action: "idle" }, 0), { x: 1300, y: 900, scale: 3.1, flip: false, silhouette: false }, "H: closeUp slot 0 unchanged (single-cast framing preserved)");
  const partner = stageChar("closeUp", { action: "idle" }, 1);
  ok(partner.x !== 1300 || partner.y !== 900, "H: closeUp cast member 2 does not share the hero's coordinate (A1 root cause)");
  ok(partner.flip === true, "H: closeUp partner is flipped toward the hero");
  ok(partner.x < 1920 && partner.x > 0 && partner.y > 0 && partner.y < 1080, "H: closeUp partner anchor on-frame (1920x1080)");
  // face geometry per the Everyman rig (400×600 bust viewBox): head ellipse
  // rx=92, ears rx=102, eyes ±32 from the head centre at rig y≈134
  const faceOnScreen = (st) => st.x - 92 * st.scale > 0 && st.x + 92 * st.scale < 1920 && st.y - 120 * st.scale > 0 && st.y < 1080;
  ok(faceOnScreen(partner) && faceOnScreen(stageChar("closeUp", { action: "idle" }, 0)), "H: BOTH closeUp faces (head ellipse rx=92·scale) fully on-screen at their slots");
  const eyesClear = (a, b) => Math.abs(stageChar("closeUp", { action: "idle" }, 0).x - b.x) > 32 * a.scale + 32 * b.scale;
  ok(eyesClear(SHOTS.closeUp.chars[0], partner), "H: the two closeUp eye rows do not collide (intimate two-shot, not a stack)");
  // the invariant, generalized: NO preset ships duplicate slots — duplicates are
  // what silently defeat the overflow fan-out
  for (const [name, preset] of Object.entries(SHOTS)) {
    for (const table of ["chars", "charsFull"]) {
      const slots = preset[table] || [];
      const keys = slots.map((s) => `${s.x},${s.y},${s.scale},${!!s.flip},${!!s.silhouette}`);
      ok(new Set(keys).size === keys.length, `H: ${name}.${table} has no duplicate slots (${keys.length})`);
    }
  }
  // overflow fan-out still guards 3rd+ cast on 2-slot shots
  const third = stageChar("closeUp", { action: "idle" }, 2);
  ok(third.x === partner.x + 190, "H: closeUp cast member 3 fans out past the last slot");
  // explicit hand-staging still wins over slots (legacy byte-for-byte path)
  const staged = stageChar("closeUp", { action: "idle", x: 800, y: 700, scale: 2 }, 1);
  eq(staged, { x: 800, y: 700, scale: 2, flip: true, silhouette: false }, "H: explicit x/y/scale on a character bypasses the slot table");
  ok(resolveBody("closeUp", { action: "idle" }) === "bust", "H: closeUp stays a bust shot (no charsFull table — A1 did not change the body plan)");
}

// ── I. P9-A A2: motif safe-area clamp (own icon must not leave the frame) ──
// Measured bug: the illustration preset's motif slot (1262,446,1.66 → 863px
// box) sits 14px under the frame top; ambient float + enter motion push the
// icon's console off-frame (the-second-mountain s24–26, the treadmill).
{
  const { motifSafeClamp, MOTIF_SAFE_AREA } = require("../src/engines/antidote/safeArea.ts");
  const { SHOTS } = require("../src/engines/antidote/shots.ts");
  const inside = (x, y, scale, w = 520, h = 520) => {
    const c = motifSafeClamp(x, y, scale, w, h);
    const bw = w * scale, bh = h * scale;
    return c.x - bw / 2 >= MOTIF_SAFE_AREA.x0 - 1e-9 && c.x + bw / 2 <= MOTIF_SAFE_AREA.x1 + 1e-9 && c.y - bh / 2 >= MOTIF_SAFE_AREA.y0 - 1e-9 && c.y + bh / 2 <= MOTIF_SAFE_AREA.y1 + 1e-9;
  };
  // the treadmill: illustration slot clamps down until the box top clears the safe band
  const ill = SHOTS.illustration.motif;
  const cIll = motifSafeClamp(ill.x, ill.y, ill.scale);
  ok(cIll.clamped && cIll.y > ill.y, "I: illustration motif slot is nudged down (treadmill console was 14px from the frame top)");
  ok(inside(ill.x, ill.y, ill.scale), "I: after clamp the illustration icon box sits fully inside the safe area");
  ok(cIll.x === ill.x, "I: clamp is translate-only on the overflow axis (x untouched when x was already safe)");
  // diorama's environmental piece CANNOT fit (1300px box) — intentional bleed is preserved
  const dio = SHOTS.diorama.motif;
  const cDio = motifSafeClamp(dio.x, dio.y, dio.scale);
  eq(cDio, { x: dio.x, y: dio.y, clamped: false }, "I: diorama's oversized environmental icon is never clamped (bleed by design)");
  // already-safe slot is a no-op (no accidental re-framing of published layouts)
  const med = SHOTS.medium.motif;
  eq(motifSafeClamp(med.x, med.y, med.scale).clamped, false, "I: already-safe slot is untouched (no-op)");
  // authored explicit coords are clamped the same way — x and y independently
  ok(inside(-40, 560, 1), "I: authored x overflow clamps back in");
  ok(inside(1900, 560, 1), "I: authored right-edge overflow clamps back in");
  ok(inside(960, 40, 1), "I: authored top overflow clamps back in");
  ok(inside(960, 1060, 1), "I: authored bottom overflow clamps back in");
  const fits = motifSafeClamp(960, 40, 1);
  ok(fits.y === MOTIF_SAFE_AREA.y0 + 260, "I: clamped anchor equals safe edge + half box (exact, not fuzzy)");
  // sweep: every preset slot that CAN fit must end fully inside the safe area
  let swept = 0, dioramaSeen = 0;
  for (const [name, preset] of Object.entries(SHOTS)) {
    const m = preset.motif;
    if (!m) continue;
    const box = 520 * m.scale;
    if (box > MOTIF_SAFE_AREA.y1 - MOTIF_SAFE_AREA.y0 || box > MOTIF_SAFE_AREA.x1 - MOTIF_SAFE_AREA.x0) { dioramaSeen++; continue; }
    ok(inside(m.x, m.y, m.scale), `I: ${name} motif slot inside safe area after clamp`);
    swept++;
  }
  ok(swept >= 12 && dioramaSeen >= 1, `I: sweep covered ${swept} fitting slots + ${dioramaSeen} intentional-bleed slot(s)`);
}

console.log(`test-requirement-staging: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
