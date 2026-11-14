#!/usr/bin/env node
/**
 * cause-ledger.js — who owns each blind failure? ADVISORY, report-only: it never edits art.json/config,
 * never changes a mute-test number and is not a verdict. It reads every judged mute run and framecheck run
 * of a book, maps each WRONG and each dead (contribution NONE) item to its scene in
 * books/<slug>/config.antidote.json and names the OWNER with a transparent rule:
 *
 *   ENGINE      the drawing/planner did it — twin cast (duplicate identity), silhouette, staging changed
 *               after the lock, an authored icon not rendered, a face read as another mood than configured,
 *               an engine-chosen cast/shot the judge objects to.             -> AGENT_LOG `for-review`
 *   VOCABULARY  no icon for the narration's subject: a generic icon used, or an icon whose drawing reads
 *               as another meaning.                                          -> AGENT_LOG `for-review`
 *   AUTHORING   the author's choice — bare figure, rejected premise as the callout, strike on what the
 *               narration affirms, a configured face mood that fights the narration, wrong subject.
 *               Each AUTHORING row lists the beats sharing its staging (similar-candidates tiers A/B) as
 *               REVIEW candidates. Fix a class only when confirmed (STORYBOARD_RUNBOOK §4).
 *   RATER       the judge's 'why' contradicts its own inputs (a face word the blind description does not
 *               have, duplicates the description does not mention, "no X" while the description has X,
 *               a narration that does not belong to the frame's beat).       -> noted, never fixed
 *
 * Why (30 books / 51 fix rounds): 23 rounds made the mute test worse; ~46% of WRONG were engine-owned and
 * ~13% rater errors, so storyboard rounds chased engine bugs and noise.
 *
 *   node scripts/cause-ledger.js --slug=<slug> [--source=mute|framecheck|both] [--labels=run3,fc1]
 *        [--root=<tree with books/ data/>] [--audit-root=<tree with audit/>] [--out=<dir>] [--top=25]
 *   -> <out|root/audit/cause-ledger/<slug>>/<stamp>.json + a table on stdout
 * Manual overrides win: books/<slug>/cause-overrides.json  { "<run>/<scene>": { "owner": "...", "why": "..." } }
 * (<run> is "mute/run3" or "framecheck/fc1"; a bare "run3/scene-12" also matches.)
 *
 * Confidence: high = a direct signal in the frame description or the config; medium = a rule with a known
 * failure mode; low = the fallback. Rules that read the CURRENT config lose one step on a run older than
 * art.json (the scene may have been re-authored since); rules that read the blind description do not.
 *
 * --sweep (2026-10-21, REPORT-ONLY): the config-only rules on EVERY beat, before any blind run — where does
 * the config differ from the authored art.json (drift), show an engine symptom (twin cast, silhouette), or
 * leave a choice to the engine (risk, not a defect)? All matching classes per beat, not first-wins. When
 * judged runs exist it measures itself on their labels, kept apart: catch rate on labelled failures,
 * false-positive rate on labelled clean beats, and the flagged beats no blind run has seen ("new" — a lead
 * for framecheck --beats, never counted as an error). Writes <out|audit/cause-ledger-sweep/<slug>>/<stamp>.json
 * (its own folder: preview-ready's ledger freshness check reads audit/cause-ledger/ and must not see it).
 *   node scripts/cause-ledger.js --slug=<slug> --sweep [--root=] [--audit-root=] [--out=<dir>]
 */
const fs = require("fs");
const path = require("path");
const { signature, tier, describeSig, FACE_CLASS, faceClassesIn } = require("./lib/staging-signature");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const ROOT = path.resolve(args.root || process.env.CAUSE_LEDGER_ROOT || path.join(__dirname, ".."));
const AUDIT = path.resolve(args["audit-root"] || ROOT);
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/cause-ledger.js --slug=<slug> [--source=mute|framecheck|both] [--labels=a,b] [--root=<dir>] [--audit-root=<dir>] [--out=<dir>] [--top=25]"); process.exit(1); }
const SOURCE = args.source || "both";
const TOP = parseInt(args.top || "25", 10);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const BOOK = path.join(ROOT, "books", SLUG);
const cfg = readJSON(path.join(BOOK, "config.antidote.json"));
if (!cfg) { console.error(`❌ no Antidote config: ${path.join(BOOK, "config.antidote.json")}`); process.exit(1); }
const scenes = cfg.scenes || [];
const sceneAt = (f) => scenes.find((s) => f >= s.fromFrame && f < s.fromFrame + s.durationFrames);
const art = readJSON(path.join(BOOK, "art.json"), {}) || {};
const beats = art.beats || [];
const overrides = readJSON(path.join(BOOK, "cause-overrides.json"), {}) || {};
// code-owned data: the --root tree's data/ when it has one, else this checkout's (an archive tree may carry only books/ + audit/)
const dataFile = (n) => [path.join(ROOT, "data", n), path.join(__dirname, "..", "data", n)].find((p) => fs.existsSync(p));
const readings = (readJSON(dataFile("icon-readings.json"), {}) || {}).icons || {};
const generic = new Set((readJSON(dataFile("shared-generic-motifs.json"), {}) || {}).motifs || []);
const vocab = readJSON(path.join(BOOK, "storyboard", "vocab.json"), null);
const vocabIcons = new Set(vocab && vocab.icons ? vocab.icons : [...generic, ...Object.keys(readJSON(path.join(BOOK, "motifs.json"), {}) || {})]);

