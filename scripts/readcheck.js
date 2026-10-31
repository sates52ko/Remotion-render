#!/usr/bin/env node
/**
 * readcheck.js — a blind READING of EVERY authored Antidote beat, before any render.
 *
 * The rendered mute test samples 30 frames, so each fix round only learns about
 * the frames it happened to draw — Fahrenheit 451 cleared chains/medical/coin and
 * the next holdout found clock, food and target doing the same thing. This pass
 * shows a blind agent only what a muted viewer would get on each beat (people +
 * face + body + object, the icon as it is DRAWN, the set, the on-screen words,
 * the diagram) — never the narration — and a judge compares its guess with the
 * narration. Text only, all beats, cheap (sonnet); the render mute test then
 * confirms on pixels.
 *
 *   node scripts/readcheck.js prep  --slug=<slug> [--beats=12,40] [--chunk=140]
 *       -> books/<slug>/storyboard/readcheck/{visible-K.json, PROMPTS.md}
 *   (blind agents write guess-K.json)
 *   node scripts/readcheck.js judge --slug=<slug>
 *       -> judge-K.json inputs; prompts appended to PROMPTS.md
 *   (judge agents write verdict-K.json)
 *   node scripts/readcheck.js tally --slug=<slug>
 *       -> every WRONG / NEUTRAL beat with the element to blame; readcheck.json
 *
 * After fixing, re-check only the changed beats: prep --beats=<ids>. A re-check goes to its own
 * folder readcheck/recheck-N/ (judge --recheck=N) and never touches the full run; tally merges the
 * full run with every re-check, the newest verdict per beat winning.
 */
const fs = require("fs");
const path = require("path");
const { partnerActionFor } = require("./lib/partner-contract");
const { drawnLabels } = require("./lib/diagram-capacity");

const CMD = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const ROOT = path.resolve(args.root || path.join(__dirname, ".."));   // --root=<tree with books/> (tests)
const SLUG = args.slug;
if (!["prep", "judge", "tally", "misleading"].includes(CMD) || !SLUG) {
  console.error("Usage: node scripts/readcheck.js prep|judge|tally|misleading --slug=<slug> [--beats=1,2] [--chunk=140]");
  process.exit(1);
}
const BOOK = path.join(ROOT, "books", SLUG);
const BASE = path.join(BOOK, "storyboard", "readcheck");
// --beats (prep) or --recheck=N (judge) work in readcheck/recheck-N/; the full run stays untouched.
const recheckDirs = () => (fs.existsSync(BASE) ? fs.readdirSync(BASE).filter((d) => /^recheck-\d+$/.test(d)).sort((a, b) => parseInt(a.slice(8)) - parseInt(b.slice(8))) : []);
function outDir() {
  if (CMD === "prep" && args.beats) { const n = recheckDirs().length + 1; return path.join(BASE, `recheck-${n}`); }
  if (CMD === "judge" && args.recheck) return path.join(BASE, `recheck-${parseInt(args.recheck, 10)}`);
  return BASE;
}
const OUT = outDir();
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

