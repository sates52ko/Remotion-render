#!/usr/bin/env node
/**
 * own-icons-sheet.js — SEE a book's own icons before anyone authors with them.
 *
 * books/<slug>/motifs.json is drawn blind: SBC's casserole read as "a toaster",
 * Unhinged's dopamineHook as "a rope" and tattooNeedle as "a syringe" — found only
 * by a full render + mute test. This draws every own icon as the engine does
 * (customSvg paths, ink/accent from the book palette) on one numbered contact
 * sheet in a few seconds (headless Chrome, no Remotion bundle), with NO names.
 *
 *   node scripts/own-icons-sheet.js --slug=<slug>
 *     -> books/<slug>/storyboard/own-icons.png + own-icons.key.json + OWN-ICONS-PROMPT.md
 * Then a FRESH agent names each numbered icon in 1-3 words (prompt written for you).
 * An icon it cannot name as intended is redrawn before storyboard prep.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/own-icons-sheet.js --slug=<slug>"); process.exit(1); }
const BOOK = path.join(ROOT, "books", SLUG);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

const raw = readJSON(path.join(BOOK, "motifs.json"), {}) || {};
const motifs = raw.motifs || raw;
const keys = Object.keys(motifs);
if (!keys.length) { console.log(`no own icons in books/${SLUG}/motifs.json — nothing to check`); process.exit(0); }
const book = readJSON(path.join(BOOK, "book.json"), {}) || {};
const pal = book.palette || {};
const INK = pal.ink || "#1A1412", ACCENT = pal.red || pal.accent || "#C2410C", PAPER = pal.paper || "#FAF7F2";
const col = (v, dflt) => (v === "accent" ? ACCENT : v === "ink" ? INK : v || dflt);

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

const outDir = path.join(BOOK, "storyboard");
fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, "own-icons.html");
fs.writeFileSync(htmlPath, html);
const png = path.join(outDir, "own-icons.png");
const rows = Math.ceil(keys.length / colsN);
const chrome = [
  path.join(ROOT, "node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe"),
  path.join(ROOT, "node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"),
  path.join(ROOT, "node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
].find((p) => fs.existsSync(p));
if (!chrome) { console.error("❌ no headless Chrome under node_modules/.remotion — run any Remotion render once"); process.exit(1); }
execFileSync(chrome, ["--headless", "--disable-gpu", "--hide-scrollbars", `--window-size=${colsN * 360 + 40},${rows * 360 + 40}`, `--screenshot=${png}`, "file:///" + htmlPath.replace(/\\/g, "/")], { stdio: "ignore" });
fs.writeFileSync(path.join(outDir, "own-icons.key.json"), JSON.stringify(Object.fromEntries(keys.map((k, n) => [n + 1, { key: k, intended: motifs[k].reads || motifs[k].title || k }])), null, 2));
fs.writeFileSync(path.join(outDir, "OWN-ICONS-PROMPT.md"), `# Own-icon check — ${SLUG}

Give this to a FRESH agent (model: sonnet) that has not seen motifs.json:

You are a blind rater. Look ONLY at ${png} (Read it). It shows ${keys.length} numbered icons from an animated explainer. For each number write, in 1-3 words, what object it is — the first thing a stranger would say. Do not open any other file. Reply as lines "N: <words>".

Then compare with ${path.join(outDir, "own-icons.key.json")} (intended). Redraw every icon named as something else (SBC casserole → "toaster", Unhinged dopamineHook → "rope") and run this sheet again before storyboard prep.
`);
console.log(`✓ ${path.relative(ROOT, png)} — ${keys.length} own icon(s). Blind-name them: ${path.relative(ROOT, path.join(outDir, "OWN-ICONS-PROMPT.md"))}`);
