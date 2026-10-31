/**
 * authorship.js — Faz 0 (2026-09-24): nobody but an author may decide what a
 * beat shows.
 *
 * THE FAILURE. We Were Liars reached Studio with `beat-briefs.json →
 * authored: false`. Every brief was the heuristic's guess; 136/195 carried the
 * same intent ("Dramatize the thematic conflict of argument"); the lexicon
 * turned every spoken "text" into a phone (20 scenes) and every "romance" into
 * a heart. The narrative firewall SAW it — 90 "visual subject not grounded"
 * findings — and passed, because they were diagnostics. Nothing in the chain
 * said "this film was never authored".
 *
 * THE RULE. Each planned scene carries `_authorship` (stamped at plan time by
 * plan-antidote / plan-vox). gate-authorship.js reads the CONFIG only, so the
 * same check runs locally, in make-book and inside a render bundle:
 *   1. every non-title beat has an authored decision (art file / designs file /
 *      Claude brief) — a heuristic brief is not one;
 *   2. every prop on screen is one the authored decision produced — anything a
 *      later engine added (chapter payoff, novelty hero, stagnation remedy,
 *      adapter floor) is an engine-invented subject;
 *   3. an engine-detected diagram is the same thing;
 *   4. no single intent string covers more than 10% of beats, and no known
 *      heuristic template intent ships at all (safety rail, NOT a quality
 *      metric — 0% templates can still be a bad storyboard);
 *   5. no vocabulary from another book's world appears in generated fields
 *      unless this beat's own narration says it.
 * A config planned before this gate has no stamps and fails closed.
 */

// Brief provenance. `src` is per brief ("claude" | "heuristic"); the file flag
// alone was launderable — `--merge` of five briefs used to mark the whole file
// `authored: true`. Legacy authored files predate `src`: only a file whose
// flag is true AND whose briefs carry no `src` at all is trusted wholesale.
const { stagedPoles, idleWallpaperOf } = require("./proposition.js");
const { severityFor } = require("./proposition-loss.js");

function isAuthoredBrief(b, file) {
  if (!b) return false;
  if (b.src) return b.src === "claude";
  return !!(file && file.authored === true);
}

const TEMPLATE_INTENT_RES = [
  /^Dramatize the thematic conflict of\b/i,
  /^Visual metaphor dramatizing the underlying\b/i,
];
const TEMPLATE_SHARE_MAX = 0.10;

// Vocabulary that belongs to one book's world (The Republic, which the semantic
// layer was first built on) and has leaked into others as defaults.
const FOREIGN_WORLD_TERMS = {
  "plato-republic": [
    "virtue and justice", "dialectical", "socrates", "socratic", "form of the good",
    "kallipolis", "fiveRegimes", "caveAllegory", "ringOfGyges", "shipOfState",
    "tripartiteSoul", "thirtyTyrants", "philosophical_exposition", "philosophical exchange",
    "elenctic", "thrasymachus", "philosopher-king", "oligarchic junta",
  ],
};

function authorshipStamp({ art = null, brief = null, propTypes = [], diagramAuthored = false, conceptAuthored = null, src: forced = null } = {}) {
  const src = forced || (art ? "art" : brief ? "brief" : "none");
  return {
    src,
    propTypes: [...new Set(propTypes)],
    diagramAuthored: !!diagramAuthored,
    // P9-A A3: the authored icon decision, sealed verbatim (string or null) so
    // the gate can prove when the engine refused an authored subject.
    conceptAuthored: conceptAuthored == null ? null : String(conceptAuthored),
    intent: (brief && (brief.narrative_intent || brief.visual_intent)) || null,
  };
}

const isExemptScene = (s) => !s || s.id === "intro" || s.shot === "chapterCard" || s.type === "title" || s.type === "chapter";

function narrationOf(s) {
  return String(s._narration || s.narration || (s.props && !Array.isArray(s.props) && s.props.text) || "");
}

// Generated fields only: the narration itself (and fields copied verbatim from
// it) may legitimately name anything.
function generatedText(s) {
  // (Vox keeps the narration in props.text.)
  // A forbid list NAMING another world's motifs is the guard, not a leak.
  const skip = new Set(["_narration", "narration", "narrativeRelation", "claim", "_raw", "texts", "text", "captions", "_subject",
    "mustNotShow", "forbiddenSets", "forbiddenShots"]);
  return JSON.stringify(s, (k, v) => (skip.has(k) || /^forbidden/i.test(k) ? undefined : v)) || "";
}

