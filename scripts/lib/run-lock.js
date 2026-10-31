// ONE RUN PER BOOK (2026-10-26): a long job must not start twice for the same book, and a running one must not be
// cancelled and restarted. Two small checks, no process manager:
//   takeRunLock(file, what)   — a pid lock: refuses (exit 3) while another LIVE process holds it, takes over a dead
//                               holder's lock, releases it on exit. Per book: different books never share a lock.
//   renderInFlight(state, h)  — a GitHub split render whose dispatching process did not wait for it (--no-wait) or
//                               died: its segments may still be running on the pool for up to `h` hours.
// Same pattern as mute-test.js prep's .prep.lock (2026-10-24).
const fs = require("fs");
const os = require("os");

const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const pidAlive = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

function takeRunLock(file, what) {
  const cur = readJSON(file);
  if (cur && cur.pid !== process.pid && pidAlive(cur.pid) && (!cur.host || cur.host === os.hostname())) {
    console.error(`❌ ${what} is already running (pid ${cur.pid}, since ${cur.at}). Not starting it twice — let it finish; do not cancel or restart it. (lock: ${file})`);
    process.exit(3);
  }
  if (cur && cur.pid !== process.pid) console.warn(`⚠ ${what}: taking over a stale lock (pid ${cur.pid} is not running)`);
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), what, host: os.hostname() }) + "\n");
  process.on("exit", () => { try { const now = readJSON(file); if (now && now.pid === process.pid) fs.unlinkSync(file); } catch {} });
  return file;
}

// A split render recorded as dispatched less than `hours` ago whose dispatching process did not see it through.
function renderInFlight(stateFile, hours = 3, now = Date.now()) {
  const s = readJSON(stateFile);
  if (!s || !s.dispatchedAt) return null; // older state files carry no timestamp: never blocked
  const newest = Math.max(Date.parse(s.dispatchedAt) || 0, ...(s.segments || []).map((g) => Date.parse(g.dispatchedAt) || 0)); // a resumed run dispatches later than its first stamp
  const age = now - newest;
  if (!(age >= 0 && age < hours * 3600 * 1000)) return null;
  if (s.endedAt && s.waited === true) return null; // the --wait loop saw it through (finished or failed loudly)
  // per-segment records (render-dispatch.js, 2026-10-27): a run that stopped before dispatching anything (a refused or
  // failed push) has nothing on the pool — rerunning the same command resumes its pushes, it is not a second render
  const segs = s.segments || [];
  const recorded = segs.some((g) => "pushed" in g || "pushError" in g || "dispatchCode" in g || "dispatchedAt" in g);
  if (recorded && !segs.some((g) => g.dispatchedAt || g.dispatchCode !== undefined && g.dispatchCode !== null && g.dispatchCode !== 0 && !(Number(g.dispatchCode) >= 400))) return null;
  return { dispatchedAt: s.dispatchedAt, ageMin: Math.round(age / 60000), segments: (s.segments || []).length, bundleSha: s.bundleSha || null, why: s.endedAt ? "dispatched with --no-wait" : "the dispatching process ended without finishing (killed / crashed)" };
}

module.exports = { takeRunLock, renderInFlight, pidAlive };
