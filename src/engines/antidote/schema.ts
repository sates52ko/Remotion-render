import { z } from "zod";

/**
 * Antidote engine — scene-JSON schema.
 *
 * A book = an ordered list of SCENES on a shared timeline (frames). Each scene
 * picks a SHOT (the framing), a BACKDROP (parallax set + texture), places
 * characters / motifs / kinetic text, and enters through a TRANSITION.
 *
 * Everything is data — no per-video code. New books = new JSON, same engine.
 *
 * Staging fields (character x/y/scale, text x/y/size) are OPTIONAL: when absent
 * the SHOT preset supplies them (see shots.ts). Older configs that carry explicit
 * numbers keep rendering exactly as before.
 */

export const enterAnim = z.enum(["fade", "left", "right", "up", "down", "pop", "none"]);
export type EnterAnim = z.infer<typeof enterAnim>;

export const charAction = z.enum([
  "idle", "talk", "point", "celebrate", "slump", "think",
  // ── full-body actions (Antidote 3.0) ──────────────────────────────────────
  // The rig was waist-up, so a beat about GOING somewhere had to be narrated by
  // a torso. These need legs: `body: "full"` (the shot usually supplies it).
  "walk", // gait cycle; pair with `travel` to actually cross the frame
  "sit", // knees forward, shins down — a chair/desk/bed beat
  "hold", // forearm raised in front, hand presenting whatever `holds` names
  "reach", // arm extended toward the motif — the figure touches its subject
  "offer", // 10x P1: the hand (with `holds`) held out to someone's face, a little below the shoulder (feeding, a sip, a cigarette)
  "leave", // Action 2.0: on the `actionCue` word the person turns and WALKS OUT — past the partner to the beat's icon (a door) or off the frame — and is gone (stays gone on a `continue` beat)
  "flee", // Action 2.0: on the cue the person RUNS AWAY from the partner (fast gait, forward lean, motion streaks) — out through the icon or off the frame, gone
  "drink", // 10x P2: the held object (`holds`) brought to ONE'S OWN mouth on the `actionCue` word — a sip; the cup tips, the head tips back
  // ── physical situations (2026-09-28) ──────────────────────────────────────
  // Lolita / SBC failed the mute test on dead frames partly because "lies on the
  // floor", "falls", "they fight" could only be drawn with standing people. These
  // are storyboard vocabulary, not one-off poses. The ground states tip the WHOLE
  // figure about its feet (Pose.tip) — limb angles alone cannot make a body lie down.
  "lying", // horizontal on the rig's own low bed, eyes open — in bed, resting, ill
  "collapsed", // horizontal on the bare floor, limbs askew, eyes shut — fainted, knocked out, dead
  "falling", // mid-fall, tipped and airborne, arms flailing, motion streaks
  "fighting", // fighting stance + a thrown punch toward screen-right (the partner)
  "struggling", // straining to break free: leaning away, one arm held back, effort marks
  "grabbing", // lunging, arm straight out at shoulder height — seizing someone or something
  // ── authored ACTIONS with a start, a moment and a result (2026-10-20) ────────
  // Both happen on the author's cue word (`actionAt`, from art.json `actionCue`) and keep their result.
  "place", // Action 3.0: the reverse of take — holds `holds` at the chest; on the cue sets it down in front (it stays there), the empty hand comes back
  "take", // reaches for `holds` resting in front of them; on the cue the hand closes on it and brings it in — it stays in hand
  "embrace", // two people: the lead closes the gap and they hold each other from the cue (the partner embraces back)
  "lift", // two people (2026-10-26): the lead lifts the partner on the cue, carries her to the beat's icon and sets her down in it
  "lifted", // the partner of a lift (never authored alone): rises, is carried, is set down in the destination and stays there
  // ── C19 SEQUENCE ACTIONS (2026-11-07): an action and its result followed across consecutive shots ──────────
  "run", // a running gait on the spot (double cadence, lean, pumping arms); pair with `travel` to cross the frame
  "stop", // running until the cue word, then the body slows and stands still on it (feel-good 224 "You stop running")
  "chop", // `holds` an axe: it rises overhead before the cue and comes DOWN on it — the edge lands on the impact point
  "throw", // `holds` an object: wind-up before the cue, the arm whips forward on it and the object leaves the hand
  "sign", // C19 (2026-11-10): `holds: "pen"` over a paper on the table; on the cue the signature is written out and stays
  //          and flies to `throwTo` (or out of the frame) — the hand is empty from then on
]);
export type CharAction = z.infer<typeof charAction>;

// angry / smirk / blank / afraid (2026-09-26): the five-face palette could not show
// a threat, a sinister charm, apathy or fear — Southern Book Club's authors had to
// choose between "happy" (read as a friendly villain) and "neutral" (read as nothing).
export const expression = z.enum(["neutral", "happy", "sad", "surprised", "worried", "angry", "smirk", "blank", "afraid"]);
export type Expression = z.infer<typeof expression>;

// ── CHARACTER EMOTIONS (Micro-reactions) ──────────────────────────────────
// Over-the-head anime/explainer reactive overlays that give the character emotional life:
// lightbulb (💡 insight), sweat (💧 anxiety/cognitive trap), question (❓ confusion/probe),
// shock (⚡ sudden realization), fire (🔥 intense drive/momentum).
export const charEmotion = z.enum([
  "none",
  "lightbulb",
  "sweat",
  "question",
  "shock",
  "fire",
]);
export type CharEmotion = z.infer<typeof charEmotion>;

// ── SHOT GRAMMAR ────────────────────────────────────────────────────────────
// The framing vocabulary. Without it every scene was the identical waist-up
// figure at x=660 (163 of 181 scenes in clear-thinking). A shot decides where
// the cast stands, how big it reads, and where the kinetic copy lives.
export const shotName = z.enum([
  "wide", // full stage, small figure, environment reads
  "medium", // the classic waist-up presenter (legacy default)
  "closeUp", // face fills frame, copy beside it
  "twoShot", // two characters facing each other
  "overShoulder", // dark foreground shoulder + subject beyond
  "insert", // NO cast — a motif alone carries the beat (pattern interrupt)
  "split", // vertical split screen: before/after, this-vs-that
  "silhouette", // flat dark figure on a bright accent field, huge copy
  "lowAngle", // heroic: figure low and large, copy towering overhead
  "crowd", // the everyman multiplied — "most people…" beats
  "illustration", // a concrete SCENE ICON is the hero (a crash, a home, a lake…),
  //                a silhouette subject beside it — the beat's SUBJECT, not a metaphor
  "diorama", //     the subject is INSIDE the scene: a large environmental icon behind,
  //                a silhouette figure standing within it (in front of the home, at the grave…)
  "beforeAfter", // two scene icons + an arrow between — transformation / this-then-that
  "chapterCard", // monumental chapter / law / part title card (pattern interrupt)
]);
export type ShotName = z.infer<typeof shotName>;

// ── TRANSITIONS ─────────────────────────────────────────────────────────────
// Each scene overlaps the previous one by `frames` and reveals itself across
// that window, so these are true transitions (the outgoing scene is still
// visible underneath) rather than hard cuts.
export const transitionType = z.enum([
  "cut", "dissolve", "wipeRight", "wipeLeft", "wipeUp",
  "whipLeft", "whipRight", "irisIn", "flash", "slideUp",
  // Antidote 2.0 (motion-doctrine / cut-the-curve velocity-matched seams, opt-in)
  "slideCarryLeft", "slideCarryUp", "zoomPush", "zoomPull", "blurCut",
  // Antidote 10x Phase 2 (Book-Skin-Bound CPU-Safe Transitions)
  "pageTurn", "paperTear", "pushThrough", "focusPull", "halftoneCut", "whipPan",
]);
export type TransitionType = z.infer<typeof transitionType>;
export const transitionSchema = z.object({
  type: transitionType.default("cut"),
  frames: z.number().default(10),
  color: z.string().optional(), // accent used by flash / whip streak / iris ring
});
export type TransitionSpec = z.infer<typeof transitionSchema>;
/**
 * Runtime fallback for configs written before the shot grammar existed — they
 * were plain hard cuts. Needed as a real constant (not just a schema default)
 * because Remotion hands `defaultProps` to the renderer WITHOUT parsing them.
 */
export const DEFAULT_TRANSITION: TransitionSpec = { type: "cut", frames: 0 };

// Styles the rig: flat-vector colors + face + a small parametric wardrobe so one
// rig yields a whole cast (hair, glasses, beard, presentation, age, outfit).
// (A raster-cutout rig can be added later without changing scenes — the rig
// field selects which renderer draws it.)
// ── BODY PLAN ───────────────────────────────────────────────────────────────
// The rig used to be waist-up only (viewBox 400×600). That is correct framing
// for a close-up and WRONG for every shot that claims to show a person inside a
// world: a `wide` of a torso floating above a street is the single clearest
// "this is a template" tell we had. `full` draws hips, legs and feet in a taller
// box (400×900) so the figure can stand in, walk through and sit inside a set.
//
// Compatibility: a character with an EXPLICIT `y` keeps the bust rig unless it
// asks for `full` by name, so hand-staged legacy books are untouched (see
// resolveBody in shots.ts).
export const bodyPlan = z.enum(["bust", "full"]);
export type BodyPlan = z.infer<typeof bodyPlan>;

// ── HAND PROPS ──────────────────────────────────────────────────────────────
// The motif library and the rig existed side by side and never touched: a beat
// about a letter drew a huge letter NEXT TO a person whose hands hung at their
// sides. A hand prop is a small glyph anchored to the rig's right hand, so the
// character actually holds the thing the sentence is about.
export const handProp = z.enum([
  "book", "phone", "key", "notes", "letter", "coin", "cup", "lightbulb",
  "mask", "photo", "mirror", "flower", "compass", "briefcase",
  // Step 4: High-Retention Visual Metaphor Handprops
  "shield", "trophy", "hourglass", "sword", "target", "magnifier", "wallet", "gift", "zap",
  // Step 5: Tech, Business & Startup Handprops
  "laptop", "creditCard", "smartphone",
  // 10x P1 (2026-10-27): a lit cigarette held out (inside-out 197)
  "cigarette",
  // Action 3.0 (2026-10-28): a tool that is picked up and put down (don-t-believe 79: "put the tool down")
  "wrench",
  // C19 (2026-11-07): sequence objects — struck with, taken off, found, thrown
  "axe", "shoe", "pebble", "ball", "cash", "pen",
]);
export type HandProp = z.infer<typeof handProp>;

// ── THE CHARACTER FOUNDRY (Antidote 3.1) ────────────────────────────────────
// One rig, colored four ways, wearing one of four outfits, meant every book on
// the channel was cast from the same five people in the same clothes. What makes
// a character read as belonging to a PARTICULAR book is not draughtsmanship —
// it is SILHOUETTE: a hat, a period coat, a child's head-to-body ratio, the
// thing they carry. All of that is parametric, which is our structural
// advantage: the reference channel redraws a cast per book, we recombine one.
export const hairStyle = z.enum([
  "short", "buzz", "bald", "long", "bun",
  "afro", "curly", "ponytail", "braids", "pigtails", "messy", "receding",
]);
export const beardStyle = z.enum(["none", "stubble", "full", "mustache", "goatee", "muttonchops"]);
export const genderPresentation = z.enum(["m", "f"]);
export const ageStage = z.enum(["child", "young", "adult", "old"]);
export const outfitStyle = z.enum([
  "suit", "casual", "uniform", "robe",
  "coat", "dress", "apron", "armor", "overalls", "vest", "cloak", "hoodie", "rags",
]);
/** Headwear is the single cheapest silhouette change there is. */
export const headwearStyle = z.enum([
  "none", "cap", "fedora", "beanie", "hood", "headscarf", "bonnet",
  "crown", "helmet", "topHat", "beret", "veil", "cowboy",
]);
/** Worn accents that sit over the finished garment. */
export const accessoryStyle = z.enum([
  "none", "tie", "bowtie", "scarf", "necklace", "badge", "satchel", "suspenders", "collar",
]);
/** Torso mass. A silhouette is as much width as height. */
export const buildType = z.enum(["slight", "average", "heavy"]);

