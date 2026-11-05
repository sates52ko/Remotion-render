#!/usr/bin/env node
/**
 * p8-failure-clusters.mjs — P8 Aşama 2 sizing: WHY did extraction fail?
 *
 * For every RELATION_DETECTED_EXTRACTION_FAILED scene (relation detected, no
 * payload), classify the failure WITHOUT touching any config:
 *
 *   no_marker               — none of the compiler's markers occur in the
 *                             narration at all
 *   marker_present_5w       — a marker occurs but both near-poles exceed the
 *                             5-token clause budget (safe shortening may help)
 *   negation_flip_risk      — a pole candidate carries a negation the
 *                             screen-text discipline correctly refuses
 *   safety_rejected         — clause extracted but isLabel/checkPair refused
 *   pronoun_subject         — a pole candidate OPENS with a pronoun (the
 *                             operator's "safe deterministic pronoun cases")
 *
 * Pure read-only census (the gate's narration source, the adapter's own
 * semanticPayloadDetailed); no LLM/Vision, no config writes. Output sizes how
 * much of the usable-payload ≥80–90% target each repair class can recover.
 *
 * Usage: node scripts/p8-failure-clusters.mjs --books=<slug,slug,...>
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const adapter = require("./lib/director-adapter.js");
const screenText = require("./lib/screen-text.js");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const root = process.cwd();
const BOOKS = String(args.books || "").split(",").filter(Boolean);
if (!BOOKS.length) {
  console.error("Usage: node scripts/p8-failure-clusters.mjs --books=<slug,...>");
  process.exit(1);
}
const FPS = 30;
const RELATIONAL = new Set(["contrast", "allegory_equivalence", "cause_effect", "transformation", "character_psychology"]);
const ARCHETYPE_OF_RELATION = { comparison: ["contrast"], equivalence: ["allegory_equivalence"], internal_tension: ["character_psychology"], cause_effect: ["cause_effect"], transformation: ["transformation"] };

// The same narration source the gate audits.
function narrationFor(config, scene) {
  const captions = Array.isArray(config.captions) ? config.captions : [];
  if (captions.length && Number.isFinite(scene.fromFrame)) {
    const said = captions
      .filter((c) => c.endFrame > scene.fromFrame && c.startFrame < scene.fromFrame + (scene.durationFrames || 0))
      .map((c) => c.text).join(" ");
    if (said) return said;
  }
  return String(scene._narration || scene.subtitle || scene.text || "");
}

// The adapter's own markers (mirror of the module-level constants for the
// no_marker census; the detail probe itself uses the adapter's functions).
const MARKERS = [
  ["contrast", /\b(?:rather than|instead of|as opposed to|versus|vs\.?|whereas|however|yet|but)\b|,\s*not\b/i],
  ["cause", /\b(?:leads to|led to|results in|resulted in|causes|caused|produces|therefore|thus|hence|turns into|becomes|became)\b/i],
  ["because", /\bbecause\b/i],
  ["transform", /\bfrom\s+(.{2,40}?)\s+to\s+(.{2,40}?)(?:[.!?;]|$)/i],
];

const PRONOUNS = new Set(["it", "its", "it's", "they", "their", "them", "this", "that", "these", "those", "he", "she", "his", "her", "we", "our", "you", "your", "i", "one", "who", "which", "what"]);

const clusters = { no_marker: 0, marker_present_5w: 0, negation_flip_risk: 0, safety_rejected: 0, pronoun_subject: 0 };
const perBook = {};
const samples = {};
const archetypeOf = {};
const whyDetail = {};

function addSample(kind, rec) {
  samples[kind] = samples[kind] || [];
  if (samples[kind].length < 4) samples[kind].push(rec);
}

for (const slug of BOOKS) {
  const config = JSON.parse(fs.readFileSync(path.join(root, "books", slug, "config.antidote.json"), "utf8"));
  const meta = config.meta || {};
  perBook[slug] = { scenes: 0, failures: 0, clusters: { ...clusters } };
  const b = perBook[slug];

  for (const scene of config.scenes || []) {
    b.scenes++;
    const narration = narrationFor(config, scene);
    // Derive with the SAME atom the gate/benchmark derive.
    const { extractNarrativeAtomSync } = require("../src/semantic/narrativeAtom.ts");
    const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
    const atom = extractNarrativeAtomSync(narration, { bookTitle: meta.title || "", author: meta.author || "" });
    const intent = deriveVisualIntent(atom);
    if (!RELATIONAL.has(intent.archetype)) continue;

    const { payload, detail } = adapter.semanticPayloadDetailed(atom, intent.archetype);
    if (payload) continue; // extraction SUCCEEDED — not a failure scene
    if (detail.why === "no_relation") continue;
    b.failures++;
    archetypeOf[intent.archetype] = (archetypeOf[intent.archetype] || 0) + 1;
    whyDetail[detail.why] = (whyDetail[detail.why] || 0) + 1;

    const rec = { book: slug, scene: scene.id, archetype: intent.archetype, narration: narration.slice(0, 160) };
    // no_marker?
    const markerHits = MARKERS.filter(([, re]) => re.test(narration));
    if (!markerHits.length) {
      clusters.no_marker++;
      b.clusters.no_marker++;
      addSample("no_marker", rec);
      continue;
    }
    // a marker exists; classify the pole-level failure with the adapter's own
    // detail: label_unsafe (safety) vs clause_unextractable (length) per pole.
    const clauseTooLong = detail.why === "extraction_failed"; // conservative: length/pole issues
    const negRisk = /\b(?:not|no|never|don't|doesn't|didn't|won't|can't|cannot|isn't|aren't)\b/i.test(narration);
    const words = narration.split(/\s+/);
    const pronounOpen = words.slice(0, 6).some((w) => PRONOUNS.has(w.toLowerCase().replace(/[^a-z']/g, "")));
    if (negRisk && detail.why === "label_unsafe") {
      clusters.negation_flip_risk++;
      b.clusters.negation_flip_risk++;
      addSample("negation_flip_risk", rec);
    } else if (detail.why === "label_unsafe") {
      clusters.safety_rejected++;
      b.clusters.safety_rejected++;
      addSample("safety_rejected", rec);
    } else if (pronounOpen) {
      clusters.pronoun_subject++;
      b.clusters.pronoun_subject++;
      addSample("pronoun_subject", rec);
    } else {
      clusters.marker_present_5w++;
      b.clusters.marker_present_5w++;
      addSample("marker_present_5w", rec);
    }
  }
}

const out = { generatedAt: new Date().toISOString(), books: BOOKS, clusters, perBook, archetypeOf, whyDetail, samples };
fs.mkdirSync(path.join(root, "audit", "visionless-10x"), { recursive: true });
fs.writeFileSync(path.join(root, "audit", "visionless-10x", "p8-failure-clusters.json"), JSON.stringify(out, null, 2));
console.log("failure clusters:", JSON.stringify(clusters));
console.log("by adapter why:", JSON.stringify(whyDetail));
console.log("by archetype:", JSON.stringify(archetypeOf));
console.log("→ audit/visionless-10x/p8-failure-clusters.json");
