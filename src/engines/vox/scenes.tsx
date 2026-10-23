import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Beat, VImage } from "./schema";
import { INK, RED, PAPER, HEADLINE, SERIF, hash } from "./palette";
import { AccentBurst } from "./backgrounds";
import { Scene, KineticWords, MarkerUnderline, KickerChip, Cutout, HalftoneCard, BackdropImg, beatAnchors, UngroundedFallback } from "./shared";
import { EmphasisTokens, fitTokenSize } from "./emphasis";
import { Annotated, annotatedFor } from "./annotations";
import { onScreenHeadline } from "./screenTextBridge";
import { QuestionScene, TimelineScene, PlaceScene, DuoScene, RevealScene } from "./scenes-narrative";
import { DocumentScene, MapScene, DataVizScene, NetworkScene, TrendlineScene, FlowScene } from "./scenes-journalism";
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
} from "../../components/remocn";

const TitleScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const { title, author, kicker } = beat.props;
  const img = beat.images[0];
  return (
    <Scene beat={beat} accent={false}>
      <AccentBurst seed={0.2} x={70} y={48} startFrame={2} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 60, zIndex: 12 }}>
        {img ? (img.style === "cutout" && img.cut ? <Cutout asset={img.cut} startFrame={4} height={620} /> : <HalftoneCard asset={img.path} startFrame={4} width={460} height={560} />) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860, paddingBottom: 30 }}>
          <KickerChip text={kicker || "BOOK BREAKDOWN"} startFrame={12} />
          <KineticWords text={title || ""} startFrame={26} perWord={5} fontSize={112} align="left" maxWidth={860} />
          {author ? <div style={{ marginTop: 6 }}><KineticWords text={"by " + author} startFrame={50} perWord={3} fontSize={40} fontFamily={SERIF} weight={600} align="left" uppercase={false} italic /></div> : null}
        </div>
      </div>
    </Scene>
  );
};


const StatementScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  // P9-A V2: words stay INDEPENDENT (they already were here) — the join bug
  // lived in the other archetypes; this scene keeps its per-word staging.
  const words = (beat.props.emphasis.length ? beat.props.emphasis : beat.props.keywords.map((k) => k.toUpperCase())).slice(0, 3);
  const size = words.length >= 3 ? 116 : 148;
  const seed = hash(beat.id);
  const variant = Math.floor(hash(beat.id + "s") * 3);
  // Each emphasis word appears when it is actually spoken (sub-beat clock);
  // one extra slot picks up the beat's first LATE pulse, which is when the
  // marker stroke gets thrown — a second event, several seconds after the words.
  const all = beatAnchors(beat, words.length + 1, 10, 9);
  const at = all.slice(0, words.length);
  const late = Math.max(all[words.length], at[at.length - 1] + 18);
  // A stroke on every beat would be noise; the director hands one out ~1 in 3.
  // P9-A V4: never a circle/box on a rejected pole — strike or nothing. The
  // annotation decision is made for the token that will actually carry it.
  const ann = annotatedFor(beat.id, ["circle", "box"], beat.props.text, words);
  const hotIndex = Math.min(1, words.length - 1);
  // P9-A V5 (statement side): a passing authored onScreenText leads the frame.
  const head = onScreenHeadline(beat);

  if (variant === 1) {
    const idx = String((Math.floor(seed * 89) % 9) + 1).padStart(2, "0");
    return (
      <Scene beat={beat} accent={false}>
        <AccentBurst seed={seed} x={74} y={42} />
        <div style={{ position: "relative", width: "100%", maxWidth: 1360, display: "flex", alignItems: "center", gap: 44, zIndex: 12 }}>
          <span aria-hidden style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 340, lineHeight: 0.8, color: INK, opacity: 0.06, marginTop: -20 }}>{idx}</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            <KickerChip text={beat.props.kicker || ""} startFrame={2} />
            {head ? <KineticWords text={head} startFrame={at[0]} perWord={4} fontSize={size * 0.8} align="left" maxWidth={980} color={INK} /> : null}
            {words.map((w, i) => {
              const word = <KineticWords text={w} startFrame={head ? at[i] + 12 : at[i]} perWord={3} fontSize={head ? size * 0.6 : size * 0.92} align="left" maxWidth={980} color={i === 1 ? RED : INK} />;
              return ann && i === hotIndex ? (
                <Annotated key={i} text={w} size={head ? size * 0.6 : size * 0.92} kind={ann.kind} seed={ann.seed} startFrame={late}>{word}</Annotated>
              ) : (
                <React.Fragment key={i}>{word}</React.Fragment>
              );
            })}
            {ann ? null : <MarkerUnderline startFrame={at[at.length - 1] + 14} width={340} height={16} />}
          </div>
        </div>
      </Scene>
    );
  }

  if (variant === 2) {
    const hot = Math.min(1, words.length - 1);
    return (
      <Scene beat={beat}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <KickerChip text={beat.props.kicker || ""} startFrame={2} align="center" />
          {head ? <KineticWords text={head} startFrame={at[0]} perWord={3} fontSize={size * 0.78} color={INK} /> : null}
          {words.map((w, i) =>
            i === hot ? (
              <div key={i} style={{ marginTop: 4, marginBottom: 4 }}>
                <MarkerHighlight
                  highlight={w}
                  markerColor={RED}
                  baseColor={INK}
                  highlightedTextColor={PAPER}
                  fontSize={(head ? size * 0.72 : size) * 0.94}
                  fontWeight={900}
                />
              </div>
            ) : (
              <KineticWords key={i} text={w} startFrame={head ? at[i] + 12 : at[i]} perWord={3} fontSize={head ? size * 0.72 : size} color={INK} />
            ),
          )}
        </div>
      </Scene>
    );
  }

  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <KickerChip text={beat.props.kicker || ""} startFrame={2} align="center" />
        {head ? <KineticWords text={head} startFrame={at[0]} perWord={3} fontSize={size * 0.78} color={INK} /> : null}
        {words.map((w, i) => {
          const word = <KineticWords text={w} startFrame={head ? at[i] + 12 : at[i]} perWord={3} fontSize={head ? size * 0.72 : size} color={i === 1 ? RED : INK} />;
          if (ann && i === hotIndex) {
            return (
              <Annotated key={i} text={w} size={head ? size * 0.72 : size} kind={ann.kind} seed={ann.seed} startFrame={late}>{word}</Annotated>
            );
          }
          return (
            <div key={i} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
              {word}
              {i === hotIndex ? <MarkerUnderline startFrame={at[i] + 16} width={w.length * size * 0.5} height={18} /> : null}
            </div>
          );
        })}
      </div>
    </Scene>
  );
};

const ListItem: React.FC<{ label: string; startFrame: number; index: number }> = ({ label, startFrame, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - startFrame, fps, config: { damping: 16, mass: 0.6, stiffness: 120 }, durationInFrames: 18 });
  const x = interpolate(s, [0, 1], [-80, 0]);
  const op = interpolate(frame, [startFrame, startFrame + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, transform: `translateX(${x}px)`, opacity: op }}>
      <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 50, color: PAPER, background: RED, padding: "2px 14px", boxShadow: `5px 5px 0 ${INK}` }}>{`0${index + 1}`}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 66, color: INK, textTransform: "uppercase" }}>{label}</span>
        <MarkerUnderline startFrame={startFrame + 6} width={Math.min(760, label.length * 40)} height={9} />
      </div>
    </div>
  );
};
const ListScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const items = (beat.props.items?.length ? beat.props.items : beat.props.keywords.map((k) => k.toUpperCase())).slice(0, 4);
  // list rows land on the item word — a 4-item list now spans the beat
  const at = beatAnchors(beat, items.length, 22, 15);
  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "flex-start" }}>
        <KickerChip text={beat.props.kicker || "A MASTERCLASS IN"} startFrame={2} />
        {items.map((label, i) => <ListItem key={i} label={label} startFrame={at[i]} index={i} />)}
      </div>
    </Scene>
  );
};

const QuoteScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  // P9-A V2: the tokens render as INDEPENDENT lines — `join(" ")` manufactured
  // a phrase ("BILLIE FIRST WIFE") out of three separate authored words.
  const tokens = beat.props.emphasis.length
    ? beat.props.emphasis.slice(0, 3)
    : beat.props.keywords.slice(0, 2).map((k) => k.toUpperCase());
  const widest = Math.max(6, ...tokens.map((t) => t.length));
  const size = fitTokenSize(widest, 92, 60);
  const at = beatAnchors(beat, 1, 8, 0);
  // P9-A V1: the authored kicker renders in EVERY layout.
  const kicker = beat.props.kicker || "";
  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 1300 }}>
        {kicker ? <KickerChip text={kicker} startFrame={2} align="center" /> : null}
        <div style={{ fontFamily: SERIF, fontSize: 220, color: RED, lineHeight: 0.4, height: 92 }}>&quot;</div>
        <EmphasisTokens tokens={tokens} startFrame={at[0]} fontSize={size} align="center" maxWidth={1200} color={INK} accentColor={RED} fontFamily={SERIF} weight={700} uppercase={false} step={5} />
        <div style={{ marginTop: 8 }}>
          <InkUnderline width={Math.min(960, Math.max(380, widest * size * 0.5))} thickness={12} color={RED} delay={at[0] + 16} />
        </div>
      </div>
    </Scene>
  );
};

const StatScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  // P9-A V3 — the number the AUTHOR picked wins; the narration regex is the
  // fallback. It used to be the other way around, so an authored "42%" on a
  // beat whose narration ALSO mentioned "2020" stamped 2020 on the frame.
  const emphasisNum = beat.props.emphasis.find((e) => /^\$?\d[\d,\.]*\s?(%|percent|million|billion|trillion|k|x)?$/i.test(e.trim()));
  const m = emphasisNum ? null : beat.props.text.match(/\$?\d[\d,\.]*\s?(%|percent|million|billion|trillion|k|x)?/i);
  const num = (emphasisNum || (m ? m[0].trim() : "") || beat.props.emphasis[0] || "").trim();
  // P9-A V2: label tokens stay INDEPENDENT lines (they were space-joined too).
  const labelTokens = beat.props.emphasis.filter((e) => e.trim() !== num && !/\d/.test(e)).slice(0, 2);
  const at = beatAnchors(beat, 2, 4, 22);

  // Check if num is a simple integer/stat (e.g. 85%, 37x, $100)
  const cleanMatch = num.match(/^(\$)?(\d+)(%|x|k)?$/i);
  const parsedInt = cleanMatch ? parseInt(cleanMatch[2], 10) : null;

  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {beat.props.kicker ? <KickerChip text={beat.props.kicker} startFrame={2} align="center" /> : null}
        {parsedInt !== null && parsedInt <= 9999 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220, position: "relative" }}>
            <ScribbleCircle
              width={340}
              height={190}
              color={RED}
              strokeWidth={14}
              delay={at[0] + 8}
            >
              <RollingNumber
                from={0}
                to={parsedInt}
                prefix={cleanMatch![1] ?? ""}
                suffix={cleanMatch![3] ?? ""}
                fontSize={160}
                color={RED}
              />
            </ScribbleCircle>
          </div>
        ) : (
          <>
            <KineticWords text={num} startFrame={at[0]} perWord={2} fontSize={230} color={RED} uppercase={false} />
            <MarkerUnderline startFrame={at[0] + 16} width={520} height={20} />
          </>
        )}
        {labelTokens.length ? (
          <EmphasisTokens tokens={labelTokens} startFrame={at[1]} fontSize={52} color={INK} accentColor={RED} />
        ) : (
          <KineticWords text={beat.props.keywords[0]?.toUpperCase() || ""} startFrame={at[1]} perWord={3} fontSize={52} color={INK} />
        )}
      </div>
    </Scene>
  );
};

const ImageFocusScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  // P9-A V2: INDEPENDENT emphasis tokens — never one joined phrase.
  const tokens = beat.props.emphasis.length ? beat.props.emphasis.slice(0, 3) : (beat.props.keywords[0] ? [beat.props.keywords[0].toUpperCase()] : []);
  const widest = tokens.length ? Math.max(4, ...tokens.map((t) => t.length)) : 8;
  const label = tokens.join(" "); // annotation sizing only — tokens render separately
  const img = beat.images[0];
  const seed = hash(beat.id);
  const cut = img && img.style === "cutout" && img.cut ? img.cut : null;
  const variant = img ? Math.floor(hash(beat.id + "v") * 3) : -1;
  // imagefocus is 45%+ of a book's beats: the image lands early, the label
  // lands on its spoken word, then the underline — and on ~1 in 3 beats a
  // marker stroke is thrown around the label on a LATE pulse. Four events.
  const at = beatAnchors(beat, 3, 16, 18);
  const late = Math.max(at[2], at[1] + 16);
  // P9-A V4: the stroke NEVER lands on a rejected pole — a negated token gets
  // the strike kind (or none), never the asserting circle/box. The decision is
  // made for the token that will carry the stroke: the onScreenText headline
  // when it leads, else the hot emphasis token.
  const head = onScreenHeadline(beat);
  const annToken = head || tokens[Math.min(1, tokens.length - 1)] || "";
  const ann = annotatedFor(beat.id, ["circle", "box"], beat.props.text, [annToken]);
  const mark = (node: React.ReactNode, size: number, maxWidth?: number) =>
    ann ? <Annotated text={label} size={size} maxWidth={maxWidth} kind={ann.kind} seed={ann.seed} startFrame={late}>{node}</Annotated> : node;
  // P9-A V5: the AUTHOR's onScreenText is the headline when the shared
  // screen-text checker passes it; emphasis becomes secondary. A rejection is
  // recorded (beat.props._onScreenTextRejected) so telemetry can tell
  // "absent" from "rejected:<reason>".

  if (variant === 1) {
    return (
      <Scene
        beat={beat}
        accent={false}
        bleed={
          <AbsoluteFill style={{ zIndex: 2 }}>
            <BackdropImg asset={img!.path} />
            <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(20,15,10,0.82) 0%, rgba(20,15,10,0.5) 45%, rgba(20,15,10,0.15) 100%)" }} />
          </AbsoluteFill>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start", width: "100%", maxWidth: 1400 }}>
          <KickerChip text={beat.props.kicker || ""} startFrame={10} />
          {head ? mark(<KineticWords text={head} startFrame={at[0]} perWord={4} fontSize={96} align="left" maxWidth={1100} color={PAPER} />, 96, 1100)
            : mark(<EmphasisTokens tokens={tokens} startFrame={at[0]} fontSize={fitTokenSize(widest, 110, 84)} align="left" maxWidth={1100} color={PAPER} accentColor={PAPER} step={6} />, 110, 1100)}
          {head && tokens.length ? <EmphasisTokens tokens={tokens} startFrame={at[0] + 14} fontSize={44} align="left" maxWidth={1100} color={PAPER} accentColor={PAPER} asChips /> : null}
          <MarkerUnderline startFrame={at[1]} width={360} height={16} />
        </div>
      </Scene>
    );
  }

  if (variant === 2) {
    // P9-A V1: variant 2 used to be the ONE imagefocus layout that dropped the
    // kicker — the authored kicker survives in every layout now.
    return (
      <Scene beat={beat} accent>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, zIndex: 12 }}>
          <KickerChip text={beat.props.kicker || ""} startFrame={2} align="center" />
          {head ? mark(<KineticWords text={head} startFrame={at[0]} perWord={3} fontSize={80} color={INK} />, 80, 1500)
            : mark(<EmphasisTokens tokens={tokens} startFrame={at[0]} fontSize={fitTokenSize(widest, 92, 70)} color={INK} accentColor={RED} step={6} />, 92, 1500)}
          {head && tokens.length ? <EmphasisTokens tokens={tokens} startFrame={at[0] + 12} fontSize={40} color={INK} accentColor={RED} asChips /> : null}
          {cut ? <Cutout asset={cut} startFrame={4} height={520} /> : <HalftoneCard asset={img!.path} keyword={beat.props.keywords[0]?.toUpperCase()} startFrame={4} width={780} height={460} />}
        </div>
      </Scene>
    );
  }

  const flip = seed > 0.5;
  const visual = img
    ? cut
      ? <Cutout asset={cut} startFrame={4} height={640} strokeX={flip ? 24 : -24} />
      : <HalftoneCard asset={img.path} keyword={beat.props.keywords[0]?.toUpperCase()} startFrame={4} width={720} height={540} />
    : null;
  const text = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560, paddingBottom: 20 }}>
      <KickerChip text={beat.props.kicker || ""} startFrame={12} />
      {head ? mark(<KineticWords text={head} startFrame={at[0]} perWord={4} fontSize={78} align="left" maxWidth={560} color={INK} />, 78, 560)
        : mark(<EmphasisTokens tokens={tokens} startFrame={at[0]} fontSize={fitTokenSize(widest, 86, 66)} align="left" maxWidth={560} color={INK} accentColor={RED} step={6} />, 86, 560)}
      {head && tokens.length ? <EmphasisTokens tokens={tokens} startFrame={at[0] + 14} fontSize={40} align="left" color={INK} accentColor={RED} asChips /> : null}
      <MarkerUnderline startFrame={at[1]} width={320} height={16} />
    </div>
  );
  return (
    <Scene beat={beat} accent={false}>
      <AccentBurst seed={seed} x={flip ? 30 : 68} y={46} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 70, zIndex: 12 }}>
        {flip ? (<>{text}{visual}</>) : (<>{visual}{text}</>)}
      </div>
    </Scene>
  );
};

const CompareScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const [la, lb] = beat.props.compareLabels || beat.props.emphasis;
  const a = beat.images[0];
  const b = beat.images[1];

  // If there are no images, render StrikethroughReplace for an impactful conceptual paradigm shift!
  if (!a && !b && la && lb) {
    return (
      <Scene beat={beat} accent={false}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, zIndex: 12 }}>
          <KickerChip text={beat.props.kicker || "PARADIGM SHIFT"} startFrame={2} />
          <StrikethroughReplace
            from={la}
            to={lb}
            lineColor={RED}
            color="rgba(30,42,36,0.45)"
            toColor={INK}
            fontSize={68}
            fontWeight={900}
          />
        </div>
      </Scene>
    );
  }

  const vs = interpolate(frame, [36, 54], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const side = (img: VImage | undefined, sideLabel: string | undefined, sf = 4, tint = RED) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {img ? (img.style === "cutout" && img.cut ? <Cutout asset={img.cut} startFrame={sf} height={470} tint={tint} strokeX={tint === RED ? -22 : 22} /> : <HalftoneCard asset={img.path} startFrame={sf} width={470} height={380} tint={tint} />) : null}
      <KineticWords text={sideLabel || ""} startFrame={sf + 14} perWord={2} fontSize={40} weight={900} letterSpacing={1} />
    </div>
  );
  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 44, zIndex: 12 }}>
        {side(a, la, 4, RED)}
        <div style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 76, color: RED, opacity: vs, transform: `scale(${0.6 + vs * 0.4})`, paddingBottom: 80 }}>VS</div>
        {side(b, lb, 60, INK)}
      </div>
    </Scene>
  );
};

const PunchlineScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  // P9-A: words render one per line — already independent here (no join).
  const words = (beat.props.emphasis.length ? beat.props.emphasis : beat.props.keywords.map((k) => k.toUpperCase())).slice(0, 3);
  const at = beatAnchors(beat, words.length, 8, 12);
  const vig = interpolate(frame, [30, 80], [0, 0.45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Scene beat={beat} accent={false}>
      <AccentBurst seed={0.7} x={50} y={46} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 12 }}>
        {words.map((w, i) => <KineticWords key={i} text={w} startFrame={at[i]} perWord={3} fontSize={150} color={i === words.length - 1 ? RED : INK} />)}
      </div>
      <AbsoluteFill style={{ pointerEvents: "none", boxShadow: `inset 0 0 480px rgba(20,15,10,${vig})`, zIndex: 40 }} />
    </Scene>
  );
};

const ChecklistScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const rawItems = beat.props.checklistItems || beat.props.items || beat.props.emphasis;
  const items = (rawItems.length ? rawItems : ["THE HABIT LOOP", "CUE AND CRAVING", "THE RESPONSE", "THE REWARD"]).slice(0, 4);
  const at = beatAnchors(beat, 1, 4, 0);
  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 20, maxWidth: 1100 }}>
        <KickerChip text={beat.props.kicker || "KEY ACTION STEPS"} startFrame={2} />
        <CheckList
          items={items.map((it) => (typeof it === "string" ? { text: it, checked: true } : it))}
          width={980}
          fontSize={44}
          color={INK}
          boxColor={INK}
          tickColor={RED}
          delay={at[0]}
        />
      </div>
    </Scene>
  );
};

const PolaroidScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const img = beat.images[0];
  // P9-A V2: the polaroid caption is a real CAPTION — but emphasis tokens are
  // still separate words on the author's desk, so they are joined only when a
  // caption was actually authored; the fallback reads the first keyword.
  const caption = beat.props.polaroidCaption || beat.props.keywords[0]?.toUpperCase() || beat.props.emphasis[0] || "";
  const at = beatAnchors(beat, 2, 6, 18);
  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        {beat.props.kicker ? (
          <div style={{ position: "absolute", top: -20, right: -40, zIndex: 20 }}>
            <PaperSticker at={at[0] + 6} background={RED} borderColor={INK}>
              <span style={{ color: PAPER, fontWeight: 800, fontSize: 20, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {beat.props.kicker}
              </span>
            </PaperSticker>
          </div>
        ) : null}
        <Polaroid
          width={640}
          caption={caption}
          captionAt={at[1]}
          frameColor="#FAF8F5"
          captionColor={INK}
          captionSize={34}
        >
          {img ? (
            <BackdropImg asset={img.path} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>{caption}</span>
            </div>
          )}
        </Polaroid>
      </div>
    </Scene>
  );
};

const ChartScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  // The defaults here plotted a hardcoded 1,2,4,8,16,32,65,120 against
  // START / DAY 30 / DAY 90 / DAY 180 / 1 YEAR — a compounding curve presented
  // as this book's data, on any beat where the word "compound" appeared. A
  // chart with no stated figures declines; see UngroundedFallback.
  const data = (beat.props.chartData || []).filter((n) => Number.isFinite(n));
  const labels = beat.props.chartLabels || [];
  if (data.length < 2) return <UngroundedFallback beat={beat} kicker={beat.props.kicker || "THE TRAJECTORY"} />;
  return (
    <Scene beat={beat}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <KickerChip text={beat.props.kicker || "THE TRAJECTORY"} startFrame={2} />
        <AnimatedLineChart
          data={data}
          labels={labels}
          // P9-A V2: the chart title never joins emphasis into a phrase; the
          // authored chartTitle wins, else the first emphasis word stands alone.
          title={beat.props.chartTitle || beat.props.emphasis[0] || ""}
          subtitle={beat.props.chartSubtitle}
          width={1080}
          height={520}
          strokeColor={RED}
          textColor={INK}
          gridColor="rgba(30,42,36,0.14)"
        />
      </div>
    </Scene>
  );
};

export const SCENES: Record<string, React.FC<{ beat: Beat }>> = {
  title: TitleScene, statement: StatementScene, list: ListScene, quote: QuoteScene,
  stat: StatScene, imagefocus: ImageFocusScene, compare: CompareScene, punchline: PunchlineScene,
  // narrative archetypes — see scenes-narrative.tsx
  question: QuestionScene, timeline: TimelineScene, place: PlaceScene,
  duo: DuoScene, reveal: RevealScene,
  // journalism & investigative archetypes — see scenes-journalism.tsx
  document: DocumentScene, map: MapScene, dataviz: DataVizScene, network: NetworkScene,
  trendline: TrendlineScene, flow: FlowScene,
  // remocn editorial archetypes
  checklist: ChecklistScene, polaroid: PolaroidScene, chart: ChartScene,
};

export {
  StatementScene,
  DocumentScene,
  MapScene,
  DataVizScene,
  NetworkScene,
  TrendlineScene,
  FlowScene,
  ChecklistScene,
  PolaroidScene,
  ChartScene,
};
