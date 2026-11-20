#!/usr/bin/env node
/**
 * narration-form-check.js — did the RECORDING keep the form its prompt asked for? (2026-11-18, lib/narrative-form.js)
 *
 *   node scripts/narration-form-check.js --vtt=<file.vtt> --form=<key>            (a recording that is not a book yet)
 *   node scripts/narration-form-check.js --slug=<slug> [--book-root=<checkout>]   (public/captions/<slug>.vtt + book.json form)
 *
 * NotebookLM decides what is actually said. This reads the captions and reports — it never refuses anything:
 *   - the length, and the words per minute;
 *   - the parts the hosts ANNOUNCED ("Exhibit three"), in order, and where (the on-screen label follows them);
 *   - the words every earlier film of the channel answered itself with, per 1000 words, next to the channel's
 *     measured level (13 whole caption files, 178 000 words, 2026-11-18): right 5.3, exactly 3.3, yeah 1.7,
 *     absolutely 1.0 per 1000 words;
 *   - "deep dive" and the sign-offs the prompt forbids, with the sentence they are in.
 * Report only. No model call, no render.
 */
const fs = require("fs");
const path = require("path");
const { FORMS, partBadges } = require("./lib/narrative-form");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, ".."));
let vtt = typeof args.vtt === "string" ? args.vtt : null, form = typeof args.form === "string" ? args.form : null;
if (typeof args.slug === "string") {
  vtt = vtt || path.join(ROOT, "public", "captions", `${args.slug}.vtt`);
  try { const b = JSON.parse(fs.readFileSync(path.join(ROOT, "books", args.slug, "book.json"), "utf8")); form = form || (b.form && b.form.key) || null; } catch {}
}
if (!vtt || !fs.existsSync(vtt)) { console.error("usage: node scripts/narration-form-check.js --vtt=<file.vtt> --form=<key> | --slug=<slug> [--book-root=<checkout>]"); process.exit(2); }

/** The channel's level before the forms (per 1000 words; 13 whole caption files, 178 000 words). */
const BASELINE = { right: 5.3, exactly: 3.3, yeah: 1.7, absolutely: 1.0, precisely: 0.3, fascinating: 0.2 };
const FORBIDDEN = ["deep dive", "unpack", "which brings us to", "we have to look at", "i have to push back", "a great way to put it", "i want to leave you with", "thanks for joining", "thank you for joining", "until next time", "see you next time", "catch you next time", "keep questioning", "keep diving"];

