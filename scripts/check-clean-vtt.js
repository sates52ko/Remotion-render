#!/usr/bin/env node
/**
 * check-clean-vtt.js — is public/captions/<slug>.clean.vtt the file YouTube accepts ("Upload file → With timing")?
 * No inline <c>/word-timing tags, no rolling or duplicate cues, sequential non-overlapping timing.
 *
 *   node scripts/check-clean-vtt.js --slug=<slug>      # exit 1 when it is not an upload file
 *   node scripts/check-clean-vtt.js --file=<path.vtt>
 *
 * Fix: node scripts/clean-vtt.js public/captions/<slug>.vtt public/captions/<slug>.clean.vtt
 *      (raw VTT gone → node scripts/rebuild-clean-vtt.js <slug>, Antidote config captions). Rules: scripts/lib/vtt-validate.js.
 */
const path = require("path");
const { validateUploadVttFile } = require("./lib/vtt-validate");

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const slug = arg("slug");
const file = arg("file") || (slug && path.join(__dirname, "..", "public", "captions", `${slug}.clean.vtt`));
if (!file) { console.error("usage: node scripts/check-clean-vtt.js --slug=<slug> | --file=<path.vtt>"); process.exit(2); }
const r = validateUploadVttFile(file);
console.log(`${r.ok ? "✅" : "❌"} ${path.basename(file)} — ${r.cues} cues${r.ok ? ", upload-valid" : ""}`);
for (const e of r.errors) console.log(`   ✗ ${e}`);
for (const w of r.warnings) console.log(`   · ${w}`);
if (!r.ok && slug) console.log(`\n   fix: node scripts/clean-vtt.js public/captions/${slug}.vtt public/captions/${slug}.clean.vtt  (no raw VTT: node scripts/rebuild-clean-vtt.js ${slug})`);
process.exit(r.ok ? 0 : 1);