/**
 * A bespoke shape drawn onto the rig — the escape hatch for the one or two
 * SIGNATURE characters a parametric wardrobe can't reach (an eyepatch, a wing,
 * a chest plate, a birthmark). Authored as data in the book's config, so it
 * still costs no per-video code and still travels in the render bundle.
 *
 * Paths are in the rig's own viewBox units (400 wide; 600 bust / 900 full, with
 * the head centred on x=200,y=150). Keep this rare: a wardrobe combination that
 * reads is better than a hand-authored path that nearly reads.
 */
export const overlayShape = z.object({
  d: z.string(),
  fill: z.string().default("#26241F"),
  opacity: z.number().default(1),
  /** behind = under the body (wings, capes); front = over it (scars, patches). */
  layer: z.enum(["behind", "front"]).default("front"),
});
export type OverlayShape = z.infer<typeof overlayShape>;

/**
 * THE BOOK'S OWN CAST (Film Flow 5, 2026-11-17). The foundry dresses one rig from a wardrobe: eight people of a book
 * were one face in eight coats (blind test, dracula: the cloak read "robe", a cowboy hat "fedora"). `drawn` is a head —
 * and a garment — DRAWN FOR THIS BOOK, as paths in the rig's own units (400 wide; the face is the ellipse at 200,150
 * rx 92 ry 104; eyes at 168,132 and 232,132; mouth at 200,216; shoulders from y ≈ 290). The rig keeps what makes the
 * figure alive — eyes, brows, mouth, the neck, the arms and legs — and draws them in the same places:
 *   back   behind the face (back hair, a hood's drape, the back of a hat)         — replaces the wardrobe's back hair
 *   face   the face itself (a long, a square, a gaunt one; ears)                  — replaces the skin ellipse and ears
 *   hair   on the face, UNDER the eyes and the mouth (fringe, sideburns, a beard) — replaces front hair and beard
 *   top    over everything (a hat, spectacles, a veil's edge)                     — replaces the headwear
 *   cape   behind the body;  body  over the torso (a collar, lapels, a shawl, an apron)
 * A variant that carries any of the four head layers draws NO wardrobe hair, beard or headwear: the head is that drawing.
 * Optional and absent by default: every config written before it renders exactly as it did.
 */
export const drawnShape = z.object({ d: z.string(), fill: z.string().optional(), stroke: z.string().optional(), strokeWidth: z.number().optional(), opacity: z.number().optional() });
export const drawnCast = z.object({ back: z.array(drawnShape), face: z.array(drawnShape), hair: z.array(drawnShape), top: z.array(drawnShape), cape: z.array(drawnShape), body: z.array(drawnShape) }).partial();
export type DrawnCast = z.infer<typeof drawnCast>;

export const variantSchema = z.object({
  skin: z.string().default("#F2C79B"),
  hair: z.string().default("#3A2A22"),
  suit: z.string().default("#4E6E8E"), // primary garment color
  shirt: z.string().default("#FFFFFF"), // inner/accent color
  expression: expression.default("neutral"),
  hairStyle: hairStyle.default("short"),
  glasses: z.boolean().default(false),
  beard: beardStyle.default("none"),
  gender: genderPresentation.default("m"),
  age: ageStage.default("adult"),
  outfit: outfitStyle.default("suit"),
  // ── foundry additions. Every one defaults to the pre-3.1 look, so a config
  //    written before the foundry renders exactly as it did. ────────────────
  headwear: headwearStyle.default("none"),
  accessory: accessoryStyle.default("none"),
  build: buildType.default("average"),
  /** Whole-figure scale, 0.72 (a small child) → 1.12 (a very tall adult). */
  height: z.number().default(1),
  /** Head size relative to the body. A child is not a shrunken adult: 1.18. */
  headScale: z.number().default(1),
  /** Headwear / accessory color; defaults to a shade of the garment. */
  trim: z.string().optional(),
  overlay: z.array(overlayShape).default([]),
  /** a head / garment drawn for this book (Film Flow 5) — see drawnCast */
  drawn: drawnCast.optional(),
});
export type VariantSpec = z.infer<typeof variantSchema>;
// Runtime default, NOT a schema default: Remotion hands defaultProps to the
// renderer unparsed, so every foundry field must have a real value here too.
const VARIANT_DEFAULT = {
  skin: "#F2C79B", hair: "#3A2A22", suit: "#4E6E8E", shirt: "#FFFFFF", expression: "neutral" as const,
  hairStyle: "short" as const, glasses: false, beard: "none" as const, gender: "m" as const, age: "adult" as const, outfit: "suit" as const,
  headwear: "none" as const, accessory: "none" as const, build: "average" as const,
  height: 1, headScale: 1, overlay: [] as [],
};

// ── CAST BIBLE ──────────────────────────────────────────────────────────────
// Without this, the planner minted a brand-new stranger for every scene: 224
// character instances in clear-thinking, 224 distinct identities. A 45-minute
// film with no recurring face reads as stock clip-art, not as a story. Scenes
// now reference a ROLE and the look is resolved from one book-level bible, so
// restyling the whole cast is a single edit and faces actually come back.
export const castRole = z.enum(["narrator", "protagonist", "foil", "mentor", "extra"]);
export type CastRole = z.infer<typeof castRole>;

export const castMemberSchema = z.object({
  name: z.string().default(""), // for the author's benefit; never rendered
  variant: variantSchema,
  /** What this person is to the story — used when the director needs a role
   *  and the book cast under its own names. Optional; defaults by key. */
  role: castRole.optional(),
});
export type CastMember = z.infer<typeof castMemberSchema>;
/**
 * The book's cast, keyed by NAME.
 *
 * It used to be keyed by the five generic roles, which is right for a
 * non-fiction book (there is a narrator and a "you") and wrong for a novel: a
 * story with Patch, Saint and Grace in it was cast as protagonist/foil/mentor,
 * so three different people wore the same three costumes in every book on the
 * channel. The keys are now free strings — `cast.patch`, `cast.saint` — and the
 * five role names remain valid keys, so every config written before this still
 * resolves.
 */
export const castSchema = z.record(z.string(), castMemberSchema);
export type CastBible = Record<string, CastMember | undefined>;

/** Runtime fallback — Remotion hands defaultProps to the renderer unparsed. */
export const DEFAULT_VARIANT: VariantSpec = VARIANT_DEFAULT;

// A character instance placed in a scene. Staging is optional — the shot fills it in.
export const characterSchema = z.object({
  id: z.string(),
  rig: z.enum(["everyman"]).default("everyman"),
  /** Who this is — a key into meta.cast. Either one of the five generic roles
   *  or a character's own name (`"patch"`). `variant` overrides the look. */
  role: z.string().optional(),
  /** Stable book-scoped identity. A named character may not silently degrade
   * into the generic presenter role at render time. */
  identity: z.string().optional(),
  variant: variantSchema.optional(),
  /** Per-scene face, layered over the role's resting expression. */
  expression: expression.optional(),
  /** Over-the-head reactive emotion micro-animation (lightbulb, sweat, question, shock, fire) */
  emotion: charEmotion.optional(),
  /** Frame offset within scene when the emotion overlay pops (defaults to ~8 frames after entrance) */
  emotionAt: z.number().optional(),
  x: z.number().optional(), // center anchor (px, 1920×1080 stage)
  y: z.number().optional(),
  scale: z.number().optional(),
  flip: z.boolean().optional(),
  enter: enterAnim.default("fade"),
  action: charAction.default("idle"),
  silhouette: z.boolean().optional(), // flat dark cut-out (overShoulder / silhouette shots)
  crowd: z.number().optional(), // >1 → replicate into a depth-staggered crowd
  /** bust (waist-up, the legacy rig) or full (hips + legs + feet). The SHOT
   *  supplies this; a scene only sets it to overrule the framing. */
  body: bodyPlan.optional(),
  /** What this character is holding — a glyph anchored to the right hand. */
  holds: handProp.optional(),
  /** SPEECH (CSD 1.1, cycle 8): the words this person SAYS, drawn in a balloon tied to them — the narration's own
   *  words (merge refuses anything else). `at` = scene frame where it is said (the planner anchors it on the words). */
  says: z.object({ text: z.string().min(1).max(80), at: z.number().optional() }).optional(),
  /**
   * Start this character's pose clock N frames in.
   *
   * A scene is its own <Sequence>, so its local frame resets to 0 — which means
   * a SUSTAINED beat (same take, no cut) would replay every entry spring: the
   * seated figure stands up and sits again, the raised arm drops and lifts. The
   * continuation sets `poseAt` so the pose starts already settled and the walk
   * cycle picks up mid-stride.
   */
  poseAt: z.number().optional(),
  /** AUTHORED action moment (art.json `actionCue`, 2026-10-20): scene-relative frame where `take` closes the
   *  hand on its object / `embrace` makes contact. Same clock as `at`. Absent = the beat's 40% point. */
  actionAt: z.number().optional(),
  /** C19: `actionAt` was put on the narrator's word by a shot plan — kept exactly (no minimum lead-in) */
  cueExact: z.boolean().optional(),
  /** C19 `take`: where the object comes from. "body" (off a foot, out of a bag or a pocket) = nothing on a stand before
   *  the cue — the object appears in the hand as it closes (the evaluators read the stand as a trophy / a stick) */
  takeFrom: z.enum(["rest", "body"]).optional(),
  /** C19 (2026-11-09): the held object drawn larger (wide shots shrink it below readability) and with a light outline
   *  (a dark coin on a dark suit read as nothing — Free to Focus #5). */
  holdScale: z.number().optional(),
  holdHalo: z.boolean().optional(),
  /** Horizontal travel across the beat, in stage px: [fromDx, toDx]. Pair with
   *  `action: "walk"` and the figure actually crosses the set instead of
   *  marching on the spot. */
  travel: z.tuple([z.number(), z.number()]).optional(),
  /** C19 `throw`: where the released object flies to, in stage px (it lands and stays there). Absent = out of the
   *  frame on the side the figure faces. */
  throwTo: z.object({ x: z.number(), y: z.number() }).optional(),
  /**
   * MULTIPLANE DEPTH (4.0). How far this figure sits from camera on the z axis:
   * >1 = nearer (parallaxes more on a pan, zooms more), <1 = farther. Only read
   * when `meta.multiplane` is on; otherwise every element is depth 1 (one flat
   * plane) and the shot renders exactly as it did pre-4.0. Omit to let the shot
   * decide (foreground/silhouette → near, subject → focal).
   */
  depth: z.number().optional(),
  /**
   * LOOK-AT (4.0). Where this character's gaze/head turns. `"partner"` = the
   * other character in the shot, `"motif"` = the first prop, `"callout"` = the
   * first kinetic text, `"camera"` = the viewer, or an explicit stage point.
   * Overrides the pose's own wandering gaze. Omit → the character looks wherever
   * its action looks, exactly as before.
   */
  lookAt: z.union([
    z.enum(["partner", "motif", "callout", "camera", "ahead", "viewer", "text", "prop", "heldProp", "hand", "wander"]),
    z.object({ x: z.number(), y: z.number() }),
  ]).optional(),
});
export type CharacterSpec = z.infer<typeof characterSchema>;

