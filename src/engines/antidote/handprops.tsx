import React from "react";
import type { HandProp } from "./schema";

/**
 * handprops.tsx — the things a character can actually HOLD.
 *
 * The motif library and the character rig existed side by side and never
 * touched: a beat about a letter drew a 500px letter next to a person whose
 * hands hung at their sides. That is the difference between "an illustration
 * about a letter" and "someone reading a letter", and it is most of what makes
 * the reference channel read as animation rather than as slides.
 *
 * Each glyph draws around its own ORIGIN (0,0) inside roughly a ±62 box, in the
 * rig's own 400×600/400×900 viewBox units, so the rig can drop it straight into
 * the hand group and let the arm's rotation carry it. Pure vector, two colors,
 * no per-frame math — a held prop costs the renderer nothing.
 */

type G = React.FC<{ ink: string; accent: string }>;

const Book: G = ({ ink, accent }) => (
  <g>
    <path d="M-52,-34 L-2,-26 L-2,38 L-52,30 Z" fill={accent} />
    <path d="M52,-34 L2,-26 L2,38 L52,30 Z" fill={accent} />
    <path d="M-52,-34 L-2,-26 L2,-26 L52,-34 L52,-40 L2,-32 L-2,-32 L-52,-40 Z" fill={ink} opacity={0.8} />
    <rect x={-3} y={-30} width={6} height={70} fill={ink} opacity={0.75} />
  </g>
);

const Phone: G = ({ ink, accent }) => (
  <g>
    <rect x={-28} y={-48} width={56} height={96} rx={10} fill={ink} />
    <rect x={-21} y={-38} width={42} height={70} rx={4} fill={accent} opacity={0.85} />
    <circle cx={0} cy={40} r={5} fill={accent} opacity={0.5} />
  </g>
);

const Key: G = ({ ink, accent }) => (
  <g>
    <circle cx={-28} cy={0} r={22} fill="none" stroke={accent} strokeWidth={11} />
    <rect x={-8} y={-6} width={62} height={12} rx={4} fill={accent} />
    <rect x={30} y={4} width={10} height={18} rx={3} fill={accent} />
    <rect x={48} y={4} width={10} height={14} rx={3} fill={accent} />
  </g>
);

const Notes: G = ({ ink, accent }) => (
  <g>
    <rect x={-44} y={-46} width={88} height={92} rx={5} fill="#FFFFFF" />
    <rect x={-44} y={-46} width={88} height={16} fill={accent} />
    <g stroke={ink} strokeWidth={5} strokeLinecap="round" opacity={0.55}>
      <line x1={-30} y1={-14} x2={30} y2={-14} />
      <line x1={-30} y1={4} x2={30} y2={4} />
      <line x1={-30} y1={22} x2={8} y2={22} />
    </g>
  </g>
);

const Letter: G = ({ ink, accent }) => (
  <g>
    <rect x={-56} y={-36} width={112} height={72} rx={5} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
    <path d="M-56,-36 L0,10 L56,-36" fill="none" stroke={accent} strokeWidth={7} strokeLinejoin="round" />
  </g>
);

const Coin: G = ({ ink, accent }) => (
  <g>
    <circle cx={0} cy={0} r={40} fill={accent} />
    <circle cx={0} cy={0} r={40} fill="none" stroke={ink} strokeWidth={5} opacity={0.5} />
    <text x={0} y={15} textAnchor="middle" fontSize={46} fontWeight={800} fill={ink} opacity={0.7} fontFamily="Georgia, serif">$</text>
  </g>
);

const Cup: G = ({ ink, accent }) => (
  <g>
    <path d="M-34,-26 L34,-26 L28,34 Q26,44 14,44 L-14,44 Q-26,44 -28,34 Z" fill={accent} />
    <path d="M34,-14 Q58,-12 56,8 Q54,26 32,26" fill="none" stroke={accent} strokeWidth={9} />
    <rect x={-36} y={-32} width={72} height={10} rx={4} fill={ink} opacity={0.75} />
  </g>
);

