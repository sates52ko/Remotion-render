#!/usr/bin/env node
/**
 * test-transcript-sameness.js — the transcript-sameness measure on synthetic narrations (seconds, no network).
 *   node scripts/test-transcript-sameness.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const TS = require("./lib/transcript-sameness");

let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`); if (!ok) fails++; };
const census = { share: 0.15, floor: 2, minWords: 100 }; // a 4-film fixture channel

// a channel template: the same connective runs around different nouns
const template = (hero, thing, place) => Array.from({ length: 60 }, (_, i) =>
  `Which brings us to the ${thing} number ${i}. Right, so we have to look at what ${hero} does in the ${place}, and I have to push back on that, because exactly here the book turns. Yeah, absolutely, that is a great way to put it.`).join(" ");
const free = `Lucy wakes before the bell. The lamp is out; she lights it with the last match and reads the letter twice.
Arthur has written from the harbour: the ship came in at dawn, fifty boxes of earth, no crew on deck. She folds the page.
In the churchyard the sexton counts graves and loses count. Van Helsing arrives on the evening train with a bag of garlic
and a question nobody wants answered. Mina writes everything down. By midnight the window is open and the dog has stopped barking.
Seward reads his cylinders aloud. Renfield asks for a kitten, then for the kitten's life. The doctor refuses and regrets it.
Quincey cleans his rifle on the porch while the others argue about blood. Jonathan says the Count sleeps in the chapel.
They go down with lanterns at noon. The boxes are empty but one. Nobody speaks on the stairs.`;
const own = (k) => Array.from({ length: 8 }, (_, i) => free.replace(/Lucy/g, ["Lucy", "Mina", "Arthur", "Jonathan"][(i + k) % 4])).join(" ");

const docs = [
  { id: "temp-a", text: template("Gatsby", "green light", "valley of ashes") },
  { id: "temp-b", text: template("Ahab", "white whale", "Pequod") },
  { id: "temp-c", text: template("Raskolnikov", "axe", "attic") },
  { id: "own-d", text: own(0) },
].map((d) => ({ ...d, words: TS.tokens(d.text).length, source: "fixture" }));

const m = TS.measure(docs, { census });
const by = Object.fromEntries(m.docs.map((d) => [d.id, d]));
check("the census finds the channel's repeated runs", m.census.runs > 0, JSON.stringify(m.census));
check("templated narrations say the channel runs often (per 1000 words)", by["temp-a"].runs.per1000 > 20, JSON.stringify(by["temp-a"].runs));
check("a narration told its own way says none of them", by["own-d"].runs.per1000 === 0, JSON.stringify(by["own-d"].runs));
check("answer words are counted per 1000", by["temp-a"].answerWords > 20 && by["own-d"].answerWords === 0, `${by["temp-a"].answerWords} / ${by["own-d"].answerWords}`);
check("style / topic nearest neighbours are reported next to the rate", by["temp-a"].style.nn.startsWith("temp-") && typeof by["temp-a"].topic.sim === "number", JSON.stringify(by["temp-a"].style));

const one = TS.measureOne({ id: "new", text: template("Pip", "convict", "marsh") }, docs, { census });
check("a new templated narration is REVIEW against the others' census", one.corpus === 4 && TS.verdictOf(one.me.runs.per1000, { reviewRunsPer1000: 0.6 }) === "REVIEW", JSON.stringify(one.me.runs));
const two = TS.measureOne({ id: "new", text: own(1) }, docs, { census });
check("a new own-voice narration is OK (its own runs never count)", TS.verdictOf(two.me.runs.per1000, { reviewRunsPer1000: 0.6 }) === "OK", JSON.stringify(two.me.runs));

// VTT parsing: word-timing tags and rolling duplicates go
const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nso <c>here</c> we go\n\n00:00:02.000 --> 00:00:04.000\nso here we go\nand then the gate\n\n00:00:04.000 --> 00:00:06.000\nand then the gate\n";
check("vttText drops tags and rolling duplicates", TS.vttText(vtt) === "so here we go and then the gate", JSON.stringify(TS.vttText(vtt)));

// the record round-trips and binds to the input hash
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ts-"));
fs.mkdirSync(path.join(root, "books", "x"), { recursive: true });
fs.mkdirSync(path.join(root, "public", "captions"), { recursive: true });
fs.writeFileSync(path.join(root, "public", "captions", "x.vtt"), vtt);
const h1 = TS.inputHash(root, "x");
TS.writeRecord(root, "x", { slug: "x", input: h1, verdict: "REVIEW" });
fs.writeFileSync(path.join(root, "public", "captions", "x.vtt"), vtt + "\n00:00:06.000 --> 00:00:08.000\nmore\n");
const h2 = TS.inputHash(root, "x");
check("the record is bound to the recording's hash (a new VTT = a stale record)", TS.readRecord(root, "x").input.sha256 === h1.sha256 && h2.sha256 !== h1.sha256);
check("the default policy has the proposed bar", TS.DEFAULT_POLICY.reviewRunsPer1000 === 0.6 && TS.policyOf(root).reviewRunsPer1000 === 0.6);
fs.rmSync(root, { recursive: true, force: true });

console.log(fails ? `\n✗ ${fails} failing` : "\n✓ transcript sameness regression passes");
process.exit(fails ? 1 : 0);
