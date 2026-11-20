/**
 * ancient-world.js — ONE answer to "is this book set in classical antiquity?".
 *
 * Antiquity books get agora/colonnade sets and modern sets/props are banned. The
 * old per-file regexes matched the GENRE LABEL ("classics", "history",
 * "philosophy"), so a modern classic (Fahrenheit 451, 1984), a WWII history or a
 * Camus essay lost bedrooms, highways and hospitals (for-review 2026-09-24).
 * Decide from the book's WORLD instead:
 *   1. a known era/year (story bible world.approxYear, book.json engineProfile.era,
 *      config.meta.era) decides: before 600 CE = ancient;
 *   2. else a story-bible era string naming antiquity;
 *   3. else an explicit antiquity word in the genre or an ancient author.
 * "classics", "classic", "history" and "philosophy" alone are NOT antiquity.
 */
const ANCIENT_GENRE = /\b(ancient|antiquity|stoic|stoicism|greek|roman|hellenistic|classical antiquity)\b/;
const ANCIENT_AUTHOR = /plato|socrates|aristotle|marcus aurelius|seneca|epictetus|homer|virgil|ovid|sophocles|herodotus|thucydides/;

function isAncientWorld({ genre, author, bible, era } = {}) {
  const w = (bible && bible.world) || {};
  const year = [w.approxYear, era].map((y) => (y == null || y === "" ? NaN : Number(y))).find((y) => Number.isFinite(y));
  if (year != null) return year < 600;
  const eraStr = String(w.era || "").toLowerCase();
  if (/ancient|antiquity|classical (greece|rome|athens)/.test(eraStr)) return true;
  return ANCIENT_GENRE.test(String(genre || "").toLowerCase()) || ANCIENT_AUTHOR.test(String(author || "").toLowerCase());
}

module.exports = { isAncientWorld };
