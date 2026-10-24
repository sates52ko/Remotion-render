#!/usr/bin/env node
// A book's own icons are all props of type "customSvg"; continuity.ts used to treat "same type" as "the same object",
// so a DIFFERENT own icon on a kept (`continue`) beat inherited the previous icon's clock / seed / held arcs and
// appeared already drawn (as-good-as-dead 16: Dead Pigeon -> Chalk Stick Figure, carried with clock 391; 8 such
// cuts in 4 real books, 2026-10-23). Now an own icon is the same object only when it is the same drawing.
// Shared icons are unchanged (same type = same object). Pure: no Remotion. Run: node scripts/test-own-icon-identity.js
const C = require("../src/engines/antidote/continuity.ts");
const { shotPreset } = require("../src/engines/antidote/shots.ts");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const draws = (s) => !shotPreset(s).dropsCast;
const own = (title, d = "M0 0 L10 10") => ({ type: "customSvg", at: 0, customSvg: { title, viewBox: "0 0 520 520", paths: [{ d }] } });
const scene = (props, k) => ({ id: `s${k}`, shot: "illustration", durationFrames: 120, props, ...(k ? { continueFromPrev: true } : {}) });
const plan = (...propsPerScene) => C.planContinuity(propsPerScene.map((p, k) => scene(p, k)), draws);

t("sameObject: same own drawing -> the same object", C.sameObject(own("Dead Pigeon"), own("Dead Pigeon")));
t("sameObject: another own icon -> another object", !C.sameObject(own("Dead Pigeon"), own("Chalk Stick Figure", "M5 5 L9 9")));
t("sameObject: same title, other drawing -> another object", !C.sameObject(own("Fig"), own("Fig", "M1 1 L2 2")));
t("sameObject: shared icons stay type-matched", C.sameObject({ type: "chains" }, { type: "chains" }) && !C.sameObject({ type: "chains" }, { type: "phone" }));

const swap = plan([own("Dead Pigeon")], [own("Chalk Stick Figure", "M5 5 L9 9")]);
t("kept beat, a different own icon: NOT carried (it draws itself in)", swap[1].props[0].carried === false, JSON.stringify(swap[1].props[0]));
const keep = plan([own("Fig")], [own("Fig")], [own("Fig")]);
t("kept beat, the same own icon: carried, clock runs on", keep[1].props[0].carried === true && keep[2].props[0].carried === true && keep[2].props[0].clock > keep[1].props[0].clock, JSON.stringify(keep.map((p) => p.props[0])));
const shared = plan([{ type: "chains", at: 0 }], [{ type: "chains", at: 0 }]);
t("kept beat, the same shared icon: carried (unchanged behaviour)", shared[1].props[0].carried === true);
const mixed = plan([own("Fig"), { type: "chains", at: 0 }], [{ type: "chains", at: 0 }, own("Brain", "M3 3 L4 4")]);
t("kept beat, shared carried and a new own icon fresh, in one scene", mixed[1].props[0].carried === true && mixed[1].props[1].carried === false, JSON.stringify(mixed[1].props));
const notKept = C.planContinuity([scene([own("Fig")], 0), { ...scene([own("Fig")], 1), continueFromPrev: false }], draws);
t("not a kept beat: nothing carried (unchanged)", notKept[1].active === false);

console.log(failed ? `\n${failed} FAILED` : "\nall own-icon identity tests passed");
process.exit(failed ? 1 : 0);
