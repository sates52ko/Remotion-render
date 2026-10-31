#!/usr/bin/env node
/**
 * audit-antidote.js — the VISUAL EVENT RATE gate for the Antidote engine.
 *
 * A hand-animated channel is disciplined by a person watching the cut: if
 * nothing has happened on screen for eight seconds, they feel it and fix it. A
 * generated film has no such reflex, and the failure is invisible in the config
 * — every scene looks fine on its own, and the video is still boring.
 *
 * So make it measurable. A VISUAL EVENT is any frame where the picture changes
 * in a way a viewer notices: a cut, a callout landing, a motif drawing in, a
 * camera punch, a chapter card. This walks the whole timeline, finds every
 * window with no event, and fails the plan when one runs longer than the budget.
 *
 * It also reports the things that made the old engine read as a template —
 * presenter-shot share, the longest run of one shot, how many beats never leave
 * the same location — so a regression shows up as a number, not as a vibe.
 *
 * Usage:
 *   node scripts/audit-antidote.js --slug=<slug> [--max-gap=8] [--soft] [--json]
 *   node scripts/audit-antidote.js --all
 */
const fs = require("fs");
const path = require("path");
const { abs, rel } = require("./lib/paths");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);

const MAX_GAP = args["max-gap"] ? parseFloat(args["max-gap"]) : 8;
const SOFT = !!args.soft;
const AS_JSON = !!args.json;

// Shots where the frame is a person talking at the viewer. Necessary, but a film
// that is mostly these is a podcast with a face on it.
const PRESENTER = new Set(["medium", "closeUp"]);
// Shots that draw the full rig (mirrors charsFull in src/engines/antidote/shots.ts).
const FULL_BODY = new Set(["wide", "crowd", "diorama", "illustration", "lowAngle", "silhouette"]);

const tc = (frames, fps) => {
  const t = frames / fps;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
};

function auditConfig(config, label) {
  const fps = (config.meta && config.meta.fps) || 30;
  const scenes = config.scenes || [];
  const total = (config.meta && config.meta.durationInFrames) || 0;

  // ── every frame where the picture visibly changes ─────────────────────────
  const events = [];
  const push = (frame, kind, sceneId) => events.push({ frame: Math.round(frame), kind, sceneId });

  const shots = {};
  const sets = {};
  let presenter = 0;
  let sustained = 0;
  let fullBody = 0;
  const business = { walk: 0, sit: 0, hold: 0, reach: 0 };
  let held = 0;
  const silentScenes = [];
  let longestRun = { shot: "", n: 0 };
  let run = { shot: "", n: 0 };

  scenes.forEach((sc) => {
    const from = sc.fromFrame || 0;
    const dur = sc.durationFrames || 0;
    const shot = sc.shot || "medium";
    shots[shot] = (shots[shot] || 0) + 1;
    if (PRESENTER.has(shot)) presenter += 1;
    if (FULL_BODY.has(shot)) fullBody += 1;
    if (sc._take === "sustained") sustained += 1;
    const set = (sc.bg && sc.bg.set) || "none";
    sets[set] = (sets[set] || 0) + 1;

    if (shot === run.shot) run.n += 1;
    else run = { shot, n: 1 };
    if (run.n > longestRun.n) longestRun = { ...run };

    // A sustained beat is a deliberate NON-cut, so it doesn't get a cut event —
    // that is exactly the thing this audit should notice and charge for.
    if (sc._take !== "sustained") push(from, "cut", sc.id);
    if (sc.chapterCard) push(from, "card", sc.id);

    let own = 0;
    (sc.props || []).forEach((p) => { push(from + (p.at || 0), `motif:${p.type}`, sc.id); own += 1; });
    (sc.texts || []).forEach((t) => { push(from + (t.at || 0), "callout", sc.id); own += 1; });
    if (sc.camera && sc.camera.punch) push(from + (sc.camera.punch.at || 0), "punch", sc.id);
    // LATE PULSES — the camera push-ins that fill a long scene's tail. They are
    // real on-screen changes, so they count; a scene that already runs events to
    // its end is given none by the planner, so this cannot inflate a busy scene.
    (sc.camera && sc.camera.pulses ? sc.camera.pulses : []).forEach((at) => {
      push(from + (at || 0), "pulse", sc.id); own += 1;
    });
    (sc.characters || []).forEach((c) => {
      if (c.action && business[c.action] !== undefined) business[c.action] += 1;
      if (c.holds) held += 1;
    });

    // a long scene whose only event is its own cut is dead air by construction
    if (own === 0 && dur / fps >= 5) silentScenes.push({ id: sc.id, secs: +(dur / fps).toFixed(1), at: tc(from, fps) });
  });

  events.sort((a, b) => a.frame - b.frame);

  // ── gaps between consecutive events ───────────────────────────────────────
  const gaps = [];
  for (let i = 1; i < events.length; i++) {
    const g = (events[i].frame - events[i - 1].frame) / fps;
    if (g > 0) gaps.push({ secs: +g.toFixed(2), from: tc(events[i - 1].frame, fps), after: events[i - 1].kind, sceneId: events[i - 1].sceneId });
  }
  if (events.length && total) {
    const tail = (total - events[events.length - 1].frame) / fps;
    if (tail > 0) gaps.push({ secs: +tail.toFixed(2), from: tc(events[events.length - 1].frame, fps), after: "last event", sceneId: events[events.length - 1].sceneId });
  }
  gaps.sort((a, b) => b.secs - a.secs);
  const over = gaps.filter((g) => g.secs > MAX_GAP);

  const mins = total / fps / 60;
  const report = {
    label,
    scenes: scenes.length,
    minutes: +mins.toFixed(1),
    sceneSecsAvg: scenes.length ? +((total / fps) / scenes.length).toFixed(1) : 0,
    events: events.length,
    eventsPerMin: mins ? +(events.length / mins).toFixed(1) : 0,
    worstGapSecs: gaps.length ? gaps[0].secs : 0,
    gapsOverBudget: over.length,
    presenterShare: scenes.length ? +((presenter / scenes.length) * 100).toFixed(1) : 0,
    fullBodyShare: scenes.length ? +((fullBody / scenes.length) * 100).toFixed(1) : 0,
    sustainedTakes: sustained,
    heldProps: held,
    business,
    longestSameShotRun: longestRun.n,
    longestSameShot: longestRun.shot,
    distinctSets: Object.keys(sets).length,
    shots,
    sets,
    silentScenes: silentScenes.slice(0, 12),
    worstGaps: gaps.slice(0, 10),
    pass: over.length === 0,
  };
  return report;
}

