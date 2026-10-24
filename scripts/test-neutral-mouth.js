// Regression: the neutral mouth. v2 must be flat (no smile) and is the default since the
// face-fidelity pack (2026-10-17); v1 is kept only as the documented defect.
// The v1 defect is a quadratic curve whose midpoint sits BELOW its corners (y grows downward),
// which reads as a faint smile (Beloved scene-208). Run: node scripts/test-neutral-mouth.js
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src/engines/antidote/characters/Everyman.tsx");
const src = fs.readFileSync(SRC, "utf8");

let failed = 0;
const t = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; };

// 1) read the two curves from the source
const block = src.match(/export const NEUTRAL_MOUTH_PATHS = \{([\s\S]*?)\} as const;/);
t("NEUTRAL_MOUTH_PATHS exported", !!block);
const v1 = block && (block[1].match(/v1:\s*"([^"]+)"/) || [])[1];
const v2 = block && (block[1].match(/v2:\s*"([^"]+)"/) || [])[1];
t("v1 and v2 curves present", !!v1 && !!v2);

// 2) geometry: M x0,y0 Q cx,cy x1,y1 — midpoint of a quadratic = (y0 + 2*cy + y1) / 4
const mid = (p) => {
  const m = p.match(/M(\d+),(\d+) Q(\d+),(\d+) (\d+),(\d+)/);
  if (!m) return null;
  const y0 = +m[2], cy = +m[4], y1 = +m[6];
  return { corner: (y0 + y1) / 2, mid: (y0 + 2 * cy + y1) / 4 };
};
const g1 = v1 && mid(v1), g2 = v2 && mid(v2);
t("v1 parses as quadratic", !!g1);
t("v1 is the known defect: midpoint below corners (faint smile)", !!g1 && g1.mid > g1.corner);
t("v2 is flat: midpoint equals corners", !!g2 && g2.mid === g2.corner);

// 3) default is v2 — configured-neutral faces read "smiling" 19% of the time on v1
t("NEUTRAL_MOUTH_VERSION defaults to v2", /export const NEUTRAL_MOUTH_VERSION: NeutralMouthVersion = "v2";/.test(src));

// 4) face() reads the constant for the default (neutral) branch, not a hard-coded curve
t("face() default mouth comes from NEUTRAL_MOUTH_PATHS", /let mouthPath: string = NEUTRAL_MOUTH_PATHS\[NEUTRAL_MOUTH_VERSION\];/.test(src));
t("no leftover hard-coded neutral curve in face()", !src.includes('let mouthPath = "M176,214 Q200,220 224,214"'));

console.log(failed ? `\n${failed} FAILED` : "\nall neutral-mouth checks passed");
process.exit(failed ? 1 : 0);
