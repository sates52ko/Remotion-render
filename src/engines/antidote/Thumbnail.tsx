import React from "react";
import { AbsoluteFill, Freeze } from "remotion";
import { z } from "zod";
import { Everyman } from "./characters/Everyman";
import { pose } from "./movements";
import {
  variantSchema,
  charAction,
  expression as expressionEnum,
  thumbMotif,
  type AntidoteThumbnailBrief,
  type SceneSpec,
  type CastBible,
} from "./schema";
import { Scene } from "./components/Scene";
import { heroFreezeFrame } from "./thumbHero";
import {
  thumbLayoutSchema,
  thumbGrammarSchema,
  resolveGrammar,
  emphasisColor,
  type ThumbGrammar,
  pickTextColor,
  thumbGround,
  isDark,
  emphasisIndex,
  CHANNEL_MONOGRAM,
  SPINE_HEIGHT,
  SPINE_FONT,
  HEADLINE as HEADLINE_SHARED,
  SERIF as SERIF_SHARED,
} from "../thumbnail-shared";
import { CinematicBleed } from "../vox/thumbnail";
import { GrammarHook, HookRule, hookFontSize, alignFor, BookAnchor } from "../thumbnail-overlay";

/**
 * AntidoteThumbnail — 6-layout system (flat-vector engine) + High-CTR Cinematic fallback.
 *
 * When a cinematic Flux hero image is present or layout is cinematic-bleed,
 * it renders the high-converting full-bleed cover to ensure high CTR on YouTube.
 */

export const antidoteThumbPropsSchema = z.object({
  title: z.string(),
  author: z.string().default(""),
  hook: z.string(),
  paper: z.string().default("#EAF0E8"),
  ink: z.string().default("#1E2A24"),
  accent: z.string().default("#F0A63C"),
  gold: z.string().default("#3E8E7A"),
  variant: variantSchema,
  action: charAction.default("celebrate"),
  expression: expressionEnum.default("happy"),
  motif: thumbMotif.default("risingBars"),
  slug: z.string().optional(),
  heroImg: z.string().optional(),
  layout: thumbLayoutSchema.optional(),
  grammar: thumbGrammarSchema.optional(),
  /** scene-still: the book's own scene to freeze (picked in Root via pickHeroScene) */
  heroScene: z.any().optional(),
  /** top distinct hero scenes (Root: pickHeroScenes); grammar.sceneRank indexes it */
  heroScenes: z.any().optional(),
  cast: z.any().optional(),
});
export type AntidoteThumbProps = z.infer<typeof antidoteThumbPropsSchema>;

const HEADLINE = HEADLINE_SHARED;
const SERIF = SERIF_SHARED;

// ── SHARED PIECES ───────────────────────────────────────────────────────────

const Grain: React.FC<{ ink: string }> = ({ ink }) => (
  <AbsoluteFill
    style={{
      zIndex: 90,
      pointerEvents: "none",
      opacity: 0.06,
      backgroundImage: `radial-gradient(${ink} 1px, transparent 1.6px)`,
      backgroundSize: "22px 22px",
    }}
  />
);

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      zIndex: 89,
      pointerEvents: "none",
      boxShadow: "inset 0 0 260px rgba(20,20,20,0.28)",
    }}
  />
);

const Spine: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{
      position: "absolute",
      left: 24,
      bottom: 18,
      zIndex: 80,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    <div style={{ width: 4, height: SPINE_HEIGHT, background: color, borderRadius: 2 }} />
    <span
      style={{
        fontFamily: SPINE_FONT,
        fontSize: 16,
        fontWeight: 900,
        color,
        letterSpacing: 2,
        textTransform: "uppercase",
        opacity: 0.7,
      }}
    >
      {CHANNEL_MONOGRAM}
    </span>
  </div>
);

/** Smart emphasis hook text (same logic as Vox). */
const HookText: React.FC<{
  hook: string;
  fontSize: number;
  baseColor: string;
  accentColor: string;
  align?: "left" | "center";
}> = ({ hook, fontSize, baseColor, accentColor, align = "left" }) => {
  const words = hook.split(" ");
  const ei = emphasisIndex(hook);
  return (
    <div
      style={{
        fontFamily: HEADLINE,
        fontWeight: 900,
        fontSize,
        lineHeight: 0.9,
        color: baseColor,
        textTransform: "uppercase",
        textAlign: align,
      }}
    >
      {words.map((w, i) => (
        <span
          key={i}
          style={{
            color: i === ei ? accentColor : baseColor,
            marginRight: 14,
            display: "inline-block",
          }}
        >
          {w}
        </span>
      ))}
    </div>
  );
};

