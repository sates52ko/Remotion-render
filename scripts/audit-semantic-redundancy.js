#!/usr/bin/env node
/**
 * audit-semantic-redundancy.js — Cognitive Redundancy & Visual Alignment Auditor
 *
 * Checks for the "Illustrated Radio" anti-pattern in Antidote configs:
 *   1. VO ∩ Text Overlap (Echo Rate): Is the onscreen text just repeating the spoken audio verbatim?
 *   2. Triple Redundancy: VO speaks concept X, Text writes X, and Prop literally depicts X.
 *   3. Visual Progression: Does the scene transform/progress, or is it a static decorator?
 *   4. Semantic Alignment: Has visualJob, visualArc, and attention been defined?
 *
 * Usage:
 *   node scripts/audit-semantic-redundancy.js --slug=<slug> [--top=10] [--json] [--soft]
 *   node scripts/audit-semantic-redundancy.js --all
 */

const fs = require("fs");
const path = require("path");
const { abs, rel } = require("./lib/paths");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  })
);

const SOFT = !!args.soft;
const AS_JSON = !!args.json;
const TOP_N = args.top ? parseInt(args.top, 10) : 5;
const ECHO_THRESHOLD = args["threshold-echo"] ? parseFloat(args["threshold-echo"]) : 0.4;
const MAX_ECHO_BUDGET = args["max-echo"] ? parseFloat(args["max-echo"]) : 30; // Max 30% echo allowed

// Common English stopwords to ignore when analyzing semantic overlap
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "of", "to", "in", "on", "at", "for",
  "with", "as", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "this", "that", "these", "those", "we", "you", "they", "i", "he", "she", "him",
  "her", "his", "hers", "their", "theirs", "our", "ours", "your", "yours", "my",
  "mine", "me", "us", "them", "just", "like", "really", "very", "much", "more",
  "most", "about", "into", "from", "than", "then", "now", "here", "there", "what",
  "how", "why", "who", "whom", "when", "which", "while", "where", "whose", "not",
  "no", "yes", "can", "could", "would", "should", "will", "shall", "may", "might",
  "must", "do", "does", "did", "done", "have", "has", "had", "get", "got", "gets",
  "going", "gonna", "kind", "sort", "thing", "things", "stuff", "okay", "ok",
  "yeah", "right", "mean", "know", "think", "say", "said", "says", "one", "two",
  "also", "even", "still", "because", "though", "although", "if", "whether"
]);

