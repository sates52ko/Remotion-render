/**
 * preview-record.js — THE preview-ready record, written and read under one contract (2026-10-30).
 *
 * Why: from 3de4cf54 (2026-10-28) to efdad434 preview-ready.js printed READY while preview-ready.json was never
 * written (an undefined `head` inside an empty catch); render preflight then refused the-magician-s-nephew. The fix
 * made the failure loud; this makes the record itself trustworthy:
 *   - written ATOMICALLY (temp file + rename in the same directory: a reader never sees half a JSON),
 *   - the render-input identity computed by the SAME function render-preflight uses (inputHashOf), never a copy,
 *   - READ BACK after the write and checked with render-preflight's own readPreview(): the record must parse and must
 *     be CURRENT for this config (READY / NOT_READY, never STALE / MISSING). Anything else is a failed record.
 * preview-ready.js exits 0 only when the verdict is READY *and* this returns ok.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function writePreviewRecord({ root, slug, engine, ready, head = null, mute = null, failed = [], now = new Date() }) {
  const rp = require("./render-preflight");
  const book = path.join(root, "books", slug);
  const file = path.join(book, "preview-ready.json");
  const cfgFile = engine ? path.join(book, `config.${engine}.json`) : null;
  const res = { ok: false, file, error: null, record: null, state: null };
  try {
    const configSha256 = cfgFile && fs.existsSync(cfgFile) ? crypto.createHash("sha256").update(fs.readFileSync(cfgFile)).digest("hex") : null;
    const renderInputHash = cfgFile ? rp.inputHashOf(cfgFile) : null;
    if (cfgFile && fs.existsSync(cfgFile) && !renderInputHash) throw new Error(`renderInputHash could not be computed from ${path.basename(cfgFile)}`);
    const record = { ready: ready === true, at: now.toISOString(), head, configSha256, renderInputHash, mute, failed };
    const tmp = path.join(book, `.preview-ready.json.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
    fs.renameSync(tmp, file);
    // read back with the reader render preflight uses: the record must be this config's, parsed, not stale
    const back = JSON.parse(fs.readFileSync(file, "utf8"));
    if (back.at !== record.at || back.renderInputHash !== record.renderInputHash || back.ready !== record.ready) throw new Error("read-back differs from what was written");
    const pv = rp.readPreview({ root, slug, inputHash: renderInputHash, configFile: cfgFile });
    res.state = pv.state;
    if (cfgFile && fs.existsSync(cfgFile) && pv.state !== (record.ready ? "READY" : "NOT_READY")) throw new Error(`render preflight would read this record as ${pv.state}, not ${record.ready ? "READY" : "NOT_READY"}`);
    res.record = record;
    res.ok = true;
  } catch (e) {
    res.error = e.message;
    try { for (const f of fs.readdirSync(book)) if (/^\.preview-ready\.json\.\d+\.tmp$/.test(f)) fs.rmSync(path.join(book, f), { force: true }); } catch {}
  }
  return res;
}

module.exports = { writePreviewRecord };
