#!/usr/bin/env node
// preview-ready-checks.js (2026-10-27, their-eyes-were-watching-god audit): (1) Vox image coverage — an authored
// compare side that never reached the config and a nearly transparent cut-out are reported, exactly those two;
// a complete pair has no finding. (2) pipeline heads are scoped to the production pin — runs before it never make a
// false "MIXED", two heads after it still do. Plus the dependency-free PNG alpha reader.
// Run: node scripts/test-preview-ready-checks.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { pngOpaqueFraction, voxImageCoverage, pipelineHeads } = require("./lib/preview-ready-checks");

let failed = 0;
const t = (name, ok, info) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && info ? `  (${info})` : ""}`); if (!ok) failed++; };

// minimal RGBA PNG encoder (filter 0 rows) — opaqueCount pixels get alpha 255, the rest alpha 0
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "latin1"), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
function png(w, h, opaqueCount, filter = 0) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1)); let n = 0;
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(w * 4);
    for (let x = 0; x < w; x++) { row[x * 4] = 200; row[x * 4 + 1] = 100; row[x * 4 + 2] = 50; row[x * 4 + 3] = n++ < opaqueCount ? 255 : 0; }
    const o = y * (w * 4 + 1); raw[o] = filter;
    for (let x = 0; x < row.length; x++) raw[o + 1 + x] = filter === 1 ? (row[x] - (x >= 4 ? row[x - 4] : 0)) & 255 : row[x];
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preview-ready-checks-"));
try {
  // ── PNG alpha reader ─────────────────────────────────────────────────────────
  t("png: 15 opaque of 10000 -> 0.15%", Math.abs(pngOpaqueFraction(png(100, 100, 15)) - 0.0015) < 1e-9);
  t("png: Sub-filtered rows decode the same", Math.abs(pngOpaqueFraction(png(100, 100, 5000, 1)) - 0.5) < 1e-9);
  t("png: not a PNG -> null (cannot tell, never a finding)", pngOpaqueFraction(Buffer.from("hello world, not a png at all!!!!!")) === null);

  // ── fixture: 4 beats — title image, compare (both sides authored), statement, imagefocus with a cut-out ──
  const PUB = path.join(tmp, "public"), S = "scenes/zz";
  const big = Buffer.alloc(9000, 1); // > 8000 bytes = a generated image (gen-vox-images.py's own test)
  const put = (rel, buf) => { const p = path.join(PUB, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
  for (const f of ["beat-000.png", "beat-001-a.png", "beat-001-b.png", "beat-003.png"]) put(`${S}/${f}`, big);
  put(`${S}/beat-001-a-cut.png`, png(64, 64, 2000)); put(`${S}/beat-001-b-cut.png`, png(64, 64, 2000));
  put(`${S}/beat-003-cut.png`, png(200, 200, 30));   // 30 / 40000 = 0.075% opaque: an empty cut-out
  const designs = [
    { type: "title", image: { subject: "a porch at dusk" } },
    { type: "compare", compare: { left: { label: "A", subject: "a mule" }, right: { label: "B", subject: "a pear tree" } } },
    { type: "statement", image: null },
    { type: "imagefocus", image: { subject: "a hurricane", style: "cutout" } },
  ];
  const full = { beats: [
    { id: "beat-000", type: "title", images: [{ path: `${S}/beat-000.png`, style: "card" }] },
    { id: "beat-001", type: "compare", images: [{ path: `${S}/beat-001-a.png`, cut: `${S}/beat-001-a-cut.png`, style: "cutout" }, { path: `${S}/beat-001-b.png`, cut: `${S}/beat-001-b-cut.png`, style: "cutout" }] },
    { id: "beat-002", type: "statement", images: [] },
    { id: "beat-003", type: "imagefocus", images: [{ path: `${S}/beat-003.png`, style: "card" }] },
  ] };
  let r = voxImageCoverage({ designs, config: full, publicDir: PUB });
  t("complete pair -> no finding", r.ok && r.findings.length === 0 && r.asked === 4, JSON.stringify(r));
  r = voxImageCoverage({ designs: { beats: designs.map((design) => ({ design })) }, config: full, publicDir: PUB });
  t("emit-beats payload {beats:[{design}]} reads the same", r.ok, JSON.stringify(r.findings));

  const broken = JSON.parse(JSON.stringify(full));
  broken.beats[1].images = broken.beats[1].images.slice(0, 1);                 // right side dropped by reconcile
  broken.beats[3].images[0] = { path: `${S}/beat-003.png`, cut: `${S}/beat-003-cut.png`, style: "cutout" };
  r = voxImageCoverage({ designs, config: broken, publicDir: PUB });
  t("missing compare side + transparent cut -> exactly those 2 findings", !r.ok && r.findings.length === 2
    && r.findings.some((f) => f.beat === "beat-001" && /compare right side/.test(f.problem))
    && r.findings.some((f) => f.beat === "beat-003" && /cut-out nearly empty/.test(f.problem)), JSON.stringify(r.findings));

  const dropped = JSON.parse(JSON.stringify(full)); dropped.beats[0].images = [];
  r = voxImageCoverage({ designs, config: dropped, publicDir: PUB });
  t("authored image dropped from config -> reported on its beat", !r.ok && r.findings.length === 1 && r.findings[0].beat === "beat-000", JSON.stringify(r.findings));
  r = voxImageCoverage({ designs: designs.slice(0, 3), config: full, publicDir: PUB });
  t("designs / beats count mismatch -> cannot verify = finding (not a silent PASS)", !r.ok && /cannot be verified/.test(r.findings[0].problem));

  // ── pipeline heads scoped to the production pin ────────────────────────────
  const pin = { productionBase: "bbbbbbb000", at: "2026-10-20T10:00:00.000Z" };
  const before = [{ step: "plan", at: "2026-10-01T00:00:00Z", head: "aaaaaaa111" }, { step: "x", at: "2026-10-19T00:00:00Z", head: "ccccccc222" }];
  const after1 = [{ step: "make-book", at: "2026-10-21T00:00:00Z", head: "bbbbbbb000" }, { step: "preview-ready", at: "2026-10-22T00:00:00Z", head: "bbbbbbb000" }];
  let h = pipelineHeads([...before, ...after1], pin);
  t("runs before the pin are not counted -> one head, no MIXED", !h.mixed && h.heads.length === 1 && h.heads[0] === "bbbbbbb" && h.before === 2, JSON.stringify(h.heads));
  h = pipelineHeads([...before, ...after1, { step: "make-book", at: "2026-10-23T00:00:00Z", head: "ddddddd333" }], pin);
  t("two heads after the pin -> MIXED still reported", h.mixed && h.heads.length === 2, JSON.stringify(h.heads));
  h = pipelineHeads([...before, ...after1], null);
  t("no pin -> every run counts (legacy behaviour)", h.mixed && h.heads.length === 3 && h.before === 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
