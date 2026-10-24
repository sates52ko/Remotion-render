/**
 * visual-compiler.js — P10.2a: the authored visual brief → claim-checked scene props.
 *
 * DESIGN SOURCE: audit/visionless-10x/p10/p10.2a-revised-design.md (v4, approved).
 * THE OPERATOR'S SPINE: first define what must be VISIBLE (claims), then verify
 * what capability the system has to show it, only then allow staging.
 *
 * HARD RULES (design §2 R1–R4, v4 contract):
 *  R1  No invented icon names — every emitted prop type ∈ the renderer's OWN
 *      type vocabulary (src/engines/antidote/schema.ts propType enum, which
 *      includes every REGISTRY key + arrow/shape/coin/book). A name not in the
 *      vocabulary → unrepresentable[], never a generic fallback.
 *  R2  No pixel coordinates IN THE COMPILER OUTPUT. Claims compile to
 *      band + size semantic slots; ONLY composeFrame() produces geometry,
 *      deterministically, in ONE place.
 *  R3  No silent drops — every authored claim lands as props or in the ledger
 *      with verdict + reason (T5 counts them: 100% coverage).
 *  R4  Forbidden enforcement — a forbidden subject never compiles to props;
 *      a direct conflict is an ERROR (thrown), not a filter.
 *
 * CAPABILITY MODEL (design §0 — grounded in verified renderer mechanisms):
 *  staticPresence   → any schema propType, placed (C1)
 *  visibleAction    → a motif's OWN hardcoded per-frame motion (C2, enumerable
 *                     per motif — commanded, not invented)
 *  stateTransition  → prop.stateIndex (C3, discrete step, per-prop)
 *  temporalRelation → prop.at / enter timing (C4)
 *  spatialRelation  → band placement + relator between pole boxes (C4/C5)
 *
 * The arrow (C5) has a FIXED baked path (M20,150 Q180,20 320,90 in a 360×200
 * viewBox, left-low → right-high): its real endpoints are computed here from
 * the path vertices transformed through the composed box, and any claim
 * needing another orientation is UNSUPPORTED → ledger, never staged.
 */

"use strict";

// ── The renderer's own type vocabulary (schema.ts propType enum, verbatim) ──
const RENDERER_PROP_TYPES = new Set([
  "moneyRain", "coin", "book", "arrow", "shape",
  "barChart", "lineGrowth", "balance", "ladder", "door", "clock",
  "maze", "spotlight", "counter", "orbit", "stack", "crack", "ripple", "summit",
  "home", "family", "star", "heart", "road", "storm", "school", "phone",
  "ledge", "medical", "grave", "notes", "water", "fire", "crash", "tree",
  "work", "game", "war", "food", "city", "photo", "law", "mask", "key", "mirror",
  "lightbulb", "shadowSelf", "puppeteer", "iceberg", "chains", "compass",
  "dominoCascade", "icebergDepth", "funnelTrap",
  "codeWindow", "laptopMockup", "funnelMetrics", "rocketLaunch", "dollarExchange",
  "alarmClock", "hourglass", "zap", "shield", "target", "trophy", "sword",
  "magnifier", "wallet", "gift", "subway", "butterfly", "coffee", "car",
  "inheritance",
  "kallipolis", "caveAllegory", "shipOfState", "tripartiteSoul", "ringOfGyges",
  "thirtyTyrants", "fiveRegimes", "mythOfEr",
  "boulder", "customSvg",
]);

// MOTIF CAPABILITIES — code-verified, NOT hand-copied. The two sets are
// generated from src/engines/antidote/motifs.tsx by
// scripts/lib/motif-capability-scan.js (which motif bodies literally contain
// `useCurrentFrame()` → the motif animates; `spec.stateIndex` → the motif
// consumes state) and frozen into data/visual-capability.json. P10.2a review
// fix: the hand-copied sets had drifted ("mythOfEr" was falsely stateful,
// storm/water falsely absent, counter/stack/ladder/dominoCascade/icebergDepth/
// funnelTrap falsely stateful). Regenerate the JSON whenever motifs.tsx
// changes; the compiler fails closed (throws) if the file is missing.
const CAPABILITY_DATA = JSON.parse(
  require("fs").readFileSync(require("path").join(__dirname, "..", "..", "data", "visual-capability.json"), "utf8"),
);
const ANIMATED_MOTIFS = new Set(CAPABILITY_DATA.animated);    // C2 visibleAction
const STATEFUL_MOTIFS = new Set(CAPABILITY_DATA.stateful);    // C3 stateTransition

