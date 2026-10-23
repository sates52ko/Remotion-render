#!/usr/bin/env node
/**
 * audit-visual-critic.js — Antidote God Mode: Blind Visual Critic Auditor (Phase 11)
 *
 * Implements P3: Evaluates the book's scenes against the 5 Blind Questions:
 *   1. Viewer Understanding: What does the viewer understand from this frame alone?
 *   2. Causal Visibility: Is the core causal claim visible, or just a decorative backdrop?
 *   3. Visual Noise: What is visual noise / decorative filler that distracts from the core claim?
 *   4. Visual Information Gain (VIG): Score (High, Medium, Low) and rationale.
 *   5. Information Beyond Audio: Does the shot communicate relationships the ear cannot grasp from audio alone?
 *
 * Usage:
 *   node scripts/audit-visual-critic.js --slug=<slug> [--sample=12] [--render-stills] [--use-llm] [--report]
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { abs } = require("./lib/paths");
const { evaluateScene } = require("./lib/visual-critic");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const SLUG = args.slug;
if (!SLUG) {
  console.error("Error: --slug=<slug> is required");
  process.exit(1);
}

const SAMPLE_SIZE = args.all ? Infinity : parseInt(args.sample || "14", 10);
const RENDER_STILLS = !!args["render-stills"];
const USE_LLM = !!args["use-llm"];
const WRITE_REPORT = args.report !== false;

async function runVisualCriticAudit() {
  const cfgPath = abs.antidoteConfig(SLUG);
  if (!fs.existsSync(cfgPath)) {
    console.error(`Error: Config not found at ${cfgPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const scenes = config.scenes || [];
  if (scenes.length === 0) {
    console.error("Error: No scenes found in config");
    process.exit(1);
  }

  // Select representative scenes
  let selectedScenes = [];
  if (SAMPLE_SIZE >= scenes.length) {
    selectedScenes = scenes.map((s, i) => ({ scene: s, index: i }));
  } else {
    // Pick evenly spaced scenes plus scenes with unique props / state machines
    const step = Math.max(1, Math.floor(scenes.length / SAMPLE_SIZE));
    const seenIndices = new Set();

    // 1. Every chapter boundary
    scenes.forEach((s, i) => {
      if (s.chapterCard || i === 0) {
        seenIndices.add(i);
      }
    });

    // 2. High-value concept scenes
    scenes.forEach((s, i) => {
      const p = s.props?.[0];
      if (p && p.stateIndex !== undefined && !seenIndices.has(i)) {
        if (seenIndices.size < SAMPLE_SIZE) seenIndices.add(i);
      }
    });

    // 3. Spaced distribution
    for (let i = 0; i < scenes.length && seenIndices.size < SAMPLE_SIZE; i += step) {
      seenIndices.add(i);
    }

    const sortedIndices = Array.from(seenIndices).sort((a, b) => a - b).slice(0, SAMPLE_SIZE);
    selectedScenes = sortedIndices.map((i) => ({ scene: scenes[i], index: i }));
  }

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ANTIDOTE GOD MODE: BLIND VISUAL CRITIC AUDIT                  ║`);
  console.log(`║  ${SLUG.padEnd(60)}  ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`  Evaluating ${selectedScenes.length} scenes (out of ${scenes.length} total)`);
  console.log(`  Render Stills: ${RENDER_STILLS ? "ENABLED" : "DISABLED (using structural frame analysis)"}`);
  console.log(`  Evaluator:     ${USE_LLM ? "Vision LLM (with heuristic fallback)" : "Blind Semantic Heuristic Engine"}`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  const results = [];
  const stillsDir = path.resolve(__dirname, `../public/scenes/${SLUG}`);
  if (RENDER_STILLS && !fs.existsSync(stillsDir)) {
    fs.mkdirSync(stillsDir, { recursive: true });
  }

  for (const { scene, index } of selectedScenes) {
    let imagePath = null;
    if (RENDER_STILLS) {
      const frameNum = scene.fromFrame + Math.floor(scene.durationFrames / 2);
      imagePath = path.join(stillsDir, `frame-${String(index).padStart(3, "0")}.png`);
      if (!fs.existsSync(imagePath)) {
        process.stdout.write(`  [STILL] Rendering scene ${index} at frame ${frameNum}... `);
        try {
          execSync(
            `npx remotion still Antidote-${SLUG} ${imagePath} --frame=${frameNum} --puppeteer-timeout=60000 --log=warn`,
            { stdio: "ignore" }
          );
          console.log("✓");
        } catch (_) {
          console.log("✗ (skipped)");
          imagePath = null;
        }
      }
    }

    const evalResult = await evaluateScene(scene, scene._narration, {
      imagePath,
      useLLM: USE_LLM,
    });

    results.push({
      index,
      sceneId: scene.id,
      fromFrame: scene.fromFrame,
      durationFrames: scene.durationFrames,
      shot: scene.shot,
      set: scene.bg?.set || "none",
      prop: scene.props?.[0]?.type || "none",
      stateIndex: scene.props?.[0]?.stateIndex,
      statePhase: scene.props?.[0]?.statePhase,
      isSecondaryAnchor: Array.isArray(scene.props) && scene.props.some((p) => p.isSecondaryAnchor),
      narration: (scene._narration || "").trim(),
      evaluation: evalResult,
    });
  }

  // Aggregate metrics
  const vigCounts = { high: 0, medium: 0, low: 0 };
  const vigLevelCounts = {
    decorative: 0,
    reinforcing: 0,
    illustrative: 0,
    explanatory: 0,
    causal: 0,
    transformative: 0,
  };
  let totalVigScore = 0;
  let causalVisibleCount = 0;
  let noiseCount = 0;
  let beyondAudioCount = 0;
  let secondaryAnchorCount = 0;
  let vqaAnsweredCount = 0;
  let totalClaim = 0;
  let totalRel = 0;
  let totalMech = 0;
  let totalState = 0;
  let totalSurplus = 0;
  let breakdownCount = 0;
  const verdicts = { pass: 0, warn: 0, fail: 0 };

  for (const r of results) {
    const ev = r.evaluation;
    vigCounts[ev.vig] = (vigCounts[ev.vig] || 0) + 1;
    const lvl = ev.vigLevel || (ev.vig === "high" ? "causal" : ev.vig === "medium" ? "illustrative" : "decorative");
    vigLevelCounts[lvl] = (vigLevelCounts[lvl] || 0) + 1;
    totalVigScore += typeof ev.vigScore === "number" ? ev.vigScore : (ev.vig === "high" ? 4 : ev.vig === "medium" ? 2 : 0);

    if (ev.causalClaimVisible) causalVisibleCount++;
    if (ev.visualNoise && ev.visualNoise !== "none") noiseCount++;
    if (ev.addsInformationBeyondAudio) beyondAudioCount++;
    if (r.isSecondaryAnchor) secondaryAnchorCount++;
    if (ev.answersVisualQuestion) vqaAnsweredCount++;
    if (ev.vigBreakdown) {
      totalClaim += ev.vigBreakdown.claimCoverage || 0;
      totalRel += ev.vigBreakdown.relationshipCoverage || 0;
      totalMech += ev.vigBreakdown.mechanismCoverage || 0;
      totalState += ev.vigBreakdown.stateChange || 0;
      totalSurplus += ev.vigBreakdown.audioSurplus || 0;
      breakdownCount++;
    }
    verdicts[ev.verdict] = (verdicts[ev.verdict] || 0) + 1;
  }

  const avgVigScore = Number((totalVigScore / results.length).toFixed(2));
  const causalRate = Math.round((causalVisibleCount / results.length) * 100);
  const beyondAudioRate = Math.round((beyondAudioCount / results.length) * 100);
  const vqaAnsweredRate = Math.round((vqaAnsweredCount / results.length) * 100);
  const avgClaim = breakdownCount ? Number((totalClaim / breakdownCount).toFixed(2)) : 0;
  const avgRel = breakdownCount ? Number((totalRel / breakdownCount).toFixed(2)) : 0;
  const avgMech = breakdownCount ? Number((totalMech / breakdownCount).toFixed(2)) : 0;
  const avgState = breakdownCount ? Number((totalState / breakdownCount).toFixed(2)) : 0;
  const avgSurplus = breakdownCount ? Number((totalSurplus / breakdownCount).toFixed(2)) : 0;

  console.log(`\n── Aggregate Blind Critic Metrics ────────────────────────────────`);
  console.log(`  Causal Claim Visibility:       ${String(causalRate).padStart(3)}% (${causalVisibleCount}/${results.length})`);
  console.log(`  Information Beyond Audio:      ${String(beyondAudioRate).padStart(3)}% (${beyondAudioCount}/${results.length})`);
  console.log(`  Answers Visual Question:       ${String(vqaAnsweredRate).padStart(3)}% (${vqaAnsweredCount}/${results.length})`);
  console.log(`  Average VIG Score (0–5):       ${avgVigScore} / 5.0`);
  console.log(`  5D VIG Component Averages:`);
  console.log(`    • Claim Coverage:            ${avgClaim} / 1.0 (weight 1.0)`);
  console.log(`    • Relationship Coverage:     ${avgRel} / 1.0 (weight 1.0)`);
  console.log(`    • Mechanism Coverage:        ${avgMech} / 1.0 (weight 1.2)`);
  console.log(`    • State Change:              ${avgState} / 1.0 (weight 0.9)`);
  console.log(`    • Audio Surplus:             ${avgSurplus} / 1.0 (weight 0.9)`);
  console.log(`  VIG Cognitive Scale Breakdown:`);
  console.log(`    • Level 5 (Transformative):  ${vigLevelCounts.transformative} scenes`);
  console.log(`    • Level 4 (Causal):          ${vigLevelCounts.causal} scenes`);
  console.log(`    • Level 3 (Explanatory):     ${vigLevelCounts.explanatory} scenes`);
  console.log(`    • Level 2 (Illustrative):    ${vigLevelCounts.illustrative} scenes`);
  console.log(`    • Level 1 (Reinforcing):     ${vigLevelCounts.reinforcing} scenes`);
  console.log(`    • Level 0 (Decorative):      ${vigLevelCounts.decorative} scenes`);
  console.log(`  Secondary Anchors Active:      ${secondaryAnchorCount} scenes (retaining conceptual motifs behind character dialogue)`);
  console.log(`  Visual Noise / Filler:         ${noiseCount} scenes`);
  console.log(`  Verdicts:                      Pass: ${verdicts.pass} | Warn: ${verdicts.warn} | Fail: ${verdicts.fail}`);

  console.log(`\n── Key Scene Deep-Dive (5 Blind Questions) ───────────────────────`);
  const samplePrint = results.slice(0, 6);
  for (const r of samplePrint) {
    const ev = r.evaluation;
    const propInfo = r.prop !== "none" ? ` | Prop: ${r.prop} [state ${r.stateIndex ?? 0}]` : "";
    const claimInfo = ev.claimType ? ` [Claim: ${ev.claimType} / ${ev.epistemicStance}]` : "";
    console.log(`\n  ▸ Scene #${r.index} [${r.sceneId}] (${r.shot} in ${r.set}${propInfo})${claimInfo} [${ev.verdict.toUpperCase()}]`);
    console.log(`    Narration: "${r.narration.slice(0, 90)}${r.narration.length > 90 ? "..." : ""}"`);
    console.log(`    [Q1] Understanding:   ${ev.viewerUnderstanding}`);
    if (ev.visualQuestion) {
      console.log(`    [VQA] Question:       "${ev.visualQuestion}"`);
      console.log(`    [VQA] Answered?       ${ev.answersVisualQuestion ? "YES" : "NO"} — ${ev.visualQuestionExplanation}`);
    }
    console.log(`    [Q2] Causal Visible:  ${ev.causalClaimVisible ? "YES" : "NO"} — ${ev.causalVisibilityExplanation}`);
    console.log(`    [Q3] Visual Noise:    ${ev.visualNoise}`);
    console.log(`    [Q4] VIG Level:       ${(ev.vigLevel || ev.vig).toUpperCase()} (score ${ev.vigScore ?? 0}/5) — ${ev.vigReason}`);
    console.log(`    [Q5] Beyond Audio:    ${ev.addsInformationBeyondAudio ? "YES (deepens conceptual grasp)" : "NO"}`);
    if (ev.recommendation && ev.verdict !== "pass") {
      console.log(`    [REC]                 ${ev.recommendation}`);
    }
  }

  // Write report
  if (WRITE_REPORT) {
    const reportPath = path.resolve(__dirname, `../books/${SLUG}/visual-critic-report.json`);
    const reportData = {
      slug: SLUG,
      evaluatedAt: new Date().toISOString(),
      sampleSize: results.length,
      totalScenes: scenes.length,
      metrics: {
        causalVisibilityRate: causalRate,
        informationBeyondAudioRate: beyondAudioRate,
        visualQuestionAnsweredRate: vqaAnsweredRate,
        averageVigScore: avgVigScore,
        vig5DAverages: {
          claimCoverage: avgClaim,
          relationshipCoverage: avgRel,
          mechanismCoverage: avgMech,
          stateChange: avgState,
          audioSurplus: avgSurplus,
        },
        vigDistribution: { high: vigCounts.high, medium: vigCounts.medium, low: vigCounts.low },
        vigLevelDistribution: vigLevelCounts,
        secondaryAnchorsActive: secondaryAnchorCount,
        verdicts,
        visualNoiseCount: noiseCount,
      },
      results,
    };
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf8");
    console.log(`\n  Saved comprehensive report to books/${SLUG}/visual-critic-report.json`);
  }

  const passed = verdicts.fail === 0 && avgVigScore >= 2.5 && causalRate >= 80;
  console.log(`\n  Final Blind Critic Verdict: [${passed ? "✓ PASS" : "✗ DEFICIT"}]`);
  if (!passed) process.exit(1);
}

runVisualCriticAudit().catch((err) => {
  console.error("Critic Audit Error:", err);
  process.exit(1);
});
