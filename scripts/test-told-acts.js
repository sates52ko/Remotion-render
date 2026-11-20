#!/usr/bin/env node
/** test-told-acts.js — Film Flow 4 / told v3: people play the verb on a told stage. No render, no network. */
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const C = require("./lib/told-compile");
const R = require("./lib/told-rules");
const T = require("../src/engines/antidote/told.ts");
const TA = require("../src/engines/antidote/toldActs.ts");
const V1 = require("./fixtures-told-v1");
const V2 = require("./fixtures-told-v2");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const { words, beat, ENT, PAL } = V2;
const compile = (beats, ent = ENT) => C.compileTold(beats, ent, { palette: PAL });
const item = (stage, id) => stage.items.find((x) => x.id === id);
const wordAt = (text, w) => words(text).find((x) => x.w === w).f;
/** whichever version of a person is on stage at that frame (a person who changes is a new item fading in over the old) */
const live = (s, id, f) => { const all = s.items.filter((x) => x.id === id || x.id.startsWith(`${id}~`)).map((x) => [x, T.itemState(x, f)]).filter(([, st]) => st && st.o > 0.5); return all.length ? all[all.length - 1] : null; };
const sha = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");

t("told v1 and v2 are untouched: both golden passages compile to the stages their compilers gave", () => {
  const a = C.compileTold(V1.BEATS, V1.ENT);
  assert.strictEqual(sha(a.stages.map((s) => s && { items: s.items, cam: s.cam })), V1.GOLDEN, "a told-v1 beat is placed, timed or drawn differently");
  const b = compile(V2.BEATS);
  assert.deepStrictEqual(b.errors, []);
  assert.strictEqual(sha(b.stages.map((s) => s && { items: s.items, cam: s.cam, backdrops: s.backdrops, plate: s.plate })), V2.GOLDEN, "a told-v2 beat is placed, timed or drawn differently");
  for (const s of [...a.stages, ...b.stages].filter(Boolean)) assert.ok(!s.items.some((it) => "act" in it), "no figure plays a verb nobody wrote");
  assert.ok(T.TOLD_VERSION >= 3);
});

