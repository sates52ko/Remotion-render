import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Scene } from "../engines/antidote/components/Scene";
import { RetentionHUD } from "../engines/antidote/components/RetentionHUD";
import { DEFAULT_VARIANT, type SceneSpec, type CastBible } from "../engines/antidote/schema";

const CAST_BIBLE: CastBible = {
  protagonist: {
    name: "Marcus — The Strategist",
    variant: {
      ...DEFAULT_VARIANT,
      skin: "#F2C79B",
      hair: "#2B2622",
      suit: "#1E293B",
      shirt: "#F59E0B",
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

const PROP_SCENES: SceneSpec[] = [
  // 01. Shield (Risk Management)
  {
    ...BASE_SCENE,
    id: "prop-01-shield",
    fromFrame: 0,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "PRINCIPLE 01 / 05",
      topic: "DEFENSIVE ASYMMETRY",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(15, 23, 42)", "rgb(30, 41, 59)"],
      set: "stage",
      texture: "dots",
      accent: "#38BDF8",
    },
    characters: [
      {
        id: "char-1",
        rig: "everyman",
        role: "protagonist",
        expression: "worried",
        action: "hold",
        holds: "shield",
        enter: "left",
        lookAt: "heldProp",
      },
    ],
    texts: [
      {
        text: "PROTECT YOUR DOWNSIDE",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#0284C7",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 02. Hourglass (Time Mastery)
  {
    ...BASE_SCENE,
    id: "prop-02-hourglass",
    fromFrame: 72,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "PRINCIPLE 02 / 05",
      topic: "THE TIME ARBITRAGE",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(24, 24, 27)", "rgb(39, 39, 42)"],
      set: "room",
      texture: "grid",
      accent: "#EAB308",
    },
    characters: [
      {
        id: "char-2",
        rig: "everyman",
        role: "protagonist",
        expression: "neutral",
        action: "hold",
        holds: "hourglass",
        enter: "fade",
        lookAt: "heldProp",
      },
    ],
    texts: [
      {
        text: "TIME IS YOUR ASSET",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#CA8A04",
        enter: "up",
        at: 6,
      },
    ],
  },

  // 03. Target (Ruthless Focus)
  {
    ...BASE_SCENE,
    id: "prop-03-target",
    fromFrame: 144,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "PRINCIPLE 03 / 05",
      topic: "RUTHLESS PRIORITIZATION",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(69, 10, 10)", "rgb(28, 25, 23)"],
      set: "horizon",
      texture: "rays",
      accent: "#EF4444",
    },
    characters: [
      {
        id: "char-3",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "hold",
        holds: "target",
        enter: "right",
        lookAt: "viewer",
      },
    ],
    texts: [
      {
        text: "AIM FOR THE ONE THING",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#DC2626",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 04. Sword (Action & Courage)
  {
    ...BASE_SCENE,
    id: "prop-04-sword",
    fromFrame: 216,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "PRINCIPLE 04 / 05",
      topic: "DECISIVE ACTION",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(49, 10, 36)", "rgb(24, 24, 27)"],
      set: "abstract",
      texture: "grain",
      accent: "#A855F7",
    },
    characters: [
      {
        id: "char-4",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "hold",
        holds: "sword",
        enter: "up",
        emotion: "shock",
        emotionAt: 10,
        lookAt: "viewer",
      },
    ],
    texts: [
      {
        text: "COURAGE OVER COMFORT",
        style: "highlight",
        color: "#FFFFFF",
        boxColor: "#9333EA",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 05. Trophy (Ultimate Victory)
  {
    ...BASE_SCENE,
    id: "prop-05-trophy",
    fromFrame: 288,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "PRINCIPLE 05 / 05",
      topic: "THE LONG GAME MASTERY",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(67, 20, 7)", "rgb(24, 24, 27)"],
      set: "stage",
      texture: "dots",
      accent: "#F59E0B",
    },
    characters: [
      {
        id: "char-5",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "hold",
        holds: "trophy",
        enter: "fade",
        emotion: "fire",
        emotionAt: 8,
        lookAt: "viewer",
      },
    ],
    texts: [
      {
        text: "WINNING THE LONG GAME",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#D97706",
        enter: "up",
        at: 6,
      },
    ],
  },
];

export const AntidotePropsShowcase: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b" }}>
      {PROP_SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.fromFrame}
          durationInFrames={scene.durationFrames}
          name={scene.id}
        >
          <Scene scene={scene} transIn={0} cast={CAST_BIBLE} />
        </Sequence>
      ))}
      <RetentionHUD
        totalFrames={360}
        scenes={PROP_SCENES}
        accent="#F59E0B"
        title="MASTERING STRATEGY"
      />
    </AbsoluteFill>
  );
};
