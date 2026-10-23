// Regression: beards must never read as a grin, and the neutral mouth must be flat.
//
// Measured on 24 books (~1,341 blind-described one-face frames): a face with a
// beard/stubble read "smiling" 21.8% of the time vs 6.6% without. The old stubble
// and full-beard bands had an inner edge shaped as an upward U that started AT the
// mouth corners, so the beard continued the mouth line into a grin. This test pins
// the geometry: inside the mouth's horizontal span, the jaw band's upper edge must
// sit BELOW the lowest pixel any mouth can reach (every expression's curve plus its
// stroke, and the talking/afraid open-mouth ellipse at full open).
//
// Pure geometry read from the source — no Remotion. Run: node scripts/test-beard-mouth.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const everyman = fs.readFileSync(path.join(ROOT, "src/engines/antidote/characters/Everyman.tsx"), "utf8");
const wardrobe = fs.readFileSync(path.join(ROOT, "src/engines/antidote/wardrobe.tsx"), "utf8");

let failed = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`); if (!ok) failed++; };

// ── tiny SVG path sampler (absolute M/L/Q/C/Z — all the rig uses) ────────────
function sample(d, steps = 40) {
  const toks = d.match(/[MLQCZ]|-?\d*\.?\d+/gi);
  const pts = [];
  let i = 0, cmd = null, cur = [0, 0], start = [0, 0];
  const num = () => +toks[i++];
  while (i < toks.length) {
    if (/[MLQCZ]/i.test(toks[i])) cmd = toks[i++].toUpperCase();
    if (cmd === "Z") { pts.push(start.slice()); cur = start.slice(); continue; }
    if (cmd === "M") { cur = [num(), num()]; start = cur.slice(); pts.push(cur.slice()); cmd = "L"; continue; }
    if (cmd === "L") { cur = [num(), num()]; pts.push(cur.slice()); continue; }
    if (cmd === "Q") {
      const c = [num(), num()], e = [num(), num()], s = cur;
      for (let k = 1; k <= steps; k++) {
        const u = k / steps, a = (1 - u) ** 2, b = 2 * u * (1 - u), q = u * u;
        pts.push([a * s[0] + b * c[0] + q * e[0], a * s[1] + b * c[1] + q * e[1]]);
      }
      cur = e; continue;
    }
    if (cmd === "C") {
      const c1 = [num(), num()], c2 = [num(), num()], e = [num(), num()], s = cur;
      for (let k = 1; k <= steps; k++) {
        const u = k / steps, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), q = u ** 3;
        pts.push([a * s[0] + b * c1[0] + c * c2[0] + q * e[0], a * s[1] + b * c1[1] + c * c2[1] + q * e[1]]);
      }
      cur = e; continue;
    }
    throw new Error(`unsupported path command in ${d}`);
  }
  return pts;
}

// topmost y of a closed outline at vertical line x (null when the line misses it)
function topAt(poly, x) {
  let best = null;
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length];
    if ((x0 <= x && x <= x1) || (x1 <= x && x <= x0)) {
      const y = x1 === x0 ? Math.min(y0, y1) : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      if (best === null || y < best) best = y;
    }
  }
  return best;
}

// ── 1) every mouth the rig can draw ─────────────────────────────────────────
const block = everyman.match(/export const NEUTRAL_MOUTH_PATHS = \{([\s\S]*?)\} as const;/);
const version = (everyman.match(/export const NEUTRAL_MOUTH_VERSION: NeutralMouthVersion = "(\w+)";/) || [])[1];
const neutral = block && version && (block[1].match(new RegExp(`${version}:\\s*"([^"]+)"`)) || [])[1];
t("neutral mouth path resolved from NEUTRAL_MOUTH_PATHS[NEUTRAL_MOUTH_VERSION]", !!neutral, version);
const faceFn = everyman.match(/function face\([\s\S]*?\n\}/);
const exprPaths = faceFn ? [...faceFn[0].matchAll(/case "(\w+)":[^\n]*?mouthPath = "([^"]+)"/g)].map((m) => ({ expr: m[1], d: m[2] })) : [];
t("expression mouth paths found in face()", exprPaths.length >= 8, `${exprPaths.length}`);
const mouths = [{ expr: "neutral", d: neutral || "M0,0" }, ...exprPaths];

