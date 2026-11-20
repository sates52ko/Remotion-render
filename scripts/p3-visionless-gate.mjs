/**
 * p3-visionless-gate.mjs — Vision-free 10x, P0+P1+P3 (2026-10-03 operator plan).
 *
 * Measures the chain  SemanticContract → Director decision → selected visual
 * on REAL production scenes with ZERO LLM/Vision calls:
 *
 *   P1  wiring: does the production scene actually carry narrativeAtom →
 *       visualIntent → visualContract, and does the derived semantic intent's
 *       required grammar appear in the final staging? (intent→visual coverage)
 *   P1  adapter shadow: would `lib/director-adapter.js` have to apply a
 *       semantic floor (director fallback) for the intent to be staged?
 *   P0  payload sanity: EMPTY / GENERIC / TRUNCATED / DUPLICATE payloads.
 *   P3  KPIs: contract satisfaction, generic fallback, IDLE_ACTOR_WALLPAPER,
 *       director fallback, firewall reject rate, intent→visual coverage.
 *   P6  seed: violation-code distribution (gate + firewall).
 *
 * Read-only over configs. Sampling is deterministic (even stride across the
 * whole book, includes REJECTs — the reject rate is itself a KPI). Output:
 *   audit/visionless-10x/p3-gate.json + p3-report.md
 *
 * Usage: node scripts/p3-visionless-gate.mjs [--books=a,b,c] [--per-book=25]
 */
import fs from "fs";
import path from "path";
import { createVisualContractFromAtom, evaluateSceneVisualContract, FORBIDDEN_GENERIC_TEXTS } from "../src/semantic/visualContract.ts";
import { deriveVisualIntent } from "../src/semantic/visualIntent.ts";
import { buildVisualEvidence, evaluateSemanticStaging } from "../src/semantic/stagingEvidence.ts";
import adapter from "./lib/director-adapter.js";
import { validateScene, loadBook } from "./lib/narrative-visual-firewall.js";
import { meaningfulVisualIntent } from "./lib/visual-intent-persist.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const root = process.cwd();
const PER_BOOK = Number(args["per-book"] || 25);
const OUT_DIR = path.join(root, "audit", "visionless-10x");

// ── grammar map mirrors the adapter's own composition rules (audit copy) ────
const EXPECTED_GRAMMAR = {
  contrast: "comparison",
  allegory_equivalence: "two_domain_comparison",
  cause_effect: "cause_effect_flow",
  character_psychology: "internal_tension",
};
const COMPARATIVE_SHOTS = new Set(["split", "twoShot", "beforeAfter"]);
const DIAGRAM_TYPES = new Set(["sorter", "matchWave", "flow", "spectrum", "matrix", "tree", "funnel"]);
const IDLEISH_ACTIONS = new Set(["idle", "none", ""]);
const GENERIC_VIOLATIONS = /GENERIC_TEMPLATE_TEXT|FORBIDDEN_GENERIC_TEXT/;
const DANGLING_TOKENS = new Set(["OF", "THE", "AND", "TO", "A", "IN", "FOR", "WITH", "BUT", "OR", "VS", "IS", "ARE", "THAT", "YOUR", "YOU"]);

const isValidDiagram = (diagram) =>
  !!diagram && DIAGRAM_TYPES.has(diagram.type) && Array.isArray(diagram.labels) &&
  (diagram.type === "matchWave" ? diagram.labels.length >= 1 : diagram.labels.length >= 2);

function normalizeLabels(scene) {
  const labels = [];
  for (const t of Array.isArray(scene.texts) ? scene.texts : []) {
    const text = String(t?.text ?? "").trim();
    if (text) labels.push(text);
  }
  if (isValidDiagram(scene.diagram)) labels.push(...scene.diagram.labels.map((l) => String(l ?? "").trim()).filter(Boolean));
  return labels;
}

function labelSanity(labels) {
  const flags = [];
  for (const label of labels) {
    if (FORBIDDEN_GENERIC_TEXTS.has(label.toUpperCase())) flags.push("GENERIC_PAYLOAD");
    const tokens = label.split(/\s+/).filter(Boolean);
    const last = (tokens[tokens.length - 1] || "").replace(/[^A-Za-z0-9]/g, "");
    if (tokens.length && (last.length <= 1 || DANGLING_TOKENS.has(last.toUpperCase()))) flags.push("TRUNCATED_PAYLOAD");
  }
  return [...new Set(flags)];
}