function worldOf(bookWorldId, slug) {
  const w = String(bookWorldId || slug || "").toLowerCase();
  return /republic|plato/.test(w) ? "plato-republic" : null;
}

/**
 * @param {object} config  config.antidote.json or config.vox.json
 * @param {{engine?:string, slug?:string, worldId?:string}} ctx
 * @returns {{status:"PASS"|"FAIL", violations:object[], counts:object}}
 */
function evaluateAuthorship(config, ctx = {}) {
  const scenes = (config && (config.scenes || config.beats)) || [];
  const engine = ctx.engine || "antidote";
  const violations = [];
  const push = (code, s, message, extra = {}) => violations.push({ code, sceneId: s && s.id, message, ...extra });

  // a LOCKED beat is never exempt: an authored beat an engine turned into a chapter card used to drop out of
  // the gate here (its shot became "chapterCard"), so the override was never reported
  const beats = scenes.filter((s) => !isExemptScene(s) || (s && s._authorship && s._authorship.lock));
  const unstamped = beats.filter((s) => !s._authorship);
  if (beats.length && unstamped.length) {
    push("UNSTAMPED_CONFIG", null,
      `${unstamped.length}/${beats.length} beats have no _authorship stamp — planned before the authorship gate; re-plan with authored inputs`);
  }

  const intents = new Map();
  let unauthored = 0;
  for (const s of beats) {
    const a = s._authorship;
    if (!a) continue;
    if (a.src === "none") {
      unauthored++;
      push("UNAUTHORED_BEAT", s, "no authored decision (art file / designs / Claude brief) for this beat");
    }
    if (engine === "antidote") {
      const drift = stagingDrift(s);
      if (drift.length) push("STAGING_OVERRIDDEN", s, `an engine restaged this authored beat (${drift.join("; ")}) — run gate-authorship --restore`);
      // only the author continues a stage: a continuation nobody authored was added by an engine
      if (s.continueFromPrev === true && !(a.lock && a.lock.continue === true)) push("STAGING_OVERRIDDEN", s, "continueFromPrev was not authored (art.json `continue`) — an engine may not continue a stage (remove it, or author `continue` and re-plan)");
      const allowed = new Set(a.propTypes || []);
      for (const p of s.props || []) {
        if (p && p.type && !allowed.has(p.type)) {
          push("ENGINE_INVENTED_PROP", s, `prop "${p.type}" was not produced by this beat's authored decision`, { prop: p.type });
        }
      }
      if (s.diagram && !s.diagram.authored && !a.diagramAuthored) {
        push("ENGINE_INVENTED_DIAGRAM", s, "diagram was detected by the engine, not authored");
      }
      // P10.2a: final-scene forbidden sweep — config-only (no brief file needed,
      // render-bundle safe): the compiler sealed the forbidden list INTO the
      // stamp (visualCompiled.forbidden). Catches props staged by ANY writer.
      if (a.visualCompiled && Array.isArray(a.visualCompiled.forbidden)) {
        const lower = new Set(a.visualCompiled.forbidden.map((x) => String(x).toLowerCase()));
        if (lower.size) {
          for (const p of s.props || []) {
            if (p && p.type && (lower.has(String(p.type).toLowerCase()) || (p._visualClaim && lower.has(String(p._visualClaim).toLowerCase())))) {
              push("FORBIDDEN_OBJECT_STAGED", s, `forbidden object "${p.type}" is on the final scene`, { prop: p.type });
            }
          }
        }
      }
    }
    if (a.intent) {
      if (TEMPLATE_INTENT_RES.some((re) => re.test(a.intent))) push("TEMPLATE_INTENT", s, `template intent: "${a.intent}"`);
      intents.set(a.intent, (intents.get(a.intent) || 0) + 1);
    }
  }
  for (const [intent, n] of intents) {
    if (beats.length && n / beats.length > TEMPLATE_SHARE_MAX) {
      push("REPEATED_INTENT", null, `${n}/${beats.length} beats share one intent (>${TEMPLATE_SHARE_MAX * 100}%): "${intent}"`, { share: n / beats.length });
    }
  }

  const bookWorld = worldOf(ctx.worldId, ctx.slug);
  for (const [world, terms] of Object.entries(FOREIGN_WORLD_TERMS)) {
    if (world === bookWorld) continue;
    for (const s of scenes) {
      const gen = generatedText(s).toLowerCase();
      const said = narrationOf(s).toLowerCase();
      const hits = terms.filter((t) => gen.includes(t.toLowerCase()) && !said.includes(t.toLowerCase()));
      if (hits.length) push("FOREIGN_WORLD_LEAK", s, `vocabulary from ${world} in generated fields: ${hits.join(", ")}`, { terms: hits });
    }
  }

  // ── P9-A A3/O1: authored icon lost to the engine's vocabulary gate ────────
  // An authored `concept` (art file / Claude brief) that the plan had to refuse
  // is author-given meaning the engine dropped. Sealed on the stamp at plan
  // time; if the scene carries no icon while the stamp says one was authored,
  // the loss is provable from the config alone (lolita s106 "crash", s134
  // "coin" — both silently refused, gate PASSed).
  // P9-A.1 (operator, 2026-10-06): this is a HARD violation — a hand prop that
  // IS the authored object (a held coin) counts as the icon reaching the
  // screen, but an authored icon that is simply absent fails the gate. Severity
  // lives in scripts/lib/proposition-loss.js GATE_POLICY (DROPPED: "HARD").
  // Pre-P9-A stamps without conceptAuthored find nothing to lose here.
  for (const s of beats) {
    const a = s._authorship;
    if (!a) continue;
    const authored = a.conceptAuthored;
    if (!authored || typeof authored !== "string" || !authored.trim()) continue;
    const chars = Array.isArray(s.characters) ? s.characters : [];
    const hasIconOnScene = !!(s.concept
      || (s.props || []).some((p) => p && p.type)
      || chars.some((ch) => ch && ch.holds === authored));
    if (!hasIconOnScene) {
      push("PROPOSITION_DROPPED", s, `authored icon "${authored}" never reached the scene (authored-by: ${a.src})`, { concept: authored });
    }
  }

  // ── P9-B: the authored two-pole proposition, verified config-only ──────
  // A sealed proposition must reach the screen: both poles anchored (or a
  // rejected pole honestly struck), and a rejected pole never asserted as the
  // scene's own assertion. scripts/lib/proposition.js owns the verdicts.
  // P9-B.2b (operator, 2026-10-07): the AUTHOR-SEALED contract hardened — an
  // unstaged authored proposition is author-given meaning the engine lost, so
  // it pushes PROPOSITION_DROPPED (HARD via GATE_POLICY). Detector-only claims
  // stay report-only by construction: they are never sealed (sealFor returns
  // null for src:"detector"), and PROPOSITION_UNSTAGED remains the REPORT code
  // for any future detector-only observation.
  let authoredPropositions = 0;
  for (const s of beats) {
    const seal = s._authorship && s._authorship.propositionAuthored;
    if (!seal || !Array.isArray(seal.poles) || !seal.poles.length) continue;
    authoredPropositions++;
    const prop = { relation: seal.relation, poles: seal.poles, evidence: null, visual: { representation: seal.representation, icon: seal.icon, perCast: [] }, src: "author" };
    const v = stagedPoles(s, prop);
    for (const pv of v.verdicts) {
      if (pv.state === "asserted-wrong") push("PROPOSITION_DROPPED", s, `rejected pole "${pv.pole}" staged as the scene's own assertion (pole violation)`, { pole: pv.pole, verdict: pv.state });
    }
    if (v.unstaged) {
      // Author-sealed unstaged = HARD (P9-B.2b): an authored proposition carried
      // by one pole is lost author meaning, same class as a dropped icon.
      push("PROPOSITION_DROPPED", s, `authored ${seal.relation} proposition carried by one pole (${v.verdicts.map((x) => `${x.pole}:${x.state}`).join(", ")})`, { verdicts: v.verdicts });
    }
  }

  const counts = violations.reduce((m, v) => ((m[v.code] = (m[v.code] || 0) + 1), m), {});
  const idleWallpaper = beats.filter((s) => idleWallpaperOf(s)).length;
  // Fail-closed: a code OUTSIDE the proposition taxonomy is gate-native and
  // blocking as it always was; only GATE_POLICY REPORT codes stay report-only.
  const hardCount = violations.filter((v) => severityFor(v.code) !== "REPORT").length;
  return {
    // Severity lives in ONE policy: scripts/lib/proposition-loss.js GATE_POLICY
    // (DROPPED: HARD — P9-A.1; UNSTAGED: REPORT until the P9-B precision proof).
    status: hardCount ? "FAIL" : "PASS",
    violations,
    metrics: { idleWallpaper, authoredPropositions },
    counts: { beats: beats.length, unauthored, ...counts },
  };
}

