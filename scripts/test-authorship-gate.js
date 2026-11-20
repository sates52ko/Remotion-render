#!/usr/bin/env node
/**
 * test-authorship-gate.js — Faz 0 fail-closed tests.
 *
 * Every case that let We Were Liars reach Studio unauthored must FAIL here:
 * unstamped config, unauthored beat, engine-invented prop / diagram, template
 * intent, one intent on >10% of beats, another book's vocabulary, laundered
 * brief provenance, the director's lexical fallback — and, since P9-A.1, an
 * authored icon the engine dropped (PROPOSITION_DROPPED = HARD) while a
 * detector-only unstaged relation stays a report (UNSTAGED = REPORT).
 *
 *   node scripts/test-authorship-gate.js
 */
const fs = require("fs");
const { evaluateAuthorship, isAuthoredBrief } = require("./lib/authorship");

let passed = 0, failed = 0;
function assert(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`); }
}
const codes = (res) => new Set(res.violations.map((v) => v.code));

// A clean, authored 12-beat film: distinct intents, props only from the author.
function cleanConfig() {
  const scenes = [{ id: "intro", shot: "lowAngle", props: [], _narration: "Welcome." }];
  for (let i = 1; i <= 12; i++) {
    scenes.push({
      id: `scene-${String(i).padStart(2, "0")}`,
      shot: i % 3 ? "medium" : "illustration",
      _narration: `Beat ${i}: Cadence walks the Beechwood shore and remembers summer fifteen.`,
      props: i % 3 ? [] : [{ type: "fire" }],
      _authorship: { src: i % 2 ? "art" : "brief", propTypes: i % 3 ? [] : ["fire"], diagramAuthored: false, intent: `Show beat ${i} as its own image` },
      visualProposition: { thesis: `Beat ${i}`, visualQuestion: "q", visualAnswer: "a" },
    });
  }
  return { scenes };
}
const ctx = { engine: "antidote", slug: "__test-book__", worldId: "e-lockhart-we-were-liars" };

console.log("═══ Faz 0: the gate passes an authored film ═══");
{
  const res = evaluateAuthorship(cleanConfig(), ctx);
  assert("clean authored config -> PASS", res.status === "PASS", JSON.stringify(res.violations.slice(0, 3)));
}

console.log("\n═══ Faz 0: fail-closed cases ═══");
{
  const c = cleanConfig();
  for (const s of c.scenes) delete s._authorship;
  const res = evaluateAuthorship(c, ctx);
  assert("config planned before the gate (no stamps) -> FAIL UNSTAMPED_CONFIG", res.status === "FAIL" && codes(res).has("UNSTAMPED_CONFIG"));
}
{
  const c = cleanConfig();
  c.scenes[4]._authorship.src = "none";
  const res = evaluateAuthorship(c, ctx);
  assert("one unauthored beat -> FAIL UNAUTHORED_BEAT", res.status === "FAIL" && codes(res).has("UNAUTHORED_BEAT") && res.counts.unauthored === 1);
}
{
  const c = cleanConfig();
  c.scenes[2].props = [{ type: "phone" }]; // a later engine decorated it
  const res = evaluateAuthorship(c, ctx);
  assert("prop the author never chose (the phone) -> FAIL ENGINE_INVENTED_PROP", res.status === "FAIL" && codes(res).has("ENGINE_INVENTED_PROP"));
}
{
  const c = cleanConfig();
  c.scenes[3].props = [{ type: "fire" }, { type: "lightbulb" }]; // authored fire + chapter-payoff bulb
  const res = evaluateAuthorship(c, ctx);
  const hit = res.violations.find((v) => v.code === "ENGINE_INVENTED_PROP");
  assert("authored prop kept, added payoff lightbulb caught", !!hit && hit.prop === "lightbulb");
}
{
  const c = cleanConfig();
  c.scenes[5].diagram = { title: "THE LOOP", nodes: ["a", "b"] };
  const res = evaluateAuthorship(c, ctx);
  assert("engine-detected diagram -> FAIL ENGINE_INVENTED_DIAGRAM", codes(res).has("ENGINE_INVENTED_DIAGRAM"));
  c.scenes[5].diagram.authored = true;
  assert("authored diagram -> no diagram violation", !codes(evaluateAuthorship(c, ctx)).has("ENGINE_INVENTED_DIAGRAM"));
}
{
  const c = cleanConfig();
  c.scenes[6]._authorship.intent = "Dramatize the thematic conflict of argument";
  const res = evaluateAuthorship(c, ctx);
  assert("heuristic template intent -> FAIL TEMPLATE_INTENT", codes(res).has("TEMPLATE_INTENT"));
}
{
  const c = cleanConfig();
  for (const i of [1, 2]) c.scenes[i]._authorship.intent = "Show the family's denial";
  const res = evaluateAuthorship(c, ctx);
  assert("one intent on 2/12 beats (16.7% > 10%) -> FAIL REPEATED_INTENT", codes(res).has("REPEATED_INTENT"));
}
{
  const c = cleanConfig();
  c.scenes[7].visualProposition.thesis = "Philosophical inquiry into virtue and justice";
  c.scenes[8].director = { visualSubject: "Socrates" };
  const res = evaluateAuthorship(c, ctx);
  const leaks = res.violations.filter((v) => v.code === "FOREIGN_WORLD_LEAK");
  assert("The Republic's defaults in another book -> FAIL FOREIGN_WORLD_LEAK (2 scenes)", leaks.length === 2, JSON.stringify(leaks));
}
{
  const c = cleanConfig();
  c.scenes[7].narrativeAtom = { forbiddenMotifs: ["caveAllegory", "kallipolis"] };
  c.scenes[7].visualContract = { mustNotShow: ["socrates"] };
  assert("a forbid list naming another world's motifs is not a leak", !codes(evaluateAuthorship(c, ctx)).has("FOREIGN_WORLD_LEAK"));
}
{
  const c = cleanConfig();
  c.scenes[7]._narration = "Socrates would have hated the Sinclairs.";
  c.scenes[7].director = { visualSubject: "Socrates" };
  assert("a term the narration itself says is not a leak", !codes(evaluateAuthorship(c, ctx)).has("FOREIGN_WORLD_LEAK"));
  c.scenes[8].director = { visualSubject: "Socrates" };
  assert("...but The Republic may use its own vocabulary", !codes(evaluateAuthorship(c, { ...ctx, slug: "the-republic", worldId: "plato-the-republic" })).has("FOREIGN_WORLD_LEAK"));
}
{
  // Vox shape: beats + props.text + images
  const cfg = { beats: [
    { id: "beat-000", type: "title", props: { text: "We Were Liars" } },
    { id: "beat-001", type: "imagefocus", props: { text: "huddled in the dark" }, images: [{ prompt: "cave, -375" }], _authorship: { src: "none", propTypes: [], intent: null } },
  ] };
  const res = evaluateAuthorship(cfg, { engine: "vox", slug: "dust" });
  assert("Vox: unauthored image beat -> FAIL UNAUTHORED_BEAT", res.status === "FAIL" && codes(res).has("UNAUTHORED_BEAT"));
  cfg.beats[1]._authorship.src = "design";
  assert("Vox: designed beat -> PASS", evaluateAuthorship(cfg, { engine: "vox", slug: "dust" }).status === "PASS");
}

console.log("\n═══ Faz 0: brief provenance cannot be laundered ═══");
{
  assert("heuristic brief is not authored", !isAuthoredBrief({ fp: "a", src: "heuristic" }, { authored: true }));
  assert("claude brief is authored", isAuthoredBrief({ fp: "a", src: "claude" }, { authored: false }));
  assert("legacy authored file (no src) is trusted", isAuthoredBrief({ fp: "a" }, { authored: true }));
  assert("unauthored file (no src) is not", !isAuthoredBrief({ fp: "a" }, { authored: false }));
}

console.log("\n═══ Faz 0: the director has no lexical fallback ═══");
{
  const { createDirector } = require("./lib/antidote-director");
  const PAL = { paper: "#FAF9F5", ink: "#18181B", red: "#E11D48", gold: "#F59E0B" };
  const mk = () => createDirector({ palette: PAL, genre: "young adult", slug: "__test__", bible: null });
  const base = { isTitle: false, total: 40, durationFrames: 360 };
  // The exact 0:55 sentence from We Were Liars.
  const said = "Yeah, we are discarding that framing entirely. Instead, we are treating this text as what it actually is, which is a brutal, unflinching autopsy of American aristocracy.";
  let phones = 0, anyProp = 0;
  const d = mk();
  for (let i = 1; i <= 30; i++) {
    const r = d.direct({ ...base, index: i, text: said, calloutAt: i % 2 ? null : 40, concept: undefined });
    if ((r.props || []).some((p) => p.type === "phone") || r.concept === "phone") phones++;
    if ((r.props || []).length) anyProp++;
  }
  assert("30 unauthored beats of the 0:55 sentence -> 0 phones", phones === 0, `${phones}`);
  assert("30 unauthored beats -> 0 engine-chosen props of any kind", anyProp === 0, `${anyProp}`);
  const money = mk().direct({ ...base, index: 3, text: "Dynastic wealth, money and dollars everywhere.", calloutAt: null, concept: undefined });
  assert("money words no longer summon the coin menu", (money.props || []).length === 0, JSON.stringify((money.props || []).map((p) => p.type)));
  const authored = mk().direct({ ...base, index: 3, text: said, calloutAt: null, concept: "fire" });
  assert("an authored concept still reaches the screen", authored.concept === "fire" || (authored.props || []).some((p) => p.type === "fire"), `${authored.concept}`);
  const pref = mk().direct({ ...base, index: 3, text: said, calloutAt: null, concept: undefined,
    brief: { antidote: { motifPreference: ["mask"] } } });
  assert("an authored motifPreference still reaches the screen", (pref.props || []).some((p) => p.type === "mask"), JSON.stringify((pref.props || []).map((p) => p.type)));
}

console.log("\n═══ Faz 0: chapter arcs never override an authored beat ═══");
{
  const { planChapterArcs } = require("./lib/antidote-chapter-arcs");
  const mk = () => Array.from({ length: 10 }, (_, i) => ({
    id: `scene-${i}`, fromFrame: i * 270, durationFrames: 270, shot: "medium", props: [],
    texts: [{ text: "X", src: "art" }], _authorship: { src: "art", propTypes: [] },
  }));
  const inv = planChapterArcs(mk(), [], 30).scenes;
  assert("no authored chapters -> no invented 'PART 02' chapter card", !inv.some((s) => s.shot === "chapterCard"), inv.map((s) => s.shot).join(","));
  assert("authored beats keep their framing (no forced split on the turn beat)", inv.every((s) => s.shot === "medium"), inv.map((s) => s.shot).join(","));
  const far = planChapterArcs(mk(), [{ t: 0, label: "Intro" }, { t: 900, label: "Later" }], 30).scenes;
  assert("a chapter starting after the film ends does not snap onto the last scene", far[9].shot !== "chapterCard");
  // 2026-10-20: a card REPLACES its scene, so it is never stamped over an authored beat (burn 217/236; the-courage-
  // to-be-disliked 19/19). On an authored boundary the card is skipped and reported; an unauthored one keeps it.
  const realRes = planChapterArcs(mk(), [{ t: 0, label: "Intro" }, { t: 45, label: "The Sinclairs" }], 30);
  assert("an authored in-range chapter on an AUTHORED beat gets no card (reported)", !realRes.scenes.some((s) => s.shot === "chapterCard" || s.chapterCard) && (realRes.skippedCards || []).some((x) => x.reason === "authored beat"), JSON.stringify(realRes.skippedCards));
  const plainScenes = mk().map((s) => ({ ...s, _authorship: { src: "none", propTypes: [] } }));
  const real = planChapterArcs(plainScenes, [{ t: 0, label: "Intro" }, { t: 45, label: "The Sinclairs" }], 30).scenes;
  assert("an authored in-range chapter on an unauthored beat still gets its card", real.some((s) => s.shot === "chapterCard" && s.chapterCard.title === "THE SINCLAIRS"));
}

console.log("\n═══ P0.2: an authored icon is never restaged, and never lost ═══");
{
  const { applyContractRepair, filterMotifsByContract } = require("./lib/visual-contract");
  const { restoreAuthoredStaging, stagingDrift } = require("./lib/authorship");
  // The author put a coin on this beat; the (authored) brief forbids coins.
  const forbiddenBrief = { mustNotShow: ["coin"], antidote: { concept: "mask" } };
  const authoredBeat = () => ({
    id: "scene-07", shot: "medium", bg: { set: "room" }, characters: [],
    concept: "coin", props: [{ type: "coin", scale: 1, enter: "pop" }],
    _authorship: { src: "art", propTypes: ["coin"], intent: "show the money she hides" },
  });
  const r1 = applyContractRepair(authoredBeat(), forbiddenBrief);
  assert("(a) authored forbidden icon -> UNRESOLVED, never substituted",
    r1.problems.length === 1 && r1.problems[0].rule === "UNRESOLVED" && r1.problems[0].sceneId === "scene-07",
    JSON.stringify(r1.problems));
  assert("(a) the authored icon is left on the beat (no spotlight / concept swap)",
    (r1.scene.props || []).map((p) => p.type).join(",") === "coin" && r1.scene.concept === "coin",
    JSON.stringify(r1.scene.props));
  const heuristic = { id: "scene-08", shot: "medium", bg: { set: "room" }, characters: [], props: [{ type: "coin" }], _authorship: { src: "none", propTypes: [] } };
  const r2 = applyContractRepair(heuristic, forbiddenBrief);
  assert("(a) heuristic beat drops the forbidden motif and reports nothing",
    r2.problems.length === 0 && (r2.scene.props || []).length === 0, JSON.stringify(r2.scene.props));
  assert("(a) a filter may not invent a subject when the author's whole menu is forbidden",
    filterMotifsByContract(["coin"], forbiddenBrief).length === 0, JSON.stringify(filterMotifsByContract(["coin"], forbiddenBrief)));

  // (b) an engine changed the icon AFTER planning
  const locked = authoredBeat();
  locked._authorship.lock = { concept: "coin", props: [{ type: "coin", scale: 1, enter: "pop" }], propTypes: ["coin"], shot: "medium", set: "room", cast: [], expression: null, action: null, holds: null };
  const swapped = JSON.parse(JSON.stringify(locked));
  swapped.concept = "spotlight";
  swapped.props = [{ type: "spotlight" }];
  const drift = stagingDrift(swapped);
  assert("(b) icon changed after planning -> drift is reported", drift.some((d) => d.startsWith("icon ")), JSON.stringify(drift));
  const res = evaluateAuthorship({ scenes: [swapped] }, { engine: "antidote", slug: "__test-book__" });
  assert("(b) ... and the gate FAILs STAGING_OVERRIDDEN", res.status === "FAIL" && codes(res).has("STAGING_OVERRIDDEN"), JSON.stringify(res.violations.map((v) => v.code)));

  // (c) restore puts the authored icon back
  restoreAuthoredStaging({ scenes: [swapped] });
  assert("(c) restore returns the authored icon and props",
    swapped.concept === "coin" && (swapped.props || []).map((p) => p.type).join(",") === "coin" && stagingDrift(swapped).length === 0,
    JSON.stringify({ concept: swapped.concept, props: swapped.props }));
  // a pre-P0.2 lock (no icon keys) keeps behaving exactly as before
  const legacy = authoredBeat();
  legacy._authorship.lock = { shot: "medium", set: "room", cast: [], expression: null, action: null, holds: null };
  legacy.props = [{ type: "mask" }];
  legacy.concept = "mask";
  assert("(c) a lock written before P0.2 has no icon keys -> no icon drift", !stagingDrift(legacy).some((d) => d.startsWith("icon")), JSON.stringify(stagingDrift(legacy)));
}

console.log("\n═══ P9-A.1: authored icon lost to the vocab gate is a HARD failure ═══");
{
  // The measured lolita shape: author wrote concept "crash" (drawable lexicon
  // icon, not in the book's allowedMotifs) — the director refused it in
  // silence and the gate PASSed. The stamp now seals the authored concept so
  // the loss is provable from the config alone.
  const c = cleanConfig();
  const victim = c.scenes[1]; // i=1: a medium scene with props: [] — nothing on screen
  victim._authorship.conceptAuthored = "crash"; // authored, refused by world vocab
  // the scene carries no icon: no concept, no prop, no held object
  const res = evaluateAuthorship(c, ctx);
  const drop = res.violations.find((v) => v.code === "PROPOSITION_DROPPED");
  assert("authored concept + no icon on scene -> PROPOSITION_DROPPED", !!drop, JSON.stringify(res.violations.filter((v) => v.code === "PROPOSITION_DROPPED")));
  assert("PROPOSITION_DROPPED names the lost concept", !!drop && drop.concept === "crash");
  assert("P9-A.1: the lost authored icon is HARD -> status FAIL", res.status === "FAIL", res.status);
  // ...but only when the authored icon is truly gone: a scene concept satisfies it
  const c1 = cleanConfig();
  c1.scenes[1]._authorship.conceptAuthored = "crash";
  c1.scenes[1].concept = "crash";
  assert("the icon on the scene satisfies the authored concept -> PASS", evaluateAuthorship(c1, ctx).status === "PASS");
  // a hand prop that IS the authored object (held coin) counts as the icon
  const c2 = cleanConfig();
  c2.scenes[3]._authorship.conceptAuthored = "coin";
  c2.scenes[3].characters = [{ identity: "x", holds: "coin", action: "idle" }];
  assert("authored concept satisfied by a held hand-prop -> no finding", !evaluateAuthorship(c2, ctx).violations.some((v) => v.code === "PROPOSITION_DROPPED"));
  // an icon prop or scene concept satisfies it too
  const c3 = cleanConfig();
  c3.scenes[3]._authorship.conceptAuthored = "fire";
  c3.scenes[3].props = [{ type: "fire" }];
  assert("authored concept with its icon prop -> no finding", !evaluateAuthorship(c3, ctx).violations.some((v) => v.code === "PROPOSITION_DROPPED"));
  // no authored concept -> nothing to lose
  assert("no conceptAuthored -> no finding", !evaluateAuthorship(cleanConfig(), ctx).violations.some((v) => v.code === "PROPOSITION_DROPPED"));
  // the operator's second fixture: a relation only the DETECTOR claims, with
  // one pole staged, must never fail the build. The gate judges author-given
  // meaning only; P9-B will emit PROPOSITION_UNSTAGED for this shape and that
  // class stays report-only by policy until its precision is proven.
  const c4 = cleanConfig();
  c4.scenes[2].narrativeRelation = { kind: "contrast" }; // detector-only, nothing authored
  assert("(b) detector-only relation unstaged -> PASS (the gate judges authored meaning only)", evaluateAuthorship(c4, ctx).status === "PASS");
  assert("(b) the UNSTAGED class P9-B will emit stays report-only by policy", require("./lib/proposition-loss").severityFor("PROPOSITION_UNSTAGED") === "REPORT");

  // director-level wiring: the refusal is reported, not swallowed. Uses the
  // REAL lolita story-bible (read-only) — the exact book where the measured
  // bug lived. P9-A A3 fix: the director's world gate now reads the SAME
  // vocabulary the authoring sheet offers (provenance + shared-generic pool),
  // so "crash" and "coin" — offered, authored, then silently refused — now
  // stage; a genuinely vocab-foreign concept ("subway" is not in lolita's
  // world) is still refused, but now REPORTED via onConceptRefused.
  const { createDirector } = require("./lib/antidote-director");
  const PAL = { paper: "#FAF9F5", ink: "#18181B", red: "#E11D48", gold: "#F59E0B" };
  const d = createDirector({ palette: PAL, genre: "drama", slug: "lolita", bible: null });
  const base = { index: 9, isTitle: false, calloutAt: null, total: 20, durationFrames: 360 };
  const refusals = [];
  const ok0 = d.direct({ ...base, text: "She was violently struck and killed by a car.", concept: "crash", onConceptRefused: (r) => refusals.push(r) });
  assert("A3: lolita crash (offered by prep, formerly refused) now stages", ok0.concept === "crash" && refusals.length === 0, `${ok0.concept} ${JSON.stringify(refusals)}`);
  const ok1 = d.direct({ ...base, text: "He buys her silence with loose change from his pocket.", concept: "coin", onConceptRefused: (r) => refusals.push(r) });
  assert("A3: lolita coin (offered by prep, formerly refused) now stages", ok1.concept === "coin" && refusals.length === 0, `${ok1.concept} ${JSON.stringify(refusals)}`);
  const out = d.direct({ ...base, text: "The train arrived and she was gone.", concept: "subway", onConceptRefused: (r) => refusals.push(r) });
  assert("director refuses a genuinely vocab-foreign concept (lolita/subway)", out.concept == null, String(out.concept));
  assert("director reports the refusal via onConceptRefused (no more silence)", refusals.length === 1 && refusals[0].concept === "subway" && refusals[0].reason === "world_vocab", JSON.stringify(refusals));
  const ok2 = d.direct({ ...base, text: "Their marriage looked perfect from the street.", concept: "car", onConceptRefused: (r) => refusals.push(r) });
  assert("allowed authored concept still stages + no callback", ok2.concept === "car" && refusals.length === 1, `${ok2.concept} ${JSON.stringify(refusals)}`);

  // the proposition-loss taxonomy: closed, severity from one GATE_POLICY,
  // P9-B flips UNSTAGED with one line (DROPPED is HARD since P9-A.1)
  const pl = require("./lib/proposition-loss");
  let threw = false;
  try { pl.makePropositionLossEvent("NOT_A_CODE", {}); } catch { threw = true; }
  assert("taxonomy is closed (unknown code throws)", threw);
  const ev = pl.makePropositionLossEvent("CONCEPT_REFUSED", { sceneId: "scene-107", engine: "antidote", data: { concept: "crash" } });
  assert("CONCEPT_REFUSED is a DROPPED-class event, severity HARD since P9-A.1", ev.class === "DROPPED" && ev.severity === "HARD");
  assert("GATE_POLICY contract (operator): DROPPED HARD, UNSTAGED REPORT", pl.GATE_POLICY.DROPPED === "HARD" && pl.GATE_POLICY.UNSTAGED === "REPORT");
  const before = pl.GATE_POLICY.UNSTAGED;
  pl.GATE_POLICY.UNSTAGED = "HARD";
  assert("P9-B flip is one line: UNSTAGED -> HARD severity", pl.severityFor("PROPOSITION_UNSTAGED") === "HARD");
  pl.GATE_POLICY.UNSTAGED = before;
  const tmp = fs.mkdtempSync(require("path").join(require("os").tmpdir(), "p9a-pl-"));
  const doc = pl.recordPropositionLoss(tmp, "__test__", [ev, ev]);
  assert("recordPropositionLoss writes counts + merged events", doc.total === 2 && doc.counts.CONCEPT_REFUSED === 2);
  assert("summary line carries the counts", pl.propositionLossSummary(doc).includes("CONCEPT_REFUSED:2"));
}

// ── P9-A.1b: one publish register (lib/frozen.js) ──────────────────────────
// The register is the 📊 Summary Table in PUBLISHED_BOOKS.md. Prose backticks
// (detailed records, motif names, file paths) never freeze a book — the loose
// whole-document match used to freeze into-the-wild off its detailed record
// while the thumbnail side (which always parsed the table) ran it unfrozen.
{
  const osMod = require("os"), pathMod = require("path");
  const tmp = fs.mkdtempSync(pathMod.join(osMod.tmpdir(), "frozen-reg-"));
  fs.writeFileSync(pathMod.join(tmp, "PUBLISHED_BOOKS.md"), [
    "# 📚 Published Books History Log",
    "",
    "| 1 | `fake-published` | **Fake Book** — A. Author | 2026-01-01 | 1:00 | *T* | `HOOK` |",
    "",
    "### 2. Prose Only — B. Author",
    "- **Slug:** `prose-only-slug`",
    "- Custom motifs: `somerandommotif` · full pack in `books/other-book/youtube.md`",
    "",
  ].join("\n"));
  const fz = require("./lib/frozen");
  const reg = fz.publishedSlugs(tmp);
  assert("register parses the Summary Table row", reg.has("fake-published"));
  assert("detailed-record slug (prose) does not freeze", !reg.has("prose-only-slug"));
  assert("motif names / file paths do not freeze", !reg.has("somerandommotif") && !reg.has("other-book"));
  assert("isFrozen follows the register exactly", fz.isFrozen("fake-published", tmp) && !fz.isFrozen("prose-only-slug", tmp));
  const noReg = pathMod.join(tmp, "missing");
  assert("missing register file → nothing is frozen", fz.publishedSlugs(noReg).size === 0 && !fz.isFrozen("anything", noReg));
}

console.log(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);
if (failed) process.exit(1);
