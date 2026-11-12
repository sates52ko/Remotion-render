/**
 * book-root.js — may THIS checkout's tools render a book that lives in another (pinned) worktree? (2026-10-30)
 *
 * render.js --book-root=<worktree> builds the bundle from that worktree, so its pinned engine renders the book, while
 * the credentials, the pre-dispatch check, the operator's authorization and the dispatch come from the current tools.
 * That is only honest when the book root IS the pinned engine:
 *   - a worktree of the SAME repository (same git common dir: same objects, same worker remotes),
 *   - books/<slug>/production-base.json exists and HEAD == its productionBase (a moved checkout is not the pin),
 *   - no tracked change under the engine / scripts (the bundle is built from the working tree).
 * Read-only: changes nothing in either checkout.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const git = (cwd, argv) => { try { return execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const CODE_PATHS = ["src", "scripts", "package.json", "remotion.config.ts", ".github"];
const GENERATED = new Set(["src/books.generated.ts"]); // = production-guard IGNORE

function checkBookRoot({ launcher, bookRoot, slug }) {
  const out = { ok: false, error: null, pin: null, launcherHead: git(launcher, ["rev-parse", "HEAD"]) || "" };
  if (!slug) return { ...out, error: "--slug is required" };
  if (!fs.existsSync(bookRoot)) return { ...out, error: `${bookRoot} does not exist` };
  const common = (r) => { const c = git(r, ["rev-parse", "--path-format=absolute", "--git-common-dir"]); return c ? path.resolve(c).toLowerCase() : null; };
  const a = common(launcher), b = common(bookRoot);
  if (!b) return { ...out, error: `${bookRoot} is not a git checkout` };
  if (a !== b) return { ...out, error: `${bookRoot} is not a worktree of this repository (git dir ${b} ≠ ${a})` };
  const pinFile = path.join(bookRoot, "books", slug, "production-base.json");
  let pin = null;
  try { pin = JSON.parse(fs.readFileSync(pinFile, "utf8").replace(/^﻿/, "")); } catch {}
  if (!pin || !pin.productionBase) return { ...out, error: `books/${slug}/production-base.json missing in ${bookRoot} — not a pinned book worktree` };
  const head = git(bookRoot, ["rev-parse", "HEAD"]);
  if (head !== pin.productionBase) return { ...out, error: `${bookRoot} HEAD ${String(head).slice(0, 8)} ≠ pinned ${pin.productionBase.slice(0, 8)} — the checkout is not the book's engine` };
  // the generated registry is rebuilt by the runner and ignored by production-guard too (real case: the-magician-s-nephew)
  const dirty = (git(bookRoot, ["status", "--porcelain", "--untracked-files=no", "--", ...CODE_PATHS]) || "").split(/\r?\n/).filter(Boolean)
    .filter((l) => ![...GENERATED].some((gen) => l.trim().endsWith(" " + gen)));
  if (dirty.length) return { ...out, error: `${dirty.length} tracked code change(s) in ${bookRoot} (${dirty.slice(0, 3).join("; ")}) — the bundle would not be the pinned engine` };
  return { ...out, ok: true, pin: pin.productionBase, head };
}

module.exports = { checkBookRoot };
