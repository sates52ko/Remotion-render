"use strict";
/**
 * Ground-truth capability builder — the ONLY source of the compiler's
 * capability maps. Run again whenever motifs.tsx changes:
 *   node scripts/lib/motif-capability-scan.js
 * Writes data/visual-capability.json { generatedFrom, stateful, animated, unanimated }
 * and prints a drift report.
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "..", "src", "engines", "antidote", "motifs.tsx"), "utf8");
const schemaSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "engines", "antidote", "schema.ts"), "utf8");

// ── the schema's propType enum: the ONE authority for "does this motif exist" ──
const enumMatch = schemaSrc.match(/export const propType = z\.enum\(\[([\s\S]*?)\]\);/);
if (!enumMatch) throw new Error("propType enum not found in schema.ts");
const SCHEMA_TYPES = new Set([...enumMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
if (!SCHEMA_TYPES.size) throw new Error("empty propType enum");

// ── the motifs.tsx REGISTRY: key → component name ──
const start = src.indexOf("const REGISTRY");
const registryBlock = src.slice(start, src.indexOf("};", start));
const reg = [...registryBlock.matchAll(/([a-zA-Z]+): (\w+)/g)].map((m) => [m[1], m[2]]);
const registry = Object.fromEntries(reg);

// ── per-component capability from the component body itself ──
const comps = src.split(/\nconst (\w+): React\.FC<MotifProps>/);
const bodies = {};
for (let i = 1; i < comps.length; i += 2) bodies[comps[i]] = comps[i + 1] || "";
const bodyOf = (component) => bodies[component] || "";

const stateful = [];   // C3: motifs whose body reads spec.stateIndex
const animated = [];   // C2: motifs with CONTINUOUS per-frame motion (the frame
                       // is read and turned into drawing math beyond entrance)
const entranceOnly = []; // C2-limited: one spring entrance, then a still drawing
const unanimated = []; // fully static drawings
const stripSpring = (body) => body
  .replace(/const \w+ = spring\([\s\S]{0,300}?\);/g, "")
  .replace(/spring\(\{[^{}]*\}\)/g, "")
  .replace(/opacity=\{\w+\}/g, "");
for (const type of Object.keys(registry)) {
  if (!SCHEMA_TYPES.has(type)) continue;
  const body = bodyOf(registry[type]);
  if (body.includes("spec.stateIndex")) stateful.push(type);
  if (body.includes("useCurrentFrame()")) {
    const rest = stripSpring(body);
    if (/sin\(|interpolate\(|Math\.PI|frame \*/.test(rest)) animated.push(type);
    else entranceOnly.push(type);
  }
  else unanimated.push(type);
}

const data = { generatedFrom: "src/engines/antidote/motifs.tsx", stateful: stateful.sort(), animated: animated.sort(), entranceOnly: entranceOnly.sort(), unanimated: unanimated.sort() };
const out = path.join(__dirname, "..", "..", "data", "visual-capability.json");
const PREV = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
// MERGE with the measured confidence map if it exists (operator's judged-frames
// data from P1.2 — { capabilities: { lever: { lever, confidence, frames, wrong, neutral } } }).
// The code-derived sets and the measured confidences are DIFFERENT layers of the
// same file: rewrite only the code-derived keys, never clobber measurements.
if (PREV && PREV.capabilities) data.capabilities = PREV.capabilities;
if (PREV && PREV.date && PREV.framesJudged) { data.date = PREV.date; data.unit = PREV.unit; data.booksJudged = PREV.booksJudged; data.framesJudged = PREV.framesJudged; data.prior = PREV.prior; data.formula = PREV.formula; data.bands = PREV.bands; data.source = PREV.source; }
fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
console.log(JSON.stringify(data, null, 2));
console.log("registered-but-schema-missing:", Object.keys(registry).filter((t) => !SCHEMA_TYPES.has(t)));
console.log("schema-but-not-rendered:", [...SCHEMA_TYPES].filter((t) => !registry[t]));
