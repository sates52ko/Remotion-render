#!/usr/bin/env node
/** Post-render P1.1 gate. Pixel evidence is never inferred from metadata. */
const fs = require("fs"); const path = require("path"); const { execFileSync } = require("child_process");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; }));
const slug = args.slug; if (!slug) { console.error("Usage: node scripts/postrender-semantic-audit.js --slug=<slug> --review=<review.json> [--extract]"); process.exit(1); }
const root = path.resolve(__dirname, ".."); const dir = path.join(root, "books", slug);
const config = JSON.parse(fs.readFileSync(path.join(dir, "config.antidote.json"), "utf8")); const scenes = config.scenes || [];
const n = Math.min(25, Math.max(20, Number(args.samples) || 25));
const indexes = [...new Set(Array.from({ length: n }, (_, i) => Math.min(scenes.length - 1, Math.round(i * (scenes.length - 1) / (n - 1)))) )];
const samples = indexes.map((index) => { const s = scenes[index]; const frame = s.fromFrame + Math.floor(s.durationFrames / 2); return { index, sceneId: s.id, frame, seconds: +(frame / config.meta.fps).toFixed(2), narration: s._narration, contract: s.visualContract }; });
const frameDir = path.join(root, "out", `${slug}-semantic-audit`);
if (args.extract) { fs.mkdirSync(frameDir, { recursive: true }); const video = path.join(root, "out", `${slug}.mp4`); for (const x of samples) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(x.seconds), "-i", video, "-frames:v", "1", "-q:v", "2", path.join(frameDir, `${String(x.index).padStart(3, "0")}.jpg`)]); }
let reviews = []; let missingReview = false;
if (args.review && fs.existsSync(args.review)) reviews = JSON.parse(fs.readFileSync(args.review, "utf8")).reviews || [];
else missingReview = true;
const byId = new Map(reviews.map((r) => [r.sceneId, r]));
const evaluated = samples.map((sample) => ({ ...sample, review: byId.get(sample.sceneId) || null }));
const complete = evaluated.filter((x) => x.review).length;
const semanticPasses = evaluated.filter((x) => x.review?.visualSubjectVisible && x.review?.visualRelationVisible && x.review?.visualStateVisible).length;
const foreign = evaluated.filter((x) => x.review?.foreignWorldLeakage).length;
const characters = evaluated.filter((x) => x.review?.characterIdentityMismatch).length;
const report = { version: "P1.1", slug, status: !missingReview && complete === samples.length && semanticPasses / samples.length >= .9 && foreign === 0 && characters === 0 ? "PASS" : "FAIL", metric: { semantic_visual_coverage: samples.length ? semanticPasses / samples.length : 0, foreign_world_leakage: foreign, unresolved_character_identity_mismatch: characters, sampled_frames: samples.length, reviewed_frames: complete }, samples: evaluated, reasonCodes: missingReview ? ["POST_RENDER_REVIEW_MISSING"] : [] };
const out = path.join(dir, "postrender-semantic-audit.report.json"); fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n"); console.log(`${report.status} ${slug}: coverage ${(report.metric.semantic_visual_coverage * 100).toFixed(1)}%, leakage ${foreign}`); if (report.status !== "PASS") process.exit(1);
