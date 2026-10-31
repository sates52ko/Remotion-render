#!/usr/bin/env node
/**
 * test-p9a-vox.js — P9-A V1–V6 fixtures (node-runnable, no Remotion runtime).
 *
 * Covers the logic layer of the Vox fixes directly (semantic.ts negation
 * scanner + relation detector, screenTextBridge.ts decision table) plus SOURCE
 * GUARDS that pin the renderer files to the P9-A invariants (kicker chips per
 * layout; no emphasis join(" ") noun-phrase manufacturing; annotatedFor strike
 * forcing; onScreenText pass-through in the planner; report-only lint).
 * The visual truth of the JSX itself is proven by the 7 stills
 * (audit/visionless-10x/render-stills-p9a.mjs → stills-p9a/).
 *
 *   node scripts/test-p9a-vox.js
 */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error("  ✗ " + name); } };

const vox = path.join(__dirname, "..", "src", "engines", "vox");
const semantic = require("./lib/vox-semantic.cjs");
const read = (p) => fs.readFileSync(p, "utf8");

// ── V4 core: negation scopes (semantic.ts — the annotation decision logic) ──
{
  ok(semantic.tokenFullyNegated("GENIUS", "He is not a genius, he is persistent."), "V4: token inside 'not a …' clause is negated");
  ok(!semantic.tokenFullyNegated("PERSISTENT", "He is not a genius, he is persistent."), "V4: asserted pole in the same sentence is NOT negated");
  ok(semantic.tokenFullyNegated("TALENT", "It isn't talent — it's reps."), "V4: 'isn't' scope negates");
  ok(semantic.tokenFullyNegated("TALENT", "The myth of talent holds people back."), "V4: 'myth of X' negates X");
  // the contrast coordinator CLOSES the rejected clause and opens the asserted pole
  ok(!semantic.tokenFullyNegated("WORK", "The myth of talent holds people back, but the work compounds."), "V4: 'but' closes the negation window — the next pole stays asserted");
  ok(!semantic.tokenFullyNegated("HOLD", "People believe it holds them back."), "V4: no negation word in the sentence → nothing negated");
  ok(semantic.tokenFullyNegated("BACK", "It never lets you go back."), "V4: 'never' covers its clause");
  ok(!semantic.tokenFullyNegated("TALENT", ""), "V4: empty narration never negates");
  const rel = semantic.detectRelation("That is not a step ladder; it is a staircase.");
  ok(rel.relation === "contrast", "V4 core: detectRelation reads contrast (the measured class)");
}

// ── V5: screenTextBridge decision table (single checker source of truth) ────
{
  const bridge = require("../src/engines/vox/screenTextBridge.ts");
  const good = { props: { text: "The man walked into the wild alone and never came back.", onScreenText: "HE WALKED INTO THE WILD ALONE" } };
  const d1 = bridge.checkOnScreenText(good);
  ok(d1.authored && d1.text === "HE WALKED INTO THE WILD ALONE" && !d1.rejected, "V5: passing authored onScreenText is rendered");
  const bad = { props: { text: "He walked on.", onScreenText: "THIS IS AN ABSURDLY LONG HEADLINE THAT NO FRAME COULD EVER HOLD" } };
  const d2 = bridge.checkOnScreenText(bad);
  ok(d2.rejected && d2.rejected.startsWith("ONSCREEN_TEXT_REJECTED:") && d2.text === "", "V5: failing authored onScreenText is refused with the checker's code");
  const absent = { props: { text: "He walked on." } };
  ok(bridge.checkOnScreenText(absent).authored === false, "V5: no authored onScreenText → honest absence");
  // onScreenHeadline stamps the rejection for telemetry
  const beat = { props: { text: "He walked on.", onScreenText: "NOPE NOT GROUNDED ANYWHERE AT ALL" } };
  const head = bridge.onScreenHeadline(beat);
  ok(head === "" && beat.props._onScreenTextRejected && beat.props._onScreenTextRejected.startsWith("ONSCREEN_TEXT_REJECTED:"), "V5: rejection recorded on the beat (telemetry can tell refused from absent)");
}

// ── SOURCE GUARDS — the renderer files stay pinned to the P9-A invariants ───
// (.tsx files carry JSX and cannot be node-required; these guards pin the
// invariants in source, while the 7 stills prove the rendered truth.)
{
  const scenes = read(path.join(vox, "scenes.tsx"));
  const narrative = read(path.join(vox, "scenes-narrative.tsx"));
  const shared = read(path.join(vox, "shared.tsx"));
  const journalism = read(path.join(vox, "scenes-journalism.tsx"));
  const annotations = read(path.join(vox, "annotations.tsx"));
  const emphasis = read(path.join(vox, "emphasis.tsx"));
  const schema = read(path.join(vox, "schema.ts"));
  const planVox = read(path.join(__dirname, "plan-vox.js"));

  // V1: a kicker chip reachable from every layout that used to drop it
  ok(/ImageFocusScene[\s\S]{0,4000}?KickerChip/.test(scenes), "V1 GUARD: ImageFocusScene renders the authored kicker");
  ok(/QuoteScene[\s\S]{0,3000}?KickerChip/.test(scenes), "V1 GUARD: QuoteScene kicker path present in scenes.tsx");
  ok(/kicker \? <KickerChip/.test(narrative), "V1 GUARD: QuestionScene renders the kicker when authored");
  // V2: no manufactured noun phrases on the big-text path + token renderer used everywhere
  ok(!/emphasis[\s\S]{0,80}\.join\(" "\)\s*\|\|/.test(shared), "V2 GUARD: UngroundedFallback no longer joins emphasis into one phrase");
  ok(/EmphasisTokens/.test(shared) && /EmphasisTokens/.test(narrative) && /EmphasisTokens/.test(scenes), "V2 GUARD: renderer files use the token renderer (journalism renders single-token titles by design)");
  ok(/export function fitTokenSize/.test(emphasis) && /12/.test(emphasis) && /9/.test(emphasis), "V2 GUARD: fitTokenSize keeps the 12/9-char step-down thresholds");
  // V3: the stat number leads from authored emphasis, narration regex only falls back
  ok(/StatScene[\s\S]{0,3500}?emphasis[\s\S]{0,600}?\\d/.test(scenes), "V3 GUARD: StatScene reads the number from authored emphasis");
  // V4: annotatedFor forces strike-or-nothing on a rejected pole
  ok(/export function annotatedFor/.test(annotations) && /tokenFullyNegated/.test(annotations) && /"strike"/.test(annotations), "V4 GUARD: annotatedFor exists and forces strike via the negation scanner");
  // V5: the planner passes the author's line through UNCHANGED; the schema carries it
  ok(/onScreenText = d\.storyboard\.onScreenText\.trim\(\)/.test(planVox), "V5 GUARD: plan-vox passes storyboard.onScreenText through to the beat props");
  ok(/onScreenText\?: string/.test(schema) && /_onScreenTextRejected\?: string/.test(schema), "V5 GUARD: Beat.props carries onScreenText + the rejection field");
  // V6: the report-only lint exists and never gates
  const lint = read(path.join(__dirname, "p9a-polarity-lint.js"));
  ok(/REPORT-ONLY/.test(lint), "V6 GUARD: polarity lint is declared report-only");
  ok(!/process\.exit\(1\)\s*;?\s*$/.test(lint.trim().split("\n").filter(l => !l.includes("Usage")).join("\n").trim()), "V6 GUARD: lint never hard-exits on findings (only on usage error)");
}

console.log(`test-p9a-vox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
