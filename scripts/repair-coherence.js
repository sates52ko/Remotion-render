"use strict";
/**
 * repair-coherence.js — P3.2b: repair the audit's HARD layout violations
 * (duplicateDiagramLabels / duplicateTexts / textOverlaps) for one book by
 * replaying the EXACT deterministic path plan-antidote uses:
 *
 *   full scene narration -> extractNarrativeAtomSync -> deriveVisualIntent
 *                        -> semanticPayload (the very function plan line
 *                           598/611 consumes) -> distinct pair labels
 *
 * The planner's scene text is NOT fully stored in the config (`_narration` is
 * s.text.slice(0, 160), plan-antidote.js:89), so the full narration is
 * reconstructed from the word-timed captions that fall inside the scene's
 * frame range and verified against the stored prefix before use.
 *
 * Fixes (all data-level, no engine / shots.ts / Color DNA changes):
 *   1. duplicate diagram labels -> payload labels when distinct, else the
 *      adapter's own floor pair for the diagram type (flow:
 *      TRIGGER,CONSEQUENCE — already the scene's floor title; audit counts
 *      FLOOR_PAIRS as soft, never hard).
 *   2. duplicate text pairs (enter left/right at x470/x1450 y250) -> payload
 *      left/right (styling kept); when no valid pair payload exists the plan
 *      would not push the pair at all -> remove it.
 *   3. text overlaps -> nudge the explicit-coordinate text (center-based
 *      geometry mirrored from audit-coherence.mjs, which itself mirrors
 *      stageText + KineticText.fitSize + labelFit.estWidth) until the pair
 *      clears; staged (coordinate-less) texts such as pop callouts are never
 *      moved — the shot preset owns their staging.
 *
 * Usage: node scripts/repair-coherence.js --slug=<slug> [--apply]
 * Default is a dry run that reports the planned edits and re-verifies each
 * flagged scene in memory; --apply writes config with a .bak-p32b-* backup.
 */
const fs = require("fs");
const path = require("path");
const { extractNarrativeAtomSync } = require("../src/semantic/narrativeAtom.ts");
const { deriveVisualIntent } = require("../src/semantic/visualIntent.ts");
const { semanticPayload } = require("./lib/director-adapter");
const { stageText } = require("../src/engines/antidote/shots.ts");
const { estWidth } = require("../src/engines/antidote/labelFit.ts");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] !== undefined ? m[2] : true] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
const APPLY = !!args.apply;
if (!SLUG) {
  console.error("usage: node scripts/repair-coherence.js --slug=<slug> [--apply]");
  process.exit(2);
}

const cfgPath = path.join("books", SLUG, "config.antidote.json");
const auditPath = path.join("audit", "coherence", `${SLUG}.json`);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
if (!fs.existsSync(auditPath)) {
  console.error(`audit not found: ${auditPath} — run scripts/audit-coherence.mjs first`);
  process.exit(2);
}
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const meta = cfg.meta || {};
const CTX = { bookTitle: meta.title || SLUG, author: meta.author || "" };
const scenes = new Map((cfg.scenes || []).map((s) => [s.id, s]));

// 2026-09-23: DIAGRAM_FLOOR (TRIGGER/CONSEQUENCE, DENIAL/REALIZATION) removed —
// the adapter no longer has constant floors, so a degenerate diagram is removed
// instead of being re-labelled with a template (see scripts/lib/screen-text.js).

const report = [];
let failures = 0;

// ── full narration reconstruction ───────────────────────────────────────────
const normWords = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
/** True when candidate shares every stored word except possibly the final one
 *  (the cut may hand the boundary word to either side; truncation cuts words). */
