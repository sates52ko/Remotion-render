import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Scene } from "../engines/antidote/components/Scene";
import { RetentionHUD } from "../engines/antidote/components/RetentionHUD";
import { DEFAULT_VARIANT, type SceneSpec, type CastBible } from "../engines/antidote/schema";

const CAST_BIBLE: CastBible = {
  strategist: {
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

export const METAPHOR_SCENES: SceneSpec[] = [
  {
    ...BASE_SCENE,
    id: "metaphor-01-domino",
    fromFrame: 0,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "METAPHOR 01 / 03",
      topic: "EXPONENTIAL COMPOUNDING",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(15, 23, 42)", "rgb(30, 41, 59)"],
      set: "stage",
      texture: "dots",
      accent: "#F59E0B",
    },
    characters: [
      {
        id: "char-1",
        rig: "everyman",
        role: "strategist",
        action: "point",
        enter: "left",
        emotion: "lightbulb",
        emotionAt: 12,
        lookAt: "motif",
        x: 460,
        y: 690,
        scale: 0.95,
      },
    ],
    props: [
      {
        type: "dominoCascade",
        enter: "fade",
        at: 0,
        arc: "none",
        x: 1220,
        y: 560,
        scale: 1.1,
        color: "#F59E0B",
        color2: "#FFFFFF",
      },
    ],
    texts: [
      {
        text: "TINY HABITS CREATE\nEXPONENTIAL IMPACT",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#D97706",
        enter: "down",
        size: 38,
        x: 1220,
        y: 150,
        at: 6,
      },
    ],
  },
  {
    ...BASE_SCENE,
    id: "metaphor-02-iceberg",
    fromFrame: 72,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "METAPHOR 02 / 03",
      topic: "THE ICEBERG OF EFFORT",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(11, 19, 43)", "rgb(28, 37, 65)"],
      set: "room",
      texture: "grid",
      accent: "#38BDF8",
    },
    characters: [
      {
        id: "char-2",
        rig: "everyman",
        role: "strategist",
        action: "think",
        enter: "fade",
        emotion: "shock",
        emotionAt: 14,
        lookAt: "motif",
        x: 460,
        y: 690,
        scale: 0.95,
      },
    ],
    props: [
      {
        type: "icebergDepth",
        enter: "fade",
        at: 0,
        arc: "none",
        x: 1220,
        y: 590,
        scale: 1.05,
        color: "#38BDF8",
        color2: "#FFFFFF",
      },
    ],
    texts: [
      {
        text: "WHAT THE WORLD SEES\nIS ONLY 10%",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#0284C7",
        enter: "down",
        size: 38,
        x: 1220,
        y: 130,
        at: 6,
      },
    ],
  },
  {
    ...BASE_SCENE,
    id: "metaphor-03-funnel",
    fromFrame: 144,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "METAPHOR 03 / 03",
      topic: "RUTHLESS PRIORITIZATION",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(30, 27, 75)", "rgb(46, 16, 101)"],
      set: "stage",
      texture: "rays",
      accent: "#A855F7",
    },
    characters: [
      {
        id: "char-3",
        rig: "everyman",
        role: "strategist",
        action: "hold",
        holds: "target",
        enter: "fade",
        emotion: "fire",
        emotionAt: 12,
        lookAt: "motif",
        x: 460,
        y: 690,
        scale: 0.95,
      },
    ],
    props: [
      {
        type: "funnelTrap",
        enter: "fade",
        at: 0,
        arc: "none",
        x: 1220,
        y: 590,
        scale: 1.05,
        color: "#A855F7",
        color2: "#FFFFFF",
      },
    ],
    texts: [
      {
        text: "FILTER 100 DISTRACTIONS\nFIND THE ONE THING",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#7C3AED",
        enter: "up",
        size: 38,
        x: 1220,
        y: 130,
        at: 6,
      },
    ],
  },
];

export const ANTIDOTE_METAPHORS_DURATION = 72 * 3; // 216 frames

export const AntidoteMetaphorsShowcase: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b" }}>
      {METAPHOR_SCENES.map((scene) => (
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
        totalFrames={ANTIDOTE_METAPHORS_DURATION}
        scenes={METAPHOR_SCENES}
        accent="#F59E0B"
        title="MASTERING METAPHORS"
      />
    </AbsoluteFill>
  );
};
