#!/usr/bin/env node
// P1.2 — The Myth of Sisyphus Production Recovery (part 1/3: header + data).
// See the full contract in the footer comment of part 3.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SLUG = "the-myth-of-sisyphus";
const DIR = path.join(ROOT, "books", SLUG);
const CONFIG = path.join(DIR, "config.antidote.json");
const BIBLE = path.join(DIR, "story-bible.json");
const MAPFILE = fs.existsSync(path.join(DIR, "concept-map.json"))
  ? path.join(DIR, "concept-map.json")
  : path.join(ROOT, "tmp", "concept-map.json");

const map = JSON.parse(fs.readFileSync(MAPFILE, "utf8"));
const BOOK_ID = map.bookId;
const WORLD_ID = map.worldId;
const SOURCE_CHAPTER = map.sourceChapter;

const lower = (s) => String(s || "").toLowerCase();
const TRIMS = new Set([".", ",", "!", "?", ";", ":", '"', "'", ")", "]", "}", "-", "—", "–"]);
const norm = (s) => {
  let x = lower(s).trim();
  while (x.length > 1 && TRIMS.has(x[x.length - 1])) x = x.slice(0, -1).trim();
  while (x.length > 1 && TRIMS.has(x[0])) x = x.slice(1).trim();
  return x;
};

/** First-hit concept match over the scene's own narration. */
function matchConcept(narration) {
  const n = lower(narration);
  for (const e of map.concepts) {
    for (const p of e.patterns) {
      const q = norm(p);
      if (q && n.includes(q)) return e;
    }
  }
  return null;
}


/** Named narrative figures from the scene's own narration. Order: specific
 *  (people actually discussed) → general (the voice / the everyman). Every
 *  branch needs the narration to SAY the name (ASR spellings included). */
function matchFigure(narration) {
  const n = lower(narration);
  const has = (...alts) => alts.some((a) => n.includes(a));
  if (has("sisyphus", "seisphus", "sisphus")) return { identity: "sisyphus", role: "mythic_exemplar" };
  if (has("kirkagard", "kirakagard", "kierkegaard", "chestoff", "shestov", "jaspers", "ignatius", "loyola")) return { identity: "kierkegaard", role: "leap_thinker" };
  if (has("kirov", "kiroff", "kiraov", "kiraof", "kirillov", "kirillof", "dustyki", "dostoevsky", "ivan kermaz", "karamazov")) return { identity: "kirillov", role: "dark_test_case" };
  if (has("don juan", "seducer")) return { identity: "donjuan", role: "absurd_archetype" };
  if (has("joseph kay", "kafka", "kofka", "kovka")) return { identity: "kirillov", role: "dark_test_case" };
  if (has("conqueror")) return { identity: "everyman", role: "absurd_archetype" };
  if (has("the actor", "cardboard", "makeelieve", "make-believe", "curtain", "bleed on stage")) return { identity: "everyman", role: "absurd_archetype" };
  if (has("camus", "camuz", "camos", "kimus", "kimoose", "kimuz", "kimos", "cis thinks", "cis brings", "cas says", "cas knew", "cas clarifies", "cas writes", "cas is calling", "kim gives", "kimu proposes", "kimu analyzes", "kimuse", "kanos", "carol knows", "cas says no", "kim writes", "kimu ")) return { identity: "camus", role: "author_voice" };
  if (/^(can you|okay, i have to|let me give|let me interrupt|hold on|wait,|oh, wow|exactly\.|right\?|yeah\.|wow\.|i love that|i hate when|think about the last time)/.test(n.trim())) return { identity: "narrator", role: "dialogue_host" };
  return { identity: "everyman", role: "absurd_man" };
}

// Expression from the beat's emotional temperature — only words the
// narration actually carries.
function expressionFor(narration) {
  const n = lower(narration);
  if (/happy|joy|smile|defiance|defiant|triumph|victory|enough to fill/.test(n)) return "happy";
  if (/terrified|terrifying|vertigo|fear|absurd|dreadful|chilling|despair|darkness|dark |punishment|condemned|hell|nausea|anxiety|crushing|hopeless|bleak/.test(n)) return "worried";
  if (/sad|grief|pity|tragic|tears|weep|melancholy/.test(n)) return "sad";
  if (/amazement|shocking|shatters|astonish|incredible|wow/.test(n)) return "surprised";
  return "neutral";
}

function actionFor(scene, entry) {
  const n = lower(scene._narration || "");
  if (entry.motif === "boulder") {
    if (/walk|descent|down|start again|silent walk/.test(n)) return "walk";
    return "push";
  }
  const orig = scene.characters && scene.characters[0] && scene.characters[0].action;
  if (["talk", "walk", "sit", "hold", "idle", "push"].includes(orig)) return orig;
  return "talk";
}

const FOREIGN_PROPS = new Set([
  "caveAllegory", "ringOfGyges", "fiveRegimes", "tripartiteSoul",
  "civicPolis", "historicalAthens", "mythOfEr",
  "kallipolis", "shipOfState", "thirtyTyrants",
]);

