#!/usr/bin/env node
/**
 * mute-reliability.js — P0.1 (2026-09-30): how noisy IS the mute test?
 *
 * The mute test has two stochastic stages: the DESCRIBER (image -> blind "sees"
 * text, PROMPTS.md §1) and the JUDGE (narration vs description -> correctness /
 * contribution, scripts/mute-test.js judge). The plan's position: no quality
 * claim is trustworthy until that noise is measured. This script measures it.
 *
 *   node scripts/mute-reliability.js prep  --slug=<slug> --label=<run> [--k=3]
 *       reuses the frames of an EXISTING run (no new prep, no new sample — the
 *       official run's verdict and files are never touched). Writes K independent
 *       describer prompts into that run's PROMPTS.md: fresh agent, one image at a
 *       time, each pass writing .../reliability/blind-<k>.json.
 *   node scripts/mute-reliability.js judge --slug=<slug> --label=<run> [--k=3]
 *       reads the K blind files, runs the same mis-filing screen mute-test.js uses,
 *       writes K independent judge inputs (judge-input-<k>.json / judge-key-<k>.json
 *       — each judge gets its OWN copy) and appends the K judge prompts.
 *   node scripts/mute-reliability.js tally --slug=<slug> --label=<run>
 *       per frame: every judge's correctness + contribution, the majority, the
 *       agreement (k/K), and whether a split is describer-caused (the descriptions
 *       differ materially) or judge-caused (same description, different verdict).
 *       -> .../reliability/reliability.json (+ books/<slug>/mute-test/<label>/ for
 *       an unfrozen book) and a printed table.
 *   node scripts/mute-reliability.js run   --slug=<slug> --label=<run> [--k=3] [--rater=gemini|nim] [--model=] [--delay=<ms>]
 *       prep + judge + tally in one go. A scripted rater calls a fresh, single-image
 *       request per frame and a fresh single-item request per judge item — for a
 *       session with no agent spawner. `gemini` (default) = GOOGLE_API_KEY +
 *       gemini-flash-lite-latest (the model the repo already uses for the judge step);
 *       `nim` = NVIDIA_API_KEY + meta/llama-3.2-90b-vision-instruct (the repo's other
 *       LLM provider). --delay=<ms> paces the calls (free tiers rate-limit).
 *       The rater and model are recorded in reliability.json; the agent path
 *       (PROMPTS.md, fresh agent, one image at a time) stays the primary one and the
 *       K prompts are always written so a re-run with another rater is possible.
 *
 * WHAT THIS IS NOT: a verdict. The bars live in data/quality-policy.json and are
 * operator-only; preview-ready.js and mute-test.js are untouched by this script.
 *
 * RATER CHANNELS (status 2026-10-01, operator note: in-session GLM/DeepSeek vision
 * is allowed when its LLM is on duty — but its only image path is the preview
 * webview, which is the channel that killed death-row/run2):
 *   1. --rater=gemini  (gemini-flash-lite-latest, GOOGLE_API_KEY) — the protocol
 *      rater (both prior books). Free-tier RPD resets midnight US-Pacific
 *      (= ~10:00 TRT); a big measurement day exhausts the daily quota. A 429
 *      that survives the built-in retries means the DAY quota, not pacing.
 *   2. --rater=nim     (NVIDIA_API_KEY; NIM_VISION_MODEL, default 90b-vision).
 *      90b times out on cold starts; meta/llama-3.2-11b-vision-instruct answers
 *      in ~6-15 s and tolerates long sessions (occasional empty body -> the
 *      resume-safe loop just retries). 11b reads scene text less eagerly, so its
 *      judges file more NEUTRAL/NONE — record the model, compare only within it.
 *   3. in-session agent vision (GLM 5.3 / DeepSeek when driving this session) via
 *      preview_open + preview_screenshot + tmp/p3-scratch/record-blind.js —
 *      MANUAL fallback, one image at a time. DEAD 2026-09-30 -> 10-01: the static
 *      preview server stopped serving sibling files (naturalWidth 0) AND even a
 *      base64-embedded page composites black. Re-test before trusting it again;
 *      never let a whole measurement depend on it (death-row lesson).
 * The scripted channels write meta.json (rater+model) and refuse to mix raters
 * inside one book's K passes; an in-session pass must be recorded per file the
 * same way before tally.
 * A run on reused frames can never be the verdict (the mute-test holdout rule) —
 * this only tells you how much of a run's result is the picture and how much is
 * the rater.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CMD = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const SLUG = args.slug;
const LABEL = args.label || "run1";
const K = Math.max(2, parseInt(args.k || "3", 10));
if (!["prep", "judge", "tally", "run"].includes(CMD) || !SLUG) {
  console.error("Usage: node scripts/mute-reliability.js prep|judge|tally|run --slug=<slug> --label=<run> [--k=3] [--rater=gemini|nim] [--model=] [--delay=<ms>]");
  process.exit(1);
}

const BOOK = path.join(ROOT, "books", SLUG);
const RUN = path.join(ROOT, "audit", "mute", SLUG, LABEL);
const REL = path.join(RUN, "reliability");
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

// a split is attributed to the DESCRIBER when the K descriptions of that frame
// differ materially, to the JUDGE when they do not (same description, different
// verdict). minDescriberSimilarity is written per frame so the call is auditable.
const SOURCE_RULE = {
  minSimilarity: 0.5,
  note: "token-Jaccard on (sees + message) across the K descriptions of one frame; below the threshold the frame's disagreement is attributed to the DESCRIBER, at or above it to the JUDGE.",
};

const cfgPath = fs.existsSync(path.join(BOOK, "config.antidote.json")) ? path.join(BOOK, "config.antidote.json") : path.join(BOOK, "config.vox.json");
const cfg = readJSON(cfgPath);
if (!cfg) { console.error(`❌ no config for ${SLUG}`); process.exit(1); }
const units = cfg.scenes || cfg.beats || [];
const frameOfFile = (f) => +(String(f).match(/-f(\d+)\.png/) || [])[1];

// bars: the same policy file mute-test.js reads (never redefined here)
const POLICY = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "quality-policy.json"), "utf8")).muteTest; } catch { return null; } })();
const BARS = { wrongPer30: POLICY?.blocking?.wrongPer30 ?? 1, deadPer30: POLICY?.blocking?.deadPer30 ?? 5, addsTarget: POLICY?.targets?.adds ?? 0.6 };
// exactly mute-test.js tally's formula — used ONLY to ask "would the verdict flip"
const passOf = (wrong, dead, n) => wrong <= Math.floor((BARS.wrongPer30 * n) / 30) && dead <= Math.floor((BARS.deadPer30 * n) / 30);

const RULES = `For each item give:\nA. correctness — CORRECT (the viewer's understood message matches the narration), NEUTRAL (neither matches nor contradicts: just a person, abstract/empty), WRONG (suggests a different or opposite meaning: unrelated object, wrong emotion over tragedy, emphasis where the narration rejects, etc.).\nB. contribution — ADDS (the image itself — people's actions/expressions, objects, icons, not only copied text — conveys something the narration means), TEXT_ONLY (only on-screen text carries meaning), NONE.\nC. explains — YES only when contribution is ADDS AND the picture itself shows the narration's mechanism, relationship or cause→effect (who does what to whom, what leads to what), not just its subject or mood; otherwise NO.\nOne short reason each. Be strict and literal; do not reward a version for being prettier or busier.`;

function narrationAt(f) {
  return (cfg.captions || []).filter((k) => k.endFrame >= f - 150 && k.startFrame <= f + 150).map((k) => k.text).join(" ");
}

// Words the config prints on screen around frame f — the mis-filing screen from
// mute-test.js (a describer that describes the wrong image must be refused; a
// fresh pass is only valid if every printed word it reports exists at its frame).
function screenWordsAt(f) {
  const u = units.find((x) => f >= x.fromFrame && f < x.fromFrame + x.durationFrames);
  if (!u) return null;
  const p = u.props || {};
  const strs = [
    ...(u.texts || []).map((t) => t.text),
    ...((u.diagram && u.diagram.labels) || []),
    ...[].concat(p.emphasis || [], p.kicker || [], p.items || [], p.title || []),
  ].filter(Boolean).join(" ").toUpperCase();
  const w = strs.match(/[A-Z]{4,}/g);
  return w && w.length ? new Set(w) : null;
}

function frames() {
  const key = readJSON(path.join(RUN, "key.json"));
  if (!key) { console.error(`❌ ${rel(RUN)}/key.json missing — this run has no frames to reuse (run mute-test.js prep first)`); process.exit(1); }
  return Object.keys(key).sort().map((img) => ({ img, file: key[img], frame: frameOfFile(key[img]) }));
}

function mkdirs() { fs.mkdirSync(REL, { recursive: true }); }

function writePromptBlock(marker, text) {
  const p = path.join(RUN, "PROMPTS.md");
  const cur = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (cur.includes(`<!-- ${marker} -->`)) return false;
  fs.appendFileSync(p, `\n<!-- ${marker} -->\n${text}`);
  return true;
}

function writeDescriberPrompts(quiet = false) {
  mkdirs();
  const F = frames();
  const imgDir = path.join(RUN, "mute");
  let added = 0;
  for (let k = 1; k <= K; k++) {
    added += writePromptBlock(`mute-reliability:describer:k${k}`, `
## R1. Blind describer — reliability pass ${k}/${K} (a FRESH agent)
You are a blind rater in a mute test. You will look at ${F.length} still frames from an animated explainer video with NO audio and NO other context. Do not read any other file in the repository — only the images listed below. Do not open ${rel(path.join(RUN, "blind.json"))}, any judge file, any earlier pass (${rel(path.join(REL, "blind-1.json"))}…), or any config/book file.

Images (read each with the Read tool, ONE at a time): ${path.join(imgDir, "img-01.png")} through img-${String(F.length).padStart(2, "0")}.png in the same folder.

Work ONE image at a time: open img-NN, write its entry, then open the next. Never describe from memory of an earlier image.
For EACH image, write: "img" (the filename), "text" (every word printed on the image, exactly as written, or "none"), "sees" (literal description: people, what they do, their faces, objects, text, diagram, setting; 1-3 sentences), "message" (what the narrator is saying at this moment, one sentence, from the image only), "confidence" (low/medium/high), "wouldConfuse" (anything that could mislead, or "none").

Write ONLY a JSON array [{"img":"img-01.png","text":"...","sees":"...","message":"...","confidence":"...","wouldConfuse":"..."}, ...] to ${path.join(REL, `blind-${k}.json`)}. Verify it parses and has ${F.length} entries. Reply with one line: "written ${F.length}".
`);
  }
  if (!quiet) {
    console.log(`✓ prep: ${F.length} frames reused from ${rel(RUN)} — ${added ? `${added} new` : "K describer prompts already present in"} ${rel(path.join(RUN, "PROMPTS.md"))}`);
    console.log(`  DIAGNOSTIC on frames an earlier run already showed — it can never become the verdict.`);
    console.log(`  Next: §R1 pass 1..${K} to ${K} FRESH agents (one image at a time), then: node scripts/mute-reliability.js judge --slug=${SLUG} --label=${LABEL}`);
  }
}

function readBlind(k) {
  const p = path.join(REL, `blind-${k}.json`);
  const blind = readJSON(p);
  if (!blind) { console.error(`❌ ${rel(p)} missing — pass ${k} has not been described yet (see §R1 in PROMPTS.md; or use: run --rater=gemini)`); process.exit(1); }
  const byImg = Object.fromEntries(blind.map((d) => [d.img, d]));
  const F = frames();
  const missing = F.filter((f) => !byImg[f.img]).map((f) => f.img);
  if (missing.length) { console.error(`❌ pass ${k}: ${missing.length} frame(s) missing from blind-${k}.json (${missing.slice(0, 5).join(", ")})`); process.exit(1); }
  // the mis-filing screen: every printed word the describer reports must exist on
  // that describer's frame (the same rule mute-test.js applies to the official pass).
  const bad = [];
  let checked = 0;
  for (const f of F) {
    const d = byImg[f.img];
    const words = screenWordsAt(f.frame);
    const said = d.text || (String(d.sees || "").match(/['"]([A-Z][A-Z' -]{3,})['"]/g) || []).join(" ");
    const seen = (String(said).toUpperCase().match(/[A-Z]{4,}/g) || []).filter((x) => !/^(NONE|INSIGHT|TURN)$/.test(x));
    if (!words || seen.length < 2) continue;
    checked++;
    if (!seen.some((x) => words.has(x))) bad.push(`${d.img}: reports "${String(said).slice(0, 60)}" — not on this frame`);
  }
  if (checked && bad.length > Math.max(1, Math.floor(checked * 0.1))) {
    console.error(`❌ pass ${k}: the blind descriptions are filed under the wrong images (${bad.length}/${checked} misaligned):`);
    bad.slice(0, 8).forEach((b) => console.error("   - " + b));
    console.error(`   Re-run §R1 pass ${k} with a FRESH describer (one image at a time), then judge again.`);
    process.exit(1);
  }
  if (bad.length) console.warn(`⚠ pass ${k}: ${bad.length} description(s) may be misfiled: ${bad.join("; ")}`);
  return F.map((f) => ({ frame: f.frame, img: f.img, V: { sees: byImg[f.img].sees, message: byImg[f.img].message, wouldConfuse: byImg[f.img].wouldConfuse } }));
}

/** K independent judge inputs — each judge reads its OWN copy (never the shared one) */
function buildJudgeInputs() {
  const built = [];
  for (let k = 1; k <= K; k++) {
    const described = readBlind(k);
    const items = described.map((d, n) => ({ id: `item-${String(n + 1).padStart(2, "0")}`, t: `${(d.frame / 30).toFixed(1)}s`, narration: narrationAt(d.frame), V: d.V }));
    fs.writeFileSync(path.join(REL, `judge-input-${k}.json`), JSON.stringify(items, null, 2));
    fs.writeFileSync(path.join(REL, `judge-key-${k}.json`), JSON.stringify(Object.fromEntries(items.map((it, n) => [it.id, { frame: described[n].frame, img: described[n].img }])), null, 2));
    built.push(items.length);
  }
  return built;
}

