/**
 * antidote-semantic-director.js — Semantic Visual Alignment & Three-Layer Engine
 *
 * Enforces the Three-Layer Rule:
 *   VO (What is said) ≠ Visual (Metaphor / Narrative State) ≠ Text (Complementary Anchor / Punch)
 *
 * Eliminates "Illustrated Radio":
 *   1. Assigns a functional visualJob from the sequence curiosity arc.
 *   2. Generates dynamic visualArc state progression (startState → transformation → endState).
 *   3. Assigns attention milestones for fluid eye direction.
 *   4. Rewrites parrot text callouts into high-retention complementary punches (contrasts, data, concepts).
 */

const { CONCEPT_LEXICON } = require("./antidote-director");

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "of", "to", "in", "on", "at", "for",
  "with", "as", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "this", "that", "these", "those", "we", "you", "they", "i", "he", "she", "him",
  "her", "his", "hers", "their", "theirs", "our", "ours", "your", "yours", "my",
  "mine", "me", "us", "them", "just", "like", "really", "very", "much", "more",
  "most", "about", "into", "from", "than", "then", "now", "here", "there", "what",
  "how", "why", "who", "whom", "when", "which", "while", "where", "whose", "not",
  "no", "yes", "can", "could", "would", "should", "will", "shall", "may", "might",
  "must", "do", "does", "did", "done", "have", "has", "had", "get", "got", "gets",
  "going", "gonna", "kind", "sort", "thing", "things", "stuff", "okay", "ok",
  "yeah", "right", "mean", "know", "think", "say", "said", "says", "one", "two",
  "also", "even", "still", "because", "though", "although", "if", "whether"
]);

function cleanWords(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// ── Complementary punch (2026-09-23 screen-text gate) ─────────────────────────
// This used to swap any callout that echoed the narration for a CONCEPT_ANCHORS
// constant ("AUTOMATIC PILOT" whenever the narrator said "think") or a canned
// fallback ("WHAT ACTUALLY CHANGES" ×53 in show-your-work) — strings about no
// book in particular. A spoken key phrase on screen is coherent reinforcement;
// an unrelated slogan is the "narration vs screen mismatch" viewers see. Now:
// keep the callout when it is readable copy, otherwise write NOTHING.
const screenText = require("./screen-text");
const READABILITY_CODES = new Set(["CONSTANT_TEMPLATE", "FILLER_TOKEN", "FRAGMENT", "LENGTH", "EMPTY"]);

function deriveComplementaryPunch(narration, rawCallout) {
  if (!rawCallout) return null;
  const problems = screenText.checkString(rawCallout, { kind: "text" }).filter((v) => READABILITY_CODES.has(v.code));
  if (problems.length) return null;
  // A long callout that merely re-types the sentence adds nothing; a short
  // echo (the key phrase) is kept. Grounding is judged later by the gate on
  // the scene's full caption window.
  const voWordSet = new Set(cleanWords(narration));
  const callWords = cleanWords(rawCallout);
  const overlap = callWords.length ? callWords.filter((w) => voWordSet.has(w)).length / callWords.length : 0;
  if (overlap >= 0.4 && callWords.length > 3) return null;
  return String(rawCallout).toUpperCase();
}

/**
 * Assigns visualJob, visualArc, attention milestones, and non-redundant text.
 */
function directSemanticBeat({ scene, sequenceRole, narrativeFunction, index, totalScenes }) {
  const narration = scene._narration || "";
  const isTitle = index === 0;

  // 1. Visual Job (Story Function → Visual Job mapping)
  let visualJob = "explain";
  if (narrativeFunction) {
    switch (narrativeFunction) {
      case "HOOK":
        visualJob = "surprise";
        break;
      case "QUESTION":
        visualJob = /\b(vs|or|instead|however)\b/i.test(narration) ? "contrast" : "surprise";
        break;
      case "CONTRADICTION":
        visualJob = "contrast";
        break;
      case "TENSION":
        visualJob = "escalate";
        break;
      case "REVEAL":
        visualJob = "reveal";
        break;
      case "PAYOFF":
        visualJob = "reinforce";
        break;
      case "TRANSITION":
        visualJob = "ground";
        break;
      case "REFLECTION":
        visualJob = "reinforce";
        break;
      case "SETUP":
        visualJob = "ground";
        break;
      case "EXPLANATION":
      default:
        visualJob = /\b(\d+|percent|rate|scale|compounds?)\b/i.test(narration) ? "quantify" : "explain";
        break;
    }
  } else {
    switch (sequenceRole) {
      case "setup":
        visualJob = isTitle ? "ground" : "ground";
        break;
      case "question":
        visualJob = /\b(vs|or|instead|however)\b/i.test(narration) ? "contrast" : "surprise";
        break;
      case "partial_answer":
        visualJob = /\b(\d+|percent|rate|scale)\b/i.test(narration) ? "quantify" : "demonstrate";
        break;
      case "complication":
        visualJob = "escalate";
        break;
      case "reveal":
        visualJob = "reveal";
        break;
      default:
        visualJob = "reinforce";
        break;
    }
  }

  // 2. Visual Arc (State Progression)
  let visualArc = {
    startState: "normal",
    endState: "normal",
    transformation: "none",
  };

  switch (visualJob) {
    case "escalate":
      visualArc = {
        startState: "under_control",
        endState: "overwhelmed",
        transformation: "overload",
      };
      break;
    case "reveal":
      visualArc = {
        startState: "surface_facade",
        endState: "underlying_reality",
        transformation: "reveal_truth",
      };
      break;
    case "quantify":
      visualArc = {
        startState: "single_point",
        endState: "compound_tower",
        transformation: "grow",
      };
      break;
    case "contrast":
      visualArc = {
        startState: "default_path",
        endState: "intentional_path",
        transformation: "shift_focus",
      };
      break;
    case "surprise":
      visualArc = {
        startState: "apparent_security",
        endState: "sudden_fracture",
        transformation: "shrink",
      };
      break;
    default:
      if (index % 3 === 0 && !isTitle) {
        visualArc = {
          startState: "stable",
          endState: "focused",
          transformation: "grow",
        };
      }
      break;
  }

  // 3. Attention Milestones
  let attention = ["character", "motif", "text"];
  if (scene.shot === "twoShot" || scene.shot === "split" || scene.shot === "overShoulder") {
    attention = ["partner", "motif", "text"];
  } else if (scene.shot === "insert" || (scene.characters && scene.characters.length === 0)) {
    attention = ["motif", "text"];
  } else if (visualJob === "reveal") {
    attention = ["character", "text", "motif"];
  }

  // 4. Three-Layer Complementary Text Punch
  const texts = (scene.texts || []).flatMap((t, ti) => {
    if (isTitle && ti === 0) return [t]; // preserve book title
    // Authored copy (art file) is a human decision about this beat — never rewritten.
    if (t.src === "art") return [t];
    const newPunch = deriveComplementaryPunch(narration, t.text);
    if (!newPunch) return []; // unreadable → silent frame, not a slogan
    return [{
      ...t,
      text: newPunch,
      style: t.style === "plain" ? "box" : t.style, // ensure punches pop
    }];
  });

  return {
    visualJob,
    visualArc,
    attention,
    texts,
  };
}

module.exports = {
  directSemanticBeat,
  deriveComplementaryPunch,
  cleanWords,
};
