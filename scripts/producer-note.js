#!/usr/bin/env node
/**
 * producer-note.js — the producer's note of a book: asked of NotebookLM in text, chosen by the operator, recorded here.
 *
 *   node scripts/producer-note.js --slug=<slug> --question
 *       prints (and writes books/<slug>/prompt.producer-note.md) the short question the operator pastes into
 *       NotebookLM's CHAT box (text, not the Audio Overview): three candidate opinions about the book, grounded in the
 *       sources, answered in Turkish.
 *   node scripts/producer-note.js --slug=<slug> --tr="<the operator's own Turkish words>" --note="<its English, ≤ 180 chars>"
 *       records book.json take { note, tr, by: "operator", at }. The planners put the note on a card in the film's
 *       first half-minute (src/components/ProducerNote.tsx) and the meta planners open the description with it.
 *   node scripts/producer-note.js --slug=<slug> --clear      (the operator took it back)
 *
 * Operator, 2026-11-20: the hosts do NOT discuss it ("sunucular bunu niye tartışıyor") - it is not in the audio prompt.
 * He asks NotebookLM (it has the book), comments on what comes back, and sends his sentence; the agent turns it into
 * English. An agent never records a note of its own: without --tr (his words) this refuses.
 * Record it BEFORE make-book: a note added after the preview was sealed changes the film (a new verdict would be due).
 */
const fs = require("fs");
const path = require("path");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=([\s\S]*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const ROOT = path.resolve(typeof args["book-root"] === "string" ? args["book-root"] : path.join(__dirname, ".."));

/** the question for NotebookLM's chat box (English instructions - it follows them best; the answer comes in Turkish) */
function question({ title, author }) {
  return [
    `Using ONLY the sources about "${title}"${author ? ` by ${author}` : ""}, propose THREE different short opinions a careful reader could honestly hold about this book:`,
    `1) where the book is weakest, unfair or lets someone off too easily;`,
    `2) what it overdoes, repeats or gets wrong;`,
    `3) what it gets right that most readers and summaries miss.`,
    `Each opinion: one or two sentences, first person ("I think…"), plain words, and it must name a specific person, scene, chapter or claim from the book - never a sentence that would fit another book. Under each, add one line with where in the sources it comes from, and one line with the strongest argument against it.`,
    `Answer in Turkish.`,
  ].join("\n");
}

/**
 * the same question after RESEARCH (operator 2026-11-20): NotebookLM's Deep Research reads how the book was received -
 * reader reviews (Goodreads and the like), criticism, discussions - and the three opinions take a position on that.
 * Patterns only: no review is copied, no reviewer is named, and the note stays the producer's own opinion.
 */
function researchQuestion({ title, author }) {
  return [
    `Research how "${title}"${author ? ` by ${author}` : ""} has been received: reader reviews (Goodreads and similar sites), professional criticism, and discussions of the book.`,
    `First report, briefly: (a) the three things readers praise most often, (b) the three complaints they make most often, (c) the most common misreading or oversimplification of the book. Describe PATTERNS in your own words - do not copy any review and do not name individual reviewers. Say plainly when the evidence for a pattern is thin.`,
    `Then propose THREE different short opinions a careful reader could honestly hold, each taking a clear position on what you found:`,
    `1) one that DISAGREES with the most common praise or complaint, and why;`,
    `2) one that corrects the common misreading;`,
    `3) one that names something the reviews mostly overlook.`,
    `Each opinion: one or two sentences, first person ("I think…"), plain words, naming a specific person, scene, chapter or claim from the book - never a sentence that would fit another book. Under each, one line on which reader pattern it answers, and one line with the strongest argument against it.`,
    `Answer in Turkish.`,
  ].join("\n");
}

if (require.main === module) {
  if (typeof args.slug !== "string") { console.error('usage: node scripts/producer-note.js --slug=<slug> --question | --tr="<operator\'s Turkish>" --note="<English ≤ 180>" | --clear'); process.exit(2); }
  const dir = path.join(ROOT, "books", args.slug), file = path.join(dir, "book.json");
  let book; try { book = JSON.parse(fs.readFileSync(file, "utf8")); } catch { console.error(`✗ ${path.relative(ROOT, file)} missing - Step 0 first (make-prompt.js)`); process.exit(1); }
  if (args.question) {
    const q = question(book), rq = researchQuestion(book);
    fs.writeFileSync(path.join(dir, "prompt.producer-note.md"), `# Yapımcı notu — NotebookLM'e sorulacak soru (${book.title})\n\nİkisinden birini kullan. Gelen üç öneriden birini seç, değiştir ya da kendi cümleni yaz; Türkçe olarak ajana ilet. (Ses kaydını etkilemez.)\n\n## A) Araştırmalı (önerilen) — okurlar ve eleştirmenler kitabı nasıl karşılamış?\n\nNotebookLM → **Deep Research** (kaynak keşfi / araştırma) → aşağıdaki bloğu yapıştır.\n\n\`\`\`\n${rq}\n\`\`\`\n\n## B) Hızlı — yalnızca not defterindeki kaynaklardan\n\nNotebookLM → bu kitabın not defteri → **sohbet kutusu** (Audio Overview değil) → aşağıdaki bloğu yapıştır.\n\n\`\`\`\n${q}\n\`\`\`\n`);
    console.log("A) ARAŞTIRMALI (NotebookLM Deep Research):\n" + rq + "\n\nB) HIZLI (not defterinin sohbet kutusu):\n" + q);
    console.log(`\n→ ${path.relative(ROOT, path.join(dir, "prompt.producer-note.md"))}  (operatöre bu bloğu ver: NotebookLM sohbet kutusuna yapıştıracak)`);
    process.exit(0);
  }
  if (args.clear) { delete book.take; fs.writeFileSync(file, JSON.stringify(book, null, 2) + "\n"); console.log("✓ producer's note cleared"); process.exit(0); }
  const tr = typeof args.tr === "string" ? args.tr.trim() : "", note = typeof args.note === "string" ? args.note.trim() : "";
  if (tr.length < 15) { console.error('✗ --tr="<the operator\'s own Turkish words>" is required: the note is his decision. Give him the question (--question), wait for his sentence.'); process.exit(1); }
  if (note.length < 15 || note.length > 180) { console.error(`✗ --note is the English of his sentence for the card: 15-180 characters (two lines on screen); this one has ${note.length}.`); process.exit(1); }
  if (/[ğĞşŞıİ]/.test(note)) { console.error("✗ --note is shown in the film and in the description: English (the channel is US / English). His Turkish goes in --tr."); process.exit(1); }
  book.take = { note, tr, by: "operator", at: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(book, null, 2) + "\n");
  console.log(`✓ producer's note recorded for ${args.slug}: "${note}"`);
  const planned = ["config.antidote.json", "config.vox.json"].filter((f) => fs.existsSync(path.join(dir, f)));
  if (planned.length) console.log(`  ⚠ ${planned.join(", ")} exists: the card and the description get the note at the NEXT plan (make-book). A preview already sealed is for the film without it.`);
}
module.exports = { question, researchQuestion };
