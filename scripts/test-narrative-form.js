#!/usr/bin/env node
/** test-narrative-form.js — every book is TOLD its own way: the form of the body, the hosts, the on-screen part label. No network. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const F = require("./lib/narrative-form");
const { checkNotebookPrompt } = require("./lib/notebooklm-prompt-check");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const KEYS = Object.keys(F.FORMS);

t("every form is complete: what the film is, the hosts' roles, five steps for a part, its own ending and part name", () => {
  assert.ok(KEYS.length >= 8);
  for (const k of KEYS) {
    const f = F.FORMS[k];
    for (const field of ["label", "part", "name", "fits", "is", "hosts", "ending"]) assert.ok(typeof f[field] === "string" && f[field].length >= 3, `${k}.${field}`);
    assert.strictEqual(f.develop.length, 5, `${k}: five steps keep the recording long (the 30-minute floor was measured with a five-step recipe)`);
    assert.ok(f.for.length && f.for.every((x) => ["fiction", "nonfiction"].includes(x)));
    assert.ok(/^[A-Z]+$/.test(f.part));
  }
  assert.strictEqual(new Set(KEYS.map((k) => F.FORMS[k].part)).size, KEYS.length, "no two forms call their parts the same");
  assert.strictEqual(new Set(KEYS.map((k) => F.FORMS[k].name)).size, KEYS.length);
  assert.strictEqual(new Set(KEYS.map((k) => F.FORMS[k].ending.split(":")[0])).size, KEYS.length, "no two forms end the same way");
  assert.ok(F.candidates("fiction").length >= 4 && F.candidates("nonfiction").length >= 5);
  assert.ok(!F.candidates("fiction").includes("trial") && !F.candidates("nonfiction").includes("portraits"));
});

t("the bodies of two forms are different texts — not one template with a word swapped", () => {
  const words = (s) => new Set(s.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));
  // what is common to every form by design (the speech rules, the block headings) is not what is compared
  const own = (k) => { const f = F.FORMS[k]; return [f.is, f.hosts, f.parts(8), f.ending, ...f.develop].join(" "); };
  for (const a of KEYS) for (const b of KEYS) {
    if (a >= b) continue;
    const A = words(own(a)), B = words(own(b)), both = [...A].filter((w) => B.has(w)).length;
    assert.ok(both / Math.min(A.size, B.size) < 0.45, `${a} / ${b} share ${Math.round((100 * both) / Math.min(A.size, B.size))} % of their words`);
  }
});

t("the block a prompt carries: the form, the hosts, the parts by the book's length, the five steps, the speech rules", () => {
  for (const k of KEYS) {
    const b = F.formBlock(k, { beats: 10 });
    for (const must of ["THE FORM OF THIS FILM", "- THE TWO HOSTS:", "- THE PARTS: 10 ", "ONE HONEST CRITICISM", `HOW EACH ${F.FORMS[k].part} IS DEVELOPED`]) assert.ok(b.includes(must), `${k}: ${must}`);
    assert.strictEqual((b.match(/^[a-e]\) /gm) || []).length, 5);
    assert.ok(b.includes("TELL THE WHOLE BOOK:") && b.includes("TWO THIRDS of every") && b.includes("ACCURATE: only what the sources say") && b.includes("tell a SECOND scene from the book in full"), `${k}: the whole book is told, accurately, as a story`);
    assert.ok(b.length < 2300, `${k}: the block stays short enough for NotebookLM's box (${b.length})`);
    assert.ok(b.includes("TWICE: before step e") && b.includes("directions, never lines"), `${k}: two scenes per part; a step is never said aloud`);
    assert.ok(!/what is now established|still open|who took the round/.test(b), `${k}: a step whose words were parroted at the end of every part`);
    assert.ok(b.length < 2300, `${k}: ${b.length} chars — NotebookLM's Customize box is small`);
    for (const old of ["DEPTH ENGINE", "COUNTERPOINT:", "PAYOFF", "THESIS:"]) assert.ok(!b.includes(old), `${k} still carries the one spine's ${old}`);
  }
  for (const tic of ['"Exactly."', '"Right."', '"Absolutely."', '"deep dive"', "No sign-off"]) assert.ok(F.SPEECH.includes(tic));
  assert.throws(() => F.formBlock("nope"), /unknown narrative form/);
});

t("60 books in a row: never the form of the book before, every fitting form used, none more than its share", () => {
  for (const kind of ["fiction", "nonfiction"]) {
    const made = [];
    for (let i = 0; i < 60; i++) {
      const k = F.pickForm({ slug: `${kind}-${i}`, kind, recent: [...made].reverse() });
      assert.ok(F.candidates(kind).includes(k));
      if (made.length) assert.notStrictEqual(k, made[made.length - 1], `book ${i} is told like the one before`);
      made.push(k);
    }
    const uses = F.candidates(kind).map((k) => made.filter((m) => m === k).length);
    assert.ok(Math.min(...uses) >= 8 && Math.max(...uses) - Math.min(...uses) <= 4, `${kind}: ${uses.join(" ")}`);
  }
  assert.strictEqual(F.pickForm({ slug: "x", kind: "fiction", recent: [] }), F.pickForm({ slug: "x", kind: "fiction", recent: [] }), "deterministic for a book");
  assert.ok(F.validForm({ key: "case" }) && !F.validForm({ key: "summary" }) && !F.validForm(null));
});

t("the on-screen label is the part the hosts ANNOUNCE — never a number computed from the film's length", () => {
  const b = F.partBadges("case", ["the knife in the snow", "exhibit one, the letter", "more about it", "Exhibit two: the ledger", "as we saw in exhibit one", "exhibit number three the watch"]);
  assert.deepStrictEqual(b, ["CASE FILE", "EXHIBIT 01 / 03", "EXHIBIT 01 / 03", "EXHIBIT 02 / 03", "EXHIBIT 02 / 03", "EXHIBIT 03 / 03"]);
  assert.deepStrictEqual(F.partBadges("case", ["nothing announced", "exhibit one", "exhibit two"]), ["CASE FILE", "CASE FILE", "CASE FILE"], "fewer than three announced parts: the form's name, no invented number");
  assert.deepStrictEqual(F.partBadges("trial", ["round 1", "round 2", "round 3", "round 7"]), ["ROUND 01 / 03", "ROUND 02 / 03", "ROUND 03 / 03", "ROUND 03 / 03"], "a jump is not a part");
  assert.strictEqual(F.partBadges("unknown", ["a"]), null);
  const plan = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8");
  assert.ok(plan.includes("badge: (FORM_BADGES && FORM_BADGES[i]) || `INSIGHT ${"), "a book without a form is labelled as before");
});

t("Step 0 writes the form into the prompt and the book record; the checker knows a formed prompt and still passes an old one", () => {
  const mp = fs.readFileSync(path.join(__dirname, "make-prompt.js"), "utf8");
  assert.ok(mp.includes("${SPEECH}") && mp.indexOf("${lengthBlock(TIER, FORM)}") > 0 && mp.indexOf("${lengthBlock(TIER, FORM)}") < mp.indexOf("${spineFor(ENGINE, OPENING, TIER, FORM)}"), "LENGTH leads the paste block (a 17-minute recording came from a prompt that had it last); the speech rule is last");
  assert.ok(mp.includes("${formBlock(form, tier)}") && !mp.includes("STRUCTURE (follow strictly)") && !mp.includes("DEPTH ENGINE (run this on EVERY beat"));
  assert.ok(mp.includes("manifest.form = { key: FORM, part: FORMS[FORM].part") && mp.includes('--form-why="') && mp.includes("manifest.take ="));
  const formed = (body) => "# x\n\n**Engine:** antidote · **Form:** case ·\n\n```\nYou are two hosts doing a deep, original analysis of \"The Book\".\n\n" + body + "\n\n" + F.formBlock("case") + "\n\n" + F.SPEECH + "\n\nFIRST MINUTE\n- OPEN: x\n- NAME IT: x\n- PROMISE x\n\nPICTURE FIRST (this becomes animation)\n\nLENGTH x\n\nHARD RULES:\n- x\n" + "pad ".repeat(120) + "\n```\n";
  const angle = "THE ANGLE:\n- Thesis to prove: the letter was never sent.\n\nTHE EXHIBITS OF THIS BOOK:\n" + [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i}. the thing number ${i} from the book`).join("\n");
  assert.deepStrictEqual(checkNotebookPrompt(formed(angle), { title: "The Book", engine: "antidote", form: "case" }).errors, []);
  assert.ok(checkNotebookPrompt(formed("THE ANGLE:\n- nothing yet"), { title: "The Book", engine: "antidote" }).errors.some((e) => /parts of THIS book are not written/.test(e)));
  assert.ok(checkNotebookPrompt(formed(angle), { title: "The Book", engine: "antidote", form: "duel" }).errors.some((e) => /book\.json says form "duel"/.test(e)));
  assert.ok(checkNotebookPrompt(formed(angle).replace("SPEECH (", "TALK ("), { title: "The Book", engine: "antidote" }).errors.some((e) => /lost its SPEECH block/.test(e)));
  // a prompt written before 2026-11-18 (the one spine) is judged by the rules it was written under
  const old = fs.readdirSync(path.join(__dirname, "..", "books")).map((s) => path.join(__dirname, "..", "books", s)).filter((d) => fs.existsSync(path.join(d, "prompt.notebooklm.md")) && fs.existsSync(path.join(d, "book.json")));
  assert.ok(old.length >= 10);
  for (const d of old) { const b = JSON.parse(fs.readFileSync(path.join(d, "book.json"), "utf8")); const r = checkNotebookPrompt(fs.readFileSync(path.join(d, "prompt.notebooklm.md"), "utf8"), { title: b.title, engine: b.engine }); assert.ok(!r.errors.some((e) => /parts of THIS book|lost its SPEECH|lost its HOW EACH/.test(e)), `${path.basename(d)}: an old prompt is asked for the new blocks`); }
});

t("the parts reach the film: titles from the prompt, start frames from what the hosts say — fewer than three, and no track", () => {
  const block = "THE EXHIBITS OF THIS BOOK (in order):\n1. The deed to Carfax — Harker lays it on the table.\n2. The shaving mirror: no Count in it.\n3. The Demeter's log - fifty boxes.\n\nHOW EACH EXHIBIT IS DEVELOPED\n7. not a part";
  assert.deepStrictEqual(F.partTitles(block), ["The deed to Carfax", "The shaving mirror", "The Demeter's log"]);
  assert.deepStrictEqual(F.partTitles(""), []);
  const scenes = [{ text: "the deed slides over", from: 0 }, { text: "exhibit one the deed", from: 300 }, { text: "more", from: 600 }, { text: "Exhibit two", from: 900 }, { text: "exhibit three", from: 1200 }];
  assert.deepStrictEqual(F.partStarts("case", scenes.map((x) => x.text)), [1, 3, 4]);
  assert.deepStrictEqual(F.filmForm({ key: "case", parts: ["The deed", "The mirror"] }, scenes), { key: "case", part: "EXHIBIT", name: "CASE FILE", parts: [{ n: 1, from: 300, title: "The deed" }, { n: 2, from: 900, title: "The mirror" }, { n: 3, from: 1200 }] });
  assert.deepStrictEqual(F.filmForm({ key: "case" }, scenes.slice(0, 3)).parts, [], "one announced part: nothing is invented");
  assert.strictEqual(F.filmForm(null, scenes), null); assert.strictEqual(F.filmForm({ key: "summary" }, scenes), null);
  const plan = fs.readFileSync(path.join(__dirname, "plan-antidote.js"), "utf8"), mp = fs.readFileSync(path.join(__dirname, "make-prompt.js"), "utf8");
  assert.ok(plan.includes('require("./lib/narrative-form").filmForm(man.form,') && mp.includes("book.form = { ...book.form, parts: titles }"));
});

t("the film's frame is the form's: eight shapes for the same information, drawn only for a film with announced parts", () => {
  const eng = path.join(__dirname, "../src/engines/antidote");
  const track = fs.readFileSync(path.join(eng, "components/FormTrack.tsx"), "utf8"), index = fs.readFileSync(path.join(eng, "index.tsx"), "utf8"), schema = fs.readFileSync(path.join(eng, "schema.ts"), "utf8");
  for (const k of KEYS) assert.ok(k === "anatomy" || track.includes(`key === "${k}"`), `${k} has no shape of its own`);
  assert.ok(/\(config\.meta\.form\.parts \|\| \[\]\)\.length >= 3/.test(track), "fewer than three parts: the old band");
  assert.ok(index.includes("hasFormTrack(config) ? <FormTrack config={config} /> : <RetentionHUD config={config} />"));
  assert.ok(!/Math\.sin|Math\.cos/.test(track), "a part arrives once; nothing sways");
  assert.ok(/form: z\.object\(\{ key: z\.string\(\)[^\n]*\)\.optional\(\),/.test(schema), "optional: a config without it renders as before");
  assert.ok(track.includes("active.hud?.hidden") && track.includes('active.shot === "chapterCard"'), "hidden where the old band was hidden");
});

t("when a part is announced its board comes up: one object per form, over the scene for three seconds, nothing swaying", () => {
  const eng = path.join(__dirname, "../src/engines/antidote");
  const board = fs.readFileSync(path.join(eng, "components/FormBoard.tsx"), "utf8"), index = fs.readFileSync(path.join(eng, "index.tsx"), "utf8");
  for (const k of KEYS) assert.ok(k === "anatomy" || board.includes(`key === "${k}"`), `${k} has no board of its own`);
  assert.strictEqual(new Set([...board.matchAll(/^    (\w+): \{ bg: "(#[0-9A-F]{6})"/gm)].map((m) => m[2])).size, KEYS.length, "eight boards, eight grounds");
  assert.ok(/\(form\.parts \|\| \[\]\)\.length < 3\) return null/.test(board), "fewer than three announced parts: no board");
  assert.ok(/if \(t >= HOLD\) return null/.test(board) && /const HOLD = 84/.test(board), "it stands for under three seconds, then the scene is there again");
  assert.ok(board.includes("active.hud?.hidden") && !/Math\.sin|Math\.cos/.test(board));
  assert.ok(index.includes("hasFormTrack(config) && <FormBoard config={config} />"));
  assert.ok(index.indexOf("<FormBoard") < index.indexOf("<CaptionLayer"), "the subtitles stay above the board");
});

t("the boards carry the book's own drawings: a part's title names a person, a thing or a place the book drew — or the author says which", () => {
  const A = require("./lib/told-apply");
  const P = [{ d: "M40 150 H480 V200 H40 Z", fill: "ink" }];
  const ENT = {
    lucy: { label: "LUCY WESTENRA", kind: "person", look: { hair: "#E3C078", drawn: { hair: [{ d: "M110 124 H290 V60 Z", fill: "hair" }] } } },
    room: { label: "LUCY'S ROOM", kind: "place", backdrop: { viewBox: "0 0 1920 760", paths: P } },
    demeter: { label: "SCHOONER DEMETER", kind: "object", paths: P },
    castle: { label: "TRANSYLVANIA", kind: "place", reads: ["castle", "fortress"], paths: P },
    flask: { label: "THE TRANSFUSION", kind: "object", paths: P, part: 5 },
    bank: { label: "THE BANK", kind: "company", glyph: "building" },
  };
  const film = (key, titles) => ({ meta: { form: { key, part: "X", name: "X", parts: titles.map((title, i) => ({ n: i + 1, from: i * 100, title })) } }, scenes: [] });
  const got = (key, titles) => A.formArt(film(key, titles), ENT, { palette: { ink: "#101820", accent: "#B5121B", paper: "#F4EFE6" } });
  const r = got("case", ["The Demeter's log", "Lucy's chart", "Lucy's room", "The castle", "Four men's blood", "The bank", "Nothing drawn"]);
  assert.deepStrictEqual(r.config.meta.form.parts.map((p) => (p.art ? p.art.entity : null)), ["demeter", "lucy", "room", "castle", "flask", null, null]);
  assert.strictEqual(r.matched, 5); assert.strictEqual(r.parts, 7);
  const parts = r.config.meta.form.parts;
  assert.strictEqual(parts[0].art.kind, "thing"); assert.strictEqual(parts[0].art.paths[0].fill, "#101820", "in the book's colours");
  assert.strictEqual(parts[2].art.viewBox, "0 0 1920 760", "a place drawn only as a backdrop is shown as that backdrop");
  assert.strictEqual(parts[1].art.kind, "person"); assert.strictEqual(parts[1].art.variant.drawn.hair[0].fill, "#E3C078", "the person's own drawn head");
  assert.strictEqual(parts[4].art.entity, "flask", "an entity that says \"part\": 5 IS part five's drawing, whatever the title says");
  assert.strictEqual(got("portraits", ["Lucy", "The Count"]).config.meta.form.parts[0].art.entity, "lucy");
  // fresh at every apply; a film without parts, or without a form, is the same object
  const again = A.formArt(r.config, { demeter: ENT.demeter }, {});
  assert.deepStrictEqual(again.config.meta.form.parts.map((p) => !!p.art), [true, false, false, false, false, false, false]);
  const none = { meta: {}, scenes: [] }; assert.strictEqual(A.formArt(none, ENT, {}).config, none);
  const board = fs.readFileSync(path.join(__dirname, "../src/engines/antidote/components/FormBoard.tsx"), "utf8");
  assert.ok((board.match(/<PartArt art=\{parts\[i\]\.art!\}/g) || []).length >= 4, "the case card, the station, the gallery frame and the blueprint block draw it");
});

t("a part announced across a scene boundary is heard, in the scene where its first word is said", () => {
  const scenes = ["Let's get into it then. Exhibit one, the deed.", "He signs. Let's look at what he does next. Exhibit", "two, the atlas with three rings.", "That brings us to exhibit 3, the shaving mirror.", "As we saw in exhibit", "one, he signs things.", "That is exhibit 4."];
  assert.deepStrictEqual(F.partStarts("case", scenes), [0, 1, 3, 6]);
  assert.strictEqual(F.partBadges("case", scenes)[2], "EXHIBIT 02 / 04");
  assert.deepStrictEqual(F.partStarts("case", ["Exhibit", "", "one.", "exhibit two", "exhibit", "three"]), [0, 3, 4]);
});

console.log(`\n${n} checks passed`);
