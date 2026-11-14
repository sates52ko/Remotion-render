#!/usr/bin/env node
// test-vox-image-recovery.js (2026-11-13): the lost-Vox-image recovery (scripts/vox-image-recovery.js,
// scripts/lib/vox-image-recovery.js, skill vox-image-recovery). Temp root, fixtures only, no Flux call, no make-book.
// Run: node scripts/test-vox-image-recovery.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const R = require("./lib/vox-image-recovery");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const CLI = path.join(__dirname, "vox-image-recovery.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vox-recovery-"));
const ROOT = path.join(tmp, "root"), B = path.join(ROOT, "books", "zz"), SB = path.join(B, "storyboard"), PUB = path.join(ROOT, "public", "scenes", "zz");
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" || Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 1)); };
let clock = Date.now() / 1000 - 10000;
const later = (p) => { clock += 10; fs.utimesSync(p, clock, clock); };
const run = (...a) => spawnSync(process.execPath, [CLI, ...a, "--slug=zz", `--root=${ROOT}`], { encoding: "utf8" });
const policy = R.loadPolicy(path.join(__dirname, ".."));
const diag = () => R.diagnose({ root: ROOT, slug: "zz", policy });
const img = (id, suf = "") => ({ path: `scenes/zz/${id}${suf}.png`, prompt: `p ${id}`, style: "card" });
const big = Buffer.alloc(9000, 1);

const designs = [
  { type: "statement", kicker: "A" },
  { type: "imagefocus", image: { subject: "a severed hand held up as a grotesque trophy in a cabin", style: "cutout" } },
  { type: "imagefocus", image: { subject: "a grand old colonial mansion with tall windows", style: "card" } },
  { type: "imagefocus", image: { subject: "an old apple orchard at dawn", style: "card" } },
  { type: "compare", compare: { left: { label: "DEED", subject: "a paper deed" }, right: { label: "TREE", subject: "an apple tree" } } },
];
const beats = designs.map((d, i) => ({ id: `beat-00${i}`, type: d.type, images: [] }));
beats[3].images = [img("beat-003")];
beats[4].images = [img("beat-004", "-b")];
const writeBase = () => {
  W(path.join(B, "book.json"), { engine: "vox", title: "Zed", author: "A. Writer", genre: "fiction" });
  W(path.join(SB, "authored-1.json"), designs.map((d, i) => ({ i, design: d }))); later(path.join(SB, "authored-1.json"));
  W(path.join(B, "designs.json"), designs); later(path.join(B, "designs.json"));
  W(path.join(B, "config.vox.json"), { meta: {}, beats });
  W(path.join(PUB, "beat-003.png"), big); W(path.join(PUB, "beat-004-b.png"), big);
  W(path.join(B, "images.report.json"), { images: [
    { path: "scenes/zz/beat-001.png", beat: "beat-001", attempts: 3, filtered: 3, outcome: "failed", softenedPrompt: "cinematic editorial still: a severed hand held up as a grotesque trophy in a cabin", at: "2026-11-12T10:00:00+00:00" },
    { path: "scenes/zz/beat-002.png", beat: "beat-002", attempts: 3, filtered: 3, outcome: "failed", softenedPrompt: "cinematic editorial still: a grand old colonial mansion with tall windows", at: "2026-11-12T10:00:00+00:00" },
    { path: "scenes/zz/beat-003.png", beat: "beat-003", attempts: 1, outcome: "ok", at: "2026-11-12T10:00:00+00:00" },
    { path: "scenes/zz/beat-004-a.png", beat: "beat-004", attempts: 3, filtered: 0, outcome: "failed", lastError: "HTTP 500: upstream", at: "2026-11-12T10:00:00+00:00" },
  ] });
};