// What each shared icon LOOKS like — literal, never its intended metaphor.
const DRAWN = {
  alarmClock: "an alarm clock", butterfly: "a butterfly", subway: "a subway train", car: "a car", coffee: "a coffee cup",
  crash: "a crash burst / explosion shape", ledge: "a person-sized cliff ledge", water: "water waves", grave: "a gravestone",
  medical: "a medical cross with a heartbeat line", notes: "sheets of written notes", phone: "a modern smartphone",
  school: "a school building", home: "a house", family: "a family group of figures", road: "a road", storm: "a storm cloud with lightning",
  star: "a glowing star", heart: "a heart", fire: "flames", tree: "a tree", mask: "a theatre mask", mirror: "a mirror with a reflection",
  key: "a key", law: "a courthouse / gavel", photo: "a photograph", war: "a tank / battlefield", game: "a game controller / board game",
  work: "a briefcase at a desk", city: "an intact city skyline", food: "a dinner plate with fork and knife", coin: "a gold coin",
  door: "a door", lightbulb: "a lit lightbulb", puppeteer: "a hand working puppet strings", chains: "chain links",
  compass: "a compass", boulder: "a big boulder", summit: "a mountain summit", ladder: "a ladder", crack: "an abstract orange branching line",
  clock: "a clock face", balance: "a balance scale", book: "a book", shield: "a shield", trophy: "a trophy", hourglass: "an hourglass",
  sword: "a sword", target: "an archery target", magnifier: "a magnifying glass", wallet: "a wallet", gift: "a wrapped gift",
  inheritance: "a will document with a seal", zap: "a lightning bolt", dominoCascade: "falling dominoes", icebergDepth: "an iceberg",
};
const DIAGRAM = { flow: "arrows linking labels in a chain", sorter: "labelled buckets", spectrum: "a scale from one label to another with a marker", matchWave: "two waves" };
// what a SCORECARD shows at its stage — what the screen draws, in words (sizes as words, numbers only when printed)
const size = (v, max) => (v == null ? "empty" : v / max >= 0.75 ? "long" : v / max >= 0.4 ? "medium" : v > 0 ? "short" : "empty");
function scorecardSeen(sc) {
  const stage = ["weights", "options", "scores", "totals"].indexOf(sc.show || "weights");
  const crit = (sc.criteria || []).map((c) => `"${c.label}"${c.owner ? ` (${c.owner})` : ""} with a ${size(c.weight, 1)} weight bar${c.weightText ? ` "${c.weightText}"` : ""}`);
  let s = `a weighted scorecard: ${crit.join("; ")}`;
  if (stage >= 1 && (sc.options || []).length) s += `; option columns ${(sc.options || []).map((o) => `"${o.label}"`).join(" and ")}`;
  if (stage >= 2) s += `; bars per option: ${(sc.options || []).map((o) => `${o.label}: ${(sc.criteria || []).map((c, i) => `${c.label} ${(o.scores || [])[i] == null ? "not graded (a dashed bar with '?')" : size((o.scores || [])[i], 10)}${o.scoreText && o.scoreText[i] ? ` "${o.scoreText[i]}"` : ""}`).join(", ")}`).join("; ")}`;
  if (stage >= 3) s += "; each graded bar shrinks by its weight and adds into a total bar per option (out of the best possible total)" + ((sc.options || []).some((o) => (sc.criteria || []).some((c, i) => (o.scores || [])[i] == null)) ? "; while any value is ungraded no option shows a total, every total is '?'" : "") + (Number.isInteger(sc.winner) && sc.options && sc.options[sc.winner] ? `, "${sc.options[sc.winner].label}" marked` : "");
  return s;
}

function beatsOf() {
  const art = readJSON(path.join(BOOK, "art.json"));
  if (!art || !art.beats) { console.error(`❌ books/${SLUG}/art.json missing — storyboard.js merge --write first`); process.exit(1); }
  return Object.values(art.beats).sort((a, b) => a.i - b.i);
}

// The shots that draw nobody (src/engines/antidote/shots.ts `dropsCast`): an authored one keeps its framing, so
// whoever the cast names is off screen there.
const DROPS_CAST = new Set(["insert", "beforeAfter", "chapterCard"]);
// What a viewer sees of a person who has no `look` in the story bible: the drawn costume, never the cast key (a key
// is a NAME — "Cruz" — which no muted viewer can read off a drawing).
function looksOf(c) {
  if (c && c.look) return String(c.look).split(/[,.;]/)[0].slice(0, 90);
  const v = (c && c.variant) || {};
  const who = { m: "man", f: "woman" }[v.gender] || "person";
  const age = { child: "a child", young: `a young ${who}`, adult: `an adult ${who}`, old: `an old ${who}` }[v.age] || (who === "person" ? "a person" : `a ${who}`);
  return v.outfit ? `${age} in a ${v.outfit}` : age;
}

