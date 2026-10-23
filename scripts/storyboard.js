#!/usr/bin/env node
/**
 * storyboard.js — the authored-storyboard workflow as commands, so any agent can
 * run it the same way (Faz 1/2; proven on We Were Liars: mute test 0/30 wrong,
 * image adds 70%). Full procedure: STORYBOARD_RUNBOOK.md.
 *
 *   node scripts/storyboard.js prep  --slug=<slug> [--chunk=40]
 *       -> books/<slug>/storyboard/{beats.json, rules.md, chunk-K.json, PROMPTS.md}
 *   (parallel author agents write books/<slug>/storyboard/authored-K.json)
 *   node scripts/storyboard.js merge --slug=<slug> [--write]
 *       -> validates; with --write: Antidote -> books/<slug>/art.json,
 *                                   Vox      -> books/<slug>/designs.json
 *
 * Both planners pick those files up automatically (plan-antidote: art.json,
 * plan-vox: designs.json), so the next make-book run is authored.
 */
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { execFileSync } = require("child_process");

// --root=<dir> (explicit only) points at another tree with books/ and public/; default = this repo.
const ROOT = process.argv.slice(3).some((a) => a.startsWith("--root="))
  ? path.resolve(process.argv.slice(3).find((a) => a.startsWith("--root=")).slice("--root=".length))
  : path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const CMD = process.argv[2];
const SLUG = args.slug;
// Which code authors this book? Stops on code that is not a commit (scripts/lib/production-guard.js).
if (SLUG && (CMD === "prep" || CMD === "merge")) require("./lib/production-guard").productionGuard({ slug: SLUG, step: `storyboard ${CMD}` });
// --beats-from-art (experimental, explicit only): beats come from the authoritative art.json
// narration instead of plan-antidote on the VTT. Original beat ids are kept.
const ART_BEATS = !!args["beats-from-art"];
if (!["prep", "merge"].includes(CMD) || !SLUG) {
  console.error("Usage: node scripts/storyboard.js prep|merge --slug=<slug> [--chunk=40] [--write]");
  process.exit(1);
}
const BOOK = path.join(ROOT, "books", SLUG);
const SB = path.join(BOOK, "storyboard");
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const book = readJSON(path.join(BOOK, "book.json"));
if (!book) { console.error(`❌ books/${SLUG}/book.json missing`); process.exit(1); }
// The engine is Step 0's decision (make-prompt → book.json). No default: an
// undecided book must not be authored for a guessed engine.
if (book.engine !== "vox" && book.engine !== "antidote") {
  console.error(`❌ books/${SLUG}/book.json has no engine ("${book.engine || ""}"). Decide it at Step 0 (make-prompt --engine=vox|antidote).`);
  process.exit(1);
}
const ENGINE = book.engine;
const bible = readJSON(path.join(BOOK, "story-bible.json"), {});
const vp = bible.visualProvenance || {};
const FICTION = !/non-?fiction|self.?help|business|finance|psycholog|productiv|science|history|philosoph|memoir|biograph/i.test(String(book.genre || ""));

// books/<slug>/motifs.json — per-book icons drawn as data (customSvg), read by lib/antidote-director.js
function ownMotifs() {
  const m = readJSON(path.join(BOOK, "motifs.json"), {}) || {};
  return m.motifs || m;
}
// signature objects: the book's own things no shared icon depicts (the Mechanical Hound)
const signatureObjects = () => (Array.isArray(bible.signatureObjects) ? bible.signatureObjects : []);

// Every person the storyboard can stage is drawn from story-bible cast[k].variant.
// Without one, plan-antidote falls back to a role template tinted with the book
// palette: in F451 Montag, Clarisse and Beatty all wore the same rust colour and
// Mildred's "bleached blonde" became white hair — the blind viewer saw "an elderly
// person" and "identical men". The look text never reaches the rig; the variant does.
function checkCastVariants() {
  const stop = [], warn = [];
  const cast = Object.entries(bible.cast || {}).filter(([k]) => k !== "narrator");
  const need = ["gender", "age", "outfit", "suit", "hair", "hairStyle"];
  for (const [k, c] of cast) {
    const v = c.variant || {};
    const miss = need.filter((f) => v[f] == null || v[f] === "");
    if (miss.length) stop.push(`cast "${k}" has no variant ${miss.join("/")} — its look ("${String(c.look || "").slice(0, 60)}") never reaches the drawing`);
    const hex = String(v.hair || "").match(/^#?([0-9a-f]{6})$/i);
    if (hex && v.age !== "old") {
      const n = parseInt(hex[1], 16), light = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 765;
      if (light > 0.82) warn.push(`cast "${k}": hair ${v.hair} is near-white on a non-old character — reads as elderly (use a saturated blonde like #E3B34A)`);
    }
  }
  const sig = (v) => [v.gender, v.outfit, String(v.suit || "").toLowerCase(), v.age].join("|");
  for (let a = 0; a < cast.length; a++) for (let b = a + 1; b < cast.length; b++) {
    const va = cast[a][1].variant, vb = cast[b][1].variant;
    if (va && vb && va.suit && sig(va) === sig(vb)) stop.push(`cast "${cast[a][0]}" and "${cast[b][0]}" are drawn alike (same gender, age, outfit and colour) — viewers read "identical people"`);
  }
  return { stop, warn };
}

// ── vocabulary this book may use ────────────────────────────────────────────
const { chunkRanges } = require("./lib/storyboard-chunks");

// sha256 of the book files a prep is built from (missing file = null)
function bookInputs() {
  const sha = (p) => (fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null);
  return { "story-bible.json": sha(path.join(BOOK, "story-bible.json")), "motifs.json": sha(path.join(BOOK, "motifs.json")) };
}

function vocabulary() {
  if (ENGINE === "vox") return {};
  const { SCENE_ICONS } = require("./lib/antidote-director.js");
  const { shotName, setName, expression, charAction, handProp } = require("../src/engines/antidote/schema.ts");
  const shared = (readJSON(path.join(ROOT, "data/shared-generic-motifs.json"), {}).motifs) || [];
  const origins = (readJSON(path.join(ROOT, "data/motif-world.json"), {}).origins) || {};
  const allowed = new Set([...(vp.allowedMotifs || []), ...(vp.allowedProps || []), ...shared]);
  // An author must never be OFFERED an icon the firewall will reject. A book's
  // allowedMotifs is hand-written, so it drifted out of the code-owned provenance
  // registries: stolen-focus listed `road` + `key` + `medical`, the shared pool held
  // none of them, and the firewall failed the book on three scenes the authoring
  // sheet had recommended. Only motifs with a registered origin (own world) or a
  // shared-generic entry are offered; the 2026-09-26 pool fix added the three.
  const firewallOk = new Set([...Object.keys(origins), ...shared]);
  // the book's OWN icons (books/<slug>/motifs.json — its signature objects) are vocabulary too
  const ownIcons = Object.keys(ownMotifs());
  const icons = [...SCENE_ICONS.filter((c) => allowed.has(c) && firewallOk.has(c)), ...ownIcons];
  const sets = vp.allowedLocations && vp.allowedLocations.length
    ? setName.options.filter((s) => vp.allowedLocations.includes(s)) : setName.options.filter((s) => s !== "none");
  const MODERN = new Set(["laptop", "creditCard", "smartphone", "zap", "sword"]);
  const holds = handProp.options.filter((h) => !MODERN.has(h) || /tech|business|startup/i.test(String(book.genre)));
  return {
    icons, ownIcons, sets,
    shots: shotName.options.filter((s) => s !== "chapterCard"),
    // A minorHarm book never stages harm: the bodily-harm situations are not offered at
    // all, so merge rejects them like any other word outside the vocabulary.
    expressions: expression.options, actions: charAction.options.filter((a) => !(MINOR_HARM && HARM_ACTIONS.has(a))), holds,
    cast: Object.entries(bible.cast || {}).map(([k, c]) => ({ key: k, name: c.name, role: c.role, look: c.look })),
  };
}

// Physical situations (2026-09-28): what each one is for, written into rules.md only
// for the actions this book's vocabulary actually offers.
const SITUATIONS = {
  lying: "lying in bed / resting / ill / lying awake (the rig brings its own bed)",
  collapsed: "fainted / knocked out / dead / lies on the floor (eyes shut, bare floor)",
  falling: "falls / trips / is pushed / plunges",
  fighting: "a fight or an attack — the lead punches toward the second cast member, who fights back",
  struggling: "straining to break free / resisting / being held — the second cast member holds them (grabbing)",
  grabbing: "grabs / seizes / snatches someone or something — the second cast member struggles",
};
const HARM_ACTIONS = new Set(Object.keys(SITUATIONS));
const PAIR_ACTIONS = { fighting: "fuming", grabbing: "walking", struggling: "recoiling" };
const MINOR_HARM = !!(book.engineProfile && book.engineProfile.minorHarm);
function situationLines(v) {
  const on = v.actions.filter((a) => SITUATIONS[a]);
  return on.length ? `\nPhysical situations are real poses — use them instead of standing people when the sentence is about the body. fighting / grabbing / struggling need TWO cast members (alone they read as fuming / walking / recoiling):\n${on.map((a) => `- \`${a}\`: ${SITUATIONS[a]}`).join("\n")}\n` : "";
}

// A book whose profile marks harm to a minor as central (Lolita) gets a hard rule at
// the top of every author sheet: the child is never depicted in that context.
const MINOR_RULE = MINOR_HARM ? `## ⛔ Safety rule — this book centres on harm to a minor
- NEVER depict the child in the abuse context: no child figure next to the abuser, no bed/motel/
  intimacy staging, no romance icons (heart, gift, flower), nothing that sexualises or romanticises.
