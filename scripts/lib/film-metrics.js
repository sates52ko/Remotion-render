/**
 * film-metrics.js — where a planned Antidote film stands, and how much of it is empty (2026-11-23).
 *
 * Why: the first Film Flow book (Then She Was Gone) stood in its kitchen 81 % of the time (own kitchen + the shared
 * `kitchen` set) and 17 % of its time was a figure scene with nobody in it; blind raters wrote "empty kitchen" frame
 * after frame. A YouTube reviewer jumps along the timeline (minute 5, 18, 35): what they land on must differ. These
 * numbers say it per book, from the config, before anyone watches. Pure; reports only (a bar is the operator's).
 *
 *   placeOf(scene)      → "own:<id>" (the book's drawing behind it) | "set:<name>" (a shared set) | "none"
 *   filmMetrics(config) → { frames, toldShare, places: [{place, share}], topPlace, topShare, distinct, ownShare,
 *                           emptyShare, emptyScenes, partOpenings: [{n, place}], partRepeats }
 */

/** where a scene stands: a told stage at its last backdrop, a figure scene at its own place or its shared set */
function placeOf(s) {
  if (!s) return "none";
  if (s.told) {
    const b = ((s.told.backdrops) || []).filter((x) => !x.exit).pop();
    return b ? `own:${b.id}` : "none";
  }
  if (s.bg && s.bg.own && s.bg.own.id) return `own:${s.bg.own.id}`;
  const set = s.bg && s.bg.set;
  return set && set !== "none" ? `set:${set}` : "none";
}

/** the same room, whether the book's own drawing or the shared set of that name ("own:kitchen" ≡ "set:kitchen") */
const roomOf = (p) => p.replace(/^(own|set):/, "");

/** a figure scene with nobody and nothing of the book on screen — what blind raters call "an empty room with text" */
function isEmpty(s) {
  if (!s || s.told) return false;
  const nobody = !(s.characters || []).length;
  const nothing = !(s.props || []).length && !s.concept && !s.diagram && !(s.shots || []).length;
  return nobody && nothing;
}

function filmMetrics(config) {
  const scenes = (config && config.scenes) || [];
  const frames = scenes.reduce((n, s) => n + (s.durationFrames || 0), 0) || 1;
  const byRoom = new Map();
  let told = 0, own = 0, empty = 0, emptyScenes = 0, nobody = 0;
  for (const s of scenes) {
    const f = s.durationFrames || 0, p = placeOf(s);
    if (s.told) told += f;
    if (!s.told && !(s.characters || []).length) nobody += f;
    if (p.startsWith("own:")) own += f;
    if (p !== "none") byRoom.set(roomOf(p), (byRoom.get(roomOf(p)) || 0) + f);
    if (isEmpty(s)) { empty += f; emptyScenes++; }
  }
  const places = [...byRoom.entries()].sort((a, b) => b[1] - a[1]).map(([place, f]) => ({ place, share: f / frames }));
  // the parts of the narrative form: where each one OPENS (the scene at its first frame)
  const parts = (config && config.meta && config.meta.form && Array.isArray(config.meta.form.parts)) ? config.meta.form.parts : [];
  const at = (frame) => scenes.find((s) => frame >= s.fromFrame && frame < s.fromFrame + (s.durationFrames || 0)) || null;
  const startOf = (p) => (Number.isFinite(p.from) ? p.from : Number.isFinite(p.fromFrame) ? p.fromFrame : null);
  const partOpenings = parts.filter((p) => startOf(p) != null).map((p) => ({ n: p.n, title: p.title || "", place: roomOf(placeOf(at(startOf(p)))) }));
  let partRepeats = 0;
  for (let k = 1; k < partOpenings.length; k++) if (partOpenings[k].place !== "none" && partOpenings[k].place === partOpenings[k - 1].place) partRepeats++;
  return {
    frames, scenes: scenes.length,
    toldShare: told / frames,
    places, distinct: places.length,
    topPlace: places[0] ? places[0].place : null, topShare: places[0] ? places[0].share : 0,
    ownShare: own / frames,
    emptyShare: empty / frames, emptyScenes, nobodyShare: nobody / frames,
    partOpenings, partRepeats,
  };
}

const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)} %`);
/** the lines told.js status / apply and originality-report print */
function metricLines(m) {
  const lines = [
    `places: the film stands ${pct(m.topShare)} of its time in ${m.topPlace || "no place"} · ${m.distinct} distinct place(s)${m.places.length > 1 ? ` (next: ${m.places.slice(1, 4).map((p) => `${p.place} ${pct(p.share)}`).join(", ")})` : ""}`,
    `empty scenes (nobody and nothing of the book on screen): ${pct(m.emptyShare)} of the time (${m.emptyScenes} scene(s)) · figure scenes with nobody: ${pct(m.nobodyShare)} · told stages: ${pct(m.toldShare)}`,
  ];
  if (m.partOpenings.length) lines.push(`parts open in: ${m.partOpenings.map((p) => `${p.n}:${p.place}`).join(" · ")}${m.partRepeats ? ` — ${m.partRepeats} part(s) open where the part before opened` : ""}`);
  return lines;
}

module.exports = { placeOf, isEmpty, filmMetrics, metricLines };