function print(r) {
  const bar = (n, of) => "█".repeat(Math.max(0, Math.round((n / Math.max(1, of)) * 24)));
  console.log(`\n── ${r.label} ──────────────────────────────────────────`);
  console.log(`   ${r.scenes} scenes · ${r.minutes} min · ${r.sceneSecsAvg}s avg scene`);
  console.log(`   visual events: ${r.events}  (${r.eventsPerMin}/min)   worst gap: ${r.worstGapSecs}s  (budget ${MAX_GAP}s)`);
  console.log(`   presenter shots: ${r.presenterShare}%   full-body: ${r.fullBodyShare}%   sustained takes: ${r.sustainedTakes}`);
  console.log(`   business: walk ${r.business.walk} · sit ${r.business.sit} · hold ${r.business.hold} · held props ${r.heldProps}`);
  console.log(`   locations: ${r.distinctSets} distinct   longest same-shot run: ${r.longestSameShotRun} (${r.longestSameShot})`);
  const topShots = Object.entries(r.shots).sort((a, b) => b[1] - a[1]);
  console.log("   shots:");
  for (const [k, v] of topShots) console.log(`     ${k.padEnd(13)} ${String(v).padStart(4)} ${bar(v, r.scenes)}`);
  const topSets = Object.entries(r.sets).sort((a, b) => b[1] - a[1]);
  console.log("   sets:");
  for (const [k, v] of topSets) console.log(`     ${k.padEnd(13)} ${String(v).padStart(4)} ${bar(v, r.scenes)}`);
  if (r.worstGaps.length) {
    console.log("   longest dead windows:");
    for (const g of r.worstGaps.slice(0, 6)) console.log(`     ${g.secs}s from ${g.from} (after ${g.after}, ${g.sceneId})`);
  }
  if (r.silentScenes.length) {
    console.log(`   scenes with no callout and no motif (${r.silentScenes.length} shown up to 12):`);
    for (const s of r.silentScenes) console.log(`     ${s.at}  ${s.id}  ${s.secs}s`);
  }
  console.log(r.pass ? `   ✓ PASS — no window longer than ${MAX_GAP}s` : `   ✗ FAIL — ${r.gapsOverBudget} window(s) longer than ${MAX_GAP}s`);
}

const targets = [];
if (args.all) {
  const dir = path.join(process.cwd(), "books");
  for (const slug of fs.readdirSync(dir)) {
    const f = path.join(dir, slug, "config.antidote.json");
    if (fs.existsSync(f)) targets.push([slug, f]);
  }
} else if (args.config) {
  targets.push([path.basename(args.config), args.config]);
} else if (args.slug) {
  targets.push([args.slug, abs.antidoteConfig(args.slug)]);
} else {
  console.error("usage: node scripts/audit-antidote.js --slug=<slug> | --config=<file> | --all  [--max-gap=8] [--soft] [--json]");
  process.exit(2);
}

const reports = [];
for (const [label, file] of targets) {
  if (!fs.existsSync(file)) { console.error(`missing: ${file}`); continue; }
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const r = auditConfig(config, label);
  reports.push(r);
  if (!AS_JSON) print(r);
}
if (AS_JSON) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));

const failed = reports.filter((r) => !r.pass);
if (failed.length && !SOFT) {
  console.error(`\n${failed.length} book(s) over the ${MAX_GAP}s visual-event budget: ${failed.map((f) => f.label).join(", ")}`);
  process.exit(1);
}
