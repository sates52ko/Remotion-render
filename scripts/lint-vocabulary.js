#!/usr/bin/env node
/**
 * lint-vocabulary.js — the engine's visual vocabulary lives in four
 * hand-maintained lists that must agree, and nothing checked that they did.
 *
 *   1. src/engines/antidote/schema.ts      propType enum   — what the config may say
 *   2. src/engines/antidote/motifs.tsx     REGISTRY        — what can be DRAWN
 *   3. scripts/lib/antidote-director.js    CONCEPT_LEXICON — what can be PICKED
 *   4. ...plus CONCEPT_SET / CONCEPT_HOLD / DIORAMA_ICONS / OPPOSITE
 *
 * Adding an icon to (2) alone makes it renderable but unreachable. Adding it to
 * (3) alone makes it pickable and it renders as nothing. Every failure in this
 * class is SILENT at run time: `Motif` returns null on an unknown type,
 * `Backdrop` returns null, `shotPreset` falls back to `medium`, `HAND_PROPS`
 * returns null, and Remotion does not zod-parse defaultProps — so a typo is a
 * confident blank frame in a 40-minute unattended render, indistinguishable
 * from a deliberate choice.
 *
 * Real examples this would have caught, all of which shipped:
 *   • CONCEPT_HOLD.food = "coffee" — not in the handProp enum, so the character
 *     held an invisible object
 *   • SELF_ANIMATING listed "lineChart" — the real propType is "lineGrowth", so
 *     the guard against a redundant arc never fired for it
 *   • `book` and `briefcase` as CONCEPT_SET keys with no concept behind them
 *
 * Usage:
 *   node scripts/lint-vocabulary.js            # report; exit 1 on a real break
 *   node scripts/lint-vocabulary.js --soft     # report only
 *   node scripts/lint-vocabulary.js --coverage # + how much of it a book can reach
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const dir = require("./lib/antidote-director.js");
const { CONCEPT_LEXICON, CONCEPT_SET, CONCEPT_HOLD } = dir;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** the keys of an object literal that starts at `anchor` */
function objectKeys(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return [];
  const open = src.indexOf("{", i);
  let depth = 0, end = open;
  for (let k = open; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (!depth) { end = k; break; } }
  }
  const body = src.slice(open + 1, end);
  return [...body.matchAll(/(?:^|[,{\s])([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]);
}

/** the string members of a z.enum([...]) */
function enumValues(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return [];
  const open = src.indexOf("[", i);
  const close = src.indexOf("])", open);
  return [...src.slice(open, close).matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
}

const schemaSrc = read("src/engines/antidote/schema.ts");
const motifSrc = read("src/engines/antidote/motifs.tsx");
const backdropSrc = read("src/engines/antidote/components/Backdrop.tsx");

const propTypes = new Set(enumValues(schemaSrc, "export const propType"));
const handProps = new Set(enumValues(schemaSrc, "export const handProp"));
const registry = new Set(objectKeys(motifSrc, "const REGISTRY"));
const sets = new Set(objectKeys(backdropSrc, "export const SETS"));
const concepts = CONCEPT_LEXICON.map(([c]) => c);
const conceptSet = new Set(concepts);

const errs = [], warns = [], notes = [];

// ── the breaks ──────────────────────────────────────────────────────────────
for (const c of concepts) {
  if (registry.has(c)) continue;
  // a concept need not be a motif — it may only pick a location — but if it is
  // neither drawable nor a location it can never put anything on screen
  if (!CONCEPT_SET[c]) warns.push(`concept "${c}" has no motif and no location — it can never show anything`);
}
for (const t of registry) {
  if (!propTypes.has(t)) errs.push(`motif "${t}" is in the REGISTRY but not in the propType enum — a config naming it fails validation`);
}
for (const t of propTypes) {
  if (!registry.has(t)) errs.push(`propType "${t}" has no REGISTRY entry — it renders as nothing, silently`);
}
for (const [concept, glyph] of Object.entries(CONCEPT_HOLD)) {
  if (!handProps.has(glyph)) errs.push(`CONCEPT_HOLD.${concept} = "${glyph}" is not in the handProp enum — the character holds an invisible object`);
  if (!conceptSet.has(concept)) warns.push(`CONCEPT_HOLD.${concept} is not a concept — nothing can ever select it`);
}
for (const [concept, set] of Object.entries(CONCEPT_SET)) {
  if (!sets.has(set)) errs.push(`CONCEPT_SET.${concept} = "${set}" is not a Backdrop set — the scene renders with no backdrop`);
  if (!conceptSet.has(concept)) warns.push(`CONCEPT_SET.${concept} is not a concept — dead key`);
}

// ── reachability: ordering inside a first-match-wins list ───────────────────
// The lexicon is ordered specific -> general and the first hit wins, but nothing
// enforced that, so a broad pattern could shadow a precise one for the life of
// the catalogue (`iceberg` shadowed `icebergDepth`: 0 wins in 3309 beats).
const PROBE = [
  "the iceberg below the surface of what people see", "tip of the iceberg hidden depths",
  "he launched the rocket", "she founded the company", "the funnel of distractions",
  "a courtroom and a judge", "the car crash on the highway", "a grave in the forest",
];
for (const probe of PROBE) {
  const all = CONCEPT_LEXICON.filter(([, re]) => re.test(probe)).map(([c]) => c);
  if (all.length > 1) notes.push(`"${probe}" → ${all[0]} (shadows: ${all.slice(1).join(", ")})`);
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`\n══ VOCABULARY LINT`);
console.log(`   propTypes ${propTypes.size}   drawable motifs ${registry.size}   concepts ${concepts.length}   ` +
  `handProps ${handProps.size}   backdrop sets ${sets.size}`);
const unreachable = [...registry].filter((t) => !conceptSet.has(t));
console.log(`   drawable but not selectable by meaning: ${unreachable.length}` +
  (unreachable.length ? ` — ${unreachable.slice(0, 14).join(" ")}${unreachable.length > 14 ? " …" : ""}` : ""));
const noHold = concepts.filter((c) => !CONCEPT_HOLD[c]).length;
const noPlace = concepts.filter((c) => !CONCEPT_SET[c]).length;
console.log(`   concepts with no hand prop: ${noHold}/${concepts.length}   with no location: ${noPlace}/${concepts.length}`);

if (notes.length) {
  console.log(`\n   first-match shadowing (informational — ordering decides meaning here):`);
  notes.forEach((n) => console.log(`     ${n}`));
}
if (warns.length) {
  console.log(`\n   ⚠ ${warns.length} warning(s):`);
  warns.forEach((w) => console.log(`     ${w}`));
}
if (errs.length) {
  console.log(`\n   ✗ ${errs.length} BREAK(S) — each of these renders as a silent blank:`);
  errs.forEach((e) => console.log(`     ${e}`));
} else {
  console.log(`\n   ✓ no breaks: every drawable type is declared, every mapping points at something real`);
}

if (args.coverage) {
  console.log(`\n══ PER-BOOK REACH (distinct grounded icons a book actually used)`);
  const rows = [];
  for (const slug of fs.readdirSync(path.join(ROOT, "books")).sort()) {
    const p = path.join(ROOT, "books", slug, "config.antidote.json");
    if (!fs.existsSync(p)) continue;
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    const used = new Set();
    for (const sc of cfg.scenes || []) for (const pr of sc.props || []) if (conceptSet.has(pr.type)) used.add(pr.type);
    rows.push({ slug, used: used.size, scenes: (cfg.scenes || []).length });
  }
  rows.sort((a, b) => a.used - b.used);
  for (const r of rows) {
    console.log(`   ${r.slug.padEnd(38)} ${String(r.used).padStart(3)} / ${concepts.length} grounded icons over ${r.scenes} scenes`);
  }
}

if (errs.length && !args.soft) process.exit(1);