function writeJudgePrompts(n, quiet = false) {
  let added = 0;
  for (let k = 1; k <= K; k++) {
    added += writePromptBlock(`mute-reliability:judge:k${k}`, `
## R2. Judge — reliability pass ${k}/${K} (a FRESH agent)
You are an impartial judge in a mute test of an animated book-summary video. Read ONLY this file: ${path.join(REL, `judge-input-${k}.json`)}. Do NOT open any other file (never judge-key-${k}.json, key.json, the official judge-input.json / judge-result.json, any other pass, books/, scripts/, or image folders).
Each item has the narration spoken around a moment and a blind description (V) of what a viewer with the sound OFF saw.
${RULES}
Write ONLY JSON to ${path.join(REL, `judge-result-${k}.json`)}: {"items":[{"id":"item-01","V":{"correctness":"...","why":"...","contribution":"...","whyC":"...","explains":"YES|NO"}}, ...]} (${n} items). Verify it parses. Reply with one line: "written ${n}".
`);
  }
  return added;
}

function judgeCLI() {
  mkdirs();
  const counts = buildJudgeInputs();
  const added = writeJudgePrompts(counts[0]);
  console.log(`✓ judge: ${K} independent judge input(s) in ${rel(REL)} — ${added ? `${added} new` : "K judge prompts already present in"} ${rel(path.join(RUN, "PROMPTS.md"))}`);
  console.log(`  Next: §R2 pass 1..${K} to ${K} FRESH agents, then: node scripts/mute-reliability.js tally --slug=${SLUG} --label=${LABEL}`);
}

