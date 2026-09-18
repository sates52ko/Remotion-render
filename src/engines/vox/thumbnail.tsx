import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { INK, RED, HEADLINE, SERIF, resolvePalette, Palette } from "./palette";
import { BG } from "./backgrounds";
import {
  thumbLayoutSchema,
  pickLayout,
  pickTextColor,
  thumbGround,
  isDark,
  emphasisIndex,
  CHANNEL_MONOGRAM,
  SPINE_HEIGHT,
  SPINE_FONT,
  CTR_YELLOW,
  CTR_WHITE,
} from "../thumbnail-shared";

export const thumbnailSchema = z.object({
  title: z.string(),
  author: z.string(),
  hook: z.string(),
  heroCut: z.string(),
  heroImg: z.string().optional(),
  slug: z.string().optional(),
  layout: thumbLayoutSchema.optional(),
});
export type ThumbnailProps = z.infer<typeof thumbnailSchema>;

// ── SHARED SUB-COMPONENTS ───────────────────────────────────────────────────

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      zIndex: 90,
      pointerEvents: "none",
      opacity: 0.07,
      backgroundImage: `radial-gradient(${INK} 0.5px, transparent 0.6px)`,
      backgroundSize: "3px 3px",
      mixBlendMode: "multiply",
    }}
  />
);

const Vignette: React.FC<{ intensity?: number }> = ({ intensity = 0.35 }) => (
  <AbsoluteFill
    style={{
      zIndex: 89,
      pointerEvents: "none",
      boxShadow: `inset 0 0 300px rgba(20,15,10,${intensity})`,
    }}
  />
);

/** Brand spine — bottom-left channel monogram. Small, consistent, recognizable. */
const Spine: React.FC<{ color: string; bg: string }> = ({ color, bg }) => (
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
    <div
      style={{
        width: 4,
        height: SPINE_HEIGHT,
        background: color,
        borderRadius: 2,
      }}
    />
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

/** Cutout subject with ink stroke outline for pop + mask cleanup. */
const HeroCutout: React.FC<{
  src: string;
  height: number;
  strokeColor: string;
  style?: React.CSSProperties;
}> = ({ src, height, strokeColor, style }) => (
  <div style={{ position: "relative", ...style }}>
    {/* Shadow silhouette for the stroke effect */}
    <Img
      src={staticFile(src)}
      alt=""
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        height,
        width: "auto",
        objectFit: "contain",
        filter: `
          drop-shadow(0 0 4px ${strokeColor})
          drop-shadow(0 0 4px ${strokeColor})
          drop-shadow(0 0 2px ${strokeColor})
          drop-shadow(0 18px 28px rgba(20,15,10,0.45))
        `,
      }}
    />
    {/* Clean image on top */}
    <Img
      src={staticFile(src)}
      alt=""
      style={{
        position: "relative",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        height,
        width: "auto",
        objectFit: "contain",
      }}
    />
  </div>
);

