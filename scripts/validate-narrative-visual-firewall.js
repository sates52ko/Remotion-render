#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { validateConfig, loadBook } = require("./lib/narrative-visual-firewall");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; }));
const slug = args.slug;
if (!slug) { console.error("Usage: node scripts/validate-narrative-visual-firewall.js --slug=<slug> [--report-only]"); process.exit(1); }
const root = path.resolve(__dirname, "..");
let report;
try { report = validateConfig({ ...loadBook(root, slug), slug }); }
catch (error) { report = { version: "P1.1", slug, status: "FAIL", counts: { scenes: 0, violations: 1 }, violations: [{ reasonCode: "STORY_BIBLE_INCOMPLETE", message: error.message }] }; }
const { withOutcomes } = require('./lib/firewall-outcomes');
const preview = args['preview-only'] === true || args['preview-only'] === 'true';
report = withOutcomes(report, preview);
const out = path.join(root, 'books', slug, preview ? 'narrative-visual-firewall.preview.report.json' : 'narrative-visual-firewall.report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(report.status + ' ' + slug + ': ' + report.counts.blocks + ' BLOCK, ' + report.counts.reviews + ' REVIEW; production=' + report.productionStatus);
for (const v of report.violations.slice(0, 20)) console.log('  [' + v.outcome + '] ' + v.reasonCode + ': ' + v.message);
if (preview) console.log('PREVIEW-ONLY — not approved for production delivery. Full findings: ' + out);
if (!args['report-only'] && (preview ? report.counts.blocks > 0 : report.status !== 'PASS')) process.exit(1);
