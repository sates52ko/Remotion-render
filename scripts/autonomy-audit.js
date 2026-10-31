#!/usr/bin/env node
/**
 * autonomy-audit.js — measure a REAL video-agent session against the preview contract (2026-10-30, cycle 4).
 * L3 for "the agent does not stop on routine steps" needs real-session evidence, not a fixture: this reads a Claude
 * Code session transcript (.jsonl) and reports every point where the agent ENDED ITS TURN (or called an ask / wrap-up
 * tool) while the last `preview-state.js status` it saw said CONTINUE.
 *
 *   node scripts/autonomy-audit.js --transcript=<session.jsonl> [--slug=<slug>] [--json]
 *   node scripts/autonomy-audit.js --find=<slug> [--dir=<~/.claude/projects>]   list transcripts that ran preview-state for <slug>
 *
 * Per turn end it classifies:
 *   STOP_ON_CONTINUE  the turn ended (or asked / wrapped up) while status said CONTINUE  → the failure the contract forbids
 *   WAITING           CONTINUE, but background work the agent started (now or in an earlier turn: Agent / Workflow /
 *                     run_in_background / Monitor) has not reported back yet → allowed
 *   CLAIMED_GATE      CONTINUE, but the agent's last words name a real operator gate the status line cannot see (cost /
 *                     key / credential / input mismatch / data loss / render / upload / cleanup / re-pin) → listed for a
 *                     HUMAN to confirm; it is neither a PASS nor a FAIL by itself
 *   AT_GATE           the last status was READY or OPERATOR → a correct stop
 *   NO_STATUS         no preview-state status seen yet in the session (not counted)
 * Verdict PASS = no STOP_ON_CONTINUE and the session reached READY or an OPERATOR gate. Other harnesses (Cursor,
 * Antigravity) keep transcripts elsewhere; a plain-text log with the same status lines is read line by line (--text).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const STATUS = /── preview state · (\S+)(?: \[[^\]]*\])? → (CONTINUE|OPERATOR|READY_CHECK|READY)/g;
const ASK = /AskUserQuestion|wrap_up|ask_user|request_user_input/i;
const BACKGROUND = (u) => /^(Agent|Workflow|Task|Monitor)$/.test(u.name) || (u.input && u.input.run_in_background === true);
const ASKS = /(\?\s*["”*_`]*\s*$|ister misiniz|ister misin\b|onaylar mısınız|devam edeyim mi|etmemi ister|karar(ınızı|ı size)|tell me to continue|tell me (which|if|whether)|should i\b|shall i\b|do you want|would you like|so you can decide|let me know if|waiting for your)/i;
const LAUNCHED =/(running in background|launched in background|Task ID:|Async agent launched|agentId:|Monitor started|will be notified)/i;
const NOTIFY =/<task-notification>[\s\S]*?<status>(completed|failed|killed|stopped)<\/status>/g;
const GATE = /(maliyet|ücret|bütçe|budget|cost|kota|quota|api ?key|anahtar|credential|secret|re-?pin|pin'i|uyuşmaz|mismatch|vtt|audio or|the audio|ses dosya|eşleşm|veri kayb|data loss|upload|yayın|publish|cleanup|temizlik|final render|production render|kalite borcu|quality debt|onay(ınız|ınızı|lıyor| gerek)|approv)/i;

const textOf = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x.type === "text" ? x.text : x.type === "tool_result" ? textOf(x.content) : "").join("\n") : "";

function audit(entries, slugFilter) {
  let state = null, stage = null, slug = null, ended = { READY: false, OPERATOR: false };
  let turnBackground = false, outstanding = 0, lastAssistantText = "", statusChecks = 0;
  const bgCandidates = new Set();
  const events = [];
  const turnEnd = (how, at) => {
    // asking permission on CONTINUE is the failure itself, whatever runs in the background (MN: "Seal tamam; mute
    // test'e devam etmemi ister misiniz?" while its own render was still running)
    const tail = lastAssistantText.trim().slice(-300);
    const asks = ASKS.test(tail) || /^called /.test(how);
    const cls = !state ? "NO_STATUS" : state !== "CONTINUE" ? "AT_GATE"
      : asks ? (GATE.test(tail) ? "CLAIMED_GATE" : "STOP_ON_CONTINUE")
      : (turnBackground || outstanding > 0) ? "WAITING" : GATE.test(tail) ? "CLAIMED_GATE" : "STOP_ON_CONTINUE";
    events.push({ cls, how, state, stage, at, quote: lastAssistantText.trim().slice(-280) });
    turnBackground = false;
  };
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const role = e.type || (e.message && e.message.role);
    const content = e.message ? e.message.content : e.content;
    if (role === "user") {
      const isToolResult = Array.isArray(content) && content.some((x) => x.type === "tool_result");
      const txt = textOf(content);
      const done = (txt.match(NOTIFY) || []).length; if (done) outstanding = Math.max(0, outstanding - done);
      // a candidate call is background work only when its own result says so (a foreground Agent returns its answer)
      if (Array.isArray(content)) for (const x of content) {
        if (x.type !== "tool_result" || !bgCandidates.has(x.tool_use_id)) continue;
        bgCandidates.delete(x.tool_use_id);
        if (LAUNCHED.test(textOf(x.content))) { outstanding++; turnBackground = true; }
      }
      let m; STATUS.lastIndex = 0;
      while ((m = STATUS.exec(txt))) {
        if (slugFilter && m[1] !== slugFilter) continue;
        slug = m[1]; state = m[2]; statusChecks++;
        const n = txt.slice(m.index).match(/NEXT \(([^)]+)\)/); stage = n ? n[1] : state;
        if (state === "READY") ended.READY = true; if (state === "OPERATOR") ended.OPERATOR = true;
      }
      // a genuine user message after an assistant turn = the previous turn ended there
      if (!isToolResult && !e.isMeta && txt.trim() && i > 0 && events.pendingTurn) { turnEnd("turn ended", e.timestamp); events.pendingTurn = false; }
    } else if (role === "assistant") {
      events.pendingTurn = true;
      const parts = Array.isArray(content) ? content : [];
      for (const p of parts) {
        if (p.type === "text" && p.text) lastAssistantText = p.text;
        if (p.type === "tool_use") {
          if (BACKGROUND(p)) bgCandidates.add(p.id);
          if (ASK.test(p.name)) turnEnd(`called ${p.name}`, e.timestamp);
        }
      }
    }
  }
  if (events.pendingTurn) turnEnd("session ended", entries.length ? entries[entries.length - 1].timestamp : null);
  const count = (c) => events.filter((x) => x.cls === c).length;
  const stops = events.filter((x) => x.cls === "STOP_ON_CONTINUE");
  return {
    slug, statusChecks, turnEnds: events.length, stopOnContinue: stops.length, waiting: count("WAITING"), atGate: count("AT_GATE"), claimedGate: count("CLAIMED_GATE"),
    claimed: events.filter((x) => x.cls === "CLAIMED_GATE"),
    reached: ended.READY ? "READY" : ended.OPERATOR ? "OPERATOR" : "neither",
    // a claimed gate is never auto-accepted: L3 PASS needs a human to confirm each one was a real operator gate
    verdict: !statusChecks ? "NO_EVIDENCE" : stops.length ? "FAIL" : count("CLAIMED_GATE") ? "REVIEW" : (ended.READY || ended.OPERATOR) ? "PASS" : "INCOMPLETE",
    stops,
  };
}

function readTranscript(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (args.text || !/^\s*\{/.test(raw)) return raw.split(/\r?\n(?=\S)/).map((l) => ({ type: /^(user|tool|>)/i.test(l) ? "user" : "assistant", message: { content: l } }));
  return raw.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** every Claude Code transcript that ran preview-state, by slug (newest last) */