// ── MOTIFS (props) ──────────────────────────────────────────────────────────
// The visual-metaphor library. Every entry actually draws something — the old
// coin/book/shape stubs returned null.
export const propType = z.enum([
  "moneyRain", "coin", "book", "arrow", "shape",
  "barChart", "lineGrowth", "balance", "ladder", "door", "clock",
  "maze", "spotlight", "counter", "orbit", "stack", "crack", "ripple", "summit",
  // ── SCENE ICONS ──────────────────────────────────────────────────────────
  // Concrete narrative nouns/events (not metaphors) — what a beat is literally
  // ABOUT. The director maps narration → a concept → one of these, and the
  // `illustration` shot makes it the hero. Priority set chosen by frequency
  // across the whole book catalog (home > family > star > heart > road > …).
  "home", "family", "star", "heart", "road", "storm", "school", "phone",
  "ledge", "medical", "grave", "notes", "water", "fire", "crash", "tree",
  // Phase 2 — next frequency tier across the catalog
  "work", "game", "war", "food", "city", "photo", "law", "mask", "key", "mirror",
  // Archetypal / Philosophical Metaphors (Anthem, Psychology, Strategy)
  "lightbulb", "shadowSelf", "puppeteer", "iceberg", "chains", "compass",
  // Hypnotic Vector Metaphors (Compounding, Hidden Depth, Ruthless Focus)
  "dominoCascade", "icebergDepth", "funnelTrap",
  // Tech & Silicon Valley Business Motifs
  "codeWindow", "laptopMockup", "funnelMetrics", "rocketLaunch", "dollarExchange",
  // High-Retention Narrative & Metaphor Motifs (Antidote 5.1)
  "alarmClock", "hourglass", "zap", "shield", "target", "trophy", "sword",
  "magnifier", "wallet", "gift", "subway", "butterfly", "coffee", "car",
  // a sealed will — inheritance handed down (the gift box read as a birthday present)
  "inheritance",
  // Classical Philosophy & Conceptual Thought Experiments (Antidote 6.1)
  "kallipolis", "caveAllegory", "shipOfState", "tripartiteSoul", "ringOfGyges", "thirtyTyrants", "fiveRegimes", "mythOfEr",
  // Absurdism & existential philosophy (Antidote 6.2) — Sisyphus's boulder.
  "boulder",
  // Dynamic Extensible SVG Motifs (AI Art Director)
  "customSvg",
]);
export type PropType = z.infer<typeof propType>;

/** Author-selectable icon behaviours (art.json `conceptMotion`) and the icons that draw
 *  them. `spin`: the compass needle spins fast and never settles ("the compass spins
 *  uselessly"). STATE CHANGES (2026-10-20, plan P2 candidate 1): the icon starts in its
 *  authored start state and changes ONCE at the cue into its end state, which it keeps —
 *  `break`: intact chains snap apart; `light`: a dark phone screen lights up with a message. Before the cue the
 *  icon shows the start state, after it the end state, on every frame (a still at any
 *  frame shows the same picture as the clip). Nothing here is ever chosen by the engine. */
export const conceptMotion = z.enum(["spin", "break", "light", "split"]);
export type ConceptMotion = z.infer<typeof conceptMotion>;
export const CONCEPT_MOTIONS: Record<string, readonly ConceptMotion[]> = { compass: ["spin"], chains: ["break"], phone: ["light"], customSvg: ["split"] };
/** Motions that END in a different state (the icon keeps it). A continued stage must keep it too.
 *  C19 `split`: a book-own icon (customSvg) halves from its impact point (`splitAt`) at the cue and the halves stay
 *  on the ground; a later shot authors it with motionAt < 0 to start already split. */
export const STATE_MOTIONS: readonly ConceptMotion[] = ["break", "light", "split"];

export const propSchema = z.object({
  type: propType,
  x: z.number().default(960),
  y: z.number().default(540),
  scale: z.number().default(1),
  color: z.string().optional(),
  color2: z.string().optional(),
  value: z.number().optional(), // counter target / bar count / rung count
  label: z.string().optional(), // counter suffix ("%", "X", "M")
  enter: enterAnim.default("fade"),
  /** Frames after the scene starts. A motif should arrive with the idea it
   *  illustrates — a counter that finishes before the number is spoken is worse
   *  than no counter at all. */
  at: z.number().default(0),
  /**
   * The metaphor's ARC — what the motif DOES across the scene.
   *
   * Concept icons (Phase 1) put the beat's literal subject on screen, which
   * fixed "every beat is a talking head" but left the subject inert: a stone
   * that means "shame" just sat there. An arc gives the object the beat's own
   * movement — the stone GROWS, the wall CLOSES IN, the light RISES — so the
   * picture carries the meaning instead of merely naming it.
   *
   * Runs once over the scene, on top of the endless `ambient()` float.
   */
  arc: z.enum(["none", "grow", "shrink", "rise", "fall", "closein", "tilt", "break"]).default("none"),
  /** Multiplane depth (4.0) — see characterSchema.depth. Only read when
   *  `meta.multiplane` is on; omit to let the shot decide (icon shots → focal,
   *  decorative motifs → set back). */
  depth: z.number().optional(),
  /** Visual State Machine (Phase 6.2): Step in the concept's progressive transformation */
  stateIndex: z.number().optional(),
  statePhase: z.string().optional(),
  /** AUTHORED icon behaviour (art.json `conceptMotion`, 2026-10-19). Absent = the icon's
   *  own default (compass: the needle sways). Only the pairs in CONCEPT_MOTIONS draw it;
   *  the planner sets it only when the author asked — never automatically. */
  motion: conceptMotion.optional(),
  /** Scene-relative frame the authored motion starts (word-synced: the callout's
   *  anchored word or the author's `conceptMotionCue` phrase). Same clock as `at`. */
  motionAt: z.number().optional(),
  /** C19 `split`: where the strike lands, as a share of the icon's width (0 left … 1 right; default 0.5) */
  splitAt: z.number().min(0.1).max(0.9).optional(),
  /** C19 `split`: the base the halves fall around, as a share of the icon's height (the log's foot; default 1) */
  splitBase: z.number().min(0.1).max(1).optional(),
  /** Secondary visual anchor for character drama (keeps motif alive in background) */
  isSecondaryAnchor: z.boolean().optional(),
  /** Dynamic vector paths for custom motifs generated on the fly by AI Art Director */
  customSvg: z.object({
    viewBox: z.string().default("0 0 520 520"),
    paths: z.array(z.object({
      d: z.string(),
      fill: z.string().optional(),
      stroke: z.string().optional(),
      strokeWidth: z.number().optional(),
      opacity: z.number().optional(),
      /** C19 `split`: this part does NOT split (the chopping block under the log) */
      fixed: z.boolean().optional(),
    })).default([]),
    title: z.string().optional(),
  }).optional(),
});
export type PropSpec = z.infer<typeof propSchema>;
export type PropArc = PropSpec["arc"];

// ── KINETIC COPY ────────────────────────────────────────────────────────────
// `box` / `outline` / `plain` are the original one-word stamps. The rest are
// PHRASE-level treatments: a callout is now 2–4 words, and a phrase that just
// pops in as one block wastes the beat — these reveal it the way it is spoken.
export const textStyle = z.enum([
  "box", // colored box stamp (the workhorse)
  "outline", // heavy stroke, for stats
  "plain", // bare type
  "reveal", // word by word, each springing in on a stagger
  "highlight", // plain type with an accent bar wiping in behind the last word
  "strike", // type with a stroke drawn through it — "not this"
  "stack", // words stacked vertically, each dropping in
  "marker", // hand-drawn highlighter stroke behind the text (organic, Vox-like)
]);
export type TextStyle = z.infer<typeof textStyle>;

export const textSchema = z.object({
  text: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  style: textStyle.default("box"),
  color: z.string().default("#FFFFFF"),
  boxColor: z.string().default("#E23B57"),
  size: z.number().optional(),
  enter: enterAnim.default("pop"),
  at: z.number().default(0), // frames after the scene starts
  /** Frames the text stays visible before smoothly fading out. Optional. */
  duration: z.number().optional(),
  /** Multiplane depth (4.0) — see characterSchema.depth. Only read when
   *  `meta.multiplane` is on. Copy usually stays on the focal plane (1). */
  depth: z.number().optional(),
});
export type TextSpec = z.infer<typeof textSchema>;

// ── BACKDROP ────────────────────────────────────────────────────────────────
// Flat color fields read as "template". A set gives depth (three parallax layers
// that drift against the camera) and a texture gives the frame its grain.
export const setName = z.enum([
  "none", "horizon", "office", "street", "room", "stage", "sky", "abstract",
  // ── REAL PLACES (Antidote 3.0) ────────────────────────────────────────────
  // Eight abstract fields meant the backdrop never said WHERE a beat happened;
  // the director now maps the beat's own concept to a location (kitchen for a
  // dinner-table beat, court for a trial, shore for a lake). Same three-layer
  // parallax vector budget — no images, no WebGL.
  "kitchen", "bedroom", "classroom", "library", "cafe", "hospital", "court",
  "forest", "shore", "highway",
  // ── TECH & BUSINESS PLACES (Antidote 5.0) ─────────────────────────────────
  // Workplaces for Silicon Valley, SaaS, coding, startups and business strategy.
  "workstation", "startupGarage", "serverRoom", "pitchStage",
  // ── CLASSICAL ANTIQUITY & PHILOSOPHICAL SETS (Antidote 6.1) ───────────────
  // For ancient Greek philosophy, historical statecraft, and foundational thought.
  "agora", "colonnade", "cave", "shipDeck", "manuscript",
  // ── CAMUS ABSURDISM (Antidote 6.2) ────────────────────────────────────────
  // The mythic slope of Sisyphus: no rendered set is this place until a book's
  // own world declares it, and only this book's world does.
  "mountainSlope",
]);
export type SetName = z.infer<typeof setName>;
export const textureName = z.enum(["none", "grain", "dots", "rays", "grid", "paper"]);
export type TextureName = z.infer<typeof textureName>;

