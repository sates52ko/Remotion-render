#!/usr/bin/env node
/**
 * purge-render-branches.js — delete a book's per-render bundle branches off the
 * GitHub worker pool. The LAST step of a book, AFTER the operator has uploaded.
 *
 * A pooled render pushes an isolated, parentless bundle to `render/<slug>-segN` on
 * each worker it used (scripts/lib/render-bundle.js). Those refs are the only place
 * the render's code lives, so they are also the only thing making a worker repo look
 * "busy". They are not a deliverable and they accumulate: four books in a row had
 * their 10 refs deleted by hand at publish time.
 *
 * Usage:
 *   node scripts/purge-render-branches.js --slug=<slug>            # delete this book's refs
 *   node scripts/purge-render-branches.js --slug=<slug> --dry      # list only, delete nothing
 *   node scripts/purge-render-branches.js --slug=<slug> --force    # skip the finished-book guard
 *   node scripts/purge-render-branches.js --slug=<slug> --worker=<id>   # one worker only
 *
 * Guards:
 *   - Only refs under `render/` are ever touched. The workers' shared `god-mode` is
 *     stale BY DESIGN and must survive (see CLAUDE.md git topology).
 *   - Refuses to run unless the book looks finished: `out/<slug>.mp4` exists, or the
 *     slug is in PUBLISHED_BOOKS.md, or `--force`. Deleting the refs of a render that
 *     has not been assembled/uploaded costs a full segment re-render.
 *   - No `--all`: a blanket ref sweep across the pool is never safe, because several
 *     agents share it and another book may be mid-render. Always name the slug.
 *   - The split state file is the authority on WHICH workers ran; when it is gone
 *     (cleanup removes it) every active worker is scanned instead.
 */
const fs = require("fs");
const path = require("path");
const {
  ROOT, loadAccounts, parseArgs, redact,
  gitRemotes, lsRemoteHeads, isDeletableRef, renderRefsFor, deleteRemoteRef,
} = require("./lib/render-pool");

const args = parseArgs(process.argv.slice(2));
const SLUG = args.slug;
const DRY = !!args.dry;

if (!SLUG || typeof SLUG !== "string" || !/^[a-z0-9-]+$/.test(SLUG)) {
  console.error("Kullanım: node scripts/purge-render-branches.js --slug=<slug> [--dry] [--force] [--worker=<id>]");
  process.exit(1);
}
if (args.all) {
  console.error("❌ --all desteklenmiyor. Bu havuzu birden fazla ajan paylaşıyor ve başka bir kitap");
  console.error("   render'da olabilir. Her zaman --slug ver.");
  process.exit(1);
}

// ── Finished-book guard ─────────────────────────────────────────────────────
/**
 * A ref holds the only copy of the render's bundle. Deleting it before the mp4 is
 * assembled (or uploaded) means re-rendering that segment from scratch, so this
 * script refuses unless the book has visibly reached a terminal state.
 */
function finishedWhy() {
  if (fs.existsSync(path.join(ROOT, "out", `${SLUG}.mp4`))) return "out/" + SLUG + ".mp4 var";
  const pb = path.join(ROOT, "PUBLISHED_BOOKS.md");
  if (fs.existsSync(pb) && fs.readFileSync(pb, "utf8").includes("`" + SLUG + "`")) return "PUBLISHED_BOOKS.md'de kayıtlı";
  return null;
}
const finished = finishedWhy();
if (!finished && !args.force) {
  console.error(`❌ "${SLUG}" bitmiş görünmüyor (ne out/${SLUG}.mp4 ne de PUBLISHED_BOOKS.md kaydı var).`);
  console.error("   Bu ref'ler o render'in bundle'ı — filmi upload etmeden silmek segmentleri");
  console.error("   baştan render ettirir. Yükleme yaptıysan devam için: --force");
  process.exit(1);
}

// ── Which workers held this book's refs ─────────────────────────────────────
const acc = loadAccounts();
const workers = (acc.workers || []).filter((w) => w.active !== false && w.token);
if (args.worker) {
  const only = workers.filter((w) => w.id === args.worker || w.username === args.worker || w.name === args.worker);
  if (!only.length) { console.error(`❌ Worker bulunamadı: ${args.worker}`); process.exit(1); }
  workers.length = 0; workers.push(...only);
}

const localRemotes = new Set(gitRemotes());
/** remoteName → worker, for looking up a remote back to its account. */
const byRemote = new Map(workers.map((w) => [w.remoteName, w]));

/**
 * Prefer the split state file: it records exactly which worker pushed which ref, so
 * we do not touch refs a previous attempt of the same slug may have re-dispatched.
 * It is deleted by cleanup, hence the scan fallback.
 */
