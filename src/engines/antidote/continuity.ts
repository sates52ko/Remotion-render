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

// types only: this module stays loadable by node on its own (the state RULES come in as CarryDeps, see planContinuity)
import type { Anchor, Posture, EndState } from "./endState";
import type { Group } from "./liftLayout";

type AnyChar = { identity?: string; role?: string; action?: string; poseAt?: number; actionAt?: number };

/** Earliest scene frame for an authored action cue (take / embrace): the reach or the approach needs time. */
export const ACTION_CUE_MIN = 24;
/** Scene-relative frame of a figure's authored action moment: `actionAt` (art.json actionCue), else 40% of the
 *  beat; never before ACTION_CUE_MIN, never after the last frame. Pure. */
export const actionCueFrame = (c: { actionAt?: number }, durationFrames: number): number =>
  Math.min(Math.max(ACTION_CUE_MIN, Math.round(c.actionAt ?? durationFrames * 0.4)), Math.max(ACTION_CUE_MIN, durationFrames - 1));
/** A HAND-OVER (2026-10-24): a two-person `take` whose partner `reach`es is the partner GIVING the object. Until the
 *  take's moment the object is in the giver's outstretched hand (not on a stand in front of the taker — blind, inside-out
 *  29-30: the girl takes the key "from the air", whose hand NO); from it, in the taker's. Returns that moment on the frame
 *  clock CharacterLayer compares (the scene frame, the taker's pose-clock offset taken out), or null when the beat is no
 *  hand-over. A carried take whose moment has passed gives a negative frame: the taker already holds it. Pure. */
export function handOffFrame(
  bodies: { action?: string; holds?: string; actionAt?: number; crowd?: number }[],
  plan: { chars: { carried: boolean; poseClock: number; cue?: number }[] } | null | undefined,
  durationFrames: number,
): number | null {
  if (bodies.length !== 2) return null;
  const [taker, giver] = bodies;
  if (taker.action !== "take" || !taker.holds || giver.action !== "reach" || (taker.crowd ?? 0) > 1 || (giver.crowd ?? 0) > 1) return null;
  const cc = plan && plan.chars[0];
  if (cc && cc.carried && cc.cue != null) return cc.cue - cc.poseClock;
  return actionCueFrame(taker, durationFrames);
}
/** Two staged figures face each other: each one's facing side (unflipped = right) points at the other. Pure. */
export const facesEachOther = (a: { x: number; flip?: boolean }, b: { x: number; flip?: boolean }): boolean => {
  const dir = Math.sign(b.x - a.x);
  return dir !== 0 && (dir > 0) !== !!a.flip && (dir < 0) !== !!b.flip;
};
type AnyProp = { type?: string; at?: number; arc?: string; motion?: string; motionAt?: number; customSvg?: { title?: string; viewBox?: string; paths?: unknown[] } };
type AnyDiagram = { type?: string; title?: string; labels?: string[]; values?: number[]; at?: number; scorecard?: unknown };
type AnyScene = {
  id?: string;
  fromFrame?: number;
  durationFrames?: number;
  shot?: string;
  transition?: { type?: string; frames?: number; color?: string };
  bg?: { accent?: string };
  continueFromPrev?: boolean;
  /** the planner's stamp on an authored continuation (10x P1): carry the END STATE of the previous deed */
  carryState?: boolean;
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
  /** CARRIED STATE (10x P1): the end state this figure brings in from the deed (absent = none, drawn as before) */
  rest?: RestCarry;
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
  /** the previous scene's diagram as drawn (a scorecard compares stage by stage); absent on older plans */
  prev?: AnyDiagram;
};
export type ScenePlan = {
  active: boolean;
  chars: CharCarry[];
  props: PropCarry[];
  diagram: DiagramCarry | null;
  /** CARRIED STATE (10x P1, scene.carryState): a destination someone was set down in, kept on stage (drawn in front
   *  of the cast at `dest` — the authored destination being kept, never a new icon). Absent on every other plan. */
  place?: PlacePlan;
};

/** a figure's carried END STATE (endState.ts): its posture, where it stands, the rest pose under its new action */
export type RestCarry = {
  posture: Posture;
  anchor: Anchor;
  restAction: string;
  /** scene index of the deed that left it */
  since: number;
  /** the screen stage of a body anchored to a place (the deed's end geometry, reframed for this shot); slot otherwise */
  stage?: Stage;
  /** a body anchored to a place is drawn as the full rig, as it was in the deed (the destination covers real legs) */
  body?: "full";
};
export type PlacePlan = { prop: AnyProp; dest: { x: number; y: number; scale: number }; occupant: string; beside?: string; since: number };
type Stage = { x: number; y: number; scale: number; flip?: boolean };
export type SlotOf = (shot: string, spec: AnyChar, k: number) => Stage;
/** the state rules (endState.ts) + lift geometry (liftLayout.ts) + the shot slots (shots.ts stageChar), passed in by the
 *  renderer (index.tsx) and the tests. Without them no state is carried: the plan is exactly the pre-P1 plan. */