// ── EXPLANATORY DIAGRAMS (4.0) ───────────────────────────────────────────────
// Self-drawing conceptual graphics — the reference-channel signature. A diagram
// EXPLAINS a beat (a taxonomy, a sync, a cause→effect, a continuum) where a motif
// only names it. Data-driven: `labels` name the buckets/nodes/poles, `values`
// give optional magnitudes. Rendered on the focal plane, usually with cast dropped.
export const diagramType = z.enum([
  "sorter", // items route into N labelled buckets (classification / taxonomy)
  "matchWave", // two rhythms drift, then lock into sync (matching / entrainment)
  "flow", // cause → effect, a token travelling the chain (process)
  "spectrum", // a marker on a continuum between two poles
  "matrix", // 2x2 decision / prioritization matrix (Eisenhower, risk/reward) [5.0]
  "tree", // hierarchical branching tree / first-principles decomposition [5.0]
  "funnel", // multi-stage distillation / conversion funnel [5.0]
  "scorecard", // weighted decision: criteria with weights, options scored, weight × score → totals [10x, 2026-10-26]
  "refute", // a claim put forward, doubted, rejected ON the narration's word, explained, replaced by the correct model [10x P2, 2026-10-27]
  "causal", // MECHANISM 2.0: a causal chain — stations in causal order, the carried token, its relabel, a contrast row, a loop [10x, 2026-10-28]
  "mechanism", // WHY a result happens: an outcome stacked from factors that persist / are drawn again, two trials, the total settles [10x P1, 2026-10-27]
]);
export type DiagramType = z.infer<typeof diagramType>;
// SCORECARD (10x pilot A, 2026-10-26): a weighted decision that BUILDS over continued beats — the criteria and their
// weights (who weighs them), the options, each option's score per criterion, then weight × score summed into totals.
// A sorter of anonymous dots told a muted viewer nothing (farsighted 306-310: "dots do not differ", TEXT_ONLY).
// Scores are 0..10 drawn as bar length (no number is printed unless the narration states it: `scoreText`);
// null = not graded yet. `show` is the stage this beat reaches; what an earlier continued beat showed is drawn built.
/** REFUTE (10x P2, refute.ts): one diagram over the continued beats of a rejected claim. Words only from the narration. */
const refuteCue = z.union([z.string().min(1), z.object({ phrase: z.string().min(1), occurrence: z.number().int().min(1).optional() })]);
const REFUTE_EL = ["links", "result", "doubt", "rejected", "illusion", "reason", "bounce", "truth", "run", "lock", "ring", "off"] as const;
export const refuteSchema = z.object({
  owner: z.string().min(1), // who puts the claim forward: "THE DEFENSE SAYS"
  claim: z.string().min(1), // the claim, as a line: "MORE INPUTS = MORE OUTPUT"
  inputs: z.array(z.string().min(1)).min(2).max(4),
  hub: z.string().min(1),
  output: z.string().optional(),
  verdict: z.string().min(1), // the stamp ON the claim (never a strike-through)
  reason: z.string().min(1), // WHY it is rejected
  truth: z.string().min(1), // the correct model's name
  illusion: z.string().optional(),
  cues: z.record(z.string(), z.union([refuteCue, z.array(refuteCue)])).optional(),
  at: z.record(z.string(), z.union([z.number().int().min(0), z.array(z.number().int().min(0))])).optional(),
  done: z.array(z.enum(REFUTE_EL)).optional(),
});
/** MECHANISM (10x P1, mechanism.ts): cause -> mechanism -> effect over continued beats. Levels are qualitative, never numbers. */
const MECH_EL = ["trial1", "f0", "f1", "f2", "f3", "group", "trial2", "carry", "redraw", "average", "settle"] as const;
const mechLevel = z.enum(["minus", "none", "low", "normal", "high", "peak"]);
export const mechanismSchema = z.object({
  outcome: z.string().min(1), // what the stack measures: "JUMP"
  factors: z.array(z.object({ label: z.string().min(1), persists: z.boolean() })).min(2).max(4),
  group: z.string().optional(), // the drawn-again factors together: "LUCK"
  trials: z.array(z.object({ label: z.string().min(1), levels: z.array(mechLevel).min(2).max(4) })).min(1).max(2),
  average: z.string().optional(),
  result: z.string().optional(),
  cues: z.record(z.enum(MECH_EL), refuteCue).optional(),
  at: z.record(z.enum(MECH_EL), z.number().int().min(0)).optional(),
  done: z.array(z.enum(MECH_EL)).optional(),
}).refine((m) => m.trials.every((t) => t.levels.length === m.factors.length), { message: "every trial needs one level per factor" })
  .refine((m) => m.factors.some((f) => f.persists) && m.factors.some((f) => !f.persists), { message: "a mechanism needs a factor that persists and one that is drawn again" });
/** CAUSAL CHAIN (Mechanism 2.0, causal.ts): start → trigger → mechanism → change → result over continued beats. */
const CAUSAL_EL = ["n0", "n1", "n2", "n3", "n4", "token", "relabel", "contrast", "loop", "meter", "clap", "csolved", "lrelabel", "lane"] as const;
const causalGlyph = z.enum(["bridge", "heart", "brain", "eye", "phone", "bolt", "drop", "danger", "person", "people", "coin",
  "clock", "speech", "check", "cross", "spark", "lock", "door", "fire", "ice", "water", "plant", "gift", "lever", "pellet", "rat"]);
// MECHANISM 3.0 (causalLedger.ts): laps with outcomes and qualitative bars — never numbers
const ledgerLap = z.object({ o: z.enum(["reward", "empty"]), bar: z.enum(["flat", "stub", "low", "medium", "high", "max"]).optional() });
const ledgerBurst = z.object({ laps: z.array(ledgerLap).min(1).max(8) });
export const causalSchema = z.object({
  stations: z.array(z.object({ label: z.string().min(1), glyph: causalGlyph, mark: z.literal("?").optional(), figure: causalGlyph.optional() })).min(2).max(5),
  token: z.object({ glyph: causalGlyph, tag: z.string().optional(), tagTo: z.union([z.string(), z.array(z.string().min(1)).min(1).max(4)]).optional(), from: z.number().int().min(0), relabelAt: z.number().int().min(0).optional() }).optional(),
  contrast: z.object({ label: z.string().min(1), glyph: causalGlyph, result: z.string().optional(), bursts: z.array(ledgerBurst).max(8).optional() }).optional(),
  ledger: z.object({ label: z.string().optional(), labelTo: z.string().optional(), meter: z.string().optional(), bursts: z.array(ledgerBurst).min(1).max(16) }).optional(),
  before: z.record(z.enum(["loop", "clap", "relabel"]), z.number().int().min(0)).optional(),
  loop: z.object({ to: z.number().int().min(0), label: z.string().optional() }).optional(),
  cues: z.record(z.enum(CAUSAL_EL), z.union([refuteCue, z.array(refuteCue)])).optional(),
  at: z.record(z.enum(CAUSAL_EL), z.union([z.number().int().min(0), z.array(z.number().int().min(0))])).optional(),
  done: z.array(z.enum(CAUSAL_EL)).optional(),
}).refine((c) => !c.token || c.token.from < c.stations.length, { message: "token.from must name a station" })
  .refine((c) => !c.loop || c.loop.to < c.stations.length - 1, { message: "loop.to must be an earlier station" })
  .refine((c) => !c.token || !c.token.tagTo || !!c.token.tag, { message: "token.tagTo needs the first tag" });
export const scorecardSchema = z.object({
  criteria: z.array(z.object({ label: z.string(), weight: z.number().min(0).max(1), owner: z.string().optional(), weightText: z.string().optional() })).min(1).max(3), // weightText: the weight as the narration states it ("×0.4"); none = the bar alone
  options: z.array(z.object({
    label: z.string(),
    scores: z.array(z.number().min(0).max(10).nullable()).default([]),
    scoreText: z.array(z.string().nullable()).optional(), // a number the narration states, shown on the bar ("0")
  })).max(3).default([]),
  show: z.enum(["weights", "options", "scores", "totals"]).default("weights"),
  winner: z.number().int().optional(), // option index to mark — only when the narration says which one wins
});
export type ScorecardSpec = z.infer<typeof scorecardSchema>;
export const diagramSchema = z.object({
  type: diagramType,
  title: z.string().optional(),
  labels: z.array(z.string()).default([]),
  values: z.array(z.number()).default([]),
  at: z.number().default(0), // frames after the scene starts
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().default(1),
  scorecard: scorecardSchema.optional(), // type "scorecard" only; other types ignore it
  refute: refuteSchema.optional(), // type "refute" only (10x P2)
  mechanism: mechanismSchema.optional(), // type "mechanism" only (10x P1)
  causal: causalSchema.optional(), // type "causal" only (Mechanism 2.0)
});
export type DiagramSpec = z.infer<typeof diagramSchema>;

export const chapterCardSchema = z.object({
  category: z.string().default("CHAPTER"),
  number: z.string().default("01"),
  title: z.string(),
  subtitle: z.string().optional(),
  accentColor: z.string().optional(),
});
export type ChapterCardSpec = z.infer<typeof chapterCardSchema>;

export const bgSchema = z.object({
  type: z.enum(["flat", "gradient"]).default("flat"),
  colors: z.array(z.string()).default(["#8FC0E8"]),
  set: setName.default("none"),
  texture: textureName.default("none"),
  accent: z.string().optional(), // set-furniture ink; defaults to a shade of colors[0]
  split: z.array(z.string()).optional(), // split shot: [leftColor, rightColor]
  // THE BOOK'S OWN PLACE (Film Flow 6, 2026-11-17): the drawing of where this happens, from the book's entities.json
  // (a place's `backdrop` or its own paths) — drawn INSTEAD of the shared `set`, at the same spot and size as behind a
  // told stage, so the place holds across the cut. Written by told.js apply from the beat's `place`; absent by default.
  // told v5 slice 4: a place drawn as a SCENE (sky + ground) is drawn as itself behind a figure scene too
  own: z.object({ id: z.string(), wide: z.boolean().optional(), viewBox: z.string().optional(), paths: z.array(z.object({ d: z.string(), fill: z.string().optional(), stroke: z.string().optional(), strokeWidth: z.number().optional(), opacity: z.number().optional() })), sky: z.string().optional(), ground: z.string().optional() }).optional(),
  // Antidote 2.0 (opt-in): curated rich canvas mood & bespoke Flux scenic/isometric diorama backdrop
  stageMood: z.enum([
    "obsidianGrid", "deepViolet", "warmParchment", "crimsonNight", "slateEditorial", "blueprintNavy",
    "inkScroll", "emeraldNoir", "ivoryBroadsheet", "sageBotanical", "terracottaStudio",
    "swissBauhaus", "monoclePrint", "archivalBroadsheet", "sunlitRiso",
    "cyberXRay", "bauhausNocturne", "flutedGallery", "chalkboardLecture",
    "cobaltBlueprint", "forestBotanical", "terracottaEarth", "ochreKraft", "slateDenim", "plumVelvet",
  ]).optional(),
  image: z.object({
    path: z.string(),
    opacity: z.number().min(0).max(1).optional(),
    blur: z.number().min(0).max(24).optional(),
    dim: z.number().min(0).max(0.95).optional(),
    groundFog: z.number().min(0).max(1).optional(),
    emptyStage: z.boolean().optional(),
    ambientCanvas: z.boolean().optional(),
    tintOpacity: z.number().min(0).max(0.95).optional(),
    kenBurns: z.enum(["none", "pushIn", "pullOut", "panLeft", "panRight", "dollyZoom"]).optional(),
  }).optional(),
  // Which act of the director's color script produced this field. Metadata:
  // nothing renders it, but it makes the arc auditable in the config.
  act: z.enum(["setup", "tension", "turn", "resolution"]).optional(),
});
export type BgSpec = z.infer<typeof bgSchema>;

const numPair = z.tuple([z.number(), z.number()]);
export const cameraSchema = z.object({
  zoom: numPair.default([1, 1] as [number, number]), // [from, to]
  panX: numPair.default([0, 0] as [number, number]),
  panY: numPair.default([0, 0] as [number, number]),
  // a quick push-in synced to a beat (usually the kinetic callout's `at` frame)
  punch: z.object({ at: z.number(), amount: z.number().default(0.06) }).optional(),
  // LATE PULSES — extra beats-of-attention on content words spoken later in the
  // scene, so a long scene does not fire everything up front and then hold a
  // frozen frame. Antidote's equivalent of the Vox `anchors` tail (SKILL 9.3b).
  // Frames are RELATIVE to the scene start, same as `punch.at`. Optional, so
  // every pre-existing config renders exactly as before.
  pulses: z.array(z.number()).optional(),
});

export const sceneHudSchema = z.object({
  badge: z.string().optional(), // e.g. "INSIGHT 02 / 07"
  topic: z.string().optional(), // e.g. "THE COMPOUND EFFECT"
  hidden: z.boolean().optional(),
});
export type SceneHudSpec = z.infer<typeof sceneHudSchema>;

// ── SEMANTIC VISUAL ALIGNMENT & PROGRESSION (Antidote 6.0) ───────────────────
// The narrative purpose and progression of the beat. Moves the engine from
// "illustrated radio" (decorational text + random icons) to a visual argument.
export const visualJob = z.enum([
  "explain",      // Deconstructs a mechanism or system into moving parts
  "demonstrate",  // Shows how a specific behavior or action is executed
  "contrast",     // Compares two conflicting realities or mental models (A vs B)
  "reveal",       // Delivers the punchline, resolution, or unexpected truth
  "reinforce",    // Anchors an abstract idea with a memorable symbolic metaphor
  "quantify",     // Shows numerical scale, velocity, or compounding magnitude
  "surprise",     // Subverts expectation with a high-contrast pattern interrupt
  "escalate",     // Heightens tension, stakes, or emotional friction
  "ground",       // Ties an abstract concept to a concrete space or object
  "callback",     // Resurfaces a previously established metaphor/character
  "pattern-break",// Deliberately interrupts rhythm to reset audience attention
]);
export type VisualJob = z.infer<typeof visualJob>;

