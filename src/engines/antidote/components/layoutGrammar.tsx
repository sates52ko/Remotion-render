import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import {
  isLightPalette,
  resolveArtFonts,
  resolveArtPalette,
  useArtDirection,
  type ArtDirectionConfig,
  type StageMoodName,
} from "./artDirection";
import { FitText } from "./textFit";

export type LayoutGrammarName =
  | "centered"
  | "editorialLeft"
  | "editorialRight"
  | "cinemaWide"
  | "splitSpine"
  | "swissPoster"
  | "magazineMasthead"
  | "filmFrame"
  | "diagonalSplit";

export type StageLayout = {
  grammar: LayoutGrammarName;
  capPad: number;
  contentBox: { left: number; top: number; width: number; height: number };
  headerBox: { left: number; top: number; width: number; align: "left" | "center" | "right" };
};

export function resolveStageLayout(ad?: ArtDirectionConfig | null): StageLayout {
  const grammar: LayoutGrammarName = (ad?.layoutGrammar as LayoutGrammarName) || "centered";
  const capPad = ad?.captions === "minimal" ? 148 : 92;

  switch (grammar) {
    case "editorialLeft":
      return {
        grammar,
        capPad,
        contentBox: { left: 560, top: 64, width: 1288, height: 1080 - 64 - capPad },
        headerBox: { left: 56, top: 88, width: 420, align: "left" },
      };
    case "editorialRight":
      return {
        grammar,
        capPad,
        contentBox: { left: 72, top: 64, width: 1288, height: 1080 - 64 - capPad },
        headerBox: { left: 1444, top: 88, width: 420, align: "left" },
      };
    case "cinemaWide":
      return {
        grammar,
        capPad: 132,
        contentBox: { left: 96, top: 120, width: 1728, height: 816 },
        headerBox: { left: 96, top: 30, width: 1360, align: "left" },
      };
    case "magazineMasthead":
      return {
        grammar,
        capPad,
        contentBox: { left: 196, top: 174, width: 1644, height: 1080 - 174 - capPad },
        headerBox: { left: 196, top: 44, width: 1320, align: "left" },
      };
    case "filmFrame":
      return {
        grammar,
        capPad: 156,
        contentBox: { left: 112, top: 174, width: 1696, height: 730 },
        headerBox: { left: 180, top: 64, width: 1560, align: "center" },
      };
    case "diagonalSplit":
      return {
        grammar,
        capPad,
        contentBox: { left: 96, top: 176, width: 1728, height: 1080 - 176 - capPad },
        headerBox: { left: 84, top: 48, width: 880, align: "left" },
      };
    case "splitSpine":
      return {
        grammar,
        capPad,
        contentBox: { left: 80, top: 172, width: 1760, height: 1080 - 172 - capPad },
        headerBox: { left: 80, top: 54, width: 820, align: "left" },
      };
    case "swissPoster":
      return {
        grammar,
        capPad,
        contentBox: { left: 84, top: 230, width: 1752, height: 1080 - 230 - capPad },
        headerBox: { left: 84, top: 38, width: 1752, align: "left" },
      };
    default:
      return {
        grammar: "centered",
        capPad,
        contentBox: { left: 96, top: 56, width: 1728, height: 1080 - 56 - capPad },
        headerBox: { left: 160, top: 52, width: 1600, align: "center" },
      };
  }
}

