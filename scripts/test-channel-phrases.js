#!/usr/bin/env node
/** test-channel-phrases.js — the sentences the channel's narrations share. No render, no network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CP = require("./lib/channel-phrases");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
// 12 "films": each its own words, eight of them with one shared linking line
const abc = (x) => String(x).split("").map((d) => "abcdefghij"[Number(d)]).join("");
const film = (i, shared) => { const w = []; for (let k = 0; k < 400; k++) w.push(`q${abc(i)}z${abc(k)}`); if (shared) w.splice(200, 0, "which", "brings", "us", "to", "the"); return w.join(" "); };

t("a run said in at least 15 % of the films is a channel line; a film's own words are not", () => {
  const texts = Array.from({ length: 12 }, (_, i) => film(i, i < 8));
  const r = CP.census(texts, { minWords: 100 });
  assert.strictEqual(r.films, 12);
  assert.deepStrictEqual(r.runs, [{ run: "which brings us to the", films: 8 }]);
  assert.ok(r.median > 0);
});

t("rate: how often one narration says such a run, per 1000 words; a new voice says none", () => {
  const data = { films: 12, median: 2.5, runs: [{ run: "which brings us to the", films: 8 }] };
  const a = CP.rate(film(1, true) + " Which brings us to the end.", data);
  assert.deepStrictEqual(a.said, [["which brings us to the", 2]]);
  assert.ok(a.per1000 > 4 && a.per1000 < 6);
  assert.strictEqual(CP.rate(film(2, false), data).per1000, 0);
  assert.strictEqual(CP.rate("too short", data), null);
  assert.strictEqual(CP.rate(film(2, false), null), null);
});

t("the channel's list is on disk; the prompt forbids its commonest lines and the check looks for them", () => {
  const data = CP.load();
  assert.ok(data && data.films >= 10 && data.runs.length >= 5);
  for (const r of data.runs) assert.ok(r.run.split(" ").length === CP.N && r.films >= data.films * 0.15);
  const speech = require("./lib/narrative-form").SPEECH, check = fs.readFileSync(path.join(__dirname, "narration-form-check.js"), "utf8");
  const text = Array.isArray(speech) ? speech.join(" ") : String(speech);
  for (const p of ["which brings us to", "we have to look at", "I have to push back"]) { assert.ok(text.includes(p), `SPEECH forbids "${p}"`); assert.ok(check.includes(p.toLowerCase()), `the check looks for "${p}"`); }
  assert.ok(!/\bdoubt\b/.test(fs.readFileSync(path.join(__dirname, "lib", "narrative-form.js"), "utf8").split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n")), "the prompt no longer hands the hosts the word they parroted 11 times");
});

console.log(`\nall channel-phrases checks passed (${n})`);