const STROKE_HALF = 3.5; // female lip stroke 7 (male 6)
// open mouth: <ellipse cx=200 cy=216 rx=20 ry={2 + open*15}> — open reaches 1 while talking
const openEl = everyman.match(/<ellipse cx=\{(\d+)\} cy=\{(\d+)\} rx=\{(\d+)\} ry=\{(\d+) \+ f\.open \* (\d+)\}/);
t("open-mouth ellipse found", !!openEl);
let mx0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
for (const m of mouths) for (const [x, y] of sample(m.d)) {
  mx0 = Math.min(mx0, x - STROKE_HALF); mx1 = Math.max(mx1, x + STROKE_HALF); my1 = Math.max(my1, y + STROKE_HALF);
}
if (openEl) {
  const [, cx, cy, rx, ry0, ryk] = openEl.map(Number);
  mx0 = Math.min(mx0, cx - rx); mx1 = Math.max(mx1, cx + rx); my1 = Math.max(my1, cy + ry0 + ryk);
}
console.log(`     mouth bbox (all expressions, stroke, full open): x ${mx0.toFixed(1)}..${mx1.toFixed(1)}, bottom y ${my1.toFixed(1)}`);

// ── 2) the neutral mouth is flat ────────────────────────────────────────────
if (neutral) {
  const pts = sample(neutral);
  const endY = (pts[0][1] + pts[pts.length - 1][1]) / 2;
  const dev = Math.max(...pts.map((p) => Math.abs(p[1] - endY)));
  t("neutral mouth is flat (no point > 2px off its corners)", dev <= 2, `max deviation ${dev.toFixed(2)}px`);
}

// ── 3) beard jaw bands stay below every mouth ───────────────────────────────
const beardFn = wardrobe.match(/export const Beard[\s\S]*?\n\};/);
t("Beard component found", !!beardFn);
const caseBody = (name) => {
  const m = beardFn && beardFn[0].match(new RegExp(`case "${name}":([\\s\\S]*?)(?=case "|default:)`));
  return m ? m[1] : "";
};
for (const style of ["stubble", "full"]) {
  // the jaw band is the first path of the case (the full beard's mustache is a separate, second path)
  const d = (caseBody(style).match(/<path d="([^"]+)"/) || [])[1];
  t(`${style}: band path found`, !!d);
  if (!d) continue;
  const poly = sample(d);
  let worst = Infinity, worstX = null;
  for (let x = Math.floor(mx0); x <= Math.ceil(mx1); x++) {
    const y = topAt(poly, x);
    if (y !== null && y < worst) { worst = y; worstX = x; }
  }
  t(`${style}: band's upper edge stays below the mouth bbox across the mouth span`, worst > my1,
    `highest band point in span y=${worst.toFixed(1)} at x=${worstX} vs mouth bottom ${my1.toFixed(1)}`);
  // flat, not a U continuing the corners: across the mouth span the top edge varies < 6px
  let hi = -Infinity;
  for (let x = Math.floor(mx0); x <= Math.ceil(mx1); x++) { const y = topAt(poly, x); if (y !== null) hi = Math.max(hi, y); }
  t(`${style}: band's upper edge is flat across the mouth span (< 6px rise)`, hi - worst < 6, `${(hi - worst).toFixed(1)}px`);
}

// ── 4) stubble stays visible ────────────────────────────────────────────────
// The grin came from the band's SHAPE, not its contrast. At opacity 0.12 blind readers
// saw no facial hair in 22/27 stubble frames (0.24: 27/27), and stubble is an identity
// marker for cast distinctness — so only guard against it fading out again.
const stubOp = +((caseBody("stubble").match(/opacity=\{([\d.]+)\}/) || [])[1] || 1);
t("stubble stays visible (opacity >= 0.2)", stubOp >= 0.2, `${stubOp}`);

// ── 5) closed eyes draw a lid line (a shut eye read as "eyes missing") ──────
t("closed/heavy-lid eyes draw a dark lid line", /lidLine/.test(everyman) && /> 0\.5/.test(everyman));

console.log(failed ? `\n${failed} FAILED` : "\nall beard/mouth checks passed");
process.exit(failed ? 1 : 0);
