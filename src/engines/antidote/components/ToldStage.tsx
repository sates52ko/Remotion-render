import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import { ANTIDOTE_FONT } from "./KineticText";
import { Everyman } from "../characters/Everyman";
import { pose } from "../movements";
import { actPose, ACT_POSES, type ToldAct } from "../toldActs";
import { voiceAt, type Speech } from "../speech";
import { DEFAULT_VARIANT } from "../schema";
import type { VariantSpec, CharAction, HandProp } from "../schema";
import { useSkin, plateStyle } from "./skin";
import { toldState, itemState, backdropOpacity, backdropFit, backdropScene, standsOn, spotsOf, SPOT_REACH, plateW, type ToldItem, type ToldSpec } from "../told";

/** How strongly a place is drawn behind the stage: a quarter — there, and never louder than what stands in it. */
const BACKDROP_OPACITY = 0.26;
/**
 * told v5 — THE PLACE IS A SCENE (Film Flow 7, 2026-11-21). Until v4 a told stage read as a labelled diagram: the
 * book's place a pale one-tone wash, the cast floating in front of it on the paper. The first trial (opacity 0.62, a
 * ground line at the lowest feet, shadows under every figure) only made the stage dark: the ink silhouettes swallowed
 * the title, the black name plates and the black-clad Count, and the ground ran under a figure walking at mid-stage.
 * A place cannot be made real by opacity; it has to be DRAWN as a scene. So a backdrop drawn with a `sky` (light — the
 * titles and name plates are read over it) and a `ground` is drawn at FULL presence on a v5 stage: the sky behind the
 * whole stage, the paths as drawn, the ground band from the backdrop's bottom edge (told.ts backdropScene) to the
 * bottom of the frame, and a contact shadow only under a figure whose feet are on that ground (told.ts standsOn).
 * Nothing moves: the ground is the place's, fixed. A backdrop without `sky` is the pale wash — on a v5 stage too —
 * and a v ≤ 4 stage is drawn exactly as before.
 */
const SHADOW_FILL = "rgba(20,15,12,0.22)", FAR = 2400; // the sky / ground rects reach beyond any camera push

/**
 * ToldStage — THE PICTURE SHOWS WHAT IS SAID (Film Flow level 2, pilot 2026-11-12).
 *
 * The operator's finding on real films: the narration says "Microsoft … Google … Windows versus Chrome OS" and the
 * screen shows a street and two unrelated people. Measured: a scene that names a company, product or person shows it
 * in 19–37 % of cases. This stage is drawn from the THINGS THE NARRATION NAMES: each one is an emblem (its name in its
 * own colour, with a plain glyph for what it is — never a copied logo), and what the narration says happens to them
 * happens on screen, on the word: they face each other, move apart, collide, line their products up against each
 * other, turn out to be the same house.
 *
 * A scene carries `told: ToldSpec`; it is drawn only when the film's flow level is ≥ 2 (flow.ts), in place of the
 * figure-and-text staging. Every item is a pure function of the frame: a start state, `enter`, `keys` that LAND on a
 * frame (the frame of the word), `exit`. No loops: nothing moves unless the narration gives it a reason.
 */

export type { ToldKey, ToldItem, ToldSpec } from "../told";

const FONT = ANTIDOTE_FONT; // the film's own typeface (loaded once by KineticText)
const textW = (s: string, size: number) => s.length * size * 0.62;

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Plain glyphs for WHAT a named thing is — a screen, a lens, a page — never a company's own mark. Exported so the
 *  compiler and the authoring rules offer exactly the glyphs that can be drawn (scripts/lib/told-compile.js GLYPHS). */
export const TOLD_GLYPHS = ["monitor", "search", "doc", "browser", "building", "book", "coin", "globe", "gear", "phone", "chart", "star", "heart", "flag", "cart", "people", "bolt", "leaf"] as const;