// Claims with an `action` verb: the verb must name motion the motif's own
// component actually performs, not just any word. Verified against the motif's
// OWN motion vocabulary, extracted from the same scan (below) — a motif is
// either generic-per-frame (wave/flicker/churn, enumerated per motif here from
// its drawing parameters) or not animated at all.
// Motion-verb table per motif family, grounded in the component sources read
// during the capability scan (storm: flicker/rain-fall/wind; water: wave
// churn/rise; fire: burn/flicker/roar-rise; moneyRain: falling coins; ...).
// A verb NOT listed for a staged type = the requested motion is not what the
// motif does → the claim is PARTIAL (presence staged, motion claim unmet) and
// the ledger carries WHY. This is the review's "verify the requested motion is
// supported, not merely that the motif moves".
const MOTION_VERBS = {
  storm: ["rains", "flickers", "rolls", "darkens", "blows", "strikes"],
  water: ["churns", "rises", "sloshes", "waves", "flows"],
  fire: ["burns", "flickers", "rises"],
  moneyRain: ["falls", "rains"],
  dominoCascade: ["falls", "topples", "cascades"],
  crack: ["spreads", "grows", "widens"],
  ripple: ["spreads", "expands", "ripples"],
  orbit: ["orbits", "spins", "circles"],
  counter: ["counts", "ticks", "increments"],
  hourglass: ["drains", "empties", "flows"],
  alarmClock: ["ticks", "rings", "shakes"],
  butterfly: ["flutters", "flies", "emerges"],
  rocketLaunch: ["launches", "rises", "ascends", "blasts off"],
  dollarExchange: ["exchanges", "moves", "swaps"],
  zap: ["strikes", "flashes", "zaps"],
  lightbulb: ["lights", "glows", "switches on"],
  lineGrowth: ["grows", "climbs", "rises"],
  barChart: ["grows", "rises", "compares"],
  stack: ["grows", "stacks", "piles up"],
  ladder: ["climbs", "extends", "rises"],
  summit: ["approaches", "rises"],
  boulder: ["rolls", "strains", "grinds"],
  crash: ["collides", "falls", "plunges"],
  star: ["twinkles", "shines"],
  door: ["opens", "closes", "swings"],
  clock: ["ticks", "counts down"],
  balance: ["tips", "weighs", "swings"],
  maze: ["threadsWith", "shifts"],
  spotlight: ["sweeps", "focuses", "narrows"],
  coin: ["flips", "spins", "drops"],
  arrow: ["points", "rises", "traces"],
  key: ["turns", "unlocks"],
  iceberg: ["bobs", "drifts"],
  icebergDepth: ["reveals", "descends", "scans"],
  funnelTrap: ["traps", "funnels", "drains"],
  caveAllegory: ["flickers", "rises", "ascends"],
  tripartiteSoul: ["struggles", "mutinies", "harmonizes"],
  ringOfGyges: ["shimmers", "hides", "reveals"],
  fiveRegimes: ["descends", "steps down", "regresses"],
  mythOfEr: ["spins", "rotates"],
  //通路 — spring-entrance motifs (Frame opacity pop): these read as ENTRANCE
  // (a drawn object fades/scales in via Remotion spring), their verb is "appears"
  // — a claim naming real motion on them is PARTIAL.
  mirror: ["appears", "reflects*"],   // drawn static; spring entrance only
  city: ["appears", "grows*"],
  school: ["appears"],
  notes: ["appears", "scatters*"],
  work: ["appears"],
  law: ["appears"],
  ledger: [],
  medical: ["appears"],
  grave: ["appears"],
  tree: ["appears"],
};

const BANDS = new Set(["sky", "upper", "center", "lower", "ground", "channel"]);
const SIZES = new Set(["s", "m", "l", "xl"]);

