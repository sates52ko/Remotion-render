/**
 * node-bin.js — recreate MISSING node_modules/.bin shims from each installed package's own `bin` field.
 * Never runs npm, never deletes or overwrites an existing entry, never touches a package. Every book worktree links
 * its node_modules to the main checkout's, so a lost .bin stopped every book with NODE_MODULES_BROKEN and handed a
 * mechanical repair to the operator (cycle-16 friction audit). Shims follow npm's cmd-shim shape (sh + .cmd + .ps1).
 *
 *   const { healBin } = require("./lib/node-bin"); healBin("<main>/node_modules")  → { created: [...], packages: N }
 *   node scripts/lib/node-bin.js <node_modules> [--dry]
 *
 * doctor(): the REAL health of a shared node_modules, not "does .bin exist" — every dependency the checkout's
 * package.json declares and every non-optional package-lock entry is installed at its locked version (a broken install:
 * reported, never repaired here — never npm install over a shared tree), then every missing shim is recreated (a lost
 * .bin, or one lost shim). Self-contained (fs + path only): book-start compiles ORIGIN's copy in memory, so a pinned
 * worktree whose own preview-state predates it is still healed.
 *   doctor("<main>/node_modules", { heal })  → { state: ok | healed | needs-heal | broken, problems, created, missingShims }
 *   node scripts/lib/node-bin.js <node_modules> --doctor [--dry]
 * Regression: scripts/test-node-bin.js.
 */
const fs = require("fs");
const path = require("path");

const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** [{name, rel}] — rel is the bin target relative to node_modules, forward slashes */
function binsOf(nm) {
  const out = [];
  const pkgDirs = [];
  let top = []; try { top = fs.readdirSync(nm); } catch { return out; }
  for (const d of top) {
    if (d.startsWith(".")) continue;
    if (d.startsWith("@")) { try { for (const s of fs.readdirSync(path.join(nm, d))) pkgDirs.push(`${d}/${s}`); } catch {} }
    else pkgDirs.push(d);
  }
  for (const p of pkgDirs) {
    const pj = readJSON(path.join(nm, p, "package.json"));
    if (!pj || !pj.bin) continue;
    const bins = typeof pj.bin === "string" ? { [String(pj.name || p).split("/").pop()]: pj.bin } : pj.bin;
    for (const [name, target] of Object.entries(bins)) {
      if (!/^[\w.@-]+$/.test(name) || typeof target !== "string") continue;
      out.push({ name, rel: path.posix.normalize(`${p}/${target.replace(/\\/g, "/")}`) });
    }
  }
  return out;
}

const sh = (rel) => `#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")\nexec node  "$basedir/../${rel}" "$@"\n`;
const cmd = (rel) => `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\nnode  "%dp0%\\..\\${rel.replace(/\//g, "\\")}" %*\r\n`;
const ps1 = (rel) => `#!/usr/bin/env pwsh\n$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent\nif ($MyInvocation.ExpectingInput) { $input | & "node" "$basedir/../${rel}" $args } else { & "node" "$basedir/../${rel}" $args }\nexit $LASTEXITCODE\n`;

/** create the shims that are missing; existing files are left exactly as they are */
function healBin(nm, { dry = false } = {}) {
  const bins = binsOf(nm).filter((b) => fs.existsSync(path.join(nm, b.rel)));
  const dir = path.join(nm, ".bin");
  const created = [];
  for (const b of bins) {
    for (const [file, body] of [[b.name, sh(b.rel)], [`${b.name}.cmd`, cmd(b.rel)], [`${b.name}.ps1`, ps1(b.rel)]]) {
      const f = path.join(dir, file);
      if (fs.existsSync(f)) continue;
      if (!dry) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, body, { mode: 0o755 }); }
      created.push(file);
    }
  }
  return { created, bins: bins.length };
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** missing / wrong-version packages: the checkout's declared deps + every non-optional package-lock entry */
function packageProblems(nm) {
  const root = path.dirname(nm), problems = [];
  const pkg = readJSON(path.join(root, "package.json")) || {};
  for (const name of Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }))
    if (!readJSON(path.join(nm, name, "package.json"))) problems.push(`missing ${name} (declared in package.json)`);
  const lock = readJSON(path.join(root, "package-lock.json"));
  let checked = 0;
  for (const [k, v] of Object.entries((lock && lock.packages) || {})) {
    if (!k.startsWith("node_modules/") || !v || v.optional || v.link) continue;
    checked++;
    const j = readJSON(path.join(root, k, "package.json"));
    if (!j) { if (!problems.some((p) => p.startsWith(`missing ${k.slice(13)} `))) problems.push(`missing ${k.slice(13)} (package-lock)`); }
    else if (v.version && j.version !== v.version) problems.push(`${k.slice(13)} is ${j.version}, package-lock says ${v.version}`);
  }
  return { problems, checked };
}

function doctor(nm, { heal = true } = {}) {
  if (!isDir(nm)) return { state: "broken", problems: [`${nm} does not exist`], created: [], missingShims: [], checked: 0 };
  const { problems, checked } = packageProblems(nm);
  // shims on a broken install would only hide it: report, create nothing
  if (problems.length) return { state: "broken", problems, created: [], missingShims: [], checked };
  const missingShims = healBin(nm, { dry: true }).created;
  const created = heal && missingShims.length ? healBin(nm).created : [];
  const state = !missingShims.length ? "ok" : heal ? "healed" : "needs-heal";
  return { state, problems, created, missingShims, checked };
}

module.exports = { binsOf, healBin, doctor, packageProblems };

if (require.main === module) {
  const nm = process.argv[2];
  if (!nm) { console.error("usage: node scripts/lib/node-bin.js <node_modules> [--doctor] [--dry]"); process.exit(2); }
  if (process.argv.includes("--doctor")) {
    const d = doctor(path.resolve(nm), { heal: !process.argv.includes("--dry") });
    console.log(`node_modules ${path.resolve(nm)}: ${d.state.toUpperCase()} (${d.checked} locked package(s) checked${d.missingShims.length ? `; ${d.missingShims.length} .bin shim file(s) ${d.created.length ? "recreated" : "missing"}` : ""})`);
    for (const p of d.problems.slice(0, 20)) console.log(`  ${p}`);
    if (d.problems.length > 20) console.log(`  ... ${d.problems.length - 20} more`);
    if (d.state === "broken") console.log("  a broken install is the operator's: never npm install over the shared node_modules");
    process.exit(d.state === "broken" ? 1 : 0);
  }
  const r = healBin(path.resolve(nm), { dry: process.argv.includes("--dry") });
  console.log(`${r.bins} bin(s) declared; ${r.created.length} shim file(s) ${process.argv.includes("--dry") ? "would be " : ""}created`);
}
