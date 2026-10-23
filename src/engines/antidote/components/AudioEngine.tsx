import React from "react";
import { Audio, Sequence, staticFile } from "remotion";
import type { AntidoteConfig } from "../schema";

/**
 * AudioEngine — deterministic sound design layer for the Antidote engine (God Mode Phase 7).
 *
 * Places micro-transient SFX frame-locked to visual actions:
 * - POP: on kinetic text entrances and motif reveals
 * - WHOOSH: on transitions, camera wipes, and pans
 * - DING: on promise payoffs, lightbulb reveals, and climactic insights
 * - THUD: on chapter cards, contradictions, and tension slams
 * - TICK: on secondary callouts / subtle progression cues
 *
 * Strict gain-staging rules apply:
 * - Master dialogue: 1.0 (0 dB / master)
 * - Chapter/Monumental hit (THUD): 0.22 (-13 dB)
 * - Payoff/Revelation (DING): 0.16 (-16 dB)
 * - Transitions (WHOOSH): 0.14 (-17 dB)
 * - Text/Motif entry (POP): 0.12 (-18 dB)
 * - Micro-ticks (TICK): 0.09 (-21 dB)
 */
export const AudioEngine: React.FC<{ config: AntidoteConfig }> = ({ config }) => {
  const globalEvents = config.audioEvents ?? [];

  return (
    <>
      {/* 1. Explicit Top-Level Audio Events (authored by Audio Director) */}
      {globalEvents.map((evt, idx) => {
        if (evt.type === "silence") return null;
        const sfxFile =
          evt.type === "ding"
            ? "sfx/ding.wav"
            : evt.type === "thud"
            ? "sfx/thud.wav"
            : evt.type === "pop"
            ? "sfx/pop.wav"
            : evt.type === "tick"
            ? "sfx/tick.wav"
            : "sfx/whoosh.wav";
        const duration = evt.durationFrames ?? (evt.type === "ding" ? 36 : evt.type === "thud" ? 24 : 15);

        return (
          <Sequence
            key={`global-sfx-${idx}`}
            from={Math.max(0, evt.frame)}
            durationInFrames={duration}
            name={`sfx-${evt.type}-${idx}`}
          >
            <Audio src={staticFile(sfxFile)} volume={evt.volume} />
          </Sequence>
        );
      })}

      {/* 2. Scene-Level Audio Design (explicit or procedurally mapped) */}
      {config.scenes.map((scene, i) => {
        // If scene has explicit audioEvents, render them directly
        if (scene.audioEvents && scene.audioEvents.length > 0) {
          return (
            <React.Fragment key={`sfx-scene-${scene.id}`}>
              {scene.audioEvents.map((evt, evtIdx) => {
                if (evt.type === "silence") return null;
                const sfxFile =
                  evt.type === "ding"
                    ? "sfx/ding.wav"
                    : evt.type === "thud"
                    ? "sfx/thud.wav"
                    : evt.type === "pop"
                    ? "sfx/pop.wav"
                    : evt.type === "tick"
                    ? "sfx/tick.wav"
                    : "sfx/whoosh.wav";
                const duration = evt.durationFrames ?? (evt.type === "ding" ? 36 : evt.type === "thud" ? 24 : 15);

                return (
                  <Sequence
                    key={`sfx-${scene.id}-${evtIdx}`}
                    from={Math.max(0, scene.fromFrame + (evt.frameOffset ?? 0))}
                    durationInFrames={duration}
                    name={`sfx-${evt.type}-${scene.id}`}
                  >
                    <Audio src={staticFile(sfxFile)} volume={evt.volume} />
                  </Sequence>
                );
              })}
            </React.Fragment>
          );
        }

        // Procedural Fallback if audioEvents not explicitly populated
        const isChapter = scene.shot === "chapterCard" || Boolean(scene.chapterCard);
        const trans = scene.transition;
        const hasTransition = trans && trans.type !== "cut" && trans.frames > 0 && i > 0;
        const isPayoff = scene.narrative?.function === "PAYOFF" || scene.visualJob === "reveal";
        const isContradiction = scene.narrative?.function === "CONTRADICTION" || scene.visualJob === "contrast";

        return (
          <React.Fragment key={`sfx-scene-${scene.id}`}>
            {/* Transition Swoosh */}
            {hasTransition && (
              <Sequence
                from={Math.max(0, scene.fromFrame - Math.floor(trans.frames / 2))}
                durationInFrames={Math.max(15, trans.frames + 5)}
                name={`sfx-trans-${scene.id}`}
              >
                <Audio src={staticFile("sfx/whoosh.wav")} volume={0.14} />
              </Sequence>
            )}

            {/* Chapter Card Monumental Thud */}
            {isChapter && (
              <Sequence
                from={Math.max(0, scene.fromFrame)}
                durationInFrames={25}
                name={`sfx-chapter-${scene.id}`}
              >
                <Audio src={staticFile("sfx/thud.wav")} volume={0.22} />
              </Sequence>
            )}

            {/* Payoff Ding */}
            {isPayoff && !isChapter && (
              <Sequence
                from={Math.max(0, scene.fromFrame + 6)}
                durationInFrames={36}
                name={`sfx-payoff-${scene.id}`}
              >
                <Audio src={staticFile("sfx/ding.wav")} volume={0.16} />
              </Sequence>
            )}

            {/* Contradiction Thud */}
            {isContradiction && !isChapter && (
              <Sequence
                from={Math.max(0, scene.fromFrame + 4)}
                durationInFrames={20}
                name={`sfx-contradiction-${scene.id}`}
              >
                <Audio src={staticFile("sfx/thud.wav")} volume={0.18} />
              </Sequence>
            )}

            {/* Kinetic Text Micro-Pop */}
            {(scene.texts ?? []).slice(0, 1).map((tx, txIdx) => (
              <Sequence
                key={`tx-sfx-${txIdx}`}
                from={Math.max(0, scene.fromFrame + (tx.at ?? 0))}
                durationInFrames={12}
                name={`sfx-pop-${scene.id}`}
              >
                <Audio src={staticFile("sfx/pop.wav")} volume={0.11} />
              </Sequence>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
};
