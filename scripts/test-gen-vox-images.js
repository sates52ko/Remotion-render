#!/usr/bin/env node
// VOX IMAGE RETRY CONTROL (cycle 8, 2026-11-02). Real case: Hamnet — 58 of 221 Flux images CONTENT_FILTERED; every
// make-book run re-tried all of them although only 11 beats had new prompts. gen-vox-images.py now: --beats (zero calls
// for every other image), --dry-run (the call plan, no call, no write), --max-calls, a prompt hash per failed image (an
// UNCHANGED failed prompt is not re-tried; a CHANGED one is), existing images kept, --root for a pinned book worktree.
// A local fake Flux server answers CONTENT_FILTERED (or an image) and COUNTS the requests.
// Run: node scripts/test-gen-vox-images.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const SCRIPT = path.join(__dirname, "gen-vox-images.py");
const PY = ["python", "python3"].find((p) => spawnSync(p, ["-c", "import requests"], { encoding: "utf8" }).status === 0);
if (!PY) { console.log("· SKIP: no python with the requests module on this machine"); process.exit(0); }
const sha = (p) => crypto.createHash("sha256").update(p, "utf8").digest("hex").slice(0, 16);
const PNG = Buffer.alloc(12000, 7); // > 10 KB: counts as an existing image

const root = fs.mkdtempSync(path.join(os.tmpdir(), "voximg-"));
const cfgRel = "books/zz/config.vox.json";
const P = { b0: "a red door in the rain", b1: "a lantern on a table", b2: "a boy holding a candle", b3: "a ship at dawn", b4: "two hands holding" };
const cfg = { beats: Object.entries(P).map(([id, prompt]) => ({ id, images: [{ path: `scenes/zz/${id}.png`, prompt }] })) };
fs.mkdirSync(path.join(root, "books", "zz"), { recursive: true });
fs.mkdirSync(path.join(root, "public", "scenes", "zz"), { recursive: true });
const writeState = (report) => {
  fs.writeFileSync(path.join(root, cfgRel), JSON.stringify(cfg, null, 2));
  fs.writeFileSync(path.join(root, "books", "zz", "images.report.json"), JSON.stringify({ images: report }, null, 2));
  fs.writeFileSync(path.join(root, "public", "scenes", "zz", "b0.png"), PNG); // b0 exists
  for (const id of ["b1", "b2", "b3", "b4"]) { try { fs.rmSync(path.join(root, "public", "scenes", "zz", `${id}.png`)); } catch {} }
};
const REPORT = [
  { path: "scenes/zz/b1.png", beat: "b1", outcome: "failed", promptSha: sha(P.b1) },          // failed, prompt unchanged
  { path: "scenes/zz/b2.png", beat: "b2", outcome: "failed", promptSha: sha("an OLD prompt") }, // failed, prompt changed since
  { path: "scenes/zz/b3.png", beat: "b3", outcome: "failed" },                                 // failed, legacy record (no hash)
];

