#!/usr/bin/env node
/**
 * framecheck.js — a blind look at the REAL frame of every beat, before the full render. Report-only:
 * it never edits art.json/config, never blocks, and is NOT the mute-test verdict. mute-test.js is
 * untouched and keeps sampling the whole film at random; it does not exclude what framecheck looked at
 * (excluding the checked beats would bias the verdict towards the unchecked ones).
 *
 * Why: the text-only readcheck reported 0 WRONG before every failing mute run of the-art-of-saying-no
 * (3 runs, 2-4 WRONG each). The misreads come from the drawing (a neutral face read as a smile, a sticky
 * note read as dumped work), which only a picture shows. And config predicts them weakly
 * (scripts/lib/frame-risk.js: the best score caught 47% of WRONG frames in its top third), so the default
 * is every beat; --n=K looks at the K beats with the measured flags first.
 *
 *   node scripts/framecheck.js prep  --slug=<slug> [--label=fc1] [--chunk=30]
 *        [--n=K [--control=8]] [--beats=<ids>] [--from-candidates=<audit/candidates/....json>]
 *        [--root=<tree with books/ audit/ scripts/>] [--exclude-from=<sealed mute label | sample.json>] [--dry]
 *       -> stills at the moment the mute test uses -> caption band cropped -> shuffled
 *       -> audit/framecheck/<slug>/<label>/{img/img-NNN.png, key.json, sample.json, PROMPTS.md}
 *   (one fresh blind describer per chunk writes blind-K.json — PROMPTS.md)
 *   node scripts/framecheck.js judge --slug=<slug> --label=fc1   -> judge-input-K.json + judge prompts
 *   (one fresh judge per chunk writes judge-result-K.json)
 *   node scripts/framecheck.js tally --slug=<slug> --label=fc1   -> report.json + books/<slug>/framecheck.json
 *
 * Fix a finding only after reading it, then re-check the changed beats with a new label (--beats=).
 * Same-family blind agents as the mute test: a framecheck PASS predicts the judge, not a human viewer.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { risks: allRisks, selectionFlags } = require("./lib/frame-risk");

const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const CMD = process.argv[2];
const ROOT = path.resolve(args.root || process.env.FRAMECHECK_ROOT || path.join(__dirname, ".."));
const SLUG = args.slug;
const LABEL = args.label || "fc1";
if (!["prep", "judge", "tally", "sequence", "sequence-judge", "sequence-tally"].includes(CMD) || !SLUG) {
  console.error("Usage: node scripts/framecheck.js prep|judge|tally --slug=<slug> [--label=fc1] [--chunk=30] [--n=K] [--control=8] [--beats=<ids>] [--from-candidates=<file>] [--root=<dir>] [--dry]\n" +
    "       node scripts/framecheck.js sequence|sequence-judge|sequence-tally --slug=<slug> --label=<l> --passages=161-164,100-104|all [--per-beat=3] [--root=<dir>]");
  process.exit(1);
}
const BOOK = path.join(ROOT, "books", SLUG);
const OUT = path.join(ROOT, "audit", "framecheck", SLUG, LABEL);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const cfg = readJSON(path.join(BOOK, "config.antidote.json"));
if (!cfg) { console.error(`❌ no Antidote config for ${SLUG} under ${ROOT}`); process.exit(1); }
const scenes = (cfg.scenes || []).filter((s) => s.id !== "intro" && s.type !== "title");
const frameOfFile = (f) => +f.match(/-f(\d+)\.png/)[1];
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); }
const seed = parseInt(args.seed || String([...LABEL].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 11)), 10);
const CHUNK = Math.max(5, parseInt(args.chunk || "30", 10));
const readings = (readJSON(path.join(ROOT, "data", "icon-readings.json"), {}) || {}).icons || {};

// Same moment as mute-test.js sampleFrame (kept identical; test-framecheck.js compares the two):
// the beat complete on screen — 70% in, or just after the last word-synced text has appeared.
function sampleFrame(u) {
  const texts = Array.isArray(u.texts) ? u.texts : [];
  const lastText = texts.reduce((m, t) => Math.max(m, Number(t.at) || 0), 0);
  const settle = texts.length ? lastText + 30 : 0; // reveal/strike animate ~1s
  const at = Math.max(Math.round(u.durationFrames * 0.7), settle);
  return Math.round(u.fromFrame + Math.min(at, u.durationFrames - 4));
}
function narrationAt(f) {
  return (cfg.captions || []).filter((k) => k.endFrame >= f - 150 && k.startFrame <= f + 150).map((k) => k.text).join(" ");
}

function select() {
  const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));
  const rnd = rng(seed);
  const shuffle = (a) => a.map((x) => [x, rnd()]).sort((p, q) => p[1] - q[1]).map((x) => x[0]);
  let requested = [];
  if (args.beats) requested = String(args.beats).split(",").map((x) => x.trim()).filter(Boolean).map((x) => (/^\d+$/.test(x) ? `scene-${x.padStart(2, "0")}` : x));
  if (args["from-candidates"]) {
    const c = readJSON(path.resolve(ROOT, args["from-candidates"]));
    if (!c) { console.error(`❌ cannot read ${args["from-candidates"]}`); process.exit(1); }
    (c.findings || []).forEach((f) => requested.push(...(f.reviewBeats || [])));
  }
  requested = [...new Set(requested)];
  const missing = requested.filter((id) => !byId[id]);
  if (missing.length) { console.error(`❌ unknown beat id(s): ${missing.join(",")}`); process.exit(1); }
  // --exclude-from=<label | path to a mute-test sample.json>: never look at the sealed final holdout's beats
  // (runbook §4 "Sealed holdout"), so development checks stay separate from the verdict sample.
  // Every open seal of this book (seal.json, verdict not yet tallied) is excluded too, with or without the flag.
  const sealedIds = new Set();
  const sources = [];
  if (args["exclude-from"]) {
    const ex = String(args["exclude-from"]);
    const p = fs.existsSync(path.resolve(ROOT, ex)) ? path.resolve(ROOT, ex) : path.join(ROOT, "audit", "mute", SLUG, ex, "sample.json");
    const sealed = readJSON(p);
    if (!Array.isArray(sealed)) { console.error(`❌ --exclude-from: no sample.json at ${p}`); process.exit(1); }
    sealed.forEach((x) => sealedIds.add(x.id));
    sources.push(path.relative(ROOT, p));
  }
  const muteRoot = path.join(ROOT, "audit", "mute", SLUG);
  for (const l of fs.existsSync(muteRoot) ? fs.readdirSync(muteRoot) : []) {
    const s = readJSON(path.join(muteRoot, l, "seal.json"));
    if (!s || !Array.isArray(s.ids) || fs.existsSync(path.join(muteRoot, l, "totals.json"))) continue;
    s.ids.forEach((id) => sealedIds.add(id));
    sources.push(`seal ${l}`);
  }
  if (sealedIds.size) {
    const hit = requested.filter((id) => sealedIds.has(id));
    if (hit.length) { console.error(`❌ --beats asks for sealed holdout beat(s): ${hit.join(",")} — pick other beats`); process.exit(1); }
    for (let k = scenes.length - 1; k >= 0; k--) if (sealedIds.has(scenes[k].id)) scenes.splice(k, 1);
    console.log(`sealed holdout: ${sealedIds.size} beat(s) from ${[...new Set(sources)].join(", ")} excluded`);
    if (!scenes.length) { console.error("❌ every beat is sealed — nothing left to check"); process.exit(1); }
  }
  const pick = [];
  const reasons = (s) => allRisks(s, readings);
  if (requested.length) requested.forEach((id) => pick.push({ id, group: "requested", reasons: reasons(byId[id]) }));
  else if (args.n) {
    const n = parseInt(args.n, 10);
    const flagged = shuffle(scenes.filter((s) => selectionFlags(s, readings).length));
    flagged.sort((a, b) => selectionFlags(b, readings).length - selectionFlags(a, readings).length).slice(0, n)
      .forEach((s) => pick.push({ id: s.id, group: "risk", reasons: reasons(s) }));
    const taken = new Set(pick.map((p) => p.id));
    const control = parseInt(args.control ?? "8", 10);
    shuffle(scenes.filter((s) => !taken.has(s.id) && !selectionFlags(s, readings).length)).slice(0, control)
      .forEach((s) => pick.push({ id: s.id, group: "control", reasons: reasons(s) }));
    console.log(`selection flags (bare, strike): ${flagged.length}/${scenes.length} beats flagged; looking at ${pick.length}`);
  } else scenes.forEach((s) => pick.push({ id: s.id, group: "all", reasons: reasons(s) }));
  return pick.map((p) => ({ ...p, frame: sampleFrame(byId[p.id]) })).sort((a, b) => a.frame - b.frame);
}

const pad = (k) => String(k).padStart(3, "0");
const chunksOf = (arr) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, k) => arr.slice(k * CHUNK, (k + 1) * CHUNK));

function prep() {
  if (!args.dry && fs.existsSync(path.join(OUT, "sample.json"))) { console.error(`❌ ${path.relative(ROOT, OUT)} exists — use a new --label`); process.exit(1); }
  const sample = select();
  if (!sample.length) { console.error("❌ nothing to check"); process.exit(1); }
  if (args.dry) { sample.forEach((s) => console.log(`   ${s.id.padEnd(10)} ${s.group.padEnd(9)} f${s.frame} ${s.reasons.join(",")}`)); console.log(`(dry: ${sample.length} beats in ${Math.ceil(sample.length / CHUNK)} chunk(s), nothing rendered)`); return; }
  const IMG = path.join(OUT, "img");
  fs.mkdirSync(IMG, { recursive: true });
  fs.writeFileSync(path.join(OUT, "sample.json"), JSON.stringify(sample, null, 1));
  // the code that renders these stills (ROOT may be a checkout with uncommitted engine files)
  fs.writeFileSync(path.join(OUT, "prep-meta.json"), JSON.stringify({ date: new Date().toISOString(), seed, chunk: CHUNK,
    code: require("./lib/code-fingerprint").codeFingerprint(ROOT) }, null, 1));
  const stillsRoot = path.join("audit", "framecheck", SLUG, LABEL, "stills");
  console.log(`rendering ${sample.length} stills (one bundle; already rendered ones are skipped) ...`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "render-sequence-stills.js"), `--slug=${SLUG}`,
    `--frames=${sample.map((s) => `${s.id}:${s.frame}`).join(",")}`, `--out=${stillsRoot}`], { cwd: ROOT, stdio: "inherit" });
  const D = path.join(ROOT, stillsRoot, SLUG);
  const want = new Set(sample.map((s) => `${s.id}-f${s.frame}.png`));
  const files = fs.readdirSync(D).filter((f) => want.has(f));
  if (files.length !== sample.length) { console.error(`❌ ${files.length}/${sample.length} stills rendered`); process.exit(1); }
  const rnd = rng(seed ^ 0x5bd1e995);
  const order = files.map((f) => [f, rnd()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const key = {};
  order.forEach((f, k) => {
    const id = `img-${pad(k + 1)}.png`;
    key[id] = f;
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", path.join(D, f), "-vf", "crop=iw:ih*0.76:0:0", path.join(IMG, id)]); // the caption band gives the narration away
  });
  fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify(key, null, 2));
  const chunks = chunksOf(Object.keys(key));
  fs.writeFileSync(path.join(OUT, "chunks.json"), JSON.stringify(chunks, null, 1));
  const prompts = chunks.map((imgs, k) => `## Describer ${k + 1} of ${chunks.length} (a fresh agent, model sonnet; it must not know the book)
You are a blind rater. You will look at ${imgs.length} still frames from an animated explainer video with NO audio and NO other context. Do not read any other files in the repository — only the images listed below. Do not search the repo, do not open JSON/config files, do not look at sibling folders or other images.

Images (read each with the Read tool), all in ${IMG}:
${imgs.join(", ")}

Work ONE image at a time: open it, write its entry, then open the next. Never describe from memory of an earlier image.
For EACH image, write: "text" (every word printed on the image, exactly as written, or "none"), "sees" (literal description: people, what they do, their faces, objects, text, diagram, setting; 1-3 sentences), "message" (what the narrator is saying at this moment, one sentence, from the image only), "confidence" (low/medium/high), "wouldConfuse" (anything that could mislead, or "none").

Write ONLY a JSON array [{"img":"${imgs[0]}","text":"...","sees":"...","message":"...","confidence":"...","wouldConfuse":"..."}, ...] to ${path.join(OUT, `blind-${k + 1}.json`)}. Verify it parses and has ${imgs.length} entries. Reply with one line: "written ${imgs.length}".
`).join("\n");
  fs.writeFileSync(path.join(OUT, "PROMPTS.md"), `# Frame check — ${SLUG} / ${LABEL} (report-only, not the mute-test verdict)

Run every describer below as a SEPARATE fresh agent (model sonnet), in parallel. Then:
    node scripts/framecheck.js judge --slug=${SLUG} --label=${LABEL}

${prompts}`);
  const g = {}; sample.forEach((s) => { g[s.group] = (g[s.group] || 0) + 1; });
  console.log(`\n✓ ${path.relative(ROOT, OUT)} — ${order.length} frames (${Object.entries(g).map(([k, v]) => `${k} ${v}`).join(", ")}), ${chunks.length} describer prompt(s) in PROMPTS.md.`);
}

// Same alignment guard as mute-test.js: the printed words a describer reports must exist at that frame.
function screenWordsAt(f) {
  const u = (cfg.scenes || []).find((x) => f >= x.fromFrame && f < x.fromFrame + x.durationFrames);
  if (!u) return null;
  const strs = [...(u.texts || []).map((t) => t.text), ...((u.diagram && u.diagram.labels) || [])].filter(Boolean).join(" ").toUpperCase();
  const w = strs.match(/[A-Z]{4,}/g);
  return w && w.length ? new Set(w) : null;
}
function described() {
  const key = readJSON(path.join(OUT, "key.json"));
  const chunks = readJSON(path.join(OUT, "chunks.json"));
  if (!key || !chunks) { console.error("❌ key.json / chunks.json missing — run prep"); process.exit(1); }
  const all = {};
  let failed = false;
  chunks.forEach((imgs, k) => {
    const f = path.join(OUT, `blind-${k + 1}.json`);
    const blind = readJSON(f);
    if (!Array.isArray(blind)) { console.error(`❌ ${path.basename(f)} missing or not a JSON array`); failed = true; return; }
    const got = new Set(blind.map((d) => d.img));
    const lost = imgs.filter((i) => !got.has(i));
    const foreign = blind.filter((d) => !imgs.includes(d.img)).map((d) => d.img);
    if (lost.length || foreign.length) { console.error(`❌ ${path.basename(f)}: missing ${lost.length} image(s)${foreign.length ? `, ${foreign.length} not in this chunk` : ""}`); failed = true; return; }
    const bad = []; let checked = 0;
    for (const d of blind) {
      const words = screenWordsAt(frameOfFile(key[d.img]));
      const seen = (String(d.text || "").toUpperCase().match(/[A-Z]{4,}/g) || []).filter((x) => !/^(NONE|INSIGHT|TURN)$/.test(x));
      if (!words || seen.length < 2) continue;
      checked++;
      if (!seen.some((x) => words.has(x))) bad.push(`${d.img}: reports "${String(d.text).slice(0, 60)}" — not on this frame`);
    }
    if (checked && bad.length > Math.max(1, Math.floor(checked * 0.1))) {
      console.error(`❌ ${path.basename(f)}: descriptions filed under the wrong images (${bad.length}/${checked}) — re-run that describer fresh:`);
      bad.slice(0, 5).forEach((b) => console.error("   - " + b));
      failed = true; return;
    }
    blind.forEach((d) => { all[frameOfFile(key[d.img])] = { sees: d.sees, message: d.message, wouldConfuse: d.wouldConfuse }; });
  });
  if (failed) process.exit(1);
  return all;
}

const JUDGE_RULES = `For each item give:
A. correctness — CORRECT (the viewer's understood message matches the narration), NEUTRAL (neither matches nor contradicts: just a person, abstract/empty), WRONG (suggests a different or opposite meaning: unrelated object, wrong emotion over tragedy, emphasis where the narration rejects, etc.).
B. contribution — ADDS (the image itself — people's actions/expressions, objects, icons, not only copied text — conveys something the narration means), TEXT_ONLY (only on-screen text carries meaning), NONE.
C. explains — YES only when contribution is ADDS AND the picture itself shows the narration's mechanism, relationship or cause→effect (who does what to whom, what leads to what), not just its subject or mood; otherwise NO.
One short reason each. Be strict and literal; do not reward a version for being prettier or busier.`;

function judge() {
  const A = described();
  const rnd = rng(seed ^ 0xC0FFEE);
  const frames = Object.keys(A).map(Number).map((f) => [f, rnd()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]); // judges see beats out of film order
  const key = {};
  const items = frames.map((f, n) => { const id = `item-${pad(n + 1)}`; key[id] = { frame: f }; return { id, t: `${(f / 30).toFixed(1)}s`, narration: narrationAt(f), V: A[f] }; });
  fs.writeFileSync(path.join(OUT, "judge-key.json"), JSON.stringify(key, null, 2));
  const chunks = chunksOf(items);
  chunks.forEach((c, k) => fs.writeFileSync(path.join(OUT, `judge-input-${k + 1}.json`), JSON.stringify(c, null, 2)));
  fs.appendFileSync(path.join(OUT, "PROMPTS.md"), `
# Judges — run each as a SEPARATE fresh agent (model sonnet), in parallel. Then:
    node scripts/framecheck.js tally --slug=${SLUG} --label=${LABEL}

` + chunks.map((c, k) => `## Judge ${k + 1} of ${chunks.length}
You are an impartial judge of an animated book-summary video. Read ONLY this file: ${path.join(OUT, `judge-input-${k + 1}.json`)}. Do NOT open any other file (never judge-key.json, key.json, sample.json, other judge-input files, books/, scripts/, or image folders).
Each item has the narration spoken around a moment and a blind description (V) of what a viewer with the sound OFF saw.
${JUDGE_RULES}
Write ONLY JSON to ${path.join(OUT, `judge-result-${k + 1}.json`)}: {"items":[{"id":"${c[0].id}","V":{"correctness":"...","why":"...","contribution":"...","whyC":"...","explains":"YES|NO"}}, ...]} (${c.length} items). Verify it parses. Reply with one line: "written ${c.length}".
`).join("\n"));
  console.log(`✓ ${items.length} items in ${chunks.length} judge chunk(s). Give the judge prompts in PROMPTS.md to fresh agents.`);
}

function tally() {
  const key = readJSON(path.join(OUT, "judge-key.json"));
  const sample = readJSON(path.join(OUT, "sample.json"), []);
  if (!key) { console.error("❌ judge-key.json missing — run judge"); process.exit(1); }
  const inputs = {}, results = {};
  for (const f of fs.readdirSync(OUT)) {
    if (/^judge-input-\d+\.json$/.test(f)) (readJSON(path.join(OUT, f), []) || []).forEach((x) => { inputs[x.id] = x; });
    if (/^judge-result-\d+\.json$/.test(f)) ((readJSON(path.join(OUT, f), {}) || {}).items || []).forEach((x) => { results[x.id] = x; });
  }
  const missing = Object.keys(key).filter((id) => !results[id] || !results[id].V);
  if (missing.length) console.warn(`⚠ ${missing.length}/${Object.keys(key).length} items have no judge verdict (${missing.slice(0, 8).join(",")}${missing.length > 8 ? ",…" : ""}) — the report covers the rest only`);
  const byFrame = Object.fromEntries(sample.map((s) => [s.frame, s]));
  const rows = Object.keys(key).filter((id) => results[id] && results[id].V).map((id) => {
    const s = byFrame[key[id].frame] || {}; const v = results[id].V; const inp = inputs[id] || {};
    return { scene: s.id, frame: key[id].frame, group: s.group, reasons: s.reasons || [], t: inp.t, correctness: v.correctness, contribution: v.contribution,
      explains: v.explains, why: v.why, whyC: v.whyC, sees: inp.V && inp.V.sees, narration: inp.narration };
  }).sort((a, b) => a.frame - b.frame);
  const count = (sel) => ({ n: sel.length, WRONG: sel.filter((x) => x.correctness === "WRONG").length, dead: sel.filter((x) => x.contribution === "NONE").length, ADDS: sel.filter((x) => x.contribution === "ADDS").length });
  const groups = {}; for (const g of [...new Set(rows.map((x) => x.group))]) groups[g] = count(rows.filter((x) => x.group === g));
  const byFlag = {}; for (const fl of ["bare", "strike", "icon", "polarity"]) byFlag[fl] = count(rows.filter((x) => x.reasons.some((r) => r.split(":")[0] === fl)));
  byFlag.none = count(rows.filter((x) => !x.reasons.length));
  const findings = rows.filter((x) => x.correctness === "WRONG" || x.contribution === "NONE");
  const report = { slug: SLUG, label: LABEL, date: new Date().toISOString(), reportOnly: true, verdict: null,
    code: (readJSON(path.join(OUT, "prep-meta.json"), {}) || {}).code || null,
    coverage: { judged: rows.length, sampled: Object.keys(key).length, beats: scenes.length },
    note: "Blind look at real frames. NOT the mute-test verdict; changes nothing. Read each finding before changing a beat; re-check changed beats with a new label (--beats=).",
    groups, byFlag, findings, rows };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  const histPath = path.join(BOOK, "framecheck.json");
  const hist = readJSON(histPath, { note: "framecheck.js runs (report-only; the verdict is mute-test.json)", runs: [] });
  hist.runs = hist.runs.filter((x) => x.label !== LABEL).concat([{ label: LABEL, date: report.date, coverage: report.coverage, groups, byFlag,
    findings: findings.map((f) => ({ scene: f.scene, reasons: f.reasons, verdict: `${f.correctness}/${f.contribution}`, why: f.why })) }]);
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 2) + "\n");
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "-");
  const line = (k, v) => `   ${k.padEnd(10)} n=${String(v.n).padStart(3)}  WRONG ${v.WRONG} (${pct(v.WRONG, v.n)})  dead ${v.dead} (${pct(v.dead, v.n)})  ADDS ${v.ADDS} (${pct(v.ADDS, v.n)})`;
  console.log(`── framecheck · ${SLUG}/${LABEL} · ${rows.length}/${scenes.length} beats judged (report-only, not a verdict)`);
  Object.entries(groups).forEach(([k, v]) => console.log(line(k, v)));
  console.log("   by flag:"); Object.entries(byFlag).forEach(([k, v]) => v.n && console.log(line(k, v)));
  if (findings.length) { console.log("   findings (read each before changing anything):"); findings.forEach((f) => console.log(`   - ${f.scene} ${f.t} [${f.reasons.join(",") || "no flag"}] ${f.correctness}/${f.contribution} — ${f.why} | saw: ${String(f.sees || "").slice(0, 110)}`)); }
  console.log(`✓ ${path.relative(ROOT, path.join(OUT, "report.json"))} · history ${path.relative(ROOT, histPath)}`);
}

// ── SEQUENCE MODE (2026-10-23, roadmap P1) — does a multi-beat passage read as ONE developing process? ─────────
// A single frame that passes says nothing about whether start -> change -> result reads. For each passage, render
// --per-beat moments of every beat (early / middle / late), crop the caption band, and tile them into ONE strip
// (a row per beat, time left to right). A fresh blind describer tells the story of the strip; a judge compares it
// with the passage's narration: per row CORRECT/NEUTRAL/WRONG, ADDS/TEXT_ONLY/NONE, EXPLAINS; per passage the event,
// the change, continuity (the same person / object / diagram kept), invented events, a process beyond single frames.
// Report-only like the rest of framecheck: it never edits anything, never blocks, never writes framecheck.json.
const SEQ_FRACTIONS = { 1: [0.6], 2: [0.3, 0.85], 3: [0.2, 0.55, 0.9], 4: [0.15, 0.4, 0.65, 0.9] };
function passagesOf() {
  const all = scenes.filter((s) => /^scene-\d+$/.test(s.id));
  const num = (s) => parseInt(s.id.slice(6), 10);
  if (!args.passages || args.passages === "all") return [all];
  return String(args.passages).split(",").map((r) => {
    const [a, b] = r.split("-").map((x) => parseInt(x, 10));
    const p = all.filter((s) => num(s) >= a && num(s) <= (Number.isFinite(b) ? b : a));
    if (!p.length) { console.error(`❌ no scenes in passage ${r}`); process.exit(1); }
    return p;
  });
}
function sequence() {
  if (fs.existsSync(path.join(OUT, "seq.json"))) { console.error(`❌ ${path.relative(ROOT, OUT)} exists — use a new --label`); process.exit(1); }
  const per = Math.max(1, Math.min(4, parseInt(args["per-beat"] || "3", 10)));
  // never look at an open sealed holdout (runbook §4): a passage that contains a sealed beat is refused
  const muteRoot = path.join(ROOT, "audit", "mute", SLUG), sealed = new Set();
  for (const l of fs.existsSync(muteRoot) ? fs.readdirSync(muteRoot) : []) {
    const s = readJSON(path.join(muteRoot, l, "seal.json"));
    if (s && Array.isArray(s.ids) && !fs.existsSync(path.join(muteRoot, l, "totals.json"))) s.ids.forEach((id) => sealed.add(id));
  }
  const hit = passagesOf().flat().filter((s) => sealed.has(s.id)).map((s) => s.id);
  if (hit.length) { console.error(`❌ passage(s) contain sealed holdout beat(s): ${hit.join(",")} — pick other passages`); process.exit(1); }
  const passages = passagesOf().map((sc, k) => ({ strip: `strip-${pad(k + 1)}.png`, scenes: sc.map((s) => ({ id: s.id, from: s.fromFrame, to: s.fromFrame + s.durationFrames,
    frames: SEQ_FRACTIONS[per].map((f) => Math.round(s.fromFrame + Math.min(s.durationFrames - 4, Math.max(2, s.durationFrames * f)))) })) }));
  const frames = passages.flatMap((p) => p.scenes.flatMap((s) => s.frames.map((f) => `${s.id}:${f}`)));
  fs.mkdirSync(path.join(OUT, "strips"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "seq.json"), JSON.stringify({ perBeat: per, passages }, null, 1));
  const stillsRoot = path.join("audit", "framecheck", SLUG, LABEL, "stills");
  console.log(`rendering ${frames.length} stills for ${passages.length} passage(s) (one bundle) ...`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "render-sequence-stills.js"), `--slug=${SLUG}`, `--frames=${frames.join(",")}`, `--out=${stillsRoot}`], { cwd: ROOT, stdio: "inherit" });
  const D = path.join(ROOT, stillsRoot, SLUG), T = path.join(OUT, "tiles");
  fs.mkdirSync(T, { recursive: true });
  for (const p of passages) {
    const list = p.scenes.flatMap((s) => s.frames.map((f) => path.join(D, `${s.id}-f${f}.png`)));
    const miss = list.filter((f) => !fs.existsSync(f));
    if (miss.length) { console.error(`❌ ${miss.length} still(s) missing for ${p.strip}`); process.exit(1); }
    // crop the caption band (it gives the narration away), shrink, tile: one row per beat
    list.forEach((f, n) => execFileSync("ffmpeg", ["-y", "-v", "error", "-i", f, "-vf", "crop=iw:ih*0.76:0:0,scale=640:-2", path.join(T, `${p.strip}-${pad(n + 1)}.png`)]));
    execFileSync("ffmpeg", ["-y", "-v", "error", "-framerate", "1", "-i", path.join(T, `${p.strip}-%03d.png`), "-vf", `tile=${per}x${p.scenes.length}:padding=10:color=white`, "-frames:v", "1", path.join(OUT, "strips", p.strip)]);
  }
  const strips = passages.map((p) => path.join(OUT, "strips", p.strip));
  fs.writeFileSync(path.join(OUT, "PROMPTS.md"), `# Sequence check — ${SLUG} / ${LABEL} (report-only, not a verdict)

## Describer (a fresh agent, model sonnet; it must not know the book)
You are a blind viewer. Each image below is a STRIP from a short animated explainer passage with NO sound: every ROW is one moment of the passage (top = first), and the ${per} frame(s) in a row run left to right in time. Do not read any other files — only these images; do not search the repository.
Images (read each with the Read tool, ONE at a time, and write its entry before opening the next):
${strips.join("\n")}
For EACH strip write: "strip" (its file name), "rows": [{"row":1,"text":"every word printed in that row, or none","sees":"literal: people, what they do, faces, objects, diagram, setting","message":"what the narrator is saying at that moment, one sentence"} ... one per row], "story" (what happens from the first row to the last, 2-4 sentences), "changes" (what changes from row to row), "sameThroughout" (which person / object / diagram stays across rows, or "nothing"), "result" (how it ends), "wouldConfuse" (anything misleading, or "none").
Write ONLY a JSON array of those objects to ${path.join(OUT, "blind.json")}. Verify it parses and has ${strips.length} entries. Reply with one line: "written ${strips.length}".
`);
  console.log(`✓ ${path.relative(ROOT, OUT)} — ${passages.length} strip(s) (${passages.map((p) => p.scenes.length).join("+")} beats × ${per}); give PROMPTS.md to a fresh describer, then: framecheck.js sequence-judge`);
}
const SEQ_JUDGE = `For EACH strip: per row (one per beat, in order) give correctness (CORRECT / NEUTRAL / WRONG, as defined below), contribution (ADDS / TEXT_ONLY / NONE) and explains (YES / NO), with the row number; then for the passage:
- eventUnderstood: YES / PARTLY / NO — does the viewer's "story" match what the passage's narration is about?
- changeUnderstood: YES / PARTLY / NO — did the viewer see the change the narration describes (from the start to the result)?
- continuity: YES / NO / N/A — when the narration keeps one idea, did the viewer see the same person / object / diagram carried across rows (N/A when the narration itself jumps between unrelated points)?
- invented: events, people or objects the viewer read that the narration does NOT have (a list, or []).
- process: YES / NO — does the strip as a whole show a meaningful process (start -> change -> result) that single frames would not?
- why: one or two sentences.
${JUDGE_RULES}`;
function sequenceJudge() {
  const seq = readJSON(path.join(OUT, "seq.json")), blind = readJSON(path.join(OUT, "blind.json"));
  if (!seq || !Array.isArray(blind)) { console.error("❌ seq.json / blind.json missing — run sequence, then the describer"); process.exit(1); }
  const by = new Map(blind.map((b) => [b.strip, b]));
  const items = seq.passages.map((p) => {
    const d = by.get(p.strip);
    if (!d) { console.error(`❌ no description for ${p.strip}`); process.exit(1); }
    if ((d.rows || []).length !== p.scenes.length) console.warn(`⚠ ${p.strip}: ${(d.rows || []).length} rows described, ${p.scenes.length} beats`);
    return { id: p.strip.replace(".png", ""), narration: p.scenes.map((s, n) => ({ row: n + 1, said: (cfg.captions || []).filter((k) => k.endFrame > s.from && k.startFrame < s.to).map((k) => k.text).join(" ") })),
      viewer: { rows: d.rows, story: d.story, changes: d.changes, sameThroughout: d.sameThroughout, result: d.result, wouldConfuse: d.wouldConfuse } };
  });
  fs.writeFileSync(path.join(OUT, "judge-input.json"), JSON.stringify(items, null, 2));
  fs.appendFileSync(path.join(OUT, "PROMPTS.md"), `
## Judge (another fresh agent, model sonnet)
You are an impartial judge of an animated book-summary video. Read ONLY ${path.join(OUT, "judge-input.json")} (never seq.json, the strips, books/ or scripts/). Each item is one passage: the narration spoken in each row and a blind viewer's account of the silent strip.
${SEQ_JUDGE}
Write ONLY JSON to ${path.join(OUT, "judge-result.json")}: [{"id":"${items[0].id}","rows":[{"row":1,"correctness":"...","contribution":"...","explains":"YES|NO"}],"eventUnderstood":"...","changeUnderstood":"...","continuity":"...","invented":[],"process":"...","why":"..."}, ...] (${items.length} items). Verify it parses. Reply with one line: "written ${items.length}".
`);
  console.log(`✓ judge-input.json (${items.length} passage(s)). Give the Judge section of PROMPTS.md to a fresh agent, then: framecheck.js sequence-tally`);
}
function sequenceTally() {
  const seq = readJSON(path.join(OUT, "seq.json")), res = readJSON(path.join(OUT, "judge-result.json"));
  if (!seq || !Array.isArray(res)) { console.error("❌ seq.json / judge-result.json missing"); process.exit(1); }
  const by = new Map(res.map((r) => [r.id, r]));
  const rows = seq.passages.map((p) => {
    const r = by.get(p.strip.replace(".png", "")) || {};
    const rr = r.rows || [];
    const c = (f, v) => rr.filter((x) => x[f] === v).length;
    return { strip: p.strip, scenes: p.scenes.map((s) => s.id), seconds: +((p.scenes[p.scenes.length - 1].to - p.scenes[0].from) / 30).toFixed(1), beats: rr.length,
      WRONG: c("correctness", "WRONG"), dead: c("contribution", "NONE"), ADDS: c("contribution", "ADDS"), EXPLAINS: rr.filter((x) => x.contribution === "ADDS" && x.explains === "YES").length,
      eventUnderstood: r.eventUnderstood || null, changeUnderstood: r.changeUnderstood || null, continuity: r.continuity || null, invented: r.invented || [], process: r.process || null, why: r.why || "" };
  });
  const report = { slug: SLUG, label: LABEL, date: new Date().toISOString(), reportOnly: true, verdict: null, mode: "sequence", perBeat: seq.perBeat,
    note: "Blind reading of multi-beat strips. NOT the mute-test verdict; changes nothing.", passages: rows };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`── sequence check · ${SLUG}/${LABEL} (report-only, not a verdict)`);
  for (const r of rows) console.log(`   ${r.strip} ${r.scenes[0]}..${r.scenes[r.scenes.length - 1]} (${r.seconds}s, ${r.beats} beats)  event ${r.eventUnderstood}  change ${r.changeUnderstood}  continuity ${r.continuity}  process ${r.process}  WRONG ${r.WRONG} dead ${r.dead} ADDS ${r.ADDS} EXPLAINS ${r.EXPLAINS}${r.invented.length ? `  invented: ${r.invented.join("; ")}` : ""}`);
  console.log(`✓ ${path.relative(ROOT, path.join(OUT, "report.json"))}`);
}

if (require.main === module) ({ prep, judge, tally, sequence, "sequence-judge": sequenceJudge, "sequence-tally": sequenceTally })[CMD]();
