import React from "react";
import type { Speech } from "./speech";

/**
 * flow.ts — FILM FLOW (2026-11-12): what the whole film knows, handed to every scene without threading props.
 *
 * `level` is config.meta.flow — 0 / absent for every film planned before Film Flow (it renders exactly as it did);
 * each slice that changes how a film MOVES is behind a level, so the same code renders the "before" and the "after"
 * of a passage (scripts/flow-passage.js --flow=<n>):
 *   1 — living characters: the narration drives mouth, head, brows and hand strokes; glances and weight shifts instead
 *       of sine loops; gestures with anticipation and overshoot (movements.ts livePose, speech.ts)
 * `base` = the film frame at which the enclosing <Sequence> starts, so a scene can ask "what is being said now".
 */
export type Flow = { level: number; speech: Speech | null; base: number };
export const NO_FLOW: Flow = { level: 0, speech: null, base: 0 };
export const FlowContext = React.createContext<Flow>(NO_FLOW);
export const flowLevel = (meta: unknown): number => {
  const n = Number((meta as { flow?: unknown } | null | undefined)?.flow);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