/** The Everyman subject at a still pose. */
const Character: React.FC<{
  variant: AntidoteThumbProps["variant"];
  expression: AntidoteThumbProps["expression"];
  action: AntidoteThumbProps["action"];
  width?: number;
}> = ({ variant, expression, action, width = 430 }) => {
  const p = pose(action, 45, 30);
  const v = { ...variant, expression };
  return (
    <div style={{ filter: "drop-shadow(0 20px 24px rgba(20,20,20,0.28))" }}>
      <Everyman variant={v} pose={p} width={width} />
    </div>
  );
};

// ── SVG MOTIFS (expanded) ───────────────────────────────────────────────────

const mix = (hex: string, to: number, amt: number) => {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (to - c) * amt),
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
};

const Motif: React.FC<{
  kind: AntidoteThumbnailBrief["motif"];
  accent: string;
  gold: string;
}> = ({ kind, accent, gold }) => {
  const soft = 0.55;
  if (kind === "arrowUp")
    return (
      <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%" }}>
        <path d="M200 40 L330 220 L250 220 L250 360 L150 360 L150 220 L70 220 Z" fill={accent} opacity={soft} />
      </svg>
    );
  if (kind === "summit")
    return (
      <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%" }}>
        <path d="M40 340 L170 120 L240 240 L300 160 L360 340 Z" fill={accent} opacity={soft} />
        <path d="M170 120 L205 180 L135 180 Z" fill={gold} opacity={0.7} />
      </svg>
    );
  if (kind === "spark")
    return (
      <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%" }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={196} y={40} width={8} height={110} rx={4} fill={accent} opacity={soft} transform={`rotate(${i * 30} 200 200)`} />
        ))}
        <circle cx={200} cy={200} r={40} fill={gold} opacity={0.8} />
      </svg>
    );
  if (kind === "ring")
    return (
      <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%" }}>
        <circle cx={200} cy={200} r={170} fill="none" stroke={accent} strokeWidth={40} opacity={soft} />
        <circle cx={200} cy={200} r={110} fill="none" stroke={gold} strokeWidth={16} opacity={0.5} />
      </svg>
    );
  // risingBars (default)
  const bars = [110, 170, 230, 300, 360];
  return (
    <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%" }}>
      {bars.map((h, i) => (
        <rect key={i} x={30 + i * 74} y={400 - h} width={54} height={h} rx={10} fill={i === bars.length - 1 ? gold : accent} opacity={i === bars.length - 1 ? 0.85 : soft} />
      ))}
    </svg>
  );
};

// ── 6 LAYOUT RENDERERS ──────────────────────────────────────────────────────

const PortraitRight: React.FC<AntidoteThumbProps> = ({
  author,
  hook,
  paper,
  ink,
  accent,
  gold,
  variant,
  action,
  expression,
  motif,
}) => {
  const hookSize = hook.length > 16 || hook.split(" ").some((w) => w.length >= 11) ? 88 : 118;
  return (
    <>
      <AbsoluteFill style={{ background: `linear-gradient(135deg, ${mix(paper, 255, 0.35)} 0%, ${paper} 55%, ${mix(paper, 0, 0.06)} 100%)` }} />
      {/* Character bottom-right */}
      <div style={{ position: "absolute", right: 44, bottom: -12 }}>
        <Character variant={variant} expression={expression} action={action} width={430} />
      </div>
      {/* Motif behind character */}
      <div style={{ position: "absolute", left: 604, bottom: 18, width: 360, height: 320, opacity: 0.96 }}>
        <Motif kind={motif} accent={accent} gold={gold} />
      </div>
      {/* Text left */}
      <div style={{ position: "absolute", left: 70, top: 0, bottom: 0, width: 690, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22, zIndex: 5 }}>
        <HookText hook={hook} fontSize={hookSize} baseColor={ink} accentColor={accent} />
        {author && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 34, color: ink, opacity: 0.8 }}>{author}</div>}
      </div>
    </>
  );
};

