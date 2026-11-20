#!/usr/bin/env node
/** test-own-cast.js — Film Flow 5: a head and a garment drawn for the book, on the rig. No render, no network. */
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const C = require("./lib/told-compile");
const OD = require("./lib/own-drawings");
const V1 = require("./fixtures-told-v1");
const V2 = require("./fixtures-told-v2");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const sha = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const circle = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
/** a head the rig can wear: back hair, a fringe under the eyes' line, a moustache, spectacles as a stroke, a collar */
const HEAD = () => ({
  back: [{ d: "M108 150 Q104 58 200 50 Q296 58 292 150 Q282 94 200 94 Q118 94 108 150 Z", fill: "hair" }],
  hair: [{ d: "M110 124 Q108 40 200 36 Q292 40 290 124 Q272 70 234 72 L200 104 L166 72 Q128 70 110 124 Z", fill: "hair" }, { d: "M170 196 Q200 184 230 196 Q200 204 170 196 Z", fill: "hair" }],
  top: [{ d: circle(168, 132, 23) + " " + circle(232, 132, 23), stroke: "ink", strokeWidth: 5 }],
  body: [{ d: "M150 296 L200 366 L250 296 L234 290 L200 334 L166 290 Z", fill: "shirt" }],
});
const PAL = { ink: "#101820", accent: "#B5121B", paper: "#F4EFE6" };

t("nothing a told-v1 / v2 author wrote moves: both golden passages compile to the same stages", () => {
  const a = C.compileTold(V1.BEATS, V1.ENT), b = C.compileTold(V2.BEATS, V2.ENT, { palette: V2.PAL });
  assert.strictEqual(sha(a.stages.map((s) => s && { items: s.items, cam: s.cam })), V1.GOLDEN);
  assert.strictEqual(sha(b.stages.map((s) => s && { items: s.items, cam: s.cam, backdrops: s.backdrops, plate: s.plate })), V2.GOLDEN);
});

