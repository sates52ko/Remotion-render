#!/usr/bin/env node
/** test-vox-own-frame.js — Vox: the book's skin, the announced parts as chapter cards, the originality report. No render. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const R = require("./originality-report");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const src = (f) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8");

t("a Vox film without a skin is drawn as before; with one, the subtitles take it", () => {
  const cap = src("engines/vox/captions.tsx");
  assert.ok(cap.includes('if (!skin || s.caption === "box") return { face, def: !skin || s.font === "poppins", box: null'), "no skin → no override of the old box");
  assert.ok(cap.includes('background: "rgba(18, 20, 24, 0.90)"') && cap.includes("borderRadius: 16"), "the old box is still the base style");
  for (const k of ["paper", "bar"]) assert.ok(cap.includes(`s.caption === "${k}"`), `caption style ${k}`);
  assert.ok(cap.includes('s.font === "poppins" ? HEADLINE : SKIN_FONT[s.font]'), "the channel face stays the engine's headline");
  assert.ok(src("engines/vox/index.tsx").includes("skin={config.meta.skin}"));
});

t("the chapter cards follow the parts the hosts announced (from three), under the form's own word", () => {
  const ov = src("engines/vox/overlays.tsx"), idx = src("engines/vox/index.tsx");
  assert.ok(ov.includes("form.parts.length < 3) return null"));
  assert.ok(ov.includes("{word}</span>") && ov.includes('word = "CHAPTER"'), "CHAPTER without a form, as before");
  assert.ok(idx.includes("const parts = formChapters(config.meta.form), chapters = parts || config.chapters;"));
});

t("the planner carries the skin and the form into a Vox film; a lab composition renders an isolated config", () => {
  const pv = fs.readFileSync(path.join(__dirname, "plan-vox.js"), "utf8");
  assert.ok(pv.includes('require("./lib/book-skin").validSkin(man.skin)') && pv.includes("NF.filmForm(man.form"));
  assert.ok(pv.includes("...ownFrame, generatedAt"));
  assert.ok(src("Root.tsx").includes('id="Vox-lab"'));
});

t("the report reads a Vox film: told like any film, picture = own images against shared text cards, look = skin", () => {
  const beat = (type, frames, img) => ({ type, durationFrames: frames, images: img ? [{ path: "x.png" }] : [] });
  const config = { meta: { fps: 30, skin: { caption: "paper", plate: "sharp", font: "serif" }, form: { key: "trial", name: "THE TRIAL", part: "ROUND", parts: [{ n: 1, from: 0 }, { n: 2, from: 900 }, { n: 3, from: 1800 }] } },
    captions: [{ text: "John Proctor will not sign his name." }, { text: "He tears the paper in two." }], beats: [beat("imagefocus", 1800, true), beat("statement", 600), beat("quote", 300), beat("imagefocus", 900, true)] };
  const r = R.voxReport({ config, book: { engineProfile: { kind: "fiction" } }, shelf: [{ slug: "a", cards: 0.5 }, { slug: "b", cards: 0.3 }, { slug: "c", cards: 0.6 }] });
  assert.deepStrictEqual([r.engine, r.told.form, r.told.parts, r.told.minutes], ["vox", "trial", 3, 2]);
  assert.strictEqual(r.picture.ownImages, 0.75); assert.strictEqual(r.picture.cards, 0.25);
  assert.deepStrictEqual(r.picture.cardKinds.map(([k]) => k), ["statement", "quote"]);
  assert.strictEqual(r.picture.channelCards, 0.5);
  assert.strictEqual(r.look.skin, "paper/sharp/serif");
  assert.strictEqual(r.told.story, 1);
  const line = R.voxLine(r);
  assert.ok(/^Özgünlük \(Vox\): biçim trial \(3 bölüm sayıldı\)/.test(line) && line.includes("kitabın kendi görselleri 75 %") && line.includes("görünüm paper/sharp/serif"), line);
  assert.ok(R.voxLine(R.voxReport({ config: { beats: [beat("statement", 300)], captions: [] } })).includes("kanal görünümü"));
});

t("the text cards are dressed by the book's card hand; without a skin every mark is the channel's, as before", () => {
  const hand = src("engines/vox/cardHand.tsx"), bg = src("engines/vox/backgrounds.tsx"), sh = src("engines/vox/shared.tsx"), idx = src("engines/vox/index.tsx");
  assert.ok(hand.includes('React.createContext<CardHand>("dark")') && hand.includes(': "dark");'), "no skin, an unknown plate → dark");
  assert.ok(idx.includes("<CardHandContext.Provider value={cardHandOf(config.meta.skin)}>"));
  for (const h of ["paper", "sharp", "accent"]) { assert.ok(bg.includes(`hand === "${h}"`), `what stands behind the words: ${h}`); assert.ok(sh.split(`hand === "${h}"`).length >= 3, `tag and underline: ${h}`); }
  // the channel's marks are still in the file, unchanged: the ring, the red tag with its hard shadow, the rounded marker
  assert.ok(bg.includes('borderRadius: "50%", border: `18px solid ${color}`, opacity: 0.18'));
  assert.ok(sh.includes("background: RED, color: PAPER, fontFamily: HEADLINE, fontWeight: 900, fontSize: 26") && sh.includes("boxShadow: `6px 6px 0 ${INK}`"));
  assert.ok(sh.includes("borderRadius: height, transform: `rotate(${rotate}deg)`, transformOrigin: \"left center\", opacity: 0.92"));
  // the new marks do not move on their own: no frame-driven rotation in their branches
  const branches = bg.slice(bg.indexOf('if (hand === "paper")'), bg.lastIndexOf("  return ("));
  assert.ok(!/rotate\(\$\{rot\}/.test(branches) && !/frame \*/.test(branches), "paper / sharp / accent marks stand still");
});

console.log(`\nall vox-own-frame checks passed (${n})`);
