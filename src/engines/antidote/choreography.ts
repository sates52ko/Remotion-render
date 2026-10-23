import { interpolate, Easing } from "remotion";
import type {
  AttentionTarget,
  CharacterSpec,
  CharEmotion,
  Expression,
  SceneSpec,
  VisualArcSpec,
} from "./schema";
import { stageChar, stageText, shotPreset } from "./shots";

/**
 * choreography.ts — Runtime Attention Choreography & Visual Arc Progression (Antidote 6.0)
 *
 * Implements the "Attention Choreography" and "Visual Progression" pipeline:
 *  1. Resolves high-level attention milestones into continuous frame windows.
 *  2. Smoothly directs character gaze and head turns across attention targets (Viewer → Motif → Text).
 *  3. Coordinates dynamic emotional reactions when story obstacles or insights arrive.
 *  4. Drives intra-scene visual transformation (grow, shrink, overload, isolate) from visualArc.
 */

export type AttentionSegment = {
  startFrame: number;
  endFrame: number;
  target: AttentionTarget;
};

/**
 * Derives attention milestone timing across the duration of a scene.
 * If scene.attention is authored, it maps those targets onto timeline anchors.
 * Otherwise, it creates an intelligent default based on motif.at and text.at.
 */
export function resolveAttentionTimeline(
  scene: SceneSpec,
  durationFrames: number
): AttentionSegment[] {
  const dur = Math.max(1, durationFrames);
  const props = scene.props || [];
  const texts = scene.texts || [];

  const motifAt = props.length > 0 ? (props[0].at ?? 0) : null;
  const textAt = texts.length > 0 ? (texts[0].at ?? 0) : null;

  // 1. Authored high-level milestones in scene.attention
  if (scene.attention && scene.attention.length > 0) {
    const milestones = scene.attention;
    const count = milestones.length;
    if (count === 1) {
      return [{ startFrame: 0, endFrame: dur, target: milestones[0] }];
    }

    const segments: AttentionSegment[] = [];
    const windowSize = dur / count;
    for (let i = 0; i < count; i++) {
      const segStart = Math.round(i * windowSize);
      const segEnd = i === count - 1 ? dur : Math.round((i + 1) * windowSize);
      segments.push({
        startFrame: segStart,
        endFrame: segEnd,
        target: milestones[i],
      });
    }
    return segments;
  }

  // 2. Intelligent Default Choreography (Derived from scene structure)
  // Shot types with no cast or dialogue stay on their primary focus
  if (scene.shot === "twoShot" || scene.shot === "split" || scene.shot === "overShoulder") {
    return [{ startFrame: 0, endFrame: dur, target: "partner" }];
  }
  if (scene.shot === "insert" || (scene.characters && scene.characters.length === 0)) {
    return [{ startFrame: 0, endFrame: dur, target: "motif" }];
  }

  // Standard narrative beat with presenter + motif/text:
  if (motifAt !== null && textAt !== null) {
    const tMotif = Math.min(motifAt, Math.round(dur * 0.4));
    const tText = Math.max(tMotif + 12, Math.min(textAt, dur - 15));
    return [
      { startFrame: 0, endFrame: tMotif, target: "character" }, // Presenter addresses viewer
      { startFrame: tMotif, endFrame: tText, target: "motif" },  // Attention turns to motif
      { startFrame: tText, endFrame: dur, target: "text" },      // Kinetic punchline lands
    ];
  }

  if (motifAt !== null) {
    const tMotif = Math.min(motifAt, Math.round(dur * 0.4));
    return [
      { startFrame: 0, endFrame: tMotif, target: "character" },
      { startFrame: tMotif, endFrame: dur, target: "motif" },
    ];
  }

  if (textAt !== null) {
    const tText = Math.min(textAt, Math.round(dur * 0.5));
    return [
      { startFrame: 0, endFrame: tText, target: "character" },
      { startFrame: tText, endFrame: dur, target: "text" },
    ];
  }

  // Pure presenter beat
  return [{ startFrame: 0, endFrame: dur, target: "character" }];
}

/**
 * Returns the active attention target for the current local frame.
 */
export function currentAttentionTarget(
  timeline: AttentionSegment[],
  localFrame: number
): { target: AttentionTarget; progress: number; prevTarget: AttentionTarget } {
  if (!timeline.length) {
    return { target: "character", progress: 1, prevTarget: "character" };
  }

  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i];
    if (localFrame >= seg.startFrame && localFrame < seg.endFrame) {
      const segDuration = Math.max(1, seg.endFrame - seg.startFrame);
      const progress = (localFrame - seg.startFrame) / segDuration;
      const prevTarget = i > 0 ? timeline[i - 1].target : seg.target;
      return { target: seg.target, progress, prevTarget };
    }
  }

  const last = timeline[timeline.length - 1];
  return { target: last.target, progress: 1, prevTarget: last.target };
}

/**
 * Computes dynamic stage coordinates for an attention target.
 */
function pointForTarget(
  target: AttentionTarget,
  scene: SceneSpec,
  charSpec: CharacterSpec,
  charIndex: number,
  bodies: CharacterSpec[],
  preset: ReturnType<typeof shotPreset>
): { x: number; y: number } {
  const self = stageChar(scene.shot, charSpec, charIndex);
  const props = scene.props || [];
  const texts = scene.texts || [];

  switch (target) {
    case "partner": {
      const partnerIdx = bodies.findIndex((b) => b.id !== charSpec.id);
      if (partnerIdx >= 0) {
        return stageChar(scene.shot, bodies[partnerIdx], partnerIdx);
      }
      return { x: self.x, y: self.y - 120 * self.scale };
    }
    case "motif": {
      const p = props[0];
      return p
        ? { x: p.x ?? preset.motif.x, y: p.y ?? preset.motif.y }
        : { x: preset.motif.x, y: preset.motif.y };
    }
    case "text": {
      const tx = texts[0];
      return tx ? stageText(scene.shot, tx, 0) : { x: preset.text.x, y: preset.text.y };
    }
    case "heldProp": {
      return {
        x: self.x + (self.flip ? -45 : 45) * self.scale,
        y: self.y + 65 * self.scale,
      };
    }
    case "diagram": {
      return { x: 960, y: 540 };
    }
    case "character":
    case "hud":
    default: {
      // Default: looking at camera/viewer straight ahead
      return { x: self.x, y: self.y - 120 * self.scale };
    }
  }
}

