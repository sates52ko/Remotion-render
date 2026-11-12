#!/usr/bin/env node
// MEDIUM own-icon layout (lib/medium-layout.js, 2026-10-26): callout → the top-centre slot; a lone person's titled icon
// lifted so its title clears the captions; two people: the icon stays. Only unplaced scenes. Run: node scripts/test-medium-layout.js
const fs = require("fs");
const path = require("path");
const { mediumIconLayout, TOP_SLOT, CAMERA_SAFE, TITLE_DROP } = require("./lib/medium-layout");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const icon = (extra = {}) => ({ type: "customSvg", scale: 1, customSvg: { title: "Claw Hammer", viewBox: "0 0 520 520", paths: [] }, ...extra });
const text = (extra = {}) => ({ text: "WIPE BLOOD OFF", style: "reveal", at: 20, ...extra });
const scene = (extra = {}) => ({ id: "scene-1", shot: "medium", characters: [{ identity: "pip" }], props: [icon()], texts: [text()], ...extra });

const solo = mediumIconLayout(scene());
t("solo medium: the callout moves to the top-centre slot", solo.texts[0].x === TOP_SLOT.x && solo.texts[0].y === TOP_SLOT.y && solo.texts[0].size === TOP_SLOT.size);
t("solo medium: the callout keeps its words, style and timing", solo.texts[0].text === "WIPE BLOOD OFF" && solo.texts[0].style === "reveal" && solo.texts[0].at === 20);
t("solo medium: the icon's title lands on the camera-safe line", solo.props[0].y + TITLE_DROP === CAMERA_SAFE && solo.props[0].x === 1380, JSON.stringify(solo.props[0]));
t("a smaller icon is lifted only as far as it needs", mediumIconLayout(scene({ props: [icon({ scale: 0.5 })] })).props[0].y === CAMERA_SAFE - TITLE_DROP * 0.5
  && mediumIconLayout(scene({ props: [icon({ scale: 0.4 })] })).props[0].y === 690);
const two = mediumIconLayout(scene({ characters: [{ identity: "pip" }, { identity: "ravi" }] }));
t("two people: the callout leaves the second face", two.texts[0].y === TOP_SLOT.y);
t("two people: the icon stays where the shot puts it", two.props[0].x == null && two.props[0].y == null);
const same = (s) => mediumIconLayout(s) === s;
t("another shot is untouched", same(scene({ shot: "twoShot" })) && same(scene({ shot: "closeUp" })));
t("one person, untitled own-icon / shared icon / no icon: untouched", same(scene({ props: [icon({ customSvg: { paths: [] } })] })) && same(scene({ props: [{ type: "key" }] })) && same(scene({ props: [] })));
const pair = (extra) => scene({ characters: [{ identity: "teresa" }, { identity: "manager" }], ...extra });
const pairNoIcon = mediumIconLayout(pair({ props: [{ type: "key" }] }));
t("two people, no own-icon: the callout still leaves the second face; props untouched", pairNoIcon.texts[0].y === TOP_SLOT.y && pairNoIcon.props[0].type === "key" && pairNoIcon.props[0].y == null);
t("two people, an authored callout position: untouched", same(pair({ props: [], texts: [text({ x: 600 })] })));
t("an authored text position is untouched", same(scene({ texts: [text({ y: 400 })] })) && same(scene({ texts: [text({ size: 70 })] })));
t("an authored icon position is untouched", same(scene({ props: [icon({ y: 600 })] })));
t("two texts (stacked copy) is untouched", same(scene({ texts: [text(), text({ text: "SECOND" })] })));
t("no callout is untouched", same(scene({ texts: [] })));
t("a diagram scene is untouched", same(scene({ diagram: { type: "bars" } })));
t("the input is not mutated", (() => { const s = scene(); mediumIconLayout(s); return s.texts[0].x == null && s.props[0].y == null; })());
const src = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
t("the planner applies it BEFORE the authorship seal (the lock records the final positions)",
  src.indexOf("mediumIconLayout(out)") > 0 && src.indexOf("mediumIconLayout(out)") < src.indexOf("const artTexts = (out.texts"));
console.log(failed ? `\n${failed} FAILED` : "\nall medium-layout tests passed");
process.exit(failed ? 1 : 0);