// What the rig DRAWS for the body poses whose name misleads a reader (movements.ts), 2026-10-29: the reader was shown
// the raw word "slump", so a fall drawn as a slump (fahrenheit-451 250 "thrown to the earth", island 233) read CORRECT
// on the words. Shown as drawn, a standing lean beside "he fell to the floor" is visibly the wrong body.
const BODY_DRAWN = {
  slump: "standing on their feet, leaning forward, head bowed, arms hanging (a posture, not a fall)",
  falling: "tipped over backwards in mid-air, arms flailing, motion lines (falling)",
  collapsed: "lying flat on the floor, one arm flung out, eyes shut (fallen / knocked out)",
  lying: "lying on a low bed, eyes open",
};
const bodyOf = (a) => BODY_DRAWN[a] || a;

function visible(b, bible, own, mech, causal) {
  const v = {};
  const cast = Array.isArray(b.cast) ? b.cast : [];
  const framed = !(typeof b.shotOverride === "string" && DROPS_CAST.has(b.shotOverride));
  if (cast.length && framed) {
    v.people = cast.map((k, n) => {
      const c = (bible.cast || {})[k] || {};
      // the viewer sees a look, not a name
      const p = { looks: looksOf(c) };
      if (n === 0) { if (b.expression) p.face = b.expression; if (b.action) p.body = bodyOf(b.action); if (b.holds) p.holds = b.holds; }
      // the SECOND person of an authored two-person cast, exactly as plan-antidote draws them (lib/partner-contract.js,
      // 2026-10-22): the lead verb's pair (fighting / grabbing <-> struggling / embrace), else partnerAction, else idle;
      // partnerExpression, else neutral. Shown so the blind reader can read the reaction the author staged.
      if (n === 1) { p.face = b.partnerExpression || "neutral"; p.body = bodyOf(partnerActionFor(b.action, b.partnerAction)); }
      return p;
    });
  }
  // LEAVE / FLEE (Action 2.0, leaveLayout.ts): the person goes away and is gone — say where, as the renderer draws it
  if ((b.action === "leave" || b.action === "flee") && framed && cast.length) v.motion = `the first person ${b.action === "flee" ? "runs away" : "walks out"}${cast.length === 2 ? (b.action === "flee" ? " from the second" : ", past the second,") : ""} ${b.concept ? `through the ${b.concept}` : "off the edge of the picture"} and is gone`;
  // PLACE (Action 3.0): the object goes from the hand to a rest in front of the person and stays there
  if (b.action === "place" && b.holds && framed && cast.length) v.motion = `the first person sets the ${b.holds} down in front of them; their hand comes back empty and the ${b.holds} stays there`;
  // a lift is the one action that MOVES people: say where they go, as the renderer draws it (liftLayout.ts)
  if (b.action === "lift" && cast.length === 2 && framed) v.motion = "the first person picks the second up, carries them to the icon and sets them down in it; they stay there";
  if (b.concept) v.icon = own[b.concept] ? (own[b.concept].reads || own[b.concept].title || b.concept) : (DRAWN[b.concept] || `an icon of ${b.concept}`);
  if (b.set) v.place = b.set;
  if (b.callout && b.callout.text) v.words = b.callout.style === "strike" ? `${b.callout.text} (crossed out)` : b.callout.text;
  // only the labels the renderer draws (lib/diagram-capacity.js) — an undrawn label must not help the reader
  if (b.diagram && b.diagram.type === "scorecard" && b.diagram.scorecard) v.diagram = scorecardSeen(b.diagram.scorecard);
  else if (b.diagram && b.diagram.type === "causal" && b.diagram.causal) v.diagram = require("../src/engines/antidote/causal.ts").causalSeen(b.diagram.causal, (causal && causal[b.i]) || new Set(Object.keys(b.diagram.causal.cues || {})));
  else if (b.diagram && b.diagram.type === "mechanism" && b.diagram.mechanism) v.diagram = require("../src/engines/antidote/mechanism.ts").mechanismSeen(b.diagram.mechanism, (mech && mech[b.i]) || new Set(Object.keys(b.diagram.mechanism.cues || {})));
  else if (b.diagram) v.diagram = `${DIAGRAM[b.diagram.type] || b.diagram.type}: ${drawnLabels(b.diagram.type, b.diagram.labels).join(" / ")}`;
  return v;
}

