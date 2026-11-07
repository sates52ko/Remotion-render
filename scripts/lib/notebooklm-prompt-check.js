/**
 * notebooklm-prompt-check.js — is a book's NotebookLM prompt FINISHED (Step 0 done), or still the scaffold?
 *
 * Why (2026-10-27, The Magician's Nephew): make-prompt.js writes a generic scaffold when no angle is authored and
 * exits 0, so "scaffold written" and "Step 0 done" looked the same. A prompt is finished when:
 *   - the paste block names the book and carries the fixed spine (DEPTH ENGINE, LENGTH, HARD RULES);
 *   - it is book-specific: the scaffold sentence is gone, and either an authored ANGLE (thesis + numbered beats) is
 *     present or the spine's generic COLD OPEN / SETUP / BEATS lines were rewritten with the book's own content;
 *   - it is English (the US channel) and the engine in its header is the engine in book.json.
 * Pure: checkNotebookPrompt(md, { title, engine }) → { ok, errors[], warnings[], chars }.
 */
const GENERIC = {
  coldOpen: "open mid-thought on the single most provocative idea.",
  setup: "who/what the book puts in play (concrete names, stakes).",
  beats: "BEATS: 8 beats, each ONE specific claim from the book.",
};

function checkNotebookPrompt(md, { title = null, engine = null } = {}) {
  const errors = [], warnings = [];
  const text = String(md || "");
  const m = text.match(/```\r?\n([\s\S]*?)\r?\n```/);
  const block = m ? m[1] : "";
  if (!block) return { ok: false, errors: ["no paste block (```…```) in the prompt file"], warnings, chars: 0 };
  if (/one arguable thesis about how ".*" works as [^,\n]*, not a summary/i.test(block)) errors.push('the angle is still the scaffold sentence ("one arguable thesis about how … works as …") — write the book-specific thesis');
  const hasAngle = /Thesis to prove:/i.test(block) && (block.match(/^\s*\d+\.\s+\S/gm) || []).length >= 6 + 6; // angle beats + the spine's 6 steps
  const rewritten = Object.values(GENERIC).filter((g) => !block.includes(g)).length;
  if (!hasAngle && rewritten < 2) errors.push(`the structure is still generic (${3 - rewritten} of COLD OPEN / SETUP / BEATS unchanged) — name the book's opening image, its people and stakes, and its 8 concrete beats`);
  for (const k of ["DEPTH ENGINE", "LENGTH", "HARD RULES"]) if (!block.includes(k)) errors.push(`the fixed spine lost its ${k} block`);
  if (title && !block.toLowerCase().includes(String(title).toLowerCase())) errors.push(`the paste block never names "${title}"`);
  if (/[ğĞşŞıİ]/.test(block)) errors.push("the paste block is not English (Turkish characters inside it) — the channel is US / English");
  const hdr = text.match(/\*\*Engine:\*\*\s*([a-z]+)/i);
  if (engine && hdr && hdr[1].toLowerCase() !== String(engine).toLowerCase()) errors.push(`the prompt was written for ${hdr[1]} but book.json says ${engine} — rewrite it for the engine that will render (the audio is recorded for it)`);
  if (!hdr) warnings.push("no **Engine:** in the header");
  if (block.length < 1500) errors.push(`the paste block is ${block.length} chars — too thin to carry 8 developed beats`);
  if (block.length > 5000) warnings.push(`the paste block is ${block.length} chars — NotebookLM's Customize box may cut it off`);
  return { ok: !errors.length, errors, warnings, chars: block.length };
}

module.exports = { checkNotebookPrompt, GENERIC };
