#!/usr/bin/env node
// Authored-fidelity regressions (authoring A/B 2026-10-17, storyboard invariant 1:
// an authored art.json decision reaches the screen unchanged).
//   (1) an authored EMPTY cast (`cast: []`) ships with no figure — burn 162 got a
//       narrator, burn 176 Luther twice in an overShoulder
//   (2) an authored strike callout keeps style "strike" — the-art-of-saying-no 207
//       was demoted to plain because the struck phrase skips one narration word
//   (3) a COLLAPSED figure lies wholly inside the frame — the-art-of-saying-no 198
//       showed a tiny arm (the body lay under the subtitles / past the frame edge)
// (1)+(2) run the REAL planner (scripts/plan-antidote.js --out, test mode: writes
// only the given path) on a tiny word-timed fixture in a temp dir. (3) is the
// renderer's own staging geometry (no Remotion render).
// Run: node scripts/test-authored-fidelity.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };

// ── fixture: a word-timed VTT (the format plan-antidote parses) ──────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "authored-fidelity-"));
// 8 words each = one caption (lib/vtt.js) = one scene at --scene-secs=2
const SENTENCES = [
  "Welcome to this deep dive into burning crowns.",
  "They are confessing their most shameful sin aloud.",
  "Then the horror washes over her right there.",
  "The guilt just neatly evaporates like magic, right?",
  "Luther argues with Teller about the old war.",
  "After the heaviest lift, he simply collapsed flat.",
]
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" ");
  const start = clock;
  let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${ts(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
// a prose-role cast (burn-of-the-everflame's shape): no director role key matches
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: {
  luther: { name: "Luther", role: "Diem's devoted mate, a commander" },
  teller: { name: "Teller", role: "Dean's mortal brother, grieving" },
  narrator: { name: "Narrator", role: "the host voice that frames the argument" },
} }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const SLUG = `zz-authored-fidelity-${process.pid}`; // never created: --out/--emit-beats write only the temp dir
const base = [PLAN, `--slug=${SLUG}`, "--title=Fire Test", "--author=A. Writer", "--genre=fiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const plan = (extra) => spawnSync(process.execPath, [...base, ...extra], { encoding: "utf8", cwd: path.join(__dirname, ".."), env: { ...process.env, USE_NVIDIA: "0" } });

let cfg = null;
try {
  let r = plan([`--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = fs.existsSync(path.join(tmp, "beats.json")) ? JSON.parse(fs.readFileSync(path.join(tmp, "beats.json"), "utf8")) : null;
  const beats = emitted ? (emitted.beats || emitted) : [];
  t("fixture: the planner segments the fixture VTT", beats.length >= 5, r.stderr && r.stderr.slice(-400));
  const find = (re) => beats.findIndex((b) => re.test(b.narration || ""));
  const iConfess = find(/confessing/), iHorror = find(/horror washes/), iGuilt = find(/guilt just neatly/), iTwo = find(/Luther argues/), iFall = find(/collapsed flat/);
  t("fixture: every case sentence is its own beat", [iConfess, iHorror, iGuilt, iTwo, iFall].every((k) => k > 0) && new Set([iConfess, iHorror, iGuilt, iTwo, iFall]).size === 5, JSON.stringify(beats.map((b) => b.narration)));
  const art = beats.map((b) => ({ i: b.i, narration: b.narration, callout: null }));
  // burn 162: text-led, nobody on screen (director picks a person shot)
  art[iConfess] = { ...art[iConfess], callout: { text: "Confessing their shameful sin", style: "reveal" }, set: "horizon", cast: [], expression: "sad", action: "idle", concept: null };
  // burn 176: the case that drew Luther twice (authored two-person shot, empty cast)
  art[iHorror] = { ...art[iHorror], callout: { text: "The horror washes over her", style: "reveal" }, set: "abstract", cast: [], expression: "afraid", action: "idle", concept: null, shotOverride: "overShoulder" };
  // the-art-of-saying-no 207: struck phrase that is NOT a contiguous narration span ("just NEATLY evaporates")
  art[iGuilt] = { ...art[iGuilt], callout: { text: "The guilt just evaporates", style: "strike" }, set: "room", cast: ["narrator"], expression: "sad", action: "slump", concept: null };
  // control: an authored two-person cast still reaches the screen as written
  art[iTwo] = { ...art[iTwo], callout: { text: "War and bloodlines", style: "reveal" }, cast: ["luther", "teller"], concept: null };
  // control: an engine-written strike (no art file) is still refused — see (2c)
  art[iFall] = { ...art[iFall], callout: { text: "Collapsed flat", style: "reveal" }, set: "none", cast: ["narrator"], expression: "afraid", action: "collapsed", concept: null };
  fs.writeFileSync(path.join(tmp, "art.json"), JSON.stringify({ beats: art }));
  r = plan([`--callouts=${path.join(tmp, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  cfg = fs.existsSync(path.join(tmp, "config.json")) ? JSON.parse(fs.readFileSync(path.join(tmp, "config.json"), "utf8")) : null;
  t("fixture: the planner writes the config from the art file", !!cfg, (r.stderr || r.stdout || "").slice(-600));
  if (cfg) {
    const S = cfg.scenes;
    const sc = (k) => S[k] || {};
    const ids = (s) => (s.characters || []).map((c) => c.identity);
    const PEOPLE_FREE = new Set(["insert", "beforeAfter", "chapterCard", "illustration", "diorama", "wide"]);
    // (1) empty authored cast
    for (const [name, k] of [["burn-162 shape (no shotOverride)", iConfess], ["burn-176 shape (authored overShoulder)", iHorror]]) {
      t(`(1) ${name}: authored cast [] -> no figure in the config`, ids(sc(k)).length === 0, `${sc(k).shot}: ${ids(sc(k)).join("+")}`);
      const L = sc(k)._authorship && sc(k)._authorship.lock;
      t(`(1) ${name}: the lock seals cast [] as authored`, !!L && Array.isArray(L.cast) && L.cast.length === 0, JSON.stringify(L && L.cast));
    }
    t("(1) an unauthored person-shot becomes a people-free shot", PEOPLE_FREE.has(sc(iConfess).shot), sc(iConfess).shot);
    t("(1) an authored shotOverride is kept (framing is the author's)", sc(iHorror).shot === "overShoulder", sc(iHorror).shot);
    t("(1) control: an authored two-person cast is unchanged", ids(sc(iTwo)).join("+") === "luther+teller", ids(sc(iTwo)).join("+"));
    // the gate: an engine that later adds a figure is drift, and --restore removes it
    const { stagingDrift, restoreAuthoredStaging } = require("./lib/authorship");
    const later = JSON.parse(JSON.stringify(sc(iConfess)));
    // (cast only: the fixture's consecutive beats share one director bg object, so
    // their authored sets collide in-plan — healed by gate-authorship --restore;
    // reported separately, not this fix)
    t("(1) gate: the planned empty-cast beat has no cast drift", !stagingDrift(later).some((d) => d.startsWith("cast ")), JSON.stringify(stagingDrift(later)));
    later.characters = [{ id: "x", rig: "everyman", identity: "narrator", role: "narrator", expression: "neutral", action: "talk" }];
    t("(1) gate: a figure added later is reported as cast drift", stagingDrift(later).some((d) => d.startsWith("cast ")), JSON.stringify(stagingDrift(later)));
    restoreAuthoredStaging({ scenes: [later] });
    t("(1) gate: --restore takes the added figure off again", later.characters.length === 0);
    // post-plan engines leave an authored empty cast empty
    const { enforceSemanticRelevance } = require("./lib/visual-intent");
    const post = { meta: cfg.meta, scenes: JSON.parse(JSON.stringify([sc(iConfess), sc(iHorror)])) };
    post.scenes.forEach((s) => { s.props = []; delete s.concept; });
    enforceSemanticRelevance(post);
    t("(1) post-plan: the stage-occupancy guarantee does not fill an authored empty cast", post.scenes.every((s) => (s.characters || []).length === 0), post.scenes.map((s) => ids(s).join("+")).join(" | "));
    const { applyContractRepair } = require("./lib/visual-contract");
    const rep = applyContractRepair(JSON.parse(JSON.stringify(sc(iConfess))), { mustShow: ["characters"], mustNotShow: [] });
    t("(1) post-plan: a mustShow-characters brief reports the conflict instead of adding a figure", (rep.scene.characters || []).length === 0 && rep.problems.some((p) => p.field === "cast"), JSON.stringify(rep.problems));
    // (2) strike
    const guilt = (sc(iGuilt).texts || []).find((x) => /GUILT/.test(x.text));
    t("(2) authored strike callout keeps style strike", !!guilt && guilt.style === "strike", JSON.stringify(guilt));
    t("(2) the authored callout text is unchanged", !!guilt && guilt.text === "THE GUILT JUST EVAPORATES", guilt && guilt.text);
    // (3) the planner keeps the authored collapse
    const fall = sc(iFall).characters && sc(iFall).characters[0];
    t("(3) planner: the authored action collapsed reaches the config", !!fall && fall.action === "collapsed", JSON.stringify(fall && fall.action));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(__dirname, "..", "books", SLUG))) fs.rmSync(path.join(__dirname, "..", "books", SLUG), { recursive: true, force: true });
}

// (2c) the strike guard still applies to ENGINE copy
const pa = fs.readFileSync(PLAN, "utf8");
t("(2) wiring: an ungrounded strike is demoted only when the copy is not authored", /if \(CALLOUTS\) console\.warn\([^\n]*\n\s*else call = \{ \.\.\.call, style: "plain", _strikeRefused/.test(pa));
const { strikeSupported } = require("./lib/visual-strategy");
t("(2) strikeSupported itself is unchanged (verbatim spans only)", strikeSupported("the guilt just evaporates", "the guilt just neatly evaporates") === false && strikeSupported("neatly evaporates", "the guilt just neatly evaporates") === true);

// ── (3) collapsed geometry: the renderer's staging vs the frame ──────────────
const { pose } = require("../src/engines/antidote/movements.ts");
const { SHOTS, stageChar, resolveBody } = require("../src/engines/antidote/shots.ts");
const { tippedOutline, stagedBox, fitGroundedFigure, FIGURE_SAFE, FIGURE_SAFE_BUST } = require("../src/engines/antidote/groundFit.ts");
const FRAME = { x0: 0, x1: 1920, y0: 0, y1: 1080 };
const inside = (b, A) => b.x0 >= A.x0 - 0.5 && b.x1 <= A.x1 + 0.5 && b.y0 >= A.y0 - 0.5 && b.y1 <= A.y1 + 0.5;
const fmt = (b) => `x ${Math.round(b.x0)}..${Math.round(b.x1)} y ${Math.round(b.y0)}..${Math.round(b.y1)}`;
const settled = pose("collapsed", 100000, 30);
// The model must agree with the measured bug: medium's lying body ran past the frame bottom.
{
  const spec = { action: "collapsed" };
  const body = resolveBody("medium", spec);
  const raw = stagedBox(tippedOutline(settled, body), stageChar("medium", spec, 0), body);
  t("(3) model reproduces scene-198: unfitted medium body lies in the subtitle band, past the frame's safe bottom", raw.y1 > FIGURE_SAFE.y1 && raw.y0 > 700, fmt(raw));
  const cu = stagedBox(tippedOutline(settled, "bust"), stageChar("closeUp", spec, 0), "bust");
  t("(3) model: unfitted closeUp body is entirely below the frame", cu.y0 > FRAME.y1, fmt(cu));
}
for (const shot of Object.keys(SHOTS)) {
  for (const slot of [0, 1]) {
    for (const variant of [{}, { height: 1.3, headScale: 1.4, build: "heavy" }, { height: 0.6 }]) {
      const spec = { action: "collapsed" };
      const body = resolveBody(shot, spec);
      const st = fitGroundedFigure(stageChar(shot, spec, slot), "collapsed", [pose("collapsed", 0, 30), settled], body, variant);
      // and every frame of the settle (the pose eases in from tip -80)
      let worst = null;
      for (const f of [0, 4, 8, 15, 30, 60, 100000]) {
        const b = stagedBox(tippedOutline(pose("collapsed", f, 30), body, variant), st, body);
        if (!inside(b, FRAME)) { worst = `frame ${f}: ${fmt(b)}`; break; }
      }
      const b = stagedBox(tippedOutline(settled, body, variant), st, body);
      const safe = body === "full" ? FIGURE_SAFE : FIGURE_SAFE_BUST;
      if (slot === 0 && !variant.height) {
        t(`(3) ${shot} (${body}): settled collapsed body inside the safe area`, inside(b, safe), fmt(b));
      } else if (!inside(b, safe)) {
        t(`(3) ${shot} (${body}) slot ${slot} ${JSON.stringify(variant)}: inside the safe area`, false, fmt(b));
      }
      if (worst) t(`(3) ${shot} slot ${slot} ${JSON.stringify(variant)}: on frame through the settle`, false, worst);
    }
  }
}
// other actions are untouched (same staging object back)
for (const a of ["idle", "talk", "lying", "falling", "sit", "slump", undefined]) {
  const st = stageChar("medium", { action: a }, 0);
  t(`(3) action ${a}: staging unchanged`, fitGroundedFigure(st, a, pose(a || "idle", 100000, 30), "bust") === st);
}
// a collapse that already fits (wide: on the drawn floor, on frame) keeps the shot's own staging
{
  const st = stageChar("wide", { action: "collapsed" }, 0);
  t("(3) wide: a collapse that already fits stays on the set floor (not moved)", fitGroundedFigure(st, "collapsed", settled, "full") === st);
}
const scene = fs.readFileSync(path.join(__dirname, "..", "src", "engines", "antidote", "components", "Scene.tsx"), "utf8");
// (10x P1, 2026-10-27) a body that keeps a carried end state is staged from its REST action (seated in the tub, down);
// every other body still from its own action — restAction === spec.action when there is no rest
t("(3) wiring: CharacterLayer stages through fitGroundedFigure (first + settled pose)", /fitGroundedFigure\(stageChar\(shot, spec, index\), restAction, \[pose\(restAction, 0, fps\), pose\(restAction, 100000, fps\)\]/.test(scene) && /const restAction = \(rest \? rest\.restAction : spec\.action\)/.test(scene));

console.log(failed ? `\n${failed} FAILED` : "\nall authored-fidelity checks passed");
process.exit(failed ? 1 : 0);
