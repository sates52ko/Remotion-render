#!/usr/bin/env node
/**
 * audit-stagnation.js — Visual Stagnation Auditor & Auto-Mitigator (Antidote God Mode: Phase 2)
 *
 * Monitors state progression across consecutive beats.
 * Rule: 3 consecutive beats with identical/near visual fingerprint = FAIL.
 *
 * Visual State Fingerprint:
 *   hash(shot, camera, charCount, pose, action, motif, diagram, environment, scale, textMode)
 *
 * Usage:
 *   node scripts/audit-stagnation.js --slug=<slug> [--fix] [--json] [--soft]
 *   node scripts/audit-stagnation.js --all [--fix]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { detectStagnation, mitigateStagnation } = require("./lib/antidote-stagnation-engine");

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

  let mitigationResult = null;
  if (shouldFix) {
    mitigationResult = mitigateStagnation(scenes);
    scenes = mitigationResult.scenes;
    config.scenes = scenes;
    fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
  }

  const audit = detectStagnation(scenes);

  return {
    slug,
    totalScenes: scenes.length,
    stagnationCount: audit.stagnationCount,
    uniqueFingerprints: audit.uniqueFingerprints,
    diversityRatio: Math.round(audit.diversityRatio * 100),
    passed: audit.isHealthy,
    violations: audit.violations,
    remediesApplied: mitigationResult ? mitigationResult.remediesApplied : [],
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS (DYNAMIC FLOW)" : "✗ FAIL (STAGNATION DETECTED)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  STAGNATION ENGINE AUDIT: ${r.slug} (${status})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Total Scenes:             ${r.totalScenes}`);
  console.log(`  Visual Stagnation Alerts: ${r.stagnationCount}`);
  console.log(`  Unique Visual States:     ${r.uniqueFingerprints} (${r.diversityRatio}% diversity)`);

  if (r.remediesApplied && r.remediesApplied.length > 0) {
    console.log(`\n── Auto-Remedies Applied (${r.remediesApplied.length}) ──`);
    for (const rem of r.remediesApplied.slice(0, 10)) {
      console.log(`  [Beat #${rem.beatIndex} | ${rem.sceneId}]: ${rem.remedy}`);
    }
    if (r.remediesApplied.length > 10) {
      console.log(`  ... and ${r.remediesApplied.length - 10} more remedies applied.`);
    }
  }

  if (r.violations.length > 0) {
    console.log(`\n── Stagnation Hotspots (${r.violations.length}) ──`);
    for (const v of r.violations.slice(0, 10)) {
      console.log(`  [${v.scenes.join(" → ")}]`);
      console.log(`    Reason: ${v.reason}`);
    }
    if (r.violations.length > 10) {
      console.log(`    ... and ${r.violations.length - 10} more hotspots.`);
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

    console.log("\n══ CATALOGUE VISUAL STAGNATION SUMMARY ══");
    console.log("Slug".padEnd(32) + "Scenes".padStart(8) + "Stagnant".padStart(10) + "Diversity".padStart(12) + "Result".padStart(10));
    console.log("─".repeat(72));

    let failCount = 0;
    for (const r of results) {
      if (!r.passed) failCount++;
      const res = r.passed ? "PASS" : "FAIL";
      console.log(
        r.slug.padEnd(32) +
        `${r.totalScenes}`.padStart(8) +
        `${r.stagnationCount}`.padStart(10) +
        `${r.diversityRatio}%`.padStart(12) +
        res.padStart(10)
      );
    }
    console.log("─".repeat(72));
    console.log(`Total: ${results.length} books, ${failCount} with stagnation.\n`);

    if (failCount > 0 && !SOFT) {
      process.exit(1);
    }
    return;
  }

  const slug = args.slug;
  if (!slug) {
    console.error("Usage: node scripts/audit-stagnation.js --slug=<slug> [--fix] [--json] [--soft]");
    console.error("       node scripts/audit-stagnation.js --all [--fix]");
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
