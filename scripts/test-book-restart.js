#!/usr/bin/env node
/**
 * test-book-restart.js — book-start.js `--restart="<reason>"`: a book that already has a pinned copy starts AGAIN on
 * current code as a new pinned copy; the old copy is retired (kept, never deleted). Source checks + a parse — the real
 * run was measured on american-psycho (2026-11-23: RESTART … READY). No network, no git.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const src = fs.readFileSync(path.join(__dirname, "book-start.js"), "utf8");

t("--restart needs the owner's reason (>= 30 chars) and is in the usage line", () => {
  assert.ok(/restart && restart\.length < 30/.test(src));
  assert.ok(/\[--restart=\\"<reason>\\"\]/.test(src), "usage names it");
});

t("a pinned copy elsewhere refuses only WITHOUT --restart; a started book is not refused with it", () => {
  assert.ok(/if \(pinnedElsewhere\.length && !restart\) \{/.test(src));
  assert.ok(/if \(startedIn\.length && !adopt && !restart\) \{/.test(src));
});

t("the old copy at the book's own path is never moved by the script: it says how (unlink + git worktree move), then refuses", () => {
  assert.ok(/if \(mine && exists\(PIN\) && restart\) \{/.test(src));
  assert.ok(/preview-state\.js unlink --slug=\$\{SLUG\}/.test(src) && /git worktree move/.test(src));
  assert.ok(src.indexOf("if (mine && exists(PIN) && restart)") < src.indexOf("if (mine && exists(PIN)) {"), "… before the RESUME path");
});

t("a restart copies only the inputs and records where it came from; nothing is written into the retired copy", () => {
  const block = src.split("if (restart) {")[1].split("out(`OK ${SLUG}")[0];
  for (const rel of ["book.json", "prompt.notebooklm.md", `${"$"}{SLUG}.mp3`, `${"$"}{SLUG}.vtt`]) assert.ok(block.includes(rel), `copies ${rel}`);
  assert.ok(/if \(!exists\(s\) \|\| exists\(d\)\) continue;/.test(block), "never overwrites");
  assert.ok(/restarted-from\.json/.test(block) && /retired: pinnedElsewhere\.map/.test(block));
  assert.ok(!/fs\.(rm|unlink|rename)/.test(block), "removes nothing");
});

console.log(`\n${n} checks passed`);
