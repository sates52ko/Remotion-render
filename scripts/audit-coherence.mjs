#!/usr/bin/env node
/**
 * audit-coherence.mjs — P3.1 "does the picture match the audio?" (REPORT-ONLY)
 *
 * The viewer's complaint has four measurable shapes:
 *   T1 layout   — labels drawn over each other / over the graphic (diagram
 *                 cells, KineticText boxes) + the same phrase stamped twice
 *   T2 segment  — the scene's own subject/callouts absent from the scene's own
 *                 narration window (the "_subject: philosophy while the audio
 *                 says x-ray machine" class)
 *   T3 entities — ASR artifacts in the spine (Varity/Verity, Loen/…) + phantom
 *                 cast personas in meta.cast
 *   T4 timeline — scene windows must tile the audio spine exactly (fromFrame)
 *
 * Geometry is NOT re-guessed: stageText comes from the engine's own shots.ts,
 * label fitting from labelFit.ts (the exact functions Diagram.tsx renders
 * with), and the KineticText mirror cites the formulas it mirrors.
 *
 * Entity decisions are NOT re-guessed either: the variant→canonical logic is
 * the SAME entity-core module scripts/normalize-entities.js applies — what the
 * audit counts is exactly what the normalizer will fix (zero drift).
 *
 * Report-first by default (exit 0). --enforce exits 1 on HARD violations
 * (duplicates, word overflows, ASR artifacts, phantom cast, timeline drift).
 * P3.6 flipped the clean book onto that mode: verity runs enforced.
 *
 * `preP32` metrics describe what the OLD renderer would have drawn; they are
 * the baseline language ("what was broken"), never live violations. Live
 * violations = duplicates / wordOverflow / textOverlaps.
 *
 * Usage: node scripts/audit-coherence.mjs [--slug=verity] [--enforce]
 * Out:   audit/coherence/<slug>.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fitLabel, estWidth, DIAGRAM_VW as VW, DIAGRAM_VH as VH } from "../src/engines/antidote/labelFit.ts";
import { stageText } from "../src/engines/antidote/shots.ts";
import entityCore from "./lib/entity-core.js";

const {
  editDistance,
  canonicalTokens,
  transformWords,
  buildAssociation,
  decideReplacement,
} = entityCore;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const slugArg = (args.find((a) => a.startsWith("--slug=")) || "").slice(7);
const ENFORCE = args.includes("--enforce");

/** Placeholder labels the stagnation/novelty engines inject — never narration. */
const BOILERPLATE_LABELS = ["HABIT LOOP", "STEP 01", "STEP 02", "DEFAULT TRAP", "REAL LEVERAGE"];
/** Adapter floor pairs — acceptable fallback, counted for visibility. */
const FLOOR_PAIRS = new Set(["TRIGGER,CONSEQUENCE", "DENIAL,REALIZATION", "CAUSE,EFFECT", "LESS,MORE"]);

