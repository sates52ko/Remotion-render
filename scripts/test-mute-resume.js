#!/usr/bin/env node
// mute-test prep resume + single-run lock (2026-10-24, do-over: a 30-still verdict prep was checked, cancelled and
// restarted; each restart re-bundled, and a SEALED prep threw its finished stills away every time).
// Checks: a second prep of a label is refused while the first one's process lives; a dead lock is taken over;
// stills rendered from the same config are kept (sealed and fresh labels), stills from another config are removed.
// No rendering (MUTE_TEST_NO_RENDER stops right before it). Run: node scripts/test-mute-resume.js
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const ROOT = path.join(__dirname, "..");
const SLUG = `zz-mute-resume-${process.pid}`;
const BOOK = path.join(ROOT, "books", SLUG), MUTE = path.join(ROOT, "audit", "mute", SLUG);
const env = { ...process.env, PRODUCTION_GUARD: "off", MUTE_TEST_NO_RENDER: "1" };
const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, "mute-test.js"), ...a, `--slug=${SLUG}`], { cwd: ROOT, encoding: "utf8", env });
const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof o === "string" ? o : JSON.stringify(o, null, 2)); };
const scenes = Array.from({ length: 40 }, (_, k) => ({ id: `scene-${String(k + 1).padStart(2, "0")}`, fromFrame: k * 90, durationFrames: 90 }));
const cfgFile = path.join(BOOK, "config.antidote.json");
const sleeper = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { stdio: "ignore" });
try {
  W(cfgFile, { meta: { fps: 30 }, scenes, captions: [] });
  W(path.join(BOOK, "book.json"), { slug: SLUG, engine: "antidote" });

  // lock: a live holder refuses a second prep of the same label
  W(path.join(MUTE, "run1", ".prep.lock"), { pid: sleeper.pid, at: "x" });
  let r = run("prep", "--label=run1", "--n=10");
  t("a second prep of the same label is refused while the first runs", r.status === 3 && /already running \(pid/.test(r.stderr), r.stderr + r.stdout);
  t("…and it renders nothing", !fs.existsSync(path.join(MUTE, "run1", "stills")));
  // a dead holder's lock is taken over
  W(path.join(MUTE, "run1", ".prep.lock"), { pid: 999999, at: "x" });
  r = run("prep", "--label=run1", "--n=10");
  t("a stale lock (dead pid) is taken over", r.status === 0 && /stopping before the render/.test(r.stdout), r.stderr + r.stdout);
  t("the lock is released when the prep ends", !fs.existsSync(path.join(MUTE, "run1", ".prep.lock")));

  // resume: stills of the same config are kept, another config's are removed
  const stills = path.join(MUTE, "run1", "stills", SLUG);
  W(path.join(stills, "scene-01-f63.png"), "x".repeat(20000));
  r = run("prep", "--label=run1", "--n=10");
  t("same config: rendered stills are kept and the prep says it resumes", fs.existsSync(path.join(stills, "scene-01-f63.png")) && /resuming: 1\/10/.test(r.stdout), r.stdout);
  W(cfgFile, { meta: { fps: 30 }, scenes, captions: [{ startFrame: 0, endFrame: 10, text: "changed" }] });
  r = run("prep", "--label=run1", "--n=10");
  t("changed config: stale stills are removed", !fs.existsSync(path.join(stills, "scene-01-f63.png")) && /from another config/.test(r.stdout), r.stdout);

  // sealed verdict prep: no longer throws its own finished stills away on a restart
  r = run("prep", "--label=final", "--seal", "--n=10");
  t("seal drawn", r.status === 0 && fs.existsSync(path.join(MUTE, "final", "seal.json")), r.stderr);
  r = run("prep", "--label=final");
  const sealed = JSON.parse(fs.readFileSync(path.join(MUTE, "final", "sample.json"), "utf8"));
  const f0 = `${sealed[0].id}-f${sealed[0].frame}.png`;
  W(path.join(MUTE, "final", "stills", SLUG, f0), "x".repeat(20000));
  r = run("prep", "--label=final");
  t("sealed prep restarted on the same config keeps its rendered stills", fs.existsSync(path.join(MUTE, "final", "stills", SLUG, f0)) && /resuming: 1\//.test(r.stdout), r.stdout + r.stderr);
} finally {
  sleeper.kill();
  for (const d of [BOOK, MUTE]) fs.rmSync(d, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall mute-resume tests passed");
process.exit(failed ? 1 : 0);
