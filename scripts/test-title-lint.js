#!/usr/bin/env node
/**
 * test-title-lint.js — regression for the YouTube title contract (scripts/lib/title-lint.js).
 * A book-specific counter-narrative set passes; the channel templates, unanchored angles,
 * cross-book repeats, ungrounded quotes and missing search entities fail.
 *   node scripts/test-title-lint.js
 */
const { lintTitleSet, packEntry } = require("./lib/title-lint");

let fails = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`); if (!ok) fails++; };
const codes = (r) => r.errors.map((e) => e.split(/[: ]/)[0]);

const narration = `Everyone remembers the parties, the shirts and the green light, and they call it the great American love story.
But Gatsby never loved Daisy, he loved the version of himself that Daisy could prove was real.
Nick Carraway tells us he is the most honest man he knows, and that is the first lie of the novel.
The valley of ashes sits between the eggs and the city, watched by the eyes of Doctor T. J. Eckleburg.
Daisy was driving the car that killed Myrtle Wilson, and Tom lets Gatsby take the blame.`;

const corpus = [
  packEntry("other-a", ["Other Book Summary — The Ending Everyone Gets Wrong", "Other Book: Why Smart People Get It So Wrong"], "Other Book", "Ann Writer"),
  packEntry("other-b", ["Moby Dick Explained: Why Ahab's Whale Hunt Isn't Revenge", "Moby Dick by Herman Melville — Full Summary"], "Moby Dick", "Herman Melville",
    "whaling sea ship captain obsession"),
];

const base = {
  shortTitle: "The Great Gatsby", author: "F. Scott Fitzgerald", narration, corpus,
  titleAngles: [
    { myth: "It is a great love story", book: "Gatsby loves the self Daisy proves, not Daisy", quote: "Gatsby never loved Daisy, he loved the version of himself" },
    { myth: "Nick is the honest, neutral narrator", book: "Nick's honesty claim is the novel's first lie", quote: "the most honest man he knows, and that is the first lie" },
  ],
};
const good = [
  "The Great Gatsby Summary & Analysis — F. Scott Fitzgerald",
  "The Great Gatsby Ending Explained: Gatsby Never Loved Daisy",
  "The Great Gatsby: Why Nick Carraway Isn't the Honest Narrator You Trust",
  "F. Scott Fitzgerald's The Great Gatsby — Key Ideas & Themes Explained",
  "The Great Gatsby Review: The Valley of Ashes Everyone Skims Past",
];

const r = lintTitleSet({ ...base, titles: good });
check("book-specific counter-narrative set PASSES", r.status === "PASS", r.errors.join(" | "));
check("anchors come from the narration", r.perTitle[2].anchors.includes("nick") || r.perTitle[2].anchors.includes("carraway"), JSON.stringify(r.perTitle[2].anchors));

const stock = lintTitleSet({ ...base, titles: [good[0], good[1], "The Great Gatsby: Why Smart People Get It So Wrong", good[3], "The Great Gatsby Explained: The Ending Everyone Gets Wrong"] });
check("channel templates are STOCK_PHRASE", codes(stock).filter((c) => c === "STOCK_PHRASE").length === 2, stock.errors.join(" | "));

const unanchored = lintTitleSet({ ...base, titles: [good[0], "The Great Gatsby Explained: What Everyone Gets Wrong About the Ending", good[3], "The Great Gatsby Summary — Fitzgerald", "The Great Gatsby: The Truth Nobody Admits (Analysis)"] });
check("angles without a book anchor do not count (TOO_FEW_ANGLES)", codes(unanchored).includes("TOO_FEW_ANGLES"), unanchored.errors.join(" | "));

const repeat = lintTitleSet({ ...base, titles: [...good.slice(0, 4), "The Great Gatsby Explained: Why Gatsby's Whale Hunt Isn't Revenge"] });
check("angle wording copied from another book is CHANNEL_REPEAT", codes(repeat).includes("CHANNEL_REPEAT"), repeat.errors.join(" | "));

const ungrounded = lintTitleSet({ ...base, titles: good, titleAngles: [base.titleAngles[0], { myth: "x is y", book: "z", quote: "a sentence the narration never said at all" }] });
check("a titleAngles quote not in the narration FAILS", codes(ungrounded).includes("ANGLE_QUOTE_NOT_IN_NARRATION"), ungrounded.errors.join(" | "));

const noAngles = lintTitleSet({ ...base, titles: good, titleAngles: undefined });
check("missing titleAngles FAILS", codes(noAngles).includes("NO_TITLE_ANGLES"), noAngles.errors.join(" | "));

const noEntity = lintTitleSet({ ...base, titles: [...good.slice(0, 4), "Why Nick Carraway Lies to You From Page One"] });
check("a title without the book title is NO_BOOK_TITLE", codes(noEntity).includes("NO_BOOK_TITLE"), noEntity.errors.join(" | "));

const primary = lintTitleSet({ ...base, titles: [good[2], good[1], good[0], good[3], good[4]] });
check("titles[0] without a search modifier is PRIMARY_NOT_SEARCHABLE", codes(primary).includes("PRIMARY_NOT_SEARCHABLE"), primary.errors.join(" | "));

const turkish = lintTitleSet({ ...base, titles: [...good.slice(0, 4), "The Great Gatsby Özeti: Gatsby Daisy'yi Hiç Sevmedi"] });
check("Turkish title is NOT_ENGLISH", codes(turkish).includes("NOT_ENGLISH"), turkish.errors.join(" | "));

const sameAnchor = lintTitleSet({ ...base, titles: [good[0], "The Great Gatsby Ending Explained: Daisy Isn't the Dream", "The Great Gatsby: Daisy Was Never the Point (F. Scott Fitzgerald)", good[3], "The Great Gatsby Summary — F. Scott Fitzgerald"] });
check("two angles on one anchor are ANGLES_NOT_DISTINCT", codes(sameAnchor).includes("ANGLES_NOT_DISTINCT"), sameAnchor.errors.join(" | "));

console.log(fails ? `\n✗ ${fails} failing` : "\n✓ title lint regression passes");
process.exit(fails ? 1 : 0);
