#!/usr/bin/env node
// operator-approvals (2026-11-03): the operator's approval of ROUTINE work is recorded once per book + attempt and read
// back by preview-state / storyboard prep, so a new session does not ask again (Hamnet: a 3rd fix round, 11 Vox
// images and "keep Vox" were approved in chat and asked again by every session). Fixture books in a temp root; nothing
// under books/ is touched. Checks: the writer (scopes, refused scopes, words, limits, the stored attempt), the fix-round
// limit (EXHAUSTED -> CONTINUE -> EXHAUSTED at the approved total, and again when the pin moves), the status listing,
// ENGINE_CONTRADICTION, the Vox --images-only command and its call budget, storyboard prep keeping the engine
// confirmed, and render-decision / render-preflight ignoring the file.
// Run: node scripts/test-operator-approvals.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 600)})` : ""}`); if (!ok) failed++; };
const PS = path.join(__dirname, "preview-state.js");
const env = { ...process.env, PRODUCTION_GUARD: "off" };
const run = (root, ...a) => spawnSync(process.execPath, [PS, ...a, `--root=${root}`], { encoding: "utf8", env });
const state = (root, slug = "zz-book") => JSON.parse(run(root, "status", `--slug=${slug}`, "--json").stdout);
const human = (root, slug = "zz-book") => run(root, "status", `--slug=${slug}`).stdout;
const approve = (root, slug, scope, limits, words) => run(root, "approve", `--slug=${slug}`, `--scope=${scope}`, `--limits=${typeof limits === "string" ? limits : JSON.stringify(limits)}`, `--words=${words}`);
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" || Buffer.isBuffer(v) ? v : JSON.stringify(v, null, 1)); };
let clock = Date.now() / 1000 - 100000;
const touch = (p) => { clock += 10; fs.utimesSync(p, clock, clock); };
const Wt = (p, v) => { W(p, v); touch(p); };
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "operator-approvals-"));
const R = path.join(tmp, "root"), SLUG = "zz-book", B = path.join(R, "books", SLUG), SB = path.join(B, "storyboard"), MD = path.join(R, "audit", "mute", SLUG);
const APPR = path.join(B, "operator-approvals.json");
const WORDS = "evet üçüncü fix round'a izin veriyorum devam et";