export const visualTransformation = z.enum([
  "none",         // Stable composition
  "grow",         // Element or pressure expands to fill the frame
  "shrink",       // Subject diminishes or is marginalized
  "multiply",     // A single element reproduces into an overwhelming crowd/grid
  "overload",     // Screen becomes cluttered with stimuli/notifications/friction
  "isolate",      // Clutter disappears, leaving the subject alone
  "reveal_truth", // Surface facade gives way to the underlying reality
  "shift_focus",  // Visual dominance transfers from one subject to another
]);
export type VisualTransformation = z.infer<typeof visualTransformation>;

export const visualArcSchema = z.object({
  startState: z.string(),
  endState: z.string(),
  transformation: visualTransformation.default("none"),
});
export type VisualArcSpec = z.infer<typeof visualArcSchema>;

// ── PROPOSITIONAL VISUAL GRAMMAR & INFORMATION GAIN (Antidote 6.2) ──────────
// Elevates the engine from keyword motif matching to proposition-level causality.
export const visualMode = z.enum([
  "literal",           // Direct real-world depiction (e.g. Athenian street / assembly)
  "metaphor",          // Symbolic archetype (e.g. Ring of Gyges on plinth)
  "causal_diagram",    // Dynamics showing how force A produces result B
  "spatial_state",     // Living environmental stage progression (e.g. depths of cave -> sun)
  "character_drama",   // Moral fork / philosophical dialectic between characters
  "transformation",    // Entity degrading or evolving across states (e.g. regimes crumbling)
  "comparison_split",  // Competing definitions or moral paths side-by-side
  "environment_mood",  // Atmosphere and geography carrying the weight
]);
export type VisualMode = z.infer<typeof visualMode>;

export const claimType = z.enum([
  "assertion",      // Direct affirmation of a premise
  "negation",       // Direct refutation / denial of a false premise
  "contrast",       // Dynamic collision of two opposing viewpoints (A vs B)
  "causal",         // Cause -> Effect mechanism
  "question",       // Socratic probe / inquiry opening curiosity gap
  "counterexample", // Outlier or objection disrupting general rule
  "definition",     // Core conceptual essence
  "analogy",        // Allegory / metaphorical mapping
  "consequence",    // Unavoidable result / downstream impact
]);
export type ClaimType = z.infer<typeof claimType>;

export const epistemicStance = z.enum(["affirmed", "refuted", "questioned", "hypothetical"]);
export type EpistemicStance = z.infer<typeof epistemicStance>;

export const visualInformationGain = z.union([
  z.enum([
    "high", "medium", "low",
    "decorative", "reinforcing", "illustrative", "explanatory", "causal", "transformative",
  ]),
  z.number(),
]);
export type VisualInformationGain = z.infer<typeof visualInformationGain>;

export const directorSchema = z.object({
  viewerFocus: z.string().optional(),          // Focal element commanding initial viewer gaze
  visualSubject: z.string().optional(),        // Primary subject
  secondarySubject: z.string().optional(),      // Background contextual anchor
  relationship: z.string().optional(),         // 'confrontation' | 'temptation' | 'allegory' | 'subjection' | etc.
  cameraIntent: z.string().optional(),         // 'observe moral choice' | 'expose illusion' | etc.
  composition: z.string().optional(),          // 'foreground-character / background-symbol' | etc.
  motionIntent: z.string().optional(),         // 'slow push-in' | 'dramatic hold' | etc.
  revealOrder: z.array(z.string()).default([]),// Chronological sequence of elements discovered by the eye
});
export type DirectorSpec = z.infer<typeof directorSchema>;

export const vigBreakdownSchema = z.object({
  claimCoverage: z.number().min(0).max(1).optional(),        // Portion of claim entities visible
  relationshipCoverage: z.number().min(0).max(1).optional(), // Structural/dialectical link visible
  mechanismCoverage: z.number().min(0).max(1).optional(),    // 'How/why' causal mechanism visible (not just static icons)
  stateChange: z.number().min(0).max(1).optional(),          // Active metamorphosis or contrast
  audioSurplus: z.number().min(0).max(1).optional(),         // Inferential knowledge unseen by ear alone
  rationale: z.string().optional(),
});
export type VigBreakdown = z.infer<typeof vigBreakdownSchema>;

export const counterThesisEvidence = z.enum(["direct", "inferred", "absent"]);
export type CounterThesisEvidence = z.infer<typeof counterThesisEvidence>;

export const visualPropositionSchema = z.object({
  claim: z.string(),                           // The core philosophical assertion
  claimType: claimType.optional(),             // Epistemic category of the claim
  epistemicStance: epistemicStance.optional(),  // affirmed / refuted / questioned / hypothetical
  thesis: z.string().optional(),               // The primary proposition claimed or challenged
  counterThesis: z.string().optional(),        // Opposing stance or dialectical counter-principle
  counterThesisEvidence: counterThesisEvidence.optional(), // 'direct' | 'inferred' | 'absent'
  visualQuestion: z.string().optional(),       // What information the viewer must infer visually that audio alone cannot convey
  visualAnswer: z.string().optional(),         // Concrete visual mechanism answering the visual question
  subject: z.string().optional(),              // Primary conceptual subject
  mechanism: z.string().optional(),            // Causal action or dynamic link
  stakes: z.string().optional(),               // Moral/philosophical friction
  stateIndex: z.number().optional(),           // Step in visual state machine (0, 1, 2...)
  stateTotal: z.number().optional(),           // Total steps in state machine
  statePhase: z.string().optional(),           // Descriptive phase name
});
export type VisualPropositionSpec = z.infer<typeof visualPropositionSchema>;

// ── P1.1 NARRATIVE VISUAL FIREWALL ─────────────────────────────────────────
// These fields are deliberately data-only. The renderer does not "fix" missing
// semantics; the pre-render firewall rejects them before pixels are made.
const firewallProvenanceSchema = z.object({
  bookId: z.string(), sourceChapter: z.string(), narrativeSubject: z.string(),
  narrativeRelation: z.string(), narrativeState: z.string(), worldId: z.string(),
  allowedMotifs: z.array(z.string()), forbiddenMotifs: z.array(z.string()),
  allowedCharacters: z.array(z.string()), allowedLocations: z.array(z.string()),
  allowedProps: z.array(z.string()),
});
export const narrativeAtomSchema = firewallProvenanceSchema;
export const visualIntentSchema = firewallProvenanceSchema.extend({ visualSubject: z.string().optional(), visualRelation: z.string().optional(), visualState: z.string().optional() });
export const visualContractSchema = firewallProvenanceSchema.extend({
  visualEvidence: z.object({ subjects: z.array(z.string()), relations: z.array(z.string()), states: z.array(z.string()) }),
  characterIntent: z.array(z.object({ identity: z.string(), role: z.string(), action: z.string(), gaze: z.union([z.string(), z.object({ x: z.number(), y: z.number() })]), state: z.string() })).default([]),
});

export const attentionTarget = z.enum([
  "character",
  "partner",
  "heldProp",
  "motif",
  "text",
  "diagram",
  "hud",
]);
export type AttentionTarget = z.infer<typeof attentionTarget>;

export const attentionMilestonesSchema = z.array(attentionTarget);
export type AttentionMilestonesSpec = z.infer<typeof attentionMilestonesSchema>;

// ── NARRATIVE DIRECTOR CORE (Antidote God Mode: Phase 1) ──────────────────────
// Answers "Why does this beat exist?". Governs macro tension, curiosity gaps,
// and promise/payoff cycles so the film moves forward relentlessly.
export const narrativeFunction = z.enum([
  "HOOK",           // Initial attention-grabber / opening hook
  "QUESTION",       // Opens a cognitive curiosity gap / probe
  "SETUP",          // Establishes context, baseline premise, or promise
  "EXPLANATION",    // Unpacks mechanism / conceptual information
  "TENSION",        // Emotional or situational friction rises
  "CONTRADICTION",  // Subverts conventional wisdom / counter-intuitive turn
  "REVEAL",         // Breakthrough insight / unmasking the truth
  "PAYOFF",         // Fulfills an earlier promise / resolution
  "TRANSITION",     // Bridge between chapters / conceptual shift
  "REFLECTION",     // Contemplative takeaways / philosophical pause
]);
export type NarrativeFunction = z.infer<typeof narrativeFunction>;

export const promiseRole = z.enum(["setup", "reminder", "escalation", "payoff", "standalone"]);
export type PromiseRole = z.infer<typeof promiseRole>;

export const promiseLifecycleSchema = z.object({
  promiseId: z.string(),
  question: z.string().optional(),
  setupBeat: z.number(),
  reminderBeats: z.array(z.number()).default([]),
  payoffBeat: z.number().optional(),
  status: z.enum(["open", "resolved", "abandoned"]).default("open"),
  theme: z.string().optional(),
});
export type PromiseLifecycle = z.infer<typeof promiseLifecycleSchema>;

export const narrativeSignalsSchema = z.object({
  function: narrativeFunction,
  nextQuestion: z.string().optional(),     // New question or tension raised
  payoffPromise: z.string().optional(),    // Promise ID opened by this beat
  payoff: z.string().optional(),           // Promise ID resolved by this beat
  promiseId: z.string().optional(),        // Associated promise lifecycle ID (Phase 3)
  promiseRole: promiseRole.optional(),     // Role within the promise lifecycle (Phase 3)
  escalates: z.boolean().default(false),   // Does this beat increase the stakes?
  conceptual: z.boolean().default(false),  // Is it an abstract theoretical principle?
  emotional: z.boolean().default(false),   // Is it a high-stakes emotional beat?
});
export type NarrativeSignalsSpec = z.infer<typeof narrativeSignalsSchema>;

/** Audio Director Layer (God Mode Phase 7): Frame-accurate tactile SFX & selective silence */
export const audioEventType = z.enum([
  "pop", "whoosh", "ding", "thud", "silence", "tick",
  "pageTurn", "bookPlace", "paperShift", "softSwish", "clothAccent",
]);
export const audioEventSchema = z.object({
  type: audioEventType,
  frameOffset: z.number().default(0), // offset relative to scene.fromFrame
  volume: z.number().default(0.15),
  durationFrames: z.number().optional(),
  reason: z.string().optional(),
});
export type AudioEventSpec = z.infer<typeof audioEventSchema>;

/** EXPERIMENT: book-independent control-by-narrative staging (only present when the planner flag emits it). */
const stagingGroup = z.object({ key: z.string(), label: z.string(), body: z.string(), accent: z.string(), count: z.number() });
const stagingCue = z.object({ local: z.number(), seconds: z.number(), phrase: z.string(), keyword: z.string() });
export const relationshipStagingSchema = z.object({
  mechanism: z.enum(["control-by-narrative", "control-by-message"]),
  rulingGroup: stagingGroup,
  ruledGroup: stagingGroup,
  means: z.object({ label: z.string(), marker: z.string().optional() }),
  rejected: z.object({ kind: z.literal("gun"), label: z.string() }).optional(),
  negation: z.object({ kind: z.literal("text"), word: z.string(), label: z.string() }).optional(),
  counterAction: z.object({ kind: z.literal("wheel"), label: z.string() }).optional(),
  effect: z.literal("none").optional(),
  cues: z.object({ means: stagingCue, lie: stagingCue.optional(), rejected: stagingCue.optional(), negation: stagingCue.optional(), counter: stagingCue.optional() }).optional(),
});

/** C19 BEAT SHOT: one shot cut INSIDE a beat on the narrator's word. from/to are beat-relative frames; the shot brings
 *  its own staging (absent characters / props / texts = none), the beat keeps its id, start, length and transition. */
