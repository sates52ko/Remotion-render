/**
 * film-flow.js — does a film MOVE like a film? Numbers from the config, no render (2026-11-12, Film Flow slice 0).
 *
 * Every verdict so far is still-frame comprehension (mute test, readcheck, A/B strips). Motion, rhythm, camera and
 * variety are invisible to a still, so five director attempts could not show a gain and the flow features ship unused.
 * These are the measures the stills cannot see, read straight from what will be rendered:
 *   - how much of the film is a figure and a text and nothing else, and how often anybody DOES something;
 *   - how often a scene is the previous one again (shot / set / cast), and for how long;
 *   - whether the rhythm is a metronome (variation of scene length, runs of alike lengths);
 *   - whether the camera does the same thing everywhere, and whether anything is carried across a cut.
 * Report-only: no gate, no threshold. Pure functions; tested by test-film-flow.js.
 */
const { mentionCoverage } = require("./told-entities");
const PASSIVE = new Set(["talk", "idle", "think"]);

const quant = (xs, q) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null; };
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const cv = (xs) => { const m = mean(xs); if (!m) return null; return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m; };
const share = (n, d) => (d ? n / d : null);
const count = (xs) => { const o = {}; for (const x of xs) o[x] = (o[x] || 0) + 1; return o; };
const longestRun = (xs, same) => { let best = xs.length ? 1 : 0, run = 1; for (let i = 1; i < xs.length; i++) { run = same(xs[i - 1], xs[i]) ? run + 1 : 1; if (run > best) best = run; } return best; };

/** Scenes inside [fromSec, toSec) — a passage of the film (by scene start). */
function windowed(list, fps, win) {
  if (!win) return list;
  return list.filter((s) => s.fromFrame / fps >= win[0] && s.fromFrame / fps < win[1]);
}

const castOf = (s) => (s.characters || []).map((c) => c.identity || c.id || "?").sort().join("+");
const hasObject = (s) => (s.props || []).length > 0 || !!s.diagram || !!s.concept || (s.characters || []).some((c) => c.holds) || !!s.semantic || !!s.told || (s.shots || []).length > 0;
const acts = (s) => (s.characters || []).some((c) => (c.action && !PASSIVE.has(c.action)) || c.travel) || (s.shots || []).length > 0 || !!s.semantic || !!s.told;
const camClass = (c) => {
  if (!c) return "none";
  const z = c.zoom ? Math.sign(Math.round((c.zoom[1] - c.zoom[0]) * 1000)) : 0;
  const pan = (c.panX && c.panX[0] !== c.panX[1]) || (c.panY && c.panY[0] !== c.panY[1]);
  return `${z > 0 ? "in" : z < 0 ? "out" : "still"}${pan ? "+pan" : ""}${c.punch ? "+punch" : ""}${c.target || c.follow ? "+target" : ""}`;
};
/** What two neighbouring scenes share that the eye could follow across the cut. */
const carried = (a, b) => {
  if (b.continueFromPrev) return true;
  // an object in a hand and the same object standing alone are one thing to the eye
  const objs = (s) => new Set([...(s.props || []).map((p) => `o:${p.type}`), ...(s.characters || []).filter((c) => c.holds).map((c) => `o:${c.holds}`), s.diagram ? `d:${s.diagram.type}` : null, s.concept ? `c:${s.concept}` : null].filter(Boolean));
  const x = objs(a);
  for (const o of objs(b)) if (x.has(o)) return true;
  return false;
};

