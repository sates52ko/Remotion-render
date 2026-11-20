#!/usr/bin/env node
/**
 * Technical fact for a finished render: out/<slug>.mp4 (or .preview.mp4 with --preview) exists, its frame count
 * matches the book's config within tolerance, and the whole video decodes. The result is appended to
 * books/<slug>/render-facts.json. It says nothing about quality — that is the firewall's fact.
 *
 * Usage: node scripts/verify-render-output.js --slug=<slug> [--preview] [--file=<path>] [--book-root=<checkout>]
 *          [--media] [--no-record] [--json]
 *   --book-root (cycle 9): the checkout that owns books/<slug>, out/ and the render state (a pinned book worktree);
 *               this checkout's current code checks it. Before, cloud assembly printed the flag but it was ignored.
 *   --media     also measure the film's A/V (lib/media-verify.js): the sync verdict (start/end offsets, audio timeline,
 *               where the video holds), join dropouts vs the source narration, stretch, loudness (REPORT ONLY).
 *               A sync FAIL makes the technical fact FAIL; dropouts and loudness are reported, never a gate here.
 *   --no-record read-only: print (or --json) the result, append nothing.
 *   --from-cloud the film is gone (delivered + removed): record the cloud runner's verification, labelled as such (no local
 *               check claimed); refused while the film is on disk; idempotent per film sha256.
 * Exit 1 when the file is missing, frames are off, decode fails, or (--media) A/V sync fails; 2 = usage.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; }));
if (!args.slug) { console.error("Usage: node scripts/verify-render-output.js --slug=<slug> [--preview] [--file=<path>] [--book-root=<checkout>] [--media] [--no-record] [--json]"); process.exit(2); }
const BOOK = typeof args["book-root"] === "string" && args["book-root"] ? path.resolve(args["book-root"]) : ROOT;
if (!fs.existsSync(path.join(BOOK, "books", args.slug))) { console.error(`❌ books/${args.slug} not found under ${BOOK} (a purged book has no record folder to write into)`); process.exit(2); }
const pre = require("./lib/render-preflight");
const file = args.file ? path.resolve(BOOK, args.file) : path.join(BOOK, "out", `${args.slug}${args.preview ? ".preview" : ""}.mp4`);
const expectedFrames = pre.expectedFramesFor(BOOK, args.slug);

// --from-cloud (cycle 9, 2026-11-04): the film was delivered and removed (upload / cleanup) before its technical fact was
// recorded (Hamnet). Record what the CLOUD runner verified, labelled as such — never as a local check that did not
// happen. Only when the film is NOT on disk (else: run the real check); idempotent per film sha256.
if (args["from-cloud"]) {
  if (fs.existsSync(file)) { console.error(`❌ ${path.relative(BOOK, file)} is on disk — run the real check (without --from-cloud)`); process.exit(2); }
  const cs = (() => { try { return JSON.parse(fs.readFileSync(path.join(BOOK, `.render-github-cloud.${args.slug}.json`), "utf8")); } catch { return null; } })();
  const f = cs && cs.verified && cs.report && cs.report.final;
  if (!f) { console.error(`❌ no cloud-verified assembly recorded for ${args.slug} — nothing verified to record`); process.exit(1); }
  const facts = (() => { try { return JSON.parse(fs.readFileSync(pre.factsFile(BOOK, args.slug), "utf8")).runs || []; } catch { return []; } })();
  const entry = {
    kind: "technical", technical: "CLOUD_VERIFIED", source: "cloud-report",
    localMediaCheck: "NOT_DONE — the film was not on disk when this was recorded (removed after delivery); no local decode, A/V or loudness measurement is claimed",
    file: `out/${f.file}`, frames: f.frames, expectedFrames: f.expected, decodes: f.decodes, audio: true, durationSec: f.durationSec || null, bytes: f.bytes, sha256: f.sha256,
    cloudRun: cs.run && cs.run.url, cloudVerifiedAt: cs.at, bundleSha: cs.bundleSha, ...(cs.joinRepair || (cs.report && cs.report.joinRepair) ? { joinRepair: cs.joinRepair || cs.report.joinRepair } : {}),
    ...pre.provenance(BOOK, args.slug),
  };
  const dup = facts.find((r) => r.kind === "technical" && r.source === "cloud-report" && r.sha256 === f.sha256);
  if (dup) { console.log(`✓ already recorded (${dup.at}): CLOUD_VERIFIED ${f.file} sha256 ${f.sha256.slice(0, 12)} — nothing written`); if (args.json) console.log(JSON.stringify(dup, null, 2)); process.exit(0); }
  if (!args["no-record"]) pre.appendFacts(BOOK, args.slug, entry);
  if (args.json) console.log(JSON.stringify(entry, null, 2));
  console.log(`technical CLOUD_VERIFIED (from the cloud report, local check NOT done): ${f.file} ${f.frames}/${f.expected} frames, decode ${f.decodes ? "clean" : "ERRORS"}, sha256 ${f.sha256.slice(0, 12)}${args["no-record"] ? "  (read-only: not recorded)" : ""}`);
  process.exit(f.decodes && f.frames === f.expected ? 0 : 1);
}
const result = pre.verifyRenderOutput({ file, expectedFrames });

/** the narration the film was rendered from: the config's meta.audio (under public/), else the usual names */
function narrationOf(book, slug) {
  for (const f of ["config.antidote.json", "config.vox.json"]) {
    try {
      const a = (JSON.parse(fs.readFileSync(path.join(book, "books", slug, f), "utf8")).meta || {}).audio;
      if (a && fs.existsSync(path.join(book, "public", a))) return path.join(book, "public", a);
    } catch {}
  }
  const dir = path.join(book, "public", "audio");
  return [`${slug}.mastered.m4a`, `${slug}.m4a`, `${slug}.mp3`].map((x) => path.join(dir, x)).find((x) => fs.existsSync(x)) || null;
}

