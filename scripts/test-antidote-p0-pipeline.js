#!/usr/bin/env node
/**
 * End-to-End P0 Integration Test:
 *   storyboard.js prep (illustrated 10x pack, NO entities.json, NO cast variants)
 *   -> authored-1..3.json (10x devices + word cues + assetRequests + transitionOverride)
 *   -> storyboard.js merge --write (art.json + auto prompts.10x.json)
 *   -> antidote-10x-assets.js --dry-run
 *   -> plan-antidote.js -> apply-semantic-arcs.js -> hard-gate.js --auto-fix
 *   -> gate-authorship.js --restore -> inject-provenance.js
 *   -> validate-narrative-visual-firewall.js -> validate-screen-text.js -> gate-authorship.js
 *   -> qa-antidote-10x.js -> schema.ts antidoteConfigSchema.parse()
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
const SLUG = "__test-p0-fullbook";
const BOOK_DIR = path.join(ROOT, "books", SLUG);
const SB_DIR = path.join(BOOK_DIR, "storyboard");
const VTT_PATH = path.join(ROOT, "public", "captions", `${SLUG}.vtt`);

function loadTs(relPath) {
  const tmpOut = path.join(os.tmpdir(), `antidote-p0-test-${path.basename(relPath)}-${Date.now()}.cjs`);
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, relPath)],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: tmpOut,
    external: ["react", "remotion"],
    jsx: "automatic",
  });
  const mod = require(tmpOut);
  try { fs.unlinkSync(tmpOut); } catch {}
  return mod;
}

const ENV = {
  ...process.env,
  PRODUCTION_ALLOW_DIRTY: "p0 integration test",
  PRODUCTION_ALLOW_MAIN: "p0 integration test",
  PRODUCTION_ALLOW_BEHIND: "p0 integration test",
};

function runNode(scriptRel, args) {
  try {
    execFileSync(process.execPath, [path.join(ROOT, scriptRel), ...args], {
      cwd: ROOT,
      env: ENV,
      stdio: "pipe",
    });
  } catch (e) {
    if (e.stdout) console.error(e.stdout.toString());
    if (e.stderr) console.error(e.stderr.toString());
    throw e;
  }
}

function fmtTime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return `${h}:${m}:${s}`;
}

function makeVtt(nBeats = 12) {
  const lines = ["WEBVTT", ""];
  for (let i = 0; i < nBeats; i++) {
    const t0 = i * 8;
    const t1 = t0 + 7.5;
    const words = ["Systems", "beat", "hustle", "when", "you", "discard", "the", "myth", "and", "focus", "at", "82%"];
    const tagged = words.map((w, wi) => `${wi ? `<${fmtTime(t0 + wi * 0.5)}><c> ` : ""}${w}${wi ? "</c>" : ""}`).join("");
    lines.push(`${fmtTime(t0)} --> ${fmtTime(t1)}`);
    lines.push(tagged);
    lines.push("");
  }
  return lines.join("\n");
}

try {
  fs.mkdirSync(SB_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(VTT_PATH), { recursive: true });
  fs.writeFileSync(VTT_PATH, makeVtt(12));

  fs.writeFileSync(path.join(BOOK_DIR, "book.json"), JSON.stringify({
    slug: SLUG,
    title: "P0 Fullbook Test",
    author: "Test Author",
    genre: "strategy",
    engine: "antidote",
    stylePack: "swissModernist",
    skin: { caption: "paper", plate: "sharp", font: "condensed" },
    engineProfile: {
      kind: "nonfiction",
      world: "ideas",
      era: 2025,
      realPeople: false,
      format: "argument",
      violence: "none",
      minorHarm: false,
      mustSee: ["Systems", "Funnel", "Leverage"],
    },
  }, null, 2));

  fs.writeFileSync(path.join(BOOK_DIR, "story-bible.json"), JSON.stringify({
    world: { era: "contemporary", worldId: "ideas-modern" },
    places: { studio: { name: "Studio", set: "office", look: "modern sunlit studio" } },
    cast: { everyman: { name: "Reader", look: "modern reader", variant: { gender: "m", age: "adult", outfit: "casual", suit: "#222222", hair: "#332211", hairStyle: "short" } } },
    ownIcons: [],
    signatureObjects: [],
    visualProvenance: {
      bookId: SLUG,
      worldId: "ideas-modern",
      allowedMotifs: ["lightbulb"],
      forbiddenMotifs: [],
      allowedCharacters: ["everyman"],
      allowedLocations: ["studio"],
      allowedProps: ["lightbulb"],
    },
  }, null, 2));

  // 1. Prep on illustrated 10x pack (NO entities.json, NO cast variants)
  runNode("scripts/storyboard.js", ["prep", `--slug=${SLUG}`, "--chunk=4", "--skip-own-icons=test"]);
  const rulesMd = fs.readFileSync(path.join(SB_DIR, "rules.md"), "utf8");
  assert.ok(rulesMd.includes("vennMerge") && rulesMd.includes("assetRequests"), "rules.md must document Phase 2 10x devices");

  const beatsJson = JSON.parse(fs.readFileSync(path.join(SB_DIR, "beats.json"), "utf8"));
  const beats = beatsJson.beats;
  const devices = [
    (b) => ({ statSlam: { kicker: "CORE", value: "82%", label: "Signal" } }),
    (b) => ({ vennMerge: { title: "Overlap", circles: [{ label: "Skill" }, { label: "Need" }], intersection: { label: "Edge" } } }),
    (b) => ({ explodedView: { title: "Stack", expandCue: "when you", layers: [{ label: "Top" }, { label: "Base" }] } }),
    (b) => ({ gravityPile: { title: "Load", items: [{ label: "A" }, { label: "B" }, { label: "C" }] } }),
    (b) => ({ crumpleToss: { myth: { headline: "Myth" }, tossCue: "discard the myth", truth: { headline: "Truth" } }, transitionOverride: "paperTear" }),
    (b) => ({ analyticsFunnel: { title: "Funnel", stages: [{ label: "In", value: "82%", share: 0.82 }, { label: "Out", value: "12%", share: 0.12 }] } }),
    (b) => ({ barRace: { title: "Race", epochs: [{ label: "Y1", bars: [{ id: "a", label: "A", value: 30 }, { id: "b", label: "B", value: 60 }] }, { label: "Y2", bars: [{ id: "a", label: "A", value: 82 }, { id: "b", label: "B", value: 40 }] }] } }),
    (b) => ({ upClose: { image: "scenes/essentialism-10x-pilot/e1_marble_chisel.png", zoomTarget: { x: 0.5, y: 0.5, scale: 2.0 } }, assetRequests: [{ id: "hero_chisel", prompt: "marble chisel studio" }] }),
    (b) => ({ spatialJourney: { variant: "topoExpedition", stations: [{ label: "Start" }, { label: "End" }] } }),
    (b) => ({ kineticManifesto: { lines: [{ text: "LESS" }, { text: "BETTER", emphasis: true }] } }),
  ];

  const chunkFiles = fs.readdirSync(SB_DIR).filter((f) => /^chunk-\d+\.json$/.test(f)).sort();
  assert.ok(chunkFiles.length >= 1, "chunks must be emitted");
  for (const cf of chunkFiles) {
    const ch = JSON.parse(fs.readFileSync(path.join(SB_DIR, cf), "utf8"));
    const authored = ch.beats.map((b, idx) => ({
      i: b.i,
      concept: null,
      diagram: null,
      callout: null,
      cast: [],
      shotIntent: { job: "mechanism-flow", subject: "systems", action: "show", payoff: "clarity" },
      ...devices[b.i % devices.length](b),
      storyboard: {
        claim: "Systems beat hustle",
        concreteVisual: "10x visual stage",
        onScreenText: "Systems",
        relationToPrevious: "Builds argument",
        addedInformation: "Visualizes structure",
      },
    }));
    fs.writeFileSync(path.join(SB_DIR, cf.replace("chunk-", "authored-")), JSON.stringify(authored, null, 2));
  }

  // 2. Merge + auto prompts.10x.json + dry-run assets
  runNode("scripts/storyboard.js", ["merge", `--slug=${SLUG}`, "--write"]);
  assert.ok(fs.existsSync(path.join(BOOK_DIR, "prompts.10x.json")), "prompts.10x.json must be auto-generated");
  runNode("scripts/antidote-10x-assets.js", [`--slug=${SLUG}`, "--max-calls=45", "--dry-run"]);

  // 3. Plan + Post-plan + Gates + QA
  runNode("scripts/plan-antidote.js", [`--vtt=public/captions/${SLUG}.vtt`, `--slug=${SLUG}`, "--title=P0 Fullbook Test", "--genre=strategy"]);
  runNode("scripts/hard-gate.js", [`--slug=${SLUG}`, "--auto-fix"]);
  runNode("scripts/gate-authorship.js", [`--slug=${SLUG}`, "--restore", "--report-only"]);
  runNode("scripts/inject-provenance.js", [`--slug=${SLUG}`]);
  runNode("scripts/validate-narrative-visual-firewall.js", [`--slug=${SLUG}`]);
  runNode("scripts/validate-screen-text.js", [`--slug=${SLUG}`]);
  runNode("scripts/gate-authorship.js", [`--slug=${SLUG}`, "--engine=antidote"]);
  runNode("scripts/qa-antidote-10x.js", [`--slug=${SLUG}`]);

  // 4. Schema parse & invariants
  const cfg = JSON.parse(fs.readFileSync(path.join(BOOK_DIR, "config.antidote.json"), "utf8"));
  const schema = loadTs("src/engines/antidote/schema.ts");
  const parsed = schema.antidoteConfigSchema.parse(cfg);
  assert.strictEqual(parsed.meta.artDirection.stylePack, "swissModernist");
  assert.strictEqual(parsed.meta.artDirection.layoutGrammar, "swissPoster");
  assert.strictEqual(parsed.meta.hud.enabled, false);
  for (const s of parsed.scenes) {
    if (s.crumpleToss) assert.strictEqual(s.crumpleToss.tossCue, undefined, "tossCue must be stripped");
    if (s.explodedView) assert.strictEqual(s.explodedView.expandCue, undefined, "expandCue must be stripped");
    assert.strictEqual(s.characters.length, 0, `${s.id}: fullStage10x must have 0 characters`);
    assert.strictEqual(s.props.length, 0, `${s.id}: fullStage10x must have 0 props`);
  }

  console.log("PASS  P0 full-book chunked JSON -> plan -> gates -> QA -> schema pipeline");
} finally {
  fs.rmSync(BOOK_DIR, { recursive: true, force: true });
  fs.rmSync(VTT_PATH, { force: true });
}