function antidoteFlow(config, { window: win = null } = {}) {
  const fps = (config.meta && config.meta.fps) || 30;
  const scenes = windowed((config.scenes || []).filter((s) => Number.isFinite(s.fromFrame) && Number.isFinite(s.durationFrames)), fps, win);
  const n = scenes.length;
  const len = scenes.map((s) => s.durationFrames / fps);
  const pairs = scenes.slice(1).map((s, i) => [scenes[i], s]);
  const withCast = scenes.filter((s) => (s.characters || []).length > 0);
  const cams = scenes.map((s) => camClass(s.camera));
  const camCounts = count(cams);
  const designed = pairs.filter(([, b]) => b.transition && b.transition.type && b.transition.type !== "cut");
  // of the scenes that name a person / company / product / place, how many put that name on screen (told-entities.js).
  // On a short passage every name counts; on a whole film only the ones said in two or more scenes.
  const said = mentionCoverage({ scenes }, { min: win ? 1 : 2 });
  return {
    said: { entities: said.entities, mentions: said.mentions, shown: said.shown, share: said.share },
    engine: "antidote", scenes: n, minutes: len.reduce((s, x) => s + x, 0) / 60,
    scenesPerMin: n ? n / (len.reduce((s, x) => s + x, 0) / 60) : null,
    length: { median: quant(len, 0.5), p10: quant(len, 0.1), p90: quant(len, 0.9), cv: cv(len), alikeRun: longestRun(len, (a, b) => Math.abs(a - b) <= 0.15 * Math.max(a, b)) },
    picture: {
      figureAndTextOnly: share(withCast.filter((s) => !hasObject(s)).length, n),
      nobodyActs: share(scenes.filter((s) => !acts(s)).length, n),
      castOnlyTalksOrIdles: share(withCast.filter((s) => (s.characters || []).every((c) => PASSIVE.has(c.action || "idle") && !c.travel)).length, n),
      travels: scenes.filter((s) => (s.characters || []).some((c) => c.travel)).length,
      diagrams: count(scenes.filter((s) => s.diagram).map((s) => s.diagram.type)),
      innerCuts: scenes.filter((s) => (s.shots || []).length > 0).length,
      relationStages: scenes.filter((s) => s.semantic).length,
    },
    repetition: {
      sameShot: share(pairs.filter(([a, b]) => a.shot === b.shot).length, pairs.length),
      sameSet: share(pairs.filter(([a, b]) => (a.bg && a.bg.set) === (b.bg && b.bg.set)).length, pairs.length),
      sameCast: share(pairs.filter(([a, b]) => castOf(a) === castOf(b)).length, pairs.length),
      allThree: share(pairs.filter(([a, b]) => a.shot === b.shot && (a.bg && a.bg.set) === (b.bg && b.bg.set) && castOf(a) === castOf(b)).length, pairs.length),
      longestSameShotAndSet: longestRun(scenes, (a, b) => a.shot === b.shot && (a.bg && a.bg.set) === (b.bg && b.bg.set)),
      shots: count(scenes.map((s) => s.shot || "?")),
    },
    camera: {
      classes: camCounts, distinct: Object.keys(camCounts).length,
      topTwoShare: share(Object.values(camCounts).sort((a, b) => b - a).slice(0, 2).reduce((s, x) => s + x, 0), n),
      punch: share(scenes.filter((s) => s.camera && s.camera.punch).length, n),
      pulsesPerScene: mean(scenes.map((s) => ((s.camera && s.camera.pulses) || []).length)),
      purposeful: share(scenes.filter((s) => s.camera && (s.camera.target || s.camera.follow || s.camera.purpose)).length, n),
      sameMoveAsPrevious: share(pairs.filter(([a, b]) => camClass(a.camera) === camClass(b.camera)).length, pairs.length),
    },
    cuts: {
      hard: share(pairs.filter(([, b]) => !b.transition || !b.transition.type || b.transition.type === "cut").length, pairs.length),
      carried: share(pairs.filter(([a, b]) => carried(a, b)).length, pairs.length),
      sameDesignedTwice: share(designed.filter(([a, b]) => a.transition && a.transition.type === b.transition.type).length, designed.length),
    },
  };
}

