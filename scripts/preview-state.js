#!/usr/bin/env node
/**
 * preview-state.js — where is this book on the way to a preview, what is the next action, and does the operator
 * need to decide anything? The `preview-hazirla` skill loops: status -> do the next action -> status.
 * It never runs a pipeline step, never edits the storyboard, config or mute numbers, and never changes a bar.
 *
 *   node scripts/preview-state.js status     --slug=<s> [--json] [--root=<dir>]   READ-ONLY
 *   node scripts/preview-state.js candidates [--json] [--root=<dir>]              READ-ONLY: which slug "preview hazırla" means
 *   node scripts/preview-state.js pin        --slug=<s> [--min=<sha>] [--root=<dir>]
 *        -> books/<s>/production-base.json (the engine commit this book is produced on; never moved mid-book)
 *   node scripts/preview-state.js worktree   --slug=<s> [--min=<sha>]
 *        -> ../wt-book-<s>: a linked worktree, detached at origin/god-mode, with this book's inputs copied in
 *   node scripts/preview-state.js note       --slug=<s> --step=<key> --result=ok|transient|quality --msg="<text>" [--root=<dir>]
 *        -> audit/preview-run/<s>/attempts.jsonl (status stops after 3 transient failures of the same step)
 *
 * status prints one of:
 *   CONTINUE     the next action is the agent's (a command, an agent run, a storyboard fix)
 *   READY_CHECK  every recorded fact says ready: run preview-ready.js — READY is ONLY what preview-ready prints
 *   OPERATOR     only the operator can decide (code + reason + evidence)
 * Exit code: 0 always for status/candidates (a report); pin/worktree/note exit 1 on refusal.
 * Why (2026-10-23): "preview hazırla" must run end to end without routine questions; the agent needs one
 * deterministic answer to "where am I, what next, when do I stop" that survives a new session.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/s);
  return m ? [m[1], m[2]] : [a.slice(2), true];
}));
const CMD = process.argv.slice(2).find((a) => !a.startsWith("--")) || "status";
const ROOT = path.resolve(args.root || path.join(__dirname, ".."));
const MAX_ATTEMPTS = 3;       // a step that failed transiently this many times in a row stops for the operator
const MAX_FIX_ROUNDS = 2;     // STORYBOARD_RUNBOOK.md §4 (operator-approved 2026-10-17)

// status reads other agents' checkouts: git must never take an index.lock there (git status refreshes the index)
process.env.GIT_OPTIONAL_LOCKS = "0";
const CODE_PATHS = ["scripts", "src", "data/quality-policy.json"];   // engine code (icon-readings is data: it may be committed mid-book, contract §3)
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const exists = (p) => fs.existsSync(p);
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const shaFile = (p) => (exists(p) ? sha(fs.readFileSync(p)) : null);
const git = (argv, cwd = ROOT) => { try { return execFileSync("git", argv, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
const iso = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16) : "-");
// other checkouts of this repo where the book is being produced (its production-base.json lives there)
function productionWorktreesOf(slug, root = ROOT) {
  const out = git(["worktree", "list", "--porcelain"], root) || "";
  return out.split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => path.resolve(l.slice(9).trim()))
    .filter((w) => { if (w === path.resolve(root)) return false; const p = readJSON(path.join(w, "books", slug, "production-base.json")); return !!(p && p.worktree === path.basename(w)); });
}

// The production worktree's node_modules: a junction to the main checkout's (measured 2026-10-23: `git worktree
// remove --force` deletes THROUGH it and empties the main node_modules; a LOCKED worktree makes git refuse;
// PowerShell Remove-Item -Recurse, rm -rf and rmdir /s do not follow it).
function mainCheckoutOf(root) {
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], root);
  return common ? path.resolve(common, "..") : null;
}
function isLocked(wt, main) {
  const lines = (git(["worktree", "list", "--porcelain"], main) || "").split(/\r?\n/);
  for (let k = 0; k < lines.length; k++) if (lines[k].startsWith("worktree ") && path.resolve(lines[k].slice(9).trim()) === path.resolve(wt)) {
    for (let j = k + 1; j < lines.length && lines[j].trim(); j++) if (lines[j].startsWith("locked")) return true;
    return false;
  }
  return false;
}
function nodeModulesHealth(wt) {
  const main = mainCheckoutOf(wt), link = path.join(wt, "node_modules"), want = main && path.join(main, "node_modules");
  let st = null; try { st = fs.lstatSync(link); } catch {}
  const locked = main ? isLocked(wt, main) : false;
  if (!st) return { state: "missing", locked };
  if (!st.isSymbolicLink()) return { state: "real", locked, detail: "node_modules is a real folder (not a link)" };
  let target = null; try { target = path.resolve(path.dirname(link), fs.readlinkSync(link)); } catch {}
  if (!target || !want || path.resolve(target).toLowerCase() !== path.resolve(want).toLowerCase() || !exists(path.join(want, ".bin")))
    return { state: "broken", locked, detail: `node_modules → ${target || "?"} (expected ${want}${want && !exists(path.join(want, ".bin")) ? ", which has no .bin" : ""})` };
  return { state: "ok", locked };
}

// ── the facts of one book ────────────────────────────────────────────────────
function bookState(slug, root = ROOT) {
  const B = path.join(root, "books", slug), SB = path.join(B, "storyboard");
  const st = { slug, root, stages: [], next: null, operator: null };
  const stage = (key, status, detail = "") => { st.stages.push({ key, status, detail }); return status; };
  const stop = (code, reason, evidence = []) => { if (!st.operator) st.operator = { code, reason, evidence }; };
  const go = (key, action, command = null, why = "") => { if (!st.next) st.next = { stage: key, action, command, why }; };
  const blocked = () => !!(st.next || st.operator);

  // 0. published books are frozen
  let frozen = false;
  try { frozen = require("./lib/frozen").isFrozen(slug, root); } catch {}
  if (frozen) { stop("FROZEN", `${slug} is in PUBLISHED_BOOKS.md (Summary Table): published books are never re-planned`); return finish(st); }

  // 1. inputs
  const book = readJSON(path.join(B, "book.json"));
  const audio = ["m4a", "mp3", "wav"].map((x) => path.join(root, "public", "audio", `${slug}.${x}`)).find(exists);
  const vtt = path.join(root, "public", "captions", `${slug}.vtt`);
  // a placeholder is not a recording / a caption file: a NotebookLM summary is many MB; its VTT has cues
  const audioBytes = audio ? fs.statSync(audio).size : 0;
  const vttCues = exists(vtt) ? (fs.readFileSync(vtt, "utf8").match(/-->/g) || []).length : 0;
  const missing = [!book && `books/${slug}/book.json (Step 0)`,
    !audio ? `public/audio/${slug}.m4a` : audioBytes < 100 * 1024 && `public/audio/${path.basename(audio)} is ${audioBytes} bytes — not a recording`,
    !exists(vtt) ? `public/captions/${slug}.vtt` : !vttCues && `public/captions/${slug}.vtt has no cues`].filter(Boolean);
  if (missing.length) { stage("inputs", "missing", missing.join(", ")); stop("MISSING_INPUT", "a required input is not on disk — never invented", missing); return finish(st); }
  const engine = book.engine;
  st.engine = engine;
  if (engine !== "antidote" && engine !== "vox") { stage("inputs", "missing", "book.json has no engine"); stop("STEP0_ENGINE", "no engine in book.json: Step 0 (notebooklm-prompt) was not done"); return finish(st); }
  if (!book.engineProfile || !Object.keys(book.engineProfile).length) { stage("inputs", "missing", "book.json has no engineProfile"); stop("STEP0_ENGINE", "no engineProfile in book.json: Step 0 is incomplete (storyboard prep refuses)"); return finish(st); }
  const ec = book.engineCheck;
  // the operator decided "keep" once (engineCheck.confirmed): every later prep must carry it, or prep asks again
  const CE = ec && ec.confirmed ? " --confirm-engine" : "";
  if (ec && !ec.confirmed && ((ec.confidence === "strong" && ec.fit && ec.fit !== engine) || (engine === "vox" && (ec.risks || []).length))) {
    stage("inputs", "blocked", `narration fit ${ec.fit} (${ec.confidence}) vs book.json ${engine}`);
    stop("ENGINE_CONTRADICTION", `storyboard prep stopped: the narration points to ${String(ec.fit).toUpperCase()} (${ec.confidence}) but the book was recorded for ${engine.toUpperCase()}. Keep (--confirm-engine) or switch (new prompt + audio + VTT) is the operator's decision`, (ec.reasons || []).slice(0, 4));
    return finish(st);
  }
  stage("inputs", "done", `${engine}; audio ${path.basename(audio)}; ${ec ? `engine check ${ec.fit}/${ec.confidence}${ec.confirmed ? " (confirmed)" : ""}` : "engine check runs at prep"}`);

  // 2. code: one pinned commit, clean, for the whole book
  const pin = readJSON(path.join(B, "production-base.json"));
  const elsewhere = pin ? [] : productionWorktreesOf(slug, root);
  if (elsewhere.length) {
    stage("code", "elsewhere", `this book is produced in ${elsewhere.join(", ")}`);
    st.worktree = elsewhere[0];
    go("code", `Continue in the book's production worktree (its files and pinned engine are there)`, `cd "${elsewhere[0]}" && node scripts/preview-state.js status --slug=${slug}`);
    return finish(st);
  }
  const head = git(["rev-parse", "HEAD"], root);
  const gitDir = git(["rev-parse", "--git-dir"], root), common = git(["rev-parse", "--git-common-dir"], root);
  const linked = !!gitDir && !!common && path.resolve(root, gitDir) !== path.resolve(root, common);
  st.code = { head: head && head.slice(0, 8), linkedWorktree: linked, pinned: pin && pin.productionBase && pin.productionBase.slice(0, 8) };
  if (head) {
    // the same drift rule production-guard stops on (tracked code changed, or untracked code that can be required)
    let codeDrift = [];
    try { codeDrift = require("./lib/production-guard").codeState(root).drift.map((d) => `${d.file} (${d.change})`); } catch {}
    if (!pin) {
      stage("code", "todo", `not pinned (HEAD ${head.slice(0, 8)}, ${linked ? "linked worktree" : "MAIN checkout"})`);
      const started = exists(path.join(B, "story-bible.json")) || exists(SB);
      if (!linked && !started) go("code", "Create this book's production worktree (never produce a new book in the shared checkout), then continue THERE", `node scripts/preview-state.js worktree --slug=${slug}`, "contract §3: one book, one worktree, one engine commit");
      else go("code", "Pin the engine commit for this book", `node scripts/preview-state.js pin --slug=${slug}`, linked ? "" : "legacy: this book's work already lives in the main checkout — keep it there, pinned");
    } else if (pin.productionBase !== head && (git(["diff", "--name-only", pin.productionBase, "HEAD", "--", ...CODE_PATHS], root) ?? "?") !== "") {
      // a commit that changes only data/icon-readings.json, docs or book files is not an engine move
      stage("code", "blocked", `HEAD ${head.slice(0, 8)} ≠ pinned ${pin.productionBase.slice(0, 8)} (engine code differs)`);
      stop("CODE_MOVED", "the checkout is no longer on the engine commit this book was produced on (contract §3: never pull new engine code mid-book unless the operator asks)", [`pinned ${pin.productionBase}`, `HEAD ${head}`]);
    } else if (codeDrift.length) {
      stage("code", "blocked", `${codeDrift.length} code file(s) differ from HEAD`);
      stop(linked ? "CODE_DIRTY" : "OWNERSHIP", linked ? "uncommitted code in this book's worktree — production never runs on uncommitted code" : "uncommitted code in the shared checkout (another agent's): production-guard refuses; never stash/reset it", codeDrift.slice(0, 12));
    } else {
      // a production worktree (made by `worktree`): its node_modules link must point at the main checkout's and the
      // worktree must stay LOCKED, so `git worktree remove --force` refuses instead of emptying the main node_modules
      const nm = linked && pin.worktree === path.basename(root) ? nodeModulesHealth(root) : null;
      if (nm && nm.state === "missing") { stage("code", "todo", "node_modules link missing"); go("code", "Recreate the node_modules link (and the lock) of this production worktree", `node scripts/preview-state.js worktree --slug=${slug}`, "run it from the main checkout"); }
      else if (nm && nm.state === "broken") { stage("code", "blocked", nm.detail); stop("NODE_MODULES_BROKEN", "the production worktree's node_modules link does not reach the main checkout's node_modules — never npm install over it; the operator checks the main checkout", [nm.detail]); }
      else if (nm && !nm.locked) { stage("code", "todo", "production worktree not locked"); go("code", "Lock the production worktree (protects the main node_modules from `git worktree remove --force`)", `node scripts/preview-state.js worktree --slug=${slug}`, "run it from the main checkout"); }
      else stage("code", "done", `pinned ${pin.productionBase.slice(0, 8)}${pin.productionBase !== head ? ` (HEAD ${head.slice(0, 8)}: no engine change)` : ""} (${linked ? "linked worktree" : "main checkout"}${nm ? `; node_modules → main, locked` : ""})`);
    }
  } else stage("code", "n/a", "not a git checkout");
  if (blocked()) return finish(st);

  // 3. story bible (+ cast variants for Antidote)
  const bible = readJSON(path.join(B, "story-bible.json"));
  if (!bible || bible.authored !== true) {
    stage("bible", "todo", bible ? "story-bible.json not authored" : "no story-bible.json");
    go("bible", "Author the story bible (runbook §1): fix-vtt-names, plan-bible --emit, rewrite against the evidence, plan-bible --bible",
      `node scripts/fix-vtt-names.js --slug=${slug} && node scripts/plan-bible.js --slug=${slug} --vtt=public/captions/${slug}.vtt --emit=books/${slug}/bible.draft.json`,
      exists(path.join(B, "bible.draft.json")) ? "bible.draft.json exists — do NOT re-run --emit over your rewrite; finish it and run plan-bible --bible" : "");
    return finish(st);
  }
  const cast = Object.entries(bible.cast || {});
  if (engine === "antidote") {
    const undressed = cast.filter(([k, c]) => k !== "narrator" && !(c && c.variant && c.variant.gender && c.variant.outfit)).map(([k]) => k);
    if (undressed.length) { stage("bible", "todo", `cast without variant: ${undressed.join(", ")}`); go("bible", "Dress every cast member (runbook §1c) — prep stops without variants", null); return finish(st); }
  }
  stage("bible", "done", `${cast.length} cast`);

  // 4. own icons (Antidote): drawn, sheet current, blind naming recorded and matching
  if (engine === "antidote") {
    const sig = (bible.signatureObjects || []).map((o) => o && o.key).filter(Boolean);
    const mf = path.join(B, "motifs.json"), mot = readJSON(mf, {}) || {};
    const own = mot.motifs || mot;
    const undrawn = sig.filter((k) => !own[k]);
    if (undrawn.length) { stage("ownIcons", "todo", `not drawn: ${undrawn.join(", ")}`); go("ownIcons", "Draw the signature objects in motifs.json (runbook §1b)", null); return finish(st); }
    if (!Object.keys(own).length) stage("ownIcons", "n/a", "no own icons");
    else {
      const sheetKey = path.join(SB, "own-icons.key.json"), naming = path.join(SB, "own-icons.naming.json");
      const nm = readJSON(naming);
      if (mtime(sheetKey) < mtime(mf)) { stage("ownIcons", "todo", "sheet older than motifs.json"); go("ownIcons", "Draw the sheet, then a FRESH sonnet agent names each number (OWN-ICONS-PROMPT.md); record its answers in storyboard/own-icons.naming.json", `node scripts/own-icons-sheet.js --slug=${slug}`); return finish(st); }
      // a record counts only with an answer for every number on the current sheet (own-icons.key.json)
      const sheetNums = Object.keys(readJSON(sheetKey, {}) || {});
      const names = nm && nm.names && typeof nm.names === "object" ? nm.names : null;
      const complete = !!names && sheetNums.every((n) => names[n]);
      const misread = complete ? sheetNums.filter((n) => names[n].match !== true).map((n) => `${n}: "${names[n].said}"`) : [];
      // a book whose authors already ran on these icons is not sent back for a record this convention added later
      const authoredAlready = exists(SB) && fs.readdirSync(SB).some((f) => /^authored-\d+\.json$/.test(f));
      if (!nm && authoredAlready) stage("ownIcons", "done", `${Object.keys(own).length} drawn; blind naming not recorded (authoring already ran on them)`);
      else if (!complete || mtime(naming) < mtime(sheetKey)) { stage("ownIcons", "todo", "blind naming not recorded for the current sheet"); go("ownIcons", "Run a FRESH sonnet namer on OWN-ICONS-PROMPT.md and record {names:{\"<n>\":{said,intended,match}}} in storyboard/own-icons.naming.json", null); return finish(st); }
      else if (misread.length) { stage("ownIcons", "todo", `misread: ${misread.join("; ")}`); go("ownIcons", "Redraw every misread icon in motifs.json, re-draw the sheet, name again with a NEW fresh agent", `node scripts/own-icons-sheet.js --slug=${slug}`); return finish(st); }
      else stage("ownIcons", "done", `${Object.keys(own).length} drawn, blind-named`);
    }
  }

  // 5. storyboard prep: current against the bible + own icons
  const vocab = readJSON(path.join(SB, "vocab.json"));
  const prompts = exists(path.join(SB, "PROMPTS.md")) ? fs.readFileSync(path.join(SB, "PROMPTS.md"), "utf8") : "";
  const nChunks = (prompts.match(/^### Author \d+/gm) || []).length;
  const inputsNow = { "story-bible.json": shaFile(path.join(B, "story-bible.json")), "motifs.json": shaFile(path.join(B, "motifs.json")) };
  const prepStale = !vocab || !nChunks || (engine === "antidote" && (!vocab.inputs || vocab.inputs["story-bible.json"] !== inputsNow["story-bible.json"] || vocab.inputs["motifs.json"] !== inputsNow["motifs.json"]));
  if (prepStale) {
    stage("prep", "todo", !vocab ? "not run" : "stale: story-bible.json / motifs.json changed after prep");
    go("prep", "Storyboard prep (after the bible, own icons and variants are final)", `node scripts/storyboard.js prep --slug=${slug}${CE}`);
    return finish(st);
  }
  stage("prep", "done", `${nChunks} chunks`);

  // 6. authors
  const chunkBeats = (k) => ((readJSON(path.join(SB, `chunk-${k}.json`)) || {}).beats || []).map((b) => b.i);
  const missingK = [];
  for (let k = 1; k <= nChunks; k++) {
    const a = readJSON(path.join(SB, `authored-${k}.json`));
    const list = Array.isArray(a) ? a : null;
    const need = chunkBeats(k), have = new Set((list || []).map((x) => x && x.i));
    if (!list || need.some((i) => !have.has(i))) missingK.push(k);
  }
  if (missingK.length) {
    stage("authors", "todo", `${nChunks - missingK.length}/${nChunks} chunks authored; missing ${missingK.join(",")}`);
    go("authors", `Run the author prompts ${missingK.map((k) => `Author ${k}`).join(", ")} from storyboard/PROMPTS.md — one fresh agent each, in parallel; never the blind readers or judges`, null);
    return finish(st);
  }
  stage("authors", "done", `${nChunks}/${nChunks} chunks`);
  // exactly the files merge and gate-b read (a stray authored-3.bak.json must not hold a stage open)
  const authoredFiles = fs.readdirSync(SB).filter((f) => /^authored-\d+\.json$/.test(f)).map((f) => path.join(SB, f));
  const authoredM = Math.max(...authoredFiles.map(mtime));

  // 7. Gate B (Antidote, staged relationships only)
  if (engine === "antidote") {
    const beats = new Map((((readJSON(path.join(SB, "beats.json")) || {}).beats) || []).map((b) => [b.i, b.narration || b.text || ""]));
    const staged = authoredFiles.flatMap((f) => (readJSON(f, []) || [])).filter((a) => a && a.stageRelationship && a.relationship);
    const stale = staged.filter((a) => { const v = readJSON(path.join(SB, "gate-b", `${a.i}.json`)); return !v || v.inputSha256 !== sha(JSON.stringify({ relationship: a.relationship, narration: String(beats.get(a.i) || "").trim() })); });
    if (stale.length) { stage("gateB", "todo", `${stale.length}/${staged.length} staged relationship(s) without a current verdict`); go("gateB", "Gate B for the staged relationships (needs GOOGLE_API_KEY; never print it). FALLBACK = author the beat normally", `node scripts/gate-b-relationship.js --slug=${slug}`); return finish(st); }
    stage("gateB", staged.length ? "done" : "n/a", staged.length ? `${staged.length} staged` : "no staged relationships");
  }

  // 8. merge
  const artPath = path.join(B, engine === "antidote" ? "art.json" : "designs.json");
  const artM = mtime(artPath);
  const gateBM = exists(path.join(SB, "gate-b")) ? Math.max(0, ...fs.readdirSync(path.join(SB, "gate-b")).map((f) => mtime(path.join(SB, "gate-b", f)))) : 0;
  if (!artM || artM < Math.max(authoredM, mtime(path.join(SB, "vocab.json")), gateBM)) {
    stage("merge", "todo", !artM ? `no ${path.basename(artPath)}` : `${path.basename(artPath)} older than the authored files / prep`);
    go("merge", "Validate, fix every ✗ yourself in authored-K.json (merge without --write exits 0 even with problems: read 'problems (N)'), then write",
      `node scripts/storyboard.js merge --slug=${slug} && node scripts/storyboard.js merge --slug=${slug} --write`);
    return finish(st);
  }
  stage("merge", "done", `${path.basename(artPath)} ${iso(artM)}`);

  // 9. readcheck (Antidote): every beat read blind before the first render; changed beats re-read before the next one
  const cfgPath = path.join(B, engine === "antidote" ? "config.antidote.json" : "config.vox.json");
  const cfgM = mtime(cfgPath);
  if (engine === "antidote") {
    const rc = readJSON(path.join(B, "readcheck.json"));
    const rcM = mtime(path.join(B, "readcheck.json"));
    // legacy only: a film that already went through blind mute verdicts without a readcheck is not sent back
    const judgedBefore = ((((readJSON(path.join(B, "mute-test.json")) || {}).runs) || []).some((r) => r.totals));
    if (!rc && cfgM && cfgM >= artM && judgedBefore) stage("readcheck", "n/a", "no readcheck.json — this film was judged without one (runbook §2b runs it before the first make-book)");
    else if (!rc) { stage("readcheck", "todo", "not run"); go("readcheck", "Readcheck every beat (runbook §2b): prep → blind readers (fresh sonnet, parallel) → judge → judges → tally", `node scripts/readcheck.js prep --slug=${slug}`); return finish(st); }
    else if (rc.n < rc.total) { stage("readcheck", "todo", `${rc.n}/${rc.total} beats judged`); go("readcheck", "Finish the readcheck: every reader/judge file must exist (tally warns 'only n/total')", `node scripts/readcheck.js tally --slug=${slug}`); return finish(st); }
    else if (rcM < artM) { stage("readcheck", "todo", "art.json changed after the readcheck"); go("readcheck", "Re-read the beats you changed: prep --beats=<ids> → readers → judge --recheck=N → judges → tally (rewrites readcheck.json)", null); return finish(st); }
    else stage("readcheck", "done", `WRONG ${((rc.totals || {}).WRONG) || 0}/${rc.n} (${Math.round((rc.wrongRate || 0) * 1000) / 10}%; runbook aim ≤ 3%)`);
  }

  // 10. make-book with every blocking gate. Done = make-book.done.json (written only on make-book's success exit)
  // for THIS config and THIS storyboard — a gate that writes no report (continuity, composition) cannot look passed.
  // the marker must say done AND the config + every input (storyboard, story bible, own icons, VTT, audio) must still
  // hash as they did when make-book finished (lib/make-book-marker.js); a run that failed left "running"
  const mark = cfgM ? require("./lib/make-book-marker").verify(root, slug, path.relative(root, cfgPath)) : { ok: false, exists: exists(path.join(B, "make-book.done.json")), why: "no config" };
  const doneOk = mark.ok && Date.parse((readJSON(path.join(B, "make-book.done.json")) || {}).at) >= artM - 1000;
  const rep = (f) => { const p = path.join(B, f); return { j: readJSON(p), m: mtime(p) }; };
  const gates = [];
  const au = rep("authorship.report.json");
  if (au.j && au.m >= artM && au.j.status !== "PASS") gates.push(`authorship ${au.j.status} ${JSON.stringify(au.j.counts || {})}`);
  if (engine === "antidote") {
    const fw = ["narrative-visual-firewall.preview.report.json", "narrative-visual-firewall.report.json"].map(rep).filter((r) => r.j && r.m >= artM).sort((a, b) => b.m - a.m)[0];
    if (fw && ((fw.j.counts || {}).blocks || 0) > 0) gates.push(`firewall ${fw.j.counts.blocks} BLOCK`);
    const stx = rep("screen-text.report.json");
    if (stx.j && stx.m >= artM && stx.j.status !== "PASS") gates.push(`screen-text ${stx.j.status}`);
  }
  // a book planned before the marker existed: accepted only when a mute run was judged on this very config
  const mt = ((readJSON(path.join(B, "mute-test.json")) || {}).runs) || [];
  const legacyOk = !mark.exists && cfgM >= artM && !gates.length && au.j && au.j.status === "PASS" && mt.some((r) => r.totals && Date.parse(r.date) >= cfgM);
  const mbCmd = `node scripts/make-book.js --slug=${slug} --title="${book.title || ""}" --author="${book.author || ""}" --genre=${book.genre || "<genre>"} --skip-pack${engine === "antidote" ? " --preview-only" : ""}`;
  if (!doneOk && !legacyOk) {
    if (gates.length) { stage("makeBook", "failed", gates.join("; ")); go("makeBook", "Fix the gate failure in the STORYBOARD (authored-K.json → merge --write → make-book). An engine-owned failure: AGENT_LOG for-review, work around it in the storyboard; if no storyboard change can clear it, the operator decides", mbCmd, gates.join("; ")); return finish(st); }
    stage("makeBook", "todo", !cfgM ? "no config" : mark.exists ? mark.why : "make-book has not finished on this storyboard");
    go("makeBook", "make-book with every gate (runbook §3). It finished only if it printed ✅ HAZIR (and wrote make-book.done.json). A blocking step's ❌ ADIM BAŞARISIZ: a gate → fix the storyboard; step 0 VTT pre-flight → input problem, stop for the operator; a crash → note it (transient) and re-run",
      mbCmd);
    return finish(st);
  }
  stage("makeBook", "done", `config ${iso(cfgM)}; finished${legacyOk ? " (legacy: no make-book.done.json, judged on this config)" : ""}`);

  // 11. sealed holdout + verdict runs — only runs of THIS production (after the pin), only holdout attempts
  const MD = path.join(root, "audit", "mute", slug);
  const labels = exists(MD) ? fs.readdirSync(MD).filter((l) => exists(path.join(MD, l, "sample.json"))) : [];
  const L = (l) => { const d = path.join(MD, l); const f = (n) => path.join(d, n); return { l, d, sealed: exists(f("seal.json")), tallied: exists(f("totals.json")), meta: readJSON(f("sample-meta.json"), {}) || {},
    key: mtime(f("key.json")), blind: mtime(f("blind.json")), jin: mtime(f("judge-input.json")), jres: mtime(f("judge-result.json")) }; };
  const all = labels.map(L);
  const metaOf = new Map(all.map((x) => [x.l, x.meta]));
  let pol = {}; try { pol = (readJSON(path.join(root, "data", "quality-policy.json")) || {}).muteTest || {}; } catch {}
  const W = pol.blocking?.wrongPer30 ?? 1, D = pol.blocking?.deadPer30 ?? 5;
  const passOf = (r) => (r.totals.WRONG || 0) <= Math.floor((W * r.n) / 30) && (r.totals.NONE || 0) <= Math.floor((D * r.n) / 30);
  const isFresh = (r) => (r.sample ? r.sample === "fresh" : !r.vs);
  const scopeFrom = pin && pin.at ? Date.parse(pin.at) || 0 : 0;
  const inScope = mt.filter((r) => r.totals && (Date.parse(r.date) || 0) >= scopeFrom);
  // a holdout ATTEMPT = any tallied run that is not a diagnostic (--vs / --frames-from); a reused-sample attempt
  // counts as a round too (else a short book could draw holdouts forever), but only a fresh one is a verdict
  const attempts = inScope.filter((r) => !r.vs && !(metaOf.get(r.label) || {}).framesFrom).map((r) => ({ ...r, pass: passOf(r), fresh: isFresh(r) }));
  st.mute = inScope.map((r) => ({ label: r.label, WRONG: r.totals.WRONG || 0, dead: r.totals.NONE || 0, ADDS: r.totals.ADDS || 0, EXPLAINS: r.totals.EXPLAINS || 0, n: r.n, fresh: isFresh(r), pass: passOf(r), date: r.date }));
  if (!all.some((x) => x.sealed) && !attempts.length) {
    stage("seal", "todo", "no sealed holdout");
    go("seal", "Seal the verdict sample now — right after the first make-book, before any framecheck (renders nothing)", `node scripts/mute-test.js prep --slug=${slug} --label=final --seal`);
    return finish(st);
  }
  stage("seal", "done", all.some((x) => x.sealed) ? "sealed" : "legacy runs (no seal)");

  // an open (untallied, non-diagnostic) label: carry it through its sub-steps
  const open = all.filter((x) => !x.tallied && !x.meta.framesFrom);
  const filmM = Math.max(artM, cfgM);
  for (const o of open) {
    const why = o.sealed ? "the sealed verdict sample (re-rendered from the current config)" : "a fresh holdout";
    if (o.sealed && !o.key) { stage("mute", "todo", `${o.l}: sealed, not rendered yet`); go("mute", `Render ${why} — run in the background`, `node scripts/mute-test.js prep --slug=${slug} --label=${o.l}`, "transient render failures (bundle, Chrome, timeout): re-run the same prep; note each attempt"); return finish(st); }
    if (!o.key) { stage("mute", "todo", `${o.l}: sample drawn, render did not finish`); go("mute", `Re-run the prep of ${o.l} (same label, same sample)`, `node scripts/mute-test.js prep --slug=${slug} --label=${o.l}`, "a sample.json without key.json is a failed render"); return finish(st); }
    if (o.blind < o.key) { stage("mute", "todo", `${o.l}: needs the blind describer`); go("mute", `A FRESH sonnet agent runs audit/mute/${slug}/${o.l}/PROMPTS.md §1 (never an author, never told the book)`, null); return finish(st); }
    if (o.jin < o.blind) { stage("mute", "todo", `${o.l}: run judge`); go("mute", "Build the judge input (stops with 'filed under the wrong images' → a NEW fresh describer, never the same blind.json)", `node scripts/mute-test.js judge --slug=${slug} --label=${o.l}`); return finish(st); }
    if (o.jres < o.jin) { stage("mute", "todo", `${o.l}: needs the judge`); go("mute", `A FRESH sonnet agent runs PROMPTS.md §3 (judge) for ${o.l}`, null); return finish(st); }
    stage("mute", "todo", `${o.l}: tally`); go("mute", "Tally (exit 0 on PASS AND FAIL — read the verdict from mute-test.json)", `node scripts/mute-test.js tally --slug=${slug} --label=${o.l}`); return finish(st);
  }
  const used = new Set(labels);
  const nextLabel = () => { let k = attempts.length + 1; while (used.has(`run${k}`)) k++; return `run${k}`; };
  if (!attempts.length) { stage("mute", "todo", "no holdout run in this production"); go("mute", "Draw a fresh holdout", `node scripts/mute-test.js prep --slug=${slug} --label=${nextLabel()}`); return finish(st); }
  const last = attempts[attempts.length - 1];
  const lastTally = Date.parse(last.date) || 0;
  const line = (r) => `${r.label}: WRONG ${r.totals.WRONG || 0}/${r.n}, dead ${r.totals.NONE || 0}/${r.n}, ADDS ${r.totals.ADDS || 0}/${r.n}, EXPLAINS ${r.totals.EXPLAINS || 0}/${r.n} → ${r.pass ? "PASS" : "FAIL"}${r.fresh ? "" : " (reused frames: not a verdict)"}`;
  st.fixRounds = { used: attempts.length - 1, max: MAX_FIX_ROUNDS };
  const filmChanged = filmM > lastTally;
  // READY only on a fresh PASS judged on the film as it is now
  if (last.fresh && last.pass && !filmChanged) {
    stage("mute", "done", line(last));
    st.state = "READY_CHECK";
    go("ready", "Run preview-ready (READY is only what it prints, exit 0) and the books registry, then the hand-off (antidote-quality-handoff)", `node scripts/preview-ready.js --slug=${slug} && node scripts/gen-books-registry.js`);
    return finish(st);
  }
  stage("mute", last.pass && last.fresh ? "stale" : "failed", attempts.map(line).join(" · ") + (last.pass && last.fresh ? " — the film changed after this PASS: it is not a verdict for the current film" : ""));
  if (attempts.length > MAX_FIX_ROUNDS) {
    stop("FIX_ROUNDS_EXHAUSTED", `${attempts.length - 1} fix rounds used (limit ${MAX_FIX_ROUNDS}) and there is no fresh PASS on the current film — report the remaining failures with evidence (antidote-quality-handoff); the operator decides`, attempts.map(line));
    return finish(st);
  }
  // the last holdout had to reuse frames (a short book: no unseen beats left) — no later holdout can be fresh either
  if (!last.fresh) {
    stop("HOLDOUT_EXHAUSTED", `${last.label} had to reuse frames already shown (no unseen beats left for a fresh holdout) — no fresh verdict is possible on this book; report the runs, the operator decides`, attempts.map(line));
    return finish(st);
  }
  const ledDir = path.join(root, "audit", "cause-ledger", slug);
  const ledgers = exists(ledDir) ? fs.readdirSync(ledDir).filter((f) => f.endsWith(".json")).map((f) => path.join(ledDir, f)).sort((a, b) => mtime(b) - mtime(a)) : [];
  if (engine === "antidote" && !last.pass && (!ledgers.length || mtime(ledgers[0]) < lastTally)) { stage("fixRound", "todo", "cause-ledger older than the last tally"); go("fixRound", "Owner first: cause-ledger, then similar-candidates", `node scripts/cause-ledger.js --slug=${slug} && node scripts/similar-candidates.js --slug=${slug} --include=WRONG,NONE`); return finish(st); }
  if (!filmChanged || cfgM < artM) {
    // nothing the storyboard owns: every failure the ledger attributes is ENGINE / VOCABULARY / RATER
    const led = ledgers.length ? readJSON(ledgers[0], {}) || {} : {};
    const owners = led.tally || {};
    const n = (o) => ((owners[o] || {}).WRONG || 0) + ((owners[o] || {}).DEAD || 0);
    if (engine === "antidote" && !filmChanged && !last.pass && ledgers.length && n("AUTHORING") === 0 && n("ENGINE") + n("VOCABULARY") + n("RATER") > 0) {
      stop("ENGINE_LIMIT", "the latest holdout FAILs and the cause-ledger attributes no failure to the storyboard (ENGINE / VOCABULARY / RATER only) — no authoring fix can clear it; log for-review items, check the stills, report", [`ENGINE ${n("ENGINE")}, VOCABULARY ${n("VOCABULARY")}, RATER ${n("RATER")}, AUTHORING 0 (${path.basename(ledgers[0])})`, line(last)]);
      return finish(st);
    }
    stage("fixRound", "todo", `round ${attempts.length} of ${MAX_FIX_ROUNDS}: the film has not changed since ${last.label}`);
    go("fixRound", `Fix round ${attempts.length}: storyboard prep → fix only CONFIRMED authoring classes on their REVIEW beats (soft cap ~25) → merge --write → readcheck the changed beats → make-book. ENGINE/VOCABULARY → AGENT_LOG for-review; RATER → noted. If no authoring class is confirmed after you looked at the stills, nothing in the storyboard can fix it: stop and report (engine limit)`,
      `node scripts/storyboard.js prep --slug=${slug}${CE}`, "never draw a new holdout on an unchanged film");
    return finish(st);
  }
  stage("fixRound", "done", `film changed after ${last.label}`);
  go("mute", `Fresh holdout for round ${attempts.length} (new label, NO --frames-from)`, `node scripts/mute-test.js prep --slug=${slug} --label=${nextLabel()}`);
  return finish(st);
}

// transient-failure budget: the same next step failing transiently MAX_ATTEMPTS times in a row stops
function finish(st) {
  const log = path.join(st.root, "audit", "preview-run", st.slug, "attempts.jsonl");
  const rows = exists(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  st.attempts = rows.length;
  if (st.next && !st.operator) {
    const mine = rows.filter((r) => r.step === st.next.stage);
    let streak = 0;
    for (let i = mine.length - 1; i >= 0 && mine[i].result === "transient"; i--) streak++;
    st.next.transientFailures = streak;
    if (streak >= MAX_ATTEMPTS) st.operator = { code: "TECHNICAL_RETRY_LIMIT", reason: `step "${st.next.stage}" failed ${streak} times in a row with a transient error — no further retries; the evidence is in audit/preview-run/${st.slug}/attempts.jsonl`, evidence: mine.slice(-MAX_ATTEMPTS).map((r) => `${r.at} ${r.msg}`) };
  }
  if (st.operator) st.state = "OPERATOR";
  else if (!st.state) st.state = st.next ? "CONTINUE" : "OPERATOR";
  if (st.state === "OPERATOR" && !st.operator) st.operator = { code: "UNKNOWN", reason: "no next action could be determined", evidence: [] };
  return st;
}

function print(st) {
  console.log(`── preview state · ${st.slug}${st.engine ? ` [${st.engine}]` : ""} → ${st.state}`);
  for (const s of st.stages) console.log(`   ${{ done: "✓", "n/a": "·", todo: "→", failed: "✗", blocked: "✗", missing: "✗", elsewhere: "↗", stale: "✗" }[s.status] || "?"} ${s.key.padEnd(9)} ${s.status.padEnd(7)} ${s.detail}`);
  if (st.fixRounds) console.log(`   fix rounds used: ${st.fixRounds.used}/${st.fixRounds.max}`);
  if (st.operator) {
    console.log(`\nOPERATOR · ${st.operator.code}: ${st.operator.reason}`);
    (st.operator.evidence || []).forEach((e) => console.log(`   - ${e}`));
  } else if (st.next) {
    console.log(`\nNEXT (${st.next.stage}): ${st.next.action}`);
    if (st.next.command) console.log(`   $ ${st.next.command}`);
    if (st.next.why) console.log(`   note: ${st.next.why}`);
    if (st.next.transientFailures) console.log(`   transient failures of this step so far: ${st.next.transientFailures}/${MAX_ATTEMPTS}`);
  }
}

// ── commands ─────────────────────────────────────────────────────────────────
const SLUG = args.slug;
if (CMD === "status") {
  if (!SLUG) { console.error("Usage: node scripts/preview-state.js status --slug=<slug> [--json]"); process.exit(1); }
  const st = bookState(SLUG);
  if (args.json) console.log(JSON.stringify(st, null, 2)); else print(st);
  process.exit(0);
}

if (CMD === "candidates") {
  // a book the operator can mean by "preview hazırla": Step 0 done, audio + VTT on disk, not published, not READY.
  // The operator drops the files into the MAIN checkout, so that is where we look, whichever checkout runs this
  // (--root or PREVIEW_MAIN_ROOT override it, for tests); a book already in production is judged in its worktree.
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const MAIN = path.resolve(args.root || process.env.PREVIEW_MAIN_ROOT || (common ? path.resolve(common, "..") : ROOT));
  const BD = path.join(MAIN, "books");
  const rows = (exists(BD) ? fs.readdirSync(BD) : []).filter((s) => exists(path.join(BD, s, "book.json")))
    .map((s) => { const here = bookState(s, MAIN); return here.worktree ? { ...bookState(s, here.worktree), worktree: here.worktree } : here; })
    .filter((st) => !(st.operator && ["FROZEN", "MISSING_INPUT"].includes(st.operator.code)))
    .map((st) => ({ slug: st.slug, engine: st.engine, state: st.state, stage: st.operator ? st.operator.code : (st.next || {}).stage, worktree: st.worktree || null,
      started: !!st.worktree || st.stages.some((s) => s.key === "bible" && s.status === "done") }));
  // an open Active WIP row naming the book = another session owns it (never auto-picked; that session resumes it)
  // the shared AGENT_LOG.md is the MAIN checkout's (a linked worktree holds its own, stale copy)
  const logPath = [path.join(MAIN, "AGENT_LOG.md"), path.join(ROOT, "AGENT_LOG.md")].find((p) => exists(p));
  const log = logPath ? fs.readFileSync(logPath, "utf8") : "";
  const wip = (log.split(/^## /m).find((s) => /^Active WIP/.test(s)) || "").split(/\r?\n/).filter((l) => l.startsWith("|") && !/_\(done\)_|✅|^\|\s*agent\s*\|/.test(l));
  // the slug as a whole token in the agent or area column (`books/<s>/`, `preview-<s>`, `wt-book-<s>`, `<s>` …)
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  rows.forEach((r) => { const re = new RegExp(`(^|[\\s/\`(-])${esc(r.slug)}([\\s/\`)]|$)`); const row = wip.find((l) => l.split("|").slice(1, 3).some((c) => re.test(c.trim()))); if (row) r.claimed = row.split("|")[1].trim(); });
  // unique = exactly one book an agent can carry forward now (not READY, not waiting for an operator decision, not
  // claimed, not already in a production worktree — the session that owns that worktree resumes it)
  const workable = rows.filter((r) => r.state === "CONTINUE" && !r.claimed && !r.worktree);
  const notStarted = workable.filter((r) => !r.started);
  const pick = workable.length === 1 ? workable[0].slug : null;
  if (args.json) console.log(JSON.stringify({ pick, candidates: rows }, null, 2));
  else {
    console.log(`── preview candidates in ${MAIN} (Step 0 done, audio + VTT on disk, not published)`);
    rows.forEach((r) => console.log(`   ${r.slug.padEnd(48)} ${String(r.engine).padEnd(8)} ${r.state.padEnd(11)} ${r.worktree ? `in ${path.basename(r.worktree)}` : r.stage || ""}${r.started ? "" : " (not started)"}${r.claimed ? ` · WIP row: ${r.claimed}` : ""}`));
    console.log(pick ? `\nunique: ${pick}` : `\nno unique candidate (${workable.length} workable, ${notStarted.length} not started) — take the slug from the conversation or the WIP row; ask only if neither says`);
  }
  process.exit(0);
}

if (CMD === "pin") {
  if (!SLUG) { console.error("Usage: node scripts/preview-state.js pin --slug=<slug> [--min=<sha>]"); process.exit(1); }
  const B = path.join(ROOT, "books", SLUG), file = path.join(B, "production-base.json");
  const head = git(["rev-parse", "HEAD"]);
  if (!head) { console.error("❌ not a git checkout"); process.exit(1); }
  if (args.min && git(["merge-base", "--is-ancestor", String(args.min), "HEAD"]) === null) { console.error(`❌ HEAD ${head.slice(0, 8)} does not contain the required commit ${args.min}`); process.exit(1); }
  const cur = readJSON(file);
  if (cur && cur.productionBase && cur.productionBase !== head) { console.error(`❌ ${SLUG} is pinned to ${cur.productionBase.slice(0, 8)}; HEAD is ${head.slice(0, 8)}. A book keeps its engine commit (the operator decides a move).`); process.exit(1); }
  if (cur) { console.log(`✓ already pinned to ${cur.productionBase.slice(0, 8)}`); process.exit(0); }
  fs.mkdirSync(B, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ productionBase: head, from: "origin/god-mode", at: new Date().toISOString(), worktree: path.basename(ROOT), ...(args.min ? { minimum: String(args.min) } : {}) }, null, 2) + "\n");
  console.log(`✓ books/${SLUG}/production-base.json → ${head.slice(0, 8)}`);
  process.exit(0);
}

if (CMD === "worktree") {
  // A NEW book's own production worktree: detached at origin/god-mode (no local, uncommitted or branch code),
  // node_modules linked from the main checkout, this book's Step 0 + inputs copied in. Reads the main checkout,
  // writes only the new worktree. Never removes anything (removing a worktree is the operator's cleanup).
  if (!SLUG) { console.error("Usage: node scripts/preview-state.js worktree --slug=<slug> [--min=<sha>]"); process.exit(1); }
  const main = path.resolve(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]) || "", "..");
  const WT = path.resolve(main, "..", `wt-book-${SLUG}`);
  const PIN = path.join(WT, "books", SLUG, "production-base.json");
  // the pin is the completion marker: an existing worktree without it is a half-built one of OURS (resume) — or
  // somebody else's folder (refuse)
  const registered = (git(["worktree", "list", "--porcelain"], main) || "").split(/\r?\n/).some((l) => l.startsWith("worktree ") && path.resolve(l.slice(9).trim()) === WT);
  if (exists(WT) && !registered) { console.error(`❌ ${WT} exists but is not a worktree of this repo — not touching it`); process.exit(1); }
  if (exists(PIN)) {
    // an existing production worktree: repair only its node_modules link and its lock — nothing else is touched
    let st0 = null; try { st0 = fs.lstatSync(path.join(WT, "node_modules")); } catch {}
    if (!st0) fs.symlinkSync(path.join(main, "node_modules"), path.join(WT, "node_modules"), "junction");
    if (!isLocked(WT, main)) git(["worktree", "lock", "--reason", "node_modules is a junction into the main checkout: run `node scripts/preview-state.js unlink --slug=" + SLUG + "` before removing", WT], main);
    const ok = isLocked(WT, main) && nodeModulesHealth(WT).state === "ok";
    console.log(`${ok ? "✓" : "❌"} ${WT} exists${!st0 ? " · node_modules link recreated" : ""} · ${isLocked(WT, main) ? "locked" : "NOT locked"} — continue there (node scripts/preview-state.js status --slug=${SLUG})`);
    process.exit(ok ? 0 : 1);
  }
  let base;
  if (registered) base = git(["rev-parse", "HEAD"], WT);
  else {
    if (git(["fetch", "origin", "god-mode"], main) === null) console.warn("⚠ git fetch failed — using the last fetched origin/god-mode");
    base = git(["rev-parse", "origin/god-mode"], main);
    if (!base) { console.error("❌ no origin/god-mode"); process.exit(1); }
  }
  if (args.min && git(["merge-base", "--is-ancestor", String(args.min), base], main) === null) { console.error(`❌ ${base.slice(0, 8)} does not contain ${args.min}`); process.exit(1); }
  if (!registered && git(["worktree", "add", "--detach", WT, base], main) === null) { console.error(`❌ git worktree add ${WT} failed`); process.exit(1); }
  let nmStat = null; try { nmStat = fs.lstatSync(path.join(WT, "node_modules")); } catch {}
  if (!nmStat) fs.symlinkSync(path.join(main, "node_modules"), path.join(WT, "node_modules"), "junction");
  // LOCK it: `git worktree remove --force` on an unlocked worktree deletes through the junction and empties the main
  // node_modules (measured 2026-10-23); a locked worktree makes git refuse. Remove only via `preview-state.js unlink`.
  if (!isLocked(WT, main)) git(["worktree", "lock", "--reason", "node_modules is a junction into the main checkout: run `node scripts/preview-state.js unlink --slug=" + SLUG + "` before removing", WT], main);
  if (!isLocked(WT, main)) { console.error(`❌ could not lock ${WT} — not safe to use (git worktree lock failed)`); process.exit(1); }
  // the operator's CURRENT inputs and Step 0 files: copied when missing or different from what was checked out
  // (book.json may carry an engineProfile added after it was committed); never another book's files
  const copied = [];
  const same = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch { return false; } };
  const cp = (rel) => { const s = path.join(main, rel), d = path.join(WT, rel); if (!exists(s) || fs.statSync(s).isDirectory() || (exists(d) && same(s, d))) return; fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); copied.push(rel); };
  for (const x of ["m4a", "mp3", "wav"]) cp(`public/audio/${SLUG}.${x}`);
  cp(`public/captions/${SLUG}.vtt`);
  const bsrc = path.join(main, "books", SLUG);
  if (exists(bsrc)) for (const f of fs.readdirSync(bsrc)) cp(`books/${SLUG}/${f}`);
  fs.mkdirSync(path.dirname(PIN), { recursive: true });
  fs.writeFileSync(PIN, JSON.stringify({ productionBase: base, from: "origin/god-mode", at: new Date().toISOString(), worktree: path.basename(WT), ...(args.min ? { minimum: String(args.min) } : {}) }, null, 2) + "\n");
  console.log(`✓ ${WT} @ ${base.slice(0, 8)} (detached${registered ? ", resumed" : ""}) · node_modules → main (junction) · copied: ${copied.join(", ") || "nothing"}`);
  console.log(`  Continue THERE: cd "${WT}" && node scripts/preview-state.js status --slug=${SLUG}`);
  console.log(`  LOCKED: git refuses 'git worktree remove' (with the junction inside it would empty the main node_modules). Removal is the operator's cleanup, after: node scripts/preview-state.js unlink --slug=${SLUG}`);
  process.exit(0);
}

if (CMD === "unlink") {
  // The ONLY safe first step before anyone removes a production worktree (cleanup itself is the operator's): remove
  // the node_modules junction WITHOUT recursion (the main node_modules is untouched), then unlock. Removes nothing else.
  if (!SLUG) { console.error("Usage: node scripts/preview-state.js unlink --slug=<slug>"); process.exit(1); }
  const main = mainCheckoutOf(ROOT);
  const WT = path.resolve(main || ROOT, "..", `wt-book-${SLUG}`);
  const link = path.join(WT, "node_modules");
  let st = null; try { st = fs.lstatSync(link); } catch {}
  if (st && !st.isSymbolicLink()) { console.error(`❌ ${link} is a real folder, not a link — not touching it`); process.exit(1); }
  if (st) fs.rmdirSync(link);   // removes the junction itself; never recurses into its target
  if (main && isLocked(WT, main)) git(["worktree", "unlock", WT], main);
  console.log(`✓ ${WT}: node_modules link removed (main node_modules untouched), worktree unlocked. Removing the worktree is the operator's cleanup.`);
  process.exit(0);
}

if (CMD === "note") {
  if (!SLUG || !args.step || !["ok", "transient", "quality"].includes(args.result)) { console.error("Usage: node scripts/preview-state.js note --slug=<s> --step=<stage key> --result=ok|transient|quality --msg=\"...\""); process.exit(1); }
  const dir = path.join(ROOT, "audit", "preview-run", SLUG);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "attempts.jsonl"), JSON.stringify({ at: new Date().toISOString(), step: String(args.step), result: args.result, msg: String(args.msg || "").slice(0, 400) }) + "\n");
  console.log(`✓ noted ${args.step} ${args.result}`);
  process.exit(0);
}

console.error("Usage: node scripts/preview-state.js status|candidates|pin|worktree|note --slug=<slug> …");
process.exit(1);
