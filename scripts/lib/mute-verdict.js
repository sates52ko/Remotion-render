/**
 * mute-verdict.js — which blind mute run is the verdict for THIS film, by identity, not by time or array order
 * (2026-10-30). Real case: the-magician-s-nephew. run3 was drawn from an old film (stills of config e92df87d, before
 * make-book and before the pin) and never judged; run4 PASSED unsealed before the pin; run5 was sealed on the new pin
 * and PASSED; preview-ready recorded READY for run5 — and preview-state still stopped on "run3: needs the blind
 * describer" because every untallied label counted as open, whatever film it showed.
 *
 * Identity of a run (what it judged):
 *   - new runs: renderInputHash / configSha256 stamped by mute-test prep (sample-meta.json) and copied by tally;
 *   - legacy runs: audit/mute/<slug>/<label>/stills/.config-sha (16 hex of the config sha256 the stills came from),
 *     trusted only when the label's totals.json is not older than it (a later re-prep rewrites it);
 *   - none of these → UNBOUND: never the verdict for the current film (an old PASS without evidence does not carry).
 * A sealed run must still verify its seal (seal.json ids hash = the run's sealSha256).
 * Labels can be retired WITHOUT touching their sealed files through audit/mute/<slug>/STATUS.json (written by
 * mute-test.js supersede): SUPERSEDED / STALE / VOID labels are never open and never the verdict.
 * Read-only.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RETIRED = new Set(["SUPERSEDED", "STALE", "VOID"]);
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const idsSha = (ids) => sha(JSON.stringify(ids));

function muteDir(root, slug) { return path.join(root, "audit", "mute", slug); }
function statusFile(root, slug) { return path.join(muteDir(root, slug), "STATUS.json"); }

/** label -> { status, reason, ... } from the sidecar (any extra fields are kept; only `status` decides) */
function labelStatus(root, slug) {
  const s = readJSON(statusFile(root, slug), {}) || {};
  const out = {};
  for (const [k, v] of Object.entries(s)) if (v && typeof v === "object" && typeof v.status === "string") out[k] = v;
  return out;
}
const isRetired = (st) => !!st && RETIRED.has(String(st.status).toUpperCase());

/** the identity of the CURRENT film */
function currentIdentity(configFile) {
  if (!configFile || !fs.existsSync(configFile)) return { configSha256: null, renderInputHash: null };
  const configSha256 = sha(fs.readFileSync(configFile));
  let renderInputHash = null;
  try { renderInputHash = require("./render-preflight").inputHashOf(configFile); } catch {}
  return { configSha256, renderInputHash };
}

/** what a label's stills / tally were made from */
function labelIdentity(root, slug, label) {
  const d = path.join(muteDir(root, slug), label);
  const meta = readJSON(path.join(d, "sample-meta.json"), {}) || {};
  const shaFile = path.join(d, "stills", ".config-sha");
  let stills16 = null; try { stills16 = fs.readFileSync(shaFile, "utf8").trim() || null; } catch {}
  const tallied = fs.existsSync(path.join(d, "totals.json"));
  return { dir: d, meta, stills16, stillsAt: mtime(shaFile), tallied, totalsAt: mtime(path.join(d, "totals.json")),
    drawnAt: Date.parse(meta.createdAt || "") || mtime(path.join(d, "sample.json")), sealed: fs.existsSync(path.join(d, "seal.json")), keyed: fs.existsSync(path.join(d, "key.json")) };
}

