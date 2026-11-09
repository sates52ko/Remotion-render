#!/usr/bin/env node
/**
 * gate-continuity.js — the same person looks the same in every scene.
 *
 * Deterministic, no LLM/vision, never edits a config. A scene names a cast ROLE and
 * the look comes from meta.cast[role].variant (Scene.tsx resolveVariant), so the film
 * stays continuous only if:
 *   - every named character resolves to a cast entry (else DEFAULT_VARIANT: an
 *     "undressed" stranger — the SBC/Unhinged bug),
 *   - one identity always maps to one role (no Montag drawn as Beatty in scene 40),
 *   - no per-scene `variant` override changes a cast member's wardrobe,
 *   - no cast member is drawn as a silhouette.
 * Crowd extras are exempt. Vox (photographs) has no rig: PASS with a note.
 *
 *   node scripts/gate-continuity.js --slug=<slug> [--report-only]
 */
const fs = require("fs");
const path = require("path");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const SLUG = args.slug;
if (!SLUG) { console.error("Usage: node scripts/gate-continuity.js --slug=<slug> [--report-only]"); process.exit(1); }
const p = path.join(__dirname, "..", "books", SLUG, "config.antidote.json");
if (!fs.existsSync(p)) { console.log(`continuity: ${SLUG} has no Antidote config (Vox photographs) — nothing to check`); process.exit(0); }
const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
const cast = (cfg.meta && cfg.meta.cast) || {};
const problems = [];
const roleOf = {};
for (const s of cfg.scenes || []) {
  for (const ch of s.characters || []) {
    if (ch.crowd) continue;
    const who = ch.identity || ch.role || ch.id;
    if (!ch.role || !cast[ch.role]) { problems.push(`${s.id}: "${who}" has no cast entry (role "${ch.role || "-"}") — drawn in the default look`); continue; }
    if (roleOf[who] && roleOf[who].role !== ch.role) problems.push(`${s.id}: "${who}" is drawn as role "${ch.role}" but as "${roleOf[who].role}" in ${roleOf[who].scene}`);
    else roleOf[who] = roleOf[who] || { role: ch.role, scene: s.id };
    if (ch.variant && Object.keys(ch.variant).some((k) => k !== "expression")) problems.push(`${s.id}: "${who}" carries a per-scene variant override (${Object.keys(ch.variant).join(",")}) — wardrobe changes mid-film`);
    if (ch.silhouette) problems.push(`${s.id}: cast member "${who}" drawn as a silhouette`);
  }
}
if (!problems.length) { console.log(`✓ continuity: ${Object.keys(roleOf).length} characters, each one look across the film`); process.exit(0); }
console.log(`✗ continuity: ${problems.length} problem(s)`);
problems.slice(0, 40).forEach((x) => console.log("  - " + x));
if (problems.length > 40) console.log(`  … ${problems.length - 40} more`);
process.exit(args["report-only"] ? 0 : 1);
