#!/usr/bin/env node
// STORY BIBLE: heuristic era + source grounding + the routine contract (2026-10-30).
// Real cases: Trust Fall (contemporary romance) got the era "post-apocalyptic sci-fi future" from ONE metaphor ("his
// emotional stasis"); its agent stopped to ask. The Art of Strategy's bible PASSED with no next step printed; its agent
// asked "Storyboard'a devam etmemi ister misiniz?". Trust Fall's authored bible left out its antagonist (Quinn ×8).
// What must hold: one period word never sets an era (two different ones do); --emit and --bible print the routine
// contract (a wrong draft field is routine to correct; the next command comes from preview-state); --bible lists, as
// review lines only, a cast member the narration never names and a name the narration uses often that no cast member
// carries; generic roles and capitalized ordinary words are never flagged.
// Run: node scripts/test-plan-bible-grounding.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 600)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bible-")));
// word-timed VTT (the shape NotebookLM / YouTube ASR gives, which plan-bible parses)
const vtt = (sents) => {
  const tsf = (x) => { const ms = Math.round(x * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
  let v = "WEBVTT\nKind: captions\nLanguage: en\n\n", clock = 0;
  for (const sent of sents) {
    const words = sent.split(" "); const start = clock; let line = words[0];
    for (let k = 1; k < words.length; k++) line += `<${tsf(start + k * 0.3)}><c> ${words[k]}</c>`;
    const end = start + words.length * 0.3;
    v += `${tsf(start)} --> ${tsf(end)} align:start position:0%\n \n${line}\n\n${tsf(end)} --> ${tsf(end + 0.01)} align:start position:0%\n${sent}\n\n`;
    clock = end + 1.0;
  }
  return v;
};
try {
  fs.cpSync(path.join(REPO, "scripts"), path.join(tmp, "scripts"), { recursive: true });
  fs.cpSync(path.join(REPO, "data"), path.join(tmp, "data"), { recursive: true });
  const run = (slug, a) => spawnSync(process.execPath, [path.join(tmp, "scripts", "plan-bible.js"), `--slug=${slug}`, ...a], { cwd: tmp, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "off" } });
  const romance = ["Julia meets Damen at the academy.", "Damen hides his emotional stasis behind jokes.", "Quinn, his father, threatens Julia.", "Quinn calls the lawyers again.",
    "Julia goes home to Nebraska.", "Quinn will not let it go.", "Damen climbs the trellis to her window.", "Quinn shouts at Damen.", "Julia laughs with Damen.", "Quinn is furious."];
  fs.writeFileSync(path.join(tmp, "romance.vtt"), vtt(romance));
  fs.mkdirSync(path.join(tmp, "books", "zz-romance"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "books", "zz-romance", "book.json"), JSON.stringify({ slug: "zz-romance", genre: "romance", engine: "antidote" }));
  let r = run("zz-romance", [`--vtt=${path.join(tmp, "romance.vtt")}`, `--emit=${path.join(tmp, "draft.json")}`]);
  const draft = JSON.parse(fs.readFileSync(path.join(tmp, "draft.json"), "utf8"));
  t("ONE period word ('emotional stasis') does not make a sci-fi era", draft.bible.world.era !== "post-apocalyptic sci-fi future" && /none/.test(draft.bible.world.eraEvidence), JSON.stringify(draft.bible.world));
  t("--emit prints the routine contract: correcting the draft is routine, never an operator question", /a wrong era \/ cast \/ age in this draft is routine to correct/.test(r.stdout) && /Do NOT end your turn while status says CONTINUE/.test(r.stdout), r.stdout.slice(-600));
  t("the draft's instructions say the heuristic fields are often wrong and routine to fix", draft.instructions.some((l) => /HEURISTIC and are often wrong/.test(l)) && draft.instructions.some((l) => /never a question for the operator/.test(l)));
  fs.writeFileSync(path.join(tmp, "scifi.vtt"), vtt(["The silo holds ten thousand people.", "Nanobots repair the walls of the silo.", "Juliette climbs the stairs."]));
  fs.mkdirSync(path.join(tmp, "books", "zz-scifi"), { recursive: true });
  r = run("zz-scifi", [`--vtt=${path.join(tmp, "scifi.vtt")}`, `--emit=${path.join(tmp, "draft2.json")}`]);
  const d2 = JSON.parse(fs.readFileSync(path.join(tmp, "draft2.json"), "utf8"));
  t("TWO different period words (silo, nanobots) still set the era, with their evidence", d2.bible.world.era === "post-apocalyptic sci-fi future" && /silo/.test(d2.bible.world.eraEvidence) && /nanobots/.test(d2.bible.world.eraEvidence), JSON.stringify(d2.bible.world));
  // --bible on an authored bible: grounding review + next step
  const bible = { slug: "zz-romance", world: { era: "contemporary", forbid: [] }, cast: {
    julia: { name: "Julia", role: "the heroine", look: "teen girl, blond, school blazer" },
    damen: { name: "Damen", role: "the hero", look: "teen boy, dark hair, school blazer" },
    narrator: { name: "Narrator", role: "host", look: "host" },
    lean: { name: "Lean", role: "a draft leftover", look: "x" } }, places: {}, objects: [], spine: [] };
  fs.writeFileSync(path.join(tmp, "bible.json"), JSON.stringify(bible));
  r = run("zz-romance", [`--vtt=${path.join(tmp, "romance.vtt")}`, `--bible=${path.join(tmp, "bible.json")}`, "--dry"]);
  t("--bible: a cast member the narration never names is listed (review)", /cast "lean" \(Lean\) is never named in the narration/.test(r.stdout), r.stdout);
  t("--bible: the often-named antagonist with no cast member is listed (Quinn ×5)", /often named in the narration, in no cast member: Quinn ×5/.test(r.stdout), r.stdout);
  t("--bible: generic roles and capitalized ordinary words are never flagged", !/"narrator"/.test(r.stdout) && !/\b(His|The|And)\b ×/.test(r.stdout));
  t("--bible: the review is not a refusal (exit 0) and the next step + contract follow", r.status === 0 && /Story bible done\. Next: node scripts\/preview-state\.js status --slug=zz-romance/.test(r.stdout) && /Do NOT end your turn while status says CONTINUE/.test(r.stdout), r.stdout.slice(-500));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall bible grounding checks passed");
process.exit(failed ? 1 : 0);
