#!/usr/bin/env node
/**
 * audit-promises.js — Promise / Payoff Lifecycle Auditor & Auto-Planner (Antidote God Mode: Phase 3)
 *
 * Enforces Director Rules:
 *   - Max open promises: 2-3 concurrent
 *   - Structured arc per promise: 1 Setup, 1-2 Tension/Escalation reminders, 1 Payoff
 *   - Payoff gelmeden yeni büyük promise açma
 *   - 100% promise resolution rate
 *
 * Usage:
 *   node scripts/audit-promises.js --slug=<slug> [--fix] [--json] [--soft]
 *   node scripts/audit-promises.js --all [--fix]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { planPromiseLifecycles, auditPromiseRules } = require("./lib/antidote-promise-engine");

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
  let promises = config.promises || [];

  if (shouldFix || promises.length === 0) {
    const planned = planPromiseLifecycles(scenes);
    promises = planned.promises;
    scenes = planned.scenes;
    config.promises = promises;
    config.scenes = scenes;
    if (shouldFix) {
      fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
    }
  }

  const audit = auditPromiseRules(scenes, promises);

  return {
    slug,
    totalScenes: scenes.length,
    totalPromises: promises.length,
    score: audit.score,
    passed: audit.passed,
    resolvedCount: audit.resolvedCount,
    unresolvedCount: audit.unresolvedCount,
    missingReminders: audit.missingReminders,
    maxConcurrent: audit.maxConcurrentObserved,
    violations: audit.violations,
    promises,
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS (PROMISES COHERENT)" : "✗ FAIL (PROMISE LEAK DETECTED)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  PROMISE / PAYOFF AUDIT: ${r.slug} (${status})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Promise Health Score:     ${r.score} / 10.0`);
  console.log(`  Total Scenes:             ${r.totalScenes}`);
  console.log(`  Planned Promise Arcs:     ${r.totalPromises}`);
  console.log(`  Resolved vs Unresolved:   ${r.resolvedCount} / ${r.totalPromises} (${r.unresolvedCount} open)`);
  console.log(`  Max Concurrent Promises:  ${r.maxConcurrent} (Limit: 3)`);

  if (r.promises && r.promises.length > 0) {
    console.log(`\n── Promise Lifecycle Summary (First 6 Arcs) ──`);
    console.log("ID".padEnd(8) + "Setup".padStart(8) + "Reminders".padStart(16) + "Payoff".padStart(10) + "Status".padStart(12));
    console.log("─".repeat(54));
    for (const p of r.promises.slice(0, 6)) {
      const rems = (p.reminderBeats || []).map((b) => `#${b}`).join(", ");
      console.log(
        p.promiseId.padEnd(8) +
        `#${p.setupBeat}`.padStart(8) +
        rems.padStart(16) +
        `#${p.payoffBeat}`.padStart(10) +
        p.status.padStart(12)
      );
    }
    if (r.promises.length > 6) {
      console.log(`... and ${r.promises.length - 6} more promise lifecycles.`);
    }
  }

  if (r.violations.length > 0) {
    console.log(`\n── Promise Violations (${r.violations.length}) ──`);
    for (const v of r.violations.slice(0, 8)) {
      console.log(`  [Beat #${v.beat}] ${v.rule}: ${v.details}`);
    }
    if (r.violations.length > 8) {
      console.log(`  ... and ${r.violations.length - 8} more violations.`);
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

    console.log("\n══ CATALOGUE PROMISE / PAYOFF HEALTH SUMMARY ══");
    console.log("Slug".padEnd(32) + "Promises".padStart(10) + "MaxConc".padStart(10) + "Score".padStart(8) + "Result".padStart(10));
    console.log("─".repeat(70));

    let failCount = 0;
    for (const r of results) {
      if (!r.passed) failCount++;
      const res = r.passed ? "PASS" : "FAIL";
      console.log(
        r.slug.padEnd(32) +
        `${r.totalPromises}`.padStart(10) +
        `${r.maxConcurrent}/3`.padStart(10) +
        `${r.score}`.padStart(8) +
        res.padStart(10)
      );
    }
    console.log("─".repeat(70));
    console.log(`Total: ${results.length} books, ${failCount} with promise issues.\n`);

    if (failCount > 0 && !SOFT) {
      process.exit(1);
    }
    return;
  }

  const slug = args.slug;
  if (!slug) {
    console.error("Usage: node scripts/audit-promises.js --slug=<slug> [--fix] [--json] [--soft]");
    console.error("       node scripts/audit-promises.js --all [--fix]");
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
