import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Scene } from "../engines/antidote/components/Scene";
import { DEFAULT_VARIANT, type SceneSpec, type CastBible } from "../engines/antidote/schema";

const CAST_BIBLE: CastBible = {
  protagonist: {
    name: "Alex — The Thinker",
    variant: {
      ...DEFAULT_VARIANT,
      skin: "#F2C79B",
      hair: "#2B2622",
      suit: "#1E293B",
      shirt: "#F8FAFC",
      hairStyle: "short",
      gender: "m",
      age: "adult",
      outfit: "casual",
      glasses: true,
      beard: "stubble",
      expression: "neutral",
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

const SHOWCASE_SCENES: SceneSpec[] = [
  // 01. Insight / "Aha!" Moment (Lightbulb)
  {
    ...BASE_SCENE,
    id: "showcase-01-lightbulb",
    fromFrame: 0,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(30, 41, 59)", "rgb(15, 23, 42)"],
      set: "office",
      texture: "dots",
      accent: "#F59E0B",
    },
    characters: [
      {
        id: "char-1",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "talk",
        enter: "left",
        emotion: "lightbulb",
        emotionAt: 10,
      },
    ],
    texts: [
      {
        text: "THE 'AHA!' MOMENT",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#F59E0B",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 02. Cognitive Trap / Stress (Sweat drop + Jitter)
  {
    ...BASE_SCENE,
    id: "showcase-02-sweat",
    fromFrame: 72,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(51, 65, 85)", "rgb(30, 41, 59)"],
      set: "room",
      texture: "grain",
      accent: "#38BDF8",
    },
    characters: [
      {
        id: "char-2",
        rig: "everyman",
        role: "protagonist",
        expression: "worried",
        action: "think",
        enter: "up",
        emotion: "sweat",
        emotionAt: 8,
      },
    ],
    texts: [
      {
        text: "COGNITIVE BIAS TRAP",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#0284C7",
        enter: "up",
        at: 6,
      },
    ],
  },

  // 03. Mystery & Questioning (Question Marks)
  {
    ...BASE_SCENE,
    id: "showcase-03-question",
    fromFrame: 144,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(30, 27, 75)", "rgb(15, 23, 42)"],
      set: "abstract",
      texture: "grid",
      accent: "#6366F1",
    },
    characters: [
      {
        id: "char-3",
        rig: "everyman",
        role: "protagonist",
        expression: "surprised",
        action: "idle",
        enter: "right",
        emotion: "question",
        emotionAt: 8,
      },
    ],
    texts: [
      {
        text: "WHY DO WE ASSUME THIS?",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#6366F1",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 04. Sudden Paradigm Shift (Shock Burst)
  {
    ...BASE_SCENE,
    id: "showcase-04-shock",
    fromFrame: 216,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(69, 10, 10)", "rgb(28, 25, 23)"],
      set: "horizon",
      texture: "rays",
      accent: "#EF4444",
    },
    characters: [
      {
        id: "char-4",
        rig: "everyman",
        role: "protagonist",
        expression: "surprised",
        action: "point",
        enter: "left",
        emotion: "shock",
        emotionAt: 8,
      },
    ],
    texts: [
      {
        text: "EVERYTHING CHANGES",
        style: "highlight",
        color: "#FFFFFF",
        boxColor: "#EF4444",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 05. Unstoppable Drive / Discipline (Fire)
  {
    ...BASE_SCENE,
    id: "showcase-05-fire",
    fromFrame: 288,
    durationFrames: 72,
    shot: "medium",
    bg: {
      type: "gradient",
      colors: ["rgb(67, 20, 7)", "rgb(24, 24, 27)"],
      set: "stage",
      texture: "grain",
      accent: "#EA580C",
    },
    characters: [
      {
        id: "char-5",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "celebrate",
        enter: "up",
        emotion: "fire",
        emotionAt: 8,
      },
    ],
    texts: [
      {
        text: "UNSTOPPABLE DISCIPLINE",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#EA580C",
        enter: "up",
        at: 6,
      },
    ],
  },
];

export const AntidoteShowcase: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b" }}>
      {SHOWCASE_SCENES.map((scene) => (
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
