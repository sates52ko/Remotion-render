#!/usr/bin/env node
/**
 * own-icons-sheet.js — SEE a book's own icons and drawings before anyone authors with them.
 *
 * books/<slug>/motifs.json is drawn blind: SBC's casserole read as "a toaster",
 * Unhinged's dopamineHook as "a rope" and tattooNeedle as "a syringe" — found only
 * by a full render + mute test. This draws every own icon as the engine does
 * (customSvg paths, ink/accent from the book palette) on one numbered contact
 * sheet in a few seconds (headless Chrome, no Remotion bundle), with NO names.
 *
 *   node scripts/own-icons-sheet.js --slug=<slug> [--book-root=<checkout>]
 *     -> books/<slug>/storyboard/own-icons.png + own-icons.key.json + OWN-ICONS-PROMPT.md      (motifs.json)
 *     -> books/<slug>/storyboard/own-drawings/NN.png + own-drawings.key.json + OWN-DRAWINGS-PROMPT.md
 *        (told v2, 2026-11-16: every drawing of storyboard/entities.json — each thing, each of its STATES, each place's
 *         BACKDROP — ONE PICTURE PER FILE, because a blind rater names one image at a time)
 * Then a FRESH agent names each numbered picture in 1-3 words (the prompts are written for you).
 *
 *   node scripts/own-icons-sheet.js --slug=<slug> --judge=<answers.json>      { "1": "sailing ship", "2": "typewriter", … }
 *     -> books/<slug>/storyboard/own-drawings.verdict.json: each drawing's blind name against the readings the lead
 *        agent accepted BEFORE the test (`reads`), bound to the drawing's hash. Exit 1 when one was read as something
 *        else. `storyboard.js merge` refuses a told beat that uses a drawing without a passing verdict — redraw it, or
 *        remove its paths (the emblem is the fallback), and run the sheet again.
 * A motif icon it cannot name as intended is redrawn before storyboard prep (as before).
 */
const fs = require("fs");
const path = require("path");
const OD = require("./lib/own-drawings");

const CODE = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
if (typeof SLUG !== "string") { console.error("Usage: node scripts/own-icons-sheet.js --slug=<slug> [--book-root=<checkout>] [--judge=<answers.json>]"); process.exit(1); }
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : CODE);
const BOOK = path.join(ROOT, "books", SLUG);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return d; } };
const outDir = path.join(BOOK, "storyboard");
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

const own = OD.readBook(BOOK);
const drawings = own.drawings;

// ── --judge: the blind names against the accepted readings → the verdict merge reads ────────────────────────────────
if (args.judge) {
  if (typeof args.judge !== "string" || !fs.existsSync(args.judge)) { console.error(`✗ --judge=<answers.json>: a file { "<number>": "<the blind name>" } (${args.judge} not found)`); process.exit(1); }
  if (!drawings.length) { console.log(`no drawings in ${rel(path.join(outDir, "entities.json"))} — nothing to judge`); process.exit(0); }
  const key = readJSON(path.join(outDir, "own-drawings.key.json"), null);
  // the answers are numbered by the sheet that was SHOWN: a drawing changed since then has no blind name
  const stale = !key ? ["the sheet was never printed"] : drawings.filter((d, n) => !key[n + 1] || key[n + 1].key !== d.key || key[n + 1].hash !== d.hash).map((d) => `"${d.key}" changed after the sheet was printed`);
  if (stale.length) { console.error(`✗ ${stale.join("; ")} — run the sheet again (without --judge) and have it named again`); process.exit(1); }
  const verdict = { ...OD.judge(drawings, readJSON(args.judge, {}) || {}), slug: SLUG, at: new Date().toISOString() };
  fs.writeFileSync(own.verdictFile, JSON.stringify(verdict, null, 2));
  for (const [k, r] of Object.entries(verdict.drawings)) console.log(`  ${r.ok ? "✓" : "✗"} ${String(r.n).padStart(2)}  ${k.padEnd(28)} read as "${r.answer == null ? "— (no answer)" : r.answer}"${r.ok ? "" : `   wanted: ${r.accepted.join(" / ")}`}`);
  console.log(`${verdict.named} of ${verdict.total} drawings named as intended → ${rel(own.verdictFile)}`);
  if (verdict.named < verdict.total) { console.log(`REDRAW the ✗ ones (or remove their paths: the emblem is the fallback), run the sheet and the blind naming again. Never add the misreading to "reads".`); process.exit(1); }
  process.exit(0);
}

