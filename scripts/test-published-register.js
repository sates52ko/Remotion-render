#!/usr/bin/env node
// The publish register (PUBLISHED_BOOKS.md Summary Table, lib/frozen.js) is the ONE source every frozen-book guard
// reads (apply-briefs, gate-authorship, preview-state, render-decision, render-status, thumbnails). A numbered row the
// parser cannot read silently UN-freezes a published book. 2026-11-06: two rows were unreadable — #20 death-row (slug
// without backticks) and #67 the-creative-curve (a PowerShell "`t" in a double-quoted string became a TAB and ate the
// backtick) — so every guard treated both published books as editable, and a thumbnail run started on one.
// Run: node scripts/test-published-register.js
"use strict";
const fs = require("fs");
const path = require("path");
const { publishedSlugs } = require("./lib/frozen");

const ROOT = path.join(__dirname, "..");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };

const md = fs.readFileSync(path.join(ROOT, "PUBLISHED_BOOKS.md"), "utf8");
const rows = md.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l));
const unreadable = rows.filter((l) => !/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*\d{4}-\d{2}-\d{2}/.test(l));
t("register: every numbered Summary Table row is readable (| n | `slug` | title | YYYY-MM-DD |)", !unreadable.length, unreadable.map((l) => JSON.stringify(l.slice(0, 60))).join(" · "));
t("register: no control character (a TAB from a PowerShell `t escape) anywhere in the file", !/[\t\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(md), (md.match(/.*[\t\u0000-\u0008\u000b\u000c\u000e-\u001f].*/) || [""])[0].slice(0, 60));
const slugs = publishedSlugs(ROOT);
t("register: slugs are kebab-case", [...slugs].every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)), [...slugs].filter((s) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)).join(", "));
t("register: the books named on 2026-11-06 are frozen (death-row, the-creative-curve)", slugs.has("death-row") && slugs.has("the-creative-curve"));
console.log(failed ? `\n${failed} FAILED` : `\nALL PASS (${rows.length} rows, ${slugs.size} published slugs)`);
process.exit(failed ? 1 : 0);