export type CarryDeps = {
  slotOf: SlotOf;
  endStateOf: (action: string | undefined, pairedLift: boolean) => EndState | null;
  keepsRest: (posture: Posture, action: string | undefined) => boolean;
  liftEnd: (lead: Stage, partner: Stage) => { lead: Stage; occ: Stage; dest: { x: number; y: number; scale: number } };
  reframeGroup: (g: Group, srcShot: string, dstShot: string) => Group;
  /** does this shot draw the full rig (legs, a seat, the floor)? (shots.ts: a charsFull slot table) */
  fullBody?: (shot: string) => boolean;
  reframeOne?: (s: Stage, srcShot: string, dstShot: string) => Stage;
};
type CarriedState = {
  rests: Record<string, { posture: Posture; anchor: Anchor; restAction: string; since: number; src?: { stage: Stage; shot: string } }>;
  place?: { prop: AnyProp; group: Group; srcShot: string; occupant: string; beside?: string; since: number };
};

/** Only the AUTHOR's flag makes a scene a renderer continuation (never the director's sustained take). */
export const isAuthoredContinuation = (scene: AnyScene | undefined, index: number): boolean =>
  index > 0 && !!scene && scene.continueFromPrev === true;

/** The accent each scene draws with (Scene.tsx: `transition.color || bg.accent`) — except that an authored
 *  continuation keeps the accent of the scene it continues, so a kept object, callout or icon does not change colour
 *  at the cut (skin-in-the-game 228-229: the held shield turned yellow -> green). Pure. */
export function keptAccents(scenes: AnyScene[]): string[] {
  const out: string[] = [];
  scenes.forEach((s, i) => {
    const own = (s.transition && s.transition.color) || (s.bg && s.bg.accent) || "#E23B57";
    out.push(i > 0 && isAuthoredContinuation(s, i) ? out[i - 1] : own);
  });
  return out;
}

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
  return { shell: true, title: norm(prev.title) === norm(cur.title), labels, values, prevValues, clock: prevClock + prevDuration, prev };
}

// What a scene actually DREW: a chapter card draws only its card, and a shot that drops
// its cast (insert, split, chapterCard — shots.ts dropsCast) draws nobody.
const isCard = (s: AnyScene) => s.shot === "chapterCard" || !!s.chapterCard;
const drawnChars = (s: AnyScene, drawsCast: (shot: string) => boolean): AnyChar[] =>
  isCard(s) || !drawsCast(s.shot ?? "medium") ? [] : s.characters ?? [];

/** The same object across a cut: the same shared icon type — or, for a book's own icon (every one is type
 *  "customSvg"), the same drawing. Two different own icons are two objects: the second draws itself in. */
const svgKey = (p: AnyProp): string => JSON.stringify(p.customSvg ? [p.customSvg.title ?? "", p.customSvg.viewBox ?? "", p.customSvg.paths ?? []] : null);
export const sameObject = (a: AnyProp, b: AnyProp): boolean => a.type === b.type && (a.type !== "customSvg" || svgKey(a) === svgKey(b));

/**
 * The continuity plan of every scene, in order (a chain of continuations carries
 * clocks through each link). plans[i].active is true only for an authored continuation.
 * `drawsCast(shot)` says whether a shot draws its characters (the renderer passes
 * !shotPreset(shot).dropsCast); the default assumes every shot does.
 */
export function planContinuity(scenes: AnyScene[], drawsCast: (shot: string) => boolean = () => true, deps?: CarryDeps): ScenePlan[] {
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
      // place (cycle 6): a continued place kept replaying — the object came back into the hand and was set down again
      const cue = same && (c.action === "take" || c.action === "embrace" || c.action === "place")
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
      const j = prevProps.findIndex((pp, m) => sameObject(pp, p) && !usedP.has(m));
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
  if (deps) applyCarriedState(scenes, plans, drawsCast, deps);
  return plans;
}

/**
 * CARRIED STATE (10x P1, 2026-10-27). A deed leaves an END STATE (endState.ts END_STATES): the lift leaves her IN the
 * destination and the lifter beside it, a sit leaves him seated, a fall leaves her down. On the next scene — ONLY an
 * authored continuation the planner stamped `carryState` — that state is the starting state: the figure keeps its
 * rest (posture under its new action), a figure anchored to the destination stands where the deed left it (reframed
 * like a camera move on another shot: liftLayout.reframeGroup), and the destination stays on stage. A chain carries
 * through every stamped link (a cast-dropping insert passes it on); anything else ends it. An action that needs the
 * legs ends a seated rest (endState.keepsRest) — the authored action always wins. Writes ONLY to plans of stamped
 * scenes, so every other plan is byte-for-byte what it was.
 */
