#!/usr/bin/env node
/**
 * apply-briefs.js — put a book's SUBJECT into an already-planned config,
 * in place, without re-planning.
 *
 * WHY THIS EXISTS. `--briefs=` on either planner is the right path for a new
 * book, but it re-plans, and a re-plan needs the VTT. The raw VTTs are deleted
 * after upload (CLAUDE.md: render assets stay out of git), so 47 of the 49
 * planned books cannot be re-planned at all. Re-planning is also destructive on
 * the Vox side — image files are keyed `scenes/<slug>/beat-NNN.png`, so a
 * changed segmentation orphans every PNG. That is exactly why this repo already
 * has apply-emphasis / apply-phrases / apply-chapters / apply-antidote-overrides
 * instead of one re-plan.
 *
 * So this is the retrofit: it derives briefs from the config that exists and
 * writes only the fields a renderer can use immediately. NOTHING MOVES —
 * no timing, no captions, no segmentation, no image path, no archetype.
 *
 *   Vox       beat.props.subject      what this beat is about
 *   Antidote  scene._subject          same
 *             scene.props[]           a filler motif is REPLACED by the beat's
 *                                     own subject icon when it has one
 *             scene.bg.set            a "nowhere" set (abstract/horizon) becomes
 *                                     the place the narration names
 *
 * Only additive or filler-replacing changes: a scene that already shows
 * something grounded is left exactly as it is.
 *
 * Usage:
 *   node scripts/apply-briefs.js --slug=<slug> [--dry]
 *   node scripts/apply-briefs.js --all [--dry]
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const { CONCEPT_LEXICON } = require("./lib/antidote-director.js");
const CONCEPT_RE = new Map(CONCEPT_LEXICON);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const DRY = !!args.dry;

/** motifs that carry no subject — safe to replace with something that does */
const FILLER = new Set(["spotlight", "ripple", "orbit", "shape", "maze", "arrow"]);
/** sets that name no place — safe to replace with one the narration named */
const NOWHERE = new Set(["abstract", "horizon", "none", ""]);
/** concept -> motif, mirroring the director's own table */
const drawable = new Set(CONCEPT_LEXICON.map(([c]) => c));

function ensureArtifacts(slug) {
  const bookDir = path.join(ROOT, "books", slug);
  const bible = path.join(bookDir, "story-bible.json");
  const briefs = path.join(bookDir, "beat-briefs.json");
  if (!fs.existsSync(bible)) {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "plan-bible.js"), `--slug=${slug}`], { stdio: "pipe" });
  }
  // always re-derive: the bible may have changed, and derivation is cheap
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "plan-briefs.js"), `--slug=${slug}`], { stdio: "pipe" });
  return JSON.parse(fs.readFileSync(briefs, "utf8")).briefs || [];
}

/**
 * Books that are already on the channel.
 *
 * Their config IS the record of what was published, and a retrofit can only
 * create a difference between it and the video people are watching. So they are
 * skipped unless explicitly forced: improving the system is for the books that
 * come next. (Learned the hard way — an earlier run of this script rewrote all
 * 49 configs, published ones included, and had to be reverted.)
 */
function publishedSlugs() {
  try {
    const md = fs.readFileSync(path.join(ROOT, "PUBLISHED_BOOKS.md"), "utf8");
    return new Set([...md.matchAll(/`([a-z0-9-]{3,})`/g)].map((m) => m[1]));
  } catch { return new Set(); }
}