function prefixMatch(candWords, storedWords) {
  const n = Math.min(candWords.length, storedWords.length);
  if (n <= 0) return false;
  for (let i = 0; i < n - 1; i++) if (candWords[i] !== storedWords[i]) return false;
  if (n === 1) return candWords[0] === storedWords[0];
  return true;
}
const narrationCache = new Map();
function fullNarration(s) {
  if (narrationCache.has(s.id)) return narrationCache.get(s.id);
  const stored = String(s._narration || "");
  const start = s.fromFrame;
  const end = s.fromFrame + s.durationFrames;
  const storedWords = normWords(stored);
  const cueJoin = (cfg.captions || [])
    .filter((c) => c.startFrame >= start && c.startFrame < end)
    .map((c) => c.text)
    .join(" ");
  const wordJoin = (() => {
    const ws = [];
    for (const c of cfg.captions || []) for (const w of c.words || []) if (w.s >= start && w.s < end) ws.push(w.w);
    return ws.join(" ");
  })();
  let out = stored;
  let source = "stored";
  if (prefixMatch(normWords(cueJoin), storedWords) && normWords(cueJoin).length >= storedWords.length - 1) {
    out = cueJoin;
    source = "captions(cues)";
  } else if (prefixMatch(normWords(wordJoin), storedWords) && normWords(wordJoin).length >= storedWords.length - 1) {
    out = wordJoin;
    source = "captions(words)";
  } else if (stored.length >= 160) {
    report.push(`${s.id} | WARN reconstruction prefix mismatch — falling back to truncated stored text`);
  }
  narrationCache.set(s.id, { text: out, source });
  return { text: out, source };
}

/** Payload in planner-consumed shape: diagram labels or a comparison pair. */
function payloadFor(s) {
  const { text } = fullNarration(s);
  const atom = extractNarrativeAtomSync(text, CTX);
  const intent = deriveVisualIntent(atom);
  const p = semanticPayload(atom, intent.archetype);
  if (!p) return { archetype: intent.archetype, p: null };
  if (p.kind === "flow_labels") return { archetype: intent.archetype, labels: [p.triggerLabel, p.consequenceLabel] };
  if (p.kind === "internal_tension_labels") return { archetype: intent.archetype, labels: [p.internalPoleA, p.internalPoleB] };
  if (p.kind === "comparison_labels") return { archetype: intent.archetype, pair: { left: p.leftLabel, right: p.rightLabel } };
  if (p.kind === "two_domain_labels") return { archetype: intent.archetype, pair: { left: p.sourceLabel, right: p.targetLabel } };
  return { archetype: intent.archetype, p: null };
}

// ── audit-mirrored text geometry ────────────────────────────────────────────
/** Mirror of KineticText.fitSize (src/engines/antidote/components/KineticText.tsx:39-44). */
const kineticFitSize = (text, size) => {
  const len = String(text || "")
    .replace(/\s+/g, " ")
    .trim().length;
  if (len <= 16) return size;
  return Math.max(size * 0.4, size * (16 / len) ** 0.5);
};
function textBoxes(s) {
  const ts = s.texts || [];
  return ts.map((tx, i) => {
    const st = stageText(s.shot, tx, i);
    const text = String(tx.text || "");
    const size = kineticFitSize(text, st.size);
    const words = text.trim().split(/\s+/).filter(Boolean);
    const maxW = words.length > 1 ? (tx.style === "plain" ? 1120 : 860) : Infinity;
    const rawW = estWidth(text, size);
    const w = Number.isFinite(maxW) ? Math.min(rawW, maxW) : rawW;
    const lines = Number.isFinite(maxW) && maxW > 0 ? Math.max(1, Math.ceil(rawW / maxW)) : 1;
    return { x: st.x, y: st.y, w, h: lines * size * 1.02 };
  });
}
function overlapPairs(s) {
  const boxes = textBoxes(s);
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 8) out.push([i, j]);
    }
  }
  return { boxes, out };
}
const dupKey = (t) => String(t.text || "").trim().toUpperCase();
function duplicateGroups(s) {
  const ts = s.texts || [];
  const seen = new Map();
  ts.forEach((t, i) => {
    const k = dupKey(t);
    if (!k) return;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(i);
  });
  return [...seen.entries()].filter(([, idx]) => idx.length > 1);
}

