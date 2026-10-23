/**
 * continuity.ts — AUTHORED scene continuation (art.json `"continue": true`, 2026-10-19).
 *
 * Every Antidote scene is its own <Sequence>, so its clock restarts at 0: a person
 * re-runs enter(), a prop re-mounts and pops, a diagram rebuilds from frame 0. When
 * the AUTHOR marks a beat `continue` (plan-antidote → scene `continueFromPrev: true`),
 * the renderer keeps what was already on stage instead of rebuilding it:
 *   - a character with the SAME identity as one in the previous scene: no entrance,
 *     its pose clock carries on (same action) or starts settled (new action), and it
 *     keeps its screen slot when the shot is the same;
 *   - a prop of the SAME type: visible from frame 0, no pop, no arc replay (a held arc
 *     stays at the state it reached), its own clock carries on (no draw-in replay);
 *   - a diagram of the SAME type: every label/value it had at the same index is drawn
 *     already built; only NEW labels/values animate in.
 * Elements new in the scene enter normally; elements that disappeared are not drawn.
 *
 * Pure (no Remotion, no randomness, no wall time): every output is a function of the
 * config, so scripts/test-authored-continue.js checks it in node and every render
 * worker draws the same frame. Scenes WITHOUT `continueFromPrev` get the neutral plan
 * (`active: false`), which the renderer turns into exactly the pre-2026-10-19 drawing.
 */

type AnyChar = { identity?: string; role?: string; action?: string; poseAt?: number; actionAt?: number };

/** Earliest scene frame for an authored action cue (take / embrace): the reach or the approach needs time. */
export const ACTION_CUE_MIN = 24;
/** Scene-relative frame of a figure's authored action moment: `actionAt` (art.json actionCue), else 40% of the
 *  beat; never before ACTION_CUE_MIN, never after the last frame. Pure. */
export const actionCueFrame = (c: { actionAt?: number }, durationFrames: number): number =>
  Math.min(Math.max(ACTION_CUE_MIN, Math.round(c.actionAt ?? durationFrames * 0.4)), Math.max(ACTION_CUE_MIN, durationFrames - 1));
type AnyProp = { type?: string; at?: number; arc?: string; motion?: string; motionAt?: number };
type AnyDiagram = { type?: string; title?: string; labels?: string[]; values?: number[]; at?: number };
type AnyScene = {
  id?: string;
  fromFrame?: number;
  durationFrames?: number;
  shot?: string;
  transition?: { type?: string; frames?: number };
  continueFromPrev?: boolean;
  _take?: string;
  chapterCard?: unknown;
  relationshipStaging?: unknown;
  characters?: AnyChar[];
  props?: AnyProp[];
  diagram?: AnyDiagram;
};

/** Frames a carried figure's pose clock starts at when its action changed (settled). */
export const SETTLED_POSE = 60;
/** A local frame far enough in that every build-in spring/ramp has settled. */
export const SETTLED_FRAME = 100000;
/** Default transition when a scene carries none (schema.ts DEFAULT_TRANSITION). */
const CUT = { type: "cut", frames: 0 };

export type CharCarry = {
  /** identity was on screen in the previous scene → no entrance */
  carried: boolean;
  /** the slot index this figure is staged in (stageChar's index) */
  slot: number;
  /** pose clock offset: pose(action, frame + poseClock) */
  poseClock: number;
  /** the authored action cue (take / embrace) on the pose clock, when the SAME action carries over: already
   *  passed, so the result (object in hand, the embrace) is the starting state — never replayed */
  cue?: number;
};
export type PropCarry = {
  carried: boolean;
  /** motif clock = scene local frame + clock (non-carried: -at, as before) */
  clock: number;
  /** ambient float seed + clock offset (non-carried: index seed, 0) */
  seed: number;
  ambClock: number;
  /** arcs the object already completed (drawn at their end state) */
  heldArcs: string[];
  /** the arc animated in THIS scene (undefined = none) */
  arc?: string;
  /** cue of the authored motion on the motif clock (undefined = no motion) */
  cue?: number;
};
export type DiagramCarry = {
  /** the diagram was on screen: frame, title row and axes are already built */
  shell: boolean;
  title: boolean;
  /** per label index: already built in the previous scene (same text, same index) */
  labels: boolean[];
  /** per value index: the value is unchanged */
  values: boolean[];
  /** per index: the previous scene's value (a marker / dots move on from it) */
  prevValues: (number | undefined)[];
  /** loop clock (flow token, waves, funnel drop): loop = scene local + clock */
  clock: number;
};
export type ScenePlan = {
  active: boolean;
  chars: CharCarry[];
  props: PropCarry[];
  diagram: DiagramCarry | null;
};

/** Only the AUTHOR's flag makes a scene a renderer continuation (never the director's sustained take). */
export const isAuthoredContinuation = (scene: AnyScene | undefined, index: number): boolean =>
  index > 0 && !!scene && scene.continueFromPrev === true;

/**
 * Frames the scene is mounted EARLY so the incoming transition can draw over the
 * outgoing scene. Identical to the pre-continuity formula in index.tsx; an authored
 * continuation is always a 0-frame cut.
 */