// MECHANISM (10x P1, mechanism.ts): a cause model builds over continued beats — each beat shows every element its chain
// has reached so far (its own cues + the earlier beats'), exactly as the planner's `done` + `at` draw it.
function mechanismReached(beats) {
  const out = {};
  let acc = new Set();
  for (const b of beats) {
    if (b.diagram && b.diagram.type === "mechanism" && b.diagram.mechanism) {
      if (b.continue !== true) acc = new Set();
      for (const e of Object.keys(b.diagram.mechanism.cues || {})) acc.add(e);
      out[b.i] = new Set(acc);
    } else if (b.continue !== true) acc = new Set();
  }
  return out;
}

// MECHANISM 2.0 (causal.ts): a causal chain builds over continued beats the same way — each beat shows every element its
// chain has reached so far.
function causalReached(beats) {
  const out = {};
  let acc = new Set(), cnt = {};
  for (const b of beats) {
    if (b.diagram && b.diagram.type === "causal" && b.diagram.causal) {
      if (b.continue !== true) { acc = new Set(); cnt = {}; }
      for (const [e, v] of Object.entries(b.diagram.causal.cues || {})) { acc.add(e); cnt[e] = (cnt[e] || 0) + (Array.isArray(v) ? v.length : 1); }
      const set = new Set(acc);
      set.counts = { ...cnt }; // MECHANISM 3.0: how many laps (loop / clap firings) the ledger has written so far
      out[b.i] = set;
    } else if (b.continue !== true) { acc = new Set(); cnt = {}; }
  }
  return out;
}

// CARRIED STATE (10x P1, src/engines/antidote/endState.ts): what an earlier deed left that a `continue` beat still
// shows — the renderer keeps her IN the bathtub, him seated, her down — so the blind text reader is told too.
function carriedStates(beats, bible) {
  const ES = require("../src/engines/antidote/endState.ts");
  const out = {};
  let st = null; // { [castId]: text }
  const look = (id) => looksOf((bible.cast || {})[id] || {});
  for (const b of beats) {
    const cast = Array.isArray(b.cast) ? b.cast : [];
    const acts = cast.map((id, n) => (n === 0 ? b.action : partnerActionFor(b.action, b.partnerAction)));
    const next = {};
    if (b.continue === true && st) {
      cast.forEach((id, n) => { const s = st[id]; if (s && ES.keepsRest(s.posture, acts[n])) next[id] = s; });
      const lines = Object.entries(next).map(([id, s]) => `${look(id)}: ${s.text}`);
      if (lines.length) out[b.i] = `kept from before: ${lines.join("; ")}`;
    }
    const pair = cast.length === 2 && b.action === "lift";
    cast.forEach((id, n) => {
      const es = ES.endStateOf(n === 0 ? b.action : (pair ? "lifted" : null), pair);
      if (!es) return;
      next[id] = { posture: es.posture, text: es.posture === "gone" ? "gone — left the scene (not drawn)" : es.anchor === "inPlace" ? `still sitting IN the ${b.concept || "place"}` : es.anchor === "besidePlace" ? `standing beside the ${b.concept || "place"}` : es.posture === "seated" ? "still seated" : "still down on the ground" };
    });
    st = next;
  }
  return out;
}

