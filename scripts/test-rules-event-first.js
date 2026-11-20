#!/usr/bin/env node
// Rules text "show the event on the beat that says it" (2026-10-22, roadmap P1). Text only: the authors are
// told to stage the event / mechanism / cause -> effect / relationship their explainedBy names ON that beat,
// the diagram limit is no longer a quota, and a face / callout / single figure stays allowed where the
// sentence is only a feeling, a reaction or commentary. Nothing in merge or the planner forces a diagram,
// an action or a second person — a face + callout chunk merges exactly as before.
// Runs the REAL merge (--root=<temp>) and prep (--beats-from-art) on a word-timed fixture.
// Run: node scripts/test-rules-event-first.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const sb = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");

// ── (A) the rules text ───────────────────────────────────────────────────────
t("rules: the answer is staged ON THE BEAT THAT SAYS IT", /Stage the answer ON THE BEAT THAT SAYS IT/.test(sb));
t("rules: event -> the deed (take / embrace + actionCue)", /an EVENT \(someone does something\): stage the deed/.test(sb) && /`take` \/ `embrace` with an\s+\\`actionCue\\`|take\\` \/ \\`embrace\\` with an/.test(sb));
t("rules: mechanism -> on THIS beat, not the neighbour", /a MECHANISM[^\n]*\n[^\n]*not the beat before or after/.test(sb));
t("rules: cause -> change -> result, kept with continue", /a CAUSE and its EFFECT: cause -> change -> result/.test(sb));
t("rules: a relationship is not two people side by side", /two people standing side by side only\s+shows that two people exist/.test(sb));
t("rules: faces / callouts / single figures stay allowed for feelings, reactions, commentary", /stays right when\s+the sentence IS about a feeling, a reaction or plain commentary/.test(sb));
t("rules: never add a diagram, action or second person the narration does not have", /never add a diagram, an action or a second person the narration does not have/.test(sb));
t("rules: the diagram limit is not a quota (old '1 per 25' gone)", /## Diagrams \(only where the narration states a structure — no quota either way\)/.test(sb) && !/about 1 per 25 beats/.test(sb));
t("rules: no diagram quota or minimum anywhere in the rules text", !/(at least|minimum of|every)\s+\d+\s+(diagram|beats)/i.test(sb.slice(sb.indexOf("function rulesAntidote"), sb.indexOf("function rulesVox") > 0 ? sb.indexOf("function rulesVox") : undefined)));

// ── (B) merge + prep on a fixture: a face + callout chunk is accepted as it is ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rules-event-first-"));
const SLUG = `zz-rules-event-first-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const LINES = [
  "Welcome to this deep dive into quiet courage.",
  "Honestly, I just love how calm she sounds here.",
  "Right, and that feeling stays with you for a while.",
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
const CAST = { mara: { name: "Mara", role: "the listener", look: "young woman", variant: { hairStyle: "bun", gender: "f" } }, narrator: { name: "Narrator", role: "host", look: "host", variant: { hairStyle: "short", gender: "m" } } };
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of fs.readdirSync(path.join(REPO, "data"))) if (/\.json$/.test(f)) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Quiet Test", author: "A. Writer", genre: "fiction", engine: "antidote",
  engineProfile: { kind: "fiction", world: "contemporary", era: 2020, realPeople: false, format: "story", violence: "none", minorHarm: false, mustSee: ["a quiet room"] } }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: ["heart"] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
try {
  run([PLAN, `--slug=${SLUG}`, "--title=Quiet Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2", `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const em = read(path.join(tmp, "beats.json"));
  const beats = em ? (em.beats || em) : [];
  t("fixture: the planner emitted the beats", beats.length >= 3, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  // feelings and commentary only: a face and a callout, no diagram, no deed, one person
  const authored = beats.map((b) => ({ i: b.i, concept: null, diagram: null, callout: b.i === 0 ? null : { text: "SHE SOUNDS CALM", style: "reveal" },
    cast: ["mara"], expression: "happy", action: "idle", explainedBy: "a feeling: she is calm", noVisual: null, storyboard: SB }));
  fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(authored));
  const m = run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
  const art = read(path.join(BOOK, "art.json"));
  t("merge: a face + callout chunk with no mechanism is accepted (exit 0, art.json written)", m.status === 0 && !!art, (m.stdout || "").slice(-500) + (m.stderr || "").slice(-300));
  t("merge: nothing asks for a diagram, an action or a second person", !/diagram|second person|two people|actionCue|take|embrace/i.test((m.stdout || "").split("\n").filter((l) => /warn|⚠|problem|✗|❌/i.test(l)).join("\n")), (m.stdout || "").slice(-500));
  t("merge: the authored beats are kept as written (no diagram added)", !!art && art.beats.every((b) => !b.diagram && (b.cast || []).join() === "mara"));
  const p = run([path.join(__dirname, "storyboard.js"), "prep", `--slug=${SLUG}`, `--root=${tmp}`, "--beats-from-art", "--skip-own-icons=fixture", "--skip-cast-check", "--confirm-engine"]);
  const rulesPath = path.join(BOOK, "storyboard", "rules.md");
  const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, "utf8") : "";
  t("prep: rules.md is generated", p.status === 0 && rules.length > 0, (p.stdout || "").slice(-400) + (p.stderr || "").slice(-300));
  t("prep: rules.md carries the new block and the no-quota diagram heading", /Stage the answer ON THE BEAT THAT SAYS IT/.test(rules) && /## Diagrams \(only where the narration states a structure — no quota either way\)/.test(rules) && !/about 1 per 25 beats/.test(rules));
  t("prep: rules.md keeps the existing sections", ["## The question for every beat", "## The icon test", "## How staging reads", "## Sequences", "Actions that HAPPEN"].every((h) => rules.includes(h)));
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall rules-event-first checks passed");
process.exit(failed ? 1 : 0);