try {
  writeBase();
  t("policy is the operator's standing decision (tools root): 2 rounds / 60 calls", policy.maxRoundsPerBeat === 2 && policy.maxCallsPerBook === 60 && policy.decidedBy === "operator");
  let d = diag();
  const by = Object.fromEntries(d.lost.map((x) => [x.beat, x]));
  t("lost beats found: designs → config → disk (text beat and present image are not lost)", d.lost.map((x) => x.beat).sort().join() === "beat-001,beat-002,beat-004", d.lost.map((x) => x.beat).join());
  t("filtered + filter words → REWRITE_TRIGGERS / REWRITE, words named", by["beat-001"].cls === "REWRITE_TRIGGERS" && by["beat-001"].action === "REWRITE" && by["beat-001"].triggers.includes("severed"), JSON.stringify(by["beat-001"]));
  t("filtered harmless subject → REWRITE_COMPOSITION", by["beat-002"].cls === "REWRITE_COMPOSITION" && by["beat-002"].action === "REWRITE");
  t("compare side failed with HTTP 500 → RETRY, ready without rewrite", by["beat-004"].cls === "RETRY" && by["beat-004"].action === "GENERATE");
  t("the authored-K.json that holds the beat is named", by["beat-001"].authoredFile === "books/zz/storyboard/authored-1.json");

  // --read-only writes nothing; status records the baseline subject
  let r = run("status", "--read-only");
  t("status --read-only: exit 1 (work), no ledger written", r.status === 1 && !fs.existsSync(path.join(B, "image-recovery.json")), r.stderr);
  r = run("status");
  const led = JSON.parse(fs.readFileSync(path.join(B, "image-recovery.json"), "utf8"));
  t("status records the baseline of each lost beat (a rewrite is checked against it)", Object.keys(led.baseline).sort().join() === "beat-001,beat-002,beat-004");
  t("status --soft always exits 0 (make-book 6.1 never blocks)", run("status", "--soft").status === 0);

  // run refuses while a refused subject is unchanged
  r = run("run", "--dry");
  t("run refuses (exit 2) while a REWRITE beat keeps the refused subject — no call spent", r.status === 2 && /refused: .*beat-001/.test(r.stderr), r.stdout + r.stderr);

  // the author rewrites both beats in the storyboard, merges (designs.json newer than authored)
  designs[1] = { type: "imagefocus", image: { subject: "an empty wooden cabin table at dusk, a closed burlap sack on it", style: "cutout" } };
  designs[2] = { type: "imagefocus", image: { subject: "a weathered front door of an old house, peeling paint, ivy", style: "card" } };
  W(path.join(SB, "authored-1.json"), designs.map((x, i) => ({ i, design: x }))); later(path.join(SB, "authored-1.json"));
  r = run("run", "--dry");
  t("run refuses while the storyboard is not merged (authored newer than designs.json)", r.status === 2 && /merge first/.test(r.stderr), r.stderr);
  W(path.join(B, "designs.json"), designs); later(path.join(B, "designs.json"));
  d = diag();
  t("re-authored beats are ready (subject differs from the baseline)", d.lost.every((x) => x.action === "GENERATE"), JSON.stringify(d.lost.map((x) => [x.beat, x.action])));
  r = run("run", "--dry");
  t("run --dry: make-book with exactly the lost beats and a call cap (3 per lost image: 1 + 1 + one compare side = 9)", r.status === 0 && /--image-beats=beat-001,beat-002,beat-004/.test(r.stdout) && /--image-max-calls=9\b/.test(r.stdout) && /--skip-pack/.test(r.stdout), r.stdout);

  // rounds: two real rounds for a beat → TO_TEXT; a probe / a not-attempted round does not count
  const L = R.loadLedger(ROOT, "zz");
  L.rounds = [
    { at: "a", beats: ["beat-001"], calls: 3, results: { "beat-001": "failed" }, subjectSha: { "beat-001": "x1" } },
    { at: "b", beats: ["beat-001", "beat-002"], calls: 3, results: { "beat-001": "failed", "beat-002": "not-attempted" }, subjectSha: { "beat-001": "x2" } },
    { at: "c", probe: true, beats: ["beat-002"], calls: 1, results: { "beat-002": "failed" } },
  ];
  R.saveLedger(ROOT, "zz", L);
  d = diag();
  const b1 = d.lost.find((x) => x.beat === "beat-001"), b2 = d.lost.find((x) => x.beat === "beat-002");
  t("2 real rounds → TO_TEXT (the beat becomes a text beat)", b1.action === "TO_TEXT" && b1.rounds === 2, JSON.stringify(b1));
  t("a not-attempted (call cap) round and a probe round do not count for the beat", b2.rounds === 0 && b2.action === "GENERATE", JSON.stringify(b2));
  t("budget: calls spent are summed from the ledger", d.spent === 7 && d.left === 53);
  r = run("run", "--dry");
  t("run refuses while a beat waits for its text conversion", r.status === 2 && /beat-001 \(TO_TEXT\)/.test(r.stderr), r.stderr);
  L.rounds.push({ at: "d", beats: ["beat-009"], calls: 60, results: {} }); R.saveLedger(ROOT, "zz", L);
  d = diag();
  t("book budget used → every remaining beat TO_TEXT, state exhausted (exit 3)", d.state === "exhausted" && run("status").status === 3);
  L.rounds = []; R.saveLedger(ROOT, "zz", L);

  // HTTP 422 → SHORTEN; HTTP 402 → OPERATOR
  const rep = JSON.parse(fs.readFileSync(path.join(B, "images.report.json"), "utf8"));
  rep.images.find((x) => x.beat === "beat-004").lastError = "HTTP 422: prompt too long";
  fs.writeFileSync(path.join(B, "images.report.json"), JSON.stringify(rep));
  t("HTTP 422 → SHORTEN (needs a shorter subject)", diag().lost.find((x) => x.beat === "beat-004").cls === "SHORTEN");
  rep.images.find((x) => x.beat === "beat-004").lastError = "HTTP 402: insufficient credits";
  fs.writeFileSync(path.join(B, "images.report.json"), JSON.stringify(rep));
  d = diag();
  t("HTTP 402 / quota → OPERATOR stop (exit 4), never a retry or a text conversion", d.state === "operator" && run("status").status === 4);

  // systemic API failure: the latest batch failed everywhere without a filter verdict → one probe call
  rep.images = rep.images.filter((x) => x.beat !== "beat-004").concat([
    { path: "scenes/zz/beat-004-a.png", beat: "beat-004", attempts: 3, filtered: 0, outcome: "failed", lastError: "HTTP 503: down", at: "2026-11-13T10:00:00+00:00" },
    { path: "scenes/zz/beat-002.png", beat: "beat-002", attempts: 3, filtered: 0, outcome: "failed", lastError: "HTTP 503: down", at: "2026-11-13T10:00:00+00:00" },
    { path: "scenes/zz/beat-003.png", beat: "beat-003", attempts: 1, outcome: "skipped-existing", at: "2026-11-13T10:00:00+00:00" },
  ]);
  rep.images = rep.images.filter((x, k, a) => a.findIndex((y) => y.path === x.path && y.at === x.at) === k && !(x.beat === "beat-002" && x.at.startsWith("2026-11-12")));
  fs.writeFileSync(path.join(B, "images.report.json"), JSON.stringify(rep));
  d = diag();
  t("API problem detected (last batch: every attempt failed, no filter verdict)", d.apiProblem && /503/.test(d.apiProblem.lastError), JSON.stringify(d.apiProblem));
  r = run("run", "--dry");
  t("run after an API failure is ONE probe call (cap 1, one beat), not a full round", r.status === 0 && /Probe round/.test(r.stdout) && /--image-max-calls=1\b/.test(r.stdout), r.stdout + r.stderr);

  // not a Vox book → nothing
  W(path.join(B, "book.json"), { engine: "antidote" });
  t("an Antidote book → not-vox, exit 0", diag().state === "not-vox" && run("status").status === 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
