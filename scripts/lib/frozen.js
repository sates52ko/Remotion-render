/**
 * frozen.js — one definition of "this book shipped; its config is the record".
 *
 * The publish register is the 📊 Summary Table in PUBLISHED_BOOKS.md: a numbered
 * row like `| 3 | `slug` | **Title** — Author | 2026-09-02 | …`. Everything else
 * in that file is prose history — detailed records, motif names, file paths,
 * other books' records — and a matcher that swept the whole document for
 * backticked tokens froze books the register does not list. into-the-wild was
 * the casualty: its detailed record #31 exists but its summary row does not, so
 * the loose match froze it in the gates while the thumbnail side (which always
 * parsed the table) ran it unfrozen. Every consumer now shares this parse:
 *
 *   publishedSlugs() → Set of slugs in the register
 *   isFrozen(slug)   → register lists it (report-only gates, no writes into it)
 *
 * When a book ships, the publish workflow adds its summary-table row; that row
 * is what re-freezes it. See AGENT_LOG 2026-10-06 (P9-A.1b).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function publishedSlugs(root = ROOT) {
  try {
    const md = fs.readFileSync(path.join(root, "PUBLISHED_BOOKS.md"), "utf8");
    return new Set(
      [...md.matchAll(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*\d{4}-\d{2}-\d{2}/gm)].map((m) => m[1])
    );
  } catch { return new Set(); }
}

function isFrozen(slug, root = ROOT) {
  return publishedSlugs(root).has(slug);
}

module.exports = { publishedSlugs, isFrozen };
