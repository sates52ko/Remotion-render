/**
 * yt-channel.js — pure helpers for the channel analytics tools (no network, no credentials): parsing the published
 * register, matching uploaded videos to book slugs, retention maths, Studio CSV parsing. Tested by test-yt-analytics.js.
 */

const STOP = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "for", "by", "with", "is", "it"]);

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’'`]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
/** The part of a book title people actually search: before a subtitle colon / dash. */
function mainTitle(title) {
  const t = String(title || "").split(/\s*[:—–]\s+|\s+-\s+/)[0];
  return norm(t.length >= 3 ? t : title);
}
const hasPhrase = (hay, phrase) => phrase.length > 0 && (` ${hay} `).includes(` ${phrase} `);

function parseClock(s) {
  const p = String(s || "").trim().split(":").map(Number);
  if (!p.length || p.some((n) => !Number.isFinite(n))) return null;
  return p.reduce((a, n) => a * 60 + n, 0);
}
function parseISODuration(s) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s || ""));
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
const clock = (sec) => {
  if (!Number.isFinite(sec)) return "–";
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s % 60).padStart(2, "0")}`;
};

/** Rows of PUBLISHED_BOOKS.md's summary table: | # | `slug` | **Title** — Author | date | mm:ss | *YouTube title* | hook | */
function parsePublished(md) {
  const out = new Map();
  for (const line of String(md || "").split(/\r?\n/)) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    const slug = (cells[1].match(/`([^`]+)`/) || [])[1];
    if (!slug || out.has(slug)) continue;
    const tm = /\*\*(.+?)\*\*\s*(?:—|–|-)?\s*(.*)$/.exec(cells[2]) || [];
    out.set(slug, {
      slug, title: (tm[1] || cells[2]).trim(), author: (tm[2] || "").trim(), published: cells[3],
      durationSec: parseClock(cells[4]), recordedTitle: cells[5].replace(/^\*|\*$/g, "").replace(/\\\|/g, "|").trim(),
    });
  }
  return [...out.values()];
}

/**
 * Match uploaded videos to books. Never guesses: a book is "exact" (recorded title equal, or its title in the video
 * title AND the duration within tolSec), "fuzzy" (title in exactly one video title, duration unknown or different),
 * or "unmatched" (none / several candidates — listed for a manual decision). One video serves one book.
 */
function matchVideos(books, videos, { tolSec = 3, manual = {} } = {}) {
  const vids = videos.map((v) => ({ ...v, n: norm(v.title) }));
  const byId = new Map(vids.map((v) => [v.id, v]));
  const res = [];
  for (const b of books) {
    if (manual[b.slug]) {
      res.push({ slug: b.slug, videoId: manual[b.slug], confidence: byId.has(manual[b.slug]) ? "manual" : "manual-unknown-video" });
      continue;
    }
    const phrase = mainTitle(b.title);
    const rec = norm(b.recordedTitle);
    const durOk = (v) => Number.isFinite(b.durationSec) && Number.isFinite(v.durationSec) && Math.abs(v.durationSec - b.durationSec) <= tolSec;
    const same = rec ? vids.filter((v) => v.n === rec) : [];
    if (same.length === 1) { res.push({ slug: b.slug, videoId: same[0].id, confidence: "exact", why: "recorded title" }); continue; }
    const cand = vids.filter((v) => hasPhrase(v.n, phrase));
    const timed = cand.filter(durOk);
    if (timed.length === 1) res.push({ slug: b.slug, videoId: timed[0].id, confidence: "exact", why: "title + duration" });
    else if (cand.length === 1) res.push({ slug: b.slug, videoId: cand[0].id, confidence: "fuzzy", why: Number.isFinite(b.durationSec) ? `title only (duration ${clock(cand[0].durationSec)} vs recorded ${clock(b.durationSec)})` : "title only" });
    else res.push({ slug: b.slug, videoId: null, confidence: "unmatched", candidates: cand.map((v) => v.id), why: cand.length ? "several videos carry this title" : "no video carries this title" });
  }
  // one video, one book: a video claimed twice keeps only an unambiguous claim
  const claims = new Map();
  for (const r of res) if (r.videoId) claims.set(r.videoId, [...(claims.get(r.videoId) || []), r]);
  for (const [vid, rs] of claims) {
    if (rs.length < 2) continue;
    const strong = rs.filter((r) => r.confidence === "exact" || r.confidence === "manual");
    for (const r of rs) {
      if (strong.length === 1 && r === strong[0]) continue;
      Object.assign(r, { videoId: null, confidence: "unmatched", candidates: [vid], why: `video also claimed by ${rs.filter((x) => x !== r).map((x) => x.slug).join(", ")}` });
    }
  }
  const used = new Set(res.filter((r) => r.videoId).map((r) => r.videoId));
  return { matches: res, unclaimed: videos.filter((v) => !used.has(v.id)).map((v) => v.id) };
}