t("the engine reads `act` only on a v3 stage; the stage is still ONE svg; the verb module is pure", () => {
  const stage = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/components/ToldStage.tsx"), "utf8");
  assert.ok(/\(spec\.v \?\? 1\) >= 3 && it\.act/.test(stage), "a v1 / v2 stage must never be posed by `act`");
  assert.ok((stage.match(/<svg /g) || []).length === 1 && !/style=\{\{[^}]*transform/.test(stage));
  const acts = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/toldActs.ts"), "utf8");
  assert.ok(!/^\s*import\s/m.test(acts), "toldActs.ts has no import (plain Node loads it)");
  // the list of rig actions is the rig's: every action of schema.ts charAction, nothing else
  const schema = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/schema.ts"), "utf8");
  const block = schema.slice(schema.indexOf("export const charAction = z.enum(["), schema.indexOf("export type CharAction"));
  const rig = [...block.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n").matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual([...TA.RIG_ACTIONS].sort(), [...new Set(rig)].sort());
});

t("every verb is one gesture: it is still before it starts, it comes to rest, and nothing loops", () => {
  for (const verb of TA.ACT_POSES) {
    const at = 200, p = (f) => JSON.stringify(TA.actPose({ verb, at }, f));
    assert.strictEqual(p(at + TA.ACT_REST[verb] + 1), p(at + TA.ACT_REST[verb] + 400), `${verb} is at rest after ${TA.ACT_REST[verb]} frames`);
    assert.strictEqual(p(at - TA.ACT_LEAD[verb] - 3), p(at - 500), `${verb} has not started before its lead`);
    // (a reaction — struck, bitten — starts ON the word; every verb has visibly happened six frames after it)
    assert.notStrictEqual(p(at + 6), p(at - TA.ACT_LEAD[verb] - 3), `${verb}: something has happened by the word`);
    assert.strictEqual(p(at + 100000), JSON.stringify(TA.actPose({ verb, at: -9999 }, 0)), "a figure carried over a cut is simply at rest");
  }
  // the strike lands ON the word: the burst at the fist starts there and is gone ten frames later
  assert.strictEqual(TA.actPose({ verb: "hit", at: 100 }, 99).impact, 0);
  assert.strictEqual(TA.actPose({ verb: "hit", at: 100 }, 100).impact, 1);
  assert.strictEqual(TA.actPose({ verb: "hit", at: 100 }, 111).impact, 0);
  assert.ok(TA.actPose({ verb: "hit", at: 100 }, 100).armR < -100, "the arm is out on the word");
  // counted strokes: typing is TYPE_TAPS key strokes with alternating hands, then the hands rest
  let taps = 0, was = 0; for (let f = 0; f < 200; f++) { const p = TA.actPose({ verb: "type", at: 0 }, f); const k = Math.abs(p.elbowR - 66) + Math.abs(p.elbowL + 66); if (k > 6 && was <= 6) taps++; was = k; }
  assert.strictEqual(taps, TA.TYPE_TAPS);
  assert.strictEqual(TA.actPose({ verb: "type", at: 0 }, 300).sit, 1, "the typist stays seated");
});

t("hit: the person walks up, turns to the other, the fist lands on the word; the other is struck on the same word", () => {
  const text = "Jonathan was patient for years and then one night he struck Dracula";
  const r = compile([beat("b1", text, { stage: { layout: "versus", who: ["jonathan", "dracula"] }, events: [{ on: "struck", do: "act", who: "jonathan", verb: "hit", target: "dracula" }] })]);
  assert.deepStrictEqual(r.errors, []);
  const s = r.stages[0], at = wordAt(text, "struck");
  const [jon, pj] = live(s, "jonathan", at), [dra, pd] = live(s, "dracula", at + 2);
  assert.deepStrictEqual(jon.act, { verb: "hit", at });
  assert.deepStrictEqual(dra.act, { verb: "struck", at });
  assert.ok(Math.abs(pd.x - pj.x) < 290 && Math.abs(pd.x - pj.x) > 180, `within reach on the word (${Math.abs(pd.x - pj.x)})`);
  assert.ok(!jon.flip && dra.flip, "they face each other (he stands left: no flip; the other is flipped to face him)");
  assert.ok(live(s, "jonathan", 20)[1].x < pj.x - 100, "he had to walk up to him");
  assert.ok(dra.shake && dra.shake.at === at);
  // the next beat finds them at rest in it — the blow is not struck again
  const two = compile([beat("b1", text, { stage: { layout: "versus", who: ["jonathan", "dracula"] }, events: [{ on: "struck", do: "act", who: "jonathan", verb: "hit", target: "dracula" }] }), beat("b2", "and it changed nothing", { events: [{ on: "nothing", do: "title", text: "It changed nothing" }] })]);
  assert.deepStrictEqual(item(two.stages[1], "jonathan").act, { verb: "hit", at: -9999 });
  assert.ok(!item(two.stages[1], "dracula").shake);
});

t("type: the person SITS at the thing — a desk in front of them, the typewriter on it under their hands", () => {
  const text = "night after night Mina sat down and typed every page in manifold";
  const r = compile([beat("b1", text, { stage: { layout: "versus", who: ["mina", "typewriter"] }, events: [{ on: "typed", do: "act", who: "mina", verb: "type", target: "typewriter" }] })]);
  assert.deepStrictEqual(r.errors, []);
  const s = r.stages[0], at = wordAt(text, "typed");
  const [mina, pm] = live(s, "mina", 299), tw = item(s, "typewriter"), pt = T.itemState(tw, 299), desk = item(s, "mina.desk");
  assert.deepStrictEqual(mina.act, { verb: "type", at });
  assert.ok(Math.abs(pt.x - pm.x) < 2, "the typewriter is in front of her, not beside her");
  assert.ok(tw.w * pt.s < mina.w * pm.s * 0.7, "at a size a person types on");
  // round 2 — she is the subject: larger than she stood, and the thing leaves her head, shoulders and arms free
  const stood = T.itemState(s.items.find((x) => x.id.startsWith("mina~")) || mina, 2).s;
  assert.ok(pm.s > stood * 1.03 && pm.s <= 1.12, `seated she is drawn larger (${stood} → ${pm.s})`);
  const k = (mina.w / 400) * pm.s * Math.min(1, mina.variant.height || 1), shoulders = pm.y - (900 - 330) * k, thingTop = pt.y - (tw.w / 2) * pt.s;
  assert.ok(thingTop > shoulders + 60 * k, `the top of the thing (${Math.round(thingTop)}) is well under her shoulders (${Math.round(shoulders)})`);
  assert.ok(mina.labelDy > 40, "her name plate comes down with her head");
  assert.ok(desk && desk.kind === "bar" && T.itemState(desk, 299).y > pt.y, "it stands on a desk");
  const order = ["mina", "mina.desk", "typewriter"].map((id) => s.items.indexOf(item(s, id)));
  assert.ok(order[0] < order[1] && order[1] < order[2], "drawn: the person, the desk, the thing on it");
  // she gets up when the stage turns to something else, and the desk goes
  const two = compile([beat("b1", text, { stage: { layout: "versus", who: ["mina", "typewriter"] }, events: [{ on: "typed", do: "act", who: "mina", verb: "type", target: "typewriter" }] }), beat("b2", "then she went to Jonathan", { stage: { layout: "versus", who: ["mina", "jonathan"] } })]);
  assert.deepStrictEqual(two.errors, []);
  assert.ok(!live(two.stages[1], "mina", 299)[0].act && item(two.stages[1], "mina.desk").exit, "standing again, no desk");
});

t("bite, point, read, hide, dig, fall, come, chase: each puts the people where the verb needs them", () => {
  const one = (text, events, who = ["dracula", "mina"]) => { const r = compile([beat("b1", text, { stage: { layout: who.length > 2 ? "row" : "versus", who }, events })]); assert.deepStrictEqual(r.errors, [], text); return r.stages[0]; };
  let s = one("he came to her at night and bit her as she slept", [{ on: "bit", do: "act", who: "dracula", verb: "bite", target: "mina" }]);
  let at = wordAt("he came to her at night and bit her as she slept", "bit");
  assert.ok(Math.abs(live(s, "dracula", at)[1].x - live(s, "mina", at + 2)[1].x) < 240, "close enough to bite");
  assert.strictEqual(live(s, "mina", at + 2)[0].act.verb, "bitten");

  // round 2: a glance is not a verb (read by nobody) — `look` and `meet` are refused with the list of what is
  for (const verb of ["look", "meet"]) { const r = compile([beat("b1", "he only watched her", { stage: { layout: "versus", who: ["dracula", "mina"] }, events: [{ on: "watched", do: "act", who: "dracula", verb, target: "mina" }] })]); assert.ok(r.errors.some((e) => new RegExp(`verb "${verb}" — one of hit`).test(e.message)), verb); }
  s = one("she pointed straight at him", [{ on: "pointed", do: "act", who: "mina", verb: "point", target: "dracula" }]);
  assert.ok(live(s, "mina", 299)[0].action === "point" && live(s, "mina", 299)[0].flip, "the rig's own point, turned to him");

  s = one("Mina opened the journal and read it through the night", [{ on: "read", do: "act", who: "mina", verb: "read", target: "journal" }], ["mina", "jonathan"]);
  const held = s.items.find((x) => /mina\.held/.test(x.id));
  assert.ok(held && held.paths.length === 5 && live(s, "mina", 299)[0].act.verb === "read", "the book is in her hands and she reads");

  s = one("he hid behind the box until they had gone", [{ on: "hid", do: "act", who: "jonathan", verb: "hide", target: "box" }], ["jonathan", "box"]);
  const [jon, pj] = live(s, "jonathan", 299), box = item(s, "box"), pb = T.itemState(box, 299);
  assert.ok(jon.act.verb === "hide" && Math.abs(pj.x - pb.x) < box.w * 0.5 && s.items.indexOf(jon) < s.items.indexOf(box), "behind it: overlapping, drawn first");
  assert.ok(pj.y < 850 && pj.y > pb.y, "down on the thing's ground, not on the stage floor below it");

  s = one("they dug beside the box for an hour", [{ on: "dug", do: "act", who: "jonathan", verb: "dig", target: "box" }], ["jonathan", "box"]);
  assert.ok(live(s, "jonathan", 299)[0].act.verb === "dig" && Math.abs(live(s, "jonathan", 299)[1].x - T.itemState(item(s, "box"), 299).x) > 200, "beside it, not on it");
  const mound = item(s, "jonathan.dig");
  assert.ok(mound && mound.kind === "icon" && mound.paths.length >= 4 && !mound.label, "the earth and the spade are there: a bent figure alone read as someone falling");

  const fallText = "and Jonathan fell where he stood and that was all there was to it now";
  s = one(fallText, [{ on: "fell", do: "act", who: "jonathan", verb: "fall" }], ["jonathan", "mina"]);
  assert.strictEqual(live(s, "jonathan", wordAt(fallText, "fell"))[0].action, "falling");
  assert.strictEqual(live(s, "jonathan", 299)[0].action, "collapsed");

  const comeText = "she waited a long time until at last Jonathan came to her";
  const r = compile([beat("b1", comeText, { stage: { layout: "solo", who: ["mina"] }, events: [{ on: "came", do: "act", who: "jonathan", verb: "come", target: "mina" }] })]);
  assert.deepStrictEqual(r.errors, []);
  at = wordAt(comeText, "came");
  const walk = r.stages[0].items.find((x) => x.id.startsWith("jonathan") && x.action === "walk"), pm = T.itemState(item(r.stages[0], "mina"), 299);
  assert.ok(walk && (T.itemState(walk, at - 40).x < 0 || T.itemState(walk, at - 40).x > 1920 || Math.abs(T.itemState(walk, at - 40).x - pm.x) > 600), "he starts far off");
  const end = live(r.stages[0], "jonathan", 299);
  assert.ok(end[0].action === "idle" && Math.abs(end[1].x - pm.x) > 220 && end[1].x > 100 && end[1].x < 1820, "he has arrived and stands with her on the stage (the stage made room: nobody is walked onto)");
  assert.ok(end[0].flip !== !!item(r.stages[0], "mina").flip || end[1].x > pm.x, "turned to her");
  // a third person already next to the other: the newcomer gets a place of their own
  const three = compile([beat("b1", "Mina and Dracula stood there for a long while and then Jonathan came to Mina", { stage: { layout: "versus", who: ["mina", "dracula"] }, events: [{ on: "came", do: "act", who: "jonathan", verb: "come", target: "mina" }] })]);
  assert.deepStrictEqual(three.errors, []);
  const xs = ["mina", "dracula", "jonathan"].map((id) => live(three.stages[0], id, 299)[1].x).sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] > 250 && xs[2] - xs[1] > 250, `three people, three places (${xs.map(Math.round)})`);

  const chaseText = "then Jonathan chased Dracula across the yard and out of sight of the house at last";
  s = one(chaseText, [{ on: "chased", do: "act", who: "jonathan", verb: "chase", target: "dracula" }], ["jonathan", "dracula"]);
  at = wordAt(chaseText, "chased");
  assert.strictEqual(live(s, "dracula", at + 20)[0].action, "run"); assert.strictEqual(live(s, "jonathan", at + 20)[0].action, "run");
  assert.ok(live(s, "dracula", at + 30)[1].x > live(s, "dracula", at)[1].x + 300, "he runs for the edge");
  assert.strictEqual(live(s, "dracula", 299), null, "the one who flees runs off the stage and is gone");
  const chaser = live(s, "jonathan", 299);
  assert.ok(chaser[1].x > 1100 && chaser[0].action === "idle" && chaser[0].act.verb === "look", "the chaser stops and looks after him: no running on the spot");
});

