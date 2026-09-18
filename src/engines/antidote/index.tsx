import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Scene } from "./components/Scene";
import { CaptionLayer } from "./components/CaptionLayer";
import { AudioEngine } from "./components/AudioEngine";
import { RetentionHUD } from "./components/RetentionHUD";
import { antidoteBookSchema, DEFAULT_TRANSITION, type AntidoteConfig } from "./schema";

export { antidoteBookSchema };
export type { AntidoteConfig };
export { AntidoteThumbnail, antidoteThumbPropsSchema } from "./Thumbnail";
export type { AntidoteThumbProps } from "./Thumbnail";

/**
 * AntidoteBook — the Antidote engine's renderer. Data-driven: it takes a scene
 * JSON (books/<slug>/config.antidote.json) and lays every scene onto the
 * timeline as a <Sequence>, with the narration audio playing across the whole
 * composition. No per-video code — a new book is a new JSON.
 */
export const AntidoteBook: React.FC<{ config: AntidoteConfig }> = ({ config }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b" }}>
      {config.meta.audio ? <Audio src={staticFile(config.meta.audio)} /> : null}
      {config.scenes.map((scene, i) => {
        // NOTE: Remotion hands `defaultProps` to the renderer as-is — it does NOT
        // run them through the zod schema — so fields added after a config was
        // written are genuinely undefined here. Every read of a post-shot-grammar
        // field must therefore carry its own runtime default.
        const transition = scene.transition ?? DEFAULT_TRANSITION;
        // Mount each scene `transition.frames` EARLY so the outgoing scene is
        // still on screen while the incoming one wipes/whips/irises in. The
        // scene compensates internally (transIn) so callouts stay on narration.
        const transIn = i === 0 || transition.type === "cut" ? 0 : Math.min(transition.frames, Math.max(0, scene.fromFrame));
        return (
          <Sequence
            key={scene.id}
            from={scene.fromFrame - transIn}
            durationInFrames={scene.durationFrames + transIn}
            name={scene.id}
          >
            <Scene scene={scene} transIn={transIn} cast={config.meta.cast} multiplane={config.meta.multiplane} />
          </Sequence>
        );
      })}
      {/* Subtitles sit above every scene, on the absolute timeline, in the reserved bottom band. */}
      <CaptionLayer captions={config.captions} />
      {/* Top safe-zone retention HUD: timeline progress & insight trackers */}
      {config.meta.hud?.enabled !== false && <RetentionHUD config={config} />}
      {/* Frame-accurate sound design (transitions, ticks, chapter hits) */}
      <AudioEngine config={config} />
    </AbsoluteFill>
  );
};