const Glyph: React.FC<{ kind: ToldItem["glyph"] }> = ({ kind }) => {
  const w = "#FFFFFF";
  const line = { fill: "none", stroke: w, strokeWidth: 12, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "monitor": return (<g><rect x={-62} y={-52} width={124} height={84} rx={8} fill="none" stroke={w} strokeWidth={12} /><rect x={-10} y={36} width={20} height={20} fill={w} /><rect x={-40} y={54} width={80} height={12} rx={6} fill={w} /></g>);
    case "search": return (<g><circle cx={-12} cy={-12} r={40} fill="none" stroke={w} strokeWidth={13} /><line x1={18} y1={18} x2={56} y2={56} stroke={w} strokeWidth={16} strokeLinecap="round" /></g>);
    case "doc": return (<g><rect x={-44} y={-58} width={88} height={116} rx={8} fill="none" stroke={w} strokeWidth={11} />{[-28, -4, 20].map((y) => <line key={y} x1={-24} y1={y} x2={24} y2={y} stroke={w} strokeWidth={9} strokeLinecap="round" />)}</g>);
    case "browser": return (<g><rect x={-64} y={-50} width={128} height={100} rx={10} fill="none" stroke={w} strokeWidth={11} /><line x1={-64} y1={-22} x2={64} y2={-22} stroke={w} strokeWidth={9} /><circle cx={-44} cy={-36} r={5} fill={w} /><circle cx={-28} cy={-36} r={5} fill={w} /></g>);
    case "building": return (<g><rect x={-46} y={-60} width={92} height={120} rx={6} {...line} />{[-36, -8, 20].map((y) => [-20, 20].map((x) => <rect key={`${x}${y}`} x={x - 9} y={y} width={18} height={16} fill={w} />))}</g>);
    case "book": return (<g><path d="M0 -44 C-24 -58 -52 -58 -66 -48 V48 C-52 38 -24 38 0 52 C24 38 52 38 66 48 V-48 C52 -58 24 -58 0 -44 Z" {...line} /><line x1={0} y1={-44} x2={0} y2={52} {...line} /></g>);
    case "coin": return (<g><circle r={56} {...line} /><text x={0} y={24} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={70} fill={w}>$</text></g>);
    case "globe": return (<g><circle r={58} {...line} /><ellipse rx={26} ry={58} {...line} /><line x1={-58} y1={0} x2={58} y2={0} {...line} /></g>);
    case "gear": return (<g><circle r={30} {...line} />{Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return <line key={i} x1={Math.cos(a) * 40} y1={Math.sin(a) * 40} x2={Math.cos(a) * 60} y2={Math.sin(a) * 60} {...line} strokeWidth={16} />; })}</g>);
    case "phone": return (<g><rect x={-34} y={-62} width={68} height={124} rx={12} {...line} /><circle cx={0} cy={42} r={6} fill={w} /></g>);
    case "chart": return (<g><polyline points="-60,44 -22,6 8,26 58,-40" {...line} /><polyline points="30,-42 58,-40 56,-12" {...line} /><line x1={-64} y1={60} x2={64} y2={60} {...line} /></g>);
    case "star": return <polygon points={Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 26 : 62; return `${Math.cos(a) * r},${Math.sin(a) * r}`; }).join(" ")} fill={w} />;
    case "heart": return <path d="M0 52 C-70 6 -62 -52 -28 -52 C-12 -52 -2 -42 0 -30 C2 -42 12 -52 28 -52 C62 -52 70 6 0 52 Z" fill={w} />;
    case "flag": return (<g><line x1={-40} y1={-62} x2={-40} y2={62} {...line} /><path d="M-40 -56 H48 L28 -30 L48 -4 H-40 Z" fill={w} /></g>);
    case "cart": return (<g><polyline points="-66,-46 -44,-46 -28,22 44,22 58,-22 -38,-22" {...line} /><circle cx={-18} cy={46} r={10} fill={w} /><circle cx={36} cy={46} r={10} fill={w} /></g>);
    case "people": return (<g><circle cx={-30} cy={-26} r={20} fill={w} /><circle cx={30} cy={-26} r={20} fill={w} /><path d="M-64 54 C-64 14 4 14 4 54 Z" fill={w} /><path d="M-4 54 C-4 14 64 14 64 54 Z" fill={w} /></g>);
    case "bolt": return <polygon points="10,-64 -40,8 -6,8 -14,64 40,-10 4,-10" fill={w} />;
    case "leaf": return (<g><path d="M-50 50 C-50 -30 10 -60 56 -56 C60 -8 30 50 -50 50 Z" {...line} /><line x1={-50} y1={50} x2={20} y2={-20} {...line} /></g>);
    default: return null;
  }
};