let media = null;
if (args.media && result.exists) {
  const { splitFileFor } = require("./render-status");
  const sf = splitFileFor(BOOK, args.slug);
  const split = sf ? JSON.parse(fs.readFileSync(sf, "utf8")) : null;
  const narration = narrationOf(BOOK, args.slug);
  media = require("./lib/media-verify").measure(file, {
    expectedFrames, chunkSize: split ? Number(split.chunkSize) || null : null,
    segmentStarts: split ? (split.segments || []).map((s) => s.start) : [], narrationFile: narration,
  });
  media.narrationFile = narration ? path.relative(BOOK, narration) : null;
  // what the cloud assembly's join repair did with this film (REPAIRED / NOTHING_TO_REPAIR / NOT_REPAIRED + reason)
  try { const cs = JSON.parse(fs.readFileSync(require("./lib/cloud-assemble").cloudStateFile(BOOK, args.slug), "utf8")); media.joinRepair = cs.joinRepair || (cs.report && cs.report.joinRepair) || null; } catch { media.joinRepair = null; }
  if (media.sync && media.sync.verdict === "FAIL") { result.status = "FAIL"; result.problems.push(...media.sync.problems.map((p) => `A/V sync: ${p}`)); }
}

let checkedBy = null;
try { checkedBy = require("child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch {}
const entry = {
  kind: "technical", technical: result.status, file: path.relative(BOOK, file), frames: result.frames, expectedFrames, decodes: result.decodes, problems: result.problems,
  ...(media ? { media: { narrationFile: media.narrationFile, joinRepair: media.joinRepair, sync: media.sync, video: media.video, audio: media.audio, joinDropouts: media.joinDropouts, loudness: media.loudness } } : {}),
  checkedBy, ...pre.provenance(BOOK, args.slug),
};
if (!args["no-record"]) pre.appendFacts(BOOK, args.slug, entry);
if (args.json) console.log(JSON.stringify(entry, null, 2));
else {
  console.log(`technical ${result.status}: ${path.relative(BOOK, file)} frames=${result.frames} expected=${expectedFrames} decodes=${result.decodes}${args["no-record"] ? "  (read-only: not recorded)" : ""}`);
  for (const p of result.problems) console.log(`  - ${p}`);
  if (media && media.sync && media.video) {
    const m = media;
    console.log(`  A/V sync ${m.sync.verdict}: start ${m.sync.startOffsetSec}s, end ${m.sync.endOffsetSec}s (tolerance ${m.sync.endToleranceSec}s), audio discontinuities ${m.sync.audioDiscontinuities}, composition clock ${m.sync.clock}`);
    console.log(`  join repair (cloud assembly): ${m.joinRepair ? `${m.joinRepair.status}${m.joinRepair.reason ? ` — ${m.joinRepair.reason}` : ""}` : "no record"}`);
    console.log(`  video holds ${m.video.holds} (chunk ${m.video.chunkHolds}, segment ${m.video.segmentHolds}, off-grid ${m.video.offGridHolds}); film stretched ${m.video.stretchSec}s (${m.video.stretchPct}%)`);
    console.log(`  join dropouts ${m.joinDropouts.status}: ${m.joinDropouts.count} zero-level gaps at joins (${m.joinDropouts.totalSec}s, max ${m.joinDropouts.maxSec}s); the source narration has ${m.joinDropouts.sourceZeroRuns == null ? "?" : m.joinDropouts.sourceZeroRuns} of its own`);
    if (m.loudness) console.log(`  loudness (report only): ${m.loudness.integratedLufs} LUFS integrated, LRA ${m.loudness.lraLu} LU, sample peak ${m.loudness.samplePeakDbfs} dBFS`);
  }
}
process.exit(result.status === "VERIFIED" ? 0 : 1);
