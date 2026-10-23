#!/usr/bin/env node
/**
 * lint-titles.js — check a book's YouTube title set against the title contract
 * (search entity + author + modifier + book-specific counter-narrative angles, no channel templates).
 *
 *   node scripts/lint-titles.js --slug=<slug>          # exit 1 on FAIL
 *   node scripts/lint-titles.js --slug=<slug> --json
 *   node scripts/lint-titles.js --all                  # report every book (published books are frozen: report only)
 *
 * Rules + rationale: scripts/lib/title-lint.js (TITLE_RULES), SKILL.md §9.6b, AGENT_LOG 2026-10-22.
 */
const { lintBook, TITLE_RULES } = require("./lib/title-lint");
const { listBookSlugs } = require("./lib/paths");

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const has = (k) => process.argv.includes(`--${k}`);

if (has("all")) {
  let pass = 0, fail = 0;
  for (const s of listBookSlugs()) {
    const r = lintBook(s);
    if (r.errors[0] && r.errors[0].startsWith("NO_META")) continue;
    r.status === "PASS" ? pass++ : fail++;
    console.log(`${r.status === "PASS" ? "✓" : "✗"} ${s}${r.status === "PASS" ? "" : ` — ${r.errors.length} error(s): ${[...new Set(r.errors.map((e) => e.split(/[: #]/)[0]))].join(", ")}`}`);
  }
  console.log(`\n${pass} PASS · ${fail} FAIL (report only — published books are frozen, never rewrite them)`);
  process.exit(0);
}

const slug = arg("slug");
if (!slug) { console.error("usage: node scripts/lint-titles.js --slug=<slug> [--json] | --all\n\n" + TITLE_RULES); process.exit(2); }
const r = lintBook(slug);
if (has("json")) { console.log(JSON.stringify(r, null, 2)); process.exit(r.status === "PASS" ? 0 : 1); }

console.log(`\n── Title lint · ${slug}`);
for (const t of r.perTitle) {
  const tagz = [t.modifier && "search", t.author && "author", t.angled && `angle[${t.anchors.join(",")}]`].filter(Boolean).join(" ");
  console.log(`   ${t.i + 1}. ${t.title}  (${t.len})  ${tagz}`);
}
for (const e of r.errors) console.log(`   ✗ ${e}`);
for (const w of r.warnings) console.log(`   · ${w}`);
console.log(r.status === "PASS" ? "\n✅ TITLES PASS" : `\n❌ TITLES FAIL\n\n${TITLE_RULES}`);
process.exit(r.status === "PASS" ? 0 : 1);
