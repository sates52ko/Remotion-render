import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Beat, VImage } from "./schema";
import { INK, RED, PAPER, HEADLINE, SERIF, hash } from "./palette";
import { AccentBurst } from "./backgrounds";
import { Scene, KineticWords, MarkerUnderline, KickerChip, Cutout, HalftoneCard, beatAnchors } from "./shared";
import { Annotated } from "./annotations";

/**
 * scenes-narrative.tsx — the archetypes a BOOK needs.
 *
 * Measured across shipped configs, 88% of beats resolved to `imagefocus` or
 * `statement`: the same two frames for forty minutes, which is the repetition
 * the reference channels never have and which YPP reads as mass production.
 *
 * These five cover shapes a book actually makes — a question, a chronology, a
 * place, a pair of people, a turn — so the planner has somewhere else to go.
 * All are 2D DOM/SVG driven by data the beat already carries; only `duo` needs
 * images, and it reuses `compare`'s two-image staging. Nothing here touches
 * WebGL (see SKILL §4, the GPU-less constraint).
 *
 * Every one of them reveals on the beat's own `anchors` (SKILL §9.3b), so they
 * advance WITH the narration rather than appearing whole and then holding.
 */

/**
 * QuestionScene — the open loop.
 *
 * A beat phrased as a question is the cheapest retention device there is, and
 * it used to render as just another statement. Here it owns the frame: an
 * oversized serif mark, the phrase, and a marker loop thrown around it on a
 * late pulse.
 */
const QuestionMark: React.FC<{ startFrame: number; seed: number }> = ({ startFrame, seed }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - startFrame, fps, config: { damping: 11, mass: 0.7, stiffness: 170 }, durationInFrames: 24 });
  // settles at a slight tilt, then keeps a slow living drift so it never freezes
  const tilt = interpolate(s, [0, 1], [-16, -4]) + Math.sin(frame / 58 + seed * 6) * 1.6;
  return (
    <span
      aria-hidden
      style={{
        fontFamily: SERIF, fontWeight: 700, fontSize: 300, lineHeight: 0.72, color: RED,
        opacity: interpolate(s, [0, 1], [0, 0.9]),
        transform: `translateY(${interpolate(s, [0, 1], [-60, 0])}px) rotate(${tilt}deg)`,
      }}
    >
      ?
    </span>
  );
};

export const QuestionScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const seed = hash(beat.id);
  const phrase = (beat.props.emphasis.length ? beat.props.emphasis : beat.props.keywords.map((k) => k.toUpperCase())).slice(0, 3).join(" ");
  const at = beatAnchors(beat, 2, 12, 20);
  const size = phrase.length > 22 ? 92 : 126;
  return (
    <Scene beat={beat} accent={false}>
      <AccentBurst seed={seed} x={50} y={44} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, zIndex: 12 }}>
        <QuestionMark startFrame={2} seed={seed} />
        <Annotated text={phrase} size={size} maxWidth={1420} kind="circle" seed={seed} startFrame={at[1]}>
          <KineticWords text={phrase} startFrame={at[0]} perWord={4} fontSize={size} color={INK} maxWidth={1420} />
        </Annotated>
      </div>
    </Scene>
  );
};

/**
 * TimelineScene — chronology, which memoirs and novels are made of.
 *
 * Nodes light up one after another on the beat's own anchors, so the rail
 * advances with the narration instead of appearing whole.
 */
