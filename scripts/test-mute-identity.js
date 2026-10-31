#!/usr/bin/env node
// Mute-test IDENTITY (2026-10-27). Judge items are numbered in FRAME order while the images are SHUFFLED, so
// item-NN is not img-NN. their-eyes-were-watching-god final: an agent paired them by position and blamed eight wrong
// beats (001 035 044 057 089 182 277 302 instead of 057 091 165 207 216 230 277 283). This fixture is shuffled on
// purpose and runs at 25 fps (never an assumed 30): judge must join each description to its own frame by NAME, write
// the identity into judge-key.json, refuse a blind.json that does not cover the images one-to-one, and `map` must name
// the right units — also for an old-format judge-key (frame only).
// Run: node scripts/test-mute-identity.js
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const SLUG = `zz-mute-identity-${process.pid}`;
const BOOK = path.join(REPO, "books", SLUG), RUN = path.join(REPO, "audit", "mute", SLUG, "run1");
const run = (cmd, label = "run1") => spawnSync(process.execPath, [path.join(__dirname, "mute-test.js"), cmd, `--slug=${SLUG}`, `--label=${label}`], { encoding: "utf8", cwd: REPO, env: { ...process.env, PRODUCTION_GUARD: "off" } });
const W = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };
const R = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
try {
  // 8 units of 250 frames at 25 fps; the sampled frame is inside each unit
  const FPS = 25, N = 8;
  const scenes = Array.from({ length: N }, (_, k) => ({ id: `beat-${String(k * 10 + 1).padStart(3, "0")}`, fromFrame: k * 250, durationFrames: 250, props: {} }));
  const captions = scenes.map((s, k) => ({ startFrame: s.fromFrame + 10, endFrame: s.fromFrame + 240, text: `narration of unit ${k}` }));
  W(path.join(BOOK, "config.vox.json"), { meta: { fps: FPS, audio: "audio/x.m4a" }, scenes, captions });
  W(path.join(BOOK, "book.json"), { slug: SLUG, engine: "vox" });
  const sample = scenes.map((s) => ({ id: s.id, frame: s.fromFrame + 175 }));
  W(path.join(RUN, "sample.json"), sample);
  // images SHUFFLED against frame order (a fixed permutation, so the test is deterministic)
  const perm = [5, 2, 7, 0, 3, 6, 1, 4];
  const key = Object.fromEntries(perm.map((si, k) => [`img-${String(k + 1).padStart(2, "0")}.png`, `${sample[si].id}-f${sample[si].frame}.png`]));
  W(path.join(RUN, "key.json"), key);
  // each description names its own unit, so a mis-join is visible; blind.json itself in yet another order
  const blind = Object.entries(key).map(([img, still]) => ({ img, sees: `picture of ${still.replace(/-f\d+\.png$/, "")}`, message: "m", wouldConfuse: "none" })).reverse();
  W(path.join(RUN, "blind.json"), blind);
  t("fixture: item order != image order (item-NN is not img-NN)", perm.some((si, k) => si !== k));

  let r = run("judge");
  t("judge runs on the shuffled sample", r.status === 0, (r.stderr || r.stdout).slice(-400));
  const ji = R(path.join(RUN, "judge-input.json")), jk = R(path.join(RUN, "judge-key.json"));
  const ok = ji.every((it) => it.V.sees === `picture of ${jk[it.id].unit}` && jk[it.id].frame === sample.find((s) => s.id === jk[it.id].unit).frame);
  t("every item carries the description of ITS OWN frame (joined by name)", ok, JSON.stringify(ji.map((x) => [x.id, x.V.sees, jk[x.id].unit])));
  t("judge-key records image, still and unit per item", ji.every((it) => jk[it.id].img && key[jk[it.id].img] === jk[it.id].still && /^beat-/.test(jk[it.id].unit)));
  t("item time uses the config's fps (25), not an assumed 30", ji[1].t === `${(sample[1].frame / FPS).toFixed(1)}s`, ji[1].t);
  t("a position join would have been wrong here (the trap this guards)", ji.some((it, k) => jk[it.id].img !== `img-${String(k + 1).padStart(2, "0")}.png`));

  // a judge result: items 2 and 5 not CORRECT -> map must name their units, not img-02 / img-05's units
  const res = { items: ji.map((it, k) => ({ id: it.id, V: { correctness: k === 1 ? "WRONG" : k === 4 ? "NEUTRAL" : "CORRECT", contribution: "ADDS", why: "", whyC: "", explains: "NO" } })) };
  W(path.join(RUN, "judge-result.json"), res);
  r = run("map");
  const expect = [jk["item-02"].unit, jk["item-05"].unit];
  const posWrong = [key["img-02.png"], key["img-05.png"]].map((s) => s.replace(/-f\d+\.png$/, ""));
  t("map names the units the judge failed", r.status === 0 && expect.every((u) => new RegExp(`${u} \\(item-0[25]`).test(r.stdout)), r.stdout.slice(-400));
  t("…and they differ from what a position join would blame", expect.join() !== posWrong.join(), `${expect} vs ${posWrong}`);

  // an OLD judge-key (frame only, before 2026-10-27): map rebuilds the chain by name, read-only
  const before = fs.readFileSync(path.join(RUN, "judge-key.json"), "utf8");
  W(path.join(RUN, "judge-key.json"), Object.fromEntries(Object.entries(jk).map(([id, k]) => [id, { frame: k.frame }])));
  const old = fs.readFileSync(path.join(RUN, "judge-key.json"), "utf8");
  r = run("map");
  t("map works on an old-format judge-key and names the same units", r.status === 0 && expect.every((u) => r.stdout.includes(u)), r.stdout.slice(-300));
  t("map writes nothing (historical runs stay as they are)", fs.readFileSync(path.join(RUN, "judge-key.json"), "utf8") === old);
  fs.writeFileSync(path.join(RUN, "judge-key.json"), before);

  // a blind.json that does not cover the images one-to-one is refused (it used to be silently overwritten)
  W(path.join(RUN, "blind.json"), blind.map((b, k) => (k === 0 ? { ...b, img: blind[1].img } : b)));
  r = run("judge");
  t("judge refuses a repeated / missing image in blind.json", r.status !== 0 && /one-to-one/.test(r.stderr), (r.stderr || "").slice(-300));
  // a description filed under the wrong image is caught by map
  W(path.join(RUN, "blind.json"), blind);
  const ji2 = R(path.join(RUN, "judge-input.json"));
  [ji2[0].V, ji2[1].V] = [ji2[1].V, ji2[0].V];
  W(path.join(RUN, "judge-input.json"), ji2);
  r = run("map");
  t("map fails when an item carries another image's description", r.status !== 0 && /not the one filed under/.test(r.stderr), (r.stderr || "").slice(-300));
} finally {
  fs.rmSync(BOOK, { recursive: true, force: true });
  fs.rmSync(path.join(REPO, "audit", "mute", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall mute-identity checks passed");
process.exit(failed ? 1 : 0);