export function sceneTransIn(scenes: AnyScene[], i: number): number {
  const scene = scenes[i];
  const transition = scene.transition ?? CUT;
  const afterStaged = i > 0 && !!scenes[i - 1].relationshipStaging;
  if (i === 0 || transition.type === "cut" || afterStaged || isAuthoredContinuation(scene, i)) return 0;
  return Math.min(transition.frames ?? 0, Math.max(0, scene.fromFrame ?? 0));
}

const who = (c: AnyChar | undefined) => (c && (c.identity || c.role)) || "";
const norm = (s: unknown) => (s == null ? null : String(s).trim().toUpperCase().replace(/\s+/g, " "));

function neutralScene(scene: AnyScene): ScenePlan {
  return {
    active: false,
    chars: (scene.characters ?? []).map((c, i) => ({ carried: false, slot: i, poseClock: c.poseAt ?? 0 })),
    props: (scene.props ?? []).map((p, i) => ({
      carried: false, clock: -(p.at ?? 0), seed: (i * 0.37 + 0.11) % 1, ambClock: 0, heldArcs: [],
      arc: p.arc, cue: p.motion ? Math.max(0, (p.motionAt ?? p.at ?? 0) - (p.at ?? 0)) : undefined,
    })),
    diagram: null,
  };
}

/** The diagram carry between two diagrams of the same type (null when it is a new diagram). */
export function diagramCarry(prev: AnyDiagram | undefined, cur: AnyDiagram | undefined, prevClock = 0, prevDuration = 0): DiagramCarry | null {
  if (!prev || !cur || prev.type !== cur.type) return null;
  const pl = prev.labels ?? [], cl = cur.labels ?? [], pv = prev.values ?? [], cv = cur.values ?? [];
  // an archetype draws up to 7 labels/values; index-aligned (a label that moved
  // position is drawn somewhere else, so it builds in where it now is)
  const n = Math.max(7, cl.length, cv.length);
  const labels: boolean[] = [], values: boolean[] = [], prevValues: (number | undefined)[] = [];
  for (let k = 0; k < n; k++) {
    // both absent = the archetype's own default label in both scenes → same drawing
    const kept = norm(pl[k]) === norm(cl[k]);
    labels.push(kept);
    values.push(kept && pv[k] === cv[k]);
    prevValues.push(pv[k]);
  }
  return { shell: true, title: norm(prev.title) === norm(cur.title), labels, values, prevValues, clock: prevClock + prevDuration };
}

// What a scene actually DREW: a chapter card draws only its card, and a shot that drops
// its cast (insert, split, chapterCard — shots.ts dropsCast) draws nobody.
const isCard = (s: AnyScene) => s.shot === "chapterCard" || !!s.chapterCard;
const drawnChars = (s: AnyScene, drawsCast: (shot: string) => boolean): AnyChar[] =>
  isCard(s) || !drawsCast(s.shot ?? "medium") ? [] : s.characters ?? [];

/**
 * The continuity plan of every scene, in order (a chain of continuations carries
 * clocks through each link). plans[i].active is true only for an authored continuation.
 * `drawsCast(shot)` says whether a shot draws its characters (the renderer passes
 * !shotPreset(shot).dropsCast); the default assumes every shot does.
 */
