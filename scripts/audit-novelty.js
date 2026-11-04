#!/usr/bin/env node
/**
 * audit-novelty.js — Visual Novelty Budget Auditor & Balancer (Antidote God Mode: Phase 4)
 *
 * Enforces Visual Novelty Allocation:
 *   Per minute:
 *     - 1 Hero visual metaphor
 *     - 1 Split / Contrast
 *     - 1 Data / Diagram
 *     - 1 High-stakes reaction
 *     - 1 Micro-pattern-break
 *
 * Thresholds:
 *   - 45s without novel visual = WARNING
 *   - 60s without novel visual = FAIL
 *
 * Usage:
 *   node scripts/audit-novelty.js --slug=<slug> [--fix] [--json] [--soft]
 *   node scripts/audit-novelty.js --all [--fix]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { auditNoveltyBudget, balanceNoveltyBudget } = require("./lib/antidote-novelty-budget");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const SOFT = !!args.soft;
const AS_JSON = !!args.json;
const FIX = !!args.fix;

function auditBook(slug, shouldFix = false) {
  const p = abs.antidoteConfig(slug);
  if (!fs.existsSync(p)) {
    console.error(`Error: Config not found at ${p}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(p, "utf8"));
  let scenes = config.scenes || [];
  const fps = (config.meta && config.meta.fps) || 30;

  let balanceResult = null;
  if (shouldFix) {
    balanceResult = balanceNoveltyBudget(scenes, fps);
    scenes = balanceResult.scenes;
    config.scenes = scenes;
    fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
  }

  const audit = auditNoveltyBudget(scenes, fps);

  return {
    slug,
    totalScenes: scenes.length,
    durationSeconds: audit.totalDurationSeconds,
    durationMinutes: audit.totalMinutes,
    score: audit.score,
    passed: audit.passed,
    warnings: audit.warnings,
    failures: audit.failures,
    typeFrequencies: audit.typeFrequencies,
    densityPerMinute: audit.densityPerMinute,
    remediesApplied: balanceResult ? balanceResult.remediesApplied : [],
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS (NOVELTY BALANCED)" : "✗ FAIL (VISUAL DROUGHT DETECTED)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  VISUAL NOVELTY BUDGET AUDIT: ${r.slug} (${status})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Novelty Health Score:     ${r.score} / 10.0`);
  console.log(`  Total Duration:           ${r.durationMinutes} min (${r.durationSeconds}s, ${r.totalScenes} scenes)`);
  console.log(`  Critical Failures (>60s): ${r.failures.length}`);
  console.log(`  Warnings (>45s gap):      ${r.warnings.length}`);

  console.log(`\n── Novelty Density (events / minute) ──`);
  console.log(`  • Hero Metaphor:          ${r.densityPerMinute.HERO_METAPHOR}/min (Total: ${r.typeFrequencies.HERO_METAPHOR})`);
  console.log(`  • Split / Contrast:       ${r.densityPerMinute.SPLIT_CONTRAST}/min (Total: ${r.typeFrequencies.SPLIT_CONTRAST})`);
  console.log(`  • Data / Diagram:         ${r.densityPerMinute.DATA_DIAGRAM}/min (Total: ${r.typeFrequencies.DATA_DIAGRAM})`);
  console.log(`  • High-Stakes Reaction:   ${r.densityPerMinute.HIGH_STAKES_REACTION}/min (Total: ${r.typeFrequencies.HIGH_STAKES_REACTION})`);
  console.log(`  • Micro-Pattern-Break:    ${r.densityPerMinute.PATTERN_BREAK}/min (Total: ${r.typeFrequencies.PATTERN_BREAK})`);

  if (r.remediesApplied && r.remediesApplied.length > 0) {
    console.log(`\n── Auto-Remedies Injected (${r.remediesApplied.length}) ──`);
    for (const rem of r.remediesApplied.slice(0, 8)) {
      console.log(`  [Beat #${rem.beat} | ${rem.sceneId}]: Injected ${rem.injectedType} after ${rem.gapSeconds}s drought`);
    }
    if (r.remediesApplied.length > 8) {
      console.log(`  ... and ${r.remediesApplied.length - 8} more remedies.`);
    }
  }

  if (r.failures.length > 0 || r.warnings.length > 0) {
    console.log(`\n── Visual Drought Alerts ──`);
    for (const f of r.failures.slice(0, 5)) {
      console.log(`  [CRITICAL FAIL] Beat #${f.beat} (${f.sceneId}): ${f.details}`);
    }
    for (const w of r.warnings.slice(0, 5)) {
      console.log(`  [WARNING] Beat #${w.beat} (${w.sceneId}): ${w.details}`);
    }
  }
  console.log(`══════════════════════════════════════════════════════════════\n`);
}

function run() {
  if (args.all) {
    const booksDir = abs.booksDir();
    const dirs = fs.readdirSync(booksDir).filter((d) => {
      const cp = path.join(booksDir, d, "config.antidote.json");
      return fs.existsSync(cp);
    });

    const results = dirs.map((d) => auditBook(d, FIX));

    if (AS_JSON) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log("\n══ CATALOGUE VISUAL NOVELTY BUDGET SUMMARY ══");
    console.log("Slug".padEnd(32) + "Score".padStart(8) + "Fails".padStart(8) + "Warns".padStart(8) + "Metaphor".padStart(10) + "Result".padStart(10));
    console.log("─".repeat(76));

    let failCount = 0;
    for (const r of results) {
      if (!r.passed) failCount++;
      const res = r.passed ? "PASS" : "FAIL";
      console.log(
        r.slug.padEnd(32) +
        `${r.score}`.padStart(8) +
        `${r.failures.length}`.padStart(8) +
        `${r.warnings.length}`.padStart(8) +
        `${r.densityPerMinute.HERO_METAPHOR}/m`.padStart(10) +
        res.padStart(10)
      );
    }
    console.log("─".repeat(76));
    console.log(`Total: ${results.length} books, ${failCount} with visual drought.\n`);

    if (failCount > 0 && !SOFT) {
      process.exit(1);
    }
    return;
  }

  const slug = args.slug;
  if (!slug) {
    console.error("Usage: node scripts/audit-novelty.js --slug=<slug> [--fix] [--json] [--soft]");
    console.error("       node scripts/audit-novelty.js --all [--fix]");
    process.exit(1);
  }

  const result = auditBook(slug, FIX);
  if (AS_JSON) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  if (!result.passed && !SOFT) {
    process.exit(1);
  }
}

run();
