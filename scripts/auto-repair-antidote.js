#!/usr/bin/env node
/**
 * auto-repair-antidote.js — Autonomous God Mode Auto-Repair Loop (Phase 9)
 *
 * Automatically detects and repairs retention deficits, stagnation, narrative fatigue,
 * promise drop-offs, novelty deficits, and audio gaps until a clean 100/100 score is achieved.
 *
 * Usage:
 *   node scripts/auto-repair-antidote.js --slug=<slug> [--dry] [--max-passes=4]
 *   node scripts/auto-repair-antidote.js --all [--dry]
 */

const fs = require("fs");
const path = require("path");
const { abs } = require("./lib/paths");
const { autoRepairAntidote } = require("./lib/antidote-auto-repair");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const DRY = !!args.dry;
const MAX_PASSES = parseInt(args["max-passes"] || "4", 10);

function repairBook(slug) {
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

  const result = autoRepairAntidote(config, chapters, { maxPasses: MAX_PASSES });

  if (!DRY && result.repairs.length > 0) {
    fs.writeFileSync(p, JSON.stringify(result.config, null, 2), "utf8");
  }

  return {
    slug,
    path: p,
    ...result,
  };
}

function printRepairReport(r) {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  ANTIDOTE GOD MODE: AUTO-REPAIR LOOP                           ║`);
  console.log(`║  ${r.slug.padEnd(60)}  ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`  Initial Retention Score:   ${String(r.initialScore).padStart(3)} / 100`);
  console.log(`  Final Retention Score:     ${String(r.finalScore).padStart(3)} / 100  [${r.grade || "S"}]`);
  console.log(`  Passes Executed:           ${r.passesRun}`);
  console.log(`  Repairs Applied:           ${r.repairs.length}`);
  console.log(`  Status:                    ${r.isFullyClean ? "✓ FULLY REPAIRED & OPTIMIZED" : "⚠ PARTIALLY REPAIRED"}`);

  if (r.repairs.length > 0) {
    console.log(`\n── Applied Autonomous Repairs (${r.repairs.length}) ──────────────────────`);
    for (const rep of r.repairs) {
      console.log(`  [Pass ${rep.pass} | ${rep.type}] ${rep.detail}`);
    }
  }

  if (DRY) {
    console.log(`\n  [DRY RUN] No changes written to disk.`);
  } else if (r.repairs.length > 0) {
    console.log(`\n  ✓ Saved repaired config to: ${r.path}`);
  }
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
}

function main() {
  if (args.slug) {
    const res = repairBook(args.slug);
    printRepairReport(res);
    return;
  }

  if (args.all) {
    const booksDir = path.resolve(__dirname, "../books");
    const slugs = fs.readdirSync(booksDir).filter((d) => {
      const cp = path.join(booksDir, d, "config.antidote.json");
      return fs.existsSync(cp);
    });

    console.log(`\n══ EXECUTING AUTO-REPAIR LOOP ACROSS CATALOGUE (${slugs.length} BOOKS) ══`);
    const results = [];

    for (const slug of slugs) {
      process.stdout.write(`Repairing ${slug}... `);
      const res = repairBook(slug);
      results.push(res);
      console.log(`${res.initialScore} -> ${res.finalScore} (${res.repairs.length} repairs, ${res.passesRun} passes)`);
    }

    console.log(`\n══ CATALOGUE AUTO-REPAIR SUMMARY ══`);
    console.log("Slug".padEnd(34) + "Initial".padStart(8) + "Final".padStart(8) + "Repairs".padStart(10) + "Result".padStart(10));
    console.log("─".repeat(70));

    for (const r of results) {
      const status = r.isFullyClean ? "CLEAN" : "PARTIAL";
      console.log(
        r.slug.padEnd(34) +
        String(r.initialScore).padStart(8) +
        String(r.finalScore).padStart(8) +
        String(r.repairs.length).padStart(10) +
        status.padStart(10)
      );
    }
    console.log("─".repeat(70));
    const totalRepairs = results.reduce((acc, r) => acc + r.repairs.length, 0);
    console.log(`Total repairs applied across catalogue: ${totalRepairs}\n`);
    return;
  }

  console.log("Usage: node scripts/auto-repair-antidote.js --slug=<slug> [--dry] | --all");
  process.exit(1);
}

main();
