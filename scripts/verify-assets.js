#!/usr/bin/env node
// Pre-render check: every asset referenced by a vox-config must exist in public/.
const fs = require("fs");
const path = require("path");
const { rel } = require("./lib/paths");
const cfgPath = process.argv[2] || rel.voxConfig("single-dad-dilemma");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const pub = path.join(__dirname, "..", "public");
const BG = "broll-ocean-tanker/mo-photoshop-background.png";

const refs = new Set();
refs.add(cfg.meta.audio);
refs.add(BG);
for (const b of cfg.beats) for (const im of b.images || []) { if (im.path) refs.add(im.path); if (im.cut) refs.add(im.cut); }

let missing = [];
for (const r of refs) {
  const p = path.join(pub, r);
  if (!fs.existsSync(p) || fs.statSync(p).size < 100) missing.push(r);
}
console.log(`refs: ${refs.size}  missing: ${missing.length}`);
if (missing.length) { missing.slice(0, 40).forEach((m) => console.log("  MISSING " + m)); process.exit(1); }
console.log("✓ all referenced assets present");
