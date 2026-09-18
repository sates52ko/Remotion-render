import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Scene } from "../engines/antidote/components/Scene";
import { RetentionHUD } from "../engines/antidote/components/RetentionHUD";
import { DEFAULT_VARIANT, type SceneSpec, type CastBible } from "../engines/antidote/schema";

const CAST_BIBLE: CastBible = {
  protagonist: {
    name: "Alex — The Presenter",
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

const HUD_SCENES: SceneSpec[] = [
  // 01. Insight 1 / 4
  {
    ...BASE_SCENE,
    id: "hud-01-insight1",
    fromFrame: 0,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "INSIGHT 01 / 04",
      topic: "THE 1% COMPOUND HABIT",
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
        role: "protagonist",
        expression: "happy",
        action: "talk",
        enter: "fade",
        emotion: "lightbulb",
        emotionAt: 10,
        lookAt: "viewer",
      },
    ],
    texts: [
      {
        text: "SMALL HABITS COMPOUND",
        style: "reveal",
        color: "#FFFFFF",
        boxColor: "#F59E0B",
        enter: "down",
        at: 6,
      },
    ],
  },

  // 02. Insight 2 / 4
  {
    ...BASE_SCENE,
    id: "hud-02-insight2",
    fromFrame: 72,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "INSIGHT 02 / 04",
      topic: "THE LATENT POTENTIAL",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(24, 24, 27)", "rgb(39, 39, 42)"],
      set: "room",
      texture: "grid",
      accent: "#0284C7",
    },
    characters: [
      {
        id: "char-2",
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
        text: "BREAKTHROUGH TAKES TIME",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#0284C7",
        enter: "up",
        at: 6,
      },
    ],
  },

  // 03. Chapter Card (Auto-Hides HUD to keep full focus)
  {
    ...BASE_SCENE,
    id: "hud-03-chapter",
    fromFrame: 144,
    durationFrames: 72,
    shot: "chapterCard",
    chapterCard: {
      category: "PART",
      number: "II",
      title: "THE FOUR LAWS",
      subtitle: "How behaviors actually stick",
      accentColor: "#D4AF37",
    },
    bg: {
      type: "flat",
      colors: ["#111827"],
      set: "none",
      texture: "none",
      accent: "#D4AF37",
    },
    characters: [],
    texts: [],
  },

  // 04. Insight 4 / 4 (Climax & Fire)
  {
    ...BASE_SCENE,
    id: "hud-04-insight4",
    fromFrame: 216,
    durationFrames: 72,
    shot: "medium",
    hud: {
      badge: "INSIGHT 04 / 04",
      topic: "THE IDENTITY SHIFT",
    },
    bg: {
      type: "gradient",
      colors: ["rgb(67, 20, 7)", "rgb(24, 24, 27)"],
      set: "stage",
      texture: "grain",
      accent: "#EA580C",
    },
    characters: [
      {
        id: "char-4",
        rig: "everyman",
        role: "protagonist",
        expression: "happy",
        action: "celebrate",
        enter: "up",
        emotion: "fire",
        emotionAt: 8,
        lookAt: "viewer",
      },
    ],
    texts: [
      {
        text: "BECOME THE PERSON YOU WANT",
        style: "box",
        color: "#FFFFFF",
        boxColor: "#EA580C",
        enter: "up",
        at: 6,
      },
    ],
  },
];

export const AntidoteHUDShowcase: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b" }}>
      {HUD_SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.fromFrame}
          durationInFrames={scene.durationFrames}
          name={scene.id}
        >
          <Scene scene={scene} transIn={0} cast={CAST_BIBLE} />
        </Sequence>
      ))}
      {/* Top Safe-Zone Retention HUD */}
      <RetentionHUD
        totalFrames={288}
        scenes={HUD_SCENES}
        accent="#F59E0B"
        title="ATOMIC HABITS"
      />
    </AbsoluteFill>
  );
};