// captions → cues [{ t (seconds), text }] with the word-timing tags and the rolling duplicates of auto-captions removed
const raw = fs.readFileSync(vtt, "utf8").replace(/^﻿/, "").split(/\r?\n\r?\n/);
const sec = (s) => { const p = s.split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
const cues = [];
for (const block of raw) {
  const m = block.match(/(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})[^\n]*\n([\s\S]*)/);
  if (!m) continue;
  const lines = m[3].split(/\r?\n/).map((l) => l.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (last && (!cues.length || cues[cues.length - 1].text !== last)) cues.push({ t: sec(m[1].replace(",", ".")), end: sec(m[2].replace(",", ".")), text: last });
}
if (!cues.length) { console.error(`no cues in ${vtt}`); process.exit(1); }
const text = cues.map((c) => c.text).join(" ").toLowerCase().replace(/\s+/g, " ");
const words = text.split(" ").filter(Boolean).length, minutes = cues[cues.length - 1].end / 60;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const per1000 = (n) => Math.round((n / words) * 10000) / 10;

console.log(`${path.basename(vtt)} — ${minutes.toFixed(1)} min, ${words} words (${Math.round(words / minutes)} per minute)${form ? ` · form: ${form}` : ""}`);
// the operator's rule (2026-11-18): any recording over 30 minutes is long enough — nobody chases a longer one
console.log(minutes >= 30 ? "LENGTH: over 30 minutes — enough (operator's rule; the prompt's higher target is only what keeps it there)" : `LENGTH: ${minutes.toFixed(1)} minutes — UNDER the 30-minute floor: record again (same prompt, "Longer"); twice under → tell the operator`);

if (form && FORMS[form]) {
  const f = FORMS[form];
  const badges = partBadges(form, cues.map((c) => c.text));
  const firstAt = new Map(); badges.forEach((b, i) => { if (/\d/.test(b) && !firstAt.has(b)) firstAt.set(b, cues[i].t); });
  const asked = (text.match(new RegExp(`\\b${f.part.toLowerCase()}s?\\b`, "g")) || []).length;
  console.log(`\nPARTS the hosts announced ("${f.part.toLowerCase()} one …"): ${firstAt.size ? "" : `none in rising order (the word "${f.part.toLowerCase()}" is said ${asked}×) — the screen will show "${f.name}" without numbers`}`);
  for (const [b, t] of firstAt) console.log(`  ${mmss(t).padStart(6)}  ${b}`);
  if (firstAt.size) { const ts = [...firstAt.values()], gaps = ts.map((t, i) => ((i + 1 < ts.length ? ts[i + 1] : minutes * 60) - t) / 60); console.log(`  minutes per part: ${gaps.map((g) => g.toFixed(1)).join(" · ")}  (before the first part: ${(ts[0] / 60).toFixed(1)} min)`); }
} else if (form) console.log(`\n(unknown form "${form}" — one of ${Object.keys(FORMS).join(", ")})`);

console.log(`\nWORDS the channel's films answered themselves with — per 1000 words (channel before the forms):`);
for (const [w, base] of Object.entries(BASELINE)) { const n = (text.match(new RegExp(`\\b${w}\\b`, "g")) || []).length; const v = per1000(n); console.log(`  ${w.padEnd(12)} ${String(n).padStart(4)}×  ${String(v).padStart(5)}  (${base})  ${v <= base * 0.5 ? "much lower" : v < base * 0.85 ? "lower" : v <= base * 1.15 ? "the same" : "higher"}`); }

// STORY: how much of it TELLS. A sentence that names someone or something of the book (a proper name inside the
// sentence — lib/told-entities.js namesIn) is counted as told; the rest is talk about it. Measured 2026-11-18 on
// Dracula: the old film 37 %, the first formed recording 22 % — it argued its thesis more than it told the book.
{
  // 2026-11-20: words in STRETCHES that name the book (lib/story-share.js); with --slug and an entities.json also by the
  // book's own things. The sentence count above undercounted scenes and things; the order of the recordings stayed.
  const SS = require("./lib/story-share"), all = cues.map((c) => c.text).join(" ");
  let ent = null; try { if (typeof args.slug === "string") ent = JSON.parse(fs.readFileSync(path.join(ROOT, "books", args.slug, "storyboard", "entities.json"), "utf8")); } catch {}
  const a = SS.storyShare(all), b = ent ? SS.storyShare(all, { vocab: SS.vocabOf(ent) }) : null, p = (x) => Math.round(x * 100) + " %";
  console.log(`\nSTORY: ${p(a.share)} of the words stand in stretches that name the book by a proper name${b ? `; ${p(b.share)} when its own things count too` : ""} — channel: fiction ${p(SS.CHANNEL.fiction)}, nonfiction ${p(SS.CHANNEL.nonfiction)}; Dracula old film 71 %, v4 recording 43 % · longest stretch naming nothing: ${(b || a).longestTalkWords} words`);
}

const hits = [];
for (const ph of FORBIDDEN) { const re = new RegExp(`\\b${ph}\\b`, "g"); cues.forEach((c, i) => { if (re.test(c.text.toLowerCase())) hits.push({ ph, t: c.t, said: [cues[i - 1], c, cues[i + 1]].filter(Boolean).map((x) => x.text).join(" ").slice(0, 150) }); re.lastIndex = 0; }); }
{ // the sentences most of the channel's narrations share (lib/channel-phrases.js)
  const CP = require("./lib/channel-phrases"), data = CP.load(), r = data && CP.rate(cues.map((c) => c.text).join(" "), data);
  if (r) console.log(`\nCHANNEL LINES: ${r.per1000} per 1000 words are five-word runs that at least 15 % of the channel's ${data.films} narrations say (channel median ${data.median})${r.said.length ? ` — ${r.said.slice(0, 5).map(([g, n]) => `"${g}" ×${n}`).join(", ")}` : ""}`);
}
console.log(`\nPHRASES the prompt forbids: ${hits.length ? "" : "none said"}`);
for (const h of hits.slice(0, 20)) console.log(`  ${mmss(h.t).padStart(6)}  "${h.ph}" — ${h.said}`);
const tail = cues.slice(-4).map((c) => c.text).join(" ");
console.log(`\nLAST WORDS: ${tail.slice(-260)}`);
console.log(`FIRST WORDS: ${cues.slice(0, 6).map((c) => c.text).join(" ").slice(0, 260)}`);
