import { z } from "zod";

export const voxBookSchema = z.object({ config: z.any() });

export type VoxArchetype =
  | "title"
  | "statement"
  | "list"
  | "quote"
  | "stat"
  | "imagefocus"
  | "compare"
  | "punchline"
  | "question"
  | "timeline"
  | "place"
  | "duo"
  | "reveal"
  | "document"
  | "map"
  | "dataviz"
  | "network"
  | "trendline"
  | "flow"
  | "checklist"
  | "polaroid"
  | "chart";

export type VImage = { path: string; prompt: string; style: "cutout" | "card"; cut?: string };
export type Beat = {
  id: string;
  type: VoxArchetype | string;
  fromFrame: number;
  durationFrames: number;
  images: VImage[];
  /** 2026-11-23: the book's place this beat stands in (a key of meta.places); absent = where the film was */
  place?: string;
  props: {
    text: string;
    kicker?: string;
    /**
     * P9-A V5: the storyboard author's onScreenText, passed through by the
     * planner UNCHANGED. The renderer leads with it when the single screen-text
     * checker (scripts/lib/screen-text.js, via screenTextBridge) passes it;
     * on rejection the code is recorded here and the renderer falls back.
     */
    onScreenText?: string;
    /** Set by screenTextBridge when the authored onScreenText fails a check. */
    _onScreenTextRejected?: string;
    emphasis: string[];
    items?: string[];
    keywords: string[];
    title?: string;
    author?: string;
    compareLabels?: string[];
    sourceRef?: string;
    docType?: "newspaper" | "declassified" | "parchment" | "telegram" | "lab" | "financial";
    trendPoints?: { label: string; year?: string; value: number; isHighlight?: boolean }[];
    flowNodes?: { label: string; sub?: string }[];
    /**
     * A relation graph is the strongest claim the engine makes, so it is drawn
     * ONLY from relations that are stated here — never inferred from emphasis
     * words. `from`/`to` are 1-based indices into `networkNodes`.
     */
    networkNodes?: { label: string; sub?: string }[];
    networkLinks?: { from: number; to: number; label: string }[];
    /** Drawn only when the narration describes an actual journey. */
    mapRoute?: { from: [number, number]; to: [number, number]; label?: string };
    mapRegion?: "europe" | "northAmerica" | "asia" | "middleEast" | "world";
    checklistItems?: (string | { text: string; checked?: boolean })[];
    chartData?: number[];
    chartLabels?: string[];
    chartTitle?: string;
    chartSubtitle?: string;
    polaroidCaption?: string;
    /**
     * SUB-BEAT EVENT CLOCK (see AGENT_LOG 2026-09-03 "visual event rate").
     * Frames — RELATIVE to the beat's start — at which this beat's on-screen
     * words are actually SPOKEN, one per emphasis/item entry. The planner
     * derives them from the word-level VTT. Archetypes reveal word `i` at
     * `anchors[i]` instead of a fixed cadence, so an 8s beat gets 2-4 spread
     * events rather than everything inside the first second. Optional: a
     * config written before this lands simply falls back to the old cadence.
     */
    anchors?: number[];
  };
};
export type Caption = { text: string; startFrame: number; endFrame: number; words: { w: string; s: number; e: number }[] };
export type Chapter = { index: number; fromFrame: number; label: string; teaser?: string };
/** The book's graphic hand (scripts/lib/book-skin.js; drawn by the Antidote engine too): absent = the channel's look. */
export type VoxSkin = { caption?: string; plate?: string; font?: string };
/** The narrative form and the parts the hosts announced (scripts/lib/narrative-form.js filmForm): the chapter cards follow them. */
export type VoxForm = { key: string; part: string; name: string; parts: { n: number; from: number; title?: string }[] };
export type VoxConfig = { meta: { audio: string; slug?: string; progress?: boolean; /** Opt-in transition sound layer — see sfx.tsx for why it is not on by default. */ sfx?: boolean; skin?: VoxSkin; form?: VoxForm; /** the producer's note (src/components/ProducerNote.tsx) */ take?: { note: string };
  /** 2026-11-23, the book's OWN places (one image each, scenes/<slug>/place-<id>.png) drawn behind the beats instead of
   *  the shared paper every Vox film stood on; `home` is where the film starts. Absent = the shared paper, as before. */
  places?: Record<string, string>; home?: string }; captions: Caption[]; beats: Beat[]; chapters?: Chapter[] };