const Draw: React.FC<{ it: ToldItem; frame: number }> = ({ it, frame }) => {
  const ink = it.ink ?? "#1E1E22", color = it.color ?? "#D9603C";
  switch (it.kind) {
    case "emblem": {
      const size = it.size ?? 56, lw = textW(it.label ?? "", size);
      return (<g>
        <rect x={-112} y={-136} width={240} height={240} rx={40} fill={ink} opacity={0.18} />
        <rect x={-120} y={-150} width={240} height={240} rx={40} fill={color} />
        <g transform="translate(0,-30)"><Glyph kind={it.glyph ?? "none"} /></g>
        {/* no glyph, or one this engine cannot draw: the first letter of the name */}
        {!it.glyph || !(TOLD_GLYPHS as readonly string[]).includes(it.glyph) ? <text x={0} y={-8} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={96} fill="#fff">{(it.label ?? "?")[0]}</text> : null}
        <rect x={-lw / 2 - 22} y={112} width={lw + 44} height={size + 26} rx={12} fill={ink} />
        <text x={0} y={112 + size + 2} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={size} fill="#fff" letterSpacing={1}>{it.label}</text>
        {it.sub ? <text x={0} y={112 + size + 62} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={30} fill={ink}>{it.sub}</text> : null}
      </g>);
    }
    case "tile": {
      const size = it.size ?? 40, w = textW(it.label ?? "", size) + 118, h = size + 44; // room for the dot before the name
      return (<g>
        <rect x={-w / 2 + 6} y={-h / 2 + 8} width={w} height={h} rx={h / 2} fill={ink} opacity={0.16} />
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="#fff" stroke={color} strokeWidth={7} />
        <circle cx={-w / 2 + 34} cy={0} r={11} fill={color} />
        <text x={22} y={size * 0.36} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={size} fill={ink}>{it.label}</text>
      </g>);
    }
    case "word": {
      const size = it.size ?? 84, w = textW(it.label ?? "", size);
      return (<g>
        {it.box ? <rect x={-w / 2 - 26} y={-size * 0.82} width={w + 52} height={size * 1.2} rx={10} fill={it.box} /> : null}
        <text x={0} y={0} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={size} fill={it.box ? "#fff" : ink} letterSpacing={1}>{it.label}</text>
      </g>);
    }
    case "planet": return (<g><circle r={it.size ?? 300} fill={color} opacity={0.16} /><circle r={(it.size ?? 300) * 0.72} fill={color} opacity={0.14} /><ellipse rx={(it.size ?? 300) * 1.18} ry={(it.size ?? 300) * 0.24} fill="none" stroke={color} strokeWidth={6} opacity={0.4} transform="rotate(-14)" /></g>);
    case "house": {
      const w = it.w ?? 380, h = it.h ?? 300;
      return (<g>
        <polygon points={`${-w / 2 - 34},${-h} 0,${-h - 170} ${w / 2 + 34},${-h}`} fill={color} />
        <rect x={-w / 2} y={-h} width={w} height={h} fill={color} opacity={0.82} />
        <rect x={-44} y={-150} width={88} height={150} rx={6} fill={ink} opacity={0.7} />
        {[-1, 1].map((d) => <rect key={d} x={d * (w / 2 - 92) - 34} y={-h + 46} width={68} height={68} rx={6} fill="#fff" opacity={0.85} />)}
        {it.label ? <text x={0} y={46} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={34} fill={ink}>{it.label}</text> : null}
      </g>);
    }
    case "coin": return (<g><circle r={30} fill="#E8B93C" stroke="#B88A1E" strokeWidth={6} /><text x={0} y={13} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={36} fill="#7A5A10">$</text></g>);
    case "burst": {
      const pts = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2, r = i % 2 ? 70 : 150; return `${Math.cos(a) * r},${Math.sin(a) * r}`; }).join(" ");
      return <polygon points={pts} fill={color} stroke={ink} strokeWidth={8} strokeLinejoin="round" />;
    }
    case "dash": {
      const k = clamp((frame - (it.drawFrom ?? 0)) / Math.max(1, (it.drawTo ?? 20) - (it.drawFrom ?? 0)));
      return <line x1={0} y1={0} x2={((it.x2 ?? it.x) - it.x) * k} y2={((it.y2 ?? it.y) - it.y) * k} stroke={ink} strokeWidth={8} strokeDasharray="26 22" strokeLinecap="round" opacity={0.6} />;
    }
    case "cross": return (<g stroke={color} strokeWidth={22} strokeLinecap="round"><line x1={-44} y1={-44} x2={44} y2={44} /><line x1={44} y1={-44} x2={-44} y2={44} /></g>);
    case "crown": return <polygon points="-70,36 -84,-40 -38,-2 0,-58 38,-2 84,-40 70,36" fill="#E8B93C" stroke="#B88A1E" strokeWidth={7} strokeLinejoin="round" />;
    case "panel": return <rect x={-(it.w ?? 980) / 2} y={-(it.h ?? 1100) / 2} width={it.w ?? 980} height={it.h ?? 1100} fill={color} />;
    case "bar": return <rect x={-(it.w ?? 250) / 2} y={-(it.h ?? 56) / 2} width={it.w ?? 250} height={it.h ?? 56} rx={10} fill={ink} />;
    case "arrow": return (<g stroke={ink} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.75}><line x1={-60} y1={0} x2={60} y2={0} /><polyline points="30,-30 60,0 30,30" /></g>);
    default: return null;
  }
};

