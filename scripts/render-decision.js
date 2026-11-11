#!/usr/bin/env node
/**
 * render-decision.js — READ-ONLY: is the production render of THIS config already decided by the operator?
 *
 *   node scripts/render-decision.js --slug=<slug> [--json]
 *
 * Why (2026-10-27): agents asked the operator again for a decision the operator had already recorded (accepted
 * quality debt for an exact config with --accept-quality-debt, which is also that config's production-render
 * approval). The gate logic (lib/render-preflight.js evaluate) was right; there was no way to LOOK the decision up
 * without starting a render. This prints one verdict and changes nothing: it runs no firewall, writes no file,
 * dispatches nothing. It never turns a FAIL into a PASS:
 * Since 2026-10-28 the verdict includes the PREVIEW (books/<slug>/preview-ready.json for this render input), Vox and
 * Antidote alike — the same rule lib/render-preflight.js evaluate() applies before a production dispatch:
 *   COVERED          exit 0  quality covered (a recorded decision holds every REVIEW finding of this exact config, or
 *                            firewall PASS / no firewall) AND preview READY or covered by a decision for this render
 *                            input that carries preview coverage: the production render needs no new question —
 *                            render.js still runs the real preflight
 *   AUTHORIZED       exit 0  (2026-10-30) no debt (firewall PASS / no firewall, preview READY) and the operator's render
 *                            authorization recorded for THIS render input (render.js --authorize-render)
 *   NEEDS_AUTHORIZATION exit 2  the debt is accepted / covered but the operator's render go is not recorded
 *   (COVERED now also needs that go; a decision recorded before 2026-10-30 — no `kind` — was the combined record and
 *    still counts. NO_DEBT below = settled quality, go missing.)
 *   BLOCK            exit 1  BLOCK findings: no decision can cover them
 *   NEEDS_DECISION   exit 2  REVIEW findings or a preview that is not READY (NOT READY / stale / missing) with no
 *                            decision for this config (a new config or a new finding is never covered by an older
 *                            decision; an older decision without preview coverage never covers a preview) — the
 *                            operator decides
 *   NO_DEBT          exit 2  firewall PASS (or no firewall: Vox) and preview READY: no debt to accept; a production
 *                            render still needs the operator's go
 *   NO_REPORT/STALE  exit 3  no firewall report for this config — render.js's preflight computes it
 * The preview verdict is printed as it is (NOT READY stays NOT READY: an accepted decision does not change it).
 */
const fs = require("fs");
const path = require("path");
const rp = require("./lib/render-preflight");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const slug = args.slug;
if (!slug && require.main === module) { console.error("usage: node scripts/render-decision.js --slug=<slug> [--json]"); process.exit(2); }
const root = args.root ? path.resolve(String(args.root)) : path.resolve(__dirname, "..");

