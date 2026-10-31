#!/usr/bin/env node
// RENDER CREDENTIALS (2026-10-29). Real case: a production render passed the preflight (GO) and failed its first GitHub
// dispatch — render-accounts.json existed only in the main checkout, not in the book worktree; the agent copied the
// token file into the worktree to get on. Now the pool is read IN PLACE (env -> this checkout -> main checkout via the
// git common dir), never copied, never printed; nothing rewrites the token file (round-robin + access cache live in
// <git common dir>/render-pool-state.json); the preflight checks found / safe / enough workers / fields / access BEFORE
// the first push and says STOP when there is nothing usable. A fixture: a main repo + a linked book worktree, fake tokens.
// Run: node scripts/test-render-credentials.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const RA = require("./lib/render-accounts");
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "render-cred-")));
const MAIN = path.join(tmp, "main"), WT = path.join(tmp, "wt-book-x");
const g = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
const TOK = (k) => `ghp_${"A".repeat(30)}${k}`; // fake, token-shaped
const pool = (n, extra = {}) => ({ strategy: "round-robin", workers: Array.from({ length: n }, (_, k) => ({ id: `w${k + 1}`, username: `user${k + 1}`, repo: "Remotion-render", token: TOK(k), active: true, ...(extra[k] || {}) })) });
const saveEnv = process.env.RENDER_ACCOUNTS_FILE;
delete process.env.RENDER_ACCOUNTS_FILE;
try {
  fs.mkdirSync(MAIN, { recursive: true });
  g(MAIN, "init", "-q"); g(MAIN, "config", "user.email", "t@t"); g(MAIN, "config", "user.name", "t");
  fs.writeFileSync(path.join(MAIN, ".gitignore"), "render-accounts.json\n");
  fs.writeFileSync(path.join(MAIN, "README.md"), "x\n"); g(MAIN, "add", "-A"); g(MAIN, "commit", "-q", "-m", "init");
  g(MAIN, "worktree", "add", "-q", "--detach", WT);

  // 1. no credentials anywhere
  let e = null; try { RA.loadAccounts(WT); } catch (x) { e = x; }
  t("nowhere -> CREDENTIALS_MISSING, the places searched named (no copy suggested)", e && e.code === "CREDENTIALS_MISSING" && /this checkout, main checkout/.test(e.message) && /never recreate or copy it/.test(e.message), e && e.message);

  // 2. main checkout has it, the book worktree does not -> read in place, no copy made
  const MF = path.join(MAIN, "render-accounts.json");
  fs.writeFileSync(MF, JSON.stringify(pool(3)));
  const before = fs.readFileSync(MF, "utf8");
  let acc = RA.loadAccounts(WT);
  t("main has it, the worktree not -> read in place from the main checkout", acc.__source.source.startsWith("main checkout") && acc.workers.length === 3);
  t("…and no copy appears in the worktree", !fs.existsSync(path.join(WT, "render-accounts.json")));

  // 3. access: one worker refused (401 = wrong / expired), one unverifiable (network) — injected, no real call
  const calls = [];
  const call = (w) => { calls.push(w.username); return w.username === "user2" ? "UNAUTHORIZED" : w.username === "user3" ? "UNVERIFIED" : "OK"; };
  let ins = RA.verifyAccess(acc, WT, { call });
  t("wrong / expired token -> that worker is refused and out of the pool", ins.refused.length === 1 && /w2: UNAUTHORIZED/.test(ins.refused[0]) && RA.usableWorkers(acc, WT).every((w) => w.username !== "user2"), JSON.stringify(ins));
  t("unverifiable (network) -> shown as unverified, never as OK", ins.verified === 1 && /1 unverified/.test(RA.summary(ins)), RA.summary(ins));
  const n0 = calls.length;
  RA.verifyAccess(acc, WT, { call });
  t("no repeated network calls: a known OK / refused is cached; only the unverified one is asked again", calls.length - n0 === 1 && calls[calls.length - 1] === "user3", JSON.stringify(calls));

  // 4. secrets never in output, state or the token file
  const s1 = RA.summary(ins);
  const stateTxt = fs.readFileSync(RA.stateFile(WT), "utf8");
  t("redaction: the summary and the pool state carry no token, nor any token-like string", ![0, 1, 2].some((k) => s1.includes(TOK(k)) || stateTxt.includes(TOK(k))) && !/ghp_/.test(s1 + stateTxt));
  t("the pool state lives inside .git (never committable, never bundled)", RA.stateFile(WT).split(path.sep).join("/").includes("/.git/"), RA.stateFile(WT));
  RA.writeState(WT, { lastUsedWorkerIndex: 2 });
  t("round-robin pointer: written to the state file, the token file untouched", fs.readFileSync(MF, "utf8") === before && RA.loadAccounts(WT).lastUsedWorkerIndex === 2);
  const SRC = ["render.js", "render-queue.js", "lib/render-pool.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
  t("no tool rewrites render-accounts.json any more", !/writeFileSync\((accountsFile|ACCOUNTS_FILE|ACCOUNTS)\b/.test(SRC));

  // 5. missing fields / too few workers
  fs.writeFileSync(MF, JSON.stringify(pool(2, { 0: { token: "" }, 1: { repo: "" } })));
  acc = RA.loadAccounts(WT);
  ins = RA.inspect(acc, WT);
  t("workers with a missing token / repo -> named as malformed, not usable", ins.usable === 0 && ins.malformed.length === 2 && /missing token/.test(ins.malformed.join()) && /missing repo/.test(ins.malformed.join()), JSON.stringify(ins));

  // 6. the preflight: credentials checked BEFORE the first push; nothing usable -> STOP (not GO)
  const PF = require("./lib/render-preflight");
  const BK = path.join(WT, "books", "zz"); fs.mkdirSync(BK, { recursive: true });
  fs.writeFileSync(path.join(BK, "book.json"), JSON.stringify({ slug: "zz", engine: "vox" }));
  const log = []; const orig = console.log; console.log = (...a) => log.push(a.join(" "));
  let pf;
  try { pf = PF.preflight({ root: WT, slug: "zz", engine: "vox", method: "github", mode: PF.MODE.PREVIEW_ONLY, credentialCall: () => "OK" }); } finally { console.log = orig; }
  const out = log.join("\n");
  t("preflight: no usable worker -> STOP with a credentials blocker (never GO)", pf && !pf.ok && /credentials: no usable render worker/.test(out), out.slice(-800));
  t("preflight: prints where the pool came from and the counts, never a token", /credentials: render-accounts\.json: main checkout/.test(out) && !/ghp_/.test(out));
  fs.writeFileSync(MF, JSON.stringify(pool(2)));
  log.length = 0; console.log = (...a) => log.push(a.join(" "));
  try { pf = PF.preflight({ root: WT, slug: "zz", engine: "vox", method: "github", mode: PF.MODE.PREVIEW_ONLY, credentialCall: () => "OK" }); } finally { console.log = orig; }
  t("preflight: a usable pool -> no credentials blocker; access verified 2", !/credentials: no usable/.test(log.join("\n")) && /2\/2 active worker\(s\) usable · access 2 verified/.test(log.join("\n")), log.join("\n").slice(-600));
  fs.rmSync(MF);
  log.length = 0; console.log = (...a) => log.push(a.join(" "));
  try { pf = PF.preflight({ root: WT, slug: "zz", engine: "vox", method: "github", mode: PF.MODE.PREVIEW_ONLY }); } finally { console.log = orig; }
  t("preflight: credentials missing everywhere -> STOP (CREDENTIALS_MISSING) before any push", !pf.ok && /credentials: STOP \(CREDENTIALS_MISSING\)/.test(log.join("\n")), log.join("\n").slice(-500));

  // 7. an unsafe source (a token file NOT gitignored) is refused
  fs.writeFileSync(path.join(MAIN, ".gitignore"), "\n");
  fs.writeFileSync(MF, JSON.stringify(pool(1)));
  e = null; try { RA.loadAccounts(WT); } catch (x) { e = x; }
  t("a token file that is not gitignored -> CREDENTIALS_UNSAFE (one git add -A would publish it)", e && e.code === "CREDENTIALS_UNSAFE", e && e.message);
  fs.writeFileSync(path.join(MAIN, ".gitignore"), "render-accounts.json\n");

  // 8. an earlier workaround copy in the worktree is named
  fs.writeFileSync(path.join(WT, "render-accounts.json"), JSON.stringify(pool(1)));
  fs.writeFileSync(path.join(WT, ".gitignore"), "render-accounts.json\n");
  acc = RA.loadAccounts(WT);
  t("a COPY in the book worktree is named (the main checkout's is the source; removal is the operator's call)", acc.__source.copy === true && /a COPY of the main checkout's token file/.test(RA.summary(RA.inspect(acc, WT))));

  // 9. the bundle refuses a credentials file, wherever it sits in the bundled tree
  const { auditBundle } = require("./lib/render-bundle");
  const r = auditBundle({ blobs: [{ path: "books/zz/render-accounts.json", bytes: 10 }, { path: "books/zz/config.vox.json", bytes: 10 }], narration: null, allowed: [], probeAudio: () => ({ ok: true }) });
  t("bundle: a render-accounts.json inside a bundled dir is a problem (never pushed to a worker)", r.problems.some((p) => /render-accounts\.json looks like a credentials file/.test(p)), JSON.stringify(r.problems));
} finally {
  if (saveEnv !== undefined) process.env.RENDER_ACCOUNTS_FILE = saveEnv;
  try { g(MAIN, "worktree", "remove", "--force", WT); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall render-credentials checks passed (resume without a double dispatch: test-render-dispatch.js run 3)");
process.exit(failed ? 1 : 0);
