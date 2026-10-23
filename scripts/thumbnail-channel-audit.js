#!/usr/bin/env node
"use strict";

const path = require("path");
const { loadChannelHistory, distinctiveness, assessHook } = require("./lib/thumbnail-governance");
const ROOT = path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = arg.match(/^--([^=]+)=(.*)$/); return match ? [match[1], match[2]] : [arg.slice(2), true];
}));
const history = loadChannelHistory(ROOT, args.slug);
const byLayout = Object.fromEntries([...new Set(history.map((x) => x.layout).filter(Boolean))].map((layout) => [layout, history.filter((x) => x.layout === layout).length]));
const repeats = history.filter((item, index) => history.findIndex((other) => other.hook && other.hook.toLowerCase() === item.hook.toLowerCase()) !== index && item.hook);
const report = { scanned: history.length, layouts: byLayout, duplicateHooks: repeats.map((x) => ({ slug: x.slug, hook: x.hook })), recent: history.slice(-12) };
if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Thumbnail channel audit: ${report.scanned} books scanned`);
  console.log("Layouts:", byLayout);
  console.log(repeats.length ? `Duplicate hooks: ${repeats.map((x) => `${x.slug}: ${x.hook}`).join(" | ")}` : "No exact duplicate hooks.");
  for (const item of report.recent) console.log(` - ${item.slug}: ${item.angle || "?"} / ${item.layout || "?"} / ${item.hook || "(no hook)"}`);
}
if (args.slug) {
  const candidate = args.hook || "";
  const check = assessHook({ hook: candidate, evidence: args.evidence || "", title: args.title || "", history, layout: args.layout || "", angle: args.angle || "" });
  if (candidate) console.log(JSON.stringify(check, null, 2));
}