// ── STEP 1: duplicate diagram labels ────────────────────────────────────────
for (const row of audit.layout.diagrams.duplicateLabels || []) {
  const s = scenes.get(row.scene);
  if (!s || !s.diagram || !Array.isArray(s.diagram.labels)) continue;
  const before = s.diagram.labels.map(String);
  if (new Set(before).size === before.length) continue;
  const pay = payloadFor(s);
  const L = pay.labels;
  let next = null;
  if (L && L[0] && L[1] && L[0] !== L[1]) next = L;
  if (!next) {
    if (s.diagram.authored) {
      failures++;
      report.push(`${s.id} | DIAGRAM NEED-MANUAL (authored ${s.diagram.type} has duplicate labels)`);
      continue;
    }
    report.push(`${s.id} | DIAGRAM REMOVED (no readable payload) was ${JSON.stringify(before)} [archetype ${pay.archetype}]`);
    delete s.diagram;
    continue;
  }
  s.diagram.labels = next;
  report.push(`${s.id} | DIAGRAM labels ${JSON.stringify(before)} -> ${JSON.stringify(next)} [archetype ${pay.archetype}]`);
}

// ── STEP 2: duplicate text pairs ────────────────────────────────────────────
for (const row of audit.layout.texts.duplicate || []) {
  const s = scenes.get(row.scene);
  if (!s) continue;
  const groups = duplicateGroups(s);
  if (!groups.length) continue; // already distinct (e.g. second row of same scene)
  const ts = s.texts;
  const li = ts.findIndex((t) => t.enter === "left");
  const ri = ts.findIndex((t) => t.enter === "right");
  const dupIndices = new Set(groups.flatMap(([, idx]) => idx));
  const pairInvolved = li >= 0 && ri >= 0 && (dupIndices.has(li) || dupIndices.has(ri));
  if (!pairInvolved) {
    failures++;
    const keys = groups.map(([k]) => k).join(" x ");
    report.push(`${s.id} | TEXT NEED-MANUAL duplicate not on left/right pair: ${keys}`);
    continue;
  }
  const pay = payloadFor(s);
  const P = pay.pair;
  const others = new Set(ts.filter((_, i) => i !== li && i !== ri).map(dupKey));
  const valid =
    P && P.left && P.right && P.left !== P.right && !others.has(P.left) && !others.has(P.right);
  const before = [ts[li].text, ts[ri].text];
  if (valid) {
    ts[li].text = P.left;
    ts[ri].text = P.right;
    report.push(`${s.id} | TEXT pair ${JSON.stringify(before)} -> ${JSON.stringify([P.left, P.right])} [archetype ${pay.archetype}]`);
  } else {
    // plan line 611 only pushes a valid distinct pair — no payload, no pair
    ts.splice(Math.max(li, ri), 1);
    ts.splice(Math.min(li, ri), 1);
    report.push(`${s.id} | TEXT pair REMOVED (no valid distinct payload) was ${JSON.stringify(before)}`);
  }
}

// ── STEP 3: overlaps → nudge explicit-coordinate text ───────────────────────
const BOUNDS = { x: [180, 1740], y: [80, 1000] };
const inB = (v, [lo, hi]) => v >= lo && v <= hi;
function nudgeOverlaps(s) {
  let changed = false;
  for (let iter = 0; iter < 16; iter++) {
    const { boxes, out } = overlapPairs(s);
    if (!out.length) return { clean: true, changed };
    const [ia, ib] = out[0];
    const ts = s.texts;
    const mi = [ib, ia].find((i) => ts[i].x !== undefined || ts[i].y !== undefined);
    if (mi === undefined) return { clean: false, changed, stuck: out[0] };
    const oi = mi === ia ? ib : ia;
    const bm = boxes[mi], bo = boxes[oi];
    const T = ts[mi];
    const dy = bm.y - bo.y, dx = bm.x - bo.x;
    const yNeed = (bm.h + bo.h) / 2 + 8;
    const xNeed = (bm.w + bo.w) / 2 + 8;
    // Round AWAY from the other box: thresholds are often fractional (x.5), and
    // Math.round can eat that sub-pixel margin so |d| stays just under the
    // threshold forever (observed: y=218.5→219 vs need 81.5 → loops to limit).
    const away = (base, need, dir) => {
      const raw = base + dir * need;
      const r = dir > 0 ? Math.ceil(raw) : Math.floor(raw);
      return Math.abs(r - base) >= need ? r : r + dir;
    };
    // prefer vertical (copy zone steps down), then horizontal, then opposite sides
    const tries = [
      ["y", away(bo.y, yNeed, dy >= 0 ? 1 : -1)],
      ["x", away(bo.x, xNeed, dx >= 0 ? 1 : -1)],
      ["y", away(bo.y, yNeed, dy >= 0 ? -1 : 1)],
      ["x", away(bo.x, xNeed, dx >= 0 ? -1 : 1)],
    ];
    let moved = false;
    for (const [axis, val] of tries) {
      const r = Math.round(val);
      if (inB(r, BOUNDS[axis])) {
        T[axis] = r;
        changed = true;
        moved = true;
        break;
      }
    }
    if (!moved) return { clean: false, changed, stuck: out[0] };
  }
  const rest = overlapPairs(s);
  return { clean: !rest.out.length, changed, stuck: rest.out[0] };
}

