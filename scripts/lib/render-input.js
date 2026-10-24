/**
 * render-input.js — the book config AS THE RENDER RUNNER RENDERS IT, and one hash over it.
 *
 * Two transport steps rewrite the config file between the operator's machine and the pixels, on purpose:
 *   - render-bundle.js points meta.audio at the RAW narration (the mastered file is gitignored, never bundled);
 *   - render-video.yml runs `master-audio.js --update-config`, which masters that raw file and points
 *     meta.audio at `<same name>.mastered.m4a`, re-serialising the JSON (no trailing newline).
 * So the config BYTES on the runner differ from the bytes the operator accepted, even though nothing the viewer
 * sees changed. A quality-debt decision bound to the bytes (render-preflight.js configHash) was refused on every
 * segment (icebreaker 2026-10-23: 67244c9ab51fb08c -> be58ed93dfcdb3b2).
 *
 * renderInputHash() hashes the parsed config with exactly those two differences normalised:
 *   - JSON formatting (whitespace, trailing newline) — not a render input;
 *   - meta.audio raw <-> its own mastered file (`x.m4a` <-> `x.mastered.m4a`, the name master-audio writes).
 * Anything else — another audio file, a scene, a timing, a key order, any field — is a different hash.
 * masteredAudioPath() is the one naming rule; master-audio.js uses it for its output file.
 */
const crypto = require("crypto");

const MASTERED_RE = /\.mastered\.m4a$/i;

/** The file master-audio writes for a raw narration path (a mastered path is returned unchanged). */
function masteredAudioPath(p) {
  if (typeof p !== "string") return p;
  return MASTERED_RE.test(p) ? p : p.replace(/\.[a-z0-9]+$/i, ".mastered.m4a");
}

function isMasteredAudio(p) { return typeof p === "string" && MASTERED_RE.test(p); }

/** sha256 (16 hex) of the config the runner renders: audio on its mastered file, formatting ignored. */
function renderInputHash(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const c = JSON.parse(JSON.stringify(cfg));
  if (c.meta && typeof c.meta.audio === "string") c.meta.audio = masteredAudioPath(c.meta.audio);
  return crypto.createHash("sha256").update(JSON.stringify(c)).digest("hex").slice(0, 16);
}

/**
 * The runner's config rewrite (master-audio.js --update-config): config text in, text with meta.audio = newAudio
 * out, serialised as master-audio always has (2-space JSON, no trailing newline). Returns changed=false and the
 * text untouched when meta.audio already names newAudio.
 */
function withAudio(text, newAudio) {
  const cfg = JSON.parse(text);
  const old = cfg.meta.audio;
  if (old === newAudio) return { text, old, changed: false };
  cfg.meta.audio = newAudio;
  return { text: JSON.stringify(cfg, null, 2), old, changed: true };
}

module.exports = { MASTERED_RE, masteredAudioPath, isMasteredAudio, renderInputHash, withAudio };
