#!/usr/bin/env node
// package-youtube.js: the clean VTT is the ONE caption file in the upload bundle (no captions.srt, no
// captions.vtt copy, never the raw word-timed VTT under the clean name). Uses throwaway slugs under this
// checkout's out/, public/captions/ and books/, and removes every file it created.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
let fail = 0;
const t = (name, ok, info) => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) fail++; };

const S1 = `zz-package-youtube-${process.pid}`, S2 = `zz-package-youtube-raw-${process.pid}`;
const created = [];
const write = (rel, data) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); created.push(p); };
const CLEAN = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello there.\n";
const RAW = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello<00:00:00.500><c> there.</c>\n";
const outBefore = fs.existsSync(path.join(ROOT, "out")) ? fs.readdirSync(path.join(ROOT, "out")).sort().join("\n") : "";
try {
  write(`public/captions/${S1}.clean.vtt`, CLEAN);
  write(`public/captions/${S1}.vtt`, RAW);
  write(`books/${S1}/youtube-meta.json`, JSON.stringify({ titles: ["Test Title"], description: "d", tags: ["a", "b"], chapters: [{ t: 0, label: "Intro" }] }));
  write(`books/${S1}/youtube.md`, "# guide\n");
  write(`out/${S1}.mp4`, "not a real video");
  write(`out/thumbnail-${S1}.png`, "not a real png");
  // an unrefined throwaway pack is NOT READY: refused (exit 3), nothing written to out/<slug>/
  const r0 = spawnSync(process.execPath, [path.join(__dirname, "package-youtube.js"), `--slug=${S1}`], { encoding: "utf8" });
  t("NOT READY pack: refused (exit 3) with the problems listed, no bundle made", r0.status === 3 && /YouTube NOT READY/.test(r0.stderr) && /NOT_REFINED/.test(r0.stderr) && !fs.existsSync(path.join(ROOT, "out", S1)), r0.status + " " + r0.stderr.slice(0, 200));
  const r1 = spawnSync(process.execPath, [path.join(__dirname, "package-youtube.js"), `--slug=${S1}`, "--allow-unready=test fixture"], { encoding: "utf8" });
  const D1 = path.join(ROOT, "out", S1);
  const files = fs.existsSync(D1) ? fs.readdirSync(D1).sort() : [];
  t("runs (exit 0)", r1.status === 0, r1.stderr);
  t("the clean VTT is packaged as <slug>.clean.vtt, byte-identical", fs.existsSync(path.join(D1, `${S1}.clean.vtt`)) && fs.readFileSync(path.join(D1, `${S1}.clean.vtt`), "utf8") === CLEAN);
  t("no captions.srt", !files.includes("captions.srt"), files.join(","));
  t("no second caption copy (captions.vtt)", !files.includes("captions.vtt"), files.join(","));
  t("exactly one caption file in the bundle", files.filter((f) => /\.(vtt|srt|sbv|ttml)$/i.test(f)).length === 1, files.join(","));
  t("stdout names the one caption file and never SRT", new RegExp(`${S1}\\.clean\\.vtt`).test(r1.stdout) && !/srt/i.test(r1.stdout), r1.stdout);
  t("the rest of the bundle is still made (video, thumbnail, metadata, guide)", ["video.mp4", `${S1}.mp4`, "thumbnail.png", "title.txt", "description.txt", "tags.txt", "chapters.txt", "youtube-meta.json", "youtube.md"].every((f) => files.includes(f)), files.join(","));

  // only the raw word-timed VTT exists: nothing is packaged under the clean name
  write(`public/captions/${S2}.vtt`, RAW);
  const r2 = spawnSync(process.execPath, [path.join(__dirname, "package-youtube.js"), `--slug=${S2}`, "--allow-unready=test fixture"], { encoding: "utf8" });
  const D2 = path.join(ROOT, "out", S2);
  const files2 = fs.existsSync(D2) ? fs.readdirSync(D2) : [];
  t("raw VTT only: exit 0, no caption file packaged, a warning names the missing clean.vtt", r2.status === 0 && !files2.some((f) => /\.(vtt|srt)$/i.test(f)) && /clean\.vtt not found/.test(r2.stdout + r2.stderr), files2.join(",") + " | " + (r2.stdout + r2.stderr).slice(-200));

  // a rolling raw VTT saved under the clean name: never packaged, even with --allow-unready
  const S3 = `zz-package-youtube-roll-${process.pid}`;
  write(`public/captions/${S3}.clean.vtt`, "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nSo, a bat and a ball\n\n00:00:02.000 --> 00:00:04.000\nSo, a bat and a ball\ncost a dollar ten\n");
  const r3 = spawnSync(process.execPath, [path.join(__dirname, "package-youtube.js"), `--slug=${S3}`, "--allow-unready=test fixture"], { encoding: "utf8" });
  const D3 = path.join(ROOT, "out", S3);
  t("rolling VTT under the clean name: not packaged, the validator's reason printed", !(fs.existsSync(D3) && fs.readdirSync(D3).some((f) => /.vtt$/.test(f))) && /ROLLING_CUES/.test(r3.stderr), r3.stderr.slice(-300));
  fs.rmSync(D3, { recursive: true, force: true });
} finally {
  for (const p of created) fs.rmSync(p, { force: true });
  for (const d of [path.join(ROOT, "out", S1), path.join(ROOT, "out", S2), path.join(ROOT, "books", S1)]) fs.rmSync(d, { recursive: true, force: true });
}
const outAfter = fs.existsSync(path.join(ROOT, "out")) ? fs.readdirSync(path.join(ROOT, "out")).sort().join("\n") : "";
t("no other bundle or file in out/ was touched (listing identical)", outBefore === outAfter);
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