// P0.2: the lock seals the ICON too. `shot/set/cast/expression/action/holds` are the
// staging half; `concept` + `props`/`propTypes` are the icon the author chose. The
// split matters: a lock written before P0.2 has no icon keys and must keep behaving
// exactly as it did (no icon check, no icon restore).
const STAGING_LOCK_KEYS = ["shot", "set", "cast", "expression", "action", "holds"];
const hasStagingLock = (L) => !!L && STAGING_LOCK_KEYS.some((k) => k in L);
const propTypesOf = (s) => ((s && s.props) || []).map((p) => p && p.type).filter(Boolean);

/**
 * Put every sealed authored decision (scene._authorship.lock, written by
 * plan-antidote) back after the post-plan engines ran. Returns the number of
 * scenes it had to repair. Idempotent; scenes without a lock are untouched.
 */
function stagingDrift(s) {
  const L = s._authorship && s._authorship.lock;
  if (!L) return [];
  const d = [], ch = s.characters || [], c0 = ch[0] || {};
  const staging = hasStagingLock(L);
  if (staging) {
    if (L.shot && s.shot !== L.shot) d.push(`shot ${L.shot}→${s.shot}`);
    if (L.set && s.bg && s.bg.set !== L.set) d.push(`set ${L.set}→${s.bg.set}`);
    // Compare WHO by count and key. A figure an engine adds may carry only a `role`
    // (visual-intent's stage-occupancy narrator, visual-contract's restored cast):
    // joined by identity alone it read "" — the same as an authored empty cast [] —
    // so the added person passed the gate. Every figure counts, whoever it is.
    const who = (x) => (x && (x.identity || x.role)) || "?";
    if (Array.isArray(L.cast) && (ch.length !== L.cast.length || ch.map(who).join(",") !== L.cast.join(","))) d.push(`cast ${L.cast.join("+") || "none"}→${ch.map(who).join("+") || "none"}`);
    for (const f of ["expression", "action"]) if (L[f] && c0[f] !== L[f]) d.push(`${f} ${L[f]}→${c0[f]}`);
    if ((L.holds || null) !== (c0.holds || null)) d.push(`holds ${L.holds}→${c0.holds}`);
    if (L.actionAt != null && c0.actionAt !== L.actionAt) d.push(`action moment ${L.actionAt}→${c0.actionAt ?? "none"}`);
    if (L.partnerAction && (ch[1] || {}).action !== L.partnerAction) d.push(`partner ${L.partnerAction}→${(ch[1] || {}).action ?? "none"}`);
    if (L.partnerExpression && (ch[1] || {}).expression !== L.partnerExpression) d.push(`partner face ${L.partnerExpression}→${(ch[1] || {}).expression ?? "none"}`);
    if (ch.some((x) => x.emotion)) d.push("emotion overlay added");
  }
  // P0.2 — the icon. A substituted or dropped authored icon used to be invisible
  // here (it is what let `repairSceneContract` swap coin → "spotlight").
  if ("concept" in L && ((s.concept ?? null) !== (L.concept ?? null))) d.push(`icon ${L.concept ?? "none"}→${s.concept ?? "none"}`);
  if (Array.isArray(L.propTypes)) {
    const now = propTypesOf(s);
    if (now.join("+") !== L.propTypes.join("+")) d.push(`icon props ${L.propTypes.join("+") || "none"}→${now.join("+") || "none"}`);
  }
  // the authored icon behaviour (art.json conceptMotion → props[].motion); restored with L.props
  if (L.conceptMotion && !((s.props || []).some((p) => p && p.motion === L.conceptMotion))) d.push(`icon motion ${L.conceptMotion}→none`);
  // a chapter card REPLACES the scene (Scene.tsx draws scene.chapterCard instead of its staging): on an
  // authored beat that hides every authored decision at once (burn 217/236; the-courage-to-be-disliked 19/19)
  if (!L.chapterCard && (s.chapterCard || s.shot === "chapterCard")) d.push("authored beat replaced by a chapter card");
  // the authored callout(s): an engine may restyle, never drop the author's words
  if (Array.isArray(L.artTexts)) {
    const now = new Set((s.texts || []).map((t) => t && t.text));
    for (const t of L.artTexts) if (!now.has(t.text)) d.push(`callout "${t.text}" dropped`);
  }
  // the authored continuation (art.json `continue` → continueFromPrev + a 0-frame cut)
  if (L.continue !== true && s.continueFromPrev === true) d.push("continue added (not authored)");
  // the carried END STATE of a continued beat (10x P1: she stays in the tub) — sealed with the continuation
  if (L.carryState === true && s.carryState !== true) d.push("carryState→none");
  if (L.continue === true) {
    const tr = s.transition || {};
    if (s.continueFromPrev !== true) d.push("continue→none");
    else if (tr.type !== "cut" || (tr.frames || 0) !== 0) d.push(`continue transition cut→${tr.type || "?"}/${tr.frames ?? "?"}`);
  }
  return d;
}
function restoreAuthoredStaging(config) {
  let repaired = 0;
  for (const s of (config && config.scenes) || []) {
    const L = s._authorship && s._authorship.lock;
    if (!L || !stagingDrift(s).length) continue;
    const staging = hasStagingLock(L);
    // the icon first: it is the subject of the beat, staging only places it
    if ("concept" in L) {
      if (L.concept === null || L.concept === undefined) delete s.concept;
      else s.concept = L.concept;
    }
    if (Array.isArray(L.props)) s.props = JSON.parse(JSON.stringify(L.props));
    if (L.continue === true) { s.continueFromPrev = true; s.transition = { type: "cut", frames: 0 }; }
    else delete s.continueFromPrev;
    if (L.carryState === true) s.carryState = true; else delete s.carryState;
    // undo a chapter card stamped over the beat (the card object is what the renderer draws)
    if (!L.chapterCard && (s.chapterCard || s.shot === "chapterCard")) {
      delete s.chapterCard;
      if (s.shot === "chapterCard") s.shot = L.shot || L.planShot || "medium";
    }
    if (Array.isArray(L.artTexts)) {
      const ts = s.texts || (s.texts = []);
      for (const t of L.artTexts) if (!ts.some((x) => x && x.text === t.text)) ts.push(JSON.parse(JSON.stringify(t)));
    }
    if (!staging) { repaired++; continue; }
    if (L.shot) s.shot = L.shot;
    if (L.set && s.bg) { s.bg.set = L.set; if (L.shot !== "split") delete s.bg.split; }
    const ch = s.characters || (s.characters = []);
    if (Array.isArray(L.cast)) {
      if (ch.length > L.cast.length) ch.length = L.cast.length;
      while (ch.length < L.cast.length) ch.push({ id: `${s.id}-c${ch.length}`, rig: "everyman", expression: "neutral", action: "idle", enter: "fade", lookAt: "viewer", silhouette: false });
      L.cast.forEach((id, k) => { if (ch[k]) { ch[k].identity = id; ch[k].role = id; } });
    }
    if (staging) ch.forEach((x) => { delete x.emotion; delete x.emotionAt; });
    if (ch[0]) {
      if (L.expression) ch[0].expression = L.expression;
      if (L.action) ch[0].action = L.action;
      if (L.holds) ch[0].holds = L.holds; else delete ch[0].holds;
      if (L.actionAt != null) ch[0].actionAt = L.actionAt;
    }
    if (L.partnerAction && ch[1]) { ch[1].action = L.partnerAction; if (L.actionAt != null) ch[1].actionAt = L.actionAt; }
    if (L.partnerExpression && ch[1]) ch[1].expression = L.partnerExpression;
    repaired++;
  }
  return repaired;
}

module.exports = {
  stagingDrift, restoreAuthoredStaging,
  isAuthoredBrief, authorshipStamp, evaluateAuthorship,
  TEMPLATE_INTENT_RES, TEMPLATE_SHARE_MAX, FOREIGN_WORLD_TERMS,
};