- No bodily harm is staged in this book: lying / collapsed / falling / fighting / struggling /
  grabbing are not in its vocabulary. Carry violence with consequences, a set, or a callout.
- Show the NARRATOR's manipulation instead: the unreliable voice (strike his euphemisms), the
  adult world (roads, motels as empty places), consequences, and the critical analysis itself.
- When in doubt: concept null + a callout that names the harm plainly ("a child, not a romance").
` : "";
// ── rules sheet (the one authoring round) ───────────────────────────────────
function iconReadingLines(v) {
  const R = (readJSON(path.join(ROOT, "data/icon-readings.json"), {}) || {}).icons || {};
  return v.icons.filter((k) => R[k]).map((k) => `- ${k}: reads as ${R[k].reads}${R[k].neverFor ? `. NEVER for: ${R[k].neverFor}` : ""}`).join("\n");
}
function stagingReadingLines() {
  const S = (readJSON(path.join(ROOT, "data/icon-readings.json"), {}) || {}).staging || {};
  return Object.entries(S).map(([k, r]) => `- ${k}: ${r}`).join("\n");
}
function ownIconSection(v) {
  const own = ownMotifs();
  if (!Object.keys(own).length) return "";
  return `
## This book's own icons (drawn for it — use them whenever the beat is ABOUT that thing)
${Object.entries(own).map(([k, m]) => `- ${k}: ${m.title || k}${m.reads ? ` — ${m.reads}` : ""}`).join("\n")}
`;
}

// ── authoring policy (explicit, reproducible A/B) ───────────────────────────
// baseline    = the authoring contract before claim-first (commit 55e1891). Default.
// claim-first = adds "The claim first" (commit 8aa7598). Opt-in only, never the default
//               until a paired blind A/B validates it. Select with --policy=claim-first
//               or STORYBOARD_AUTHORING_POLICY=claim-first.
const AUTHORING_POLICIES = ["baseline", "claim-first"];
const POLICY = args.policy || process.env.STORYBOARD_AUTHORING_POLICY || "baseline";
if (!AUTHORING_POLICIES.includes(POLICY)) { console.error(`❌ unknown authoring policy "${POLICY}" (use: ${AUTHORING_POLICIES.join(", ")})`); process.exit(1); }
const CLAIM_FIRST_BLOCK = POLICY === "claim-first" ? `
## The claim first (what the picture must carry)
The picture must carry the beat's CLAIM, not every noun the narration mentions. Before choosing
concept, cast, action or holds, write the claim in \`storyboard.claim\` and ask: which single
visual (icon, object in hand, action, relationship between two people, or diagram) would make a
muted viewer grasp THAT claim? Use it only if it does. Then:
- Negation or rejection ("it is NOT a debt", "I refuse the offer"): stage the rejection (turned
  back, pushed-away object, strike callout), never the rejected noun.
- Metaphor or analogy: stage the comparison (diagram or two-state split), not the literal figure.
- Hypothetical or counterfactual ("if she had left"): stage the imagined alternative as a
  separate, visibly different state, or stage the present person with a thought-like action.
- Historical reference (past event the narrator recounts): stage the present narrator, or a
  callout naming the event; do not invent a period scene the narration does not describe.
- Abstract argument (a principle, a statistic, a definition): \`concept: null\` is correct when no
  icon or action reads it literally. Prefer a diagram when there is a real structure (cause →
  effect, buckets, spectrum), or two people in a visible relation (one refusing, one
  persuading, one turned away). A face and body alone is mood, and a mood-only frame is a dead frame.
  If neither carries the claim, keep the frame plain and let the callout state it.
A decorative icon that does not carry the claim is worse than \`concept: null\`. Never use an icon
only because its word appears in the narration.
` : "";