function applyOne(slug) {
  const voxPath = path.join(ROOT, "books", slug, "config.vox.json");
  const antiPath = path.join(ROOT, "books", slug, "config.antidote.json");
  const engine = fs.existsSync(voxPath) ? "vox" : fs.existsSync(antiPath) ? "antidote" : null;
  if (!engine) return null;
  const cfgPath = engine === "vox" ? voxPath : antiPath;

  let briefs;
  try { briefs = ensureArtifacts(slug); } catch (e) { return { slug, engine, error: e.message.split("\n")[0] }; }
  let briefsBible = null;
  try {
    const bp = path.join(ROOT, "books", slug, "story-bible.json");
    if (fs.existsSync(bp)) briefsBible = JSON.parse(fs.readFileSync(bp, "utf8"));
  } catch { /* no bible -> no sweep */ }

  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const units = engine === "vox" ? cfg.beats || [] : cfg.scenes || [];
  const byIndex = new Map(briefs.map((b) => [b.i, b]));

  // The brief was derived FROM this very config, so index alignment is exact
  // here — this is the one place where index is not a hazard. A re-plan still
  // has to go through the fingerprint.
  let subjects = 0, motifs = 0, places = 0, swept = 0;
  units.forEach((u, i) => {
    const b = byIndex.get(i);
    if (!b || (b.confidence ?? 0) < 0.6) return;

    if (engine === "vox") {
      if (b.subject && !u.props.subject) { u.props.subject = b.subject; subjects++; }
      return;
    }

    if (b.subject && !u._subject) { u._subject = b.subject; subjects++; }

    // a filler motif gives way to the beat's own subject; a grounded one stays
    if (b.antidote && b.antidote.concept && drawable.has(b.antidote.concept)) {
      const props = u.props || [];
      const idx = props.findIndex((p) => FILLER.has(p.type));
      if (idx >= 0 && !props.some((p) => p.type === b.antidote.concept)) {
        props[idx] = { ...props[idx], type: b.antidote.concept };
        motifs++;
      } else if (!props.length) {
        u.props = [{ type: b.antidote.concept, scale: 1, enter: "pop", arc: "none", at: 12 }];
        motifs++;
      }
    }

    // a scene happening nowhere moves to the place the narration named
    if (b.antidote && b.antidote.set && u.bg && NOWHERE.has(String(u.bg.set || ""))) {
      u.bg.set = b.antidote.set;
      places++;
    }
  });

  // ── ANACHRONISM SWEEP ────────────────────────────────────────────────────
  // The director now refuses to rotate into a set the book does not have, but
  // that only helps a book that can be RE-PLANNED, and 47 of 49 no longer have
  // their VTT. Measured on `siddhartha` before the fix: 17 sets including
  // `kitchen` x40, `cafe` x32, `startupGarage` x6 and `classroom` x5 — for a
  // parable set in ancient India. So sweep the existing config too: a set the
  // bible does not have becomes the place the brief names, or, failing that,
  // nowhere. Nowhere is not as good as right, but it cannot be an anachronism.
  if (engine === "antidote") {
    const declared = new Set(Object.values((briefsBible && briefsBible.places) || {}).map((p) => p && p.set).filter(Boolean));
    if (declared.size) {
      const PLACELESS = ["abstract", "horizon", "sky", "stage"];
      units.forEach((u, i) => {
        const set = String((u.bg && u.bg.set) || "");
        if (!u.bg || !set || declared.has(set) || PLACELESS.includes(set)) return;
        const b = byIndex.get(i);
        const want = b && b.antidote && b.antidote.set && declared.has(b.antidote.set) ? b.antidote.set : null;
        u.bg.set = want || PLACELESS[i % PLACELESS.length];
        swept++;
      });
    }
  }

  if (!DRY) fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return { slug, engine, scenes: units.length, subjects, motifs, places, swept };
}

(function main() {
  const slugs = args.all
    ? fs.readdirSync(path.join(ROOT, "books")).sort()
    : args.slug ? [args.slug] : null;
  if (!slugs) {
    console.error("Usage: node scripts/apply-briefs.js --slug=<slug> | --all [--dry]");
    process.exit(1);
  }
  const PUBLISHED = args.force ? new Set() : publishedSlugs();
  let totS = 0, totM = 0, totP = 0, totW = 0, books = 0, skipped = 0;
  for (const s of slugs) {
    if (PUBLISHED.has(s)) { skipped++; console.log(`  - ${s.padEnd(38)} skipped (published — --force to override)`); continue; }
    const r = applyOne(s);
    if (!r) continue;
    if (r.error) { console.log(`  ⚠ ${s}: ${r.error}`); continue; }
    books++; totS += r.subjects; totM += r.motifs; totP += r.places; totW += r.swept || 0;
    console.log(`  ${r.slug.padEnd(38)} ${r.engine.padEnd(9)} +${String(r.subjects).padStart(3)} subjects` +
      (r.engine === "antidote" ? `  +${String(r.motifs).padStart(3)} motifs  +${String(r.places).padStart(3)} places` +
        (r.swept ? `  ${String(r.swept).padStart(3)} anachronistic sets swept` : "") : ""));
  }
  console.log(`\n${DRY ? "(dry) " : ""}${books} book(s): +${totS} subjects, +${totM} subject icons replacing filler, +${totP} scenes given a real place, ${totW} anachronistic sets swept`);
})();