t("the rig wears a drawn head: its own hair, beard and headwear step aside, the live features stay", () => {
  const rig = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/characters/Everyman.tsx"), "utf8");
  assert.ok(/const ownHead = !!drawn && \["back", "face", "hair", "top"\]\.some/.test(rig));
  assert.ok(/ownHead \? layer\("back"\) : \(<><HeadwearBack/.test(rig) && /ownHead \? layer\("hair"\) : \(<><FrontHair/.test(rig) && /ownHead \? layer\("top"\) : <Headwear/.test(rig), "each wardrobe part has its drawn replacement");
  // order inside the head: back, face, hair — then brows, eyes, mouth — then top
  const at = (re) => rig.search(re);
  assert.ok(at(/layer\("back"\)/) < at(/layer\("hair"\)/) && at(/layer\("hair"\)/) < at(/\{\/\* eyebrows \*\/\}/) && at(/\{\/\* mouth \*\/\}/) < at(/layer\("top"\)/), "hair is under the eyes and the mouth, a hat over them");
  assert.ok(at(/layer\("cape"\)/) < at(/<Torso /) && at(/<Torso /) < at(/layer\("body"\)/), "a cape behind the body, a collar on it");
  const schema = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/schema.ts"), "utf8");
  assert.ok(/drawn: drawnCast\.optional\(\)/.test(schema), "optional: a config without it renders as before");
  assert.ok(!/drawn:/.test(schema.slice(schema.indexOf("const VARIANT_DEFAULT"), schema.indexOf("const VARIANT_DEFAULT") + 600)), "and there is no default drawing");
});

t("a head the rig can wear passes; a head that covers the eyes, leaves the head, or is two scraps does not", () => {
  const pal = OD.castPalette({}, PAL);
  assert.deepStrictEqual(OD.lintCast(HEAD(), { palette: pal }), []);
  assert.ok(OD.lintCast({ ...HEAD(), top: [{ d: "M120 100 H280 V160 H120 Z", fill: "ink" }] }, { palette: pal }).some((m) => /lies on the eyes or the mouth/.test(m)), "a filled mask over the eyes");
  assert.deepStrictEqual(OD.lintCast({ ...HEAD(), top: [{ d: "M36 84 Q120 58 200 68 Q280 58 364 84 Q300 104 200 100 Q100 104 36 84 Z", fill: "#6B4A2F" }] }, { palette: pal }), [], "a hat brim above the eyes is fine");
  assert.ok(OD.lintCast({ ...HEAD(), back: [{ d: "M0 0 H500 V200 H0 Z", fill: "hair" }] }, { palette: pal }).some((m) => /leaves the head/.test(m)));
  assert.ok(OD.lintCast({ hair: [{ d: "M110 124 H290 V60 Z", fill: "hair" }] }, { palette: pal }).some((m) => /at least 3 paths/.test(m)));
  assert.ok(OD.lintCast({ ...HEAD(), face: [{ d: "M160 120 H240 V180 H160 Z", fill: "skin" }] }, { palette: pal }).some((m) => /does not hold the eyes and the mouth/.test(m)));
  assert.ok(OD.lintCast({ ...HEAD(), hat: [] }, { palette: pal }).some((m) => /the layers are back, face, hair, top, cape, body/.test(m)));
  assert.ok(OD.lintCast({ ...HEAD(), hair: [{ ...HEAD().hair[0], fill: "auburn" }, HEAD().hair[1]] }, { palette: pal }).some((m) => /a hex colour or one of/.test(m)));
  assert.deepStrictEqual(OD.lintCast({ body: [{ d: "M150 296 L200 366 L250 296 Z", fill: "shirt" }] }, { palette: pal }), [], "a garment alone is not asked to be a head");
});

t("tokens become the person's own colours and the book's; the stage is given the resolved head; the brief is generated", () => {
  const ENT = { ...V2.ENT, dracula: { ...V2.ENT.dracula, reads: ["cape"], look: { ...V2.ENT.dracula.look, hair: "#17161A", skin: "#E6DED6", drawn: HEAD() } } };
  const r = C.compileTold([V2.beat("b1", "Dracula stood there", { stage: { layout: "solo", who: ["dracula"] } })], ENT, { palette: PAL });
  assert.deepStrictEqual(r.errors, []);
  const fig = r.stages[0].items.find((x) => x.id === "dracula");
  assert.strictEqual(fig.variant.drawn.hair[0].fill, "#17161A");
  assert.strictEqual(fig.variant.drawn.top[0].stroke, "#101820");
  assert.strictEqual(fig.variant.drawn.body[0].fill, "#FFFFFF", "shirt: the rig's default when the look names none");
  assert.strictEqual(ENT.dracula.look.drawn.hair[0].fill, "hair", "the entity as written is not changed");
  // the signature (and so the blind verdict) is bound to the drawing
  const a = OD.peopleOf(ENT).find((p) => p.entity === "dracula").hash, changed = { ...ENT, dracula: { ...ENT.dracula, look: { ...ENT.dracula.look, drawn: { ...HEAD(), top: [] } } } };
  assert.notStrictEqual(a, OD.peopleOf(changed).find((p) => p.entity === "dracula").hash);
  // a head the rig cannot wear is a problem at prep even in a book that has not taken up the blind test
  const bad = { mina: { label: "MINA", kind: "person", look: { drawn: { top: [{ d: "M120 100 H280 V160 H120 Z", fill: "#000000" }] } } } };
  assert.ok(OD.peopleProblems(OD.peopleOf(bad), bad).some((m) => /person "mina": .*lies on the eyes/.test(m)));
  const g = OD.castGuide(PAL).join("\n");
  assert.ok(/168,132 and 232,132/.test(g) && /200,216/.test(g) && new RegExp(`At least ${OD.CAST.minPaths} paths`).test(g) && /"skin", "hair", "suit", "shirt"/.test(g) && /cast-sheet\.js/.test(g));
});

t("told v4: an older stage never wears a drawn head; one person has one head in every scene, and revert undoes it", () => {
  const T = require("../src/engines/antidote/told.ts"), A = require("./lib/told-apply");
  assert.strictEqual(T.TOLD_VERSION, 4);
  const stage = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/components/ToldStage.tsx"), "utf8");
  assert.ok(stage.includes("if ((spec.v ?? 1) < 4) delete (v as { drawn?: unknown }).drawn"));
  const ent = { mina: { label: "MINA", kind: "person", look: { hair: "#222222", drawn: HEAD() } }, lucy: { label: "LUCY", kind: "person" } };
  const meta = { cast: { mina: { name: "Mina", variant: { hair: "#999999", outfit: "dress" } }, lucy: { name: "Lucy", variant: { hair: "#E3C078" } } } };
  const r = A.castHeads(meta, ent, PAL);
  assert.deepStrictEqual(r.heads, ["mina"]);
  assert.strictEqual(r.meta.cast.mina.variant.drawn.hair[0].fill, "#222222");
  assert.strictEqual(r.meta.cast.mina.variant.outfit, "dress", "what the look does not name stays the cast's");
  assert.strictEqual(r.meta.cast.lucy, meta.cast.lucy, "a person without a drawn head is not touched");
  assert.deepStrictEqual(A.revertTold({ meta: r.meta, scenes: [] }).config.meta, meta);
  assert.deepStrictEqual(A.castHeads(meta, { lucy: ent.lucy }, PAL), { meta, heads: [] });
});

console.log(`\n${n} checks passed`);
