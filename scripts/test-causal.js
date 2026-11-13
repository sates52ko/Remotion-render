#!/usr/bin/env node
// MECHANISM 2.0 — the causal chain (src/engines/antidote/causal.ts, components/CausalChain.tsx), 2026-10-28.
// The rules that matter: stations in CAUSAL order appear ON the word that says them, even when the result is said first
// (the stations between are "?" slots, never guessed); the carried token travels only into stations already drawn and
// keeps its body when it is renamed; the contrast / loop appear on their words; no number the narration does not say.
// Run: node scripts/test-causal.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 400)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const C = require("../src/engines/antidote/causal.ts");
const { diagramSchema, causalSchema } = require("../src/engines/antidote/schema.ts");

const BRIDGE = {
  stations: [
    { label: "SHAKY BRIDGE", glyph: "bridge" }, { label: "ADRENALINE", glyph: "bolt" }, { label: "SAW THE RESEARCHER", glyph: "eye" },
    { label: "BRAIN MISINTERPRETED", glyph: "brain" }, { label: "MORE LIKELY TO CALL", glyph: "phone" },
  ],
  token: { glyph: "heart", tag: "FEAR", tagTo: "ATTRACTION", from: 1 },
  contrast: { label: "SOLID SAFE BRIDGE", glyph: "bridge" },
};

// ── (A) schema ───────────────────────────────────────────────────────────────
t("schema: a causal diagram parses", diagramSchema.safeParse({ type: "causal", labels: [], causal: BRIDGE }).success);
t("schema: 2..5 stations", !causalSchema.safeParse({ ...BRIDGE, stations: BRIDGE.stations.slice(0, 1) }).success && !causalSchema.safeParse({ ...BRIDGE, stations: [...BRIDGE.stations, BRIDGE.stations[0]] }).success);
t("schema: the token starts at a station", !causalSchema.safeParse({ ...BRIDGE, token: { ...BRIDGE.token, from: 7 } }).success);
t("schema: a rename needs the first name", !causalSchema.safeParse({ ...BRIDGE, token: { glyph: "heart", tagTo: "X", from: 0 } }).success);
t("schema: a loop goes back to an EARLIER station", !causalSchema.safeParse({ ...BRIDGE, loop: { to: 4 } }).success && causalSchema.safeParse({ ...BRIDGE, loop: { to: 1 } }).success);
t("schema: glyphs are a closed vocabulary", !causalSchema.safeParse({ ...BRIDGE, stations: [{ label: "X", glyph: "unicorn" }, BRIDGE.stations[1]] }).success);

