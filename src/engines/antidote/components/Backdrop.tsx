import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { BgSpec } from "../schema";
import { ANTIDOTE_FONT } from "./KineticText";

/**
 * Backdrop — the world behind the cast.
 *
 * A flat color field is what makes a 45-minute video read as "template". This
 * draws the background as THREE PARALLAX LAYERS (far / mid / near) that drift
 * against the camera at different rates, plus an optional frame texture. All of
 * it is vector + CSS gradients: no images, no WebGL, negligible CPU cost on a
 * GPU-less render box.
 */

// Backdrop colors arrive from the planner as `rgb(...)` strings (the color
// script composes them), so a hex-only parser here would silently no-op.
const parseColor = (c: string): [number, number, number] | null => {
  const s = String(c).trim();
  const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = s.replace("#", "");
  const full = t.length === 3 ? t.split("").map((ch) => ch + ch).join("") : t;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const shade = (color: string, amt: number) => {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const to = amt < 0 ? 0 : 255;
  const a = Math.abs(amt);
  const [r0, g0, b0] = rgb;
  return `rgb(${Math.round(r0 + (to - r0) * a)},${Math.round(g0 + (to - g0) * a)},${Math.round(b0 + (to - b0) * a)})`;
};

export type LayerProps = { ink: string; accent: string; frame: number };

// ── sets: [far, mid, near] renderers, drawn in a 1920×1080 viewBox ──────────
export const SETS: Record<string, Array<React.FC<LayerProps>>> = {
  horizon: [
    ({ ink }) => (
      <g>
        <rect x={0} y={0} width={1920} height={640} fill={ink} opacity={0.06} />
        <circle cx={1520} cy={250} r={140} fill={ink} opacity={0.07} />
      </g>
    ),
    ({ ink }) => (
      <g fill={ink} opacity={0.13}>
        <path d="M-100,760 Q300,600 720,742 Q1100,868 1520,706 Q1760,614 2020,700 L2020,1080 L-100,1080 Z" />
      </g>
    ),
    ({ ink }) => <rect x={-100} y={906} width={2120} height={220} fill={ink} opacity={0.16} />,
  ],
  office: [
    ({ ink }) => (
      <g stroke={ink} strokeWidth={7} opacity={0.13} fill="none">
        <rect x={120} y={120} width={430} height={330} rx={10} />
        <line x1={335} y1={120} x2={335} y2={450} /><line x1={120} y1={285} x2={550} y2={285} />
        <rect x={1370} y={120} width={430} height={330} rx={10} />
        <line x1={1585} y1={120} x2={1585} y2={450} /><line x1={1370} y1={285} x2={1800} y2={285} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.18}>
        <rect x={1300} y={520} width={520} height={26} rx={8} fill={ink} />
        <rect x={1348} y={546} width={20} height={190} fill={ink} />
        <rect x={1752} y={546} width={20} height={190} fill={ink} />
        <rect x={1390} y={432} width={64} height={88} rx={6} fill={accent} />
        <rect x={1470} y={452} width={64} height={68} rx={6} fill={ink} />
        <rect x={100} y={560} width={210} height={22} rx={8} fill={ink} />
      </g>
    ),
    ({ ink }) => <rect x={-100} y={928} width={2120} height={200} fill={ink} opacity={0.14} />,
  ],
  street: [
    ({ ink }) => (
      <g fill={ink} opacity={0.1}>
        <rect x={60} y={330} width={190} height={560} /><rect x={280} y={430} width={150} height={460} />
        <rect x={470} y={250} width={210} height={640} /><rect x={1240} y={370} width={180} height={520} />
        <rect x={1450} y={280} width={230} height={610} /><rect x={1710} y={440} width={160} height={450} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        <rect x={-40} y={640} width={300} height={280} fill={ink} />
        <rect x={1660} y={600} width={320} height={320} fill={ink} />
        <rect x={352} y={520} width={14} height={400} fill={ink} />
        <circle cx={359} cy={506} r={26} fill={accent} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={900} width={2120} height={220} fill={ink} opacity={0.2} />
        <g stroke={ink} strokeWidth={10} opacity={0.14}>
          {[0, 260, 520, 780, 1040, 1300, 1560, 1820].map((x) => <line key={x} x1={x} y1={952} x2={x + 130} y2={952} />)}
        </g>
      </g>
    ),
  ],
  room: [
    ({ ink, accent }) => (
      <g>
        <rect x={640} y={140} width={300} height={230} rx={8} fill="none" stroke={ink} strokeWidth={9} opacity={0.16} />
        <rect x={676} y={176} width={228} height={158} fill={accent} opacity={0.12} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        <path d="M1560,470 L1720,470 L1770,600 L1510,600 Z" fill={accent} opacity={0.55} />
        <rect x={1630} y={600} width={18} height={300} fill={ink} />
        <rect x={1560} y={890} width={158} height={20} rx={8} fill={ink} />
        <rect x={150} y={700} width={430} height={200} rx={22} fill={ink} opacity={0.55} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={900} width={2120} height={220} fill={ink} opacity={0.15} />
        <rect x={-100} y={886} width={2120} height={20} fill={ink} opacity={0.25} />
      </g>
    ),
  ],
  stage: [
    ({ ink }) => (
      <g fill={ink} opacity={0.12}>
        {Array.from({ length: 14 }).map((_, i) => (
          <path key={i} d={`M${i * 150 - 40},0 Q${i * 150 + 34},400 ${i * 150 - 10},880 L${i * 150 + 62},880 Q${i * 150 + 106},400 ${i * 150 + 38},0 Z`} />
        ))}
      </g>
    ),
    ({ accent }) => (
      <g opacity={0.22}>
        <path d="M420,0 L640,0 L900,900 L200,900 Z" fill={accent} opacity={0.35} />
        <path d="M1280,0 L1500,0 L1720,900 L1020,900 Z" fill={accent} opacity={0.25} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <ellipse cx={960} cy={950} rx={780} ry={80} fill={ink} opacity={0.1} />
        <rect x={-100} y={940} width={2120} height={180} fill={ink} opacity={0.2} />
      </g>
    ),
  ],
  sky: [
    ({ ink }) => <circle cx={1560} cy={220} r={170} fill={ink} opacity={0.08} />,
    ({ ink, frame }) => (
      <g fill={ink} opacity={0.14}>
        <g transform={`translate(${(frame * 0.28) % 2400 - 300} 0)`}>
          <ellipse cx={300} cy={280} rx={190} ry={72} /><ellipse cx={430} cy={252} rx={130} ry={62} />
        </g>
        <g transform={`translate(${(frame * 0.16) % 2400 - 700} 0)`}>
          <ellipse cx={1180} cy={430} rx={220} ry={80} /><ellipse cx={1330} cy={400} rx={140} ry={66} />
        </g>
      </g>
    ),
    ({ ink }) => (
      <g fill={ink} opacity={0.18}>
        <path d="M-100,940 Q400,860 900,930 Q1400,1000 2020,912 L2020,1120 L-100,1120 Z" />
      </g>
    ),
  ],
  abstract: [
    ({ accent, ink }) => (
      <g>
        <circle cx={330} cy={250} r={280} fill={accent} opacity={0.1} />
        <circle cx={1620} cy={820} r={340} fill={ink} opacity={0.07} />
      </g>
    ),
    ({ ink, frame }) => (
      <g stroke={ink} strokeWidth={26} opacity={0.08} strokeLinecap="round">
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={i} x1={-200 + i * 330 + ((frame * 0.2) % 330)} y1={1180} x2={200 + i * 330 + ((frame * 0.2) % 330)} y2={-100} />
        ))}
      </g>
    ),
    ({ accent, frame }) => (
      <g fill={accent} opacity={0.22}>
        {Array.from({ length: 9 }).map((_, i) => {
          const x = 140 + i * 205;
          const y = 700 + Math.sin(frame * 0.02 + i) * 46;
          return <circle key={i} cx={x} cy={y} r={9 + (i % 3) * 4} />;
        })}
      </g>
    ),
  ],

  // ── REAL PLACES (Antidote 3.0) ────────────────────────────────────────────
  // The seven sets above are moods: a horizon, a stage, an abstract field. None
  // of them says WHERE a beat happens, so a dinner-table beat and a courtroom
  // beat shared a backdrop and the film had no geography. These are places, with
  // furniture a figure can stand among — same three-layer parallax vector budget
  // (no images, no WebGL), and the director now picks them from the beat's own
  // concept rather than from a genre rotation.
  kitchen: [
    ({ ink }) => (
      <g opacity={0.13}>
        {/* wall cabinets + backsplash */}
        <rect x={120} y={130} width={470} height={210} rx={8} fill={ink} />
        <line x1={355} y1={130} x2={355} y2={340} stroke={ink} strokeWidth={9} />
        <rect x={1300} y={130} width={400} height={210} rx={8} fill={ink} />
        <g stroke={ink} strokeWidth={4} opacity={0.7}>
          {[400, 460, 520].map((y) => <line key={y} x1={620} y1={y} x2={1280} y2={y} />)}
          {[700, 820, 940, 1060, 1180].map((x) => <line key={x} x1={x} y1={380} y2={540} x2={x} />)}
        </g>
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        {/* counter run + sink + tap */}
        <rect x={90} y={600} width={760} height={26} rx={8} fill={ink} />
        <rect x={110} y={626} width={720} height={300} fill={ink} opacity={0.55} />
        <rect x={330} y={608} width={190} height={14} rx={6} fill={accent} />
        <path d="M600,600 L600,548 Q600,530 626,530 L660,530" fill="none" stroke={ink} strokeWidth={11} />
        {/* fridge */}
        <rect x={1560} y={430} width={250} height={496} rx={12} fill={ink} opacity={0.6} />
        <line x1={1560} y1={606} x2={1810} y2={606} stroke={ink} strokeWidth={7} />
        <rect x={1770} y={520} width={12} height={70} rx={5} fill={accent} />
        {/* table + two chairs */}
        <rect x={980} y={720} width={420} height={22} rx={9} fill={ink} />
        <rect x={1010} y={742} width={16} height={186} fill={ink} />
        <rect x={1354} y={742} width={16} height={186} fill={ink} />
        <rect x={1040} y={636} width={16} height={110} fill={ink} opacity={0.7} />
        <rect x={1330} y={636} width={16} height={110} fill={ink} opacity={0.7} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={924} width={2120} height={200} fill={ink} opacity={0.16} />
        <rect x={-100} y={910} width={2120} height={18} fill={ink} opacity={0.26} />
      </g>
    ),
  ],
  bedroom: [
    ({ ink, accent }) => (
      <g>
        {/* window + curtains */}
        <rect x={1180} y={130} width={380} height={340} rx={8} fill={accent} opacity={0.16} />
        <rect x={1180} y={130} width={380} height={340} rx={8} fill="none" stroke={ink} strokeWidth={9} opacity={0.16} />
        <line x1={1370} y1={130} x2={1370} y2={470} stroke={ink} strokeWidth={7} opacity={0.16} />
        <path d="M1120,120 Q1160,300 1130,500 L1200,500 Q1220,300 1200,120 Z" fill={ink} opacity={0.12} />
        <path d="M1620,120 Q1580,300 1610,500 L1540,500 Q1520,300 1540,120 Z" fill={ink} opacity={0.12} />
        <rect x={280} y={190} width={220} height={160} rx={6} fill="none" stroke={ink} strokeWidth={8} opacity={0.13} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        {/* bed: headboard, mattress, pillow, blanket */}
        <rect x={200} y={480} width={40} height={330} rx={12} fill={ink} />
        <rect x={200} y={480} width={520} height={110} rx={16} fill={ink} opacity={0.75} />
        <rect x={220} y={660} width={780} height={150} rx={16} fill={ink} opacity={0.5} />
        <rect x={260} y={612} width={190} height={70} rx={22} fill="#FFFFFF" opacity={0.65} />
        <path d="M520,660 L1000,660 L1000,810 L520,810 Z" fill={accent} opacity={0.45} />
        <rect x={220} y={806} width={780} height={22} rx={8} fill={ink} />
        {/* nightstand + lamp */}
        <rect x={1060} y={700} width={150} height={128} rx={8} fill={ink} opacity={0.7} />
        <rect x={1126} y={618} width={14} height={84} fill={ink} />
        <path d="M1088,618 L1178,618 L1160,556 L1106,556 Z" fill={accent} opacity={0.6} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={906} width={2120} height={220} fill={ink} opacity={0.15} />
        <rect x={-100} y={892} width={2120} height={18} fill={ink} opacity={0.24} />
        <ellipse cx={960} cy={1010} rx={640} ry={54} fill={ink} opacity={0.07} />
      </g>
    ),
  ],
  classroom: [
    ({ ink, accent }) => (
      <g>
        {/* blackboard + chalk marks + clock */}
        <rect x={430} y={130} width={1060} height={400} rx={10} fill={ink} opacity={0.2} />
        <rect x={430} y={130} width={1060} height={400} rx={10} fill="none" stroke={ink} strokeWidth={12} opacity={0.2} />
        <g stroke="#FFFFFF" strokeWidth={6} opacity={0.28} strokeLinecap="round">
          <line x1={510} y1={230} x2={980} y2={230} />
          <line x1={510} y1={300} x2={1220} y2={300} />
          <line x1={510} y1={370} x2={860} y2={370} />
        </g>
        <circle cx={1700} cy={230} r={64} fill="none" stroke={ink} strokeWidth={10} opacity={0.18} />
        <g stroke={ink} strokeWidth={8} opacity={0.18} strokeLinecap="round">
          <line x1={1700} y1={230} x2={1700} y2={190} /><line x1={1700} y1={230} x2={1732} y2={244} />
        </g>
        <rect x={430} y={530} width={1060} height={18} fill={ink} opacity={0.24} />
        <rect x={640} y={512} width={90} height={18} rx={7} fill={accent} opacity={0.4} />
      </g>
    ),
    ({ ink }) => (
      <g opacity={0.19} fill={ink}>
        {/* two rows of desks */}
        {[0, 1, 2].map((i) => (
          <g key={`b${i}`} transform={`translate(${300 + i * 460} 640)`}>
            <rect x={0} y={0} width={300} height={18} rx={7} />
            <rect x={16} y={18} width={14} height={110} /><rect x={270} y={18} width={14} height={110} />
            <rect x={90} y={96} width={130} height={16} rx={6} opacity={0.7} />
          </g>
        ))}
        {[0, 1].map((i) => (
          <g key={`f${i}`} transform={`translate(${520 + i * 620} 790)`}>
            <rect x={0} y={0} width={340} height={20} rx={8} />
            <rect x={18} y={20} width={16} height={126} /><rect x={306} y={20} width={16} height={126} />
          </g>
        ))}
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={930} width={2120} height={200} fill={ink} opacity={0.15} />
        <g stroke={ink} strokeWidth={3} opacity={0.08}>
          {[0, 240, 480, 720, 960, 1200, 1440, 1680, 1920].map((x) => <line key={x} x1={x} y1={930} x2={x} y2={1080} />)}
        </g>
      </g>
    ),
  ],
  library: [
    ({ ink, accent }) => (
      <g opacity={0.14}>
        {/* wall of shelves, books as vertical bands */}
        {[0, 1, 2, 3, 4].map((r) => (
          <g key={r} transform={`translate(0 ${120 + r * 150})`}>
            <rect x={80} y={116} width={1760} height={14} fill={ink} />
            {Array.from({ length: 44 }).map((_, i) => {
              const h = 66 + ((i * 37 + r * 11) % 42);
              return <rect key={i} x={96 + i * 40} y={116 - h} width={26 + (i % 3) * 5} height={h} fill={i % 5 === 0 ? accent : ink} opacity={i % 5 === 0 ? 0.9 : 0.7} />;
            })}
          </g>
        ))}
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        {/* reading table + banker's lamp + chair */}
        <rect x={620} y={690} width={700} height={24} rx={9} fill={ink} />
        <rect x={660} y={714} width={20} height={214} fill={ink} />
        <rect x={1260} y={714} width={20} height={214} fill={ink} />
        <rect x={900} y={664} width={140} height={28} rx={5} fill="#FFFFFF" opacity={0.6} />
        <rect x={1140} y={630} width={12} height={62} fill={ink} />
        <path d="M1104,630 L1188,630 Q1196,630 1192,620 L1108,620 Q1100,620 1104,630 Z" fill={accent} opacity={0.85} />
        <rect x={1096} y={600} width={104} height={24} rx={10} fill={accent} opacity={0.7} />
        <rect x={480} y={640} width={18} height={288} fill={ink} opacity={0.6} />
        <rect x={470} y={632} width={130} height={16} rx={6} fill={ink} opacity={0.6} />
      </g>
    ),
    ({ ink, accent }) => (
      <g>
        <rect x={-100} y={912} width={2120} height={216} fill={ink} opacity={0.16} />
        <rect x={420} y={930} width={1080} height={120} rx={10} fill={accent} opacity={0.1} />
      </g>
    ),
  ],
  cafe: [
    ({ ink, accent }) => (
      <g>
        {/* street window + menu board */}
        <rect x={90} y={120} width={760} height={430} rx={8} fill={accent} opacity={0.14} />
        <rect x={90} y={120} width={760} height={430} rx={8} fill="none" stroke={ink} strokeWidth={11} opacity={0.16} />
        <line x1={470} y1={120} x2={470} y2={550} stroke={ink} strokeWidth={9} opacity={0.16} />
        <rect x={1180} y={150} width={560} height={300} rx={8} fill={ink} opacity={0.2} />
        <g stroke="#FFFFFF" strokeWidth={6} opacity={0.3} strokeLinecap="round">
          <line x1={1240} y1={230} x2={1560} y2={230} /><line x1={1240} y1={300} x2={1660} y2={300} />
          <line x1={1240} y1={370} x2={1460} y2={370} />
        </g>
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        {/* pendant lamps */}
        {[560, 860, 1160].map((x) => (
          <g key={x}>
            <line x1={x} y1={0} x2={x} y2={330} stroke={ink} strokeWidth={5} />
            <path d={`M${x - 54},390 L${x + 54},390 L${x + 30},330 L${x - 30},330 Z`} fill={accent} opacity={0.8} />
          </g>
        ))}
        {/* counter + espresso machine */}
        <rect x={1120} y={640} width={700} height={26} rx={9} fill={ink} />
        <rect x={1140} y={666} width={660} height={262} fill={ink} opacity={0.5} />
        <rect x={1420} y={556} width={150} height={86} rx={8} fill={ink} opacity={0.8} />
        <rect x={1452} y={532} width={86} height={26} rx={8} fill={accent} opacity={0.7} />
        {/* round table + two stools */}
        <ellipse cx={480} cy={718} rx={140} ry={26} fill={ink} />
        <rect x={470} y={730} width={20} height={196} fill={ink} />
        <ellipse cx={480} cy={928} rx={78} ry={16} fill={ink} opacity={0.8} />
        <ellipse cx={250} cy={800} rx={60} ry={16} fill={ink} opacity={0.7} />
        <rect x={242} y={806} width={16} height={122} fill={ink} opacity={0.7} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={924} width={2120} height={200} fill={ink} opacity={0.17} />
        {/* checker floor — alternating tiles, wider toward camera so the plane reads */}
        <g fill={ink} opacity={0.08}>
          {Array.from({ length: 12 }).map((_, i) => <rect key={`a${i}`} x={-40 + i * 176} y={936} width={88} height={56} />)}
          {Array.from({ length: 11 }).map((_, i) => <rect key={`b${i}`} x={48 + i * 176} y={996} width={104} height={84} />)}
        </g>
      </g>
    ),
  ],
  hospital: [
    ({ ink, accent }) => (
      <g opacity={0.14}>
        <rect x={-100} y={0} width={2120} height={520} fill={ink} opacity={0.4} />
        <rect x={-100} y={506} width={2120} height={16} fill={ink} />
        <circle cx={330} cy={220} r={62} fill="none" stroke={ink} strokeWidth={10} />
        <g stroke={ink} strokeWidth={8} strokeLinecap="round">
          <line x1={330} y1={220} x2={330} y2={182} /><line x1={330} y1={220} x2={358} y2={236} />
        </g>
        <rect x={1420} y={150} width={54} height={200} rx={6} fill={accent} />
        <rect x={1343} y={227} width={208} height={46} rx={6} fill={accent} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        {/* bed with raised head + rails */}
        <rect x={520} y={690} width={780} height={120} rx={14} fill="#FFFFFF" opacity={0.75} />
        <path d="M520,690 L520,600 Q520,586 546,586 L640,586 Q660,586 660,606 L660,690 Z" fill="#FFFFFF" opacity={0.6} />
        <rect x={520} y={806} width={780} height={22} rx={8} fill={ink} />
        <rect x={548} y={828} width={18} height={100} fill={ink} />
        <rect x={1254} y={828} width={18} height={100} fill={ink} />
        <rect x={700} y={664} width={420} height={14} rx={6} fill={ink} opacity={0.6} />
        {/* IV stand + bag */}
        <rect x={1400} y={470} width={12} height={458} fill={ink} />
        <rect x={1362} y={470} width={88} height={12} rx={5} fill={ink} />
        <rect x={1376} y={486} width={60} height={110} rx={12} fill={accent} opacity={0.7} />
        <path d="M1406,596 Q1406,660 1406,700" fill="none" stroke={ink} strokeWidth={5} />
        {/* curtain */}
        <path d="M1640,120 Q1660,500 1636,928 L1900,928 Q1876,500 1900,120 Z" fill={ink} opacity={0.14} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={926} width={2120} height={200} fill={ink} opacity={0.13} />
        <g stroke={ink} strokeWidth={3} opacity={0.07}>
          {[0, 260, 520, 780, 1040, 1300, 1560, 1820].map((x) => <line key={x} x1={x} y1={926} x2={x} y2={1080} />)}
        </g>
      </g>
    ),
  ],
  court: [
    ({ ink, accent }) => (
      <g opacity={0.15}>
        {/* panelled back wall + seal + flanking columns */}
        <rect x={-100} y={0} width={2120} height={620} fill={ink} opacity={0.35} />
        {[220, 500, 1420, 1700].map((x) => <rect key={x} x={x} y={60} width={130} height={560} rx={6} fill={ink} opacity={0.5} />)}
        <circle cx={960} cy={250} r={110} fill="none" stroke={accent} strokeWidth={12} />
        <circle cx={960} cy={250} r={68} fill={accent} opacity={0.35} />
        <rect x={100} y={0} width={70} height={620} fill={ink} opacity={0.4} />
        <rect x={1750} y={0} width={70} height={620} fill={ink} opacity={0.4} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.22}>
        {/* judge's bench + witness box */}
        <rect x={620} y={560} width={700} height={230} rx={10} fill={ink} opacity={0.75} />
        <rect x={600} y={540} width={740} height={34} rx={10} fill={ink} />
        <rect x={700} y={608} width={540} height={130} rx={6} fill={ink} opacity={0.4} />
        <rect x={1400} y={640} width={280} height={190} rx={8} fill={ink} opacity={0.6} />
        <rect x={1386} y={624} width={308} height={26} rx={9} fill={ink} />
        {/* gavel block */}
        <rect x={870} y={520} width={80} height={22} rx={8} fill={accent} opacity={0.8} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={900} width={2120} height={220} fill={ink} opacity={0.18} />
        {/* the rail between the gallery and the court */}
        <rect x={-100} y={856} width={2120} height={16} rx={6} fill={ink} opacity={0.3} />
        {[60, 340, 620, 900, 1180, 1460, 1740].map((x) => <rect key={x} x={x} y={866} width={16} height={64} fill={ink} opacity={0.26} />)}
      </g>
    ),
  ],
  forest: [
    ({ ink }) => (
      <g fill={ink} opacity={0.1}>
        {Array.from({ length: 16 }).map((_, i) => {
          const x = -60 + i * 130;
          const h = 420 + ((i * 53) % 180);
          return <path key={i} d={`M${x},900 L${x + 34},${900 - h} L${x + 68},900 Z`} />;
        })}
      </g>
    ),
    ({ ink, frame }) => (
      <g opacity={0.2}>
        {[140, 470, 1420, 1760].map((x, i) => (
          <g key={x} transform={`rotate(${Math.sin(frame / 240 + i) * 0.35} ${x} 900)`}>
            <path d={`M${x - 34},930 Q${x - 20},560 ${x - 26},170 L${x + 30},170 Q${x + 24},560 ${x + 38},930 Z`} fill={ink} />
            <path d={`M${x + 24},430 Q${x + 90},390 ${x + 130},330`} fill="none" stroke={ink} strokeWidth={13} strokeLinecap="round" />
            <path d={`M${x - 22},560 Q${x - 96},522 ${x - 140},468`} fill="none" stroke={ink} strokeWidth={11} strokeLinecap="round" />
          </g>
        ))}
      </g>
    ),
    ({ ink, accent }) => (
      <g>
        <path d="M-100,900 Q400,862 960,896 Q1520,930 2020,884 L2020,1120 L-100,1120 Z" fill={ink} opacity={0.2} />
        <g fill={accent} opacity={0.18}>
          {[180, 620, 1180, 1660].map((x, i) => <ellipse key={x} cx={x} cy={960 + (i % 2) * 26} rx={70} ry={20} />)}
        </g>
      </g>
    ),
  ],
  shore: [
    ({ ink }) => (
      <g>
        <rect x={0} y={0} width={1920} height={520} fill={ink} opacity={0.05} />
        <path d="M-100,520 Q220,440 520,516 L520,560 L-100,560 Z" fill={ink} opacity={0.1} />
        <circle cx={1480} cy={214} r={120} fill={ink} opacity={0.07} />
      </g>
    ),
    ({ ink, frame }) => (
      <g opacity={0.16} stroke={ink} strokeLinecap="round" fill="none">
        {Array.from({ length: 7 }).map((_, i) => {
          const y = 560 + i * 46;
          const drift = Math.sin(frame / (150 + i * 21) + i) * 26;
          return (
            <path
              key={i}
              d={`M${-140 + drift},${y} q90,-16 180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0 t180,0`}
              strokeWidth={7 - i * 0.4}
            />
          );
        })}
      </g>
    ),
    ({ ink, accent }) => (
      <g>
        <path d="M-100,900 Q560,856 1180,900 Q1620,930 2020,896 L2020,1120 L-100,1120 Z" fill={accent} opacity={0.2} />
        <g fill={ink} opacity={0.16}>
          <ellipse cx={300} cy={996} rx={54} ry={26} /><ellipse cx={402} cy={1022} rx={34} ry={16} />
          <ellipse cx={1560} cy={984} rx={44} ry={20} />
        </g>
      </g>
    ),
  ],
  highway: [
    ({ ink }) => (
      <g fill={ink} opacity={0.09}>
        <path d="M-100,640 Q260,520 640,620 Q1000,714 1400,584 Q1700,486 2020,596 L2020,760 L-100,760 Z" />
        {[240, 700, 1220, 1700].map((x) => (
          <g key={x}>
            <rect x={x} y={330} width={12} height={300} />
            <rect x={x - 60} y={340} width={132} height={12} />
            <rect x={x - 44} y={382} width={100} height={10} />
          </g>
        ))}
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        {/* guard rail */}
        <rect x={-100} y={742} width={2120} height={20} rx={8} fill={ink} />
        {[-40, 200, 440, 680, 920, 1160, 1400, 1640, 1880].map((x) => <rect key={x} x={x} y={762} width={14} height={70} fill={ink} opacity={0.8} />)}
        {/* overhead sign */}
        <rect x={1330} y={300} width={16} height={440} fill={ink} />
        <rect x={1150} y={250} width={430} height={130} rx={10} fill={accent} opacity={0.55} />
        <g stroke="#FFFFFF" strokeWidth={9} opacity={0.5} strokeLinecap="round">
          <line x1={1200} y1={296} x2={1470} y2={296} /><line x1={1200} y1={336} x2={1390} y2={336} />
        </g>
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={838} width={2120} height={280} fill={ink} opacity={0.22} />
        {/* centre line, widening toward camera */}
        <g fill="#FFFFFF" opacity={0.3}>
          {[0, 1, 2, 3, 4].map((i) => {
            const y = 866 + i * 46;
            const w = 60 + i * 34;
            const h = 12 + i * 5;
            return <rect key={i} x={960 - w / 2} y={y} width={w} height={h} rx={4} />;
          })}
        </g>
      </g>
    ),
  ],

  // ── TECH & SILICON VALLEY PLACES (Antidote 5.0) ───────────────────────────
  workstation: [
    ({ ink }) => (
      <g opacity={0.1}>
        {/* Modern office window / geometric acoustic wall panels */}
        <rect x={120} y={100} width={420} height={340} rx={12} fill="none" stroke={ink} strokeWidth={8} />
        <line x1={330} y1={100} x2={330} y2={440} stroke={ink} strokeWidth={6} />
        <line x1={120} y1={270} x2={540} y2={270} stroke={ink} strokeWidth={6} />
        {/* Wall shelving with tech manuals / books */}
        <rect x={1380} y={140} width={440} height={16} rx={6} fill={ink} />
        <rect x={1420} y={70} width={26} height={70} rx={4} fill={ink} />
        <rect x={1452} y={55} width={22} height={85} rx={4} fill={ink} opacity={0.7} />
        <rect x={1480} y={64} width={24} height={76} rx={4} fill={ink} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.22}>
        {/* Dual monitors on heavy ergonomic arm */}
        {/* Monitor 1 (Main IDE / Code Screen on Left) */}
        <rect x={260} y={320} width={460} height={280} rx={10} fill={ink} opacity={0.75} />
        <rect x={276} y={336} width={428} height={248} rx={6} fill="#0F172A" />
        {/* Syntax code lines */}
        <g fill={accent} opacity={0.85}>
          <rect x={296} y={360} width={90} height={12} rx={3} />
          <rect x={396} y={360} width={140} height={12} rx={3} fill="#38BDF8" />
          <rect x={320} y={386} width={180} height={10} rx={3} fill="#94A3B8" />
          <rect x={340} y={408} width={120} height={10} rx={3} fill="#A7F3D0" />
          <rect x={340} y={430} width={220} height={10} rx={3} fill="#FDE047" />
          <rect x={320} y={452} width={160} height={10} rx={3} fill="#38BDF8" />
          <rect x={296} y={476} width={70} height={12} rx={3} />
        </g>
        {/* Monitor 2 (Analytics / Dashboard on Right) */}
        <rect x={1200} y={340} width={440} height={260} rx={10} fill={ink} opacity={0.75} />
        <rect x={1214} y={354} width={412} height={232} rx={6} fill="#0F172A" />
        {/* Mini metric cards & growth chart */}
        <rect x={1234} y={374} width={110} height={50} rx={6} fill={accent} opacity={0.4} />
        <rect x={1360} y={374} width={110} height={50} rx={6} fill="#38BDF8" opacity={0.35} />
        <path d="M1234,540 L1320,480 L1410,510 L1520,440 L1600,420" fill="none" stroke={accent} strokeWidth={8} strokeLinecap="round" />
        {/* Heavy Desk & Stand */}
        <rect x={180} y={630} width={1560} height={32} rx={10} fill={ink} />
        <rect x={260} y={662} width={28} height={260} fill={ink} />
        <rect x={1632} y={662} width={28} height={260} fill={ink} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={920} width={2120} height={200} fill={ink} opacity={0.16} />
        <rect x={-100} y={906} width={2120} height={18} fill={ink} opacity={0.24} />
      </g>
    ),
  ],

  startupGarage: [
    ({ ink }) => (
      <g opacity={0.09}>
        {/* Industrial loft brick seams & ducting */}
        <line x1={-100} y1={80} x2={2020} y2={80} stroke={ink} strokeWidth={36} opacity={0.5} />
        {[0, 180, 360, 540, 720, 900, 1080, 1260, 1440, 1620, 1800].map((x) => (
          <rect key={x} x={x} y={62} width={16} height={36} fill={ink} />
        ))}
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.24}>
        {/* Big Architectural Glass Whiteboard on Left */}
        <rect x={120} y={220} width={620} height={420} rx={14} fill="rgba(255,255,255,0.4)" stroke={ink} strokeWidth={8} />
        {/* Flowchart Boxes on Whiteboard */}
        <rect x={160} y={260} width={140} height={60} rx={8} fill={accent} opacity={0.5} />
        <line x1={300} y1={290} x2={380} y2={290} stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <polygon points="380,282 396,290 380,298" fill={ink} />
        <rect x={400} y={260} width={150} height={60} rx={8} fill={ink} opacity={0.4} />
        <line x1={475} y1={320} x2={475} y2={390} stroke={ink} strokeWidth={6} strokeLinecap="round" />
        <polygon points="467,390 475,406 483,390" fill={ink} />
        <rect x={380} y={410} width={190} height={70} rx={10} fill={accent} opacity={0.7} />
        {/* Sticky Notes on board */}
        <rect x={590} y={260} width={50} height={50} rx={4} fill="#FDE047" opacity={0.9} />
        <rect x={650} y={275} width={50} height={50} rx={4} fill="#F472B6" opacity={0.9} />
        {/* Wall TV on Right displaying Key Metrics */}
        <rect x={1280} y={200} width={520} height={300} rx={12} fill={ink} opacity={0.8} />
        <rect x={1300} y={220} width={480} height={260} rx={6} fill="#0F172A" />
        <circle cx={1420} cy={350} r={50} fill="none" stroke={accent} strokeWidth={14} />
        <rect x={1510} y={320} width={210} height={20} rx={4} fill="#FFFFFF" opacity={0.8} />
        <rect x={1510} y={356} width={140} height={16} rx={4} fill={accent} />
        {/* Standing desk */}
        <rect x={1200} y={640} width={680} height={28} rx={8} fill={ink} />
        <rect x={1280} y={668} width={24} height={250} fill={ink} />
        <rect x={1780} y={668} width={24} height={250} fill={ink} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={918} width={2120} height={200} fill={ink} opacity={0.16} />
      </g>
    ),
  ],

  serverRoom: [
    ({ ink }) => (
      <g opacity={0.1}>
        {/* Perspective server hallway grid */}
        <line x1={0} y1={0} x2={800} y2={540} stroke={ink} strokeWidth={6} />
        <line x1={1920} y1={0} x2={1120} y2={540} stroke={ink} strokeWidth={6} />
        <rect x={800} y={260} width={320} height={340} fill={ink} opacity={0.1} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.25}>
        {/* Large Server Rack Left */}
        <rect x={80} y={180} width={420} height={740} rx={12} fill={ink} opacity={0.8} />
        <rect x={100} y={200} width={380} height={700} rx={8} fill="#0F172A" />
        {/* Server Blades with Blinking LEDs */}
        {Array.from({ length: 9 }).map((_, i) => (
          <g key={i} transform={`translate(120 ${220 + i * 74})`}>
            <rect x={0} y={0} width={340} height={60} rx={6} fill={ink} opacity={0.6} />
            <circle cx={20} cy={30} r={6} fill={accent} />
            <circle cx={40} cy={30} r={5} fill={i % 2 === 0 ? "#38BDF8" : "#22C55E"} />
            <rect x={66} y={24} width={180} height={12} rx={3} fill="#64748B" opacity={0.5} />
          </g>
        ))}
        {/* Large Server Rack Right */}
        <rect x={1420} y={180} width={420} height={740} rx={12} fill={ink} opacity={0.8} />
        <rect x={1440} y={200} width={380} height={700} rx={8} fill="#0F172A" />
        {Array.from({ length: 9 }).map((_, i) => (
          <g key={i} transform={`translate(1460 ${220 + i * 74})`}>
            <rect x={0} y={0} width={340} height={60} rx={6} fill={ink} opacity={0.6} />
            <circle cx={20} cy={30} r={6} fill={i % 3 === 0 ? "#EAB308" : accent} />
            <circle cx={40} cy={30} r={5} fill="#38BDF8" />
            <rect x={66} y={24} width={180} height={12} rx={3} fill="#64748B" opacity={0.5} />
          </g>
        ))}
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={920} width={2120} height={200} fill={ink} opacity={0.2} />
        {/* Raised floor tiles */}
        <g stroke={ink} strokeWidth={6} opacity={0.2}>
          {[0, 240, 480, 720, 960, 1200, 1440, 1680, 1920].map((x) => (
            <line key={x} x1={x} y1={920} x2={x} y2={1080} />
          ))}
        </g>
      </g>
    ),
  ],

  pitchStage: [
    ({ ink }) => (
      <g opacity={0.08}>
        {/* Elegant vertical acoustic wall fins */}
        {[0, 120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200, 1320, 1440, 1560, 1680, 1800].map((x) => (
          <rect key={x} x={x} y={0} width={24} height={800} fill={ink} />
        ))}
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.24}>
        {/* Giant Keynote / Pitch Screen in Background */}
        <rect x={980} y={160} width={820} height={460} rx={16} fill={ink} opacity={0.85} />
        <rect x={1002} y={182} width={776} height={416} rx={10} fill="#0F172A" />
        {/* Pitch Slide Content: Growth Bar Chart + Metric Tag */}
        <rect x={1040} y={220} width={280} height={36} rx={8} fill={accent} opacity={0.9} />
        <text x={1056} y={245} fill="#FFFFFF" fontSize={18} fontWeight="bold" fontFamily={ANTIDOTE_FONT}>
          48-HOUR VALIDATION
        </text>
        {/* Big Hockey-Stick Curve on Screen */}
        <path d="M1060,530 Q1300,520 1480,440 T1720,270" fill="none" stroke={accent} strokeWidth={12} strokeLinecap="round" />
        <circle cx={1720} cy={270} r={14} fill="#FFFFFF" stroke={accent} strokeWidth={6} />
        {/* Speaker Podium on Left */}
        <polygon points="260,540 380,540 420,920 220,920" fill={ink} opacity={0.7} />
        <rect x={220} y={520} width={200} height={24} rx={8} fill={accent} opacity={0.8} />
      </g>
    ),
    ({ ink }) => (
      <g>
        {/* Curved stage apron */}
        <path d="M-100,920 Q960,860 2020,920 L2020,1120 L-100,1120 Z" fill={ink} opacity={0.2} />
      </g>
    ),
  ],

  // ── CLASSICAL ANTIQUITY & PHILOSOPHY PLACES (Antidote 6.1) ───────────────
  agora: [
    ({ ink }) => (
      <g opacity={0.12}>
        {/* Distant Athenian Acropolis & Parthenon silhouette on hilltop */}
        <path d="M-100,680 Q300,560 760,630 Q1200,690 1560,570 Q1800,520 2020,580 L2020,1080 L-100,1080 Z" fill={ink} />
        {/* Acropolis Temple outline on the distant hill */}
        <rect x={1480} y={490} width={260} height={12} fill={ink} />
        <polygon points="1470,490 1610,430 1750,490" fill={ink} />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} x={1500 + i * 36} y={502} width={10} height={50} fill={ink} />
        ))}
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.2}>
        {/* Classical Stone Portico, Doric columns left and right, olive branch */}
        <rect x={80} y={160} width={220} height={36} rx={4} fill={ink} />
        <rect x={110} y={196} width={50} height={700} fill={ink} />
        <rect x={220} y={196} width={50} height={700} fill={ink} />
        {/* Pedestal with philosopher bust silhouette on right */}
        <rect x={1640} y={540} width={160} height={360} rx={6} fill={ink} />
        <ellipse cx={1720} cy={510} rx={45} ry={55} fill={accent} opacity={0.8} />
        <rect x={1700} y={480} width={40} height={30} fill={ink} opacity={0.5} />
        {/* Olive branch wreath / leaves */}
        <path d="M120,400 Q180,380 240,410 Q190,430 120,400 Z" fill={accent} opacity={0.6} />
      </g>
    ),
    ({ ink }) => (
      <g>
        {/* Agora stone flagstones */}
        <rect x={-100} y={896} width={2120} height={230} fill={ink} opacity={0.18} />
        <g stroke={ink} strokeWidth={4} opacity={0.15}>
          {[0, 280, 560, 840, 1120, 1400, 1680, 1960].map((x) => (
            <line key={x} x1={x} y1={896} x2={x - 60} y2={1080} />
          ))}
          <line x1={-100} y1={980} x2={2020} y2={980} />
        </g>
      </g>
    ),
  ],

  colonnade: [
    ({ ink }) => (
      <g opacity={0.14}>
        {/* Colonnade perspective receding into Mediterranean horizon */}
        <rect x={-100} y={0} width={2120} height={600} fill={ink} opacity={0.1} />
        {/* Distant pediment arch */}
        <polygon points="600,240 960,110 1320,240" fill={ink} opacity={0.4} />
        <rect x={620} y={240} width={680} height={30} fill={ink} opacity={0.5} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.24}>
        {/* Monumental Ionic columns framing left and right */}
        {/* Left column */}
        <rect x={120} y={40} width={180} height={42} rx={6} fill={ink} />
        <ellipse cx={210} cy={82} rx={95} ry={18} fill={accent} opacity={0.6} />
        <rect x={155} y={100} width={110} height={790} fill={ink} />
        {/* Fluting lines */}
        {[175, 195, 215, 235, 255].map((x) => (
          <line key={x} x1={x} y1={100} x2={x} y2={890} stroke="#FFFFFF" strokeWidth={3} opacity={0.2} />
        ))}
        {/* Right column */}
        <rect x={1620} y={40} width={180} height={42} rx={6} fill={ink} />
        <ellipse cx={1710} cy={82} rx={95} ry={18} fill={accent} opacity={0.6} />
        <rect x={1655} y={100} width={110} height={790} fill={ink} />
        {[1675, 1695, 1715, 1735, 1755].map((x) => (
          <line key={x} x1={x} y1={100} x2={x} y2={890} stroke="#FFFFFF" strokeWidth={3} opacity={0.2} />
        ))}
      </g>
    ),
    ({ ink }) => (
      <g>
        {/* Stepped marble stylobate */}
        <rect x={-100} y={880} width={2120} height={40} fill={ink} opacity={0.25} />
        <rect x={-100} y={920} width={2120} height={200} fill={ink} opacity={0.16} />
      </g>
    ),
  ],

  cave: [
    ({ ink, accent }) => (
      <g opacity={0.3}>
        {/* Dark underground cavern ceiling stalactites */}
        <path d="M-100,0 L2020,0 L2020,320 Q1700,450 1500,280 Q1300,150 1100,340 Q900,200 700,310 Q400,160 -100,280 Z" fill={ink} />
        {/* High diagonal opening with exit ray of light */}
        <polygon points="1750,0 1880,0 1520,700 1380,700" fill="#FFFBEB" opacity={0.18} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.26}>
        {/* Low stone puppet screen wall */}
        <rect x={260} y={580} width={1400} height={310} rx={8} fill={ink} />
        {/* Warm flickering firelight glow behind the wall */}
        <ellipse cx={960} cy={540} rx={420} ry={120} fill={accent} opacity={0.45} />
        {/* Puppet poles / shadows poking over the screen */}
        <line x1={600} y1={580} x2={600} y2={450} stroke={ink} strokeWidth={8} />
        <polygon points="560,450 640,450 600,390" fill={ink} />
        <line x1={1200} y1={580} x2={1200} y2={430} stroke={ink} strokeWidth={8} />
        <circle cx={1200} cy={400} r={32} fill={ink} />
      </g>
    ),
    ({ ink }) => (
      <g>
        {/* Cave floor with scattered iron chains */}
        <rect x={-100} y={890} width={2120} height={230} fill={ink} opacity={0.3} />
        {/* Chain links lying on rock floor */}
        <g stroke={ink} strokeWidth={6} fill="none" opacity={0.5}>
          <ellipse cx={450} cy={950} rx={28} ry={14} />
          <ellipse cx={490} cy={952} rx={28} ry={14} />
          <ellipse cx={530} cy={950} rx={28} ry={14} />
          <ellipse cx={1380} cy={940} rx={28} ry={14} />
          <ellipse cx={1420} cy={942} rx={28} ry={14} />
        </g>
      </g>
    ),
  ],

  shipDeck: [
    ({ ink }) => (
      <g opacity={0.16}>
        {/* Midnight sky with constellation navigation stars */}
        <rect x={-100} y={0} width={2120} height={600} fill={ink} opacity={0.4} />
        {/* Navigational stars & lines (Ursa / Polaris) */}
        {[[300, 120], [420, 160], [540, 150], [660, 220], [780, 210], [920, 160], [1050, 120]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={5} fill="#FFFFFF" opacity={0.9} />
        ))}
        <path d="M300,120 L420,160 L540,150 L660,220 L780,210 L920,160 L1050,120" fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.4} />
        {/* Ocean waves on horizon */}
        <path d="M-100,600 Q200,560 500,600 Q800,640 1100,600 Q1400,560 1700,600 Q1900,630 2020,600 L2020,1080 L-100,1080 Z" fill={ink} opacity={0.4} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.25}>
        {/* Ship's main wooden mast and taut rigging ropes */}
        <rect x={930} y={0} width={60} height={890} fill={ink} />
        <line x1={960} y1={120} x2={200} y2={880} stroke={ink} strokeWidth={6} />
        <line x1={960} y1={120} x2={1720} y2={880} stroke={ink} strokeWidth={6} />
        {/* Wooden ship gunwale / railing */}
        <rect x={-100} y={780} width={2120} height={24} rx={6} fill={accent} opacity={0.7} />
        {[100, 350, 600, 850, 1100, 1350, 1600, 1850].map((x) => (
          <rect key={x} x={x} y={804} width={18} height={80} fill={ink} />
        ))}
      </g>
    ),
    ({ ink }) => (
      <g>
        {/* Wooden deck planks with brass bolts */}
        <rect x={-100} y={880} width={2120} height={240} fill={ink} opacity={0.22} />
        <g stroke={ink} strokeWidth={5} opacity={0.2}>
          {[0, 180, 360, 540, 720, 900, 1080, 1260, 1440, 1620, 1800].map((x) => (
            <line key={x} x1={x} y1={880} x2={x} y2={1080} />
          ))}
        </g>
      </g>
    ),
  ],

  manuscript: [
    ({ ink }) => (
      <g opacity={0.1}>
        {/* Huge architectural / parchment drafting grid */}
        <rect x={120} y={80} width={1680} height={660} fill="none" stroke={ink} strokeWidth={6} />
        {/* Geometric circles, golden ratio spirals, compass arcs */}
        <circle cx={960} cy={410} r={280} fill="none" stroke={ink} strokeWidth={4} />
        <circle cx={960} cy={410} r={180} fill="none" stroke={ink} strokeWidth={3} />
        <circle cx={960} cy={410} r={80} fill="none" stroke={ink} strokeWidth={3} />
        <line x1={600} y1={410} x2={1320} y2={410} stroke={ink} strokeWidth={3} />
        <line x1={960} y1={100} x2={960} y2={720} stroke={ink} strokeWidth={3} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.22}>
        {/* Heavy wooden scholar's table with rolled papyrus scroll */}
        <rect x={240} y={640} width={1440} height={32} rx={8} fill={ink} />
        {/* Rolled scroll with red wax seal */}
        <rect x={360} y={590} width={220} height={46} rx={12} fill="#FFFBEB" opacity={0.8} />
        <circle cx={470} cy={613} r={16} fill={accent} />
        {/* Drafting divider compass */}
        <path d="M1420,530 L1380,635 M1420,530 L1460,635" stroke={ink} strokeWidth={9} strokeLinecap="round" />
        <circle cx={1420} cy={530} r={10} fill={accent} />
      </g>
    ),
    ({ ink }) => (
      <g>
        <rect x={-100} y={900} width={2120} height={220} fill={ink} opacity={0.16} />
      </g>
    ),
  ],
  // ── CAMUS ABSURDISM (Antidote 6.2) ──────────────────────────────────────────
  // The mythic slope of Sisyphus: a hard indifferent sky over an unyielding
  // grey incline. Declared only by the camus-absurdism world; no other book
  // may stage here.
  mountainSlope: [
    ({ ink }) => (
      <g>
        <circle cx={1520} cy={230} r={130} fill={ink} opacity={0.08} />
        <circle cx={1520} cy={230} r={90} fill="none" stroke={ink} strokeWidth={5} opacity={0.18} />
      </g>
    ),
    ({ ink, accent }) => (
      <g opacity={0.16}>
        <polygon points="-100,860 900,360 1150,420 300,940 300,1080 -100,1080" fill={ink} />
        <line x1={-20} y1={810} x2={880} y2={392} stroke={ink} strokeWidth={8} strokeLinecap="round" />
        <line x1={120} y1={800} x2={760} y2={470} stroke={accent} strokeWidth={5} strokeDasharray="22 18" strokeLinecap="round" />
      </g>
    ),
    ({ ink }) => <rect x={-100} y={928} width={2120} height={200} fill={ink} opacity={0.2} />,
  ],
};

