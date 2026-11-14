#!/usr/bin/env node
// local-load-guard: heavy still work is refused on this PC, allowed on a genuine runner or with the operator's words;
// one local still render at a time.   node scripts/test-local-load-guard.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const G = require("./lib/local-load-guard");
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("  ok", name); };
const PC = { env: {}, platform: "win32" };
const RUNNER = { env: { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "1", RUNNER_TEMP: "/tmp" }, platform: "linux" };

ok("a quick local look passes", () => assert(G.decideStills({ stills: 9, ...PC }).ok));
ok("the budget edge passes, one more is refused", () => {
  assert(G.decideStills({ stills: G.LOCAL_STILL_BUDGET, ...PC }).ok);
  const d = G.decideStills({ stills: G.LOCAL_STILL_BUDGET + 1, ...PC });
  assert(!d.ok && /stills-cloud\.js push/.test(d.reason));
});
ok("240 A/B stills on the PC are refused (cycle-11 incident)", () => assert(!G.decideStills({ stills: 240, ...PC }).ok));
ok("a genuine runner renders any amount", () => assert(G.decideStills({ stills: 5000, ...RUNNER }).ok));
ok("GITHUB_ACTIONS alone on Windows is not a runner", () => assert(!G.decideStills({ stills: 240, env: { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "1", RUNNER_TEMP: "x" }, platform: "win32" }).ok));
ok("operator words: ≥ 6 words allow, a token does not", () => {
  assert(!G.decideStills({ stills: 240, operatorLocal: "yes", ...PC }).ok);
  assert(G.decideStills({ stills: 240, operatorLocal: "bu seferlik yerelde render et lütfen olur", ...PC }).ok);
});
ok("one local still render at a time", () => {
  const lockFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "llg-")), "lock");
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.ppid, what: "other", at: "t" })); // a live process holds it
  const r = G.takeLocalLock({ what: "me", lockFile, ...PC });
  assert(r && r.refused && /one at a time/.test(r.refused));
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 999999999, what: "dead", at: "t" })); // a dead holder is free
  const rel = G.takeLocalLock({ what: "me", lockFile, ...PC });
  assert.strictEqual(typeof rel, "function");
  assert.strictEqual(JSON.parse(fs.readFileSync(lockFile, "utf8")).pid, process.pid);
  rel(); assert(!fs.existsSync(lockFile));
});
ok("a runner takes no lock", () => assert.strictEqual(typeof G.takeLocalLock({ what: "r", lockFile: path.join(os.tmpdir(), "never"), ...RUNNER }), "function"));
console.log(`local-load-guard: ${n} passed`);
