#!/usr/bin/env node
/**
 * test-thumbnail-world.js — the thumbnail art director must not leak one book's
 * world into another's thumbnail (2026-09-23: show-your-work, a creativity book,
 * got Plato's tripartite soul — "reason on one side, appetite on the other").
 *
 * Property test over every book that has a story bible + youtube-meta: a
 * --dry-run (writes nothing) may contain Republic-only vocabulary ONLY when the
 * book's world owns it in data/motif-world.json. The owner world must keep it.
 *
 *   node scripts/test-thumbnail-world.js
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { usesPropositionWorlds } = require("./lib/visual-intent");

const ROOT = path.resolve(__dirname, "..");
const REPUBLIC_ONLY = /tripartite|appetite|reason on one side|who should rule|ship of state|prisoners chained|philosopher vs\.? crowd/i;
let passed = 0, failed = 0;
const assert = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : " — " + detail}`);
  ok ? passed++ : failed++;
};

function dryRun(slug) {
  const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", "thumbnail-art-director.js"), `--slug=${slug}`, "--dry-run"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.slice(out.indexOf("{\n")));
}

console.log("═══ Thumbnail art director: world isolation ═══");
let owners = 0;
for (const slug of fs.readdirSync(path.join(ROOT, "books"))) {
  const dir = path.join(ROOT, "books", slug);
  if (!fs.existsSync(path.join(dir, "story-bible.json")) || !fs.existsSync(path.join(dir, "youtube-meta.json"))) continue;
  let bible;
  try {
    bible = JSON.parse(fs.readFileSync(path.join(dir, "story-bible.json"), "utf8"));
    JSON.parse(fs.readFileSync(path.join(dir, "youtube-meta.json"), "utf8"));
  } catch (e) {
    // e.g. a UTF-8 BOM in an old published book's meta (frozen — not fixed here)
    console.log(`  - ${slug}: skipped (unreadable bible/meta: ${e.message.split("\n")[0].slice(0, 60)})`);
    continue;
  }
  const worldId = (bible.visualProvenance && bible.visualProvenance.worldId) || (bible.world && bible.world.worldId) || null;
  const owner = usesPropositionWorlds({ meta: { slug } }, { worldId });
  let doc;
  try { doc = dryRun(slug); } catch (e) { assert(`${slug}: dry-run succeeds`, false, e.message.split("\n")[0]); continue; }
  const text = doc.concepts.map((c) => `${c.hook} ${c.visualSubject}`).join("\n");
  if (owner) {
    owners++;
    const soul = doc.concepts.find((c) => c.angle === "soul");
    assert(`${slug} (${worldId}) keeps its own soul angle`, soul && /appetite|tripartite/i.test(soul.visualSubject), soul && soul.visualSubject.slice(0, 80));
  } else {
    const hit = text.match(REPUBLIC_ONLY);
    assert(`${slug} (${worldId || "no world"}) has no Republic-only vocabulary`, !hit, hit && hit[0]);
  }
  const bad = doc.concepts.filter((c) => /\b(THE|A|AN|OF|TO|AND|WHY|BUT)$/.test(c.hook));
  assert(`${slug}: no hook ends mid-phrase`, bad.length === 0, bad.map((c) => c.hook).join(", "));
}
assert("at least one owner-world book was checked", owners > 0);

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed) process.exit(1);
