#!/usr/bin/env node
/**
 * gate-b-relationship.js — Gate B for authored relationship staging: does the narration
 * actually support each field of the relationship record? Judged by a DIFFERENT model
 * family (Gemini) from the authors, field by field, with no design notes and no earlier
 * reviews. A quote that exists (Check A, in storyboard.js merge) is not enough.
 *
 *   node scripts/gate-b-relationship.js --slug=<slug> [--root=<dir>] [--model=<gemini model>]
 *
 * Reads every authored entry with `stageRelationship: true` in books/<slug>/storyboard/
 * authored-*.json, sends its fields + quotes + three beats of narration (from
 * storyboard/beats.json), and writes storyboard/gate-b/<beat>.json:
 *   { beat, model, modelVersion, inputSha256, requestSha256, verdicts, decision }
 * decision is STAGE only when EVERY used field is SUPPORTED; otherwise FALLBACK (the beat
 * keeps the normal authored flow). storyboard.js merge refuses a staged beat whose Gate B
 * file is missing, is not STAGE, or whose inputSha256 no longer matches the record.
 * Raw request and response are kept next to it. GOOGLE_API_KEY is read from the
 * environment and never printed.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
}));
const ROOT = args.root ? path.resolve(args.root) : path.join(__dirname, "..");
const SLUG = args.slug;
const MODEL = args.model || process.env.GATE_B_MODEL || "gemini-3.5-flash";
const SB = SLUG ? path.join(ROOT, "books", SLUG, "storyboard") : null;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

// The exact input storyboard.js merge hashes: a changed record or narration invalidates the verdict.
function gateBInputSha(relationship, narration) {
  return sha(JSON.stringify({ relationship, narration: String(narration || "").trim() }));
}

// Field list sent to the judge: value + the quotes offered as its evidence.
function fieldsOf(rel) {
  const q = (e) => (Array.isArray(e) ? e : e ? [e] : []).filter((x) => x && x.quote).map((x) => ({ beat: x.beat, quote: x.quote }));
  const f = [];
  const add = (name, o, extra = {}) => { if (o) f.push({ field: name, value: o.value, ...extra, quotes: q(o.evidence).concat(q(o.label)).concat(q(o.falseMarker)) }); };
  add("source", rel.source); add("relation", rel.relation); add("target", rel.target); add("means", rel.means);
  if (rel.rejectedMethod) add("rejectedMethod", rel.rejectedMethod, { scope: rel.rejectedMethod.scope });
  if (rel.negation) add("negation", rel.negation, { scope: rel.negation.scope });
  if (rel.counterAction) add("counterAction", rel.counterAction);
  if (rel.purpose) add("purpose", rel.purpose);
  if (rel.consequence) add("consequence", rel.consequence);
  if (rel.modality) f.push({ field: "modality", value: rel.modality.value, quotes: q(rel.modality.evidence) });
  if (rel.means && rel.means.falseMarker) f.push({ field: "means.isFalse", value: "the message is false (a lie)", quotes: q(rel.means.falseMarker) });
  for (const x of f) { const seen = new Set(); x.quotes = x.quotes.filter((z) => { const k = z.beat + "|" + z.quote; if (seen.has(k)) return false; seen.add(k); return true; }); }
  return f;
}

const PROMPT = (narr, fields) => `You check whether a short narration supports a proposed relationship record, field by field.
Narration (three consecutive beats; the middle one is the target):
${narr.map((n) => `Beat ${n.i}: "${n.text}"`).join("\n")}

Proposed record fields (each with the exact quotes offered as evidence):
${JSON.stringify(fields, null, 1)}

For EACH field decide whether the narration supports it as written:
SUPPORTED (the narration states it), PARTLY (partly stated, or stated more weakly/strongly than written), NOT SUPPORTED (not stated or contradicted), AMBIGUOUS (the narration allows several readings).
Judge against the narration only, not general knowledge of the book. A matching quote alone is not enough: the quote must actually support the field's value. "modality" means how the narration presents it (asserted = stated as the case; advice = recommended; analogy = figure of speech).
Return JSON: {"fields":[{"field":"...","verdict":"SUPPORTED|PARTLY|NOT SUPPORTED|AMBIGUOUS","reason":"one sentence"}]}`;

async function call(text) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY missing (Gate B needs a different model family)");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  for (let a = 1; a <= 6; a++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }) });
    const j = await r.json();
    if (r.ok) return j;
    console.error(`  attempt ${a}: HTTP ${r.status}`);
    if (r.status !== 503 && r.status !== 429) throw new Error(`Gemini API ${r.status}`);
    await new Promise((z) => setTimeout(z, a * 15000));
  }
  throw new Error("Gemini API failed after retries");
}

async function main() {
  if (!SLUG) { console.error("usage: node scripts/gate-b-relationship.js --slug=<slug> [--root=<dir>] [--model=<model>]"); process.exit(1); }
  const beats = (readJSON(path.join(SB, "beats.json"), { beats: [] }).beats) || [];
  const narrOf = (i) => { const b = beats.find((x) => x.i === i); return b ? String(b.narration || b.text || "").trim() : ""; };
  const staged = [];
  for (const f of fs.readdirSync(SB).filter((x) => /^authored-\d+\.json$/.test(x))) {
    for (const a of readJSON(path.join(SB, f), []) || []) if (a && a.stageRelationship && a.relationship) staged.push(a);
  }
  if (!staged.length) { console.log(`gate-b: no staged relationships in books/${SLUG}/storyboard`); return; }
  const OUT = path.join(SB, "gate-b");
  fs.mkdirSync(OUT, { recursive: true });
  let stage = 0;
  for (const a of staged) {
    const fields = fieldsOf(a.relationship);
    const narr = [a.i - 1, a.i, a.i + 1].map((i) => ({ i, text: narrOf(i) }));
    const text = PROMPT(narr, fields);
    const raw = await call(text);
    let parsed = null;
    try { parsed = JSON.parse(raw.candidates[0].content.parts.map((p) => p.text || "").join("")); } catch (_) {}
    const verdicts = (parsed && parsed.fields) || [];
    const ok = fields.length > 0 && fields.every((x) => { const v = verdicts.find((y) => y.field === x.field); return v && String(v.verdict).toUpperCase() === "SUPPORTED"; });
    const rec = {
      beat: a.i, model: MODEL, modelVersion: raw.modelVersion || null,
      inputSha256: gateBInputSha(a.relationship, narrOf(a.i)), requestSha256: sha(text),
      fields: fields.map((x) => x.field), verdicts, decision: ok ? "STAGE" : "FALLBACK",
      rule: "STAGE only when every used field is SUPPORTED", at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(OUT, `${a.i}.json`), JSON.stringify(rec, null, 2) + "\n");
    fs.writeFileSync(path.join(OUT, `${a.i}.request.txt`), text);
    fs.writeFileSync(path.join(OUT, `${a.i}.raw.json`), JSON.stringify(raw, null, 1));
    if (ok) stage++;
    console.log(`  beat ${a.i}: ${rec.decision} (${rec.modelVersion || MODEL})${ok ? "" : " — " + verdicts.filter((v) => String(v.verdict).toUpperCase() !== "SUPPORTED").map((v) => `${v.field}: ${v.verdict}`).join("; ")}`);
  }
  console.log(`gate-b: ${stage}/${staged.length} relationships may be staged; the rest fall back to the normal authored flow.`);
}

if (require.main === module) main().catch((e) => { console.error("gate-b failed:", e.message); process.exit(1); });
module.exports = { gateBInputSha, fieldsOf };