t("a verb the stage cannot honour is refused with the reason", () => {
  // (round 2) a second verb for the same person in one beat is merge's to refuse; the compiler still takes the events in order
  const bad = (events, who = ["mina", "typewriter", "varna"]) => compile([beat("b1", "she typed and hit and read and hid and came", { stage: { layout: "row", who }, events })]).errors.map((e) => e.message).join(" | ");
  assert.ok(/verb "sing" — one of hit/.test(bad([{ on: "typed", do: "act", who: "mina", verb: "sing" }])));
  assert.ok(/"who" is the PERSON/.test(bad([{ on: "typed", do: "act", who: "typewriter", verb: "type", target: "typewriter" }])));
  assert.ok(/needs "target" — the person it is done to/.test(bad([{ on: "hit", do: "act", who: "mina", verb: "hit" }])));
  assert.ok(/target "typewriter" is not a person/.test(bad([{ on: "hit", do: "act", who: "mina", verb: "hit", target: "typewriter" }])));
  assert.ok(/target "varna" is not a drawn thing/.test(bad([{ on: "typed", do: "act", who: "mina", verb: "type", target: "varna" }])));
  assert.ok(/dracula is not on stage/.test(bad([{ on: "hit", do: "act", who: "mina", verb: "hit", target: "dracula" }])));
  assert.ok(/verb "look" — one of hit/.test(bad([{ on: "read", do: "act", who: "mina", verb: "look", target: "varna" }])));
  assert.ok(/jonathan is not on stage \(stage \/ enter first — or the verb "come"\)/.test(bad([{ on: "read", do: "act", who: "jonathan", verb: "read", target: "journal" }])));
});