const ROLE_OF = {
  narrator: "dialogue_host",
  everyman: "absurd_man",
  camus: "author_voice",
  kierkegaard: "leap_thinker",
  donjuan: "absurd_archetype",
  kirillov: "dark_test_case",
  sisyphus: "mythic_exemplar",
};


function provenance(entry, scene, motifType, identity, setName) {
  const base = {
    bookId: BOOK_ID,
    sourceChapter: SOURCE_CHAPTER,
    narrativeSubject: entry.subject || motifType,
    narrativeRelation: entry.relation || "is_depicted",
    narrativeState: entry.state || "present",
    worldId: WORLD_ID,
    allowedMotifs: [motifType],
    forbiddenMotifs: [...FOREIGN_PROPS],
    allowedCharacters: [identity],
    allowedLocations: [setName],
    allowedProps: [motifType],
  };
  const atom = { ...base };
  const intent = { ...base, visualSubject: entry.subject || motifType, visualRelation: entry.relation || "is_depicted", visualState: entry.state || "present" };
  const contract = {
    ...base,
    visualEvidence: {
      subjects: [...new Set([entry.subject || motifType, motifType, identity, setName])],
      relations: [entry.relation || "is_depicted"],
      states: [entry.state || "present"],
    },
    characterIntent: (scene.characters || []).map((c) => ({
      identity: c.identity || c.role,
      role: ROLE_OF[c.identity || c.role] || "absurd_man",
      action: c.action || "talk",
      gaze: c.lookAt || "viewer",
      state: c.expression || "neutral",
    })),
  };
  return { atom, intent, contract };
}

function cleanDirector(scene, motifType, identity) {
  const d = scene.director;
  if (!d || typeof d !== "object") return;
  const scrub = (v) => {
    if (typeof v !== "string") return v;
    let out = v;
    for (const f of FOREIGN_PROPS) out = out.split(f).join(motifType);
    return out.replace(/\bcas\b/g, identity);
  };
  for (const k of ["viewerFocus", "visualSubject", "secondarySubject", "relationship", "cameraIntent", "composition", "blocking", "compositionRationale", "motionIntent"]) {
    if (typeof d[k] === "string") d[k] = scrub(d[k]);
  }
  d.visualSubject = identity;
  d.secondarySubject = `${motifType}_motif`;
}

function cleanProposition(scene, entry, motifType) {
  const p = scene.visualProposition;
  if (!p || typeof p !== "object") return;
  if (FOREIGN_PROPS.has(p.subject)) {
    p.subject = motifType;
    p.claim = `Camus: ${(entry.subject || motifType).replace(/_/g, " ")} ${(entry.relation || "is depicted").replace(/_/g, " ")}.`;
    p.thesis = p.claim;
    p.visualQuestion = `How does the frame show ${entry.subject || motifType}?`;
    p.visualAnswer = `By placing ${motifType} in ${entry.set || "manuscript"} beside the figure.`;
    delete p.stateIndex;
    delete p.stateTotal;
    delete p.statePhase;
  }
}

// Scene-level fix-ups the generic pass cannot know (read from narr-scan4):
// the Sisyphus myth section must be staged on the mythic slope with the man
// himself, not a talking Camus on the lecture table.
function applyMythStaging(scene) {
  const n = lower(scene._narration || "");
  const mythic = /sisyphus|seisphus|sisphus|boulder|the rock|walk back down|walk down|descent|pushes and pushes|the plane to start again|own the boulder|drop the rock|against the rock|cheek resting|shoulder bracing|the slope|his task|condemned by the gods/.test(n);
  if (!mythic) return;
  scene.bg = { ...(scene.bg || {}), set: "mountainSlope" };
  if (scene.bg.texture === "paper") scene.bg.texture = "grain";
  for (const p of scene.props || []) {
    if (p.type !== "boulder") p.type = "boulder";
  }
  if (!scene.props || !scene.props.length) scene.props = [{ type: "boulder", scale: 1, enter: "pop", at: 0, color: "#DC2626", color2: "#1C1917" }];
  const happy = /happy|smile|defian|victory|owns it|claims the boulder/.test(n);
  const walking = /walk|descent|down|start again|plane/.test(n);
  for (const ch of scene.characters || []) {
    ch.identity = "sisyphus";
    ch.role = "sisyphus";
    ch.expression = happy ? "happy" : "neutral";
    ch.action = walking ? "walk" : "push";
  }
}

