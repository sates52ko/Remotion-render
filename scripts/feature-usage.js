#!/usr/bin/env node
/**
 * feature-usage.js — which authoring features did THIS book actually use, and how far did each travel?
 * REPORT-ONLY: reads books/<slug>/, never edits anything, never blocks, exit 0 whatever it finds.
 *
 *   node scripts/feature-usage.js --slug=<slug> [--root=<tree with books/>] [--out=<dir>] [--json]
 *   -> a table on stdout + <out|root/audit/feature-usage/<slug>>/<stamp>.json
 *
 * Per feature, the beats that carry it at each stage, counted apart (never merged into one number):
 *   authored  storyboard/authored-*.json (what the authors wrote; the latest file wins per beat i)
 *   merged    art.json (what storyboard.js merge kept)
 *   planned   config.antidote.json (what plan-antidote put in the scene the renderer reads)
 *   rendered  NOT_VERIFIED for every feature: nothing records what reached the pixels. A blind verdict on a
 *             beat proves a frame exists, not that the feature is visible in it.
 * A stage that cannot be counted is NOT_VERIFIED; a stage the field never reaches by design is NOT_CARRIED.
 * Neither is 0. "dropped" lists merged beats with the feature whose scene lacks it in the config.
 * Zero use is NOT a defect: a book may not need an embrace. The report says what was used, nothing more.
 *
 * Why (2026-10-21 five-layer review): features were built, tested and wired, but nothing showed whether a
 * new book used them — continue was 0 in philosophy and burn, take/embrace 0 in every new book.
 */
const fs = require("fs");
const path = require("path");
const { capacityProblem } = require("./lib/diagram-capacity");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const ROOT = path.resolve(args.root || path.join(__dirname, ".."));
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/feature-usage.js --slug=<slug> [--root=<dir>] [--out=<dir>] [--json]"); process.exit(1); }
const BOOK = path.join(ROOT, "books", SLUG);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const cfg = readJSON(path.join(BOOK, "config.antidote.json"));
if (!cfg) { console.log(`feature-usage: ${SLUG} has no config.antidote.json (Antidote only) — nothing to report`); process.exit(0); }
const NV = "NOT_VERIFIED", NC = "NOT_CARRIED";

// ── stages ──────────────────────────────────────────────────────────────────
const SB = path.join(BOOK, "storyboard");
const authoredFiles = fs.existsSync(SB) ? fs.readdirSync(SB).filter((f) => /^authored-.*\.json$/.test(f))
  .map((f) => ({ f, m: fs.statSync(path.join(SB, f)).mtimeMs })).sort((a, b) => a.m - b.m) : [];
const authored = new Map();
for (const { f } of authoredFiles) {
  const j = readJSON(path.join(SB, f));
  const list = Array.isArray(j) ? j : (j && Array.isArray(j.beats) ? j.beats : []);
  list.forEach((a) => { if (a && a.i != null) authored.set(a.i, a); });
}
const art = readJSON(path.join(BOOK, "art.json"), {}) || {};
const merged = Array.isArray(art.beats) ? art.beats : [];
const isContent = (s) => s.id !== "intro" && s.type !== "title" && s.shot !== "chapterCard";
const scenes = (cfg.scenes || []).filter(isContent);
const head = (t) => String(t || "").slice(0, 40);
const sceneByHead = new Map((cfg.scenes || []).map((s) => [head(s._narration), s]));
const sceneFor = (b) => sceneByHead.get(head(b.narration)) || null;
const briefs = readJSON(path.join(BOOK, "beat-briefs.json"), null);
const briefList = Array.isArray(briefs) ? briefs : (briefs && Array.isArray(briefs.briefs) ? briefs.briefs : briefs && Array.isArray(briefs.beats) ? briefs.beats : null);
const own = new Set(Object.keys(readJSON(path.join(BOOK, "motifs.json"), {}) || {}));

const visible = (s) => (s.characters || []).filter((c) => !c.silhouette);
const lead = (s) => visible(s)[0] || {};
const lock = (s) => ((s._authorship || {}).lock) || {};
const filled = (x) => typeof x === "string" ? x.trim().length > 0 : x != null;

