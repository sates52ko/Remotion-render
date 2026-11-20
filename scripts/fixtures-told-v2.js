/**
 * fixtures-told-v2.js — a told passage in the v2 vocabulary (own drawings, states, hands, a place, a timeline, a change
 * of stage) and NO `act`. test-told-acts.js compiles it and compares the stages with the hash the told v2 compiler
 * (dev/own-drawings 0c89758a, round 2) gave: told v3 must not move, restyle or re-time anything a v2 author wrote.
 */
"use strict";
const words = (s, step = 10) => s.split(" ").map((w, i) => ({ w, f: i * step }));
const beat = (id, text, told, frames = 300) => ({ id, frames, words: words(text), told });
const rect = (x, y, w, h, fill) => ({ d: `M${x} ${y} H${x + w} V${y + h} H${x} Z`, fill });
const good = (accent = "accent") => [rect(40, 300, 440, 120, "ink"), rect(80, 120, 60, 180, "ink"), rect(220, 60, 60, 240, "ink"), rect(360, 140, 60, 160, "ink"), rect(150, 330, 220, 40, accent)];
const other = () => [rect(40, 360, 440, 100, "ink"), rect(60, 250, 120, 110, "ink"), rect(300, 200, 150, 160, "ink"), rect(100, 100, 40, 150, "ink"), rect(340, 380, 80, 30, "accent")];
const wide = () => [rect(0, 560, 1920, 200, "ink"), rect(200, 300, 160, 260, "ink"), rect(700, 120, 220, 440, "ink"), rect(1300, 260, 180, 300, "ink"), rect(760, 200, 60, 60, "accent")];
const PAL = { ink: "#101820", accent: "#B5121B", paper: "#F4EFE6" };

const ENT = {
  demeter: { label: "SCHOONER DEMETER", kind: "product", glyph: "globe", reads: ["ship"], paths: good(), w: 380, states: { wrecked: { reads: ["shipwreck"], paths: other() } } },
  box: { label: "EARTH BOX", kind: "object", reads: ["box", "crate"], paths: good("#7A4A21") },
  typewriter: { label: "PORTABLE TYPEWRITER", kind: "object", w: 380, reads: ["typewriter"], paths: other() },
  journal: { label: "JOURNAL", kind: "object", reads: ["book"], paths: good("#5B3A21") },
  london: { label: "LONDON", kind: "place", glyph: "building", reads: ["city"], paths: good(), backdrop: { reads: ["skyline"], paths: wide() } },
  varna: { label: "VARNA", kind: "place", glyph: "globe" },
  mina: { label: "MINA HARKER", kind: "person", look: { outfit: "dress", gender: "f", height: 0.92 } },
  jonathan: { label: "JONATHAN HARKER", kind: "person", look: { outfit: "coat" } },
  dracula: { label: "COUNT DRACULA", kind: "person", look: { outfit: "cloak", height: 1.05 } },
};

const BEATS = [
  beat("s1", "the Demeter drifted in fog off Varna and was a massive ship", { stage: { layout: "row", who: ["demeter", "varna", "box"] }, events: [
    { on: "fog", do: "label", who: "demeter", text: "Drifting in sea fog" }, { on: "massive", do: "grow", who: "demeter", to: 1.3 }] }),
  beat("s2", "it was a massacre and on the seventeenth of July it was wrecked", { events: [
    { on: "massacre", do: "stamp", who: "demeter", text: "Massacre" }, { on: "seventeenth", do: "date", text: "17 July" }, { on: "wrecked", do: "change", who: "demeter", state: "wrecked" }] }),
  beat("s3", "then Dracula came ashore and the ship was forgotten", { events: [{ on: "Dracula", do: "enter", who: "dracula" }, { on: "forgotten", do: "dim", who: "demeter" }] }),
  beat("s4", "nothing is named here", null),
  beat("s5", "in London Jonathan broke down while Mina took over", { stage: { layout: "versus", who: ["jonathan", "mina"], at: "london" }, events: [
    { on: "broke", do: "dim", who: "jonathan" }, { on: "Mina", do: "crown", who: "mina" }] }),
  beat("s6", "Jonathan had kept the journal and at last gave it to Mina", { stage: { layout: "versus", who: ["jonathan", "mina"], at: "london" }, events: [
    { on: "journal", do: "change", who: "jonathan", holds: "journal" }, { on: "gave", do: "give", who: ["jonathan", "mina"], what: "journal" }] }),
  beat("s7", "she typed it all out and typed it again with the pressure of the keys", { stage: { layout: "versus", who: ["mina", "typewriter"] }, events: [
    { on: "typed", do: "change", who: "mina", action: "think" }, { on: "again", do: "grow", who: "typewriter" }, { on: "pressure", do: "label", who: "typewriter", text: "Carbon paper transfer" }] }),
  beat("s8", "and then she took the box and looked closer", { stage: { layout: "versus", who: ["box", "mina"] }, events: [
    { on: "took", do: "take", who: "mina", what: "box" }, { on: "closer", do: "focus", who: "mina" }] }),
];

/** told v2 round 2 (dev/own-drawings 0c89758a): sha256 of JSON.stringify(stages.map(s => s && { items, cam, backdrops, plate })) */
const GOLDEN = "762989a32e0207fc37ad01cbdff0c7061513646292d63f8b710cb4035fb08805";

module.exports = { ENT, BEATS, PAL, GOLDEN, words, beat, good, other, wide };
