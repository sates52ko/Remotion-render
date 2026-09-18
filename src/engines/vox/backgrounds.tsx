import React from "react";
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { GOLD, INK, RED } from "./palette";

export const BG = "broll-ocean-tanker/mo-photoshop-background.png";

export const PaperBackground: React.FC<{ tint?: boolean }> = ({ tint = false }) => {
  return (
    <>
      <Img src={staticFile(BG)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.06)", zIndex: 0 }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(63,54,42,0.16)), radial-gradient(circle at 50% 52%, rgba(255,255,255,0.20), transparent 46%)", mixBlendMode: "soft-light", zIndex: 1 }} />
      {tint ? (
        <>
          <AbsoluteFill style={{ zIndex: 1, mixBlendMode: "multiply", opacity: 0.22, background: `radial-gradient(circle at 26% 22%, ${GOLD}, transparent 55%), radial-gradient(circle at 82% 82%, ${RED}, transparent 60%)` }} />
          <AbsoluteFill style={{ zIndex: 1, mixBlendMode: "soft-light", opacity: 0.18, background: `linear-gradient(150deg, ${INK}, transparent 70%)` }} />
        </>
      ) : null}
    </>
  );
};

export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = (frame % 6) * 13;
  return (
    <AbsoluteFill
      style={{
        zIndex: 60,
        pointerEvents: "none",
        opacity: 0.06,
        backgroundImage: `radial-gradient(${INK} 0.5px, transparent 0.6px)`,
        backgroundSize: "3px 3px",
        backgroundPosition: `${shift}px ${shift * 1.3}px`,
        mixBlendMode: "multiply",
      }}
    />
  );
};

export const Vignette: React.FC<{ intensity?: number }> = ({ intensity = 0.28 }) => (
  <AbsoluteFill style={{ zIndex: 58, pointerEvents: "none", boxShadow: `inset 0 0 460px rgba(20,15,10,${intensity})` }} />
);

export const AccentBurst: React.FC<{ seed: number; x?: number; y?: number; startFrame?: number }> = ({ seed, x = 50, y = 46, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - startFrame, fps, config: { damping: 20, mass: 1, stiffness: 90 }, durationInFrames: 40 });
  const size = 620 + Math.floor(seed * 260);
  const color = seed > 0.5 ? GOLD : RED;
  const rot = frame * 0.15 * (seed > 0.5 ? 1 : -1);
  return (
    <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size, transform: `translate(-50%,-50%) scale(${s})`, opacity: 0.9, zIndex: 4 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `18px solid ${color}`, opacity: 0.18 }} />
      <div style={{ position: "absolute", inset: "16%", borderRadius: "50%", backgroundImage: `radial-gradient(${color} 2px, transparent 2.6px)`, backgroundSize: "16px 16px", opacity: 0.16, transform: `rotate(${rot}deg)` }} />
    </div>
  );
};

export const FloatingSpecks: React.FC = () => {
  const frame = useCurrentFrame();
  const specks = Array.from({ length: 26 }, (_, i) => {
    const s = (i * 97.13) % 100;
    const x = (s * 1.7 + Math.sin(frame / (40 + (i % 7) * 8) + i) * 3) % 100;
    const y = ((i * 61.7) % 100 + frame / (5 + (i % 5))) % 100;
    const size = 2 + (i % 4);
    return <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size, borderRadius: "50%", background: i % 3 === 0 ? RED : INK, opacity: 0.08 }} />;
  });
  return <AbsoluteFill style={{ zIndex: 3, pointerEvents: "none" }}>{specks}</AbsoluteFill>;
};
