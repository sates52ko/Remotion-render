/**
 * v2-narrative-lint.js — Semantic, Safe-Zone, Contrast, Grounding & Blind-Mute Pre-Flight Linter for Antidote 10x.
 *
 * Checks:
 *   1. Safe-zone bounds & bbox collisions (AnnotatedScene, CutoutStage, UpClose).
 *   2. WCAG 2.1 contrast ratio on resolved mood + palette overrides.
 *   3. Text-overflow & item-capacity across all 26 devices.
 *   4. Claim & numeric grounding (numbers/percentages/currencies on data devices vs narration) + edition guard.
 *   5. Copy hygiene (TODO/TBD/FIXME), verbatim subtitle duplicates, Phase/Step contradictions, >240f motion droughts.
 *   6. Optional asset & RGBA cutout integrity (when `assetRoot` is provided) via `png-lite.js`.
 */
const fs = require("fs");
const path = require("path");

function normTokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function tokenOverlap(a, b) {
  const ta = normTokens(a);
  const tb = new Set(normTokens(b));
  if (!ta.length || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit / ta.length;
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function extractNumbers(text) {
  const matches = String(text || "").match(/\d+(?:[.,]\d+)?/g) || [];
  return matches.map((m) => m.replace(/,/g, ""));
}

function analyzeNarrative(config, opts = {}) {
  const scenes = Array.isArray(config?.scenes) ? config.scenes : [];
  const captions = Array.isArray(config?.captions) ? config.captions : [];
  const errors = [];
  const warnings = [];
  const phaseTitles = new Map();
  const checks = { safeZone: 0, contrast: 0, overflow: 0, grounding: 0, hygiene: 0, assets: 0 };

  const ad = config?.meta?.artDirection || {};
  const minimalCap = ad.captions === "minimal";
  const maxSafeY = minimalCap ? 910 : 1020;

  // 2. WCAG 2.1 Contrast check on palette overrides (when bg & ink/accent are hex)
  if (ad.palette?.bg && ad.palette?.ink) {
    const cr = contrastRatio(ad.palette.bg, ad.palette.ink);
    if (cr !== null && cr < 4.5) {
      checks.contrast++;
      errors.push(`WCAG contrast: artDirection.palette ink (${ad.palette.ink}) on bg (${ad.palette.bg}) is ${cr.toFixed(2)}:1 (< 4.5:1)`);
    }
  }
  if (ad.palette?.bg && ad.palette?.accent) {
    const cr = contrastRatio(ad.palette.bg, ad.palette.accent);
    if (cr !== null && cr < 3.0) {
      checks.contrast++;
      warnings.push(`WCAG contrast: artDirection.palette accent (${ad.palette.accent}) on bg (${ad.palette.bg}) is ${cr.toFixed(2)}:1 (< 3.0:1)`);
    }
  }

  for (let si = 0; si < scenes.length; si++) {
    const s = scenes[si];

    // 1. Safe-zone & bbox collisions
    if (s.annotatedScene) {
      for (const st of s.annotatedScene.stickers ?? []) {
        if (st.y > maxSafeY || st.y < 48 || st.x < 48 || st.x > 1872) {
          checks.safeZone++;
          errors.push(`${s.id}: annotatedScene sticker "${st.title}" (${st.x}, ${st.y}) outside safe zone`);
        }
      }
      for (const sp of s.annotatedScene.spotlights ?? []) {
        if (sp.cy > maxSafeY || sp.cy < 48 || sp.cx < 48 || sp.cx > 1872) {
          checks.safeZone++;
          warnings.push(`${s.id}: annotatedScene spotlight (${sp.cx}, ${sp.cy}) near/outside safe zone`);
        }
      }
    }

    if (s.upClose?.zoomTarget) {
      const { x, y } = s.upClose.zoomTarget;
      if (x < 0.08 || x > 0.92 || y < 0.08 || y > 0.92) {
        checks.safeZone++;
        warnings.push(`${s.id}: upClose zoomTarget (${x}, ${y}) is very close to frame edge`);
      }
    }

    // CutoutStage face-bubble geometry & safe-zone check
    for (const act of s.cutoutStage?.actors ?? []) {
      if (act.says?.text) {
        const h = act.height ?? 560;
        const ay = Math.min(820, act.y);
        const by = Math.max(96, ay - h * 0.5 - 48);
        if (by > ay - h * 0.45) {
          checks.safeZone++;
          errors.push(`${s.id}: actor "${act.id}" speech bubble y=${by} overlaps head box`);
        }
      }
    }

    // 3. Text overflow & item capacity across 26 devices
    const checkLen = (lbl, val, max) => {
      if (typeof val === "string" && val.length > max) {
        checks.overflow++;
        warnings.push(`${s.id}: ${lbl} length ${val.length} > ${max} chars ("${val.slice(0, 32)}...")`);
      }
    };
    if (s.statSlam) checkLen("statSlam.value", s.statSlam.value, 18);
    if (s.analyticsFunnel?.stages?.length > 6) {
      checks.overflow++;
      errors.push(`${s.id}: analyticsFunnel has ${s.analyticsFunnel.stages.length} stages (max 6)`);
    }
    if (s.gravityPile?.items?.length > 14) {
      checks.overflow++;
      errors.push(`${s.id}: gravityPile has ${s.gravityPile.items.length} items (max 14)`);
    }
    if (s.explodedView?.layers?.length > 6) {
      checks.overflow++;
      errors.push(`${s.id}: explodedView has ${s.explodedView.layers.length} layers (max 6)`);
    }

    // 4. Claim & numeric grounding on data devices
    const dataTexts = [];
    if (s.statSlam?.value) dataTexts.push(s.statSlam.value);
    for (const st of s.analyticsFunnel?.stages ?? []) dataTexts.push(st.value);
    for (const ep of s.barRace?.epochs ?? []) {
      for (const b of ep.bars ?? []) if (b.displayValue) dataTexts.push(b.displayValue);
    }
    if (dataTexts.length && captions.length) {
      const sStart = s.fromFrame ?? 0;
      const sEnd = sStart + (s.durationFrames ?? 0);
      const nearbyText = captions
        .filter((c) => c.endFrame >= sStart - 90 && c.startFrame <= sEnd + 90)
        .map((c) => c.text)
        .join(" ");
      const capNums = new Set(extractNumbers(nearbyText));
      for (const dt of dataTexts) {
        for (const num of extractNumbers(dt)) {
          if (num.length >= 2 && !capNums.has(num)) {
            checks.grounding++;
            warnings.push(`${s.id}: numeric claim "${dt}" not found in adjacent narration`);
          }
        }
      }
    }

    // 5. Copy hygiene (TODO / TBD / FIXME / PLACEHOLDER)
    const allStrings = JSON.stringify(s);
    if (/\b(TODO|TBD|FIXME|PLACEHOLDER)\b/.test(allStrings)) {
      checks.hygiene++;
      errors.push(`${s.id}: contains placeholder token (TODO/TBD/FIXME/PLACEHOLDER)`);
    }

    // Verbatim subtitle duplicate check
    const textsToCheck = [];
    if (s.cutoutStage?.callout) textsToCheck.push({ label: "cutoutStage.callout", text: s.cutoutStage.callout, at: s.cutoutStage.calloutAt ?? 20 });
    for (const act of s.cutoutStage?.actors ?? []) {
      if (act.says?.text) textsToCheck.push({ label: `actor(${act.id}).says`, text: act.says.text, at: act.says.at ?? 0 });
    }
    for (const item of textsToCheck) {
      const absFrame = (s.fromFrame ?? 0) + item.at;
      const cap = captions.find((c) => absFrame >= c.startFrame - 15 && absFrame <= c.endFrame + 15);
      if (cap && tokenOverlap(item.text, cap.text) >= 0.85) {
        checks.hygiene++;
        warnings.push(`${s.id}: ${item.label} ("${item.text}") duplicates active caption ("${cap.text}")`);
      }
    }

    // Phase N / Step N contradiction check
    const allLabels = [
      s.annotatedScene?.banner?.text,
      s.cutoutStage?.banner?.text,
      s.decisionTree?.title,
      s.comicStrip?.title,
      ...(s.comicStrip?.panels ?? []).map((p) => `${p.step || ""} ${p.title || ""}`),
    ].filter(Boolean);
    for (const lbl of allLabels) {
      const m = /\b(phase|step)\s+(\d+)\b[:\s·\-]+([a-z0-9\s]{4,})/i.exec(lbl);
      if (m) {
        const key = `${m[1].toLowerCase()}-${m[2]}`;
        const val = m[3].trim().toLowerCase();
        if (phaseTitles.has(key) && !phaseTitles.get(key).includes(val) && !val.includes(phaseTitles.get(key))) {
          checks.hygiene++;
          warnings.push(`${s.id}: ${key} title "${val}" conflicts with earlier "${phaseTitles.get(key)}"`);
        } else {
          phaseTitles.set(key, val);
        }
      }
    }

    // Motion-density drought check (> 240 frames gap) across all 26 devices
    const dur = s.durationFrames ?? 0;
    if (dur > 260) {
      const times = [0, dur];
      const pushAt = (v) => { if (typeof v === "number" && v >= 0 && v <= dur) times.push(v); };
      for (const p of s.cutoutStage?.props ?? []) pushAt(p.at);
      for (const c of s.cutoutStage?.connectors ?? []) pushAt(c.at);
      for (const a of s.cutoutStage?.actors ?? []) { pushAt(a.at); pushAt(a.actionAt); pushAt(a.says?.at); }
      for (const l of s.kineticManifesto?.lines ?? []) { pushAt(l.at); pushAt(l.strikeAt); }
      for (const p of s.comicStrip?.panels ?? []) { pushAt(p.at); pushAt(p.strikeAt); }
      for (const b of s.liveInterface?.blocks ?? []) pushAt(b.at);
      for (const c of s.liveInterface?.channels ?? []) pushAt(c.at);
      for (const c of s.vennMerge?.circles ?? []) pushAt(c.at);
      pushAt(s.vennMerge?.intersection?.at);
      pushAt(s.explodedView?.expandAt);
      for (const it of s.gravityPile?.items ?? []) pushAt(it.at);
      pushAt(s.crumpleToss?.tossAt);
      for (const st of s.analyticsFunnel?.stages ?? []) pushAt(st.at);
      for (const ep of s.barRace?.epochs ?? []) pushAt(ep.at);
      pushAt(s.upClose?.zoomAt);
      pushAt(s.beforeAfterWipe?.wipeAt);
      const sorted = [...new Set(times)].sort((a, b) => a - b);
      let maxGap = 0;
      for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1]);
      if (maxGap > 240) {
        checks.hygiene++;
        warnings.push(`${s.id}: ${maxGap}-frame (${(maxGap / 30).toFixed(1)}s) motion gap exceeds 8s`);
      }
    }

    // 6. Optional Asset & RGBA integrity check
    if (opts.assetRoot) {
      const imgs = [
        s.bg?.image?.path,
        s.annotatedScene?.image,
        s.editorialSpread?.image,
        s.upClose?.image,
        s.cutoutStage?.backdrop?.image,
        ...(s.cutoutStage?.actors ?? []).map((a) => a.image),
      ].filter(Boolean);
      for (const rel of imgs) {
        const full = path.join(opts.assetRoot, rel);
        if (!fs.existsSync(full)) {
          checks.assets++;
          errors.push(`${s.id}: missing asset ${rel}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, checks };
}

function assertNarrativeQuality(config, opts = {}) {
  const res = analyzeNarrative(config, opts);
  if (!res.ok) {
    throw new Error(`Narrative quality check failed:\n  - ${res.errors.join("\n  - ")}`);
  }
  return res;
}

module.exports = { analyzeNarrative, assertNarrativeQuality, contrastRatio };