const overlapTargets = new Set((audit.layout.texts.overlap || []).map((o) => o.scene));
for (const s of cfg.scenes || []) {
  if (overlapTargets.has(s.id)) {
    const r = nudgeOverlaps(s);
    if (r.changed) {
      const detail = (s.texts || [])
        .filter((t) => t.x !== undefined || t.y !== undefined)
        .map((t) => `${dupKey(t).slice(0, 20)}@(${t.x ?? "-"},${t.y ?? "-"})`)
        .join(" ");
      report.push(`${s.id} | NUDGE -> ${r.clean ? "clean" : "STILL OVERLAP"} | ${detail}`);
    }
    if (!r.clean) {
      failures++;
      report.push(`${s.id} | OVERLAP NEED-MANUAL stuck at ${JSON.stringify(r.stuck)}`);
    }
  } else if ((s.texts || []).length > 1) {
    // content edits above can create NEW overlaps in scenes the audit never saw
    const r = nudgeOverlaps(s);
    if (r.changed) report.push(`${s.id} | NUDGE (new-overlap guard) -> ${r.clean ? "clean" : "STILL OVERLAP"}`);
    if (!r.clean) {
      failures++;
      report.push(`${s.id} | OVERLAP NEED-MANUAL (guard) stuck at ${JSON.stringify(r.stuck)}`);
    }
  }
}

// ── verify every originally-flagged scene is now clean ──────────────────────
for (const row of audit.layout.diagrams.duplicateLabels || []) {
  const s = scenes.get(row.scene);
  if (!s || !s.diagram) continue;
  const labels = (s.diagram.labels || []).map(String);
  if (new Set(labels).size !== labels.length) {
    failures++;
    report.push(`${s.id} | VERIFY FAIL duplicate diagram labels remain: ${JSON.stringify(labels)}`);
  }
}
for (const row of audit.layout.texts.duplicate || []) {
  const s = scenes.get(row.scene);
  if (!s) continue;
  if (duplicateGroups(s).length) {
    failures++;
    report.push(`${s.id} | VERIFY FAIL duplicate texts remain`);
  }
}
for (const s of cfg.scenes || []) {
  if (!overlapPairs(s).out.length) continue;
  failures++;
  report.push(`${s.id} | VERIFY FAIL overlaps remain: ${JSON.stringify(overlapPairs(s).out)}`);
}

// ── output ──────────────────────────────────────────────────────────────────
console.log(`repair-coherence ${SLUG} (${APPLY ? "APPLY" : "dry-run"})`);
for (const line of report) console.log("  " + line);
console.log(`  edits: ${report.length}, failures: ${failures}`);
if (failures) process.exit(1);
if (!APPLY || !report.length) {
  if (!APPLY) console.log("  dry run — pass --apply to write");
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bak = `${cfgPath}.bak-p32b-${stamp}`;
fs.copyFileSync(cfgPath, bak);
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(`  wrote ${cfgPath} (backup: ${path.basename(bak)})`);