function payloadKey(labels) {
  return labels.map((l) => l.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim()).filter(Boolean).sort().join("|");
}

function narrationFor(config, scene) {
  const captions = Array.isArray(config.captions) ? config.captions : [];
  if (captions.length && Number.isFinite(scene.fromFrame)) {
    const said = captions
      .filter((c) => c.endFrame > scene.fromFrame && c.startFrame < scene.fromFrame + (scene.durationFrames || 0))
      .map((c) => c.text).join(" ").trim();
    if (said) return { text: said, source: "caption-window" };
  }
  return { text: String(scene._narration || scene.subtitle || scene.text || ""), source: "_narration" };
}

/** The production staging already satisfies the derived intent's grammar? */
function coverageFor(scene, archetype) {
  const shot = scene.shot || "";
  const grammar = scene.semanticGrammar && scene.semanticGrammar.kind;
  const castCount = Number(scene.characters && scene.characters.length) || 0;
  const expected = EXPECTED_GRAMMAR[archetype] || null;
  const actions = (scene.characters || []).map((c) => String(c.action || ""));

  if (expected) {
    if (grammar === expected) return { covered: true, how: "semanticGrammar" };
    if (isValidDiagram(scene.diagram)) {
      if (expected === "cause_effect_flow" && scene.diagram.type === "flow") return { covered: true, how: "diagram" };
      if (expected === "two_domain_comparison" && ["sorter", "spectrum", "matchWave"].includes(scene.diagram.type)) return { covered: true, how: "diagram" };
      if (expected === "internal_tension" && scene.diagram.type === "spectrum") return { covered: true, how: "diagram" };
      if (expected === "comparison") return { covered: true, how: "diagram" };
    }
    if (expected === "comparison" && COMPARATIVE_SHOTS.has(shot) && castCount >= 2) return { covered: true, how: "comparative-shot" };
    return { covered: false, how: null };
  }
  // archetypes without a required grammar: any non-wallpaper staging counts
  const actionful = actions.some((a) => !IDLEISH_ACTIONS.has(a) && a !== "talk");
  if (actionful) return { covered: true, how: "non-idle-action" };
  if (isValidDiagram(scene.diagram) || (Array.isArray(scene.texts) && scene.texts.length)) return { covered: true, how: "payload" };
  return { covered: false, how: null };
}

// ── book selection ───────────────────────────────────────────────────────────
const candidates = [];
for (const slug of fs.readdirSync(path.join(root, "books"))) {
  const configPath = path.join(root, "books", slug, "config.antidote.json");
  if (!fs.existsSync(configPath)) continue;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const scenes = config.scenes || [];
    if (scenes.length < 80) continue;
    if (!scenes.some((s) => s.visualIntent)) continue;
    candidates.push({ slug, mtime: fs.statSync(configPath).mtimeMs, sceneCount: scenes.length });
  } catch { /* unreadable config — skip */ }
}
candidates.sort((a, b) => b.mtime - a.mtime);
let books;
if (args.books) books = args.books.split(",").map((s) => s.trim());
else books = candidates.slice(0, 4).map((c) => c.slug);