// ── text helpers ────────────────────────────────────────────────────────────
const STOP = new Set("the a an and or but of to in on at for with from by is are was were be been it its this that these those he she they his her their him them you your we our i me my not no so as just like really very what which who when how than then there here do does did have has had can will would could should into out up about over also only even all any some one two".split(" "));
const words = (t) => String(t || "").toLowerCase().match(/[a-z][a-z']+/g) || [];
const content = (t) => words(t).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w) => w.replace(/'s$/, "").replace(/(ing|ed|es|s)$/, "");
const overlap = (a, b) => { const A = new Set(content(a).map(stem)), B = new Set(content(b).map(stem)); if (!A.size || !B.size) return null; let n = 0; A.forEach((x) => { if (B.has(x)) n++; }); return n / Math.min(A.size, B.size); };
const DUP = /\b(identical|duplicates?|twins?|clones?|copies)\b|\btwo (nearly |almost )?(identical|same|similar)\b/i;
const SIL = /\bsilhouett\w*\b/i;
const PERSON_ID = /\b(suit(ed)?|businessman|modern|no horns|wrong (person|character|figure)|not (a |the )?(her|him|woman|man|she|he|queen|king|child))\b/i;
const CROP = /\b(cropped|cut off|barely visible|partly visible|off[- ]screen|too small)\b/i;
const MISREAD = /\b(suggests?|reads? as|implies|looks like|evokes|signals?)\b/i;
const ABSENT = /\b(no|not|nothing|without|generic|unrelated|vague\w*|unclear|ambiguous)\b/i;
const REJECT = /\b(reject\w*|denie[sd]|what the narration (says is|dismisses)|emphasi[sz]es what)\b/i;
const STRIKE = /\b(strike|struck|crossed[- ]out|cross(ed)? through)\b/i;
const NEG = /\b(not|isn't|isnt|aren't|never|no|nor|without|wasn't|doesn't|don't)\b/i;
// What a describer calls each vocabulary icon when it is visible (used only for "icon not visible"; an icon
// missing from this table is never flagged).
const ICON_WORDS = { crash: "crash|wreck|collision|car", ledge: "ledge|cliff|edge", water: "water|wave|sea|river|drop", grave: "grave|tomb|headstone",
  medical: "medical|pill|kit|syringe|cross", notes: "note|notepad|paper|card|sticky|file|document|page|list", phone: "phone|smartphone|device|cellphone|screen",
  home: "house|home|roof", road: "road|path|street", storm: "storm|cloud|lightning|rain", star: "star", heart: "heart", fire: "fire|flame|blaze",
  tree: "tree|canopy|trunk", mask: "mask", mirror: "mirror|magnif|glass", key: "key", law: "law|gavel|scale|pillar|column|courthouse",
  photo: "photo|picture|frame|portrait", war: "shield|spear|sword|war", game: "trophy|cup|game|chess|board|dice", city: "city|building|skyline",
  food: "food|plate|bowl|meal", coin: "coin|money|dollar|gold", door: "door", lightbulb: "bulb|lamp", puppeteer: "puppet|string|marionette",
  chains: "chain|link", compass: "compass", boulder: "boulder|rock|stone", crack: "crack|split|fracture", clock: "clock|watch",
  balance: "scale|balance", book: "book", shield: "shield", trophy: "trophy|cup", hourglass: "hourglass|sand", target: "target|bullseye|arrow",
  gift: "gift|box|present", inheritance: "document|scroll|will|seal|paper|certificate" };
const iconSeen = (icon, sees) => !ICON_WORDS[icon] || new RegExp(`\\b(${ICON_WORDS[icon]})`, "i").test(sees);
const FACE_MENTION = /\b(face|expression|smil\w*|grin\w*|frown\w*|cheerful|happy|sad|worried|angry|scowl\w*|calm|neutral|flat|smirk\w*|mood)\b/i;

// ── runs ────────────────────────────────────────────────────────────────────
function runsOf(kind) {
  const base = path.join(AUDIT, "audit", kind, SLUG);
  if (!fs.existsSync(base)) return [];
  const resultFiles = (d) => (fs.existsSync(d) && fs.statSync(d).isDirectory() ? fs.readdirSync(d).filter((f) => /^judge-result(-\d+)?\.json$/.test(f)) : []);
  return fs.readdirSync(base).filter((l) => resultFiles(path.join(base, l)).length && fs.existsSync(path.join(base, l, "judge-key.json")))
    .map((label) => ({ kind, label, id: `${kind}/${label}`, dir: path.join(base, label),
      // when the run was judged: the date mute-test (totals.json) / framecheck (report.json) wrote; file mtime
      // only as a fallback (a copied/restored audit tree has fresh mtimes)
      mtime: Date.parse((readJSON(path.join(base, label, "totals.json"), {}) || {}).date || (readJSON(path.join(base, label, "report.json"), {}) || {}).date || "") ||
        Math.max(...resultFiles(path.join(base, label)).map((f) => fs.statSync(path.join(base, label, f)).mtimeMs)) }))
    .sort((a, b) => a.mtime - b.mtime);
}
function loadJudged(dir) {
  const items = [], input = {};
  for (const f of fs.readdirSync(dir)) {
    if (/^judge-result(-\d+)?\.json$/.test(f)) items.push(...((readJSON(path.join(dir, f), {}) || {}).items || []));
    if (/^judge-input(-\d+)?\.json$/.test(f)) (readJSON(path.join(dir, f), []) || []).forEach((x) => { input[x.id] = x; });
  }
  return { items, input };
}
const sources = SOURCE === "both" ? ["mute", "framecheck"] : [SOURCE];
const wantLabels = args.labels ? new Set(String(args.labels).split(",")) : null;
const runs = sources.flatMap(runsOf).sort((a, b) => a.mtime - b.mtime).filter((r) => !wantLabels || wantLabels.has(r.label));
const SWEEP = !!args.sweep;
if (!runs.length && !SWEEP) { console.error(`❌ no judged runs under ${path.join(AUDIT, "audit")}/{${sources.join(",")}}/${SLUG}/`); process.exit(1); }
const artPath = path.join(BOOK, "art.json");
const artMtime = fs.existsSync(artPath) ? fs.statSync(artPath).mtimeMs : 0;
const latestRun = runs.length ? runs[runs.length - 1].id : null;
const isCurrent = (r) => r.mtime >= artMtime || r.id === latestRun;

function beatFor(s) {
  const k = scenes.indexOf(s);
  const head = (t) => String(t || "").slice(0, 40);
  if (beats[k] && head(beats[k].narration) === head(s._narration)) return beats[k];
  return beats.find((b) => head(b.narration) === head(s._narration)) || null;
}
const rendered = (s) => {
  const chars = (s.characters || []).filter((c) => !c.silhouette);
  return [...(s.props || []).map((p) => p.type), ...chars.map((c) => c.holds).flat()].filter((x) => typeof x === "string" && x);
};
const DOWN = { high: "medium", medium: "low", low: "low" };

// ── classify one failure ────────────────────────────────────────────────────
// Returns { owner, cls, confidence, reason, source: "description"|"config" }. First matching rule wins:
// RATER (the verdict itself is unreliable) > ENGINE > VOCABULARY > AUTHORING.
function classify(f, s, current) {
  const sees = f.sees || "", why = `${f.why || ""} ${f.whyC || ""}`, judgeWhy = f.why || "";
  const chars = s.characters || [];
  const visible = chars.filter((c) => !c.silhouette);
  const beat = beatFor(s);
  const icons = rendered(s);
  const R = (owner, cls, confidence, reason, src) => ({ owner, cls, confidence: src === "config" && !current ? DOWN[confidence] : confidence, reason, source: src });

  // RATER — the judge contradicts the description or the narration it was given
  const whyFaces = faceClassesIn(judgeWhy).filter((c) => c !== "neutral");
  const seesFaces = faceClassesIn(sees);
  if (whyFaces.length && seesFaces.length && !whyFaces.some((c) => seesFaces.includes(c)))
    return R("RATER", "face-word-contradicts-description", "high", `judge reads a ${whyFaces.join("/")} face; the description says ${seesFaces.join("/")}`, "description");
  if (whyFaces.length && !seesFaces.length && SIL.test(sees))
    return R("RATER", "face-on-silhouette", "high", `judge reads a ${whyFaces.join("/")} face; the description shows a faceless silhouette`, "description");
  if (DUP.test(why) && !DUP.test(sees) && !/\b(two|both|pair|side by side)\b/i.test(sees))
    return R("RATER", "phantom-duplicates", "medium", "judge cites duplicates the description does not mention", "description");
  const phantom = (judgeWhy.match(/\b(?:shows? no|no|without)\s+([a-z]{4,})/gi) || []).map((m) => m.split(/\s+/).pop().toLowerCase())
    .filter((w) => !STOP.has(w) && content(sees).map(stem).includes(stem(w)) && !new RegExp(`\\b(no|without)\\s+${w}`, "i").test(sees));
  if (phantom.length)
    return R("RATER", "absent-thing-is-described", "low", `judge says "no ${phantom[0]}" but the description has it`, "description");
  const ov = f.judgeNarration && s._narration && content(f.judgeNarration).length >= 6 && content(s._narration).length >= 6 ? overlap(f.judgeNarration, s._narration) : null;
  if (ov !== null && ov < 0.15)
    return R("RATER", "wrong-narration", "medium", `the narration the judge was given shares ${Math.round(ov * 100)}% of its words with this beat`, "config");

  // ENGINE — the drawing / planner
  const ids = visible.map((c) => c.identity || c.rig);
  if (DUP.test(sees) || (current && ids.length > 1 && new Set(ids).size < ids.length))
    return R("ENGINE", "twin-cast", DUP.test(sees) ? "high" : "medium", DUP.test(sees) ? "the viewer saw identical figures" : `duplicate identity in characters[]: ${ids.join("+")}`, DUP.test(sees) ? "description" : "config");
  if (SIL.test(sees) || chars.some((c) => c.silhouette))
    return R("ENGINE", "silhouette", SIL.test(sees) ? "high" : "medium", "the figure rendered as a silhouette (no face, no identity)", SIL.test(sees) ? "description" : "config");
  const lock = (s._authorship || {}).lock;
  if (lock) {
    const diff = [];
    if (lock.shot && s.shot && lock.shot !== s.shot) diff.push(`shot ${lock.shot}->${s.shot}`);
    if (lock.concept && s.concept !== lock.concept) diff.push(`concept ${lock.concept}->${s.concept || "none"}`);
    if (lock.expression && visible[0] && (visible[0].expression || "neutral") !== lock.expression) diff.push(`expression ${lock.expression}->${visible[0].expression || "neutral"}`);
    if (diff.length) return R("ENGINE", "staging-overridden", "high", `rendered staging differs from the authored lock: ${diff.join(", ")}`, "config");
  }
  const authoredIcon = (beat && beat.concept) || (s._authorship || {}).conceptAuthored || null;
  if (authoredIcon && !icons.includes(authoredIcon) && !s.diagram)
    return R("ENGINE", "icon-not-rendered", "high", `authored icon "${authoredIcon}" is not in the rendered props`, "config");
  const unseen = icons.filter((i) => !iconSeen(i, sees));
  if (sees && icons.length && unseen.length === icons.length && !s.diagram)
    return R("ENGINE", "icon-not-visible", "medium", `rendered icon(s) ${unseen.join("+")} absent from the blind description (too small, hidden or not drawn)`, "config");
  const faces = [...new Set(visible.map((c) => c.expression || "neutral"))];
  if (faces.length === 1 && FACE_CLASS[faces[0]] && seesFaces.length && !seesFaces.includes(FACE_CLASS[faces[0]]))
    return R("ENGINE", "face-misread", FACE_MENTION.test(why) ? "high" : "medium", `configured ${faces[0]}, the viewer read ${seesFaces.join("/")}`, "config");
  const noCast = beat && (!beat.cast || !beat.cast.length) && visible.length;
  if (noCast && PERSON_ID.test(why))
    return R("ENGINE", "engine-chosen-cast", "medium", "art.json has no cast; the engine picked the figure the judge objects to", "config");
  if (beat && !beat.shotOverride && CROP.test(`${sees} ${why}`))
    return R("ENGINE", "engine-chosen-shot", "medium", "the engine's shot crops/hides the subject", "description");

  // VOCABULARY — no icon for the subject, or an icon that reads as something else
  const narr = s._narration || f.judgeNarration || "";
  const narrStems = new Set(content(narr).map(stem));
  const unusedNamed = [...vocabIcons].filter((i) => !icons.includes(i) && narrStems.has(stem(i.toLowerCase())));
  const measured = icons.filter((i) => readings[i] && readings[i].neverFor);
  if (icons.length && MISREAD.test(why)) {
    if (measured.length) return R("AUTHORING", "ignored-icon-reading", "medium", `icon ${measured[0]} has a measured misread ("${readings[measured[0]].neverFor.slice(0, 80)}")`, "config");
    if (unusedNamed.length) return R("AUTHORING", "better-icon-existed", "low", `the narration names vocabulary icon(s) ${unusedNamed.join(",")}, not used`, "config");
    return R("VOCABULARY", "icon-misread", "medium", `icon ${icons.join("+")} reads as another meaning; add an icon-readings row / a fitting icon`, "config");
  }
  if (icons.length && icons.every((i) => generic.has(i)) && ABSENT.test(why)) {
    if (unusedNamed.length) return R("AUTHORING", "better-icon-existed", "low", `the narration names vocabulary icon(s) ${unusedNamed.join(",")}, not used`, "config");
    return R("VOCABULARY", "generic-icon", "low", `only generic icon(s) ${icons.join("+")}; nothing in the vocabulary names the subject`, "config");
  }

  // AUTHORING — the author's choice
  const texts = s.texts || [];
  const strike = texts.filter((t) => t.style === "strike");
  if (strike.length) {
    const affirmed = strike.some((t) => { const at = String(narr).toLowerCase().indexOf(content(t.text)[0] || "\u0000"); return at >= 0 && !NEG.test(String(narr).slice(Math.max(0, at - 30), at)); });
    if (STRIKE.test(why) || affirmed) return R("AUTHORING", "strike-on-affirmed-claim", STRIKE.test(why) ? "high" : "medium", "strike text on a claim the narration affirms", "config");
  }
  if (REJECT.test(why) || texts.some((t) => { const w = content(t.text)[0]; const at = w ? String(narr).toLowerCase().indexOf(w) : -1; return at >= 0 && NEG.test(String(narr).slice(Math.max(0, at - 25), at)) && /contradict|opposite/i.test(why); }))
    return R("AUTHORING", "rejected-premise-callout", "medium", "the picture/callout shows the premise the narration rejects", "config");
  const sig = signature(s);
  if (sig.bare) return R("AUTHORING", "bare-figure", f.dead ? "high" : "medium", "a figure with no icon, diagram or staged relation", "config");
  if (faces.length === 1 && seesFaces.includes(FACE_CLASS[faces[0]]) && FACE_MENTION.test(why))
    return R("AUTHORING", "face-mood-choice", "medium", `configured ${faces[0]} was read as configured; the mood fights the narration`, "config");
  if (s.diagram && ABSENT.test(why)) return R("AUTHORING", "generic-diagram", "low", `diagram ${s.diagram.type || ""} carries no specific meaning`, "config");
  if (!visible.length && !icons.length && !s.diagram) return R("AUTHORING", "text-only", "low", "no picture beyond the text", "config");
  return R("AUTHORING", "wrong-subject", "low", "fallback: the picture shows another subject than the narration", "config");
}

// ── --sweep: config-only rules on every beat (report-only) ─────────────────
// kind: "drift" = the config differs from what art.json authored; "engine" = an engine symptom in the config;
// "risk" = the author left the choice to the engine (not a defect, reported apart and never in the rates).
function sweepFindings(s) {
  const out = [];
  const F = (cls, kind, reason) => out.push({ cls, kind, reason });
  const chars = s.characters || [];
  const visible = chars.filter((c) => !c.silhouette);
  const beat = beatFor(s);
  const icons = rendered(s);
  const ids = visible.map((c) => c.identity || c.rig);
  if (ids.length > 1 && new Set(ids).size < ids.length) F("twin-cast", "engine", `duplicate identity in characters[]: ${ids.join("+")}`);
  if (chars.some((c) => c.silhouette)) F("silhouette", "engine", "a figure is drawn as a silhouette");
  const lock = (s._authorship || {}).lock;
  if (lock) {
    const diff = [];
    if (lock.shot && s.shot && lock.shot !== s.shot) diff.push(`shot ${lock.shot}->${s.shot}`);
    if (lock.concept && s.concept !== lock.concept) diff.push(`concept ${lock.concept}->${s.concept || "none"}`);
    if (lock.expression && visible[0] && (visible[0].expression || "neutral") !== lock.expression) diff.push(`expression ${lock.expression}->${visible[0].expression || "neutral"}`);
    if (diff.length) F("staging-overridden", "drift", `config differs from the authored lock: ${diff.join(", ")}`);
  }
  const authoredIcon = (beat && beat.concept) || (s._authorship || {}).conceptAuthored || null;
  // a book's own icon is drawn as a `customSvg` prop under scene.concept (src/engines/antidote/motifs.tsx), not as a prop of its name
  const iconDrawn = authoredIcon && (icons.includes(authoredIcon) || (s.concept === authoredIcon && (s.props || []).some((p) => p && p.type === "customSvg")));
  if (authoredIcon && !iconDrawn && !s.diagram) {
    if (s._noIcon) F("icon-refused", "drift", `authored icon "${authoredIcon}" dropped by the engine (_noIcon; lock concept ${JSON.stringify((lock || {}).concept ?? null)})`);
    else F("icon-not-rendered", "drift", `authored icon "${authoredIcon}" is not in the rendered props`);
  }
  if (!beat) { F("no-authored-beat", "risk", "no art.json beat matches this scene's narration"); return out; }
  if (Array.isArray(beat.cast) && !beat.cast.length && visible.length) F("authored-empty-cast-filled", "drift", `art.json cast [] (nobody), config draws ${ids.join("+")}`);
  // a diagram fills the frame and shows nobody by design (merge now refuses cast on a diagram beat; older books carry it)
  if (Array.isArray(beat.cast) && beat.cast.length && !s.diagram) {
    const lost = beat.cast.filter((c) => !ids.includes(c));
    if (lost.length) F("authored-cast-missing", "drift", `authored ${beat.cast.join("+")}, config draws ${ids.join("+") || "nobody"}`);
  }
  if (!Object.prototype.hasOwnProperty.call(beat, "cast") && visible.length) F("engine-chosen-cast", "risk", `art.json has no cast; the engine drew ${ids.join("+")}`);
  if (beat.conceptMotion && !(s.props || []).some((p) => p && p.motion === beat.conceptMotion)) F("concept-motion-lost", "drift", `authored conceptMotion "${beat.conceptMotion}" is not on any prop`);
  if (beat.continue === true && !s.continueFromPrev) F("continue-lost", "drift", "authored continue, scene has no continueFromPrev");
  if ((beat.action === "take" || beat.action === "embrace") && (!visible[0] || visible[0].action !== beat.action)) F("action-lost", "drift", `authored action "${beat.action}", lead does ${(visible[0] || {}).action || "nothing"}`);
  return out;
}
if (SWEEP) {
  const isReviewable = (s) => s.id !== "intro" && s.type !== "title" && s.shot !== "chapterCard";
  // labels from every judged run: a scene FAILED if any verdict was WRONG or dead (NONE), else CLEAN
  const label = {};
  for (const r of runs) {
    const { items, input } = loadJudged(r.dir);
    const key = readJSON(path.join(r.dir, "judge-key.json"), {}) || {};
    const current = isCurrent(r);
    for (const it of items) {
      const k = key[it.id]; if (!k) continue;
      const v = it.V || (k.thisIsX ? it.X : it.Y); if (!v) continue;
      const s = sceneAt(k.frame); if (!s) continue;
      const L = label[s.id] = label[s.id] || { failed: false, failedCurrent: false, clean: 0, runs: [], engineConfig: false };
      const wrong = v.correctness === "WRONG", dead = v.contribution === "NONE";
      L.runs.push(`${r.id}:${v.correctness}/${v.contribution}${current ? "" : "(stale)"}`);
      if (!wrong && !dead) { L.clean++; continue; }
      L.failed = true; if (current) L.failedCurrent = true;
      const inp = input[it.id] || {};
      const view = inp.V || (k.thisIsX ? inp.X : inp.Y) || inp.X || {};
      const c = classify({ why: v.why || "", whyC: v.whyC || "", sees: view.sees || "", judgeNarration: inp.narration || "", dead }, s, current);
      if (c.owner === "ENGINE" && c.source === "config") L.engineConfig = true;
    }
  }
  const beatsOut = scenes.filter(isReviewable).map((s) => ({ scene: s.id, findings: sweepFindings(s), label: label[s.id] || null }));
  const defect = (b) => b.findings.some((f) => f.kind !== "risk");
  const rate = (n, d) => (d ? { n, of: d, pct: Math.round((1000 * n) / d) / 10 } : { n, of: 0, pct: null });
  const failedB = beatsOut.filter((b) => b.label && b.label.failed);
  const cleanB = beatsOut.filter((b) => b.label && !b.label.failed);
  const engB = failedB.filter((b) => b.label.engineConfig);
  const classes = {};
  for (const b of beatsOut) for (const f of b.findings) {
    const c = classes[f.cls] = classes[f.cls] || { kind: f.kind, beats: 0, onFailed: 0, onClean: 0, unlabelled: 0, scenes: [] };
    c.beats++; c.scenes.push(b.scene);
    if (!b.label) c.unlabelled++; else if (b.label.failed) c.onFailed++; else c.onClean++;
  }
  const metrics = {
    beats: beatsOut.length, labelled: failedB.length + cleanB.length, labelledFailed: failedB.length, labelledClean: cleanB.length,
    flagged: beatsOut.filter(defect).length, riskOnly: beatsOut.filter((b) => !defect(b) && b.findings.length).length,
    catchAllFailures: rate(failedB.filter(defect).length, failedB.length),
    catchEngineConfigFailures: rate(engB.filter(defect).length, engB.length),
    falsePositiveOnClean: rate(cleanB.filter(defect).length, cleanB.length),
    newFlagged: beatsOut.filter((b) => !b.label && defect(b)).map((b) => b.scene),
  };
  const stampS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outS = path.resolve(args.out || path.join(ROOT, "audit", "cause-ledger-sweep", SLUG));
  fs.mkdirSync(outS, { recursive: true });
  const fileS = path.join(outS, `${stampS}.json`);
  fs.writeFileSync(fileS, JSON.stringify({ slug: SLUG, created: new Date().toISOString(), advisory: true, reportOnly: true,
    note: "Config-only rules on every beat (scripts/cause-ledger.js --sweep). A flag is a LEAD: a 'new' flagged beat is unverified until a blind framecheck reads it; it is never counted as an error. kind 'risk' is a choice left to the engine, not a defect, and is outside every rate.",
    runs: runs.map((r) => ({ run: r.id, stagingCurrent: isCurrent(r) })), metrics, classes,
    beats: beatsOut.filter((b) => b.findings.length || b.label) }, null, 2) + "\n");
  const p = (x) => (x.of ? `${x.n}/${x.of} (${x.pct}%)` : "n/a (no labels)");
  console.log(`── cause-ledger SWEEP · ${SLUG} · ${metrics.beats} beats · ${runs.length} judged run(s) as labels — REPORT-ONLY, a flag is a lead`);
  console.log(`flagged (drift/engine): ${metrics.flagged} · risk only: ${metrics.riskOnly} · labelled: ${metrics.labelled} (${metrics.labelledFailed} failed, ${metrics.labelledClean} clean)`);
  console.log(`catch, all labelled failures:          ${p(metrics.catchAllFailures)}`);
  console.log(`catch, ENGINE/config-owned failures:   ${p(metrics.catchEngineConfigFailures)}`);
  console.log(`false positive on labelled clean beats: ${p(metrics.falsePositiveOnClean)}`);
  console.log(`new flagged (no blind run has seen them — unverified): ${metrics.newFlagged.length}${metrics.newFlagged.length ? ` ${metrics.newFlagged.slice(0, 20).join(",")}${metrics.newFlagged.length > 20 ? ",…" : ""}` : ""}`);
  console.log("\nclass                        kind    beats  onFailed onClean unlabelled");
  for (const [c, x] of Object.entries(classes).sort((a, b) => b[1].beats - a[1].beats))
    console.log(`  ${c.padEnd(27)} ${x.kind.padEnd(7)} ${String(x.beats).padEnd(6)} ${String(x.onFailed).padEnd(8)} ${String(x.onClean).padEnd(7)} ${x.unlabelled}`);
  console.log(`\n✓ ${fileS}`);
  process.exit(0);
}

// ── collect failures ────────────────────────────────────────────────────────
const reviewable = (s) => s.id !== "intro" && s.type !== "title" && s.shot !== "chapterCard";
const sigs = Object.fromEntries(scenes.map((s) => [s.id, signature(s)]));
const verdicts = {};
const rows = [];
for (const r of runs) {
  const { items, input } = loadJudged(r.dir);
  const key = readJSON(path.join(r.dir, "judge-key.json"), {}) || {};
  const current = isCurrent(r);
  for (const it of items) {
    const k = key[it.id]; if (!k) continue;
    const v = it.V || (k.thisIsX ? it.X : it.Y); if (!v) continue;
    const s = sceneAt(k.frame); if (!s) continue;
    (verdicts[s.id] = verdicts[s.id] || []).push({ run: r.id, correctness: v.correctness, contribution: v.contribution });
    const wrong = v.correctness === "WRONG", dead = v.contribution === "NONE";
    if (!wrong && !dead) continue;
    const inp = input[it.id] || {};
    const view = inp.V || (k.thisIsX ? inp.X : inp.Y) || inp.X || {};
    const f = { run: r.id, scene: s.id, frame: k.frame, kind: wrong ? "WRONG" : "DEAD", wrong, dead, verdict: `${v.correctness}/${v.contribution}`,
      why: v.why || "", whyC: v.whyC || "", sees: view.sees || "", judgeNarration: inp.narration || "", narration: s._narration || "", stagingCurrent: current };
    const ov = overrides[`${r.id}/${s.id}`] || overrides[`${r.label}/${s.id}`];
    const c = ov ? { owner: String(ov.owner || "").toUpperCase(), cls: ov.class || "override", confidence: "override", reason: ov.why || "manual override", source: "cause-overrides.json" } : classify(f, s, current);
    rows.push({ ...f, ...c, staging: describeSig(sigs[s.id]), advisory: true });
  }
}

// REVIEW candidates for AUTHORING rows: beats sharing the staging (tiers A/B), never confirmed wrong.
for (const row of rows) {
  if (row.owner !== "AUTHORING") continue;
  const f = sigs[row.scene];
  row.review = scenes.filter((s) => s.id !== row.scene && reviewable(s) && ["A", "B"].includes(tier(f, sigs[s.id])))
    .map((s) => ({ scene: s.id, tier: tier(f, sigs[s.id]), judged: (verdicts[s.id] || []).map((x) => `${x.run}:${x.correctness}/${x.contribution}`) }));
}

// ── tallies + class confirmation ────────────────────────────────────────────
const OWNERS = ["ENGINE", "VOCABULARY", "AUTHORING", "RATER"];
const tally = Object.fromEntries(OWNERS.map((o) => [o, { WRONG: 0, DEAD: 0, classes: {} }]));
for (const r of rows) {
  const t = tally[r.owner] = tally[r.owner] || { WRONG: 0, DEAD: 0, classes: {} };
  t[r.kind]++; t.classes[r.cls] = (t.classes[r.cls] || 0) + 1;
}
const perRun = {};
for (const r of rows) { const p = perRun[r.run] = perRun[r.run] || {}; p[r.owner] = p[r.owner] || { WRONG: 0, DEAD: 0 }; p[r.owner][r.kind]++; }
const authoringClasses = {};
for (const r of rows.filter((x) => x.owner === "AUTHORING")) {
  const c = authoringClasses[r.cls] = authoringClasses[r.cls] || { failures: 0, scenes: [], review: new Set() };
  c.failures++; c.scenes.push(`${r.run}/${r.scene}`); r.review.forEach((x) => c.review.add(x.scene));
}
Object.values(authoringClasses).forEach((c) => {
  c.confirmed = c.failures >= 2 ? "yes: seen in >=2 failures" : "no: needs a 2nd failure, 2 agreeing blind passes, or the author opening the still";
  c.review = [...c.review].filter((x) => !c.scenes.some((y) => y.endsWith(`/${x}`)));
  c.reviewCount = c.review.length; c.review = c.review.slice(0, TOP);
});

// Re-sampling guard: a new holdout on a film unchanged since the last one is a lottery ticket.
const muteRuns = runs.filter((r) => r.kind === "mute");
const lastMute = muteRuns[muteRuns.length - 1];
const cfgMtime = fs.statSync(path.join(BOOK, "config.antidote.json")).mtimeMs;
const unchanged = lastMute && Math.max(artMtime, cfgMtime) <= lastMute.mtime;

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.resolve(args.out || path.join(ROOT, "audit", "cause-ledger", SLUG));
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `${stamp}.json`);
fs.writeFileSync(file, JSON.stringify({ slug: SLUG, created: new Date().toISOString(), advisory: true, reportOnly: true,
  note: "Owner per blind failure by transparent rules (see the header of scripts/cause-ledger.js). ADVISORY: a lead, not a verdict. ENGINE/VOCABULARY -> AGENT_LOG for-review; RATER -> noted; AUTHORING -> fix only a confirmed class, on its REVIEW candidates after looking at each.",
  runs: runs.map((r) => ({ run: r.id, stagingCurrent: isCurrent(r) })), filmUnchangedSinceLastMute: unchanged ? lastMute.id : null,
  tally, perRun, authoringClasses, rows }, null, 2) + "\n");

// ── stdout ──────────────────────────────────────────────────────────────────
const pad = (x, n) => String(x).padEnd(n);
console.log(`── cause ledger · ${SLUG} · ${rows.length} failure(s) from ${runs.length} judged run(s) — ADVISORY, not a verdict`);
console.log(`${pad("owner", 11)} ${pad("WRONG", 6)} ${pad("DEAD", 5)} classes`);
for (const o of Object.keys(tally)) {
  const t = tally[o];
  console.log(`${pad(o, 11)} ${pad(t.WRONG, 6)} ${pad(t.DEAD, 5)} ${Object.entries(t.classes).map(([c, n]) => `${c} ${n}`).join(", ") || "-"}`);
}
console.log(`\nper run: ${Object.entries(perRun).map(([r, p]) => `${r} ` + Object.entries(p).map(([o, x]) => `${o[0]}${o.slice(1, 3).toLowerCase()} ${x.WRONG}W/${x.DEAD}D`).join(" ")).join(" | ")}`);
console.log("\nrows (run scene kind owner/class confidence — why):");
for (const r of rows) console.log(`  ${pad(r.run, 15)} ${pad(r.scene, 10)} ${pad(r.kind, 5)} ${pad(`${r.owner}/${r.cls}`, 42)} ${pad(r.confidence, 8)} ${r.reason}${r.stagingCurrent ? "" : "  (earlier run: staging may have changed)"}`);
if (Object.keys(authoringClasses).length) {
  console.log("\nAUTHORING classes (fix only when confirmed; REVIEW candidates = same staging, look at each):");
  for (const [c, x] of Object.entries(authoringClasses))
    console.log(`  ${pad(c, 26)} failures ${x.failures} · confirmed ${x.confirmed} · REVIEW ${x.reviewCount}${x.reviewCount ? `: ${x.review.join(",")}${x.reviewCount > x.review.length ? ",…" : ""}` : ""}`);
}
const eng = rows.filter((r) => ["ENGINE", "VOCABULARY"].includes(r.owner)).length;
if (eng) console.log(`\n→ ${eng} ENGINE/VOCABULARY finding(s): AGENT_LOG.md for-review — never "fixed" in the storyboard.`);
if (unchanged) console.log(`\n⚠ film unchanged since ${lastMute.id}: do NOT draw a new holdout (re-sampling an unchanged film is a lottery).`);
console.log(`\n✓ ${file}`);