export const beatShotSchema = z.object({
  from: z.number(), to: z.number(), kept: z.boolean().optional(), // kept = the beat's own authored staging
  shot: z.string().optional(), bg: z.any().optional(), camera: z.any().optional(),
  characters: z.array(characterSchema).optional(), props: z.array(propSchema).optional(), texts: z.array(z.any()).optional(),
  /** the narrator's word the shot was cut on (null for the first shot) — provenance, not read by the renderer */
  cutAt: z.string().nullable().optional(),
});
export type BeatShot = z.infer<typeof beatShotSchema>;

const v2Tone = z.enum(["neutral", "accent", "danger", "positive"]);

/** Antidote 2.0 (opt-in): Causal visual equation [Node A] -> [Mechanism B] -> [Outcome C] */
export const visualEquationSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  layout: z.enum(["cards", "borderless"]).optional(),
  nodeShape: z.enum(["circle", "arch", "hex", "tornPaper", "filmStrip"]).optional(),
  operator: z.enum(["arrow", "versus", "transform"]).optional(),
  nodes: z.array(z.object({
    label: z.string().min(1),
    sublabel: z.string().optional(),
    badge: z.string().optional(),
    glyph: z.string().optional(),
    image: z.string().optional(),
    imageFit: z.enum(["cover", "contain"]).optional(),
    tone: v2Tone.optional(),
  })).min(2).max(4),
  footnote: z.string().optional(),
  at: z.number().optional(),
});
export type VisualEquationSpec = z.infer<typeof visualEquationSchema>;

/** Antidote 2.0 (opt-in): Side-by-side visual comparison cards (Anchoring, Strategy A vs B) */
export const comparisonGridSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  layout: z.enum(["cards", "fullBleedSplit", "borderless"]).optional(),
  columns: z.array(z.object({
    heading: z.string().min(1),
    tag: z.string().optional(),
    image: z.string().optional(),
    bullets: z.array(z.string()).default([]),
    highlight: z.string().optional(),
    tone: v2Tone.optional(),
  })).min(2).max(3),
  at: z.number().optional(),
});
export type ComparisonGridSpec = z.infer<typeof comparisonGridSchema>;

/** Antidote 2.0 (opt-in): 2x2 Quadrant Matrix, Dual-Curve Intensity Chart, or Weekly Schedule */
export const dataMatrixSchema = z.object({
  variant: z.enum(["quadrant2x2", "dualCurve", "schedule"]),
  borderless: z.boolean().optional(),
  drawAt: z.number().optional(),
  quadrantRevealStep: z.number().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  quadrants: z.array(z.object({
    label: z.string().min(1),
    sublabel: z.string().optional(),
    tone: v2Tone.optional(),
    active: z.boolean().optional(),
  })).max(4).optional(),
  curves: z.array(z.object({
    label: z.string().min(1),
    points: z.array(z.number().min(0).max(1)).min(2),
    color: z.string().optional(),
  })).max(3).optional(),
  schedule: z.array(z.object({
    day: z.string().min(1),
    blocks: z.array(z.object({
      label: z.string().optional(),
      active: z.boolean().optional(),
      tone: v2Tone.optional(),
    })).default([]),
  })).max(7).optional(),
  callout: z.string().optional(),
  at: z.number().optional(),
});
export type DataMatrixSpec = z.infer<typeof dataMatrixSchema>;

/** Antidote 2.0 (opt-in): Real-world book/author/study anchor with animated editorial callout arrows */
export const realAnchorSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  image: z.string().optional(),
  quote: z.string().optional(),
  attribution: z.string().optional(),
  highlightPhrases: z.array(z.object({
    text: z.string().min(1),
    at: z.number(),
  })).optional(),
  marginNote: z.object({
    text: z.string().min(1),
    at: z.number().optional(),
  }).optional(),
  annotations: z.array(z.object({
    text: z.string().min(1),
    side: z.enum(["left", "right"]).default("left"),
  })).default([]),
  at: z.number().optional(),
});
export type RealAnchorSpec = z.infer<typeof realAnchorSchema>;

/** Antidote 2.0 (opt-in): Book-level art direction lock (breaks channel-wide YPP template clustering) */
export const artDirectionSchema = z.object({
  style: z.string().optional(),
  stylePack: z.string().optional(),
  castMode: z.enum(["illustrated", "vectorRig"]).optional(),
  polarity: z.enum(["dark", "light", "chromaticMid"]).optional(),
  typography: z.enum(["poppins", "serif", "condensed", "slab"]).optional(),
  annotationStyle: z.enum(["circle", "bracket", "underline", "spotlightMask", "pin"]).optional(),
  nodeShape: z.enum(["circle", "arch", "hex", "tornPaper", "filmStrip"]).optional(),
  layoutGrammar: z.enum(["centered", "editorialLeft", "editorialRight", "cinemaWide", "splitSpine", "swissPoster", "magazineMasthead", "filmFrame", "diagonalSplit"]).optional(),
  transitionFamily: z.enum(["paper", "editorial", "blueprint", "print", "cinema", "kinetic"]).optional(),
  captionAlign: z.enum(["center", "left"]).optional(),
  captionStyle: z.enum(["editorialBar", "kineticPill", "cinemaLower", "printRule"]).optional(),
  surfaceFinish: z.enum(["studioClean", "paperGrain", "blueprintTech", "editorialHalftone", "cinemaGlow"]).optional(),
  mood: z.enum([
    "obsidianGrid", "deepViolet", "warmParchment", "crimsonNight", "slateEditorial", "blueprintNavy",
    "inkScroll", "emeraldNoir", "ivoryBroadsheet", "sageBotanical", "terracottaStudio",
    "swissBauhaus", "monoclePrint", "archivalBroadsheet", "sunlitRiso",
    "cyberXRay", "bauhausNocturne", "flutedGallery", "chalkboardLecture",
    "cobaltBlueprint", "forestBotanical", "terracottaEarth", "ochreKraft", "slateDenim", "plumVelvet",
  ]).optional(),
  palette: z.object({
    bg: z.string().optional(),
    bgAlt: z.string().optional(),
    surface: z.string().optional(),
    surfaceBorder: z.string().optional(),
    ink: z.string().optional(),
    muted: z.string().optional(),
    accent: z.string().optional(),
    accent2: z.string().optional(),
    danger: z.string().optional(),
    positive: z.string().optional(),
  }).optional(),
  fontDisplay: z.string().optional(),
  fontBody: z.string().optional(),
  captions: z.enum(["off", "minimal", "box"]).optional(),
  hud: z.enum(["off", "minimal", "default"]).optional(),
  motionDoctrine: z.boolean().optional(),
});
export type ArtDirectionSpec = z.infer<typeof artDirectionSchema>;

export const shotIntentSchema = z.object({
  job: z.enum(["contrast", "annotate-place", "cohort-split", "character-drama", "mechanism-flow", "data-proof", "document-quote", "framework-map", "cutout-drama", "manifesto", "decision-tree", "tradeoff-scale", "burner-grid", "live-interface", "comic-strip", "before-after-wipe", "spatial-journey", "chapter-interstitial"]),
  subject: z.string().min(1),
  action: z.string().min(1),
  payoff: z.string().min(1),
  revealFrame: z.number().optional(),
});
export type ShotIntentSpec = z.infer<typeof shotIntentSchema>;

export const annotatedSceneSchema = z.object({
  image: z.string(),
  kenBurns: z.enum(["none", "pushIn", "pullOut", "panLeft", "panRight", "dollyZoom"]).optional(),
  dim: z.number().min(0).max(0.8).optional(),
  framing: z.enum(["fullBleed", "editorialPrint"]).optional(),
  markerStyle: z.enum(["circle", "bracket", "underline", "spotlightMask", "pin"]).optional(),
  banner: z.object({ text: z.string(), at: z.number().optional() }).optional(),
  spotlights: z.array(z.object({
    cx: z.number(),
    cy: z.number(),
    rx: z.number().default(140),
    ry: z.number().optional(),
    label: z.string().optional(),
    note: z.string().optional(),
    labelPos: z.enum(["left", "right", "top", "bottom"]).optional(),
    labelX: z.number().optional(),
    labelY: z.number().optional(),
    tone: v2Tone.optional(),
    at: z.number().default(0),
  })).default([]),
  traces: z.array(z.object({
    from: z.object({ x: z.number(), y: z.number(), label: z.string().optional() }),
    to: z.object({ x: z.number(), y: z.number(), label: z.string().optional() }),
    tone: v2Tone.optional(),
    at: z.number().default(0),
    dur: z.number().default(24),
  })).default([]),
  stickers: z.array(z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    icon: z.enum(["envelope", "eye", "spark", "clock", "check", "quote"]).optional(),
    x: z.number(),
    y: z.number(),
    rot: z.number().optional(),
    tone: v2Tone.optional(),
    at: z.number().default(0),
  })).default([]),
  at: z.number().optional(),
});
export type AnnotatedSceneSpec = z.infer<typeof annotatedSceneSchema>;

export const cohortGridSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  total: z.number().int().min(6).max(40).default(20),
  splitAt: z.number().default(45),
  leftGroup: z.object({
    label: z.string(),
    sublabel: z.string().optional(),
    badge: z.string().optional(),
    share: z.number().min(0.1).max(0.9).default(0.5),
    tone: v2Tone.optional(),
  }),
  rightGroup: z.object({
    label: z.string(),
    sublabel: z.string().optional(),
    badge: z.string().optional(),
    share: z.number().min(0.1).max(0.9).default(0.5),
    tone: v2Tone.optional(),
  }),
  insetImage: z.object({
    path: z.string(),
    caption: z.string().optional(),
    at: z.number().default(90),
  }).optional(),
  callout: z.string().optional(),
  calloutAt: z.number().optional(),
  at: z.number().optional(),
});
export type CohortGridSpec = z.infer<typeof cohortGridSchema>;

export const timelineScrubSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  events: z.array(z.object({
    time: z.string(),
    title: z.string().min(1),
    detail: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().default(0),
  })).min(2).max(6),
  loopLabel: z.string().optional(),
  loopAt: z.number().optional(),
  callout: z.string().optional(),
  calloutAt: z.number().optional(),
  at: z.number().optional(),
});
export type TimelineScrubSpec = z.infer<typeof timelineScrubSchema>;