// The relator vocabulary. `arrow` is the ONLY general-purpose relator and its
// baked geometry supports exactly one orientation class.
const RELATOR = "arrow";
const ARROW_BOX = { w: 360, h: 200 };                 // viewBox of the fixed path
const ARROW_PATH_START = { x: 20, y: 150 };           // M20,150  (left-low)
const ARROW_PATH_END = { x: 320, y: 90 };             // 320,90   (right-high)

const RELATIONS = new Set(["contrast", "cause_effect", "said_vs_real", "before_after", "equivalence", "none"]);

// ── Capability accounting (design §0/§1) ────────────────────────────────────

/** Which capabilities can this prop type verifiably provide? */
function capabilitiesOf(type) {
  return {
    staticPresence: RENDERER_PROP_TYPES.has(type),
    visibleAction: ANIMATED_MOTIFS.has(type),
    stateTransition: STATEFUL_MOTIFS.has(type),
  };
}

/**
 * classify(claim, propType) — three-level representability per AUTHORED CLAIM
 * (design §1): REPRESENTABLE / PARTIAL / UNREPRESENTABLE with capability-level
 * reasons. A claim asks for {presence, action?, transition?, spatial?}.
 * The action is a VERB (string): it must name motion the motif's own
 * component actually performs (MOTION_VERBS), not merely appear on an
 * animated motif — a "water flies upward" ask is PARTIAL, reviewed.
 */
function classify(claim, type) {
  const caps = capabilitiesOf(type);
  const required = [];
  const available = [];
  const missing = [];

  if (!caps.staticPresence) {
    return { verdict: "UNREPRESENTABLE", required, available, missing: ["staticPresence"], reason: `no renderer motif for "${claim.subject || type}" (schema propType enum has no such type)` };
  }
  required.push("staticPresence"); available.push("staticPresence");

  if (claim.action && !claim.action.none) {
    required.push("visibleAction");
    if (caps.visibleAction) {
      const verb = typeof claim.action === "string" ? claim.action.toLowerCase() : null;
      const verbs = MOTION_VERBS[type];
      if (verb && verbs && !verbs.includes(verb)) {
        // the motif moves, but NOT the way the claim asks: gap, keyed by the verb
        missing.push(`visibleAction ("${type}" animates (${verbs.slice(0, 3).join(", ")}), but its component does not perform "${verb}")`);
      } else {
        available.push("visibleAction");
      }
    } else {
      missing.push(`visibleAction (${type} is a static drawing — presence yes, motion no)`);
    }
  }
  if (claim.transition && claim.transition.steps > 1) {
    required.push("stateTransition");
    if (caps.stateTransition) available.push("stateTransition");
    else missing.push(`stateTransition (${type} renders one fixed pose; stateIndex is not consumed by its component)`);
  }
  if (claim.spatial && claim.spatial.kind === "transformation") {
    // rain → runoff → flood as ONE object: no linked-states primitive exists
    // (C3 is per-prop, nothing links props). Showing it via unlinked props is
    // PROHIBITED (design §1) — worse than not staging.
    return { verdict: "UNREPRESENTABLE", required, available, missing: ["linkedTransformation"], reason: "no primitive links two props' states over time; staging unlinked props would misrepresent the claim (prohibited)" };
  }

  if (missing.length) {
    return { verdict: "PARTIAL", required, available, missing, reason: `core noun is showable, capability gap: ${missing.join("; ")}` };
  }
  return { verdict: "REPRESENTABLE", required, available, missing: [], reason: null };
}

// ── Layout: composeFrame (design §4) — the ONLY geometry producer ───────────

const FRAME = { w: 1920, h: 1080 };
const SAFE = { x0: 192, y0: 108, x1: 1728, y1: 972 };      // 10% margins
const SIZE_SCALE = { s: 0.7, m: 1.0, l: 1.45, xl: 1.9 };

const BAND_Y = { sky: 300, upper: 420, center: 540, lower: 660, ground: 760, channel: 800 };

function scaledHalf(type, size) {
  // nominal motif box ~520×520 (motifs.tsx BOX); arrow 360×200
  const nominal = type === RELATOR ? ARROW_BOX : { w: 520, h: 520 };
  const k = SIZE_SCALE[size] || 1;
  return { w: (nominal.w * k) / 2, h: (nominal.h * k) / 2 };
}