function decisionStatus({ root, slug }) {
  const dir = path.join(root, "books", slug);
  let engine = null;
  try { engine = JSON.parse(fs.readFileSync(path.join(dir, "book.json"), "utf8")).engine || null; } catch {}
  const cfgFile = ["config.antidote.json", "config.vox.json"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f) && (!engine || path.basename(f) === `config.${engine}.json`));
  if (!cfgFile) return { verdict: "NO_CONFIG", exit: 3, detail: `books/${slug}: no config.${engine || "<engine>"}.json` };
  const hash = rp.configHash(cfgFile), inputHash = rp.inputHashOf(cfgFile);
  // preview verdict, as recorded for THIS render input (never changed here) — part of the verdict since 2026-10-28
  const pv = rp.readPreview({ root, slug, inputHash, configFile: cfgFile });
  const preview = { state: pv.state, ready: pv.state === "READY", current: pv.state !== "STALE", mute: pv.mute || null, at: pv.at };
  // the operator's production render authorization (2026-10-30): its own record, never a quality-debt acceptance
  const auth = rp.authorizationFor(rp.loadDecisions(root, slug), inputHash);
  const authorization = auth ? { at: auth.at, reason: auth.reason, commit: auth.commit, kind: auth.kind || "combined (before 2026-10-30)" } : null;
  const base = { slug, engine: engine || path.basename(cfgFile).split(".")[1], config: path.relative(root, cfgFile), configHash: hash, renderInputHash: inputHash, preview, authorization };
  const pvText = `preview ${pv.state.replace("_", " ")}${rp.muteLine(pv.mute) ? ` (${rp.muteLine(pv.mute)})` : ""}`;
  const decisionOf = (d) => d && { at: d.at, commit: d.commit, configHash: d.configHash, renderInputHash: d.renderInputHash || null, reason: d.reason, ...(d.preview ? { preview: d.preview } : {}) };
  const decided = (d) => `the operator's decision of ${d.at} (commit ${String(d.commit || "?").slice(0, 8)}, config ${d.renderInputHash || d.configHash}): "${String(d.reason || "").slice(0, 160)}"`;
  const authText = auth ? `production render authorized by ${decided(auth)}` : "";
  const ASK = `The operator decides (render.js --accept-quality-debt="<why>" records it for this exact config).`;
  // quality + preview settled: the verdict is the authorization — AUTHORIZED / COVERED with it, else the operator's go is missing
  const settled = (verdict, detail, extra = {}) => auth
    ? { ...base, verdict, exit: 0, ...extra, detail: `${detail}; ${authText}` }
    : { ...base, verdict: verdict === "AUTHORIZED" ? "NO_DEBT" : "NEEDS_AUTHORIZATION", exit: 2, ...extra, detail: `${detail}; no render authorization recorded for render input ${inputHash} — the production render is the operator's go (render.js --authorize-render="<the operator's words>")` };
  if (!/config\.antidote\.json$/.test(cfgFile)) {
    // Vox: no firewall, so no quality debt — but the preview still decides (2026-10-28: was NOT_APPLICABLE whatever the preview said)
    const ev = rp.evaluate({ mode: rp.MODE.PRODUCTION, firewall: null, hash, inputHash, decisions: rp.loadDecisions(root, slug), preview: pv });
    if (pv.state === "READY") return settled("AUTHORIZED", "no narrative firewall for this engine and preview READY for this config: no debt to accept", { quality: "NOT_ASSESSED" });
    if (ev.ok && ev.previewBase) return settled("COVERED", `${pvText} — covered by ${decided(ev.previewBase)}`, { quality: "NOT_ASSESSED", decision: decisionOf(ev.previewBase) });
    return { ...base, verdict: "NEEDS_DECISION", exit: 2, quality: "NOT_ASSESSED", detail: `${pvText} and no decision for this config — ${pv.detail}. ${ASK}` };
  }
  const repFile = path.join(dir, "narrative-visual-firewall.report.json");
  let rep = null;
  try { rep = JSON.parse(fs.readFileSync(repFile, "utf8")); } catch {}
  if (!rep) return { ...base, verdict: "NO_REPORT", exit: 3, detail: "no production firewall report yet — render.js's preflight computes it (nothing is decided before that)" };
  if (rep.renderInputHash && inputHash && rep.renderInputHash !== inputHash) return { ...base, verdict: "STALE_REPORT", exit: 3, detail: `the firewall report was computed on config ${rep.renderInputHash}, the config is now ${inputHash} — render.js's preflight recomputes it` };
  const firewall = rp.readQuality({ root, slug, preview: false });
  const ev = rp.evaluate({ mode: rp.MODE.PRODUCTION, firewall, hash, inputHash, decisions: rp.loadDecisions(root, slug), preview: pv });
  const q = `${firewall.blocks} BLOCK, ${firewall.reviews} REVIEW`;
  const quality = firewall.blocks || firewall.reviews ? "FAIL" : "PASS";
  if (firewall.blocks > 0) return { ...base, verdict: "BLOCK", exit: 1, quality, detail: `${q}: a BLOCK is never covered by a decision — fix it` };
  if (ev.ok && ev.decision === "PASS") return settled("AUTHORIZED", "firewall PASS (no REVIEW) and preview READY for this config: no debt to accept", { quality });
  if (ev.ok) {
    // COVERED = quality covered (or PASS) AND preview covered (or READY) AND the operator's render authorization
    const d = ev.previewBase || ev.base;
    const parts = [firewall.reviews ? `every finding (${ev.covered.length} distinct) covered by ${decided(ev.base)}` : "firewall PASS",
      ev.previewBase ? `${pvText} — covered by ${decided(ev.previewBase)}` : "preview READY"];
    return settled("COVERED", `${q} — ${parts.join("; ")}`, { quality, decision: decisionOf(d) });
  }
  return { ...base, verdict: "NEEDS_DECISION", exit: 2, quality, needs: ev.needsAcceptKinds, detail: `${q}, ${pvText} — ${ev.blockers.join(" ")} ${ASK}` };
}

/**
 * The eight facts, never merged (2026-10-29/30 — essentialism: 605 REVIEW accepted, preflight GO, dispatch started,
 * while the readcheck and the sealed mute test were not done; the-magician-s-nephew: NO_DEBT and no way to record the
 * operator's go). Each is read from its own record; none implies another: a technical GO is not a quality PASS, an
 * accepted debt is not a render authorization, a finished film is not an upload authorization. READ-ONLY.
 */
