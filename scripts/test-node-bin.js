#!/usr/bin/env node
// test-node-bin.js — node-bin.js recreates only MISSING .bin shims from package bin fields; doctor = real package health (temp dir, < 1 s)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { healBin, doctor } = require("./lib/node-bin");

let fail = 0;
const t = (name, ok, info = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  ${String(info).slice(0, 300)}`}`); if (!ok) fail++; };
const W = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const nm = fs.mkdtempSync(path.join(os.tmpdir(), "nodebin-"));
W(path.join(nm, "tool", "package.json"), JSON.stringify({ name: "tool", bin: "cli.js" }));
W(path.join(nm, "tool", "cli.js"), "");
W(path.join(nm, "@sc", "multi", "package.json"), JSON.stringify({ name: "@sc/multi", bin: { one: "./bin/one.js", two: "bin/two.js" } }));
W(path.join(nm, "@sc", "multi", "bin", "one.js"), "");
W(path.join(nm, "ghost", "package.json"), JSON.stringify({ name: "ghost", bin: { ghost: "missing.js" } }));
W(path.join(nm, "evil", "package.json"), JSON.stringify({ name: "evil", bin: { "../x": "a.js" } }));
W(path.join(nm, "evil", "a.js"), "");

let r = healBin(nm, { dry: true });
t("dry run writes nothing", r.created.length === 6 && !fs.existsSync(path.join(nm, ".bin")), JSON.stringify(r));
r = healBin(nm);
const bin = (f) => path.join(nm, ".bin", f);
t("string bin + object bin → sh, .cmd and .ps1 for each existing target", ["tool", "tool.cmd", "tool.ps1", "one", "one.cmd", "one.ps1"].every((f) => fs.existsSync(bin(f))), JSON.stringify(r));
t("a bin whose target file is missing gets no shim", !fs.existsSync(bin("two")) && !fs.existsSync(bin("ghost")));
t("a bin name with a path in it is ignored", !fs.existsSync(path.join(nm, "x")) && !fs.readdirSync(path.join(nm, ".bin")).some((f) => f.includes("..")));
t("shims point at the package file", /\.\.\/@sc\/multi\/bin\/one\.js/.test(fs.readFileSync(bin("one"), "utf8")) && /\\\.\.\\@sc\\multi\\bin\\one\.js/.test(fs.readFileSync(bin("one.cmd"), "utf8")));
fs.writeFileSync(bin("tool"), "KEEP");
r = healBin(nm);
t("an existing entry is never overwritten; a second run creates nothing", r.created.length === 0 && fs.readFileSync(bin("tool"), "utf8") === "KEEP", JSON.stringify(r));
fs.rmSync(nm, { recursive: true, force: true });

// ── doctor: real health (declared + locked packages), then a per-shim heal ───────────────────────────────────────
const root = fs.mkdtempSync(path.join(os.tmpdir(), "nodedoc-"));
const N = path.join(root, "node_modules");
W(path.join(root, "package.json"), JSON.stringify({ dependencies: { "@remotion/cli": "1.0.0" }, devDependencies: { typescript: "5.9.3" } }));
W(path.join(root, "package-lock.json"), JSON.stringify({ packages: { "": {}, "node_modules/@remotion/cli": { version: "1.0.0" }, "node_modules/typescript": { version: "5.9.3" }, "node_modules/fsevents": { version: "2.0.0", optional: true } } }));
W(path.join(N, "@remotion", "cli", "package.json"), JSON.stringify({ name: "@remotion/cli", version: "1.0.0", bin: { remotion: "remotion-cli.js" } }));
W(path.join(N, "@remotion", "cli", "remotion-cli.js"), "");
W(path.join(N, "typescript", "package.json"), JSON.stringify({ name: "typescript", version: "5.9.3", bin: { tsc: "bin/tsc" } }));
W(path.join(N, "typescript", "bin", "tsc"), "");
const B = (f) => path.join(N, ".bin", f);
let d = doctor(N, { heal: false });
t("doctor --dry on a complete install with no .bin -> needs-heal, writes nothing", d.state === "needs-heal" && d.missingShims.length === 6 && !fs.existsSync(path.join(N, ".bin")), JSON.stringify(d));
d = doctor(N);
t("doctor heals the lost .bin -> healed, remotion + tsc shims back", d.state === "healed" && ["remotion", "remotion.cmd", "tsc.cmd"].every((f) => fs.existsSync(B(f))), JSON.stringify(d));
t("  optional lock entries that are absent are not problems", d.problems.length === 0 && d.checked === 2, JSON.stringify(d));
fs.unlinkSync(B("remotion.cmd")); fs.writeFileSync(B("tsc"), "KEEP");
d = doctor(N);
t("ONE lost shim inside an existing .bin is healed; an existing shim is never overwritten", d.state === "healed" && d.created.join() === "remotion.cmd" && fs.readFileSync(B("tsc"), "utf8") === "KEEP", JSON.stringify(d));
t("a complete install -> ok, nothing created", doctor(N).state === "ok");
fs.renameSync(path.join(N, "typescript"), path.join(root, "ts-moved")); fs.rmSync(path.join(N, ".bin"), { recursive: true });
d = doctor(N);
t("a declared package missing -> broken (named), and no shim is created over a broken install", d.state === "broken" && /missing typescript/.test(d.problems.join()) && !fs.existsSync(path.join(N, ".bin")), JSON.stringify(d));
fs.renameSync(path.join(root, "ts-moved"), path.join(N, "typescript"));
W(path.join(N, "typescript", "package.json"), JSON.stringify({ name: "typescript", version: "4.0.0", bin: { tsc: "bin/tsc" } }));
d = doctor(N);
t("a package at the wrong version -> broken", d.state === "broken" && /typescript is 4\.0\.0, package-lock says 5\.9\.3/.test(d.problems.join()), JSON.stringify(d));
t("node_modules gone -> broken", doctor(path.join(root, "nope")).state === "broken");
fs.rmSync(root, { recursive: true, force: true });

console.log(fail ? `\n${fail} node-bin check(s) FAILED` : "\nall node-bin checks passed");
process.exit(fail ? 1 : 0);