function voxFlow(config, { window: win = null } = {}) {
  const fps = (config.meta && config.meta.fps) || 30;
  const beats = windowed((config.beats || []).filter((s) => Number.isFinite(s.fromFrame) && Number.isFinite(s.durationFrames)), fps, win);
  const n = beats.length, len = beats.map((b) => b.durationFrames / fps), minutes = len.reduce((s, x) => s + x, 0) / 60;
  const types = count(beats.map((b) => b.type || "?"));
  const pairs = beats.slice(1).map((b, i) => [beats[i], b]);
  return {
    engine: "vox", scenes: n, minutes, scenesPerMin: n ? n / minutes : null,
    length: { median: quant(len, 0.5), p10: quant(len, 0.1), p90: quant(len, 0.9), cv: cv(len), alikeRun: longestRun(len, (a, b) => Math.abs(a - b) <= 0.15 * Math.max(a, b)) },
    picture: { types, topTypeShare: share(Math.max(0, ...Object.values(types)), n), imagesPerMin: minutes ? beats.reduce((s, b) => s + ((b.images || []).length), 0) / minutes : null },
    repetition: { sameTypeAsPrevious: share(pairs.filter(([a, b]) => a.type === b.type).length, pairs.length), longestSameType: longestRun(beats, (a, b) => a.type === b.type) },
    cuts: { hard: share(pairs.filter(([, b]) => !b.transition).length, pairs.length) },
  };
}

const filmFlow = (config, opts) => (config.beats && !config.scenes ? voxFlow(config, opts) : antidoteFlow(config, opts));

const pct = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);
const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "–");

/** One row per measure, one column per film — the table every slice is judged by (lower is better unless marked ↑). */
function flowTable(named) {
  const anti = named.filter(([, f]) => f.engine === "antidote"), vox = named.filter(([, f]) => f.engine === "vox");
  const out = [];
  const table = (films, rows) => {
    out.push(`| measure | ${films.map(([name]) => name).join(" | ")} |`, `|---|${films.map(() => "---").join("|")}|`);
    for (const [label, fn] of rows) out.push(`| ${label} | ${films.map(([, f]) => fn(f)).join(" | ")} |`);
    out.push("");
  };
  if (anti.length) table(anti, [
    ["scenes / minutes", (f) => `${f.scenes} / ${num(f.minutes)}`],
    ["what the narration names is on screen ↑", (f) => (f.said.mentions ? `${pct(f.said.share)} (${f.said.shown} of ${f.said.mentions} scenes)` : "–")],
    ["figure + text only", (f) => pct(f.picture.figureAndTextOnly)],
    ["nobody does anything", (f) => pct(f.picture.nobodyActs)],
    ["cast only talks or idles", (f) => pct(f.picture.castOnlyTalksOrIdles)],
    ["same shot + set + cast as the scene before", (f) => pct(f.repetition.allThree)],
    ["longest run of one shot in one set", (f) => String(f.repetition.longestSameShotAndSet)],
    ["scene length: median s (p10–p90)", (f) => `${num(f.length.median)} (${num(f.length.p10)}–${num(f.length.p90)})`],
    ["scene length variation ↑ (0.30+ is uneven)", (f) => num(f.length.cv, 2)],
    ["longest run of alike lengths", (f) => String(f.length.alikeRun)],
    ["camera: two most used moves cover", (f) => pct(f.camera.topTwoShare)],
    ["camera: same move as the scene before", (f) => pct(f.camera.sameMoveAsPrevious)],
    ["camera with a purpose ↑", (f) => pct(f.camera.purposeful)],
    ["cuts that carry something ↑", (f) => pct(f.cuts.carried)],
    ["same designed transition twice in a row", (f) => pct(f.cuts.sameDesignedTwice)],
    ["scenes with inner cuts / relation stages ↑", (f) => `${f.picture.innerCuts} / ${f.picture.relationStages}`],
    ["characters crossing the frame ↑", (f) => String(f.picture.travels)],
  ]);
  if (vox.length) table(vox, [
    ["beats / minutes", (f) => `${f.scenes} / ${num(f.minutes)}`],
    ["most used beat type covers", (f) => pct(f.picture.topTypeShare)],
    ["same type as the beat before", (f) => pct(f.repetition.sameTypeAsPrevious)],
    ["longest run of one type", (f) => String(f.repetition.longestSameType)],
    ["beat length variation ↑", (f) => num(f.length.cv, 2)],
    ["images per minute ↑", (f) => num(f.picture.imagesPerMin)],
    ["hard cuts", (f) => pct(f.cuts.hard)],
  ]);
  return out.join("\n");
}

module.exports = { PASSIVE, antidoteFlow, voxFlow, filmFlow, flowTable, camClass, carried, cv, quant, longestRun };
