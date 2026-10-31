#!/usr/bin/env node
/**
 * p9a-polarity-lint.js — P9-A V6: the polarity lint, REPORT-ONLY.
 *
 * Flags Vox beats whose ONLY big on-screen text sits inside a negated or
 * rejected clause of the beat's own narration — the frame then presents a
 * rejected pole as the assertive message (the measured into-the-wild WRONG
 * class). Noisy by design; never a gate; no files under books/ are touched.
 *
 *   node scripts/p9a-polarity-lint.js [--slug=<slug>] [--sample=N]
 *
 * Output: console summary + audit/visionless-10x/p9a-polarity-report.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { onlyBigTextIsNegated } = require("./lib/vox-semantic.cjs");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const slug = args.slug;
if (!slug) { console.error("Usage: node scripts/p9a-polarity-lint.js --slug=<vox-slug> [--sample=N]"); process.exit(1); }

const configPath = path.join(ROOT, "books", slug, "config.vox.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const beats = config.beats || config.scenes || [];

const flagged = [];
for (const b of beats) {
  const props = (b.props && !Array.isArray(b.props)) ? b.props : null;
  if (!props) continue;
  const narration = String(props.text || "");
  const res = onlyBigTextIsNegated({ props }, narration);
  if (res.flagged) {
    flagged.push({
      beatId: b.id || null,
      tokens: res.tokens,
      reason: res.reason,
      narration: narration.slice(0, 220),
    });
  }
}

// A small human-readable sample for the report / mute test triage.
const sampleN = args.sample ? parseInt(args.sample, 10) : 10;
const sample = flagged.slice(0, sampleN);

const doc = {
  slug,
  generatedAt: new Date().toISOString(),
  mode: "REPORT-ONLY (P9-A V6; never a gate)",
  beatsChecked: beats.length,
  flagged: flagged.length,
  flagRate: beats.length ? +(flagged.length / beats.length).toFixed(3) : 0,
  sample,
  all: flagged,
};
const OUT = path.join(ROOT, "audit", "visionless-10x", "p9a-polarity-report.json");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");

console.log(`V6 polarity lint (report-only) · ${slug}`);
console.log(`   beats: ${beats.length}   flagged: ${flagged.length} (${doc.flagRate * 100}%)`);
for (const f of sample) {
  console.log(`   ⚠ ${f.beatId || "?"} [${f.tokens.join(" | ")}] — ${f.reason}`);
}
console.log(`\nreport: audit/visionless-10x/p9a-polarity-report.json`);
