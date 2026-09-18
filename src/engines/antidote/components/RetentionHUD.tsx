import React from "react";
import { useCurrentFrame } from "remotion";
import type { AntidoteConfig, SceneSpec } from "../schema";

const HUD_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const MONO_FONT =
  '"JetBrains Mono", "SF Mono", Monaco, Consolas, monospace';

export interface RetentionHUDProps {
  config?: AntidoteConfig;
  // Standalone overrides for testing / showcase compositions
  totalFrames?: number;
  scenes?: SceneSpec[];
  accent?: string;
  title?: string;
}

export const RetentionHUD: React.FC<RetentionHUDProps> = ({
  config,
  totalFrames: propTotalFrames,
  scenes: propScenes,
  accent: propAccent,
  title: propTitle,
}) => {
  const frame = useCurrentFrame();

  const totalFrames =
    propTotalFrames ?? config?.meta.durationInFrames ?? 360;
  const scenes = propScenes ?? config?.scenes ?? [];
  const metaHud = config?.meta.hud;
  const accent =
    propAccent ?? metaHud?.accent ?? "#F59E0B"; // Default warm amber/gold
  const title =
    propTitle ??
    metaHud?.title ??
    config?.meta.title ??
    "GOOD BOOK SUMMARY";

  const showProgress = metaHud?.showProgress ?? true;
  const showBadge = metaHud?.showBadge ?? true;

  // Find currently active scene
  const activeIndex = scenes.findIndex(
    (s) => frame >= s.fromFrame && frame < s.fromFrame + s.durationFrames
  );
  const activeScene = activeIndex >= 0 ? scenes[activeIndex] : scenes[0];

  // Auto-hide during full-screen monumental chapter cards or if explicitly hidden
  const isHidden =
    !activeScene ||
    activeScene.hud?.hidden ||
    activeScene.shot === "chapterCard" ||
    !!activeScene.chapterCard;

  // Clean human-readable topic derivation (filtering out internal developer tokens)
  const INTERNAL_TOKENS = new Set([
    "HOURGLASS", "ZAP", "TARGET", "SHIELD", "DOMINOCASCADE", "CODEWINDOW",
    "LAPTOPMOCKUP", "FUNNELMETRICS", "ROCKETLAUNCH", "DOLLAREXCHANGE",
    "ROAD", "DOOR", "CLOCK", "MAZE", "STACK", "CRACK", "RIPPLE", "SUMMIT",
    "GIFT", "WALLET", "MAGNIFIER", "SWORD", "TROPHY", "ALARMCLOCK", "BUTTERFLY",
    "CONTRAST", "NEGATIVE", "POSITIVE", "CROWD", "STAT", "NEUTRAL", "STORY", "TIME"
  ]);

  const rawTopic = activeScene?.hud?.topic?.trim() ?? "";
  const leadCallout = activeScene?.texts?.[0]?.text?.replace(/[\r\n]+/g, " ").trim() ?? "";

  let topicText = "";
  if (rawTopic && !INTERNAL_TOKENS.has(rawTopic.toUpperCase().replace(/\s+/g, ""))) {
    topicText = rawTopic;
  } else if (leadCallout && leadCallout.length <= 36) {
    topicText = leadCallout.toUpperCase();
  } else if (rawTopic) {
    // Humanize token fallback
    topicText = rawTopic
      .toLowerCase()
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  }

  const currentNum = activeIndex >= 0 ? activeIndex + 1 : 1;
  const totalNumStr = String(Math.max(1, scenes.length));

  const badgeText =
    activeScene?.hud?.badge ?? `INSIGHT ${currentNum} / ${totalNumStr}`;

  // Global progress ratio (0 -> 1)
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, totalFrames)));
  const progressPercent = (progress * 100).toFixed(2);

  // Smooth opacity transitions (fade in/out when active scene changes or hides)
  const hudOpacity = isHidden ? 0 : 1;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 90,
        pointerEvents: "none",
        zIndex: 90,
        opacity: hudOpacity,
        transition: "opacity 0.3s ease",
      }}
    >
      {/* ── Top Slim Progress Track ──────────────────────────────────── */}
      {showProgress && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundColor: "rgba(0, 0, 0, 0.28)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}
        >
          {/* Active Progress Bar */}
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              backgroundColor: accent,
              boxShadow: `0 0 14px ${accent}, 0 0 6px ${accent}`,
              position: "relative",
            }}
          >
            {/* Glowing progress tip */}
            <div
              style={{
                position: "absolute",
                right: -4,
                top: -3,
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: "#FFFFFF",
                boxShadow: `0 0 12px ${accent}, 0 0 4px #FFFFFF`,
              }}
            />
          </div>

          {/* Major Chapter Milestone Dividers (Clean & Sparse, max 8-12 ticks, never 279 barcode ticks) */}
          {scenes
            .filter((s, idx) => idx > 0 && s.shot === "chapterCard")
            .map((s, idx) => {
              const tickPercent = (s.fromFrame / totalFrames) * 100;
              return (
                <div
                  key={s.id || idx}
                  style={{
                    position: "absolute",
                    left: `${tickPercent}%`,
                    top: -1,
                    width: 2,
                    height: 8,
                    backgroundColor: "rgba(255, 255, 255, 0.85)",
                    boxShadow: "0 0 4px rgba(0,0,0,0.6)",
                  }}
                />
              );
            })}
        </div>
      )}

      {/* ── Header HUD Elements (Badge + Title) ───────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "24px 56px 0 56px",
        }}
      >
        {/* Left Insight Pill */}
        {showBadge && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 28px",
              borderRadius: 36,
              backgroundColor: "rgba(15, 23, 42, 0.94)",
              border: "1.5px solid rgba(255, 255, 255, 0.28)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 10px 28px rgba(0, 0, 0, 0.5)",
            }}
          >
            {/* Pulsing indicator dot */}
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: accent,
                boxShadow: `0 0 14px ${accent}`,
                display: "inline-block",
              }}
            />
            {/* Insight Badge Label */}
            <span
              style={{
                fontFamily: MONO_FONT,
                fontWeight: 800,
                fontSize: 20,
                letterSpacing: 1.5,
                color: "#FFFFFF",
                textTransform: "uppercase",
              }}
            >
              {badgeText}
            </span>

            {/* Optional Topic Label */}
            {topicText && (
              <>
                <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 20 }}>
                  •
                </span>
                <span
                  style={{
                    fontFamily: HUD_FONT,
                    fontWeight: 800,
                    fontSize: 22,
                    color: "#FFFFFF",
                    letterSpacing: 0.8,
                  }}
                >
                  {topicText}
                </span>
              </>
            )}
          </div>
        )}

        {/* Right Watermark / Book Title Pill (High-Contrast Frosted Dark Pill) */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 28px",
            borderRadius: 36,
            backgroundColor: "rgba(15, 23, 42, 0.94)",
            border: "1.5px solid rgba(255, 255, 255, 0.28)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.5)",
          }}
        >
          <span
            style={{
              fontFamily: MONO_FONT,
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: 1.8,
              color: "#FFFFFF",
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
        </div>
      </div>
    </div>
  );
};