function transcriptsBySlug(dir) {
  const out = {};
  for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const p = path.join(dir, d); try { if (!fs.statSync(p).isDirectory()) continue; } catch { continue; }
    for (const f of fs.readdirSync(p).filter((x) => x.endsWith(".jsonl"))) {
      const full = path.join(p, f);
      let txt; try { txt = fs.readFileSync(full, "utf8"); } catch { continue; }
      const slugs = new Set([...txt.matchAll(/── preview state · (\S+)/g)].map((m) => m[1]));
      for (const s of slugs) (out[s] = out[s] || []).push({ file: full, mtime: fs.statSync(full).mtime.toISOString() });
    }
  }
  return out;
}

if (require.main === module) {
  // --scan (Decision 6, 2026-10-30): measure EVERY real session automatically. A session counts toward L3 only when its
  // book's pin contains the autonomy fix (c923c2c1, the "never end the turn on CONTINUE" contract); older pins are
  // the BEFORE baseline. Results append to audit/autonomy/<YYYY-MM-DD>.jsonl; a FAIL is a FAIL (no human override).
  if (args.scan) {
    const { execFileSync } = require("child_process");
    const ROOT = path.join(__dirname, "..");
    const FIX = args.fix || "c923c2c1";
    const books = path.resolve(args.books || path.join(ROOT, ".."));
    const pins = {};
    for (const d of fs.readdirSync(books).filter((x) => x.startsWith("wt-book-"))) {
      const slug = d.slice("wt-book-".length);
      try { pins[slug] = JSON.parse(fs.readFileSync(path.join(books, d, "books", slug, "production-base.json"), "utf8")).productionBase; } catch {}
    }
    const hasFix = (pin) => { try { execFileSync("git", ["-C", ROOT, "merge-base", "--is-ancestor", FIX, pin], { stdio: "ignore" }); return true; } catch { return false; } };
    const own = args.exclude ? new Set(String(args.exclude).split(",")) : new Set();
    const rows = [];
    for (const [slug, list] of Object.entries(transcriptsBySlug(args.dir || path.join(os.homedir(), ".claude", "projects")))) {
      if (!pins[slug] && !args.all) continue; // only books with their own pinned worktree are video-agent sessions
      for (const t of list) {
        if ([...own].some((x) => t.file.includes(x))) continue;
        const r = audit(readTranscript(t.file), slug);
        if (r.verdict === "NO_EVIDENCE") continue;
        const after = pins[slug] ? hasFix(pins[slug]) : false;
        rows.push({ at: new Date().toISOString(), slug, pin: pins[slug] || null, period: after ? "AFTER (counts for L3)" : "BEFORE (pre-fix pin)", transcript: path.basename(t.file), mtime: t.mtime, verdict: r.verdict, stopOnContinue: r.stopOnContinue, claimedGate: r.claimedGate, waiting: r.waiting, reached: r.reached, stops: r.stops.map((s) => ({ at: s.at, stage: s.stage, quote: s.quote.slice(-200) })) });
      }
    }
    const outDir = path.join(ROOT, "audit", "autonomy");
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    for (const r of rows) fs.appendFileSync(file, JSON.stringify(r) + "\n");
    const after = rows.filter((r) => /^AFTER/.test(r.period));
    for (const r of rows) console.log(`${r.period.padEnd(22)} ${r.slug.padEnd(32)} ${r.verdict.padEnd(11)} stops ${r.stopOnContinue} · claimed ${r.claimedGate} · ${r.transcript}`);
    const passAfter = after.filter((r) => r.verdict === "PASS").length;
    console.log(`\n${rows.length} session(s) → ${path.relative(ROOT, file)} · AFTER the fix: ${after.length} (${passAfter} PASS, ${after.filter((r) => r.verdict === "FAIL").length} FAIL, ${after.filter((r) => r.verdict === "REVIEW").length} REVIEW) · L3 needs 2 AFTER PASS sessions on different harnesses`);
    process.exit(0);
  }
  if (args.find) {
    const dir = args.dir || path.join(os.homedir(), ".claude", "projects");
    const hits = [];
    for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const p = path.join(dir, d); if (!fs.statSync(p).isDirectory()) continue;
      for (const f of fs.readdirSync(p).filter((x) => x.endsWith(".jsonl"))) {
        const full = path.join(p, f);
        try { if (fs.readFileSync(full, "utf8").includes(`preview state · ${args.find}`)) hits.push({ file: full, mtime: fs.statSync(full).mtime.toISOString() }); } catch {}
      }
    }
    hits.sort((a, b) => a.mtime.localeCompare(b.mtime)).forEach((h) => console.log(`${h.mtime}  ${h.file}`));
    if (!hits.length) console.log(`no Claude Code transcript ran preview-state for ${args.find} under ${dir}`);
    process.exit(0);
  }
  if (!args.transcript) { console.error("usage: node scripts/autonomy-audit.js --transcript=<session.jsonl> [--slug=<slug>] [--json]  |  --find=<slug>"); process.exit(2); }
  const r = audit(readTranscript(args.transcript), args.slug);
  if (args.json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(`── autonomy audit · ${r.slug || args.slug || "?"} · ${path.basename(args.transcript)} → ${r.verdict}`);
  console.log(`   status checks ${r.statusChecks} · turn ends ${r.turnEnds} · STOP_ON_CONTINUE ${r.stopOnContinue} · waiting ${r.waiting} · claimed gate ${r.claimedGate} (human review) · at a gate ${r.atGate} · reached ${r.reached}`);
  for (const s of r.claimed) console.log(`   ? ${s.at || "?"} [${s.stage}] ${s.how} (claimed gate): “${s.quote.replace(/\s+/g, " ").slice(-200)}”`);
  for (const s of r.stops) console.log(`   ✗ ${s.at || "?"} [${s.stage}] ${s.how}: “${s.quote.replace(/\s+/g, " ")}”`);
  process.exit(0);
}
module.exports = { audit };
