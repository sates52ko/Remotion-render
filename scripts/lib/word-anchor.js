/**
 * word-anchor.js — the frame a SPOKEN WORD starts on, for a stance change that must never come early (10x P2, 2026-10-27).
 *
 * plan-antidote's anchorAt() is right for copy (a callout may lead its word by 4 frames, a late cue is pulled earlier
 * so it holds, and a phrase that does not match falls back to its first word). A REJECTION is different: the picture
 * must not reject a claim before the narrator does. anchorOnWord is strict: the exact contiguous phrase, its Nth
 * occurrence in THIS beat, no lead, no clamp, no fallback — null when it is not spoken here (the caller then draws
 * nothing for that stage, it never guesses).
 */
const normw = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * @param scene { words: [{w, s}] (absolute frames), from: absolute frame of the scene start }
 * @param phrase words to find (exact, contiguous, normalised)
 * @param opts { occurrence = 1, lag = 0, durationFrames }
 * @returns scene-local frame (word start + lag) or null
 */
function anchorOnWord(scene, phrase, { occurrence = 1, lag = 0, durationFrames = Infinity } = {}) {
  if (!phrase || !scene || !Array.isArray(scene.words) || !scene.words.length) return null;
  const want = String(phrase).split(/\s+/).map(normw).filter(Boolean);
  if (!want.length || occurrence < 1) return null;
  const said = scene.words.map((w) => normw(w.w));
  let seen = 0;
  for (let i = 0; i + want.length <= said.length; i++) {
    if (!want.every((w, k) => said[i + k] === w)) continue;
    if (++seen < occurrence) continue;
    const f = scene.words[i].s - scene.from + lag;
    return f >= 0 && f < durationFrames ? f : null;
  }
  return null;
}

/** how many times the phrase is spoken in the beat (merge: a cue must name an occurrence that exists) */
function occurrences(scene, phrase) {
  if (!phrase || !scene || !Array.isArray(scene.words)) return 0;
  const want = String(phrase).split(/\s+/).map(normw).filter(Boolean);
  const said = scene.words.map((w) => normw(w.w));
  let n = 0;
  for (let i = 0; want.length && i + want.length <= said.length; i++) if (want.every((w, k) => said[i + k] === w)) n++;
  return n;
}

module.exports = { anchorOnWord, occurrences, normw };