t("merge: an act is checked like every told event; a person on stage with nobody doing anything is a WARNING", () => {
  const chk = (told, text) => R.checkToldBeat(told, text, ENT);
  assert.deepStrictEqual(chk({ stage: { layout: "versus", who: ["mina", "typewriter"] }, events: [{ on: "typed", do: "act", who: "mina", verb: "type", target: "typewriter" }] }, "she typed it"), []);
  const bad = chk({ events: [{ on: "typed", do: "act", who: "mina", verb: "sing" }, { on: "hit", do: "act", who: "typewriter", verb: "hit", target: "mina" }, { on: "bit", do: "act", who: "dracula", verb: "bite" }, { on: "read", do: "act", who: "mina", verb: "read", target: "varna" }, { on: "saw", do: "act", who: "mina", verb: "point", target: "mina" }] }, "she typed and hit and bit and read and saw");
  for (const re of [/verb "sing"/, /"who" is the one PERSON/, /\(act bite\): needs "target"/, /target "varna" is not a drawn thing/, /does not point themselves/, /mina already plays a verb in this beat — one verb per person per beat/]) assert.ok(bad.some((m) => re.test(m)), `${re} in\n  ${bad.join("\n  ")}`);
  const watch = R.toldWatch(ENT);
  assert.ok(watch({ stage: { layout: "versus", who: ["mina", "typewriter"] }, events: [{ on: "x", do: "title", text: "Typing in manifold" }] }).some((m) => /mina is on stage and nobody DOES anything/.test(m)));
  assert.ok(watch({ events: [{ on: "x", do: "label", who: "typewriter", text: "Carbon paper" }] }).some((m) => /nobody DOES/.test(m)), "the stage is carried: she is still there in the next beat");
  assert.deepStrictEqual(watch({ events: [{ on: "x", do: "act", who: "mina", verb: "type", target: "typewriter" }] }), []);
  assert.ok(watch({ events: [{ on: "x", do: "change", who: "mina", action: "typing" }] }).some((m) => /"typing" is not an action of the rig/.test(m)));
  assert.deepStrictEqual(watch({ events: [{ on: "x", do: "change", who: "mina", action: "sit" }] }), []);
  assert.deepStrictEqual(watch(null), []);
  assert.deepStrictEqual(watch({ stage: { layout: "row", who: ["demeter", "varna"] }, events: [{ on: "x", do: "grow", who: "demeter" }] }), [], "a stage of things alone is not asked for a verb");
});

