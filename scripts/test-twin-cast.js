#!/usr/bin/env node
// Regression for the "twins" bug (2026-10-17): an unauthored-cast two-person shot
// filled both slots with the same identity, and the authorship lock sealed that
// engine choice as if the author had made it. Run: node scripts/test-twin-cast.js
const fs = require("fs");
const path = require("path");
const { roleIndex, castSlots, lockedCast } = require("./lib/cast-slots");
const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
const { mitigateStagnation } = require("./lib/antidote-stagnation-engine");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const distinct = (a) => new Set(a).size === a.length;

// A story bible whose roles are prose — no director role key matches any of them
// (burn-of-the-everflame's shape).
const PROSE = {
  luther: { name: "Luther", role: "Diem's devoted mate, a commander" },
  teller: { name: "Teller", role: "Dean's mortal brother, grieving" },
  taran: { name: "Taran", role: "Diem's brother, one of the Crowns" },
  narrator: { name: "Narrator", role: "the host voice that frames the argument" },
};
const resolveProse = roleIndex(PROSE);

// (1) prose roles + unauthored cast never yield duplicate identities
for (const shot of ["twoShot", "split", "overShoulder", "medium"]) {
  for (const roles of [["protagonist", "foil"], ["protagonist", "protagonist"], ["extra", "extra"], []]) {
    const r = castSlots({ resolve: resolveProse, roles, count: 2, shot });
    t(`(1) prose bible, ${shot}, roles [${roles}] -> distinct ${r.keys.join("+")}`, r.keys.length === 2 && distinct(r.keys) && r.shot === shot, JSON.stringify(r));
  }
}
const r3 = castSlots({ resolve: resolveProse, roles: ["a", "b", "c"], count: 3, shot: "crowd" });
t("(1) three slots on a 4-person prose bible are three different people", r3.keys.length === 3 && distinct(r3.keys), r3.keys.join("+"));
t("(1) slot 0 keeps the legacy resolution (first key when no role matches)", castSlots({ resolve: resolveProse, roles: ["protagonist"], count: 1, shot: "medium" }).keys[0] === "luther");
// a role-keyed bible still resolves by role
const ROLED = { patch: { role: "protagonist" }, saint: { role: "foil" }, narrator: {} };
const rr = castSlots({ resolve: roleIndex(ROLED), roles: ["protagonist", "foil"], count: 2, shot: "twoShot" });
t("(1) role-keyed bible still maps protagonist/foil to their keys", rr.keys.join("+") === "patch+saint", rr.keys.join("+"));
t("(1) roleIndex without `used` is the legacy resolver", resolveProse("protagonist") === "luther" && roleIndex(ROLED)("foil") === "saint" && roleIndex({})("extra") === "extra");

// (2) set-only art beat -> lock.cast null; restore does not re-insert engine casts,
//     and an unauthored cast that changes later is not reported as drift
const characters = [{ identity: "luther" }, { identity: "teller" }];
t("(2) set-only art beat seals no cast", lockedCast({ set: "forest" }, characters) === null);
t("(2) concept/callout-only art beat seals no cast", lockedCast({ concept: "chains", callout: { text: "X" } }, characters) === null);
const setOnly = {
  id: "scene-01", shot: "medium", bg: { set: "forest" },
  characters: [{ identity: "taran", expression: "neutral", action: "idle" }],
  _authorship: { src: "author", lock: { shot: "medium", set: "forest", cast: lockedCast({ set: "forest" }, characters), expression: null, action: null, holds: null } },
};
t("(2) an engine-recast unauthored beat is NOT drift (no STAGING_OVERRIDDEN from cast)", stagingDrift(setOnly).length === 0, JSON.stringify(stagingDrift(setOnly)));
const before = JSON.stringify(setOnly.characters);
restoreAuthoredStaging({ scenes: [setOnly] });
t("(2) --restore leaves an unauthored cast alone", JSON.stringify(setOnly.characters) === before);

