#!/usr/bin/env node
// MUTE RUN RECOVERY (2026-10-30). Real case, the-magician-s-nephew: run3 was drawn from an older film (stills of another
// config, before make-book and the pin) and never judged; run4 PASSED unsealed before the pin; run5 was sealed on the new
// pin and PASSED; preview-ready recorded READY — yet preview-state stopped on "run3: needs the blind describer".
// What must hold (lib/mute-verdict.js, preview-state, preview-ready, mute-test supersede):
//   - an untallied label of ANOTHER film (stills config ≠ current, or drawn before the pin) is not carried; a retired
//     label (STATUS.json) neither; a SEALED open label always is (the holdout rule);
//   - the verdict is chosen by IDENTITY (render input / config bytes / legacy stills config), never time or position;
//     an old PASS on another config, an UNBOUND run, a run whose seal fails are never the verdict;
//   - supersede retires a label without touching any of its files; a tallied label is never retracted; a sealed open
//     label only on the operator's word;
//   - prep stamps the identity, tally copies it.
// Run: node scripts/test-mute-verdict.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync, execFileSync } = require("child_process");
let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${String(info).slice(0, 500)})` : ""}`); if (!ok) failed++; };
const REPO = path.join(__dirname, "..");
const MV = require("./lib/mute-verdict");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const idsSha = (ids) => sha(JSON.stringify(ids));
const W = (f, x) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof x === "string" ? x : JSON.stringify(x, null, 2)); };
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mute-verdict-")));
const slug = "zz-mn";
try {
  const B = path.join(tmp, "books", slug), MD = path.join(tmp, "audit", "mute", slug);
  const cfgOld = { meta: { fps: 30, audio: `audio/${slug}.mp3`, totalFrames: 300 }, beats: [{ id: "old" }] };
  const cfgNew = { meta: { fps: 30, audio: `audio/${slug}.mp3`, totalFrames: 300 }, beats: [{ id: "new" }] };
  W(path.join(B, "config.vox.json"), cfgOld);
  const cfgFile = path.join(B, "config.vox.json");
  const oldSha = sha(fs.readFileSync(cfgFile));
  W(cfgFile, cfgNew);
  const cur = MV.currentIdentity(cfgFile);
  const tot = (wrong, dead = 0) => ({ CORRECT: 30 - wrong, WRONG: wrong, NONE: dead, ADDS: 20 });
  const label = (l, { stills = null, sealed = false, tallied = false, ids = ["a", "b"], meta = {}, at = null } = {}) => {
    const d = path.join(MD, l);
    W(path.join(d, "sample.json"), ids.map((id) => ({ id, frame: 1 })));
    W(path.join(d, "sample-meta.json"), { seed: 1, ...meta, ...(sealed ? { sealed: true, idsSha256: idsSha(ids) } : {}) });
    if (sealed) W(path.join(d, "seal.json"), { label: l, ids, idsSha256: idsSha(ids), sealedAt: "2026-10-29T15:12:49Z" });
    if (stills) { W(path.join(d, "key.json"), { "img-01.png": "beat-1-f1.png" }); W(path.join(d, "stills", ".config-sha"), stills + "\n"); }
    if (tallied) W(path.join(d, "totals.json"), { label: l });
    if (at) { const tt = new Date(at); for (const f of ["sample.json", "sample-meta.json"]) fs.utimesSync(path.join(d, f), tt, tt); }
    return d;
  };
  // the history, as in the real book (times in UTC)
  label("final", { stills: oldSha.slice(0, 16), sealed: true, tallied: true, ids: ["s1", "s2"] });
  label("run2", { stills: oldSha.slice(0, 16), tallied: true, ids: ["r2a"] });
  label("run3", { stills: oldSha.slice(0, 16), ids: ["r3a"], at: "2026-10-29T13:14:00Z" });               // the old film, never judged
  label("run4", { stills: cur.configSha256.slice(0, 16), tallied: true, ids: ["r4a"] });                // legacy identity only
  label("run5", { stills: cur.configSha256.slice(0, 16), sealed: true, tallied: true, ids: ["s5a", "s5b"], meta: { configSha256: cur.configSha256, renderInputHash: cur.renderInputHash } });
  const runs = [
    { label: "final", date: "2026-10-29T10:21:07Z", n: 30, totals: tot(2), sample: "fresh", sealed: true, sealSha256: idsSha(["s1", "s2"]) },
    { label: "run2", date: "2026-10-29T11:11:15Z", n: 30, totals: tot(0), sample: "fresh" },
    { label: "run4", date: "2026-10-29T14:06:58Z", n: 30, totals: tot(1), sample: "fresh" },
    { label: "run5", date: "2026-10-29T15:35:28Z", n: 30, totals: tot(0, 2), sample: "fresh", sealed: true, sealSha256: idsSha(["s5a", "s5b"]), configSha256: cur.configSha256, renderInputHash: cur.renderInputHash },
  ];
  W(path.join(B, "mute-test.json"), { runs });
  const pinAt = Date.parse("2026-10-29T15:09:23Z");

  // (A) open labels
  t("run3 (untallied, stills of another config) is STALE — not carried", /^STALE: its stills came from config/.test(MV.staleOpenReason({ root: tmp, slug, label: "run3", scopeFrom: pinAt, configSha256: cur.configSha256 }) || ""));
  label("run6", { ids: ["r6a"], at: "2026-10-29T16:00:00Z" });
  t("an untallied label of this production (drawn after the pin, not rendered yet) stays open", MV.staleOpenReason({ root: tmp, slug, label: "run6", scopeFrom: pinAt, configSha256: cur.configSha256 }) === null);
  label("run7", { ids: ["r7a"], at: "2026-10-29T12:00:00Z" });
  t("an untallied label drawn before the pin is STALE", /before this production's pin/.test(MV.staleOpenReason({ root: tmp, slug, label: "run7", scopeFrom: pinAt, configSha256: cur.configSha256 }) || ""));
  label("seal2", { stills: oldSha.slice(0, 16), sealed: true, ids: ["z1"], at: "2026-10-29T12:00:00Z" });
  t("a SEALED open label always stays open, whatever its old stills (the holdout is re-rendered, never dodged)", MV.staleOpenReason({ root: tmp, slug, label: "seal2", scopeFrom: pinAt, configSha256: cur.configSha256 }) === null);

  // (B) the verdict by identity
  let v = MV.currentVerdict({ root: tmp, slug, configFile: cfgFile });
  t("verdict = run5 (sealed, stamped identity, PASS); final + run2 (another config) are not counted", v.verdict && v.verdict.label === "run5" && v.last.label === "run5" && v.rejected.some((r) => r.label === "final") && v.rejected.some((r) => r.label === "run2"), JSON.stringify(v.rejected));
  t("run4 counts by the legacy stills identity (same config), but run5 is later", v.matching.some((r) => r.label === "run4" && /legacy/.test(r.matchedBy)));
  v = MV.currentVerdict({ root: tmp, slug, configFile: cfgFile, runs: runs.slice(0, 2) });
  t("an old PASS on another config never carries over to the new input (no verdict)", !v.verdict && !v.last && v.rejected.length === 2);
  v = MV.currentVerdict({ root: tmp, slug, configFile: cfgFile, runs: [{ label: "ghost", date: "2026-10-29T16:00:00Z", n: 30, totals: tot(0), sample: "fresh" }] });
  t("a run with no identity at all (UNBOUND) is never the verdict", !v.verdict && /UNBOUND/.test((v.rejected[0] || {}).why || ""));
  v = MV.currentVerdict({ root: tmp, slug, configFile: cfgFile, runs: [{ ...runs[3], sealSha256: "0".repeat(64) }] });
  t("a sealed run whose seal does not verify is never the verdict", !v.verdict && /seal does not verify/.test((v.rejected[0] || {}).why || ""));
  W(path.join(MD, "STATUS.json"), { run5: { status: "VOID", reason: "test" } });
  v = MV.currentVerdict({ root: tmp, slug, configFile: cfgFile });
  t("a retired label (STATUS.json) is never the verdict", v.verdict && v.verdict.label === "run4" && v.rejected.some((r) => r.label === "run5" && /VOID/.test(r.why)));
  fs.rmSync(path.join(MD, "STATUS.json"));

  // (C) supersede: the sidecar only
  const hashDir = (d) => fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort().map((f) => f + ":" + sha(fs.readFileSync(path.join(d, f)))).join("|");
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), "mute-sup-"));
  try {
    fs.cpSync(path.join(REPO, "scripts"), path.join(tree, "scripts"), { recursive: true });
    fs.cpSync(path.join(REPO, "data"), path.join(tree, "data"), { recursive: true });
    fs.cpSync(path.join(tmp, "books"), path.join(tree, "books"), { recursive: true });
    fs.cpSync(path.join(tmp, "audit"), path.join(tree, "audit"), { recursive: true });
    const sup = (a) => spawnSync(process.execPath, [path.join(tree, "scripts", "mute-test.js"), "supersede", `--slug=${slug}`, ...a], { cwd: tree, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "off" } });
    const run3Dir = path.join(tree, "audit", "mute", slug, "run3");
    const before = hashDir(run3Dir);
    let r = sup(["--label=run5", "--reason=x"]);
    t("supersede refuses a tallied label (a verdict is never retracted)", r.status === 2 && /never retracted/.test(r.stderr), r.stderr);
    r = sup(["--label=seal2", "--reason=x"]);
    t("supersede refuses the sealed open holdout without the operator's word", r.status === 2 && /operator-approved/.test(r.stderr), r.stderr);
    r = sup(["--label=run3"]);
    t("supersede needs a reason", r.status === 1 && /--reason/.test(r.stderr));
    r = sup(["--label=run3", "--reason=drawn from the film before make-book; never judged"]);
    const st = JSON.parse(fs.readFileSync(path.join(tree, "audit", "mute", slug, "STATUS.json"), "utf8"));
    t("supersede run3: STATUS.json records SUPERSEDED + reason + evidence; run3's files are byte-identical", r.status === 0 && st.run3.status === "SUPERSEDED" && /never judged/.test(st.run3.reason) && st.run3.evidence.stillsConfigSha === oldSha.slice(0, 16) && hashDir(run3Dir) === before, r.stdout + r.stderr);
    t("…and the label is then retired for preview-state (reason names STATUS.json)", /SUPERSEDED \(STATUS\.json/.test(MV.staleOpenReason({ root: tree, slug, label: "run3", scopeFrom: 0, configSha256: null }) || ""));
    r = sup(["--label=seal2", "--reason=operator retired it", "--operator-approved=the old film is gone"]);
    t("…a sealed open label on the operator's word: recorded with the approval", r.status === 0 && JSON.parse(fs.readFileSync(path.join(tree, "audit", "mute", slug, "STATUS.json"), "utf8")).seal2.operatorApproved === "the old film is gone");
  } finally { fs.rmSync(tree, { recursive: true, force: true }); }

  // (D) identity stamped at prep and copied by tally (wiring)
  const src = fs.readFileSync(path.join(REPO, "scripts", "mute-test.js"), "utf8");
  t("prep stamps createdAt / configSha256 / renderInputHash / codeHead into sample-meta.json", /identity = \{ createdAt: new Date\(\)\.toISOString\(\), configSha256:/.test(src) && /renderInputHash: require\("\.\/lib\/render-preflight"\)\.inputHashOf\(cfgPath\)/.test(src));
  t("tally copies configSha256 / renderInputHash / codeHead / framesConfigSha into the verdict record", /configSha256: meta\.configSha256 \|\| null, renderInputHash: meta\.renderInputHash \|\| null, codeHead: meta\.codeHead \|\| null, framesConfigSha/.test(src));
  const ps = fs.readFileSync(path.join(REPO, "scripts", "preview-state.js"), "utf8"), pr = fs.readFileSync(path.join(REPO, "scripts", "preview-ready.js"), "utf8");
  t("preview-state carries only open labels of this film (staleOpenReason) and reports the others", /MV\.staleOpenReason\(\{ root, slug, label: x\.l, scopeFrom, configSha256: cfgShaNow \}\)/.test(ps) && /not carried \(kept on disk, never a verdict\)/.test(ps));
  t("preview-ready counts only runs that judged this film (currentVerdict)", /currentVerdict\(\{ root: ROOT, slug, configFile/.test(pr) && /const runs = MVR\.matching;/.test(pr));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} FAILED` : "\nall mute-verdict checks passed");
process.exit(failed ? 1 : 0);
