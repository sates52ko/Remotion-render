#!/usr/bin/env node
/**
 * test-sfx-optin.js — the Antidote sound-effect layer is OPT-IN (operator, 2026-11-23, from viewers: the dings and
 * ticks over the narration were heard as "beeps" that break focus). A config without `meta.sfx: true` renders the
 * narration alone, like the Vox layer. Source checks only — no render.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

t("AudioEngine renders nothing unless meta.sfx is true; the schema admits the flag", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/components/AudioEngine.tsx"), "utf8");
  const body = src.split("export const AudioEngine")[1];
  assert.ok(/if \(!\(config\.meta as \{ sfx\?: boolean \}\)\.sfx\) return null;/.test(body), "the gate is the first thing the component does");
  assert.ok(body.indexOf("return null;") < body.indexOf("<Sequence"), "… before any Sequence is mounted");
  const schema = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/schema.ts"), "utf8");
  assert.ok(/sfx: z\.boolean\(\)\.optional\(\),/.test(schema), "meta.sfx is an optional boolean");
  const vox = fs.readFileSync(path.join(__dirname, "../src/engines/vox/sfx.tsx"), "utf8");
  assert.ok(/if \(!enabled\) return null;/.test(vox), "the Vox layer is opt-in as it was");
});

t("the recording floor is 25 minutes (eased from 30 on 2026-11-23)", () => {
  const src = fs.readFileSync(path.join(__dirname, "narration-form-check.js"), "utf8");
  assert.ok(/const FLOOR_MIN = 25;/.test(src) && /minutes >= FLOOR_MIN/.test(src));
  const skill = fs.readFileSync(path.join(__dirname, "../.claude/skills/notebooklm-prompt/SKILL.md"), "utf8");
  assert.ok(/over 25 minutes is long enough/.test(skill) && !/Under 30: record again/.test(skill));
});

console.log(`\n${n} checks passed`);
