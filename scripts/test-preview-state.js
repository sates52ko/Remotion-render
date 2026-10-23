#!/usr/bin/env node
// preview-state.js (2026-10-23): the one answer to "where is this book, what next, does the operator decide?" that the
// preview-hazirla skill loops on. A fixture book is walked stage by stage in a temp root (mtimes order the files);
// a temp git repo + linked worktree cover the engine pin. Checks: inputs/Step 0/engine stops, frozen, every stage's
// next action, resume (finished stages are not redone), the mute sub-steps, FAIL never reported as ready, fix-round
// limit, unchanged film, transient retry budget, legacy acceptance, read-only status, candidates, pin.
// Run: node scripts/test-preview-state.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync, execFileSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const PS = path.join(__dirname, "preview-state.js");
const run = (root, ...a) => spawnSync(process.execPath, [PS, ...a, `--root=${root}`], { encoding: "utf8" });
const state = (root, slug = "zz-book") => JSON.parse(run(root, "status", `--slug=${slug}`, "--json").stdout);
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v, null, 1)); };
let clock = Date.now() / 1000 - 100000;
const touch = (p) => { clock += 10; fs.utimesSync(p, clock, clock); };   // every write is "later" than the last
const Wt = (p, v) => { W(p, v); touch(p); };
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preview-state-"));
const R = path.join(tmp, "root"), B = path.join(R, "books", "zz-book"), SB = path.join(B, "storyboard"), MD = path.join(R, "audit", "mute", "zz-book");
const fp = () => { const out = []; const walk = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else out.push(`${p}:${s.size}:${s.mtimeMs}`); } }; walk(R); return out.sort().join("\n"); };

