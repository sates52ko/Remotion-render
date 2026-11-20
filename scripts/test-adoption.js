#!/usr/bin/env node
// Antidote 10x ADOPTION (2026-10-29): a NEW book on current code must be offered the 10x tools at the moment of choice,
// and their use must be measurable at three levels that are never merged:
//   capability (this tree's engine has it) / adoption (authored -> merged -> planned) / verified (blind mute verdicts).
// Real case behind it: essentialism was adopted onto 88db7e09 with its old storyboard (0 of 10 tools used, rules.md newer
// than the storyboard); thinking-fast-and-slow's pin predated every tool (judge: "a face … but not the loop").
// This is a FIXTURE: a PASS here says the pipeline CAN carry the tools, not that a real book used them.
// Run: node scripts/test-adoption.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "adoption-"));
const SLUG = `zz-adoption-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const LINES = [
  "Welcome to this deep dive into small habits.",
  "She drinks a sip of tea.",
  "She puts the cup down.",
  "She walks out without a word.",
  "It is a vicious cycle.",
];
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of LINES) {
  const w = sent.split(" "), start = clock;
  let line = w[0];
  for (let k = 1; k < w.length; k++) line += `<${ts(start + k * 0.3)}><c> ${w[k]}</c>`;
  const end = start + w.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
const CAST = { mara: { name: "Mara", role: "the one with the habit", look: "young woman", variant: { hairStyle: "bun", gender: "f" } } };
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of fs.readdirSync(path.join(REPO, "data"))) if (/\.json$/.test(f)) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
fs.mkdirSync(path.join(tmp, "public", "captions"), { recursive: true });
fs.writeFileSync(path.join(tmp, "public", "captions", `${SLUG}.vtt`), vtt);
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Habit Test", author: "A. Writer", genre: "nonfiction", engine: "antidote",
  engineProfile: { kind: "nonfiction", world: "ideas", era: 2020, realPeople: false, format: "argument", violence: "none", minorHarm: false, mustSee: ["a kitchen", "a cup of tea"] } }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["door"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const usage = () => {
  const out = path.join(tmp, "fu-" + Math.random().toString(36).slice(2));
  const r = run([path.join(__dirname, "feature-usage.js"), `--slug=${SLUG}`, `--root=${tmp}`, `--out=${out}`]);
  const f = fs.existsSync(out) ? fs.readdirSync(out)[0] : null;
  return { r, rep: f ? read(path.join(out, f)) : null };
};
try {
  // ── (A) a new book: beats, authored with the tools -> merge -> plan: the decision reaches the scene ─────────────────
  run([PLAN, `--slug=${SLUG}`, "--title=Habit Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2", `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const em = read(path.join(tmp, "beats.json"));
  const beats = em ? (em.beats || em) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iD = find(/sip of tea/), iP = find(/puts the cup down/), iL = find(/walks out/), iC = find(/vicious cycle/);
  t("fixture: one beat per sentence", [iD, iP, iL, iC].every((x) => x > 0), JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const authored = beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, cast: ["mara"], expression: "neutral", action: "idle", storyboard: SB };
    if (b.i === iD) Object.assign(x, { action: "drink", holds: "cup", actionCue: "sip" });
    if (b.i === iP) Object.assign(x, { action: "place", holds: "cup", actionCue: "down", continue: true });
    if (b.i === iL) Object.assign(x, { action: "leave", actionCue: "walks out" });
    return x;
  });
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authored));
  const m = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  t("merge: the drink / place / leave beats are accepted", m.status === 0, (m.stdout || "").slice(-700));

  // ── (B) prep writes rules.md that ROUTES each passage shape to its tool, with a measured why and a not-when ───────
  const p = run([path.join(__dirname, "storyboard.js"), "prep", `--slug=${SLUG}`, `--root=${tmp}`, "--beats-from-art", "--skip-own-icons=fixture", "--skip-cast-check", "--confirm-engine"]);
  const rules = fs.existsSync(path.join(BOOK, "storyboard", "rules.md")) ? fs.readFileSync(path.join(BOOK, "storyboard", "rules.md"), "utf8") : "";
  t("prep: rules.md written for the new book", p.status === 0 && rules.length > 0, (p.stdout || "").slice(-400) + (p.stderr || "").slice(-400));
  const route = rules.slice(rules.indexOf("## Which tool for which passage"), rules.indexOf("## Vocabulary"));
  t("rules: the routing table sits between the question for every beat and the vocabulary", rules.indexOf("## The question for every beat") < rules.indexOf("## Which tool for which passage") && route.length > 200);
  for (const tool of ["`refute`", "`mechanism`", "`causal` diagram", "`loop` + `ledger`", "`scorecard`", "`take`", "`drink`", "`place`", "`leave`", "`lift`"])
    t(`rules: routes to ${tool} with a measured why and a not-when`, route.split("\n").some((l) => l.includes(tool) && /\d+\/\d+|YYY/.test(l) && l.split("|").length >= 6 && l.split("|")[4].trim().length > 0), tool);
  t("rules: a continued beat keeps a body state until the narration ends it (P3: down gets up only on a narrated rise, gone until they return, set down until a take)",
    /a person who is down gets up only on "gets up \/ stands up \/ rises…"/.test(rules) && /stays gone until the narration brings them back/.test(rules) && /set down stays down until a `take`/.test(rules));
  t("rules: the table forbids using a tool for its own sake", /never use a tool for its own sake/.test(route) && /invention/.test(route));
  const later = Date.now() / 1000 + 5;
  fs.utimesSync(path.join(BOOK, "storyboard", "authored-1.json"), later, later); // a storyboard authored AFTER this rules.md
  const pl = run([PLAN, `--slug=${SLUG}`, "--title=Habit Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2", `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(BOOK, "config.antidote.json")}`]);
  t("plan: config written", fs.existsSync(path.join(BOOK, "config.antidote.json")), (pl.stderr || pl.stdout || "").slice(-400));

  // ── (C) feature-usage: three levels, never merged ─────────────────────────────────────────────────────────────────
  let { r, rep } = usage();
  const F = (k) => rep && rep.features.find((x) => x.feature === k);
  t("feature-usage: runs (exit 0) and reports the 10x rows", r.status === 0 && !!F("10x action:drink"), (r.stdout || r.stderr || "").slice(-300));
  for (const a of ["drink", "place", "leave"]) t(`adoption: ${a} authored 1 -> merged 1 -> planned 1`, F(`10x action:${a}`).authored === 1 && F(`10x action:${a}`).merged === 1 && F(`10x action:${a}`).planned === 1, JSON.stringify(F(`10x action:${a}`)));
  t("adoption: an unused tool is 0, not an error", F("10x diagram:refute").merged === 0 && F("10x action:lift").planned === 0);
  t("capability: no engine source in this tree -> NOT_VERIFIED (never assumed)", F("10x action:drink").capability === "NOT_VERIFIED");
  t("verified: no mute run -> NO_MUTE_RUN (never PASS)", F("10x action:drink").blind === "NO_MUTE_RUN");
  t("hints: the 'vicious cycle' beat is pointed at for loop + ledger (a lexical pointer, not a verdict)", F("10x loop + ledger").hints && F("10x loop + ledger").hints.beats.includes(iC), JSON.stringify(F("10x loop + ledger").hints));
  t("authoring vs rules: authored after rules.md -> AUTHORED_AFTER_RULES", rep.authoringVsRules === "AUTHORED_AFTER_RULES", rep.authoringVsRules);

  // engine source present -> capability yes / no from THIS tree
  fs.mkdirSync(path.join(tmp, "src", "engines", "antidote"), { recursive: true });
  for (const f of ["schema.ts", "endState.ts"]) fs.copyFileSync(path.join(REPO, "src", "engines", "antidote", f), path.join(tmp, "src", "engines", "antidote", f));
  // a mute run whose sample holds the drink scene, judged CORRECT/ADDS
  const cfg = read(path.join(BOOK, "config.antidote.json"));
  const sD = cfg.scenes.find((s) => (s.characters || [])[0] && s.characters[0].action === "drink");
  const MD = path.join(tmp, "audit", "mute", SLUG, "final");
  fs.mkdirSync(MD, { recursive: true });
  const fr = sD.fromFrame + 10;
  fs.writeFileSync(path.join(MD, "sample.json"), JSON.stringify([{ id: sD.id, frame: fr }]));
  fs.writeFileSync(path.join(MD, "judge-key.json"), JSON.stringify({ "item-01": { frame: fr } }));
  fs.writeFileSync(path.join(MD, "judge-result.json"), JSON.stringify({ items: [{ id: "item-01", V: { correctness: "CORRECT", contribution: "ADDS", explains: "NO" } }] }));
  // rules re-prepped after the storyboard (an adopted / re-prepped book)
  const newer = Date.now() / 1000 + 60;
  fs.utimesSync(path.join(BOOK, "storyboard", "rules.md"), newer, newer);
  ({ r, rep } = usage());
  t("capability: read from this tree's engine (drink yes)", F("10x action:drink").capability === "yes" && F("10x diagram:causal").capability === "yes");
  t("verified: the blind verdict on the drink scene is reported as a count, beside (not inside) adoption", typeof F("10x action:drink").blind === "object" && F("10x action:drink").blind.correct === 1 && F("10x action:drink").blind.adds === 1 && F("10x action:drink").planned === 1);
  t("verified: a feature with no sampled scene is NOT_SAMPLED", F("10x action:place").blind === "NOT_SAMPLED");
  t("authoring vs rules: rules.md newer than the storyboard -> AUTHORED_BEFORE_RULES, with a warning", rep.authoringVsRules === "AUTHORED_BEFORE_RULES" && /not authored against the current rules/.test(r.stdout));
  t("report-only: the book files are untouched by feature-usage", read(path.join(BOOK, "config.antidote.json")).scenes.length === cfg.scenes.length);
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall adoption checks passed (a FIXTURE: real-book adoption is measured by feature-usage on the book itself)");
process.exit(failed ? 1 : 0);
