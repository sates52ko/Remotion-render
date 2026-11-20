// Visual Regression Lab — checkpoint sampler (report-only, never blocks production).
//
// Picks the scenes a quick visual check should render: risk-weighted first (the scenes
// the structural signals say are most likely to be dead or wrong), then seeded random
// coverage of the rest so the check is not blind to what the risk rules miss.
//
//   node scripts/visual-lab.js sample --slug=<slug> [--n=10] [--seed=<text>] [--write]
//
// Without --write it prints the manifest. With --write it writes
// books/<slug>/visual-lab/sample.json (the frozen manifest: slug, seed, scene ids,
// narration hashes, config hash, code SHA). Same config + same seed = same manifest.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// VISUAL_LAB_ROOT lets the sampler read a book tree that lives outside this worktree.
const ROOT = process.env.VISUAL_LAB_ROOT || path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const CMD = process.argv[2];
const SLUG = args.slug;

const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");

// Deterministic PRNG (mulberry32) seeded from the text seed.
function rng(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Risk signals, each a reason a picture is likely to carry nothing the narration needs.
const RISKS = [
  ["no_object", (s) => !s.concept && !(s.props || []).length && !s.diagram],
  // sampling hint only: a single figure is often the right picture; it is never a defect by itself
  ["single_figure_hint", (s) => (s.characters || []).length <= 1 && !s.diagram && s.shot !== "split" && s.shot !== "twoShot"],
  ["neutral_face", (s) => (s.characters || []).some((c) => c.expression === "neutral")],
  ["idle_or_talk_only", (s) => (s.characters || []).length > 0 && (s.characters || []).every((c) => ["idle", "talk", "think"].includes(c.action))],
  ["callout_only_carrier", (s) => !s.concept && (s.texts || []).some((t) => t && t.text) && !(s.characters || []).some((c) => c.holds)],
];

function scoreScene(s) {
  const reasons = RISKS.filter(([, f]) => f(s)).map(([name]) => name);
  return { risk: reasons.length, reasons };
}

// Authoritative spoken narration only: books/<slug>/art.json beat i (scene-N = beat i).
// Screen callouts are NEVER a substitute. Missing narration is reported, not hashed around.
function narrationTable(slugDir) {
  const art = readJsonSafe(path.join(slugDir, "art.json"));
  const out = new Map();
  for (const b of (art && art.beats) || []) if (b && typeof b.i === "number" && typeof b.narration === "string" && b.narration.trim()) out.set(b.i, b.narration.trim());
  return out;
}
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function sample() {
  const cfgPath = path.join(ROOT, "books", SLUG, "config.antidote.json");
  if (!fs.existsSync(cfgPath)) throw new Error(`no config at ${cfgPath}`);
  const raw = fs.readFileSync(cfgPath, "utf8");
  const cfg = JSON.parse(raw);
  const n = parseInt(args.n || "10", 10);
  const seed = String(args.seed || `${SLUG}:${sha(raw).slice(0, 12)}`);

  const scenes = (cfg.scenes || []).filter((s) => s && s.id && s.shot !== "chapterCard" && s.type !== "title" && s.type !== "chapter");
  const table = narrationTable(path.join(ROOT, "books", SLUG));
  const beatIndex = (id) => parseInt(String(id).replace(/\D/g, ""), 10);
  const scored = scenes.map((s) => {
    const text = table.get(beatIndex(s.id));
    return { id: s.id, ...scoreScene(s), narration: text || null, narrationSha256: text ? sha(text) : null, narrationMissing: !text };
  });

  // 1) the riskiest scenes first; ties broken by the seeded PRNG so the same seed picks the same ones
  const rand = rng(seed);
  const shuffled = scored.map((x) => ({ x, k: rand() })).sort((a, b) => a.k - b.k).map((o) => o.x);
  const byRisk = shuffled.slice().sort((a, b) => b.risk - a.risk);
  const riskQuota = Math.ceil(n / 2);
  const chosen = [];
  for (const x of byRisk) {
    if (chosen.length >= riskQuota) break;
    if (x.risk > 0) chosen.push(x);
  }
  // 2) the rest: seeded random over the scenes not yet chosen, so risk rules cannot hide a blind spot
  for (const x of shuffled) {
    if (chosen.length >= n) break;
    if (!chosen.includes(x)) chosen.push(x);
  }
  // present in narrative order
  const order = new Map(scenes.map((s, i) => [s.id, i]));
  chosen.sort((a, b) => order.get(a.id) - order.get(b.id));

  let codeSha = null;
  try { codeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}

  return {
    slug: SLUG,
    seed,
    n,
    configSha256: sha(raw),
    codeSha,
    scenesTotal: scenes.length,
    riskScenesAvailable: scored.filter((x) => x.risk > 0).length,
    narrationSource: "books/" + SLUG + "/art.json (beats[i].narration)",
    narrationMissingCount: scored.filter((x) => x.narrationMissing).length,
    sampled: chosen.map((x) => ({ id: x.id, risk: x.risk, reasons: x.reasons, narrationSha256: x.narrationSha256, narrationMissing: x.narrationMissing })),
    createdAt: new Date().toISOString(),
  };
}

if (require.main === module) {
  if (CMD === "sample") {
    if (!SLUG) { console.error("usage: visual-lab.js sample --slug=<slug> [--n=10] [--seed=<text>] [--write]"); process.exit(1); }
    const manifest = sample();
    if (args.write) {
      const dir = path.join(ROOT, "books", SLUG, "visual-lab");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "sample.json"), JSON.stringify(manifest, null, 2) + "\n");
      console.log(`✓ books/${SLUG}/visual-lab/sample.json — ${manifest.sampled.length} scenes (seed ${manifest.seed})`);
    } else {
      console.log(JSON.stringify(manifest, null, 2));
    }
  } else {
    console.error("usage: node scripts/visual-lab.js sample --slug=<slug> [--n=10] [--seed=<text>] [--write]");
    process.exit(1);
  }
}

module.exports = { rng, scoreScene, sample };
