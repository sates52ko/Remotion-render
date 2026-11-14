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
// a book still before make-book (2026-10-30: The Art of Strategy, Trust Fall) is measured at the levels it has reached:
// authored / merged; planned is NOT_PLANNED_YET (never 0, never a drop)
const engineOf = (readJSON(path.join(BOOK, "book.json"), {}) || {}).engine;
const NO_CONFIG = !fs.existsSync(path.join(BOOK, "config.antidote.json")) && engineOf === "antidote" && fs.existsSync(path.join(BOOK, "storyboard"));
const cfg = readJSON(path.join(BOOK, "config.antidote.json")) || (NO_CONFIG ? { scenes: [] } : null);
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
// scenes in which a person is still in the END STATE of an earlier deed of the continue chain (this tree's endState.ts)
const bodyState = (() => {
  const set = new Set();
  let ES; try { ES = require(path.join(ROOT, "src", "engines", "antidote", "endState.ts")); } catch { return set; }
  const all = cfg.scenes || [];
  all.forEach((s, i) => {
    if (s.carryState !== true) return;
    for (const who of ids(s)) {
      // the actions since the deed, this scene's last: each must keep the rest (keepsRest), or the state ended
      const since = [(visible(s).find((x) => (x.identity || x.rig) === who) || {}).action];
      for (let j = i - 1; j >= 0; j--) {
        const c = visible(all[j]).find((x) => (x.identity || x.rig) === who);
        const e = c && ES.endStateOf(c.action, visible(all[j]).length === 2);
        if (e && e.posture !== "standing") { if (since.every((a) => ES.keepsRest(e.posture, a || "idle"))) set.add(s); break; }
        if (c) since.push(c.action);
        if (all[j + 1].continueFromPrev !== true) break;
      }
      if (set.has(s)) break;
    }
  });
  return set;
})();
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
  // Antidote 10x (2026-10-26..29). `cap` = how the book's OWN engine code (ROOT/src) shows the capability exists;
  // `hint` = narration words that MAY call for the tool — a lexical pointer for a reviewer, never a verdict.
  ...["refute", "mechanism", "causal", "scorecard"].map((ty) => ({ key: `10x diagram:${ty}`, layer: "10X", tenx: true,
    a: (b) => !!b.diagram && b.diagram.type === ty, e: (s) => !!s.diagram && s.diagram.type === ty, cap: { schema: new RegExp(`export const ${ty}Schema\\b`) },
    hint: { refute: /\b(myth|misconception|(is|was|it's|that's) (entirely |completely |simply )?wrong|not true|the truth is)/i,
      mechanism: /\b(why (it|this|they|we)|the reason (is|why)|average|regress(ion)? to the mean|two (trials|tries|attempts))\b/i,
      causal: /\b(leads? to|triggers?|results? in|causes?|which (then|in turn))\b/i,
      scorecard: /\b(weigh(t|ted|s)?|criteria|score (each|them)|add (it|them) up|rank (them|each))\b/i }[ty] })),
  { key: "10x loop + ledger", layer: "10X", tenx: true, a: (b) => !!b.diagram && b.diagram.type === "causal" && !!(b.diagram.causal || {}).ledger,
    e: (s) => !!s.diagram && s.diagram.type === "causal" && !!(s.diagram.causal || {}).ledger, cap: { schema: /\bledgerBurst\b/ },
    hint: /\b(feedback loop|vicious (circle|cycle)|virtuous (circle|cycle)|cycle|spiral|again and again|every (single )?time|phase (one|two|three|four))\b/i },
  ...["lift", "drink", "leave", "flee", "place"].map((ac) => ({ key: `10x action:${ac}`, layer: "10X", tenx: true,
    a: (b) => b.action === ac, e: (s) => lead(s).action === ac, cap: { action: ac },
    hint: { lift: /\b(picks? (her|him|them) up|carr(y|ies|ied) (her|him|them))\b/i, drink: /\b(drinks?|drank|sips?|swallow(s|ed)?)\b/i,
      leave: /\b(walks? out|storms? out|leaves the|goes upstairs|steps? out)\b/i, flee: /\b(runs? away|flees?|fled|escapes?)\b/i,
      place: /\b(puts? (it|the \w+) down|sets? (it|the \w+) down|lays? (it|the \w+) down)\b/i }[ac] })),
  { key: "10x carried hold (continue + holds)", layer: "10X", tenx: true, a: (b) => b.continue === true && filled(b.holds),
    e: (s) => s.continueFromPrev === true && filled(lead(s).holds), cap: { file: "src/engines/antidote/endState.ts" },
    why: "continue + holds is authorable since 2026-10-19; the carried END STATE (the hold kept across the cut) renders since 2026-10-27 (endState.ts)" },
  // P3 2026-10-29: down / seated / gone / lifted kept across a continued beat. Nothing is authored for it (the author writes
  // continue + a face action); the planner stamps carryState and merge refuses a contradiction since 00733673.
  { key: "10x carried body state", layer: "10X", tenx: true, a: NC, e: (s) => bodyState.has(s), cap: { file: "src/engines/antidote/endState.ts" },
    why: "a carryState scene (the planner stamps it on every authored continue) in which a person is still in the end state of an earlier deed of the chain (down, seated, gone, lifted) — counted with this tree's endState.ts; authored = NOT_CARRIED by design" },
];

