#!/usr/bin/env node
/**
 * p9b-goldset.js — P9-B.2a: DETECTOR GOLD-SET (the precision proof).
 *
 * The detector (`lib/proposition.js detectProposition`) decides which beats
 * carry a TWO-POLE proposition. Before anything hardens (the P9-B.3 UNSTAGED
 * flip), its precision must be MEASURED against hand labels, not asserted.
 *
 * This harness runs the detector EXACTLY as production runs it — the same
 * said-window (captions overlapping the beat's frames, joined with spaces),
 * the same castIndex (story-bible cast → name tokens) as plan-briefs
 * deriveBriefs — then takes a deterministic stratified sample:
 *
 *   positives (detector found a two-pole proposition)  → precision evidence
 *   negatives (detector returned null)                 → missed-proposition evidence
 *
 * Labels live in audit/visionless-10x/p9b-goldset-labels.json (hand-written,
 * keyed by beat index):
 *   { "12": { "cls": "two-pole|one-pole|none", "relation": "...", "note": "...", "borderline": false } }
 *
 *   two-pole — the beat's words genuinely state a two-sided relation and the
 *              detected pole pair captures those two sides (wording may be rough;
 *              the PAIR is what staging needs)
 *   one-pole — a real topic/claim, but only one side (a topic, not a proposition)
 *   none     — no claim at all (scene-setting, action, texture)
 *
 * Usage:
 *   node scripts/p9b-goldset.js                     # extract + sample (writes the sample file)
 *   node scripts/p9b-goldset.js --score             # score sample against the labels
 *   node scripts/p9b-goldset.js --pos=60 --neg=40 --seed=20261007
 *
 * P9-B.2b: --score re-detects EVERY sampled beat with the CURRENT detector
 * before scoring (the sample file's stored `detected` field stays frozen as
 * the run-7 record). The narration, the sample membership and the labels are
 * frozen; only the detector under test moves — that is what makes this a
 * precision REPAIR harness rather than a one-off benchmark.
 *
 * REPORT-ONLY: the measured precision informs the P9-B.3 flip; nothing here
 * changes a gate (the GATE_POLICY flip stays an explicit operator decision).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SLUG = "into-the-wild";
const OUT = path.join(ROOT, "audit", "visionless-10x", "p9b-goldset.json");
const LABELS = path.join(ROOT, "audit", "visionless-10x", "p9b-goldset-labels.json");
const REPORT = path.join(ROOT, "audit", "visionless-10x", "p9b-goldset-report.json");
const { detectProposition } = require(path.join(ROOT, "scripts", "lib", "proposition.js"));

const args = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([a-z-]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] === undefined ? true : m[2]; }
const POS_N = parseInt(args.pos || "60", 10);
const NEG_N = parseInt(args.neg || "40", 10);
const SEED = parseInt(args.seed || "20261007", 10);

/** mulberry32 — tiny deterministic PRNG (the sample must be reproducible). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

/** MUST match plan-briefs.js castIndex() — token set per cast member. */
function castIndex(bible) {
  const idx = [];
  for (const [key, c] of Object.entries(bible.cast || {})) {
    const toks = new Set();
    for (const src of [c.name, ...(c.aliases || [])]) {
      String(src).toLowerCase().split(/[^a-z0-9']+/).forEach((t) => {
        if (t.length > 2 && !["mr", "mrs", "dr", "the"].includes(t)) toks.add(t);
      });
    }
    idx.push({ key, entry: c, tokens: toks });
  }
  return idx;
}

function extract() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "books", SLUG, "config.vox.json"), "utf8"));
  const bibleP = path.join(ROOT, "books", SLUG, "story-bible.json");
  const bible = fs.existsSync(bibleP) ? JSON.parse(fs.readFileSync(bibleP, "utf8")) : { cast: {} };
  const cast = castIndex(bible);
  const W = [];
  for (const cap of cfg.captions || []) for (const w of cap.words || []) W.push({ w: String(w.w || ""), s: w.s, e: w.e });

  const beats = (cfg.beats || []).map((u, i) => {
    const from = u.fromFrame || 0, to = from + (u.durationFrames || 0);
    const said = W.filter((w) => w.e > from && w.s < to).map((w) => w.w).join(" ");
    return { i, id: u.id, from, dur: u.durationFrames || 0, narration: said, detected: detectProposition(said, { castIndex: cast }) };
  });
  return { cfg, beats };
}

function sample(beats) {
  const pos = beats.filter((b) => b.detected);
  const neg = beats.filter((b) => !b.detected);
  const rnd = mulberry32(SEED);
  // stratify positives by detected relation (proportional allocation)
  const byRel = {};
  for (const b of pos) (byRel[b.detected.relation] = byRel[b.detected.relation] || []).push(b);
  const take = [];
  let remaining = POS_N;
  const rels = Object.keys(byRel).sort();
  for (const [k, rel] of rels.entries()) {
    const share = k === rels.length - 1 ? remaining : Math.round(POS_N * (byRel[rel].length / pos.length));
    const n = Math.min(byRel[rel].length, Math.max(1, share));
    take.push(...shuffle([...byRel[rel]], rnd).slice(0, n));
    remaining -= n;
  }
  const posSample = take.sort((a, b) => a.i - b.i);
  const negSample = shuffle([...neg], rnd).slice(0, NEG_N).sort((a, b) => a.i - b.i);
  return { posTotal: pos.length, negTotal: neg.length, posSample, negSample };
}

