import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CrumpleTossSpec } from "../schema";
import { isLightPalette, resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { GrammarStage } from "./layoutGrammar";
import { RoughMarks } from "./RoughMarks";
import { FitText } from "./textFit";

/**
 * CrumpleToss — Pure CSS/SVG stop-motion paper-crumple & parabolic toss
 * discarding a myth card and unveiling the clean truth underneath.
 */
export const CrumpleToss: React.FC<{ spec: CrumpleTossSpec; localFrame?: number; stageMood?: StageMoodName }> = ({
  spec,
  localFrame,
  stageMood,
}) => {
  const ctxFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const light = isLightPalette(palette);

  const tossAt = spec.tossAt ?? 48;
  const crumpleP = interpolate(frame - (tossAt - 10), [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tossP = interpolate(frame - tossAt, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const truthP = frame >= tossAt + 8
    ? spring({ frame: frame - (tossAt + 8), fps, config: { damping: 15, stiffness: 150 } })
    : 0;

  const truthCol = toneColor(spec.truth.tone ?? "positive", palette);
  const mythScale = 1 - crumpleP * 0.48 - tossP * 0.25;
  const mythTx = tossP * 920;
  const mythTy = -Math.sin(tossP * Math.PI) * 260 + tossP * 320;
  const mythRot = crumpleP * -12 + tossP * 145;

  return (
    <GrammarStage title={spec.title} subtitle={spec.subtitle} stageMood={stageMood} localFrame={frame}>
      <div style={{ position: "relative", width: 920, height: 460, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Truth Card Underneath */}
        <div
          style={{
            position: "absolute",
            width: 860,
            padding: "40px 48px",
            borderRadius: 16,
            background: palette.surface,
            border: `3px solid ${truthCol}`,
            boxShadow: light ? "0 18px 40px rgba(0,0,0,0.10)" : "0 22px 50px rgba(0,0,0,0.5)",
            textAlign: "center",
            opacity: truthP,
            transform: `scale(${0.92 + truthP * 0.08})`,
          }}
        >
          {spec.truth.badge && (
            <span
              style={{
                display: "inline-block",
                fontFamily: fonts.display,
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: "0.12em",
                padding: "5px 16px",
                borderRadius: 999,
                background: `${truthCol}22`,
                color: truthCol,
                marginBottom: 14,
              }}
            >
              {spec.truth.badge}
            </span>
          )}
          <div style={{ position: "relative", display: "inline-block" }}>
            <FitText
              text={spec.truth.headline}
              maxWidth={760}
              maxLines={2}
              baseSize={44}
              minSize={26}
              fontFamily={fonts.display}
              fontWeight={900}
              color={palette.ink}
            />
            <div style={{ marginTop: 4 }}>
              <RoughMarks kind="underline" width={520} height={14} color={truthCol} progress={truthP} seed={spec.truth.headline} />
            </div>
          </div>
          {spec.truth.detail && (
            <div style={{ fontFamily: fonts.body, fontSize: 23, fontWeight: 500, color: palette.muted, marginTop: 14 }}>
              {spec.truth.detail}
            </div>
          )}
        </div>

        {/* Myth Card Being Crumpled & Tossed */}
        {tossP < 0.99 && (
          <div
            style={{
              position: "relative",
              width: 820,
              padding: "38px 44px",
              borderRadius: 8,
              background: light ? "#FFF8F6" : "#241619",
              border: `3px solid ${palette.danger}`,
              boxShadow: "0 20px 48px rgba(0,0,0,0.35)",
              transform: `translate(${mythTx.toFixed(1)}px, ${mythTy.toFixed(1)}px) rotate(${mythRot.toFixed(1)}deg) scale(${Math.max(0.2, mythScale).toFixed(3)})`,
              opacity: 1 - tossP,
              clipPath: crumpleP > 0.1
                ? "polygon(4% 2%, 34% 0%, 66% 3%, 98% 1%, 96% 48%, 100% 96%, 64% 99%, 32% 95%, 2% 98%, 0% 52%)"
                : undefined,
            }}
          >
            {spec.myth.badge && (
              <span
                style={{
                  display: "inline-block",
                  fontFamily: fonts.display,
                  fontWeight: 900,
                  fontSize: 16,
                  letterSpacing: "0.12em",
                  padding: "4px 14px",
                  borderRadius: 4,
                  background: palette.danger,
                  color: "#FFFFFF",
                  marginBottom: 12,
                }}
              >
                {spec.myth.badge}
              </span>
            )}
            <FitText
              text={spec.myth.headline}
              maxWidth={720}
              maxLines={2}
              baseSize={40}
              minSize={24}
              fontFamily={fonts.display}
              fontWeight={900}
              color={palette.ink}
            />
            {(spec.myth.bullets ?? []).length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {(spec.myth.bullets ?? []).map((b, bi) => (
                  <div key={bi} style={{ fontFamily: fonts.body, fontSize: 21, color: palette.muted }}>
                    • {b}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </GrammarStage>
  );
};