// (3) an authored cast is preserved byte-for-byte, an authored duplicate included
const authoredDup = { cast: ["luther", "luther"] };
const sealed = lockedCast(authoredDup, [{ identity: "luther" }, { identity: "luther" }]);
t("(3) authored duplicate cast is sealed as written", JSON.stringify(sealed) === JSON.stringify(["luther", "luther"]));
const legacy = castSlots({ resolve: resolveProse, roles: ["protagonist", "foil"], count: 2, shot: "twoShot", castAuthored: true });
t("(3) an authored-cast beat keeps the legacy slot resolution (no dedupe, no shot change)", legacy.keys.join("+") === "luther+luther" && legacy.shot === "twoShot" && legacy.dropped === null, JSON.stringify(legacy));
const drifted = {
  id: "scene-02", shot: "twoShot", bg: { set: "forest" },
  characters: [{ identity: "luther" }, { identity: "teller" }],
  _authorship: { src: "author", lock: { shot: "twoShot", set: "forest", cast: sealed, expression: null, action: null, holds: null } },
};
t("(3) an engine dedupe of an authored duplicate IS drift", stagingDrift(drifted).some((d) => d.startsWith("cast ")));
restoreAuthoredStaging({ scenes: [drifted] });
t("(3) --restore puts the authored duplicate back", drifted.characters.map((c) => c.identity).join("+") === "luther+luther");

// (4) one cast member: an unauthored two-person shot becomes a one-person medium
const ONE = { luther: { role: "Diem's devoted mate" } };
for (const shot of ["twoShot", "split", "overShoulder"]) {
  const r = castSlots({ resolve: roleIndex(ONE), roles: ["protagonist", "foil"], count: 2, shot });
  t(`(4) one-member cast, unauthored ${shot} -> medium with one person`, r.shot === "medium" && r.dropped === shot && r.keys.join() === "luther", JSON.stringify(r));
}
const kept = castSlots({ resolve: roleIndex(ONE), roles: ["protagonist", "foil"], count: 2, shot: "twoShot", shotAuthored: true });
t("(4) an authored shotOverride is kept (one person, never twins)", kept.shot === "twoShot" && kept.keys.join() === "luther", JSON.stringify(kept));
const authoredOne = castSlots({ resolve: roleIndex(ONE), roles: ["protagonist", "foil"], count: 2, shot: "twoShot", castAuthored: true });
t("(4) an authored cast is never re-shot", authoredOne.shot === "twoShot" && authoredOne.dropped === null);
t("(4) a one-person shot is not touched", castSlots({ resolve: roleIndex(ONE), roles: ["x"], count: 1, shot: "medium" }).shot === "medium");

// (c) stagnation's CHANGE_ACTION no longer stamps a face on an unauthored beat
const mk = (i, extra = {}) => ({ id: `s${i}`, shot: "medium", bg: { set: "room" }, _noIcon: true, props: [], narrative: { function: "REVEAL" }, characters: [{ identity: "a", expression: "neutral", action: "talk" }], texts: [], camera: { zoom: [1, 1] }, ...extra });
const sc = Array.from({ length: 6 }, (_, i) => mk(i));
const res = mitigateStagnation(sc);
const acted = (res.remediesApplied || []).filter((x) => /CHANGE_ACTION/.test(x.remedy));
t("(c) fixture exercises CHANGE_ACTION on a REVEAL beat", acted.length > 0, JSON.stringify(res.remediesApplied));
t("(c) CHANGE_ACTION leaves the unauthored expression neutral (no 'happy')", sc.every((s) => s.characters[0].expression === "neutral"), sc.map((s) => s.characters[0].expression).join(","));
const auth = Array.from({ length: 6 }, (_, i) => mk(i, { narrative: { function: "TENSION" }, _authorship: { src: "author" }, characters: [{ identity: "a", expression: "sad", action: "talk" }] }));
mitigateStagnation(auth);
t("(c) an authored expression is untouched", auth.every((s) => s.characters[0].expression === "sad"));

// planner wiring (the planner is not modular; the run itself is the census in AGENT_LOG)
const pa = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
t("WIRING plan-antidote casts director slots through castSlots", /castSlots\(\{/.test(pa) && /slots\.keys\[c\]/.test(pa));
t("WIRING the lock seals cast via lockedCast", /cast: lockedCast\(A, out\.characters\)/.test(pa));

console.log(failed ? `\n${failed} FAILED` : "\nall twin-cast checks passed");
process.exit(failed ? 1 : 0);
