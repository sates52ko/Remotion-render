import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadCinzel } from "@remotion/google-fonts/Cinzel";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";

const { fontFamily: cinzelFont } = loadCinzel("normal", { weights: ["700", "800"], subsets: ["latin"] });
const { fontFamily: playfairFont } = loadPlayfair("italic", { weights: ["600", "700"], subsets: ["latin"] });

export const CHAPTER_TITLE_FONT = `${cinzelFont}, 'Times New Roman', Georgia, serif`;
export const CHAPTER_SUBTITLE_FONT = `${playfairFont}, Georgia, serif`;

export type ChapterCardSpec = {
  category?: string; // "LAW", "PART", "CHAPTER", "RULE", "LESSON", "INSIGHT", "BIAS", "PRINCIPLE"
  number?: string;   // "01", "I", "II", "02", etc.
  title: string;     // "THE LAW OF IRRATIONALITY" or "THE COLLECTIVE CAGE"
  subtitle?: string; // "Master Your Emotional Self" or "The Forbidden I"
  accentColor?: string;
};

export const ChapterCard: React.FC<{
  spec: ChapterCardSpec;
  accent?: string;
  durationFrames?: number;
}> = ({ spec, accent = "#D4AF37", durationFrames = 120 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const category = (spec.category || "CHAPTER").toUpperCase();
  const number = (spec.number || "01").toUpperCase();
  const title = spec.title.toUpperCase();
  const subtitle = spec.subtitle;
  const cardAccent = spec.accentColor || accent || "#D4AF37";

  // Micro-cinematic camera drift
  const scale = interpolate(frame, [0, durationFrames], [1, 1.04], {
    extrapolateRight: "clamp",
  });

  // Staggered entrances
  const borderSpring = spring({ frame, fps, delay: 2, config: { damping: 16, stiffness: 90 } });
  const badgeSpring = spring({ frame, fps, delay: 6, config: { damping: 14, stiffness: 120 } });
  const titleSpring = spring({ frame, fps, delay: 14, config: { damping: 12, stiffness: 100 } });
  const subSpring = spring({ frame, fps, delay: 24, config: { damping: 15, stiffness: 80 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0D0E12",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Background Radial Glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, ${cardAccent}18 0%, rgba(13,14,18,0) 68%)`,
          pointerEvents: "none",
        }}
      />

      {/* Subtle Editorial Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Ornamental Architectural Border */}
      <div
        style={{
          position: "absolute",
          inset: 56,
          border: `1px solid ${cardAccent}33`,
          opacity: borderSpring,
          pointerEvents: "none",
        }}
      >
        {/* Corner Accents */}
        <div style={{ position: "absolute", top: -4, left: -4, width: 8, height: 8, background: cardAccent, opacity: 0.8 }} />
        <div style={{ position: "absolute", top: -4, right: -4, width: 8, height: 8, background: cardAccent, opacity: 0.8 }} />
        <div style={{ position: "absolute", bottom: -4, left: -4, width: 8, height: 8, background: cardAccent, opacity: 0.8 }} />
        <div style={{ position: "absolute", bottom: -4, right: -4, width: 8, height: 8, background: cardAccent, opacity: 0.8 }} />

        {/* Inner Border Inset */}
        <div
          style={{
            position: "absolute",
            inset: 12,
            border: `1px solid ${cardAccent}18`,
          }}
        />
      </div>

      {/* Center Core Content */}
      <div
        style={{
          maxWidth: 1300,
          padding: "0 60px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        {/* Category & Roman / Numeric Badge */}
        <div
          style={{
            opacity: badgeSpring,
            transform: `translateY(${(1 - badgeSpring) * -20}px)`,
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            padding: "8px 24px",
            borderRadius: 4,
            border: `1px solid ${cardAccent}44`,
            backgroundColor: "rgba(0,0,0,0.35)",
            marginBottom: 32,
          }}
        >
          <span
            style={{
              fontFamily: CHAPTER_TITLE_FONT,
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "6px",
              color: cardAccent,
              textTransform: "uppercase",
            }}
          >
            {category} {number}
          </span>
        </div>

        {/* Decorative Divider Line */}
        <div
          style={{
            width: interpolate(badgeSpring, [0, 1], [0, 180]),
            height: 1,
            backgroundColor: `${cardAccent}55`,
            marginBottom: 36,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 6,
              height: 6,
              backgroundColor: cardAccent,
              transform: "translate(-50%, -50%) rotate(45deg)",
            }}
          />
        </div>

        {/* Monumental Main Title */}
        <h1
          style={{
            margin: 0,
            fontFamily: CHAPTER_TITLE_FONT,
            fontSize: title.length > 32 ? 64 : 80,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "3px",
            color: "#F5F3EE",
            opacity: titleSpring,
            transform: `translateY(${(1 - titleSpring) * 24}px)`,
            textShadow: "0 10px 30px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.6)",
            maxWidth: 1200,
          }}
        >
          {title}
        </h1>

        {/* Subtitle / Core Thesis */}
        {subtitle && (
          <div
            style={{
              marginTop: 32,
              opacity: subSpring,
              transform: `translateY(${(1 - subSpring) * 16}px)`,
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: CHAPTER_SUBTITLE_FONT,
                fontSize: 34,
                fontStyle: "italic",
                lineHeight: 1.35,
                letterSpacing: "1px",
                color: "rgba(245, 243, 238, 0.75)",
                maxWidth: 950,
              }}
            >
              “{subtitle}”
            </p>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