function writeSample({ beats, posTotal, negTotal, posSample, negSample }) {
  const doc = {
    what: "P9-B.2a detector gold-set sample (into-the-wild; production said-window + castIndex)",
    seed: SEED, sampleSizes: { pos: posSample.length, neg: negSample.length },
    population: { beats: beats.length, detectorPositive: posTotal, detectorNegative: negTotal },
    labeling: {
      cls: "two-pole | one-pole | none — see the header comment",
      rule: "two-pole = the words genuinely state a two-sided relation AND the detected pair captures the two sides; borderline = honest disagreement about the wording, not about the two-sideness",
    },
    sample: [...posSample.map((b) => ({ ...b, kind: "positive" })), ...negSample.map((b) => ({ ...b, kind: "negative" }))],
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
  console.log(`population: ${beats.length} beats — detector positive ${posTotal} (${((posTotal / beats.length) * 100).toFixed(1)}%), negative ${negTotal}`);
  console.log(`sample: ${posSample.length} positives + ${negSample.length} negatives → ${path.relative(ROOT, OUT)}`);
  for (const b of doc.sample) {
    console.log(`\n#${b.i} [${b.kind}${b.detected ? ":" + b.detected.relation : ""}] ${b.narration}`);
    if (b.detected) console.log(`   poles: ${b.detected.poles.map((p) => `${p.status === "rejected" ? "✗" : "✓"}"${p.text}"${p.entity ? "@" + p.entity : ""}`).join("  vs  ")}`);
  }
}

function score() {
  const doc = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const labels = JSON.parse(fs.readFileSync(LABELS, "utf8"));
  const missing = doc.sample.filter((b) => !labels[b.i]);
  if (missing.length) { console.error(`✗ ${missing.length} sampled beats unlabeled (e.g. #${missing.slice(0, 5).map((b) => b.i).join(", #")}) — fill ${path.relative(ROOT, LABELS)} first`); process.exit(1); }

  // P9-B.2b: score against the CURRENT detector, not the frozen run-7 record.
  const bibleP = path.join(ROOT, "books", SLUG, "story-bible.json");
  const cast = fs.existsSync(bibleP) ? castIndex(JSON.parse(fs.readFileSync(bibleP, "utf8"))) : [];
  for (const b of doc.sample) b.detected = detectProposition(b.narration, { castIndex: cast });

  let TP = 0, FP = 0, borderline = 0, FNS = 0; const perRel = {};
  const negatives = doc.sample.filter((b) => b.kind === "negative");
  let FN = 0, TN = 0; const fnList = [], fpList = [], droppedList = [], recoveredList = [];
  for (const b of doc.sample) {
    const g = labels[b.i];
    const rel = b.detected ? b.detected.relation : (b.detected0 ? b.detected0.relation : null); // dropped positives bucket under their original relation
    if (b.kind === "positive") {
      if (!b.detected) {
        // the repaired detector no longer fires here — a sampled positive that
        // became a miss counts against RECALL; if the gold never wanted it, the
        // drop is a precision WIN recorded in droppedList
        if (g.cls === "two-pole") {
          FN++; if (!g.borderline) FNS++;
          perRel[rel] = perRel[rel] || { n: 0, tp: 0, fp: 0, borderline: 0, fn: 0 };
          perRel[rel].fn++;
          fnList.push({ i: b.i, narration: b.narration, gold: g, dropped: true, borderline: !!g.borderline });
          droppedList.push(b.i);
        } else {
          droppedList.push(b.i);
        }
        continue;
      }
      perRel[rel] = perRel[rel] || { n: 0, tp: 0, fp: 0, borderline: 0, fn: 0 };
      perRel[rel].n++;
      if (g.cls === "two-pole") {
        if (g.borderline) { borderline++; perRel[rel].borderline++; } else { TP++; perRel[rel].tp++; }
      } else { FP++; perRel[rel].fp++; fpList.push({ i: b.i, narration: b.narration, detected: b.detected, gold: g }); }
    } else {
      perRel[rel] = perRel[rel] || { n: 0, tp: 0, fp: 0, borderline: 0, fn: 0 };
      if (g.cls === "two-pole") {
        if (b.detected) {
          // RECOVERED: a negative the repaired detector now fires on, and the
          // gold agrees it is two-pole — a recall gain, not a miss
          if (!g.borderline) recoveredList.push({ i: b.i, narration: b.narration, detected: b.detected, gold: g });
          perRel[rel].n++;
        } else {
          FN++; if (!g.borderline) FNS++; perRel[rel].fn++;
          fnList.push({ i: b.i, narration: b.narration, gold: g, detected: null, borderline: !!g.borderline });
        }
      } else if (!b.detected) TN++;
      else { // a negative that STILL fires with a repaired detector is a live FP
        FP++; perRel[rel].n++; perRel[rel].fp++; fpList.push({ i: b.i, narration: b.narration, detected: b.detected, gold: g, wasNegative: true }); }
    }
  }
  const posN = TP + FP + borderline, negN = negatives.length;
  // Extrapolate the sampled rates to the FROZEN run-7 population denominators;
  // RECOVERED negatives (the repaired detector now fires, gold two-pole) join
  // the TP side at the negative-population scale. An estimate, not a census.
  const posScale = doc.population.detectorPositive / Math.max(1, posN);
  const negScale = doc.population.detectorNegative / Math.max(1, negN);
  const recoveredStrict = recoveredList.length;
  const recoveredAll = recoveredStrict + negatives.filter((b) => b.detected && labels[b.i].cls === "two-pole" && labels[b.i].borderline).length;
  const tpEst = Math.round(TP * posScale + recoveredStrict * negScale);
  const fnEst = Math.round(FNS * negScale);
  const recallEst = tpEst + fnEst ? tpEst / (tpEst + fnEst) : null;
  const tpwEst = Math.round((TP + borderline) * posScale + recoveredAll * negScale);
  const fnwEst = Math.round(FN * negScale);
  const recallWideEst = tpwEst + fnwEst ? tpwEst / (tpwEst + fnwEst) : null;

  const precision = TP + FP ? TP / (TP + FP) : null;
  const precisionWide = TP + FP + borderline ? (TP + borderline) / (TP + FP + borderline) : null;
  const report = {
    what: "P9-B.2b detector precision REPAIR — scored against the CURRENT detector (P9-B.2a run-7 sample + labels frozen); report-only, the P9-B.3 UNSTAGED flip needs the OPERATOR gate",
    slug: SLUG, seed: SEED,
    population: doc.population,
    sample: { positives: posN, negatives: negN },
    precision: {
      strict: precision, strict_pct: precision == null ? null : Math.round(precision * 1000) / 10,
      borderlineCount: borderline,
      withBorderline: precisionWide, withBorderline_pct: precisionWide == null ? null : Math.round(precisionWide * 1000) / 10,
      definition: "of the beats the detector marked two-pole, the share whose words genuinely state the detected two sides (wording may be rough)",
    },
    recall_extrapolated: {
      fnInNegSample: FN, fnStrictInNegSample: FNS, tnInNegSample: TN,
      recoveredInNegSample: recoveredList.length,
      droppedPositives: droppedList,
      tpEstimate: tpEst, fnEstimate: fnEst,
      value: recallEst, pct: recallEst == null ? null : Math.round(recallEst * 1000) / 10,
      wide: { tpEstimate: tpwEst, fnEstimate: fnwEst, value: recallWideEst, pct: recallWideEst == null ? null : Math.round(recallWideEst * 1000) / 10 },
      note: "missed-proposition rate from the negative sample, scaled to the frozen negative population — an estimate; 'wide' counts borderline misses; RECOVERED negatives (repaired detector now fires) join the TP side",
    },
    perRelation: perRel,
    falsePositives: fpList,
    falseNegatives: fnList,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`\nDETECTOR PRECISION (itw, sample ${posN} pos / ${negN} neg):`);
  console.log(`  strict          : ${report.precision.strict_pct}%  (TP ${TP} / FP ${FP})`);
  console.log(`  incl. borderline: ${report.precision.withBorderline_pct}%  (${borderline} borderline)`);
  console.log(`  recall (extrap.): strict ${report.recall_extrapolated.pct}% / wide ${report.recall_extrapolated.wide.pct}%  (FN ${FN}/${negN} in the negative sample, ${FNS} strict)`);
  for (const [rel, r] of Object.entries(perRel)) console.log(`    ${rel.padEnd(13)} n=${String(r.n).padStart(3)}  tp=${r.tp}  fp=${r.fp}  fn=${r.fn || 0}  borderline=${r.borderline}`);
  if (fpList.length) { console.log("  FALSE POSITIVES:"); for (const f of fpList) console.log(`    #${f.i} [${f.gold.cls}] "${f.narration.slice(0, 110)}" → ${f.detected.relation}: ${f.detected.poles.map((p) => p.status[0] + ":" + p.text).join(" | ")}  (${f.gold.note || ""})`); }
  if (fnList.length) { console.log("  MISSED (negatives that DO carry a two-pole proposition):"); for (const f of fnList) console.log(`    #${f.i} "${f.narration.slice(0, 110)}"  (${f.gold.note || ""})`); }
  console.log(`\nreport → ${path.relative(ROOT, REPORT)}`);
}

if (args.score) score();
else { const { beats } = extract(); const s = sample(beats); writeSample({ beats, ...s }); }
