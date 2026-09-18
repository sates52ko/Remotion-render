import type { AntidoteConfig } from "./schema";

/**
 * lab4.ts — a dev reel for Antidote 4.0 Phase A: MULTIPLANE + LOOK-AT.
 *
 * Goes through the ordinary AntidoteBook render path (same schema/shots/rig) with
 * `meta.multiplane: true`, so a regression here is a regression in a real book.
 * Each beat isolates one capability:
 *   1. depth planes + two characters turned to EACH OTHER (twoShot, lookAt partner)
 *   2. a character turning to LOOK AT a motif (medium, lookAt motif)
 *   3. foreground/background depth separation on a pan (overShoulder)
 *   4. a character oriented toward the hero icon (illustration, lookAt motif)
 *
 * Registered as `Antidote4-lab`. Not part of any book; safe to change. Compare it
 * against `Antidote-lab` (the flat, pre-4.0 reel) to see the difference.
 */

const PAPER = "rgb(246,241,232)";
const INK = "#24242A";
const RED = "#C4523A";
const GOLD = "#C99A48";
const TEAL = "#3E6B7E";

const FPS = 30;
const BEAT = 240; // 8s per demo beat

type Beat = Omit<AntidoteConfig["scenes"][number], "fromFrame" | "durationFrames">;
type Variant = NonNullable<AntidoteConfig["meta"]["cast"]>[string]["variant"];

const BASE: Variant = {
  skin: "#F2C79B", hair: "#3A2A22", suit: TEAL, shirt: "#FFFFFF", expression: "neutral",
  hairStyle: "short", glasses: false, beard: "none", gender: "m", age: "adult", outfit: "casual",
  headwear: "none", accessory: "none", build: "average", height: 1, headScale: 1, overlay: [],
};