/** Mirror of KineticText.fitSize (src/engines/antidote/components/KineticText.tsx:39-44). */
const kineticFitSize = (text, size) => {
  const len = String(text || "").replace(/\s+/g, " ").trim().length;
  if (len <= 16) return size;
  return Math.max(size * 0.4, size * (16 / len) ** 0.5);
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const contentWords = (s) => norm(s).split(" ").filter((w) => w.length > 3);

function coverage(needle, hay) {
  const set = new Set(norm(hay).split(" "));
  const cw = contentWords(needle);
  if (!cw.length) return null;
  return cw.filter((w) => set.has(w)).length / cw.length;
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function parseVtt(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n\r?\n/)
    .map((b) => b.split(/\r?\n/).filter((l) => l.trim()))
    .filter((lines) => lines.length >= 2 && lines[1].includes("-->"))
    .map((lines) => lines.slice(2).join(" "));
}

// ── T1 layout ────────────────────────────────────────────────────────────────

function auditLayout(cfg) {
  const diagramRows = [];
  const textIssues = [];
  const byType = {};

  for (const s of cfg.scenes || []) {
    const d = s.diagram;
    if (d) {
      byType[d.type] = (byType[d.type] || 0) + 1;
      const labels = (d.labels || []).map((l) => String(l || "").trim().toUpperCase()).filter(Boolean);
      const row = { scene: s.id, type: d.type, duplicates: [], preP32: [], wordOverflow: [], floor: false, boilerplate: false };

      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          if (labels[i] === labels[j]) row.duplicates.push(labels[i]);
        }
      }
      const blob = labels.join(" | ");
      if (BOILERPLATE_LABELS.some((b) => blob.includes(b))) row.boilerplate = true;
      if (FLOOR_PAIRS.has(labels.join(","))) row.floor = true;

      if (d.type === "flow") {
        const nodes = labels.length ? labels.slice(0, 3) : ["CAUSE", "EFFECT"];
        const n = Math.max(2, nodes.length);
        const r = 92;
        const xs = nodes.map((_, i) => 60 + r + (n === 1 ? 0 : (i / (n - 1)) * (VW - 120 - 2 * r)));
        const baseSize = (l) => (l.length > 8 ? 30 : 38);
        // pre-P3.2: one unwrapped line centered in the circle
        nodes.forEach((l, i) => {
          const w = estWidth(l, baseSize(l));
          if (w > 2 * r + 8) row.preP32.push(`node${i} crossed the connector/token lane (w=${Math.round(w)} > ${2 * r})`);
        });
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const wi = estWidth(nodes[i], baseSize(nodes[i]));
            const wj = estWidth(nodes[j], baseSize(nodes[j]));
            if (Math.abs(xs[i] - xs[j]) < (wi + wj) / 2) row.preP32.push(`nodes ${i}/${j} labels overlapped`);
          }
        }
        // live contract: every label fits its cell under the P3.2 renderer
        nodes.forEach((l, i) => {
          const cellL = i === 0 ? 0 : (xs[i - 1] + xs[i]) / 2;
          const cellR = i === n - 1 ? VW : (xs[i] + xs[i + 1]) / 2;
          const inside = fitLabel(l, { maxW: 2 * r - 24, baseSize: baseSize(l), minSize: 16, maxLines: 1 });
          const use = inside.lines.length === 1 && inside.width <= 2 * r - 24;
          const fit = use ? inside : fitLabel(l, { maxW: cellR - cellL - 24, baseSize: 28, minSize: 15, maxLines: 2 });
          const budget = cellR - cellL - 24;
          if (fit.width > budget + 1) row.wordOverflow.push(`node${i} unbreakable word exceeds cell by ${Math.round(fit.width - budget)}px`);
        });
      } else if (d.type === "spectrum") {
        const x0 = 120, x1 = VW - 120, halfW = VW / 2 - x0 - 20;
        if (labels.length >= 2) {
          const wA = estWidth(labels[0], 34), wB = estWidth(labels[1], 34);
          if (x0 + wA > x1 - wB) row.preP32.push("spectrum poles overlapped at center");
          else if (wA > halfW || wB > halfW) row.preP32.push("spectrum pole crossed the bar center");
        }
        labels.slice(0, 2).forEach((l, k) => {
          const fit = fitLabel(l, { maxW: halfW, baseSize: 34, minSize: 17, maxLines: 2 });
          if (fit.width > halfW + 1) row.wordOverflow.push(`pole${k} unbreakable word exceeds half-bar`);
        });
      } else if (labels.length) {
        // per-type budgets mirroring Diagram.tsx cell widths — renderer and
        // auditor must agree exactly or --enforce (P3.6) drifts.
        const bud = (l, k) => {
          if (d.type === "tree") {
            // root rect 300-24, branch 260-24, leaf 200-24 (Diagram.tsx Tree)
            return k === 0
              ? { maxW: 276, base: 28, min: 14 }
              : k <= 2
                ? { maxW: 236, base: 24, min: 12 }
                : { maxW: 176, base: 20, min: 11 };
          }
          if (d.type === "funnel") {
            // narrow-edge budget per stage: max(120, btm-40) (Diagram.tsx Funnel)
            return { maxW: Math.max(120, [700, 500, 300, 140][Math.min(k, 3)] - 40), base: l.length > 14 ? 24 : 30, min: 14 };
          }
          if (d.type === "sorter") {
            // bw = (totalW - gap*(n-1))/n, totalW = VW-120, gap = 44 (Diagram.tsx Sorter)
            const n = Math.min(4, labels.length);
            return { maxW: (VW - 120 - 44 * (n - 1)) / n, base: 34, min: 17 };
          }
          if (d.type === "matrix") {
            // qWidth = (x1-x0)/2 - 20 with x0=180 → 280; label maxW = qWidth-24 (Diagram.tsx Matrix)
            return { maxW: 256, base: l.length > 12 ? 26 : 32, min: 15 };
          }
          return { maxW: Math.max(160, VW / 6), base: 34, min: 15 };
        };
        labels.forEach((l, k) => {
          const b = bud(l, k);
          const fit = fitLabel(l, { maxW: b.maxW, baseSize: b.base, minSize: b.min, maxLines: 2 });
          if (fit.width > b.maxW + 1) row.wordOverflow.push(`${d.type} label${k} unbreakable word exceeds ${b.maxW}px`);
        });
      }
      if (row.duplicates.length || row.preP32.length || row.wordOverflow.length || row.floor || row.boilerplate) diagramRows.push(row);
    }

    // ── texts[] (KineticText boxes via the engine's own stageText) ──
    const ts = s.texts || [];
    if (ts.length > 1) {
      const boxes = [];
      for (let i = 0; i < ts.length; i++) {
        const tx = ts[i];
        const st = stageText(s.shot, tx, i);
        const text = String(tx.text || "");
        const size = kineticFitSize(text, st.size);
        const words = text.trim().split(/\s+/).filter(Boolean);
        const maxW = words.length > 1 ? (tx.style === "plain" ? 1120 : 860) : Infinity;
        const rawW = estWidth(text, size);
        const w = Number.isFinite(maxW) ? Math.min(rawW, maxW) : rawW;
        const lines = Number.isFinite(maxW) && maxW > 0 ? Math.max(1, Math.ceil(rawW / maxW)) : 1;
        boxes.push({ text: text.toUpperCase(), x: st.x, y: st.y, w, h: lines * size * 1.02 });
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 8) {
            textIssues.push({ scene: s.id, kind: "overlap", pair: [a.text, b.text] });
          }
        }
      }
      if (s.shot === "lowAngle") textIssues.push({ scene: s.id, kind: "risk", detail: "lowAngle textStep=0 stacks texts at one y" });
    }
    const seen = new Set();
    for (const t of ts) {
      const k = String(t.text || "").trim().toUpperCase();
      if (!k) continue;
      if (seen.has(k)) textIssues.push({ scene: s.id, kind: "duplicate", text: k });
      seen.add(k);
    }
  }

  const dups = diagramRows.filter((r) => r.duplicates.length);
  const pre = diagramRows.filter((r) => r.preP32.length);
  const ovf = diagramRows.filter((r) => r.wordOverflow.length);
  const floors = diagramRows.filter((r) => r.floor);
  const boiler = diagramRows.filter((r) => r.boilerplate);
  const txtDup = textIssues.filter((i) => i.kind === "duplicate");
  const txtOvl = textIssues.filter((i) => i.kind === "overlap");
  return {
    diagrams: {
      count: Object.values(byType).reduce((a, b) => a + b, 0),
      byType,
      duplicateLabels: dups,
      preP32OverlapRisk: pre,
      wordOverflow: ovf,
      floorPairs: floors.map((r) => r.scene),
      boilerplate: boiler.map((r) => r.scene),
    },
    texts: { duplicate: txtDup, overlap: txtOvl, risks: textIssues.filter((i) => i.kind === "risk") },
  };
}