// ── textures: static CSS tiles, so they cost nothing per frame ──────────────
function textureStyle(texture: BgSpec["texture"], ink: string): React.CSSProperties | null {
  switch (texture) {
    case "grain":
      return {
        backgroundImage: `radial-gradient(${ink} 0.5px, transparent 0.6px)`,
        backgroundSize: "3px 3px",
        opacity: 0.11,
        mixBlendMode: "multiply",
      };
    case "dots":
      return {
        backgroundImage: `radial-gradient(${ink} 2.2px, transparent 2.4px)`,
        backgroundSize: "42px 42px",
        opacity: 0.09,
      };
    case "grid":
      return {
        backgroundImage: `linear-gradient(${ink} 1.5px, transparent 1.5px), linear-gradient(90deg, ${ink} 1.5px, transparent 1.5px)`,
        backgroundSize: "96px 96px",
        opacity: 0.08,
      };
    case "rays":
      return {
        backgroundImage: `repeating-conic-gradient(from 0deg at 50% -12%, ${ink} 0deg 3deg, transparent 3deg 9deg)`,
        opacity: 0.06,
      };
    case "paper":
      return {
        backgroundImage: `
          radial-gradient(${ink} 0.7px, transparent 0.9px),
          repeating-linear-gradient(45deg, ${ink} 0, ${ink} 0.5px, transparent 0.5px, transparent 5px),
          repeating-linear-gradient(-45deg, ${ink} 0, ${ink} 0.5px, transparent 0.5px, transparent 5px)
        `,
        backgroundSize: "6px 6px, 16px 16px, 16px 16px",
        opacity: 0.13,
        mixBlendMode: "multiply",
      };
    default:
      return null;
  }
}

