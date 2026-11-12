#!/usr/bin/env node
/**
 * artdirect-the-wedding-people.js — Claude hand art-direction for the Antidote
 * scaffold. Rewrites kinetic copy per scene (book-specific), fixes the cast
 * (Phoebe & Lila are women), refines the thumbnail brief, and corrects a few
 * mismatched expressions/motifs. Idempotent: run against the scaffold config.
 */
const fs = require("fs");
const path = require("path");
const CFG = path.join(__dirname, "..", "books", "the-wedding-people", "config.antidote.json");
const c = JSON.parse(fs.readFileSync(CFG, "utf8"));

const INK = "#1E1E22";
const PAPER = "#EAE7DE";
const ACCENT = "#D9603C"; // brand orange (narrator + box workhorse)
const EMERALD = "#0F6B57"; // Phoebe's dress
const WINE = "#B23A48"; // Lila

// ── text builders ───────────────────────────────────────────────────────────
const p = (text, at = 8) => ({ text, style: "plain", color: INK, enter: "up", at });
const b = (text, at = 8) => ({ text, style: "box", color: PAPER, boxColor: ACCENT, enter: "pop", at });
const h = (text, at = 8) => ({ text, style: "highlight", color: INK, boxColor: ACCENT, enter: "up", at });
const s = (text, at = 8) => ({ text, style: "strike", color: INK, enter: "up", at }); // "not this"
const o = (text, at = 8) => ({ text, style: "outline", color: INK, boxColor: ACCENT, enter: "pop", at }); // stats
const st = (text, at = 8) => ({ text, style: "stack", color: INK, enter: "up", at });

// index -> texts[]  (omit an index = leave that scene clean / conversational)
const T = {
  0: [p("THE WEDDING PEOPLE", 6), b("SHE CAME TO DIE", 34)],
  2: [p("HER DARKEST PLAN", 8), b("THE LOUDEST PARTY", 46)],
  3: [h("PERFORMANCE vs HONESTY", 10)],
  4: [b("SHE QUIT PERFORMING", 8)],
  5: [p("NOT A REASON TO LIVE", 8), b("SOMEONE TO STOP LYING TO", 48)],
  6: [b("THE WEDDING PEOPLE", 10)],
  7: [o("AN 1864 ELEVATOR", 10)],
  9: [p("THE BRIDE IS BLEEDING", 8)],
  10: [h("WHOSE SIDE ARE YOU ON?", 8)],
  11: [p("“I’M HERE TO KILL MYSELF”", 8), b("SAID TO A STRANGER", 60)],
  12: [b("THE PRESSURE VALVE", 8)],
  15: [p("TIDY TO THE VERY END", 8)],
  17: [h("A TACTICAL STRIKE?", 8)],
  19: [p("“MY WEDDING”", 8), b("SHE RECLAIMS HER SPACE", 44)],
  21: [b("THE PLAN LOSES ITS GRIP", 8)],
  22: [b("A PERFORMANCE MACHINE", 8)],
  23: [p("HIGH BUN & NECK PILLOW", 8)],
  24: [p("THE GREEK CHORUS", 8)],
  25: [b("THERAPY SPEAK", 8)],
  26: [p("PERFORMING VULNERABILITY", 8)],
  27: [p("“THE FLIGHT WAS FINE”", 8), s("(IT WASN’T)", 60)],
  28: [b("THE HAPPY VERSION", 8)],
  29: [h("TRUTH vs AESTHETICS", 8)],
  32: [b("CONTROLLING THE STORY", 8)],
  33: [p("WHY SHE CHECKED OUT", 8)],
  35: [b("A SURVIVAL MECHANISM", 8)],
  37: [b("A MAGNETIC ANOMALY", 8)],
  38: [o("$50,000", 8), p("ON THE RECEPTION", 46)],
  40: [p("HER DEAD FATHER’S MONEY", 8)],
  41: [p("“JUST DIE.”", 8), b("“I WILL.”", 40)],
  42: [b("THE SAME CORE FEAR", 8)],
  43: [h("IS MY LIFE A LIE?", 8)],
  44: [p("“I DON’T WANT TO BE ALONE”", 8)],
  46: [b("TWO WAYS TO RUN", 8)],
  48: [p("LILA = PHOEBE", 8), b("10 YEARS AGO", 46)],
  49: [p("“SORRY, 3 MINUTES OVER”", 8)],
  50: [b("EACH OTHER’S MEDICINE", 8)],
  51: [b("THE STRANGER PARADOX", 8)],
  52: [p("SOMETHING IN YOUR TEETH", 8)],
  53: [s("NO ONE TOLD HER", 8)],
  54: [p("INTIMACY = POLITE LIES", 8), b("“WE’RE FINE”", 48)],
  56: [p("SHE JUST FROZE", 8)],
  57: [p("10 YEARS: SILENCE", 8), b("3 HOURS: THE TRUTH", 48)],
  59: [h("NO POWER TO HURT YOU", 8)],
  60: [p("HEART EMOJIS WHEN HE DIES", 8), b("NEVER THE TRUTH", 52)],
  61: [b("NOTHING LEFT TO LOSE", 8)],
  62: [p("A SEA OF BLACK BOXES", 8)],
  63: [p("“WHAT IS LITERATURE?”", 8), s("SHE FORGOT", 52)],
  64: [p("A READER OF HER LIFE", 8), b("NEVER THE WRITER", 46)],
  65: [p("SHE STOPPED CHOOSING", 8)],
  67: [s("NOT AN ESCAPE", 8)],
  68: [b("IT WAS HER CAGE", 8)],
  69: [p("PROBLEMS SOLVED IN ONE CHAPTER", 8)],
  70: [b("POLISHING THE GLASS", 8)],
  71: [p("SHE STOPS READING", 8), b("SHE STARTS ACTING", 44)],
  73: [o("$22 SQUASH TOAST", 8)],
  74: [s("NOT BY PHILOSOPHY", 8)],
  75: [b("A GENUINELY GOOD AFTERNOON", 8)],
  76: [p("A HARD RESET", 8)],
  78: [p("HIS LAST WORD: “HERBAL”", 8)],
  79: [p("SHE CAN’T BREATHE", 8)],
  82: [p("WHEN THE BIG REASONS FAIL", 8)],
  83: [b("THE MICRO-TETHERS", 8)],
  85: [p("“FREE THE BOOKS”", 8)],
  86: [b("LETTING A NEW LIFE IN", 8)],
  87: [p("SHE LOCKED HER HEART", 8)],
  89: [p("“SUICIDAL — BUT LOVABLE”", 8)],
  90: [b("SHE DECIDED TO LIVE", 8)],
  91: [h("MESSINESS IS THE CURE", 8)],
  92: [b("REAL LIFE IS MESSY", 8)],
  93: [p("REWRITING THE SCRIPT", 8)],
  94: [p("THE DRESS SHE’D DIE IN", 8)],
  95: [s("NOT A MAKEOVER", 8), b("PERMISSION TO STOP", 46)],
  97: [p("CURIOSITY RETURNS", 8)],
  99: [h("ONE OF THE WEDDING PEOPLE?", 8)],
  100: [p("SAME DRESS.", 8), b("NEW DIRECTION.", 40)],
  101: [b("THE ONLY HONEST ONE", 8)],
  102: [h("IS IT WISH FULFILLMENT?", 8)],
  103: [o("$836 A NIGHT", 8)],
  105: [h("IS THE CURE A VACATION?", 8)],
  106: [b("THE LUXURY IS A STAGE", 8)],
  107: [p("WHAT MAKES YOU TELL THE TRUTH?", 8)],
  108: [b("SMALLER. TRUER.", 8)],
  109: [s("NOT YOUR WHOLE LIFE BACK", 8), b("JUST TOMORROW", 50)],
  110: [p("ONE MORE DAY", 8), b("IS HOW ANYONE STAYS", 44)],
  111: [h("WHO GETS THE REAL YOU?", 8)],
  112: [b("ONLY WITH STRANGERS?", 8)],
  113: [p("HOMES — OR STAGES?", 8)],
  114: [p("SOMETHING SMALL AND REAL", 8)],
  115: [b("CHECK THE ELEVATOR DOORS", 8)],
};