function sevenFacts({ root, slug, st }) {
  const dir = path.join(root, "books", slug);
  const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const pv = st.preview || {};
  const mute = rp.muteLine(pv.mute);
  const decs = rp.loadDecisions(root, slug).filter((d) => d.renderInputHash === st.renderInputHash);
  const debt = decs.filter((d) => d.kind !== "render-authorization");
  const d = debt[debt.length - 1] || null;
  const runs = ((rj(path.join(dir, "render-facts.json")) || {}).runs) || [];
  const pre = runs.filter((r) => r.kind === "preflight" && r.mode === "production").pop() || null;
  const split = [path.join(root, `.render-github-split.${slug}.json`), path.join(root, ".render-github-split.json")].map(rj).find((s) => s && s.slug === slug) || null;
  let cloud = null;
  try { cloud = rj(require("./lib/cloud-assemble").cloudStateFile(root, slug)); } catch {}
  const film = path.join(root, "out", `${slug}.mp4`);
  const yt = rj(path.join(dir, "youtube-ready.json"));
  const a = st.authorization;
  return {
    A_quality: mute ? `blind mute test: ${mute}${pv.mute.pass === false ? " — FAIL" : pv.mute.pass ? " — PASS" : ""}` : "NOT MEASURED for this config (no mute verdict recorded by preview-ready)",
    B_preview: `${String(pv.state || "?").replace("_", " ")}${pv.state === "READY" ? "" : " — not READY (a decision never changes this)"}`,
    C_acceptance: d ? `the operator's decision of ${d.at} for render input ${d.renderInputHash}: ${(d.keys || []).length} REVIEW finding(s)${d.preview ? `, and the preview as it was then (${d.preview.state}${d.preview.mute ? `, ${rp.muteLine(d.preview.mute)}` : ""}) — never a verdict recorded after it` : ""}` : "none for this render input (no quality debt accepted)",
    D_authorization: a ? `the operator's render authorization of ${a.at} (${a.kind}) for render input ${st.renderInputHash}: "${String(a.reason || "").slice(0, 120)}"` : st.verdict === "BLOCK" ? "never (BLOCK)" : `MISSING for render input ${st.renderInputHash || "?"} — render.js --authorize-render="<the operator's words>" records it`,
    E_technical: pre ? `last production preflight ${pre.at}: ${pre.decision && pre.decision.ok ? "GO" : "STOP"} on render input ${pre.renderInputHash}${pre.renderInputHash === st.renderInputHash ? " (this config)" : " (ANOTHER config — rerun)"} — technical only, not a quality verdict` : "no production preflight recorded",
    F_dispatch: split ? `${(split.segments || []).length} segment(s) dispatched ${split.dispatchedAt || ""} (${split.mode || "?"})${split.renderInputHash ? ` for render input ${split.renderInputHash}${split.renderInputHash === st.renderInputHash ? "" : " (ANOTHER config)"}` : ""} — node scripts/render-status.js --slug=${slug} for the live state` : "nothing dispatched (no split state)",
    G_assembly: cloud && cloud.slug === slug ? `cloud assembly ${cloud.verified ? "VERIFIED" : "NOT verified"}${cloud.bundleSha ? ` (bundle ${String(cloud.bundleSha).slice(0, 8)})` : ""}${fs.existsSync(film) ? "; the film is on disk" : ""}` : fs.existsSync(film) ? "a film is on disk, no cloud assembly record" : "not assembled",
    H_youtube: yt ? `youtube pack: ${yt.ready || yt.status === "READY" ? "READY" : "NOT READY"} — not a render permission; upload / publish is always the operator's` : "youtube pack not checked (lint-titles --pack) — upload / publish is always the operator's",
  };
}

module.exports = { decisionStatus, sevenFacts };

if (require.main === module) {
  const st = decisionStatus({ root, slug });
  if (st.configHash) st.facts = sevenFacts({ root, slug, st });
  if (args.json) console.log(JSON.stringify(st, null, 2));
  else {
    console.log(`${st.verdict} ${slug}: ${st.detail}`);
    if (st.facts) {
      const L = { A_quality: "A quality verdict", B_preview: "B preview readiness", C_acceptance: "C quality-debt acceptance", D_authorization: "D render authorization", E_technical: "E technical preflight", F_dispatch: "F GitHub dispatch", G_assembly: "G cloud assembly", H_youtube: "H publishing readiness" };
      for (const [k, v] of Object.entries(st.facts)) console.log(`  ${L[k].padEnd(25)}: ${v}`);
    }
    if (st.preview) console.log(`  preview: ${st.preview.ready ? "READY" : "NOT READY"}${st.preview.state === "STALE" ? " (recorded on another config)" : st.preview.state === "MISSING" ? " (no preview-ready.json)" : ""}${rp.muteLine(st.preview.mute) ? ` — ${rp.muteLine(st.preview.mute)}` : ""} — unchanged by any decision`);
    let frozen = false; try { frozen = require("./lib/frozen").isFrozen(slug, root); } catch {}
    const codeRoot = path.resolve(__dirname, "..");
    const BR = path.resolve(root) !== codeRoot ? ` --book-root=${root}` : "";
    if (frozen) console.log("  PUBLISHED (frozen): this book is never re-rendered — the verdict is a record only");
    else if (st.verdict === "COVERED" || st.verdict === "AUTHORIZED") console.log(`  → already decided: run the production render without asking again: node scripts/render.js --slug=${slug} --method=github${BR} (its preflight still checks everything and must say GO)`);
    else if (st.verdict === "NO_DEBT" || st.verdict === "NEEDS_AUTHORIZATION") console.log(`  → quality and preview are settled; the production render is the OPERATOR's go. On their word (and only then): node scripts/render.js --slug=${slug} --method=github${BR} --authorize-render="<the operator's words>"`);
  }
  process.exit(st.exit);
}