function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const backup = path.join(DIR, "config.antidote.pre-p12.json");
  if (!fs.existsSync(backup)) {
    fs.writeFileSync(backup, JSON.stringify(cfg, null, 2) + "\n");
    console.log("backup →", path.relative(ROOT, backup));
  }
  const bible = JSON.parse(fs.readFileSync(BIBLE, "utf8"));
  const vp = bible.visualProvenance || {};
  const boulderAllowed = (vp.allowedProps || []).includes("boulder") && (vp.allowedLocations || []).includes("mountainSlope") && (vp.allowedCharacters || []).includes("sisyphus");
  if (!boulderAllowed) throw new Error("bible must allow boulder + mountainSlope + sisyphus for myth staging");
  const allowedMotifs = new Set(vp.allowedMotifs || []);
  const allowedProps = new Set(vp.allowedProps || []);
  const allowedLocations = new Set(vp.allowedLocations || []);
  const allowedCharacters = new Set(vp.allowedCharacters || []);

  let foreignPropsRemoved = 0;
  let scenesRetouched = 0;
  const conceptUse = {};

  for (const scene of cfg.scenes || []) {
    const narration = scene._narration || "";
    const entry = matchConcept(narration);
    if (!entry) throw new Error(`P1.2 has no authored concept for ${scene.id} — refusing to invent one`);
    const motifType = entry.motif || entry.concept;
    if (!allowedMotifs.has(motifType) || !allowedProps.has(motifType)) {
      throw new Error("concept-map motif '" + motifType + "' is outside the bible provenance (" + scene.id + ") — fix the source, not the list");
    }
    const conceptSet = entry.set || map.setForConceptFallback || "manuscript";
    if (!allowedLocations.has(conceptSet)) throw new Error("set '" + conceptSet + "' outside provenance (" + scene.id + ")");
    conceptUse[motifType] = (conceptUse[motifType] || 0) + 1;

    // 1. Props: drop every foreign-world motif and every motif the narration
    //    does not support; keep exactly the narration's own one.
    for (const prop of scene.props || []) {
      if (prop.type !== motifType) foreignPropsRemoved++;
    }
    scene.props = [{ type: motifType, scale: 1, enter: "pop", at: 0, color: "#DC2626", color2: "#1C1917" }];

    // 2. Set: the concept's own place.
    scene.bg = { ...(scene.bg || {}), set: conceptSet };
    if (scene.bg.texture === "paper" && conceptSet !== "manuscript") scene.bg.texture = "grain";

    // 3. Character: the narration's own figure, with a stable identity.
    const figure = matchFigure(narration);
    let identity = figure.identity;
    // The mythic beats are carried by the man they name.
    if ((entry.character === "sisyphus" || motifType === "boulder") && /sisyphus|seisphus|sisphus|boulder|rock|walk back|descent/.test(lower(narration))) identity = "sisyphus";
    else if (figure.identity === "everyman" && entry.character && entry.character !== "sisyphus") identity = entry.character === "camus" && figure.identity !== "camus" ? figure.identity : entry.character;
    if (!allowedCharacters.has(identity)) throw new Error("figure '" + identity + "' outside provenance (" + scene.id + ")");
    const expression = expressionFor(narration);
    const action = actionFor(scene, entry);
    const chars = scene.characters && scene.characters.length ? scene.characters : [{ id: `${scene.id}-c0`, rig: "everyman" }];
    scene.characters = chars.slice(0, 1).map((c, k) => ({
      ...c,
      id: c.id || `${scene.id}-c${k}`,
      rig: "everyman",
      identity,
      role: identity,
      expression,
      action,
    }));

    // 4. Scrub the old Plato text where it leaked into director metadata.
    // 4b. Myth staging: Sisyphus's slope belongs to Sisyphus.
    applyMythStaging(scene);
    const finalIdentity = (scene.characters[0] && scene.characters[0].identity) || identity;
    const finalSet = scene.bg.set;
    const finalMotif = (scene.props[0] && scene.props[0].type) || motifType;
    cleanDirector(scene, finalMotif, finalIdentity);
    cleanProposition(scene, entry, finalMotif);

    // 5. Narrative atom → visual intent → visual contract from the narration.
    const { atom, intent, contract } = provenance(entry, scene, finalMotif, finalIdentity, finalSet);
    scene.narrativeAtom = atom;
    scene.visualIntent = intent;
    scene.visualContract = contract;
    scenesRetouched++;
  }

  // 6. Cast: real narrative roles, distinct faces. The old cast was six
  //    identical red-suited figures keyed by ASR mis-hearings.
  cfg.meta.cast = bible.cast;

  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`repaired ${scenesRetouched} scenes, rewrote ${foreignPropsRemoved} unsupported props`);
  console.log("concept use:", JSON.stringify(conceptUse));
}

main();

// WHAT THIS WAS (for the P1.2 report). Pre-repair production config:
// 269 scenes, motifs game/mirror/lightbulb/target/maze/heart + 257 Plato-world
// props (caveAllegory 130, ringOfGyges 44, fiveRegimes 18, civicPolis 23,
// historicalAthens 31, tripartiteSoul 9, mythOfEr 2), bg sets manuscript 185 /
// shipDeck 84, all 273 characters role "cas" (one red-suited variant), zero
// narrativeAtom/visualIntent/visualContract fields. Firewall: 1,355 violations.

