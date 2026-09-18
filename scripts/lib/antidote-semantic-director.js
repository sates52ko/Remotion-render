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

// ── Conceptual Punches for Non-Fiction & Book Summaries ───────────────────────
// When a beat would otherwise echo spoken words, supply a complementary conceptual anchor:
const CONCEPT_ANCHORS = [
  [/\b(anger|wrath|yelling|screaming|slams?|furious|mad)\b/i, "REACTIVE DEFAULT", "EMOTIONAL FRICTION"],
  [/\b(fire|emergency|alarm|urgent|crisis|panic)\b/i, "FALSE URGENCY", "THE FIVE-ALARM TRAP"],
  [/\b(blind|blinded|ignore|denial|avoid)\b/i, "SURFACE vs REALITY", "THE BLIND SPOT"],
  [/\b(conscious|brain|mind|thinking|think)\b/i, "THE PASSENGER SEAT", "SYSTEM 1 vs SYSTEM 2"],
  [/\b(rule|ground rule|foundation|principle)\b/i, "CORE PRINCIPLE", "FIRST PRINCIPLES"],
  [/\b(boss|ceo|executive|leader|hierarchy)\b/i, "AUTHORITY BIAS", "STATUS ANXIETY"],
  [/\b(job|career|workplace|promote|salary)\b/i, "CAREER LEVERAGE", "SHORT-TERM ILLUSION"],
  [/\b(phone|scroll|app|distract|screen)\b/i, "DOPAMINE LOOP", "ATTENTION CAPTURE"],
  [/\b(habit|routine|compound|small|daily)\b/i, "1% COMPOUND", "TRAJECTORY > POSITION"],
  [/\b(money|wealth|save|invest|rich|dollar)\b/i, "NET WORTH vs FREEDOM", "THE HIDDEN COST"],
  [/\b(procrastinat|delay|later|tomorrow|put off)\b/i, "EMOTIONAL AVOIDANCE", "TASK FRICTION"],
  [/\b(fail|failure|mistake|lose|lost)\b/i, "OUTCOME vs PROCESS", "FEEDBACK LOOP"],
  [/\b(ego|pride|defend|prove|admit)\b/i, "DEFENDING STATUS", "EGO PROTECTION"],
  [/\b(speed|fast|hurry|rush|slow)\b/i, "MOTION ≠ PROGRESS", "STRATEGIC SLOWNESS"],
];

function deriveComplementaryPunch(narration, rawCallout) {
  if (!rawCallout) return null;
  const voWords = cleanWords(narration);
  const voWordSet = new Set(voWords);
  const callWords = cleanWords(rawCallout);

  let matches = 0;
  for (const cw of callWords) {
    if (voWordSet.has(cw)) matches++;
  }
  const overlap = callWords.length > 0 ? matches / callWords.length : 0;

  // If callout is already complementary (overlap < 40%), preserve it!
  if (overlap < 0.4) {
    return rawCallout.toUpperCase();
  }

  // Otherwise, rewrite to eliminate parrot echo
  for (const [re, primary, secondary] of CONCEPT_ANCHORS) {
    if (re.test(narration) || re.test(rawCallout)) {
      return (rawCallout.length % 2 === 0 ? primary : secondary).toUpperCase();
    }
  }

  // Fallback: create contrast or quantification punch
  if (/\b(not|never|instead|wrong|mistake)\b/i.test(narration)) {
    return "NOT WHAT IT SEEMS";
  }
  if (/\b(every|all|most|people)\b/i.test(narration)) {
    return "THE 99% DEFAULT";
  }
  if (/\b(key|secret|truth|real)\b/i.test(narration)) {
    return "THE HIDDEN MECHANISM";
  }

  return "CRITICAL DISTINCTION";
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
  const texts = (scene.texts || []).map((t, ti) => {
    if (isTitle && ti === 0) return t; // preserve book title
    const newPunch = deriveComplementaryPunch(narration, t.text);
    return {
      ...t,
      text: newPunch || t.text,
      style: t.style === "plain" ? "box" : t.style, // ensure punches pop
    };
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
