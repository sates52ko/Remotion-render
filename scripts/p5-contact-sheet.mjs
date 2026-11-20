/**
 * p5-contact-sheet.mjs — Vision-free 10x, P5: human blind check, suspicious-first.
 *
 * Takes the P3 gate report, ranks the most suspicious scenes, and emits:
 *   - contact-sheet.html : one-page grid for the operator's 1–2 minute
 *     GOOD / WRONG / UNCERTAIN blind pass (verdicts copyable as JSON), and
 *   - p5-suspects.md     : the same list + per-scene still-render commands.
 *
 * No LLM/Vision. The HTML embeds stills when they exist under --stills
 * (searched as <stills>/<book>-<sceneId>.png, <stills>/<book>/<sceneId>.png,
 * <stills>/<sceneId>.png) and otherwise renders a "still pending" placeholder
 * with the exact `npx remotion still` command.
 *
 * Usage: node scripts/p5-contact-sheet.mjs [--report=audit/visionless-10x/p3-gate.json] [--top=20] [--stills=audit/visionless-10x/stills]
 */
import fs from "fs";
import path from "path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const root = process.cwd();
const OUT_DIR = path.join(root, "audit", "visionless-10x");
const reportPath = path.resolve(root, args.report || path.join(OUT_DIR, "p3-gate.json"));
const TOP = Number(args.top || 20);
const stillsDir = args.stills ? path.resolve(root, String(args.stills)) : path.join(OUT_DIR, "stills");

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const suspects = (report.suspects || []).slice(0, TOP);
if (!suspects.length) {
  console.error("No suspects in report — run scripts/p3-visionless-gate.mjs first.");
  process.exit(1);
}