// ── per-book measurement ─────────────────────────────────────────────────────
const records = [];
for (const slug of books) {
  const { config, bible } = loadBook(root, slug);
  const scenes = config.scenes || [];
  // deterministic even stride across the WHOLE book (rejects included)
  const stride = Math.max(1, Math.floor(scenes.length / PER_BOOK));
  const indexes = [];
  for (let i = 0; i < PER_BOOK && i * stride < scenes.length; i++) indexes.push(i * stride);

  const sampled = indexes.map((sceneIndex) => {
    const scene = scenes[sceneIndex];
    const narration = narrationFor(config, scene);
    const pAtom = scene.narrativeAtom || null;
    // semantic atom mirrors p22-select-blind-sample, upgraded to the
    // PRODUCTION atom's subject/relation when the chain actually stored them
    const atom = {
      text: narration.text,
      subject: (pAtom && pAtom.narrativeSubject) || scene._subject || null,
      action: null,
      object: null,
      relationship: null,
      concepts: [],
      abstraction: "conceptual",
      visualNeed: narration.text,
    };
    const intent = deriveVisualIntent(atom);
    const contract = createVisualContractFromAtom(atom, scene.id || `scene-${sceneIndex}`, undefined, intent);
    // P7: the contract now carries canonical visualEvidence; the shared judge
    // decides HC3/HC4 for both the gate and the production firewall.
    contract.visualEvidence = buildVisualEvidence(atom, intent);
    const gate = evaluateSceneVisualContract(scene, contract, config);

    // P1 wiring: did production store the three semantic stages at all?
    // P7 commit 2: `intent` is a MEANINGFUL-content check (names an archetype) —
    // a provenance shell or `{}` is not an intent; `intentPresent` keeps the
    // legacy truthy count for comparison.
    const wiring = {
      atom: !!(pAtom && pAtom.narrativeSubject),
      intent: meaningfulVisualIntent(scene.visualIntent),
      intentPresent: !!scene.visualIntent,
      contract: !!scene.visualContract,
    };

    // director-adapter shadow on the REAL production direction (no mutation)
    const direction = {
      shot: scene.shot,
      cast: { count: (scene.characters || []).length, roles: (scene.characters || []).map((c) => c.role) },
      props: scene.props || [],
      ...(scene.diagram ? { diagram: scene.diagram } : {}),
      ...(scene.semanticGrammar ? { semanticGrammar: scene.semanticGrammar } : {}),
    };
    let shadow = { applied: false, reason: "not-attempted" };
    try {
      const result = adapter.buildDirectorOverrides({ intent, atom, direction });
      shadow = {
        applied: !!result.override,
        reason: result.reason || null,
        // P7 commit 4: machine-readable null-floor telemetry + canonical relation/medium.
        nullFloorReason: result.nullFloorReason || null,
        relation: result.relation || null,
        medium: result.medium || null,
        payloadKind: (result.semanticPayload && result.semanticPayload.kind) || null,
        overrideShot: (result.override && result.override.shot) || null,
        overrideGrammar: (result.override && result.override.semanticGrammar && result.override.semanticGrammar.kind) || null,
      };
    } catch (error) {
      shadow = { applied: false, reason: `adapter-error: ${error.message}` };
    }

    const labels = normalizeLabels(scene);
    const coverage = coverageFor(scene, intent.archetype);
    const actions = (scene.characters || []).map((c) => String(c.action || ""));
    const idleWallpaper = (scene.characters || []).length > 0 && actions.every((a) => IDLEISH_ACTIONS.has(a) || a === "talk") && !isValidDiagram(scene.diagram);
    const generic = gate.violations.some((v) => GENERIC_VIOLATIONS.test(v)) ||
      labels.some((l) => FORBIDDEN_GENERIC_TEXTS.has(String(l).toUpperCase()));

    // firewall on the same view validateConfig would build
    const view = narration.source === "caption-window" && !scene.narration ? { ...scene, narration: narration.text } : scene;
    // The shared judge over the SAME inputs the firewall will see (same narration,
    // same scene) — the gate's semantic decision is computed exactly once.
    const stagingEval = evaluateSemanticStaging({ scene, intent });
    let firewall = { hard: 0, codes: [], semanticStagingHard: [] };
    try {
      const violations = validateScene(view, sceneIndex, bible || {}, slug) || [];
      const hard = violations.filter((v) => v.severity !== "diagnostic");
      firewall = {
        hard: hard.length,
        codes: [...new Set(hard.map((v) => v.reasonCode))],
        // P7 parity set: the SEMANTIC codes regardless of severity (report-first
        // diagnostics included) — identical decision sets is the P7 acceptance.
        semanticStagingHard: [...new Set((violations || [])
          .filter((v) => v.reasonCode === "SEMANTIC_STAGING_VIOLATION")
          .map((v) => String(v.violation || "").split(":")[0]))],
      };
    } catch (error) {
      firewall = { hard: 0, codes: [`firewall-error: ${error.message}`], semanticStagingHard: [] };
    }

    return {
      book: slug,
      sceneId: scene.id,
      sceneIndex,
      fromFrame: scene.fromFrame,
      durationFrames: scene.durationFrames,
      narrationSource: narration.source,
      narration: narration.text.slice(0, 220),
      wiring,
      intent: { archetype: intent.archetype, domain: intent.domain },
      selectedVisual: {
        shot: scene.shot || null,
        grammar: (scene.semanticGrammar && scene.semanticGrammar.kind) || null,
        diagramType: (scene.diagram && scene.diagram.type) || null,
        labels,
        castCount: (scene.characters || []).length,
        actions,
      },
      adapter: shadow,
      fallback: idleWallpaper,
      generic,
      contractSatisfied: gate.verdict === "PASS",
      gate: {
        verdict: gate.verdict,
        score: gate.finalScore,
        violations: gate.violations,
        hardViolations: gate.hardViolations,
      },
      // P7 telemetry: the shared judge's own verdict + firewall comparison.
      semanticStaging: stagingEval,
      firewallAgreement: {
        // P7 acceptance (spec item 3): gate ↔ firewall HARD decision sets must
        // be IDENTICAL. The gate's other hard codes (color/domain/etc.) have no
        // firewall counterpart and are excluded from the comparison set.
        gateSemanticCodes: [...new Set(stagingEval.hardViolations.map((v) => v.split(":")[0]))],
        firewallSemanticHard: firewall.semanticStagingHard,
        match: [...new Set(stagingEval.hardViolations.map((v) => v.split(":")[0]))].join(",") === firewall.semanticStagingHard.join(","),
      },
      coverage,
      payload: { labels, flags: labelSanity(labels), key: payloadKey(labels) },
      firewall,
    };
  });
  records.push(...sampled);
}

