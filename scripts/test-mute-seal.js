#!/usr/bin/env node
// Sealed holdout in mute-test.js prep: seal ids without rendering, re-render exactly those beats later,
// never substitute, never re-sample a tallied verdict. Runs mute-test.js in a temp root with a fake
// still renderer (ffmpeg colour PNGs), so no Remotion bundle is needed.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
let fail = 0;
const t = (name, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${!ok && extra ? `\n    ${extra}` : ""}`); if (!ok) fail++; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), "muteseal-"));
fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "mute-test.js"), path.join(root, "scripts", "mute-test.js"));
for (const f of ["production-guard.js", "code-fingerprint.js", "next-step.js"]) fs.copyFileSync(path.join(__dirname, "lib", f), path.join(root, "scripts", "lib", f));
// fake renderer: --frames=<id>:<frame>,... --out=<dir> -> <out>/<slug>/<id>-f<frame>.png (64x64 colour)
fs.writeFileSync(path.join(root, "scripts", "render-sequence-stills.js"), `
const fs=require("fs"),path=require("path"),{execFileSync}=require("child_process");
const a=Object.fromEntries(process.argv.slice(2).map(x=>{const m=x.match(/^--([^=]+)=(.*)$/);return m?[m[1],m[2]]:[x,true]}));
const dir=path.join(${JSON.stringify(root)},a.out,a.slug);fs.mkdirSync(dir,{recursive:true});
for(const p of a.frames.split(",")){const [id,f]=p.split(":");execFileSync("ffmpeg",["-y","-v","error","-f","lavfi","-i","color=c=gray:s=64x64","-frames:v","1",path.join(dir,id+"-f"+f+".png")]);}
`);
const slug = "seal-book";
const B = path.join(root, "books", slug);
fs.mkdirSync(B, { recursive: true });
const scenes = Array.from({ length: 60 }, (_, k) => ({ id: `scene-${String(k + 1).padStart(2, "0")}`, fromFrame: k * 300, durationFrames: 300, texts: [{ text: "SOME WORDS HERE", at: 40 }] }));
const write = (sc) => fs.writeFileSync(path.join(B, "config.antidote.json"), JSON.stringify({ meta: {}, scenes: sc, captions: [] }));
write(scenes);
const run = (...a) => spawnSync(process.execPath, [path.join(root, "scripts", "mute-test.js"), "prep", `--slug=${slug}`, ...a], { cwd: root, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "off" } });
const F = (...p) => path.join(root, "audit", "mute", slug, ...p);
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

let r = run("--label=final", "--seal", "--n=10");
t("--seal writes seal.json + sample.json", r.status === 0 && fs.existsSync(F("final", "seal.json")) && fs.existsSync(F("final", "sample.json")), r.stderr);
const seal = J(F("final", "seal.json"));
t("--seal renders nothing (no stills, no images)", !fs.existsSync(F("final", "stills")) && !fs.existsSync(F("final", "mute")));
t("seal records ids and a sha256", Array.isArray(seal.ids) && seal.ids.length === 10 && /^[0-9a-f]{64}$/.test(seal.idsSha256));
r = run("--label=final", "--seal", "--n=10");
t("a second --seal of the same label is refused", r.status !== 0 && /already sealed/.test(r.stderr));

// another development run must not use the sealed beats
r = run("--label=run1", "--n=10");
const run1 = J(F("run1", "sample.json")).map((x) => x.id);
t("another label excludes the sealed beats", r.status === 0 && run1.every((id) => !seal.ids.includes(id)), r.stderr);
fs.rmSync(F("run1"), { recursive: true, force: true }); // keep the 'no other mute run' rule for the verdict below

// the book changes: a sealed beat's text now appears later -> its frame must move; stale answers must go
const target = seal.ids[0];
write(scenes.map((s) => (s.id === target ? { ...s, texts: [{ text: "SOME WORDS HERE", at: 260 }] } : s)));
fs.mkdirSync(F("final", "stills", slug), { recursive: true });
fs.writeFileSync(F("final", "blind.json"), "[]");
fs.writeFileSync(F("final", "judge-result.json"), "{}");
r = run("--label=final", "--dry");
t("--dry on a sealed label prints the sealed beats and writes nothing", r.status === 0 && /dry: 10 units/.test(r.stdout) && fs.existsSync(F("final", "blind.json")));
r = run("--label=final");
const finalSample = J(F("final", "sample.json"));
t("final prep re-renders exactly the sealed ids", r.status === 0 && JSON.stringify(finalSample.map((x) => x.id).sort()) === JSON.stringify([...seal.ids].sort()), r.stderr);
const moved = finalSample.find((x) => x.id === target);
// sampleFrame: max(70% = 210, last text at 260 + 30) = 290 (was 210 before the change)
t("frames come from the CURRENT config (sealed beat's frame moved 210 -> 290)", moved && moved.frame === scenes.find((s) => s.id === target).fromFrame + 290, JSON.stringify(moved));
t("stale answers were removed before rendering", !fs.existsSync(F("final", "blind.json")) && !fs.existsSync(F("final", "judge-result.json")));
t("fresh stills + images exist for every sealed beat", fs.readdirSync(F("final", "mute")).filter((f) => f.endsWith(".png")).length === 10);
t("sample-meta marks the run sealed", J(F("final", "sample-meta.json")).sealed === true);

// tampering and loss are refused, never substituted
const sp = F("final", "sample.json");
const saved = fs.readFileSync(sp, "utf8");
const tam = J(sp); tam[0].id = scenes.find((s) => !seal.ids.includes(s.id)).id; fs.writeFileSync(sp, JSON.stringify(tam));
r = run("--label=final");
t("a swapped beat in sample.json is refused", r.status !== 0 && /no longer matches the seal/.test(r.stderr));
fs.writeFileSync(sp, saved);
write(scenes.filter((s) => s.id !== seal.ids[1]));
r = run("--label=final");
t("a sealed beat missing from the config stops the run (no substitute)", r.status !== 0 && /no longer in the config/.test(r.stderr) && J(sp).length === 10);
write(scenes);
fs.writeFileSync(F("final", "totals.json"), "{}");
r = run("--label=final");
t("a sealed label already tallied as a verdict cannot be re-sampled", r.status !== 0 && /already tallied/.test(r.stderr));

// unsealed default behaviour unchanged: a fresh label still draws and renders
r = run("--label=run2", "--n=6");
t("unsealed prep still draws a fresh sample", r.status === 0 && J(F("run2", "sample.json")).length === 6 && !fs.existsSync(F("run2", "seal.json")), r.stderr);

// edge case (2026-10-20 review): when fresh beats run short the stratum is topped up from seen beats —
// sealed beats must never enter through that path, and a draw that cannot be filled outside the seal stops.
{
  const slug2 = "seal-edge";
  const B2 = path.join(root, "books", slug2);
  fs.mkdirSync(B2, { recursive: true });
  const sc2 = Array.from({ length: 20 }, (_, k) => ({ id: `e-${String(k + 1).padStart(2, "0")}`, fromFrame: k * 300, durationFrames: 300, texts: [{ text: "SOME WORDS HERE", at: 40 }] }));
  fs.writeFileSync(path.join(B2, "config.antidote.json"), JSON.stringify({ meta: {}, scenes: sc2, captions: [] }));
  const run2 = (...a) => spawnSync(process.execPath, [path.join(root, "scripts", "mute-test.js"), "prep", `--slug=${slug2}`, ...a], { cwd: root, encoding: "utf8", env: { ...process.env, PRODUCTION_GUARD: "off" } });
  const F2 = (...p) => path.join(root, "audit", "mute", slug2, ...p);
  r = run2("--label=final", "--seal", "--n=8");
  const sealed2 = J(F2("final", "seal.json")).ids;
  r = run2("--label=dev1", "--n=8"); // uses 8 of the 12 unsealed beats -> only 4 fresh left
  const dev1 = J(F2("dev1", "sample.json")).map((x) => x.id);
  r = run2("--label=dev2", "--n=8"); // 4 fresh + top-up from seen: must come from dev1, never the seal
  const dev2 = r.status === 0 ? J(F2("dev2", "sample.json")).map((x) => x.id) : [];
  t("top-up with seen beats never draws a sealed beat", r.status === 0 && dev2.length === 8 && dev2.every((id) => !sealed2.includes(id)) && dev1.every((id) => !sealed2.includes(id)), r.stderr || JSON.stringify(dev2));
  r = run2("--label=dev3", "--n=14"); // only 12 beats exist outside the seal
  t("a draw that cannot be filled outside the seal stops (no sealed substitute)", r.status !== 0 && /outside the open seal/.test(r.stderr) && !fs.existsSync(F2("dev3", "sample.json")), r.stderr);
  fs.writeFileSync(F2("final", "totals.json"), "{}"); // verdict tallied -> the seal is closed, its beats are only 'seen'
  r = run2("--label=dev4", "--n=14");
  t("after the sealed verdict is tallied its beats may top up again", r.status === 0 && J(F2("dev4", "sample.json")).length === 14, r.stderr);
}

fs.rmSync(root, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED` : "\nall mute-seal checks passed");
process.exit(fail ? 1 : 0);