function findStill(book, sceneId) {
  const candidates = [
    path.join(stillsDir, `${book}-${sceneId}.png`),
    path.join(stillsDir, book, `${sceneId}.png`),
    path.join(stillsDir, `${sceneId}.png`),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return path.relative(OUT_DIR, c).replace(/\\/g, "/");
  return null;
}

const rows = suspects.map((s) => ({ ...s, still: findStill(s.book, s.sceneId) }));
const withStills = rows.filter((r) => r.still).length;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chip = (flag) => {
  const cls = /IDLE_WALLPAPER|INTENT_NOT_STAGED|IDLE_ACTOR/.test(flag) ? "bad"
    : /GENERIC|DUPLICATE|TRUNCATED|EMPTY/.test(flag) ? "warn"
    : "info";
  return `<span class="chip ${cls}">${esc(flag)}</span>`;
};

const cards = rows.map((r, i) => `
<article class="card" data-idx="${i}">
  <header>
    <span class="idx">#${i + 1}</span>
    <strong>${esc(r.book)}</strong>
    <span class="scene">${esc(r.sceneId)} · frame ${r.captureFrame} · score ${r.score}</span>
  </header>
  <div class="imgbox">${r.still
    ? `<img src="${r.still}" alt="${esc(r.sceneId)}" loading="lazy">`
    : `<div class="pending"><code>npx remotion still Antidote-${esc(r.book)} audit/visionless-10x/stills/${esc(r.book)}-${esc(r.sceneId)}.png --frame=${r.captureFrame}</code></div>`}</div>
  <p class="narration">“${esc(r.narration)}”</p>
  <div class="meta">${esc(r.archetype)} · shot: ${esc(r.shot)} · ${r.flags.length ? r.flags.map(chip).join(" ") : '<span class="chip info">flagged by score</span>'}</div>
  <div class="verdict">
    <label><input type="radio" name="v${i}" value="GOOD">GOOD</label>
    <label><input type="radio" name="v${i}" value="WRONG">WRONG</label>
    <label><input type="radio" name="v${i}" value="UNCERTAIN">UNCERTAIN</label>
  </div>
</article>`).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>P5 Visionless Contact Sheet — ${rows.length} suspects</title>
<style>
  :root { color-scheme: dark; }
  body { background:#101216; color:#e8eaed; font:14px/1.45 system-ui, sans-serif; margin:0; padding:24px; }
  h1 { font-size:18px; margin:0 0 4px; } .sub { color:#9aa0a6; margin-bottom:18px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
  .card { background:#181b20; border:1px solid #2a2f36; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px; }
  .card header { display:flex; flex-wrap:wrap; gap:6px; align-items:baseline; font-size:12px; }
  .idx { color:#fbbc04; font-weight:700; }
  .scene { color:#9aa0a6; }
  .imgbox { background:#0b0d10; border-radius:6px; overflow:hidden; min-height:120px; display:flex; align-items:center; justify-content:center; }
  .imgbox img { width:100%; height:auto; display:block; }
  .pending { color:#5f6368; font-size:10px; padding:10px; word-break:break-all; }
  .narration { margin:0; font-size:12px; color:#c8cbd0; font-style:italic; }
  .meta { font-size:11px; color:#9aa0a6; }
  .chip { display:inline-block; border-radius:999px; padding:1px 8px; font-size:10px; margin-right:4px; border:1px solid; }
  .chip.bad { color:#f28b82; border-color:#f28b82; }
  .chip.warn { color:#fdd663; border-color:#fdd663; }
  .chip.info { color:#8ab4f8; border-color:#8ab4f8; }
  .verdict { display:flex; gap:14px; font-size:12px; border-top:1px solid #2a2f36; padding-top:8px; }
  .toolbar { position:sticky; top:0; background:#101216ee; padding:10px 0; z-index:2; }
  button { background:#8ab4f8; color:#0b0d10; border:0; border-radius:6px; padding:7px 14px; font-weight:700; cursor:pointer; }
  code { background:#0b0d10; border-radius:4px; padding:1px 5px; }
</style>
</head>
<body>
<h1>P5 Visionless Contact Sheet — ${rows.length} most suspicious production scenes</h1>
<div class="sub">Ranking: P3 flags (idle-wallpaper, intent-not-staged, payload sanity) then lowest contract score. ${withStills}/${rows.length} stills embedded. Blind pass: judge each frame GOOD / WRONG / UNCERTAIN, then copy the verdict JSON below. Target: 1–2 minutes.</div>
<div class="toolbar"><button onclick="copyVerdicts()">Copy verdicts as JSON</button> <span id="count"></span></div>
<div class="grid">
${cards}
</div>
<script>
  const meta = ${JSON.stringify(rows.map((r) => ({ book: r.book, sceneId: r.sceneId, captureFrame: r.captureFrame, flags: r.flags, score: r.score })))};
  document.addEventListener("change", updateCount);
  function updateCount() {
    const n = document.querySelectorAll("input[type=radio]:checked").length;
    document.getElementById("count").textContent = n + "/" + meta.length + " judged";
  }
  function copyVerdicts() {
    const verdicts = meta.map((m, i) => {
      const sel = document.querySelector('input[name="v' + i + '"]:checked');
      return { ...m, verdict: sel ? sel.value : "UNJUDGED" };
    });
    navigator.clipboard.writeText(JSON.stringify({ contactSheet: "P5 visionless", judgedAt: new Date().toISOString(), verdicts }, null, 2))
      .then(() => { document.getElementById("count").textContent = "copied ✓"; })
      .catch(() => prompt("Copy manually:", JSON.stringify(verdicts.map(v => ({ sceneId: v.sceneId, verdict: v.verdict })))));
  }
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT_DIR, "contact-sheet.html"), html);

const md = [`# P5 Human Blind Check — top ${rows.length} suspects (suspicious-first)`, "",
  `Source: ${path.relative(root, reportPath)} · stills embedded: ${withStills}/${rows.length}`, "",
  "| # | Book | Scene | frame | score | flags |", "|---|---|---|---:|---:|---|",
  ...rows.map((r, i) => `| ${i + 1} | ${r.book} | ${r.sceneId} | ${r.captureFrame} | ${r.score} | ${r.flags.join(", ") || "—"} |`), "",
  "## Render the missing stills", "",
  "```bash",
  ...rows.filter((r) => !r.still).map((r) => `npx remotion still Antidote-${r.book} audit/visionless-10x/stills/${r.book}-${r.sceneId}.png --frame=${r.captureFrame}`),
  "```", "",
  `Open \`${path.relative(root, path.join(OUT_DIR, "contact-sheet.html"))}\` in a browser, mark GOOD / WRONG / UNCERTAIN, copy the verdict JSON, and hand it back for the P6 failure taxonomy.`, ""];
fs.writeFileSync(path.join(OUT_DIR, "p5-suspects.md"), md.join("\n") + "\n");

console.log(`P5 contact sheet: ${rows.length} suspects (${withStills} stills embedded)`);
console.log(`→ audit/visionless-10x/contact-sheet.html`);
console.log(`→ audit/visionless-10x/p5-suspects.md`);
process.exit(0);