// ── cast fix: Phoebe & Lila are women; give them distinct, book-true looks ────
c.meta.cast = c.meta.cast || {};
c.meta.cast.protagonist = {
  name: "Phoebe Stone — the 'you' of the book; came to end it, learns to stay",
  variant: {
    skin: "#E7B489", hair: "#4A3226", suit: EMERALD, shirt: "#F1EFE9",
    hairStyle: "long", gender: "f", age: "adult", outfit: "casual",
    glasses: false, beard: "none", expression: "neutral",
  },
};
c.meta.cast.foil = {
  name: "Lila — the bride; controls everything, terrified it's all a lie",
  variant: {
    skin: "#EBC59B", hair: "#241C16", suit: WINE, shirt: "#F3E9E4",
    hairStyle: "bun", gender: "f", age: "adult", outfit: "suit",
    glasses: false, beard: "none", expression: "neutral",
  },
};

// ── thumbnail brief (was _needsClaudeRefine, hook was the title) ─────────────
c.meta.thumbnail = {
  hook: "ONE MORE DAY",
  variant: {
    skin: "#E7B489", hair: "#4A3226", suit: EMERALD, shirt: "#F1EFE9",
    hairStyle: "long", gender: "f", age: "adult", outfit: "casual",
    glasses: false, beard: "none", expression: "surprised",
  },
  action: "idle",
  expression: "surprised",
  motif: "ring",
};

// ── apply kinetic copy ──────────────────────────────────────────────────────
let touched = 0;
c.scenes.forEach((sc, i) => {
  if (T[i]) { sc.texts = T[i]; touched++; }
  else { sc.texts = []; } // clear low-quality auto-extracted fragments on clean scenes
});

// ── targeted expression / motif fixes ───────────────────────────────────────
// scene 64: "reader of her life, not writer" = despair, not celebration
if (c.scenes[64]) {
  for (const ch of c.scenes[64].characters) {
    if (ch.role === "protagonist") { ch.expression = "worried"; ch.action = "think"; }
    if (ch.role === "foil") { ch.expression = "neutral"; ch.action = "idle"; }
  }
}
// scene 54: "intimacy = polite lies" is not a happy point
if (c.scenes[54]) for (const ch of c.scenes[54].characters) if (ch.role === "protagonist") { ch.expression = "neutral"; ch.action = "talk"; }
// scene 13: releasing a secret to someone with no stake — moneyRain is off-book
if (c.scenes[13]) c.scenes[13].props = [{ type: "ripple", x: 960, y: 540, scale: 1, enter: "fade", at: 6 }];

fs.writeFileSync(CFG, JSON.stringify(c, null, 2) + "\n");
console.log(`✓ art-directed ${CFG}`);
console.log(`  scenes with kinetic copy: ${touched}/${c.scenes.length}`);
console.log(`  cast: protagonist=Phoebe (f, emerald), foil=Lila (f, wine)`);
console.log(`  thumbnail.hook: "ONE MORE DAY" (ring motif)`);
