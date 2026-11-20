#!/usr/bin/env node
/**
 * hard-gate.js — Antidote God Mode: Pre-Render Hard Gates (Phase 10)
 *
 * Enforces the 8 Non-Negotiable Golden Rules before any render or worker dispatch.
 * Blocks video export if any retention violation exists.
 *
 * The Non-Negotiable Hard Gates:
 *   [GATE 1] Narrative Health: 0 explanation streaks (>2) & 0 escalation droughts (>28s).
 *   [GATE 2] Promise Integrity: 0 unresolved promises & 0 orphan payoffs.
 *   [GATE 3] Visual Freshness: 0 stagnation streaks (3 consecutive identical visual states).
 *   [GATE 4] Novelty Budget: 0 visual novelty droughts (>60s).
 *   [GATE 5] Chapter Structure: Every chapter must have Macro Question → Turn → Climax Payoff.
 *   [GATE 6] Cognitive Compression: Character clears stage for diagram hero.
 *   [GATE 7] Audio Punctuation: 100% payoffs have DING chime & 100% chapters have THUD hit.
 *   [GATE 8] Master Retention: Composite Holistic Retention Score >= 85.
 *   [GATE 9] Visual Contract Compliance: 0 forbidden motifs, characters preserved.
 *   [GATE 10A] World & Historical Integrity: 0 anachronisms (sets, props, attire).
 *   [GATE 10B] Propositional & Causal Integrity: Visuals embody philosophical claim & causal mechanism.
 *   [GATE 11] Visual Information Gain & Anti-Stagnation Floor: 0 consecutive low-VIG scenes & active state progression.
 *
 * Usage:
 *   node scripts/hard-gate.js --slug=<slug> [--auto-fix]
 *   node scripts/hard-gate.js --all [--auto-fix]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { isAncientWorld } = require("./lib/ancient-world");
const { auditHolisticRetention } = require("./lib/antidote-retention-auditor");
const { autoRepairAntidote } = require("./lib/antidote-auto-repair");
const { validateSceneAgainstContract, applyContractRepair } = require("./lib/visual-contract");
const { isAuthoredBrief } = require("./lib/authorship");
const { enforceSemanticRelevance, scoreSemanticRelevance, usesPropositionWorlds } = require("./lib/visual-intent");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const AUTO_FIX = !!args["auto-fix"] || !!args.fix;

// data/quality-policy.json hardGate.nonBlocking: operator-listed gates that still run and report
// FAIL, but neither block the render nor trigger auto-fix. Thresholds are unchanged.
const POLICY = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "quality-policy.json"), "utf8")); } catch (_) { return {}; } })();
const NON_BLOCKING = new Set(Object.keys((POLICY.hardGate && POLICY.hardGate.nonBlocking) || {}).map(String));
const VIG_NON_BLOCKING = NON_BLOCKING.has("11");

function evaluateGates(slug, autoFix = false) {
  const p = abs.antidoteConfig(slug);
  if (!fs.existsSync(p)) {
    console.error(`Error: Config not found at ${p}`);
    process.exit(1);
  }

  let config = JSON.parse(fs.readFileSync(p, "utf8"));
  let chapters = [];
  const metaPath = abs.youtubeMeta(slug);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      chapters = meta.chapters || [];
    } catch (_) {}
  }

  let audit = auditHolisticRetention(config, chapters);
  const compressionPassed = (config.scenes || []).every((s) => !s.diagram || s.characters?.length === 0 || s.characters?.[0]?.scale <= 0.65);

  // Self-heal if autoFix requested and not yet perfect or any gate fails
  if ((!audit.passed || audit.score < 95 || !compressionPassed) && autoFix) {
    console.log(`  [AUTO-FIX] Initiating Autonomous Auto-Repair Loop for ${slug}...`);
    // E1 ledger: the whole auto-repair loop is announced per mutated scene
    // (record-only; per-engine attribution inside autoRepairAntidote is a later E task).
    const { withEngine } = require("./lib/post-plan-ledger");
    let repairResult;
    withEngine("auto_repair", "hard-gate", "holistic retention auto-repair loop", config.scenes || [], (sc) => {
      repairResult = autoRepairAntidote({ ...config, scenes: sc }, chapters, { maxPasses: 4 });
      return { scenes: repairResult.config.scenes || sc };
    });
    config = repairResult.config;
    fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
    audit = auditHolisticRetention(config, chapters);
    console.log(`  [AUTO-FIX] Repaired to Score: ${audit.score}/100 (${repairResult.repairs.length} repairs applied).`);
  }

  // Evaluate Visual Contract Compliance (Gate 9)
  const briefsPath = path.resolve(__dirname, `../books/${slug}/beat-briefs.json`);
  let contractPassed = true;
  let contractViolations = [];
  if (fs.existsSync(briefsPath)) {
    try {
      const briefsData = JSON.parse(fs.readFileSync(briefsPath, "utf8"));
      const briefsArr = briefsData.briefs || briefsData;
      const fp = (text) => {
        const norm = String(text).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
        let h = 2166136261;
        for (let i = 0; i < norm.length; i++) { h ^= norm.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(36);
      };
      // Faz 0: only AUTHORED briefs are contracts. A heuristic brief's mustNotShow
      // is a genre default list; "repairing" against it swapped authored icons
      // (We Were Liars: coin -> "spotlight") after the author chose them.
      const briefMap = new Map(briefsArr.filter((b) => isAuthoredBrief(b, briefsData)).map((b) => [b.fp, b]));
      let repairedCount = 0;
      for (let i = 0; i < (config.scenes || []).length; i++) {
        const sc = config.scenes[i];
        const brief = briefMap.get(fp(sc._narration?.slice(0, 160) || ""));
        if (!brief) continue;
        const val = validateSceneAgainstContract(sc, brief);
        if (!val.valid) {
          if (autoFix) {
            // P0.2: an authored icon/set its own brief forbids is NOT substituted —
            // it comes back as an UNRESOLVED problem and gate 9 FAILs with the scene
            // id and the reason ("re-author this beat").
            // E1 ledger: the repair is announced (record-only).
            const { withEngine } = require("./lib/post-plan-ledger");
            let rep;
            withEngine("contract_repair", "gate-9", "beat-brief contract repair", [sc], (s2) => {
              rep = applyContractRepair(s2[0], brief);
              return { scenes: [rep.scene] };
            });
            config.scenes[i] = rep.scene;
            repairedCount++;
            for (const pb of rep.problems) {
              console.error(`  ✗ UNRESOLVED ${pb.sceneId} [${pb.field}]: ${pb.message}`);
              contractViolations.push({ system: "VisualContract", rule: `UNRESOLVED_${String(pb.field || "icon").toUpperCase()}`, sceneId: pb.sceneId, message: pb.message });
            }
          } else {
            contractViolations.push(...val.violations);
          }
        }
      }
      if (autoFix && repairedCount > 0) {
        fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
        console.log(`  [AUTO-FIX] Repaired ${repairedCount} scenes violating visual contract.`);
      }
      contractPassed = contractViolations.length === 0;
    } catch (_) {}
  }

  // Evaluate Semantic Relevance, Era Integrity, Proposition Integrity & VIG (Gate 10A, 10B, 11)
  // the book's WORLD decides, not its genre label ("classics" ≠ antiquity) — lib/ancient-world.js
  let gateBible = null, gateBook = null;
  try { gateBible = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../books/${slug}/story-bible.json`), "utf8")); } catch (_) {}
  try { gateBook = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../books/${slug}/book.json`), "utf8")); } catch (_) {}
  const isAncient = isAncientWorld({ genre: config.meta?.genre, author: config.meta?.author, bible: gateBible,
    era: gateBook?.engineProfile?.era ?? config.meta?.era });

  const propositionBook = usesPropositionWorlds(config);
  let worldViolations = [];
  let propositionViolations = [];
  let vigViolations = [];

  function evaluateSemanticAndVigGates(cfg) {
    worldViolations = [];
    propositionViolations = [];
    vigViolations = [];

    const scenes = cfg.scenes || [];
    let consecutiveLowVig = 0;
    let totalVigScore = 0;

    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i];
      const res = scoreSemanticRelevance(sc, sc._narration, { isAncient, neutral: !propositionBook });

      // Gate 10A: World & Historical Integrity (0 Anachronisms)
      if (res.worldScore < 8) {
        worldViolations.push({
          sceneId: sc.id,
          index: i,
          rule: "Gate 10A: World & Era Integrity",
          reasons: res.reasons.filter((r) => r.includes("Gate 10A")),
        });
      }

      // Gate 10B: Propositional & Causal Integrity & Director Spec
      if (res.semanticScore < 7) {
        propositionViolations.push({
          sceneId: sc.id,
          index: i,
          rule: "Gate 10B: Propositional Integrity",
          reasons: res.reasons.filter((r) => r.includes("Gate 10B")),
        });
      }

      if (!sc.director || !sc.director.viewerFocus || !sc.director.blocking) {
        propositionViolations.push({
          sceneId: sc.id,
          index: i,
          rule: "Gate 10B: Incomplete Director Spec",
          reasons: [`Scene ${sc.id} is missing director specification (viewerFocus, visualSubject, blocking)`],
        });
      }

      if (!sc.visualProposition || !sc.visualProposition.visualQuestion || !sc.visualProposition.visualAnswer) {
        propositionViolations.push({
          sceneId: sc.id,
          index: i,
          rule: "Gate 10B: Missing Visual Question & Answer",
          reasons: [`Scene ${sc.id} is missing visualQuestion or visualAnswer`],
        });
      }

      // Gate 11: Visual Information Gain (VIG 0–5 Cognitive Scale) & Anti-Stagnation Floor
      const vigScore = VIG_NON_BLOCKING && typeof res.vigScore === "number" ? res.vigScore : typeof sc.vigScore === "number" ? sc.vigScore : (res.vigScore ?? (sc.visualInformationGain === "high" ? 4 : sc.visualInformationGain === "medium" ? 2 : 1));
      totalVigScore += vigScore;

      // Rule 1: No consecutive low VIG (score <= 1)
      if (vigScore <= 1) {
        consecutiveLowVig++;
        if (consecutiveLowVig > 1) {
          vigViolations.push({
            sceneId: sc.id,
            index: i,
            rule: "Gate 11: Consecutive Low VIG",
            message: `Consecutive low Visual Information Gain (score ${vigScore}/5, level '${res.vigLevel}') at scene ${sc.id} (index ${i})`,
          });
        }
      } else {
        consecutiveLowVig = 0;
      }

      // Rule 2: Zero decorative wallpaper (VIG 0) on conceptual argumentation beats
      if (vigScore === 0 && res.proposition) {
        vigViolations.push({
          sceneId: sc.id,
          index: i,
          rule: "Gate 11: Decorative Wallpaper in Conceptual Beat",
          message: `Scene ${sc.id} has VIG 0 (decorative) despite active proposition "${res.proposition.claim}"`,
        });
      }

      // Rule 3: Anti-stagnation: Static motif repetition without state progression or camera shift
      if (i >= 2) {
        const p0 = scenes[i - 2].props?.[0];
        const p1 = scenes[i - 1].props?.[0];
        const p2 = sc.props?.[0];
        if (
          p0 && p1 && p2 &&
          p0.type === p1.type && p1.type === p2.type &&
          (p0.stateIndex ?? 0) === (p1.stateIndex ?? 0) &&
          (p1.stateIndex ?? 0) === (p2.stateIndex ?? 0) &&
          scenes[i - 2].shot === scenes[i - 1].shot &&
          scenes[i - 1].shot === sc.shot
        ) {
          vigViolations.push({
            sceneId: sc.id,
            index: i,
            rule: "Gate 11: Static Visual Stagnation",
            message: `Static motif "${p2.type}" frozen across beats ${i - 2}..${i} without state progression or shot variation`,
          });
        }
      }

      // Rule 4: State Machine Wrap-Around Ban: Never reset from >0 back to 0 without world change
      if (i > 0) {
        const prevProp = scenes[i - 1].props?.[0];
        const currProp = sc.props?.[0];
        if (
          prevProp && currProp &&
          prevProp.type === currProp.type &&
          typeof prevProp.stateIndex === "number" &&
          typeof currProp.stateIndex === "number"
        ) {
          if (prevProp.stateIndex > 0 && currProp.stateIndex === 0) {
            vigViolations.push({
              sceneId: sc.id,
              index: i,
              rule: "Gate 11: Illegal State Wrap-Around",
              message: `Prop "${currProp.type}" illegally wrapped around from state ${prevProp.stateIndex} back to 0 at scene ${sc.id}`,
            });
          }
        }
      }

      // Rule 5: Critical causal/thesis beat floor: Causal & consequence claims require VIG >= 2.5
      const cType = sc.visualProposition?.claimType;
      if ((cType === "causal" || cType === "consequence") && vigScore < 2.5) {
        vigViolations.push({
          sceneId: sc.id,
          index: i,
          rule: "Gate 11: Critical Causal Beat VIG Floor",
          message: `Scene ${sc.id} asserts a ${cType} claim but has insufficient VIG (${vigScore}/5.0 < 2.5)`,
        });
      }
    }

    // Rule 6: Average VIG score floor across the entire video (>= 2.5/5.0)
    const avgVig = scenes.length > 0 ? totalVigScore / scenes.length : 0;
    if (scenes.length > 0 && avgVig < 2.5) {
      vigViolations.push({
        sceneId: "ALL",
        index: -1,
        rule: "Gate 11: Low Average VIG Score",
        message: `Average VIG score across video is ${avgVig.toFixed(2)}/5.0 (minimum required: 2.5)`,
      });
    }

    // Rule 7: Pacing Budget: Low VIG scenes (score <= 1) allowed for dialogue/reaction, but capped at <= 25% of all scenes
    const lowVigCount = scenes.filter((s) => (typeof s.vigScore === "number" ? s.vigScore : 1) <= 1).length;
    const lowVigRatio = scenes.length > 0 ? lowVigCount / scenes.length : 0;
    if (lowVigRatio > 0.25) {
      vigViolations.push({
        sceneId: "ALL",
        index: -1,
        rule: "Gate 11: Low-VIG Pacing Budget Exceeded",
        message: `Low VIG scenes account for ${(lowVigRatio * 100).toFixed(1)}% of video (maximum allowed: 25.0%)`,
      });
    }
  }

  evaluateSemanticAndVigGates(config);

  if (autoFix && (worldViolations.length > 0 || propositionViolations.length > 0 || (!VIG_NON_BLOCKING && vigViolations.length > 0))) {
    console.log(`  [AUTO-FIX] Enforcing Semantic Relevance, State Machines & VIG Floor for ${slug}...`);
    config = enforceSemanticRelevance(config, { isAncient });
    fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
    evaluateSemanticAndVigGates(config);
    console.log(`  [AUTO-FIX] Repaired: 10A violations: ${worldViolations.length}, 10B violations: ${propositionViolations.length}, 11 violations: ${vigViolations.length}`);
  }

  const worldPassed = worldViolations.length === 0;
  const propositionPassed = propositionViolations.length === 0;
  const vigPassed = vigViolations.length === 0;

  // Evaluate the Hard Gates
  const gateChecks = [
    {
      gate: 1,
      name: "Narrative Health (Golden Rules)",
      passed: audit.diagnostics.narrativePassed,
      detail: audit.diagnostics.narrativePassed ? "Zero explanation streaks / droughts" : "Narrative fatigue detected",
    },
    {
      gate: 2,
      name: "Promise & Curiosity Integrity",
      passed: audit.diagnostics.promisesPassed,
      detail: audit.diagnostics.promisesPassed ? "100% promises resolved with earned payoffs" : "Dangling promises / orphan payoffs",
    },
    {
      gate: 3,
      name: "Visual Freshness (Zero Stagnation)",
      passed: audit.diagnostics.stagnationPassed,
      detail: audit.diagnostics.stagnationPassed ? "Zero visual state repetition streaks" : "Visual stagnation alert",
    },
    {
      gate: 4,
      name: "Visual Novelty Budget",
      passed: audit.diagnostics.noveltyPassed,
      detail: audit.diagnostics.noveltyPassed ? "Optimal novelty distribution (metaphors, splits, diagrams)" : "Novelty drought (>60s)",
    },
    {
      gate: 5,
      name: "Chapter Curiosity Cycles",
      passed: audit.diagnostics.chaptersPassed,
      detail: audit.diagnostics.chaptersPassed ? "All chapters follow Question → Turn → Payoff" : "Chapter arc deficits",
    },
    {
      gate: 6,
      name: "Cognitive Compression Architecture",
      passed: (config.scenes || []).every((s) => !s.diagram || s.characters?.length === 0 || s.characters?.[0]?.scale <= 0.65),
      detail: "Characters yield stage focal point to hero diagrams",
    },
    {
      gate: 7,
      name: "Audio Director Punctuation",
      passed: audit.diagnostics.audioPassed,
      detail: audit.diagnostics.audioPassed ? "100% payoffs & chapter cards punctured with tactile SFX" : "Missing audio punch",
    },
    {
      gate: 8,
      name: "Holistic Retention Score (>= 85)",
      passed: audit.score >= 85,
      detail: `Retention score ${audit.score}/100 [${audit.grade}]`,
    },
    {
      gate: 9,
      name: "Visual Contract Compliance",
      passed: contractPassed,
      detail: contractPassed
        ? "100% scenes satisfy visual contracts (0 forbidden motifs, characters preserved)"
        : `${contractViolations.length} visual contract violations detected`,
    },
    {
      gate: "10A",
      name: "World & Era Integrity (0 Anachronisms)",
      passed: worldPassed,
      detail: worldPassed
        ? "100% scenes historically and environmentally coherent (0 modern intrusions)"
        : `${worldViolations.length} era integrity / anachronism violations detected`,
    },
    {
      gate: "10B",
      name: "Propositional & Causal Integrity",
      passed: propositionPassed,
      detail: propositionPassed
        ? "100% scenes visually embody philosophical claim & causal mechanism"
        : `${propositionViolations.length} proposition / causal dissonance violations detected`,
    },
    {
      gate: 11,
      name: "Visual Information Gain & Dynamic Progression",
      passed: vigPassed,
      detail: vigPassed
        ? "Zero consecutive low-VIG scenes & active state-machine progression"
        : `${vigViolations.length} VIG deficits or static freezing violations detected`,
    },
  ];

  for (const g of gateChecks) g.blocking = !NON_BLOCKING.has(String(g.gate));
  const allPassed = gateChecks.filter((g) => g.blocking).every((g) => g.passed);
  const nonBlockingFailed = gateChecks.filter((g) => !g.blocking && !g.passed).map((g) => g.gate);

  return {
    slug,
    allPassed,
    score: audit.score,
    grade: audit.grade,
    gateChecks,
    nonBlockingFailed,
    nonBlockingViolations: VIG_NON_BLOCKING ? vigViolations : [],
    violations: [
      ...(audit.allViolations || []),
      ...contractViolations,
      ...worldViolations,
      ...propositionViolations,
      ...(VIG_NON_BLOCKING ? [] : vigViolations),
    ],
  };
}

function printGateReport(r) {
  const symbol = r.allPassed ? "✓" : "✗";
  const status = r.allPassed ? "PASSED — GREEN LIGHT TO RENDER" : "BLOCKED — HARD GATE VIOLATION";

  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ANTIDOTE GOD MODE: PRE-RENDER HARD GATES                     ║`);
  console.log(`║  ${r.slug.padEnd(60)}  ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`  Decision:                  [${symbol}] ${status}`);
  console.log(`  Composite Retention Score: ${String(r.score).padStart(3)} / 100  [${r.grade}]`);

  console.log(`\n── Gate Verification Checklist ──────────────────────────────────`);
  for (const g of r.gateChecks) {
    const icon = g.passed ? "✓ PASS" : g.blocking === false ? "✗ FAIL (non-blocking)" : "✗ FAIL";
    console.log(`  [GATE ${g.gate}] ${g.name.padEnd(36)} [${icon}]  ${g.detail}`);
  }

  if (r.nonBlockingFailed && r.nonBlockingFailed.length) {
    console.log(`\n  Non-blocking FAIL (data/quality-policy.json hardGate.nonBlocking): gate ${r.nonBlockingFailed.join(", ")} — ${r.nonBlockingViolations.length} violation(s), reported, not repaired, render not blocked.`);
  }

  if (!r.allPassed) {
    console.log(`\n── Critical Blocking Violations (${r.violations.length}) ──────────────────────`);
    for (const v of r.violations.slice(0, 8)) {
      console.log(`  ⚠ [${v.system || "Gate"}] ${v.rule || v.message}`);
    }
    console.log(`\n  Run with '--auto-fix' to let Antidote autonomously repair all deficits.`);
  }

  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
}

function main() {
  if (args.slug) {
    const res = evaluateGates(args.slug, AUTO_FIX);
    printGateReport(res);
    if (!res.allPassed) process.exit(1);
    process.exit(0);
  }

  if (args.all) {
    const booksDir = path.resolve(__dirname, "../books");
    const slugs = fs.readdirSync(booksDir).filter((d) => {
      const cp = path.join(booksDir, d, "config.antidote.json");
      return fs.existsSync(cp);
    });

    console.log(`\n══ VERIFYING PRE-RENDER HARD GATES ACROSS CATALOGUE (${slugs.length} BOOKS) ══`);
    const results = [];

    for (const slug of slugs) {
      const res = evaluateGates(slug, AUTO_FIX);
      results.push(res);
    }

    console.log(`\n══ CATALOGUE PRE-RENDER HARD GATES SUMMARY ══`);
    console.log("Slug".padEnd(34) + "Score".padStart(7) + "Failed Gates".padStart(15) + "Decision".padStart(14));
    console.log("─".repeat(70));

    let failedCount = 0;
    for (const r of results) {
      if (!r.allPassed) failedCount++;
      const failedGates = r.gateChecks.filter((g) => !g.passed).map((g) => g.gate).join(",") || "None (0)";
      const decision = r.allPassed ? "GREEN LIGHT" : "BLOCKED";
      console.log(
        r.slug.padEnd(34) +
        String(r.score).padStart(7) +
        failedGates.padStart(15) +
        decision.padStart(14)
      );
    }
    console.log("─".repeat(70));
    console.log(`Result: ${results.length - failedCount}/${results.length} books cleared for production render.\n`);

    if (failedCount > 0) process.exit(1);
    process.exit(0);
  }

  console.log("Usage: node scripts/hard-gate.js --slug=<slug> [--auto-fix] | --all [--auto-fix]");
  process.exit(1);
}

main();