// Every prep writes storyboard/policy.json: which authoring policy, the exact prompt hash,
// the code commit, the authoring model (--model, else 'unrecorded') and generation parameters.
// A/B runs are only comparable through this record.
function authoringRunRecord(rulesText) {
  let codeSha = null;
  try { codeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.join(__dirname, ".."), stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
  return {
    policy: POLICY,
    promptSha256: crypto.createHash("sha256").update(rulesText).digest("hex"),
    codeSha,
    // codeSha is HEAD only; the uncommitted state that actually ran (scripts/lib/code-fingerprint.js)
    code: require("./lib/code-fingerprint").codeFingerprint(path.join(__dirname, "..")),
    engine: ENGINE,
    beatSource: ART_BEATS ? "art.json (--beats-from-art)" : "plan-antidote (VTT)",
    model: args.model || "unrecorded",
    generation: { chunk: parseInt(args.chunk || "40", 10), mode: "claude-authored" },
    recordedAt: new Date().toISOString(),
  };
}

// Authored icon behaviours (schema.ts CONCEPT_MOTIONS) — offered only for icons this book has.
function conceptMotionLine(v) {
  const { CONCEPT_MOTIONS } = require("../src/engines/antidote/schema.ts");
  const on = Object.keys(CONCEPT_MOTIONS).filter((k) => (v.icons || []).includes(k));
  if (!on.length) return "";
  // what each authored behaviour draws, and when the narration licenses it (no other use)
  const WHAT = {
    "compass:spin": "spins fast and never settles — only when the narration says it spins / turns uselessly / keeps changing direction",
    "chains:break": "STATE CHANGE: intact chains snap apart at the cue and stay broken — only when the narration says the bond / curse / chain is broken",
    "phone:light": "STATE CHANGE: a dark phone screen lights up with a message at the cue and stays lit — only when the narration says the screen lights up / a message or notification arrives",
  };
  const lines = on.flatMap((k) => CONCEPT_MOTIONS[k].map((m) => `  - \`"concept": "${k}", "conceptMotion": "${m}"\`: ${WHAT[`${k}:${m}`] || m}`));
  return `Icon behaviour (optional, author-chosen; the engine never adds one):
${lines.join("\n")}
  It starts on the callout's word, or on \`"conceptMotionCue": "<phrase spoken in this beat>"\` — put the cue on the word where the change HAPPENS. A STATE CHANGE shows the start state before the cue and the end state after it, on every frame. The start state is this beat (or the beat before it, with \`continue\`); the end state is kept: a continued beat with the same icon after a state change repeats the same \`conceptMotion\` (merge refuses otherwise — the icon would jump back to its start state). Without the field the icon keeps its default drawing. The label names the change; the icon must SHOW it.
`;
}

// Authored actions with a moment (2026-10-20): the action HAPPENS on screen, on the author's word.
const ACTION_LINE = `Actions that HAPPEN (optional): when the narration says someone DOES it (picks up, grabs, hugs), stage the deed, not a face + caption — check every such sentence before you reach for a face.
  - \`"action": "take", "holds": "<object>"\` — the object rests in front of the first cast member, who reaches for it; on the cue the hand closes on it and brings it in; it stays in hand ("grabs their phone", "picks up the letter").
  - \`"action": "embrace", "cast": ["<who moves>", "<who is embraced>"]\` — exactly two people: the first closes the gap, they hold each other from the cue, the partner embraces back ("launches herself into his arms", "they hug"). \`"partnerExpression": "<face>"\` gives the SECOND person's face (else neutral — the engine never invents a feeling). The FIRST cast member is the one who DOES it (reaches first, wraps high, drawn in front); the second receives — put the doer first.
  A held object is lifted clear of the captions automatically; a \`closeUp\` shows no hands — never frame an object beat as closeUp.
  Put \`"actionCue": "<phrase spoken in this beat>"\` on the word where the deed happens (else 40% into the beat). Who does it, to whom/what and when are yours; the engine adds nothing. In a \`continue\` beat after a take the same person keeps holding it (\`"action": "hold", "holds": "<the same object>"\`; merge refuses otherwise); a continued embrace repeats \`"action": "embrace"\` with the same two and is not replayed.
`;

// Authored scene continuation (art.json `continue`, src/engines/antidote/continuity.ts).
const CONTINUE_LINE = `Continuing a stage (optional): \`"continue": true\` means "this beat continues the previous beat's stage": no transition, and whoever/whatever was already on screen stays — the same cast member does not walk in again, the same icon does not pop in again, the same diagram is not rebuilt (only its NEW labels/values draw in). Use it inside a sequence when the next beat keeps the same set and the same person/object/diagram and only something changes (a face, an action, a held object, one more label). Never as a default, never on the first beat, and only with the same \`set\` as the previous beat; a new person in a continued beat still enters normally.
`;

function rulesAntidote(v) {
  const castLines = v.cast.map((c) => `- \`${c.key}\` — ${c.name}${c.role ? ` (${c.role})` : ""}: ${c.look || ""}`).join("\n");
  return `# Storyboard authoring — ${book.title} (${book.author}) · Antidote engine

You art-direct an animated summary. The audio is a two-host analysis. For EVERY beat decide what a
viewer with the SOUND OFF must see to understand what is being said. A wrong picture is worse than
none. Everything you write is ENGLISH. Book context: \`books/${SLUG}/story-bible.json\`.
Reference (approved, We Were Liars): \`books/we-were-liars/art.json\` — read 10 beats of it first.

## Output — one object per beat in your chunk, same order, same \`i\`
\`\`\`json
{ "i": 12,
  "concept": "<icon>" | null,
  "diagram": null | { "type": "flow|sorter|spectrum|matchWave", "labels": ["..",".."], "values": [..]? },
  "callout": { "text": "2-5 words", "style": "reveal|highlight|strike|box|stack" } | null,
  "set": "<set>",                    // optional
  "shotOverride": "<shot>",          // optional, rarely
  "cast": ["<castKey>", "<castKey>"],// who is on screen, most important first
  "expression": "<expression>",      // first cast member's face
  "action": "<action>",              // first cast member's body
  "holds": "<object>",               // optional object in their hand
  "partnerExpression": "<expression>", // optional, two-person cast: the SECOND person's face (else neutral)
  "partnerAction": "<action>",       // optional, two-person cast: the SECOND person's body (else idle)
  "continue": true,                  // optional: only where this beat keeps the previous beat's stage (Sequences)
  "explainedBy": "one sentence: the event, comparison or relationship this picture shows",
  "noVisual": null | "why nothing in the vocabulary can show it",
  "storyboard": { "claim": "...", "concreteVisual": "...", "onScreenText": "...",
                  "relationToPrevious": "...", "addedInformation": "... (write 'weak: ...' if honest)" } }
\`\`\`

## The question for every beat (answer it BEFORE choosing anything)
"Which EVENT, COMPARISON or RELATIONSHIP makes this sentence's meaning visible?" — who does what to
whom; before vs after; this vs that; cause → effect; one side pressuring or controlling another.
Write the answer in \`explainedBy\`, then stage THAT answer:
- the cast DOING a readable action, with an object (\`holds\`) or with each other;
- a two-person relation (the asker and the one saying no; the one reaching out and the one turned away);
- a diagram when the claim is a structure (flow = cause → effect, sorter = parts, spectrum = degrees);
- relationship staging only where the narration states control through a message (section below).
The callout is a LABEL for the picture, not the carrier of the meaning. A face or a mood alone is not
an answer. There is no icon quota and no minimum number of objects: a wrong icon is worse than none.
Stage the answer ON THE BEAT THAT SAYS IT — read your \`explainedBy\` back and show what it names:
- an EVENT (someone does something): stage the deed — an action from the vocabulary, \`take\` / \`embrace\` with an
  \`actionCue\` on the word where it happens, the object in hand ("Actions that HAPPEN", below);
- a MECHANISM (how X works, how X leads to Y): the diagram, or the person working the object, on THIS beat — the
  one where the narration explains it, not the beat before or after;
- a CAUSE and its EFFECT: cause -> change -> result; when that takes more than one beat, keep the stage with
  \`continue\` and change only what the narration changes ("Sequences", below);
- a RELATIONSHIP: the two people do something TO each other (one asks and one refuses, one reaches out and one
  turns away, one holds on and one pulls back) with different faces; two people standing side by side only
  shows that two people exist.
Measured (sealed blind mute tests, 150 frames, 2026-10-22): a lone figure with a callout explained 0 of 43 beats,
a person with an icon 3 of 44, a diagram 4 of 8. The usual miss: the diagram sits on the neighbouring beat and
the beat that explains the mechanism shows a talking head. A face, a callout or a single figure stays right when
the sentence IS about a feeling, a reaction or plain commentary — show the mechanism when the narration has one;
never add a diagram, an action or a second person the narration does not have.
\`cast: []\` means no person on screen — use it deliberately (an object, a diagram, the callout). It is
final: no engine step adds a figure (expression/action/holds are then unused). Leaving \`cast\` OUT lets
the engine choose who stands there.
If nothing in the vocabulary can show the meaning, write the reason in \`noVisual\`, then use the
clearest text-led staging. Measured 2026-10-17 (audit/authoring-ab-2026-10-17): with this question,
blind judges preferred the new storyboard 24 to 3 on 17 weak beats; image ADDS 9 -> 20 of 34.

## Vocabulary (nothing else renders)
- icons: ${v.icons.join(", ")}
- sets: ${v.sets.join(", ")}
- shots: ${v.shots.join(", ")}
- expressions: ${v.expressions.join(", ")}
- actions: ${v.actions.join(", ")}
- holds: ${v.holds.join(", ")}
- cast (story-bible keys):
${castLines || "- (no cast in the story bible — add one before authoring)"}

${MINOR_RULE}## The icon test (most important)
Pick a \`concept\` only if a muted viewer seeing that icon WITHOUT the callout would guess the right
meaning. The icon's LITERAL reading must be the beat's claim — a metaphor the viewer has to decode
is read literally (Fahrenheit 451: chains for "numbness" read as "links", a medical cross for an
execution read as "healthcare", a coin for "the price we pay" read as "debt"). NEVER because a word
matches ("treating this TEXT as" is not a phone; "romance is the wrong reading" is not a heart).
What viewers actually read (measured in mute tests — data/icon-readings.json):
${iconReadingLines(v)}
If nothing reads literally: \`concept: null\` and stage your \`explainedBy\` answer on this beat (an action with
an object, two people in a visible relation, or a diagram); when the sentence narrates an event or a mechanism,
a face with a callout is the last resort.
A wrong icon is worse than none.
${conceptMotionLine(v)}${CONTINUE_LINE}${ACTION_LINE}${CLAIM_FIRST_BLOCK}No single shared icon on more than 5% of the beats: an icon used for everything means nothing.
${ownIconSection(v)}
## How staging reads (measured in mute tests)
${stagingReadingLines()}

## Negation, irony, fakery
When the narration says NOT / never / fake / scripted / pretend / hollow X, never stage X plainly
(F451: a warm embrace for "fake scripted validation" read as genuine warmth; a thoughtful face for
"he is NOT thinking about the ideas" read as valuing them). Stage the contrast instead: the empty
face beside the smiling screen, the forced smile (say so), the turned back.
Two people side by side must look clearly different (build, age, costume); two men in the same
uniform read as "identical men" — stage one of them.

## Staging the people (the picture must carry meaning, not only the text)
${FICTION
    ? "Put on screen the characters the sentence is ABOUT (not the host). Give them the face and body of the moment: grief -> sad + slump, fear -> afraid (worried reads as worry, not fear), revelation -> surprised, a forced polite smile over pain -> happy (say so), accusing -> point, grasping -> reach, arriving/leaving -> walk. Give them the object they handle (letter, photo, key, cup)."
    : "This is non-fiction: the 'cast' is usually `everyman` (the reader living the idea) or the author/host. Stage the idea as a person DOING it with the thing the narration names — a pose alone is a mood, not the idea: drowning in email -> holds phone + slump (not slump alone), spending -> holds wallet/coin, a deadline -> the clock beside a worried face, saying no to someone -> two people, one refusing. Prefer a sequence (one person, one object, changing) over a new pose per beat. Use `narrator` only for pure show commentary. Named people (researchers, the author, case-study subjects) go on screen when the story bible has them."}
Two people: stage the SECOND person's reaction on purpose — \`partnerExpression\` (their face) and \`partnerAction\`
(their body, from the actions) on a two-person cast. What you leave out stays neutral / idle: the engine never gives
the partner a feeling of its own. Only a verb that reads as a pair moves the partner with it (fighting <-> fighting,
grabbing <-> struggling, embrace <-> embrace); merge refuses a partnerAction that contradicts the pair. There is no
gesture quota: when the narration has the other side react (refuses, listens, is accused, gives in), show it.
${situationLines(v)}Never happy over death or tragedy unless it is a fake smile.

## Callouts
2-5 words, the narrator's own concrete words from THIS beat; correct ASR spellings of names.
Every callout of 4+ words needs a function word (the/of/to/her/...), no keyword soup, max 7 words /
48 chars. \`strike\` = the narrator REJECTS the phrase; never for emphasis. No invented labels.
Every beat needs a callout OR a diagram OR an icon; pure banter ("Right.") may carry only staging.

## Relationship staging (optional; only where the relationship IS the claim)
Use it when the narration states that one side controls, steers or pressures another THROUGH A
MESSAGE (a story, a promise, demands, threats, warnings), and at least one of: the narration calls
the message a lie, rejects a method ("not with guns"), negates a reading ("this isn't about X"), or
the controlled side takes control back. Not for a mood, a hinted analogy, or anything not stated.
Set \`"stageRelationship": true\`, \`"cast": []\`, \`"callout": null\`, \`"concept": null\`, no diagram, no holds, and write
\`"relationship"\`. Every value needs an exact quote from THIS beat or its two neighbours as
\`{ "beat": N, "quote": "..." }\`; leave out any field no quote supports:
- \`source\` / \`target\`: \`{ value, group, evidence }\`; \`group\` is a key of story-bible \`groups\` (below).
- \`relation\`: \`{ value, evidence }\` ("keep them down" also lowers the controlled side; other relations draw no effect).
- \`means\`: \`{ value, label: {beat, quote}, evidence }\`; \`label.quote\` is the panel text and must be spoken in this beat.
  Add \`falseMarker: {beat, quote}\` ONLY if the narration says the message is a lie.
- \`rejectedMethod\`: \`{ value, icon: "gun", scope: "<spoken phrase>", evidence }\`.
- \`negation\`: \`{ value: "<negated word>", icon: "text", scope: "<spoken phrase>", evidence }\`.
- \`counterAction\`: \`{ value, icon: "wheel", label: [{beat, quote}], cue: {beat, quote, keyword} }\`.
- \`modality\`: \`{ value: "asserted" | "advice" | "analogy" | "hypothetical", evidence }\`; \`speaker\`: null unless quoted.
Each group must exist in \`books/<slug>/story-bible.json\` → \`groups\`: \`{ role: "ruling"|"controlling"|"ruled"|"controlled",
label, body: "#RRGGBB", accent: "#RRGGBB", count?, evidence: { source, quote } }\`. A group can be one person (count 1).
Then run \`node scripts/gate-b-relationship.js --slug=<slug>\` (a different model family checks every field).
merge refuses a staged beat without a current STAGE verdict; on FALLBACK, author the beat normally.
Use it on a handful of beats per book, not as a template.

## Diagrams (only where the narration states a structure — no quota either way)
Put the diagram on the beat that explains the structure (a mechanism, a cause -> effect, parts, degrees). A
diagram on a beat without a structure is noise; a structure left to a talking head is a missed explanation.
flow = cause -> effect (2-3 labels, 1-2 words each, from the narration); sorter = 2-4 buckets;
spectrum = [left, right] + values[0..1]; matchWave = two rhythms syncing. A diagram beat has
concept null, callout null and \`cast: []\`: the diagram fills the frame and shows nobody (merge refuses a
diagram beat with a cast). Avoid bare template words as labels (DENIAL, CHANGE, GROWTH) — use
the narrator's phrase ("Family denial").
A diagram can be BUILT across a passage — only when the narration itself builds a cause -> effect chain or a change
of state step by step (not for a list of separate points, a feeling or a story moment): put the first label(s) on
the beat where the structure starts, then keep
it with \`"continue": true\` and the same type on the next beats, adding ONE label per beat (flow up to 3, sorter
up to 4 — more are not drawn) or moving the marker (spectrum \`values\`) as the narration moves — earlier labels stay
where they are and only the new part draws in. Prefer this to a diagram on one beat followed by talking heads that
explain the same structure (burn 100-104: a sorter on 100, three faces, a flow on 104 — one growing diagram carries
the argument).

## Sequences — explain ONE idea across several beats (plan them before the single beats)
Many passages develop one idea over 4-12 beats: a story the hosts tell (someone wakes up, gives in, pays the
price) or an argument with steps (it feels good -> but look at the cost -> so it backfires). A muted viewer
follows such a passage only if the picture DEVELOPS with it. Before authoring those beats one by one:
0. Make an idea map of your chunk first (for yourself, not a field): each passage as "beats a-b: <the one idea> —
   kept stage: <the growing diagram / the object that changes>", or "single beats" when every sentence there is its
   own point. Most chunks are mostly single beats; a chunk with no sequence is normal. Do not force a sequence: a
   passage of separate points stays single beats, and a
   feeling or a reaction stays a face. If the context entries before your chunk show a stage the idea is still
   using, your first beat may \`continue\` it (continue works across chunks); an idea that runs past your last beat
   ends on a beat the next author can continue.
   Measured (P1, 2026-10-23, blind strips): a diagram that grows with the argument explained it (burn 100-104: a
   flow gaining one label per beat — the cause chain read with nothing invented); the same two people kept across a
   story did NOT explain it when the thing the story turns on was never drawn (philosophy 172-177: the fox, never
   on screen — the mechanism was text only); a spectrum carried for two beats and then dropped for faces read only
   PARTLY (confidence-gap 161-164: the bird in the room was never drawn). So the kept stage must hold the thing that
   changes — the diagram, or the signature object (\`motifs.json\` icon) — not only the people reacting to it.
1. Name the passage's single idea in one sentence; each beat's \`explainedBy\` = that idea + what this beat adds.
2. Choose ONE stage that carries it and KEEP it while the idea lasts: the same person(s) (same cast keys), the
   same object (same \`concept\`/\`holds\`) or the same diagram (same type, one more label per beat), in the same
   \`set\`. Do not swap in a new icon, set or person each beat. Mark kept beats \`"continue": true\`.
3. Show start -> meaningful change -> result: from beat to beat change ONLY what the narration changes (the
   action, the face, what is held, one diagram label, the callout); \`storyboard.relationToPrevious\` states
   exactly that change.
4. The callout LABELS the change ("52 UNREAD", "NOT A SINGLE VECTOR LINE"); if only text can carry it, say so in
   \`noVisual\` (a vocabulary gap, reported, not hidden). Never invent events, numbers or objects.
5. The kept object must READ as the thing itself (the icon test): never keep an abstract stand-in across a
   sequence (a target icon for "the important task" was read as "the inbox-zero goal" in every beat it stayed —
   keeping a misread symbol spreads the misread). If no icon reads as the thing, keep the PERSON and change what
   they hold, do and feel; the change must be visible in the face, the action or the object, not only the text.
Measured 2026-10-19 (audit/sequence-lab-2026-10-19), blind pairwise, 2 judges each: fiction (burn 96-104, the old
version swapped people every beat) — new preferred 2/2, idea YES vs PARTLY, wrong beats 3 -> 1; non-fiction
(15-secrets 73-81, the old version already kept one person with rich faces) — OLD preferred 2/2 because the new one
kept an abstract target icon (rule 5). Use sequences to stop re-casting and rebuilding, not to replace faces.
An abstract idea mapped to a POSE alone (slump = failure, think = strategy) is mood, not explanation: give the
pose the object or the second person the narration names.

## Output
Return ONLY a JSON array for your chunk. Validate it parses and matches every \`i\`.
`;
}

function rulesVox() {
  const cast = Object.entries(bible.cast || {}).map(([k, c]) => `- ${c.name}: ${c.look || ""}`).join("\n");
  const era = (bible.world && (bible.world.era || bible.world.approxYear)) || "see story bible";
  return `# Storyboard authoring — ${book.title} (${book.author}) · Vox engine

Vox = photoreal Flux stills + kinetic type. For EVERY beat decide what a viewer with the SOUND OFF
must see. Each image costs money and a wrong one is worse than none. ENGLISH only.
Book context: \`books/${SLUG}/story-bible.json\` — world/era: ${era}.

## Output — one object per beat in your chunk, same order, same \`i\`
\`\`\`json
{ "i": 12,
  "design": {
    "type": "statement|imagefocus|list|quote|stat|compare|checklist|polaroid|chart|timeline|question|punchline|place|document|map|flow",
    "kicker": "2-4 word ALL-CAPS tag or ''",
    "emphasis": ["1-3 SHORT ALL-CAPS specific words from THIS beat: names, places, numbers"],
    "items": [],                                     // list/checklist only: 2-4 SHORT ALL-CAPS items
    "image": null | { "subject": "a described photograph", "style": "cutout|card" },
    "compare": null | { "left": {"label","subject"}, "right": {"label","subject"} },
    "storyboard": { "claim": "...", "concreteVisual": "...", "onScreenText": "...",
                    "relationToPrevious": "...", "addedInformation": "..." } } }
\`\`\`

${MINOR_RULE}## The image test (most important)
\`image.subject\` is a DESCRIBED PHOTOGRAPH — who, doing what, where, when — never a keyword list
("heart, manuscript, 1985" is forbidden). A muted viewer must guess the sentence from it. Reuse a
character's look VERBATIM so the same person recurs:
${cast || "- (no cast in the story bible)"}
Keep the era right (no anachronisms). Flux drops gore, children in danger and war violence
(CONTENT_FILTERED) — soften to aftermath, symbol or place. No text inside images.
## Coverage — a muted viewer needs a picture most of the time
Give 70-85% of beats an image. The mute-test bar (image ADDS on >= 60% of ALL frames) cannot
be met otherwise: All the Light had images on 44% of its screen time and failed on text-only frames
while its images scored 14/15. An idea with no photograph still has a place, a person or an object
that carries it (the reader at a desk, the ruined street, the radio). \`statement\` with image null
only for pure banter or when every picture would mislead.
ONLY \`imagefocus\`, \`polaroid\`, \`compare\` and \`duo\` put a picture on screen. An image on any other
type (list, question, place, quote, stat, punchline, timeline…) is never shown — the planner turns such
a beat into imagefocus. Keep 15-30% of beats as those text archetypes WITHOUT an image where the shape
is the point (a real question, a real list, a real quotation): 40 minutes of one layout loses viewers.

## Output
Return ONLY a JSON array for your chunk. Validate it parses and matches every \`i\`.
`;
}

// Authoritative narration per beat from books/<slug>/art.json. Fails loudly on a missing or empty
// narration: a screen callout is never used as narration. --beat-ids=1,24,32 selects beats.
function artBeats() {
  const art = readJSON(path.join(BOOK, "art.json"));
  if (!art || !Array.isArray(art.beats)) throw new Error(`books/${SLUG}/art.json has no beats`);
  const wanted = args["beat-ids"] ? String(args["beat-ids"]).split(",").map((x) => parseInt(x, 10)) : null;
  const out = [];
  for (const b of art.beats) {
    if (!b || typeof b.i !== "number") continue;
    if (wanted && !wanted.includes(b.i)) continue;
    if (typeof b.narration !== "string" || !b.narration.trim()) throw new Error(`beat ${b.i}: no authoritative narration in art.json`);
    out.push({ i: b.i, narration: b.narration.trim() });
  }
  if (wanted && out.length !== wanted.length) throw new Error(`--beat-ids asked for ${wanted.length} beats, art.json has ${out.length}`);
  return out;
}

function prep() {
  // The Step 0 decision the whole storyboard is authored FROM: make-prompt refuses
  // without a book profile, and prep must too — `minorHarm` gates the physical-harm
  // vocabulary (a minorHarm book is never offered lying/collapsed/fighting…) and
  // `mustSee` is what the signature objects get drawn for. A book.json without one
  // was never decided; authoring it anyway silently picks the wrong safety rules.
  if (!book.engineProfile || typeof book.engineProfile !== "object" || !Object.keys(book.engineProfile).length) {
    console.error(`❌ books/${SLUG}/book.json has no engineProfile — the storyboard is authored FROM the Step 0 decision.`);
    console.error(`   Fields: {"kind":"fiction|nonfiction","world":"real-historical|period|contemporary|speculative|ideas","era":2026,`);
    console.error(`            "realPeople":false,"format":"story|argument|mixed","violence":"none|some|central","minorHarm":false,"mustSee":["…","…","…"]}`);
    console.error(`   make-prompt writes it from --profile='{…}'; if the audio already exists, add the same object to books/${SLUG}/book.json.`);
    console.error(`   Rubric + reference books: data/engine-profile-examples.json · skill: .claude/skills/notebooklm-prompt`);
    process.exit(1);
  }
  fs.mkdirSync(SB, { recursive: true });
  const vtt = path.join(ROOT, "public/captions", `${SLUG}.vtt`);
  if (!ART_BEATS && !fs.existsSync(vtt)) { console.error(`❌ public/captions/${SLUG}.vtt missing — the storyboard is authored against the real narration`); process.exit(1); }
  // Engine cross-check BEFORE any authoring: make-book warns when the narration
  // contradicts book.json's engine, but only after the storyboard is written for
  // it. A strong contradiction stops here until the operator confirms.
  if (!ART_BEATS) {
  const { analyzeEngineFromVtt } = require("./lib/vtt");
  const era = bible.world && Number.isFinite(bible.world.approxYear) ? bible.world.approxYear : undefined;
  const sig = analyzeEngineFromVtt(fs.readFileSync(vtt, "utf8"), { era });
  console.log(`engine: ${ENGINE.toUpperCase()} (book.json)${book.engineRationale ? ` — ${book.engineRationale}` : ""}`);
  console.log(`  narration fit: ${sig.pick.toUpperCase()} (${sig.confidence}; vox ${sig.voxScore} vs antidote ${sig.antidoteScore})`);
  sig.reasons.forEach((r) => console.log(`   · ${r}`));
  sig.risks.forEach((r) => console.log(`   ⚠ ${r}`));
  // the check travels with the book, so a reviewer (and the outcomes ledger) can see why
  book.engineCheck = { at: new Date().toISOString().slice(0, 10), fit: sig.pick, confidence: sig.confidence, voxScore: sig.voxScore, antidoteScore: sig.antidoteScore, signals: sig.signals, reasons: sig.reasons, risks: sig.risks, confirmed: !!args["confirm-engine"] };
  fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify(book, null, 2) + "\n");
  // This is a CONFIRMATION of the Step 0 decision, not a second decision: the
  // NotebookLM prompt was written for ${ENGINE}, so the audio already follows it.
  // Switching now = a new prompt, a new recording and a new VTT. Default: keep.
  if (sig.confidence === "strong" && sig.pick !== ENGINE && !args["confirm-engine"]) {
    console.error(`❌ The narration points strongly to ${sig.pick.toUpperCase()}; the book was set up (and recorded) for ${ENGINE.toUpperCase()} (${book.engineDecidedBy || "step 0"}).`);
    console.error(`   Ask the operator. Usually KEEP it (the audio was written for ${ENGINE}): re-run with --confirm-engine.`);
    console.error(`   Switching to ${sig.pick} means: make-prompt --engine=${sig.pick} → new NotebookLM audio → new VTT → start again.`);
    process.exit(1);
  }
  if (ENGINE === "vox" && sig.risks.length && !args["confirm-engine"]) {
    console.error(`❌ Vox + violence/death risk: Flux will refuse many of the key images. Ask the operator: keep Vox (--confirm-engine) or switch to Antidote.`);
    process.exit(1);
  }
  }
  if (!bible.cast || !Object.keys(bible.cast).length) {
    console.warn(`⚠ story bible has no cast — author it first (plan-bible --emit -> Claude -> --bible). WWL shipped a cast without its three mothers.`);
  }
  if (ENGINE === "antidote") {
    const own = ownMotifs();
    const missing = signatureObjects().filter((o) => !own[o.key]);
    if (!signatureObjects().length) {
      console.warn(`⚠ story bible has no signatureObjects — list the book's own things no shared icon depicts (runbook §1b). F451 never drew its Mechanical Hound.`);
    }
    if (missing.length && !args["skip-own-icons"]) {
      console.error(`❌ ${missing.length} signature object(s) have no icon in books/${SLUG}/motifs.json: ${missing.map((o) => o.key).join(", ")}`);
      console.error(`   Draw each as data (STORYBOARD_RUNBOOK.md §1b), or pass --skip-own-icons="<why>" to author without them.`);
      process.exit(1);
    }
  }
  if (ENGINE === "antidote") {
    const castIssues = checkCastVariants();
    castIssues.warn.forEach((w) => console.warn(`⚠ ${w}`));
    if (castIssues.stop.length && !args["skip-cast-check"]) {
      castIssues.stop.forEach((e) => console.error(`❌ ${e}`));
      console.error(`   Give each cast member a \`variant\` in story-bible.json from its look (STORYBOARD_RUNBOOK.md §1c).`);
      process.exit(1);
    }
  }
  const beatsFile = path.join(SB, "beats.json");
  const common = [`--vtt=public/captions/${SLUG}.vtt`, `--slug=${SLUG}`, `--title=${book.title}`, `--author=${book.author}`, `--genre=${book.genre || "nonfiction"}`, `--emit-beats=${beatsFile}`];
  const script = ENGINE === "vox" ? "scripts/plan-vox.js" : "scripts/plan-antidote.js";
  const extra = ENGINE === "vox" ? ["--no-llm", ...(fs.existsSync(path.join(ROOT, "public/audio", `${SLUG}.m4a`)) ? [`--audio=public/audio/${SLUG}.m4a`] : [])] : [];
  let beats;
  if (ART_BEATS) {
    beats = artBeats();
    // merge() reads storyboard/beats.json; the art path must leave the same file the VTT path leaves
    fs.writeFileSync(path.join(SB, "beats.json"), JSON.stringify({ source: "art.json", beats }, null, 2) + "\n");
  } else {
    execFileSync(process.execPath, [script, ...common, ...extra], { cwd: ROOT, stdio: "pipe" });
    const emitted = readJSON(beatsFile);
    beats = emitted.beats.map((b) => ({ i: b.i, narration: b.narration || b.text }));
  }
  const v = vocabulary();
  // the book inputs this prep was made from: merge refuses when the bible or own icons changed afterwards
  v.inputs = bookInputs();
  fs.writeFileSync(path.join(SB, "vocab.json"), JSON.stringify(v, null, 2));
  const rulesText = ENGINE === "vox" ? rulesVox() : rulesAntidote(v);
  fs.writeFileSync(path.join(SB, "rules.md"), rulesText);
  fs.writeFileSync(path.join(SB, "policy.json"), JSON.stringify(authoringRunRecord(rulesText), null, 2) + "\n");
  const size = parseInt(args.chunk || "40", 10);
  const { chunks, moves } = chunkRanges(beats, size);
  if (moves.length) console.log(`  chunk boundaries moved off mid-idea cuts: ${moves.map((m) => `${m.fixed}->${m.at} (${m.why})`).join(", ")}`);
  chunks.forEach(([a, z], k) => {
    fs.writeFileSync(path.join(SB, `chunk-${k + 1}.json`), JSON.stringify({
      chunk: k + 1, range: [a, z],
      contextBefore: beats.slice(Math.max(0, a - 3), a),
      beats: beats.slice(a, z + 1),
      contextAfter: beats.slice(z + 1, z + 3),
    }, null, 1));
  });
  const abs = (f) => path.join(SB, f);
  const prompts = chunks.map(([a, z], k) => `### Author ${k + 1} (beats ${a}-${z})
Follow ${abs("rules.md")} exactly (read it, the story bible and the reference it names first).
Your beats: ${abs(`chunk-${k + 1}.json`)} (author every entry in \`beats\`; context entries are for continuity only).
First read your chunk end to end and make the idea map (rules.md "Sequences", step 0): mark the passages that develop
ONE idea over several beats and author those as a sequence (one kept stage that holds the thing that changes — a
growing diagram where the narration builds a cause -> effect, the signature object that changes; the people react to
it — start -> change -> result, \`continue\` on kept beats); passages of separate points stay single beats. No chunk
needs a sequence. Then
consider every beat individually (rules.md "The question for every beat"). Write the JSON array to ${abs(`authored-${k + 1}.json`)}.
Validate it parses and has one entry per beat with matching \`i\`. Do not modify any other file.
Reply with one line: count written.`).join("\n\n");
  fs.writeFileSync(path.join(SB, "PROMPTS.md"), `# Author prompts — ${SLUG} (${ENGINE}, ${beats.length} beats, ${chunks.length} authors)\n\nRun all authors in parallel, then:\n\n    node scripts/storyboard.js merge --slug=${SLUG}\n    node scripts/storyboard.js merge --slug=${SLUG} --write\n\n${prompts}\n`);
  console.log(`✓ books/${SLUG}/storyboard/ — ${beats.length} beats, ${chunks.length} chunks, ${ENGINE}${ENGINE === "antidote" ? `, ${v.icons.length} icons` : ""}`);
  console.log(`  Next: run the ${chunks.length} author prompts in books/${SLUG}/storyboard/PROMPTS.md in parallel.`);
}

