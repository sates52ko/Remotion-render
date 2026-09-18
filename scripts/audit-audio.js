#!/usr/bin/env node
/**
 * audit-audio.js — Audio Director Sound Design Auditor (Antidote God Mode: Phase 7)
 *
 * Audits the sound design layer:
 *   - Frame-accurate tactile SFX (pop, whoosh, ding, thud)
 *   - Selective silence before major revelations
 *   - 100% payoff punctuation
 *   - Strict gain staging (never masks dialogue)
 *
 * Usage:
 *   node scripts/audit-audio.js --slug=<slug> [--fix] [--json] [--soft]
 *   node scripts/audit-audio.js --all [--fix]
 */

const fs = require("fs");
const path = require("path");
const { abs, listAntidoteBooks } = require("./lib/paths");
const { directAudioEvents, auditAudioDirector } = require("./lib/antidote-audio-director");

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

  if (shouldFix) {
    const directed = directAudioEvents(scenes, fps);
    scenes = directed.scenes;
    config.scenes = scenes;
    config.audioEvents = directed.audioEvents;
    fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
  }

  const audit = auditAudioDirector(scenes, fps);

  return {
    slug,
    totalScenes: scenes.length,
    score: audit.score,
    passed: audit.passed,
    violations: audit.violations,
    metrics: audit.metrics,
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS (AUDIO SOUNDSCAPE OPTIMAL)" : "✗ FAIL (AUDIO DEFICIT)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  AUDIO DIRECTOR AUDIT: ${r.slug} (${status})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Audio Health Score:       ${r.score} / 10.0`);
  console.log(`  Total Scenes:             ${r.totalScenes}`);
  console.log(`  Payoff Chime Coverage:    ${r.metrics.payoffCoverage} (${r.metrics.payoffCount} payoffs)`);
  console.log(`  Chapter Impact Coverage:  ${r.metrics.chapterCoverage} (${r.metrics.chapterCount} chapters)`);
  console.log(`  Kinetic Text Pop Sync:    ${r.metrics.textCoverage} (${r.metrics.textCount} text callouts)`);

  if (r.violations && r.violations.length > 0) {
    console.log(`\n── Audio Soundscape Violations (${r.violations.length}) ──`);
    for (const v of r.violations.slice(0, 10)) {
      console.log(`  [Beat ${v.beatIndex} | ${v.sceneId}] ${v.rule}`);
      console.log(`    → ${v.message}`);
    }
    if (r.violations.length > 10) {
      console.log(`  ... and ${r.violations.length - 10} more audio violations.`);
    }
  }
  console.log(`══════════════════════════════════════════════════════════════\n`);
}

function main() {
  if (args.slug) {
    const result = auditBook(args.slug, FIX);
    if (AS_JSON) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printReport(result);
    }
    if (!result.passed && !SOFT) process.exit(1);
    return;
  }

  if (args.all) {
    const booksDir = path.resolve(__dirname, "../books");
    const slugs = fs.readdirSync(booksDir).filter((d) => {
      const cp = path.join(booksDir, d, "config.antidote.json");
      return fs.existsSync(cp);
    });
    const results = [];

    for (const slug of slugs) {
      try {
        const r = auditBook(slug, FIX);
        results.push(r);
      } catch (err) {
        results.push({ slug, totalScenes: 0, score: 0, passed: false, violations: [{ rule: "ERROR", message: err.message }] });
      }
    }

    if (AS_JSON) {
      console.log(JSON.stringify(results, null, 2));
      const allPassed = results.every((r) => r.passed);
      if (!allPassed && !SOFT) process.exit(1);
      return;
    }

    console.log(`\n══ CATALOGUE AUDIO DIRECTOR SOUND DESIGN SUMMARY ══`);
    console.log("Slug".padEnd(35) + "Score".padStart(8) + "Payoff".padStart(10) + "Chapter".padStart(10) + "Result".padStart(10));
    console.log("─".repeat(73));

    for (const r of results) {
      const res = r.passed ? "PASS" : "FAIL";
      const payoffCov = r.metrics?.payoffCoverage || "N/A";
      const chCov = r.metrics?.chapterCoverage || "N/A";
      console.log(
        r.slug.padEnd(35) +
        String(r.score).padStart(8) +
        payoffCov.padStart(10) +
        chCov.padStart(10) +
        res.padStart(10)
      );
    }
    console.log("─".repeat(73));

    const failed = results.filter((r) => !r.passed);
    console.log(`Total: ${results.length} books, ${failed.length} with audio deficits.\n`);

    if (failed.length > 0 && !SOFT) process.exit(1);
    return;
  }

  console.log("Usage: node scripts/audit-audio.js --slug=<slug> [--fix] | --all [--fix]");
  process.exit(1);
}

main();