t("the rules an author reads name every verb and say what the viewer will see; a book without people is not told about verbs", () => {
  const sec = R.toldSection(ENT);
  assert.ok(/PEOPLE PLAY THE VERB/.test(sec) && /\| `act` \|/.test(sec));
  for (const v of Object.keys(C.VERBS)) assert.ok(new RegExp(`\\| \`${v}\` \\|`).test(sec), `${v} is in the verb table`);
  assert.deepStrictEqual(Object.keys(C.VERBS).sort(), [...TA.TOLD_VERBS].sort());
  assert.deepStrictEqual(Object.keys(R.VERB_HELP).sort(), [...TA.TOLD_VERBS].sort());
  assert.ok(/`fighting`/.test(sec) && /is NOT an action/.test(sec));
  const things = R.toldSection({ microsoft: { label: "MICROSOFT", kind: "company" }, google: { label: "GOOGLE", kind: "company" } });
  assert.ok(!/PEOPLE PLAY THE VERB/.test(things) && !/\| verb \| target \|/.test(things));
});

t("the book's own people: a signature, readings written before the blind test, a verdict bound to the look", () => {
  const OD = require("./lib/own-drawings");
  const PEOPLE = { ...ENT,
    dracula: { ...ENT.dracula, reads: ["cape", "top hat"], look: { ...ENT.dracula.look, headwear: "topHat" } },
    mina: { ...ENT.mina, reads: ["dark dress"] },
    jonathan: { ...ENT.jonathan, reads: ["suit", "notebook"], carries: "journal" } };
  const people = OD.peopleOf(PEOPLE);
  assert.deepStrictEqual(people.map((p) => p.key), ["person:mina", "person:jonathan", "person:dracula"]);
  assert.deepStrictEqual(OD.peopleProblems(people, PEOPLE), []);
  // a book that has not taken up the test is not asked; one that has, is asked for everybody
  assert.deepStrictEqual(OD.peopleProblems(OD.peopleOf(ENT), ENT), []);
  assert.deepStrictEqual(OD.gatePeople(OD.peopleOf(ENT), null), []);
  const half = { ...PEOPLE, mina: ENT.mina };
  assert.ok(OD.peopleProblems(OD.peopleOf(half), half).some((m) => /person "mina": no "reads"/.test(m)));
  const twins = { a: { label: "A", kind: "person", reads: ["man"], look: { outfit: "suit" } }, b: { label: "B", kind: "person", reads: ["man"], look: { outfit: "suit" } } };
  assert.ok(OD.peopleProblems(OD.peopleOf(twins), twins).some((m) => /drawn exactly like "a"/.test(m)));
  const named = { a: { label: "COUNT DRACULA", kind: "person", reads: ["dracula"], look: {} } };
  assert.ok(OD.peopleProblems(OD.peopleOf(named), named).some((m) => /contains the name/.test(m)));
  const badCarry = { ...PEOPLE, jonathan: { ...PEOPLE.jonathan, carries: "varna" } };
  assert.ok(OD.peopleProblems(OD.peopleOf(badCarry), badCarry).some((m) => /carries "varna" — a DRAWN thing/.test(m)));
  // the verdict
  const v = OD.judge(people, { 1: "woman in a dark dress with a bun", 2: "man in a suit holding a notebook", 3: "man in black robe, mustache" });
  assert.strictEqual(v.named, 2);
  const g = OD.gatePeople(people, v);
  assert.ok(g.length === 1 && /person "dracula" was read as "man in black robe, mustache"/.test(g[0]));
  assert.deepStrictEqual(OD.gatePeople(people, v, new Set(["mina", "jonathan", "typewriter"])), [], "only the people a told beat puts on stage are asked");
  assert.ok(OD.gatePeople(people, null)[0].includes("has not been seen blind"));
  const changed = OD.peopleOf({ ...PEOPLE, mina: { ...PEOPLE.mina, look: { ...PEOPLE.mina.look, headwear: "bonnet" } } });
  assert.ok(OD.gatePeople(changed, v, new Set(["mina"]))[0].includes("changed after the blind test"));
  // the signature on stage: the drawn thing they are never without is in their hand from the moment they enter
  const r = compile([beat("b1", "Jonathan arrived in the evening", { stage: { layout: "solo", who: ["jonathan"] } })], PEOPLE);
  assert.deepStrictEqual(r.errors, []);
  const held = r.stages[0].items.find((x) => /jonathan\.held/.test(x.id));
  assert.ok(held && held.paths.length === 5 && item(r.stages[0], "jonathan").action === "hold");
  assert.ok(!compile([beat("b1", "Jonathan arrived", { stage: { layout: "solo", who: ["jonathan"] } })]).stages[0].items.some((x) => /held/.test(x.id)), "nobody carries what the book did not give them");
  const sheet = fs.readFileSync(path.join(__dirname, "cast-sheet.js"), "utf8");
  assert.ok(/delete it\.label/.test(sheet) && /hud: \{ enabled: false \}/.test(sheet), "the cast sheet shows the person WITHOUT the name and without the book's title");
});

