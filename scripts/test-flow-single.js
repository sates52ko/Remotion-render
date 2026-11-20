#!/usr/bin/env node
// A single-label flow renders (2026-10-26, farsighted 146/155/190/303): Flow placed its nodes with
// interpolate(i, [0, n-1]) — [0, 0] for one node threw "inputRange must be strictly monotonically increasing" and the
// render died. flowLayout.ts centres one node and drops the token; 2-3 nodes keep their exact positions.
// Run: node scripts/test-flow-single.js
const fs = require("fs");
const path = require("path");
const { interpolate } = require("remotion");
const { flowNodeXs, flowHasToken } = require("../src/engines/antidote/flowLayout.ts");

let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };
const VW = 1200, r = 92; // any width: the rule is relative
let threw = false; try { interpolate(0, [0, 0], [60 + r, VW - 60 - r]); } catch { threw = true; }
t("root cause reproduced: interpolate over [0, 0] throws (what killed the render)", threw);
let one = null, err = null; try { one = flowNodeXs(1, r, VW); } catch (e) { err = e; }
t("one node: no throw, centred", !err && one.length === 1 && one[0] === VW / 2, String(err || JSON.stringify(one)));
t("one node: no travelling token (no connector to travel)", flowHasToken(1) === false);
for (const n of [2, 3]) {
  const old = Array.from({ length: n }, (_, i) => interpolate(i, [0, n - 1], [60 + r, VW - 60 - r]));
  t(`${n} nodes: exactly the previous positions`, JSON.stringify(flowNodeXs(n, r, VW)) === JSON.stringify(old), JSON.stringify(flowNodeXs(n, r, VW)));
  t(`${n} nodes: the token still travels`, flowHasToken(n) === true);
}
t("no nodes: empty, no throw", JSON.stringify(flowNodeXs(0, r, VW)) === "[]");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "engines", "antidote", "components", "Diagram.tsx"), "utf8");
t("Diagram.tsx Flow uses the helper (no raw interpolate over [0, n - 1] left)", /const xs = flowNodeXs\(n, r, VW\)/.test(src) && !/interpolate\(i, \[0, n - 1\]/.test(src));
t("...and hides the token on a single node", /opacity=\{flowHasToken\(n\) && loopClock > 20 \? 1 : 0\}/.test(src) && /const tokenX = flowHasToken\(n\) \?/.test(src));
console.log(fail ? `\n${fail} FAILED` : "\nall flow-single checks passed");
process.exit(fail ? 1 : 0);