/** Linear interpolation over [[x, y], ...] sorted by x; clamps outside the range. */
function interp(points, x) {
  if (!points || !points.length) return null;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

/**
 * Retention has 100 points per video; a scene is far shorter than one point on a long film. So the unit is the
 * retention BUCKET: its drop is shared among the scenes inside it by time overlap — an attribution, not a measurement
 * of any single scene.
 *   curve: [[ratio 0..1, watchRatio], ...]   scenes: [{id, startSec, endSec, kind}]   durationSec: film length
 */
function retentionByScene(curve, scenes, durationSec) {
  const pts = [...curve].sort((a, b) => a[0] - b[0]);
  const buckets = [];
  for (let i = 1; i < pts.length; i++) {
    const t0 = pts[i - 1][0] * durationSec, t1 = pts[i][0] * durationSec, drop = pts[i - 1][1] - pts[i][1];
    const inside = scenes.map((s) => ({ s, ov: Math.max(0, Math.min(t1, s.endSec) - Math.max(t0, s.startSec)) })).filter((x) => x.ov > 0);
    buckets.push({ t0, t1, from: pts[i - 1][1], to: pts[i][1], drop, scenes: inside.map((x) => ({ id: x.s.id, kind: x.s.kind, share: x.ov / (t1 - t0) })) });
  }
  const perScene = new Map(scenes.map((s) => [s.id, { id: s.id, kind: s.kind, startSec: s.startSec, endSec: s.endSec, drop: 0 }]));
  for (const b of buckets) for (const x of b.scenes) perScene.get(x.id).drop += b.drop * x.share;
  const kinds = new Map();
  for (const s of perScene.values()) {
    const k = kinds.get(s.kind) || { kind: s.kind, n: 0, seconds: 0, drop: 0 };
    k.n++; k.seconds += s.endSec - s.startSec; k.drop += s.drop;
    kinds.set(s.kind, k);
  }
  const byKind = [...kinds.values()].map((k) => ({ ...k, dropPerMin: k.seconds ? (k.drop / k.seconds) * 60 : null }));
  return { buckets, scenes: [...perScene.values()], byKind, secondsPerBucket: durationSec / Math.max(1, pts.length - 1) };
}

/** RFC-4180-ish CSV → array of objects keyed by the header row. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((x) => x !== "")) rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? "" : r[i]])));
}

/** A YouTube Studio "Table data.csv" (Content tab, Advanced mode) → {videoId: {impressions, ctr}}. */
function studioCtr(rows) {
  const out = {};
  if (!rows.length) return out;
  const keys = Object.keys(rows[0]);
  const find = (re) => keys.find((k) => re.test(k));
  const kId = find(/^(content|video)$/i), kImp = find(/^impressions$/i), kCtr = find(/click-through rate/i);
  if (!kId || (!kImp && !kCtr)) throw new Error(`CSV has no Content / Impressions / click-through rate columns (found: ${keys.join(", ")})`);
  const num = (v) => { const n = Number(String(v).replace(/[%\s,]/g, "")); return Number.isFinite(n) && String(v).trim() !== "" ? n : null; };
  for (const r of rows) {
    const id = String(r[kId]).trim();
    if (!/^[\w-]{11}$/.test(id)) continue; // skips the "Total" row
    out[id] = { impressions: kImp ? num(r[kImp]) : null, ctr: kCtr ? num(r[kCtr]) : null };
  }
  return out;
}

module.exports = { STOP, norm, mainTitle, hasPhrase, parseClock, parseISODuration, clock, parsePublished, matchVideos, interp, median, retentionByScene, parseCsv, studioCtr };