// ── T2 segment grounding ─────────────────────────────────────────────────────

function auditSegment(cfg) {
  let sTot = 0, sHit = 0, tTot = 0, tHit = 0;
  const subjectMisses = [];
  for (const s of cfg.scenes || []) {
    const subj = Array.isArray(s._subject) ? s._subject.join(" ") : s._subject;
    const c = coverage(subj, s._narration);
    if (c !== null) {
      sTot++;
      if (c >= 0.5) sHit++;
      else if (subjectMisses.length < 12) subjectMisses.push({ scene: s.id, subject: String(subj).slice(0, 60), cov: +c.toFixed(2) });
    }
    for (const t of s.texts || []) {
      const ct = coverage(t.text, s._narration);
      if (ct === null) continue;
      tTot++;
      if (ct >= 0.5) tHit++;
    }
  }
  return {
    subjectCoverage: { hit: sHit, total: sTot, pct: sTot ? +(100 * sHit / sTot).toFixed(1) : null, misses: subjectMisses },
    textCoverage: { hit: tHit, total: tTot, pct: tTot ? +(100 * tHit / tTot).toFixed(1) : null },
  };
}

// ── T3 entities (shared entity-core — identical decisions to the normalizer) ─

function buildEntityContext(cfg, slug) {
  const book = readJsonFile(path.join(ROOT, "books", slug, "book.json")) || {};
  const bible = readJsonFile(path.join(ROOT, "books", slug, "story-bible.json")) || {};
  const castNames = Object.values(bible.cast || {}).map((c) => String(c?.name || ""));
  const canonicals = canonicalTokens({
    title: book.title || cfg.meta?.title || slug,
    author: book.author || cfg.meta?.author || "",
    castNames,
  });
  const narration = (cfg.scenes || []).map((s) => s._narration || "").join("\n");
  const texts = (cfg.scenes || [])
    .flatMap((s) => (s.texts || []).map((t) => String(t.text || "")))
    .join("\n");
  const diagramLabels = (cfg.scenes || [])
    .flatMap((s) => (s.diagram ? [String(s.diagram.title || ""), ...(s.diagram.labels || []).map(String)] : []))
    .join("\n");
  // Every string leaf that contains whitespace is prose under the SAME rule
  // normalize applies (deep walk) — per-field collectors drift silently the
  // next time anyone adds a prose field (observed: _subject and
  // narrativeRelation kept 500+ variants after a field-targeted pass).
  const prose = [];
  (function collectProse(node) {
    if (typeof node === "string") {
      if (/[\s'’]/.test(node)) prose.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) collectProse(v);
      return;
    }
    if (node && typeof node === "object") for (const v of Object.values(node)) collectProse(v);
  })(cfg);
  const configBlob = prose.join("\n");
  const cleanVtt = path.join(ROOT, "public", "captions", `${slug}.clean.vtt`);
  const rawVtt = path.join(ROOT, "public", "captions", `${slug}.vtt`);
  const captionText = (fs.existsSync(cleanVtt) ? parseVtt(cleanVtt) : parseVtt(rawVtt)).join("\n");
  const extraNodes = [
    ...Object.keys(cfg.meta?.cast || {}),
    ...Object.keys(bible.cast || {}),
  ];
  const assoc = buildAssociation({ texts: [configBlob, captionText], extraNodes, canonicals });
  return { canonicals, narration, texts, diagramLabels, configBlob, captionText, assoc };
}

function auditEntities(cfg, slug) {
  const ctx = buildEntityContext(cfg, slug);

  // Count every occurrence the normalizer WILL change (same decide function).
  const countHits = (blob) => {
    const bucket = {};
    transformWords(blob, (raw, initial) => {
      const hit = decideReplacement(raw, initial, ctx.assoc);
      if (hit) {
        const key = `${raw.toLowerCase()} -> ${hit.canonical}`;
        (bucket[key] ||= { count: 0, sample: raw, class: hit.class }).count++;
      }
      return null; // counting only — never mutate
    });
    return bucket;
  };
  const configHits = countHits(ctx.configBlob);
  const captionHits = countHits(ctx.captionText);

  // phantom cast personas: meta.cast keys that resolve to a DIFFERENT canonical
  const phantomCast = [];
  const unresolvedCast = [];
  for (const k of Object.keys(cfg.meta?.cast || {})) {
    const lower = k.toLowerCase();
    if (ctx.canonicals.includes(lower)) continue;
    const t = ctx.assoc.get(lower);
    if (t) phantomCast.push({ key: k, remapTo: t.canonical, chained: t.chained });
    else unresolvedCast.push(k);
  }

  // whole-value phantom references (identity, roles, allowedCharacters[],
  // visualEvidence.subjects[], cast .name) — the same case-insensitive leaf
  // match normalize-entities.js remaps, counted so --enforce sees structured
  // fields too. A leaf string can never be prose, so equality is unambiguous.
  const phantomKeys = new Set(phantomCast.map((p) => p.key));
  const valueRefs = {};
  (function walkValues(node) {
    if (typeof node === "string") {
      const low = node.toLowerCase();
      if (phantomKeys.has(low)) valueRefs[low] = (valueRefs[low] || 0) + 1;
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) walkValues(v);
      return;
    }
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) {
        if (phantomKeys.has(k)) valueRefs[k] = (valueRefs[k] || 0) + 1;
        walkValues(node[k]);
      }
    }
  })(cfg);

  const inConfig = Object.values(configHits).reduce((a, x) => a + x.count, 0);
  const inCaptions = Object.values(captionHits).reduce((a, x) => a + x.count, 0);
  return {
    canonicalWords: [...ctx.canonicals].sort(),
    artifacts: { config: configHits, captions: captionHits },
    phantomCast,
    unresolvedCast,
    valueRefs: { counts: valueRefs, total: Object.values(valueRefs).reduce((a, b) => a + b, 0) },
    totals: { inConfig, inCaptions },
  };
}

