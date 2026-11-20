#!/usr/bin/env node
/**
 * test-game-icon.js — guard for the shared Antidote scene icon `game`
 * (src/engines/antidote/motifs.tsx → const Game).
 *
 * Why: the old Game drew a TROPHY CUP with a perpetual Math.sin(frame) shine.
 * Blind viewers read it as "winning / a prize" (burn-of-the-everflame framecheck
 * 2026-10-16: 3/3 wrong where the narration meant a chess-like game of war), and
 * the shine broke the "no idle oscillation" rule. This test pins both fixes:
 *   1. no frame-driven perpetual oscillation (Math.sin/cos of frame, % frame loops)
 *   2. it is not a trophy any more (no cup handles / plinth pair) and still
 *      registered under the `game` key so old configs render.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "engines", "antidote", "motifs.tsx");
const src = fs.readFileSync(SRC, "utf8");
let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) fails++;
};

// Extract the Game component body: from its declaration to the next top-level `const X: React.FC`.
const start = src.indexOf("const Game: React.FC<MotifProps>");
check(start >= 0, "Game component is declared in motifs.tsx");
let body = "";
if (start >= 0) {
  const rest = src.slice(start + 10);
  const next = rest.search(/\nconst [A-Z]\w*: React\.FC/);
  body = next >= 0 ? rest.slice(0, next) : rest;
}

// 1. No perpetual oscillation driven by the frame counter.
const osc = body.match(/Math\.(sin|cos)\s*\([^)]*frame/g) || [];
check(osc.length === 0, `no Math.sin/Math.cos of frame in Game (found ${osc.length}: ${osc.join(" | ")})`);
const loops = body.match(/frame\s*\*[^;]*%|\(\s*frame[^)]*\)\s*%|frame\s*%/g) || [];
check(loops.length === 0, `no modulo frame loops in Game (found ${loops.length})`);
check(/spring\(\s*\{\s*frame/.test(body), "Game keeps a one-shot spring entry animation");

// 2. Not a trophy: the old cup handles were these two exact paths.
check(!body.includes("M186,196 Q120,196 140,270"), "old trophy cup handle path is gone");
check(!body.includes("M186,180 L334,180 L320,300"), "old trophy cup bowl path is gone");

// 3. Still registered under the `game` key (old configs keep rendering).
check(/\bgame\s*:\s*Game\b/.test(src), "`game: Game` is still registered in the motif map");

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