const Lightbulb: G = ({ ink, accent }) => (
  <g>
    <path d="M0,-52 Q34,-52 34,-16 Q34,6 18,20 L18,32 L-18,32 L-18,20 Q-34,6 -34,-16 Q-34,-52 0,-52 Z" fill={accent} />
    <rect x={-18} y={34} width={36} height={9} rx={3} fill={ink} />
    <rect x={-14} y={46} width={28} height={9} rx={3} fill={ink} />
    <path d="M-10,-4 L0,-22 L10,-4" fill="none" stroke={ink} strokeWidth={5} opacity={0.55} />
  </g>
);

const Mask: G = ({ ink, accent }) => (
  <g>
    <path d="M-46,-30 Q0,-44 46,-30 Q46,20 0,44 Q-46,20 -46,-30 Z" fill={accent} />
    <ellipse cx={-18} cy={-8} rx={11} ry={7} fill={ink} />
    <ellipse cx={18} cy={-8} rx={11} ry={7} fill={ink} />
    <path d="M-14,20 Q0,28 14,20" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
    <rect x={44} y={-14} width={22} height={6} rx={3} fill={ink} opacity={0.6} />
  </g>
);

const Photo: G = ({ ink, accent }) => (
  <g>
    <rect x={-46} y={-40} width={92} height={84} rx={4} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
    <rect x={-38} y={-32} width={76} height={54} fill={accent} opacity={0.55} />
    <circle cx={-14} cy={-14} r={9} fill={ink} opacity={0.5} />
    <path d="M-38,22 L-8,-4 L14,14 L30,2 L38,22 Z" fill={ink} opacity={0.5} />
  </g>
);

const Mirror: G = ({ ink, accent }) => (
  <g>
    <ellipse cx={0} cy={-10} rx={36} ry={44} fill={accent} opacity={0.55} stroke={ink} strokeWidth={7} />
    <path d="M-16,-30 L6,-4" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" opacity={0.7} />
    <rect x={-7} y={32} width={14} height={30} rx={5} fill={ink} />
  </g>
);

const Flower: G = ({ ink, accent }) => (
  <g>
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} cx={0} cy={-24} rx={13} ry={22} fill={accent} transform={`rotate(${a} 0 -4)`} />
    ))}
    <circle cx={0} cy={-4} r={11} fill={ink} opacity={0.75} />
    <path d="M0,6 Q4,32 0,54" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" opacity={0.7} />
  </g>
);

const Compass: G = ({ ink, accent }) => (
  <g>
    <circle cx={0} cy={0} r={40} fill="#FFFFFF" stroke={ink} strokeWidth={6} />
    <path d="M0,-26 L11,4 L0,26 L-11,4 Z" fill={accent} />
    <circle cx={0} cy={0} r={5} fill={ink} />
  </g>
);

const Briefcase: G = ({ ink, accent }) => (
  <g>
    <rect x={-52} y={-22} width={104} height={68} rx={7} fill={accent} />
    <rect x={-52} y={0} width={104} height={9} fill={ink} opacity={0.35} />
    <path d="M-18,-22 L-18,-34 Q-18,-40 -12,-40 L12,-40 Q18,-40 18,-34 L18,-22" fill="none" stroke={ink} strokeWidth={7} />
    <rect x={-9} y={-2} width={18} height={14} rx={3} fill={ink} opacity={0.6} />
  </g>
);

const Shield: G = ({ ink, accent }) => (
  <g>
    <path d="M-36,-44 L36,-44 Q36,12 0,52 Q-36,12 -36,-44 Z" fill={accent} stroke={ink} strokeWidth={5} />
    <path d="M-24,-34 L24,-34 Q24,6 0,38 Q-24,6 -24,-34 Z" fill="#FFFFFF" opacity={0.3} />
    <path d="M0,-30 L0,32" stroke={ink} strokeWidth={6} strokeLinecap="round" opacity={0.7} />
    <path d="M-20,-10 L20,-10" stroke={ink} strokeWidth={6} strokeLinecap="round" opacity={0.7} />
  </g>
);

const Trophy: G = ({ ink, accent }) => (
  <g>
    <rect x={-24} y={32} width={48} height={14} rx={3} fill={ink} />
    <rect x={-8} y={16} width={16} height={18} rx={2} fill={accent} stroke={ink} strokeWidth={3} />
    <path d="M-32,-38 L32,-38 L26,6 Q22,18 0,18 Q-22,18 -26,6 Z" fill={accent} stroke={ink} strokeWidth={5} />
    <path d="M-32,-26 Q-50,-24 -46,-4 Q-42,12 -24,8" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
    <path d="M32,-26 Q50,-24 46,-4 Q42,12 24,8" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
    <polygon points="0,-18 3,-10 11,-10 5,-4 7,4 0,0 -7,4 -5,-4 -11,-10 -3,-10" fill="#FFFFFF" opacity={0.9} />
  </g>
);

