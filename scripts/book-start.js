#!/usr/bin/env node
/*
 * book-start.js - the ONE way a book starts (or resumes) on the CURRENT production engine, from ANY checkout.
 *
 * Why it exists (2026-10-28): agents opened the shared main checkout, which sat at 24d7186d, 71-80 commits behind
 * origin. Its old scripts had no book-start gate and no `preview-state.js worktree`, so new books (crazy-rich-asians,
 * the-lightning-thief) were planned, authored and rendered on old engine code and their rules.md never offered the
 * new Antidote abilities. Nothing in an old checkout can be fixed by changing code it does not have; so this file is
 * read straight from origin and needs nothing from the checkout it runs in (node built-ins + git only):
 *
 *   git fetch origin god-mode
 *   git show origin/god-mode:scripts/book-start.js | node - --slug=<slug> [--check]
 *
 * What it does (writes ONLY the book's new worktree; the checkout it runs in is never modified):
 *   1. verifies the current origin/god-mode (a failed fetch refuses unless PRODUCTION_ALLOW_BEHIND="<reason>");
 *   2. finds the book's owner/state: an existing production worktree (pinned) -> resume THERE; a book already
 *      STARTED somewhere else (planned / authored / rendered in the main checkout or another worktree) -> refuse:
 *      a started book is never migrated silently (its owner decides; --adopt="<reason>" starts a NEW pinned copy,
 *      the original stays untouched); an Active WIP row naming the book is reported;
 *   3. creates ../wt-book-<slug> detached at origin/god-mode and hands over to THAT worktree's own
 *      `scripts/preview-state.js worktree` (current code: node_modules junction, lock, input copy, pin);
 *   4. on a resume: copies the operator's inputs that arrived later (audio, VTT, Step 0 files) when missing in the
 *      worktree - never overwrites a different file (reported);
 *   5. prints where to continue. Everything after this (Step 0, preview, render) runs in the book's worktree.
 *
 *   --check      report only (no fetch side effects beyond refs/remotes/origin, nothing created)
 *   --launcher   refresh the shared launcher worktree ../wt-production-base to origin/god-mode (only when it is clean;
 *                it stays locked) - for tools that must run current code against a book started elsewhere, e.g.
 *                `node scripts/render-status.js --slug=<s> --book-root=<that checkout>`
 * Exit: 0 ready/resumed/created, 2 refused (with the reason), 1 error. Regression: scripts/test-book-start.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const args = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] === undefined ? true : m[2]; }
const SLUG = typeof args.slug === "string" ? args.slug.trim() : "";
const CHECK = !!args.check;
const out = (s) => process.stdout.write(s + "\n");
const err = (s) => process.stderr.write(s + "\n");
const git = (argv, cwd) => { try { return execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { return null; } };
const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(new RegExp("^" + String.fromCharCode(0xfeff)), "")); } catch { return null; } };

const here = git(["rev-parse", "--show-toplevel"], process.cwd());
if (!here) { err("ERROR book-start: run it inside a checkout of the repo (any checkout, any age)."); process.exit(1); }
const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], here);
const MAIN = path.resolve(common, "..");
const PARENT = path.resolve(MAIN, "..");

function worktrees() {
  const list = [];
  let cur = null;
  for (const l of (git(["worktree", "list", "--porcelain"], MAIN) || "").split(/\r?\n/)) {
    if (l.startsWith("worktree ")) { cur = { path: path.resolve(l.slice(9).trim()), locked: false }; list.push(cur); }
    else if (cur && l.startsWith("HEAD ")) cur.head = l.slice(5).trim();
    else if (cur && l.startsWith("locked")) cur.locked = true;
  }
  return list;
}

// ---- 1. the current production code -----------------------------------------------------------------------------
const allowBehind = (process.env.PRODUCTION_ALLOW_BEHIND || "").trim();
const fetched = git(["fetch", "origin", "god-mode"], MAIN) !== null;
const ORIGIN = git(["rev-parse", "refs/remotes/origin/god-mode"], MAIN);
if (!ORIGIN) { err("REFUSED book-start: no origin/god-mode ref - the production code cannot be identified."); process.exit(2); }
if (!fetched && !allowBehind) { err(`REFUSED book-start: git fetch origin god-mode failed - the current production code cannot be verified (last known ${ORIGIN.slice(0, 8)}). Retry when the network is back, or the operator approves PRODUCTION_ALLOW_BEHIND="<reason>".`); process.exit(2); }
const hereHead = git(["rev-parse", "HEAD"], here);
const behind = parseInt(git(["rev-list", "--count", `HEAD..${ORIGIN}`], here) || "0", 10) || 0;
out(`book-start: production code = origin/god-mode ${ORIGIN.slice(0, 8)}${fetched ? "" : ` (NOT fetched - allowed: ${allowBehind})`}`);
if (path.resolve(here) !== MAIN || behind) out(`  this checkout: ${path.basename(here)} @ ${(hereHead || "?").slice(0, 8)}${behind ? `, ${behind} commit(s) BEHIND - do no book work here` : ""}${path.resolve(here) === MAIN ? " (the SHARED main checkout - never produce a book here)" : ""}`);

// ---- --launcher: refresh the shared launcher worktree (clean only) --------------------------------------------------
if (args.launcher) {
  const L = path.join(PARENT, "wt-production-base");
  const reg = worktrees().find((w) => w.path === path.resolve(L));
  if (!reg) { err(`REFUSED --launcher: ${L} is not a worktree of this repo`); process.exit(2); }
  const dirty = (git(["status", "--porcelain", "--untracked-files=no"], L) || "").split(/\r?\n/).filter(Boolean);
  if (dirty.length) { err(`REFUSED --launcher: ${L} has ${dirty.length} modified tracked file(s) - not touching it (${dirty.slice(0, 3).join("; ")})`); process.exit(2); }
  if (reg.head === ORIGIN) { out(`OK launcher ${L} is already at ${ORIGIN.slice(0, 8)}${reg.locked ? " (locked)" : ""}`); process.exit(0); }
  if (CHECK) { out(`CHECK launcher ${L} is at ${(reg.head || "?").slice(0, 8)}; would move it to ${ORIGIN.slice(0, 8)}`); process.exit(0); }
  if (git(["checkout", "--detach", "--quiet", ORIGIN], L) === null) { err(`ERROR --launcher: git checkout in ${L} failed`); process.exit(1); }
  out(`OK launcher ${L} -> ${ORIGIN.slice(0, 8)}${reg.locked ? " (still locked)" : ""}. Run current tools there, e.g.:`);
  out(`   cd "${L}" && node scripts/render-status.js --slug=<slug> --book-root="<the checkout that holds the book>"`);
  process.exit(0);
}

if (!SLUG || !/^[a-z0-9][a-z0-9-]*$/.test(SLUG)) { err("usage: git show origin/god-mode:scripts/book-start.js | node - --slug=<lowercase-slug> [--check] [--adopt=\"<reason>\"] | --launcher"); process.exit(1); }
const WT = path.join(PARENT, `wt-book-${SLUG}`);
const PIN = path.join(WT, "books", SLUG, "production-base.json");

// ---- 2. who has this book? ---------------------------------------------------------------------------------------
function startedEvidence(root) {
  const B = path.join(root, "books", SLUG);
  const ev = [];
  const rec = readJSON(path.join(B, "pipeline-record.json"));
  const runs = rec && Array.isArray(rec.runs) ? rec.runs : [];
  if (runs.length) { const last = runs[runs.length - 1]; ev.push(`${runs.length} pipeline step(s), last "${last.step}" at ${String(last.head || "").slice(0, 8)} ${String(last.at || "").slice(0, 16)}`); }
  let sb = []; try { sb = fs.readdirSync(path.join(B, "storyboard")).filter((f) => /^authored-\d+\.json$/.test(f)); } catch {}
  if (sb.length) ev.push(`${sb.length} authored storyboard chunk(s)`);
  for (const f of ["config.antidote.json", "config.vox.json", "art.json", "designs.json"]) if (exists(path.join(B, f))) ev.push(f);
  if (exists(path.join(root, "out", `${SLUG}.mp4`))) ev.push(`out/${SLUG}.mp4`);
  if (exists(path.join(root, `.render-github-split.${SLUG}.json`))) ev.push("a GitHub render state");
  return ev;
}
function wipRow() {
  try {
    const log = fs.readFileSync(path.join(MAIN, "AGENT_LOG.md"), "utf8").split(/\r?\n/);
    const a = log.findIndex((l) => /^## Active WIP/.test(l));
    if (a < 0) return null;
    for (let k = a + 1; k < log.length && !/^## /.test(log[k]); k++) if (log[k].startsWith("|") && log[k].includes(SLUG)) return log[k].slice(0, 220);
  } catch {}
  return null;
}
const all = worktrees();
const mine = all.find((w) => w.path === path.resolve(WT));
const pinnedElsewhere = all.filter((w) => w.path !== path.resolve(WT) && (() => { const p = readJSON(path.join(w.path, "books", SLUG, "production-base.json")); return !!(p && p.productionBase); })());
const startedIn = all.map((w) => ({ w: w.path, ev: w.path === path.resolve(WT) ? [] : startedEvidence(w.path) })).filter((x) => x.ev.length);
const wip = wipRow();
if (wip) out(`  Active WIP row naming ${SLUG}: ${wip}`);

// resume: the book's own pinned production worktree
if (mine && exists(PIN)) {
  const pin = readJSON(PIN) || {};
  out(`RESUME ${SLUG}: its production worktree exists - ${WT} (pinned ${String(pin.productionBase || "?").slice(0, 8)}${pin.productionBase && pin.productionBase !== ORIGIN ? `; origin moved to ${ORIGIN.slice(0, 8)} - the book KEEPS its pin` : ""})`);
  // A pin protects WORK. A book still at Step 0 (no pipeline step, storyboard, config, film or render) would be
  // authored on the pinned rules when its audio arrives - 2026-10-29: four Step-0 books pinned at 88db7e09 sat 11
  // commits behind the tool-routing rules.md and the body-state merge. Moving a pin stays the operator's decision
  // (contract s.3); this says so while it is cheap, and --repin="<operator's reason>" does it only then.
  if (pin.productionBase && pin.productionBase !== ORIGIN) {
    const ev = startedEvidence(WT);
    const dirty = (git(["status", "--porcelain", "--", "scripts", "src", "data", "package.json"], WT) || "").trim();
    const nBehind = parseInt(git(["rev-list", "--count", `${pin.productionBase}..${ORIGIN}`], WT) || "0", 10) || 0;
    const repin = typeof args.repin === "string" ? args.repin.trim() : "";
    if (!ev.length && !dirty && nBehind > 0) {
      if (repin && !CHECK) {
        if (git(["checkout", "--detach", "--quiet", ORIGIN], WT) === null) { err(`ERROR book-start: could not move ${WT} to ${ORIGIN.slice(0, 8)} - the pin is unchanged`); process.exit(1); }
        const at = new Date().toISOString();
        fs.writeFileSync(PIN, JSON.stringify({ ...pin, productionBase: ORIGIN, at, repinned: [...(pin.repinned || []), { from: pin.productionBase, to: ORIGIN, at, reason: repin, evidence: "no production work (no pipeline step, storyboard, config, film or render state)" }] }, null, 2) + "\n");
        out(`  REPINNED ${SLUG}: ${pin.productionBase.slice(0, 8)} -> ${ORIGIN.slice(0, 8)} (${nBehind} commit(s)); no production work existed; reason recorded: "${repin}"`);
      } else out(`  NO WORK YET and the pin is ${nBehind} commit(s) behind origin: its storyboard would be authored on the pinned rules. Moving the pin is the operator's decision - report it; on their word: book-start --slug=${SLUG} --repin="<the operator's reason>"`);
    } else if (repin) { err(`REFUSED --repin: ${ev.length ? `${SLUG} has production work (${ev.join("; ")}) - a book keeps its engine commit` : dirty ? `${WT} has uncommitted code changes` : "the pin is not behind origin"}`); process.exit(2); }
  }
  if (!CHECK) {
    // inputs that arrived later in the main checkout (the operator drops audio / VTT there): copy when missing
    const copied = [], differ = [];
    const same = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; } };
    const cand = [];
    for (const x of ["mp3", "m4a", "wav"]) cand.push(`public/audio/${SLUG}.${x}`);
    cand.push(`public/captions/${SLUG}.vtt`);
    for (const f of ["prompt.notebooklm.md", "book.json"]) cand.push(`books/${SLUG}/${f}`);
    for (const rel of cand) {
      const s = path.join(MAIN, rel), d = path.join(WT, rel);
      if (!exists(s) || path.resolve(s) === path.resolve(d)) continue;
      if (!exists(d)) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); copied.push(rel); }
      else if (!same(s, d)) differ.push(rel);
    }
    if (copied.length) out(`  copied the inputs that arrived since: ${copied.join(", ")}`);
    if (differ.length) out(`  NOT copied (the worktree has a different version - decide which is right): ${differ.join(", ")}`);
  }
  out(`  Continue THERE: cd "${WT}" && node scripts/preview-state.js status --slug=${SLUG}`);
  process.exit(0);
}
if (pinnedElsewhere.length) {
  err(`REFUSED book-start: ${SLUG} is already pinned in another worktree: ${pinnedElsewhere.map((w) => w.path).join(", ")} - continue there (its owner's session).`);
  process.exit(2);
}
const adopt = typeof args.adopt === "string" ? args.adopt.trim() : "";
if (startedIn.length && !adopt) {
  err(`REFUSED book-start: ${SLUG} has already STARTED outside a production worktree - it is never migrated silently:`);
  for (const x of startedIn) err(`   ${x.w}: ${x.ev.join("; ")}`);
  err("   Its owner decides: keep it where it is (finish it there; render / assemble it with CURRENT tools via");
  err(`   \`... | node - --launcher\` then render-status.js --book-root), or start a NEW pinned copy on current code with`);
  err(`   --adopt="<the owner's reason>" (copies its inputs and files into ../wt-book-${SLUG}; the original is left untouched).`);
  process.exit(2);
}
if (mine && !exists(PIN)) out(`  ${WT} is registered but not finished (no pin) - completing it`);
else if (exists(WT)) { err(`REFUSED book-start: ${WT} exists but is not a worktree of this repo - not touching it.`); process.exit(2); }

if (CHECK) {
  out(`READY ${SLUG}: would create ${WT} at origin/god-mode ${ORIGIN.slice(0, 8)} (locked, node_modules -> main, inputs copied, pinned)${adopt ? `; adopting a started book: ${adopt}` : ""}`);
  process.exit(0);
}

// ---- 3. create the worktree on the current code and hand over to ITS preview-state.js -------------------------------
if (!mine && git(["worktree", "add", "--detach", WT, ORIGIN], MAIN) === null) { err(`ERROR book-start: git worktree add ${WT} failed`); process.exit(1); }
const ps = path.join(WT, "scripts", "preview-state.js");
if (!exists(ps)) { err(`ERROR book-start: ${ps} missing in the new worktree`); process.exit(1); }
try {
  execFileSync(process.execPath, [ps, "worktree", `--slug=${SLUG}`], { cwd: WT, stdio: "inherit", env: { ...process.env, ...(fetched ? {} : { PRODUCTION_ALLOW_BEHIND: allowBehind }) } });
} catch (e) { err(`ERROR book-start: preview-state.js worktree failed (exit ${e.status}) - the worktree ${WT} is left as is (registered, unpinned); rerun book-start to complete it.`); process.exit(1); }
if (adopt) {
  const B = path.join(WT, "books", SLUG);
  // the whole book as its owner left it (storyboard chunks, authored files, own icons ...) plus its inputs, from the
  // checkout where it started; preview-state copies only top-level files. Never over the new pin, never overwrite.
  const src = (startedIn.find((x) => x.w === MAIN) || startedIn[0]).w;
  const copied = [];
  const walk = (rel) => {
    const s = path.join(src, rel), d = path.join(WT, rel);
    let st; try { st = fs.lstatSync(s); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { for (const f of fs.readdirSync(s)) walk(path.join(rel, f)); return; }
    if (path.resolve(d) === path.resolve(PIN) || exists(d)) return;
    fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); copied.push(rel.split(path.sep).join("/"));
  };
  walk(path.join("books", SLUG));
  for (const x of ["mp3", "m4a", "wav"]) walk(path.join("public", "audio", `${SLUG}.${x}`));
  walk(path.join("public", "captions", `${SLUG}.vtt`));
  out(`  adopted from ${src}: ${copied.length} more file(s) copied (${copied.slice(0, 6).join(", ")}${copied.length > 6 ? " ..." : ""})`);
  fs.writeFileSync(path.join(B, "adopted-from.json"), JSON.stringify({ reason: adopt, at: new Date().toISOString(), from: startedIn.map((x) => ({ checkout: x.w, evidence: x.ev })) }, null, 2) + "\n");
  out(`  adopted (owner's reason recorded in books/${SLUG}/adopted-from.json); the original is untouched`);
}
out(`OK ${SLUG}: production worktree ${WT} on origin/god-mode ${ORIGIN.slice(0, 8)}.`);
out(`  Everything for this book now runs THERE (Step 0, preview, render): cd "${WT}"`);
out(`  Next: node scripts/preview-state.js status --slug=${SLUG}`);
process.exit(0);
