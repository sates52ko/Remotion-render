import React from "react";
import type { Beat } from "./schema";
import { INK, RED, hash } from "./palette";
import { Scene, beatAnchors, KickerChip, UngroundedFallback } from "./shared";
import { ThematicDocument } from "./documents";
import { DeskPerspective } from "./desk";
import { GeoMap } from "./cartography";
import { ScaleMatrix, ComparativeBarChart, BalanceScale, NetworkGraph, AnnotatedTrendline, InfluenceFlow } from "./infographics";

/**
 * scenes-journalism.tsx — Vox Engine 2.0 Gazetecilik Sahne Arke tipleri
 *
 * document · map · dataviz · network
 *
 * Dünya standartlarındaki görsel araştırmacı/video-makale estetiğini
 * tam otomasyonla Remotion'da render eden sahneler.
 */

// ── 1. DOCUMENT SCENE (Tematik Evrak / Gazete / Parşömen / Telgraf / Lab) ──

export const DocumentScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const at = beatAnchors(beat, 2, 4, 16);
  const headline = beat.props.emphasis.join(" ") || beat.props.keywords.slice(0, 3).join(" ").toUpperCase();
  const subhead = beat.props.kicker || "PRIMARY HISTORICAL RECORD";
  const seed = hash(beat.id);
  const docType = beat.props.docType || (seed > 0.5 ? "declassified" : "newspaper");

  return (
    <Scene beat={beat} accent={false}>
      <DeskPerspective tiltX={10} tiltY={-2} drift={true}>
        <ThematicDocument
          type={docType}
          title={headline}
          body={beat.props.text}
          subhead={subhead}
          startFrame={at[0]}
          width={940}
        />
      </DeskPerspective>
    </Scene>
  );
};

// ── 2. MAP SCENE (Coğrafi Harita ve Rota) ──────────────────────────────────

export const MapScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const at = beatAnchors(beat, 2, 6, 18);
  const placeName = (beat.props.emphasis[0] || beat.props.keywords[0] || "LOCATION").toUpperCase();
  const kicker = beat.props.kicker || "STRATEGIC GEOGRAPHY";

  // This used to draw a North-America -> Europe flight path on `hash(beat.id) >
  // 0.45` — a journey nobody described, over a continent picked by the same
  // hash, whenever a loose `from .* to` regex fired on ordinary prose. A route
  // is only drawn when the planner states one (props.mapRoute), and the region
  // comes from the place being discussed rather than from the beat id.
  const route = beat.props.mapRoute;
  const region = beat.props.mapRegion || "world";

  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, zIndex: 12 }}>
        <KickerChip text={kicker} startFrame={2} align="center" />
        <DeskPerspective tiltX={14} tiltY={0} drift={true}>
          <GeoMap
            startFrame={at[0]}
            highlightRegion={region}
            route={route}
            targetLabel={placeName}
            width={1060}
            height={580}
          />
        </DeskPerspective>
      </div>
    </Scene>
  );
};

// ── 3. DATAVIZ SCENE (Ölçek Matrisi, Bar Grafik veya Terazi) ───────────────

export const DataVizScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const at = beatAnchors(beat, 2, 4, 14);
  const seed = hash(beat.id);
  const kicker = beat.props.kicker || "DATA INVESTIGATION";

  // The planner supplies the figure the narration actually states
  // (props.chartData / props.chartLabels). It used to be re-derived here as
  // `firstNumberInText % 100` — so "1935" became 35% — and then drawn next to an
  // invented "STANDARD BENCHMARK 35%" bar that no source anywhere had claimed.
  // Both are gone: no real figure, no chart.
  const values = (beat.props.chartData || []).filter((n) => Number.isFinite(n));
  const labels = beat.props.chartLabels || [];
  const isCompare = !!(beat.props.compareLabels && beat.props.compareLabels.length >= 2);

  if (!values.length && !isCompare) return <UngroundedFallback beat={beat} kicker={kicker} />;

  const label = labels[0] || beat.props.emphasis.join(" ") || "";
  const pct = Math.min(100, Math.max(0, Math.round(values[0] ?? 0)));

  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, zIndex: 12 }}>
        <KickerChip text={kicker} startFrame={2} align="center" />
        <DeskPerspective tiltX={8} tiltY={-1} drift={true}>
          {isCompare && values.length < 2 ? (
            <BalanceScale
              leftLabel={beat.props.compareLabels![0]}
              rightLabel={beat.props.compareLabels![1]}
              tiltSide={seed > 0.5 ? "left" : "right"}
              startFrame={at[0]}
            />
          ) : values.length >= 2 ? (
            // two stated figures compared against each other — no third bar is
            // added, because we would have to make it up
            <ComparativeBarChart
              bars={values.slice(0, 3).map((v, i) => ({
                label: labels[i] || beat.props.emphasis[i] || "",
                value: v,
                displayValue: String(v),
                color: i === 0 ? RED : INK,
              }))}
              startFrame={at[0]}
              width={900}
            />
          ) : (
            <ScaleMatrix highlightedCount={pct} label={label} startFrame={at[0]} unitLabel="%" />
          )}
        </DeskPerspective>
      </div>
    </Scene>
  );
};

