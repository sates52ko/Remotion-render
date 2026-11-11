// Production archive writer — read-only over a book, never blocks production.
//
//   node scripts/production-archive.js --slug=<slug> [--out=<dir>]
//
// Copies NOTHING from the book. It reads the book's existing artifacts, records their
// SHA-256 and size, and writes one provenance record. Anything it cannot find is written
// as "unknown" — it is never inferred. Always exits 0: an archive failure is reported in
// the record (and on stderr) and must not stop a book from rendering or publishing.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = process.env.PRODUCTION_ARCHIVE_ROOT || path.join(__dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));

// Artifacts that exist in a book folder today. Missing ones are recorded as absent.
const CANDIDATES = [
  "book.json", "story-bible.json", "art.json", "config.antidote.json", "config.vox.json",
  "beat-briefs.json", "sequence-arcs.json", "plan-manifest.json", "readcheck.json",
  "mute-test.json", "screen-text.report.json", "authorship.report.json",
  "narrative-visual-firewall.report.json", "youtube-meta.json", "youtube.md",
  "storyboard/policy.json", "storyboard/rules.md", "storyboard/vocab.json", "storyboard/beats.json",
];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const gitHead = () => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "unknown"; } };

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function main() {
  const slug = args.slug;
  if (!slug) { console.error("usage: node scripts/production-archive.js --slug=<slug> [--out=<dir>]"); return; }
  const bookDir = path.join(ROOT, "books", slug);
  const outDir = args.out || path.join(ROOT, "out", "archive", slug);
  const record = {
    schema: "production-archive/v0",
    slug,
    archivedAt: new Date().toISOString(),
    archiverCommit: gitHead(), // the commit that WROTE this record; the production code SHA is not inferred
    artifacts: {},
    provenance: {},
    errors: [],
  };
  try {
    if (!fs.existsSync(bookDir)) throw new Error(`no book folder: books/${slug}`);
    for (const rel of CANDIDATES) {
      const p = path.join(bookDir, rel);
      if (!fs.existsSync(p)) { record.artifacts[rel] = { present: false }; continue; }
      const buf = fs.readFileSync(p);
      record.artifacts[rel] = { present: true, bytes: buf.length, sha256: sha256(buf) };
    }
    const book = readJson(path.join(bookDir, "book.json")) || {};
    const policy = readJson(path.join(bookDir, "storyboard", "policy.json"));
    record.provenance = {
      title: book.title || "unknown",
      engine: book.engine || "unknown",
      // written only by storyboard.js prep from the change onward; historical books have none
      authoringPolicy: policy ? policy.policy : "unknown",
      promptSha256: policy ? policy.promptSha256 : "unknown",
      codeShaAtAuthoring: policy ? policy.codeSha : "unknown",
      poseVersion: "unknown", // not recorded by any pipeline yet
      renderer: "unknown",    // rendered frames/segments live outside this archive
    };
  } catch (e) {
    record.errors.push(String(e && e.message || e));
  }
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "archive.json"), JSON.stringify(record, null, 2) + "\n");
    console.log(`archive: ${record.errors.length ? "FAILED (recorded)" : "ok"} → ${path.join(outDir, "archive.json")}`);
  } catch (e) {
    console.error("archive write failed (production unaffected):", e && e.message || e);
  }
}

try { main(); } catch (e) { console.error("archive skipped (production unaffected):", e && e.message || e); }
process.exit(0);