/** A name plate: over a person's head, under a thing. Drawn in the stage's own SVG. */
const Tag: React.FC<{ label: string; size?: number; y: number; fit?: boolean }> = ({ label, size = 38, y, fit = false }) => {
  // THE BOOK'S SKIN (skin.tsx): how a name plate is CUT — its size and place are the stage's, never the skin's
  const { skin, accent } = useSkin();
  const cut = plateStyle(skin, accent);
  // `fit` (a v2 stage): the plate is as wide as its name really is (told.ts plateW); a v1 stage keeps its plate
  const w = fit ? plateW(label, size) : textW(label, size) + 40;
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={0} width={w} height={size + 22} rx={cut.rx} fill={cut.fill} stroke={cut.stroke} strokeWidth={cut.stroke ? 4 : undefined} />
      <text x={0} y={size + 2} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={size} fill={cut.ink} letterSpacing={1}>{label}</text>
    </g>
  );
};

/**
 * The stage: ONE SVG. An emblem, a rigged PERSON (any age, any dress — the engine's own Everyman, itself one SVG), and a
 * book's OWN drawing of an animal or an object (paths) share one drawing, one camera and one clock.
 *
 * Why one SVG (2026-11-13): the first figure-capable version gave every item its own HTML box with a CSS transform and
 * a 1×1 `overflow: visible` SVG inside. Chromium composited those as layers with the wrong bounds: rectangular tiles of
 * stale picture (a square of the spotlight, half a figure twice, the grid over the subtitles) that changed from frame
 * to frame — the operator saw the picture tremble. Inside a single SVG there are no layers to get wrong.
 * `absBase` = the film frame of this stage's frame 0, so a figure that talks moves its mouth on the narration.
 */