function prep() {
  const bible = readJSON(path.join(BOOK, "story-bible.json"), {});
  const ownRaw = readJSON(path.join(BOOK, "motifs.json"), {}) || {};
  const own = ownRaw.motifs || ownRaw;
  let beats = beatsOf();
  const kept = carriedStates(beats, bible); // over ALL beats, before any --beats filter
  const mech = mechanismReached(beats);
  const causal = causalReached(beats);
  const only = args.beats ? new Set(String(args.beats).split(",").map(Number)) : null;
  if (only) beats = beats.filter((b) => only.has(b.i));
  if (OUT === BASE) fs.rmSync(OUT, { recursive: true, force: true }); // full run: start clean (drops old re-checks too)
  else if (fs.existsSync(OUT)) { console.error(`❌ ${OUT} already exists`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const size = parseInt(args.chunk || "140", 10); // each agent costs a fixed ~60k of context — fewer, larger chunks
  const chunks = [];
  for (let s = 0; s < beats.length; s += size) chunks.push(beats.slice(s, s + size));
  chunks.forEach((c, k) => fs.writeFileSync(path.join(OUT, `visible-${k + 1}.json`),
    JSON.stringify(c.map((b, n) => ({ id: `b${String(k * size + n + 1).padStart(3, "0")}`, ...visible(b, bible, own, mech, causal), ...(kept[b.i] ? { state: kept[b.i] } : {}) })), null, 1)));
  // the key maps the neutral ids back to beats — blind agents never open it
  const key = {};
  chunks.forEach((c, k) => c.forEach((b, n) => { key[`b${String(k * size + n + 1).padStart(3, "0")}`] = b.i; }));
  fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify(key));
  const prompts = chunks.map((c, k) => `### Blind reader ${k + 1}
You are a blind rater. Read ONLY ${path.join(OUT, `visible-${k + 1}.json`)} — do not open any other file in the repository.
Each entry describes exactly what a viewer with the SOUND OFF sees on screen during one moment of an animated explainer video: the people (how they look, their face, body pose, what they hold), an icon (as drawn), the place, the words on screen, a diagram. You do not know the book.
For EACH entry write "guess": what is the narrator saying at this moment, one sentence, from these elements only; and "misleading": the element most likely to send a viewer the wrong way, or "none".
Write ONLY a JSON array [{"id":"b001","guess":"...","misleading":"..."}, ...] to ${path.join(OUT, `guess-${k + 1}.json`)}. Validate it parses and has ${c.length} entries. Reply with one line: "written ${c.length}".`).join("\n\n");
  fs.writeFileSync(path.join(OUT, "PROMPTS.md"), `# Readcheck — ${SLUG} (${beats.length} beats, ${chunks.length} blind readers)\n\nLaunch every blind reader in ONE message (parallel, model: sonnet). Readers must be fresh agents that did not author the storyboard. Then:\n\n    node scripts/readcheck.js judge --slug=${SLUG}\n\n${prompts}\n`);
  const rc = OUT === BASE ? "" : ` (re-check ${path.basename(OUT)}; then: judge --slug=${SLUG} --recheck=${path.basename(OUT).slice(8)})`;
  console.log(`✓ ${path.relative(ROOT, OUT)} — ${beats.length} beats, ${chunks.length} blind readers${rc}. Run its PROMPTS.md (sonnet, parallel).`);
  console.log(`  Running the blind readers is a ${require("./lib/next-step").ROUTINE}`);
}

function judge() {
  const key = readJSON(path.join(OUT, "key.json"));
  if (!key) { console.error("❌ run prep first"); process.exit(1); }
  const byI = new Map(beatsOf().map((b) => [b.i, b]));
  const files = fs.readdirSync(OUT).filter((f) => /^visible-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
  const prompts = [];
  for (const f of files) {
    const k = f.match(/\d+/)[0];
    const vis = readJSON(path.join(OUT, f));
    const guess = readJSON(path.join(OUT, `guess-${k}.json`));
    if (!Array.isArray(guess)) { console.error(`❌ guess-${k}.json missing or not an array`); process.exit(1); }
    const g = new Map(guess.map((x) => [x.id, x]));
    const items = vis.map((v) => ({ id: v.id, narration: byI.get(key[v.id]).narration, onScreen: { ...v, id: undefined }, viewerGuess: (g.get(v.id) || {}).guess || "(no guess)" }));
    fs.writeFileSync(path.join(OUT, `judge-${k}.json`), JSON.stringify(items, null, 1));
    prompts.push(`### Judge ${k}
Read ONLY ${path.join(OUT, `judge-${k}.json`)}. Each item has the narration spoken at a moment, what was on screen, and what a blind viewer (sound off) guessed the narrator was saying.
For each item decide "correctness": CORRECT (the guess carries the narration's meaning), NEUTRAL (vague, neither right nor contradicting), WRONG (the viewer would believe something different or opposite); "blame": which on-screen element caused a non-CORRECT reading (icon / people / face / body / words / diagram / place / nothing-fits), and "why" in one sentence.
Judge meaning, not wording. Write ONLY a JSON array [{"id":"b001","correctness":"...","blame":"...","why":"..."}, ...] to ${path.join(OUT, `verdict-${k}.json`)}. Validate it parses and has ${items.length} entries. Reply with one line: "written ${items.length}".`);
  }
  fs.appendFileSync(path.join(OUT, "PROMPTS.md"), `\n## Judges (fresh agents, model: sonnet, parallel). Then: node scripts/readcheck.js tally --slug=${SLUG}\n\n${prompts.join("\n\n")}\n`);
  console.log(`✓ ${files.length} judge inputs. Run the Judges section of PROMPTS.md (sonnet, parallel).`);
  console.log(`  Running the judges is a ${require("./lib/next-step").ROUTINE}`);
}

function tally() {
  const byI = new Map(beatsOf().map((b) => [b.i, b]));
  const T = { CORRECT: 0, NEUTRAL: 0, WRONG: 0 }, blame = {}, bad = [];
  // the full run, then recheck-1, recheck-2, ...: the newest verdict per beat wins
  const sources = [BASE, ...recheckDirs().map((d) => path.join(BASE, d))];
  const latest = new Map();
  for (const dir of sources) {
    const key = readJSON(path.join(dir, "key.json"));
    if (!key) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^verdict-\d+\.json$/.test(x))) {
      for (const v of readJSON(path.join(dir, f), []) || []) {
        if (v && key[v.id] !== undefined) latest.set(key[v.id], { ...v, from: path.basename(dir) });
      }
    }
  }
  for (const [i, v] of latest) {
    T[v.correctness] = (T[v.correctness] || 0) + 1;
    if (v.correctness !== "CORRECT") {
      blame[v.blame] = (blame[v.blame] || 0) + 1;
      const b = byI.get(i) || {};
      bad.push({ i, verdict: v.correctness, blame: v.blame, why: v.why, from: v.from, concept: b.concept || null, callout: b.callout ? b.callout.text : null });
    }
  }
  const n = T.CORRECT + T.NEUTRAL + T.WRONG;
  const iconBlame = {};
  bad.filter((x) => x.blame === "icon" && x.concept).forEach((x) => { iconBlame[x.concept] = (iconBlame[x.concept] || 0) + 1; });
  const total = byI.size;
  // REVIEW_REQUIRED beats from the last merge (lib/authoring-integrity.js) meet their blind reading here: a WRONG is a
  // confirmed authoring defect (fix round), a CORRECT clears the flag, NEUTRAL stays for the reviewer. Not in the tally.
  const mrep = readJSON(path.join(BOOK, "storyboard", "merge-report.json"));
  const flagged = new Map(((mrep && mrep.review) || []).map((x) => [x.i, x.code]));
  const reviewRequired = flagged.size ? { flagged: flagged.size,
    wrong: [...flagged.keys()].filter((i) => (latest.get(i) || {}).correctness === "WRONG").map((i) => ({ i, code: flagged.get(i) })),
    neutral: [...flagged.keys()].filter((i) => (latest.get(i) || {}).correctness === "NEUTRAL").map((i) => ({ i, code: flagged.get(i) })),
    cleared: [...flagged.keys()].filter((i) => (latest.get(i) || {}).correctness === "CORRECT").length,
    unread: [...flagged.keys()].filter((i) => !latest.has(i)) } : null;
  const summary = { date: new Date().toISOString(), n, total, sources: sources.map((d) => path.basename(d)), totals: T, wrongRate: n ? +(T.WRONG / n).toFixed(3) : 0, blame, iconBlame, beats: bad.sort((a, b) => a.i - b.i), ...(reviewRequired ? { reviewRequired } : {}) };
  fs.writeFileSync(path.join(BOOK, "readcheck.json"), JSON.stringify(summary, null, 2) + "\n");
  if (n < total) console.log(`⚠ only ${n}/${total} beats have a verdict — the readcheck is incomplete; run a full prep + readers + judges before trusting this tally`);
  console.log(`${SLUG} readcheck: ${n} beats · CORRECT ${T.CORRECT} · NEUTRAL ${T.NEUTRAL} · WRONG ${T.WRONG} (${Math.round((T.WRONG / (n || 1)) * 100)}%)`);
  console.log(`   blame: ${JSON.stringify(blame)}${Object.keys(iconBlame).length ? `   icons: ${JSON.stringify(iconBlame)}` : ""}`);
  bad.filter((x) => x.verdict === "WRONG").forEach((x) => console.log(`   - ${x.i} WRONG [${x.blame}${x.concept ? `:${x.concept}` : ""}] ${x.why}`));
  if (reviewRequired) console.log(`   REVIEW_REQUIRED (merge-report): ${reviewRequired.flagged} flagged · read WRONG ${reviewRequired.wrong.length}${reviewRequired.wrong.length ? ` (${reviewRequired.wrong.map((x) => `${x.i} ${x.code}`).join(", ")}) → confirmed: fix them in the fix round` : ""} · NEUTRAL ${reviewRequired.neutral.length} · cleared ${reviewRequired.cleared} · unread ${reviewRequired.unread.length}`);
  console.log(`   Fix every WRONG in authored-K.json (cause class, runbook §2b), merge --write, then prep --beats=<changed ids>.`);
  console.log(require("./lib/next-step").nextStepLine(SLUG, "Readcheck tally"));
  console.log(`   An icon blamed on 2+ beats: add or sharpen its row in data/icon-readings.json.`);
}

