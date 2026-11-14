/**
 * antidote-costume.js — the Character Foundry's casting director.
 *
 * The old planner shipped one hardcoded cast bible: the same narrator in the
 * same red casual top, the same protagonist, the same bald bespectacled mentor,
 * in every book on the channel. Colors changed with the book palette; the
 * PEOPLE did not. A viewer who watches two of our videos sees the same five
 * actors in the same three coats, which is precisely the "templated content"
 * read we are trying to avoid.
 *
 * This module casts a book instead. It picks an ERA/WORLD from what the book
 * actually is, then builds five people out of the wardrobe in `wardrobe.tsx` —
 * different garments, different headwear, different builds, different
 * head-to-body ratios — deterministically from the slug, so a re-plan is
 * byte-identical and two different books are cast differently.
 *
 * Claude then overrides it at art-direction time with the book's real
 * characters (`plan-antidote.js --emit-cast` → `--cast`). This is the baseline
 * that makes an un-art-directed book already look like its own film.
 */

// ── deterministic pseudo-random (no Math.random — re-plans must be identical) ─
const rnd = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const pick = (arr, seed) => arr[Math.floor(rnd(seed) * arr.length) % arr.length];

const hx = (h) => {
  const s = String(h).trim();
  const m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = s.replace("#", "");
  const full = t.length === 3 ? t.split("").map((c) => c + c).join("") : t;
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = ([r, g, b]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
const mix = (h, to, a) => rgb(hx(h).map((c) => c + (to - c) * a));
const lighten = (h, a) => mix(h, 255, a);
const darken = (h, a) => mix(h, 0, a);

// ── SKIN TONES ──────────────────────────────────────────────────────────────
// A cast that is one skin tone in five shades is its own kind of template.
const SKINS = ["#F2C79B", "#E7B489", "#D9A277", "#C98A5E", "#A96C42", "#8A5430", "#6B3E24", "#F7D6B4"];
const HAIRS = ["#2B2622", "#3A2A22", "#4A342A", "#5A3A28", "#6B4A2E", "#241C16", "#8C8378", "#B9B2A6", "#1A1A1A"];

/**
 * WORLDS — a coherent wardrobe for the kind of book this is.
 *
 * Each world is a pool per slot. Casting draws from the pools, so two books in
 * the same world still get different people, and a book in a different world
 * gets a different silhouette language entirely.
 */
const WORLDS = {
  modern: {
    label: "Present day",
    outfits: { any: ["casual", "hoodie", "vest", "coat"], m: ["suit"], f: ["dress"] },
    headwear: { any: ["none", "none", "none", "cap", "beanie"], m: [], f: ["headscarf"] },
    hair: { any: ["short", "buzz", "curly", "messy", "afro"], m: ["receding"], f: ["long", "bun", "ponytail", "braids"] },
    accessory: { any: ["none", "none", "scarf", "satchel"], m: ["tie"], f: ["necklace"] },
    beards: ["none", "none", "stubble", "full", "goatee"],
  },
  office: {
    label: "Corporate / business",
    outfits: { any: ["suit", "vest", "coat", "casual"], m: [], f: ["dress"] },
    headwear: { any: ["none", "none", "none", "none"], m: [], f: [] },
    hair: { any: ["short", "buzz", "curly"], m: ["receding", "bald"], f: ["bun", "long", "ponytail"] },
    accessory: { any: ["badge", "collar", "none"], m: ["tie", "tie", "bowtie"], f: ["necklace", "scarf"] },
    beards: ["none", "none", "stubble", "goatee"],
  },
  academic: {
    label: "University / research",
    outfits: { any: ["robe", "vest", "coat", "casual"], m: ["suit"], f: ["dress"] },
    headwear: { any: ["none", "none", "none", "beret"], m: [], f: [] },
    hair: { any: ["messy", "curly", "short"], m: ["receding", "bald"], f: ["bun", "long", "braids"] },
    accessory: { any: ["collar", "satchel", "none"], m: ["tie"], f: ["necklace"] },
    beards: ["none", "full", "stubble", "goatee", "muttonchops"],
  },
  jazzAge: {
    label: "1920s",
    outfits: { any: ["coat", "vest"], m: ["suit", "suit"], f: ["dress", "dress"] },
    headwear: { any: ["none"], m: ["fedora", "cap", "topHat"], f: ["bonnet", "veil"] },
    hair: { any: ["short", "buzz"], m: ["receding"], f: ["bun", "long"] },
    accessory: { any: ["collar", "none"], m: ["tie", "bowtie", "suspenders"], f: ["necklace", "scarf"] },
    beards: ["none", "none", "mustache", "stubble"],
  },
  victorian: {
    label: "19th century",
    outfits: { any: ["coat", "vest", "robe", "rags"], m: ["suit"], f: ["dress", "dress", "apron"] },
    headwear: { any: ["none", "cap"], m: ["topHat"], f: ["bonnet", "veil", "headscarf"] },
    hair: { any: ["short", "messy"], m: ["receding", "bald"], f: ["bun", "long", "braids"] },
    accessory: { any: ["collar", "none"], m: ["bowtie", "tie"], f: ["necklace"] },
    beards: ["none", "full", "muttonchops", "mustache"],
  },
  medieval: {
    label: "Pre-modern / mythic",
    outfits: { any: ["robe", "cloak", "armor", "rags"], m: [], f: ["dress", "apron"] },
    headwear: { any: ["hood", "crown", "none"], m: ["helmet"], f: ["headscarf", "veil"] },
    hair: { any: ["long", "messy", "short"], m: ["bald", "buzz"], f: ["braids", "bun"] },
    accessory: { any: ["none", "none", "collar", "satchel"], m: [], f: [] },
    beards: ["full", "none", "stubble", "goatee"],
  },
  military: {
    label: "War / service",
    outfits: { any: ["uniform", "coat", "casual"], m: ["armor"], f: [] },
    headwear: { any: ["cap", "beret", "none"], m: ["helmet"], f: ["headscarf"] },
    hair: { any: ["buzz", "short"], m: ["bald"], f: ["bun", "braids"] },
    accessory: { any: ["badge", "satchel", "none"], m: ["tie"], f: [] },
    beards: ["none", "stubble", "none", "mustache"],
  },
  rural: {
    label: "Farm / small town",
    outfits: { any: ["overalls", "casual", "vest"], m: [], f: ["apron", "dress"] },
    headwear: { any: ["cap", "none", "none"], m: ["cowboy"], f: ["headscarf", "bonnet"] },
    hair: { any: ["short", "messy", "buzz"], m: ["receding"], f: ["braids", "bun", "pigtails", "long"] },
    accessory: { any: ["none", "none", "scarf"], m: ["suspenders"], f: [] },
    beards: ["none", "stubble", "full"],
  },
  classical: {
    label: "Classical antiquity (Greek / Roman)",
    outfits: { any: ["robe", "cloak"], m: [], f: [] },
    headwear: { any: ["none", "none", "none"], m: [], f: [] },
    hair: { any: ["curly", "short", "long"], m: ["bald", "receding"], f: ["bun", "braids"] },
    accessory: { any: ["none"], m: [], f: [] },
    beards: ["full", "full", "stubble", "none"],
    glasses: false,
  },
  dystopian: {
    label: "Regime / speculative",
    outfits: { any: ["rags", "hoodie", "uniform", "cloak"], m: [], f: ["robe", "dress"] },
    headwear: { any: ["hood", "none", "beanie"], m: [], f: ["veil", "headscarf"] },
    hair: { any: ["buzz", "bald", "short", "messy"], m: [], f: ["bun", "braids"] },
    accessory: { any: ["none", "badge", "none", "satchel"], m: [], f: [] },
    beards: ["none", "stubble", "none"],
  },
};

/** The slot pool a given presentation may draw from: shared options + its own. */
const poolFor = (slot, gender) => [...(slot.any || []), ...(slot[gender] || [])];

/**
 * Which world this book lives in.
 *
 * Order matters: a specific period signal beats a genre. The narration sample
 * is the strongest evidence we have — the book tells us what it wears.
 */
const WORLD_SIGNS = [
  ["classical", /\b(ancient\s*greece|athens|athenian|sparta|plato|socrates|republic|philosopher|bc\b|bce\b|roman|rome|caesar|stoic|seneca|marcus\s*aurelius|aristotle|kallipolis)\b/i],
  ["medieval", /\b(medieval|knight|kingdom|castle|sword|peasant|monk|crusade|the king|the queen|dragon|village elder|thou|thy)\b/i],
  ["jazzAge", /\b(1920s|nineteen twenties|jazz age|prohibition|flapper|speakeasy|roaring twenties|bootleg|model t|gramophone)\b/i],
  ["victorian", /\b(victorian|1800s|eighteen (hundred|forty|fifty|sixty|seventy|eighty|ninety)|nineteenth century|19th century|carriage|parlour|corset|governess|almshouse|workhouse)\b/i],
  ["dystopian", /\b(dystopia|the regime|totalitarian|rationed|surveillance|the commander|handmaid|the party\b|re-?education|checkpoint|the wall\b|districts?)\b/i],
  ["military", /\b(\bwar\b|soldier|regiment|trench|battalion|front line|the army|platoon|barracks|enlisted|combat|veterans?)\b/i],
  ["rural", /\b(farm|plantation|barn|harvest|the county|small town|rural|the fields|sharecropper|homestead|cattle|orchard)\b/i],
  ["academic", /\b(university|professor|the study|researcher|scientist|laboratory|dissertation|the experiment|psychologist|the data\b)\b/i],
  ["office", /\b(the office|quarterly|the boss|coworker|corporation|the firm|shareholders?|startup|the meeting|manager)\b/i],
];

const GENRE_WORLD = {
  money: "office", business: "office", finance: "office", investing: "office",
  psychology: "academic", science: "academic", philosophy: "classical", classics: "classical",
  history: "victorian", memoir: "modern", "self-help": "modern", habits: "modern",
  fantasy: "medieval", classic: "classical", fiction: "modern", thriller: "modern",
};

function detectWorld({ genre, title, sample }) {
  const text = `${title || ""} ${sample || ""}`;
  for (const [world, re] of WORLD_SIGNS) if (re.test(text)) return world;
  const g = String(genre || "").toLowerCase();
  for (const key of Object.keys(GENRE_WORLD)) if (g.includes(key)) return GENRE_WORLD[key];
  return "modern";
}

// ── the five baseline roles, and what each one IS ───────────────────────────
// Casting differences are deliberate and structural: the narrator reads as the
// most ordinary person in the film, the foil is heavier and darker, the mentor
// is older and slighter, the extra is younger. Those four contrasts survive at
// crowd scale, where a color change does not.
const ROLE_SHAPE = {
  narrator: { age: "adult", build: "average", height: 1.0, headScale: 1.0, gender: null },
  protagonist: { age: "adult", build: "average", height: 0.99, headScale: 1.02, gender: null },
  foil: { age: "adult", build: "heavy", height: 1.05, headScale: 0.97, gender: null },
  mentor: { age: "old", build: "slight", height: 0.95, headScale: 1.03, gender: null },
  extra: { age: "young", build: "slight", height: 0.93, headScale: 1.05, gender: null },
};

const ROLE_NOTE = {
  narrator: "Narrator — talks to camera, frames every idea",
  protagonist: "The 'you' of the book — carries every lived beat",
  foil: "Whoever the protagonist is up against",
  mentor: "Shows up on advice beats — older, calmer",
  extra: "Anonymous body — crowds, background roles",
};

/**
 * Cast a book.
 *
 * @param {{slug:string,palette:object,genre?:string,title?:string,sample?:string,world?:string}} opts
 * @returns {{world:string,label:string,cast:object}}
 */
function castBook({ slug, palette, genre, title, sample, world: forcedWorld }) {
  const PAL = palette && palette.paper ? palette : { paper: "#EAE7DE", ink: "#1E1E22", red: "#D9603C", gold: "#C99A48" };
  const world = forcedWorld && WORLDS[forcedWorld] ? forcedWorld : detectWorld({ genre, title, sample });
  const W = WORLDS[world];
  const seed = String(slug || "antidote").split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  // Garment colors are drawn from the BOOK palette so the cast belongs to the
  // same film as the backdrops, but spread far enough apart that five people on
  // one stage never read as a uniform.
  const garments = [
    PAL.red,
    darken(PAL.gold, 0.22),
    darken(PAL.ink, 0),
    lighten(PAL.ink, 0.42),
    darken(PAL.red, 0.34),
    lighten(PAL.red, 0.2),
    darken(PAL.gold, 0.4),
  ];

  // Lead presentation flips per book so the channel doesn't look like one series.
  const leadF = seed % 2 === 1;
  const roles = Object.keys(ROLE_SHAPE);
  const cast = {};
  const used = { outfit: new Set(), headwear: new Set(), hair: new Set() };

  // Draw without repeating inside a book: the whole point is five distinct
  // people, so a slot that comes back the same is re-drawn from the pool.
  const drawUnique = (pool, slot, s) => {
    for (let k = 0; k < pool.length + 4; k++) {
      const v = pick(pool, s + k * 17);
      if (v === "none" || !used[slot] || !used[slot].has(v)) {
        if (used[slot]) used[slot].add(v);
        return v;
      }
    }
    return pool[0];
  };

  roles.forEach((role, i) => {
    const s = seed + i * 131;
    const shape = ROLE_SHAPE[role];
    const gender = role === "protagonist" ? (leadF ? "f" : "m") : role === "foil" ? (leadF ? "m" : "f") : rnd(s + 3) > 0.5 ? "f" : "m";
    // Wardrobe pools are split by presentation: a shared set plus each side's
    // own. Without that the auto-cast produced a heavy male foil in a dress and
    // a bonnet with a bowtie — five distinct people, none of them coherent.
    const outfit = drawUnique(poolFor(W.outfits, gender), "outfit", s);
    const headwear = drawUnique(poolFor(W.headwear, gender), "headwear", s + 7);
    const hair = drawUnique(poolFor(W.hair, gender), "hair", s + 11);
    const suit = garments[(i * 2 + Math.floor(rnd(s + 5) * 3)) % garments.length];
    cast[role] = {
      name: ROLE_NOTE[role],
      role,
      variant: {
        skin: pick(SKINS, s + 19),
        hair: pick(HAIRS, s + 23),
        suit,
        shirt: i % 2 === 0 ? lighten(PAL.paper, 0.34) : "#FFFFFF",
        expression: "neutral",
        hairStyle: hair,
        glasses: W.glasses === false ? false : (role === "mentor" ? true : rnd(s + 29) > 0.78),
        beard: gender === "m" ? pick(W.beards, s + 31) : "none",
        gender,
        age: shape.age,
        outfit,
        headwear,
        accessory: pick(poolFor(W.accessory, gender), s + 37),
        build: shape.build,
        height: shape.height,
        headScale: shape.headScale,
        trim: darken(suit, 0.66),
        overlay: [],
      },
    };
  });

  return { world, label: W.label, cast };
}

/** A ready-made child variant, for a cast Claude authors by hand. */
function childVariant(base) {
  return { ...base, age: "child", height: 0.74, headScale: 1.2, build: "slight", beard: "none" };
}

module.exports = {
  castBook, detectWorld, childVariant, WORLDS,
  WORLD_NAMES: Object.keys(WORLDS),
};
