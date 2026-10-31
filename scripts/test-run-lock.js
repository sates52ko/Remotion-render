#!/usr/bin/env node
// ONE RENDER PER BOOK (2026-10-26, scripts/lib/run-lock.js + render.js): a second render of the same book is not
// started while the first runs (pid lock), and a split render that may still be running on the pool is not dispatched
// again (renderInFlight). Run: node scripts/test-run-lock.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { renderInFlight } = require("./lib/run-lock");

let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${String(extra).slice(0, 400)}` : ""}`); if (!ok) fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "runlock-"));
const LIB = JSON.stringify(path.join(__dirname, "lib", "run-lock.js"));
const holder = (file, ms) => `require(${LIB}).takeRunLock(${JSON.stringify(file)}, "render demo"); console.log("HOLD"); setTimeout(() => console.log("DONE"), ${ms});`;
const once = (file) => spawnSync(process.execPath, ["-e", `require(${LIB}).takeRunLock(${JSON.stringify(file)}, "render demo"); console.log("RAN");`], { encoding: "utf8" });

(async () => {
  try {
    const lock = path.join(tmp, ".render-lock.demo.json");
    // G. the same render already running → the second does not start
    const a = spawn(process.execPath, ["-e", holder(lock, 4000)], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((res) => a.stdout.on("data", (d) => /HOLD/.test(String(d)) && res()));
    let r = once(lock);
    t("G. a second render of the same book while the first is alive: refused (exit 3, nothing ran)", r.status === 3 && !/RAN/.test(r.stdout) && /already running/.test(r.stderr), `${r.status} ${r.stderr}`);
    t("G. ...and the running one is untouched (its lock still names it)", JSON.parse(fs.readFileSync(lock, "utf8")).pid === a.pid);
    r = once(path.join(tmp, ".render-lock.other-book.json"));
    t("G. another book's render is not blocked by it (one lock per book)", r.status === 0 && /RAN/.test(r.stdout), r.stderr);
    await new Promise((res) => a.on("exit", res));
    t("G. the lock is released when the render ends", !fs.existsSync(lock));
    fs.writeFileSync(lock, JSON.stringify({ pid: 2147483646, at: "2026-01-01T00:00:00Z", what: "render demo", host: os.hostname() }));
    r = once(lock);
    t("G. a dead holder's lock is taken over (a crashed run does not block forever)", r.status === 0 && /RAN/.test(r.stdout) && /stale lock/.test(r.stderr), `${r.status} ${r.stderr}`);

    // in flight on the pool
    const st = path.join(tmp, ".render-github-split.demo.json");
    const now = Date.parse("2026-10-26T12:00:00Z");
    const W = (o) => fs.writeFileSync(st, JSON.stringify({ slug: "demo", bundleSha: "abcdef12", segments: [{}, {}], ...o }));
    W({ dispatchedAt: "2026-10-26T11:00:00Z" });
    t("G. dispatched 60 min ago, the dispatching process died: in flight", !!renderInFlight(st, 3, now) && /killed|crashed/.test(renderInFlight(st, 3, now).why));
    W({ dispatchedAt: "2026-10-26T11:00:00Z", endedAt: "2026-10-26T11:01:00Z", waited: false });
    t("G. dispatched with --no-wait: in flight", /no-wait/.test((renderInFlight(st, 3, now) || {}).why || ""));
    W({ dispatchedAt: "2026-10-26T11:00:00Z", endedAt: "2026-10-26T11:50:00Z", waited: true, exitCode: 1 });
    t("G. the --wait loop saw it through (even a loud failure): not in flight — a retry may dispatch", renderInFlight(st, 3, now) === null);
    W({ dispatchedAt: "2026-10-26T08:00:00Z" });
    t("G. older than the window: not in flight", renderInFlight(st, 3, now) === null);
    W({});
    t("G. an older state file without a timestamp never blocks", renderInFlight(st, 3, now) === null);

    // the wiring in render.js
    const src = fs.readFileSync(path.join(__dirname, "render.js"), "utf8");
    const iLock = src.indexOf("takeRunLock(path.join(ROOT, `.render-lock.${slug}.json`)"), iInFlight = src.indexOf("renderInFlight(path.join(ROOT, `.render-github-split.${slug}.json`))"), iRun = src.lastIndexOf("runGithubActionsRender();");
    t("render.js takes the per-book lock and checks in-flight BEFORE any GitHub dispatch", iLock > 0 && iInFlight > iLock && iRun > iInFlight);
    t("render.js records dispatchedAt and whether the process waited", /dispatchedAt: new Date\(\)\.toISOString\(\)/.test(src) && /s\.waited = waits/.test(src));
    t("only the operator re-dispatches inside the window (--new-render=\"<reason>\")", /--new-render="<reason>"/.test(src) && /process\.exit\(3\)/.test(src));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  console.log(fail ? `\n${fail} FAILED` : "\nall run-lock checks passed");
  process.exit(fail ? 1 : 0);
})();