export const ToldStage: React.FC<{ spec: ToldSpec; absBase?: number; speech?: Speech | null }> = ({ spec, absBase = 0, speech = null }) => {
  const frame = useCurrentFrame();
  const cam = toldState({ x: 960, y: 540, s: 1, o: 1, r: 0 }, spec.cam, frame);
  const voice = speech ? voiceAt(speech, absBase + frame) : undefined;
  // told v2 — THE PLACE BEHIND THE STAGE: the book's drawing of where this happens, pale (the things, their names, the
  // title and the subtitles are read over it), inside the title band and the subtitle band, in the same SVG and under
  // the same camera as the things. Where a place stands the plain grid steps back. A v1 stage has no backdrop.
  const fit = (spec.v ?? 1) >= 2 && spec.plate === "fit"; // name plates as wide as their names (a told-v2 book)
  const places = (spec.v ?? 1) >= 2 ? (spec.backdrops ?? []).map((b) => ({ b, o: backdropOpacity(b, frame) })).filter((p) => p.o > 0.001) : [];
  const placed = places.reduce((m, p) => Math.max(m, p.o), 0);
  // told v5 — a backdrop drawn as a SCENE (sky + ground): read only on a v5 stage; the wash otherwise
  const scenes = (spec.v ?? 1) >= 5 ? places.map((p) => ({ ...p, sc: backdropScene(p.b) })).filter((p) => p.sc) : [];
  return (
    <AbsoluteFill style={{ backgroundColor: spec.bg ?? "#F2F0EA" }}>
      <svg viewBox="0 0 1920 1080" width="100%" height="100%">
        {spec.grid !== false ? (
          <g opacity={0.5 * (1 - placed)}>
            {Array.from({ length: 17 }, (_, i) => <line key={`v${i}`} x1={i * 120} y1={0} x2={i * 120} y2={1080} stroke="#E2DFD6" strokeWidth={2} />)}
            {Array.from({ length: 10 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 120} x2={1920} y2={i * 120} stroke="#E2DFD6" strokeWidth={2} />)}
          </g>
        ) : null}
        {/* the camera looks AT a point (cam.x, cam.y) with a zoom: a push-in on the thing being talked about */}
        <g transform={`translate(960 540) scale(${cam.s}) translate(${-cam.x} ${-cam.y})`}>
          {/* v5: the sky and the ground of a scene backdrop, under its paths; they fade with it */}
          {scenes.map(({ b, o, sc }) => (
            <g key={`sky-${b.id}`} opacity={o}>
              <rect x={-FAR} y={-FAR} width={1920 + 2 * FAR} height={sc!.groundTop + FAR} fill={sc!.sky} />
              <rect x={-FAR} y={sc!.groundTop} width={1920 + 2 * FAR} height={1080 - sc!.groundTop + FAR} fill={sc!.ground} />
            </g>
          ))}
          {places.map(({ b, o }) => {
            if (b.image) {
              return (
                <g key={`img-${b.id}`} opacity={o}>
                  <image href={staticFile(b.image)} x={0} y={0} width={1920} height={1080} preserveAspectRatio="xMidYMid slice" />
                  {(b.dim ?? 0) > 0 ? <rect x={0} y={0} width={1920} height={1080} fill={`rgba(10,12,18,${b.dim})`} /> : null}
                </g>
              );
            }
            const fit = backdropFit(b);
            const asScene = scenes.some((p) => p.b === b); // drawn as itself, not as a wash
            return (
              <g key={`at-${b.id}`} opacity={(asScene ? 1 : BACKDROP_OPACITY) * o} transform={`translate(${fit.x} ${fit.y}) scale(${fit.k})`}>
                {b.paths.map((pa, k) => <path key={k} d={pa.d} fill={pa.fill ?? "none"} stroke={pa.stroke ?? (pa.fill ? "none" : "#1E1E22")} strokeWidth={pa.strokeWidth ?? (pa.fill ? 0 : 7)} strokeLinecap="round" strokeLinejoin="round" opacity={pa.opacity ?? 1} />)}
              </g>
            );
          })}
          {/* v5 + hybrid: a contact shadow under a figure that STANDS on the scene's ground */}
          {(scenes.length || places.some((p) => p.b.groundTop != null)) ? spec.items.filter((it) => it.kind === "figure" && !it.screen).map((it) => {
            const st = itemState(it, frame);
            if (!st || st.o <= 0.001) return null;
            const onScene = scenes.filter((p) => standsOn(st.y, p.sc!.groundTop) || spotsOf(p.b).some((q) => Math.abs(q.y - st.y) < SPOT_REACH)).reduce((m, p) => Math.max(m, p.o), 0);
            const onImg = places.filter((p) => p.b.groundTop != null && Math.abs(st.y - p.b.groundTop!) <= 64).reduce((m, p) => Math.max(m, p.o), 0);
            const on = Math.max(onScene, onImg);
            if (on <= 0.001) return null;
            const w = (it.w ?? 300) * st.s;
            return <ellipse key={`sh-${it.id}`} cx={st.x} cy={st.y + 2} rx={w * 0.34} ry={Math.max(8, w * 0.045)} fill={SHADOW_FILL} opacity={st.o * on} />;
          }) : null}
          {spec.items.filter((it) => !it.screen).map((it) => {
            const st = itemState(it, frame);
            if (!st || st.o <= 0.001) return null;
            if (it.kind === "figure") {
              // a PERSON: who the narration names, at the age and in the dress the book gives them; feet at (x, y)
              const w = it.w ?? 300, full = it.body === "full", h = w * (full ? 2.25 : 1.5);
              const v = { ...DEFAULT_VARIANT, ...(it.variant || {}) } as VariantSpec;
              if ((spec.v ?? 1) < 4) delete (v as { drawn?: unknown }).drawn; // a head drawn for the book: told v4
              const action = (it.action ?? "idle") as CharAction;
              const seed = it.id.length * 7 + Math.round(it.x);
              // THE POSE CLOCK never restarts at a cut. A figure already on stage when the scene starts (no `enter`) has
              // finished its gesture (settled) or — standing — runs on the film's own clock, so a blink carries over the
              // cut; only a figure that enters here plays its gesture from the start. Each figure blinks on its own clock
              // (five people blinking on one frame is a flicker), and stands STILL unless it is given something to do:
              // only one that talks hears the narration (movements.ts Live.calm).
              const local = it.enter ? Math.max(0, frame - (it.enter.at - (it.enter.dur ?? 12))) : (action === "idle" || action === "talk" ? absBase + frame : frame + 100000) + (seed % 89) * 3;
              const base = pose(action, local, 30, it.cue ?? 24, "lead", { voice: action === "talk" ? voice : undefined, seed, calm: true });
              // told v3 — THE PERSON PLAYS THE VERB: the verb's pose (a preparation, a moment ON the narrator's word, a
              // rest; nothing loops) laid over the calm standing figure. Only a v3 stage carries `act`.
              const acting = (spec.v ?? 1) >= 3 && it.act && (ACT_POSES as readonly string[]).includes(it.act.verb) ? (it.act as ToldAct) : null;
              const p = acting ? ({ ...base, ...actPose(acting, frame) } as typeof base) : base;
              const headTop = h * (1 - Math.min(1, v.height ?? 1)) * 0.9;
              return (
                <g key={it.id} transform={`translate(${st.x} ${st.y}) rotate(${st.r}) scale(${st.s})`} opacity={st.o}>
                  <g transform={`translate(${it.flip ? w / 2 : -w / 2} ${-h}) scale(${it.flip ? -1 : 1} 1)`}>
                    <Everyman variant={v} pose={p} width={w} body={full ? "full" : "bust"} holds={it.holds as HandProp | undefined} />
                  </g>
                  {it.label ? (() => {
                    const size = it.size ?? 38, py = -h + headTop - size - 34 + ((spec.v ?? 1) >= 3 ? it.labelDy ?? 0 : 0);
                    // v5 (slice 2): a person already introduced in an earlier beat (`known`) carries a RECEDED plate —
                    // smaller and lighter around its own centre; the full plate stands where a person first appears
                    const recede = (spec.v ?? 1) >= 5 && it.known;
                    const cy = py + (size + 22) / 2;
                    return recede ? <g opacity={0.72} transform={`translate(0 ${cy}) scale(0.8) translate(0 ${-cy})`}><Tag label={it.label} size={size} y={py} fit={fit} /></g> : <Tag label={it.label} size={size} y={py} fit={fit} />;
                  })() : null}
                </g>
              );
            }
            if (it.kind === "cutout" && it.image) {
              const w = it.w ?? 320;
              const h = it.h ?? w;
              return (
                <g key={it.id} transform={`translate(${st.x} ${st.y}) rotate(${st.r}) scale(${st.s})`} opacity={st.o}>
                  <image href={staticFile(it.image)} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
                  {it.label ? <Tag label={it.label} size={it.size ?? 38} y={h / 2 + 8} fit={fit} /> : null}
                </g>
              );
            }
            if (it.kind === "icon") {
              // an ANIMAL or an OBJECT drawn for this book (paths in its own viewBox), centred on (x, y)
              const box = it.w ?? 312;
              const [vx, vy, vw, vh] = (it.viewBox ?? "0 0 520 520").split(/[\s,]+/).map(Number);
              return (
                <g key={it.id} transform={`translate(${st.x} ${st.y}) rotate(${st.r}) scale(${st.s})`} opacity={st.o}>
                  <g transform={`translate(${-box / 2} ${-box / 2}) scale(${box / vw} ${box / vh}) translate(${-vx} ${-vy})`}>
                    {(it.paths || []).map((pa, k) => <path key={k} d={pa.d} fill={pa.fill ?? "none"} stroke={pa.stroke ?? (pa.fill ? "none" : it.ink ?? "#1E1E22")} strokeWidth={pa.strokeWidth ?? (pa.fill ? 0 : 7)} strokeLinecap="round" strokeLinejoin="round" opacity={pa.opacity ?? 1} />)}
                  </g>
                  {it.label ? <Tag label={it.label} size={it.size ?? 38} y={box / 2 + 6} fit={fit} /> : null}
                </g>
              );
            }
            return (
              <g key={it.id} transform={`translate(${st.x} ${st.y}) rotate(${st.r}) scale(${st.s})`} opacity={st.o}>
                <Draw it={it} frame={frame} />
              </g>
            );
          })}
        </g>
        {/* ON THE SCREEN, not in the scene: a title stays where it is while the camera goes to something */}
        {spec.items.filter((it) => it.screen).map((it) => {
          const st = itemState(it, frame);
          if (!st || st.o <= 0.001) return null;
          return (
            <g key={it.id} transform={`translate(${st.x} ${st.y}) rotate(${st.r}) scale(${st.s})`} opacity={st.o}>
              <Draw it={it} frame={frame} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