// ── EXPERIMENT: validation of an authored relationship-staging selection ────────
// Returns one message per problem, each naming the field to change. Never edits.
function relationshipProblems(i, a, narration) {
  const out = [];
  const norm = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
  const rel = a.relationship;
  if (!rel || typeof rel !== "object") return ["relationship staging selected but `relationship` is missing"];
  // conflicts with the staging: the author removes them
  if (!Array.isArray(a.cast) || a.cast.length) out.push("relationship staging selected: set `cast` to [] (the relationship draws both sides; no cast member stands in for them)");
  if (a.callout) out.push("relationship staging selected: set `callout` to null (the message panel carries the narration's words)");
  if (a.concept) out.push(`relationship staging selected: set \`concept\` to null (icon "${a.concept}" competes with the relationship)`);
  if (a.diagram) out.push("relationship staging selected: set `diagram` to null");
  if (a.holds) out.push("relationship staging selected: remove `holds`");
  // groups must exist in the story bible, with evidence
  const groups = (bible && bible.groups) || {};
  for (const side of ["source", "target"]) {
    const g = rel[side] && rel[side].group;
    if (!g) out.push(`relationship.${side}.group missing`);
    else if (!groups[g]) out.push(`relationship.${side}.group "${g}" is not in story-bible groups`);
    else if (!groups[g].evidence || !groups[g].evidence.quote) out.push(`story-bible groups.${g} has no evidence quote`);
  }
  // Check A: every quote verbatim in the narration of its beat
  // neighbour narration from storyboard/beats.json (every beat; art.json does not exist before the first merge --write)
  const all = (readJSON(path.join(SB, "beats.json"), { beats: [] }).beats) || [];
  const narrOf = (b) => (b === i ? narration : ((all.find((x) => x.i === b) || {}).narration || (all.find((x) => x.i === b) || {}).text));
  const walk = (o, f) => {
    if (!o || typeof o !== "object") return;
    if (o.quote !== undefined && o.beat !== undefined) {
      const n = narrOf(o.beat);
      if (!n || !norm(n).includes(norm(o.quote))) out.push(`relationship.${f}: quote "${o.quote}" not found verbatim in beat ${o.beat}`);
    }
    for (const [k, v] of Object.entries(o)) { if (Array.isArray(v)) v.forEach((x) => walk(x, f)); else if (v && typeof v === "object") walk(v, f); }
  };
  for (const [k, v] of Object.entries(rel)) walk(v, k);
  // cue phrases must be spoken inside THIS beat (cue timing comes from its word timings)
  const cueQuotes = [
    ["means.label", rel.means && rel.means.label && rel.means.label.quote],
    ["means.falseMarker", rel.means && rel.means.falseMarker && rel.means.falseMarker.quote],
    ["rejectedMethod.scope", rel.rejectedMethod && rel.rejectedMethod.scope],
    ["negation.scope", rel.negation && rel.negation.scope],
    ["counterAction.cue", rel.counterAction && rel.counterAction.cue && rel.counterAction.cue.quote],
  ];
  if (!cueQuotes[0][1]) out.push("relationship.means.label missing (the message panel text, a narration quote)");
  for (const [f, q] of cueQuotes) if (q && !norm(narration).includes(norm(q))) out.push(`relationship.${f}: "${q}" is not spoken in beat ${i}, so it has no cue time`);
  if (rel.speaker && !(rel.speaker.evidence && rel.speaker.evidence.quote)) out.push("relationship.speaker has no supporting quote: set it to null");
  if (!rel.modality || !rel.modality.value) out.push("relationship.modality missing");
  // Gate B: a different model family must have judged EVERY used field SUPPORTED for this exact
  // record and narration. Missing, FALLBACK or stale verdict = not staged (the author reverts the
  // beat to the normal flow, or re-runs Gate B after fixing the record).
  const gb = readJSON(path.join(SB, "gate-b", `${i}.json`));
  const { gateBInputSha } = require("./gate-b-relationship");
  if (!gb) out.push(`Gate B missing: run node scripts/gate-b-relationship.js --slug=${SLUG} (a different model family judges every field)`);
  else if (gb.decision !== "STAGE") out.push(`Gate B decision ${gb.decision}: not every field is SUPPORTED; remove stageRelationship and author this beat normally, or fix the record and re-run Gate B`);
  else if (gb.inputSha256 !== gateBInputSha(rel, narration)) out.push("Gate B is stale: the relationship or narration changed after the verdict; re-run scripts/gate-b-relationship.js");
  return out;
}