/** does this run (a mute-test.json entry) judge the current film? → { match, by, why } */
function runMatches(root, slug, run, cur) {
  if (run.renderInputHash && cur.renderInputHash) return run.renderInputHash === cur.renderInputHash ? { match: true, by: "renderInputHash" } : { match: false, why: `judged render input ${run.renderInputHash}, the film is ${cur.renderInputHash}` };
  if (run.configSha256 && cur.configSha256) return run.configSha256 === cur.configSha256 ? { match: true, by: "configSha256" } : { match: false, why: `judged config ${String(run.configSha256).slice(0, 16)}, the film is ${cur.configSha256.slice(0, 16)}` };
  const id = labelIdentity(root, slug, run.label);
  if (id.stills16 && cur.configSha256) {
    if (id.totalsAt && id.stillsAt > id.totalsAt + 1000) return { match: false, why: "its stills were re-rendered after the tally (legacy .config-sha cannot tell what was judged)" };
    return id.stills16 === cur.configSha256.slice(0, 16) ? { match: true, by: "stills .config-sha (legacy)" } : { match: false, why: `its stills came from config ${id.stills16}, the film is ${cur.configSha256.slice(0, 16)}` };
  }
  return { match: false, why: "UNBOUND: no record of which film it judged" };
}

function sealHolds(root, slug, run) {
  if (!run.sealed) return true;
  const seal = readJSON(path.join(muteDir(root, slug), run.label, "seal.json"), null);
  return !!seal && Array.isArray(seal.ids) && idsSha(seal.ids) === seal.idsSha256 && (!run.sealSha256 || run.sealSha256 === seal.idsSha256);
}

/**
 * The verdict for the current film: among mute-test.json runs that judged THIS film (identity), are not retired, not
 * a diagnostic (--vs / --frames-from) and whose seal holds — `last` is the latest such run and `verdict` the latest
 * fresh one (the rule preview-ready always used, now bound to the film). rejected lists every run left out and why.
 */
function currentVerdict({ root, slug, configFile, runs = null }) {
  const book = path.join(root, "books", slug);
  const list = runs || ((readJSON(path.join(book, "mute-test.json"), {}) || {}).runs || []);
  const cur = currentIdentity(configFile);
  const status = labelStatus(root, slug);
  const isFresh = (r) => (r.sample ? r.sample === "fresh" : !r.vs);
  const ok = [], rejected = [];
  for (const r of list) {
    if (!r || !r.label || !r.totals) continue;
    const meta = labelIdentity(root, slug, r.label).meta;
    if (isRetired(status[r.label])) { rejected.push({ label: r.label, why: `${String(status[r.label].status).toUpperCase()} (STATUS.json): ${status[r.label].reason || ""}`.trim() }); continue; }
    if (r.vs || meta.framesFrom) { rejected.push({ label: r.label, why: "diagnostic (--vs / --frames-from)" }); continue; }
    if (!sealHolds(root, slug, r)) { rejected.push({ label: r.label, why: "its seal does not verify" }); continue; }
    const m = runMatches(root, slug, r, cur);
    if (!m.match) { rejected.push({ label: r.label, why: m.why }); continue; }
    ok.push({ ...r, matchedBy: m.by });
  }
  const byDate = (a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0);
  ok.sort(byDate);
  const last = ok[ok.length - 1] || null;
  const verdict = [...ok].reverse().find(isFresh) || null;
  return { last, verdict, matching: ok, rejected, identity: cur };
}

/**
 * An untallied label that must NOT be carried through its sub-steps any more, or null when it is genuinely open.
 * A sealed open label always stays open (it is re-rendered from the current config by design — the holdout rule).
 */
function staleOpenReason({ root, slug, label, scopeFrom = 0, configSha256 = null }) {
  const st = labelStatus(root, slug)[label];
  if (isRetired(st)) return `${String(st.status).toUpperCase()} (STATUS.json${st.reason ? `: ${st.reason}` : ""})`;
  const id = labelIdentity(root, slug, label);
  if (id.sealed) return null;
  if (id.keyed && id.stills16 && configSha256 && id.stills16 !== configSha256.slice(0, 16)) return `STALE: its stills came from config ${id.stills16}, the film is ${configSha256.slice(0, 16)}`;
  if (scopeFrom && id.drawnAt && id.drawnAt < scopeFrom) return `STALE: drawn ${new Date(id.drawnAt).toISOString().slice(0, 16)}, before this production's pin`;
  return null;
}

module.exports = { currentVerdict, staleOpenReason, labelStatus, labelIdentity, currentIdentity, runMatches, statusFile, RETIRED };