// ── T4 timeline ──────────────────────────────────────────────────────────────

function auditTimeline(cfg) {
  let drift = 0, maxDrift = 0, prevEnd = 0;
  for (const s of cfg.scenes || []) {
    if (s.fromFrame !== prevEnd) {
      drift++;
      maxDrift = Math.max(maxDrift, Math.abs(s.fromFrame - prevEnd));
    }
    prevEnd = s.fromFrame + s.durationFrames;
  }
  return {
    nonContiguousScenes: drift,
    maxDriftFrames: maxDrift,
    lastFrame: prevEnd,
    metaFrames: cfg.meta?.durationInFrames ?? null,
    exact: prevEnd === (cfg.meta?.durationInFrames ?? prevEnd) && maxDrift <= 2,
  };
}

// ── driver ───────────────────────────────────────────────────────────────────

function auditBook(slug) {
  const configPath = path.join(ROOT, "books", slug, "config.antidote.json");
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const layout = auditLayout(cfg);
  const segment = auditSegment(cfg);
  const entities = auditEntities(cfg, slug);
  const timeline = auditTimeline(cfg);

  const hard = {
    duplicateDiagramLabels: layout.diagrams.duplicateLabels.reduce((a, r) => a + r.duplicates.length, 0),
    duplicateTexts: layout.texts.duplicate.length,
    textOverlaps: layout.texts.overlap.length,
    wordOverflow: layout.diagrams.wordOverflow.reduce((a, r) => a + r.wordOverflow.length, 0),
    asrArtifacts: entities.totals.inConfig + entities.totals.inCaptions,
    phantomCast: entities.phantomCast.length,
    valueRefs: entities.valueRefs.total,
    // ≤2-frame seams are inside the tolerance `exact` already encodes —
    // a seam that small is invisible; only real drift counts as hard.
    timelineDriftScenes: timeline.exact ? 0 : timeline.nonContiguousScenes,
    timelineNotExact: timeline.exact ? 0 : 1,
  };
  const report = {
    audit: "P3.1 audio↔screen coherence (report-only)",
    version: "P3.1",
    slug,
    generatedAt: new Date().toISOString(),
    layout,
    segment,
    entities,
    timeline,
    hard,
    hardTotal: Object.values(hard).reduce((a, b) => a + b, 0),
  };
  const outDir = path.join(ROOT, "audit", "coherence");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${slug}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  return { report, out };
}

