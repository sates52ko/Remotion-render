import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { HookPosterSpec } from "../schema";
import { resolveArtFonts, resolveArtPalette, toneColor, useArtDirection, type StageMoodName } from "./artDirection";
import { StageGrammarOverlay } from "./layoutGrammar";
import { RoughMarks } from "./RoughMarks";

/**
 * HookPoster — 0:00-0:05 Cold-Open Half-Shadow Scrim + 2-Block Semantic Hook
 * + Before -> After Visual Anomaly Transformation (CPU-safe, 1920x1080).
 */
export const HookPoster: React.FC<{
  spec: HookPosterSpec;
  localFrame?: number;
  stageMood?: StageMoodName;
  chapterLabel?: string;
}> = ({ spec, localFrame, stageMood, chapterLabel }) => {
  const ctxFrame = useCurrentFrame();
  const frame = Math.max(0, (localFrame ?? ctxFrame) - (spec.at ?? 0));
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);

  const payoffAt = spec.payoffAt ?? 12;
  const changeAt = spec.changeAt ?? 28;
  const revealMode = spec.revealMode ?? "fade";
  const accentCol = toneColor(spec.tone ?? "danger", palette);

  const setupP = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const payoffIn = interpolate(frame - payoffAt, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const payoffSettle = interpolate(frame - payoffAt, [0, 6], [1.035, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const underlineP = interpolate(frame - (payoffAt + 4), [0, 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const changeP = interpolate(frame - changeAt, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(3)),
  });
  const badgeP = interpolate(frame - (changeAt + 6), [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const promiseP = interpolate(frame - (changeAt + 12), [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const hasBeforeImg = Boolean(spec.beforeImage);
  const hasAfterImg = Boolean(spec.afterImage);

  const setupSize = spec.setup.length > 36 ? 44 : 52;
  const payoffSize = spec.payoff.length > 32 ? 56 : 68;

  const afterClip =
    revealMode === "wipe"
      ? `inset(0 ${(1 - changeP) * 100}% 0 0)`
      : revealMode === "spotlight"
      ? `circle(${(changeP * 85).toFixed(1)}% at 72% 48%)`
      : undefined;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {hasBeforeImg ? (
        <>
          <Img src={staticFile(spec.beforeImage!)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          {hasAfterImg ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: revealMode === "fade" ? changeP : 1,
                clipPath: afterClip,
              }}
            >
              <Img src={staticFile(spec.afterImage!)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: changeP,
                background: `radial-gradient(circle at 72% 46%, ${accentCol}22 0%, ${accentCol}66 48%, rgba(10,12,16,0.72) 100%)`,
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, ${palette.bg}F4 0%, ${palette.bg}DE 42%, ${palette.bg}66 60%, transparent 74%)`,
            }}
          />
        </>
      ) : (
        <div
          style={{
            position: "absolute",
            left: 1000,
            top: 170,
            width: 820,
            height: 640,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              position: "relative",
              padding: "30px 34px",
              borderRadius: 16,
              background: `${palette.surface}EE`,
              border: `2px solid ${palette.muted}44`,
              opacity: interpolate(changeP, [0, 1], [1, 0.52]),
            }}
          >
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 15, letterSpacing: "0.14em", color: palette.muted, marginBottom: 8 }}>
              {spec.beforeLabel ?? "ASSUMPTION"}
            </div>
            <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 34, color: palette.ink, lineHeight: 1.15 }}>
              {spec.beforeDetail ?? "What seems obvious at first glance"}
            </div>
            <div style={{ marginTop: 8 }}>
              <RoughMarks kind="strike" width={420} height={14} color={accentCol} progress={changeP} seed={spec.setup} />
            </div>
          </div>

          <div
            style={{
              padding: "34px 36px",
              borderRadius: 18,
              background: `${palette.surface}F5`,
              border: `3px solid ${accentCol}`,
              boxShadow: `0 20px 48px rgba(0,0,0,0.28)`,
              opacity: changeP,
              transform: `translateY(${(1 - changeP) * 18}px)`,
            }}
          >
            <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 16, letterSpacing: "0.14em", color: accentCol, marginBottom: 10 }}>
              {spec.afterLabel ?? "REALITY"}
            </div>
            <div style={{ fontFamily: fonts.display, fontWeight: 900, fontSize: 38, color: palette.ink, lineHeight: 1.14 }}>
              {spec.afterDetail ?? spec.payoff}
            </div>
          </div>
        </div>
      )}

      {spec.anomalyBadge ? (
        <div
          style={{
            position: "absolute",
            right: 92,
            top: 168,
            padding: "10px 20px",
            borderRadius: 10,
            background: accentCol,
            color: "#FFFFFF",
            fontFamily: fonts.display,
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: "0.1em",
            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            opacity: badgeP,
            transform: `scale(${0.92 + badgeP * 0.08})`,
          }}
        >
          {spec.anomalyBadge}
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 96,
          top: 185,
          width: 820,
          maxHeight: 650,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        {spec.kicker ? (
          <div
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              background: `${accentCol}24`,
              border: `1.5px solid ${accentCol}`,
              color: accentCol,
              fontFamily: fonts.display,
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: "0.14em",
              marginBottom: 20,
              opacity: setupP,
            }}
          >
            {spec.kicker}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: setupSize,
            lineHeight: 1.14,
            color: palette.ink,
            opacity: setupP,
            transform: `translateY(${(1 - setupP) * 10}px)`,
            marginBottom: 14,
          }}
        >
          {spec.setup}
        </div>

        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 900,
            fontSize: payoffSize,
            lineHeight: 1.06,
            color: accentCol,
            opacity: payoffIn,
            transform: `scale(${payoffSettle})`,
            transformOrigin: "left center",
          }}
        >
          {spec.payoff}
        </div>

        <div style={{ marginTop: 10, opacity: payoffIn }}>
          <RoughMarks kind="underline" width={360} height={16} color={accentCol} progress={underlineP} seed={spec.payoff} />
        </div>

        {spec.promiseLine ? (
          <div
            style={{
              marginTop: 22,
              fontFamily: fonts.body,
              fontWeight: 600,
              fontSize: 26,
              lineHeight: 1.35,
              color: palette.muted,
              opacity: promiseP,
              maxWidth: 740,
            }}
          >
            {spec.promiseLine}
          </div>
        ) : null}
      </div>

      <StageGrammarOverlay stageMood={stageMood} chapterLabel={chapterLabel} />
    </div>
  );
};