// ── P0 duplicate payloads (book-wide, on the sampled set) ────────────────────
const keyCounts = {};
for (const r of records) if (r.payload.key) keyCounts[`${r.book}::${r.payload.key}`] = (keyCounts[`${r.book}::${r.payload.key}`] || 0) + 1;
for (const r of records) if (r.payload.key && keyCounts[`${r.book}::${r.payload.key}`] >= 3) r.payload.flags.push("DUPLICATE_PAYLOAD");
for (const r of records) r.payload.flags = [...new Set(r.payload.flags)];

// ── KPIs ─────────────────────────────────────────────────────────────────────
const total = records.length;
const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const count = (pred) => records.filter(pred).length;
const kpis = {
  scenesMeasured: total,
  books: books.length,
  perBookTarget: PER_BOOK,
  semanticContractSatisfaction: pct(count((r) => r.contractSatisfied)),
  genericFallbackRate: pct(count((r) => r.generic)),
  idleActorWallpaperRate: pct(count((r) => r.fallback || r.gate.violations.some((v) => v.includes("IDLE_ACTOR_WALLPAPER")))),
  directorFallbackRate: pct(count((r) => r.adapter.applied)),
  firewallRejectRate: pct(count((r) => r.firewall.hard > 0)),
  intentToVisualCoverage: pct(count((r) => r.coverage.covered)),
  wiring: {
    narrativeAtom: pct(count((r) => r.wiring.atom)),
    // P7 commit 2: meaningful content (archetype named), not truthiness.
    visualIntent: pct(count((r) => r.wiring.intent)),
    visualIntentPresent: pct(count((r) => r.wiring.intentPresent)),
    visualContract: pct(count((r) => r.wiring.contract)),
    allThree: pct(count((r) => r.wiring.atom && r.wiring.intent && r.wiring.contract)),
  },
  p7IntentPersistence: {
    meaningful: pct(count((r) => r.wiring.intent)),
    shellOnly: pct(count((r) => r.wiring.intentPresent && !r.wiring.intent)),
    missing: pct(count((r) => !r.wiring.intentPresent)),
  },
  payloadSanity: {
    emptyPayload: pct(count((r) => r.payload.labels.length === 0 && !r.selectedVisual.diagramType)),
    generic: pct(count((r) => r.payload.flags.includes("GENERIC_PAYLOAD"))),
    truncated: pct(count((r) => r.payload.flags.includes("TRUNCATED_PAYLOAD"))),
    duplicate: pct(count((r) => r.payload.flags.includes("DUPLICATE_PAYLOAD"))),
  },
  // P7 acceptance KPI (spec item 3): one judge, two consumers, zero drift.
  p7SemanticJudge: {
    scenesWithRelationalObligation: count((r) => r.semanticStaging.required),
    gateFirewallHardAgreement: pct(count((r) => r.firewallAgreement.match)),
    disagreements: records.filter((r) => !r.firewallAgreement.match).slice(0, 10).map((r) => ({
      book: r.book, sceneId: r.sceneId,
      gate: r.firewallAgreement.gateSemanticCodes,
      firewall: r.firewallAgreement.firewallSemanticHard,
    })),
  },
};