/** Hook text with smart single-word emphasis. */
const HookText: React.FC<{
  hook: string;
  fontSize: number;
  baseColor: string;
  accentColor: string;
  align?: "left" | "center";
  shadow?: boolean;
}> = ({ hook, fontSize, baseColor, accentColor, align = "left", shadow = false }) => {
  const words = hook.split(" ");
  const ei = emphasisIndex(hook);
  return (
    <div
      style={{
        fontFamily: HEADLINE,
        fontWeight: 900,
        fontSize,
        lineHeight: 0.92,
        color: baseColor,
        textTransform: "uppercase",
        textAlign: align,
        textShadow: shadow
          ? "0 4px 24px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.95), 2px 2px 0 rgba(0,0,0,0.9)"
          : "none",
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

// ── LAYOUT RENDERERS ────────────────────────────────────────────────────────

/**
 * CinematicBleed — High-CTR YouTube layout.
 * Full-bleed 16:9 cinematic Flux image, left directional gradient scrim,
 * and massive two-tone bold typography (White + Electric Yellow).
 */
export const CinematicBleed: React.FC<ThumbnailProps & { pal?: Palette }> = ({
  hook,
  heroImg,
  heroCut,
  pal,
}) => {
  const hero = heroImg || heroCut;
  const words = hook.trim().split(/\s+/);
  const maxWordLen = Math.max(...words.map((w) => w.length));
  // Dynamic font scaling for maximum browse-size punch (110px-138px)
  const fontSize =
    words.length <= 2 && maxWordLen <= 7
      ? 136
      : words.length <= 3 && maxWordLen <= 9
        ? 118
        : 100;

  return (
    <>
      {/* 16:9 Full-Bleed Hero Image */}
      {hero ? (
        <Img
          src={staticFile(hero)}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 20%",
            filter: "contrast(1.15) saturate(1.2) brightness(0.95)",
            zIndex: 0,
          }}
        />
      ) : (
        <AbsoluteFill style={{ background: "#0B0D11", zIndex: 0 }} />
      )}

      {/* Cinematic directional dark scrim on left for text contrast */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(5,7,10,0.94) 0%, rgba(5,7,10,0.82) 42%, rgba(5,7,10,0.32) 68%, rgba(5,7,10,0.02) 100%)",
          zIndex: 2,
        }}
      />

      {/* Subtle radial atmosphere */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 75% 45%, transparent 35%, rgba(0,0,0,0.55) 100%)",
          zIndex: 3,
        }}
      />

      {/* Giant Hook Typography on Left side (leaves bottom-right free for YouTube timestamp) */}
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 0,
          bottom: 0,
          width: 720,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 18,
          zIndex: 6,
        }}
      >
        <HookText
          hook={hook}
          fontSize={fontSize}
          baseColor={CTR_WHITE}
          accentColor={CTR_YELLOW}
          shadow
        />
        {/* Visual energy underline */}
        <div
          style={{
            width: 140,
            height: 6,
            background: CTR_YELLOW,
            borderRadius: 3,
            boxShadow: "0 0 16px rgba(255,229,0,0.7)",
          }}
        />
      </div>
    </>
  );
};

const PortraitRight: React.FC<ThumbnailProps & { pal: Palette }> = ({
  title,
  author,
  hook,
  heroCut,
  heroImg,
  pal,
}) => {
  const hero = heroCut || heroImg;
  const hookSize = hook.length > 16 || hook.split(" ").some((w) => w.length >= 11) ? 96 : 118;
  return (
    <>
      <Img src={staticFile(BG)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
      {/* Decorative accent circle */}
      <div
        style={{
          position: "absolute",
          right: "6%",
          top: "50%",
          width: 760,
          height: 760,
          transform: "translateY(-50%)",
          borderRadius: "50%",
          border: `26px solid ${RED}`,
          opacity: 0.22,
          zIndex: 1,
        }}
      />
      {hero && (
        <div style={{ position: "absolute", right: 40, bottom: 0, height: 720, width: 620, zIndex: 3 }}>
          <HeroCutout src={hero} height={700} strokeColor={pal.ink} style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)" }} />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 0,
          bottom: 0,
          width: 700,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 22,
          zIndex: 5,
        }}
      >
        <HookText hook={hook} fontSize={hookSize} baseColor={pal.ink} accentColor={pal.red} />
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 34, color: pal.ink, opacity: 0.8 }}>
          {author}
        </div>
      </div>
    </>
  );
};

