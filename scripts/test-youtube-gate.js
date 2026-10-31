#!/usr/bin/env node
// YouTube READY gate (2026-10-28) — regression fixtures under scripts/fixtures/youtube/ (read-only copies):
//   the-book-of-margery-kempe  shipped youtube.md with "TODO counter-narrative angle" titles, the fallback description,
//                              cut-off ASR chapter labels, self-help tags on a medieval classic, a rolling clean.vtt
//   farsighted (Antidote) + the-crucible (Vox): refined packs → READY with the SAME function (no engine branch)
// plus: placeholder titles, modifier swaps, insight angles (no fake counter-narrative), code-point lengths, the upload
// VTT validator + clean-vtt on the Thinking-Fast-and-Slow rolling format, the thumbnail hook pixel check.
// Run: node scripts/test-youtube-gate.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const L = require("./lib/title-lint");
const { validateUploadVtt } = require("./lib/vtt-validate");
const { hookVisibility } = require("./lib/thumb-hook-check");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const FX = path.join(__dirname, "fixtures", "youtube");
const has = (r, code) => r.errors.some((e) => e.includes(code));

// ── Margery Kempe: every shipped defect is a hard NOT_READY ─────────────────
const m = L.lintPack("the-book-of-margery-kempe", FX);
t("Margery: NOT_READY", m.status === "NOT_READY");
t("Margery: the youtube.md TODO titles → STALE_MD (placeholder)", m.errors.some((e) => /^STALE_MD: .*scaffold text \("TODO"\)/.test(e)), m.errors);
t("Margery: refined JSON titles missing from youtube.md → STALE_MD", m.errors.some((e) => /STALE_MD: 3 refined title/.test(e)));
t("Margery: needsClaudeRefine still true → NOT_REFINED", has(m, "NOT_REFINED"));
t("Margery: \"No fluff, no ending spoilers\" → SCAFFOLD_DESCRIPTION", has(m, "SCAFFOLD_DESCRIPTION"));
t("Margery: \"Sobbing Is So Loud He\" … → CHAPTER_LABELS_ARE_FRAGMENTS", m.errors.some((e) => /CHAPTER_LABELS_ARE_FRAGMENTS.*Sobbing Is So Loud He/.test(e)));
t("Margery: self-improvement tags on a classic → TAGS_WRONG_GENRE", has(m, "TAGS_WRONG_GENRE"));
t("Margery: the shipped clean.vtt repeats rolling lines → CAPTIONS ROLLING_CUES", m.errors.some((e) => /^CAPTIONS ROLLING_CUES/.test(e)));
const mdTitles = fs.readFileSync(path.join(FX, "books/the-book-of-margery-kempe/youtube.md"), "utf8").split(/\r?\n/).map((l) => l.match(/^\d\. (.*?)  _\(/)).filter(Boolean).map((x) => x[1]);
const mt = L.lintTitleSet({ titles: mdTitles, shortTitle: "The Book of Margery Kempe", author: "Margery Kempe", titleAngles: [], narration: "", corpus: [] });
t("Margery: the md's own title list → PLACEHOLDER #3 and #4 (hard fail)", mt.errors.filter((e) => e.startsWith("PLACEHOLDER #")).length === 2 && mt.status === "FAIL", mt.errors);

// ── refined packs pass, Vox and Antidote through the same function ──────────
for (const [slug, eng] of [["farsighted", "antidote"], ["the-crucible", "vox"]]) {
  const r = L.lintPack(slug, FX);
  t(`${slug} (${eng}): refined pack → READY`, r.status === "READY", r.errors);
}
t("one function for both engines (no engine branch in lintPack)", !/engine/.test(L.lintPack.toString()));

// ── title rules ─────────────────────────────────────────────────────────────
const NARR = "Old Abel kept a brass compass in the lighthouse. The compass pointed at the reef, not north, because Abel had filed the needle himself so the wreckers could find the ships. The lantern was dark on purpose.";
const base = { shortTitle: "The Lamp", author: "Ann Reed", narration: NARR, corpus: [] };
const swap = L.lintTitleSet({ ...base, titles: ["The Lamp Summary — Ann Reed", "The Lamp Review (Ann Reed)", "The Lamp Explained", "The Lamp Analysis: Key Ideas", "The Lamp by Ann Reed — Book Review"], titleAngles: [] });
t("modifier swaps: 5 titles that only swap Summary/Review/Explained → MODIFIER_SWAP", swap.errors.some((e) => e.startsWith("MODIFIER_SWAP: 5 titles")), swap.errors);
const insightAngles = [
  { kind: "insight", book: "Abel filed the compass needle so it pointed at the reef", quote: "the compass pointed at the reef" },
  { kind: "insight", book: "the lantern was kept dark on purpose for the wreckers", quote: "The lantern was dark on purpose" },
];
const ins = L.lintTitleSet({ ...base, titleAngles: insightAngles, titles: [
  "The Lamp Summary (Ann Reed) — The Compass That Pointed at the Reef",
  "The Lamp Explained: Abel's Filed Compass Needle",
  "The Lamp by Ann Reed: The Lantern Kept Dark for the Wreckers",
  "The Lamp Review — Why Abel Sent the Ships to the Reef",
  "The Lamp Analysis: Old Abel's Lighthouse",
] });
t("insight angles: grounded surprising ideas count as angles without a forced 'everyone gets it wrong'", ins.status === "PASS", ins.errors);
t("insight angle without a myth is complete; a counter angle without one is not", !ins.errors.some((e) => e.startsWith("ANGLE_INCOMPLETE")) &&
  L.lintTitleSet({ ...base, titles: [], titleAngles: [{ book: "x y", quote: "the compass pointed at the reef" }] }).errors.some((e) => e.startsWith("ANGLE_INCOMPLETE")));
const noIns = L.lintTitleSet({ ...base, titleAngles: insightAngles.map(({ kind, ...g }) => ({ ...g, myth: "" })), titles: ins.perTitle.map((r) => r.title) });
t("the same titles WITHOUT insight angles do not pass (an anchor alone is not an angle)", noIns.status === "FAIL");
const emoji = "The Lamp Summary — " + "🔦".repeat(80); // 99 code points, 179 UTF-16 units
t("length counts code points (what YouTube counts), not UTF-16 units", !L.lintTitleSet({ ...base, titles: [emoji], titleAngles: [] }).errors.some((e) => e.startsWith("TOO_LONG")));
const sens = L.lintTitleSet({ ...base, titles: ["The Lamp Explained: The SHOCKING Truth About Abel's Compass!!"], titleAngles: [] });
t("sensational wording → SENSATIONAL warning (author checks the claim)", sens.warnings.some((w) => w.startsWith("SENSATIONAL")));
for (const s of ["The Lamp Explained — TODO counter-narrative angle 1 (lint-titles.js)", "The Lamp: [Insert Hook Here]", "The Lamp — {{angle}}", "The Lamp TBD"])
  t(`placeholder caught: "${s}"`, !!L.placeholderIn(s));
t("no placeholder in a real title", !L.placeholderIn("The Lamp Explained: Abel's Filed Compass Needle"));

// ── pack checks on a temp copy (hook visibility, stale thumbnail, chapters, md) ─
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yt-gate-"));
try {
  fs.cpSync(FX, tmp, { recursive: true });
  const S = "farsighted", dir = path.join(tmp, "books", S);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "youtube-meta.json"), "utf8"));
  const hook = meta.thumbnail.hook;
  const chk = (variants, h = hook) => fs.writeFileSync(path.join(dir, "thumbnail-check.json"), JSON.stringify({ slug: S, hook: h, variants }));
  chk([{ file: "out/thumbnail-farsighted.png", hookVisible: true }, { file: "out/thumbnail-farsighted-b.png", hookVisible: false, detail: "0.10% of pixels" }]);
  let r = L.lintPack(S, tmp);
  t("hook not visible in variant B → HOOK_NOT_VISIBLE (NOT_READY)", r.status === "NOT_READY" && r.errors.some((e) => /HOOK_NOT_VISIBLE: out\/thumbnail-farsighted-b\.png/.test(e)), r.errors);
  chk([{ file: "a", hookVisible: true }], "AN OLDER HOOK");
  r = L.lintPack(S, tmp);
  t("thumbnails rendered with another hook → HOOK_STALE_THUMBNAIL", r.errors.some((e) => e.startsWith("HOOK_STALE_THUMBNAIL")));
  chk([{ file: "a", hookVisible: true }]);
  t("hook visible + current → READY", L.lintPack(S, tmp).status === "READY");
  const m2 = { ...meta, chapters: [{ t: 5, label: "Start" }, { t: 9, label: "Next Part" }, ...meta.chapters.slice(2)] };
  fs.writeFileSync(path.join(dir, "youtube-meta.json"), JSON.stringify(m2));
  r = L.lintPack(S, tmp);
  t("chapters: not at 0:00, < 10 s apart, not in the description → errors", ["CHAPTERS_NOT_AT_ZERO", "CHAPTERS_ORDER", "CHAPTERS_NOT_IN_DESCRIPTION"].every((c) => has(r, c)), r.errors);
  fs.writeFileSync(path.join(dir, "youtube-meta.json"), JSON.stringify({ ...meta, titles: meta.titles.map((x, i) => (i === 1 ? x + " (new)" : x)) }));
  r = L.lintPack(S, tmp);
  t("a meta title edited after youtube.md was rendered → STALE_MD", r.errors.some((e) => /^STALE_MD: 1 refined title/.test(e)), r.errors);
  fs.writeFileSync(path.join(dir, "youtube-meta.json"), JSON.stringify(meta));
  fs.rmSync(path.join(tmp, "public/captions/farsighted.clean.vtt"));
  t("no clean.vtt → NO_CLEAN_VTT", has(L.lintPack(S, tmp), "NO_CLEAN_VTT"));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ── captions: the TFS rolling format ────────────────────────────────────────