// ── merge + validate ────────────────────────────────────────────────────────
function merge() {
  const emitted = readJSON(path.join(SB, "beats.json"));
  if (!emitted) { console.error("❌ run prep first"); process.exit(1); }
  const authored = new Map();
  const files = fs.readdirSync(SB).filter((f) => /^authored-\d+\.json$/.test(f));
  for (const f of files) {
    const arr = readJSON(path.join(SB, f));
    if (!Array.isArray(arr)) { console.error(`❌ ${f} is not a JSON array`); process.exit(1); }
    arr.forEach((b) => authored.set(b.i, b));
  }
  const problems = [], warnings = [];
  const P = (i, m) => problems.push(`${i}: ${m}`);
  const sbFields = ["claim", "concreteVisual", "onScreenText", "relationToPrevious", "addedInformation"];
  const out = [];
  // Unsupported top-level fields are an error, never silently dropped (burn scene-218: "shot" instead of
  // "shotOverride" — the authored framing never reached the screen). No auto-conversion: the author fixes it.
  {
    const KNOWN = new Set(ENGINE === "antidote"
      ? ["i", "concept", "diagram", "callout", "set", "cast", "expression", "action", "holds", "shotOverride", "conceptMotion",
        "conceptMotionCue", "actionCue", "partnerExpression", "partnerAction", "continue", "stageRelationship", "relationship", "storyboard", "explainedBy", "noVisual"]
      : ["i", "design", "storyboard"]);
    const HINT = ENGINE === "antidote" ? { shot: "shotOverride", face: "expression" } : {};
    for (const [i, a] of authored) {
      for (const k of Object.keys(a || {})) {
        if (KNOWN.has(k)) continue;
        P(i, HINT[k] ? `unsupported field "${k}" — use "${HINT[k]}" (merge does not convert it)` : `unsupported field "${k}" — merge ignores it; use a field from rules.md or remove it`);
      }
    }
  }
  if (ENGINE === "antidote") {
    const st = require("./lib/screen-text.js");
    const v = readJSON(path.join(SB, "vocab.json")) || vocabulary();
    // A session that prepped before the engine grew (new faces, own icons, actions)
    // keeps authoring with the old vocabulary and blames the engine for what it no
    // longer lacks — Unhinged and Lolita reported "no angry/smirk/afraid" two days
    // after those faces shipped. The live vocabulary is the truth; a stale snapshot
    // is a problem until prep is re-run (prep rewrites rules/vocab, never authored-K).
    {
      const live = vocabulary();
      const fresh = [];
      for (const k of ["icons", "expressions", "actions", "holds", "shots", "sets"]) {
        const had = new Set(v[k] || []);
        (live[k] || []).filter((x) => !had.has(x)).forEach((x) => fresh.push(`${k.slice(0, -1)} ${x}`));
      }
      if (fresh.length) problems.push(`VOCABULARY: the engine gained ${fresh.join(", ")} since this storyboard was prepped — run storyboard.js prep --slug=${SLUG} (rewrites rules.md/vocab.json, keeps authored-K.json), read the new rules, and re-author the beats they fit`);
      // A prep made before the story bible / own icons were final (e.g. the first prep only checked the
      // engine) leaves PROMPTS, rules.md and the cast list stale: authors must work from the last bible.
      if (!v.inputs) warnings.push("vocab.json predates the bible/motifs record — run storyboard.js prep so merge can check the authors used the final story bible");
      else {
        const now = bookInputs();
        const changed = Object.keys(now).filter((k) => now[k] !== v.inputs[k]);
        if (changed.length) problems.push(`STALE PREP: ${changed.join(" + ")} changed after storyboard.js prep — run prep --slug=${SLUG} again (keeps authored-K.json) and have the authors check their beats against the new rules.md/cast`);
      }
    }
    const ICONS = new Set(v.icons), SETS = new Set(v.sets), SHOTS = new Set(v.shots), EXP = new Set(v.expressions),
      ACT = new Set(v.actions), HOLD = new Set(v.holds), CAST = new Set(v.cast.map((c) => c.key));
    const DIAG = new Set(["flow", "sorter", "spectrum", "matchWave"]), STY = new Set(["reveal", "highlight", "strike", "box", "stack", "outline", "marker"]);
    for (let k = 0; k < emitted.beats.length; k++) {
      const e = emitted.beats[k];
      const i = e.i, a = authored.get(i), narration = e.narration;
      if (!a) { P(i, "NOT AUTHORED"); continue; }
      if (a.concept != null && !ICONS.has(a.concept)) P(i, `icon "${a.concept}" not in this book's vocabulary`);
      // authored continuation: only after a beat that exists, and on the same set
      if (a.continue != null) {
        const before = k > 0 ? authored.get(emitted.beats[k - 1].i) : null;
        if (a.continue !== true) P(i, `continue must be true or left out (got ${JSON.stringify(a.continue)})`);
        else if (k === 0) P(i, `"continue": true on the first beat — there is no previous beat to continue`);
        else if ((a.set || null) !== ((before && before.set) || null)) warnings.push(`${i}: "continue" but set "${a.set || "(engine's)"}" differs from the previous beat's "${(before && before.set) || "(engine's)"}" — a continued stage keeps its set; match the set or drop "continue"`);
      }
      if (a.set && !SETS.has(a.set)) P(i, `set "${a.set}"`);
      if (a.shotOverride && !SHOTS.has(a.shotOverride)) P(i, `shotOverride "${a.shotOverride}"`);
      // burn scene-218 (2026-10-20): an authored beforeAfter rendered ONE icon and no arrow — its second
      // icon is an engine-chosen "opposite" that is never added to an authored concept. Refuse it, name
      // what can show a before -> after.
      if (a.shotOverride === "beforeAfter") {
        const { CONCEPT_MOTIONS: CM, STATE_MOTIONS: SM } = require("../src/engines/antidote/schema.ts");
        const states = Object.entries(CM).flatMap(([k, m]) => m.filter((x) => SM.includes(x)).map((x) => `${k}: ${x}`));
        P(i, `shotOverride "beforeAfter" draws only ONE icon on an authored beat (no after-state, no arrow) — for one object changing state author its conceptMotion (${states.join(", ")}) on an illustration/insert beat; for two different states use a diagram or two beats`);
      }
      if (a.expression && !EXP.has(a.expression)) P(i, `expression "${a.expression}"`);
      if (a.action && !ACT.has(a.action)) P(i, `action "${a.action}"`);
      // measured (2026-09-28 blind check): alone, fighting read as "fuming", grabbing as
      // "walking", struggling as "recoiling" — these verbs only read with the other person
      if (PAIR_ACTIONS[a.action] && !(Array.isArray(a.cast) && a.cast.length >= 2)) P(i, `action "${a.action}" needs two cast members — alone it reads as "${PAIR_ACTIONS[a.action]}"`);
      // measured (2026-09-28 blind check): `reach` alone with nothing to reach for read as
      // "waving" — the action needs its subject on screen (an icon or a held object).
      if (a.action === "reach" && !a.concept && !a.holds) warnings.push(`${i}: action "reach" with no concept and no holds reads as "waving" — give it its subject (a concept icon or a held object), or stage a different action`);
      if (a.holds && !HOLD.has(a.holds)) P(i, `holds "${a.holds}"`);
      // authored icon behaviour: only on an icon that draws it, cue spoken in this beat
      if (a.conceptMotion != null) {
        const { CONCEPT_MOTIONS } = require("../src/engines/antidote/schema.ts");
        if (!(CONCEPT_MOTIONS[a.concept] || []).includes(a.conceptMotion)) P(i, `conceptMotion "${a.conceptMotion}" is not drawn by icon "${a.concept}" (supported: ${Object.entries(CONCEPT_MOTIONS).map(([k, m]) => `${k}: ${m.join("/")}`).join(", ")})`);
      }
      // AUTHORED ACTIONS WITH A MOMENT (take / embrace): who does it, to whom/what and when come from the author
      if (a.action === "take" && !a.holds) P(i, `action "take" needs "holds": the object the hand reaches for and keeps (one of the holds)`);
      // the SECOND person's face (2026-10-20): the engine never invents a feeling, so a two-person deed lets the author give it
      if (a.partnerExpression != null) {
        if (!(Array.isArray(a.cast) && a.cast.length === 2)) P(i, `partnerExpression is the second cast member's face: it needs exactly two cast members (got ${JSON.stringify(a.cast)})`);
        else if (!EXP.has(a.partnerExpression)) P(i, `partnerExpression "${a.partnerExpression}" is not a face (${[...EXP].join(", ")})`);
      }
      // the SECOND person's body (2026-10-22, lib/partner-contract.js — the same rule the planner and the lock use):
      // two cast members, a known action, and never against the lead verb's pair (an embrace is embraced back)
      require("./lib/partner-contract").partnerActionProblems(a, ACT).forEach((m) => P(i, m));
      // An authored split now draws its two-tone field (2026-10-22); with one person and nothing else the second half is
      // an empty colour panel (the-courage-to-be-disliked 73, blind: "an empty pink panel"). The author's choice stands —
      // a warning, never a change.
      if (a.shotOverride === "split" && Array.isArray(a.cast) && a.cast.length < 2 && !a.concept && !a.diagram && !a.holds) warnings.push(`${i}: shotOverride "split" with ${a.cast.length ? "one person" : "nobody"} and no concept/diagram/holds — the second half is an empty colour panel; stage the other side (a second cast member or the object) or choose another shot`);
      if (a.action === "embrace" && !(Array.isArray(a.cast) && a.cast.length === 2)) P(i, `action "embrace" needs exactly two cast members ["<who moves>", "<who is embraced>"] (got ${JSON.stringify(a.cast)})`);
      if (a.actionCue != null) {
        const nwA = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
        if (a.action !== "take" && a.action !== "embrace") P(i, `actionCue is only read by action "take" or "embrace" (got action ${JSON.stringify(a.action)})`);
        else if (!nwA(narration).includes(nwA(a.actionCue))) P(i, `actionCue "${a.actionCue}" is not spoken in this beat (the moment comes from its word timings)`);
      }
      // a continued stage keeps the RESULT of a take: the same person still holds the same object
      if (a.continue === true && k > 0) {
        const pa = authored.get(emitted.beats[k - 1].i);
        const who0 = (x) => (x && Array.isArray(x.cast) && x.cast[0]) || null;
        if (pa && (pa.action === "take" || pa.action === "hold") && pa.holds && who0(pa) && who0(pa) === who0(a) && a.holds !== pa.holds)
          P(i, `continues ${who0(a)} after ${pa.action === "take" ? "taking" : "holding"} "${pa.holds}" in beat ${pa.i} — set "holds": "${pa.holds}" (action "hold") to keep it in hand (without it the object vanishes at the cut)`);
      }
      // a continued stage keeps the END state of a state change: the same icon must repeat the motion
      if (a.continue === true && k > 0) {
        const { STATE_MOTIONS: SM } = require("../src/engines/antidote/schema.ts");
        const prevA = authored.get(emitted.beats[k - 1].i);
        if (prevA && prevA.concept && prevA.concept === a.concept && SM.includes(prevA.conceptMotion) && a.conceptMotion !== prevA.conceptMotion)
          P(i, `continues "${a.concept}" after its state change "${prevA.conceptMotion}" in beat ${prevA.i} — set "conceptMotion": "${prevA.conceptMotion}" to keep the end state (without it the ${a.concept} jumps back to its start state)`);
      }
      if (a.conceptMotionCue != null) {
        const nw =(t) => String(t || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
        if (!a.conceptMotion) P(i, "conceptMotionCue without conceptMotion");
        else if (!nw(narration).includes(nw(a.conceptMotionCue))) P(i, `conceptMotionCue "${a.conceptMotionCue}" is not spoken in this beat (the cue time comes from its word timings)`);
      }
      if (Array.isArray(a.cast)) a.cast.forEach((c) => { if (!CAST.has(c)) P(i, `cast "${c}" not in story bible`); });
      if (Array.isArray(a.cast) && !a.cast.length && a.holds) warnings.push(`${i}: cast [] (nobody on screen) but holds "${a.holds}" — nobody holds it; stage the object as the concept icon or name who holds it`);
      if (a.diagram) {
        if (!DIAG.has(a.diagram.type)) P(i, `diagram type "${a.diagram.type}"`);
        if (!Array.isArray(a.diagram.labels) || !a.diagram.labels.length) P(i, "diagram without labels");
        if (a.concept || a.callout) P(i, "diagram beat also has icon/callout");
        // the diagram fills the frame (insert framing): an authored person would be dropped silently
        if (Array.isArray(a.cast) && a.cast.length) P(i, `diagram beat also has cast ${JSON.stringify(a.cast)} — a diagram fills the frame and shows nobody; choose the diagram (cast: []) or the person (no diagram)`);
        (a.diagram.labels || []).forEach((l) => { const vv = st.checkString(l, { kind: "label", narration, authored: true }); if (vv.length) P(i, `diagram label "${l}": ${vv.map((x) => x.code).join(",")}`); });
      }
      if (a.callout) {
        if (!STY.has(a.callout.style)) P(i, `callout style "${a.callout.style}"`);
        const vv = st.checkString(a.callout.text, { kind: "text", narration, authored: true });
        if (vv.length) P(i, `callout "${a.callout.text}": ${vv.map((x) => x.code).join(",")}`);
      }
      const sb = a.storyboard || {};
      sbFields.forEach((k) => { if (!sb[k]) P(i, `storyboard.${k} missing`); });
      if (!a.callout && !a.diagram && !a.concept && !a.cast && !a.stageRelationship) warnings.push(`${i}: no callout/diagram/icon/staging`);
      // EXPERIMENT: relationship staging is an AUTHORED decision. The author selects it
      // (stageRelationship: true), writes the source-grounded relationship record, and removes
      // everything that would compete with it. Nothing is fixed silently: each conflict is
      // reported with the field to change, and the engine draws what is written.
      if (a.stageRelationship) relationshipProblems(i, a, narration).forEach((m) => P(i, m));
      out.push({
        i, narration,
        concept: a.concept ?? null, diagram: a.diagram ?? null, callout: a.callout ?? null,
        ...(a.set ? { set: a.set } : {}), ...(a.shotOverride ? { shotOverride: a.shotOverride } : {}),
        // cast: ABSENT = the author did not choose (the engine may cast); [] = the author
        // wants NOBODY on screen (final: no step may add a figure); filled = exactly these.
        // The [] used to be dropped here unless stageRelationship was set, so the empty
        // decision never reached art.json and the planner cast the beat (burn 111: luther).
        ...(Array.isArray(a.cast) ? { cast: a.cast.slice(0, 2) } : {}),
        ...(a.expression ? { expression: a.expression } : {}), ...(a.action ? { action: a.action } : {}),
        ...(a.holds ? { holds: a.holds } : {}),
        ...(a.continue === true ? { continue: true } : {}),
        ...(a.conceptMotion ? { conceptMotion: a.conceptMotion } : {}),
        ...(a.conceptMotion && a.conceptMotionCue ? { conceptMotionCue: a.conceptMotionCue } : {}),
        ...(a.actionCue ? { actionCue: a.actionCue } : {}),
        ...(a.partnerExpression ? { partnerExpression: a.partnerExpression } : {}),
        ...(a.partnerAction ? { partnerAction: a.partnerAction } : {}),
        ...(a.stageRelationship ? { stageRelationship: true, relationship: a.relationship } : {}),
        storyboard: sb,
      });
    }
    const hist = {}; out.forEach((b) => b.concept && (hist[b.concept] = (hist[b.concept] || 0) + 1));
    const top = Object.entries(hist).sort((x, y) => y[1] - x[1]);
    const ownSet = new Set(v.ownIcons || []);
    top.filter(([k, n]) => !ownSet.has(k) && n > out.length * 0.05).forEach(([k, n]) => warnings.push(`icon "${k}" on ${n}/${out.length} beats (>5%) — an icon used for everything means nothing; re-check each against data/icon-readings.json`));
    signatureObjects().filter((o) => ownSet.has(o.key) && !hist[o.key]).forEach((o) => warnings.push(`signature object "${o.key}" is drawn but never used`));
    console.log(`beats ${out.length} | icon ${out.filter((b) => b.concept).length} | diagram ${out.filter((b) => b.diagram).length} | callout ${out.filter((b) => b.callout).length} | staged ${out.filter((b) => Array.isArray(b.cast) && b.cast.length).length} | empty cast ${out.filter((b) => Array.isArray(b.cast) && !b.cast.length).length}`);
    console.log("icons:", JSON.stringify(top));
  } else {
    const TYPES = new Set(["title", "statement", "imagefocus", "list", "quote", "stat", "compare", "checklist", "polaroid", "chart", "timeline", "question", "punchline", "place", "document", "map", "flow", "trendline", "dataviz", "network", "duo", "reveal"]);
    let withImage = 0;
    const VOX_IMAGE_TYPES = new Set(["imagefocus", "polaroid", "compare", "duo"]);
    for (const e of emitted.beats) {
      const i = e.i, a = authored.get(i);
      if (!a || !a.design) { P(i, "NOT AUTHORED"); continue; }
      if ((a.design.image && a.design.image.subject) || a.design.compare) withImage++;
      if (a.design.image && a.design.image.subject && !VOX_IMAGE_TYPES.has(a.design.type) && a.design.type !== "statement")
        warnings.push(`${i}: image on "${a.design.type}" is never drawn — the planner makes it imagefocus; drop the image to keep the ${a.design.type}`);
      const d = a.design;
      if (!TYPES.has(d.type)) P(i, `type "${d.type}"`);
      const sb = d.storyboard || a.storyboard || {};
      sbFields.forEach((k) => { if (!sb[k]) P(i, `storyboard.${k} missing`); });
      if (d.image) {
        const s = String(d.image.subject || "");
        const words = s.split(/\s+/).filter(Boolean).length;
        if (words < 6 || /^([\w'-]+,\s*){2,}[\w'-]+$/.test(s.trim())) P(i, `image.subject is a keyword bag, not a described photograph: "${s}"`);
      }
      out.push({ ...d, storyboard: sb });
    }
    console.log(`beats ${out.length} | with image ${out.filter((d) => d.image).length}`);
    if (out.length && withImage > out.length * 0.9) warnings.push(`${withImage}/${out.length} beats have an image — almost every beat will be imagefocus; keep 15-30% as real questions/lists/quotes (rules.md → Coverage)`);
    if (out.length && withImage < out.length * 0.7) warnings.push(`only ${withImage}/${out.length} beats have an image (${Math.round((withImage / out.length) * 100)}%) — aim for 70%+: the mute test scores ADDS over ALL frames (rules.md → Coverage)`);
  }
  console.log(`problems (${problems.length})`); problems.slice(0, 60).forEach((x) => console.log("  ✗ " + x));
  if (problems.length > 60) console.log(`  … ${problems.length - 60} more`);
  if (warnings.length) { console.log(`warnings (${warnings.length})`); warnings.slice(0, 20).forEach((x) => console.log("  ⚠ " + x)); }
  if (!args.write) return;
  if (problems.length) { console.error("\n❌ not written — fix the problems (ask the chunk's author, or edit authored-K.json) and re-run."); process.exit(1); }
  if (ENGINE === "antidote") {
    fs.writeFileSync(path.join(BOOK, "art.json"), JSON.stringify({
      book: { slug: SLUG, title: book.title, author: book.author, genre: book.genre },
      storyboard: { method: "authored storyboard (STORYBOARD_RUNBOOK.md)", authoredBy: "claude", date: new Date().toISOString().slice(0, 10) },
      beats: out,
    }, null, 2) + "\n");
    console.log(`\n✓ books/${SLUG}/art.json — next: node scripts/make-book.js --slug=${SLUG} ... --skip-pack`);
  } else {
    fs.writeFileSync(path.join(BOOK, "designs.json"), JSON.stringify(out, null, 2) + "\n");
    console.log(`\n✓ books/${SLUG}/designs.json — next: node scripts/make-book.js --slug=${SLUG} ... (gate runs before Flux)`);
  }
}

if (CMD === "prep") prep(); else merge();