// ── tally ────────────────────────────────────────────────────────────────────
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
}
const mode = (xs) => {
  const t = {};
  for (const x of xs) t[x] = (t[x] || 0) + 1;
  const best = Object.entries(t).sort((a, b) => b[1] - a[1]);
  return best.length > 1 && best[0][1] === best[1][1] ? { value: "TIE", n: best[0][1] } : { value: best[0][0], n: best[0][1] };
};

function tally(quiet = false) {
  const meta = readJSON(path.join(REL, "meta.json"), {});
  const passes = [];
  for (let k = 1; k <= K; k++) {
    const res = readJSON(path.join(REL, `judge-result-${k}.json`));
    const key = readJSON(path.join(REL, `judge-key-${k}.json`));
    const input = readJSON(path.join(REL, `judge-input-${k}.json`));
    if (!res || !key || !input) { console.error(`❌ reliability pass ${k} incomplete (judge-result-${k}.json / judge-key-${k}.json missing) — see §R2 in PROMPTS.md, or use: run --rater=gemini`); process.exit(1); }
    const missing = input.filter((x) => !(res.items || []).some((r) => r.id === x.id));
    if (missing.length) { console.error(`❌ pass ${k}: judge-result-${k}.json is missing ${missing.length} item(s) (${missing.slice(0, 5).map((x) => x.id).join(", ")})`); process.exit(1); }
    passes.push({ k, res, key, input });
  }
  const F = frames();
  const rows = F.map((f, n) => {
    const id = `item-${String(n + 1).padStart(2, "0")}`;
    const judges = passes.map((p) => {
      const it = (p.res.items || []).find((x) => x.id === id) || {};
      const v = it.V || it;
      return { correctness: String(v.correctness || "?").toUpperCase(), contribution: String(v.contribution || "?").toUpperCase(), explains: String(v.explains || "NO").toUpperCase() };
    });
    const mc = mode(judges.map((j) => j.correctness));
    const mp = mode(judges.map((j) => j.contribution));
    // describer vs judge: did the K descriptions of this frame differ materially?
    const descs = passes.map((p) => {
      const it = (p.input || []).find((x) => x.id === id) || {};
      return norm(`${(it.V || {}).sees || ""} ${(it.V || {}).message || ""}`);
    });
    let minSim = 1;
    for (let i = 0; i < descs.length; i++) for (let j = i + 1; j < descs.length; j++) minSim = Math.min(minSim, jaccard(descs[i], descs[j]));
    const split = new Set(judges.map((j) => j.correctness)).size > 1 || new Set(judges.map((j) => j.contribution)).size > 1;
    return {
      img: f.img, frame: f.frame, t: `${(f.frame / 30).toFixed(1)}s`, judges,
      majority: { correctness: mc.value, contribution: mp.value },
      agreement: { correctness: +(mc.n / judges.length).toFixed(3), contribution: +(mp.n / judges.length).toFixed(3) },
      split, source: !split ? null : (minSim < SOURCE_RULE.minSimilarity ? "describer" : "judge"),
      minDescriberSimilarity: +minSim.toFixed(3),
    };
  });

  const n = rows.length;
  const hist = {};
  for (const r of rows) hist[r.agreement.correctness] = (hist[r.agreement.correctness] || 0) + 1;
  const meanAgreement = rows.reduce((s, r) => s + r.agreement.correctness, 0) / n;
  const below = rows.filter((r) => r.agreement.correctness < 2 / 3);
  const count = (pred) => rows.filter(pred).length;
  const majTotals = {
    CORRECT: count((r) => r.majority.correctness === "CORRECT"),
    NEUTRAL: count((r) => r.majority.correctness === "NEUTRAL"),
    WRONG: count((r) => r.majority.correctness === "WRONG"),
    TIE: count((r) => r.majority.correctness === "TIE"),
    ADDS: count((r) => r.majority.contribution === "ADDS"),
    TEXT_ONLY: count((r) => r.majority.contribution === "TEXT_ONLY"),
    NONE: count((r) => r.majority.contribution === "NONE"),
  };
  const official = readJSON(path.join(RUN, "totals.json"));
  const officialPass = official ? !!official.pass : null;
  const majorityPass = passOf(majTotals.WRONG, majTotals.NONE, n);
  const perPass = {};
  for (const p of passes) {
    const T = {};
    for (const it of p.res.items || []) {
      const v = it.V || it;
      const c = String(v.correctness || "?").toUpperCase();
      T[c] = (T[c] || 0) + 1;
      if (String(v.contribution).toUpperCase() === "NONE") T.dead = (T.dead || 0) + 1;
    }
    perPass[`j${p.k}`] = { CORRECT: T.CORRECT || 0, NEUTRAL: T.NEUTRAL || 0, WRONG: T.WRONG || 0, dead: T.dead || 0, pass: passOf(T.WRONG || 0, T.dead || 0, n) };
  }
  const summary = {
    n, k: K,
    rater: meta.model ? { kind: "scripted", model: meta.model, imagesPerRequest: 1, itemsPerJudgeRequest: 1 } : { kind: "fresh-agent", note: "PROMPTS.md §R1/§R2" },
    meanAgreementCorrectness: +meanAgreement.toFixed(3),
    meanAgreementContribution: +(rows.reduce((s, r) => s + r.agreement.contribution, 0) / n).toFixed(3),
    agreementHistogram: Object.fromEntries(Object.entries(hist).sort((a, b) => b[0] - a[0])),
    framesBelowTwoThirds: below.length,
    framesBelowTwoThirdsPct: +((below.length / n) * 100).toFixed(1),
    splits: count((r) => r.split),
    splitsDescriberCaused: count((r) => r.source === "describer"),
    splitsJudgeCaused: count((r) => r.source === "judge"),
    sourceRule: SOURCE_RULE,
    majorityTotals: majTotals,
    official: official ? { pass: official.pass, wrong: official.totals?.WRONG ?? null, dead: official.dead ?? null, adds: official.totals?.ADDS ?? null, verdict: official.verdict ?? null } : null,
    officialPass, majorityPass,
    verdictFlips: officialPass === null ? null : officialPass !== majorityPass,
    perPass,
    note: "Diagnostic only — the bars are unchanged and preview-ready does not read this file. A reused-frame run can never be the verdict.",
  };
  const out = { slug: SLUG, label: LABEL, date: new Date().toISOString(), bars: BARS, summary, frames: rows };
  mkdirs();
  fs.writeFileSync(path.join(REL, "reliability.json"), JSON.stringify(out, null, 2) + "\n");
  // the plan's path — but a published book's folder is frozen, so only an
  // unpublished book gets a copy under books/ (audit/ is always written).
  let bookCopy = null;
  if (!isFrozen(SLUG)) {
    const dest = path.join(BOOK, "mute-test", LABEL);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "reliability.json"), JSON.stringify(out, null, 2) + "\n");
    bookCopy = rel(path.join(dest, "reliability.json"));
  }
  if (!quiet) {
    const P = (x, w = 11) => String(x).padEnd(w);
    console.log(`\n── mute reliability · ${SLUG}/${LABEL} · k=${K} · ${rel(path.join(REL, "reliability.json"))}${bookCopy ? ` + ${bookCopy}` : " (frozen book: audit only)"}`);
    console.log(P("frame") + P("t") + passes.map((p) => P(`j${p.k}`)).join("") + P("majority") + P("agree") + "source");
    for (const r of rows) {
      console.log(P(r.img.replace(/\.png$/, ""), 11) + P(r.t) + r.judges.map((j) => P(`${j.correctness[0]}${j.contribution[0]}`)).join("") + P(r.majority.correctness) + P(r.agreement.correctness.toFixed(2)) + (r.split ? r.source : "-"));
    }
    console.log(`\n  mean agreement (correctness) ${summary.meanAgreementCorrectness} · contribution ${summary.meanAgreementContribution}`);
    console.log(`  agreement histogram ${JSON.stringify(summary.agreementHistogram)} · frames < 2/3: ${below.length}/${n} (${summary.framesBelowTwoThirdsPct}%)`);
    console.log(`  splits ${summary.splits} → describer-caused ${summary.splitsDescriberCaused} · judge-caused ${summary.splitsJudgeCaused} (rule: min pairwise description similarity < ${SOURCE_RULE.minSimilarity})`);
    console.log(`  official ${JSON.stringify(summary.official)}`);
    console.log(`  majority vote: WRONG ${majTotals.WRONG} · dead ${majTotals.NONE} · ADDS ${majTotals.ADDS}/${n} → ${majorityPass ? "PASS" : "FAIL"} (official ${officialPass === null ? "?" : officialPass ? "PASS" : "FAIL"})${summary.verdictFlips ? "  ⚠ FLIP" : ""}`);
    console.log(`  per judge pass: ${Object.entries(perPass).map(([kk, v]) => `${kk} ${v.CORRECT}C/${v.WRONG}W/${v.dead}D ${v.pass ? "PASS" : "FAIL"}`).join(" · ")}`);
  }
  return summary;
}

