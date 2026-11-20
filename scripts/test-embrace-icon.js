#!/usr/bin/env node
// EMBRACE + ICON (2026-10-26, safeArea.ts embraceMotifSlot + Scene.tsx): on a twoShot embrace an icon the author did
// not place leaves the motif slot where the pair meets (icebreaker 152/153: heart / trophy on Anastasia). Only that case
// changes. Run: node scripts/test-embrace-icon.js
const fs = require("fs");
const path = require("path");
const { embraceMotifSlot, EMBRACE_MOTIF } = require("../src/engines/antidote/safeArea.ts");

let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };
const TWO = { x: 960, y: 596, scale: 0.62 }; // shots.ts twoShot.motif
const hug = [{ action: "embrace" }, { action: "embrace" }];

const m = embraceMotifSlot("twoShot", hug, TWO);
t("an embracing twoShot moves the icon off the meeting point (upper left)", m.x === EMBRACE_MOTIF.x && m.y === EMBRACE_MOTIF.y && m.x < 400 && m.y < TWO.y, JSON.stringify(m));
t("...a little smaller, so it stays clear of the left figure before the approach", Math.abs(m.scale - TWO.scale * EMBRACE_MOTIF.scaleK) < 1e-9 && m.scale < TWO.scale);
// geometry: the icon box (520 * scale, centred) clears the left figure's head before the approach (twoShot slot 0 at
// x 566, scale 1.24: head ~±120 px) and the top-centre callout band (twoShot.text x 960)
const half = 260 * m.scale;
t("geometry: the icon box ends left of the left figure's head (x < 446) and is below the top band (y > 186)", m.x + half < 446 && m.y - half > 186, `${m.x - half}..${m.x + half} × ${m.y - half}..${m.y + half}`);
const same = (shot, bodies) => embraceMotifSlot(shot, bodies, TWO) === TWO;
t("a twoShot without an embrace: unchanged", same("twoShot", [{ action: "talk" }, { action: "idle" }]) && same("twoShot", [{ action: "take" }, { action: "reach" }]));
t("an embrace on another shot / one person / a crowd of three: unchanged", same("medium", hug) && same("twoShot", [{ action: "embrace" }]) && same("twoShot", [...hug, { action: "idle" }]));
const src = fs.readFileSync(path.join(__dirname, "..", "src", "engines", "antidote", "components", "Scene.tsx"), "utf8");
t("Scene uses the slot only for icons the author did not place (both motif paths)", (src.match(/x: p\.x \?\? motifSlot\.x, y: p\.y \?\? motifSlot\.y/g) || []).length === 2 && !/p\.x \?\? preset\.motif\.x/.test(src));
console.log(fail ? `\n${fail} FAILED` : "\nall embrace-icon checks passed");
process.exit(fail ? 1 : 0);