// ── round 2 (operator's list, 2026-11-17) ────────────────────────────────────────────────────────────────────────────
t("round 2 · two people in contact: the name plates do not lie on each other — the one who acts carries theirs higher", () => {
  for (const verb of ["bite", "hit"]) {
    const text = "he came to her at night and then it happened as she slept";
    const r = compile([beat("b1", text, { stage: { layout: "versus", who: ["dracula", "mina"] }, events: [{ on: "happened", do: "act", who: "dracula", verb, target: "mina" }] })]);
    assert.deepStrictEqual(r.errors, []);
    const at = wordAt(text, "happened"), [d, pd] = live(r.stages[0], "dracula", at + 4), [m, pm] = live(r.stages[0], "mina", at + 4);
    const plate = (it, st) => { const w = it.w, h = w * 2.25, v = Math.min(1, it.variant.height || 1), top = st.y + (-h + h * (1 - v) * 0.9 - 38 - 34 + (it.labelDy || 0)) * st.s, half = (T.plateW(it.label, it.size || 38) / 2) * st.s; return { x0: st.x - half, x1: st.x + half, y0: top, y1: top + 60 * st.s }; };
    const a = plate(d, pd), b = plate(m, pm), overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    assert.ok(overlapX > 0, "they are close enough for their plates to meet side by side");
    assert.ok(overlapY <= 0, `${verb}: the two plates are one above the other (vertical overlap ${Math.round(overlapY)})`);
    assert.ok(!d.size && !m.size, "at full reading size");
  }
});

