#!/usr/bin/env node
/** test-story-share.js — how much of a narration tells the book. No render, no network. */
const assert = require("assert");
const { storyShare, vocabOf, CHANNEL } = require("./lib/story-share");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };
const TALK = "That changes how we read all of it. It is a question of power and of who holds it. Nobody could say otherwise then. We keep coming back to that idea again.";

t("a scene is a stretch: the sentences beside the one that names the book are told too", () => {
  const r = storyShare("It is early May. Jonathan Harker sits in the firelit room. He lays the papers on the table. " + TALK);
  // sentences of 4,7,7 | 8,11,5,8 words. "May" and "Jonathan Harker" name; "He lays the papers…" stands beside a naming
  // sentence and is told with it (18 words); the four talk sentences (32 words) are beside none.
  assert.strictEqual(r.words, 50);
  assert.ok(Math.abs(r.share - 18 / 50) < 1e-9);
  assert.strictEqual(r.longestTalkWords, 32);
  assert.ok(Math.abs(r.namingSentences - 2 / 7) < 1e-9, "by the old count: two sentences of seven carry a name");
});

t("a book is also named by its own things and roles, when the book has entities", () => {
  const text = "The count signs the deed at the table. " + TALK;
  assert.strictEqual(storyShare(text).share, 0, "no proper name: nothing told by names alone");
  const v = vocabOf({ dracula: { kind: "person", label: "COUNT DRACULA" }, deed: { kind: "object", label: "THE DEED", words: ["parchment"] } });
  assert.deepStrictEqual([...v].sort(), ["count", "deed", "dracula", "parchment"]);
  const r = storyShare(text, { vocab: v });
  assert.ok(r.share > 0.3 && r.withThings);
  assert.ok(storyShare("The deeds were signed in the room that night. " + TALK, { vocab: v }).share > 0, "a plural names it too");
});

t("empty in, nothing out; the channel's medians are the measured ones", () => {
  assert.strictEqual(storyShare(""), null);
  assert.strictEqual(vocabOf({}).size, 0);
  assert.deepStrictEqual(CHANNEL, { fiction: 0.6, nonfiction: 0.41, all: 0.49 });
});

console.log(`\nall story-share checks passed (${n})`);