/**
 * Smoothly interpolates character gaze and head angle towards the choreographed attention point.
 * Incorporates a realistic 10-frame transition ease between targets.
 */
export function resolveChoreographedLookAt(
  scene: SceneSpec,
  charSpec: CharacterSpec,
  charIndex: number,
  bodies: CharacterSpec[],
  localFrame: number,
  durationFrames: number
): { x: number; y: number } | null {
  // If an explicit coordinate was authored, honor it directly
  if (charSpec.lookAt && typeof charSpec.lookAt === "object") {
    return charSpec.lookAt;
  }
  // If explicit wander was set
  if (charSpec.lookAt === "wander") {
    const self = stageChar(scene.shot, charSpec, charIndex);
    const wx = self.x + Math.sin(localFrame * 0.025) * 320 + Math.sin(localFrame * 0.06) * 120;
    const wy = self.y - 120 + Math.cos(localFrame * 0.03) * 110;
    return { x: wx, y: wy };
  }

  const preset = shotPreset(scene.shot);
  const timeline = resolveAttentionTimeline(scene, durationFrames);
  const { target, prevTarget } = currentAttentionTarget(timeline, localFrame);

  const curPoint = pointForTarget(target, scene, charSpec, charIndex, bodies, preset);
  if (target === prevTarget) {
    return curPoint;
  }

  // Smooth 10-frame saccade transition between targets
  const prevPoint = pointForTarget(prevTarget, scene, charSpec, charIndex, bodies, preset);
  const segStartFrame = timeline.find((s) => s.target === target)?.startFrame ?? 0;
  const framesSinceSwitch = localFrame - segStartFrame;
  const transitionProgress = interpolate(framesSinceSwitch, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return {
    x: prevPoint.x + (curPoint.x - prevPoint.x) * transitionProgress,
    y: prevPoint.y + (curPoint.y - prevPoint.y) * transitionProgress,
  };
}

/**
 * Dynamic character expression based on attention milestone arrival.
 * E.g., presenter enters neutral, becomes surprised or worried when obstacle prop arrives.
 */
export function resolveDynamicExpression(
  scene: SceneSpec,
  charSpec: CharacterSpec,
  localFrame: number,
  durationFrames: number
): { expression: Expression; emotion?: CharEmotion; emotionAt?: number } {
  const baseExpression = charSpec.expression || "neutral";
  const timeline = resolveAttentionTimeline(scene, durationFrames);
  const { target } = currentAttentionTarget(timeline, localFrame);

  // If a milestone specifically targets motif or text and scene has tension/insight
  if (target === "motif" || target === "text") {
    // If scene already had a specific authored reaction
    if (charSpec.emotion && charSpec.emotion !== "none") {
      const emotionAt = charSpec.emotionAt ?? timeline.find((t) => t.target === target)?.startFrame ?? 8;
      return {
        expression: baseExpression,
        emotion: charSpec.emotion,
        emotionAt,
      };
    }
  }

  return {
    expression: baseExpression,
    emotion: charSpec.emotion,
    emotionAt: charSpec.emotionAt,
  };
}

/**
 * Transforms stage and hero elements across the beat according to visualArc.transformation.
 * Converts static decorative scenes into dynamic visual progressions.
 */
export function resolveVisualArcTransform(
  visualArc: VisualArcSpec | undefined,
  localFrame: number,
  durationFrames: number
): { scale: number; tx: number; ty: number; opacity: number; jitter: number } {
  const neutral = { scale: 1, tx: 0, ty: 0, opacity: 1, jitter: 0 };
  if (!visualArc || !visualArc.transformation || visualArc.transformation === "none") {
    return neutral;
  }

  const span = Math.max(1, durationFrames);
  const t = interpolate(localFrame, [0, span], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });

  switch (visualArc.transformation) {
    case "grow": {
      // Metaphor/pressure expands by up to 45% over the beat
      return { ...neutral, scale: 1 + t * 0.45 };
    }
    case "shrink": {
      // Element diminishes to 55% of original size
      return { ...neutral, scale: 1 - t * 0.45, opacity: 1 - t * 0.2 };
    }
    case "overload": {
      // Scale increases and micro-vibration intensity mounts
      const jitter = Math.sin(localFrame * 1.8) * (t * 4);
      return { ...neutral, scale: 1 + t * 0.18, jitter };
    }
    case "multiply": {
      // Rapid stepped expansion simulating replication
      return { ...neutral, scale: 1 + t * 0.35, ty: -t * 20 };
    }
    case "isolate": {
      // Slight focus pullback
      return { ...neutral, scale: 1 - t * 0.15, ty: t * 15 };
    }
    case "reveal_truth": {
      // Subtle pop and upward lift
      return { ...neutral, scale: 1 + t * 0.12, ty: -t * 30 };
    }
    case "shift_focus": {
      // Lateral horizontal translation
      return { ...neutral, tx: -t * 80 };
    }
    default:
      return neutral;
  }
}