const BEATS: Beat[] = [
  {
    // DEPTH + INTERACTION: near/far characters turned to each other; a motif set
    // back on a third plane. On the pan all three slide at different rates.
    id: "mp-twoshot",
    shot: "twoShot",
    transition: { type: "cut", frames: 0 },
    bg: { type: "gradient", colors: [PAPER, "rgb(226,216,200)"], set: "cafe", texture: "paper", accent: INK },
    camera: { zoom: [1, 1.08], panX: [-46, 46], panY: [0, 0] },
    characters: [
      { id: "a", rig: "everyman", role: "protagonist", action: "talk", enter: "fade", depth: 1.28, lookAt: "partner" },
      { id: "b", rig: "everyman", role: "foil", action: "idle", enter: "fade", depth: 0.82, lookAt: "partner" },
    ],
    props: [{ type: "heart", x: 960, y: 470, scale: 0.7, enter: "fade", at: 8, depth: 0.55, color: RED, arc: "none" }],
    texts: [{ text: "THEY LOOK AT EACH OTHER", style: "box", color: PAPER, boxColor: RED, enter: "pop", at: 12 }],
  },
  {
    // LOOK-AT A MOTIF: the figure turns its head toward the idea on the right as
    // the camera pushes in.
    id: "mp-lookmotif",
    shot: "medium",
    transition: { type: "dissolve", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(234,224,208)", PAPER], set: "room", texture: "grain", accent: INK },
    camera: { zoom: [1, 1.12], panX: [30, -30], panY: [0, 0], punch: { at: 20, amount: 0.05 } },
    characters: [
      { id: "c", rig: "everyman", role: "narrator", action: "point", enter: "left", lookAt: "motif" },
    ],
    props: [{ type: "lightbulb", x: 1400, y: 470, scale: 1.15, enter: "pop", at: 10, depth: 0.85, color: GOLD, arc: "grow" }],
    texts: [{ text: "TURNS TO THE IDEA", style: "reveal", color: INK, boxColor: RED, enter: "pop", at: 20 }],
  },
  {
    // FOREGROUND/BACKGROUND DEPTH: the dark foreground shoulder (auto near) slides
    // far more than the subject beyond it on the pan — instant 2.5D.
    id: "mp-overshoulder",
    shot: "overShoulder",
    transition: { type: "whipLeft", frames: 12, color: RED },
    bg: { type: "gradient", colors: ["rgb(216,222,230)", PAPER], set: "office", texture: "grain", accent: INK },
    camera: { zoom: [1.04, 1], panX: [50, -50], panY: [0, 0] },
    characters: [
      { id: "fg", rig: "everyman", role: "foil", action: "idle", enter: "fade" },
      { id: "subj", rig: "everyman", role: "protagonist", action: "talk", enter: "fade", lookAt: "callout" },
    ],
    props: [],
    texts: [{ text: "REAL DEPTH", style: "highlight", color: INK, boxColor: GOLD, enter: "pop", at: 14 }],
  },
  {
    // LOOK-AT THE HERO ICON: the silhouette figure is oriented toward the compass.
    id: "mp-illustration",
    shot: "illustration",
    transition: { type: "wipeUp", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(226,214,196)", "rgb(198,184,164)"], set: "horizon", texture: "paper", accent: INK },
    camera: { zoom: [1, 1.06], panX: [-30, 30], panY: [0, 0] },
    concept: "compass",
    characters: [{ id: "seeker", rig: "everyman", role: "protagonist", action: "reach", enter: "fade", lookAt: "motif" }],
    props: [{ type: "compass", x: 1262, y: 446, scale: 1.66, enter: "pop", at: 8, color: RED, color2: INK, arc: "tilt" }],
    texts: [{ text: "ORIENTED TO THE SUBJECT", style: "box", color: PAPER, boxColor: INK, enter: "pop", at: 16 }],
  },
  {
    // EXPLANATORY DIAGRAM — sorter: a taxonomy routing into labelled buckets.
    id: "dg-sorter",
    shot: "insert", // dropsCast — the diagram is the hero
    transition: { type: "dissolve", frames: 10 },
    bg: { type: "gradient", colors: [PAPER, "rgb(228,220,206)"], set: "none", texture: "dots", accent: INK },
    camera: { zoom: [1, 1.04], panX: [0, 0], panY: [0, 0] },
    diagram: { type: "sorter", title: "Every conversation is one of three", labels: ["PRACTICAL", "EMOTIONAL", "SOCIAL"], values: [3, 4, 2], at: 4, scale: 1 },
    characters: [],
    props: [],
    texts: [],
  },
  {
    // EXPLANATORY DIAGRAM — matchWave: two rhythms lock into sync.
    id: "dg-matchwave",
    shot: "insert",
    transition: { type: "wipeRight", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(230,224,236)", PAPER], set: "none", texture: "grid", accent: INK },
    camera: { zoom: [1, 1.05], panX: [0, 0], panY: [0, 0] },
    diagram: { type: "matchWave", title: "When we connect, we sync", labels: ["IN SYNC"], values: [], at: 4, scale: 1 },
    characters: [],
    props: [],
    texts: [],
  },
  {
    // EXPLANATORY DIAGRAM — flow: cause → effect chain.
    id: "dg-flow",
    shot: "insert",
    transition: { type: "wipeLeft", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(226,232,224)", PAPER], set: "none", texture: "dots", accent: INK },
    camera: { zoom: [1.03, 1], panX: [0, 0], panY: [0, 0] },
    diagram: { type: "flow", title: "Attention becomes connection", labels: ["ATTENTION", "MATCHING", "TRUST"], values: [], at: 4, scale: 1 },
    characters: [],
    props: [],
    texts: [],
  },
  {
    // EXPLANATORY DIAGRAM — spectrum: a marker on a continuum.
    id: "dg-spectrum",
    shot: "insert",
    transition: { type: "flash", frames: 8, color: GOLD },
    bg: { type: "gradient", colors: [PAPER, "rgb(226,216,200)"], set: "none", texture: "grain", accent: INK },
    camera: { zoom: [1, 1.05], panX: [0, 0], panY: [0, 0] },
    diagram: { type: "spectrum", title: "Where is this conversation?", labels: ["SURFACE", "DEEP"], values: [0.78], at: 4, scale: 1 },
    characters: [],
    props: [],
    texts: [],
  },
];

export const ANTIDOTE_LAB4: AntidoteConfig = {
  meta: {
    slug: "antidote-lab4",
    title: "Antidote 4.0 — Multiplane + Look-at",
    author: "engine",
    fps: FPS,
    width: 1920,
    height: 1080,
    durationInFrames: BEATS.length * BEAT,
    multiplane: true,
    cast: {
      narrator: { name: "Narrator", variant: { ...BASE, skin: "#F2C79B", hair: "#3A2A22", suit: RED, hairStyle: "short", gender: "m", outfit: "casual" } },
      protagonist: { name: "Lead", variant: { ...BASE, skin: "#E7B489", hair: "#2B2622", suit: TEAL, shirt: PAPER, hairStyle: "bun", glasses: true, gender: "f", outfit: "hoodie" } },
      foil: { name: "Foil", variant: { ...BASE, skin: "#8C5A3C", hair: "#241C16", suit: "#40485C", shirt: "rgb(240,232,220)", hairStyle: "short", beard: "stubble", gender: "m", outfit: "suit", accessory: "tie" } },
      mentor: { name: "Mentor", variant: { ...BASE, skin: "#E0B48C", hair: "#9A9187", suit: "#606E54", shirt: "#FFFFFF", hairStyle: "short", glasses: true, gender: "f", age: "old", outfit: "coat", accessory: "scarf" } },
      extra: { name: "Extra", variant: { ...BASE, skin: "#F0C79E", hair: "#4A342A", suit: "#787880", hairStyle: "messy", gender: "m", age: "young", outfit: "casual" } },
    },
  },
  scenes: BEATS.map((b, i) => ({ ...b, fromFrame: i * BEAT, durationFrames: BEAT })) as AntidoteConfig["scenes"],
  captions: [],
};