function applyCarriedState(scenes: AnyScene[], plans: ScenePlan[], drawsCast: (shot: string) => boolean, deps: CarryDeps): void {
  const { slotOf, endStateOf, keepsRest, liftEnd, reframeGroup, fullBody, reframeOne } = deps;
  let out: CarriedState | null = null;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (isCard(scene)) { out = null; continue; }
    const stamped = isAuthoredContinuation(scene, i) && scene.carryState === true;
    const inState: CarriedState | null = stamped ? out : null;
    const drawn = drawnChars(scene, drawsCast);
    const shot = scene.shot ?? "medium";
    const next: CarriedState = { rests: {} };
    if (inState && !drawn.length) { out = inState; continue; } // an insert: the state waits off-screen
    const placeGroup = inState && inState.place ? reframeGroup(inState.place.group, inState.place.srcShot, shot) : null;
    let occupantKept = false;
    (scene.characters ?? []).forEach((c, k) => {
      const id = who(c);
      const r = inState && id ? inState.rests[id] : undefined;
      if (!r || !drawn.includes(c) || !keepsRest(r.posture, c.action)) return;
      const rest: RestCarry = { posture: r.posture, anchor: r.anchor, restAction: r.restAction, since: r.since };
      if (placeGroup && inState!.place && r.anchor !== "slot") {
        if (r.anchor === "inPlace" && id === inState!.place.occupant) { rest.stage = placeGroup.occ; rest.body = "full"; occupantKept = true; }
        else if (r.anchor === "besidePlace" && id === inState!.place.beside) { rest.stage = placeGroup.lead; rest.body = "full"; }
      }
      // a seated / down body on a WAIST-UP shot (medium, twoShot): the full figure where it was, reframed like a camera
      // move — a bust cannot show the seat or the floor (under-the-dome 53, 2026-10-27)
      const full = !fullBody || fullBody(shot);
      if (r.anchor === "slot" && r.posture !== "standing" && !full && r.src && reframeOne) { rest.stage = reframeOne(r.src.stage, r.src.shot, shot); rest.body = "full"; }
      if (plans[i].chars[k]) plans[i].chars[k].rest = rest;
      const slotK = plans[i].chars[k] ? plans[i].chars[k].slot : k;
      next.rests[id] = { ...r, src: full ? { stage: slotOf(shot, c, slotK), shot } : r.src };
    });
    if (placeGroup && inState!.place && occupantKept) {
      const pl = inState!.place;
      plans[i].place = { prop: pl.prop, dest: placeGroup.dest, occupant: pl.occupant, ...(pl.beside ? { beside: pl.beside } : {}), since: pl.since };
      next.place = { ...pl, group: placeGroup, srcShot: shot };
    }
    // the deeds of THIS scene leave their own end states (a lift: the pair + the place it set her down in)
    const pair = drawn.length === 2 && drawn[0].action === "lift" && drawn[1].action === "lifted";
    drawn.forEach((c) => {
      const id = who(c);
      const es = id ? endStateOf(c.action, pair) : null;
      if (!es) return;
      const had = next.rests[id];
      const k = (scene.characters ?? []).indexOf(c), slotK = plans[i].chars[k] ? plans[i].chars[k].slot : k;
      const src = !fullBody || fullBody(shot) ? { stage: slotOf(shot, c, slotK), shot } : had && had.src;
      next.rests[id] = { posture: es.posture, anchor: es.anchor, restAction: es.restAction, since: had && had.posture === es.posture && had.anchor === es.anchor ? had.since : i, ...(src ? { src } : {}) };
    });
    if (pair && (scene.props ?? []).length) {
      const k0 = (scene.characters ?? []).indexOf(drawn[0]), k1 = (scene.characters ?? []).indexOf(drawn[1]);
      const s0 = plans[i].chars[k0] ? plans[i].chars[k0].slot : 0, s1 = plans[i].chars[k1] ? plans[i].chars[k1].slot : 1;
      const end = liftEnd(slotOf(shot, drawn[0], s0), slotOf(shot, drawn[1], s1));
      next.place = { prop: JSON.parse(JSON.stringify(scene.props![0])), group: { lead: end.lead, occ: end.occ, dest: end.dest }, srcShot: shot, occupant: who(drawn[1]), beside: who(drawn[0]), since: i };
    }
    out = next;
  }
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
