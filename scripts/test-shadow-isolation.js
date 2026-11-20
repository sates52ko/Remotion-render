#!/usr/bin/env node
// SHADOW + TEMP ISOLATION (cycle 9 P0b, 2026-11-04). The mute reliability study (shadow) never writes the official run
// (PROMPTS.md, totals, mute-test.json) and is never read by a gate; one reliability job per label; parallel helpers never
// share a fixed temp file (cycle 8: judges writing through shared /tmp helpers overwrote each other). A fixture book in
// this tree (removed after). Run: node scripts/test-shadow-isolation.js
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info !== undefined ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 1)); };
const ROOT = path.join(__dirname, "..");
const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// ── no gate reads the shadow study ───────────────────────────────────────────
for (const f of ["scripts/preview-ready.js", "scripts/preview-state.js", "scripts/render-decision.js", "scripts/lib/mute-verdict.js", "scripts/lib/render-preflight.js", "scripts/lib/preview-record.js"]) {
  t(`gate ${f} never reads the reliability (shadow) study`, !/reliability/i.test(src(f)));
}

// ── the shadow study on a fixture label: the official run stays byte-identical ──
{
  const SLUG = `zz-shadow-${process.pid}`;
  const BOOK = path.join(ROOT, "books", SLUG), MD = path.join(ROOT, "audit", "mute", SLUG), RUN = path.join(MD, "run1");
  const env = { ...process.env, PRODUCTION_GUARD: "off" };
  const rel = (...a) => spawnSync(process.execPath, [path.join(__dirname, "mute-reliability.js"), ...a, `--slug=${SLUG}`, "--label=run1"], { cwd: ROOT, encoding: "utf8", env });
  const sha = (p) => (fs.existsSync(p) ? require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null);
  try {
    W(path.join(BOOK, "config.antidote.json"), { meta: { fps: 30 }, scenes: [{ id: "s1", fromFrame: 0, durationFrames: 300 }], captions: [{ startFrame: 0, endFrame: 300, text: "narration" }] });
    W(path.join(RUN, "key.json"), { "img-01.png": "x-s1-f10.png", "img-02.png": "x-s1-f200.png" });
    W(path.join(RUN, "mute", "img-01.png"), "png"); W(path.join(RUN, "mute", "img-02.png"), "png");
    W(path.join(RUN, "PROMPTS.md"), "# official prompts\n");
    W(path.join(RUN, "totals.json"), { label: "run1", pass: true });
    const before = { prompts: sha(path.join(RUN, "PROMPTS.md")), totals: sha(path.join(RUN, "totals.json")) };
    const x = rel("prep", "--k=2");
    t("reliability prep runs on the fixture", x.status === 0, x.stdout + x.stderr);
    t("…the official run's PROMPTS.md and totals.json are byte-identical (before: §R1 was appended to PROMPTS.md)", sha(path.join(RUN, "PROMPTS.md")) === before.prompts && sha(path.join(RUN, "totals.json")) === before.totals);
    t("…its prompts are in reliability/PROMPTS.md (the shadow area)", fs.existsSync(path.join(RUN, "reliability", "PROMPTS.md")) && /reliability pass 1\/2/.test(fs.readFileSync(path.join(RUN, "reliability", "PROMPTS.md"), "utf8")));
    t("…no mute-test.json (the official record) was created", !fs.existsSync(path.join(BOOK, "mute-test.json")));
    // one job per label: a live holder of the lock refuses a second one
    W(path.join(RUN, "reliability", ".lock.json"), { pid: process.pid, at: new Date().toISOString(), what: "test", host: require("os").hostname() });
    const y = rel("prep", "--k=2");
    t("a second reliability job on the same label while one runs → refused (exit 3)", y.status === 3, y.stdout + y.stderr);
    fs.rmSync(path.join(RUN, "reliability", ".lock.json"), { force: true });
  } finally {
    fs.rmSync(BOOK, { recursive: true, force: true }); fs.rmSync(MD, { recursive: true, force: true });
  }
  const r = src("scripts/mute-reliability.js");
  t("the reliability result is labelled shadow / not a verdict, and its book copy is SHADOW-reliability.json", /shadow: true, notAVerdict/.test(r) && /SHADOW-reliability\.json/.test(r) && !/path\.join\(dest, "reliability\.json"\)/.test(r));
}

// ── no fixed shared temp files ───────────────────────────────────────────────
{
  const poc = src("scripts/mute-cloud-poc.js");
  t("mute-cloud-poc: a fresh mkdtemp directory per invocation (no fixed os.tmpdir()/mute-cloud-poc)", /mkdtempSync\(path\.join\(os\.tmpdir\(\), `mute-cloud-poc-/.test(poc) && !/os\.tmpdir\(\), "mute-cloud-poc"\)/.test(poc));
  const bud = src("scripts/ai-budget.js");
  t("ai-budget: the shared cache is merged and replaced atomically (unique temp + rename)", /renameSync\(tmp, cacheFile\)/.test(bud) && /\$\{process\.pid\}/.test(bud));
  const plan = src("scripts/plan-antidote.js");
  t("plan-antidote: the cast draft is per book, never /tmp/<slug>.cast.json", !/\/tmp\//.test(plan) && /books\/\$\{SLUG\}\/\.cast\.draft\.json/.test(plan));
  const offenders = fs.readdirSync(__dirname).filter((f) => /\.(js|mjs)$/.test(f) && !/^test-/.test(f))
    .filter((f) => /["'`]\/tmp\//.test(fs.readFileSync(path.join(__dirname, f), "utf8")));
  t("no production script names a fixed /tmp/… path", offenders.length === 0, offenders.join(", "));
}

console.log(failed ? `\n${failed} FAILED` : "\nall shadow/temp isolation checks passed");
process.exit(failed ? 1 : 0);