// the fake Flux server runs in its OWN process (spawnSync below blocks this process's event loop); it counts requests in
// a file and answers by the mode file: "filtered" -> CONTENT_FILTERED, "image" -> a 12 KB image
const COUNT = path.join(root, "flux-count.txt"), MODE = path.join(root, "flux-mode.txt");
fs.writeFileSync(COUNT, "0"); fs.writeFileSync(MODE, "filtered");
const SERVER = `const http=require("http"),fs=require("fs");const [C,M]=process.argv.slice(1);
http.createServer((q,r)=>{let b="";q.on("data",d=>b+=d);q.on("end",()=>{fs.writeFileSync(C,String(+fs.readFileSync(C,"utf8")+1));
const img=fs.readFileSync(M,"utf8").trim()==="image";r.writeHead(200,{"content-type":"application/json"});
r.end(JSON.stringify(img?{artifacts:[{base64:Buffer.alloc(12000,7).toString("base64")}]}:{artifacts:[{finishReason:"CONTENT_FILTERED"}]}))})}).listen(0,"127.0.0.1",function(){console.log(this.address().port)});`;
const child = require("child_process").spawn(process.execPath, ["-e", SERVER, COUNT, MODE], { stdio: ["ignore", "pipe", "inherit"] });
let requests = 0, mode = "filtered";
const setMode = (m) => { mode = m; fs.writeFileSync(MODE, m); };
const resetCount = () => fs.writeFileSync(COUNT, "0");
const count = () => +fs.readFileSync(COUNT, "utf8");
child.stdout.once("data", (d) => {
  const url = `http://127.0.0.1:${String(d).trim()}/flux`;
  const run = (args, env = {}) => spawnSync(PY, [SCRIPT, cfgRel, `--root=${root}`, ...args], { encoding: "utf8", env: { ...process.env, NVIDIA_API_KEY: "test-key-not-real", FLUX_INVOKE_URL_FOR_TESTS: url, PYTHONIOENCODING: "utf-8", ...env } });
  const report = () => JSON.parse(fs.readFileSync(path.join(root, "books", "zz", "images.report.json"), "utf8")).images;
  try {
    // 1. the plan (dry run): no API key needed, no call, nothing written
    writeState(REPORT);
    const before = fs.readFileSync(path.join(root, cfgRel), "utf8") + fs.readFileSync(path.join(root, "books", "zz", "images.report.json"), "utf8");
    let r = run(["--dry-run"], { NVIDIA_API_KEY: "" });
    const plan = r.stdout;
    t("dry run: exit 0 without an API key", r.status === 0, r.stdout + r.stderr);
    t("dry run: zero Flux calls", count() === 0, count());
    t("dry run: the config and the report are not written", fs.readFileSync(path.join(root, cfgRel), "utf8") + fs.readFileSync(path.join(root, "books", "zz", "images.report.json"), "utf8") === before);
    t("plan: an existing image is kept (skipped-existing)", /skipped-existing\s+b0/.test(plan), plan);
    t("plan: a failed image with an UNCHANGED prompt is not re-tried", /skipped-failed-unchanged\s+b1/.test(plan), plan);
    t("plan: a failed image whose prompt CHANGED is generated", /generate\s+b2/.test(plan), plan);
    t("plan: a legacy failed record (no prompt hash) is not re-tried by default", /skipped-failed-unknown-prompt\s+b3/.test(plan), plan);
    t("plan: a new image is generated", /generate\s+b4/.test(plan), plan);

    // 2. a normal run: only the changed + the new image cost calls (3 attempts each against CONTENT_FILTERED)
    resetCount(); setMode("filtered");
    r = run([]);
    t("normal run: exactly 6 calls (b2 + b4, 3 attempts each) — b1/b3 cost nothing", count() === 6, `${count()} calls\n${r.stdout.slice(-600)}`);
    const rep = report();
    t("the report records the prompt hash of every attempted image", rep.filter((x) => ["b2", "b4"].includes(x.beat)).every((x) => x.promptSha && x.outcome === "failed"), JSON.stringify(rep));
    t("the earlier records of skipped failures are kept as they were", rep.find((x) => x.beat === "b1").promptSha === sha(P.b1) && !rep.find((x) => x.beat === "b3").promptSha);

    // 3. the same run again: now every failure is recorded with its prompt -> zero calls
    writeState(report());
    resetCount();
    run([]);
    t("re-run with unchanged prompts: zero calls (the failures are not re-tried)", count() === 0, count());

    // 4. --beats: only the named beat; every other image zero calls and untouched
    writeState(REPORT);
    resetCount(); setMode("image");
    const cfgBefore = JSON.parse(fs.readFileSync(path.join(root, cfgRel), "utf8"));
    r = run(["--beats=b1"]);
    t("--beats=b1: exactly one call (a named beat is generated even if it failed before)", count() === 1, `${count()}\n${r.stdout.slice(-500)}`);
    t("--beats=b1: the image was written", fs.existsSync(path.join(root, "public", "scenes", "zz", "b1.png")));
    const cfgAfter = JSON.parse(fs.readFileSync(path.join(root, cfgRel), "utf8"));
    t("--beats: unselected beats' config entries are left exactly as they were (no reconcile outside the selection)", JSON.stringify(cfgAfter.beats.filter((b) => b.id !== "b1")) === JSON.stringify(cfgBefore.beats.filter((b) => b.id !== "b1")));
    t("--beats: unselected beats' report records are left as they were", JSON.stringify(report().filter((x) => x.beat === "b3")) === JSON.stringify(REPORT.filter((x) => x.beat === "b3")));

    // 5. --max-calls caps the run
    writeState(REPORT);
    resetCount(); setMode("filtered");
    r = run(["--max-calls=2"]);
    t("--max-calls=2: at most 2 calls", count() === 2, `${count()}\n${r.stdout.slice(-400)}`);
    t("--max-calls: the image never attempted is recorded as not-attempted-cap", report().some((x) => x.outcome === "not-attempted-cap"), JSON.stringify(report()));

    // 6. --retry-failed opts back in
    writeState(REPORT);
    resetCount(); setMode("filtered");
    r = run(["--retry-failed", "--dry-run"]);
    t("--retry-failed: the unchanged failed prompt is planned again", /generate\s+b1/.test(r.stdout) && /generate\s+b3/.test(r.stdout), r.stdout);

    // 7. refusals
    r = run(["--beats=nope", "--dry-run"]);
    t("--beats with an unknown beat -> exit 2", r.status === 2 && /not in/.test(r.stdout), r.stdout);
    r = run(["--bogus"]);
    t("an unknown option -> exit 2 (nothing runs)", r.status === 2 && /unknown option/.test(r.stdout), r.stdout);

    // 8. make-book passes the controls through and --images-only skips everything images do not need
    const mb = fs.readFileSync(path.join(__dirname, "make-book.js"), "utf8");
    t("make-book: --images-only runs only the authorship gate, images, cut-outs and the asset check", /if \(args\["images-only"\]\)[\s\S]{0,1600}process\.exit\(0\);/.test(mb) && /--images-only runs ONLY what new images need/.test(mb));
    t("make-book: --image-beats / --image-max-calls / --images-dry-run / --image-retry-failed reach gen-vox-images.py", /--beats=\$\{args\["image-beats"\]\}/.test(mb) && /--max-calls=\$\{args\["image-max-calls"\]\}/.test(mb) && /" --dry-run"/.test(mb) && /" --retry-failed"/.test(mb));
  } finally {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} FAILED` : "\nall gen-vox-images checks passed");
  process.exit(failed ? 1 : 0);
});