const RAW = [
  "WEBVTT\nKind: captions\nLanguage: en",
  "00:00:00.080 --> 00:00:02.869 align:start position:0%\n \nSo,<00:00:00.400><c> a</c><00:00:00.560><c> bat</c><00:00:00.800><c> and</c><00:00:00.960><c> a</c><00:00:01.120><c> ball</c><00:00:01.360><c> cost</c><00:00:01.839><c> $110.</c>",
  "00:00:02.869 --> 00:00:02.879 align:start position:0%\nSo, a bat and a ball cost $110.\n ",
  "00:00:02.879 --> 00:00:03.510 align:start position:0%\nSo, a bat and a ball cost $110.\nOkay.",
  "00:00:03.510 --> 00:00:03.520 align:start position:0%\nOkay.\n ",
  "00:00:03.520 --> 00:00:05.910 align:start position:0%\nOkay.\nThe<00:00:03.760><c> bat</c><00:00:04.080><c> costs</c><00:00:04.400><c> exactly</c><00:00:04.799><c> $1</c><00:00:05.279><c> more</c>",
  "00:00:05.910 --> 00:00:05.920 align:start position:0%\nThe bat costs exactly $1 more\n ",
  "00:00:05.920 --> 00:00:08.310 align:start position:0%\nThe bat costs exactly $1 more\nthan<00:00:06.160><c> the</c><00:00:06.400><c> ball.</c>",
].join("\n\n") + "\n"; // the lone " " lines are part of the real ASR format
const raw = validateUploadVtt(RAW);
t("raw ASR VTT → INLINE_TAGS + ROLLING_CUES (not an upload file)", !raw.ok && raw.errors.some((e) => e.startsWith("INLINE_TAGS")) && raw.errors.some((e) => e.startsWith("ROLLING_CUES")), raw.errors);
const vt = fs.mkdtempSync(path.join(os.tmpdir(), "yt-vtt-"));
try {
  fs.writeFileSync(path.join(vt, "raw.vtt"), RAW);
  const run = spawnSync(process.execPath, [path.join(__dirname, "clean-vtt.js"), path.join(vt, "raw.vtt"), path.join(vt, "clean.vtt")], { encoding: "utf8" });
  const out = fs.readFileSync(path.join(vt, "clean.vtt"), "utf8");
  const texts = out.split(/\n\n/).map((b) => b.split("\n").slice(2).join(" ")).filter(Boolean);
  t("clean-vtt: each line once — no joined carry-over (the 'Okay.' block was 'So, a bat … $110. Okay.')", run.status === 0 && JSON.stringify(texts) === JSON.stringify(["So, a bat and a ball cost $110.", "Okay.", "The bat costs exactly $1 more", "than the ball."]), run.stderr + JSON.stringify(texts));
  t("clean-vtt: its output passes the upload validator", validateUploadVtt(out).ok);
} finally { fs.rmSync(vt, { recursive: true, force: true }); }
const speech = validateUploadVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nLet him cough.\n\n00:00:02.000 --> 00:00:04.000\nLet him cough. That is the objective\n");
t("a sentence really said twice is a warning, not a rejection", speech.ok && speech.warnings.some((w) => w.startsWith("REPEATED_SENTENCE")), JSON.stringify(speech));
const ov = validateUploadVtt("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nOne line here.\n\n00:00:02.000 --> 00:00:04.000\nTwo lines here.\n");
t("overlapping cues → OVERLAPPING", !ov.ok && ov.errors.some((e) => e.startsWith("OVERLAPPING")));

