/**
 * scripts/lib/typesafe.js
 *
 * TypeSafe AI helpers for the Vox pipeline.
 *
 * Two exported async functions:
 *   classifyBeats(beatTexts, { title, genre })
 *     → string[]   one archetype per beat, same order
 *
 *   isPicturableBatch(beatTexts)
 *     → boolean[]  one flag per beat
 *
 * Both functions:
 *  - batch all inputs into a single TypeSafe request (parallel questions)
 *  - fall back to null on any error, letting callers use their existing heuristics
 *  - no-op and return null when TYPESAFE_API_KEY is absent
 */

const BEAT_ARCHETYPES = [
  "title",
  "statement",
  "list",
  "checklist",
  "quote",
  "stat",
  "chart",
  "timeline",
  "trendline",
  "flow",
  "dataviz",
  "network",
  "map",
  "polaroid",
  "imagefocus",
  "question",
  "punchline",
  "place",
  "document",
  "compare",
];

// Lazy-initialised client (avoids import cost when key is absent)
let _client = null;
function client() {
  if (_client) return _client;
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  try {
    const { TypeSafeClient } = require("@typesafe-ai/sdk");
    _client = new TypeSafeClient({ apiKey: key });
    return _client;
  } catch (e) {
    console.warn("[typesafe] SDK not available:", e.message);
    return null;
  }
}

/**
 * Classify up to ~200 beats per call.
 * Returns an array of archetype strings (same length as beatTexts), or null on failure.
 */
async function classifyBeats(beatTexts, { title = "", genre = "" } = {}) {
  const c = client();
  if (!c || !beatTexts.length) return null;

  const { choice } = require("@typesafe-ai/sdk");

  // Build one Choice question per beat, keyed by index
  const questions = {};
  beatTexts.forEach((text, i) => {
    questions[`beat_${i}`] = choice(
      `What is the best visual archetype for this narration beat from the book "${title}" (genre: ${genre})? ` +
      `The beat text is: "${text.slice(0, 300)}"`,
      Object.fromEntries(BEAT_ARCHETYPES.map((a) => [a, null]))
    );
  });

  try {
    const resp = await c.systemOne({
      state: { title, genre },
      questions,
    });
    return beatTexts.map((_, i) => resp.answers[`beat_${i}`]?.choice ?? null);
  } catch (e) {
    console.warn("[typesafe] classifyBeats error:", e.message);
    return null;
  }
}

/**
 * Decide whether each beat has a picturable subject (worth a Flux image).
 * Returns boolean[], or null on failure.
 */
async function isPicturableBatch(beatTexts) {
  const c = client();
  if (!c || !beatTexts.length) return null;

  const { noul } = require("@typesafe-ai/sdk");

  const questions = {};
  beatTexts.forEach((text, i) => {
    questions[`pic_${i}`] = noul(
      `Does this narration beat describe a concrete, visual subject — a specific person, place, object, or scene — ` +
      `that can be meaningfully illustrated with a photograph or illustration? ` +
      `Beat: "${text.slice(0, 300)}"`
    );
  });

  const PICTURABLE_THRESHOLD = 0.60;

  try {
    const resp = await c.systemOne({
      state: {},
      questions,
    });
    return beatTexts.map((_, i) => {
      const ans = resp.answers[`pic_${i}`];
      // Noul responses use .noul (not .probability)
      const prob = ans?.noul ?? ans?.probability;
      return prob != null ? prob >= PICTURABLE_THRESHOLD : null;
    });
  } catch (e) {
    console.warn("[typesafe] isPicturableBatch error:", e.message);
    return null;
  }
}

module.exports = { classifyBeats, isPicturableBatch };