export const TimelineScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const nodes = (beat.props.items?.length ? beat.props.items : beat.props.emphasis).slice(0, 4);
  const at = beatAnchors(beat, Math.max(2, nodes.length), 14, 16);
  const RAIL = 1420;
  const nodeAt = (i: number) => at[Math.min(i, at.length - 1)];
  const drawn = interpolate(frame, [at[0], nodeAt(nodes.length - 1) + 20], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease),
  });
  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40, zIndex: 12 }}>
        <KickerChip text={beat.props.kicker || "THE SEQUENCE"} startFrame={2} align="center" />
        <div style={{ position: "relative", width: RAIL, height: 190 }}>
          <div style={{ position: "absolute", left: 0, top: 92, height: 8, width: RAIL, background: INK, opacity: 0.12 }} />
          <div style={{ position: "absolute", left: 0, top: 92, height: 8, width: RAIL * drawn, background: RED }} />
          {nodes.map((label, i) => {
            const x = nodes.length === 1 ? RAIL / 2 : (i / (nodes.length - 1)) * (RAIL - 60) + 30;
            const pop = interpolate(frame, [nodeAt(i), nodeAt(i) + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ position: "absolute", left: x, top: 96, transform: "translate(-50%, -50%)" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: pop > 0.5 ? RED : PAPER, border: `7px solid ${INK}`, transform: `scale(${0.7 + pop * 0.3})` }} />
                <span style={{ position: "absolute", left: "50%", top: 46, transform: "translateX(-50%)", fontFamily: HEADLINE, fontWeight: 900, fontSize: 40, color: INK, textTransform: "uppercase", whiteSpace: "nowrap", opacity: pop }}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Scene>
  );
};

/**
 * PlaceScene — the setting beat.
 *
 * Books live somewhere, and a place deserves more than another portrait. The
 * map is procedural (seeded contour rings that draw themselves in), so a place
 * beat costs no Flux image and can never come back CONTENT_FILTERED.
 */
export const PlaceScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const name = (beat.props.emphasis[0] || beat.props.keywords[0] || "").toUpperCase();
  // Only the kicker may sit under a place name. emphasis[1] is whatever the
  // phrase extractor picked second and is often a PERSON ("RUBY RIDGE / RANDY"),
  // which reads as if the map were labelled with someone's name.
  const sub = String(beat.props.kicker || "").toUpperCase();
  const at = beatAnchors(beat, 2, 20, 22);
  const drop = spring({ frame: frame - at[0], fps, config: { damping: 10, mass: 0.5, stiffness: 190 }, durationInFrames: 22 });
  return (
    <Scene beat={beat} accent={false}>
      <svg width={1500} height={760} viewBox="0 0 1500 760" style={{ position: "absolute", zIndex: 8 }} aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => {
          const p = interpolate(frame, [6 + i * 4, 32 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          const rx = 180 + i * 118 + hash(beat.id + i) * 40;
          const ry = 120 + i * 74 + hash(beat.id + "r" + i) * 26;
          const C = Math.PI * (rx + ry); // Ramanujan is overkill for a dash length
          return (
            <ellipse
              key={i} cx={750} cy={380} rx={rx} ry={ry}
              fill="none" stroke={INK} strokeWidth={3} opacity={0.32 - i * 0.045}
              strokeDasharray={C} strokeDashoffset={C * (1 - p)}
              transform={`rotate(${(hash(beat.id + "t" + i) - 0.5) * 14} 750 380)`}
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, zIndex: 12 }}>
        <div style={{ transform: `translateY(${interpolate(drop, [0, 1], [-160, 0])}px)`, opacity: Math.min(1, drop * 1.6) }}>
          <svg width={86} height={112} viewBox="0 0 86 112" aria-hidden>
            <path d="M43 4C22 4 6 20 6 41c0 27 30 60 37 67 7-7 37-40 37-67C80 20 64 4 43 4Z" fill={RED} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
            <circle cx={43} cy={40} r={13} fill={PAPER} />
          </svg>
        </div>
        <KineticWords text={name} startFrame={at[0] + 6} perWord={3} fontSize={124} color={INK} />
        {sub ? <KineticWords text={sub} startFrame={at[1]} perWord={3} fontSize={44} color={RED} letterSpacing={5} /> : null}
        <MarkerUnderline startFrame={at[1] + 8} width={Math.min(720, Math.max(160, name.length * 56))} height={14} />
      </div>
    </Scene>
  );
};

/**
 * DuoScene — two people and the thing between them.
 *
 * `compare` already covers OPPOSITION (X vs Y). Novels mostly need the other
 * relation: X *and* Y. Same two-image staging, but the connector is a drawn
 * line carrying the relationship word rather than a VS.
 */
export const DuoScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const [la, lb] = beat.props.compareLabels || beat.props.emphasis;
  const link = (beat.props.kicker || "AND").toUpperCase();
  const at = beatAnchors(beat, 3, 6, 24);
  const tie = interpolate(frame, [at[2], at[2] + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const side = (img: VImage | undefined, label: string | undefined, sf: number, flip: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {img ? (img.style === "cutout" && img.cut
        ? <Cutout asset={img.cut} startFrame={sf} height={470} strokeX={flip ? 22 : -22} />
        : <HalftoneCard asset={img.path} startFrame={sf} width={430} height={400} />) : null}
      <KineticWords text={label || ""} startFrame={sf + 12} perWord={2} fontSize={50} weight={900} letterSpacing={1} />
    </div>
  );
  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 30, zIndex: 12 }}>
        {side(beat.images[0], la, at[0], false)}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingBottom: 120 }}>
          <div style={{ width: 170 * tie, height: 7, background: RED }} />
          <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 38, color: INK, letterSpacing: 3, opacity: tie }}>{link}</span>
        </div>
        {side(beat.images[1], lb, at[1], true)}
      </div>
    </Scene>
  );
};

/**
 * RevealScene — the turn.
 *
 * The phrase is wiped in behind a moving marker edge rather than sprung in word
 * by word, which lands a reversal ("she never came back") harder than the shared
 * kinetic entrance and gives a run of statements somewhere else to go.
 */
export const RevealScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const words = (beat.props.emphasis.length ? beat.props.emphasis : beat.props.keywords.map((k) => k.toUpperCase())).slice(0, 2);
  const at = beatAnchors(beat, words.length, 10, 20);
  const size = words.join(" ").length > 20 ? 108 : 142;
  return (
    <Scene beat={beat} accent={false}>
      <AccentBurst seed={hash(beat.id)} x={44} y={48} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14, zIndex: 12, maxWidth: 1500 }}>
        <KickerChip text={beat.props.kicker || ""} startFrame={2} />
        {words.map((w, i) => {
          const p = interpolate(frame, [at[i], at[i] + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          return (
            <div key={i} style={{ position: "relative" }}>
              <div style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>
                <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: size, lineHeight: 1.02, color: i === words.length - 1 ? RED : INK, textTransform: "uppercase", whiteSpace: "pre" }}>{w}</span>
              </div>
              {/* the marker edge rides the reveal front and leaves with it */}
              {p > 0 && p < 1 ? (
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${p * 100}% - 9px)`, width: 9, background: RED }} />
              ) : null}
            </div>
          );
        })}
      </div>
    </Scene>
  );
};