// P6 seed: violation-code distribution
const codeCounts = {};
for (const r of records) {
  for (const v of r.gate.violations) codeCounts[`gate:${v.split(":")[0]}`] = (codeCounts[`gate:${v.split(":")[0]}`] || 0) + 1;
  for (const c of r.firewall.codes) codeCounts[`firewall:${c}`] = (codeCounts[`firewall:${c}`] || 0) + 1;
}
const violationCodes = Object.fromEntries(Object.entries(codeCounts).sort((a, b) => b[1] - a[1]));

// suspect ranking (P5 input): weakest contract first, then flags
const flagWeight = (r) =>
  (r.fallback ? 2 : 0) + (r.generic ? 2 : 0) + r.payload.flags.length + (r.coverage.covered ? 0 : 2) + r.firewall.hard;
const suspects = [...records]
  .sort((a, b) => (flagWeight(b) - flagWeight(a)) || (a.gate.score - b.gate.score))
  .slice(0, 20)
  .map((r) => ({
    book: r.book, sceneId: r.sceneId, sceneIndex: r.sceneIndex,
    fromFrame: r.fromFrame, captureFrame: r.fromFrame + Math.max(1, Math.floor((r.durationFrames || 2) / 2)),
    score: r.gate.score, flags: [
      ...(r.fallback ? ["IDLE_WALLPAPER"] : []),
      ...(r.generic ? ["GENERIC"] : []),
      ...r.payload.flags,
      ...(r.coverage.covered ? [] : ["INTENT_NOT_STAGED"]),
      ...r.firewall.codes,
    ],
    archetype: r.intent.archetype,
    shot: r.selectedVisual.shot,
    narration: r.narration.slice(0, 140),
  }));

// per-book breakdown
const perBook = books.map((slug) => {
  const rows = records.filter((r) => r.book === slug);
  const n = rows.length || 1;
  return {
    book: slug,
    sampled: rows.length,
    contractSatisfaction: Math.round((rows.filter((r) => r.contractSatisfied).length / n) * 1000) / 10,
    coverage: Math.round((rows.filter((r) => r.coverage.covered).length / n) * 1000) / 10,
    idleWallpaper: Math.round((rows.filter((r) => r.fallback).length / n) * 1000) / 10,
    firewallHard: rows.filter((r) => r.firewall.hard > 0).length,
    avgGateScore: Math.round((rows.reduce((s, r) => s + (r.gate.score || 0), 0) / n) * 10) / 10,
  };
});

const report = {
  audit: "P3 Visionless Production Gate (100 real scenes, zero LLM/Vision)",
  generatedAt: new Date().toISOString(),
  plan: "Vision-free 10x (2026-10-03): SemanticContract → Director decision → Rendered Scene consistency",
  books,
  kpis,
  perBook,
  violationCodes,
  suspects,
  records,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "p3-gate.json"), JSON.stringify(report, null, 2));

// ── human report ─────────────────────────────────────────────────────────────
const md = [];
md.push(`# P3 Visionless Production Gate — ${total} real scenes, 0 LLM/Vision calls`);
md.push("");
md.push(`**Books:** ${books.join(", ")} · **Sampling:** deterministic even stride (${PER_BOOK}/book, rejects included) · **Generated:** ${report.generatedAt}`);
md.push("");
md.push("## KPIs (the plan's five + coverage)");
md.push("");
md.push("| KPI | Value |");
md.push("|---|---|");
md.push(`| Semantic contract satisfaction | **${kpis.semanticContractSatisfaction}%** |`);
md.push(`| Generic fallback rate | **${kpis.genericFallbackRate}%** |`);
md.push(`| IDLE_ACTOR_WALLPAPER rate | **${kpis.idleActorWallpaperRate}%** |`);
md.push(`| Director fallback rate (adapter floor needed) | **${kpis.directorFallbackRate}%** |`);
md.push(`| Firewall reject rate | **${kpis.firewallRejectRate}%** |`);
md.push(`| Narrative intent → selected visual coverage | **${kpis.intentToVisualCoverage}%** |`);
md.push("");
md.push(`### P1 wiring — does the semantic chain reach production staging?`);
md.push("");
md.push("| Stage present on scene | % |");
md.push("|---|---|");  md.push(`| narrativeAtom | ${kpis.wiring.narrativeAtom}% |`);
  md.push(`| visualIntent (P7: meaningful archetype) | ${kpis.wiring.visualIntent}% |`);
  md.push(`| visualIntent (shell present, legacy truthy) | ${kpis.wiring.visualIntentPresent}% |`);
  md.push(`| visualContract | ${kpis.wiring.visualContract}% |`);
  md.push(`| all three (meaningful) | **${kpis.wiring.allThree}%** |`);
  md.push("");
  md.push(`### P7 intent persistence — meaningful vs shell-only`);
  md.push("");
  md.push(`meaningful **${kpis.p7IntentPersistence.meaningful}%** · shell-only ${kpis.p7IntentPersistence.shellOnly}% · missing ${kpis.p7IntentPersistence.missing}% (acceptance target: meaningful ≥95% on plans after commit 2)`);
