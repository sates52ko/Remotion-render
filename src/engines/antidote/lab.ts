import type { AntidoteConfig } from "./schema";

/**
 * lab.ts — a dev reel for the Antidote engine's 3.0 capabilities.
 *
 * CastSheet shows what the RIG can look like; this shows what the ENGINE can
 * do: full-body figures standing on a ground plane, walking across a set,
 * sitting in one, holding the object a beat is about, and the real locations
 * that replaced the abstract fields. It goes through the ordinary AntidoteBook
 * render path — same schema, same shots, same director output shape — so a
 * regression here is a regression in a real book.
 *
 * Registered as `Antidote-lab`. Not part of any book; safe to change.
 */

const PAPER = "rgb(246,241,232)";
const INK = "#24242A";
const RED = "#C4523A";
const GOLD = "#C99A48";

const FPS = 30;
const BEAT = 210; // 7s per demo beat

type Beat = Omit<AntidoteConfig["scenes"][number], "fromFrame" | "durationFrames">;
type Variant = NonNullable<AntidoteConfig["meta"]["cast"]>[string]["variant"];

// Foundry baseline — every cast member spreads this, so adding a wardrobe slot
// never means retyping five variants here.
const BASE: Variant = {
  skin: "#F2C79B", hair: "#3A2A22", suit: "#4E6E8E", shirt: "#FFFFFF", expression: "neutral",
  hairStyle: "short", glasses: false, beard: "none", gender: "m", age: "adult", outfit: "casual",
  headwear: "none", accessory: "none", build: "average", height: 1, headScale: 1, overlay: [],
};

