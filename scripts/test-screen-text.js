#!/usr/bin/env node
/**
 * test-screen-text.js — completion gate for the 2026-09-23 screen-text work
 * (B: labels from clauses or nothing · C: one screen-text validator ·
 *  E: no PASS by deletion/remap). All fixtures are FROZEN copies; nothing here
 * reads live book data, so cleaning a book can never silently break a test.
 *
 *   node scripts/test-screen-text.js
 */
const path = require("path");
const fs = require("fs");
const st = require("./lib/screen-text");
const adapter = require("./lib/director-adapter");
const { deriveComplementaryPunch } = require("./lib/antidote-semantic-director");
const ci = require("./lib/composition-integrity");

const ROOT = path.resolve(__dirname, "..");
// Code only: the literals may (and should) survive in the comments that explain
// why they were removed.
const codeOf = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
const loadJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
let passed = 0, failed = 0;
function assert(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : " — " + detail}`);
  ok ? passed++ : failed++;
}

const rejects = loadJson("fixtures/screen-text/show-your-work-rejects.json");

console.log("\n═══ C: screen-text validator ═══");
{
  const shipped = rejects.flowDiagrams.filter((d) => [
    ...(d.title ? st.checkString(d.title, { kind: "title" }) : []),
    ...d.labels.flatMap((l) => st.checkString(l)), ...st.checkPair(d.labels[0], d.labels[1]),
  ].length > 0).length;
  assert(`every shipped show-your-work flow diagram is rejected (${shipped}/${rejects.flowDiagrams.length})`, shipped === rejects.flowDiagrams.length);

  const labelsOnly = rejects.flowDiagrams.filter((d) => [
    ...d.labels.flatMap((l) => st.checkString(l)), ...st.checkPair(d.labels[0], d.labels[1]),
  ].length > 0).length;
  // Ratchet, not a claim of completeness: 3-word slices ("DAN PROVOS TOM") are
  // indistinguishable from real copy without understanding — the source fix
  // (adapter below) is what removes them. This number may only go up.
  assert(`labels alone (no template title): ≥19/29 sliced pairs rejected (got ${labelsOnly})`, labelsOnly >= 19);

  const constants = ["TRIGGER", "CONSEQUENCE", "WHAT ACTUALLY CHANGES", "NOT WHAT IT SEEMS", "A NEW MENTAL MODEL", "DENIAL", "REALIZATION", "HABIT LOOP", "DEFAULT TRAP", "STEP 01"];
  assert("every removed engine constant is a CONSTANT_TEMPLATE", constants.every((c) => st.checkString(c).some((v) => v.code === "CONSTANT_TEMPLATE")));

  const filler = ["PRODUCT OKAY LETS UNPACK", "TEARING APART ROMANTIC FRANKLY", "GO 10 MINUTES YES", "UM TERRIFYING CONCEPT"];
  assert("spoken filler never passes", filler.every((f) => st.checkString(f).some((v) => v.code === "FILLER_TOKEN")));

  const fragments = ["GOES TEACH DONT", "BOMBSHELL CHANGES ENTIRE GET", "TORMENT SCREAMING INSIDE WHILE", "YEARS DONT SHARE WORK"];
  assert("cut-off fragments never pass", fragments.every((f) => st.checkString(f).length > 0), fragments.filter((f) => !st.checkString(f).length).join(", "));

  const good = [
    ["AMATEUR"], ["EXPERT"], ["SCENIUS"], ["SHARE YOUR PROCESS"], ["THE COST OF WAITING"],
    ["TELL THE STORY", "text"], ["BUILT TO CATCH YOU", "text"], ["NOT A GENIUS", "text"], ["DON'T WAIT", "text"],
    ["STEAL LIKE AN ARTIST", "text"], ["THE WAR WITHIN"], ["FEAR"], ["PARALYSIS"],
    ["LEONTIUS AT THE WALL: THE CIVIL WAR WITHIN", "chapter"], ["THE CITY OF PIGS VS THE FEVERED CITY", "chapter"],
  ];
  const falseRejects = good.filter(([s, kind]) => st.checkString(s, { kind: kind || "label" }).length);
  assert("real copy is accepted (no false rejects)", falseRejects.length === 0, falseRejects.map(([s, k]) => `${s}: ${st.checkString(s, { kind: k || "label" }).map((v) => v.code)}`).join("; "));

  assert("grounding: an unsaid slogan is UNGROUNDED", st.checkString("AUTOMATIC PILOT", { kind: "text", narration: "I think we should share more." }).some((v) => v.code === "UNGROUNDED"));
  assert("grounding: authored metaphor is exempt", st.checkString("THE RIVER STONE", { kind: "text", narration: "its hardness, its greenness", authored: true }).length === 0);
  assert("pair: identical sides are rejected", st.checkPair("NOT WHAT IT SEEMS", "NOT WHAT IT SEEMS").length === 1);
  assert("pair: overlapping sides are rejected", st.checkPair("CREW SAFE", "CREW SAFE LOWEN HERSELF").length === 1);

  const cfg = { meta: { title: "Test" }, captions: [], scenes: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, _narration: "the lone genius myth", texts: [{ text: "LONE GENIUS" }] })) };
  assert("BOOK_REPETITION: the same string on >3 scenes is a template in disguise", st.validateConfig(cfg).violations.some((v) => v.code === "BOOK_REPETITION"));
}

console.log("\n═══ B: labels come from stated clauses, or nothing ═══");
{
  const cases = [
    ["contrast", "Share your process, not your product.", ["SHARE YOUR PROCESS", "PRODUCT"]],
    ["contrast", "Be an amateur rather than an expert.", ["AMATEUR", "EXPERT"]],
    ["cause_effect", "Fear becomes paralysis.", ["FEAR", "PARALYSIS"]],
    ["allegory_equivalence", "Scenius versus genius.", ["SCENIUS", "GENIUS"]],
    ["contrast", "We are tearing apart the romantic and frankly toxic myth of the lone genius. Okay, lets unpack this.", null],
    ["cause_effect", "Roskolikov did not murder that old woman because he was hungry.", null],
    ["character_psychology", "I do not know what this is, but honestly it just feels so wrong to me right now.", null],
  ];
  for (const [arch, text, want] of cases) {
    const p = adapter.semanticPayload({ text }, arch);
    const got = p ? Object.entries(p).filter(([k]) => k !== "kind").map(([, v]) => v) : null;
    assert(`${arch}: "${text.slice(0, 48)}…" → ${want ? want.join(" | ") : "null"}`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  }
  const noFloor = adapter.buildDirectorOverrides({
    intent: { archetype: "cause_effect", requiredActions: [] },
    atom: { text: "We are tearing apart the romantic myth. Okay, lets unpack this." },
    direction: { shot: "medium", cast: { count: 1 }, props: [] },
  });
  assert("no readable pair ⇒ no floor (no invented TRIGGER → CONSEQUENCE)", noFloor.override === null && noFloor.reason === "no_payload_no_floor", noFloor.reason);
  const floor = adapter.buildDirectorOverrides({
    intent: { archetype: "cause_effect", requiredActions: [] },
    atom: { text: "Fear becomes paralysis." },
    direction: { shot: "medium", cast: { count: 1 }, props: [] },
  });
  assert("readable pair ⇒ flow floor with THOSE labels and no constant title",
    floor.override && JSON.stringify(floor.override.diagram.labels) === '["FEAR","PARALYSIS"]' && floor.override.diagram.title === null,
    JSON.stringify(floor.override && floor.override.diagram));
  const src = codeOf("scripts/lib/director-adapter.js");
  assert("adapter source has no wordSlices / constant floor labels", !/function wordSlices|"TRIGGER"|"DENIAL"/.test(src));
}

console.log("\n═══ B: canned punches are gone ═══");
{
  const narr = ["you scroll the phone app", "a small daily habit routine compounds", "not what you expected at all", "the key truth and the real secret", "a completely neutral sentence"];
  const calls = ["SCROLL", "HABIT", "NOTHING", "THE SAME WORDS AS THE VO", "PRODUCT OKAY LETS UNPACK", "repeat repeat repeat"];
  const bad = [];
  for (const n of narr) for (const c of calls) {
    const out = deriveComplementaryPunch(n, c);
    if (out && st.checkString(out, { kind: "text" }).some((v) => ["CONSTANT_TEMPLATE", "FILLER_TOKEN", "FRAGMENT"].includes(v.code))) bad.push(`${c} → ${out}`);
  }
  assert("deriveComplementaryPunch never emits a template/filler/fragment", bad.length === 0, bad.slice(0, 3).join(" | "));
  assert("unreadable callout ⇒ null (silent frame)", deriveComplementaryPunch("x", "PRODUCT OKAY LETS UNPACK") === null);
  for (const [file, lit] of [
    ["scripts/lib/antidote-novelty-budget.js", '"HABIT LOOP"'],
    ["scripts/lib/antidote-stagnation-engine.js", '"DEFAULT TRAP"'],
    ["scripts/lib/antidote-chapter-arcs.js", '"A NEW MENTAL MODEL"'],
    ["scripts/repair-coherence.js", '["TRIGGER", "CONSEQUENCE"]'],
    ["scripts/lib/antidote-semantic-director.js", '"WHAT ACTUALLY CHANGES"'],
  ]) assert(`${path.basename(file)} no longer stamps ${lit}`, !codeOf(file).includes(lit));
}

console.log("\n═══ E: no PASS by deletion or remap ═══");
{
  const cfg = loadJson("fixtures/bible-integrity/verity-contaminated/config.antidote.json");
  const man = ci.snapshot(cfg);
  assert("untouched config PASSES against its own manifest", ci.compare(cfg, man).status === "PASS");
  const stripped = JSON.parse(JSON.stringify(cfg));
  for (const s of stripped.scenes) s.props = [];
  assert("deleting all props FAILS (COMPOSITION_REMOVED)", ci.compare(stripped, man).violations.some((v) => v.code === "COMPOSITION_REMOVED"));
  const remapped = JSON.parse(JSON.stringify(cfg));
  for (const s of remapped.scenes) for (const p of s.props || []) p.type = "star";
  assert("bulk motif remap FAILS (COMPOSITION_REMAPPED)", ci.compare(remapped, man).violations.some((v) => v.code === "COMPOSITION_REMAPPED"));
  const emptied = JSON.parse(JSON.stringify(cfg));
  for (const s of emptied.scenes) { s.props = []; s.texts = []; s.characters = []; delete s.diagram; delete s.concept; }
  assert("emptying scenes FAILS", ci.compare(emptied, man).status === "FAIL");
  const one = JSON.parse(JSON.stringify(cfg));
  const target = one.scenes.find((s) => (s.props || []).length);
  target.props = [];
  assert("one deliberate art-direction edit still PASSES (not a quota)", ci.compare(one, man).status === "PASS");
  assert("missing manifest is reported, not silently green", ci.compare(cfg, null).status === "WARN");

  const fw = fs.readFileSync(path.join(ROOT, "scripts/lib/narrative-visual-firewall.js"), "utf8");
  assert("firewall no longer requires a prop in BOTH allowedMotifs and allowedProps", !/!allowedMotifs\.has\(prop\.type\) \|\| !allowedProps\.has\(prop\.type\)/.test(fw));
}

console.log("\n═══ Phase 2: engines only pick motifs the firewall accepts ═══");
{
  const { isFirewallSafeMotif } = require("./lib/bible-integrity");
  assert("unsaid non-shared motif is unsafe (summit on a beat about sharing)", !isFirewallSafeMotif("summit", "share your work every day", "modern"));
  assert("a non-shared motif the beat names is safe (ladder)", isFirewallSafeMotif("ladder", "climb the ladder one rung at a time", "modern"));
  assert("shared-generic motif is safe anywhere (lightbulb)", isFirewallSafeMotif("lightbulb", "anything", "modern"));
  assert("registry-owned motif is unsafe outside its world (ringOfGyges)", !isFirewallSafeMotif("ringOfGyges", "the ring of gyges", "modern"));
  assert("registry-owned motif is safe inside its world", isFirewallSafeMotif("ringOfGyges", "x", "plato-republic"));

  const vi = require("./lib/visual-intent");
  const cfg = loadJson("fixtures/bible-integrity/verity-contaminated/config.antidote.json");
  cfg.meta = { ...(cfg.meta || {}), slug: "__no_such_book__" }; // unknown world => neutral
  const REP = /ringOfGyges|civicPolis|socraticInquiry|caveAllegory|kallipolis/;
  for (const sc of cfg.scenes) sc.props = (sc.props || []).filter((p) => !REP.test(p.type));
  vi.enforceSemanticRelevance(cfg);
  const subjects = new Set(cfg.scenes.map((x) => x.visualProposition && x.visualProposition.subject));
  const republicProps = cfg.scenes.flatMap((x) => (x.props || []).map((p) => p.type)).filter((t) => REP.test(t));
  assert("neutral mode writes no Republic subject", ![...subjects].some((x) => /socratic|gyges|polis|cave|kallipolis/i.test(String(x))), [...subjects].slice(0, 5).join(","));
  assert("neutral mode injects no Republic prop", republicProps.length === 0, republicProps.slice(0, 3).join(","));
  assert("usesPropositionWorlds is true only for the owner world", vi.usesPropositionWorlds({ meta: {} }, { worldId: "plato-republic" }) && !vi.usesPropositionWorlds({ meta: {} }, { worldId: "modern" }));

  const diagramScene = { diagram: { type: "spectrum", labels: ["GENIUS", "SCENIUS"] }, characters: [], props: [], shot: "insert" };
  const talkingHead = { characters: [{ role: "narrator" }], props: [], shot: "medium", texts: [] };
  const vd = vi.calculateVIG(diagramScene, { claimType: "assertion" });
  const vt = vi.calculateVIG(talkingHead, { claimType: "assertion" });
  assert(`a diagram scores above a bare talking head (VIG ${vd.vigScore} > ${vt.vigScore})`, vd.vigScore > vt.vigScore);
  const withArt = vi.calculateVIG({ ...talkingHead, texts: [{ text: "SHOW YOUR WORK", src: "art" }] }, { claimType: "assertion" });
  assert(`an authored on-screen claim raises VIG (${withArt.vigScore} > ${vt.vigScore})`, withArt.vigScore > vt.vigScore);
}

console.log("\n═══ Phase 3: authored `concept: null` means no icon; no auto-opposite ═══");
{
  const { createDirector } = require("./lib/antidote-director");
  const PAL = { paper: "#FAF9F5", ink: "#18181B", red: "#E11D48", gold: "#F59E0B" };
  const mk = () => createDirector({ palette: PAL, genre: "creativity", slug: "__test__", bible: null });
  const base = { index: 5, isTitle: false, calloutAt: null, total: 20, durationFrames: 360 };
  // Lexicon bait: "calls" -> phone, "light bulb" -> lightbulb.
  const text = "Eno calls it scenius, and a literal light bulb switches on above their head.";
  const off = mk().direct({ ...base, text, concept: null });
  assert("concept:null -> no illustration concept", off.concept == null, String(off.concept));
  assert("concept:null -> no props (no lexicon, no decorative/late motif)", (off.props || []).length === 0, JSON.stringify((off.props || []).map((p) => p.type)));
  const unset = mk().direct({ ...base, text, concept: undefined });
  // Faz 0 (2026-09-24) changed the contract: omit = no icon too. The old
  // assertion here ("omit = lexicon may choose") is exactly the phone-for-"text" path.
  assert("concept unset -> no lexicon icon either (Faz 0: omit = no icon)", unset.concept == null && (unset.props || []).length === 0, `${unset.concept} ${JSON.stringify((unset.props || []).map((p) => p.type))}`);
  const contrast = "It is not the notes that matter but the fire you bring to them instead.";
  const authored = mk().direct({ ...base, text: contrast, concept: "notes" });
  assert("authored concept never auto-expands to a before/after opposite", authored.shot !== "beforeAfter" && !(authored.props || []).some((p) => p.type === "fire"), `${authored.shot} ${JSON.stringify((authored.props || []).map((p) => p.type))}`);
}

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed) process.exit(1);
