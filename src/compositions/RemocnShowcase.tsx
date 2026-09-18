import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import {
  MarkerHighlight,
  StrikethroughReplace,
  RollingNumber,
  ScribbleCircle,
  InkUnderline,
  CheckList,
  Polaroid,
  PaperSticker,
  AnimatedLineChart,
} from "../components/remocn";

export const RemocnShowcase: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#F7F5F0",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Background Subtle Paper Grid Texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(#1E2A24 0.75px, transparent 0.75px), radial-gradient(#1E2A24 0.75px, #F7F5F0 0.75px)",
          backgroundSize: "30px 30px",
          backgroundPosition: "0 0, 15px 15px",
          opacity: 0.08,
        }}
      />

      {/* Top Banner Tag: Good Book Summary Channel Branding */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 80,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span
          style={{
            padding: "8px 18px",
            borderRadius: 999,
            backgroundColor: "#1E2A24",
            color: "#FFFFFF",
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          GOOD BOOK SUMMARY
        </span>
        <span style={{ fontSize: 20, color: "#666", fontWeight: 500 }}>
          Visual Book Insights & Editorial Primitives (1080p @ 24fps)
        </span>
      </div>

      {/* Beat 1: Marker Highlight (The Psychology of Money) */}
      <Sequence from={0} durationInFrames={72}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "#888",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            01. THE PSYCHOLOGY OF MONEY — MORGAN HOUSEL
          </div>
          <MarkerHighlight
            before="TRUE WEALTH IS"
            highlight="WHAT YOU DON'T SEE"
            after="— FREEDOM OVER TIME"
            markerColor="#facc15"
            baseColor="#1E2A24"
            highlightedTextColor="#1E2A24"
            fontSize={64}
            fontWeight={800}
            containerStyle={{ maxWidth: 1400, textAlign: "center" }}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Beat 2: Strikethrough Replace (Atomic Habits) */}
      <Sequence from={72} durationInFrames={72}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "#888",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            02. ATOMIC HABITS — JAMES CLEAR (PARADIGM SHIFT)
          </div>
          <StrikethroughReplace
            from="SETTING AMBITIOUS GOALS"
            to="BUILDING BULLETPROOF SYSTEMS"
            lineColor="#EF4444"
            color="#6B7280"
            toColor="#059669"
            fontSize={66}
            fontWeight={800}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Beat 3: Rolling Number + Scribble Circle (The 1% Rule) */}
      <Sequence from={144} durationInFrames={72}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "#888",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            03. THE 1% RULE — COMPOUND TRANSFORMATION
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
            }}
          >
            <ScribbleCircle
              width={260}
              height={140}
              color="#DC2626"
              strokeWidth={14}
              delay={20}
            >
              <RollingNumber
                from={0}
                to={37}
                suffix="x"
                fontSize={96}
                color="#1E2A24"
              />
            </ScribbleCircle>
            <span
              style={{
                fontSize: 62,
                fontWeight: 800,
                color: "#1E2A24",
                letterSpacing: "-0.02em",
              }}
            >
              BETTER AFTER ONE YEAR
            </span>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Beat 4: Ink Underline (Slow Productivity) */}
      <Sequence from={216} durationInFrames={72}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "#888",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            04. SLOW PRODUCTIVITY — CAL NEWPORT
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 72,
                fontWeight: 800,
                color: "#1E2A24",
                letterSpacing: "-0.03em",
              }}
            >
              DO FEWER THINGS. WORK AT A NATURAL PACE.
            </span>
            <div style={{ marginTop: 8 }}>
              <InkUnderline width={1350} thickness={14} color="#D97706" />
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Beat 5: Actionable CheckList (Atomic Habits) */}
      <Sequence from={288} durationInFrames={72}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "#888",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            05. ATOMIC HABITS — THE 4 LAWS OF BEHAVIOR CHANGE
          </div>
          <div style={{ transform: "scale(1.15)" }}>
            <CheckList
              items={[
                { text: "1. Make It Obvious", checked: true },
                { text: "2. Make It Attractive", checked: true },
                { text: "3. Make It Easy", checked: true },
                { text: "4. Make It Satisfying", checked: true },
              ]}
              width={720}
              fontSize={42}
              color="#1E2A24"
              boxColor="#1E2A24"
              tickColor="#059669"
              delay={4}
              itemGap={8}
              closeGap={5}
              perStep={3.0}
            />
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Beat 6: Polaroid + Paper Sticker (Thinking, Fast and Slow) */}
      <Sequence from={360} durationInFrames={72}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "#888",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            06. THINKING, FAST AND SLOW — DANIEL KAHNEMAN
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -16, right: -36, zIndex: 10 }}>
              <PaperSticker at={10} background="#DC2626" borderColor="#1E2A24">
                <span
                  style={{
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: 20,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  SYSTEM 1 VS SYSTEM 2
                </span>
              </PaperSticker>
            </div>
            <Polaroid
              width={620}
              caption="Daniel Kahneman, 2011"
              captionAt={6}
              captionSize={34}
              perStep={2.5}
              captionColor="#1E2A24"
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background:
                    "radial-gradient(circle at center, #2C3E35 0%, #151E19 100%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FAF8F5",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 54,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                  }}
                >
                  COGNITIVE BIAS
                </span>
                <span style={{ fontSize: 22, opacity: 0.7, fontWeight: 500 }}>
                  Case Study: The Anchoring Heuristic
                </span>
              </div>
            </Polaroid>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Beat 7: Animated Line Chart (Compound Growth Trajectory) */}
      <Sequence from={432} durationInFrames={72}>
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: "#888",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            07. THE COMPOUND EFFECT — DARREN HARDY
          </div>
          <AnimatedLineChart
            data={[1, 3, 7, 14, 28, 55, 110, 240, 520]}
            labels={["DAY 1", "DAY 30", "DAY 60", "DAY 120", "DAY 240", "1 YEAR"]}
            title="EXPONENTIAL COMPOUND TRAJECTORY"
            subtitle="Small, consistent daily disciplines generate quantum leaps over time."
            width={1040}
            height={480}
            strokeColor="#059669"
            textColor="#1E2A24"
          />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
