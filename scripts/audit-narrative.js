#!/usr/bin/env node
/**
 * audit-narrative.js — Narrative Director Core & Story Rules Auditor (Antidote God Mode: Phase 1)
 *
 * Audits a book against the 6 Golden Narrative Rules:
 *   1. No 3 consecutive EXPLANATION beats
 *   2. No 2 consecutive low-value beats (TRANSITION + SETUP)
 *   3. No unanswered QUESTION
 *   4. No PAYOFF without prior setup
 *   5. No unresolved SETUP / open promise
 *   6. No long stretch without escalation (>28s)
 *
 * Usage:
 *   node scripts/audit-narrative.js --slug=<slug> [--json] [--soft]
 *   node scripts/audit-narrative.js --all
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { auditNarrativeRules } = require("./lib/antidote-narrative-rules");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const SOFT = !!args.soft;
const AS_JSON = !!args.json;

function auditBook(slug) {
  const p = abs.antidoteConfig(slug);
  if (!fs.existsSync(p)) {
    console.error(`Error: Config not found at ${p}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(p, "utf8"));
  const scenes = config.scenes || [];
  const fps = (config.meta && config.meta.fps) || 30;

  const result = auditNarrativeRules(scenes, fps);

  // Distribution of narrative functions
  const counts = {};
  for (const s of scenes) {
    const f = (s.narrative && s.narrative.function) || "UNASSIGNED";
    counts[f] = (counts[f] || 0) + 1;
  }

  return {
    slug,
    totalScenes: scenes.length,
    narrativeScore: result.score,
    passed: result.passed,
    resolvedPromises: result.resolvedPromises,
    unresolvedPromises: result.unresolvedPromises,
    functionDistribution: counts,
    violations: result.violations,
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS (STORY COHERENT)" : "✗ FAIL (NARRATIVE FATIGUE RISK)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  NARRATIVE DIRECTOR AUDIT: ${r.slug} (${status})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Narrative Health Score:   ${r.narrativeScore} / 10.0`);
  console.log(`  Total Scenes:             ${r.totalScenes}`);
  console.log(`  Resolved Promises:        ${r.resolvedPromises}`);
  console.log(`  Unresolved Promises:      ${r.unresolvedPromises}`);
  console.log(`\n── Narrative Function Breakdown ──`);
  for (const [func, count] of Object.entries(r.functionDistribution)) {
    const pct = Math.round((count / r.totalScenes) * 100);
    console.log(`  ${func.padEnd(16)}: ${String(count).padStart(3)} (${pct}%)`);
  }

  if (r.violations.length > 0) {
    console.log(`\n── Story Rule Violations (${r.violations.length}) ──`);
    for (const v of r.violations.slice(0, 8)) {
      console.log(`  [Beat ${v.beatIndex} | ${v.sceneId}] ${v.rule}`);
      console.log(`    → ${v.message}`);
    }
    if (r.violations.length > 8) {
      console.log(`  ...and ${r.violations.length - 8} more violation(s).`);
    }
  }
  console.log(`══════════════════════════════════════════════════════════════\n`);
}

function main() {
  if (args.slug) {
    const r = auditBook(args.slug);
    if (AS_JSON) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      printReport(r);
    }
    if (!r.passed && !SOFT) process.exit(1);
    return;
  }

  if (args.all) {
    const booksDir = abs.booksDir();
    const dirs = fs.readdirSync(booksDir).filter((d) => {
      return fs.existsSync(path.join(booksDir, d, "config.antidote.json"));
    });

    const results = [];
    for (const slug of dirs) {
      results.push(auditBook(slug));
    }

    if (AS_JSON) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log("\n══ CATALOGUE NARRATIVE HEALTH SUMMARY ══");
      console.log("Slug".padEnd(30) + "Score".padStart(8) + "Promises".padStart(12) + "Violations".padStart(12) + "Result".padStart(10));
      console.log("─".repeat(72));
      let failed = 0;
      for (const r of results) {
        if (!r.passed) failed++;
        const res = r.passed ? "PASS" : "FAIL";
        console.log(
          r.slug.padEnd(30) +
          `${r.narrativeScore}`.padStart(8) +
          `${r.resolvedPromises}/${r.resolvedPromises + r.unresolvedPromises}`.padStart(12) +
          `${r.violations.length}`.padStart(12) +
          res.padStart(10)
        );
      }
      console.log("─".repeat(72));
      console.log(`Total: ${results.length} books, ${failed} failed.\n`);
    }
    if (results.some((r) => !r.passed) && !SOFT) process.exit(1);
    return;
  }

  console.error("Usage: node scripts/audit-narrative.js --slug=<slug> [--json] [--soft]");
  console.error("       node scripts/audit-narrative.js --all");
  process.exit(1);
}

main();