const SplitFace: React.FC<ThumbnailProps & { pal: Palette }> = ({
  author,
  hook,
  heroCut,
  heroImg,
  pal,
}) => {
  const hero = heroCut || heroImg;
  const hookSize = hook.length > 14 ? 88 : 108;
  const ground = thumbGround(pal.paper, pal.ink, pal.red);
  return (
    <>
      {/* Left half: hero image, hard crop */}
      {hero ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: "48%", height: "100%", overflow: "hidden", zIndex: 1 }}>
          <Img
            src={staticFile(hero)}
            alt=""
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              height: "110%",
              width: "auto",
              objectFit: "cover",
              filter: "contrast(1.1) saturate(1.15)",
            }}
          />
          {/* fade edge */}
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: 120,
              height: "100%",
              background: `linear-gradient(to left, ${ground.bg}, transparent)`,
              zIndex: 2,
            }}
          />
        </div>
      ) : null}
      {/* Right half: solid color + hook */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: hero ? "55%" : "100%",
          height: "100%",
          background: ground.bg,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 60px",
          gap: 18,
          zIndex: 3,
        }}
      >
        <HookText hook={hook} fontSize={hookSize} baseColor={ground.text} accentColor={pal.red} />
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 30, color: ground.text, opacity: 0.7 }}>
          {author}
        </div>
      </div>
      {/* Accent stripe divider */}
      <div
        style={{
          position: "absolute",
          left: "47%",
          top: 0,
          width: 8,
          height: "100%",
          background: pal.red,
          zIndex: 4,
        }}
      />
    </>
  );
};

const FullBleed: React.FC<ThumbnailProps & { pal: Palette }> = ({
  author,
  hook,
  heroCut,
  heroImg,
  pal,
}) => {
  const hero = heroImg || heroCut; // prefer un-cut for full bleed
  const hookSize = hook.length > 12 ? 96 : 130;
  return (
    <>
      {hero && (
        <Img
          src={staticFile(hero)}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.35) contrast(1.2) saturate(1.1)",
            zIndex: 0,
          }}
        />
      )}
      {!hero && (
        <AbsoluteFill style={{ background: pal.ink, zIndex: 0 }} />
      )}
      {/* Center hook */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          zIndex: 5,
          padding: "0 80px",
        }}
      >
        <HookText hook={hook} fontSize={hookSize} baseColor="#FFFFFF" accentColor={pal.red} align="center" shadow />
        {/* Accent underline */}
        <div style={{ width: 200, height: 6, background: pal.red, borderRadius: 3, marginTop: 8 }} />
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 32, color: "#FFFFFF", opacity: 0.8, marginTop: 4 }}>
          {author}
        </div>
      </div>
    </>
  );
};