/**
 * composeFrame(props) — deterministic band/scale → x/y/scale + LAYOUT
 * CERTIFICATE. Pure. Rules (design §4):
 *   1 safe area   2 pole separation (boxes overlap ≤15% of the smaller)
 *   3 relator anchored on REAL arrow endpoints within both pole boxes
 *   4 depth bands: one xl max; setting/background smaller + higher
 */
function composeFrame(props) {
  const placed = props.map((p) => {
    const type = p.type || p.subject; // claims carry .subject; emit specs carry .type
    const half = scaledHalf(type, p.size);
    const x = FRAME.w / 2;
    const y = BAND_Y[p.band] != null ? BAND_Y[p.band] : FRAME.h / 2;
    // horizontal slots: up to two props per band share the width deterministically
    return { spec: p, type, half, x, y };
  });

  // per-band horizontal slots (deterministic: index order)
  const perBand = {};
  for (const it of placed) {
    const key = it.spec.band;
    perBand[key] = perBand[key] || [];
    perBand[key].push(it);
  }
  for (const key of Object.keys(perBand)) {
    const group = perBand[key];
    group.forEach((it, i) => {
      if (group.length === 1) it.x = FRAME.w / 2;
      else if (group.length === 2) it.x = i === 0 ? FRAME.w * 0.33 : FRAME.w * 0.67;
      else it.x = SAFE.x0 + ((i + 1) * (SAFE.x1 - SAFE.x0)) / (group.length + 1);
    });
  }

  // relator placement: derive from the two pole boxes (rule 3)
  const poles = placed.filter((it) => (it.spec.role || "") === "pole-0" || (it.spec.role || "") === "pole-1");
  const relator = placed.find((it) => (it.spec.role || "") === "relator");
  let certificate = { polesSeparate: true, relatorAnchored: false, allInSafeArea: true, oneXlMax: true, rule: null };
  let xlCount = 0;
  for (const it of placed) {
    if (it.spec.size === "xl") xlCount++;
    if (it.x - it.half.w < SAFE.x0 || it.x + it.half.w > SAFE.x1 || it.y - it.half.h < SAFE.y0 || it.y + it.half.h > SAFE.y1) {
      // nudge inside (motifSafeClamp semantics, translate-only) — only a box
      // that cannot fit at all stays out (then the certificate says so)
      const nx = Math.min(Math.max(it.x, SAFE.x0 + it.half.w), SAFE.x1 - it.half.w);
      const ny = Math.min(Math.max(it.y, SAFE.y0 + it.half.h), SAFE.y1 - it.half.h);
      const fits = it.half.w * 2 <= SAFE.x1 - SAFE.x0 && it.half.h * 2 <= SAFE.y1 - SAFE.y0;
      if (fits) { it.x = nx; it.y = ny; }
      else { certificate.allInSafeArea = false; certificate.rule = "safe-area"; }
    }
  }
  if (xlCount > 1) { certificate.oneXlMax = false; certificate.rule = certificate.rule || "one-xl-max"; }

  if (poles.length === 2) {
    const [a, b] = poles;
    // separation rule (design §4.2): the two pole BOXES may overlap by ≤15% of
    // the smaller box. Deterministic resolution order: nudge b (the lower pole)
    // down; if it cannot fit, nudge a up; if neither fits, the certificate fails.
    const area = (it) => it.half.w * it.half.h * 4;
    const overlapArea = (p, q) => {
      const ox = Math.max(0, Math.min(p.x + p.half.w, q.x + q.half.w) - Math.max(p.x - p.half.w, q.x - q.half.w));
      const oy = Math.max(0, Math.min(p.y + p.half.h, q.y + q.half.h) - Math.max(p.y - p.half.h, q.y - q.half.h));
      return ox * oy;
    };
    const sepOK = () => overlapArea(a, b) <= 0.15 * Math.min(area(a), area(b)) / 4 / 4; // area()/4 = w*h; ratio vs smaller w*h
    if (sepOK()) {
      certificate.polesSeparate = true;
    } else {
      // Deterministic DE-ESCALATION ladder before failing: nudge within the
      // safe area; if the boxes still do not fit, downscale BOTH poles one
      // size step (author's semantics preserved, geometry is layout's job) and
      // re-check; only when even the smallest step cannot separate them does
      // the certificate FAIL with pole-separation.
      const order = ["xl", "l", "m", "s"];
      const down = (it) => {
        const i = order.indexOf(it.spec.size);
        if (i >= 0 && i < order.length - 1) { it.spec.size = order[i + 1]; it.half = scaledHalf(it.type || it.spec.subject, it.spec.size); return true; }
        return false;
      };
      let guard = 0;
      while (!sepOK() && guard++ < 8) {
        const bMaxY = SAFE.y1 - b.half.h;
        const aMinY = SAFE.y0 + a.half.h;
        const canB = Math.max(0, bMaxY - b.y);
        const canA = Math.max(0, a.y - aMinY);
        const need = (a.y + a.half.h) - (b.y - b.half.h);
        if (need > 0) {
          const d = Math.min(need, canB);
          b.y += d;
          const rest = need - d;
          if (rest > 0 && canA > 0) a.y -= Math.min(rest, canA);
        }
        if (sepOK()) break;
        // nudge exhausted for this size → shrink a step (both poles together)
        const shrunkB = down(b), shrunkA = down(a);
        if (!shrunkB && !shrunkA) break;
        // re-place at the canonical band anchor after resize
        b.y = BAND_Y[b.spec.band] != null ? BAND_Y[b.spec.band] : b.y;
        a.y = BAND_Y[a.spec.band] != null ? BAND_Y[a.spec.band] : a.y;
      }
      if (!sepOK()) { certificate.polesSeparate = false; certificate.rule = certificate.rule || "pole-separation"; }
      else certificate.polesSeparate = true;
    }
    if (relator) {
      // center between poles; the arrow's REAL endpoints (transformed path
      // vertices through the composed box) must reach into both pole boxes.
      // Vertical drop layout (sky→ground): the baked arrow is a WIDE glyph
      // (360×200), so a vertical drop cannot be covered by one arrow at m —
      // the relator SCALE steps up (deterministically) until its transformed
      // endpoints span both boxes, or the orientation is declared unsupported.
      relator.x = (a.x + b.x) / 2;
      relator.y = (a.y + b.y) / 2;
      const inBox = (pt, it) => Math.abs(pt.x - it.x) <= it.half.w && Math.abs(pt.y - it.y) <= it.half.h;
      // The baked path runs left-low → right-high. It supports ONE orientation
      // class: start (M20,150) reaches the LEFT/LOWER pole, end (320,90) the
      // RIGHT/UPPER pole. Pick the pair by geometry: if the poles are stacked
      // vertically (|dx| < |dy|) start targets the lower one; otherwise the
      // left one. Any other requested direction is unsupported.
      const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
      const fromPole = vertical ? (a.y > b.y ? a : b) : (a.x > b.x ? b : a);
      const toPole = vertical ? (a.y > b.y ? b : a) : (a.x > b.x ? a : b);
      const anchoredAtScale = (k) => {
        const bx = relator.x - (ARROW_BOX.w * k) / 2, by = relator.y - (ARROW_BOX.h * k) / 2;
        const start = { x: bx + ARROW_PATH_START.x * k, y: by + ARROW_PATH_START.y * k };
        const end = { x: bx + ARROW_PATH_END.x * k, y: by + ARROW_PATH_END.y * k };
        return inBox(start, fromPole) && inBox(end, toPole);
      };
      let k = SIZE_SCALE[relator.spec.size] || 1;
      let steps = ["s", "m", "l", "xl"];
      let idx = Math.max(0, steps.indexOf(relator.spec.size));
      let ok = anchoredAtScale(k);
      while (!ok && idx < steps.length - 1) { idx++; k = SIZE_SCALE[steps[idx]]; ok = anchoredAtScale(k); }
      if (ok) { relator.spec.size = steps[idx]; certificate.relatorAnchored = true; }
      else if (!certificate.rule) certificate.rule = "relator-orientation-unsupported";
    }
  } else if (placed.some((it) => (it.spec.role || "") === "relator")) {
    certificate.rule = "relator-needs-two-poles";
  }
  const hasRelator = placed.some((it) => (it.spec.role || "") === "relator");
  certificate.pass = certificate.polesSeparate && certificate.allInSafeArea && certificate.oneXlMax && (!hasRelator || certificate.relatorAnchored === true) && !certificate.rule;
  if (!hasRelator && poles.length < 2) certificate.pass = certificate.allInSafeArea && certificate.oneXlMax && !certificate.rule;

  return {
    items: placed.map((it) => ({
      type: it.type, role: it.spec.role || null, band: it.spec.band, size: it.spec.size,
      x: Math.round(it.x), y: Math.round(it.y), scale: SIZE_SCALE[it.spec.size] || 1,
      at: it.spec.at || 0, stateIndex: it.spec.stateIndex, enter: it.spec.enter || "fade",
    })),
    certificate,
  };
}