export const statSlamSchema = z.object({
  kicker: z.string().optional(),
  value: z.string().min(1),
  label: z.string().min(1),
  note: z.string().optional(),
  framing: z.enum(["paperBlock", "blueprint", "minimal"]).optional(),
  tone: v2Tone.optional(),
  bars: z.array(z.object({
    label: z.string().min(1),
    value: z.number().min(0).max(1),
    text: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).max(4).optional(),
  at: z.number().optional(),
});
export type StatSlamSpec = z.infer<typeof statSlamSchema>;

export const cutoutStageSchema = z.object({
  backdrop: z.object({
    image: z.string(),
    dim: z.number().min(0).max(0.6).optional(),
    kenBurns: z.enum(["none", "pushIn", "pullOut", "panLeft", "panRight", "dollyZoom"]).optional(),
  }),
  banner: z.object({ text: z.string(), at: z.number().optional() }).optional(),
  actors: z.array(z.object({
    id: z.string(),
    image: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    flip: z.boolean().optional(),
    enter: z.enum(["left", "right", "up", "fade", "pop"]).optional(),
    at: z.number().optional(),
    action: z.enum(["stand", "leanIn", "nod", "stepIn", "overwhelmed", "calm"]).optional(),
    actionAt: z.number().optional(),
    poses: z.array(z.object({ at: z.number(), image: z.string() })).optional(),
    says: z.object({
      text: z.string().min(1),
      at: z.number().optional(),
      side: z.enum(["left", "right"]).optional(),
      tone: v2Tone.optional(),
    }).optional(),
  })).min(1).max(3),
  props: z.array(z.object({
    image: z.string().optional(),
    label: z.string().optional(),
    sublabel: z.string().optional(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    fromX: z.number().optional(),
    fromY: z.number().optional(),
    rot: z.number().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
    fadeAt: z.number().optional(),
  })).default([]),
  connectors: z.array(z.object({
    from: z.object({ x: z.number(), y: z.number() }),
    to: z.object({ x: z.number(), y: z.number() }),
    label: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).optional(),
  callout: z.string().optional(),
  calloutAt: z.number().optional(),
  at: z.number().optional(),
});
export type CutoutStageSpec = z.infer<typeof cutoutStageSchema>;

export const editorialSpreadSchema = z.object({
  image: z.string(),
  mediaSide: z.enum(["left", "right"]).default("left"),
  kicker: z.string().optional(),
  headline: z.string().min(1),
  quote: z.string().optional(),
  highlightPhrases: z.array(z.object({ text: z.string().min(1), at: z.number() })).optional(),
  points: z.array(z.object({
    label: z.string().min(1),
    detail: z.string().optional(),
    at: z.number().optional(),
    tone: v2Tone.optional(),
  })).optional(),
  attribution: z.string().optional(),
  at: z.number().optional(),
});
export type EditorialSpreadSpec = z.infer<typeof editorialSpreadSchema>;

export const kineticManifestoSchema = z.object({
  kicker: z.string().optional(),
  lines: z.array(z.object({
    text: z.string().min(1),
    emphasis: z.boolean().optional(),
    tone: v2Tone.optional(),
    strikeAt: z.number().optional(),
    at: z.number().optional(),
  })).min(1).max(5),
  divider: z.enum(["none", "line"]).optional(),
  footnote: z.string().optional(),
  footnoteAt: z.number().optional(),
  at: z.number().optional(),
});
export type KineticManifestoSpec = z.infer<typeof kineticManifestoSchema>;

export const decisionTreeSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  root: z.object({ label: z.string().min(1), sublabel: z.string().optional() }),
  branches: z.array(z.object({
    label: z.string().min(1),
    sublabel: z.string().optional(),
    outcome: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
    pruneAt: z.number().optional(),
    winner: z.boolean().optional(),
  })).min(2).max(4),
  callout: z.string().optional(),
  calloutAt: z.number().optional(),
  at: z.number().optional(),
});
export type DecisionTreeSpec = z.infer<typeof decisionTreeSchema>;

const scaleWeightSchema = z.object({
  label: z.string().min(1),
  sublabel: z.string().optional(),
  weight: z.number().min(0.2).max(5).default(1),
  tone: v2Tone.optional(),
  at: z.number().optional(),
});

export const balanceScaleSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  leftLabel: z.string().min(1),
  rightLabel: z.string().min(1),
  leftWeights: z.array(scaleWeightSchema).min(1).max(4),
  rightWeights: z.array(scaleWeightSchema).min(1).max(4),
  verdict: z.string().optional(),
  verdictAt: z.number().optional(),
  at: z.number().optional(),
});
export type BalanceScaleSpec = z.infer<typeof balanceScaleSchema>;

export const stackRevealSchema = z.object({
  variant: z.enum(["strata", "burners"]).default("burners"),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  items: z.array(z.object({
    label: z.string().min(1),
    detail: z.string().optional(),
    level: z.number().min(0).max(1).optional(),
    targetLevel: z.number().min(0).max(1).optional(),
    changeAt: z.number().optional(),
    active: z.boolean().optional(),
    tone: v2Tone.optional(),
  })).min(2).max(5),
  callout: z.string().optional(),
  calloutAt: z.number().optional(),
  at: z.number().optional(),
});
export type StackRevealSpec = z.infer<typeof stackRevealSchema>;

export const liveInterfaceSchema = z.object({
  variant: z.enum(["calendarTetris", "notificationFlood", "chatThread", "metricBoard"]).default("calendarTetris"),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  channels: z.array(z.object({
    name: z.string().min(1),
    preview: z.string().optional(),
    count: z.union([z.number(), z.string()]).optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).optional(),
  blocks: z.array(z.object({
    day: z.number().int().min(0).max(4),
    label: z.string().min(1),
    span: z.number().min(0.6).max(3).optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).optional(),
  at: z.number().optional(),
});
export type LiveInterfaceSpec = z.infer<typeof liveInterfaceSchema>;

export const comicStripSchema = z.object({
  layout: z.enum(["triptych", "quad2x2", "asymmetric3"]).default("quad2x2"),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  panels: z.array(z.object({
    step: z.string().optional(),
    title: z.string().min(1),
    caption: z.string().optional(),
    image: z.string().optional(),
    visual: z.enum(["focusBeam", "floodArrows", "thinSpread", "buriedCore"]).optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
    strikeAt: z.number().optional(),
  })).min(2).max(4),
  at: z.number().optional(),
});
export type ComicStripSpec = z.infer<typeof comicStripSchema>;

export const beforeAfterWipeSchema = z.object({
  direction: z.enum(["horizontal", "diagonal"]).default("diagonal"),
  wipeAt: z.number().optional(),
  endSplit: z.number().min(0).max(1).optional(),
  before: z.object({
    image: z.string().optional(),
    label: z.string().min(1),
    headline: z.string().min(1),
    points: z.array(z.string()).optional(),
    tone: v2Tone.optional(),
  }),
  after: z.object({
    image: z.string().optional(),
    label: z.string().min(1),
    headline: z.string().min(1),
    points: z.array(z.string()).optional(),
    tone: v2Tone.optional(),
  }),
  at: z.number().optional(),
});
export type BeforeAfterWipeSpec = z.infer<typeof beforeAfterWipeSchema>;

export const spatialJourneySchema = z.object({
  variant: z.enum(["constellation", "routeMap", "topoExpedition", "worldArc"]).optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  stations: z.array(z.object({
    label: z.string().min(1),
    detail: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).min(2).max(5),
  at: z.number().optional(),
});
export type SpatialJourneySpec = z.infer<typeof spatialJourneySchema>;

export const chapterInterstitialSchema = z.object({
  variant: z.enum(["broadsheetRule", "blueprintStamp", "verticalSpine", "fullBleedMask"]).default("broadsheetRule"),
  kicker: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  at: z.number().optional(),
});
export type ChapterInterstitialSpec = z.infer<typeof chapterInterstitialSchema>;

// ── Antidote 10x Phase 2 (7 New CPU-Safe Storytelling Devices) ───────────────
export const vennMergeSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  circles: z.array(z.object({
    label: z.string().min(1),
    sublabel: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).min(2).max(3),
  intersection: z.object({
    label: z.string().min(1),
    detail: z.string().optional(),
    at: z.number().optional(),
  }),
  callout: z.string().optional(),
  at: z.number().optional(),
});
export type VennMergeSpec = z.infer<typeof vennMergeSchema>;

export const explodedViewSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  layers: z.array(z.object({
    label: z.string().min(1),
    detail: z.string().optional(),
    badge: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).min(2).max(6),
  expandAt: z.number().optional(),
  callout: z.string().optional(),
  at: z.number().optional(),
});
export type ExplodedViewSpec = z.infer<typeof explodedViewSchema>;

export const gravityPileSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  items: z.array(z.object({
    label: z.string().min(1),
    weight: z.number().min(0.5).max(3).optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
    tag: z.string().optional(),
  })).min(3).max(14),
  dropZoneLabel: z.string().optional(),
  callout: z.string().optional(),
  calloutAt: z.number().optional(),
  at: z.number().optional(),
});
export type GravityPileSpec = z.infer<typeof gravityPileSchema>;

export const crumpleTossSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  myth: z.object({
    badge: z.string().optional(),
    headline: z.string().min(1),
    bullets: z.array(z.string()).max(4).optional(),
  }),
  tossAt: z.number().optional(),
  truth: z.object({
    badge: z.string().optional(),
    headline: z.string().min(1),
    detail: z.string().optional(),
    tone: v2Tone.optional(),
  }),
  at: z.number().optional(),
});
export type CrumpleTossSpec = z.infer<typeof crumpleTossSchema>;

export const analyticsFunnelSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  stages: z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    share: z.number().min(0).max(1),
    dropNote: z.string().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  })).min(2).max(6),
  bottleneckIndex: z.number().int().min(0).max(5).optional(),
  callout: z.string().optional(),
  at: z.number().optional(),
});
export type AnalyticsFunnelSpec = z.infer<typeof analyticsFunnelSchema>;

export const barRaceSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  epochs: z.array(z.object({
    label: z.string().min(1),
    at: z.number().optional(),
    bars: z.array(z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      value: z.number(),
      displayValue: z.string().optional(),
      tone: v2Tone.optional(),
    })).min(2).max(6),
  })).min(2).max(6),
  unit: z.string().optional(),
  callout: z.string().optional(),
  at: z.number().optional(),
});
export type BarRaceSpec = z.infer<typeof barRaceSchema>;

export const upCloseSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  image: z.string().min(1),
  zoomTarget: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    scale: z.number().min(1.4).max(3.2).optional(),
  }),
  zoomAt: z.number().optional(),
  lensLabel: z.string().optional(),
  annotation: z.object({
    headline: z.string().min(1),
    detail: z.string().optional(),
    side: z.enum(["left", "right"]).optional(),
  }).optional(),
  at: z.number().optional(),
});
export type UpCloseSpec = z.infer<typeof upCloseSchema>;