const ObjectHero: React.FC<ThumbnailProps & { pal: Palette }> = ({
  author,
  hook,
  heroCut,
  heroImg,
  pal,
}) => {
  const hero = heroCut || heroImg;
  const hookSize = hook.length > 14 ? 88 : 110;
  // Saturated ground from accent color
  return (
    <>
      <AbsoluteFill style={{ background: pal.red, zIndex: 0 }} />
      {/* Subtle radial highlight */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 65% 50%, rgba(255,255,255,0.15), transparent 60%)`,
          zIndex: 1,
        }}
      />
      {hero && (
        <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", zIndex: 3 }}>
          <HeroCutout src={hero} height={520} strokeColor="rgba(255,255,255,0.4)" />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 0,
          bottom: 0,
          width: 680,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 18,
          zIndex: 5,
        }}
      >
        <HookText
          hook={hook}
          fontSize={hookSize}
          baseColor={pickTextColor(pal.red, pal.ink, pal.paper)}
          accentColor={pal.gold}
        />
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 30,
            color: pickTextColor(pal.red, pal.ink, pal.paper),
            opacity: 0.8,
          }}
        >
          {author}
        </div>
      </div>
    </>
  );
};

const TwoSubjectVs: React.FC<ThumbnailProps & { pal: Palette }> = ({
  author,
  hook,
  heroCut,
  heroImg,
  pal,
}) => {
  const hero = heroCut || heroImg;
  const hookSize = hook.length > 14 ? 76 : 96;
  return (
    <>
      <Img src={staticFile(BG)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
      {/* Left subject */}
      {hero && (
        <div style={{ position: "absolute", left: 0, bottom: 0, height: 680, width: 400, zIndex: 3, transform: "scaleX(-1)" }}>
          <HeroCutout src={hero} height={660} strokeColor={pal.ink} />
        </div>
      )}
      {/* Right subject (same image, different treatment) */}
      {hero && (
        <div style={{ position: "absolute", right: 0, bottom: 0, height: 680, width: 400, zIndex: 3 }}>
          <HeroCutout src={hero} height={660} strokeColor={pal.red} />
        </div>
      )}
      {/* Center divider + hook */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 0,
          bottom: 0,
          width: 480,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          zIndex: 6,
        }}
      >
        {/* VS stripe */}
        <div style={{ width: 6, height: 80, background: pal.red, borderRadius: 3, marginBottom: 8 }} />
        <HookText hook={hook} fontSize={hookSize} baseColor={pal.ink} accentColor={pal.red} align="center" />
        <div style={{ width: 6, height: 80, background: pal.red, borderRadius: 3, marginTop: 8 }} />
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 28, color: pal.ink, opacity: 0.7 }}>
          {author}
        </div>
      </div>
    </>
  );
};

const TextPoster: React.FC<ThumbnailProps & { pal: Palette }> = ({
  author,
  hook,
  pal,
}) => {
  const ground = thumbGround(pal.paper, pal.ink, pal.red);
  const hookSize = hook.length > 12 ? 130 : 170;
  return (
    <>
      <AbsoluteFill style={{ background: ground.bg, zIndex: 0 }} />
      {/* Torn paper texture simulation */}
      <AbsoluteFill
        style={{
          opacity: 0.04,
          backgroundImage: `radial-gradient(${ground.text} 1px, transparent 1.6px)`,
          backgroundSize: "22px 22px",
          zIndex: 1,
        }}
      />
      {/* Diagonal accent strip */}
      <div
        style={{
          position: "absolute",
          right: -60,
          top: -60,
          width: 300,
          height: 840,
          background: pal.red,
          transform: "rotate(12deg)",
          opacity: 0.15,
          zIndex: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: "0 80px",
          zIndex: 5,
        }}
      >
        <HookText hook={hook} fontSize={hookSize} baseColor={ground.text} accentColor={pal.red} align="center" />
        {/* Accent underline */}
        <div style={{ width: 240, height: 8, background: pal.red, borderRadius: 4 }} />
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 36, color: ground.text, opacity: 0.7, marginTop: 8 }}>
          {author}
        </div>
      </div>
    </>
  );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────

export const VoxThumbnail: React.FC<ThumbnailProps> = (props) => {
  const { slug, layout: layoutOverride } = props;
  const pal = resolvePalette(slug);
  const layout = pickLayout(slug ?? "default", layoutOverride);

  const paletteVars = {
    "--vox-paper": pal.paper,
    "--vox-ink": pal.ink,
    "--vox-red": pal.red,
    "--vox-gold": pal.gold,
  } as React.CSSProperties;

  const layoutProps = { ...props, pal };

  return (
    <AbsoluteFill style={{ ...paletteVars, backgroundColor: pal.paper, overflow: "hidden" }}>
      {layout === "cinematic-bleed" && <CinematicBleed {...layoutProps} />}
      {layout === "portrait-right" && <PortraitRight {...layoutProps} />}
      {layout === "split-face" && <SplitFace {...layoutProps} />}
      {layout === "full-bleed" && <FullBleed {...layoutProps} />}
      {layout === "object-hero" && <ObjectHero {...layoutProps} />}
      {layout === "two-subject-vs" && <TwoSubjectVs {...layoutProps} />}
      {layout === "text-poster" && <TextPoster {...layoutProps} />}

      {/* Brand lock: subtle texture, no spine clutter on cinematic-bleed */}
      {layout !== "cinematic-bleed" && (
        <Spine color={isDark(pal.paper) ? pal.paper : pal.ink} bg={pal.paper} />
      )}
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};
