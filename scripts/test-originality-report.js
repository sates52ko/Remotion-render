#!/usr/bin/env node
/** test-originality-report.js — one page says how much of a film is its book's own; it reports, never refuses. No network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const R = require("./originality-report");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const P = [{ d: "M0 0 H9 V9 Z", fill: "#111111" }];
const film = () => ({ meta: { fps: 30, cast: { mina: { variant: {} }, lucy: { variant: { drawn: { hair: P } } } },
  form: { key: "case", part: "EXHIBIT", name: "CASE FILE", parts: [{ n: 1, from: 0 }, { n: 2, from: 900 }, { n: 3, from: 1800 }] } },
  scenes: [
    { durationFrames: 900, _narration: "Mina opens the letter from Lucy. It changes everything for them.", bg: { set: "office" }, shot: "medium", characters: [{ role: "mina" }], props: [{ type: "law" }] },
    { durationFrames: 900, _narration: "The ship is seen off Whitby at dawn by the old sailors.", bg: { set: "room", own: { id: "whitby", paths: P } }, shot: "wide", characters: [{ role: "lucy" }], props: [{ type: "customSvg" }] },
    { durationFrames: 1800, _narration: "Nobody could say what it meant in the end.", bg: { set: "none" }, told: { v: 4, backdrops: [{ id: "whitby", paths: P }], items: [{ kind: "figure", id: "dracula~2" }, { kind: "icon", id: "ship", label: "THE SHIP" }, { kind: "emblem", id: "bank", label: "THE BANK" }] } },
  ] });
const ENT = { dracula: { kind: "person", label: "DRACULA", look: { drawn: { hair: P } } }, whitby: { kind: "place", label: "WHITBY", home: true, backdrop: { paths: P } }, ship: { kind: "object", paths: P } };

t("the page: how it is told, who wears their own head, where it stands, whose things, what it is most alike", () => {
  const r = R.report({ config: film(), book: { take: { text: "I think the men are let off." } }, entities: ENT, peopleVerdict: { people: { a: { ok: true }, b: { ok: false } } },
    shelf: [{ slug: "other", shared: 1, vec: { "set:office": 1, "shot:medium": 0.5 } }, { slug: "far", shared: 1, vec: { "set:forest": 1 } }] });
  assert.deepStrictEqual([r.told.form, r.told.parts, r.told.take], ["case", 3, true]);
  assert.strictEqual(r.told.minutes, 2);
  assert.strictEqual(r.told.story, 1, "every sentence stands beside one that names the book: all of it is a told stretch");
  assert.strictEqual(r.told.storyWithThings, true);
  assert.deepStrictEqual(r.people, { onScreen: 3, drawn: 2, seenBlind: 1, tested: 2 }, "mina has no drawn head; lucy (cast) and dracula (entity) have");
  assert.strictEqual(r.places.own, 0.75); assert.strictEqual(r.places.shared, 0.25); assert.strictEqual(r.places.home, "whitby");
  assert.deepStrictEqual([r.things.iconsOwn, r.things.iconsLibrary, r.things.toldDrawn, r.things.toldEmblem], [1, 1, 1, 1]);
  assert.strictEqual(r.channel.most.slug, "other"); assert.ok(r.channel.most.alike > 0 && r.channel.most.alike < 1);
});

t("one line for the hand-off, in the operator's language; a film with nothing of its own says so plainly", () => {
  const l = R.line(R.report({ config: film(), entities: ENT, shelf: [] }));
  for (const must of ["Özgünlük: biçim case (3 bölüm sayıldı)", "kadro 2/3 kendi kafasıyla", "kitabın yerinde 75 %", "ortak sette 25 %", "ikon 1 kendi / 1 kütüphane"]) assert.ok(l.includes(must), `${must} ← ${l}`);
  const old = { meta: { fps: 30 }, scenes: [{ durationFrames: 600, _narration: "It is about ideas and habits.", bg: { set: "office" }, shot: "medium", characters: [{ role: "everyman" }], props: [{ type: "clock" }] }] };
  const l2 = R.line(R.report({ config: old, shelf: [] }));
  assert.ok(l2.includes("biçim yok") && l2.includes("kadro 0/1 kendi kafasıyla") && l2.includes("kitabın yerinde 0 %") && l2.includes("ikon 0 kendi / 1 kütüphane"), l2);
});

t("it reports and never refuses; the preview hand-off carries its line", () => {
  const src = fs.readFileSync(path.join(__dirname, "originality-report.js"), "utf8");
  assert.ok(!/process\.exit\(1\)[^\n]*(share|alike|drawn)/.test(src) && /It reports and never refuses/.test(src));
  const skill = fs.readFileSync(path.join(__dirname, "..", ".claude", "skills", "preview-hazirla", "SKILL.md"), "utf8");
  assert.ok(skill.includes("originality-report.js --slug=") && skill.includes("Özgünlük: <"), "the skill runs it and its report template has the line");
});

console.log(`\n${n} checks passed`);