const BEATS: Beat[] = [
  {
    id: "full-body-wide",
    shot: "wide",
    transition: { type: "cut", frames: 0 },
    bg: { type: "gradient", colors: [PAPER, "rgb(226,216,200)"], set: "horizon", texture: "paper", accent: INK },
    camera: { zoom: [1, 1.06], panX: [-20, 20], panY: [0, 0] },
    characters: [
      { id: "a", rig: "everyman", role: "protagonist", action: "idle", enter: "fade" },
      { id: "b", rig: "everyman", role: "foil", action: "talk", enter: "fade" },
    ],
    props: [],
    texts: [{ text: "WHOLE PEOPLE", style: "box", color: PAPER, boxColor: RED, enter: "pop", at: 10 }],
  },
  {
    id: "walk-highway",
    shot: "wide",
    transition: { type: "whipLeft", frames: 12, color: RED },
    bg: { type: "gradient", colors: ["rgb(214,224,236)", PAPER], set: "highway", texture: "grain", accent: INK },
    camera: { zoom: [1.04, 1], panX: [24, -24], panY: [0, 0] },
    characters: [
      { id: "walker", rig: "everyman", role: "protagonist", action: "walk", travel: [-320, 320], enter: "fade" },
    ],
    props: [],
    texts: [{ text: "AND THEY WALK", style: "reveal", color: INK, boxColor: RED, enter: "pop", at: 14 }],
  },
  {
    id: "sit-cafe",
    shot: "wide",
    transition: { type: "dissolve", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(238,226,206)", PAPER], set: "cafe", texture: "grain", accent: INK },
    camera: { zoom: [1, 1.05], panX: [0, 0], panY: [0, 0] },
    characters: [
      { id: "sitter", rig: "everyman", role: "narrator", action: "sit", enter: "fade" },
      { id: "other", rig: "everyman", role: "foil", action: "talk", enter: "fade" },
    ],
    props: [],
    texts: [{ text: "AND SIT DOWN", style: "highlight", color: INK, boxColor: GOLD, enter: "pop", at: 12 }],
  },
  {
    id: "hold-library",
    shot: "medium",
    transition: { type: "wipeRight", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(234,224,208)", PAPER], set: "library", texture: "paper", accent: INK },
    camera: { zoom: [1.06, 1], panX: [0, 0], panY: [0, 0], punch: { at: 24, amount: 0.06 } },
    characters: [
      { id: "reader", rig: "everyman", role: "protagonist", action: "hold", holds: "book", enter: "left" },
    ],
    props: [],
    texts: [{ text: "HOLDING THE THING", style: "box", color: PAPER, boxColor: RED, enter: "pop", at: 24 }],
  },
  {
    id: "hold-letter",
    shot: "medium",
    transition: { type: "irisIn", frames: 14, color: RED },
    bg: { type: "gradient", colors: ["rgb(230,214,214)", PAPER], set: "bedroom", texture: "grain", accent: INK },
    camera: { zoom: [1, 1.07], panX: [0, 0], panY: [0, 0] },
    characters: [
      { id: "reader2", rig: "everyman", role: "narrator", action: "hold", holds: "letter", expression: "worried", enter: "fade" },
    ],
    props: [],
    texts: [{ text: "THE BEAT IS ABOUT", style: "stack", color: PAPER, boxColor: INK, enter: "pop", at: 16 }],
  },
  {
    id: "crowd-street",
    shot: "crowd",
    transition: { type: "wipeUp", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(216,222,230)", PAPER], set: "street", texture: "grain", accent: INK },
    camera: { zoom: [1, 1.04], panX: [-18, 18], panY: [0, 0] },
    characters: [
      { id: "crowd", rig: "everyman", role: "extra", action: "idle", crowd: 9, enter: "fade" },
    ],
    props: [],
    texts: [{ text: "EVERYONE ELSE", style: "box", color: PAPER, boxColor: INK, enter: "pop", at: 12 }],
  },
  {
    id: "court",
    shot: "diorama",
    transition: { type: "flash", frames: 8, color: GOLD },
    bg: { type: "gradient", colors: ["rgb(226,214,196)", "rgb(198,184,164)"], set: "court", texture: "paper", accent: INK },
    camera: { zoom: [1.05, 1], panX: [0, 0], panY: [0, 0] },
    concept: "law",
    characters: [{ id: "accused", rig: "everyman", role: "protagonist", action: "idle", enter: "fade" }],
    props: [{ type: "law", x: 1250, y: 520, scale: 1.5, enter: "pop", at: 6, color: RED, color2: INK, arc: "closein" }],
    texts: [{ text: "A REAL PLACE", style: "outline", color: INK, boxColor: GOLD, enter: "pop", at: 18 }],
  },
  {
    id: "silhouette-shore",
    shot: "silhouette",
    transition: { type: "slideUp", frames: 10 },
    bg: { type: "gradient", colors: ["rgb(238,206,178)", "rgb(206,158,128)"], set: "shore", texture: "rays", accent: INK },
    camera: { zoom: [1, 1.05], panX: [0, 0], panY: [0, 0] },
    characters: [{ id: "sil", rig: "everyman", role: "protagonist", action: "reach", enter: "fade" }],
    props: [],
    texts: [{ text: "FULL SILHOUETTE", style: "plain", color: PAPER, boxColor: INK, enter: "pop", at: 12 }],
  },
];

export const ANTIDOTE_LAB: AntidoteConfig = {
  meta: {
    slug: "antidote-lab",
    title: "Antidote 3.0",
    author: "engine",
    fps: FPS,
    width: 1920,
    height: 1080,
    durationInFrames: BEATS.length * BEAT,
    cast: {
      narrator: { name: "Narrator", variant: { ...BASE, skin: "#F2C79B", hair: "#3A2A22", suit: RED, shirt: "#FFFFFF", hairStyle: "short", glasses: false, beard: "none", gender: "m", age: "adult", outfit: "casual", expression: "neutral" } },
      protagonist: { name: "Lead", variant: { ...BASE, skin: "#E7B489", hair: "#2B2622", suit: "#3E6B7E", shirt: "rgb(246,241,232)", hairStyle: "long", glasses: false, beard: "none", gender: "f", age: "adult", outfit: "casual", expression: "neutral" } },
      foil: { name: "Foil", variant: { ...BASE, skin: "#C98A5E", hair: "#241C16", suit: INK, shirt: "rgb(240,232,220)", hairStyle: "buzz", glasses: false, beard: "stubble", gender: "m", age: "adult", outfit: "suit", expression: "neutral" } },
      mentor: { name: "Mentor", variant: { ...BASE, skin: "#F0C9A0", hair: "#9A9A9A", suit: "#7A4A3A", shirt: "#FFFFFF", hairStyle: "bald", glasses: true, beard: "full", gender: "m", age: "old", outfit: "suit", expression: "neutral" } },
      extra: { name: "Extra", variant: { ...BASE, skin: "#DDA97C", hair: "#3B302A", suit: "#6E7A86", shirt: "rgb(240,232,220)", hairStyle: "buzz", glasses: false, beard: "none", gender: "m", age: "young", outfit: "uniform", expression: "neutral" } },
    },
  },
  scenes: BEATS.map((b, i) => ({ ...b, fromFrame: i * BEAT, durationFrames: BEAT })) as AntidoteConfig["scenes"],
  captions: [],
};
