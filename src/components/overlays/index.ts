/**
 * Overlays Library — Text, caption, and lower-third overlay components
 *
 * Packages used:
 *   @remotion/captions — createTikTokStyleCaptions, TikTokPage, TikTokToken
 *
 * Quick import:
 *   import { CaptionsDisplay, TextOverlay, LowerThird } from '../components/overlays';
 *
 * ─── CaptionsDisplay ──────────────────────────────────────────────────────────
 * YouTube-optimized animated captions using @remotion/captions.
 * Converts SRT captions to Sequence-based page rendering with token-level highlight.
 *
 *   import { parseSRT, srtToRemotionCaptions } from '../utils/srtParser';
 *   const captions = srtToRemotionCaptions(parseSRT(srtContent));
 *   <CaptionsDisplay captions={captions} captionStyle="youtube" offset={-1.8} />
 *
 * ─── TextOverlay ──────────────────────────────────────────────────────────────
 * Timed text/title/quote overlays. Styles: chapter | quote | stat | highlight | minimal
 *
 *   <TextOverlay text="Chapter 1" subtext="The Beginning" startTime={5} endTime={9} style="chapter" />
 *
 * ─── LowerThird ───────────────────────────────────────────────────────────────
 * YouTube-style animated lower-third. Styles: modern | classic | accent | minimal
 *
 *   <LowerThird title="A Fate So Cold" subtitle="by Amanda Foody" startTime={2} endTime={8} />
 */

export { CaptionsDisplay } from './CaptionsDisplay';
export { TextOverlay } from './TextOverlay';
export { LowerThird } from './LowerThird';
export { ChapterCard } from './ChapterCard';
export type { ChapterCardData } from './ChapterCard';
export { EmotionalArc } from './EmotionalArc';
export { SceneTitleBurnIn } from './SceneTitleBurnIn';
export { IntermissionCard } from './IntermissionCard';
export type { IntermissionCardData } from './IntermissionCard';
export { BookProgressIndicator } from './BookProgressIndicator';
// ── New overlay components (Round 2) ──────────────────────────────────────────
export { KineticTypography } from './KineticTypography';
export type { KineticWord } from './KineticTypography';
export { QuoteHighlight } from './QuoteHighlight';
export type { QuoteHighlightData } from './QuoteHighlight';
export { DataVizOverlay } from './DataVizOverlay';
export type { DataVizItem } from './DataVizOverlay';
export { SplitScreenMoment } from './SplitScreenMoment';
export type { SplitScreenData } from './SplitScreenMoment';
export { MapJourney } from './MapJourney';
export type { MapPoint } from './MapJourney';
