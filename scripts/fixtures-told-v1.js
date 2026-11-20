/**
 * fixtures-told-v1.js — a told passage written in the v1 vocabulary only (no drawing on an emblem kind, no state, no
 * hand, no place). test-own-drawings.js compiles it and compares the stages with the hash the told 1.2 compiler
 * (god-mode da05baad) gave for the same input: told v2 must not move, restyle or re-time anything a v1 author wrote.
 */
"use strict";
const words = (s, step = 10) => s.split(" ").map((w, i) => ({ w, f: i * step }));
const beat = (id, text, told, frames = 300) => ({ id, frames, words: words(text), told });

const ENT = {
  microsoft: { label: "MICROSOFT", kind: "company", glyph: "monitor" },
  google: { label: "GOOGLE", kind: "company", glyph: "search" },
  london: { label: "LONDON", kind: "place", glyph: "building" },
  demeter: { label: "SCHOONER DEMETER", kind: "product", glyph: "globe" },
  mozart: { label: "MOZART", kind: "person", look: { age: "child", height: 0.72 }, w: 230 },
  mina: { label: "MINA HARKER", kind: "person", look: { outfit: "dress", hairStyle: "bun", gender: "f" } },
  piano: { label: "PIANO", kind: "object", paths: [{ d: "M0 0 H10 V10 Z", fill: "#000" }, { d: "M40 150 H480 V200 H40 Z", fill: "#3A322B" }], w: 330 },
};

const BEATS = [
  beat("s1", "the fight between Microsoft and Google began when Microsoft was king of operating systems", { stage: { layout: "versus", who: ["microsoft", "google"] }, events: [
    { on: "king", do: "crown", who: "microsoft" }, { on: "operating", do: "label", who: "microsoft", text: "Operating systems" }] }),
  beat("s2", "they lived in separate worlds and then they collided over the browser", { events: [
    { on: "worlds", do: "world", who: ["microsoft", "google"] }, { on: "collided", do: "collide", who: ["microsoft", "google"] }, { on: "browser", do: "title", text: "The browser war", box: "accent" }] }),
  beat("s3", "Windows versus Chrome and Office versus Docs", { events: [
    { on: "Windows", do: "pair", left: "Windows", right: "Chrome", onRight: "Chrome" }, { on: "Office", do: "pair", left: "Office", right: "Docs", onRight: "Docs" }] }),
  beat("s4", "nothing is named here", null),
  beat("s5", "the Demeter sailed for London with Mina waiting and the little Mozart at his piano", { stage: { layout: "row", who: ["demeter", "london", "mina"] }, events: [
    { on: "London", do: "label", who: "london", text: "The great city" }, { on: "Mina", do: "change", who: "mina", action: "think" }, { on: "Mozart", do: "enter", who: "mozart" }, { on: "piano", do: "enter", who: "piano" }] }),
  beat("s6", "on the sixth of July the ship was lost and the forgery was stamped and Mina looked closer", { events: [
    { on: "sixth", do: "date", text: "6 July" }, { on: "lost", do: "dim", who: "demeter" }, { on: "forgery", do: "stamp", who: "piano", text: "Forgery" }, { on: "closer", do: "focus", who: "mina" }] }),
  beat("s7", "then only Mina remained with the letter in her hand", { stage: { layout: "solo", who: ["mina"] }, events: [
    { on: "letter", do: "change", who: "mina", holds: "letter", action: "hold" }, { at: 0, do: "wide" }] }),
];

/** told 1.2 (god-mode da05baad), `v` left out: sha256 of JSON.stringify(stages.map(s => s && { items: s.items, cam: s.cam })) */
const GOLDEN = "ea091ef1015c197fb49ea979cddbb51c38a1037c4edc161679bf26b52e597108";

module.exports = { ENT, BEATS, GOLDEN, words, beat };