md.push("");  md.push(`### P7 semantic judge — one engine, two consumers`);
  md.push("");
  md.push(`| Metric | Value |`);
  md.push(`|---|---|`);
  md.push(`| Scenes with a relational staging obligation | ${kpis.p7SemanticJudge.scenesWithRelationalObligation}/${total} |`);
  md.push(`| Gate ↔ firewall HARD agreement (semantic set) | **${kpis.p7SemanticJudge.gateFirewallHardAgreement}%** |`);
  for (const d of kpis.p7SemanticJudge.disagreements) md.push(`- ⚠ ${d.book}/${d.sceneId}: gate=${JSON.stringify(d.gate)} firewall=${JSON.stringify(d.firewall)}`);
  md.push("");
  md.push(`### P0 payload sanity`);
md.push("");
md.push(`empty ${kpis.payloadSanity.emptyPayload}% · generic ${kpis.payloadSanity.generic}% · truncated ${kpis.payloadSanity.truncated}% · duplicate ${kpis.payloadSanity.duplicate}%`);
md.push("");
md.push("### Per book");
md.push("");
md.push("| Book | n | Contract PASS | Coverage | Idle wallpaper | Firewall hard | Avg gate score |");
md.push("|---|---|---|---|---|---|---|");
for (const b of perBook) md.push(`| ${b.book} | ${b.sampled} | ${b.contractSatisfaction}% | ${b.coverage}% | ${b.idleWallpaper}% | ${b.firewallHard} | ${b.avgGateScore} |`);
md.push("");
md.push("### Violation distribution (P6 taxonomy seed)");
md.push("");
md.push("| Code | Scenes |");
md.push("|---|---|");
for (const [code, n] of Object.entries(violationCodes).slice(0, 15)) md.push(`| ${code} | ${n} |`);
md.push("");
md.push("### Top 20 suspects (P5 human contact sheet input)");
md.push("");
md.push("| Book | Scene | Score | Flags | Archetype | Shot |");
md.push("|---|---|---|---|---|---|");
for (const s of suspects) md.push(`| ${s.book} | ${s.sceneId} (frame ${s.captureFrame}) | ${s.score} | ${s.flags.join(", ") || "—"} | ${s.archetype} | ${s.shot} |`);
md.push("");
md.push("_Measurement only — nothing here feeds a production gate. Motion-between-frames and pixel tests run separately via `scripts/p4-render-truth-audit.mjs` on rendered PNGs._");
fs.writeFileSync(path.join(OUT_DIR, "p3-report.md"), md.join("\n") + "\n");

console.log(`P3 visionless gate: ${total} scenes across ${books.length} book(s).`);
console.log(`  contract PASS ${kpis.semanticContractSatisfaction}% · generic ${kpis.genericFallbackRate}% · idle-wallpaper ${kpis.idleActorWallpaperRate}%`);
console.log(`  director-fallback ${kpis.directorFallbackRate}% · firewall-reject ${kpis.firewallRejectRate}% · intent→visual coverage ${kpis.intentToVisualCoverage}%`);
console.log(`  wiring atom/intent/contract: ${kpis.wiring.narrativeAtom}/${kpis.wiring.visualIntent}/${kpis.wiring.visualContract}%`);
console.log(`→ ${path.relative(root, path.join(OUT_DIR, "p3-gate.json"))}`);
console.log(`→ ${path.relative(root, path.join(OUT_DIR, "p3-report.md"))}`);
process.exit(0);