const Hourglass: G = ({ ink, accent }) => (
  <g>
    <rect x={-30} y={-44} width={60} height={10} rx={3} fill={ink} />
    <rect x={-30} y={34} width={60} height={10} rx={3} fill={ink} />
    <path d="M-24,-34 C-24,-12 -6,-4 0,0 C6,-4 24,-12 24,-34 Z" fill="rgba(255,255,255,0.2)" stroke={ink} strokeWidth={4} />
    <path d="M-24,34 C-24,12 -6,4 0,0 C6,4 24,12 24,34 Z" fill="rgba(255,255,255,0.2)" stroke={ink} strokeWidth={4} />
    <path d="M-18,-30 C-18,-20 -8,-10 0,-3 C8,-10 18,-20 18,-30 Z" fill={accent} />
    <path d="M-19,30 C-19,20 -6,14 0,7 C6,14 19,20 19,30 Z" fill={accent} />
    <line x1={0} y1={-3} x2={0} y2={8} stroke={accent} strokeWidth={3} strokeDasharray="3 3" />
  </g>
);

const Sword: G = ({ ink, accent }) => (
  <g transform="rotate(35)">
    <path d="M-7,12 L-5,-50 L0,-62 L5,-50 L7,12 Z" fill="#E2E8F0" stroke={ink} strokeWidth={4} />
    <line x1={0} y1={-54} x2={0} y2={12} stroke={ink} strokeWidth={2} opacity={0.5} />
    <rect x={-24} y={12} width={48} height={9} rx={3} fill={accent} stroke={ink} strokeWidth={3} />
    <rect x={-4} y={21} width={8} height={18} rx={2} fill={ink} />
    <circle cx={0} cy={44} r={7} fill={accent} stroke={ink} strokeWidth={3} />
  </g>
);

const Target: G = ({ ink, accent }) => (
  <g>
    <circle cx={0} cy={0} r={44} fill={accent} stroke={ink} strokeWidth={5} />
    <circle cx={0} cy={0} r={32} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
    <circle cx={0} cy={0} r={20} fill={accent} stroke={ink} strokeWidth={4} />
    <circle cx={0} cy={0} r={8} fill="#FFFFFF" />
    <path d="M-28,-28 L0,0" stroke={ink} strokeWidth={6} strokeLinecap="round" />
    <path d="M-36,-36 L-24,-28 L-28,-24 Z" fill={accent} stroke={ink} strokeWidth={2} />
  </g>
);

const Magnifier: G = ({ ink, accent }) => (
  <g transform="rotate(-25)">
    <circle cx={-4} cy={-12} r={30} fill="rgba(255,255,255,0.4)" stroke={accent} strokeWidth={9} />
    <circle cx={-4} cy={-12} r={30} fill="none" stroke={ink} strokeWidth={3} />
    <path d="M-22,-24 A22,22 0 0,1 6,-32" fill="none" stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
    <rect x={18} y={8} width={14} height={38} rx={6} fill={ink} transform="rotate(-45 25 27)" />
  </g>
);

const Wallet: G = ({ ink, accent }) => (
  <g>
    <rect x={-32} y={-36} width={64} height={20} rx={3} fill="#10B981" stroke={ink} strokeWidth={3} />
    <line x1={-20} y1={-26} x2={20} y2={-26} stroke="#FFFFFF" strokeWidth={2} opacity={0.6} />
    <rect x={-42} y={-22} width={84} height={54} rx={9} fill={accent} stroke={ink} strokeWidth={5} />
    <path d="M14,-4 L38,-4 Q44,-4 44,4 L44,8 Q44,16 38,16 L14,16 Z" fill={ink} />
    <circle cx={34} cy={6} r={4} fill="#F59E0B" />
  </g>
);