function plannedTargets() {
  const p = path.join(ROOT, `.render-github-split.${SLUG}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const st = JSON.parse(fs.readFileSync(p, "utf8"));
    if (st.slug !== SLUG) return null;
    const segs = st.segments || [];
    if (!segs.length) return null;
    return segs
      .map((s) => ({ remote: s.remoteName, ref: s.ref }))
      .filter((t) => t.remote && t.ref);
  } catch { return null; }
}

// ── Plan ────────────────────────────────────────────────────────────────────
const planned = plannedTargets();
const plan = [];   // { remote, ref, worker, source }
const seen = new Set();

if (planned) {
  for (const t of planned) {
    if (!isDeletableRef(t.ref)) {
      console.warn(`  ⚠ state file'da guard dışı ref var, atlanıyor: ${t.ref}`);
      continue;
    }
    const key = `${t.remote}|${t.ref}`;
    if (seen.has(key)) continue;   // re-dispatch duplicates: one ref, many state entries
    seen.add(key);
    plan.push({ remote: t.remote, ref: t.ref, worker: byRemote.get(t.remote) || null, source: "state" });
  }
} else {
  for (const w of workers) {
    const remote = w.remoteName;
    if (!remote) continue;
    if (!localRemotes.has(remote)) {
      console.warn(`  ⚠ @${w.username}: yerel git remote '${remote}' yok — atlanıyor`);
      continue;
    }
    let refs;
    try { refs = renderRefsFor(w, SLUG, remote); }
    catch (e) { console.warn(`  ⚠ @${w.username}: ref listelenemedi — ${redact(e.message).slice(0, 90)}`); continue; }
    for (const ref of refs) plan.push({ remote, ref, worker: w, source: "scan" });
  }
}

const who = planned ? "split state dosyası" : "worker taraması";
console.log(`\n🌿 Ref temizliği — ${SLUG}`);
console.log(`   Kaynak: ${who} · Guard: ${finished ? `geçti (${finished})` : "--force (override)"} · Mod: ${DRY ? "DRY" : "SİL"}\n`);

if (!plan.length) {
  console.log(`✓ "${SLUG}" için worker remote'larında ref yok — temiz.`);
  console.log(`  (Taranan remote: ${workers.map((w) => w.remoteName).filter(Boolean).join(", ") || "yok"})\n`);
  process.exit(0);
}

// ── Execute ─────────────────────────────────────────────────────────────────
let deleted = 0, alreadyGone = 0, failed = 0;

for (const t of plan) {
  const who_ = t.worker ? `@${t.worker.username}` : t.remote;
  if (DRY) { console.log(`  · ${who_}  ${t.remote}  ${redact(t.ref)}  [DRY]`); continue; }
  try {
    deleteRemoteRef(t.remote, t.ref);
    deleted++;
    console.log(`  🗑 ${who_}  ${t.remote}  ${t.ref}`);
  } catch (e) {
    // "remote ref does not exist" means someone already cleaned it — not an error.
    if (/does not exist|unable to delete|not found|could not find/i.test(e.message)) {
      alreadyGone++;
      console.log(`  – ${who_}  ${t.ref}  (yokdu)`);
    } else {
      failed++;
      console.warn(`  ⚠ ${who_}  ${t.ref}  ${e.message}`);
    }
  }
}

// ── Verify ──────────────────────────────────────────────────────────────────
// Never report success on the push exit code alone; re-read the remote.
if (!DRY) {
  const still = [];
  const checkRemotes = [...new Set(plan.map((t) => t.remote))];
  for (const remote of checkRemotes) {
    if (!localRemotes.has(remote)) continue;
    try {
      const w = byRemote.get(remote);
      for (const h of lsRemoteHeads(remote)) {
        if (isDeletableRef(h.ref, w) && (h.ref === `render/${SLUG}` || h.ref.startsWith(`render/${SLUG}-`))) still.push(`${remote}  ${h.ref}`);
      }
    } catch (e) {
      console.warn(`  ⚠ ${remote} doğrulanamadı: ${redact(e.message).slice(0, 90)}`);
    }
  }
  if (still.length) {
    failed += still.length;
    console.log(`\n❌ Hâlâ duran ref:`);
    for (const s of still) console.log(`     ${s}`);
  }
}

const head = DRY ? `silinecek: ${plan.length}` : `silinen: ${deleted}`;
console.log(`\n✓ ${head}` + (alreadyGone ? ` · zaten yok: ${alreadyGone}` : "") + (failed ? ` · BAŞARISIZ: ${failed}` : ""));
if (!DRY && !failed) {
  console.log(`✅ Worker remote'ları temiz. Bu kitap artık havuzu kirletmiyor.`);
  console.log(`   (render-worker-N üzerindeki stale god-mode DOKUNULMADI — policy gereği öyle kalmalı.)`);
}
console.log(`\nℹ Bu adım YÜKLEME SONRASIDIR. Sırası: render → assemble → post-render → YOUTUBE-READY →`);
console.log(`   upload → scripts/purge-render-branches.js --slug=${SLUG} → scripts/render-purge.js --slug=${SLUG}\n`);
process.exit(failed ? 1 : 0);