const SplitFace: React.FC<AntidoteThumbProps> = ({
  author,
  hook,
  paper,
  ink,
  accent,
  gold,
  variant,
  action,
  expression,
}) => {
  const hookSize = hook.length > 14 ? 88 : 108;
  const ground = thumbGround(paper, ink, accent);
  return (
    <>
      {/* Left: character on paper */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "48%", height: "100%", background: paper, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", bottom: -20, transform: "translateX(-50%)" }}>
          <Character variant={variant} expression={expression} action={action} width={480} />
        </div>
      </div>
      {/* Right: solid ground + hook */}
      <div style={{ position: "absolute", right: 0, top: 0, width: "55%", height: "100%", background: ground.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px", gap: 18, zIndex: 3 }}>
        <HookText hook={hook} fontSize={hookSize} baseColor={ground.text} accentColor={accent} />
        {author && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 30, color: ground.text, opacity: 0.7 }}>{author}</div>}
      </div>
      {/* Accent stripe */}
      <div style={{ position: "absolute", left: "47%", top: 0, width: 8, height: "100%", background: accent, zIndex: 4 }} />
    </>
  );
};

const FullBleed: React.FC<AntidoteThumbProps> = ({
  author,
  hook,
  ink,
  accent,
  gold,
  variant,
  action,
  expression,
  motif,
}) => {
  const hookSize = hook.length > 12 ? 96 : 130;
  return (
    <>
      <AbsoluteFill style={{ background: ink }} />
      {/* Large motif as background element */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.15, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 600, height: 600 }}>
          <Motif kind={motif} accent={accent} gold={gold} />
        </div>
      </div>
      {/* Small character in corner */}
      <div style={{ position: "absolute", right: 40, bottom: -10, opacity: 0.4 }}>
        <Character variant={variant} expression={expression} action={action} width={220} />
      </div>
      {/* Center hook */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 80px", zIndex: 5 }}>
        <HookText hook={hook} fontSize={hookSize} baseColor="#FFFFFF" accentColor={accent} align="center" />
        <div style={{ width: 200, height: 6, background: accent, borderRadius: 3, marginTop: 8 }} />
        {author && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 32, color: "#FFFFFF", opacity: 0.8, marginTop: 4 }}>{author}</div>}
      </div>
    </>
  );
};