// OPTIONAL DIAGNOSTIC (2026-10-23, lib/readcheck-misleading.js): the blind readers' own "misleading" notes beside
// the verdicts, in beat order. Not part of tally or readcheck.json; ranks nothing; drives no fix, gate or score —
// measured, they do not predict the real mute verdict. Writes only audit/readcheck-misleading/<slug>/<stamp>.json.
function misleading() {
  const ML = require("./lib/readcheck-misleading");
  const sources = [BASE, ...recheckDirs().map((d) => path.join(BASE, d))];
  const latest = new Map();
  for (const dir of sources) {
    const key = readJSON(path.join(dir, "key.json"));
    if (!key) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /^verdict-\d+\.json$/.test(x)))
      for (const v of readJSON(path.join(dir, f), []) || []) if (v && key[v.id] !== undefined) latest.set(key[v.id], v);
  }
  const r = { slug: SLUG, created: new Date().toISOString(), ...ML.misleadingReport(ML.readHints(sources), latest) };
  const out = path.join(ROOT, "audit", "readcheck-misleading", SLUG);
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${r.created.replace(/[:.]/g, "-").slice(0, 19)}.json`);
  fs.writeFileSync(file, JSON.stringify(r, null, 2) + "\n");
  console.log(`${SLUG} — readers' "misleading" notes (DIAGNOSTIC ONLY: not a verdict, not a risk ranking, drives no fix)`);
  console.log(`   ${r.note}`);
  console.log(`   flagged ${r.flagged}/${latest.size} beats · judged CORRECT ${r.byVerdict.CORRECT} · NEUTRAL ${r.byVerdict.NEUTRAL} · WRONG ${r.byVerdict.WRONG} · false-positive rate ${r.falsePositiveRate}`);
  r.beats.forEach((x) => console.log(`   ${String(x.i).padStart(4)} ${String(x.verdict || "-").padEnd(7)} [${x.element}] ${x.hint}`));
  console.log(`✓ ${path.relative(ROOT, file)}`);
}

({ prep, judge, tally, misleading })[CMD]();
