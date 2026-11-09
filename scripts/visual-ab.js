#!/usr/bin/env node
/**
 * visual-ab.js — a blind visual A/B on a GitHub runner (or locally), cycle 6 (2026-10-31). No new orchestration:
 * the same mini books, frames, blind describer / strict judge and tally as the local A/B, with the Claude API as the
 * rater so it can run in the cloud.
 *
 *   node scripts/visual-ab.js render --manifest=<ab.json> --out=<dir>
 *       one Remotion bundle; per arm book the listed frames (captions off) → <out>/stills/<img>.png, hash-shuffled
 *       to img-NN.png; the arm key stays in <out>/key.json (never shown to a model)
 *   node scripts/visual-ab.js rate --manifest=<ab.json> --out=<dir> [--model=claude-haiku-5-5] [--k=2] [--max-usd=5]
 *       per image k describers (the image only, no narration, one image per request) and one judge per description
 *       (the description + that scene's narration, no image). Stops BEFORE a call that would pass --max-usd (measured
 *       tokens × price). Writes <out>/ratings.jsonl and <out>/usage/agent_usage.json ({ai_credits}, read by ai-budget).
 *   node scripts/visual-ab.js tally --manifest=<ab.json> --out=<dir>
 *       WRONG / DEAD / ADDS / EXPLAINS / CORRECT per arm and passage + the manifest's pre-registered ship rule →
 *       <out>/result.json
 *
 * Manifest: { "name", "rule": {"addsPlusPct": 13, "explainsNoLoss": true}, "passages": [{"id": "P1",
 *   "arms": {"A": "<slug>", "B": "<slug>"}, "frames": [..]}] } — frames are taken from arm A's config when omitted
 *   (one per scene at 60%, scenes > 60 frames).
 * Needs ANTHROPIC_API_KEY for `rate` (a GitHub secret on the runner). Never prints it.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.slice(2), true]; }));
const cmd = process.argv[2];
const OUT = path.resolve(args.out || "visual-ab-out");
const man = JSON.parse(fs.readFileSync(path.resolve(args.manifest), "utf8"));
const cfgOf = (slug) => JSON.parse(fs.readFileSync(path.join(ROOT, "books", slug, "config.antidote.json"), "utf8"));
const framesOf = (p) => p.frames || cfgOf(p.arms.A).scenes.filter((s) => /^scene-/.test(s.id) && s.durationFrames > 60).map((s) => Math.round(s.fromFrame + 0.6 * s.durationFrames));
const PRICE = { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [2.0, 10.0], "claude-opus-5-5": [5.0, 25.0] };

const DESCRIBE = "You are a blind viewer of a SILENT frame from an animated book-summary video. Look only at this one image. Describe everything you see (people: look, face, pose, action; objects; any diagram's structure; the setting; printed words), then say in one or two sentences what this frame tells a viewer. Printed words are part of the picture: report them, but also say what the drawing itself shows. Do not guess beyond what is visible. Reply as JSON: {\"sees\": \"...\", \"message\": \"...\"}";
const judgePrompt = (narr, d) => `You are a strict judge in a mute test of an animated book-summary video. A blind viewer saw one silent frame and wrote the description below. The narration spoken around that frame is:
"${narr}"
Judge ONLY this item against ONLY this narration.
- correctness: CORRECT / NEUTRAL / WRONG (WRONG only when the viewer's message contradicts the narration or asserts something false about it; vague or unrelated = NEUTRAL)
- contribution: ADDS (the drawing itself — people, objects, a diagram's structure, the setting — carries part of the meaning) / TEXT_ONLY (only the printed words carry it) / NONE (nothing useful: dead)
- explains: YES / PARTLY / NO (does the picture show how or why the idea works — a mechanism, cause, comparison or structure — not only its topic?)
Reply as JSON: {"correctness": "...", "contribution": "...", "explains": "...", "why": "..."}

VIEWER DESCRIPTION:
${JSON.stringify(d)}`;


// SECONDARY measure (cycle 7): a STRIP = three moments of one scene (25% / 55% / 85%), left to right in time. It asks
// whether the action and its visible result read — it never replaces the single-frame primary.
const SEQ_DESCRIBE = "You are a blind viewer of a SILENT animated book-summary video. This image is a strip of THREE moments of the same scene, left to right in time order. Look only at this image. Describe what happens across the three moments: who is there, what they do, what changes from the first to the last moment (people, objects, faces, any diagram), printed words. Then say in one or two sentences what this scene tells a viewer. Do not guess beyond what is visible. Reply with ONLY a JSON object: {\"sees\": \"...\", \"message\": \"...\"}";
const seqJudge = (narr, d) => `You are a strict judge of a mute test. A blind viewer saw a strip of three moments of one silent scene and wrote the description below. The narration spoken in that scene is:
"${narr}"
Judge ONLY this item against ONLY this narration.
- sequence: YES (the viewer saw who acts, what they do AND a visible result/change that matches the narration) / PARTLY (the action or the change, not both) / NO
- continuity: OK (the same people / objects stay consistent across the three moments) / BROKEN (someone or something changes identity, appears or vanishes without reason)
- correctness: CORRECT / NEUTRAL / WRONG (WRONG = the viewer's message contradicts the narration or suggests a different meaning)
Reply with ONLY a JSON object: {"sequence": "...", "continuity": "...", "correctness": "...", "why": "..."}

VIEWER DESCRIPTION:
${JSON.stringify(d)}`;
const RUBRIC = require("./lib/mute-rubric");
const mediaOf = (f) => (/\.webp$/i.test(f) ? "image/webp" : /\.jpe?g$/i.test(f) ? "image/jpeg" : "image/png");

async function render() {
  if (Array.isArray(man.images)) {
    // IMAGE MODE (calibration): the images are part of the bundle; their sha256 was checked by visual-ab-cloud verify
    fs.mkdirSync(path.join(OUT, "stills"), { recursive: true });
    const key = {};
    for (const im of man.images) {
      const ext = path.extname(im.file) || ".png";
      const img = `${im.id}${ext}`;
      fs.copyFileSync(path.join(ROOT, im.file), path.join(OUT, "stills", img));
      key[img] = { set: im.set || null, run: im.run || null, narration: im.narration || "" };
    }
    fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify(key, null, 1));
    fs.writeFileSync(path.join(OUT, "render-timing.json"), JSON.stringify({ bundleSec: 0, totalSec: 0, stills: man.images.length, mode: "images" }));
    console.log(`image mode: ${man.images.length} given images copied (no render)`);
    return;
  }
  // heavy still work belongs on the runner (visual-ab-cloud.js); this PC gets a small budget (local-load-guard.js)
  const stillCount = man.passages.reduce((s, p) => s + framesOf(p).length * Object.keys(p.arms).length * (man.strips ? 4 : 1), 0);
  require("./lib/local-load-guard").guardStills({ what: "visual-ab render", stills: stillCount, operatorLocal: args["operator-local"] });
  const { bundle } = require("@remotion/bundler");
  const { renderStill, selectComposition, openBrowser } = require("@remotion/renderer");
  const t0 = Date.now();
  fs.mkdirSync(path.join(OUT, "raw"), { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.ts"), webpackOverride: (c) => c });
  const tBundle = (Date.now() - t0) / 1000;
  const browser = await openBrowser("chrome", { chromiumOptions: { gl: "swangle" } });
  const items = [], stripItems = [];
  for (const p of man.passages) {
    const frames = framesOf(p);
    for (const [arm, slug] of Object.entries(p.arms)) {
      const cfg = cfgOf(slug);
      const inputProps = { config: { ...cfg, captions: [] } };
      const composition = await selectComposition({ serveUrl, id: `Antidote-${slug}`, puppeteerInstance: browser, inputProps, timeoutInMilliseconds: 240000 });
      for (const fr of frames) {
        const sc = cfg.scenes.find((s) => fr >= s.fromFrame && fr < s.fromFrame + s.durationFrames);
        const raw = path.join(OUT, "raw", `${slug}-f${fr}.png`);
        await renderStill({ composition, serveUrl, output: raw, frame: fr, imageFormat: "png", puppeteerInstance: browser, inputProps, timeoutInMilliseconds: 240000 });
        items.push({ raw, passage: p.id, arm, slug, frame: fr, scene: sc && sc.id, narration: (sc && (sc._narration || sc.narration)) || "" });
        if (man.strips && sc) {
          const fs3 = [0.25, 0.55, 0.85].map((q) => Math.round(sc.fromFrame + q * sc.durationFrames));
          const parts = [];
          for (const f3 of fs3) { const o = path.join(OUT, "raw", `${slug}-s${fr}-f${f3}.png`); await renderStill({ composition, serveUrl, output: o, frame: f3, imageFormat: "png", puppeteerInstance: browser, inputProps, timeoutInMilliseconds: 240000 }); parts.push(o); }
          const strip = path.join(OUT, "raw", `${slug}-strip-${fr}.png`);
          require("child_process").execFileSync("ffmpeg", ["-v", "error", "-y", ...parts.flatMap((x) => ["-i", x]), "-filter_complex", parts.map((_, i) => `[${i}:v]scale=640:-2,pad=iw+8:ih:0:0:white[v${i}]`).join(";") + ";" + parts.map((_, i) => `[v${i}]`).join("") + `hstack=inputs=${parts.length}`, strip]);
          stripItems.push({ raw: strip, passage: p.id, arm, slug, frame: fr, frames: fs3, scene: sc.id, narration: sc._narration || sc.narration || "" });
        }
      }
    }
  }
  await browser.close({ silent: true });
  items.sort((a, b) => crypto.createHash("sha256").update(man.name + a.raw).digest("hex").localeCompare(crypto.createHash("sha256").update(man.name + b.raw).digest("hex")));
  fs.mkdirSync(path.join(OUT, "stills"), { recursive: true });
  const key = {};
  items.forEach((it, k) => { const img = `img-${String(k + 1).padStart(2, "0")}.png`; fs.copyFileSync(it.raw, path.join(OUT, "stills", img)); key[img] = { passage: it.passage, arm: it.arm, slug: it.slug, frame: it.frame, scene: it.scene, narration: it.narration }; });
  if (stripItems.length) {
    stripItems.sort((a, b) => crypto.createHash("sha256").update(man.name + "strip" + a.raw).digest("hex").localeCompare(crypto.createHash("sha256").update(man.name + "strip" + b.raw).digest("hex")));
    fs.mkdirSync(path.join(OUT, "strips"), { recursive: true });
    const skey = {};
    stripItems.forEach((it, k) => { const img = `strip-${String(k + 1).padStart(3, "0")}.png`; fs.copyFileSync(it.raw, path.join(OUT, "strips", img)); skey[img] = { passage: it.passage, arm: it.arm, slug: it.slug, frame: it.frame, frames: it.frames, scene: it.scene, narration: it.narration }; });
    fs.writeFileSync(path.join(OUT, "strips.json"), JSON.stringify(skey, null, 1));
  }
  fs.rmSync(path.join(OUT, "raw"), { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, "key.json"), JSON.stringify(key, null, 1));
  const timing = { bundleSec: tBundle, totalSec: (Date.now() - t0) / 1000, stills: items.length };
  fs.writeFileSync(path.join(OUT, "render-timing.json"), JSON.stringify(timing));
  console.log(`rendered ${items.length} stills in ${timing.totalSec.toFixed(0)} s (bundle ${tBundle.toFixed(0)} s)`);
}

async function call(model, content, maxTokens) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) return j;
    if (![429, 500, 529].includes(res.status)) throw new Error(`API ${res.status}: ${(j.error && j.error.type) || ""} ${(j.error && j.error.message) || ""}`.slice(0, 200));
    await new Promise((r) => setTimeout(r, attempt * 8000));
  }
  throw new Error("API failed after retries");
}
const jsonOf = (t) => { const s = String(t || ""); const a = s.indexOf("{"), b = s.lastIndexOf("}"); try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; } };

async function rate() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = args.model || "claude-haiku-5-5", K = +(args.k || 2), MAX = +(args["max-usd"] || 5);
  const [pin, pout] = PRICE[model] || PRICE["claude-sonnet-5-5"];
  const rubric = String(args.rubric || "current");
  if (!["current", "official", "sequence"].includes(rubric)) throw new Error(`unknown --rubric=${rubric}`);
  const dir = rubric === "sequence" ? "strips" : "stills";
  const key = JSON.parse(fs.readFileSync(path.join(OUT, rubric === "sequence" ? "strips.json" : "key.json"), "utf8"));
  let usd = 0, inTok = 0, outTok = 0, calls = 0, stopped = null;
  const t0 = Date.now();
  const outFile = path.join(OUT, rubric === "current" ? "ratings.jsonl" : `ratings-${rubric}.jsonl`); fs.writeFileSync(outFile, "");
  const describeText = rubric === "official" ? RUBRIC.describerOne() : rubric === "sequence" ? SEQ_DESCRIBE : DESCRIBE;
  const judgeText = (narr, desc) => (rubric === "official" ? RUBRIC.judgeOne(narr, desc) : rubric === "sequence" ? seqJudge(narr, desc) : judgePrompt(narr, desc));
  const spend = (u) => { inTok += u.input_tokens || 0; outTok += u.output_tokens || 0; usd += ((u.input_tokens || 0) * pin + (u.output_tokens || 0) * pout) / 1e6; calls++; };
  const perCallMax = (4000 * pin + 1200 * pout) / 1e6;
  outer: for (const img of Object.keys(key).sort()) {
    const b64 = fs.readFileSync(path.join(OUT, dir, img)).toString("base64");
    for (let k = 1; k <= K; k++) {
      if (usd + 2 * perCallMax > MAX) { stopped = `budget: $${usd.toFixed(3)} + the next pair would pass $${MAX}`; break outer; }
      const d = await call(model, [{ type: "image", source: { type: "base64", media_type: mediaOf(img), data: b64 } }, { type: "text", text: describeText }], 900);
      spend(d.usage || {});
      const desc = jsonOf(d.content && d.content[0] && d.content[0].text) || { sees: String(d.content && d.content[0] && d.content[0].text || ""), message: "" };
      const j = await call(model, [{ type: "text", text: judgeText(key[img].narration, desc) }], 500);
      spend(j.usage || {});
      const verdict = jsonOf(j.content && j.content[0] && j.content[0].text) || {};
      fs.appendFileSync(outFile, JSON.stringify({ img, k, rubric, desc, judge: verdict }) + "\n");
    }
  }
  const usage = { model, rubric, calls, input_tokens: inTok, output_tokens: outTok, usd, ai_credits: usd / 0.01, seconds: (Date.now() - t0) / 1000, stopped, note: "measured from API usage × list price — an estimate of the bill" };
  fs.mkdirSync(path.join(OUT, "usage"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "usage", rubric === "current" ? "agent_usage.json" : `agent_usage-${rubric}.json`), JSON.stringify(usage));
  console.log(`rated: ${calls} calls, $${usd.toFixed(4)}, ${usage.seconds.toFixed(0)} s${stopped ? " · STOPPED " + stopped : ""}`);
}

function tally() {
  const rubric = String(args.rubric || "current");
  const rfile = path.join(OUT, rubric === "current" ? "ratings.jsonl" : `ratings-${rubric}.jsonl`);
  const rfileOut = path.join(OUT, rubric === "current" ? "result.json" : `result-${rubric}.json`);
  const upc = (x) => String(x || "").toUpperCase();
  if (rubric === "sequence") {
    const skey = JSON.parse(fs.readFileSync(path.join(OUT, "strips.json"), "utf8"));
    const rs = fs.readFileSync(rfile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => ({ ...r, ...skey[r.img] }));
    const agg = (f) => { const a = rs.filter(f); return { n: a.length, SEQ_YES: a.filter((r) => upc(r.judge.sequence) === "YES").length, SEQ_PARTLY: a.filter((r) => upc(r.judge.sequence) === "PARTLY").length, CONT_BROKEN: a.filter((r) => upc(r.judge.continuity) === "BROKEN").length, WRONG: a.filter((r) => upc(r.judge.correctness) === "WRONG").length }; };
    const T = {}; for (const arm of ["A", "B"]) { T[arm] = agg((r) => r.arm === arm); for (const p of man.passages) T[`${arm}:${p.id}`] = agg((r) => r.arm === arm && r.passage === p.id); }
    const res = { name: man.name, rubric, totals: T, rows: rs.length, use: "secondary (report-only)" };
    fs.writeFileSync(rfileOut, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res.totals.A), JSON.stringify(res.totals.B)); return;
  }
  const key = JSON.parse(fs.readFileSync(path.join(OUT, "key.json"), "utf8"));
  if (Array.isArray(man.images)) {
    const rs = fs.readFileSync(rfile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => ({ ...r, ...key[r.img] }));
    const byRun = {}; for (const r of rs) { const b = (byRun[r.run] = byRun[r.run] || { n: 0, WRONG: 0, NONE: 0, ADDS: 0, EXPLAINS: 0 }); b.n++; if (upc(r.judge.correctness) === "WRONG") b.WRONG++; if (upc(r.judge.contribution) === "NONE") b.NONE++; if (upc(r.judge.contribution) === "ADDS") b.ADDS++; if (upc(r.judge.explains) === "YES") b.EXPLAINS++; }
    const res = { name: man.name, rubric, byRun, rows: rs.length, use: "calibration: compared locally with the reference" };
    fs.writeFileSync(rfileOut, JSON.stringify(res, null, 1)); console.log(JSON.stringify(byRun)); return;
  }
  const rows = fs.readFileSync(rfile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => ({ ...r, ...key[r.img] }));
  const up = (x) => String(x || "").toUpperCase();
  const agg = (f) => { const a = rows.filter(f); return { n: a.length, WRONG: a.filter((r) => up(r.judge.correctness) === "WRONG").length, CORRECT: a.filter((r) => up(r.judge.correctness) === "CORRECT").length, ADDS: a.filter((r) => up(r.judge.contribution) === "ADDS").length, DEAD: a.filter((r) => up(r.judge.contribution) === "NONE").length, EXPLAINS: a.filter((r) => /^(YES|PARTLY)$/.test(up(r.judge.explains))).length }; };
  const T = {};
  const ids = man.passages.map((p) => p.id);
  for (const arm of ["A", "B"]) { T[arm] = agg((r) => r.arm === arm); for (const p of ids) T[`${arm}:${p}`] = agg((r) => r.arm === arm && r.passage === p); }
  const rule = man.rule || {};
  const need = Math.ceil(((rule.addsPlusPct || 13) / 100) * T.A.n);
  const c = { wrongPerPassage: ids.every((p) => T[`B:${p}`].WRONG <= T[`A:${p}`].WRONG), deadPooled: T.B.DEAD <= T.A.DEAD, adds: T.B.ADDS >= T.A.ADDS + need, explainsNoLoss: rule.explainsNoLoss === false ? true : T.B.EXPLAINS >= T.A.EXPLAINS };
  const ship = Object.values(c).every(Boolean);
  const result = { name: man.name, totals: T, rule: { ...c, addsNeeded: need }, decision: ship ? "SHIP" : "NO SHIP", rows: rows.length };
  fs.writeFileSync(rfileOut, JSON.stringify({ ...result, rubric }, null, 1));
  console.log(JSON.stringify(result, null, 1));
}

(async () => {
  if (cmd === "render") await render();
  else if (cmd === "rate") await rate();
  else if (cmd === "tally") tally();
  else { console.error("usage: visual-ab.js render|rate|tally --manifest=<ab.json> --out=<dir>"); process.exit(2); }
})().catch((e) => { console.error(String(e.message || e).replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]")); process.exit(1); });
