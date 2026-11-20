#!/usr/bin/env node
/** test-own-things.js — Film Flow 6, slice 2: one vocabulary — a thing drawn in entities.json is an own icon of a figure beat. No render, no network. */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const OD = require("./lib/own-drawings");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const P = [{ d: "M40 150 H480 V200 H40 Z", fill: "ink" }, { d: "M100 200 V400 H140 V200 Z", fill: "accent" }];
const ENT = {
  ship: { label: "THE DEMETER", kind: "object", reads: ["ship", "sailing ship"], paths: P },
  harbour: { label: "WHITBY", kind: "place", paths: P, viewBox: "0 0 400 400", backdrop: { paths: P } },
  hound: { label: "THE HOUND", kind: "object", motif: "mechanicalHound" },
  mina: { label: "MINA", kind: "person", look: { drawn: { hair: P } } },
  bank: { label: "THE BANK", kind: "company", glyph: "building" },
};

t("a thing the book drew is an own icon under its entity id, in the shape the director and the renderer take", () => {
  const ic = OD.iconsOfEntities(ENT);
  assert.deepStrictEqual(Object.keys(ic), ["ship", "harbour"], "no person, no emblem, no pointer at a motif");
  assert.deepStrictEqual(ic.ship, { name: "THE DEMETER", reads: "ship / sailing ship", viewBox: OD.RULES.box, paths: P, fromEntity: true });
  assert.strictEqual(ic.harbour.viewBox, "0 0 400 400");
  assert.ok(!("title" in ic.ship), "no title: the renderer would print it under the drawing, on the subtitles");
  assert.strictEqual(ic.ship.paths, ENT.ship.paths, "the same drawing, not a copy that can drift");
  assert.deepStrictEqual(OD.iconsOfEntities({}), {}); assert.deepStrictEqual(OD.iconsOfEntities(null), {});
});

t("a book's own icons = motifs.json + its drawn things; the per-book file wins; a book with neither has none", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "own-things-"));
  try {
    assert.deepStrictEqual(OD.ownIcons(dir), {});
    fs.mkdirSync(path.join(dir, "storyboard"));
    fs.writeFileSync(path.join(dir, "storyboard", "entities.json"), "﻿" + JSON.stringify(ENT));
    assert.deepStrictEqual(Object.keys(OD.ownIcons(dir)), ["ship", "harbour"]);
    fs.writeFileSync(path.join(dir, "motifs.json"), JSON.stringify({ mechanicalHound: { title: "Hound", paths: P }, ship: { title: "from motifs", paths: P } }));
    const ic = OD.ownIcons(dir);
    assert.deepStrictEqual(Object.keys(ic).sort(), ["harbour", "mechanicalHound", "ship"]);
    assert.strictEqual(ic.ship.title, "from motifs");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

t("the vocabulary an author sees and the icons the director draws are that same list", () => {
  const sb = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
  assert.ok(/function ownMotifs\(\) \{\s*return require\("\.\/lib\/own-drawings"\)\.ownIcons\(BOOK\);\s*\}/.test(sb));
  const dir = fs.readFileSync(path.join(__dirname, "lib/antidote-director.js"), "utf8");
  assert.ok(dir.includes('require("./own-drawings").iconsOfEntities(') && /\.\.\.perBookThings,\s*\.\.\.perBook,/.test(dir), "the things first, the per-book file over them");
  assert.ok(dir.includes('customMotifs[p.type] ? { ...p, type: "customSvg", customSvg: customMotifs[p.type]'), "an own icon is drawn as data (customSvg): no engine code per book");
});

t("the report counts the concept icons of the scenes that are not told: the book's own against the shared library", () => {
  const config = { scenes: [
    { props: [{ type: "customSvg" }, { type: "law" }] }, { props: [{ type: "law" }] }, { props: [{ type: "shield" }] }, { props: [] },
    { told: { items: [] }, props: [{ type: "balance" }] },
  ] };
  assert.deepStrictEqual(OD.iconShare(config, new Set(["shield"])), { own: 1, library: 3, share: 0.25, libraryTop: [["law", 2], ["shield", 1]], staples: 1, staplesTop: [["shield", 1]] });
  assert.strictEqual(OD.iconShare({ scenes: [] }).share, null);
  const told = fs.readFileSync(path.join(__dirname, "told.js"), "utf8");
  assert.ok(told.includes("OD.iconShare(config)") && told.includes("ownIcons: OD.iconShare(r.config)"));
  assert.ok(/THE SAME DRAWING EVERYWHERE/.test(OD.drawingGuide().join("\n")) && /"concept": "<entity id>"/.test(OD.drawingGuide().join("\n")));
});

console.log(`\n${n} checks passed`);
