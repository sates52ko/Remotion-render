#!/usr/bin/env node
// A kept stage keeps its ACCENT (2026-10-24): Scene colours held objects, callouts and icons with
// `transition.color || bg.accent`, which changes beat to beat — on a `continue` beat the shield the mother keeps
// holding turned yellow -> green (skin-in-the-game 228-229; the blind judge: "the shield colour flip adds
// confusion"). continuity.ts keptAccents: a continued scene takes the accent of the scene it continues; index.tsx
// draws it. Pure. Run: node scripts/test-kept-accent.js
const fs = require("fs");
const path = require("path");
const C = require("../src/engines/antidote/continuity.ts");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };

const acc = C.keptAccents([{ transition: { color: "#Y" } }, { continueFromPrev: true, bg: { accent: "#G" } }, { continueFromPrev: true, transition: { color: "#Z" } }, { bg: { accent: "#B" } }]);
t("a kept beat keeps the accent of the beat it continues, along the whole chain", JSON.stringify(acc) === JSON.stringify(["#Y", "#Y", "#Y", "#B"]), JSON.stringify(acc));
t("a scene that is not kept keeps its own accent (unchanged behaviour)", JSON.stringify(C.keptAccents([{ bg: { accent: "#A" } }, { bg: { accent: "#B" } }, { transition: { color: "#C" }, bg: { accent: "#D" } }])) === JSON.stringify(["#A", "#B", "#C"]));
t("the first scene is never 'continued'", C.keptAccents([{ continueFromPrev: true, bg: { accent: "#A" } }])[0] === "#A");
t("no colour anywhere -> the Scene default", C.keptAccents([{}])[0] === "#E23B57");
const ix = fs.readFileSync(path.join(__dirname, "..", "src", "engines", "antidote", "index.tsx"), "utf8");
t("index.tsx: a kept scene is drawn with the kept accent", /continues \? \{ \.\.\.scene, transition: \{ \.\.\.transition, type: "cut" as const, frames: 0, color: keptAccent\[i\] \} \}/.test(ix));
const sc = fs.readFileSync(path.join(__dirname, "..", "src", "engines", "antidote", "components", "Scene.tsx"), "utf8");
t("Scene.tsx still derives its accent from transition.color || bg.accent (so the kept colour reaches every element)", /const accent = transition\.color \|\| bg\.accent/.test(sc));
console.log(failed ? `\n${failed} FAILED` : "\nall kept-accent tests passed");
process.exit(failed ? 1 : 0);
