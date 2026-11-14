/**
 * source-brief.js — what the agent needs from the book is ASKED in NotebookLM (2026-11-11).
 *
 * The operator never hands over the book's PDF or text; it is uploaded to NotebookLM. So the agent writes one question
 * block, the operator pastes it into the NotebookLM CHAT (not Audio Overview) and brings the answer back; the agent
 * saves it as books/<slug>/source-brief.md. The Step 0 prompt (beats, pictures, this book's own opening), the story
 * bible and the cast looks are then written from the book itself, not from a model's memory of it.
 * One copy-paste round trip for the operator; optional when the operator says to skip it.
 */
const QUESTIONS = [
  "FACTS: number of pages (or chapters and approximate length), the year the book's world is set in, the main places.",
  "STRUCTURE: the parts or chapters in order, one line each: what happens or what is argued.",
  "OPENING AND ENDING: the first scene or first claim of the book, and its last image or final decision.",
  "PEOPLE: every person who matters: name, age, one look detail (clothes, hair, build), and what they want.",
  "SCENES TO SEE (12): the twelve most concrete moments, each as: who, where, the one object in their hands, what changes. For an idea book give the author's own demonstrations, experiments or stories instead.",
  "NUMBERS AND NAMES: every number, date, amount, study or named case that matters, with what it measures.",
  "OBJECTS: five to eight objects or recurring images that carry meaning in this book.",
  "THE MISREADING: what most readers or reviewers assume about this book that the text itself contradicts, with the passage that contradicts it.",
  "THE HARDEST MOMENTS: any violence, death, or harm to a child or an animal: what happens and how directly it is shown.",
  "THREE SHORT LINES: three sentences from the book, each under 20 words, that a reader would underline.",
];

function briefQuestion({ title, author = "" }) {
  return [
    `Answer only from the uploaded source of "${title}"${author ? ` by ${author}` : ""}. Be specific and concrete; where the source does not say, write "not in the source". Never quote more than one sentence at a time. Use exactly these numbered headings:`,
    "",
    ...QUESTIONS.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");
}

function briefFile({ title, author = "", slug }) {
  return [
    `# NotebookLM source brief — ${title}${author ? ` (${author})` : ""}`,
    "",
    `**Nasıl kullanılır:** NotebookLM'de kitabın yüklü olduğu not defterini aç → aşağıdaki bloğu **sohbet (chat) kutusuna** yapıştır (Audio Overview değil) → gelen cevabın tamamını kopyalayıp bu oturuma yapıştır. Ajan cevabı \`books/${slug}/source-brief.md\` olarak kaydeder ve prompt'u ondan yazar. Kitabın PDF'i ajana verilmez; ajanın kitaptan öğrenmesi gereken her şey bu sorudan gelir.`,
    "",
    "```",
    briefQuestion({ title, author }),
    "```",
    "",
  ].join("\n");
}

/** A returned answer is usable when most headings came back with content. → {ok, found, missing[], pages} */
function readBrief(text) {
  const t = String(text || "");
  const names = ["FACTS", "STRUCTURE", "OPENING AND ENDING", "PEOPLE", "SCENES TO SEE", "NUMBERS AND NAMES", "OBJECTS", "THE MISREADING", "THE HARDEST MOMENTS", "THREE SHORT LINES"];
  const missing = names.filter((n) => !new RegExp(n.replace(/ /g, "\\s+"), "i").test(t));
  const pm = /(\d{2,4})\s*(?:pages|pp\.?|sayfa)/i.exec(t);
  return { ok: t.length > 1500 && missing.length <= 2, found: names.length - missing.length, missing, pages: pm ? Number(pm[1]) : null };
}

module.exports = { QUESTIONS, briefQuestion, briefFile, readBrief };
