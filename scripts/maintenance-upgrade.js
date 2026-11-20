#!/usr/bin/env node
/**
 * maintenance-upgrade.js — a PINNED book's checkout moves to a newer commit for a narrow TECHNICAL fix, on the
 * operator's word, never for an engine feature (2026-10-30).
 *
 *   node scripts/maintenance-upgrade.js --slug=<slug> --from=<exact pinned SHA> --to=<exact SHA on origin> \
 *        --operator-approved="<the operator's reason>" [--check] [--book-root=<worktree>]
 *
 * Real case: the-magician-s-nephew was pinned 0a1365c2 when preview-ready.js printed READY but never wrote its record
 * (an undefined `head`). The fix touched one script; no command could move the pin safely, so production-base.json was
 * edited by hand under a one-off operator exception (086a0941, a local-only commit).
 *
 * MAINTENANCE vs FEATURE — decided by the diff from..to, file by file:
 *   allowed (cannot change a rendered pixel or an authored config): preview / render / record / dispatch tools and
 *   their libs, tests, docs, agent skills and rules, CI files (MAINTENANCE_FILES below);
 *   anything else — src/** (the engine), planners, storyboard / make-book, data the planners read — is a FEATURE
 *   upgrade: refused here (the book's owner and the operator decide a re-pin / adopt, or render with current tools
 *   through render.js --book-root without moving the pin at all).
 * It also refuses: --from ≠ the pin ≠ HEAD; --to not on origin/god-mode; tracked code changes in the worktree (a
 * regenerated src/books.generated.ts aside); a render in flight for the book; no operator reason. The book's inputs
 * (config, storyboard, bible, captions, audio) are hashed before and after and must be identical; the render input
 * hash must not move. production-base.json keeps the previous pin; every upgrade is appended to
 * books/<slug>/pin-history.jsonl. --check prints the verdict and changes nothing.
 *
 * --before-preview (2026-11-16): a FEATURE upgrade for a book whose picture has NOT been judged yet. Real case:
 * dracula, the first told book, was pinned 1ce54b4e and stopped at the screen-text gate on a system fault (kept
 * labels counted as repetitions; labels never expiring) — the fix is in the compiler and the gate, which this tool
 * refuses as "feature", and book-start --repin refuses a book with a storyboard. A pin protects a JUDGED picture; a
 * book with no preview verdict (no preview-ready.json, no mute-test.json), no film and no render has none. With the
 * operator's reason the checkout moves; everything else above still holds (exact SHAs, clean tracked code, inputs
 * byte-identical). Afterwards the book is re-planned on the new code: storyboard prep → merge → make-book.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
const CHECK = !!args.check;
const die = (code, msg) => { console.error(msg); process.exit(code); };
if (!SLUG || !args.from || !args.to) die(1, 'usage: node scripts/maintenance-upgrade.js --slug=<slug> --from=<pinned sha> --to=<sha on origin> --operator-approved="<reason>" [--check] [--book-root=<worktree>]');
const git = (cwd, argv) => { try { return execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } };
const ROOT = path.join(__dirname, "..");
const main = (() => { const c = git(ROOT, ["rev-parse", "--path-format=absolute", "--git-common-dir"]); return c ? path.resolve(c, "..") : ROOT; })();
const WT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(main, "..", `wt-book-${SLUG}`));
const B = path.join(WT, "books", SLUG);
const PIN = path.join(B, "production-base.json");

// files whose change cannot alter what renders or what was authored
const MAINTENANCE_FILES = [
  /^scripts\/(preview-ready|preview-state|render|render-[a-z0-9-]+|mute-test|readcheck|lint-titles|package-youtube|post-render|verify-render-[a-z-]+|maintenance-upgrade|book-start|ci-run-tests)\.js$/,
  /^scripts\/lib\/(render-[a-z-]+|preview-[a-z-]+|mute-[a-z-]+|next-step|run-lock|book-root|production-guard|code-fingerprint|merge-recovery|cloud-assemble|frozen|title-lint)\.js$/,
  /^scripts\/test-[a-z0-9-]+\.js$/,
  /^\.claude\//, /^\.agents\//, /^\.cursor\//, /^docs\//, /^[^/]+\.md$/, /^data\/ci-[a-z-]+\.json$/, /^\.github\/workflows\/regression\.yml$/,
];
const GENERATED = "src/books.generated.ts";
// ledgers the routine pipeline appends to in every book worktree (mute-test tally): not code, never "dirty"
const LEDGERS = ["data/engine-outcomes.json"];

// 1. the pin, exactly
const pin = (() => { try { return JSON.parse(fs.readFileSync(PIN, "utf8").replace(/^﻿/, "")); } catch { return null; } })();
if (!pin || !pin.productionBase) die(2, `❌ ${PIN}: no pin — maintenance-upgrade moves a PINNED book only`);
const resolve = (r) => git(WT, ["rev-parse", "--verify", `${r}^{commit}`]);
const FROM = resolve(args.from), TO = resolve(args.to), HEAD = git(WT, ["rev-parse", "HEAD"]);
if (!FROM || !TO) die(2, `❌ --from / --to must be exact commits known here (from ${args.from} → ${FROM || "?"}, to ${args.to} → ${TO || "?"})`);
if (FROM !== pin.productionBase) die(2, `❌ --from ${FROM.slice(0, 8)} is not the book's pin ${pin.productionBase.slice(0, 8)} — say the exact old SHA`);
if (HEAD !== FROM) die(2, `❌ ${WT} HEAD ${String(HEAD).slice(0, 8)} is not the pin ${FROM.slice(0, 8)} — the checkout already moved; not touching it`);
if (FROM === TO) die(2, "❌ --to is the pin itself: nothing to upgrade");
git(WT, ["fetch", "-q", "origin", "god-mode"]);
if (git(WT, ["merge-base", "--is-ancestor", TO, "refs/remotes/origin/god-mode"]) === null) die(2, `❌ --to ${TO.slice(0, 8)} is not on origin/god-mode — a pin is always published code (a local fix is upstreamed first)`);

// 2. maintenance, not a feature: the diff from..to
const files = (git(WT, ["diff", "--name-only", FROM, TO]) || "").split(/\r?\n/).filter(Boolean);
const feature = files.filter((f) => f !== GENERATED && !MAINTENANCE_FILES.some((re) => re.test(f)));
// 3. the worktree is exactly the pin (tracked code), and no render is running for the book
const dirty = (git(WT, ["status", "--porcelain", "--untracked-files=no"]) || "").split(/\r?\n/).filter(Boolean).filter((l) => ![GENERATED, ...LEDGERS].some((x) => l.trim().endsWith(" " + x)))
  // a tracked legacy media file that is merely ABSENT under public/ (book worktrees drop public/captions/captions.vtt
  // and old sample audio) is not a code change: nothing there can alter what the tools do (dracula, 2026-11-16)
  .filter((l) => !/^\s?D\s+"?public\//.test(l))
  // a tracked REPORT the pipeline rewrites on every make-book (p9a-proposition-telemetry.js → audit/…): an output, not code
  .filter((l) => !/^\s?M\s+"?audit\//.test(l));
const inflight = (() => { try { const rl = require("./lib/run-lock"); const lock = path.join(WT, `.render-lock.${SLUG}.json`); const lk = fs.existsSync(lock) ? JSON.parse(fs.readFileSync(lock, "utf8")) : null; return (lk && rl.pidAlive(lk.pid)) || rl.renderInFlight(path.join(WT, `.render-github-split.${SLUG}.json`)); } catch { return null; } })();
// 4. the book's inputs, hashed (untracked: a checkout must not touch them)
const inputFiles = () => {
  const out = [];
  for (const f of ["config.vox.json", "config.antidote.json", "art.json", "designs.json", "story-bible.json", "book.json", "motifs.json", "preview-ready.json", "mute-test.json"]) if (fs.existsSync(path.join(B, f))) out.push(path.join(B, f));
  const sb = path.join(B, "storyboard"); if (fs.existsSync(sb)) for (const f of fs.readdirSync(sb).filter((x) => /^authored-\d+\.json$/.test(x)).sort()) out.push(path.join(sb, f));
  for (const d of ["public/captions", "public/audio"]) { const dir = path.join(WT, d); if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(SLUG + ".")).sort()) out.push(path.join(dir, f)); }
  return out;
};
const inputHash = () => { const h = crypto.createHash("sha256"); for (const f of inputFiles()) { h.update(path.relative(WT, f).replace(/\\/g, "/")); h.update(fs.readFileSync(f)); } return h.digest("hex"); };
const cfgFile = ["config.antidote.json", "config.vox.json"].map((f) => path.join(B, f)).find((f) => fs.existsSync(f));
const renderInput = () => { try { return cfgFile ? require("./lib/render-preflight").inputHashOf(cfgFile) : null; } catch { return null; } };

const reason = typeof args["operator-approved"] === "string" ? args["operator-approved"].trim() : "";
const problems = [];
// a picture that was never judged: no preview verdict, no mute test, no film, no render state
const BEFORE_PREVIEW = !!args["before-preview"];
// A verdict that FAILED accepted nothing: the book goes into a fix round and is judged again on a fresh holdout
// (dracula: mute test FAIL on told 1.1, the layout fix is told 1.2). Only a PASS — preview-ready.json ready: true, or
// a passing last mute run — is a judged picture the pin protects.
const rjson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return null; } };
const passed = { "preview-ready.json": (j) => !j || j.ready !== false, "mute-test.json": (j) => { const r = j && Array.isArray(j.runs) ? j.runs[j.runs.length - 1] : j; return !r || r.pass !== false; } };
const judged = [["preview-ready.json", path.join(B, "preview-ready.json")], ["mute-test.json", path.join(B, "mute-test.json")]].filter(([n, f]) => fs.existsSync(f) && passed[n](rjson(f))).map(([n]) => `a PASSED ${n}`).concat([[`out/${SLUG}.mp4`, path.join(WT, "out", `${SLUG}.mp4`)], ["a GitHub render state", path.join(WT, `.render-github-split.${SLUG}.json`)]].filter(([, f]) => fs.existsSync(f)).map(([n]) => n));
if (BEFORE_PREVIEW && judged.length) problems.push(`--before-preview: ${SLUG} already has ${judged.join(", ")} — its picture was judged or rendered on the pin; the book keeps its engine commit`);
if (feature.length && !BEFORE_PREVIEW) problems.push(`FEATURE upgrade, not maintenance — ${feature.length} file(s) can change what renders or what was authored: ${feature.slice(0, 8).join(", ")}${feature.length > 8 ? ", …" : ""}. The book keeps its pin (render it with current tools: render.js --book-root), or its owner and the operator decide a re-pin / adopt.`);
if (dirty.length) problems.push(`${dirty.length} tracked change(s) in ${WT}: ${dirty.slice(0, 4).join("; ")} — the checkout is not the pin`);
if (inflight) problems.push(`a render of ${SLUG} is in flight — never move the code under a running render`);
if (!reason && !CHECK) problems.push(`--operator-approved="<the operator's reason>" is required (a pin moves only on the operator's word)`);

console.log(`maintenance-upgrade ${SLUG}: ${FROM.slice(0, 8)} → ${TO.slice(0, 8)} in ${WT}`);
console.log(`  diff: ${files.length} file(s) — ${files.length - feature.length} maintenance${feature.length ? `, ${feature.length} FEATURE` : ""}`);
for (const f of files.slice(0, 30)) console.log(`    ${feature.includes(f) ? (BEFORE_PREVIEW ? "! feature    " : "✗ feature    ") : "· maintenance"} ${f}`);
if (BEFORE_PREVIEW && feature.length && !judged.length) console.log(`  --before-preview: ${feature.length} feature file(s) accepted — ${SLUG} has no PASSED preview verdict or mute test, no film and no render`);
if (problems.length) { for (const p of problems) console.error(`❌ ${p}`); process.exit(2); }
if (CHECK) { console.log((BEFORE_PREVIEW && feature.length ? "✓ CHECK: a before-preview feature upgrade" : "✓ CHECK: a maintenance upgrade") + " — nothing changed (run again with --operator-approved=\"<reason>\" and without --check)"); process.exit(0); }

const beforeInputs = inputHash(), beforeRender = renderInput();
if (git(WT, ["checkout", "--detach", "--quiet", TO]) === null) die(1, `❌ git checkout ${TO.slice(0, 8)} failed in ${WT} — the pin is unchanged`);
const afterInputs = inputHash(), afterRender = renderInput();
if (afterInputs !== beforeInputs || afterRender !== beforeRender) {
  git(WT, ["checkout", "--detach", "--quiet", FROM]);
  die(1, `❌ the book's inputs changed across the checkout (inputs ${beforeInputs.slice(0, 12)} → ${afterInputs.slice(0, 12)}, render input ${beforeRender} → ${afterRender}) — moved back to ${FROM.slice(0, 8)}; the pin is unchanged`);
}
const at = new Date().toISOString();
const KIND = BEFORE_PREVIEW && feature.length ? "before-preview" : "maintenance";
const entry = { at, kind: KIND, from: FROM, to: TO, reason, files, inputsSha256: beforeInputs, renderInputHash: beforeRender, worktree: path.basename(WT) };
const next = { ...pin, productionBase: TO, at, previousProductionBase: FROM,
  repin: { kind: KIND, approvedByOperator: true, reason, scope: KIND === "maintenance" ? "technical files only (maintenance-upgrade.js)" : "engine / planner code, before any preview verdict (maintenance-upgrade.js --before-preview)", files: files.length },
  pinHistory: [...(pin.pinHistory || []), { productionBase: FROM, until: at, ...(pin.repin ? { repin: pin.repin } : {}) }] };
const tmp = `${PIN}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
fs.renameSync(tmp, PIN);
fs.appendFileSync(path.join(B, "pin-history.jsonl"), JSON.stringify(entry) + "\n");
if (KIND === "before-preview") console.log(`  NEXT — re-plan the book on the new code, in this order: node scripts/storyboard.js prep --slug=${SLUG} → node scripts/storyboard.js merge --slug=${SLUG} --write (fix what it reports in storyboard/authored-N.json) → make-book as preview-state prints it.`);
console.log(`✓ ${SLUG} pinned ${TO.slice(0, 8)} (was ${FROM.slice(0, 8)}): ${files.length} ${KIND === "maintenance" ? "maintenance " : ""}file(s); book inputs identical (${beforeInputs.slice(0, 12)}), render input ${beforeRender || "n/a"} unchanged; recorded in production-base.json (previous pin kept) and books/${SLUG}/pin-history.jsonl`);
