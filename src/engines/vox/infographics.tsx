import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { INK, RED, PAPER, HEADLINE, SERIF } from "./palette";
import { MarkerUnderline } from "./shared";

/**
 * infographics.tsx — Gerçek Veri Gazeteciliği ve İnfografikler (Data Journalism)
 *
 * Vox'un "veriyle anlatma" gücü:
 * - ScaleMatrix: Sayıyı soyut bırakmayıp ölçek matrisiyle gösterme (100 noktadan 65'i)
 * - ComparativeBarChart: İki veya üç verinin canlı sayaçlarla yarıştığı bar grafik
 * - BalanceScale: İki kavramın ağırlığını kıyaslayan dinamik terazi
 * - NetworkGraph: Karakterler ve kavramlar arası kırmızı bağlantı ağı (conspiracy board)
 */

// ── 1. ÖLÇEK MATRİSİ (SCALE MATRIX / PICTOGRAM GRID) ──────────────────────

export const ScaleMatrix: React.FC<{
  total?: number; // Genellikle 100 (yüzde için)
  highlightedCount: number;
  label: string;
  startFrame: number;
  unitLabel?: string;
}> = ({ total = 100, highlightedCount, label, startFrame, unitLabel = "%" }) => {
  const frame = useCurrentFrame();
  const cols = 10;

  // Sayacın 0'dan hedefe akması
  const counter = Math.round(
    interpolate(frame, [startFrame, startFrame + 30], [0, highlightedCount], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    })
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, zIndex: 12 }}>
      {/* Büyük Sayı ve Açıklama */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 130, color: RED, lineHeight: 0.9 }}>
          {counter}
        </span>
        <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 70, color: INK }}>
          {unitLabel}
        </span>
      </div>

      <div style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 40, color: INK, textTransform: "uppercase", letterSpacing: 2 }}>
        {label}
      </div>
      <MarkerUnderline startFrame={startFrame + 12} width={380} height={14} />

      {/* 10x10 Nokta Matrisi */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: "12px 14px",
          background: "rgba(0,0,0,0.04)",
          padding: "24px 28px",
          borderRadius: 8,
          border: `2px solid rgba(26,26,26,0.12)`,
        }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const isTarget = i < highlightedCount;
          const popFrame = startFrame + Math.floor((i / total) * 28);
          const pop = interpolate(frame, [popFrame, popFrame + 6], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={i}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                backgroundColor: isTarget && i < counter ? RED : "rgba(26,26,26,0.2)",
                transform: `scale(${isTarget && i < counter ? 0.8 + pop * 0.4 : 0.8})`,
                boxShadow: isTarget && i < counter ? `0 0 6px rgba(224,67,41,0.6)` : "none",
                transition: "background-color 0.15s ease",
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

// ── 2. KARŞILAŞTIRMALI BAR GRAFİK (COMPARATIVE BAR CHART) ──────────────────

export const ComparativeBarChart: React.FC<{
  bars: { label: string; value: number; displayValue: string; color?: string }[];
  startFrame: number;
  width?: number;
}> = ({ bars, startFrame, width = 880 }) => {
  const frame = useCurrentFrame();
  const maxVal = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 28,
        width,
        background: "rgba(255,255,255,0.45)",
        padding: "36px 44px",
        borderRadius: 6,
        border: `3px solid ${INK}`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
        zIndex: 12,
      }}
    >
      {bars.map((b, i) => {
        const barStart = startFrame + i * 10;
        const p = interpolate(frame, [barStart, barStart + 22], [0, b.value / maxVal], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });

        const op = interpolate(frame, [barStart, barStart + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const barColor = b.color || (i === 0 ? RED : INK);

        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, opacity: op }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 32, color: INK, textTransform: "uppercase" }}>
                {b.label}
              </span>
              <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 42, color: barColor }}>
                {b.displayValue}
              </span>
            </div>

            {/* İlerleme Çubuğu */}
            <div style={{ width: "100%", height: 38, background: "rgba(0,0,0,0.08)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  width: `${p * 100}%`,
                  height: "100%",
                  background: barColor,
                  borderRadius: 4,
                  boxShadow: `4px 0 0 ${INK}`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 3. DİNAMİK KIYASLAMA TERAZİSİ (BALANCE SCALE) ──────────────────────────

export const BalanceScale: React.FC<{
  leftLabel: string;
  rightLabel: string;
  tiltSide?: "left" | "right" | "equal";
  startFrame: number;
}> = ({ leftLabel, rightLabel, tiltSide = "left", startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const targetAngle = tiltSide === "left" ? -14 : tiltSide === "right" ? 14 : 0;
  const s = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 10, mass: 0.9, stiffness: 100 },
    durationInFrames: 32,
  });

  const angle = interpolate(s, [0, 1], [0, targetAngle]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 900, zIndex: 12 }}>
      <svg width={800} height={420} viewBox="0 0 800 420" style={{ overflow: "visible" }}>
        {/* Terazi Ana Gövdesi (Center Stand) */}
        <line x1={400} y1={60} x2={400} y2={360} stroke={INK} strokeWidth={10} strokeLinecap="round" />
        <polygon points="340,360 460,360 400,310" fill={INK} />

        {/* Eğimli Dönen Üst Kol (Balance Beam) */}
        <g transform={`translate(400, 80) rotate(${angle})`}>
          <line x1={-300} y1={0} x2={300} y2={0} stroke={INK} strokeWidth={8} strokeLinecap="round" />
          <circle cx={0} cy={0} r={14} fill={RED} stroke={INK} strokeWidth={4} />

          {/* Sol Kefe İpleri ve Tabağı */}
          <g transform="translate(-280, 0)">
            <line x1={0} y1={0} x2={-45} y2={120} stroke={INK} strokeWidth={2.5} strokeDasharray="4 3" />
            <line x1={0} y1={0} x2={45} y2={120} stroke={INK} strokeWidth={2.5} strokeDasharray="4 3" />
            <path d="M -70,120 Q 0,155 70,120 Z" fill={tiltSide === "left" ? RED : "#C5C2B8"} stroke={INK} strokeWidth={4} />
          </g>

          {/* Sağ Kefe İpleri ve Tabağı */}
          <g transform="translate(280, 0)">
            <line x1={0} y1={0} x2={-45} y2={120} stroke={INK} strokeWidth={2.5} strokeDasharray="4 3" />
            <line x1={0} y1={0} x2={45} y2={120} stroke={INK} strokeWidth={2.5} strokeDasharray="4 3" />
            <path d="M -70,120 Q 0,155 70,120 Z" fill={tiltSide === "right" ? RED : "#C5C2B8"} stroke={INK} strokeWidth={4} />
          </g>
        </g>
      </svg>

      {/* Alt Etiketler */}
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: -30 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 340 }}>
          <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 38, color: tiltSide === "left" ? RED : INK, textAlign: "center", textTransform: "uppercase" }}>
            {leftLabel}
          </span>
          {tiltSide === "left" ? <MarkerUnderline startFrame={startFrame + 14} width={220} height={12} /> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 340 }}>
          <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 38, color: tiltSide === "right" ? RED : INK, textAlign: "center", textTransform: "uppercase" }}>
            {rightLabel}
          </span>
          {tiltSide === "right" ? <MarkerUnderline startFrame={startFrame + 14} width={220} height={12} /> : null}
        </div>
      </div>
    </div>
  );
};