// ── thumbnail hook pixel check ──────────────────────────────────────────────
const N = 320 * 180, plain = Buffer.alloc(N, 30), withText = Buffer.from(plain);
for (let i = 0; i < N * 0.05; i++) withText[i * 3 % N] = 240;
t("hook pixels: 5% of the frame drawn in contrast → visible", hookVisibility(withText, plain).hookVisible === true);
const faint = Buffer.from(plain); for (let i = 0; i < N * 0.2; i++) faint[i] = 50; // same-colour-ish text on its ground
t("hook pixels: text that barely differs from its ground → NOT visible", hookVisibility(faint, plain).hookVisible === false);
t("hook pixels: identical renders (hook not drawn) → NOT visible", hookVisibility(plain, Buffer.from(plain)).hookVisible === false);
t("hook pixels: unreadable render → unchecked (null), never a pass", hookVisibility(null, plain).hookVisible === null);

// ── the scaffold writers: --md-only and the refined-pack guard (static) ────
for (const f of ["plan-meta.js", "plan-antidote-meta.js"]) {
  const s = fs.readFileSync(path.join(__dirname, f), "utf8");
  t(`${f}: --md-only re-renders youtube.md from the meta; a refined meta is never overwritten`, /md-only/.test(s) && /needsClaudeRefine === false/.test(s) && /renderMd\(existing\)/.test(s));
}
const planned = fs.readFileSync(path.join(__dirname, "plan-meta.js"), "utf8");
t("plan-meta: the scaffold sentences are known to the gate (SCAFFOLD_SENTINELS)", L.SCAFFOLD_SENTINELS.filter((x) => planned.includes(x)).length >= 2);

console.log(failed ? `\n${failed} FAILED` : "\nall youtube-gate checks passed");
process.exit(failed ? 1 : 0);
