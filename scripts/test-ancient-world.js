#!/usr/bin/env node
// test-ancient-world.js — the genre LABEL never makes a book "ancient" (for-review 2026-09-24, Fahrenheit 451)
const { isAncientWorld } = require("./lib/ancient-world");
const cases = [
  ["Fahrenheit 451 labelled 'classics'", { genre: "classics", author: "Ray Bradbury" }, false],
  ["1984 labelled 'classic literature'", { genre: "classic literature", author: "George Orwell" }, false],
  ["WWII history, era 1944", { genre: "history", era: 1944 }, false],
  ["Camus labelled 'philosophy'", { genre: "philosophy", author: "Albert Camus" }, false],
  ["The Republic (Plato)", { genre: "philosophy", author: "Plato" }, true],
  ["The Aeneid labelled 'classics'", { genre: "classics", author: "Virgil" }, true],
  ["stoicism genre", { genre: "stoicism" }, true],
  ["story bible year -380", { genre: "fiction", bible: { world: { approxYear: -380 } } }, true],
  ["known modern year beats an antiquity word", { genre: "greek mythology retelling", era: 2018 }, false],
];
let failed = 0;
for (const [name, input, expect] of cases) {
  const ok = isAncientWorld(input) === expect;
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name} → ${expect ? "ancient" : "not ancient"}`);
}
console.log(`\n═══ RESULTS: ${cases.length - failed} passed, ${failed} failed ═══`);
if (failed) process.exit(1);
