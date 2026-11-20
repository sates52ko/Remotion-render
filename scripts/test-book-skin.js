#!/usr/bin/env node
/** test-book-skin.js — every book has its own graphic hand (subtitles / name plates / typeface). No render, no network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("./lib/book-skin");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const key = (k) => `${k.caption}/${k.plate}/${k.font}`;
const src = (f) => fs.readFileSync(path.join(__dirname, "..", "src", "engines", "antidote", f), "utf8");

t("a pick is a valid skin, the same for the same book and history", () => {
  const a = S.pickSkin({ slug: "dracula", recent: [] }), b = S.pickSkin({ slug: "dracula", recent: [] });
  assert.ok(S.validSkin(a)); assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(Object.keys(a), ["caption", "plate", "font"]);
});

t("thirty books in a row: never the last book's subtitles or typeface, never a combination from the last eight", () => {
  const made = [];
  for (let i = 0; i < 30; i++) {
    const recent = [...made].reverse(), k = S.pickSkin({ slug: `book-${i}`, recent });
    if (recent[0]) { assert.notStrictEqual(k.caption, recent[0].caption, `book ${i} caption`); assert.notStrictEqual(k.font, recent[0].font, `book ${i} font`); }
    assert.ok(!recent.slice(0, 8).some((r) => key(r) === key(k)), `book ${i} repeats ${key(k)}`);
    made.push(k);
  }
  for (const axis of ["caption", "plate", "font"]) assert.strictEqual(new Set(made.map((k) => k[axis])).size, 4, `${axis}: every value is used`);
});

t("an explicit skin is parsed; a wrong one is refused; junk in the history is ignored", () => {
  assert.deepStrictEqual(S.parseSkin("paper/sharp/serif"), { caption: "paper", plate: "sharp", font: "serif" });
  assert.strictEqual(S.parseSkin("paper/sharp/comic"), null);
  assert.strictEqual(S.parseSkin(""), null);
  assert.ok(!S.validSkin({ caption: "toString", plate: "dark", font: "poppins" }));
  assert.ok(S.validSkin(S.pickSkin({ slug: "x", recent: [null, {}, { caption: "neon" }] })));
  assert.ok(S.describe({ caption: "bar", plate: "accent", font: "slab" }).includes("Roboto Slab"));
});

t("the engine knows exactly the values the picker can choose, and the channel look is the default", () => {
  const skin = src("components/skin.tsx");
  for (const axis of Object.keys(S.AXES)) for (const v of Object.keys(S.AXES[axis])) assert.ok(skin.includes(`"${v}"`), `skin.tsx lacks ${axis} "${v}"`);
  assert.ok(/DEFAULT_SKIN: Skin = \{ caption: "box", plate: "dark", font: "poppins" \}/.test(skin));
  assert.ok(src("schema.ts").includes("skin: z.object("), "schema carries meta.skin");
});

t("the skin dresses, it does not move: no clock, no oscillation, no HTML layer in the told stage", () => {
  const skin = src("components/skin.tsx");
  assert.ok(!/useCurrentFrame|Math\.sin|Math\.cos|interpolate\(|spring\(/.test(skin), "skin.tsx reads no frame");
  const told = src("components/ToldStage.tsx");
  assert.ok(told.includes("plateStyle(skin, accent)"));
  assert.ok(!/<div|foreignObject/.test(told.slice(told.indexOf("const Tag:"), told.indexOf("const Tag:") + 1600)), "a name plate is SVG only");
  const cap = src("components/CaptionLayer.tsx");
  assert.ok(cap.includes('const def = skin.caption === "box" && skin.font === "poppins"'), "the channel look is drawn as before");
  assert.ok(cap.includes('"rgba(17,19,24,0.72)"') && cap.includes("borderRadius: 18"), "the old box is still there, unchanged");
});

t("Step 0 records the skin and the planner carries it into the film", () => {
  const mp = fs.readFileSync(path.join(__dirname, "make-prompt.js"), "utf8"), pa = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
  assert.ok(mp.includes("manifest.skin = {") && mp.includes("recentSkins(SLUG)"));
  assert.ok(pa.includes('require("./lib/book-skin").validSkin(man.skin)'));
});

console.log(`\nall book-skin checks passed (${n})`);
