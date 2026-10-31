#!/usr/bin/env node
/**
 * audit-chapters.js — Chapter-Level Narrative Arc Auditor (Antidote God Mode: Phase 6)
 *
 * Ensures each chapter functions as an active curiosity cycle:
 *   - Chapter Card as a new curiosity cycle beginning
 *   - 1 Macro question
 *   - 2-3 Supporting principles
 *   - 1 Counter-intuitive turn
 *   - 1 Memorable visual payoff
 *
 * Usage:
 *   node scripts/audit-chapters.js --slug=<slug> [--fix] [--json] [--soft]
 *   node scripts/audit-chapters.js --all [--fix]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { planChapterArcs, auditChapterArcs } = require("./lib/antidote-chapter-arcs");

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

  // Load chapters from youtube-meta.json if present
  let chapters = [];
  const metaPath = abs.youtubeMeta(slug);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      chapters = meta.chapters || [];
    } catch (_) {}
  }

  if (shouldFix) {
    const planned = planChapterArcs(scenes, chapters, fps);
    scenes = planned.scenes;
    config.scenes = scenes;
    fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf8");
  }

  const audit = auditChapterArcs(scenes, chapters, fps);

  return {
    slug,
    totalScenes: scenes.length,
    totalChapters: audit.totalChapters,
    score: audit.score,
    passed: audit.passed,
    violations: audit.violations,
    arcReports: audit.arcReports,
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS (CHAPTER ARCS COHERENT)" : "✗ FAIL (CHAPTER ARC DEFICIT)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  CHAPTER-LEVEL NARRATIVE ARC AUDIT: ${r.slug} (${status})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Chapter Health Score:     ${r.score} / 10.0`);
  console.log(`  Total Chapters:           ${r.totalChapters}`);
  console.log(`  Total Scenes:             ${r.totalScenes}`);

  if (r.arcReports && r.arcReports.length > 0) {
    console.log(`\n── Chapter Curiosity Cycles (First 8 Chapters) ──`);
    console.log("No".padEnd(6) + "Title".padEnd(30) + "Question".padStart(10) + "Turn".padStart(8) + "Payoff".padStart(10) + "Result".padStart(8));
    console.log("─".repeat(72));
    for (const ch of r.arcReports.slice(0, 8)) {
      const q = ch.hasQuestion ? "✓" : "✗";
      const t = ch.hasContradiction ? "✓" : "✗";
      const p = ch.hasPayoff ? "✓" : "✗";
      const res = ch.isCoherent ? "PASS" : "WARN";
      const titleShort = (ch.title || "CHAPTER").slice(0, 28);
      console.log(
        `#${ch.chapterNumber}`.padEnd(6) +
        titleShort.padEnd(30) +
        q.padStart(10) +
        t.padStart(8) +
        p.padStart(10) +
        res.padStart(8)
      );
    }
    if (r.arcReports.length > 8) {
      console.log(`... and ${r.arcReports.length - 8} more chapters.`);
    }
  }

  if (r.violations.length > 0) {
    console.log(`\n── Chapter Arc Violations (${r.violations.length}) ──`);
    for (const v of r.violations.slice(0, 5)) {
      console.log(`  [Chapter #${v.chapterNumber} | ${v.title}] Missing: ${v.missing.join(", ")}`);
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

    console.log("\n══ CATALOGUE CHAPTER NARRATIVE ARCS SUMMARY ══");
    console.log("Slug".padEnd(32) + "Chapters".padStart(10) + "Score".padStart(8) + "Deficits".padStart(10) + "Result".padStart(10));
    console.log("─".repeat(70));

    let failCount = 0;
    for (const r of results) {
      if (!r.passed) failCount++;
      const res = r.passed ? "PASS" : "FAIL";
      console.log(
        r.slug.padEnd(32) +
        `${r.totalChapters}`.padStart(10) +
        `${r.score}`.padStart(8) +
        `${r.violations.length}`.padStart(10) +
        res.padStart(10)
      );
    }
    console.log("─".repeat(70));
    console.log(`Total: ${results.length} books, ${failCount} with chapter deficits.\n`);

    if (failCount > 0 && !SOFT) {
      process.exit(1);
    }
    return;
  }

  const slug = args.slug;
  if (!slug) {
    console.error("Usage: node scripts/audit-chapters.js --slug=<slug> [--fix] [--json] [--soft]");
    console.error("       node scripts/audit-chapters.js --all [--fix]");
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
