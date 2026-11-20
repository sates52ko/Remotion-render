#!/usr/bin/env node
// RENDER A PINNED BOOK WITH CURRENT TOOLS + THE OPERATOR'S RENDER AUTHORIZATION (2026-10-30).
// Real case: the-magician-s-nephew, pinned 086a0941, preview READY (run5 PASS), YouTube READY, nothing dispatched:
//  (1) its own render.js looked for render-accounts.json inside the worktree (the file lives in the main checkout; a
//      symlink needs Windows admin rights; a copy is forbidden);
//  (2) render-decision said NO_DEBT and the only recording flag, --accept-quality-debt, would record a debt nobody had.
// What must hold:
//  - render.js --book-root=<pinned worktree> (from the current launcher): the book root must be a worktree of the SAME
//    repo whose HEAD is its production-base pin with no tracked code change — else refused;
//  - credentials are found from the book worktree in place (shared git dir), no copy;
//  - the production preflight STOPS without a render authorization for THIS render input; --authorize-render records one
//    (kind render-authorization) only when quality and preview are settled; a quality-debt acceptance is not one; a
//    pre-2026-10-30 combined decision still counts; an authorization never covers quality debt or a preview;
//  - the same render input fully dispatched is never dispatched again without --new-render.
// Run: node scripts/test-render-book-root.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const rp = require("./lib/render-preflight");
const { checkBookRoot } = require("./lib/book-root");
const RA = require("./lib/render-accounts");
const { inputDispatched } = require("./lib/run-lock");
const { decisionStatus, sevenFacts } = require("./render-decision");
const { writePreviewRecord } = require("./lib/preview-record");

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "book-root-")));
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const W = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof x === "string" ? x : JSON.stringify(x, null, 2)); };
const SLUG = "zz-pinned";
try {
  // ── a main checkout + a pinned book worktree of the same repo ──
  const MAIN = path.join(tmp, "main"), WT = path.join(tmp, "wt-book-zz"), OTHER = path.join(tmp, "other");
  fs.mkdirSync(MAIN);
  g(MAIN, "init", "-q"); g(MAIN, "config", "user.email", "t@t"); g(MAIN, "config", "user.name", "t"); g(MAIN, "config", "core.autocrlf", "false");
  W(path.join(MAIN, "src", "engine.ts"), "export const v = 1;\n");
  W(path.join(MAIN, "scripts", "x.js"), "// tools v1\n");
  W(path.join(MAIN, "src", "books.generated.ts"), "export const BOOKS = [];\n");
  W(path.join(MAIN, ".gitignore"), "books/\nrender-accounts.json\n.render-*\n");
  g(MAIN, "add", "-A"); g(MAIN, "commit", "-q", "-m", "engine v1");
  const PIN = g(MAIN, "rev-parse", "HEAD");
  W(path.join(MAIN, "src", "engine.ts"), "export const v = 2;\n"); g(MAIN, "commit", "-q", "-am", "engine v2 (the launcher moved on)");
  g(MAIN, "worktree", "add", "-q", "--detach", WT, PIN);
  W(path.join(WT, "books", SLUG, "production-base.json"), { productionBase: PIN, from: "origin/god-mode", worktree: "wt-book-zz" });
  const cfg = { meta: { fps: 30, audio: `audio/${SLUG}.mp3`, totalFrames: 9000 }, beats: [{ id: "b1" }] };
  W(path.join(WT, "books", SLUG, "book.json"), { slug: SLUG, engine: "vox" });
  W(path.join(WT, "books", SLUG, "config.vox.json"), cfg);
  fs.mkdirSync(OTHER); g(OTHER, "init", "-q");

  // (B) the book root check
  t("book root: a pinned worktree of the same repo, HEAD = pin, clean → OK", checkBookRoot({ launcher: MAIN, bookRoot: WT, slug: SLUG }).ok, JSON.stringify(checkBookRoot({ launcher: MAIN, bookRoot: WT, slug: SLUG })));
  t("book root: another repository → refused", /not a worktree of this repository/.test(checkBookRoot({ launcher: MAIN, bookRoot: OTHER, slug: SLUG }).error || ""));
  t("book root: no production-base.json → refused", /production-base\.json missing/.test(checkBookRoot({ launcher: MAIN, bookRoot: WT, slug: "zz-none" }).error || ""));
  W(path.join(WT, "src", "books.generated.ts"), "export const BOOKS = [1, 2];\n");
  t("book root: a regenerated src/books.generated.ts is not an engine change (the runner rebuilds it; production-guard ignores it; real case MN)", checkBookRoot({ launcher: MAIN, bookRoot: WT, slug: SLUG }).ok, JSON.stringify(checkBookRoot({ launcher: MAIN, bookRoot: WT, slug: SLUG })));
  W(path.join(WT, "src", "engine.ts"), "export const v = 99;\n");
  t("book root: a tracked engine change → refused (the bundle would not be the pinned engine)", /tracked code change/.test(checkBookRoot({ launcher: MAIN, bookRoot: WT, slug: SLUG }).error || ""));
  g(WT, "checkout", "-q", "--", "src/engine.ts");
  W(path.join(WT, "books", SLUG, "production-base.json"), { productionBase: g(MAIN, "rev-parse", "HEAD") });
  t("book root: HEAD ≠ pin → refused", /≠ pinned/.test(checkBookRoot({ launcher: MAIN, bookRoot: WT, slug: SLUG }).error || ""));
  W(path.join(WT, "books", SLUG, "production-base.json"), { productionBase: PIN });

  // (C) credentials found from the book worktree, in place (fake tokens, no network)
  W(path.join(MAIN, "render-accounts.json"), { workers: [{ id: 1, username: "w1", repo: "r", token: "ghp_" + "x".repeat(36), active: true }] });
  const acc = RA.loadAccounts(WT);
  t("credentials: the book worktree finds the main checkout's render-accounts.json in place (no copy in the worktree)", !!acc && acc.workers.length === 1 && !fs.existsSync(path.join(WT, "render-accounts.json")) && /main|common|in place/i.test(JSON.stringify(acc.__source || RA.inspect(acc, WT))), JSON.stringify(RA.inspect(acc, WT)));

  // (A) the authorization contract on the book root (Vox: no firewall)
  const inputHash = rp.inputHashOf(path.join(WT, "books", SLUG, "config.vox.json"));
  let rec = writePreviewRecord({ root: WT, slug: SLUG, engine: "vox", ready: true, head: PIN, mute: { label: "run5", n: 30, wrong: 0, dead: 2, adds: 23, pass: true } });
  t("preview record: written atomically and read back READY for this render input", rec.ok && rec.state === "READY" && rec.record.renderInputHash === inputHash && !fs.readdirSync(path.join(WT, "books", SLUG)).some((f) => /\.tmp$/.test(f)), JSON.stringify(rec));
  const pre = (extra = {}) => { const o = []; const log = console.log; console.log = (...a) => o.push(a.join(" ")); try { return { ...rp.preflight({ root: WT, slug: SLUG, engine: "vox", method: "local", mode: rp.MODE.PRODUCTION, configFile: `books/${SLUG}/config.vox.json`, ...extra }), out: o.join("\n") }; } finally { console.log = log; } };
  let st = decisionStatus({ root: WT, slug: SLUG });
  t("render-decision: preview READY, no debt, no authorization → NO_DEBT (exit 2) and names --authorize-render", st.verdict === "NO_DEBT" && st.exit === 2 && /--authorize-render/.test(st.detail), st.detail);
  let r = pre();
  t("preflight: STOP without a render authorization for this render input", !r.ok && /render authorization: none recorded for render input/.test(r.out), r.out.slice(-600));
  r = pre({ acceptReason: "accepting debt is not a go" });
  t("…--accept-quality-debt records nothing here (no debt) and does not authorize", !r.ok && rp.loadDecisions(WT, SLUG).length === 0, JSON.stringify(rp.loadDecisions(WT, SLUG)));
  r = pre({ authorizeReason: "Operator: render the-magician-s-nephew now" });
  const decs = rp.loadDecisions(WT, SLUG);
  t("--authorize-render: recorded as kind render-authorization, bound to the render input and the book commit; GO", r.ok && decs.length === 1 && decs[0].kind === "render-authorization" && decs[0].renderInputHash === inputHash && decs[0].commit && decs[0].keys.length === 0 && /RECORDED NOW/.test(r.out), r.out.slice(-500));
  st = decisionStatus({ root: WT, slug: SLUG });
  const facts = sevenFacts({ root: WT, slug: SLUG, st });
  t("render-decision: AUTHORIZED (exit 0); C debt = none, D authorization = the record, G assembly + H publishing apart", st.verdict === "AUTHORIZED" && st.exit === 0 && /none for this render input/.test(facts.C_acceptance) && /render authorization of/.test(facts.D_authorization) && /not assembled/.test(facts.G_assembly) && /not a render permission|always the operator's/.test(facts.H_youtube), JSON.stringify([st.verdict, facts]));
  r = pre();
  t("preflight: the next run is GO without asking again (same render input)", r.ok && !/RECORDED NOW/.test(r.out));
  // the config changes: the authorization does not carry over
  W(path.join(WT, "books", SLUG, "config.vox.json"), { ...cfg, beats: [{ id: "b1" }, { id: "b2" }] });
  rec = writePreviewRecord({ root: WT, slug: SLUG, engine: "vox", ready: true, head: PIN });
  r = pre();
  t("a changed config (new render input) is not authorized by the old record", !r.ok && /render authorization: none recorded/.test(r.out));
  // preview NOT READY: an authorization is not recorded, and never covers the preview
  writePreviewRecord({ root: WT, slug: SLUG, engine: "vox", ready: false, head: PIN, mute: { n: 30, wrong: 4, dead: 1, adds: 10, pass: false } });
  r = pre({ authorizeReason: "go anyway" });
  t("preview NOT READY: --authorize-render records nothing (quality / preview first), STOP", !r.ok && rp.loadDecisions(WT, SLUG).length === 1 && /not recorded: quality \/ preview are not settled/.test(r.out), r.out.slice(-500));
  // a legacy combined decision (no kind) still authorizes; a new quality-debt decision does not
  const inputNow = rp.inputHashOf(path.join(WT, "books", SLUG, "config.vox.json"));
  const legacy = { at: "2026-10-29T08:55:11Z", commit: PIN, configHash: rp.configHash(path.join(WT, "books", SLUG, "config.vox.json")), renderInputHash: inputNow, reason: "Kalite borcunu kabul ediyorum, render için kayıt al.", keys: [], preview: { state: "NOT_READY", at: JSON.parse(fs.readFileSync(path.join(WT, "books", SLUG, "preview-ready.json"), "utf8")).at, mute: null } };
  t("authorizationFor: a pre-2026-10-30 combined decision (no kind) counts", !!rp.authorizationFor([legacy], inputNow));
  t("authorizationFor: a new quality-debt decision does not", !rp.authorizationFor([{ ...legacy, kind: "quality-debt" }], inputNow));
  const ev = rp.evaluate({ mode: rp.MODE.PRODUCTION, firewall: null, hash: legacy.configHash, inputHash: inputNow, decisions: [{ ...legacy, kind: "render-authorization", preview: { state: "NOT_READY", at: legacy.preview.at } }], preview: rp.readPreview({ root: WT, slug: SLUG, inputHash: inputNow, configFile: path.join(WT, "books", SLUG, "config.vox.json") }) });
  t("evaluate: an authorization never covers a NOT READY preview (it is not a debt acceptance)", !ev.ok && !ev.previewCovered);

  // (D) the same render input is never dispatched twice
  const sf = path.join(WT, `.render-github-split.${SLUG}.json`);
  W(sf, { slug: SLUG, renderInputHash: inputNow, dispatchedAt: "2026-10-30T09:00:00Z", bundleSha: "abc", segments: [{ seg: 1, dispatchedAt: "x" }, { seg: 2, dispatchedSha: "abc" }] });
  t("inputDispatched: every segment dispatched for this render input → already done", !!inputDispatched(sf, inputNow));
  t("inputDispatched: another render input → not this one", !inputDispatched(sf, "ffffffffffffffff"));
  W(sf, { slug: SLUG, renderInputHash: inputNow, segments: [{ seg: 1, dispatchedAt: "x" }, { seg: 2 }] });
  t("inputDispatched: a run that stopped half way is not done (it resumes)", !inputDispatched(sf, inputNow));

  // (E) render.js refuses a book root it cannot honour — before anything is checked or dispatched
  const run = (a) => spawnSync(process.execPath, [path.join(REPO, "scripts", "render.js"), `--slug=${SLUG}`, ...a], { cwd: REPO, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "off" } });
  let x = run([`--book-root=${WT}`, "--method=local"]);
  t("render.js --book-root with --method=local → refused (exit 2): local would render this checkout's engine", x.status === 2 && /only with --method=github/.test(x.stderr), x.stderr);
  x = run([`--book-root=${OTHER}`, "--method=github"]);
  t("render.js --book-root=<another repo> → refused (exit 2) before any check or dispatch", x.status === 2 && /--book-root:/.test(x.stderr), x.stderr);
  const rjs = fs.readFileSync(path.join(REPO, "scripts", "render.js"), "utf8");
  t("render.js: the bundle, the locks, the split state and the preflight read the BOOK root", /buildBundle\(\{ slug, root: BOOK_ROOT \}\)/.test(rjs) && /root: BOOK_ROOT, slug, engine, method/.test(rjs) && /path\.join\(BOOK_ROOT, `\.render-github-split\.\$\{slug\}\.json`\)/.test(rjs) && /takeRunLock\(path\.join\(BOOK_ROOT/.test(rjs));
  t("render.js: --authorize-render is its own flag, passed to the preflight", /authorizeReason: typeof args\["authorize-render"\]/.test(rjs));
} finally {
  try { execFileSync("git", ["worktree", "prune"], { cwd: path.join(tmp, "main"), stdio: "ignore" }); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall book-root / authorization checks passed");
process.exit(failed ? 1 : 0);