// ── capability: does THIS tree's engine have it? (the book's worktree is pinned; its src is what renders) ─────────────
const SCHEMA = (() => { try { return fs.readFileSync(path.join(ROOT, "src", "engines", "antidote", "schema.ts"), "utf8"); } catch { return null; } })();
const ACTIONS = SCHEMA && (SCHEMA.match(/export const charAction = z\.enum\(\[([\s\S]*?)\]\)/) || [])[1];
const capability = (F) => {
  if (!F.cap) return null;
  if (F.cap.file) return fs.existsSync(path.join(ROOT, F.cap.file)) ? "yes" : "no";
  if (!SCHEMA) return NV;
  if (F.cap.schema) return F.cap.schema.test(SCHEMA) ? "yes" : "no";
  if (F.cap.action) return ACTIONS && new RegExp(`"${F.cap.action}"`).test(ACTIONS) ? "yes" : "no";
  return NV;
};

// ── blind evidence: the book's own mute-test runs (item -> judge-key frame -> sample scene id) ─────────────────────────
// A blind verdict on a scene that carries the feature in its config. A still is ONE frame: it can miss the moment.
const MUTE = path.join(ROOT, "audit", "mute", SLUG);
const blindScenes = new Map(); // scene id -> [{run, correctness, contribution, explains}]
if (fs.existsSync(MUTE)) for (const run of fs.readdirSync(MUTE)) {
  const D = path.join(MUTE, run);
  const jr = readJSON(path.join(D, "judge-result.json")), jk = readJSON(path.join(D, "judge-key.json")), sm = readJSON(path.join(D, "sample.json"));
  if (!jr || !jk || !Array.isArray(sm) || !Array.isArray(jr.items)) continue;
  const byFrame = new Map(sm.map((x) => [x.frame, x.id]));
  for (const it of jr.items) {
    const fr = (jk[it.id] || {}).frame, id = byFrame.get(fr), V = it.V || {};
    if (!id) continue;
    if (!blindScenes.has(id)) blindScenes.set(id, []);
    blindScenes.get(id).push({ run, correctness: V.correctness, contribution: V.contribution, explains: V.explains });
  }
}

const safe = (fn) => (...x) => { try { return !!fn(...x); } catch { return false; } };
const authoredList = [...authored.values()];
const rows = FEATURES.map((F) => {
  const r = { feature: F.key, layer: F.layer };
  const has = safe(F.a);
  r.authored = F.a === NC ? NC : authoredFiles.length ? authoredList.filter(has).length : NV;
  r.merged = F.a === NC || F.m === NC ? NC : merged.length ? merged.filter(has).length : NV;
  r.rendered = NV;
  if (NO_CONFIG) r.planned = "NOT_PLANNED_YET";
  else if (F.a === NC) r.planned = scenes.filter(safe(F.e)).length;
  else if (F.c === NC || F.c === NV) r.planned = F.c;
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
  if (F.tenx) {
    r.capability = capability(F);
    // blind: every judged still whose config scene carries the feature (authored or engine-made)
    const v = scenes.filter((s) => safe(F.e)(s) && blindScenes.has(s.id)).flatMap((s) => blindScenes.get(s.id).map((x) => ({ id: s.id, ...x })));
    r.blind = !blindScenes.size ? "NO_MUTE_RUN" : !v.length ? "NOT_SAMPLED"
      : { stills: v.length, correct: v.filter((x) => x.correctness === "CORRECT").length, wrong: v.filter((x) => x.correctness === "WRONG").length,
        adds: v.filter((x) => x.contribution === "ADDS").length, explains: v.filter((x) => x.explains === "YES").length, scenes: [...new Set(v.map((x) => x.id))].slice(0, 12) };
    if (F.hint && merged.length) {
      const pool = merged.filter((b) => F.hint.test(b.narration || "") && !has(b));
      r.hints = { count: pool.length, beats: pool.slice(0, 12).map((b) => b.i) };
    }
  }
  return r;
});
// Was the storyboard written against THIS rules.md? An adopted or re-prepped book can carry authoring that predates
// the rules (and the tools) its engine now has: the features exist, the storyboard never had the chance to use them.
const rulesM = (() => { try { return fs.statSync(path.join(SB, "rules.md")).mtimeMs; } catch { return null; } })();
const authoredM = authoredFiles.length ? Math.max(...authoredFiles.map((x) => x.m)) : null;
const adopted = readJSON(path.join(BOOK, "adopted-from.json"), null);
const authoringVsRules = rulesM == null || authoredM == null ? NV : authoredM < rulesM ? "AUTHORED_BEFORE_RULES" : "AUTHORED_AFTER_RULES";
// P9-B: the authored two-pole proposition travels brief -> _authorship.propositionAuthored (no art.json channel)
const propAuthored = briefList ? briefList.filter((b) => b && b.proposition && b.proposition.src === "author").length : NV;
rows.push({ feature: "proposition (P9-B)", layer: "DIRECTOR", authored: propAuthored, merged: NC,
  planned: scenes.filter((s) => !!(s._authorship || {}).propositionAuthored).length, rendered: NV,
  note: "source is beat-briefs.json src:author (not art.json); scripts/lib/authorship.js authorshipStamp does not return propositionAuthored" });

