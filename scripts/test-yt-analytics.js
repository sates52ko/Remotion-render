#!/usr/bin/env node
/** test-yt-analytics.js — channel analytics helpers; no network, no credentials. */
const assert = require("assert");
const os = require("os");
const path = require("path");
const ch = require("./lib/yt-channel");
const auth = require("./lib/yt-auth");
const { scenesOf } = require("./retention-map");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

t("durations parse", () => {
  assert.strictEqual(ch.parseISODuration("PT43M12S"), 2592);
  assert.strictEqual(ch.parseISODuration("PT1H2M3S"), 3723);
  assert.strictEqual(ch.parseISODuration("PT45S"), 45);
  assert.strictEqual(ch.parseISODuration("nonsense"), null);
  assert.strictEqual(ch.parseClock("43:12"), 2592);
  assert.strictEqual(ch.parseClock("1:02:03"), 3723);
  assert.strictEqual(ch.clock(2592), "43:12");
  assert.strictEqual(ch.clock(3723), "1:02:03");
});

const MD = [
  "| # | Slug | Book Title & Author | Published Date | Duration | Primary YouTube Title (US) | Thumbnail Hook |",
  "|---|---|---|---|---|---|---|",
  "| 1 | `educated` | **Educated** — Tara Westover | 2026-09-04 | 40:59 | *She Didn't Know What the Holocaust Was — Educated by Tara Westover* | `SHE DIDN'T KNOW` |",
  "| 19 | `frederick-douglass` | **Frederick Douglass: Prophet of Freedom** — David W. Blight | 2026-09-30 | 44:33 | *Why the Most Photographed Man in America Never Smiled \\| Frederick Douglass* | `HE NEVER SMILED` |",
  "| 20 | `death-row` | **Death Row** — Freida McFadden | 2026-09-30 | 31:48 | *Death Row by Freida McFadden — Ending Explained* | ALREADY GUILTY |",
  "| 20 | `death-row` | **Death Row** — Freida McFadden | 2026-09-30 | 31:48 | *duplicate row* | ALREADY GUILTY |",
].join("\n");

t("published register parses (escaped pipe, duplicate row)", () => {
  const b = ch.parsePublished(MD);
  assert.strictEqual(b.length, 3);
  assert.deepStrictEqual([b[0].slug, b[0].title, b[0].author, b[0].durationSec], ["educated", "Educated", "Tara Westover", 2459]);
  assert.strictEqual(b[1].recordedTitle, "Why the Most Photographed Man in America Never Smiled | Frederick Douglass");
  assert.strictEqual(b[2].recordedTitle, "Death Row by Freida McFadden — Ending Explained");
});

t("matching: exact, fuzzy, unmatched, never a guess", () => {
  const books = ch.parsePublished(MD).concat([
    { slug: "peak", title: "Peak: Secrets from the New Science of Expertise" },
    { slug: "march", title: "March", durationSec: 2112 },
    { slug: "ghost", title: "A Book Nobody Uploaded", durationSec: 100 },
  ]);
  const videos = [
    { id: "v-educated0", title: "She Didn’t Know What the Holocaust Was — Educated by Tara Westover", durationSec: 2459 },
    { id: "v-douglass0", title: "Frederick Douglass Summary — He Never Smiled", durationSec: 2674 }, // title changed after publishing, duration +1 s
    { id: "v-deathrow0", title: "Death Row (Freida McFadden) Ending Explained", durationSec: 1700 },   // duration off: fuzzy
    { id: "v-peak00000", title: "Peak by Anders Ericsson — Summary", durationSec: 2000 },              // no recorded duration: fuzzy
    { id: "v-march0001", title: "March by Geraldine Brooks Summary", durationSec: 2112 },
    { id: "v-march0002", title: "The Long March Explained", durationSec: 900 },
    { id: "v-stranger0", title: "Something Else Entirely", durationSec: 1234 },
  ];
  const { matches, unclaimed } = ch.matchVideos(books, videos);
  const by = Object.fromEntries(matches.map((m) => [m.slug, m]));
  assert.deepStrictEqual([by.educated.videoId, by.educated.confidence], ["v-educated0", "exact"]);
  assert.deepStrictEqual([by["frederick-douglass"].videoId, by["frederick-douglass"].confidence], ["v-douglass0", "exact"]);
  assert.deepStrictEqual([by["death-row"].videoId, by["death-row"].confidence], ["v-deathrow0", "fuzzy"]);
  assert.deepStrictEqual([by.peak.videoId, by.peak.confidence], ["v-peak00000", "fuzzy"]);
  assert.deepStrictEqual([by.march.videoId, by.march.confidence], ["v-march0001", "exact"], "two title candidates, the duration decides");
  assert.strictEqual(by.ghost.videoId, null);
  assert.deepStrictEqual(unclaimed.sort(), ["v-march0002", "v-stranger0"]);
});

