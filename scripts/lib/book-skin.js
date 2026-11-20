/**
 * book-skin.js — every book has its own graphic hand (2026-11-18, YPP "generic or repetitive content").
 *
 * The subtitle box, the name plate and the typeface were one design for the whole channel — on screen for every
 * second of every film. A book's SKIN is a deterministic choice on three axes (how the subtitles are set / how a
 * name plate is cut / which typeface speaks), farthest from the last eight books, recorded in book.json (`skin`),
 * carried into config.meta.skin by the planner and drawn by src/engines/antidote/components/skin.tsx. The channel's
 * old look (box / dark / poppins) is one of the combinations; a book without a skin is drawn in it, as before.
 *
 * It dresses the words; it never moves or resizes them. Pure and deterministic: no LLM, no clock.
 */
const crypto = require("crypto");

const AXES = {
  caption: { box: "a rounded dark box", paper: "a paper card with a hard shadow, dark words", bar: "a square dark strip standing on a rule in the book's colour", tape: "a square dark strip with a flag in the book's colour" },
  plate: { dark: "a rounded dark plate", paper: "a paper label with an ink border", sharp: "a square dark plate", accent: "a plate in the book's colour" },
  font: { poppins: "Poppins (geometric sans)", serif: "Playfair Display (serif)", condensed: "Oswald (condensed sans)", slab: "Roboto Slab" },
};
const hash = (s) => parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);
const validSkin = (s) => !!s && Object.keys(AXES).every((a) => Object.prototype.hasOwnProperty.call(AXES[a], s[a]));
/** what a viewer notices first weighs most: the subtitles are always on screen */
const distance = (a, b) => (a.caption !== b.caption ? 3 : 0) + (a.font !== b.font ? 2 : 0) + (a.plate !== b.plate ? 1 : 0);

function candidates() {
  const out = [];
  for (const caption of Object.keys(AXES.caption)) for (const plate of Object.keys(AXES.plate)) for (const font of Object.keys(AXES.font)) out.push({ caption, plate, font });
  return out;
}

/**
 * pickSkin({ slug, recent }) → { caption, plate, font }
 *   recent: the skins of the books before this one, newest first (up to 8 are used; newer ones weigh more).
 * Never the newest book's subtitles or typeface again, never a full combination from the window; the rest by the
 * weighted distance, ties by the slug (stable for a book, different between books).
 */
function pickSkin({ slug, recent = [] } = {}) {
  const win = recent.filter(validSkin).slice(0, 8);
  let best = null;
  for (const c of candidates()) {
    if (win[0] && (win[0].caption === c.caption || win[0].font === c.font)) continue;
    if (win.some((r) => distance(r, c) === 0)) continue;
    const score = win.reduce((s, r, i) => s + distance(r, c) * (win.length - i), 0), tie = hash(`${slug}|${c.caption}|${c.plate}|${c.font}`);
    if (!best || score > best.score || (score === best.score && tie > best.tie)) best = { ...c, score, tie };
  }
  if (!best) { const all = candidates(); best = all[hash(slug) % all.length]; }
  return { caption: best.caption, plate: best.plate, font: best.font };
}

/** "paper/sharp/serif" → a skin (an agent's or the operator's explicit choice), or null */
function parseSkin(s) {
  const [caption, plate, font] = String(s || "").split(/[\/:,]/).map((x) => x.trim());
  const o = { caption, plate, font };
  return validSkin(o) ? o : null;
}
const describe = (s) => `${AXES.caption[s.caption]} · ${AXES.plate[s.plate]} · ${AXES.font[s.font]}`;

module.exports = { AXES, candidates, distance, pickSkin, validSkin, parseSkin, describe };
