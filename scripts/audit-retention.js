#!/usr/bin/env node
/**
 * audit-retention.js — Master Retention Auditor (Antidote God Mode: Phase 8)
 *
 * Runs the holistic retention audit aggregating:
 *   - Story Health (25%)
 *   - Stagnation (20%)
 *   - Promises (20%)
 *   - Novelty Budget (15%)
 *   - Chapter Arcs (10%)
 *   - Audio Soundscape (10%)
 *
 * Usage:
 *   node scripts/audit-retention.js --slug=<slug> [--json] [--soft]
 *   node scripts/audit-retention.js --all [--json] [--soft]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { auditHolisticRetention } = require("./lib/antidote-retention-auditor");

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
  let chapters = [];
  const metaPath = abs.youtubeMeta(slug);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      chapters = meta.chapters || [];
    } catch (_) {}
  }

  const audit = auditHolisticRetention(config, chapters);

  return {
    slug,
    totalScenes: (config.scenes || []).length,
    ...audit,
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS (AUDIENCE RETENTION OPTIMIZED)" : "✗ FAIL (RETENTION DROP RISK)";
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ANTIDOTE GOD MODE: HOLISTIC RETENTION AUDIT                   ║`);
  console.log(`║  ${r.slug.padEnd(60)}  ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`  Composite Retention Score: ${String(r.score).padStart(3)} / 100  [${r.grade}]`);
  console.log(`  Audit Status:              ${status}`);
  console.log(`  Total Scenes:              ${r.totalScenes}`);
  console.log(`  Predicted Drop Hotspots:   ${r.hotspots.length}`);

  console.log(`\n── Subsystem Performance Breakdown ─────────────────────────────`);
  const subs = [
    { name: "1. Narrative Story Health (25%)", score: r.subScores.narrative, pass: r.diagnostics.narrativePassed },
    { name: "2. Stagnation Free Score  (20%)", score: r.subScores.stagnation, pass: r.diagnostics.stagnationPassed },
    { name: "3. Promise / Payoffs     (20%)", score: r.subScores.promises, pass: r.diagnostics.promisesPassed },
    { name: "4. Visual Novelty Budget (15%)", score: r.subScores.novelty, pass: r.diagnostics.noveltyPassed },
    { name: "5. Chapter Curiosity Arc (10%)", score: r.subScores.chapters, pass: r.diagnostics.chaptersPassed },
    { name: "6. Audio Soundscape      (10%)", score: r.subScores.audio, pass: r.diagnostics.audioPassed },
  ];

  for (const s of subs) {
    const bar = "█".repeat(Math.round(s.score)) + "░".repeat(10 - Math.round(s.score));
    const icon = s.pass ? "✓" : "✗";
    console.log(`  ${s.name.padEnd(35)} [${bar}] ${String(s.score).padStart(4)}/10  ${icon}`);
  }

  if (r.hotspots.length > 0) {
    console.log(`\n── Predicted Retention Hotspots (${r.hotspots.length}) ──────────────`);
    for (const h of r.hotspots.slice(0, 8)) {
      console.log(`  [${h.timeRange}] Beat #${h.sceneIndex} (${h.sceneId})`);
      for (const risk of h.risks) {
        console.log(`    ⚠ [${risk.severity}] ${risk.type}: ${risk.detail}`);
      }
    }
    if (r.hotspots.length > 8) {
      console.log(`  ... and ${r.hotspots.length - 8} more retention hotspots.`);
    }
  } else {
    console.log(`\n  ✓ Zero audience drop-off hotspots predicted! Continuous engagement flow.`);
  }

  if (r.allViolations.length > 0) {
    console.log(`\n── Critical Violations (${r.allViolations.length}) ───────────────────────────`);
    for (const v of r.allViolations.slice(0, 6)) {
      console.log(`  [${v.system}] Beat ${v.beatIndex || v.chapterNumber || "?"}: ${v.rule || v.message}`);
    }
  }

  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
}

function main() {
  if (args.slug) {
    const result = auditBook(args.slug);
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
        const r = auditBook(slug);
        results.push(r);
      } catch (err) {
        results.push({ slug, totalScenes: 0, score: 0, grade: "ERROR", passed: false, hotspots: [], subScores: {}, diagnostics: {} });
      }
    }

    if (AS_JSON) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log(`\n═════════════ ANTIDOTE GOD MODE: RETENTION LEADERBOARD ═════════════`);
    console.log("Slug".padEnd(34) + "Score".padStart(7) + "Grade".padStart(12) + "Hotspots".padStart(10) + "Result".padStart(10));
    console.log("─".repeat(73));

    for (const r of results) {
      const res = r.passed ? "PASS" : "FAIL";
      console.log(
        r.slug.padEnd(34) +
        String(r.score).padStart(7) +
        r.grade.slice(0, 10).padStart(12) +
        String(r.hotspots.length).padStart(10) +
        res.padStart(10)
      );
    }
    console.log("─".repeat(73));

    const avgScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length);
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`Catalogue Average Score: ${avgScore}/100 | ${passedCount}/${results.length} fully optimized.\n`);

    if (passedCount < results.length && !SOFT) process.exit(1);
    return;
  }

  console.log("Usage: node scripts/audit-retention.js --slug=<slug> [--json] [--soft] | --all");
  process.exit(1);
}

main();
