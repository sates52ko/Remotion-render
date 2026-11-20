#!/usr/bin/env node
/**
 * p8-replan-vtt.mjs — P8 Aşama 1 support (2026-10-05).
 *
 * The production re-plan (plan-antidote) needs the WORD-TIMED VTT the book was
 * originally planned from. Those .vtt files are gone for the pinned corpus —
 * only the caption-line .clean.vtt remain, which parseWords rejects ("No words
 * parsed from VTT").
 *
 * But the config's OWN captions carry the full word stream (w/s/e in frames) —
 * the frame-precision record of the original parse. This tool writes a
 * synthetic word-timed VTT back from that record (t = s/30 exactly), so the
 * re-plan consumes the SAME words at the SAME times with the SAME builder
 * (parseWords → buildCaptions → segmentation). No new timing source, no LLM.
 *
 * Usage: node scripts/p8-replan-vtt.mjs --slug=<slug> [--out=<file>]
 */
import fs from "fs";
import path from "path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const slug = args.slug;
if (!slug) {
  console.error("Usage: node scripts/p8-replan-vtt.mjs --slug=<slug> [--out=<file>]");
  process.exit(1);
}
const root = process.cwd();
const FPS = 30;
const config = JSON.parse(fs.readFileSync(path.join(root, "books", slug, "config.antidote.json"), "utf8"));
const captions = config.captions || [];
if (!captions.length) {
  console.error(`ERROR: ${slug} config has no captions`);
  process.exit(1);
}

const stamp = (seconds) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(rest).padStart(3, "0")}`;
};

let out = "WEBVTT\n";
let words = 0;
captions.forEach((c, ci) => {
  out += `\n${ci + 1}\n`;
  out += `${stamp(c.startFrame / FPS)} --> ${stamp(c.endFrame / FPS)}\n`;
  const inline = (c.words || [])
    .map((w) => `<${stamp(w.s / FPS)}><c>${String(w.w).replace(/</g, "&lt;")}</c>`)
    .join(" ");
  out += inline + "\n";
  words += (c.words || []).length;
});

const outPath = args.out || path.join(root, ".freebuff", "p8", `${slug}.words.vtt`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log(`${slug}: ${words} words across ${captions.length} captions → ${path.relative(root, outPath)}`);