export const GrammarStage: React.FC<{
  title?: string;
  subtitle?: string;
  kicker?: string;
  chapterLabel?: string;
  stageMood?: StageMoodName;
  localFrame?: number;
  children: React.ReactNode;
}> = ({ title, subtitle, kicker, chapterLabel, stageMood, localFrame, children }) => {
  const ctxFrame = useCurrentFrame();
  const frame = Math.max(0, localFrame ?? ctxFrame);
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const fonts = resolveArtFonts(ad);
  const light = isLightPalette(palette);
  const layout = resolveStageLayout(ad);
  const g = layout.grammar;

  const headP = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.poly(4)),
  });

  const renderChrome = () => {
    if (g === "editorialLeft") {
      return (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 520,
            background: palette.bgAlt,
            borderRight: `4px solid ${palette.accent}`,
            pointerEvents: "none",
          }}
        />
      );
    }
    if (g === "editorialRight") {
      return (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 520,
            background: palette.bgAlt,
            borderLeft: `4px solid ${palette.accent}`,
            pointerEvents: "none",
          }}
        />
      );
    }
    if (g === "cinemaWide") {
      const barBg = light ? "#141416" : "#050608";
      return (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 108, background: barBg, borderBottom: `2px solid ${palette.accent}55`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 132, background: barBg, borderTop: `2px solid ${palette.accent}55`, pointerEvents: "none" }} />
        </>
      );
    }
    if (g === "splitSpine") {
      return (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 960, background: palette.bgAlt, pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 959, top: 0, bottom: 0, width: 3, background: palette.accent, opacity: 0.75, pointerEvents: "none" }} />
        </>
      );
    }
    if (g === "swissPoster") {
      return (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 206,
            background: light ? palette.ink : palette.bgAlt,
            borderBottom: `6px solid ${palette.accent}`,
            pointerEvents: "none",
          }}
        />
      );
    }
    if (g === "magazineMasthead") {
      return (
        <>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 136,
              background: light ? palette.ink : palette.bgAlt,
              borderRight: `5px solid ${palette.accent}`,
              pointerEvents: "none",
            }}
          />
          {chapterLabel && (
            <div
              style={{
                position: "absolute",
                left: 68,
                top: "50%",
                transform: "translate(-50%, -50%) rotate(-90deg)",
                whiteSpace: "nowrap",
                fontFamily: fonts.display,
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: light ? "#FAF8F5" : palette.accent,
                pointerEvents: "none",
              }}
            >
              {chapterLabel}
            </div>
          )}
        </>
      );
    }
    if (g === "filmFrame") {
      return (
        <>
          <div
            style={{
              position: "absolute",
              inset: 34,
              borderRadius: 18,
              border: `3px solid ${palette.accent}55`,
              boxShadow: `inset 0 0 0 1px ${palette.surfaceBorder}`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "absolute", left: 52, top: 50, width: 18, height: 18, borderTop: `3px solid ${palette.accent}`, borderLeft: `3px solid ${palette.accent}`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 52, top: 50, width: 18, height: 18, borderTop: `3px solid ${palette.accent}`, borderRight: `3px solid ${palette.accent}`, pointerEvents: "none" }} />
        </>
      );
    }
    if (g === "diagonalSplit") {
      return (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: palette.bgAlt,
              clipPath: "polygon(54% 0%, 100% 0%, 100% 100%, 34% 100%)",
              pointerEvents: "none",
            }}
          />
          <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <line x1={1037} y1={0} x2={653} y2={1080} stroke={palette.accent} strokeWidth={4} opacity={0.78} />
          </svg>
        </>
      );
    }
    return null;
  };

  const hasHeader = !!(title || subtitle || kicker);
  const mastheadDark = g === "swissPoster" && light;
  const barDark = g === "cinemaWide";
  const titleColor = mastheadDark || barDark ? "#F7F4EC" : palette.ink;
  const subColor = mastheadDark || barDark ? "#CBD5E1" : palette.muted;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {renderChrome()}

      {chapterLabel && g !== "magazineMasthead" && (
        <div
          style={{
            position: "absolute",
            right: g === "filmFrame" ? 64 : 64,
            top: g === "cinemaWide" ? 34 : g === "filmFrame" ? 52 : 44,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: g === "cinemaWide" || mastheadDark ? "#F7C948" : palette.accent,
            opacity: headP * 0.9,
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          {chapterLabel}
        </div>
      )}

      {hasHeader && (
        <div
          style={{
            position: "absolute",
            left: layout.headerBox.left,
            top: layout.headerBox.top,
            width: layout.headerBox.width,
            textAlign: layout.headerBox.align,
            opacity: headP,
            transform: `translateY(${(1 - headP) * 14}px)`,
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          {kicker && (
            <div
              style={{
                fontFamily: fonts.display,
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: palette.accent,
                marginBottom: 6,
              }}
            >
              {kicker}
            </div>
          )}
          {title && (
            <FitText
              text={title}
              maxWidth={layout.headerBox.width}
              maxLines={g === "editorialLeft" || g === "editorialRight" ? 3 : 2}
              baseSize={g === "cinemaWide" ? 34 : g === "swissPoster" ? 54 : 46}
              minSize={24}
              fontFamily={fonts.display}
              fontWeight={900}
              color={titleColor}
            />
          )}
          {subtitle && (
            <FitText
              text={subtitle}
              maxWidth={layout.headerBox.width}
              maxLines={2}
              baseSize={g === "cinemaWide" ? 18 : 23}
              minSize={15}
              fontFamily={fonts.body}
              fontWeight={500}
              color={subColor}
              style={{ marginTop: 6 }}
            />
          )}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: layout.contentBox.left,
          top: hasHeader && g === "centered" ? layout.contentBox.top + 96 : layout.contentBox.top,
          width: layout.contentBox.width,
          height: hasHeader && g === "centered" ? layout.contentBox.height - 96 : layout.contentBox.height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * Non-obstructive architectural framing cues for full-bleed stages
 * (CutoutStage, AnnotatedScene, EditorialSpread, BeforeAfterWipe, UpClose).
 */
export const StageGrammarOverlay: React.FC<{ stageMood?: StageMoodName }> = ({ stageMood }) => {
  const ad = useArtDirection();
  const palette = resolveArtPalette(ad, stageMood);
  const g = (ad?.layoutGrammar as LayoutGrammarName) || "centered";

  if (g === "cinemaWide") {
    return (
      <>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 74, background: "rgba(6,8,12,0.92)", pointerEvents: "none", zIndex: 8 }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 92, background: "rgba(6,8,12,0.92)", pointerEvents: "none", zIndex: 8 }} />
      </>
    );
  }
  if (g === "swissPoster") {
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 16,
          background: palette.accent,
          pointerEvents: "none",
          zIndex: 8,
        }}
      />
    );
  }
  if (g === "editorialLeft") {
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 18,
          background: palette.accent,
          pointerEvents: "none",
          zIndex: 8,
        }}
      />
    );
  }
  if (g === "editorialRight") {
    return (
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 18,
          background: palette.accent,
          pointerEvents: "none",
          zIndex: 8,
        }}
      />
    );
  }
  if (g === "splitSpine") {
    return (
      <div
        style={{
          position: "absolute",
          left: 959,
          top: 24,
          bottom: 24,
          width: 2,
          background: palette.accent,
          opacity: 0.4,
          pointerEvents: "none",
          zIndex: 8,
        }}
      />
    );
  }
  if (g === "magazineMasthead") {
    return (
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 16, background: palette.accent, pointerEvents: "none", zIndex: 8 }} />
    );
  }
  if (g === "filmFrame") {
    return (
      <div style={{ position: "absolute", inset: 26, borderRadius: 16, border: `3px solid ${palette.accent}66`, pointerEvents: "none", zIndex: 8 }} />
    );
  }
  if (g === "diagonalSplit") {
    return (
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 8 }}>
        <line x1={1037} y1={0} x2={653} y2={1080} stroke={palette.accent} strokeWidth={3} opacity={0.45} />
      </svg>
    );
  }
  return null;
};