// ── 4. NETWORK SCENE (İlişki ve Karakter Ağı / Conspiracy Board) ───────────

export const NetworkScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const at = beatAnchors(beat, 2, 4, 16);
  const kicker = beat.props.kicker || "THE CONNECTION WEB";

  // A conspiracy board is the strongest claim this engine can make: it asserts
  // that A is LINKED TO B and that B INFLUENCED C. Those three labels, and the
  // roles PRIMARY NODE / FINANCIAL BACKER / CATALYST, were hardcoded and wired
  // between whichever three emphasis words the beat happened to carry — an
  // assertion the narration never made, drawn as if it were sourced.
  // The scene now renders only relations the planner states outright
  // (props.networkNodes + props.networkLinks); until something can extract real
  // entities and relations from the narration, nothing here is drawn.
  const authored = beat.props.networkNodes || [];
  const authoredLinks = beat.props.networkLinks || [];
  if (authored.length < 2 || !authoredLinks.length) {
    return <UngroundedFallback beat={beat} kicker={kicker} />;
  }
  const RING: [number, number][] = [[260, 160], [800, 180], [540, 440], [180, 430], [880, 430]];
  const nodes = authored.slice(0, 5).map((n, i) => ({
    id: String(i + 1),
    label: n.label,
    sub: n.sub || "",
    x: RING[i][0],
    y: RING[i][1],
  }));
  const links = authoredLinks.slice(0, 5).map((l) => ({ from: String(l.from), to: String(l.to), label: l.label }));

  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, zIndex: 12 }}>
        <KickerChip text={kicker} startFrame={2} align="center" />
        <DeskPerspective tiltX={12} tiltY={-2} drift={true}>
          <NetworkGraph nodes={nodes} links={links} startFrame={at[0]} />
        </DeskPerspective>
      </div>
    </Scene>
  );
};

// ── 5. TRENDLINE SCENE (Tarihsel Çizgi Grafiği & Scrubber) ────────────────

export const TrendlineScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const at = beatAnchors(beat, 2, 4, 16);
  const kicker = beat.props.kicker || "HISTORICAL TRAJECTORY";

  // `trendPoints` comes from the planner and carries the figures the narration
  // actually states. There used to be a fallback plotting a hardcoded
  // 24 / 58 / 42 / 89 under labels like BASELINE / ACCELERATION / PEAK-TODAY —
  // a chart of numbers nobody said, captioned with the beat's keywords. A
  // trendline with no trend now declines.
  const points = (beat.props.trendPoints || []).filter((p) => Number.isFinite(p.value));
  const words = beat.props.emphasis.length ? beat.props.emphasis : beat.props.keywords.slice(0, 4).map((k) => k.toUpperCase());
  if (points.length < 2) return <UngroundedFallback beat={beat} kicker={kicker} />;

  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, zIndex: 12 }}>
        <KickerChip text={kicker} startFrame={2} align="center" />
        <DeskPerspective tiltX={11} tiltY={-1} drift={true}>
          <AnnotatedTrendline points={points} title={words.slice(0, 2).join(" ") || "TIMELINE DATA"} startFrame={at[0]} />
        </DeskPerspective>
      </div>
    </Scene>
  );
};

// ── 6. FLOW SCENE (Sebep - Mekanizma - Sonuç Akışı) ────────────────────────

export const FlowScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const at = beatAnchors(beat, 2, 4, 16);
  const kicker = beat.props.kicker || "SYSTEM MECHANISM";

  // The fallback here printed three generic systems-analysis sentences
  // ("Foundational catalyst driving the system", "Structural pressure
  // multiplying the effect", "Unintended consequence across the environment")
  // as if they were the book's own causal chain, under whichever three emphasis
  // words the beat carried. A mechanism diagram with no stated mechanism is a
  // claim we cannot back, so it declines.
  const stages = (beat.props.flowNodes || []).map((n) => ({ title: n.label, desc: n.sub }));
  if (stages.length < 2) return <UngroundedFallback beat={beat} kicker={kicker} />;

  return (
    <Scene beat={beat} accent={false}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, zIndex: 12 }}>
        <KickerChip text={kicker} startFrame={2} align="center" />
        <DeskPerspective tiltX={13} tiltY={-2} drift={true}>
          <InfluenceFlow stages={stages} startFrame={at[0]} />
        </DeskPerspective>
      </div>
    </Scene>
  );
};
