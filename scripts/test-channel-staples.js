#!/usr/bin/env node
/** test-channel-staples.js — the shared icons most of the channel's films show. No render, no network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { census } = require("./build-channel-staples");
const OD = require("./lib/own-drawings");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const film = (...types) => ({ scenes: [{ props: types.map((type) => ({ type })) }] });

t("an icon in at least half of the films is a staple; told stages and the book's own drawings are not counted", () => {
  const configs = [film("door", "book"), film("door", "ship"), film("door", "customSvg"), { scenes: [{ told: { v: 4 }, props: [{ type: "ship" }] }] }];
  const r = census(configs);
  assert.strictEqual(r.books, 4);
  assert.deepStrictEqual(r.staples.map((s) => s.icon), ["door"]);
  assert.deepStrictEqual([r.staples[0].books, r.staples[0].uses], [3, 3]);
  assert.ok(!r.staples.some((s) => s.icon === "customSvg"));
});

t("the shelf's list is on disk and is what iconShare counts against", () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "channel-staples.json"), "utf8"));
  assert.ok(data.books >= 10 && data.staples.length >= 5);
  for (const s of data.staples) assert.ok(s.books >= data.books / 2, `${s.icon} is in half of the films`);
  assert.deepStrictEqual([...OD.channelStaples()].sort(), data.staples.map((s) => s.icon).sort());
});

t("iconShare says how many of a film's shared icons are the channel's worn ones", () => {
  const c = { scenes: [{ props: [{ type: "door" }, { type: "door" }, { type: "ship" }, { type: "customSvg" }] }, { told: { v: 4 }, props: [{ type: "door" }] }] };
  const ic = OD.iconShare(c, new Set(["door"]));
  assert.deepStrictEqual([ic.own, ic.library, ic.staples], [1, 3, 2]);
  assert.deepStrictEqual(ic.staplesTop, [["door", 2]]);
  assert.strictEqual(OD.iconShare({ scenes: [] }, new Set(["door"])).staples, 0);
});

t("the authors are told, and merge names an icon that returns", () => {
  const sb = fs.readFileSync(path.join(__dirname, "storyboard.js"), "utf8");
  assert.ok(sb.includes("## The channel's worn icons — ask for THIS book's version"));
  assert.ok(sb.includes("worn icons: "));
  assert.ok(fs.readFileSync(path.join(__dirname, "originality-report.js"), "utf8").includes("iconsWorn"));
});

console.log(`\nall channel-staples checks passed (${n})`);
