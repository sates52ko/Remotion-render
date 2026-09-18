#!/usr/bin/env node
/**
 * apply-antidote-overrides.js — per-book art-direction overrides applied to a
 * planned config.antidote.json, WITHOUT replanning (timing, captions, callouts
 * and diagrams untouched). The Antidote sibling of the Vox retrofit scripts
 * (apply-emphasis / fix-names / apply-phrases).
 *
 * WHY THIS EXISTS. The director picks a scene's SET and CAST from the beat's
 * CLASS, not from what the scene is about, and the classifier only ever sees one
 * chunk of narration. Two consequences, measured on a-good-man-is-hard-to-find:
 *   • SET: 50 of 66 scenes with a concrete location got the wrong one — the
 *     roadside shooting played in a `kitchen`, and 10 scenes used sets the book
 *     has no equivalent for at all (`classroom` x7, `court` x3).
 *   • CAST: `castRoles()` sends every `question` / `neutral` / `time` / `title`
 *     beat to the `narrator`, so any STORY moment the classifier reads as
 *     neutral loses its characters. The climax of the title story — the
 *     grandmother reaching out to touch her killer — rendered as the narrator
 *     alone in a classroom.
 * The art file (--callouts) can carry `callout`, `concept` and `diagram`, but
 * not `bg` or cast, so there is no way to say this at plan time. This file is
 * that missing layer, and it is a per-book DATA file rather than a planner
 * change, so no other book's output moves.
 *
 * books/<slug>/overrides.json:
 *   {
 *     "setRemap": { "classroom": "abstract" },        // blanket, applied first
 *     "rules": [                                       // first match wins
 *       { "when": "ditch|highway", "set": "highway",
 *         "cast": ["protagonist", "foil"], "expression": "worried" }
 *     ]
 *   }
 * `when` is a case-insensitive regex matched against the scene's `_narration`.
 * Only the keys you set are touched. Re-running is idempotent.
 *
 * Valid sets (src/engines/antidote/components/Backdrop.tsx → SETS):
 *   horizon office street room stage sky abstract kitchen bedroom classroom
 *   library cafe hospital court forest shore highway
 * Valid roles: narrator protagonist foil mentor extra
 *
 * Usage: node scripts/apply-antidote-overrides.js --slug=<slug> [--dry]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
const SLUG = args.slug;
const DRY = !!args.dry;
if (!SLUG) {
  console.error("Kullanım: node scripts/apply-antidote-overrides.js --slug=<slug> [--dry]");
  process.exit(1);
}

const SETS = new Set(["horizon", "office", "street", "room", "stage", "sky", "abstract",
  "kitchen", "bedroom", "classroom", "library", "cafe", "hospital", "court", "forest", "shore", "highway"]);
const ROLES = new Set(["narrator", "protagonist", "foil", "mentor", "extra"]);

const ovPath = path.join(ROOT, "books", SLUG, "overrides.json");
if (!fs.existsSync(ovPath)) {
  console.log(`ℹ  books/${SLUG}/overrides.json yok — override adımı atlandı (opsiyonel).`);
  process.exit(0);
}
const cfgPath = path.join(ROOT, "books", SLUG, "config.antidote.json");
if (!fs.existsSync(cfgPath)) {
  console.error(`❌ books/${SLUG}/config.antidote.json yok — önce plan-antidote çalıştır.`);
  process.exit(1);
}

const ov = JSON.parse(fs.readFileSync(ovPath, "utf8"));
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const scenes = cfg.scenes || [];

// validate up front — a typo'd set silently renders a blank backdrop
for (const [from, to] of Object.entries(ov.setRemap || {})) {
  if (!SETS.has(to)) { console.error(`❌ setRemap "${from}" → bilinmeyen set "${to}"`); process.exit(1); }
}
for (const r of ov.rules || []) {
  if (r.set && !SETS.has(r.set)) { console.error(`❌ rule "${r.when}" → bilinmeyen set "${r.set}"`); process.exit(1); }
  for (const role of r.cast || []) {
    if (!ROLES.has(role)) { console.error(`❌ rule "${r.when}" → bilinmeyen rol "${role}"`); process.exit(1); }
  }
}

const stats = { remapped: 0, setChanged: 0, castChanged: 0, matched: 0 };
const perRule = new Map();

// ── 1) blanket set remap (sets this book simply has no location for) ─────────
for (const s of scenes) {
  if (!s.bg || !s.bg.set) continue;
  const to = (ov.setRemap || {})[s.bg.set];
  if (to && to !== s.bg.set) { s.bg.set = to; stats.remapped++; }
}

// ── 2) rules, first match wins ───────────────────────────────────────────────
const compiled = (ov.rules || []).map((r) => ({ ...r, rx: new RegExp(r.when, "i") }));
for (const s of scenes) {
  const n = s._narration || "";
  const rule = compiled.find((r) => r.rx.test(n));
  if (!rule) continue;
  stats.matched++;
  perRule.set(rule.when, (perRule.get(rule.when) || 0) + 1);

  if (rule.set && s.bg && s.bg.set !== rule.set) { s.bg.set = rule.set; stats.setChanged++; }

  if (rule.cast && rule.cast.length) {
    const cur = s.characters || [];
    const before = cur.map((c) => c.role).join("+");
    // keep the existing rig/animation, only re-assign WHO is on screen; clone the
    // first entry when the rule needs more bodies than the director staged.
    const template = cur[0] || { rig: "everyman", expression: "neutral", enter: "fade", action: "hold", lookAt: "camera" };
    const next = rule.cast.map((role, i) => ({
      ...(cur[i] || template),
      id: `${s.id.replace(/^scene-/, "c")}-${i}`,
      role,
    }));
    if (rule.expression) for (const c of next) c.expression = rule.expression;
    s.characters = next;
    if (next.map((c) => c.role).join("+") !== before) stats.castChanged++;
  } else if (rule.expression) {
    for (const c of s.characters || []) c.expression = rule.expression;
  }
}

// ── 3) thumbnail ─────────────────────────────────────────────────────────────
// `meta.thumbnail` in the config is what Root.tsx feeds Thumb-<slug> (NOT
// youtube-meta.json — editing that alone changes nothing on the PNG). The
// scaffold's defaults are celebratory (`action: "celebrate"`, `motif:
// "risingBars"`, `expression: "happy"`, hook = the title), which is the wrong
// tone for most books and actively wrong for a violent one.
let thumbChanged = false;
if (ov.thumbnail && cfg.meta) {
  const t = cfg.meta.thumbnail || (cfg.meta.thumbnail = {});
  Object.assign(t, ov.thumbnail);
  delete t._needsClaudeRefine;
  thumbChanged = true;
}

console.log(`── overrides: ${SLUG}`);
if (thumbChanged) {
  const t = cfg.meta.thumbnail;
  console.log(`   thumbnail: hook="${t.hook}" action=${t.action} expression=${t.expression} motif=${t.motif} layout=${t.layout || "(auto)"}`);
  console.log(`     ↳ re-render: npx remotion still Thumb-${SLUG} out/thumbnail-${SLUG}.png --frame=0`);
}
console.log(`   blanket set remap : ${stats.remapped} scene(s)`);
console.log(`   rules matched     : ${stats.matched} scene(s) → set changed ${stats.setChanged}, cast changed ${stats.castChanged}`);
for (const [when, n] of perRule) console.log(`     ${String(n).padStart(4)}  /${when}/`);

const setSpread = scenes.reduce((a, s) => { const k = (s.bg && s.bg.set) || "none"; a[k] = (a[k] || 0) + 1; return a; }, {});
console.log(`   sets now: ${Object.entries(setSpread).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ")}`);

if (DRY) { console.log("\n[dry] yazılmadı."); process.exit(0); }
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
console.log(`\n✓ books/${SLUG}/config.antidote.json güncellendi`);
console.log(`  (plan-antidote'u yeniden çalıştırırsan bu adımı TEKRAR uygula — plan config'i sıfırdan yazar)`);
