#!/usr/bin/env node
/**
 * p9a-proposition-telemetry.js — P9-A O3: measure how much author-given
 * RELATIONAL meaning survives the authoring → screen pipeline, per book.
 *
 * READ-ONLY: never writes into books/ (the one report goes to
 * audit/visionless-10x/p9a-proposition-chain.json). Frozen published books are
 * measured on-disk as the record of what shipped. The 4 PINNED books' on-disk
 * configs were overwritten by P8 (operator note in the P9 plan); their
 * pre-P8 copies live in audit/visionless-10x/p8-backup/<slug>.pre.json and are
 * measured with `version: "pre-p8-backup"` so every number in the report says
 * WHICH file it came from.
 *
 *   node scripts/p9a-proposition-telemetry.js [--books=a,b,c]
 *
 * Per book, from the config alone:
 *   - relational tagged (detector, _semanticAdapter.archetype) and how many of
 *     those carry a two-sided composition (both poles visible: two-cast
 *     comparative shots, split/beforeAfter with two icon sides, or diagram);
 *   - authored two-person closeUps that now stage two distinct faces (A1);
 *   - authored concepts sealed on _authorship.conceptAuthored that never
 *     reached the scene (A3 — PROPOSITION_DROPPED evidence, config-only);
 *   - the engine-side loss events the planner recorded
 *     (books/<slug>/proposition-loss.report.json, O1/O2);
 *   - Vox: authored onScreenText reached props vs dropped (V5 chain).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "audit", "visionless-10x", "p9a-proposition-chain.json");

const PINNED = ["don-t-believe-everything-you-think", "ready-player-one", "the-miracle-of-mindfulness-an-introduction-to-the-practice-of-meditation", "the-paradox-of-choice"];
// the P9 "why" corpus (measured, operator brief) + pinned 4 = the 7-book run
const DEFAULT_BOOKS = [...PINNED, "the-second-mountain", "lolita", "into-the-wild"];

const RELATIONAL = new Set(["contrast", "allegory_equivalence", "cause_effect", "transformation", "character_psychology"]);
const TWO_SIDED_SHOTS = new Set(["twoShot", "split", "beforeAfter", "overShoulder"]);

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const books = args.books ? String(args.books).split(",") : DEFAULT_BOOKS;

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function configFor(slug) {
  const real = path.join(ROOT, "books", slug);
  const isPinned = PINNED.includes(slug);
  if (isPinned) {
    const pre = readJSON(path.join(ROOT, "audit", "visionless-10x", "p8-backup", `${slug}.pre.json`));
    if (pre) return { config: pre, version: "pre-p8-backup (on-disk config was overwritten by P8)" };
  }
  const antidote = readJSON(path.join(real, "config.antidote.json"));
  if (antidote) return { config: antidote, version: "on-disk" };
  const vox = readJSON(path.join(real, "config.vox.json"));
  if (vox) return { config: vox, version: "on-disk" };
  return { config: null, version: "missing" };
}

function analyze(slug) {
  const { config, version } = configFor(slug);
  if (!config) return { slug, version, error: "no config found" };
  const scenes = config.scenes || config.beats || [];
  const engine = config.scenes ? "antidote" : "vox";

  let relationalTagged = 0, relationalTwoSided = 0, relationalPreserved = 0;
  let closeUpTwoCast = 0, closeUpTwoCastDistinct = 0;
  let conceptAuthored = 0, conceptAuthoredDropped = 0;
  let voxOnScreenAuthored = 0, voxOnScreenRendered = 0, voxOnScreenRejected = 0;
  let onScreenHeadlines = 0;

  for (const s of scenes) {
    if (engine === "antidote") {
      const a = s._semanticAdapter || {};
      if (RELATIONAL.has(a.archetype)) {
        relationalTagged++;
        const twoSided =
          (TWO_SIDED_SHOTS.has(s.shot) && (s.characters || []).length >= 2) ||
          (Array.isArray(s.props) && s.props.length >= 2) ||
          !!s.diagram;
        if (twoSided) relationalTwoSided++; else relationalPreserved++;
      }
      const cast = s.characters || [];
      if (s.shot === "closeUp" && cast.length >= 2) {
        const unstaged = cast.every((c) => c.x === undefined && c.y === undefined && c.scale === undefined);
        if (unstaged) closeUpTwoCast++;
      }
      const auth = s._authorship;
      if (auth && typeof auth.conceptAuthored === "string" && auth.conceptAuthored.trim()) {
        conceptAuthored++;
        const chars = Array.isArray(s.characters) ? s.characters : [];
        const reached = !!(s.concept
          || (s.props || []).some((p) => p && p.type)
          || chars.some((ch) => ch && ch.holds === auth.conceptAuthored));
        if (!reached) conceptAuthoredDropped++;
      }
    } else {
      // Vox: the beat's props object (props.text narration, props.onScreenText the V5 chain)
      const text = (s.props && !Array.isArray(s.props)) ? s.props : null;
      if (text && typeof text.onScreenText === "string" && text.onScreenText.trim()) {
        voxOnScreenAuthored++;
        if (text._onScreenTextRejected) voxOnScreenRejected++;
        else voxOnScreenRendered++;
      }
      if (text && text._onScreenTextRejected) onScreenHeadlines++;
    }
  }

  // Vox authoring SOURCE: storyboard/authored-*.json carry design.storyboard.
  // onScreenText — what the AUTHOR wrote, regardless of when the plan last ran.
  // The gap authored→rendered IS the proposition loss (V5 closes it at re-plan).
  let voxAuthoredSource = null;
  if (engine === "vox") {
    let total = 0, withOst = 0;
    const sbDir = path.join(ROOT, "books", slug, "storyboard");
    try {
      for (const f of fs.readdirSync(sbDir)) {
        if (!/^authored-\d+\.json$/.test(f)) continue;
        const a = JSON.parse(fs.readFileSync(path.join(sbDir, f), "utf8"));
        const arr = Array.isArray(a) ? a : (a.beats || []);
        for (const b of arr) {
          total++;
          const ost = b.design && b.design.storyboard && b.design.storyboard.onScreenText
            || b.storyboard && b.storyboard.onScreenText;
          if (ost && String(ost).trim()) withOst++;
        }
      }
    } catch {}
    voxAuthoredSource = { authoredBeats: total, withOnScreenText: withOst };
  }

  // A1 distinct-face check on the REAL renderer rules (not a re-implementation)
  let a1Distinct = null;
  try {
    const { stageChar } = require("../src/engines/antidote/shots.ts");
    let checked = 0, distinct = 0;
    for (const s of scenes) {
      const cast = s.characters || s.cast || [];
      if (s.shot === "closeUp" && cast.length >= 2 && cast.every((c) => c.x === undefined && c.y === undefined && c.scale === undefined)) {
        checked++;
        const a0 = stageChar("closeUp", cast[0], 0);
        const a1 = stageChar("closeUp", cast[1], 1);
        if (a0.x !== a1.x || a0.y !== a1.y) distinct++;
      }
    }
    if (checked) a1Distinct = { twoCastCloseUps: checked, distinctFaces: distinct };
  } catch {}

  const plReport = readJSON(path.join(ROOT, "books", slug, "proposition-loss.report.json"));
  const lossCounts = plReport ? plReport.counts : {};

  return {
    slug, engine, version,
    beats: scenes.length,
    voxAuthoredSource,
    antidote: engine === "antidote" ? {
      relationalTagged, relationalTwoSided, relationalOnePole: relationalPreserved,
      relationalPreservedAuthored: relationalPreserved,
      twoSidedRate: relationalTagged ? +(relationalTwoSided / relationalTagged).toFixed(3) : null,
      closeUpTwoCastStagedDistinct: a1Distinct,
      conceptAuthored, conceptAuthoredDropped,
    } : {
      onScreenTextAuthored: voxOnScreenAuthored,
      onScreenTextRendered: voxOnScreenRendered,
      onScreenTextRejected: voxOnScreenRejected,
    },
    propositionLoss: lossCounts,
  };
}

const results = books.map(analyze);
const doc = {
  generatedAt: new Date().toISOString(),
  scope: "P9-A O3 — read-only proposition-chain telemetry; DROPPED events are REPORT-only in P9-A",
  pinnedNote: "pinned 4 measured from audit/visionless-10x/p8-backup/*.pre.json (on-disk configs were overwritten by P8); others on-disk",
  books: results,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");

for (const r of results) {
  if (r.error) { console.log(`${r.slug}: ${r.error}`); continue; }
  if (r.engine === "antidote") {
    const a = r.antidote;
    console.log(`${r.slug} [${r.version}] relational ${a.relationalTwoSided}/${a.relationalTagged} two-sided · conceptAuthoredDropped ${a.conceptAuthoredDropped}/${a.conceptAuthored}${a.closeUpTwoCastStagedDistinct ? ` · closeUp2cast distinct ${a.closeUpTwoCastStagedDistinct.distinctFaces}/${a.closeUpTwoCastStagedDistinct.twoCastCloseUps}` : ""}${Object.keys(r.propositionLoss).length ? ` · loss {${Object.entries(r.propositionLoss).map(([k, v]) => k + ":" + v).join(", ")}}` : ""}`);
  } else {
    const a = r.antidote;
    const src = r.voxAuthoredSource ? ` · authored source ${r.voxAuthoredSource.withOnScreenText}/${r.voxAuthoredSource.authoredBeats} carry onScreenText` : "";
    console.log(`${r.slug} [${r.version}] onScreenText authored ${a.onScreenTextAuthored} → rendered ${a.onScreenTextRendered}, rejected ${a.onScreenTextRejected}${src}`);
  }
}
console.log(`\nreport: audit/visionless-10x/p9a-proposition-chain.json`);