const Layer: React.FC<{ children: React.ReactNode; dx: number; dy: number; dz: number; blur?: number }> = ({ children, dx, dy, dz, blur = 0 }) => (
  <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${dz})`, transformOrigin: "center", filter: blur > 0.1 ? `blur(${blur}px)` : undefined }}>
    <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style={{ overflow: "visible" }}>
      {children}
    </svg>
  </AbsoluteFill>
);

export const Backdrop: React.FC<{ bg: BgSpec; cam: { x: number; y: number; scale: number } }> = ({ bg, cam }) => {
  const frame = useCurrentFrame();
  const colors = bg.colors && bg.colors.length ? bg.colors : ["#8FC0E8"];
  const base =
    bg.type === "gradient" && colors.length >= 2
      ? `linear-gradient(180deg, ${colors[0]}, ${colors[colors.length - 1]})`
      : colors[0];
  const ink = bg.accent || shade(colors[colors.length - 1], -0.62);
  const accent = bg.accent || shade(colors[0], -0.35);
  const layers = SETS[bg.set] || null;
  const tex = textureStyle(bg.texture, ink);

  return (
    <AbsoluteFill>
      {/* split field: two color halves for the `split` shot */}
      {bg.split && bg.split.length >= 2 ? (
        <AbsoluteFill>
          <div style={{ position: "absolute", inset: 0, width: "50%", background: bg.split[0] }} />
          <div style={{ position: "absolute", inset: 0, left: "50%", width: "50%", background: bg.split[1] }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 8, marginLeft: -4, background: ink, opacity: 0.45 }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: base }} />
      )}

      {layers ? (
        <>
          {/* Depth-of-field: far layer blurs most when the camera zooms in,
              mid gets light blur, near stays sharp — cinematic rack focus. */}
          {(() => {
            const zoomAmt = Math.max(0, cam.scale - 1); // 0 at rest, grows with zoom
            const farBlur = Math.min(6, zoomAmt * 18);    // up to 6px
            const midBlur = Math.min(2.5, zoomAmt * 7);   // up to 2.5px
            // AMBIENT PARALLAX — a camera at rest used to freeze the whole
            // backdrop. Each depth layer now breathes on its own slow, desynced
            // cycle, so the set keeps depth even in a locked-off shot. Far layer
            // moves most (it reads as distance), near layer barely at all.
            const amb = (period: number, phase: number, px: number) =>
              Math.sin((frame / period) * Math.PI * 2 + phase) * px;
            return (
              <>
                <Layer dx={cam.x * 0.22 + amb(263, 0, 14)} dy={cam.y * 0.22 + amb(197, 1.1, 8)} dz={1 + (cam.scale - 1) * 0.25} blur={farBlur}>
                  {React.createElement(layers[0], { ink, accent, frame })}
                </Layer>
                <Layer dx={cam.x * 0.55 + amb(211, 2.3, 8)} dy={cam.y * 0.55 + amb(179, 0.4, 5)} dz={1 + (cam.scale - 1) * 0.6} blur={midBlur}>
                  {React.createElement(layers[1], { ink, accent, frame })}
                </Layer>
                <Layer dx={cam.x * 0.88 + amb(307, 4.1, 4)} dy={cam.y * 0.88 + amb(233, 3.0, 3)} dz={1 + (cam.scale - 1) * 0.9}>
                  {React.createElement(layers[2], { ink, accent, frame })}
                </Layer>
              </>
            );
          })()}
        </>
      ) : null}

      {tex ? <AbsoluteFill style={tex} /> : null}
      {/* a soft vignette keeps the eye centered and stops flat fields reading as slides */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.16) 100%)" }} />
    </AbsoluteFill>
  );
};