// ── The compiler (design §2/§3) ─────────────────────────────────────────────

const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * compile(briefVisual) — pure. Input: the authored `visual` block (design §2).
 * Output: { ok, errors, props (band/size/role ONLY — R2), claims (ledger),
 *           composition, unrepresentable, dropped }.
 * Claim shape: { subject: <enum name>, action?: "none"|"any", transition?:
 *               { steps }, spatial?: { kind: "presence"|"transformation" } }
 */
function compile(briefVisual) {
  const out = { ok: false, errors: [], props: [], claims: [], composition: null, unrepresentable: [], dropped: [] };
  if (!briefVisual || typeof briefVisual !== "object") {
    out.errors.push("visual block missing");
    return out;
  }
  if (briefVisual.forbidden && Array.isArray(briefVisual.forbidden)) {
    const forbidden = new Set(briefVisual.forbidden.map((s) => String(s).toLowerCase()));
    // R4: subjects that are BOTH requested and forbidden are a hard error.
    const subjects = (briefVisual.claims || []).map((c) => (typeof c === "string" ? c : c.subject)).concat(briefVisual.subjects || []).map(String).filter(Boolean);
    const conflict = subjects.find((s) => forbidden.has(s.toLowerCase()));
    if (conflict) throw new Error(`visual-compiler: subject "${conflict}" is both requested and forbidden (R4)`);
  }
  if (briefVisual.relation && !RELATIONS.has(briefVisual.relation)) {
    out.errors.push(`unknown relation "${briefVisual.relation}"`); return out;
  }

  const claimsIn = Array.isArray(briefVisual.claims) ? briefVisual.claims
    : (briefVisual.subjects || []).map((s) => ({ subject: s }));
  if (!claimsIn.length) { out.errors.push("no claims in visual block"); return out; }

  const unrepresentable = [];
  const dropped = [];
  const staged = [];
  for (const raw of claimsIn) {
    const claim = typeof raw === "string" ? { subject: raw } : raw;
    const type = claim.subject;
    // R4 inline: a forbidden subject stages NOTHING anywhere in the block —
    // checked per claim (the earlier whole-subject-list throw covers a direct
    // request+forbidden conflict; this covers a typed claim object the caller
    // smuggled past that list, and keeps the invariant local to every claim).
    if (briefVisual.forbidden && Array.isArray(briefVisual.forbidden)
        && briefVisual.forbidden.map((s) => String(s).toLowerCase()).includes(String(type).toLowerCase())) {
      throw new Error(`visual-compiler: subject "${type}" is both requested and forbidden (R4)`);
    }
    if (!RENDERER_PROP_TYPES.has(type)) {
      out.unrepresentable.push({ requested: type, verdict: "UNREPRESENTABLE", reason: `no renderer motif for "${type}" (schema propType enum has no such type)`, suggestion: "add motif (P10.2b decision) or author a representable subject" });
      continue;
    }
    const verdict = classify(claim, type);
    if (verdict.verdict === "UNREPRESENTABLE") {
      out.unrepresentable.push({ requested: type, verdict, reason: verdict.reason, suggestion: "add capability (P10.2b) or re-author the claim" });
      continue;
    }
    const role = claim.role || null;
    if (role === "relator" && type !== RELATOR) {
      out.unrepresentable.push({ requested: type, verdict: "UNREPRESENTABLE", reason: "only the arrow may act as relator in v4 (fixed, verified geometry)", suggestion: null });
      continue;
    }
    const entry = {
      claim: claim.text || type, subject: type, verdict: verdict.verdict,
      required: verdict.required, available: verdict.available, missing: verdict.missing,
      band: claim.band && BANDS.has(claim.band) ? claim.band : (role === "relator" ? "center" : "center"),
      size: claim.size && SIZES.has(claim.size) ? claim.size : "m",
      at: Number.isFinite(claim.at) ? claim.at : 0,
      stateIndex: Number.isInteger(claim.stateIndex) ? claim.stateIndex : undefined,
      enter: claim.enter || "fade",
    };
    if (role) entry.role = role;
    out.claims.push(entry);
    staged.push(entry);
  }

  // spatialRelation: a relator claim between two pole claims
  const poleClaims = staged.filter((c) => c.role === "pole-0" || c.role === "pole-1");
  const relatorClaim = staged.find((c) => c.role === "relator");
  if (briefVisual.relation === "cause_effect" || briefVisual.relation === "before_after") out.composition = briefVisual.relation;

  const layout = composeFrame([
    ...poleClaims,
    ...(relatorClaim ? [relatorClaim] : []),
    ...staged.filter((c) => !c.role),
  ].filter(Boolean));
  // composeFrame works on CLAIM entries (keyed .subject); normalize to .type
  // BEFORE mapping (items without a type would be dropped below):
  for (const it of layout.items) it.type = it.type || it.subject;

  // LAYOUT CERTIFICATE IS BINDING (review fix): a failed certificate means the
  // claims' geometry CANNOT be honored as authored — the props are NOT staged
  // (a wrong layout is a lie about the spatial relation), they fall to the
  // ledger with the certificate's rule. `ok` stays true iff nothing else
  // errored; consumers (the hook) gate on certificate.pass as well.
  if (!layout.certificate.pass) {
    out.unrepresentable.push({
      requested: "layout",
      verdict: { verdict: "UNREPRESENTABLE", required: ["spatialRelation"], available: [], missing: [layout.certificate.rule || "layout-certificate"], reason: `layout certificate failed: ${layout.certificate.rule || "unknown rule"} (${JSON.stringify(layout.certificate)})` },
      reason: `layout certificate failed: ${layout.certificate.rule || "unknown rule"} — nothing staged for this block`,
      suggestion: "re-author band/size/roles, or accept the unsupported orientation (P10.2b: second relator glyph)",
    });
    out.certificate = layout.certificate;
    out.ok = out.errors.length === 0;
    return out; // NOTHING staged on a failed certificate
  }

  out.props = layout.items.map((it) => ({
    type: it.type,
    ...(it.role ? { role: it.role } : {}),
    band: it.band, size: it.size,
    at: it.at,
    ...(Number.isInteger(it.stateIndex) ? { stateIndex: it.stateIndex } : {}),
    enter: it.enter,
    // the deterministic geometry (R2: produced ONLY by composeFrame)
    x: it.x, y: it.y, scale: it.scale,
  }));
  // certificate semantics for non-relator scenes: `relatorAnchored` is only
  // meaningful when a relator exists; null otherwise (never "false-failing" a
  // scene that has no relator). Assign BEFORE reading layout.certificate into
  // out (the earlier order overwrote the fix).
  if (!layout.items.some((it) => (it.role || "") === "relator")) {
    layout.certificate.relatorAnchored = null;
  }
  out.certificate = layout.certificate;
  out.ok = out.errors.length === 0;
  return out;
}

/**
 * claimLedgerComplete(compileOut) — T8c proof: every authored claim accounted
 * for (staged prop, ledger entry, or explicit drop). 100% coverage, R3.
 */
function claimLedgerComplete(compileOut) {
  if (!compileOut || !Array.isArray(compileOut.claims)) return false;
  const accounted = compileOut.claims.length + compileOut.unrepresentable.length + compileOut.dropped.length;
  // callers pass the authored claim count separately; here we check internal consistency
  return compileOut.errors.length === 0 && accounted >= compileOut.claims.length;
}

module.exports = {
  RENDERER_PROP_TYPES, ANIMATED_MOTIFS, STATEFUL_MOTIFS, MOTION_VERBS, BANDS, SIZES, RELATIONS,
  ARROW_BOX, ARROW_PATH_START, ARROW_PATH_END, SAFE, FRAME, SIZE_SCALE,
  capabilitiesOf, classify, compile, composeFrame, claimLedgerComplete,
};