t("round 2 · a crown comes down with a seated head and goes back up when they stand; a seated person who is re-arranged gets up first", () => {
  const text = "night after night Mina sat down and typed every page in manifold and Jonathan came in later";
  const r = compile([
    beat("b0", "Mina took charge of it all", { stage: { layout: "versus", who: ["mina", "typewriter"] }, events: [{ on: "charge", do: "crown", who: "mina" }] }),
    beat("b1", text, { events: [{ on: "typed", do: "act", who: "mina", verb: "type", target: "typewriter" }, { on: "Jonathan", do: "enter", who: "jonathan" }] }),
  ]);
  assert.deepStrictEqual(r.errors, []);
  const s = r.stages[1], crown = item(s, "mina.crown"), at = wordAt(text, "typed"), atJ = wordAt(text, "Jonathan");
  assert.ok(T.itemState(crown, at + 2).y > T.itemState(crown, 2).y + 30, "the crown is lower once she sits");
  const desk = item(s, "mina.desk");
  assert.ok(desk.exit && desk.exit.at <= atJ && !(desk.keys || []).length, "the desk is gone before she is moved, and never slides with her");
  const end = live(s, "mina", 299);
  assert.ok(!end[0].act && !end[0].labelDy, "she stands when the stage makes room for the newcomer");
  assert.ok(Math.abs(T.itemState(crown, 299).y - (end[1].y - (C.figH(end[0]) + 78 + 46) * end[1].s)) < 30, "and the crown is back over her name plate");
  const tw = T.itemState(item(s, "typewriter"), 299);
  assert.ok(Math.abs(tw.x - end[1].x) > 250, "the typewriter stands in its own place again");
});

t("round 2 · the rules say which verbs a muted viewer reads (measured), that come is a physical arrival, one verb per beat, and no glance", () => {
  const sec = R.toldSection(ENT);
  assert.ok(/read by a muted viewer \(measured\)/.test(sec) && /5 of 6 WHILE WALKING/.test(sec) && /1 of 1/.test(sec));
  assert.deepStrictEqual(Object.keys(R.VERB_MEASURED).sort(), Object.keys(C.VERBS).sort(), "every verb says how it was read, or that it was not measured");
  assert.ok(/ONE verb per person per beat/.test(sec) && /is a PHYSICAL arrival/.test(sec) && /There is no verb for a glance/.test(sec));
  assert.ok(!/\| `look` \|/.test(sec) && !/\| `meet` \|/.test(sec));
  const watch = R.toldWatch(ENT);
  const w = watch({ stage: { layout: "versus", who: ["dracula", "london"] }, events: [{ on: "x", do: "act", who: "dracula", verb: "come", target: "london" }] });
  assert.ok(w.some((m) => /act come → "london" is a PLACE/.test(m)), w.join(" | "));
  assert.deepStrictEqual(watch({ stage: { layout: "solo", who: ["mina"] }, events: [{ on: "x", do: "act", who: "jonathan", verb: "come", target: "mina" }] }), [], "a person walking up to a person is what it is for");
  // point: what is carried is put away so that the arm is seen
  const P = { ...ENT, jonathan: { ...ENT.jonathan, carries: "journal" } };
  const r = compile([beat("b1", "Jonathan pointed straight at him", { stage: { layout: "versus", who: ["jonathan", "dracula"] }, events: [{ on: "pointed", do: "act", who: "jonathan", verb: "point", target: "dracula" }] })], P);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.stages[0].items.filter((x) => /jonathan\.held/.test(x.id)).every((x) => x.exit), "the journal leaves his hands for the gesture");
});

console.log(`\n${n} checks passed`);
