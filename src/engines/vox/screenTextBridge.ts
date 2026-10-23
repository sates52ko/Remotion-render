/**
 * screenTextBridge.ts — P9-A V5: the authored `storyboard.onScreenText`
 * reaches the frame.
 *
 * The single truth source for "may this string be printed?" is
 * scripts/lib/screen-text.js (`checkString`). This bridge applies it to the
 * beat's authored onScreenText; it owns NO rules of its own — when the checker
 * gains a rule, this gate tightens with it.
 *
 * Decision table:
 *   - no authored onScreenText            → `{ authored: false }` (absence)
 *   - passes every checkString rule       → `{ text }` (renderer leads with it)
 *   - fails any rule                      → `{ rejected: "ONSCREEN_TEXT_REJECTED:<code>" }`
 *     and the renderer falls back to its current behaviour. The code is the
 *     EXISTING checker's code (LENGTH, FRAGMENT, TELEGRAPHIC, UNGROUNDED, …) —
 *     no parallel taxonomy is invented here.
 */
import type { Beat } from "./schema";
import { checkString } from "../../../scripts/lib/screen-text.js";

export type OnScreenTextDecision = {
  /** Did the author write an onScreenText for this beat at all? */
  authored: boolean;
  /** The headline to render, or "" when absent/rejected. */
  text: string;
  /** `ONSCREEN_TEXT_REJECTED:<existing_reason>` when the checker refused it. */
  rejected?: string;
};

export function checkOnScreenText(beat: Beat): OnScreenTextDecision {
  const raw = beat.props && typeof beat.props.onScreenText === "string" ? beat.props.onScreenText : "";
  const text = raw.trim();
  if (!text) return { authored: false, text: "" };
  const violations = checkString(text, { kind: "title", narration: String((beat.props && beat.props.text) || "") });
  if (!violations.length) return { authored: true, text };
  return { authored: true, text: "", rejected: `ONSCREEN_TEXT_REJECTED:${violations[0].code}` };
}

/**
 * Render-side helper: the passing headline, else "" — and the rejection code
 * is stamped on the beat (`props._onScreenTextRejected`) so telemetry can tell
 * "the author wrote nothing" from "the checker refused what the author wrote".
 */
export function onScreenHeadline(beat: Beat): string {
  const d = checkOnScreenText(beat);
  if (d.rejected) beat.props._onScreenTextRejected = d.rejected;
  return d.text;
}