try {
  // ── a Vox fixture book, walked to its mute runs (Vox: no own icons, Gate B or readcheck) ─────────────────────────
  W(path.join(R, "PUBLISHED_BOOKS.md"), "| # | slug | book | date |\n|---|---|---|---|\n");
  Wt(path.join(R, "public", "audio", `${SLUG}.m4a`), Buffer.alloc(200 * 1024));
  Wt(path.join(R, "public", "captions", `${SLUG}.vtt`), "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n");
  const book = { slug: SLUG, title: "Z", author: "A", genre: "fiction", engine: "vox", engineProfile: { kind: "fiction" },
    engineCheck: { fit: "antidote", confidence: "strong", reasons: ["invented world"], risks: [], confirmed: false } };
  Wt(path.join(B, "book.json"), book);
  Wt(path.join(B, "production-base.json"), { productionBase: "a".repeat(40), at: new Date((clock - 50000) * 1000).toISOString(), worktree: "wt-book-zz-book" });

  // ── the writer ──────────────────────────────────────────────────────────────
  let s = state(R);
  t("baseline: a strong unconfirmed contradiction -> OPERATOR ENGINE_CONTRADICTION, and it says how to record the keep", s.operator && s.operator.code === "ENGINE_CONTRADICTION" && /preview-state\.js approve --slug=zz-book --scope=engineKeep/.test(s.operator.reason), JSON.stringify(s.operator));
  for (const scope of ["render", "quality-debt", "upload", "publish", "cleanup", "qualityDebt"]) {
    const r = approve(R, SLUG, scope, { max: 3 }, WORDS);
    t(`scope '${scope}' refused (exit 1, nothing written)`, r.status === 1 && /never recorded here/.test(r.stderr) && !fs.existsSync(APPR), r.stderr);
  }
  let r = approve(R, SLUG, "fixRounds", { max: 3 }, "   ");
  t("empty words refused (the operator's own words, verbatim)", r.status === 1 && /not empty/.test(r.stderr) && !fs.existsSync(APPR), r.stderr);
  t("short verbatim words are enough (\"Antidote kalsın\")", require("./lib/operator-approvals").MIN_WORDS === 1);
  r = approve(R, SLUG, "fixRounds", { rounds: 3 }, WORDS);
  t("fixRounds without limits.max refused", r.status === 1 && /limits \{"max"/.test(r.stderr), r.stderr);
  r = approve(R, SLUG, "images", { beats: [], maxCalls: 3 }, WORDS);
  t("images without beats refused", r.status === 1 && !fs.existsSync(APPR), r.stderr);
  r = approve(R, SLUG, "fixRounds", "{not json", WORDS);
  t("--limits that is not JSON refused", r.status === 1 && /not valid JSON/.test(r.stderr));
  r = approve(R, SLUG, "engineKeep", { conditions: "keep Vox: the audio was recorded for it" }, "Vox kalsın, ses Vox için kaydedildi zaten");
  const rec1 = read(APPR);
  t("engineKeep recorded: prints the stored record; attempt = engine, pin, audio + VTT sha256", r.status === 0 && /appr-1/.test(r.stdout) && rec1 && rec1.approvals.length === 1 &&
    rec1.approvals[0].attempt.engine === "vox" && rec1.approvals[0].attempt.productionBase === "a".repeat(40) && /^[0-9a-f]{64}$/.test(rec1.approvals[0].attempt.audioSha256) && /^[0-9a-f]{64}$/.test(rec1.approvals[0].attempt.vttSha256) && Array.isArray(rec1.approvals[0].used), r.stdout + r.stderr);
  s = state(R);
  t("a matching engineKeep approval suppresses ENGINE_CONTRADICTION (the book moves on)", s.state === "CONTINUE" && s.next.stage === "bible" && /kept: operator approval appr-1/.test(s.stages[0].detail), JSON.stringify(s.operator || s.next));
  t("status lists the matching approval (id, scope, limits, the words)", /operator approvals \(books\/zz-book\/operator-approvals\.json\)/.test(human(R)) && /✓ appr-1 engineKeep · conditions: keep Vox/.test(human(R)) && /"Vox kalsın/.test(human(R)), human(R));

  // ── walk to make-book ───────────────────────────────────────────────────────
  Wt(path.join(B, "story-bible.json"), { authored: true, cast: { mara: { look: "x" } } });
  Wt(path.join(SB, "vocab.json"), {}); Wt(path.join(SB, "PROMPTS.md"), "### Author 1 (beats 0-1)\n");
  Wt(path.join(SB, "chunk-1.json"), { beats: [{ i: 0 }, { i: 1 }] });
  Wt(path.join(SB, "authored-1.json"), [{ i: 0 }, { i: 1 }]);
  Wt(path.join(B, "designs.json"), { beats: [] });
  Wt(path.join(B, "config.vox.json"), { scenes: [] });
  Wt(path.join(B, "authorship.report.json"), { status: "PASS" });
  s = state(R);
  t("fixture reaches make-book (normal command, no --images-only)", s.next.stage === "makeBook" && !/--images-only/.test(s.next.command), JSON.stringify(s.next));
  r = approve(R, SLUG, "images", { beats: ["beat-012", "beat-019"], maxCalls: 12 }, "bu iki görsel için en fazla 12 çağrı yap");
  s = state(R);
  t("Vox images approval -> make-book --images-only --image-beats=<beats> --image-max-calls=<remaining>", r.status === 0 && s.next.stage === "makeBook" && /--images-only --image-beats=beat-012,beat-019 --image-max-calls=12/.test(s.next.command) && /approval-use --slug=zz-book --id=appr-2/.test(s.next.command), JSON.stringify(s.next));
  r = run(R, "approval-use", `--slug=${SLUG}`, "--id=appr-2", "--n=5", "--msg=2 beats, 5 calls");
  s = state(R);
  t("after the recorded use (5 calls) -> the normal make-book; status shows used 5/12, left 7", r.status === 0 && s.next.stage === "makeBook" && !/--images-only/.test(s.next.command) && /calls used 5\/12, left 7/.test(human(R)), r.stdout + r.stderr + JSON.stringify(s.next));
  t("approval-use of an unknown id refused", run(R, "approval-use", `--slug=${SLUG}`, "--id=appr-99", "--n=1").status === 1);
  const MBM = require("./lib/make-book-marker");
  MBM.markStarted(R, SLUG); MBM.markDone(R, SLUG, { configRel: `books/${SLUG}/config.vox.json`, engine: "vox", vtt: `public/captions/${SLUG}.vtt`, audio: `public/audio/${SLUG}.m4a` }); touch(path.join(B, "make-book.done.json"));

  // ── mute runs: 3 fresh FAILs = 2 fix rounds used ───────────────────────────
  const runRow = (label, WRONG, NONE) => { clock += 10; return { label, date: new Date(clock * 1000).toISOString(), n: 30, totals: { CORRECT: 30 - WRONG - NONE, WRONG, ADDS: 18, NONE, EXPLAINS: 4 }, sample: "fresh" }; };
  const label = (l, sealed) => { W(path.join(MD, l, "sample.json"), []); W(path.join(MD, l, "totals.json"), {}); if (sealed) W(path.join(MD, l, "seal.json"), {}); };
  label("final", true); label("run2"); label("run3");
  const rows = [runRow("final", 3, 2), runRow("run2", 3, 2), runRow("run3", 2, 2)];
  Wt(path.join(B, "mute-test.json"), { runs: rows });
  s = state(R);
  t("2 fix rounds used, no approval -> OPERATOR FIX_ROUNDS_EXHAUSTED (limit 2)", s.state === "OPERATOR" && s.operator.code === "FIX_ROUNDS_EXHAUSTED" && /limit 2\)/.test(s.operator.reason), JSON.stringify(s.operator));
  r = approve(R, SLUG, "fixRounds", { max: 3 }, WORDS);
  s = state(R);
  t("fixRounds max 3 -> CONTINUE (a 3rd fix round), limit 3", r.status === 0 && s.state === "CONTINUE" && s.next.stage === "fixRound" && s.fixRounds.max === 3 && s.fixRounds.approval === "appr-3", JSON.stringify(s.next) + JSON.stringify(s.operator));
  t("status prints 'fix rounds used 2/3 (operator approval appr-3)' and the approval with rounds 2/3", /fix rounds used 2\/3 \(operator approval appr-3\)/.test(human(R)) && /✓ appr-3 fixRounds · rounds 2\/3 · "evet üçüncü/.test(human(R)), human(R));
  label("run4"); rows.push(runRow("run4", 2, 1));
  Wt(path.join(B, "mute-test.json"), { runs: rows });
  s = state(R);
  t("round 3 used, still no fresh PASS -> OPERATOR FIX_ROUNDS_EXHAUSTED (limit 3, operator approval appr-3)", s.state === "OPERATOR" && s.operator.code === "FIX_ROUNDS_EXHAUSTED" && /limit 3, operator approval appr-3/.test(s.operator.reason), JSON.stringify(s.operator));
  rows.pop(); fs.rmSync(path.join(MD, "run4"), { recursive: true });
  Wt(path.join(B, "mute-test.json"), { runs: rows });
  t("back at 2 rounds -> CONTINUE again", state(R).state === "CONTINUE");
  const pin = read(path.join(B, "production-base.json"));
  W(path.join(B, "production-base.json"), { ...pin, productionBase: "b".repeat(40) });
  s = state(R);
  t("the pin moved -> the fix-round approvals stop matching, the engine keep does not (engine + audio + VTT unchanged): no ENGINE_CONTRADICTION",
    !(s.operator && s.operator.code === "ENGINE_CONTRADICTION") && s.approvals.matches.length === 1 && s.approvals.matches[0].scope === "engineKeep" && s.approvals.stale.length === 2, JSON.stringify({ op: s.operator, m: s.approvals.matches.map((a) => a.scope) }));
  t("status says which approvals no longer match and why (pin changed)", /✗ appr-3 fixRounds no longer matches: pin changed \(aaaaaaaa → bbbbbbbb\)/.test(human(R)), human(R));
  book.engineCheck.confirmed = true; W(path.join(B, "book.json"), book); fs.utimesSync(path.join(B, "book.json"), clock - 500000, clock - 500000);
  s = state(R);
  t("…with the engine confirmed otherwise, the moved pin leaves the fix-round limit at 2 -> FIX_ROUNDS_EXHAUSTED", s.state === "OPERATOR" && s.operator.code === "FIX_ROUNDS_EXHAUSTED" && /limit 2\)/.test(s.operator.reason), JSON.stringify(s.operator));
  W(path.join(B, "production-base.json"), pin);
  const vttP = path.join(R, "public", "captions", `${SLUG}.vtt`), vttOrig = fs.readFileSync(vttP);
  fs.writeFileSync(vttP, Buffer.concat([vttOrig, Buffer.from("\n00:00:01.000 --> 00:00:02.000\nMore\n")]));
  s = state(R);
  t("a new VTT -> the approval no longer matches (VTT changed)", s.approvals.stale.some((a) => a.id === "appr-3" && a.why.some((w) => /^VTT changed/.test(w))) && !s.approvals.matches.length, JSON.stringify(s.approvals.stale.map((a) => a.why)));
  fs.writeFileSync(vttP, vttOrig);
  t("the file is append-only: 3 records, ids in order, the first words unchanged", read(APPR).approvals.map((a) => a.id).join() === "appr-1,appr-2,appr-3" && read(APPR).approvals[0].words === "Vox kalsın, ses Vox için kaydedildi zaten");

  // ── the brief's CLI spellings, a recorded 4, and records that belong to another book ─────────────────────────
  r = run(R, "approve", `--slug=${SLUG}`, "--scope=fix-rounds", "--limit=4", "--reason=tamam dört fix round'a kadar devam edebilirsin");
  const rec4 = read(APPR).approvals.slice(-1)[0];
  t("aliases: --scope=fix-rounds --limit=4 --reason= -> fixRounds {max:4}, with book + by", r.status === 0 && rec4.scope === "fixRounds" && rec4.limits.max === 4 && rec4.book === SLUG && typeof rec4.by === "string" && rec4.words.startsWith("tamam"), r.stdout + r.stderr);
  for (const scope of ["production-render", "final_render", "clean-up", "purge"]) t(`alias-style scope '${scope}' refused too`, approve(R, SLUG, scope, {}, WORDS).status === 1);
  r = run(R, "approve", `--slug=${SLUG}`, "--scope=engine-confirm", "--reason=Vox kalsın, motoru değiştirme lütfen kesinlikle");
  t("--scope=engine-confirm without --limits records engineKeep with the words as conditions", r.status === 0 && read(APPR).approvals.slice(-1)[0].scope === "engineKeep", r.stderr);
  s = state(R);
  t("recorded 4, 2 rounds used -> CONTINUE, limit 4", s.state === "CONTINUE" && s.fixRounds.max === 4, JSON.stringify(s.operator || s.next));
  label("run4"); label("run5"); rows.push(runRow("run4", 2, 1), runRow("run5", 2, 1));
  Wt(path.join(B, "mute-test.json"), { runs: rows });
  s = state(R);
  t("recorded 4, 4 rounds used (a 5th would be next) -> OPERATOR FIX_ROUNDS_EXHAUSTED (limit 4)", s.state === "OPERATOR" && s.operator.code === "FIX_ROUNDS_EXHAUSTED" && /limit 4, operator approval appr-4/.test(s.operator.reason), JSON.stringify(s.operator));
  const O = "zz-other", OB = path.join(R, "books", O);
  W(path.join(OB, "book.json"), { ...book, slug: O }); W(path.join(OB, "operator-approvals.json"), read(APPR));
  t("another book's records (copied file) never match", require("./lib/operator-approvals").matching(R, O).matches.length === 0);
  rows.splice(3); fs.rmSync(path.join(MD, "run4"), { recursive: true }); fs.rmSync(path.join(MD, "run5"), { recursive: true });
  Wt(path.join(B, "mute-test.json"), { runs: rows });

  // ── storyboard prep keeps engineCheck.confirmed with a matching engineKeep ─
  const P = "zz-prep", PB = path.join(R, "books", P);
  W(path.join(R, "public", "captions", `${P}.vtt`), "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nThe king rode to war and the city burned.\n");
  W(path.join(R, "public", "audio", `${P}.m4a`), Buffer.alloc(200 * 1024));
  W(path.join(PB, "book.json"), { slug: P, title: "P", author: "A", genre: "fiction", engine: "vox", engineProfile: { kind: "fiction" }, engineCheck: { fit: "vox", confidence: "weak", confirmed: true } });
  W(path.join(PB, "story-bible.json"), { authored: true, cast: {} });
  const prep = () => spawnSync(process.execPath, [path.join(__dirname, "storyboard.js"), "prep", `--slug=${P}`, `--root=${R}`], { encoding: "utf8", env, timeout: 120000 });
  let p = prep();
  t("without an approval, prep (no --confirm-engine) resets engineCheck.confirmed to false", read(path.join(PB, "book.json")).engineCheck.confirmed === false, p.stdout + p.stderr);
  t("…and a stop names the approval record, not a bare 'Ask the operator'", !/Ask the operator/.test(p.stderr) || /preview-state\.js approve --slug=zz-prep --scope=engineKeep/.test(p.stderr), p.stderr);
  r = approve(R, P, "engineKeep", { conditions: "keep Vox" }, "Vox ile devam et, motor değişmeyecek kesin");
  p = prep();
  const ec = read(path.join(PB, "book.json")).engineCheck;
  t("with a matching engineKeep approval, prep keeps engineCheck.confirmed true (confirmedBy the record)", r.status === 0 && ec.confirmed === true && ec.confirmedBy === "appr-1" && /engine kept by operator approval appr-1/.test(p.stdout) && !/Ask the operator/.test(p.stderr), p.stdout.slice(0, 800) + p.stderr.slice(0, 800));
  p = prep();
  t("…across a second prep run too", read(path.join(PB, "book.json")).engineCheck.confirmed === true);
  W(path.join(PB, "book.json"), { ...read(path.join(PB, "book.json")), engine: "antidote" });
  p = prep();
  t("another engine in book.json -> the engineKeep approval does not match, prep does not confirm", read(path.join(PB, "book.json")).engineCheck.confirmed === false, p.stdout.slice(0, 400));

  // ── render-decision / render-preflight never read the file ────────────────
  const RD = path.join(__dirname, "render-decision.js");
  const rd = () => { const x = spawnSync(process.execPath, [RD, `--slug=${SLUG}`, `--root=${R}`, "--json"], { encoding: "utf8", env }); return `${x.status}|${x.stdout}`; };
  const withFile = rd();
  const keep = fs.readFileSync(APPR); fs.rmSync(APPR);
  const without = rd();
  fs.writeFileSync(APPR, keep);
  t("render-decision: the same verdict with and without operator-approvals.json", withFile === without && withFile.length > 3, `${withFile.slice(0, 300)} vs ${without.slice(0, 300)}`);
  const src = ["render-decision.js", "lib/render-preflight.js", "render.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
  t("render-decision.js / render-preflight.js / render.js do not reference operator-approvals", !/operator-approvals/.test(src));
  const NS = require("./lib/next-step");
  t("the routing GATES 'cost' line names the recorded-approval exception", /cost \(a new or uncertain paid use — unless status lists an operator approval that covers it\)/.test(NS.GATES));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall operator-approvals checks passed");
process.exit(failed ? 1 : 0);