try {
  // ── inputs / Step 0 ─────────────────────────────────────────────────────────
  W(path.join(R, "PUBLISHED_BOOKS.md"), "| # | slug | book | date |\n|---|---|---|---|\n| 1 | `zz-published` | **P** — A | 2026-01-01 |\n");
  let s = state(R);
  t("missing inputs -> OPERATOR MISSING_INPUT (never invented)", s.state === "OPERATOR" && s.operator.code === "MISSING_INPUT" && s.operator.evidence.length === 3, JSON.stringify(s.operator));
  Wt(path.join(R, "public", "audio", "zz-book.m4a"), "a"); Wt(path.join(R, "public", "captions", "zz-book.vtt"), "WEBVTT\n");
  Wt(path.join(B, "book.json"), { engine: "antidote", engineProfile: { kind: "x" } });
  s = state(R);
  t("a placeholder audio / an empty VTT is not an input -> MISSING_INPUT", s.operator && s.operator.code === "MISSING_INPUT" && /not a recording/.test(s.operator.evidence.join()) && /has no cues/.test(s.operator.evidence.join()), JSON.stringify(s.operator));
  Wt(path.join(R, "public", "audio", "zz-book.m4a"), Buffer.alloc(200 * 1024));
  Wt(path.join(R, "public", "captions", "zz-book.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");
  Wt(path.join(B, "book.json"), { slug: "zz-book", title: "Z", author: "A", genre: "fiction" });
  s = state(R);
  t("no engine -> OPERATOR STEP0_ENGINE", s.operator && s.operator.code === "STEP0_ENGINE");
  Wt(path.join(B, "book.json"), { slug: "zz-book", title: "Z", author: "A", genre: "fiction", engine: "antidote" });
  t("no engineProfile -> OPERATOR STEP0_ENGINE", state(R).operator.code === "STEP0_ENGINE");
  const book = { slug: "zz-book", title: "Z", author: "A", genre: "fiction", engine: "antidote", engineProfile: { kind: "fiction" },
    engineCheck: { fit: "vox", confidence: "strong", reasons: ["real people"], risks: [] } };
  Wt(path.join(B, "book.json"), book);
  s = state(R);
  t("strong unconfirmed contradiction -> OPERATOR ENGINE_CONTRADICTION", s.operator && s.operator.code === "ENGINE_CONTRADICTION", JSON.stringify(s.operator));
  book.engineCheck = { fit: "antidote", confidence: "strong", reasons: [], risks: [] };
  Wt(path.join(B, "book.json"), book);
  W(path.join(R, "books", "zz-published", "book.json"), book);
  t("a published book -> OPERATOR FROZEN", state(R, "zz-published").operator.code === "FROZEN");

  // ── bible / own icons / prep / authors ─────────────────────────────────────
  s = state(R);
  t("no story bible -> CONTINUE bible (code stage n/a outside git)", s.state === "CONTINUE" && s.next.stage === "bible" && s.stages.find((x) => x.key === "code").status === "n/a", JSON.stringify(s.next));
  Wt(path.join(B, "bible.draft.json"), {});
  t("a draft exists -> warned not to re-emit over it", /do NOT re-run --emit/.test(state(R).next.why));
  const bible = { authored: true, cast: { mara: { look: "x" }, narrator: {} }, signatureObjects: [{ key: "hound" }] };
  Wt(path.join(B, "story-bible.json"), bible);
  t("undressed cast -> bible todo", state(R).next.stage === "bible" && /variant/.test(state(R).next.action));
  bible.cast.mara.variant = { gender: "f", outfit: "coat" };
  Wt(path.join(B, "story-bible.json"), bible);
  t("signature object not drawn -> ownIcons todo", state(R).next.stage === "ownIcons" && /not drawn/.test(state(R).stages.find((x) => x.key === "ownIcons").detail));
  Wt(path.join(B, "motifs.json"), { hound: { title: "Hound", paths: [] } });
  t("sheet older than motifs -> draw the sheet", /own-icons-sheet/.test(state(R).next.command || ""));
  Wt(path.join(SB, "own-icons.key.json"), { 1: { key: "hound" } });
  t("naming not recorded -> run a fresh namer and record it", /own-icons.naming.json/.test(state(R).next.action));
  Wt(path.join(SB, "own-icons.naming.json"), { names: { 1: { said: "toaster", intended: "hound", match: false } } });
  t("a misread icon -> redraw", /misread: 1: "toaster"/.test(state(R).stages.find((x) => x.key === "ownIcons").detail));
  Wt(path.join(SB, "own-icons.naming.json"), { names: { 1: { said: "robot dog", intended: "hound", match: true } } });
  s = state(R);
  t("named icons -> prep next", s.next.stage === "prep" && /storyboard.js prep/.test(s.next.command));
  const prep = () => {
    Wt(path.join(SB, "vocab.json"), { inputs: { "story-bible.json": sha(path.join(B, "story-bible.json")), "motifs.json": sha(path.join(B, "motifs.json")) } });
    Wt(path.join(SB, "PROMPTS.md"), "### Author 1 (beats 0-1)\n### Author 2 (beats 2-3)\n");
    Wt(path.join(SB, "chunk-1.json"), { beats: [{ i: 0 }, { i: 1 }] }); Wt(path.join(SB, "chunk-2.json"), { beats: [{ i: 2 }, { i: 3 }] });
    Wt(path.join(SB, "beats.json"), { beats: [0, 1, 2, 3].map((i) => ({ i, narration: `n${i}` })) });
  };
  prep();
  s = state(R);
  t("authors missing -> names exactly the missing chunks", s.next.stage === "authors" && /Author 1, Author 2/.test(s.next.action));
  Wt(path.join(SB, "authored-1.json"), [{ i: 0 }, { i: 1 }]);
  Wt(path.join(SB, "authored-2.json"), [{ i: 2 }]);
  t("a chunk missing a beat -> that chunk only", /Author 2/.test(state(R).next.action) && !/Author 1/.test(state(R).next.action));
  bible.cast.luther = { variant: { gender: "m", outfit: "suit" } };
  Wt(path.join(B, "story-bible.json"), bible);
  t("bible changed after prep -> prep is stale (resume re-preps, keeps authored files)", state(R).next.stage === "prep" && fs.existsSync(path.join(SB, "authored-1.json")));
  prep();
  Wt(path.join(SB, "authored-2.json"), [{ i: 2 }, { i: 3, stageRelationship: true, relationship: { a: 1 } }]);
  t("a staged relationship without a verdict -> Gate B", state(R).next.stage === "gateB");
  const gb = crypto.createHash("sha256").update(JSON.stringify({ relationship: { a: 1 }, narration: "n3" })).digest("hex");
  Wt(path.join(SB, "gate-b", "3.json"), { inputSha256: gb, decision: "STAGE" });
  s = state(R);
  t("current Gate B verdict -> merge next (with the problems(N) warning)", s.next.stage === "merge" && /problems \(N\)/.test(s.next.action), JSON.stringify(s.next));
  Wt(path.join(B, "art.json"), { beats: [] });

  // ── readcheck / make-book / gates ─────────────────────────────────────────
  t("readcheck not run -> readcheck prep", /readcheck.js prep/.test(state(R).next.command || ""));
  Wt(path.join(B, "readcheck.json"), { n: 3, total: 4, totals: { WRONG: 0 } });
  t("readcheck incomplete -> finish it", /3\/4/.test(state(R).stages.find((x) => x.key === "readcheck").detail));
  Wt(path.join(B, "readcheck.json"), { n: 4, total: 4, totals: { WRONG: 0 }, wrongRate: 0 });
  s = state(R);
  t("make-book next, preview-only for Antidote", s.next.stage === "makeBook" && /--skip-pack --preview-only/.test(s.next.command));
  // make-book: done ONLY from make-book.done.json for this config + storyboard
  const MBM = require("./lib/make-book-marker");
  const doneMark = () => { MBM.markStarted(R, "zz-book"); MBM.markDone(R, "zz-book", { configRel: "books/zz-book/config.antidote.json", engine: "antidote", vtt: "public/captions/zz-book.vtt", audio: "public/audio/zz-book.m4a" }); touch(path.join(B, "make-book.done.json")); };
  Wt(path.join(B, "config.antidote.json"), { scenes: [] });
  Wt(path.join(B, "authorship.report.json"), { status: "PASS" });
  Wt(path.join(B, "narrative-visual-firewall.preview.report.json"), { counts: { blocks: 0, reviews: 9 } });
  Wt(path.join(B, "screen-text.report.json"), { status: "PASS" });
  s = state(R);
  t("every report PASS but no completion marker (e.g. continuity FAILed, writes no report) -> NOT done, make-book again", s.state === "CONTINUE" && s.next.stage === "makeBook" && /has not finished/.test(s.stages.find((x) => x.key === "makeBook").detail), JSON.stringify(s.stages.slice(-1)));
  t("the make-book hint names the VTT pre-flight as an operator (input) stop", /VTT pre-flight → input problem/.test(s.next.action));
  Wt(path.join(B, "narrative-visual-firewall.preview.report.json"), { counts: { blocks: 2, reviews: 9 } });
  s = state(R);
  t("firewall BLOCK -> fix the storyboard (agent's job, not operator)", s.state === "CONTINUE" && s.next.stage === "makeBook" && /firewall 2 BLOCK/.test(s.next.why));
  Wt(path.join(B, "narrative-visual-firewall.preview.report.json"), { counts: { blocks: 0, reviews: 9 } });
  doneMark();
  t("completion marker for this config and these inputs -> seal the verdict sample (renders nothing)", /--label=final --seal/.test(state(R).next.command || ""), JSON.stringify(state(R).stages.slice(-2)));
  // the marker stands only for the inputs it was written on
  const keep = (p) => fs.readFileSync(p);
  const vttP = path.join(R, "public", "captions", "zz-book.vtt"), audP = path.join(R, "public", "audio", "zz-book.m4a"), cfgP = path.join(B, "config.antidote.json");
  for (const [what, p, change] of [["the VTT", vttP, (b) => Buffer.concat([b, Buffer.from("\n00:00:02.000 --> 00:00:03.000\nMore\n")])],
    ["the audio", audP, (b) => Buffer.concat([b, Buffer.alloc(10)])], ["the config", cfgP, () => Buffer.from(JSON.stringify({ scenes: ["x"] }))]]) {
    const orig = keep(p); fs.writeFileSync(p, change(orig));
    s = state(R);
    t(`${what} changed after make-book finished -> make-book again (stage not skipped)`, s.next.stage === "makeBook" && /changed/.test(s.stages.find((x) => x.key === "makeBook").detail), JSON.stringify(s.stages.find((x) => x.key === "makeBook")));
    fs.writeFileSync(p, orig);
  }
  t("inputs restored -> done again", /--label=final --seal/.test(state(R).next.command || ""));
  MBM.markStarted(R, "zz-book");
  s = state(R);
  t("a make-book that started after the success and did not finish ('running') -> NOT done; the old success does not count", s.next.stage === "makeBook" && /did not finish/.test(s.stages.find((x) => x.key === "makeBook").detail), JSON.stringify(s.stages.find((x) => x.key === "makeBook")));
  Wt(path.join(B, "mute-test.json"), { runs: [{ label: "x", date: new Date(clock * 1000 + 50000).toISOString(), n: 30, totals: { WRONG: 0, NONE: 0 } }] });
  t("…and the legacy rule (a mute run on this config) never overrides a 'running' marker", state(R).next.stage === "makeBook");
  fs.rmSync(path.join(B, "mute-test.json"));
  doneMark();
  // Vox-like: the authorship report older than a later config rewrite is not a failure when make-book finished
  touch(path.join(B, "config.antidote.json")); doneMark();
  t("a config rewritten after the authorship gate (Vox Flux / plan-meta) is still done when make-book finished", /--label=final --seal/.test(state(R).next.command || ""));

  // ── sealed holdout, verdict sub-steps ─────────────────────────────────────
  const F = path.join(MD, "final");
  Wt(path.join(F, "sample.json"), [{ id: "scene-1" }]); Wt(path.join(F, "seal.json"), { ids: ["scene-1"] }); Wt(path.join(F, "sample-meta.json"), { framesFrom: null });
  t("sealed, not rendered -> verdict prep (no --seal)", /--label=final$/.test(state(R).next.command || ""));
  Wt(path.join(F, "key.json"), {});
  t("rendered -> blind describer", /PROMPTS.md §1/.test(state(R).next.action));
  Wt(path.join(F, "blind.json"), []);
  t("described -> judge (wrong-images stop names a NEW describer)", /mute-test.js judge/.test(state(R).next.command || "") && /NEW fresh describer/.test(state(R).next.action));
  Wt(path.join(F, "judge-input.json"), []);
  t("judge input -> judge agent", /§3/.test(state(R).next.action));
  Wt(path.join(F, "judge-result.json"), {});
  t("judged -> tally (exit 0 on FAIL warned)", /tally/.test(state(R).next.command || "") && /PASS AND FAIL/.test(state(R).next.action));
  const runRow = (label, WRONG, NONE, extra = {}) => { clock += 10; return { label, date: new Date(clock * 1000).toISOString(), n: 30, totals: { CORRECT: 30 - WRONG - NONE, NEUTRAL: 0, WRONG, ADDS: 18, NONE, EXPLAINS: 4 }, sample: "fresh", ...extra }; };
  Wt(path.join(F, "totals.json"), {});
  Wt(path.join(B, "mute-test.json"), { runs: [runRow("final", 3, 2)] });
  s = state(R);
  t("final FAIL -> never READY; cause-ledger first", s.state === "CONTINUE" && s.next.stage === "fixRound" && /cause-ledger/.test(s.next.command) && /FAIL/.test(s.stages.find((x) => x.key === "mute").detail));
  const LED = path.join(R, "audit", "cause-ledger", "zz-book", "a.json");
  Wt(LED, { tally: { ENGINE: { WRONG: 2, DEAD: 1 }, VOCABULARY: { WRONG: 0, DEAD: 0 }, AUTHORING: { WRONG: 0, DEAD: 0 }, RATER: { WRONG: 1, DEAD: 0 } } });
  s = state(R);
  t("every failure ENGINE/VOCABULARY/RATER, film unchanged -> OPERATOR ENGINE_LIMIT (no endless fix round)", s.operator && s.operator.code === "ENGINE_LIMIT" && /AUTHORING 0/.test(s.operator.evidence.join()), JSON.stringify(s.operator));
  Wt(LED, { tally: { ENGINE: { WRONG: 1, DEAD: 0 }, AUTHORING: { WRONG: 2, DEAD: 1 } } });
  s = state(R);
  t("authoring failures, unchanged film -> a fix round, never a new holdout", s.next.stage === "fixRound" && /Fix round 1/.test(s.next.action) && /never draw a new holdout/.test(s.next.why));
  book.engineCheck = { fit: "antidote", confidence: "strong", reasons: [], risks: [], confirmed: true };
  W(path.join(B, "book.json"), book); fs.utimesSync(path.join(B, "book.json"), clock - 500000, clock - 500000);
  t("engine already confirmed by the operator -> every prep carries --confirm-engine", /prep --slug=zz-book --confirm-engine/.test(state(R).next.command || ""), state(R).next.command);
  Wt(path.join(B, "art.json"), { beats: [1] });
  t("storyboard changed -> re-read the changed beats before make-book", state(R).next.stage === "readcheck");
  touch(path.join(B, "readcheck.json"));
  t("re-read done -> make-book (the old marker is for the old storyboard)", state(R).next.stage === "makeBook");
  Wt(path.join(B, "config.antidote.json"), { scenes: [1] }); doneMark();
  s = state(R);
  t("film changed + make-book finished -> a FRESH holdout run2 (no --frames-from)", /--label=run2$/.test(s.next.command || "") && s.fixRounds.used === 0, JSON.stringify(s.next));
  // a reused-frames PASS is never READY; a diagnostic (--vs / --frames-from) is not an attempt
  W(path.join(MD, "diag", "sample.json"), []); W(path.join(MD, "diag", "totals.json"), {}); W(path.join(MD, "diag", "sample-meta.json"), { framesFrom: "final" });
  Wt(path.join(B, "mute-test.json"), { runs: [runRow("final", 3, 2), runRow("diag", 0, 0, { sample: "reused", vs: "final" })] });
  s = state(R);
  t("a PASS on reused frames after a fresh FAIL -> not READY, and not a round", s.state !== "READY_CHECK" && s.fixRounds.used === 0, JSON.stringify(s.fixRounds));
  W(path.join(MD, "run2", "sample.json"), []); W(path.join(MD, "run2", "totals.json"), {});
  Wt(path.join(B, "mute-test.json"), { runs: [runRow("final", 3, 2), runRow("run2", 0, 0, { sample: "reused" })] });
  s = state(R);
  t("a holdout that had to reuse frames (short book, PASS) -> not READY: OPERATOR HOLDOUT_EXHAUSTED", s.state === "OPERATOR" && s.operator.code === "HOLDOUT_EXHAUSTED", JSON.stringify(s.operator));
  Wt(path.join(B, "mute-test.json"), { runs: [runRow("final", 3, 2), runRow("run2", 1, 5)] });
  s = state(R);
  t("fresh PASS (WRONG 1/30, dead 5/30 — the bars) on the current film -> READY_CHECK, READY only from preview-ready", s.state === "READY_CHECK" && /preview-ready/.test(s.next.command), JSON.stringify(s.stages.slice(-1)));
  Wt(path.join(B, "art.json"), { beats: [2] }); touch(path.join(B, "readcheck.json"));
  Wt(path.join(B, "config.antidote.json"), { scenes: [2] }); doneMark();
  s = state(R);
  t("the film changed after the PASS -> not READY: a fresh holdout of the current film", s.state === "CONTINUE" && /--label=run3$/.test(s.next.command || "") && s.stages.find((x) => x.key === "mute").status === "stale", JSON.stringify(s.next));
  Wt(path.join(B, "mute-test.json"), { runs: [runRow("final", 3, 2), runRow("run2", 2, 0), runRow("run3", 0, 6, { sample: "reused" })] });
  s = state(R);
  t("a reused-sample attempt counts as a round: 2 rounds, still no fresh PASS -> OPERATOR FIX_ROUNDS_EXHAUSTED", s.state === "OPERATOR" && s.operator.code === "FIX_ROUNDS_EXHAUSTED" && s.operator.evidence.length === 3 && /reused frames: not a verdict/.test(s.operator.evidence[2]), JSON.stringify(s.operator));
  // runs of an earlier production (before this book's pin) are not this film's verdicts
  Wt(path.join(B, "production-base.json"), { productionBase: "x", at: new Date(clock * 1000 + 30000).toISOString() });
  s = state(R);
  t("runs before the production pin are out of scope -> the open sealed label / a new holdout, not EXHAUSTED", s.state === "CONTINUE" && s.next.stage === "mute", JSON.stringify(s.next));
  fs.rmSync(path.join(B, "production-base.json"));

  // ── transient retry budget ────────────────────────────────────────────────
  Wt(path.join(B, "mute-test.json"), { runs: [runRow("final", 3, 2)] });
  fs.rmSync(path.join(MD, "run2"), { recursive: true, force: true });
  W(path.join(MD, "run2", "sample.json"), [{ id: "scene-2" }]); W(path.join(MD, "run2", "sample-meta.json"), { framesFrom: null });
  s = state(R);
  t("a sample without key.json -> re-run the same prep (failed render)", /--label=run2$/.test(s.next.command || "") && /failed render/.test(s.next.why), JSON.stringify(s.next));
  const note = (r, msg) => run(R, "note", "--slug=zz-book", "--step=mute", `--result=${r}`, `--msg=${msg}`);
  note("transient", "Timeout rendering still"); note("transient", "Timeout rendering still");
  t("2 transient failures -> still CONTINUE (2/3 noted)", state(R).state === "CONTINUE" && state(R).next.transientFailures === 2);
  note("transient", "Timeout rendering still");
  s = state(R);
  t("3rd transient failure of the same step -> OPERATOR TECHNICAL_RETRY_LIMIT with evidence", s.operator && s.operator.code === "TECHNICAL_RETRY_LIMIT" && s.operator.evidence.length === 3);
  note("ok", "rendered");
  t("a success resets the budget", state(R).state === "CONTINUE");
  Wt(path.join(SB, "authored-2.bak.json"), [{ i: 3, stageRelationship: true, relationship: { stale: 1 } }]);
  t("a stray authored-2.bak.json is not read (merge and gate-b do not read it)", state(R).stages.find((x) => x.key === "gateB").status === "done");
  fs.rmSync(path.join(SB, "authored-2.bak.json"));

  // ── read-only, legacy, candidates ─────────────────────────────────────────
  const before = fp(); state(R); run(R, "candidates"); const after = fp();
  t("status and candidates write nothing", before === after);
  fs.rmSync(path.join(SB, "own-icons.naming.json"));
  t("legacy: no naming record but authors already ran -> not sent back", state(R).stages.find((x) => x.key === "ownIcons").status === "done");
  fs.rmSync(path.join(B, "readcheck.json"));
  t("legacy: no readcheck but already planned -> n/a, not sent back", state(R).stages.find((x) => x.key === "readcheck").status === "n/a");
  W(path.join(R, "books", "zz-other", "book.json"), { engine: "antidote", engineProfile: { kind: "x" } });
  W(path.join(R, "public", "audio", "zz-other.m4a"), Buffer.alloc(200 * 1024)); W(path.join(R, "public", "captions", "zz-other.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n");
  let c = JSON.parse(run(R, "candidates", "--json").stdout);
  t("two workable books -> no unique pick (ask only if the conversation does not say)", c.pick === null && c.candidates.length === 2, JSON.stringify(c));
  W(path.join(R, "AGENT_LOG.md"), "## Active WIP\n| agent | area | status | notes |\n|---|---|---|---|\n| preview-zz-book | `books/zz-book/` | in progress | |\n");
  c = JSON.parse(run(R, "candidates", "--json").stdout);
  t("a book claimed by an open WIP row is not auto-picked -> the other is unique", c.pick === "zz-other" && c.candidates.find((x) => x.slug === "zz-book").claimed === "preview-zz-book", JSON.stringify(c));
  W(path.join(R, "AGENT_LOG.md"), "## Active WIP\n| agent | area | status | notes |\n|---|---|---|---|\n| prod-x | wt-book-zz-book | in progress | role: production · base: 1234 |\n| _(done)_ preview-zz-other | `books/zz-other/` | ✅ done | |\n");
  c = JSON.parse(run(R, "candidates", "--json").stdout);
  t("a claim written any way (wt-book-<slug>) still counts; a done row does not", c.pick === "zz-other" && c.candidates.find((x) => x.slug === "zz-book").claimed === "prod-x" && !c.candidates.find((x) => x.slug === "zz-other").claimed, JSON.stringify(c));

  // ── engine pin (git) ──────────────────────────────────────────────────────
  const G = path.join(tmp, "repo");
  fs.mkdirSync(G);
  const g = (...a) => execFileSync("git", a, { cwd: G, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
  W(path.join(G, "scripts", "lib", "x.js"), "1"); W(path.join(G, ".gitignore"), "books/\npublic/\naudit/\n");
  g("add", "."); g("commit", "-qm", "a");
  fs.cpSync(path.join(R, "books", "zz-book"), path.join(G, "books", "zz-book"), { recursive: true });
  fs.cpSync(path.join(R, "public"), path.join(G, "public"), { recursive: true });
  for (const f of ["production-base.json"]) fs.rmSync(path.join(G, "books", "zz-book", f), { force: true });
  s = state(G);
  t("main checkout, book already started there, not pinned -> pin it (legacy, keep it there)", s.next.stage === "code" && /preview-state.js pin/.test(s.next.command), JSON.stringify(s.next));
  fs.rmSync(path.join(G, "books", "zz-book", "story-bible.json")); fs.rmSync(path.join(G, "books", "zz-book", "storyboard"), { recursive: true });
  s = state(G);
  t("main checkout, new book -> create its own production worktree", s.next.stage === "code" && /preview-state.js worktree/.test(s.next.command));
  const p1 = run(G, "pin", "--slug=zz-book");
  const pinned = JSON.parse(fs.readFileSync(path.join(G, "books", "zz-book", "production-base.json"), "utf8"));
  t("pin writes production-base.json at HEAD", p1.status === 0 && pinned.productionBase === g("rev-parse", "HEAD"));
  W(path.join(G, "scripts", "lib", "x.js"), "2");
  s = state(G);
  t("dirty code in the MAIN checkout -> OPERATOR OWNERSHIP (never stash/reset)", s.operator && s.operator.code === "OWNERSHIP" && /scripts\/lib\/x.js/.test(s.operator.evidence.join()));
  W(path.join(G, "scripts", "lib", "x.js"), "1");
  W(path.join(G, "data", "icon-readings.json"), "{}"); g("add", "data/icon-readings.json"); g("commit", "-qm", "icon reading");
  s = state(G);
  t("a commit of data/icon-readings.json only (contract: commit it by itself) is not an engine move", !s.operator && s.stages.find((x) => x.key === "code").status === "done", JSON.stringify(s.operator));
  W(path.join(G, "scripts", "lib", "x.js"), "2");
  g("commit", "-qam", "b");
  s = state(G);
  t("HEAD moved to new ENGINE code after the pin -> OPERATOR CODE_MOVED", s.operator && s.operator.code === "CODE_MOVED");
  t("pin refuses to move a pinned book", run(G, "pin", "--slug=zz-book").status === 1);
  // ── the production worktree and the main node_modules (the REAL `worktree` / `unlink` commands) ─────────────
  const O = path.join(tmp, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", O]);
  g("remote", "add", "origin", O); g("push", "-q", "origin", "HEAD:god-mode");
  const SENT = path.join(G, "node_modules", "pkg", "SENTINEL");
  W(SENT, "keep"); fs.mkdirSync(path.join(G, "node_modules", ".bin"), { recursive: true });
  fs.rmSync(path.join(G, "books", "zz-book", "production-base.json"), { force: true });
  const mk = run(G, "worktree", "--slug=zz-book");
  const WT = path.join(tmp, "wt-book-zz-book");
  const locked = () => /locked/.test(g("worktree", "list", "--porcelain").split(/\n\n/).find((b) => b.includes("wt-book-zz-book")) || "");
  t("worktree: created detached at origin/god-mode, node_modules is a junction to main's, LOCKED", mk.status === 0 && fs.lstatSync(path.join(WT, "node_modules")).isSymbolicLink() && locked(), mk.stdout + mk.stderr);
  s = state(WT);
  t("status in the production worktree: code done, link and lock checked", s.stages.find((x) => x.key === "code").status === "done" && /node_modules → main, locked/.test(s.stages.find((x) => x.key === "code").detail), JSON.stringify(s.stages.find((x) => x.key === "code")));
  const rmForce = spawnSync("git", ["worktree", "remove", "--force", WT], { cwd: G, encoding: "utf8" });
  t("`git worktree remove --force` on the locked worktree is REFUSED; the main node_modules is untouched", rmForce.status !== 0 && /locked/.test(rmForce.stderr) && fs.existsSync(SENT) && fs.existsSync(WT), rmForce.stderr);
  fs.rmdirSync(path.join(WT, "node_modules"));
  s = state(WT);
  t("link removed -> status asks to recreate it (no operator)", s.state === "CONTINUE" && s.next.stage === "code" && /recreate/i.test(s.next.action) && fs.existsSync(SENT));
  t("re-run `worktree` -> the link is recreated, still locked", run(G, "worktree", "--slug=zz-book").status === 0 && fs.lstatSync(path.join(WT, "node_modules")).isSymbolicLink() && locked() && state(WT).stages.find((x) => x.key === "code").status === "done");
  fs.renameSync(path.join(G, "node_modules"), path.join(G, "node_modules_moved"));
  s = state(WT);
  t("main node_modules gone -> OPERATOR NODE_MODULES_BROKEN (never npm install over it)", s.operator && s.operator.code === "NODE_MODULES_BROKEN", JSON.stringify(s.operator));
  fs.renameSync(path.join(G, "node_modules_moved"), path.join(G, "node_modules"));
  g("worktree", "unlock", WT);
  s = state(WT);
  t("unlocked production worktree -> status asks to lock it again", s.next && s.next.stage === "code" && /Lock/.test(s.next.action));
  run(G, "worktree", "--slug=zz-book");
  t("re-run `worktree` -> locked again", locked());
  W(path.join(WT, "scripts", "lib", "x.js"), "3");
  t("dirty code in the book's own worktree -> OPERATOR CODE_DIRTY", state(WT).operator.code === "CODE_DIRTY");
  W(path.join(WT, "scripts", "lib", "x.js"), "2");
  s = state(G);
  t("from another checkout: the book's production worktree is found -> continue there", s.next && s.next.stage === "code" && s.stages.find((x) => x.key === "code").status === "elsewhere", JSON.stringify(s.stages.find((x) => x.key === "code")));
  const ul = run(G, "unlink", "--slug=zz-book");
  t("unlink: the junction alone is removed (main node_modules untouched) and the worktree unlocked", ul.status === 0 && !fs.existsSync(path.join(WT, "node_modules")) && fs.existsSync(SENT) && !locked(), ul.stdout + ul.stderr);
  const rm2 = spawnSync("git", ["worktree", "remove", "--force", WT], { cwd: G, encoding: "utf8" });
  t("after unlink, the operator's `git worktree remove --force` removes the worktree and the main node_modules survives", rm2.status === 0 && !fs.existsSync(WT) && fs.existsSync(SENT), rm2.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall preview-state checks passed");
process.exit(failed ? 1 : 0);