const Gift: G = ({ ink, accent }) => (
  <g>
    <rect x={-32} y={-16} width={64} height={52} rx={6} fill={accent} stroke={ink} strokeWidth={4} />
    <rect x={-38} y={-26} width={76} height={14} rx={3} fill={accent} stroke={ink} strokeWidth={4} />
    <rect x={-6} y={-26} width={12} height={62} fill="#FFFFFF" opacity={0.9} stroke={ink} strokeWidth={2} />
    <rect x={-32} y={6} width={64} height={10} fill="#FFFFFF" opacity={0.9} stroke={ink} strokeWidth={2} />
    <path d="M-14,-34 C-24,-46 0,-40 -2,-26 Z" fill="#FFFFFF" stroke={ink} strokeWidth={3} />
    <path d="M14,-34 C24,-46 0,-40 2,-26 Z" fill="#FFFFFF" stroke={ink} strokeWidth={3} />
  </g>
);

const Zap: G = ({ ink, accent }) => (
  <g>
    <path
      d="M8,-56 L-32,2 L-2,2 L-14,54 L36,-6 L6,-6 Z"
      fill={accent}
      stroke={ink}
      strokeWidth={5}
      strokeLinejoin="round"
    />
    <path
      d="M2,-44 L-22,-2 L4,-2 L-6,36 L24,-8 L4,-8 Z"
      fill="#FFFFFF"
      opacity={0.4}
    />
  </g>
);

const Laptop: G = ({ ink, accent }) => (
  <g transform="translate(0 6)">
    {/* Open screen */}
    <rect x={-36} y={-44} width={72} height={46} rx={4} fill={ink} />
    <rect x={-32} y={-40} width={64} height={38} rx={2} fill="#0F172A" />
    <rect x={-26} y={-32} width={28} height={8} rx={2} fill={accent} />
    <rect x={-26} y={-20} width={42} height={6} rx={2} fill="#38BDF8" opacity={0.6} />
    {/* Base keyboard */}
    <polygon points="-42,4 42,4 36,18 -36,18" fill={ink} />
    <rect x={-30} y={6} width={60} height={8} rx={2} fill="#334155" />
  </g>
);

const CreditCard: G = ({ ink, accent }) => (
  <g transform="rotate(-15)">
    <rect x={-36} y={-24} width={72} height={48} rx={6} fill={accent} stroke={ink} strokeWidth={4} />
    <rect x={-28} y={-14} width={14} height={10} rx={2} fill="#FDE047" />
    <rect x={-36} y={6} width={72} height={8} fill="#0F172A" opacity={0.7} />
    <circle cx={18} cy={-8} r={5} fill="#FFFFFF" opacity={0.9} />
    <circle cx={25} cy={-8} r={5} fill="#FDE047" opacity={0.8} />
  </g>
);

const Smartphone: G = ({ ink, accent }) => (
  <g>
    <rect x={-20} y={-40} width={40} height={80} rx={8} fill={ink} />
    <rect x={-16} y={-34} width={32} height={68} rx={4} fill="#0F172A" />
    {/* Chat bubbles on screen */}
    <rect x={-12} y={-24} width={18} height={8} rx={3} fill={accent} />
    <rect x={-4} y={-10} width={18} height={8} rx={3} fill="#38BDF8" />
    <rect x={-12} y={4} width={20} height={8} rx={3} fill={accent} />
  </g>
);

export const HAND_PROPS: Record<HandProp, G> = {
  book: Book, phone: Phone, key: Key, notes: Notes, letter: Letter, coin: Coin,
  cup: Cup, lightbulb: Lightbulb, mask: Mask, photo: Photo, mirror: Mirror,
  flower: Flower, compass: Compass, briefcase: Briefcase,
  shield: Shield, trophy: Trophy, hourglass: Hourglass, sword: Sword,
  target: Target, magnifier: Magnifier, wallet: Wallet, gift: Gift, zap: Zap,
  laptop: Laptop, creditCard: CreditCard, smartphone: Smartphone,
};

/**
 * HeldProp — the glyph, placed at the rig's hand.
 *
 * Rendered INSIDE the arm group, so it inherits the arm's rotation for free:
 * raise the arm and the object comes with it, exactly as a real rig would.
 */
export const HeldProp: React.FC<{ prop: HandProp; ink: string; accent: string; scale?: number }> = ({ prop, ink, accent, scale = 1 }) => {
  const Glyph = HAND_PROPS[prop];
  if (!Glyph) return null;
  return (
    <g transform={`scale(${scale})`}>
      <Glyph ink={ink} accent={accent} />
    </g>
  );
};