// Renderer input (P4 2026-10-29): did a production render of THIS config go out? It proves the planned features reached
// the renderer, not that they are visible — "rendered" per feature stays NOT_VERIFIED.
const renderedInput = (() => {
  let rp; try { rp = require("./lib/render-preflight"); } catch { return NV; }
  const h = rp.inputHashOf(path.join(BOOK, "config.antidote.json"));
  const runs = ((readJSON(path.join(BOOK, "render-facts.json"), {}) || {}).runs) || [];
  const go = runs.filter((r) => r.kind === "preflight" && r.mode === "production" && r.decision && r.decision.ok);
  const split = [`.render-github-split.${SLUG}.json`, ".render-github-split.json"].map((f) => readJSON(path.join(ROOT, f))).find((x) => x && x.slug === SLUG);
  if (go.some((r) => r.renderInputHash === h)) return split ? "DISPATCHED_THIS_CONFIG" : "PREFLIGHT_GO_THIS_CONFIG";
  return go.length ? "RENDERED_OTHER_CONFIG" : "NO_PRODUCTION_RENDER";
})();
const result = { slug: SLUG, created: new Date().toISOString(), reportOnly: true,
  note: "Beats per feature per stage. NOT_VERIFIED = cannot be counted from the files; NOT_CARRIED = the stage never receives the field. Zero use is not a defect.",
  sources: { authoredFiles: authoredFiles.map((x) => x.f), authoredBeats: authored.size, mergedBeats: merged.length, plannedScenes: scenes.length },
  // three evidence levels, never merged: capability (the engine has it) / adoption (authored -> merged -> planned) /
  // blind (a judged still of a scene that carries it). Hints are lexical pointers, not missed-feature verdicts.
  levels: { capability: "features[].capability", adoption: "features[].authored/merged/planned", verified: "features[].blind" },
  authoringVsRules, renderedInput, adoptedFrom: adopted ? { at: adopted.at, reason: adopted.reason } : null,
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
const tenx = rows.filter((r) => r.capability !== undefined);
if (tenx.length) {
  console.log(`\n── Antidote 10x adoption · three levels, never merged (capability = this tree's engine has it; adoption = authored/merged/planned; verified = blind mute verdicts on scenes that carry it)`);
  console.log(`${pad("feature", 36)} ${pad("capability", 11)} ${pad("authored", 9)} ${pad("merged", 7)} ${pad("planned", 8)} ${pad("verified (blind stills)", 34)} hints (lexical, unverified)`);
  const bl = (b) => typeof b === "string" ? b : `${b.stills} stills: CORRECT ${b.correct}, WRONG ${b.wrong}, ADDS ${b.adds}, EXPL ${b.explains}`;
  for (const r of tenx) console.log(`${pad(r.feature, 36)} ${pad(r.capability, 11)} ${pad(r.authored, 9)} ${pad(r.merged, 7)} ${pad(r.planned, 8)} ${pad(bl(r.blind), 34)} ${r.hints ? `${r.hints.count}${r.hints.count ? ` (i ${r.hints.beats.join(",")}${r.hints.count > r.hints.beats.length ? ",…" : ""})` : ""}` : "-"}`);
  console.log(`renderer input: ${renderedInput} (a render of this config proves the planned features reached the renderer, not that they are visible)`);
  if (authoringVsRules === "AUTHORED_BEFORE_RULES") console.log(`⚠ the storyboard is older than storyboard/rules.md${adopted ? ` (adopted ${String(adopted.at).slice(0, 10)})` : ""}: it was not authored against the current rules — a feature this engine has could not be chosen. Re-author the passages the hints point to if they fit (never to use a tool).`);
}
console.log(`\n✓ ${file}`);