t("matching: word boundaries, manual override, one video one book", () => {
  const r1 = ch.matchVideos([{ slug: "it", title: "It" }], [{ id: "a", title: "Italy Explained", durationSec: 600 }]);
  assert.strictEqual(r1.matches[0].videoId, null, "'it' is not inside 'italy'");
  const r2 = ch.matchVideos([{ slug: "x", title: "Nothing Alike" }], [{ id: "a", title: "Renamed Video", durationSec: 600 }], { manual: { x: "a" } });
  assert.deepStrictEqual([r2.matches[0].videoId, r2.matches[0].confidence], ["a", "manual"]);
  const r3 = ch.matchVideos([{ slug: "dune", title: "Dune" }, { slug: "dune-messiah", title: "Dune Messiah" }], [{ id: "a", title: "Dune Messiah Summary", durationSec: 600 }]);
  assert.strictEqual(r3.matches.filter((m) => m.videoId).length, 0, "two fuzzy claims on one video: neither is kept");
});

t("interpolation and median", () => {
  const c = [[0, 1], [0.5, 0.5], [1, 0.25]];
  assert.strictEqual(ch.interp(c, 0.25), 0.75);
  assert.strictEqual(ch.interp(c, 0.75), 0.375);
  assert.strictEqual(ch.interp(c, 2), 0.25);
  assert.strictEqual(ch.interp([], 0.5), null);
  assert.strictEqual(ch.median([3, 1, 2, null]), 2);
  assert.strictEqual(ch.median([4, 1, 2, 3]), 2.5);
  assert.strictEqual(ch.median([]), null);
});

t("retention is shared among the scenes inside a bucket, and sums back to the curve", () => {
  const curve = [[0, 1.0], [0.5, 0.6], [1, 0.5]];
  const scenes = [
    { id: "a", startSec: 0, endSec: 25, kind: "wide" },
    { id: "b", startSec: 25, endSec: 50, kind: "diagram" },
    { id: "c", startSec: 50, endSec: 100, kind: "wide" },
  ];
  const r = ch.retentionByScene(curve, scenes, 100);
  const by = Object.fromEntries(r.scenes.map((s) => [s.id, s.drop]));
  assert.ok(Math.abs(by.a - 0.2) < 1e-9 && Math.abs(by.b - 0.2) < 1e-9 && Math.abs(by.c - 0.1) < 1e-9);
  assert.ok(Math.abs(r.scenes.reduce((s, x) => s + x.drop, 0) - 0.5) < 1e-9);
  const wide = r.byKind.find((k) => k.kind === "wide");
  assert.deepStrictEqual([wide.n, wide.seconds], [2, 75]);
  assert.ok(Math.abs(wide.dropPerMin - (0.3 / 75) * 60) < 1e-9);
  assert.strictEqual(r.secondsPerBucket, 50);
});

t("scenes of both engines", () => {
  const anti = scenesOf({ meta: { fps: 30 }, scenes: [{ id: "scene-01", fromFrame: 300, durationFrames: 150, shot: "twoShot", _narration: "hello" }, { id: "broken" }] });
  assert.deepStrictEqual(anti, [{ id: "scene-01", startSec: 10, endSec: 15, kind: "twoShot", text: "hello" }]);
  const vox = scenesOf({ meta: { fps: 24 }, beats: [{ id: "beat-001", type: "imagefocus", fromFrame: 240, durationFrames: 48, props: { text: "hi" } }] });
  assert.deepStrictEqual(vox, [{ id: "beat-001", startSec: 10, endSec: 12, kind: "imagefocus", text: "hi" }]);
});

t("Studio CSV: quoted commas, total row skipped, percent parsed", () => {
  const csv = '﻿Content,Video title,Impressions,Impressions click-through rate (%),Views\r\nTotal,,1000,4.2,90\r\nabcDEF12345,"Peak, Explained",800,5.25,70\r\nzyxWVU98765,"He said ""no""",,3.1,20\r\n';
  const rows = ch.parseCsv(csv);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[1]["Video title"], "Peak, Explained");
  assert.strictEqual(rows[2]["Video title"], 'He said "no"');
  assert.deepStrictEqual(ch.studioCtr(rows), { abcDEF12345: { impressions: 800, ctr: 5.25 }, zyxWVU98765: { impressions: null, ctr: 3.1 } });
  assert.throws(() => ch.studioCtr(ch.parseCsv("a,b\n1,2\n")), /no Content/);
});

t("credentials can never live inside a checkout", () => {
  const root = path.join(__dirname, "..");
  assert.throws(() => auth.assertOutsideRepo(path.join(root, "secrets"), root), /outside the checkout/);
  assert.throws(() => auth.assertOutsideRepo(root, root), /outside the checkout/);
  assert.throws(() => auth.assertOutsideRepo(path.join(root, "scripts", "lib"), path.join(root, "elsewhere")), /inside a git checkout/);
  const outside = path.join(os.tmpdir(), "yt-analytics-test-no-such-dir");
  assert.strictEqual(auth.assertOutsideRepo(outside, root), outside);
  assert.ok(auth.SCOPES.every((s) => /readonly$/.test(s)), "read-only scopes only");
  const prev = process.env.YT_ANALYTICS_DIR;
  process.env.YT_ANALYTICS_DIR = outside;
  assert.strictEqual(auth.storeDir(), path.resolve(outside));
  if (prev === undefined) delete process.env.YT_ANALYTICS_DIR; else process.env.YT_ANALYTICS_DIR = prev;
});

console.log(`\n${n} checks passed`);
