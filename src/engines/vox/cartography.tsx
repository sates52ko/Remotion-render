import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { INK, RED, PAPER, HEADLINE, SERIF } from "./palette";

/**
 * cartography.tsx — Vektörel Harita ve Rota Motoru (Cartography & Route Tracking)
 *
 * Vox, Johnny Harris ve Fern'in en kritik anlatım aracı olan coğrafi harita ve rota sistemini
 * %100 SVG ve CPU-dostu olarak Remotion'a getirir.
 */

// ── 1. HAFİF VEKTÖREL HARİTA ÇİZGİLERİ (SVG LANDMASSES) ───────────────────

/**
 * Basitleştirilmiş, stilize edilmiş dünya kıtaları SVG yolları (World Map Geometries)
 * Aşırı ağır GeoJSON yerine hızlı render alan editoryal kıta formları.
 */
const CONTINENTS: Record<string, string> = {
  // Kuzey Amerika
  northAmerica:
    "M 140,80 L 190,65 L 260,70 L 310,110 L 290,160 L 250,210 L 220,280 L 180,240 L 160,180 L 120,130 Z M 210,40 L 250,30 L 270,55 L 230,55 Z",
  // Güney Amerika
  southAmerica:
    "M 230,290 L 280,310 L 310,360 L 290,440 L 260,490 L 240,420 L 220,340 Z",
  // Avrupa
  europe:
    "M 440,90 L 490,80 L 520,110 L 500,160 L 460,170 L 430,140 L 420,110 Z M 410,100 L 430,95 L 425,120 Z",
  // Afrika
  africa:
    "M 430,190 L 510,180 L 550,240 L 530,340 L 490,400 L 460,350 L 430,260 Z M 555,330 L 570,335 L 565,370 L 550,360 Z",
  // Asya & Avrasya
  asia:
    "M 510,80 L 620,60 L 740,80 L 810,130 L 780,220 L 710,230 L 640,290 L 590,240 L 530,210 L 510,140 Z M 650,240 L 690,245 L 670,300 Z",
  // Avustralya & Okyanusya
  oceania:
    "M 720,340 L 800,330 L 830,380 L 790,430 L 730,410 Z M 835,420 L 850,430 L 840,460 Z",
};

// ── 2. ROTA İZLEME (ANIMATED ROUTE FLIGHT PATH) ────────────────────────────

export const RouteFlightPath: React.FC<{
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startFrame: number;
  durationFrames?: number;
  color?: string;
  strokeWidth?: number;
}> = ({
  fromX,
  fromY,
  toX,
  toY,
  startFrame,
  durationFrames = 28,
  color = RED,
  strokeWidth = 4,
}) => {
  const frame = useCurrentFrame();

  const p = interpolate(frame, [startFrame, startFrame + durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  // Yay şeklinde kavisli yay (Quadratic Bezier)
  const midX = (fromX + toX) / 2;
  const midY = Math.min(fromY, toY) - Math.abs(toX - fromX) * 0.22;
  const d = `M ${fromX},${fromY} Q ${midX},${midY} ${toX},${toY}`;

  // Yaklaşık uzunluk
  const len = Math.hypot(toX - fromX, toY - fromY) * 1.25;

  return (
    <g>
      {/* Arka plan iz çizgisi */}
      <path
        d={d}
        fill="none"
        stroke={INK}
        strokeWidth={strokeWidth}
        strokeDasharray="6 6"
        opacity={0.25}
      />
      {/* Canlı animasyonlu rota */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth + 1}
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
        strokeLinecap="round"
      />
      {/* Çıkış noktası pini */}
      <circle cx={fromX} cy={fromY} r={6} fill={INK} stroke={PAPER} strokeWidth={2} />
    </g>
  );
};

// ── 3. HARİTA PİNİ VE RADAR DALGASI (DROP PIN & PULSE) ──────────────────────

export const DropPin: React.FC<{
  x: number;
  y: number;
  startFrame: number;
  label?: string;
  sublabel?: string;
  color?: string;
}> = ({ x, y, startFrame, label, sublabel, color = RED }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drop = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 11, mass: 0.6, stiffness: 180 },
    durationInFrames: 22,
  });

  const local = frame - startFrame;
  const pulse = local > 10 ? (local % 30) / 30 : 0;
  const pulseRadius = interpolate(pulse, [0, 1], [8, 44]);
  const pulseOp = interpolate(pulse, [0, 0.2, 1], [0, 0.7, 0]);

  const pinY = interpolate(drop, [0, 1], [-100, 0]);
  const op = interpolate(drop, [0, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Radar Dalgaları (Pulse Rings) */}
      {local > 8 ? (
        <circle cx={0} cy={0} r={pulseRadius} fill="none" stroke={color} strokeWidth={2.5} opacity={pulseOp} />
      ) : null}
      <circle cx={0} cy={0} r={5} fill={INK} />

      {/* Yukarıdan Düşen Teardrop İğne */}
      <g transform={`translate(0, ${pinY})`} opacity={op}>
        <path
          d="M 0,-4 L -14,-32 C -22,-44 -12,-56 0,-56 C 12,-56 22,-44 14,-32 Z"
          fill={color}
          stroke={INK}
          strokeWidth={3}
        />
        <circle cx={0} cy={-42} r={5} fill={PAPER} />

        {/* Konum Etiketi */}
        {label ? (
          <g transform="translate(18, -48)">
            <rect
              x={0}
              y={-18}
              width={label.length * 15 + 24}
              height={32}
              fill={INK}
              rx={2}
            />
            <text
              x={12}
              y={4}
              fill={PAPER}
              fontFamily={HEADLINE}
              fontWeight={900}
              fontSize={18}
              letterSpacing={1.5}
            >
              {label.toUpperCase()}
            </text>
            {sublabel ? (
              <text
                x={12}
                y={26}
                fill={color}
                fontFamily={SERIF}
                fontWeight={700}
                fontSize={13}
                fontStyle="italic"
              >
                {sublabel}
              </text>
            ) : null}
          </g>
        ) : null}
      </g>
    </g>
  );
};

