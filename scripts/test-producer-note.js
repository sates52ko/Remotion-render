#!/usr/bin/env node
/** test-producer-note.js — the producer's note: asked of NotebookLM in text, chosen by the operator, never narrated. No render. */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { question, researchQuestion } = require("./producer-note");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "producer-note-")), dir = path.join(tmp, "books", "b");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "book.json"), JSON.stringify({ slug: "b", title: "Dracula", author: "Bram Stoker" }));
const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, "producer-note.js"), "--slug=b", `--book-root=${tmp}`, ...a], { encoding: "utf8" });
const book = () => JSON.parse(fs.readFileSync(path.join(dir, "book.json"), "utf8"));

t("the question for NotebookLM's chat: three grounded opinions about THIS book, answered in Turkish", () => {
  const q = question({ title: "Dracula", author: "Bram Stoker" });
  assert.ok(q.includes('"Dracula" by Bram Stoker') && q.includes("THREE different short opinions") && q.includes("ONLY the sources") && q.includes("Answer in Turkish."));
  const rq = researchQuestion({ title: "Dracula", author: "Bram Stoker" });
  assert.ok(rq.includes("reader reviews (Goodreads") && rq.includes("the most common misreading") && rq.includes("Answer in Turkish."), "the research variant asks how the book was received");
  assert.ok(rq.includes("do not copy any review and do not name individual reviewers"), "patterns only: nobody's review is copied or named");
  const r = run("--question");
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes("A) ARAŞTIRMALI") && r.stdout.includes("B) HIZLI"), "both blocks are handed over");
  assert.ok(fs.readFileSync(path.join(dir, "prompt.producer-note.md"), "utf8").includes("sohbet kutusu"), "the operator is told where to paste it");
  assert.ok(!book().take, "asking records nothing");
});

t("only the operator's sentence is recorded: his Turkish words, the English for the card, by operator", () => {
  let r = run("--note=I think the book lets the men off far too easily.");
  assert.ok(r.status === 1 && /operator's own Turkish words/.test(r.stderr) && !book().take, "refused without his words");
  r = run("--tr=Bence kitap erkekleri çok kolay aklıyor.", "--note=Bence kitap erkekleri aklıyor, çok kolay.");
  assert.ok(r.status === 1 && /English/.test(r.stderr), "a Turkish note is refused: the channel is English");
  r = run("--tr=Bence kitap erkekleri çok kolay aklıyor.", `--note=${"x".repeat(190)}`);
  assert.ok(r.status === 1 && /15-180/.test(r.stderr), "longer than two lines on the card is refused");
  r = run("--tr=Bence kitap erkekleri çok kolay aklıyor.", "--note=I think the book lets the men off far too easily.");
  assert.strictEqual(r.status, 0, r.stderr);
  const k = book().take;
  assert.deepStrictEqual([k.note, k.tr, k.by], ["I think the book lets the men off far too easily.", "Bence kitap erkekleri çok kolay aklıyor.", "operator"]);
  assert.strictEqual(run("--clear").status, 0); assert.ok(!book().take);
});

t("the hosts never discuss it: no reader's view in the audio prompt, --take is gone", () => {
  const mp = read("scripts", "make-prompt.js");
  assert.ok(!mp.includes("A REAL READER'S VIEW"), "the block is out of the prompt");
  assert.ok(mp.includes("--take is gone") && mp.includes("producer-note.js"));
});

t("the card: one fade in and out near the start, two lines at most, nothing without a note, both engines mount it", () => {
  const c = read("src", "components", "ProducerNote.tsx");
  // 2026-11-23: the card's placement and entrance follow the book's skin (four variants); variant 0 is the first look
  assert.ok(c.includes("if (!text) return null;") && c.includes("start: 14, hold: 6.5") && c.includes("export function variantOf") && c.includes("PRODUCER'S NOTE"));
  assert.ok(/VARIANTS\[/.test(c) && (c.match(/\{ start: \d+/g) || []).length === 4, "four placements, each with its own second");
  assert.ok(!/Math\.sin|Math\.cos|spring\(/.test(c), "no motion of its own");
  assert.ok(c.includes("text.slice(0, 180)") && c.includes("maxWidth: 1300"));
  assert.ok(read("src", "engines", "antidote", "index.tsx").includes("<ProducerNote note="));
  assert.ok(read("src", "engines", "vox", "index.tsx").includes("<ProducerNote note={config.meta.take?.note}"));
  for (const f of ["plan-antidote.js", "plan-vox.js", "plan-antidote-meta.js", "plan-meta.js"]) assert.ok(/take\.by === "operator"/.test(read("scripts", f)), f);
});

t("the skill tells every agent the same flow", () => {
  const s = read(".claude", "skills", "notebooklm-prompt", "SKILL.md");
  assert.ok(s.includes("Yapımcının notu") && s.includes("NOT in the audio prompt") && s.includes("producer-note.js --slug=<slug>") && s.includes("CHAT box"));
  assert.ok(s.includes("Never write the note yourself"));
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nall producer-note checks passed (${n})`);
