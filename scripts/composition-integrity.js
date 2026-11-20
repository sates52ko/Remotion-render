#!/usr/bin/env node
/**
 * composition-integrity.js — record what the pipeline planned, and refuse
 * configs that were made to pass by deleting or bulk-remapping it.
 *
 *   node scripts/composition-integrity.js --slug=<slug> --snapshot [--reason="..."]
 *   node scripts/composition-integrity.js --slug=<slug> [--report-only]
 *
 * make-book snapshots after the last automated writer (hard-gate auto-fix) and
 * checks again right before render. A deliberate hand edit is accepted only by
 * re-snapshotting WITH a reason, which is kept in the manifest history — the
 * decision is visible instead of silent.
 */
const fs = require("fs");
const path = require("path");
const { snapshot, compare } = require("./lib/composition-integrity");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; }));
const slug = args.slug;
if (!slug) { console.error("Usage: node scripts/composition-integrity.js --slug=<slug> [--snapshot [--reason=...]] [--report-only]"); process.exit(1); }

const root = path.resolve(__dirname, "..");
const cfgPath = path.join(root, "books", slug, "config.antidote.json");
const manPath = path.join(root, "books", slug, "plan-manifest.json");
if (!fs.existsSync(cfgPath)) { console.error(`No Antidote config: ${path.relative(root, cfgPath)}`); process.exit(1); }
const config = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const previous = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf8")) : null;

if (args.snapshot) {
  const reason = typeof args.reason === "string" ? args.reason : "pipeline";
  // Re-snapshotting over an existing manifest silently would re-launder the
  // config; it needs an explicit reason that lands in the history.
  if (previous && reason === "pipeline" && !args.replan) {
    const cmp = compare(config, previous);
    if (cmp.status === "FAIL") {
      console.error(`❌ Refusing to overwrite plan-manifest.json: the config lost planned content since the last snapshot.\n   ${cmp.violations.map((v) => v.message).join("\n   ")}\n   Re-plan, or pass --reason="<why these removals are deliberate>".`);
      process.exit(1);
    }
  }
  const man = snapshot(config, { reason, previous });
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2) + "\n");
  console.log(`📌 plan manifest: ${Object.keys(man.scenes).length} scenes → ${path.relative(root, manPath)} (${reason})`);
  process.exit(0);
}

const res = compare(config, previous);
console.log(`${res.status} ${slug}: composition integrity${res.comparable != null ? ` (${res.comparable} comparable scenes, props ${res.plannedProps}→${res.currentProps}, emptied ${res.emptied}, remapped ${res.remapped})` : ""}`);
for (const v of res.violations) console.log(`  ${v.code}: ${v.message}`);
if (res.status === "FAIL" && !args["report-only"]) process.exit(1);