// ── 4. BAĞLANTI AĞI (CONSPIRACY / EVIDENCE NETWORK GRAPH) ─────────────────

export const NetworkGraph: React.FC<{
  nodes: { id: string; label: string; sub?: string; x: number; y: number }[];
  links: { from: string; to: string; label?: string }[];
  startFrame: number;
}> = ({ nodes, links, startFrame }) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ position: "relative", width: 1100, height: 620, zIndex: 12 }}>
      <svg width={1100} height={620} style={{ position: "absolute", inset: 0 }}>
        {/* Kırmızı Yün İpler (Connecting Strings) */}
        {links.map((lnk, i) => {
          const n1 = nodes.find((n) => n.id === lnk.from);
          const n2 = nodes.find((n) => n.id === lnk.to);
          if (!n1 || !n2) return null;

          const linkStart = startFrame + i * 8 + 6;
          const p = interpolate(frame, [linkStart, linkStart + 16], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          const len = Math.hypot(n2.x - n1.x, n2.y - n1.y);

          return (
            <g key={i}>
              <line
                x1={n1.x}
                y1={n1.y}
                x2={n2.x}
                y2={n2.y}
                stroke={RED}
                strokeWidth={3.5}
                strokeDasharray={len}
                strokeDashoffset={len * (1 - p)}
                strokeLinecap="round"
                opacity={0.88}
              />
              {lnk.label && p > 0.8 ? (
                <g transform={`translate(${(n1.x + n2.x) / 2}, ${(n1.y + n2.y) / 2 - 12})`}>
                  <rect x={-50} y={-14} width={100} height={24} fill={PAPER} stroke={INK} strokeWidth={1.5} rx={3} />
                  <text x={0} y={3} fill={RED} fontFamily={HEADLINE} fontWeight={900} fontSize={12} textAnchor="middle">
                    {lnk.label.toUpperCase()}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* Düğümler (Pin & Photo Cards) */}
      {nodes.map((node, i) => {
        const nodeStart = startFrame + i * 5;
        const op = interpolate(frame, [nodeStart, nodeStart + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              transform: "translate(-50%, -50%)",
              opacity: op,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            {/* Kırmızı Harita İğnesi */}
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: RED, border: `3px solid ${INK}`, boxShadow: "0 2px 5px rgba(0,0,0,0.4)" }} />

            {/* Düğüm Kartı */}
            <div style={{ background: "#F6F4ED", border: `2px solid ${INK}`, padding: "8px 16px", borderRadius: 4, boxShadow: "0 6px 14px rgba(0,0,0,0.18)", minWidth: 120, textAlign: "center" }}>
              <div style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 18, color: INK, textTransform: "uppercase" }}>
                {node.label}
              </div>
              {node.sub ? (
                <div style={{ fontFamily: SERIF, fontSize: 13, color: RED, fontStyle: "italic", fontWeight: 700 }}>
                  {node.sub}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 5. ANNOTATED TRENDLINE (TARİHSEL ÇİZGİ GRAFİĞİ & SCRUBBER) ─────────────

export interface TrendPoint {
  label: string;
  year?: string;
  value: number; // 0..100
  isHighlight?: boolean;
}

/**
 * AnnotatedTrendline — Vox'un veri gazeteciliğindeki en karakteristik çizgi grafiği.
 * - Çizgi zamanla çizilir (animasyonlu SVG stroke).
 * - Kritik dönüm noktalarında (inflection points) kırmızı iğneler ve açıklama kutuları belirir.
 * - Sayısal eksen ve arka plan ızgarası ile gazete araştırma formatındadır.
 */
export const AnnotatedTrendline: React.FC<{
  points: TrendPoint[];
  title?: string;
  startFrame: number;
  width?: number;
  height?: number;
}> = ({
  points,
  title = "HISTORICAL TRAJECTORY",
  startFrame,
  width = 960,
  height = 480,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const padX = 70;
  const padY = 50;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  // Koordinatları hesapla
  const coords = points.map((p, i) => {
    const x = padX + (i / Math.max(1, points.length - 1)) * chartW;
    const y = padY + chartH - (p.value / 100) * chartH;
    return { x, y, ...p };
  });

  // SVG path dize oluşturma
  const pathD = coords.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = coords[i - 1];
    const cp1x = prev.x + (pt.x - prev.x) * 0.45;
    const cp2x = prev.x + (pt.x - prev.x) * 0.55;
    return `${acc} C ${cp1x},${prev.y} ${cp2x},${pt.y} ${pt.x},${pt.y}`;
  }, "");

  const totalLength = chartW * 1.35;

  const drawProg = interpolate(frame, [startFrame + 6, startFrame + 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "rgba(255,255,255,0.65)",
        border: `3px solid ${INK}`,
        padding: "24px 30px",
        boxShadow: "0 20px 45px rgba(24,18,12,0.18)",
        zIndex: 12,
      }}
    >
      {/* Üst Başlık */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <span style={{ fontFamily: HEADLINE, fontWeight: 900, fontSize: 24, color: INK, letterSpacing: 2, textTransform: "uppercase" }}>
          {title}
        </span>
        <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 700, fontSize: 13, color: RED, letterSpacing: 1 }}>
          DATA INDEX (BASE = 100)
        </span>
      </div>

      <svg width={width} height={height - 70} viewBox={`0 0 ${width} ${height - 70}`} style={{ overflow: "visible" }}>
        {/* Yatay Kılavuz Çizgileri */}
        {[0, 25, 50, 75, 100].map((v, i) => {
          const y = padY + chartH - (v / 100) * chartH;
          return (
            <g key={i} opacity={0.18}>
              <line x1={padX} y1={y} x2={padX + chartW} y2={y} stroke={INK} strokeWidth={1} strokeDasharray="4 4" />
              <text x={padX - 12} y={y + 4} textAnchor="end" fontSize={11} fontFamily={HEADLINE} fill={INK} fontWeight={700}>
                {v}%
              </text>
            </g>
          );
        })}

        {/* Ana Veri Çizgisi */}
        <path
          d={pathD}
          fill="none"
          stroke={INK}
          strokeWidth={5}
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength * (1 - drawProg)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Kırmızı Vurgu Çizgisi */}
        <path
          d={pathD}
          fill="none"
          stroke={RED}
          strokeWidth={3}
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength * (1 - drawProg)}
          strokeLinecap="round"
          opacity={0.8}
        />

        {/* Veri Noktaları ve Dönüm Etiketleri */}
        {coords.map((pt, i) => {
          const ptTime = startFrame + 6 + Math.round((i / Math.max(1, coords.length - 1)) * 28);
          const pop = spring({
            frame: frame - ptTime,
            fps,
            config: { damping: 12, mass: 0.5, stiffness: 160 },
            durationInFrames: 18,
          });

          if (drawProg < (i / Math.max(1, coords.length - 1)) * 0.9) return null;

          const isHot = pt.isHighlight ?? (i === coords.length - 1 || i === Math.floor(coords.length / 2));

          return (
            <g key={i} transform={`translate(${pt.x}, ${pt.y}) scale(${pop})`}>
              <circle cx={0} cy={0} r={isHot ? 8 : 5} fill={isHot ? RED : INK} stroke={PAPER} strokeWidth={2.5} />

              {isHot ? (
                <g transform="translate(0, -36)">
                  <rect
                    x={-75}
                    y={-18}
                    width={150}
                    height={36}
                    fill={INK}
                    rx={4}
                  />
                  <polygon points="-8,18 8,18 0,26" fill={INK} />
                  <text
                    x={0}
                    y={-2}
                    textAnchor="middle"
                    fill={PAPER}
                    fontFamily={HEADLINE}
                    fontWeight={900}
                    fontSize={12}
                    letterSpacing={1}
                  >
                    {pt.year ? `${pt.year}: ` : ""}{pt.label.toUpperCase()}
                  </text>
                  <text
                    x={0}
                    y={12}
                    textAnchor="middle"
                    fill={RED}
                    fontFamily={HEADLINE}
                    fontWeight={900}
                    fontSize={11}
                  >
                    {pt.value}%
                  </text>
                </g>
              ) : (
                <text
                  x={0}
                  y={22}
                  textAnchor="middle"
                  fill={INK}
                  fontFamily={HEADLINE}
                  fontWeight={800}
                  fontSize={12}
                  opacity={0.7}
                >
                  {pt.year || pt.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── 6. INFLUENCE FLOW (SEBEP - MEKANİZMA - SONUÇ AKIŞ ŞEMASI) ─────────────

export interface FlowStage {
  title: string;
  desc?: string;
  tag?: string;
  color?: string;
}

/**
 * InfluenceFlow — Sebep-sonuç ilişkisini ve mekanizmayı gösteren animasyonlu akış şeması.
 * [Başlatıcı / Catalyst] ──(akış)──> [Kaldıraç / Mechanism] ──(akış)──> [Sonuç / Outcome]
 */
export const InfluenceFlow: React.FC<{
  stages: FlowStage[];
  startFrame: number;
  width?: number;
}> = ({
  stages,
  startFrame,
  width = 1040,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        position: "relative",
        width,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        zIndex: 12,
      }}
    >
      {stages.map((stg, i) => {
        const stageStart = startFrame + i * 12;
        const pop = spring({
          frame: frame - stageStart,
          fps,
          config: { damping: 14, mass: 0.7, stiffness: 140 },
          durationInFrames: 22,
        });

        const op = interpolate(frame, [stageStart, stageStart + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const cardColor = stg.color || (i === stages.length - 1 ? RED : INK);

        return (
          <React.Fragment key={i}>
            {/* Aşama Kartı */}
            <div
              style={{
                flex: 1,
                background: "#FBF9F4",
                border: `3px solid ${INK}`,
                borderRadius: 6,
                padding: "24px 20px",
                boxShadow: "0 14px 34px rgba(24,18,12,0.22)",
                transform: `scale(${interpolate(pop, [0, 1], [0.85, 1])})`,
                opacity: op,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                position: "relative",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    background: cardColor,
                    color: PAPER,
                    fontFamily: HEADLINE,
                    fontWeight: 900,
                    fontSize: 12,
                    letterSpacing: 2,
                    padding: "3px 8px",
                    borderRadius: 3,
                  }}
                >
                  STEP {i + 1}
                </span>
                {stg.tag ? (
                  <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: RED, fontWeight: 700 }}>
                    {stg.tag}
                  </span>
                ) : null}
              </div>

              <div
                style={{
                  fontFamily: HEADLINE,
                  fontWeight: 900,
                  fontSize: 26,
                  color: INK,
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                  letterSpacing: 0.5,
                }}
              >
                {stg.title}
              </div>

              {stg.desc ? (
                <div style={{ fontFamily: SERIF, fontSize: 14, color: "#444", lineHeight: 1.35 }}>
                  {stg.desc}
                </div>
              ) : null}
            </div>

            {/* İki Aşama Arasındaki Animasyonlu Akış Oku */}
            {i < stages.length - 1 ? (
              <div style={{ width: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={44} height={32} viewBox="0 0 44 32">
                  <path
                    d="M 0,16 L 34,16 M 24,6 L 34,16 L 24,26"
                    fill="none"
                    stroke={RED}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={interpolate(frame, [stageStart + 8, stageStart + 16], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })}
                  />
                </svg>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};
