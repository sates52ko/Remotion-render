#!/usr/bin/env node
/** test-cross-book-similarity.js — what two films share is measured on shared pieces only; a book's own world lowers it. No network. */
const assert = require("assert");
const S = require("./cross-book-similarity");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const scene = (set, extra = {}) => ({ durationFrames: 100, shot: "medium", bg: { set }, props: [], ...extra });
const film = (scenes) => ({ meta: { fps: 30 }, scenes });

t("a film standing in shared sets is 100 % shared; told stages and the book's own places are not", () => {
  assert.strictEqual(S.profile(film([scene("office"), scene("room")])).shared, 1);
  const p = S.profile(film([scene("office"), scene("office", { bg: { set: "office", own: { id: "castle", paths: [] } } }), scene("none", { told: { items: [] } }), scene("room")]));
  assert.strictEqual(p.shared, 0.5); assert.strictEqual(p.ownPlace, 0.25); assert.strictEqual(p.told, 0.25);
  assert.ok(!Object.keys(p.vec).some((k) => /castle/.test(k)), "the book's own place is in no shared dimension");
});

t("icons: the book's own are counted apart and never make two films alike", () => {
  const p = S.profile(film([scene("office", { props: [{ type: "law" }, { type: "customSvg" }] })]));
  assert.strictEqual(p.ownIcons, 1); assert.strictEqual(p.libIcons, 1);
  assert.ok(p.vec["icon:law"] > 0 && !("icon:customSvg" in p.vec));
});

t("two films built from the same shared pieces are alike; drawing a book's own world lowers it; different pieces are not alike", () => {
  const a = S.profile(film([scene("office"), scene("office"), scene("room")])), b = S.profile(film([scene("office"), scene("office"), scene("room")]));
  assert.ok(S.alike(a, b) > 0.99);
  const own = { bg: { set: "office", own: { id: "x", paths: [] } } };
  const c = S.profile(film([scene("office", own), scene("office", own), scene("room")]));
  assert.ok(S.alike(a, c) < S.alike(a, b) * 0.7, "two of three scenes at the book's own place");
  const d = S.profile(film([scene("forest"), scene("shore"), scene("forest", { shot: "wide" })]));
  assert.ok(S.alike(a, d) < 0.3);
  assert.strictEqual(S.alike(a, S.profile(film([scene("none", { told: { items: [] } })]))), 0, "a film that is all told stages shares nothing");
  assert.strictEqual(S.cosine({}, { a: 1 }), 0);
});

t("the label in the corner and the narrative form are reported", () => {
  const p = S.profile(film([scene("office", { hud: { badge: "INSIGHT 03 / 08" } })]), { form: { key: "case" } });
  assert.strictEqual(p.badge, "INSIGHT N / N"); assert.strictEqual(p.form, "case");
  assert.strictEqual(S.profile(film([scene("office")])).form, null);
});

console.log(`\n${n} checks passed`);