// ── (B) the state: temporal causal graph — causal order ≠ spoken order ──────
// beat 1 says the bridge; beat 2 says the RESULT (calls) and the contrast; beat 3 adrenaline (+token); beat 4 the rest
const b2 = { ...BRIDGE, at: { n4: 60, contrast: 20 }, done: ["n0"] };
let s = C.causalState(b2, 200);
t("result said first: drawn, and the 3 unexplained stations between are '?' slots", s.station[0] === 1 && s.station[4] === 1 && s.slot[1] && s.slot[2] && s.slot[3], JSON.stringify(s));
t("result said first: no solid arrow yet (nothing explains it)", s.arrow.every((a) => a === 0));
t("result said first: the token is not born (its word is not said yet)", s.token === null);
t("a slot never appears outside two drawn stations", !C.causalState({ ...BRIDGE, at: { n0: 0 } }, 100).slot.some(Boolean));
const b4 = { ...BRIDGE, at: { n2: 30, n3: 90, relabel: 140 }, done: ["n0", "n4", "contrast", "n1", "token"] };
let early = 0;
for (let f = 0; f < 260; f++) { const x = C.causalState(b4, f); if ((f < 30 && x.station[2] > 0) || (f < 90 && x.station[3] > 0) || (f < 140 && x.token.tagShift > 0)) early++; }
t("nothing before its word: stations and the rename (260 frames swept)", early === 0, String(early));
s = C.causalState(b4, 0);
t("continued beat: what the chain reached is drawn settled at frame 0; the token waits at the first '?'", s.station[0] === 1 && s.station[1] === 1 && s.station[4] === 1 && s.slot[2] && s.token && s.token.pos === 1, JSON.stringify(s.token));
let jumped = 0;
for (let f = 0; f < 400; f++) { const x = C.causalState(b4, f); const reach = x.station.map((v) => v > 0).lastIndexOf(true); let k = 1; while (k + 1 < 5 && x.station[k + 1] > 0) k++; if (x.token.pos > k + 1e-9) jumped++; }
t("token: never travels into a station that is not drawn yet (400 frames)", jumped === 0, String(jumped));
t("token: reaches the result once every station is drawn", Math.abs(C.causalState(b4, 400).token.pos - 4) < 1e-9);
t("token: moves step by step (half way between 1 and 2 at some frame)", Array.from({ length: 80 }, (_, f) => C.causalState(b4, 30 + f).token.pos).some((p) => p > 1.2 && p < 1.8));
t("rename: settles after its build, the same token (pos unchanged by the rename)", C.causalState(b4, 140 + C.RELABEL_LEN).token.tagShift === 1 && C.causalState(b4, 139).token.pos === C.causalState(b4, 141).token.pos);
// the rename happens AT its station: the token waits there until the new name is written, then moves on
const hold = { ...BRIDGE, token: { ...BRIDGE.token, relabelAt: 3 }, at: { n3: 20, relabel: 100 }, done: ["n0", "n1", "n2", "n4", "token", "contrast"] };
t("rename at a station: the token waits there until the new name is written", C.causalState(hold, 99 + C.RELABEL_LEN).token.pos === 3 && C.causalState(hold, 100 + C.RELABEL_LEN + C.STEP + 1).token.pos === 4, JSON.stringify([C.causalState(hold, 90).token, C.causalState(hold, 150).token]));
// loop: two firings, the token rides back to `to` and forward again
const LOOP = { stations: [{ label: "TEXT ARRIVES", glyph: "phone" }, { label: "SOCIAL BID", glyph: "people" }, { label: "INSTANT YES", glyph: "check" }], token: { glyph: "spark", from: 0 }, loop: { to: 0, label: "AGAIN" }, at: { n0: 0, n1: 10, n2: 20, token: 0, loop: [120, 260] } };
const lp = Array.from({ length: 400 }, (_, f) => C.causalState(LOOP, f).token);
t("loop: before its word the token rests at the end", lp[110].pos === 2 && lp[110].back === 0);
t("loop: on each loop word the token rides the arc back (back > 0)", lp.slice(121, 150).some((x) => x.back > 0) && lp.slice(261, 290).some((x) => x.back > 0) && lp.slice(160, 255).every((x) => x.back === 0));
t("loop: after the ride it runs forward to the end again", lp[255].pos === 2 && lp[399].pos === 2);

// ── (C) words: only what is drawn ───────────────────────────────────────────
const seen2 = C.causalSeen(BRIDGE, new Set(["n0", "n4", "contrast"]));
t("seen: result said first → bridge … ? ? ? … phone, plus the greyed contrast, no token", /SHAKY BRIDGE/.test(seen2) && (seen2.match(/\?/g) || []).length === 3 && /MORE LIKELY TO CALL/.test(seen2) && /SOLID SAFE BRIDGE/.test(seen2) && !/ATTRACTION|ADRENALINE/.test(seen2), seen2);
const seenAll = C.causalSeen(BRIDGE, new Set(C.CAUSAL_ELS));
t("seen: the full chain names the renamed token travelling to the result", /"FEAR" crossed out, now "ATTRACTION"/.test(seenAll) && /travels along the arrows from "ADRENALINE" to "MORE LIKELY TO CALL"/.test(seenAll), seenAll);
t("labels: every printed word is listed for the text gates", ["SHAKY BRIDGE", "ADRENALINE", "FEAR", "ATTRACTION", "SOLID SAFE BRIDGE", "MORE LIKELY TO CALL"].every((w) => C.causalLabels(BRIDGE).includes(w)));