// each feature: a = beat test (authored, merged); c(b, s) = the merged beat's decision is in its config scene
// (planned); e = the config marker on its own, for counting scenes the ENGINE produced without the author.
// "NC" = the stage never carries the field; NV = it cannot be counted from the files.
const ids = (s) => visible(s).map((c) => c.identity || c.rig);
const FEATURES = [
  { key: "continue", layer: "TIMELINE", a: (b) => b.continue === true, e: (s) => s.continueFromPrev === true },
  { key: "conceptMotion", layer: "TIMELINE", a: (b) => filled(b.conceptMotion), c: (b, s) => (s.props || []).some((x) => x && x.motion === b.conceptMotion), e: (s) => (s.props || []).some((x) => x && x.motion) },
  { key: "conceptMotionCue", layer: "TIMELINE", a: (b) => filled(b.conceptMotionCue), c: NV, why: "the cue resolution (word-timed vs fallback) is not recorded in the config" },
  { key: "action:take", layer: "TIMELINE", a: (b) => b.action === "take", e: (s) => lead(s).action === "take" },
  { key: "action:embrace", layer: "TIMELINE", a: (b) => b.action === "embrace", e: (s) => lead(s).action === "embrace" },
  { key: "actionCue", layer: "TIMELINE", a: (b) => filled(b.actionCue), e: (s) => lead(s).actionAt != null },
  { key: "partnerExpression", layer: "TIMELINE", a: (b) => filled(b.partnerExpression), c: (b, s) => (visible(s)[1] || {}).expression === b.partnerExpression },
  { key: "partnerAction", layer: "TIMELINE", a: (b) => filled(b.partnerAction), c: (b, s) => (visible(s)[1] || {}).action === b.partnerAction },
  { key: "cast:[] (nobody)", layer: "TIMELINE", a: (b) => Array.isArray(b.cast) && !b.cast.length, e: (s) => !visible(s).length },
  // a diagram fills the frame and shows nobody by design (merge now refuses cast on a diagram beat; older books carry it)
  { key: "cast (named)", layer: "TIMELINE", a: (b) => Array.isArray(b.cast) && b.cast.length > 0, c: (b, s) => !!s.diagram || b.cast.every((c) => ids(s).includes(c)) },
  { key: "set", layer: "REFERENCE", a: (b) => filled(b.set), c: (b, s) => (s.bg || {}).set === b.set },
  { key: "concept (icon)", layer: "REFERENCE", a: (b) => filled(b.concept), c: (b, s) => s.concept === b.concept },
  { key: "own icon (motifs.json)", layer: "REFERENCE", a: (b) => own.has(b.concept), c: (b, s) => s.concept === b.concept && (s.props || []).some((x) => x && x.type === "customSvg") },
  { key: "diagram", layer: "DIRECTOR", a: (b) => !!b.diagram, e: (s) => !!s.diagram },
  // labels the renderer never draws (lib/diagram-capacity.js); merge refuses them since 2026-10-23, older books keep them
  { key: "diagram labels undrawn", layer: "DIRECTOR", a: (b) => !!b.diagram && !!capacityProblem(b.diagram.type, b.diagram.labels), c: (b, s) => !!s.diagram && !!capacityProblem(s.diagram.type, s.diagram.labels), e: (s) => !!s.diagram && !!capacityProblem(s.diagram.type, s.diagram.labels), why: "a count, not a carry: 'planned' = the config scene still holds the undrawn labels" },
  { key: "shotOverride", layer: "DIRECTOR", a: (b) => filled(b.shotOverride), c: (b, s) => s.shot === b.shotOverride },
  { key: "stageRelationship", layer: "DIRECTOR", a: (b) => b.stageRelationship === true, e: (s) => !!s.relationshipStaging },
  { key: "explainedBy", layer: "DIRECTOR", a: (b) => filled(b.explainedBy), m: NC, c: NC, why: "storyboard.js merge does not copy explainedBy into art.json" },
  { key: "noVisual", layer: "DIRECTOR", a: (b) => filled(b.noVisual), m: NC, c: NC, why: "storyboard.js merge does not copy noVisual into art.json" },
  { key: "storyboard.claim", layer: "DIRECTOR", a: (b) => filled((b.storyboard || {}).claim), c: NC, why: "plan-antidote does not copy the authored claim into the scene" },
];

