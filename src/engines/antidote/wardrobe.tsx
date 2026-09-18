import React from "react";
import type { VariantSpec } from "./schema";

/**
 * wardrobe.tsx — the Character Foundry's parts bin.
 *
 * One rig with four colors and four outfits meant every book on the channel was
 * cast from the same five people wearing the same three coats. What actually
 * makes a character read as belonging to a PARTICULAR book is silhouette — a
 * hat, a period garment, a child's head-to-body ratio, a strap across the chest
 * — and silhouette is parametric, which is the one thing a hand-drawn channel
 * cannot recombine for free.
 *
 * Everything here draws in the rig's own viewBox units: 400 wide, head centred
 * on (200, 150) with rx 92 / ry 104, shoulder line y=322, hip line y=596.
 * Two colors only — the garment `suit` and its accent `shirt`/`trim` — so a
 * character stays legible at the size a `wide` shot renders them.
 */

export const darken = (hex: string, amt = 0.8) => {
  const s = String(hex).trim();
  const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  const rgb = m
    ? [Number(m[1]), Number(m[2]), Number(m[3])]
    : (() => {
        const t = s.replace("#", "");
        const full = t.length === 3 ? t.split("").map((c) => c + c).join("") : t;
        const n = parseInt(full, 16);
        return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      })();
  return `rgb(${Math.round(rgb[0] * amt)},${Math.round(rgb[1] * amt)},${Math.round(rgb[2] * amt)})`;
};

// ── HAIR ────────────────────────────────────────────────────────────────────
// Split in two layers so long styles read behind the head and every style still
// gets a hairline over the face.