export const sceneSchema = z.object({
  id: z.string(),
  fromFrame: z.number(),
  durationFrames: z.number(),
  /** Antidote 2.0 / 10x (opt-in): visual-thinking explanatory canvases & spatial depth-carry */
  depthCarry: z.boolean().optional(),
  shotIntent: shotIntentSchema.optional(),
  annotatedScene: annotatedSceneSchema.optional(),
  cohortGrid: cohortGridSchema.optional(),
  timelineScrub: timelineScrubSchema.optional(),
  statSlam: statSlamSchema.optional(),
  cutoutStage: cutoutStageSchema.optional(),
  editorialSpread: editorialSpreadSchema.optional(),
  kineticManifesto: kineticManifestoSchema.optional(),
  decisionTree: decisionTreeSchema.optional(),
  balanceScale: balanceScaleSchema.optional(),
  stackReveal: stackRevealSchema.optional(),
  liveInterface: liveInterfaceSchema.optional(),
  comicStrip: comicStripSchema.optional(),
  beforeAfterWipe: beforeAfterWipeSchema.optional(),
  spatialJourney: spatialJourneySchema.optional(),
  chapterInterstitial: chapterInterstitialSchema.optional(),
  vennMerge: vennMergeSchema.optional(),
  explodedView: explodedViewSchema.optional(),
  gravityPile: gravityPileSchema.optional(),
  crumpleToss: crumpleTossSchema.optional(),
  analyticsFunnel: analyticsFunnelSchema.optional(),
  barRace: barRaceSchema.optional(),
  upClose: upCloseSchema.optional(),
  bookBlueprint: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    thesis: z.string().min(1),
    variant: z.enum(["pillarColumns", "radialMindMap", "chapterPath"]).optional(),
    pillars: z.array(z.object({
      number: z.string().optional(),
      label: z.string().min(1),
      detail: z.string().optional(),
      status: z.enum(["done", "active", "upcoming"]).optional(),
      tone: v2Tone.optional(),
      at: z.number().optional(),
    })).min(2).max(5),
    activeIndex: z.number().int().min(0).max(4).optional(),
    synthesis: z.string().optional(),
    synthesisAt: z.number().optional(),
    at: z.number().optional(),
  }).optional(),
  mechanismChain: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    variant: z.enum(["linearChain", "feedbackLoop", "dominoBreak"]).optional(),
    steps: z.array(z.object({
      label: z.string().min(1),
      detail: z.string().optional(),
      badge: z.string().optional(),
      tone: v2Tone.optional(),
      at: z.number().optional(),
    })).min(3).max(5),
    breakAt: z.number().optional(),
    breakLabel: z.string().optional(),
    escapeOutcome: z.string().optional(),
    callout: z.string().optional(),
    calloutAt: z.number().optional(),
    at: z.number().optional(),
  }).optional(),
  evidenceBoard: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    caseBadge: z.string().optional(),
    image: z.string().optional(),
    subject: z.string().min(1),
    setup: z.string().min(1),
    finding: z.string().min(1),
    findingHighlight: z.string().optional(),
    lessonHeadline: z.string().min(1),
    lessonDetail: z.string().optional(),
    revealLessonAt: z.number().optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  }).optional(),
  quoteDialogue: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    speakerA: z.object({ name: z.string().min(1), role: z.string().optional(), tone: v2Tone.optional() }),
    speakerB: z.object({ name: z.string().min(1), role: z.string().optional(), tone: v2Tone.optional() }),
    lines: z.array(z.object({
      speaker: z.enum(["A", "B"]),
      text: z.string().min(1),
      at: z.number().optional(),
    })).min(2).max(4),
    subtext: z.object({
      badge: z.string().optional(),
      headline: z.string().min(1),
      detail: z.string().optional(),
      at: z.number().optional(),
    }).optional(),
    at: z.number().optional(),
  }).optional(),
  hookPoster: z.object({
    kicker: z.string().optional(),
    setup: z.string().min(1),
    payoff: z.string().min(1),
    payoffAt: z.number().optional(),
    promiseLine: z.string().optional(),
    beforeImage: z.string().optional(),
    afterImage: z.string().optional(),
    beforeLabel: z.string().optional(),
    beforeDetail: z.string().optional(),
    afterLabel: z.string().optional(),
    afterDetail: z.string().optional(),
    anomalyBadge: z.string().optional(),
    changeAt: z.number().optional(),
    revealMode: z.enum(["fade", "wipe", "spotlight"]).optional(),
    tone: v2Tone.optional(),
    at: z.number().optional(),
  }).optional(),
  chapterLabel: z.string().optional(),
  visualEquation: visualEquationSchema.optional(),
  comparisonGrid: comparisonGridSchema.optional(),
  dataMatrix: dataMatrixSchema.optional(),
  realAnchor: realAnchorSchema.optional(),
  /** The beat's literal SUBJECT, when it has one (e.g. "crash", "home", "ledge").
   *  Set by the director's concept lexicon / Claude; drives the illustration shot
   *  + scene icon. Advisory/telemetry — the icon itself lives in `props`. */
  concept: z.string().optional(),
  /** Story Director Core (God Mode 1.0): Narrative purpose, promise/payoff tracking, and tension signals. */
  narrative: narrativeSignalsSchema.optional(),
  /** Semantic Visual Alignment: the narrative job this beat performs. */
  visualJob: visualJob.optional(),
  /** Propositional Visual Grammar (Antidote 6.2): Causal mode and information gain */
  visualMode: visualMode.optional(),
  visualInformationGain: visualInformationGain.optional(),
  vigScore: z.number().min(0).max(5).optional(),
  vigBreakdown: vigBreakdownSchema.optional(),
  visualProposition: visualPropositionSchema.optional(),
  narrativeAtom: narrativeAtomSchema.optional(),
  visualIntent: visualIntentSchema.optional(),
  visualContract: visualContractSchema.optional(),
  /** Scene Director Layer (God Mode 8.0): Cinematic composition, focal hierarchy, and reveal order */
  director: directorSchema.optional(),
  /** SINGLE-RELATION capability (cycle 13): a compiled cause → visible effect contract; drawn only when meta.singleRelation is true. */
  singleRelation: z.any().optional(),
  /** Visual Progression: intra-scene transformation from startState to endState. */
  visualArc: visualArcSchema.optional(),
  /** Attention Choreography: ordered sequence of where the viewer's eye should go. */
  attention: attentionMilestonesSchema.optional(),
  /** Audio Director (God Mode 7.0): Punctuation sound design events */
  audioEvents: z.array(audioEventSchema).optional(),
  shot: shotName.default("medium"),
  chapterCard: chapterCardSchema.optional(),
  /** An explanatory diagram (4.0) — the hero graphic of a conceptual beat. */
  diagram: diagramSchema.optional(),
  relationshipStaging: relationshipStagingSchema.optional(),
  transition: transitionSchema.default({ type: "cut", frames: 10 }),
  /**
   * AUTHORED CONTINUATION (art.json beat `"continue": true`, 2026-10-19). This scene
   * continues the previous scene's stage: the transition into it is a 0-frame cut, a
   * person with the same identity does not re-enter, a prop of the same type does not
   * pop, a diagram of the same type is drawn already built (only new labels/values
   * build in) — continuity.ts. Only the author sets it; absent = a scene of its own.
   */
  continueFromPrev: z.literal(true).optional(),
  /** C19: the beat's consecutive shots (see beatShotSchema) — drawn instead of the beat's own staging */
  shots: z.array(beatShotSchema).optional(),
  /** the planner's stamp on an authored continuation (10x P1, continuity.ts): the END STATE of the previous deed is
   *  this beat's starting state (she stays in the tub, he stays seated). Absent on every config planned before it. */
  carryState: z.literal(true).optional(),
  bg: bgSchema.default({ type: "flat", colors: ["#8FC0E8"], set: "none", texture: "none" }),
  camera: cameraSchema.default({ zoom: [1, 1], panX: [0, 0], panY: [0, 0] }),
  characters: z.array(characterSchema).default([]),
  props: z.array(propSchema).default([]),
  texts: z.array(textSchema).default([]),
  hud: sceneHudSchema.optional(),
});
export type SceneSpec = z.infer<typeof sceneSchema>;

// Word-timed captions (same shape as the Vox pipeline) — drives the subtitle band.
export const captionWordSchema = z.object({ w: z.string(), s: z.number(), e: z.number() });
export const captionSchema = z.object({
  text: z.string(),
  startFrame: z.number(),
  endFrame: z.number(),
  words: z.array(captionWordSchema).default([]),
});
export type CaptionSpec = z.infer<typeof captionSchema>;

// Thumbnail brief for the Antidote engine's own (flat-vector) thumbnail. Authored
// by Claude at art-direction time; the palette itself comes from book.json
// (BOOK_PALETTES in the generated registry), so only the book-specific staging
// lives here. `hook` must be book-specific AND original (≤4 words, not the title).
export const thumbMotif = z.enum(["risingBars", "arrowUp", "summit", "spark", "ring"]);
export const antidoteThumbnailSchema = z.object({
  hook: z.string(),
  variant: variantSchema.default(VARIANT_DEFAULT),
  action: charAction.default("celebrate"),
  expression: expression.default("happy"),
  motif: thumbMotif.default("risingBars"),
  layout: z.string().optional(),
});
export type AntidoteThumbnailBrief = z.infer<typeof antidoteThumbnailSchema>;

export const metaHudSchema = z.object({
  enabled: z.boolean().default(true),
  accent: z.string().optional(),
  title: z.string().optional(),
  showProgress: z.boolean().default(true),
  showBadge: z.boolean().default(true),
  /** 2026-11-23 (YPP "repetitive content": the same band and title on every frame of every film): the form band is full
   *  for a few seconds when a part is announced, then folds to a small corner mark; the book title shows at part starts
   *  and briefly once a minute. Off unless true (the operator approves the look first). */
  fold: z.boolean().optional(),
});
export type MetaHudSpec = z.infer<typeof metaHudSchema>;

export const antidoteConfigSchema = z.object({
  meta: z.object({
    slug: z.string(),
    title: z.string(),
    author: z.string().default(""),
    fps: z.number().default(30),
    width: z.number().default(1920),
    height: z.number().default(1080),
    audio: z.string().optional(), // public-relative, e.g. audio/<slug>.m4a
    durationInFrames: z.number(),
    thumbnail: antidoteThumbnailSchema.optional(),
    /** The book's recurring cast; scenes reference these by role. */
    cast: castSchema.optional(),
    /**
     * MULTIPLANE (4.0). When true, the renderer parallaxes cast, motifs and copy
     * against the camera by their per-element `depth` (2.5D diorama), instead of
     * the single flat plane every pre-4.0 book uses. Opt-in per book so existing
     * configs are byte-for-byte unchanged; the director sets it on new plans.
     */
    multiplane: z.boolean().optional(),
    /** RETENTION HUD (4.2). Minimal top safe-zone progress track & insight badges. */
    hud: metaHudSchema.optional(),
    /** THE BOOK'S GRAPHIC HAND (2026-11-18, components/skin.tsx, scripts/lib/book-skin.js): how the subtitles are set,
     *  how a name plate is cut, which typeface speaks. Absent: the channel's look, as every earlier film. */
    skin: z.object({ caption: z.string().optional(), plate: z.string().optional(), font: z.string().optional() }).optional(),
    edition: z.enum(["general", "finance", "health", "law"]).optional(),
    /** the sound-effect layer (AudioEngine: ding / tick / pop / whoosh / thud) renders only when this is true — viewers
     *  heard the effects as "beeps" over the narration (2026-11-23); a film without it is the narration alone */
    sfx: z.boolean().optional(),
    /** Optional SFX palette: "foley" (default when sfx=true, organic CC0 paper/book/swish) or "synthetic" (legacy WAVs) */
    sfxPack: z.enum(["foley", "synthetic"]).optional(),
    /** THE PRODUCER'S NOTE (2026-11-20, src/components/ProducerNote.tsx): the operator's approved sentence about the
     *  book, shown once near the start. Absent: nothing is drawn. */
    take: z.object({ note: z.string() }).optional(),
    /** THE FILM'S NARRATIVE FORM (2026-11-18, scripts/lib/narrative-form.js): how this book is told (a case file, a
     *  trial, a journey …) and the parts its hosts announced, with the frame each starts on. When at least three parts
     *  are there the top band draws THEM in the form's own shape (components/FormTrack.tsx) instead of the progress
     *  line and the "INSIGHT n / N" pill every earlier film shares. Absent: the film is framed as before. */
    form: z.object({ key: z.string(), part: z.string(), name: z.string(), parts: z.array(z.object({ n: z.number(), from: z.number(), title: z.string().optional(),
      /** the book's own drawing of what this part is about (told-apply.js formArt): a thing's paths, or a person's look */
      art: z.object({ kind: z.enum(["thing", "person"]), entity: z.string().optional(), viewBox: z.string().optional(), paths: z.array(drawnShape).optional(), variant: z.record(z.string(), z.any()).optional() }).optional() })) }).optional(),
    /** SINGLE-RELATION capability (cycle 13, default OFF): when true, scenes carrying a compiled `singleRelation`
     *  contract (scripts/lib/single-relation.js) draw it; when absent / false the field is ignored. */
    singleRelation: z.boolean().optional(),
    /** Antidote 2.0 (opt-in): per-book art direction, caption/HUD style, and motion-doctrine seam laws.
     *  Absent on all pre-existing configs → 100% byte-identical legacy behavior. */
    artDirection: artDirectionSchema.optional(),
  }),
  scenes: z.array(sceneSchema),
  promises: z.array(promiseLifecycleSchema).optional(),
  audioEvents: z.array(z.object({
    frame: z.number(),
    type: audioEventType,
    volume: z.number().default(0.15),
    durationFrames: z.number().optional(),
    reason: z.string().optional(),
  })).optional(),
  captions: z.array(captionSchema).default([]),
});
export type AntidoteConfig = z.infer<typeof antidoteConfigSchema>;

export const antidoteBookSchema = z.object({ config: z.any() });