const booksDir = path.join(ROOT, "books");
const slugs = fs.readdirSync(booksDir)
  .filter((d) => !slugArg || d === slugArg)
  .filter((d) => fs.existsSync(path.join(booksDir, d, "config.antidote.json")));

console.log("P3.1 COHERENCE AUDIT" + (ENFORCE ? " (--enforce)" : " (report-only)"));
console.log("book          diag | dupL preP ovf floor/bplr | txtDup txtOvl | subj%  txt%  | ASR cfg/cap phantom | drift hard");
let hardTotal = 0;
for (const slug of slugs) {
  const { report, out } = auditBook(slug);
  hardTotal += report.hardTotal;
  const L = report.layout.diagrams, T = report.layout.texts, S = report.segment, E = report.entities;
  console.log(
    `${slug.padEnd(13)} ${String(L.count).padStart(4)} | ${String(L.duplicateLabels.length).padStart(4)} ${String(L.preP32OverlapRisk.length).padStart(4)} ${String(L.wordOverflow.length).padStart(3)} ` +
    `${String(L.floorPairs.length + L.boilerplate.length).padStart(9)} | ${String(T.duplicate.length).padStart(6)} ${String(T.overlap.length).padStart(6)} | ` +
    `${String(S.subjectCoverage.pct ?? "-").padStart(5)} ${String(S.textCoverage.pct ?? "-").padStart(5)} | ` +
    `${String(E.totals.inConfig).padStart(3)}/${String(E.totals.inCaptions).padEnd(4)} ${String(E.phantomCast.length).padStart(8)} | ` +
    `${String(report.timeline.nonContiguousScenes).padStart(5)} ${String(report.hardTotal).padStart(4)}  → ${path.relative(ROOT, out)}`
  );
}
if (ENFORCE && hardTotal > 0) {
  console.error(`\nENFORCED: ${hardTotal} hard violation(s) across ${slugs.length} book(s).`);
  process.exitCode = 1;
} else if (ENFORCE) {
  console.log(`\nhard total: 0 — ENFORCED, gate green`);
} else {
  console.log(`\nhard total: ${hardTotal} (report-only — not enforced)`);
}
