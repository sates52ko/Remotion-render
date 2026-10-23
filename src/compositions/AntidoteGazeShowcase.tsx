import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Scene } from "../engines/antidote/components/Scene";
import { DEFAULT_VARIANT, type SceneSpec, type CastBible } from "../engines/antidote/schema";

const CAST_BIBLE: CastBible = {
  protagonist: {
    name: "Alex — The Presenter",
    variant: {
      ...DEFAULT_VARIANT,
      skin: "#F2C79B",
      hair: "#2B2622",
      suit: "#1E293B",
      shirt: "#38BDF8",
      hairStyle: "short",
      gender: "m",
      age: "adult",
      outfit: "casual",
      glasses: true,
      beard: "stubble",
      expression: "neutral",
    },
  },
  foil: {
    name: "Elena — The Colleague",
    variant: {
      ...DEFAULT_VARIANT,
      skin: "#E5A882",
      hair: "#854D0E",
      suit: "#0F766E",
      shirt: "#F0FDFA",
      hairStyle: "bun",
      gender: "f",
      age: "adult",
      outfit: "suit",
      glasses: false,
      beard: "none",
      expression: "happy",
    },
  },
};

const BASE_SCENE = {
  transition: { type: "cut" as const, frames: 0 },
  camera: {
    zoom: [1, 1] as [number, number],
    panX: [0, 0] as [number, number],
    panY: [0, 0] as [number, number],
  },
  props: [],
};

const GAZE_SCENES: SceneSpec[] = [
  // 01. Direct Viewer Connection (Breaking 4th wall)
  {
    ...BASE_SCENE,
    id: "gaze-01-viewer",
    fromFrame: 0,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(15, 23, 42)", "rgb(30, 41, 59)"],
      set: "stage",
      texture: "dots",
      accent: "#38BDF8",
    },
    characters: [
      {
        id: "char-viewer",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "talk",
        enter: "fade",
        lookAt: "viewer",
      },
    ],
    texts: [
      {
        text: "DIRECT EYE CONTACT",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#0284C7",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 02. Text / Kinetic Callout Lock-On
  {
    ...BASE_SCENE,
    id: "gaze-02-text",
    fromFrame: 72,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(24, 24, 27)", "rgb(39, 39, 42)"],
      set: "room",
      texture: "grid",
      accent: "#F59E0B",
    },
    characters: [
      {
        id: "char-text",
        rig: "everyman",
        role: "protagonist",
        expression: "surprised",
        action: "point",
        enter: "left",
        lookAt: "text",
      },
    ],
    texts: [
      {
        text: "EYES LOCK ONTO CORE IDEAS",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#D97706",
        enter: "up",
        at: 6,
      },
    ],
  },

  // 03. Held Prop / Book Inspection
  {
    ...BASE_SCENE,
    id: "gaze-03-heldprop",
    fromFrame: 144,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(19, 42, 31)", "rgb(15, 23, 42)"],
      set: "office",
      texture: "grain",
      accent: "#10B981",
    },
    characters: [
      {
        id: "char-prop",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "hold",
        holds: "book",
        enter: "right",
        lookAt: "heldProp",
      },
    ],
    texts: [
      {
        text: "INSPECTING HELD OBJECTS",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#059669",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 04. Wandering / Contemplative Gaze
  {
    ...BASE_SCENE,
    id: "gaze-04-wander",
    fromFrame: 216,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(49, 10, 36)", "rgb(24, 24, 27)"],
      set: "abstract",
      texture: "dots",
      accent: "#EC4899",
    },
    characters: [
      {
        id: "char-wander",
        rig: "everyman",
        role: "protagonist",
        expression: "neutral",
        action: "think",
        enter: "up",
        lookAt: "wander",
      },
    ],
    texts: [
      {
        text: "NATURAL WANDERING GAZE",
        style: "highlight",
        color: "#FFFFFF",
        boxColor: "#DB2777",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 05. Conversational Partner Eye-Contact
  {
    ...BASE_SCENE,
    id: "gaze-05-partner",
    fromFrame: 288,
    durationFrames: 72,
    shot: "twoShot",
    bg: {
      type: "gradient",
      colors: ["rgb(30, 27, 75)", "rgb(15, 23, 42)"],
      set: "horizon",
      texture: "rays",
      accent: "#6366F1",
    },
    characters: [
      {
        id: "char-a",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "talk",
        enter: "left",
        lookAt: "partner",
      },
      {
        id: "char-b",
        rig: "everyman",
        role: "foil",
        expression: "happy",
        action: "idle",
        enter: "right",
        lookAt: "partner",
      },
    ],
    texts: [
      {
        text: "TWO-WAY EYE CONTACT",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#4F46E5",
        enter: "up",
        at: 6,
      },
    ],
  },
];

export const AntidoteGazeShowcase: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b" }}>
      {GAZE_SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.fromFrame}
          durationInFrames={scene.durationFrames}
          name={scene.id}
        >
          <Scene scene={scene} transIn={0} cast={CAST_BIBLE} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