function isFrozen(slug) {
  return require("./lib/frozen").isFrozen(slug); // register = Summary Table (lib/frozen.js)
}

// ── scripted rater: a fresh call per frame / per item (no batching, no context) ──
// --delay=<ms> between calls: the free-tier key rate-limits at roughly 15 requests
// per minute, which one call every ~4s sits exactly on. A paced run finishes.
const MODEL = args.model || process.env.BLIND_MODEL || "gemini-flash-lite-latest"; // recorded in meta.json
const DELAY = Math.max(0, parseInt(args.delay || "0", 10));
const pause = () => (DELAY ? new Promise((r) => setTimeout(r, DELAY)) : Promise.resolve());
async function gemini(parts, temperature) {
  const KEY = process.env.GOOGLE_API_KEY;
  if (!KEY) throw new Error("GOOGLE_API_KEY missing");
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, maxOutputTokens: 8000, responseMimeType: "application/json" } }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return (json.candidates[0].content.parts || []).map((p) => p.text || "").join("");
    if (![429, 500, 503].includes(res.status)) throw new Error(`API ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    console.error(`   · ${res.status} — retrying in ${attempt * 20}s (attempt ${attempt}/6; use --delay to pace slower)`);
    await new Promise((r) => setTimeout(r, attempt * 20000));
  }
  throw new Error("API failed after retries");
}
const sliceJSON = (t, open, close) => JSON.parse(t.slice(t.indexOf(open), t.lastIndexOf(close) + 1));

// NVIDIA NIM (build.nvidia.com) — the repo's other LLM provider (scripts/lib/llm.js).
const NIM_MODEL = process.env.NIM_VISION_MODEL || "meta/llama-3.2-90b-vision-instruct";
async function nimCall(text, jpgPath, temperature) {
  const KEY = process.env.NVIDIA_API_KEY;
  if (!KEY) throw new Error("NVIDIA_API_KEY missing");
  const content = [{ type: "text", text }];
  if (jpgPath) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(jpgPath).toString("base64")}` } });
  for (let attempt = 1; attempt <= 5; attempt++) {
    const ac = new AbortController(); // NIM can hang on a cold model: bound every call
    const timer = setTimeout(() => ac.abort(), parseInt(args.timeout || "120000", 10));
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        signal: ac.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: NIM_MODEL, messages: [{ role: "user", content }], temperature, max_tokens: 2000, stream: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return String(json.choices?.[0]?.message?.content || "").replace(/```json/gi, "").replace(/```/g, "").trim();
      if (![429, 500, 503].includes(res.status)) throw new Error(`NIM ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      console.error(`   · NIM ${res.status} — retrying in ${attempt * 20}s (attempt ${attempt}/5)`);
    } catch (e) {
      if (!/abort/i.test(e.message)) throw e;
      console.error(`   · NIM timed out after ${args.timeout || 120000}ms — retrying (attempt ${attempt}/5)`);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, attempt * 20000));
  }
  throw new Error("NIM failed after retries");
}

// One blind description / one verdict, from whichever scripted rater is selected.
async function describeOnce(f, jpg) {
  const text = `${DESC_PROMPT}\nThe image file is named ${f.img}.`;
  if (RATER === "nim") return sliceJSON(await nimCall(text, jpg, 0.4), "{", "}");
  return sliceJSON(await gemini([{ text }, { inlineData: { mimeType: "image/jpeg", data: fs.readFileSync(jpg).toString("base64") } }], 0.4), "{", "}");
}
async function judgeOnce(it) {
  const text = `You are an impartial judge in a mute test of an animated book-summary video. One item has the narration spoken around a moment and a blind description (V) of what a viewer with the sound OFF saw.\n${RULES}\nItem JSON:\n${JSON.stringify({ id: it.id, t: it.t, narration: it.narration, V: it.V }, null, 1)}\nWrite ONLY JSON: {"id":"${it.id}","V":{"correctness":"CORRECT|NEUTRAL|WRONG","why":"...","contribution":"ADDS|TEXT_ONLY|NONE","whyC":"...","explains":"YES|NO"}} — no markdown, no commentary.`;
  const raw = RATER === "nim" ? await nimCall(text, null, 0.3) : await gemini([{ text }], 0.3);
  const v = sliceJSON(raw, "{", "}").V || {};
  return {
    correctness: String(v.correctness || "NEUTRAL").toUpperCase(),
    why: String(v.why || "").trim(),
    contribution: String(v.contribution || "NONE").toUpperCase(),
    whyC: String(v.whyC || "").trim(),
    explains: String(v.explains || "NO").toUpperCase(),
  };
}

const RATER = args.rater || "gemini";
if (!["gemini", "nim"].includes(RATER)) { console.error(`❌ unknown --rater=${RATER} (use gemini|nim; the agent path is PROMPTS.md)`); process.exit(1); }

const DESC_PROMPT = "You are a blind rater in a mute test. You will look at ONE still frame from an animated explainer video with NO audio and NO other context; you know nothing about the video and must not guess from prior knowledge. Describe only what is in this image.\nWrite ONE JSON object with: \"text\" (every word printed on the image, exactly as written, or \"none\"), \"sees\" (literal description: people, what they do, their faces, objects, text, diagram, setting; 1-3 sentences), \"message\" (what the narrator is saying at this moment, one sentence, from the image only), \"confidence\" (\"low\"/\"medium\"/\"high\"), \"wouldConfuse\" (anything that could mislead, or \"none\").\nOutput ONLY that JSON object — no markdown fences, no commentary.";

async function runScripted() {
  mkdirs();
  const model = RATER === "nim" ? `nim:${NIM_MODEL}` : MODEL;
  const metaPath = path.join(REL, "meta.json");
  const prev = readJSON(metaPath, null);
  // Never mix raters inside one book's K passes: the agreement number would be
  // part rater difference and part noise. A resume must use the SAME model.
  if (prev && prev.model && prev.model !== model && !args.fresh) {
    console.error(`❌ ${rel(metaPath)} was written by ${prev.model}; this run would use ${model}.\n   Re-run with --fresh to discard the previous passes, or keep the same rater.`);
    process.exit(1);
  }
  if (args.fresh) {
    for (let k = 1; k <= K; k++) for (const n of [`blind-${k}.json`, `judge-input-${k}.json`, `judge-key-${k}.json`, `judge-result-${k}.json`]) fs.rmSync(path.join(REL, n), { force: true });
    fs.rmSync(path.join(REL, "small"), { recursive: true, force: true });
    console.log(`  --fresh: cleared the previous K passes (the official run's own files are untouched)`);
  }
  fs.writeFileSync(metaPath, JSON.stringify({ slug: SLUG, label: LABEL, k: K, rater: RATER, model, imagesPerRequest: 1, itemsPerJudgeRequest: 1, delayMs: DELAY, startedAt: new Date().toISOString() }, null, 2));
  const F = frames();
  if (!F.length) { console.error("❌ no frames in this run"); process.exit(1); }
  const small = path.join(REL, "small");
  fs.mkdirSync(small, { recursive: true });
  for (let k = 1; k <= K; k++) {
    const out = path.join(REL, `blind-${k}.json`);
    const byImg = new Map((readJSON(out, []) || []).map((d) => [d.img, d]));
    for (const f of F) {
      if (byImg.has(f.img)) continue;
      const jpg = path.join(small, f.img.replace(/\.png$/, ".jpg"));
      if (!fs.existsSync(jpg)) execFileSync("ffmpeg", ["-y", "-v", "error", "-i", path.join(RUN, "mute", f.img), "-vf", "scale=960:-2", "-q:v", "5", jpg]);
      // a FRESH request per frame — the image is never seen together with another
      byImg.set(f.img, { img: f.img, ...(await describeOnce(f, jpg)) });
      fs.writeFileSync(out, JSON.stringify(F.map((x) => byImg.get(x.img)).filter(Boolean), null, 1));
      process.stdout.write(`  describer ${k}/${K} ${f.img}   \r`);
      await pause(); // resume-safe: every entry is on disk before the next call
    }
    console.log(`  describer pass ${k}/${K} ✓ (${model}, one image per request)`);
  }
  buildJudgeInputs();
  for (let k = 1; k <= K; k++) {
    const items = readJSON(path.join(REL, `judge-input-${k}.json`), []);
    const out = path.join(REL, `judge-result-${k}.json`);
    const have = new Map(((readJSON(out, { items: [] }) || {}).items || []).map((x) => [x.id, x]));
    for (const it of items) {
      if (have.has(it.id)) continue;
      have.set(it.id, { id: it.id, V: await judgeOnce(it) });
      fs.writeFileSync(out, JSON.stringify({ items: items.map((x) => have.get(x.id)).filter(Boolean) }, null, 1));
      process.stdout.write(`  judge ${k}/${K} ${it.id}   \r`);
      await pause();
    }
    console.log(`  judge pass ${k}/${K} ✓`);
  }
}

(async () => {
  if (CMD === "prep") writeDescriberPrompts();
  else if (CMD === "judge") judgeCLI();
  else if (CMD === "tally") tally();
  else if (CMD === "run") {
    writeDescriberPrompts(true);
    await runScripted();
    writeJudgePrompts(K ? (readJSON(path.join(REL, "judge-input-1.json"), []) || []).length : 0, true);
    tally();
  }
})().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
