#!/usr/bin/env node
/** test-own-gaps.js — what the first real book taught (Dracula, 2026-11-19): heads + a home before the authors; the
 *  firewall knows an entity's drawing. No render, no network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const OD = require("./lib/own-drawings");
const F = require("./lib/narrative-visual-firewall");
const { resolveSvgMotif } = require("./lib/svg-motif-identity");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const P = [{ d: "M10 10 H500 V500 H10 Z", fill: "#101820" }];
const head = { look: { drawn: { hair: P } } };

t("a book with nothing drawn of its people and places has every gap", () => {
  const g = OD.ownGaps({ mina: { kind: "person", look: { hair: "bun" } }, whitby: { kind: "place" }, deed: { kind: "object", paths: P } });
  assert.deepStrictEqual([g.heads, g.bare, g.home, g.any], [["mina"], ["whitby"], false, true]);
  assert.strictEqual(OD.ownGaps({}).any, true); assert.strictEqual(OD.ownGaps({}).none, true);
});

t("heads for everyone and ONE drawn home is finished; a place still bare is named, not refused", () => {
  const g = OD.ownGaps({ mina: { kind: "person", ...head }, whitby: { kind: "place", home: true, backdrop: { viewBox: "0 0 1920 760", paths: P } }, varna: { kind: "place" } });
  assert.deepStrictEqual([g.heads, g.bare, g.home, g.any], [[], ["varna"], true, false]);
  // a home that is not drawn is no home
  assert.strictEqual(OD.ownGaps({ mina: { kind: "person", ...head }, whitby: { kind: "place", home: true } }).any, true);
});

t("prep asks for it only on a book of the current Step 0 (book.json skin), and a reason is recorded, never implied", () => {
  const sb = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
  assert.ok(sb.includes('ENGINE === "antidote" && book.skin'));
  assert.ok(sb.includes("gaps.any && why.length < 30"));
  assert.ok(sb.includes('"own-incomplete.json"'));
});

t("the firewall's registry is the director's: motifs.json + the things of entities.json", () => {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "own-gaps-")), dir = path.join(tmp, "books", "b");
  fs.mkdirSync(path.join(dir, "storyboard"), { recursive: true });
  fs.writeFileSync(path.join(dir, "storyboard", "entities.json"), JSON.stringify({ deed: { kind: "object", label: "THE DEED", paths: P } }));
  fs.writeFileSync(path.join(dir, "motifs.json"), JSON.stringify({ hound: { viewBox: "0 0 520 520", paths: [{ d: "M1 1 H9" }] } }));
  fs.writeFileSync(path.join(dir, "config.antidote.json"), "{}"); fs.writeFileSync(path.join(dir, "story-bible.json"), "{}");
  const b = F.loadBook(tmp, "b");
  assert.deepStrictEqual(Object.keys(b.motifs).sort(), ["deed", "hound"]);
  const drawn = OD.iconsOfEntities({ deed: { kind: "object", label: "THE DEED", paths: P } }).deed;
  assert.deepStrictEqual(resolveSvgMotif({ type: "customSvg", customSvg: drawn }, b.motifs), { motif: "deed", registered: true });
  // another geometry borrows no authority
  assert.strictEqual(resolveSvgMotif({ type: "customSvg", customSvg: { ...drawn, paths: [{ d: "M0 0 H5" }] } }, b.motifs).registered, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

t("an entity's drawing needs no second listing in the bible; a motifs.json icon and a library icon still do", () => {
  const src = fs.readFileSync(path.join(__dirname, "lib", "narrative-visual-firewall.js"), "utf8");
  assert.ok(src.includes("registeredMotifs.has(prop.type) && !!(motifs[prop.type] && motifs[prop.type].fromEntity)"));
  assert.ok(src.includes("if (!ownEntity && !allowedMotifs.has(prop.type) && !allowedProps.has(prop.type))"));
  assert.strictEqual(OD.iconsOfEntities({ deed: { kind: "object", paths: P } }).deed.fromEntity, true);
});

console.log(`\nall own-gaps checks passed (${n})`);
