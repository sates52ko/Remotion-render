#!/usr/bin/env node
/** test-opening-grammar.js — every book opens its own way; the source brief asks NotebookLM. No network. */
const assert = require("assert");
const g = require("./lib/opening-grammar");
const sb = require("./lib/source-brief");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

t("deterministic for a book, and the choice is a valid opening", () => {
  const a = g.pickOpening({ slug: "book-a", kind: "fiction", recent: [] });
  assert.deepStrictEqual(a, g.pickOpening({ slug: "book-a", kind: "fiction", recent: [] }));
  assert.ok(g.validOpening(a));
});

t("a hook only where it fits the kind of book", () => {
  assert.ok(g.candidates("fiction").every((c) => !["number", "confession"].includes(c.hook)));
  assert.ok(g.candidates("nonfiction").every((c) => c.hook !== "ending"));
  assert.strictEqual(g.candidates(null).length, 8 * 3 * 4);
});

t("60 books in a row: never the previous hook, never a combination from the last 8, every hook used", () => {
  for (const kind of ["fiction", "nonfiction"]) {
    const made = [];
    for (let i = 0; i < 60; i++) {
      const o = g.pickOpening({ slug: `${kind}-${i}`, kind, recent: [...made].reverse() });
      if (made.length) assert.notStrictEqual(o.hook, made[made.length - 1].hook, `book ${i} repeats the previous hook`);
      for (const r of made.slice(-8)) assert.ok(g.distance(r, o) > 0, `book ${i} repeats a recent combination`);
      made.push(o);
    }
    const hooks = new Set(made.map((o) => o.hook));
    assert.strictEqual(hooks.size, g.candidates(kind).reduce((s, c) => s.add(c.hook), new Set()).size, `${kind}: every allowed hook appears`);
    const counts = {};
    for (const o of made) counts[o.hook] = (counts[o.hook] || 0) + 1;
    assert.ok(Math.max(...Object.values(counts)) <= 60 / 3, `${kind}: no hook carries more than a third (${JSON.stringify(counts)})`);
    for (let i = 3; i < made.length; i++) assert.ok(new Set(made.slice(i - 3, i + 1).map((o) => o.promise)).size >= 2, "four films in a row never share one promise form");
  }
});

t("the block carries this opening's three lines, and two openings give two different blocks", () => {
  const a = g.openingBlock({ hook: "scene", naming: "after", promise: "bet" });
  const b = g.openingBlock({ hook: "belief", naming: "early", promise: "three" });
  for (const x of [a, b]) for (const k of ["FIRST MINUTE", "- OPEN:", "- NAME IT:", "- PROMISE (by 0:50):"]) assert.ok(x.includes(k), k);
  assert.notStrictEqual(a, b);
  assert.ok(a.includes("present tense") && a.includes("bet with the listener") && b.includes("most readers believe"));
  assert.throws(() => g.openingBlock({ hook: "nope", naming: "early", promise: "three" }));
});

t("an agent's explicit opening parses; a wrong one is refused", () => {
  assert.deepStrictEqual(g.parseOpening("object/author/map"), { hook: "object", naming: "author", promise: "map" });
  assert.strictEqual(g.parseOpening("object/author"), null);
  assert.strictEqual(g.parseOpening("magic/early/three"), null);
});

t("source brief: one question block for the NotebookLM chat, never the book itself", () => {
  const q = sb.briefQuestion({ title: "Zz Probe", author: "A. Writer" });
  assert.ok(/Answer only from the uploaded source of "Zz Probe" by A\. Writer/.test(q));
  assert.strictEqual((q.match(/^\d+\. /gm) || []).length, 10);
  assert.ok(/Never quote more than one sentence/.test(q));
  const f = sb.briefFile({ title: "Zz Probe", author: "", slug: "zz-probe" });
  assert.ok(f.includes("books/zz-probe/source-brief.md") && /chat/.test(f) && f.includes("```"));
});

t("source brief: a returned answer is read (headings, pages); a stub is not usable", () => {
  const answer = ["1. FACTS: 412 pages, set in 1962.", "2. STRUCTURE: …", "3. OPENING AND ENDING: …", "4. PEOPLE: …", "5. SCENES TO SEE (12): …", "6. NUMBERS AND NAMES: …", "7. OBJECTS: …", "8. THE MISREADING: …", "9. THE HARDEST MOMENTS: …", "10. THREE SHORT LINES: …"].join("\n") + "\n" + "x".repeat(1600);
  const r = sb.readBrief(answer);
  assert.deepStrictEqual([r.ok, r.found, r.pages], [true, 10, 412]);
  assert.strictEqual(sb.readBrief("FACTS: 300 pages").ok, false);
});

console.log(`\n${n} checks passed`);