const raw = readJSON(path.join(BOOK, "motifs.json"), {}) || {};
const motifs = raw.motifs || raw;
const keys = Object.keys(motifs);
if (!keys.length && !drawings.length) { console.log(`no own icons in books/${SLUG}/motifs.json and no drawings in storyboard/entities.json — nothing to check`); process.exit(0); }
const pal = own.palette;
const INK = pal.ink || "#1A1412", ACCENT = pal.red || pal.accent || "#C2410C", PAPER = pal.paper || "#FAF7F2";
const col = (v, dflt) => (v === "accent" ? ACCENT : v === "ink" ? INK : v || dflt);
const svgPaths = (paths) => (paths || []).map((p) => {
  const fill = col(p.fill, "none");
  const stroke = p.stroke == null && fill !== "none" ? "none" : col(p.stroke, INK);
  const sw = p.strokeWidth ?? (fill === "none" ? 7 : 0);
  return `<path d="${String(p.d).replace(/"/g, "")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${p.opacity ?? 1}"/>`;
}).join("");

fs.mkdirSync(outDir, { recursive: true });
const chrome = [
  path.join(CODE, "node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"),
  path.join(CODE, "node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"),
  path.join(CODE, "node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
].find((p) => fs.existsSync(p));
if (!chrome) { console.error("❌ no headless Chrome under node_modules/.remotion — run any Remotion render once"); process.exit(1); }
// One picture per drawing = one browser start per drawing. Measured (Windows, 2026-11-16): the picture is on disk
// after 5–13 s but the headless shell lingers ~2 minutes before it exits — 12 drawings took 24 minutes. So: start it,
// wait for the file to be written and stop growing, then end the process ourselves.
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function shoot(htmlPath, png, w, h) {
  const t0 = Date.now();
  const child = require("child_process").spawn(chrome, ["--headless", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--disable-background-networking", `--window-size=${w},${h}`, `--screenshot=${png}`, "file:///" + htmlPath.replace(/\\/g, "/")], { stdio: "ignore" });
  let size = -1, same = 0, done = false;
  while (Date.now() - t0 < 90000) {
    nap(250);
    const st = fs.existsSync(png) ? fs.statSync(png) : null;
    if (st && st.mtimeMs >= t0 - 1000 && st.size > 0) { same = st.size === size ? same + 1 : 0; size = st.size; if (same >= 3) { done = true; break; } }
  }
  // the shell starts helpers of its own: end the whole tree (only this child's), and never let it hold this script open
  try { if (process.platform === "win32") require("child_process").spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL"); } catch { /* it had exited */ }
  child.unref();
  if (!done) { console.error(`❌ headless Chrome wrote no picture for ${path.basename(png)} in 90 s`); process.exit(1); }
}

// ── motifs.json: the numbered contact sheet (unchanged) ─────────────────────────────────────────────────────────────
if (keys.length) {
  const cells = keys.map((k, n) => {
    const m = motifs[k];
    const paths = (m.paths || []).map((p) => {
      const fill = col(p.fill, "none");
      const stroke = col(p.stroke, INK);
      const sw = p.strokeWidth ?? (fill === "none" ? 7 : 0);
      return `<path d="${String(p.d).replace(/"/g, "")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${p.opacity ?? 1}"/>`;
    }).join("");
    return `<div class="c"><div class="n">${n + 1}</div><svg viewBox="${m.viewBox || "0 0 520 520"}" width="300" height="300">${paths}</svg></div>`;
  }).join("");
  const colsN = Math.min(4, keys.length);
  const html = `<!doctype html><html><body style="margin:0;background:${PAPER};font-family:Arial">
<style>.g{display:grid;grid-template-columns:repeat(${colsN},340px);gap:20px;padding:20px}.c{background:#fff;border-radius:12px;padding:20px;position:relative}.n{position:absolute;top:8px;left:12px;font:bold 28px Arial;color:#888}</style>
<div class="g">${cells}</div></body></html>`;
  const htmlPath = path.join(outDir, "own-icons.html");
  fs.writeFileSync(htmlPath, html);
  const png = path.join(outDir, "own-icons.png");
  const rows = Math.ceil(keys.length / colsN);
  shoot(htmlPath, png, colsN * 360 + 40, rows * 360 + 40);
  fs.writeFileSync(path.join(outDir, "own-icons.key.json"), JSON.stringify(Object.fromEntries(keys.map((k, n) => [n + 1, { key: k, intended: motifs[k].reads || motifs[k].title || k }])), null, 2));
  fs.writeFileSync(path.join(outDir, "OWN-ICONS-PROMPT.md"), `# Own-icon check — ${SLUG}

Give this to a FRESH agent (model: sonnet) that has not seen motifs.json:

You are a blind rater. Look ONLY at ${png} (Read it). It shows ${keys.length} numbered icons from an animated explainer. For each number write, in 1-3 words, what object it is — the first thing a stranger would say. Do not open any other file. Reply as lines "N: <words>".

Then compare with ${path.join(outDir, "own-icons.key.json")} (intended). Redraw every icon named as something else (SBC casserole → "toaster", Unhinged dopamineHook → "rope") and run this sheet again before storyboard prep.
`);
  console.log(`✓ ${rel(png)} — ${keys.length} own icon(s). Blind-name them: ${rel(path.join(outDir, "OWN-ICONS-PROMPT.md"))}`);
}

// ── entities.json: every drawing a told stage can show, ONE PICTURE PER FILE ────────────────────────────────────────
if (drawings.length) {
  const problems = [...own.errors, ...OD.drawingProblems(drawings)];
  if (problems.length) {
    for (const m of problems) console.error(`  ✗ ${m}`);
    console.error(`❌ ${problems.length} problem(s) in the drawings of ${rel(path.join(outDir, "entities.json"))} — fix them first (how to draw one: storyboard/entities.candidates.json "drawing", told.md). Nothing was printed.`);
    process.exit(1);
  }
  const dir = path.join(outDir, "own-drawings");
  fs.mkdirSync(dir, { recursive: true }); // pictures of an earlier, longer list are left alone: the prompt names the range
  const num = (n) => String(n + 1).padStart(2, "0");
  drawings.forEach((d, n) => {
    // as on stage: on the stage's paper; a backdrop wide, a thing in its square. No name, no number in the picture.
    const [, , vw, vh] = d.viewBox.split(/[\s,]+/).map(Number), W = d.backdrop ? 960 : 520, H = Math.round((W * vh) / vw);
    const htmlPath = path.join(dir, `${num(n)}.html`);
    fs.writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;background:#F2F0EA"><svg viewBox="${d.viewBox}" width="${W}" height="${H}" style="display:block;margin:20px">${svgPaths(d.paths)}</svg></body></html>`);
    shoot(htmlPath, path.join(dir, `${num(n)}.png`), W + 40, H + 40);
    fs.unlinkSync(htmlPath);
  });
  fs.writeFileSync(path.join(outDir, "own-drawings.key.json"), JSON.stringify(Object.fromEntries(drawings.map((d, n) => [n + 1, { key: d.key, intended: d.intended, accepted: d.accepted, hash: d.hash, file: `own-drawings/${num(n)}.png` }])), null, 2));
  const answers = path.join(outDir, "own-drawings.answers.json");
  fs.writeFileSync(path.join(outDir, "OWN-DRAWINGS-PROMPT.md"), `# Own-drawing check — ${SLUG} (told v2)

Give this to a FRESH agent (model: sonnet) that has seen neither entities.json, the key file nor the book:

You are a blind rater. The folder ${dir} holds ${drawings.length} pictures, 01.png … ${num(drawings.length - 1)}.png, each a flat drawing from an animated explainer. Read them ONE AT A TIME, in order. For each, write in 1-3 words what it shows — the first thing a stranger would say (an object, an animal, a vehicle, a kind of place). Do not guess a story, do not open any other file. Write your answers to ${answers} as JSON: { "1": "<words>", "2": "<words>", … } and reply with the same lines.

Then: node scripts/own-icons-sheet.js --slug=${SLUG} --judge=${answers}
It compares each name with the readings accepted in entities.json ("reads") and writes own-drawings.verdict.json. Redraw every drawing read as something else and run this sheet again — a told beat that uses it is refused at merge. Never add the misreading to "reads".
`);
  console.log(`✓ ${rel(dir)}/ — ${drawings.length} drawing(s) of entities.json, one per file (${drawings.filter((d) => d.state).length} state(s), ${drawings.filter((d) => d.backdrop).length} backdrop(s)). Blind-name them: ${rel(path.join(outDir, "OWN-DRAWINGS-PROMPT.md"))}`);
}
console.log(`  Naming the icons (a fresh blind agent) is a ${require("./lib/next-step").ROUTINE}`);
process.exit(0);
