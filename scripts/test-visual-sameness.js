#!/usr/bin/env node
/**
 * test-visual-sameness.js — pHash / histogram film comparison on synthetic PNG frames (seconds, no render).
 *   node scripts/test-visual-sameness.js
 */
const PNG = require("./lib/png-lite");
const VS = require("./lib/visual-sameness");

let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`); if (!ok) fails++; };

const W = 96, H = 54;
// a "film" = frames drawn by a painter(x, y, t) → [r, g, b]
const film = (painter, n = 6) => Array.from({ length: n }, (_, t) => {
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = painter(x, y, t); const i = (y * W + x) * 3; rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; }
  return VS.frameOf(PNG.encode(W, H, rgb));
});
// the channel's card: dark frame, a light block on the left, a red bar — the block drifts a little per frame
const card = (shift) => (x, y, t) => (x > 8 + shift + t && x < 40 + shift + t && y > 10 && y < 44 ? [235, 230, 220] : y > 48 ? [220, 60, 40] : [12, 12, 16]);
// a bright scene with a sky and a ground, different every frame
const scene = (x, y, t) => (y < 20 + (t % 3) * 4 ? [200, 215, 230] : y < 40 ? [120 + (x * 2 + t * 30) % 60, 100, 70] : [90, 80, 60]);
// noise
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const noise = () => [rnd() * 255, rnd() * 255, rnd() * 255];

const films = { "card-a": film(card(0)), "card-b": film(card(3)), scene: film(scene), noise: film(noise) };
const dec = PNG.decode(PNG.encode(4, 2, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])));
check("png-lite round-trips an RGB image", dec.width === 4 && dec.height === 2 && dec.channels === 3 && dec.data[0] === 1 && dec.data[23] === 24, JSON.stringify([dec.width, dec.height, dec.channels, dec.data[23]]));

const r = VS.compareAll(films);
const pair = (a, b) => r.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
check("two films of the same card family are each other's nearest and highly alike", r.nearest["card-a"].to === "card-b" && pair("card-a", "card-b").alike > 0.8, JSON.stringify(pair("card-a", "card-b")));
check("a bright scene is far from the dark card family", pair("card-a", "scene").alike < pair("card-a", "card-b").alike - 0.15, JSON.stringify([pair("card-a", "scene"), pair("card-a", "card-b")]));
check("noise is nobody's near neighbour on layout", pair("scene", "noise").layout < 0.75 && pair("card-a", "noise").layout < 0.75, JSON.stringify([pair("scene", "noise"), pair("card-a", "noise")]));
check("dark share: the card family is mostly dark, the scene is not", r.dark["card-a"] > 0.5 && r.dark.scene < 0.1, JSON.stringify(r.dark));
check("a frame against itself is identical (layout 1, palette 1)", VS.compareFilms(films.scene.slice(0, 1), films.scene.slice(0, 1)).alike === 1);

console.log(fails ? `\n✗ ${fails} failing` : "\n✓ visual sameness regression passes");
process.exit(fails ? 1 : 0);