// ── (D) merge + planner on a word-timed fixture ─────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "causal-"));
const SLUG = `zz-causal-${process.pid}`;
const BOOK = path.join(tmp, "books", SLUG);
const env = { ...process.env, USE_NVIDIA: "0", PRODUCTION_GUARD: "off" };
const SENTENCES = [
  "Welcome to this deep dive into attraction.",
  "Remember the shaky bridge experiment with the researcher.",
  "Not the solid safe bridge. Those men were more likely to call her.",
  "Why? Their bodies were flooded with fear and adrenaline.",
  "When they saw the researcher, the brain misinterpreted that fear as attraction.",
];
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
for (const sent of SENTENCES) {
  const words = sent.split(" "); const start = clock; let line = words[0];
  for (let k = 1; k < words.length; k++) line += `<${ts(start + k * 0.3)}><c> ${words[k]}</c>`;
  const end = start + words.length * 0.3;
  vtt += `${ts(start)} --> ${ts(end)} align:start position:0%\n \n${line}\n\n${ts(end)} --> ${ts(end + 0.01)} align:start position:0%\n${sent}\n\n`;
  clock = end + 1.0;
}
fs.mkdirSync(path.join(BOOK, "storyboard"), { recursive: true });
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
for (const f of ["shared-generic-motifs.json", "motif-world.json"]) fs.copyFileSync(path.join(REPO, "data", f), path.join(tmp, "data", f));
fs.writeFileSync(path.join(tmp, "fx.vtt"), vtt);
const CAST = { narrator: { name: "Narrator", role: "host", look: "host" } };
fs.writeFileSync(path.join(tmp, "cast.json"), JSON.stringify({ cast: CAST }));
fs.writeFileSync(path.join(BOOK, "book.json"), JSON.stringify({ slug: SLUG, title: "Causal Test", author: "A. Writer", genre: "nonfiction", engine: "antidote" }));
fs.writeFileSync(path.join(BOOK, "story-bible.json"), JSON.stringify({ cast: CAST, visualProvenance: { allowedMotifs: [] } }));
const PLAN = path.join(__dirname, "plan-antidote.js");
const baseArgs = [PLAN, `--slug=${SLUG}`, "--title=Causal Test", "--author=A. Writer", "--genre=nonfiction", `--vtt=${path.join(tmp, "fx.vtt")}`, `--cast=${path.join(tmp, "cast.json")}`, "--scene-secs=2"];
const run = (argv) => spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, env });
const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const SB = { claim: "c", concreteVisual: "v", onScreenText: "none", relationToPrevious: "r", addedInformation: "a" };
const merge = () => run([path.join(__dirname, "storyboard.js"), "merge", `--slug=${SLUG}`, "--write", `--root=${tmp}`]);
try {
  run([...baseArgs, `--emit-beats=${path.join(tmp, "beats.json")}`]);
  const emitted = read(path.join(tmp, "beats.json"));
  const beats = emitted ? (emitted.beats || emitted) : [];
  const find = (re) => (beats.find((b) => re.test(b.narration || "")) || {}).i;
  const iA = find(/shaky bridge experiment/), iB = find(/more likely to call/), iC = find(/flooded with fear/), iD = find(/misinterpreted/);
  t("fixture: the four chain sentences are four consecutive beats", iA > 0 && iB === iA + 1 && iC === iB + 1 && iD === iC + 1, JSON.stringify(beats.map((b) => b.narration)));
  fs.writeFileSync(path.join(BOOK, "storyboard", "beats.json"), JSON.stringify({ beats: beats.map((b) => ({ i: b.i, narration: b.narration })) }));
  const CUES = { [iA]: { n0: "shaky bridge" }, [iB]: { contrast: "solid safe bridge", n4: "more likely to call" }, [iC]: { n1: "adrenaline", token: "fear" }, [iD]: { n2: "saw the researcher", n3: "misinterpreted", relabel: "attraction" } };
  const write = (mut) => fs.writeFileSync(path.join(BOOK, "storyboard", "authored-1.json"), JSON.stringify(beats.map((b) => {
    const x = { i: b.i, concept: null, diagram: null, callout: null, storyboard: SB, cast: [] };
    if (CUES[b.i]) Object.assign(x, { diagram: { type: "causal", labels: [], causal: { ...JSON.parse(JSON.stringify(BRIDGE)), cues: { ...CUES[b.i] } } }, ...(b.i === iA ? {} : { continue: true }) });
    if (mut) mut(x, b.i);
    return x;
  })));
  write((x, i) => { if (i === iD) x.diagram.causal.cues.relabel = "lust"; });
  let r = merge();
  t("merge: a cue that is not spoken in its beat is refused", r.status !== 0 && /causal cue relabel "lust" is not spoken/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) x.diagram.causal.stations[4].label = "3 TIMES MORE CALLS"; });
  r = merge();
  t("merge: a number the narration does not say is refused", r.status !== 0 && /prints 3, which the narration does not say/.test(r.stdout), (r.stdout || "").slice(-300));
  write((x, i) => { if (i === iA) { delete x.diagram.causal.contrast; x.diagram.causal.cues.contrast = "bridge"; } });
  r = merge();
  t("merge: a contrast cue without a contrast is refused", r.status !== 0 && /cue contrast without a `contrast`/.test(r.stdout), (r.stdout || "").slice(-300));
  write(null);
  r = merge();
  t("merge: the authored chain is accepted", r.status === 0, (r.stdout || "").slice(-600));
  r = run([...baseArgs, `--callouts=${path.join(BOOK, "art.json")}`, `--out=${path.join(tmp, "config.json")}`]);
  const cfg = read(path.join(tmp, "config.json"));
  t("plan: config written", !!cfg, (r.stderr || r.stdout || "").slice(-400));
  if (cfg) {
    const { anchorOnWord } = require("./lib/word-anchor");
    const off = [];
    for (const i of [iA, iB, iC, iD]) {
      const sc = cfg.scenes[i], c = sc.diagram && sc.diagram.causal;
      if (!c) { off.push(`${i} no causal diagram in the config`); continue; }
      for (const [el, cue] of Object.entries(CUES[i])) {
        const want = anchorOnWord({ from: sc.fromFrame, words: (cfg.captions || []).flatMap((x) => x.words || []).map((w) => ({ w: w.w, s: w.s })) }, cue, {});
        if (c.at[el] == null || c.at[el] < 0) off.push(`${i}.${el} missing`);
        else if (want != null && c.at[el] < want) off.push(`${i}.${el} ${c.at[el]} < word ${want}`);
      }
    }
    t("plan: every station, the token, the rename and the contrast sit at or after their spoken word", !off.length, off.join("; "));
    t("plan: each continued beat knows what the chain already reached", JSON.stringify(cfg.scenes[iD].diagram.causal.done) === JSON.stringify(["n0", "contrast", "n4", "n1", "token"]), JSON.stringify(cfg.scenes[iD].diagram.causal.done));
    t("plan: the chain is drawn as authored (no cast restaged over it)", [iA, iB, iC, iD].every((i) => cfg.scenes[i].diagram.type === "causal"));
    const art = read(path.join(BOOK, "art.json"));
    art.beats.find((b) => b.i === iD).diagram.causal.cues.relabel = "lust";
    fs.writeFileSync(path.join(tmp, "bad-art.json"), JSON.stringify(art));
    r = run([...baseArgs, `--callouts=${path.join(tmp, "bad-art.json")}`, `--out=${path.join(tmp, "bad.json")}`]);
    t("plan: an unspoken cue stops the planner (nothing is guessed)", r.status !== 0 && /causal "relabel" cue "lust" is not spoken/.test(r.stderr + r.stdout), (r.stderr || "").slice(-300));
    // readcheck text reader is told the chain as drawn
    const RC = fs.readFileSync(path.join(__dirname, "readcheck.js"), "utf8");
    t("readcheck: the causal chain is described to the blind text reader", /causalSeen/.test(RC) && /causalReached/.test(RC));
  }
} finally {
  if (!process.env.KEEP_FIXTURE) fs.rmSync(tmp, { recursive: true, force: true }); else console.log("fixture kept: " + tmp);
  if (fs.existsSync(path.join(REPO, "books", SLUG))) fs.rmSync(path.join(REPO, "books", SLUG), { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall causal checks passed");
process.exit(failed ? 1 : 0);
