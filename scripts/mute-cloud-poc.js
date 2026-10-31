#!/usr/bin/env node
/**
 * mute-cloud-poc.js — OFFLINE feasibility check for running a sealed blind mute test in a GitHub job (2026-10-30, P2.4).
 * No model call, no network, nothing written into the book.
 *
 *   node scripts/mute-cloud-poc.js --slug=<slug> --label=<label> [--root=<book worktree>] [--out=<dir>]
 *
 * Builds the immutable input manifest of an existing local run (lib/mute-manifest.js), verifies it, shows the two
 * bundles a cloud job would get (describer: frames + prompt; judge: text only) and their sizes, the isolation checks
 * (no narration / key / judge file reaches the describer; no image reaches the judge), and the per-run call count and
 * cost estimate per model (prices: Anthropic pricing page 2026-10-30; NVIDIA NIM free developer tier, ~40 RPM, not for
 * production use without a license). The manifest is written to --out (default: the system temp dir), never the book.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildManifest, verifyManifest } = require("./lib/mute-manifest");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
if (!args.slug || !args.label) { console.error("usage: node scripts/mute-cloud-poc.js --slug=<slug> --label=<label> [--root=<book worktree>] [--out=<dir>]"); process.exit(1); }
const root = path.resolve(args.root || path.join(__dirname, ".."));
const out = path.resolve(args.out || path.join(os.tmpdir(), "mute-cloud-poc"));
const m = buildManifest({ root, slug: args.slug, label: args.label });
const v = verifyManifest(m, { root });
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `${args.slug}.${args.label}.manifest.json`);
fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n");

const n = m.frames.length;
const bytes = m.frames.reduce((a, f) => a + f.bytes, 0);
// per call, from the Anthropic vision/pricing pages (a 1920x1080 frame ≈ 2,691 image tokens on 4.7+ models)
const PRICE = { "claude-sonnet-5-5": { in: 2, out: 10 }, "claude-haiku-5-5": { in: 0.1, out: 0.5 } };
const est = (model) => { const p = PRICE[model]; const desc = n * ((2691 + 400) * p.in + 1300 * p.out) / 1e6; const judge = (m.judge.items || n) * (1500 * p.in + 1000 * p.out) / 1e6; return { describer: desc, judge, total: desc + judge }; };
console.log(`── mute-cloud POC · ${args.slug}/${args.label} (offline — no model called)`);
console.log(`  engine     : code ${String(m.engine.codeHead || "?").slice(0, 8)} · pin ${String(m.engine.pin || "?").slice(0, 8)}`);
console.log(`  film       : config ${String(m.film.configSha256).slice(0, 16)} · render input ${m.film.renderInputHash} · stills from ${m.film.stillsConfigSha}${m.film.stillsConfigSha && m.film.configSha256 && m.film.configSha256.startsWith(m.film.stillsConfigSha) ? " (= this config)" : " (≠ this config)"}`);
console.log(`  seal       : ${m.seal.sealed ? (m.seal.verified ? `verified ${String(m.seal.idsSha256).slice(0, 12)}` : "DOES NOT VERIFY") : "not sealed"} · sample ${m.sample.n} ids`);
console.log(`  describer  : ${n} blind frame(s), ${(bytes / 1048576).toFixed(1)} MB + prompt ${m.describer.promptSha256.slice(0, 12)} — narration leak ${m.describer.leak.shingleHits.length ? "FOUND" : "none"}, judge-side files named: ${m.describer.leak.forbiddenRefs ? "YES" : "no"}`);
console.log(`  judge      : ${m.judge.items} text item(s), ${m.judge.images} image(s), input ${String(m.judge.inputSha256 || "none").slice(0, 12)} · frame key stays judge-side (${String(m.keySha256 || "none").slice(0, 12)})`);
console.log(`  manifest   : ${m.manifestSha256.slice(0, 16)} → ${file}`);
console.log(`  verify     : ${v.ok ? "OK — recomputed from disk, identical" : `DIFFERS: ${v.diff.join("; ")}`}`);
console.log(`  calls / run: ${n} describer + ${m.judge.items || n} judge = ${n + (m.judge.items || n)}`);
for (const model of Object.keys(PRICE)) { const e = est(model); console.log(`  est. cost  : ${model} ≈ $${e.total.toFixed(2)} (describer $${e.describer.toFixed(2)} + judge $${e.judge.toFixed(2)}); Batch API ≈ half`); }
console.log(`  est. cost  : NVIDIA NIM VLM (e.g. llama-3.2-11b-vision) $0 on the developer tier, ≥ ${Math.ceil((n + (m.judge.items || n)) / 40)} min at ~40 RPM — prototyping only (production needs an AI Enterprise license); never run without the operator's go`);
process.exit(v.ok ? 0 : 1);