export function planContinuity(scenes: AnyScene[], drawsCast: (shot: string) => boolean = () => true): ScenePlan[] {
  const plans: ScenePlan[] = [];
  const loops: number[] = []; // per scene: diagram loop clock offset (loop = local + offset)
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const prev = i > 0 ? scenes[i - 1] : undefined;
    const prevPlan = i > 0 ? plans[i - 1] : undefined;
    const base = neutralScene(scene);
    const diagLoop = -(scene.diagram?.at ?? 0);
    if (!prev || !prevPlan || !isAuthoredContinuation(scene, i)) {
      plans.push(base);
      loops.push(diagLoop);
      continue;
    }
    const prevDur = prev.durationFrames ?? 0;
    const prevTransIn = sceneTransIn(scenes, i - 1);
    // ── characters: same identity = the same person, still standing there ──
    const prevChars = drawnChars(prev, drawsCast);
    const cur = scene.characters ?? [];
    const sameShot = (prev.shot ?? "medium") === (scene.shot ?? "medium");
    const used = new Set<number>();
    const chars: CharCarry[] = cur.map((c, k) => {
      const id = who(c);
      let j = -1;
      if (id) j = prevChars.findIndex((pc, m) => who(pc) === id && !used.has(m));
      if (j < 0) return { carried: false, slot: k, poseClock: c.poseAt ?? 0 };
      used.add(j);
      const pc = prevChars[j];
      const pcPlan = prevPlan.chars[j] ?? { poseClock: pc.poseAt ?? 0 };
      // same action: the clock runs on through the cut (no replay, no jump);
      // a new action: it starts settled instead of springing in from rest
      const same = (pc.action ?? "idle") === (c.action ?? "idle");
      const poseClock = same
        ? pcPlan.poseClock + prevTransIn + prevDur
        : Math.max(c.poseAt ?? 0, SETTLED_POSE);
      const slot = prevPlan.chars[j] ? prevPlan.chars[j].slot : j;
      // the same authored action goes on: its cue (on the continuous pose clock) is the one already passed
      const cue = same && (c.action === "take" || c.action === "embrace")
        ? ((pcPlan as CharCarry).cue ?? actionCueFrame(pc, prevDur) + (pcPlan.poseClock ?? 0))
        : undefined;
      return { carried: true, slot, poseClock, ...(cue != null ? { cue } : {}) };
    });
    // slots: a carried figure keeps its slot on the same shot; the rest fill the free
    // ones in order. Always a permutation of 0..n-1 (the choreography indexes by it).
    const n = cur.length;
    const taken = new Set<number>();
    const want = chars.map((c) => (c.carried && sameShot && c.slot < n ? c.slot : -1));
    want.forEach((s, k) => { if (s >= 0 && !taken.has(s)) taken.add(s); else want[k] = -1; });
    let free = 0;
    chars.forEach((c, k) => {
      if (want[k] >= 0) { c.slot = want[k]; return; }
      while (taken.has(free)) free++;
      c.slot = free; taken.add(free);
    });
    // ── props: same type = the same object, already there ──
    const prevProps = isCard(prev) ? [] : prev.props ?? [];
    const usedP = new Set<number>();
    const props: PropCarry[] = (scene.props ?? []).map((p, k) => {
      const j = prevProps.findIndex((pp, m) => pp.type === p.type && !usedP.has(m));
      if (j < 0) return base.props[k];
      usedP.add(j);
      const pp = prevProps[j];
      const ppPlan = prevPlan.props[j];
      const clock = ppPlan.clock + prevDur;
      // the arc the object went through last scene is now its resting state
      const heldArcs = ppPlan.arc && ppPlan.arc !== "none" ? [...ppPlan.heldArcs, ppPlan.arc] : [...ppPlan.heldArcs];
      const last = heldArcs[heldArcs.length - 1];
      const arc = p.arc && p.arc !== "none" && p.arc !== last ? p.arc : undefined;
      const cue = p.motion
        ? (pp.motion === p.motion && ppPlan.cue != null ? ppPlan.cue : (p.motionAt ?? 0) + clock)
        : undefined;
      return { carried: true, clock, seed: ppPlan.seed, ambClock: ppPlan.ambClock + prevDur, heldArcs, arc, cue };
    });
    // ── diagram: same type = the same graphic; only what is new builds in ──
    const diagram = isCard(prev) ? null : diagramCarry(prev.diagram, scene.diagram, loops[i - 1], prevDur);
    plans.push({ active: true, chars, props, diagram });
    loops.push(diagram ? diagram.clock : diagLoop);
  }
  return plans;
}

/** Diagram helper: the build-in frame for element `k` (a carried element is settled). */
export const builtFrame = (carry: DiagramCarry | null | undefined, k: number, frame: number): number =>
  carry && carry.labels[k] ? SETTLED_FRAME : frame;
/** Diagram helper: the frame for the shell (title row, axes, group fade). */
export const shellFrame = (carry: DiagramCarry | null | undefined, frame: number): number =>
  carry && carry.shell ? SETTLED_FRAME : frame;

/**
 * The planner's normal entrance for figure `slot` of scene `sceneIndex` on `shot`
 * (plan-antidote.js: two-person shots enter from their side, others alternate).
 */
export const normalEnter = (shot: string | undefined, slot: number, sceneIndex: number): string =>
  shot === "twoShot" || shot === "split" ? (slot === 0 ? "left" : "right") : sceneIndex % 2 === 0 ? "left" : "fade";

/**
 * NEWCOMERS ENTER. On ANY continuation — the author's `continueFromPrev` or the
 * director's sustained take (`_take: "sustained"`, which stamps every figure
 * `enter: "none"` + `poseAt`) — a person whose identity was NOT on screen in the
 * previous scene must make a normal entrance. Without this an authored cast applied
 * after the sustained take swapped the person on screen with no entrance at all
 * (burn-of-the-everflame scene-97: diem → luther). Mutates the scenes; returns the
 * ids of the figures it gave an entrance. Figures that were on screen keep theirs.
 */
export function enterNewcomers(scenes: AnyScene[], drawsCast: (shot: string) => boolean = () => true): string[] {
  const fixed: string[] = [];
  for (let i = 1; i < scenes.length; i++) {
    const s = scenes[i];
    if (!(s.continueFromPrev === true || s._take === "sustained")) continue;
    const before = new Set(drawnChars(scenes[i - 1], drawsCast).map(who).filter(Boolean));
    (s.characters ?? []).forEach((c, k) => {
      const ch = c as AnyChar & { enter?: string; id?: string };
      if (before.has(who(ch))) return;
      if (ch.enter == null || ch.enter === "none") {
        ch.enter = normalEnter(s.shot, k, i);
        delete ch.poseAt;
        fixed.push(ch.id || `${s.id ?? i}:${k}`);
      }
    });
  }
  return fixed;
}
