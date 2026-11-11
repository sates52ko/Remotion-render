/**
 * proposition-loss.js — P9-A O1/O2: the single machine-readable taxonomy of
 * "the author gave the engine meaning, and the engine lost it".
 *
 * P9-A.1 scope (operator, 2026-10-06): DROPPED is HARD — author-given meaning
 * that never reached the screen fails the authorship gate for unfrozen books.
 * UNSTAGED stays REPORT until the detector proves its precision on a gold set
 * (P9-B); a regex that flags a beat that is actually fine must never stop a
 * build. Flip UNSTAGED with this one line only after that proof.
 *
 * Consumers:
 *   - scripts/lib/antidote-director.js  (worldAllowed refusal → DROPPED)
 *   - scripts/gate-authorship.js        (hard gate + report summary)
 *   - scripts/p9a-proposition-telemetry.js (O3, reads the recorded events)
 */

const fs = require("fs");
const path = require("path");

/** Where events are recorded (per book, report-only; never a frozen book). */
const REPORT_PATH = (bookDir) => path.join(bookDir, "proposition-loss.report.json");

/**
 * The whole P9-A proposition-loss taxonomy. A code never appears on a report
 * without an entry here, and every entry names whether it is author-meaning
 * (DROPPED) or a detector-only observation (UNSTAGED).
 */
const CODES = {
  CONCEPT_REFUSED: {
    class: "DROPPED",
    what: "authored concept refused by the engine",
    detail: "An authored `concept` (art file / Claude brief) named a drawable scene icon, and the engine dropped it because the book's visualProvenance vocabulary does not list it. The author's meaning never reached the screen and the planner never said why.",
  },
  ONSCREEN_TEXT_REJECTED: {
    class: "DROPPED",
    what: "authored onScreenText failed the screen-text checker",
    detail: "The author wrote storyboard.onScreenText; the V5 bridge refused to render it (checker code attached). The authored line is dropped, loudly, at plan time.",
  },
  PROPOSITION_DROPPED: {
    class: "DROPPED",
    what: "authored relation lost between authoring and screen",
    detail: "The author tagged this beat contrast / cause / said-vs-real and the staged composition carries only one side (or neither) of the relation.",
  },
  PROPOSITION_UNSTAGED: {
    class: "UNSTAGED",
    what: "detector-only relation, one pole staged",
    detail: "A relation the DETECTOR (not the author) claims, with only one pole staged. Report-only: P9-B's proposition schema is the reliable way to author this.",
  },
  FORBIDDEN_OBJECT_STAGED: {
    class: "REPORT",
    what: "an object on the beat's authored forbidden list reached the final scene",
    detail: "P10.2a final-scene sweep: a staged prop's type (or its visual claim) matches the brief's `visual.forbidden` list. Caught for ALL writers (Director, strategy, visual compiler). REPORT first — the operator flips GATE_POLICY.FORBIDDEN_OBJECT to HARD when ready.",
  },
};

/** DROPPED = the gate stops the build; UNSTAGED = report-only (P9-B hardens). */
const GATE_POLICY = { DROPPED: "HARD", UNSTAGED: "REPORT", FORBIDDEN_OBJECT: "REPORT" }; // P10.2a: REPORT first — operator flips to HARD

function severityFor(code) {
  const spec = CODES[code];
  if (!spec) return "UNKNOWN";
  if (code === "FORBIDDEN_OBJECT_STAGED") return GATE_POLICY.FORBIDDEN_OBJECT; // P10.2a
  if (spec.class === "DROPPED" && GATE_POLICY.DROPPED === "HARD") return "HARD";
  if (spec.class === "UNSTAGED" && GATE_POLICY.UNSTAGED === "HARD") return "HARD";
  return "REPORT";
}

/** Validate + normalize one event. Unknown codes throw — the taxonomy is closed. */
function makePropositionLossEvent(code, { sceneId = null, engine = null, message = "", data = null } = {}) {
  if (!CODES[code]) throw new Error(`proposition-loss: unknown code "${code}" (taxonomy is closed)`);
  return {
    code,
    class: CODES[code].class,
    severity: severityFor(code),
    sceneId,
    engine,
    message: String(message || CODES[code].what),
    data: data && typeof data === "object" ? data : null,
  };
}

/**
 * Record events for a book. Report-only in P9-A: writes the per-book report
 * (never into a frozen book folder — its folder is the record of what shipped)
 * and returns the written/merged document.
 */
function recordPropositionLoss(bookDir, slug, events, { frozen = false } = {}) {
  const doc = {
    slug,
    generatedAt: new Date().toISOString(),
    gatePolicy: { ...GATE_POLICY },
    counts: {},
    events: [],
  };
  try {
    const prev = JSON.parse(fs.readFileSync(REPORT_PATH(bookDir), "utf8"));
    if (prev && prev.slug === slug && Array.isArray(prev.events)) doc.events = prev.events;
  } catch {}
  for (const e of events) {
    const ev = e && e.code ? e : makePropositionLossEvent(String(e), {});
    doc.events.push(ev);
    doc.counts[ev.code] = (doc.counts[ev.code] || 0) + 1;
  }
  doc.total = doc.events.length;
  if (!frozen) {
    try { fs.writeFileSync(REPORT_PATH(bookDir), JSON.stringify(doc, null, 2) + "\n"); } catch {}
  }
  return doc;
}

/** The one summary line O3 and make-book print. */
function propositionLossSummary(doc) {
  if (!doc || !doc.events) return "proposition-loss: no report";
  const parts = Object.entries(doc.counts).map(([code, n]) => `${code}:${n}`);
  return `proposition-loss: ${doc.total} event(s)${parts.length ? " — " + parts.join(", ") : ""}`;
}

module.exports = { CODES, GATE_POLICY, severityFor, makePropositionLossEvent, recordPropositionLoss, propositionLossSummary, REPORT_PATH };
