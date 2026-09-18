import React from "react";
import { Audio, Sequence, staticFile } from "remotion";
import type { Beat } from "./schema";

/**
 * sfx.tsx — the transition sound layer.
 *
 * The reference channels punctuate every cut. This engine had no sound design
 * at all: one continuous narration track and nothing else, which is the single
 * cheapest gap in perceived production value.
 *
 * **Why it is opt-in.** The narration here is ~98.5% speech with no gaps (see
 * the audio strategy note in AGENT_LOG) — every sound effect lands ON someone
 * talking, not in a pause the way an edited channel's would. At these levels it
 * should read as texture rather than as an effect, but that is a judgement for
 * ears, not for a spec, so the layer only renders when the config asks for it
 * (`meta.sfx`, set by `plan-vox.js --sfx`). An existing book renders exactly as
 * it did until someone turns it on and listens.
 *
 * Assets are procedurally generated (filtered noise bursts, see AGENT_LOG), so
 * nothing here depends on a licensed sound library.
 */

/**
 * Gains are MEASURED, not guessed. The first pass used 0.085/0.055, which put
 * the loudest effect at -35.4 dBFS against speech peaking at -6.8 — a layer
 * that renders, costs render time, and cannot be heard. Transition effects
 * normally sit 12-18 dB under dialogue; these land the effect peak near
 * -22 dBFS, subordinate to the voice but actually present.
 * Re-measure with: render the same frame range with and without, then
 * `amix` one against the inverted other and read `volumedetect`.
 */
const WHOOSH_GAIN = 0.4;
const TICK_GAIN = 0.26;

export const SfxLayer: React.FC<{ beats: Beat[]; enabled?: boolean }> = ({ beats, enabled }) => {
  if (!enabled) return null;
  return (
    <>
      {beats.map((beat, i) => {
        // No whoosh on the very first frame of the film — there is nothing to
        // transition FROM, and it would collide with the title's own entrance.
        const cuts = i === 0 ? [] : [beat.fromFrame];
        // Ticks mark the beat's LATE events (the second/third reveal, the
        // marker stroke) — never the opening word, which already has the cut.
        const anchors = (beat.props.anchors ?? []).filter((a): a is number => Number.isFinite(a));
        const ticks = anchors
          .slice(1)
          .filter((a) => a > 20 && a < beat.durationFrames - 6)
          .slice(0, 2)
          .map((a) => beat.fromFrame + a);
        return (
          <React.Fragment key={beat.id}>
            {cuts.map((f) => (
              <Sequence key={`w${f}`} from={f} durationInFrames={14} layout="none" name={`sfx-cut-${beat.id}`}>
                <Audio src={staticFile("sfx/whoosh.wav")} volume={WHOOSH_GAIN} />
              </Sequence>
            ))}
            {ticks.map((f) => (
              <Sequence key={`t${f}`} from={f} durationInFrames={4} layout="none" name={`sfx-tick-${beat.id}`}>
                <Audio src={staticFile("sfx/tick.wav")} volume={TICK_GAIN} />
              </Sequence>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
};