function cleanWords(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function resolveNarration(scene, captions) {
  if (scene._narration && scene._narration.trim().length > 0) {
    return scene._narration;
  }
  if (!captions || !captions.length) return "";
  const from = scene.fromFrame;
  const to = from + scene.durationFrames;
  const hitWords = [];
  for (const cap of captions) {
    if (cap.words && cap.words.length) {
      for (const w of cap.words) {
        if (w.s >= from && w.s <= to) hitWords.push(w.w);
      }
    } else if (cap.startFrame >= from && cap.startFrame <= to) {
      hitWords.push(cap.text);
    }
  }
  return hitWords.join(" ");
}

function analyzeScene(scene, captions, index) {
  const narration = resolveNarration(scene, captions);
  const voWords = cleanWords(narration);
  const voWordSet = new Set(voWords);

  const texts = (scene.texts || []).map((t) => t.text).filter(Boolean);
  const combinedText = texts.join(" ");
  const textWords = cleanWords(combinedText);

  // 1. VO-Text Overlap Analysis
  let echoOverlapRatio = 0;
  let isEcho = false;
  let isComplement = false;
  let isSilent = textWords.length === 0;

  if (!isSilent) {
    let matches = 0;
    for (const tw of textWords) {
      if (voWordSet.has(tw)) matches++;
    }
    echoOverlapRatio = textWords.length > 0 ? matches / textWords.length : 0;
    // If a significant portion of words are directly lifted from VO:
    if (echoOverlapRatio >= ECHO_THRESHOLD && textWords.length >= 1) {
      isEcho = true;
    } else {
      isComplement = true;
    }
  }

  // 2. Triple Redundancy (Illustrated Radio)
  // Check if VO, Text, and any Prop are simultaneously referring to the literal same word
  const props = (scene.props || []).map((p) => p.type).filter(Boolean);
  let isTripleRedundant = false;
  let redundantItem = null;

  if (isEcho && props.length > 0) {
    for (const prop of props) {
      const pNorm = prop.toLowerCase();
      // If the prop name or key substring appears in both VO and Text
      if (textWords.some((w) => pNorm.includes(w) || w.includes(pNorm)) &&
          voWords.some((w) => pNorm.includes(w) || w.includes(pNorm))) {
        isTripleRedundant = true;
        redundantItem = prop;
        break;
      }
    }
  }

  // 3. Visual Progression Check
  const hasVisualArc = scene.visualArc && scene.visualArc.transformation && scene.visualArc.transformation !== "none";
  const hasPropArc = (scene.props || []).some((p) => p.arc && p.arc !== "none");
  const hasDiagram = !!scene.diagram;
  const isChapterCard = !!scene.chapterCard;
  const isDynamic = hasVisualArc || hasPropArc || hasDiagram || isChapterCard;

  // 4. Semantic Alignment Spec Check
  const hasVisualJob = !!scene.visualJob;
  const hasAttention = Array.isArray(scene.attention) && scene.attention.length > 0;

  // Score penalty calculation for top offending beats
  let redundancyScore = 0;
  if (isTripleRedundant) redundancyScore += 10;
  if (isEcho) redundancyScore += 5 * echoOverlapRatio;
  if (!isDynamic) redundancyScore += 2;

  return {
    index,
    id: scene.id || `scene-${index}`,
    shot: scene.shot,
    narration: narration.slice(0, 120),
    combinedText,
    props: props.join(", ") || "(none)",
    echoOverlapRatio: Math.round(echoOverlapRatio * 100),
    isEcho,
    isComplement,
    isSilent,
    isTripleRedundant,
    redundantItem,
    isDynamic,
    visualJob: scene.visualJob || null,
    visualArc: scene.visualArc || null,
    attention: scene.attention || null,
    hasSemanticSpec: hasVisualJob || hasVisualArc || hasAttention,
    redundancyScore,
  };
}

function auditConfig(config, slug) {
  const scenes = config.scenes || [];
  const captions = config.captions || [];

  const analyzed = scenes.map((s, i) => analyzeScene(s, captions, i));

  const totalScenes = analyzed.length;
  const withText = analyzed.filter((s) => !s.isSilent).length;
  const echoCount = analyzed.filter((s) => s.isEcho).length;
  const complementCount = analyzed.filter((s) => s.isComplement).length;
  const tripleCount = analyzed.filter((s) => s.isTripleRedundant).length;
  const staticCount = analyzed.filter((s) => !s.isDynamic).length;
  const semanticSpecCount = analyzed.filter((s) => s.hasSemanticSpec).length;

  const echoPct = withText > 0 ? (echoCount / withText) * 100 : 0;
  const triplePct = totalScenes > 0 ? (tripleCount / totalScenes) * 100 : 0;
  const staticPct = totalScenes > 0 ? (staticCount / totalScenes) * 100 : 0;
  const semanticSpecPct = totalScenes > 0 ? (semanticSpecCount / totalScenes) * 100 : 0;

  const passed = echoPct <= MAX_ECHO_BUDGET && tripleCount === 0;

  // Find top worst offenders
  const worstOffenders = [...analyzed]
    .filter((s) => s.redundancyScore > 0)
    .sort((a, b) => b.redundancyScore - a.redundancyScore)
    .slice(0, TOP_N);

  return {
    slug,
    totalScenes,
    withText,
    echoCount,
    echoPct: Math.round(echoPct * 10) / 10,
    complementCount,
    tripleCount,
    triplePct: Math.round(triplePct * 10) / 10,
    staticCount,
    staticPct: Math.round(staticPct * 10) / 10,
    semanticSpecCount,
    semanticSpecPct: Math.round(semanticSpecPct * 10) / 10,
    passed,
    worstOffenders,
  };
}

function printReport(r) {
  const status = r.passed ? "✓ PASS" : "✗ FAIL (ILLUSTRATED RADIO)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  SEMANTIC REDUNDANCY REPORT: ${r.slug} (${status})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Total Scenes:            ${r.totalScenes}`);
  console.log(`  Scenes with Callouts:    ${r.withText}`);
  console.log(`  VO-Text Echo (Parrot):   ${r.echoCount} (${r.echoPct}%) [Budget: ≤${MAX_ECHO_BUDGET}%]`);
  console.log(`  Complementary Callouts:  ${r.complementCount}`);
  console.log(`  Triple Redundancy:       ${r.tripleCount} (${r.triplePct}%) [Budget: 0]`);
  console.log(`  Static Scenes (No Arc):  ${r.staticCount} (${r.staticPct}%)`);
  console.log(`  Semantic Spec Adoption:  ${r.semanticSpecCount} (${r.semanticSpecPct}%)`);

  if (r.worstOffenders.length > 0) {
    console.log(`\n── Top Offending Scenes (Parrot Text / Illustrated Radio) ──`);
    for (const w of r.worstOffenders) {
      console.log(`\n  [Scene ${w.index}: ${w.id} | Shot: ${w.shot}]`);
      console.log(`    VO:     "${w.narration}..."`);
      console.log(`    Text:   "${w.combinedText}" (${w.echoOverlapRatio}% VO overlap)`);
      console.log(`    Props:  ${w.props}`);
      const issues = [];
      if (w.isTripleRedundant) issues.push(`TRIPLE REDUNDANCY (Prop '${w.redundantItem}' echoes VO+Text)`);
      else if (w.isEcho) issues.push(`VO ECHO (Verbatim quote of spoken words)`);
      if (!w.isDynamic) issues.push(`STATIC (No progression or transformation arc)`);
      console.log(`    Alerts: ${issues.join(" | ")}`);
    }
  }
  console.log(`══════════════════════════════════════════════════════════════\n`);
}

function main() {
  if (args.slug) {
    const p = abs.antidoteConfig(args.slug);
    if (!fs.existsSync(p)) {
      console.error(`Error: Config not found at ${p}`);
      process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(p, "utf8"));
    const r = auditConfig(config, args.slug);
    if (AS_JSON) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      printReport(r);
    }
    if (!r.passed && !SOFT) process.exit(1);
    return;
  }

  if (args.all) {
    const booksDir = abs.booksDir();
    const dirs = fs.readdirSync(booksDir).filter((d) => {
      return fs.existsSync(path.join(booksDir, d, "config.antidote.json"));
    });

    const results = [];
    for (const slug of dirs) {
      const p = path.join(booksDir, slug, "config.antidote.json");
      const config = JSON.parse(fs.readFileSync(p, "utf8"));
      results.push(auditConfig(config, slug));
    }

    if (AS_JSON) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log("\n══ CATALOGUE SEMANTIC REDUNDANCY SUMMARY ══");
      console.log("Slug".padEnd(30) + "Echo %".padStart(10) + "Triple".padStart(8) + "Static %".padStart(10) + "Result".padStart(10));
      console.log("─".repeat(68));
      let failed = 0;
      for (const r of results) {
        if (!r.passed) failed++;
        const res = r.passed ? "PASS" : "FAIL";
        console.log(
          r.slug.padEnd(30) +
          `${r.echoPct}%`.padStart(10) +
          `${r.tripleCount}`.padStart(8) +
          `${r.staticPct}%`.padStart(10) +
          res.padStart(10)
        );
      }
      console.log("─".repeat(68));
      console.log(`Total: ${results.length} books, ${failed} failed.\n`);
    }
    if (results.some((r) => !r.passed) && !SOFT) process.exit(1);
    return;
  }

  console.error("Usage: node scripts/audit-semantic-redundancy.js --slug=<slug> [--top=10] [--json] [--soft]");
  console.error("       node scripts/audit-semantic-redundancy.js --all");
  process.exit(1);
}

main();