export const BackHair: React.FC<{ style: VariantSpec["hairStyle"]; color: string }> = ({ style, color }) => {
  switch (style) {
    case "long":
      return <path d="M96,150 Q96,58 200,50 Q304,58 304,150 L310,340 Q300,250 292,150 Q292,94 200,90 Q108,94 108,150 Q100,250 90,340 Z" fill={color} />;
    case "bun":
      return <circle cx={200} cy={58} r={30} fill={color} />;
    case "afro":
      return <ellipse cx={200} cy={128} rx={134} ry={126} fill={color} />;
    case "curly":
      return (
        <g fill={color}>
          {[[112, 96, 34], [156, 62, 38], [206, 50, 40], [254, 64, 37], [292, 100, 33], [104, 148, 28], [298, 148, 28]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case "ponytail":
      return (
        <g fill={color}>
          <path d="M296,110 Q346,140 340,214 Q336,278 306,306 Q330,250 322,196 Q314,142 286,124 Z" />
          <circle cx={300} cy={112} r={22} />
        </g>
      );
    case "braids":
      return (
        <g fill={color}>
          <path d="M104,150 Q96,60 200,50 Q304,60 296,150 L296,180 L104,180 Z" />
          {[100, 300].map((x, i) => (
            <g key={i}>
              {[0, 1, 2, 3].map((k) => <ellipse key={k} cx={x} cy={196 + k * 52} rx={19} ry={28} />)}
            </g>
          ))}
        </g>
      );
    case "pigtails":
      return (
        <g fill={color}>
          <circle cx={86} cy={166} r={40} />
          <circle cx={314} cy={166} r={40} />
        </g>
      );
    case "messy":
      return (
        <g fill={color}>
          <path d="M100,156 Q88,52 200,44 Q312,52 300,156 Q288,96 246,84 Q212,116 176,80 Q126,94 100,156 Z" />
          <path d="M282,60 L322,20 L300,68 Z" />
          <path d="M124,58 L86,22 L110,66 Z" />
        </g>
      );
    default:
      return null;
  }
};

export const FrontHair: React.FC<{ style: VariantSpec["hairStyle"]; color: string }> = ({ style, color }) => {
  switch (style) {
    case "bald":
      return (
        <g fill={color}>
          <path d="M108,152 Q104,124 118,116 Q120,140 130,154 Z" />
          <path d="M292,152 Q296,124 282,116 Q280,140 270,154 Z" />
        </g>
      );
    case "receding":
      return (
        <g fill={color}>
          <path d="M108,150 Q106,86 148,72 Q140,104 132,152 Z" />
          <path d="M292,150 Q294,86 252,72 Q260,104 268,152 Z" />
          <path d="M148,72 Q200,58 252,72 Q200,84 148,72 Z" />
        </g>
      );
    case "buzz":
      return <path d="M112,150 Q114,74 200,70 Q286,74 288,150 Q288,114 200,110 Q112,114 112,150 Z" fill={color} opacity={0.9} />;
    case "afro":
      return <path d="M108,146 Q112,64 200,58 Q288,64 292,146 Q288,100 200,96 Q112,100 108,146 Z" fill={color} />;
    case "curly":
      return <path d="M106,148 Q112,62 200,56 Q288,62 294,148 Q286,102 200,98 Q114,102 106,148 Z" fill={color} />;
    case "messy":
      return <path d="M106,150 Q112,54 200,48 Q290,54 294,150 Q280,96 236,94 Q206,124 172,92 Q128,100 106,150 Z" fill={color} />;
    default:
      // short / long / bun / ponytail / braids / pigtails share the front cap
      return <path d="M106,150 Q108,52 200,48 Q292,52 294,150 Q294,92 200,88 Q106,92 106,150 Z" fill={color} />;
  }
};

// ── BEARD ───────────────────────────────────────────────────────────────────
export const Beard: React.FC<{ style: VariantSpec["beard"]; color: string }> = ({ style, color }) => {
  switch (style) {
    case "stubble":
      return <path d="M130,166 Q140,244 200,252 Q260,244 270,166 Q250,214 200,218 Q150,214 130,166 Z" fill={color} opacity={0.24} />;
    case "full":
      return (
        <g fill={color}>
          <path d="M126,158 Q136,250 200,258 Q264,250 274,158 Q252,220 200,222 Q148,220 126,158 Z" />
          <path d="M176,196 Q200,188 224,196 Q212,206 200,206 Q188,206 176,196 Z" />
        </g>
      );
    case "mustache":
      return <path d="M170,198 Q200,188 230,198 Q222,212 200,206 Q178,212 170,198 Z" fill={color} />;
    case "goatee":
      return (
        <g fill={color}>
          <path d="M172,198 Q200,190 228,198 Q220,210 200,205 Q180,210 172,198 Z" />
          <path d="M182,226 Q200,220 218,226 Q216,252 200,256 Q184,252 182,226 Z" />
        </g>
      );
    case "muttonchops":
      return (
        <g fill={color}>
          <path d="M128,158 Q134,224 168,238 Q152,196 148,158 Z" />
          <path d="M272,158 Q266,224 232,238 Q248,196 252,158 Z" />
        </g>
      );
    default:
      return null;
  }
};

// ── HEADWEAR ────────────────────────────────────────────────────────────────
// The cheapest silhouette change available: a hat changes who someone is at any
// size, including the 40-pixel figures in a crowd.
//
// TWO LAYERS, and the reason matters. The first version drew every piece in one
// group over the finished face, and seven of thirteen pieces covered the eyes —
// a cast of faceless blobs, which is worse than no hat at all. The rule now:
//
//   * the face owns y 96-260 (brows ~96-104, eyes ~118-146, mouth ~214). NOTHING
//     in the FRONT layer may dip below y≈92 across the face's own width.
//   * wrapping pieces (hood, headscarf, bonnet, veil) put their drape in the
//     BACK layer, behind the head, and keep only a rim in front — which is what
//     makes a hood read as a hood instead of as a mask.
const FACE_FLOOR = 92; // documented above; every front-layer path respects it

type HeadProps = { style: VariantSpec["headwear"]; color: string; accent: string };

/** Drapes and volumes that belong BEHIND the head. */
export const HeadwearBack: React.FC<HeadProps> = ({ style, color }) => {
  const dark = darken(color, 0.7);
  switch (style) {
    case "hood":
      return (
        <g>
          <path d="M74,320 Q56,110 200,92 Q344,110 326,320 Q308,170 200,164 Q92,170 74,320 Z" fill={color} />
          <path d="M74,320 Q62,364 88,378 Q82,340 92,308 Z" fill={dark} />
          <path d="M326,320 Q338,364 312,378 Q318,340 308,308 Z" fill={dark} />
        </g>
      );
    case "headscarf":
      return (
        <g>
          <path d="M92,170 Q88,34 200,26 Q312,34 308,170 Q308,250 250,276 Q248,220 200,214 Q152,220 150,276 Q92,250 92,170 Z" fill={color} />
          <path d="M150,276 Q174,318 200,362 Q226,318 250,276 Q224,296 200,296 Q176,296 150,276 Z" fill={dark} />
        </g>
      );
    case "bonnet":
      return <path d="M88,150 Q84,24 200,18 Q316,24 312,150 Q312,182 292,190 Q296,110 200,102 Q104,110 108,190 Q88,182 88,150 Z" fill={color} />;
    case "veil":
      return (
        <g>
          <path d="M88,110 Q92,20 200,16 Q308,20 312,110 L330,430 L70,430 Z" fill={color} opacity={0.4} />
          <path d="M88,110 Q92,20 200,16 Q308,20 312,110 Q302,62 200,56 Q98,62 88,110 Z" fill={color} opacity={0.9} />
        </g>
      );
    default:
      return null;
  }
};

/** The piece the viewer actually reads as a hat — kept clear of the face. */
export const Headwear: React.FC<HeadProps> = ({ style, color, accent }) => {
  const dark = darken(color, 0.7);
  switch (style) {
    case "cap":
      return (
        <g>
          <path d={`M108,${FACE_FLOOR} Q112,16 200,12 Q288,16 292,${FACE_FLOOR} Z`} fill={color} />
          <path d="M290,86 Q368,90 372,108 Q300,114 288,100 Z" fill={dark} />
          <circle cx={200} cy={16} r={9} fill={dark} />
        </g>
      );
    case "fedora":
      return (
        <g>
          <ellipse cx={200} cy={86} rx={150} ry={24} fill={color} />
          <path d="M124,86 Q124,10 200,6 Q276,10 276,86 Z" fill={color} />
          <path d="M160,8 Q200,32 240,8 Q200,22 160,8 Z" fill={dark} opacity={0.7} />
          <rect x={124} y={62} width={152} height={20} fill={accent} opacity={0.85} />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M108,100 Q106,14 200,8 Q294,14 292,100 Z" fill={color} />
          <rect x={102} y={62} width={196} height={30} rx={12} fill={dark} />
          <circle cx={200} cy={4} r={16} fill={dark} />
        </g>
      );
    case "hood":
      // only the rim: the drape is in the BACK layer, so the face stays open
      return <path d={`M78,150 Q62,44 200,32 Q338,44 322,150 Q306,84 200,78 Q94,84 78,150 Z`} fill={darken(color, 0.88)} />;
    case "headscarf":
      return <path d="M94,150 Q90,44 200,36 Q310,44 306,150 Q300,88 200,82 Q100,88 94,150 Z" fill={darken(color, 0.9)} />;
    case "bonnet":
      return (
        <g>
          <path d="M92,148 Q88,34 200,26 Q312,34 308,148 Q302,80 200,74 Q98,80 92,148 Z" fill={darken(color, 0.9)} />
          <ellipse cx={200} cy={74} rx={104} ry={26} fill={dark} opacity={0.3} />
          <path d="M108,178 Q104,254 134,274" fill="none" stroke={accent} strokeWidth={9} strokeLinecap="round" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M116,78 L116,24 L150,56 L182,10 L218,10 L250,56 L284,24 L284,78 Z" fill={color} />
          <rect x={112} y={72} width={176} height={24} rx={8} fill={darken(color, 0.86)} />
          {[150, 200, 250].map((x) => <circle key={x} cx={x} cy={84} r={8} fill={accent} />)}
        </g>
      );
    case "helmet":
      // a helmet FRAMES the face: dome above, cheek plates beside, noseguard
      // between the eyes. Nothing crosses them.
      return (
        <g>
          <path d="M102,120 Q100,26 200,20 Q300,26 298,120 Q298,86 200,80 Q102,86 102,120 Z" fill={color} />
          <rect x={193} y={96} width={14} height={116} rx={5} fill={darken(color, 0.78)} />
          <path d="M102,110 Q96,214 112,238 L140,238 Q120,206 124,110 Z" fill={darken(color, 0.86)} />
          <path d="M298,110 Q304,214 288,238 L260,238 Q280,206 276,110 Z" fill={darken(color, 0.86)} />
          <rect x={150} y={6} width={100} height={20} rx={9} fill={accent} />
        </g>
      );
    case "topHat":
      return (
        <g>
          <ellipse cx={200} cy={86} rx={148} ry={22} fill={color} />
          <rect x={132} y={-74} width={136} height={160} fill={color} />
          <ellipse cx={200} cy={-74} rx={68} ry={16} fill={darken(color, 0.82)} />
          <rect x={132} y={56} width={136} height={24} fill={accent} opacity={0.85} />
        </g>
      );
    case "beret":
      return (
        <g>
          <path d="M104,84 Q108,14 210,12 Q306,16 300,68 Q296,96 200,98 Q126,98 104,84 Z" fill={color} />
          <circle cx={296} cy={18} r={13} fill={dark} />
        </g>
      );
    case "veil":
      return null; // entirely a back-layer drape
    case "cowboy":
      return (
        <g>
          <path d="M40,88 Q120,46 200,52 Q280,46 360,88 Q280,120 200,116 Q120,120 40,88 Z" fill={color} />
          <path d="M132,84 Q128,2 200,-4 Q272,2 268,84 Z" fill={color} />
          <path d="M168,0 Q200,24 232,0 Q200,14 168,0 Z" fill={dark} opacity={0.6} />
          <rect x={132} y={58} width={136} height={20} fill={accent} opacity={0.85} />
        </g>
      );
    default:
      return null;
  }
};

// ── TORSO / GARMENT ─────────────────────────────────────────────────────────
// `full` closes the garment at the hip line so the legs read as attached; the
// bust plan runs it off the bottom of the box, exactly as it always did.
export const Torso: React.FC<{
  outfit: VariantSpec["outfit"]; suit: string; shirt: string; full?: boolean;
}> = ({ outfit, suit, shirt, full }) => {
  const dark = darken(suit, 0.82);
  const deep = darken(suit, 0.62);
  const base = full
    ? <path d="M78,610 L92,320 Q200,268 308,320 L322,610 Z" fill={suit} />
    : <path d="M60,600 L92,320 Q200,268 308,320 L340,600 Z" fill={suit} />;

  switch (outfit) {
    case "casual":
      return <g>{base}<path d="M166,298 Q200,332 234,298 L230,300 Q200,326 170,300 Z" fill={dark} /></g>;

    case "uniform":
      return (
        <g>
          {base}
          <path d="M168,300 L200,388 L232,300 Z" fill={shirt} />
          <rect x={196} y={300} width={8} height={150} fill={dark} />
          <circle cx={200} cy={356} r={5} fill={dark} />
          <circle cx={200} cy={402} r={5} fill={dark} />
          <rect x={250} y={314} width={56} height={14} rx={4} fill={dark} />
          <rect x={94} y={314} width={56} height={14} rx={4} fill={dark} />
        </g>
      );

    case "robe":
      return (
        <g>
          {base}
          <path d="M92,320 Q150,300 200,302 L200,600 L118,600 Z" fill={darken(suit, 0.9)} />
          <path d="M308,320 Q250,300 200,302 L200,600 L282,600 Z" fill={suit} />
          <path d="M200,302 L172,360 L200,418 L228,360 Z" fill={shirt} />
        </g>
      );

    // ── foundry garments ────────────────────────────────────────────────────
    case "coat":
      // long overcoat: wide lapels, a centre seam and two buttons. The 1920s /
      // Victorian / detective silhouette.
      return (
        <g>
          {base}
          <path d="M168,296 L200,404 L232,296 Z" fill={shirt} />
          <path d="M168,296 L134,352 L192,372 Z" fill={dark} />
          <path d="M232,296 L266,352 L208,372 Z" fill={dark} />
          <rect x={196} y={370} width={8} height={230} fill={deep} opacity={0.55} />
          <circle cx={176} cy={430} r={8} fill={deep} />
          <circle cx={176} cy={488} r={8} fill={deep} />
          <path d={full ? "M78,610 L322,610 L318,586 L82,586 Z" : "M60,600 L340,600 L336,576 L64,576 Z"} fill={deep} opacity={0.4} />
        </g>
      );

    case "dress":
      return (
        <g>
          {full
            ? <path d="M64,700 L92,320 Q200,268 308,320 L336,700 Z" fill={suit} />
            : <path d="M56,600 L92,320 Q200,268 308,320 L344,600 Z" fill={suit} />}
          <path d="M158,290 Q200,344 242,290 L238,294 Q200,336 162,294 Z" fill={dark} />
          <rect x={96} y={452} width={208} height={16} rx={7} fill={dark} opacity={0.55} transform="translate(0 0)" />
          <path d="M104,452 L296,452 L300,470 L100,470 Z" fill={shirt} opacity={0.5} />
        </g>
      );

    case "apron":
      return (
        <g>
          {base}
          <path d="M166,298 Q200,332 234,298 L230,300 Q200,326 170,300 Z" fill={dark} />
          <path d={full ? "M146,330 Q200,314 254,330 L268,610 L132,610 Z" : "M146,330 Q200,314 254,330 L272,600 L128,600 Z"} fill={shirt} opacity={0.9} />
          <path d="M168,306 L152,332 M232,306 L248,332" stroke={shirt} strokeWidth={12} strokeLinecap="round" />
          <rect x={168} y={430} width={64} height={54} rx={5} fill={darken(shirt, 0.86)} />
        </g>
      );

    case "armor":
      return (
        <g>
          {base}
          <path d="M104,324 Q200,282 296,324 L288,470 Q200,502 112,470 Z" fill={darken(suit, 0.92)} />
          <path d="M112,470 Q200,502 288,470 L282,560 Q200,588 118,560 Z" fill={suit} />
          <path d="M200,300 L200,560" stroke={deep} strokeWidth={7} />
          <ellipse cx={96} cy={330} rx={54} ry={38} fill={darken(suit, 0.86)} />
          <ellipse cx={304} cy={330} rx={54} ry={38} fill={darken(suit, 0.86)} />
          <path d="M172,352 L200,404 L228,352 Z" fill={shirt} opacity={0.8} />
        </g>
      );

    case "overalls":
      return (
        <g>
          {base}
          <path d="M92,320 Q200,268 308,320 L304,352 Q200,308 96,352 Z" fill={shirt} />
          <path d={full ? "M140,368 L260,368 L268,610 L132,610 Z" : "M140,368 L260,368 L272,600 L128,600 Z"} fill={darken(suit, 0.72)} />
          <path d="M148,368 L140,306 M252,368 L260,306" stroke={darken(suit, 0.72)} strokeWidth={20} strokeLinecap="round" />
          <rect x={168} y={392} width={64} height={52} rx={5} fill={darken(suit, 0.6)} />
          <circle cx={146} cy={368} r={8} fill={shirt} />
          <circle cx={254} cy={368} r={8} fill={shirt} />
        </g>
      );

    case "vest":
      return (
        <g>
          {base}
          <path d="M168,296 L200,420 L232,296 Z" fill={shirt} />
          <path d="M150,308 Q118,330 112,600 L184,600 L196,404 Z" fill={darken(suit, 0.72)} />
          <path d="M250,308 Q282,330 288,600 L216,600 L204,404 Z" fill={darken(suit, 0.72)} />
          <circle cx={196} cy={452} r={7} fill={deep} />
          <circle cx={196} cy={500} r={7} fill={deep} />
        </g>
      );

    case "cloak":
      return (
        <g>
          <path d={full ? "M40,640 Q68,352 200,290 Q332,352 360,640 Z" : "M32,620 Q64,348 200,286 Q336,348 368,620 Z"} fill={darken(suit, 0.88)} />
          {base}
          <path d="M104,314 Q200,272 296,314 Q200,346 104,314 Z" fill={shirt} opacity={0.55} />
          <circle cx={200} cy={306} r={16} fill={shirt} />
        </g>
      );

    case "hoodie":
      return (
        <g>
          {base}
          <path d="M112,300 Q200,262 288,300 Q276,352 200,362 Q124,352 112,300 Z" fill={darken(suit, 0.86)} />
          <path d="M144,436 L256,436 L262,506 L138,506 Z" fill={darken(suit, 0.9)} />
          <path d="M186,306 L186,364 M214,306 L214,364" stroke={shirt} strokeWidth={9} strokeLinecap="round" />
        </g>
      );

    case "rags":
      return (
        <g>
          {base}
          <path d={full ? "M78,610 L104,566 L134,606 L166,562 L198,604 L230,562 L262,606 L292,564 L322,610 Z" : "M60,600 L88,556 L120,598 L154,554 L188,596 L222,554 L256,598 L288,556 L340,600 Z"} fill={darken(suit, 0.66)} />
          <path d="M150,300 Q200,340 250,300 L244,306 Q200,336 156,306 Z" fill={darken(suit, 0.6)} />
          <path d="M244,380 L286,398 L266,436 Z" fill={darken(suit, 0.62)} opacity={0.8} />
          <path d="M118,436 L156,452 L128,486 Z" fill={darken(suit, 0.62)} opacity={0.8} />
        </g>
      );

    default: // suit
      return (
        <g>
          {base}
          <path d="M168,300 L200,392 L232,300 Z" fill={shirt} />
          <path d="M168,300 L150,336 L182,352 Z" fill={dark} />
          <path d="M232,300 L250,336 L218,352 Z" fill={dark} />
          <path d="M192,312 L208,312 L214,430 L200,452 L186,430 Z" fill={deep} />
        </g>
      );
  }
};

// ── ACCESSORY ───────────────────────────────────────────────────────────────
// Worn accents drawn OVER the finished garment.
export const Accessory: React.FC<{ style: VariantSpec["accessory"]; color: string; skin: string }> = ({ style, color, skin }) => {
  const dark = darken(color, 0.74);
  switch (style) {
    case "tie":
      return <path d="M190,308 L210,308 L216,424 L200,448 L184,424 Z" fill={color} />;
    case "bowtie":
      return (
        <g fill={color}>
          <path d="M200,318 L156,296 L156,346 Z" />
          <path d="M200,318 L244,296 L244,346 Z" />
          <rect x={188} y={306} width={24} height={26} rx={7} fill={dark} />
        </g>
      );
    case "scarf":
      return (
        <g>
          <path d="M136,304 Q200,352 264,304 Q272,340 200,376 Q128,340 136,304 Z" fill={color} />
          <path d="M232,362 L268,368 L256,468 L222,458 Z" fill={dark} />
        </g>
      );
    case "necklace":
      return (
        <g>
          <path d="M162,300 Q200,354 238,300" fill="none" stroke={color} strokeWidth={7} />
          <circle cx={200} cy={352} r={13} fill={color} />
        </g>
      );
    case "badge":
      return (
        <g>
          <path d="M262,352 L288,340 L306,362 L292,388 L264,384 Z" fill={color} />
          <circle cx={282} cy={364} r={7} fill={dark} />
        </g>
      );
    case "satchel":
      return (
        <g>
          <path d="M110,306 L296,470 L272,500 L88,338 Z" fill={color} opacity={0.92} />
          <rect x={236} y={456} width={110} height={86} rx={10} fill={dark} />
          <rect x={236} y={478} width={110} height={16} fill={darken(color, 0.55)} />
        </g>
      );
    case "suspenders":
      return (
        <g stroke={color} strokeWidth={17} fill="none">
          <path d="M150,304 L164,600" />
          <path d="M250,304 L236,600" />
        </g>
      );
    case "collar":
      return (
        <g>
          <path d="M148,296 Q200,338 252,296 Q252,320 200,352 Q148,320 148,296 Z" fill="#FFFFFF" />
          <path d="M148,296 Q200,338 252,296" fill="none" stroke={darken("#FFFFFF", 0.86)} strokeWidth={4} />
        </g>
      );
    default:
      return null;
  }
};