// ── 4. KATLANMIŞ HARİTA İZLERİ (MAP CREASES & PAPER FOLDS) ────────────────

/**
 * MapCreases — 4'e katlanmış fiziksel harita katlama izleri ve gölgeleri (Quad-Fold Paper Creases)
 * Masaya açılmış dedektif haritası hissini pekiştirir.
 */
export const MapCreases: React.FC<{
  width?: number | string;
  height?: number | string;
  opacity?: number;
}> = ({ width = "100%", height = "100%", opacity = 0.55 }) => {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        pointerEvents: "none",
        zIndex: 15,
        opacity,
      }}
    >
      {/* Yatay Kat İzi (Orta çizgi: üstü açık, altı gölge) */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.7) 0%, rgba(0,0,0,0.3) 100%)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transform: "translateY(-50%)",
        }}
      />
      {/* Dikey Kat İzi (Orta çizgi: solu açık, sağı gölge) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          width: 2,
          background: "linear-gradient(to right, rgba(255,255,255,0.7) 0%, rgba(0,0,0,0.3) 100%)",
          boxShadow: "1px 0 3px rgba(0,0,0,0.2)",
          transform: "translateX(-50%)",
        }}
      />
      {/* 4 Çeyrek Köşe Kırışıklık Gölgeleri */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.08) 100%), linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.06) 100%)",
        }}
      />
      {/* Kat Kesim Noktası (Merkez Aşınması) */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.25)",
          transform: "translate(-50%, -50%)",
          filter: "blur(1px)",
        }}
      />
    </div>
  );
};

// ── 5. ANA HARİTA BİLEŞENİ (GEOMAP) ────────────────────────────────────────

export const GeoMap: React.FC<{
  startFrame: number;
  highlightRegion?: "europe" | "northAmerica" | "asia" | "middleEast" | "world";
  route?: { from: [number, number]; to: [number, number]; label?: string };
  targetLabel?: string;
  width?: number;
  height?: number;
  showCreases?: boolean;
}> = ({
  startFrame,
  highlightRegion = "world",
  route,
  targetLabel,
  width = 1100,
  height = 620,
  showCreases = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const unfold = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, mass: 0.8, stiffness: 120 },
    durationInFrames: 24,
  });

  const drawIn = interpolate(frame, [startFrame, startFrame + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const scale = interpolate(unfold, [0, 1], [0.94, 1]);
  const rot = interpolate(unfold, [0, 1], [1.5, 0]);

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        background: "#E7E4DC",
        border: `3px solid ${INK}`,
        boxShadow: "0 22px 50px rgba(30,24,18,0.3), inset 0 0 80px rgba(0,0,0,0.06)",
        overflow: "hidden",
        transform: `scale(${scale}) rotate(${rot}deg)`,
        zIndex: 10,
      }}
    >
      {showCreases ? <MapCreases /> : null}

      <svg
        width={width}
        height={height}
        viewBox="0 0 960 540"
        style={{ width: "100%", height: "100%" }}
      >
        {/* Koordinat Izgaraları (Latitude & Longitude lines) */}
        <g stroke={INK} strokeWidth={1} opacity={0.12} strokeDasharray="4 4">
          <line x1={0} y1={135} x2={960} y2={135} />
          <line x1={0} y1={270} x2={960} y2={270} /> {/* Ekvator */}
          <line x1={0} y1={405} x2={960} y2={405} />
          <line x1={240} y1={0} x2={240} y2={540} />
          <line x1={480} y1={0} x2={480} y2={540} /> {/* Başlangıç meridyeni */}
          <line x1={720} y1={0} x2={720} y2={540} />
        </g>

        {/* Kıtalar ve Kara Parçaları */}
        <g opacity={drawIn}>
          {Object.entries(CONTINENTS).map(([key, path]) => {
            const isHighlighted =
              highlightRegion === "world" ||
              (highlightRegion === "europe" && key === "europe") ||
              (highlightRegion === "northAmerica" && key === "northAmerica") ||
              (highlightRegion === "asia" && key === "asia");

            return (
              <path
                key={key}
                d={path}
                fill={isHighlighted ? (key === highlightRegion ? RED : "#C6C2B4") : "#D4D0C4"}
                stroke={INK}
                strokeWidth={key === highlightRegion ? 3 : 1.8}
                opacity={key === highlightRegion ? 0.88 : 0.65}
              />
            );
          })}
        </g>

        {/* Rota Animasyonu */}
        {route ? (
          <RouteFlightPath
            fromX={route.from[0]}
            fromY={route.from[1]}
            toX={route.to[0]}
            toY={route.to[1]}
            startFrame={startFrame + 12}
          />
        ) : null}

        {/* Varış Noktası Pini */}
        {route ? (
          <DropPin
            x={route.to[0]}
            y={route.to[1]}
            startFrame={startFrame + 34}
            label={targetLabel || route.label}
          />
        ) : targetLabel ? (
          <DropPin
            x={480}
            y={180}
            startFrame={startFrame + 16}
            label={targetLabel}
          />
        ) : null}

        {/* Harita Kenar Koordinat Cetveli (Compass & Scale ticks) */}
        <g fill={INK} opacity={0.4} fontSize={10} fontFamily={HEADLINE}>
          <text x={14} y={24}>GRID: 48°N / 12°E</text>
          <text x={840} y={524}>SCALE: 1:50M</text>
        </g>
      </svg>
    </div>
  );
};
