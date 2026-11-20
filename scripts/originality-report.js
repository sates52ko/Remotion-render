#!/usr/bin/env node
/**
 * originality-report.js — HOW MUCH OF THIS FILM IS THIS BOOK'S OWN? (2026-11-18, YPP "generic or repetitive content")
 *
 *   node scripts/originality-report.js --slug=<slug> [--book-root=<checkout>] [--json]
 *
 * One page per book, from the planned config and the book's files — every number that says whether this film could be
 * mistaken for another one of the channel:
 *   TOLD      the narrative form, the parts the hosts announced, the minutes, how much of it tells the book
 *   PEOPLE    the cast on screen: how many wear a head drawn for this book; seen blind as intended
 *   PLACES    the film's time at a place the book drew; its home; the time left in shared sets
 *   THINGS    told things shown as the book's own drawing; the icons of the figure scenes: own against shared library
 *   CHANNEL   the film of the shelf it is most alike in shared material, and how much
 * and under them ONE line for the hand-off report. It reports and never refuses: what a number must be is the
 * operator's decision. A producing agent runs it before the hand-off and pastes its last line (skill preview-hazirla §5).
 * A missing piece (no VTT yet, no entities.json) is said as missing, never guessed. No model call, no render.
 */
const fs = require("fs");
const path = require("path");
const OD = require("./lib/own-drawings");
const { placeShare } = require("./lib/told-apply");
const { profile, alike } = require("./cross-book-similarity");
const NF = require("./lib/narrative-form");
const { namesIn } = require("./lib/told-entities");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch { return null; } };
const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)} %`);

/** Everything the page says, from the files of one book. Pure given what it is handed. */
function report({ config, book = {}, entities = {}, peopleVerdict = null, drawingsVerdict = null, shelf = [] }) {
  const scenes = (config && config.scenes) || [];
  const total = scenes.reduce((n, s) => n + (s.durationFrames || 0), 0) || 1, fps = (config.meta && config.meta.fps) || 30;
  // TOLD
  const form = (config.meta && config.meta.form) || null, narration = scenes.map((s) => s._narration || "").join(" ");
  // the narration as it was SAID (captions), against the lines most of the channel's films share
  const said = (config.captions || []).map((c) => c.text).join(" "), CP = require("./lib/channel-phrases"), cpData = CP.load(), lines = cpData ? CP.rate(said || narration, cpData) : null;
  // how much of it TELLS the book (lib/story-share.js): words in stretches that name it, by names and by its own things
  const SS = require("./lib/story-share"), ssNames = SS.storyShare(said || narration), ssThings = SS.storyShare(said || narration, { vocab: SS.vocabOf(entities) });
  const told = { form: form ? form.key : (book.form && book.form.key) || null, formName: form ? form.name : null, parts: form ? form.parts.length : 0, minutes: total / fps / 60,
    story: ssThings ? ssThings.share : null, storyNames: ssNames ? ssNames.share : null, storyWithThings: !!(ssThings && ssThings.withThings), longestTalk: ssThings ? ssThings.longestTalkWords : null, kind: (book.engineProfile && book.engineProfile.kind) || null, take: !!(book.take && book.take.text), lines: lines ? lines.per1000 : null, linesMedian: cpData ? cpData.median : null, linesTop: lines ? lines.said.slice(0, 3) : [] };
  // PEOPLE: who is on screen (told stages by id, figure scenes by role) and who of them wears a drawn head
  const onScreen = new Set();
  for (const s of scenes) { if (s.told) for (const it of s.told.items || []) { if (it.kind === "figure") onScreen.add(String(it.id).split("~")[0]); } else for (const c of s.characters || []) if (c.role) onScreen.add(c.role); }
  const cast = (config.meta && config.meta.cast) || {};
  const drawnHead = (id) => { const e = entities[id]; const v = (e && e.look) || (cast[id] && cast[id].variant) || {}; const d = v.drawn || {}; return ["back", "face", "hair", "top"].some((k) => (d[k] || []).length); };
  // cast-sheet.js --judge writes { drawings: { "person:<id>": { ok } } } (the first real book: 8 of 8 named, reported "not seen")
  const seen = peopleVerdict && (peopleVerdict.people || peopleVerdict.drawings) ? Object.values(peopleVerdict.people || peopleVerdict.drawings) : [];
  const people = { onScreen: onScreen.size, drawn: [...onScreen].filter(drawnHead).length, seenBlind: seen.filter((r) => r.ok).length, tested: seen.length };
  // PLACES
  const ps = placeShare(config), prof = profile(config, book);
  const home = Object.keys(entities).find((id) => entities[id] && entities[id].home === true) || null;
  const places = { own: ps.share, shared: prof.shared, told: prof.told, home, drawnPlaces: Object.values(entities).filter((e) => e && e.kind === "place" && ((e.backdrop && e.backdrop.paths) || e.paths)).length };
  // THINGS
  const ds = OD.drawnShare(config), ic = OD.iconShare(config), named = drawingsVerdict && drawingsVerdict.drawings ? Object.values(drawingsVerdict.drawings) : [];
  const things = { toldOwn: ds.share, toldDrawn: ds.drawn, toldEmblem: ds.emblem, iconsOwn: ic.own, iconsLibrary: ic.library, iconsWorn: ic.staples, wornTop: ic.staplesTop.slice(0, 4), libraryTop: ic.libraryTop.slice(0, 4), namedBlind: named.filter((r) => r.ok).length, drawings: named.length };
  // CHANNEL
  const pairs = shelf.map((o) => ({ slug: o.slug, alike: alike(prof, o) })).sort((a, b) => b.alike - a.alike);
  const channel = { films: shelf.length, most: pairs[0] || null, median: pairs.length ? pairs[Math.floor(pairs.length / 2)].alike : null };
  return { told, people, places, things, channel };
}

/** The one line a hand-off report carries (Turkish: the operator reads it). */
function line(r) {
  const t = r.told, p = r.people, pl = r.places, th = r.things, ch = r.channel;
  return `Özgünlük: biçim ${t.form ? `${t.form}${t.parts >= 3 ? ` (${t.parts} bölüm sayıldı)` : " (bölümler sayılmadı)"}` : "yok"} · hikâye payı ${pct(t.story)} (yalnız adlarla ${pct(t.storyNames)})${t.lines != null ? ` · kanal kalıbı ${t.lines}/1000 kelime (kanal ortancası ${t.linesMedian})` : ""} · kadro ${p.drawn}/${p.onScreen} kendi kafasıyla · kitabın yerinde ${pct(pl.own)} (ortak sette ${pct(pl.shared)}) · ikon ${th.iconsOwn} kendi / ${th.iconsLibrary} kütüphane${th.iconsWorn ? ` (${th.iconsWorn} tanesi kanalın her filminde görünen ikon)` : ""}${ch.most ? ` · en benzer film ${ch.most.slug} ${ch.most.alike.toFixed(2)}` : ""}`;
}

if (require.main === module) {
  if (typeof args.slug !== "string") { console.error("usage: node scripts/originality-report.js --slug=<slug> [--book-root=<checkout>] [--json]"); process.exit(2); }
  const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, "..")), BOOK = path.join(ROOT, "books", args.slug);
  const config = read(path.join(BOOK, "config.antidote.json"));
  if (!config) { console.error(`originality-report: no ${path.relative(ROOT, path.join(BOOK, "config.antidote.json"))} (an Antidote book that has been planned)`); process.exit(1); }
  // the shelf it is compared with: every other Antidote film of this checkout and of the repo this script runs from
  const shelf = [], seenSlug = new Set([args.slug]);
  for (const base of [ROOT, path.join(__dirname, "..")]) { let dirs = []; try { dirs = fs.readdirSync(path.join(base, "books")); } catch {} for (const s of dirs) { if (seenSlug.has(s)) continue; const c = read(path.join(base, "books", s, "config.antidote.json")); if (c && (c.scenes || []).length >= 20) { seenSlug.add(s); shelf.push({ slug: s, ...profile(c, read(path.join(base, "books", s, "book.json")) || {}) }); } } }
  const r = report({ config, book: read(path.join(BOOK, "book.json")) || {}, entities: read(path.join(BOOK, "storyboard", "entities.json")) || {}, peopleVerdict: read(path.join(BOOK, "storyboard", "own-people.verdict.json")), drawingsVerdict: read(path.join(BOOK, "storyboard", "own-drawings.verdict.json")), shelf });
  if (args.json) { console.log(JSON.stringify({ slug: args.slug, ...r, line: line(r) }, null, 1)); process.exit(0); }
  const { told: t, people: p, places: pl, things: th, channel: ch } = r;
  console.log(`ORIGINALITY — ${args.slug}  (${t.minutes.toFixed(1)} min, ${config.scenes.length} scenes)\n`);
  console.log(`TOLD     form: ${t.form ? `${t.form}${t.formName ? ` — ${t.formName}` : ""}` : "none recorded (the one old spine)"} · parts announced by the hosts: ${t.parts >= 3 ? t.parts : `${t.parts} (the form track and boards need 3)`}`);
  { const SS = require("./lib/story-share"), base = t.kind === "fiction" ? SS.CHANNEL.fiction : t.kind === "nonfiction" ? SS.CHANNEL.nonfiction : SS.CHANNEL.all;
    console.log(`         story: ${pct(t.story)} of the words stand in stretches that name the book${t.storyWithThings ? " (its people, places and things)" : ""} · by proper names alone ${pct(t.storyNames)} (channel ${t.kind || "all"}: ${pct(base)}) · longest stretch naming nothing: ${t.longestTalk} words · the producer's own view in the prompt: ${t.take ? "yes" : "no"}`); }
  if (t.lines != null) console.log(`         lines most of the channel's narrations share: ${t.lines} per 1000 words (channel median ${t.linesMedian})${t.linesTop.length ? ` — ${t.linesTop.map(([g, n]) => `"${g}" ×${n}`).join(", ")}` : ""}`);
  console.log(`PEOPLE   ${p.onScreen} on screen · ${p.drawn} wear a head drawn for this book${p.tested ? ` · seen blind as intended ${p.seenBlind} of ${p.tested}` : " · not seen blind yet (cast-sheet.js)"}`);
  console.log(`PLACES   film time at a place the book drew: ${pct(pl.own)} · on told stages ${pct(pl.told)} · in SHARED sets ${pct(pl.shared)} · places drawn: ${pl.drawnPlaces} · home: ${pl.home || "none"}`);
  console.log(`THINGS   on told stages ${th.toldDrawn} own drawing(s), ${th.toldEmblem} emblem(s) (${pct(th.toldOwn)} own) · icons beside the cast: ${th.iconsOwn} own, ${th.iconsLibrary} from the shared library${th.iconsLibrary ? ` (${th.libraryTop.map(([k, n]) => `${k} ×${n}`).join(", ")})` : ""}${th.iconsWorn ? ` — ${th.iconsWorn} of them the channel's worn icons (${th.wornTop.map(([k, n]) => `${k} ×${n}`).join(", ")})` : ""}${th.drawings ? ` · named blind ${th.namedBlind} of ${th.drawings}` : ""}`);
  console.log(`CHANNEL  ${ch.films} other films · most alike in shared material: ${ch.most ? `${ch.most.slug} ${ch.most.alike.toFixed(2)}` : "–"} · median ${ch.median == null ? "–" : ch.median.toFixed(2)} (0 = nothing shared, 1 = the same pieces for the same time)`);
  console.log(`\n${line(r)}`);
}

module.exports = { report, line };