const ObjectHero: React.FC<AntidoteThumbProps> = ({
  author,
  hook,
  paper,
  ink,
  accent,
  gold,
  motif,
}) => {
  // No character — pure motif + text on saturated ground
  const hookSize = hook.length > 14 ? 88 : 110;
  const textColor = pickTextColor(accent, ink, paper);
  return (
    <>
      <AbsoluteFill style={{ background: accent }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 65% 50%, rgba(255,255,255,0.15), transparent 60%)` }} />
      {/* Large motif as the "object" */}
      <div style={{ position: "absolute", right: 60, top: "50%", transform: "translateY(-50%)", width: 440, height: 440 }}>
        <Motif kind={motif} accent={gold} gold={paper} />
      </div>
      <div style={{ position: "absolute", left: 64, top: 0, bottom: 0, width: 660, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, zIndex: 5 }}>
        <HookText hook={hook} fontSize={hookSize} baseColor={textColor} accentColor={gold} />
        {author && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 30, color: textColor, opacity: 0.8 }}>{author}</div>}
      </div>
    </>
  );
};

const TwoSubjectVs: React.FC<AntidoteThumbProps> = ({
  author,
  hook,
  paper,
  ink,
  accent,
  gold,
  variant,
  action,
  expression,
}) => {
  const hookSize = hook.length > 14 ? 76 : 96;
  return (
    <>
      <AbsoluteFill style={{ background: `linear-gradient(135deg, ${mix(paper, 255, 0.3)}, ${paper})` }} />
      {/* Left character (flipped = facing right) */}
      <div style={{ position: "absolute", left: -20, bottom: -12, transform: "scaleX(-1)" }}>
        <Character variant={variant} expression={expression} action="point" width={380} />
      </div>
      {/* Right character (different action for variety) */}
      <div style={{ position: "absolute", right: -20, bottom: -12 }}>
        <Character variant={{ ...variant, suit: gold }} expression="worried" action="slump" width={380} />
      </div>
      {/* Center content */}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 0, bottom: 0, width: 480, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, zIndex: 6 }}>
        <div style={{ width: 6, height: 80, background: accent, borderRadius: 3 }} />
        <HookText hook={hook} fontSize={hookSize} baseColor={ink} accentColor={accent} align="center" />
        <div style={{ width: 6, height: 80, background: accent, borderRadius: 3 }} />
        {author && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 28, color: ink, opacity: 0.7 }}>{author}</div>}
      </div>
    </>
  );
};

const TextPoster: React.FC<AntidoteThumbProps> = ({
  author,
  hook,
  paper,
  ink,
  accent,
}) => {
  const ground = thumbGround(paper, ink, accent);
  const hookSize = hook.length > 12 ? 130 : 170;
  return (
    <>
      <AbsoluteFill style={{ background: ground.bg }} />
      <AbsoluteFill style={{ opacity: 0.04, backgroundImage: `radial-gradient(${ground.text} 1px, transparent 1.6px)`, backgroundSize: "22px 22px" }} />
      {/* Diagonal accent strip */}
      <div style={{ position: "absolute", right: -60, top: -60, width: 300, height: 840, background: accent, transform: "rotate(12deg)", opacity: 0.15, zIndex: 2 }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "0 80px", zIndex: 5 }}>
        <HookText hook={hook} fontSize={hookSize} baseColor={ground.text} accentColor={accent} align="center" />
        <div style={{ width: 240, height: 8, background: accent, borderRadius: 4 }} />
        {author && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 36, color: ground.text, opacity: 0.7, marginTop: 8 }}>{author}</div>}
      </div>
    </>
  );
};

/**
 * SceneStill — a frozen frame of the book's own Antidote scene (its real set,
 * cast and icon) beside a solid palette panel carrying the hook. The thumbnail
 * is literally a frame of the film, so it cannot promise a different video.
 * textPos picks the panel side (left / right / bottom); the stage slides away
 * from the panel so the cast is never under the text.
 */
const heroOf = (p: AntidoteThumbProps, g: ThumbGrammar): SceneSpec | undefined => {
  const list = (p.heroScenes as SceneSpec[] | undefined) ?? [];
  return list[Math.min(g.sceneRank ?? 0, list.length - 1)] ?? (p.heroScene as SceneSpec | undefined);
};

const SceneStill: React.FC<AntidoteThumbProps & { g: ThumbGrammar }> = (props) => {
  const { hook, title, author, paper, ink, accent, gold, cast, g } = props;
  const scene = heroOf(props, g);
  // Panel colour is a grammar axis too: ink panel + accent emphasis, or a
  // saturated accent panel + gold emphasis.
  const panel = g.accent === "gold" ? accent : isDark(ink) ? ink : "#101216";
  const base = pickTextColor(panel, ink, "#FFFFFF");
  // Emphasis must stand out from BOTH the panel and the body text (a gold
  // emphasis that fails contrast used to fall back to paper = same as the body).
  const emph = emphasisColor(g.accent === "gold" ? [gold, accent, ink, paper] : [accent, gold, paper, ink], panel, base);
  const align = alignFor(g.textPos);
  const bottom = g.textPos === "bottom";
  // Bottom band holds ONE line: shrink to fit ~1040px (a wrapped second line
  // used to climb out of the band onto the light scene).
  const fitOneLine = Math.floor(1040 / (hook.length * (g.type === "label" ? 0.78 : 0.7)));
  const fontSize = bottom
    ? Math.min(Math.round(hookFontSize(hook, g.type, true) * 0.9), fitOneLine)
    : Math.min(
        Math.round(hookFontSize(hook, g.type) * 0.8),
        // side panel text column is 440px: the longest word must fit on its own line
        Math.floor(440 / (Math.max(...hook.split(/\s+/).map((w) => w.length)) * (g.type === "label" ? 0.86 : 0.74))),
      );
  // 1920×1080 stage → 1280×720 frame, zoomed a little so the slide never shows an edge.
  const S = (1280 / 1920) * 1.12;
  const dx = bottom ? 0 : (g.textPos === "left" ? 1 : -1) * 250;
  const dy = bottom ? -120 : 0;
  const panelClip =
    g.textPos === "left" ? "polygon(0 0, 100% 0, 86% 100%, 0 100%)"
    : g.textPos === "right" ? "polygon(14% 0, 100% 0, 100% 100%, 0 100%)"
    : "polygon(0 18%, 100% 0, 100% 100%, 0 100%)";
  const panelBox: React.CSSProperties =
    bottom ? { left: 0, right: 0, bottom: 0, height: 300 }
    : g.textPos === "left" ? { left: 0, top: 0, bottom: 0, width: 560 }
    : { right: 0, top: 0, bottom: 0, width: 560 };
  const textBox: React.CSSProperties =
    bottom ? { left: 64, right: 150, bottom: 52, height: 220, justifyContent: "flex-end" }
    : g.textPos === "left" ? { left: 56, top: 0, bottom: 0, width: 440, justifyContent: "center" }
    : { right: 56, top: 0, bottom: 0, width: 440, justifyContent: "center", alignItems: "flex-end" };
  return (
    <>
      <AbsoluteFill style={{ background: paper }} />
      {scene ? (
        <div style={{ position: "absolute", left: 640 + dx, top: 360 + dy, width: 1920, height: 1080, transform: `translate(-50%, -50%) scale(${S})`, transformOrigin: "center" }}>
          <Freeze frame={heroFreezeFrame(scene)}>
            <Scene scene={{ ...scene, texts: [], diagram: undefined, transition: { type: "cut", frames: 0 } } as SceneSpec} cast={cast as CastBible | undefined} />
          </Freeze>
        </div>
      ) : null}
      <div style={{ position: "absolute", ...panelBox, background: panel, clipPath: panelClip, zIndex: 4, boxShadow: "0 0 60px rgba(0,0,0,0.3)" }} />
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", gap: 16, zIndex: 6, ...textBox }}>
        <GrammarHook hook={hook} type={g.type} fontSize={fontSize} base={base} accent={emph} ink={ink} align={align} />
        <HookRule type={g.type} accent={emph} align={align} />
      </div>
      {/* Book anchor: on the dark side panel it sits bare; over the light scene it gets a pill. */}
      <BookAnchor title={title} author={author} side={g.textPos === "right" ? "right" : "left"} accent={emph} ground={bottom ? "pill" : "bare"} top={bottom ? 26 : 40} inset={bottom ? 30 : 56} />
    </>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────

export const AntidoteThumbnail: React.FC<AntidoteThumbProps> = (props) => {
  const { paper, ink, slug, layout: layoutOverride, heroImg } = props;
  const g = resolveGrammar(slug ?? "default", "antidote", props.grammar, layoutOverride);
  // scene-still needs a scene; a config-less preview falls back to the poster.
  const layout = g.layout === "scene-still" && !heroOf(props, g) ? "text-poster" : g.layout;

  // Photoreal Flux bleed is opt-in only (grammar.layout = "cinematic-bleed").
  // It used to fire whenever a heroImg existed — and Root always passes one —
  // so every Antidote thumbnail was a photo that looked nothing like the film.
  if (layout === "cinematic-bleed") {
    const resolvedHero = heroImg || (slug ? `scenes/${slug}/thumbnail-hero.png` : undefined);
    return (
      <AbsoluteFill style={{ backgroundColor: "#0B0D11", overflow: "hidden" }}>
        <CinematicBleed
          title={props.title}
          author={props.author}
          hook={props.hook}
          heroCut=""
          heroImg={resolvedHero}
          slug={slug}
          layout="cinematic-bleed"
          pal={{ paper, ink, red: props.accent, gold: props.gold }}
          grammar={g}
        />
        <Vignette />
        <Grain ink={ink} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: paper, overflow: "hidden" }}>
      {layout === "portrait-right" && <PortraitRight {...props} />}
      {layout === "split-face" && <SplitFace {...props} />}
      {layout === "full-bleed" && <FullBleed {...props} />}
      {layout === "object-hero" && <ObjectHero {...props} />}
      {layout === "two-subject-vs" && <TwoSubjectVs {...props} />}
      {layout === "text-poster" && <TextPoster {...props} />}
      {layout === "scene-still" && <SceneStill {...props} g={g} />}

      {/* Brand lock */}
      {layout !== "scene-still" && <Spine color={isDark(paper) ? paper : ink} />}
      <Vignette />
      <Grain ink={ink} />
    </AbsoluteFill>
  );
};