const safe = (fn) => (...x) => { try { return !!fn(...x); } catch { return false; } };
const authoredList = [...authored.values()];
const rows = FEATURES.map((F) => {
  const r = { feature: F.key, layer: F.layer };
  const has = safe(F.a);
  r.authored = authoredFiles.length ? authoredList.filter(has).length : NV;
  r.merged = F.m === NC ? NC : merged.length ? merged.filter(has).length : NV;
  r.rendered = NV;
  if (F.c === NC || F.c === NV) r.planned = F.c;
  else if (!merged.length) r.planned = NV;
  else {
    const carried = safe(F.c || ((b, s) => F.e(s)));
    // the title/intro scene carries no authored staging: not counted either way
    const all = merged.filter(has).map((b) => ({ b, s: sceneFor(b) }));
    const pairs = all.filter((x) => !x.s || isContent(x.s));
    if (all.length > pairs.length) r.skippedTitle = all.length - pairs.length;
    const drop = pairs.filter((x) => !x.s || !carried(x.b, x.s));
    r.planned = pairs.length - drop.length;
    r.dropped = drop.length;
    r.droppedBeats = drop.slice(0, 12).map((x) => x.b.i);
    if (F.e) {
      const authoredScenes = new Set(pairs.map((x) => x.s).filter(Boolean));
      r.engineOnly = scenes.filter((s) => safe(F.e)(s) && !authoredScenes.has(s)).length;
    }
  }
  if (F.why) r.note = F.why;
  return r;
});
// P9-B: the authored two-pole proposition travels brief -> _authorship.propositionAuthored (no art.json channel)
const propAuthored = briefList ? briefList.filter((b) => b && b.proposition && b.proposition.src === "author").length : NV;
rows.push({ feature: "proposition (P9-B)", layer: "DIRECTOR", authored: propAuthored, merged: NC,
  planned: scenes.filter((s) => !!(s._authorship || {}).propositionAuthored).length, rendered: NV,
  note: "source is beat-briefs.json src:author (not art.json); scripts/lib/authorship.js authorshipStamp does not return propositionAuthored" });

const result = { slug: SLUG, created: new Date().toISOString(), reportOnly: true,
  note: "Beats per feature per stage. NOT_VERIFIED = cannot be counted from the files; NOT_CARRIED = the stage never receives the field. Zero use is not a defect.",
  sources: { authoredFiles: authoredFiles.map((x) => x.f), authoredBeats: authored.size, mergedBeats: merged.length, plannedScenes: scenes.length },
  features: rows };
const outDir = path.resolve(args.out || path.join(ROOT, "audit", "feature-usage", SLUG));
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `${result.created.replace(/[:.]/g, "-").slice(0, 19)}.json`);
fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }

const pad = (x, n) => String(x).padEnd(n);
console.log(`── feature usage · ${SLUG} · authored ${authored.size} / merged ${merged.length} / planned ${scenes.length} beats — REPORT-ONLY (0 use is not a defect)`);
console.log(`${pad("feature", 24)} ${pad("layer", 9)} ${pad("authored", 13)} ${pad("merged", 13)} ${pad("planned", 13)} ${pad("rendered", 13)} ${pad("engine-only", 12)} dropped merged->planned`);
console.log("(planned = merged beats whose decision is in their config scene; engine-only = config scenes with the marker that no beat authored)");
for (const r of rows) console.log(`${pad(r.feature, 24)} ${pad(r.layer, 9)} ${pad(r.authored, 13)} ${pad(r.merged, 13)} ${pad(r.planned, 13)} ${pad(r.rendered, 13)} ${pad(r.engineOnly == null ? "-" : r.engineOnly, 12)} ${r.dropped == null ? "-" : r.dropped + (r.dropped ? ` (i ${r.droppedBeats.join(",")}${r.dropped > r.droppedBeats.length ? ",…" : ""})` : "")}`);
console.log(`\n✓ ${file}`);
