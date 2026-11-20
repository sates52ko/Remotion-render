#!/usr/bin/env node
/**
 * make-prompt.js — Step 0 of the book pipeline.
 *
 * Given a book (title/author/genre), generates a BESPOKE NotebookLM "Audio Overview"
 * customization prompt: a unique analytical thesis + structure so every video is
 * genuinely transformative (YPP-safe) and hooks hard in the first seconds.
 *
 * Usage:
 *   node scripts/make-prompt.js --title="Single Dad Dilemma" --author="Carla Sorensen" --genre=romance
 *   (optional) --minutes=40 --slug=<slug>
 *
 * Output: books/<slug>/prompt.notebooklm.md  (paste into NotebookLM → Audio Overview → Customize)
 * Style baked in: compact (fits NotebookLM's char limit), master-keynote storytelling,
 * strictly no fabrication, no AI signature / no "sources" mentions, English/US.
 */
const fs = require("fs");
const path = require("path");
const { rel, abs, ensureBookDir } = require("./lib/paths");
const { MODEL, ENDPOINT, USE_NVIDIA, stripThink } = require("./lib/llm");
const { analyzeEngineFromVtt } = require("./lib/vtt");

// ── ENGINE DECISION (Step 0 is the right place: the book's concept is fully known
//    here — we author the angle now — and the choice is audio/VTT-independent, so
//    deciding early lets us record it in book.json BEFORE any downstream work and
//    tell the user up front. make-book.js reads book.json.engine as the source of
//    truth and routes plan-vox vs plan-antidote accordingly.)
//
//    • Vox      → concepts carried by SPECIFIC REAL people / historical scenes /
//                 documentary realism (photoreal Flux cut-outs of nameable figures).
//    • Antidote → ABSTRACT / internal / psychological concepts with an "everyman"
//                 protagonist and no specific real people to depict (flat-vector
//                 rigged characters + kinetic typography, CPU-cheap).
//
//    This heuristic is only the CODED FALLBACK (same Claude-first split as the
//    angle): when Claude authors the book at Step 0 it passes an explicit
//    --engine=<vox|antidote> with a bespoke rationale. Antidote is the default.
// Vox = ONLY when depicting specific real people / documentary realism (biography,
// history, true-crime etc.). Everything else → Antidote (higher conversion, cheaper
// render, works for fiction + abstract + self-help). Fallback is Antidote.
// Historical fiction moved here: a period world (1789 Maine, Civil-War Concord)
// is exactly what photoreal shows and a vector rig flattens. Violent genres stay
// Vox but carry the Flux-filter warning (see VOX_FILTER_RISK).
const VOX_GENRES = new Set([
  "biography", "memoir", "history", "true-crime", "war", "sports",
  "historical fiction", "historical-fiction",
]);
const VOX_FILTER_RISK = new Set(["true-crime", "war"]);
const ANTIDOTE_GENRES = new Set([
  "psychology", "self-help", "selfhelp", "self help", "relationships", "romance",
  "spirituality", "mindfulness", "productivity", "parenting", "personal-development",
  "fiction", "literary fiction", "science fiction", "fantasy",
  "thriller", "mystery", "horror", "dystopian", "young adult", "ya",
  "philosophy", "finance", "business", "economics", "politics", "science",
  "health", "leadership", "classics", "classic", "classic literature",
  "literary", "poetry", "drama", "satire", "existentialism", "absurdism",
]);
function decideEngine(genre, title) {
  const g = String(genre).toLowerCase();
  if (VOX_GENRES.has(g))
    return { engine: "vox", rationale: `Genre "${g}" is carried by specific real people, historical scenes and documentary realism — photoreal Flux cut-outs of nameable figures (Vox) fit the concept.` +
      (VOX_FILTER_RISK.has(g) ? " RISK: violent scenes are refused by Flux (CONTENT_FILTERED) — confirm the key scenes can be shown as aftermath/symbol, else Antidote." : "") +
      " Provisional (genre only) — re-checked against the narration when the audio arrives (storyboard prep)." };
  if (ANTIDOTE_GENRES.has(g))
    return { engine: "antidote", rationale: `Genre "${g}" → Antidote: flat-vector rigged characters + kinetic typography (higher conversion, cheaper render). Override with --engine=vox if the book needs photoreal depictions of real people. Provisional (genre only) — re-checked against the narration when the audio arrives (storyboard prep).` };
  return { engine: "antidote", rationale: `No strong signal for "${g}"; defaulting to Antidote (higher conversion). Override with --engine=vox if the concept requires photoreal depictions of real people. Provisional (genre only) — re-checked against the narration when the audio arrives (storyboard prep).` };
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }),
);
// STEP 0 DONE? (2026-10-27) `--check --slug=<slug>`: the prompt is finished (book-specific, English, spine intact,
// written for the engine in book.json) — a scaffold is not Step 0 done. Read-only; exit 0 READY, 1 NOT READY.
if (args.check) {
  const { checkNotebookPrompt } = require("./lib/notebooklm-prompt-check");
  const slug = args.slug;
  if (!slug) { console.error("usage: node scripts/make-prompt.js --check --slug=<slug>"); process.exit(2); }
  let md = null, book = {};
  try { md = fs.readFileSync(abs.prompt(slug), "utf8"); } catch {}
  try { book = JSON.parse(fs.readFileSync(abs.manifest(slug), "utf8")); } catch {}
  if (!md) { console.error(`STEP 0 NOT READY ${slug}: no ${rel.prompt(slug)}`); process.exit(1); }
  const r = checkNotebookPrompt(md, { title: book.title || null, engine: book.engine || null, form: (book.form && book.form.key) || null });
  if (!book.engine) r.errors.push("book.json has no engine (Step 0 decides it)");
  const ok = r.errors.length === 0;
  console.log(`${ok ? "STEP 0 READY" : "STEP 0 NOT READY"} ${slug}: engine ${book.engine || "?"} (${book.engineDecidedBy || "?"})${book.engineOverride ? ` — override ${book.engineOverride.from}→${book.engineOverride.to}: ${book.engineOverride.why}` : ""} · paste block ${r.chars} chars`);
  for (const e of r.errors) console.log(`  ✗ ${e}`);
  for (const w of r.warnings) console.log(`  ⚠ ${w}`);
  // The book itself is only in NotebookLM: say whether this prompt was written from its answer or from memory.
  const briefPath = path.join(path.dirname(abs.manifest(slug)), "source-brief.md");
  if (fs.existsSync(briefPath)) {
    const b = require("./lib/source-brief").readBrief(fs.readFileSync(briefPath, "utf8"));
    console.log(`  ${b.ok ? "✓" : "⚠"} source brief: ${b.found}/10 headings${b.missing.length ? ` (missing: ${b.missing.join(", ")})` : ""}${b.pages ? ` · ${b.pages} pages` : ""}${b.pages && !book.pages ? " — pass --pages to make-prompt.js so the length follows the book" : ""}`);
  } else console.log(`  ⚠ no source brief (books/${slug}/source-brief.md): the prompt rests on what the agent remembers of the book — \`make-prompt.js --brief\` asks NotebookLM instead`);
  // a finished prompt names its parts: they are kept in book.json so the film's frame can print them (lib/narrative-form.js filmForm)
  if (ok && book.form && book.form.key) {
    const titles = require("./lib/narrative-form").partTitles((md.match(/```\r?\n([\s\S]*?)\r?\n```/) || [])[1]);
    if (titles.length >= 3 && JSON.stringify(titles) !== JSON.stringify(book.form.parts || [])) { book.form = { ...book.form, parts: titles }; fs.writeFileSync(abs.manifest(slug), JSON.stringify(book, null, 2) + "\n"); }
    console.log(`  ✓ form ${book.form.key}: ${titles.length} ${String(book.form.part || "part").toLowerCase()}(s) named — ${titles.slice(0, 3).join(" · ")}${titles.length > 3 ? " · …" : ""}`);
  }
  if (ok) console.log(`  → hand the operator ${rel.prompt(slug)} (its paste block) + the MP3 / VTT steps at its end`);
  process.exit(ok ? 0 : 1);
}
// SOURCE BRIEF: `--brief --title=… [--author=…] [--slug=…]` writes books/<slug>/notebooklm-brief.md — the question the
// operator pastes into the NotebookLM chat (lib/source-brief.js). No engine decision, no prompt yet.
if (args.brief) {
  if (!args.title || args.title === true) { console.error('usage: node scripts/make-prompt.js --brief --title="…" --author="…" [--slug=<slug>]'); process.exit(2); }
  const slug = args.slug || String(args.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  ensureBookDir(slug);
  const out = path.join(path.dirname(abs.manifest(slug)), "notebooklm-brief.md");
  fs.writeFileSync(out, require("./lib/source-brief").briefFile({ title: args.title, author: args.author === true ? "" : args.author || "", slug }));
  console.log(`✓ ${path.relative(path.join(__dirname, ".."), out)} — the operator pastes its block into the NotebookLM CHAT and returns the answer → save it as books/${slug}/source-brief.md`);
  process.exit(0);
}
const TITLE = args.title;
const AUTHOR = args.author || "";
const GENRE = (args.genre || "drama").toLowerCase();
const MINUTES = args.minutes || 50;
if (!TITLE) {
  console.error('Kullanım: node scripts/make-prompt.js --title="Kitap Adı" --author="Yazar" --genre=romance');
  process.exit(1);
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const SLUG = args.slug || slugify(TITLE);
const OUT = rel.prompt(SLUG);

// A fixed, COMPACT spine every prompt must contain — kept tight so the whole
// block fits NotebookLM's "Customize" character limit (long prompts get cut off
// mid-sentence). This is what keeps videos YPP-safe and retention-friendly;
// the LLM (or Claude, when no API key) fills in the book-specific angle.
// 2026-11-11, from the channel's own analytics (skill channel-analytics): the median film keeps 96 % of its viewers at
// 1 % of its length and 46 % at 2 % (~0:50); YouTube-search and home views last about a minute while Google / suggested
// views last 4-6. So the spine now states what the first minute must do (FIRST MINUTE), and — the root cause the
// visionless-10x audit named, narration that is "a topic to show" instead of "an event to stage" — asks the hosts to
// put one drawable picture under every beat (PICTURE FIRST, written for the engine). LENGTH was tightened to pay for
// the two blocks; its rules are unchanged.
// LENGTH follows the book (operator, 2026-11-11: never shorten; a 300+ page book may run past the hour). NotebookLM
// decides the real length — more beats and a higher floor are what move it.
const { pickOpening, parseOpening, validOpening, openingBlock } = require("./lib/opening-grammar");
// 2026-11-18 (YPP "generic or repetitive content"): the BODY is the book's own too — lib/narrative-form.js
const { FORMS, SPEECH, pickForm, validForm, formBlock, menu: formMenu } = require("./lib/narrative-form");
// … and the film's graphic hand (subtitles, name plates, typeface) — lib/book-skin.js
const { pickSkin, validSkin, parseSkin, describe: describeSkin } = require("./lib/book-skin");
function lengthTier(pages) {
  const n = Number(pages) || 0;
  // parts by the book's length. Measured 2026-11-18 (Dracula, 10 parts): 3.3 minutes per part → 33 minutes. The
  // operator's floor is 30 minutes for every book and an hour or more for a long one, so a standard book has 10 parts
  // (was 8: about 26 minutes at the measured rate), and each part now runs on two scenes (lib/narrative-form.js).
  if (n > 500) return { name: "epic", pages: n, target: "75-90", min: 70, beats: 14, perBeat: "6-7" };
  if (n > 300) return { name: "long", pages: n, target: "60-75", min: 55, beats: 12, perBeat: "5-7" };
  return { name: "standard", pages: n || null, target: "45-60", min: 45, beats: 10, perBeat: "4-6" };
}
/** The openings of the books made before this one, newest first — from every place a book record lives. */
function recentOpenings(slug) {
  const root = path.join(__dirname, ".."), parent = path.dirname(root), seen = new Map();
  const take = (file) => { try { const b = JSON.parse(fs.readFileSync(file, "utf8")); if (b.slug && b.slug !== slug && validOpening(b.opening) && !seen.has(b.slug)) seen.set(b.slug, b.opening); } catch {} };
  const booksIn = (r) => { try { for (const d of fs.readdirSync(path.join(r, "books"))) take(path.join(r, "books", d, "book.json")); } catch {} };
  booksIn(root);
  try { for (const d of fs.readdirSync(parent)) { const m = /^wt-book-(.+)$/.exec(d); if (m) take(path.join(parent, d, "books", m[1], "book.json")); } } catch {}
  booksIn(path.join(parent, "test"));
  return [...seen.values()].sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 8);
}
/** The skins of the books made before this one, newest first (same places as recentOpenings). */
function recentSkins(slug) {
  const root = path.join(__dirname, ".."), parent = path.dirname(root), seen = new Map();
  const take = (file) => { try { const b = JSON.parse(fs.readFileSync(file, "utf8")); if (b.slug && b.slug !== slug && validSkin(b.skin) && !seen.has(b.slug)) seen.set(b.slug, b.skin); } catch {} };
  const booksIn = (r) => { try { for (const d of fs.readdirSync(path.join(r, "books"))) take(path.join(r, "books", d, "book.json")); } catch {} };
  booksIn(root);
  try { for (const d of fs.readdirSync(parent)) { const m = /^wt-book-(.+)$/.exec(d); if (m) take(path.join(parent, d, "books", m[1], "book.json")); } } catch {}
  booksIn(path.join(parent, "test"));
  return [...seen.values()].sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 8);
}
/** The narrative forms of the books made before this one, newest first (same places as recentOpenings). */
function recentForms(slug) {
  const root = path.join(__dirname, ".."), parent = path.dirname(root), seen = new Map();
  const take = (file) => { try { const b = JSON.parse(fs.readFileSync(file, "utf8")); if (b.slug && b.slug !== slug && validForm(b.form) && !seen.has(b.slug)) seen.set(b.slug, b.form); } catch {} };
  const booksIn = (r) => { try { for (const d of fs.readdirSync(path.join(r, "books"))) take(path.join(r, "books", d, "book.json")); } catch {} };
  booksIn(root);
  try { for (const d of fs.readdirSync(parent)) { const m = /^wt-book-(.+)$/.exec(d); if (m) take(path.join(parent, d, "books", m[1], "book.json")); } } catch {}
  booksIn(path.join(parent, "test"));
  return [...seen.values()].sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 8);
}
const PICTURE_FIRST = {
  antidote: `PICTURE FIRST (this becomes animation): build every part on ONE physical thing and say it BEFORE its meaning — the object, who does what to it, what changes — and return to it when the part ends.`,
  vox: `PICTURE FIRST (this is illustrated with photoreal scenes): build every part on ONE scene a camera could photograph — a named person in a named place doing one thing — said BEFORE its meaning.`,
};
// Until 2026-11-18 every book got ONE spine here (cold open → thesis → setup → N beats → counterpoint → payoff) and one
// "Depth Engine" a–e: 46 prompts shared a median 40 % of their words and every film sounded built the same way. The
// body is now the book's own FORM (lib/narrative-form.js): what the film is, who the hosts are to each other, how a
// part is developed (five steps, so the length holds) and how it ends. FIRST MINUTE, PICTURE FIRST, LENGTH and the
// HARD RULES are what stays.
// LENGTH opens the paste block (2026-11-18): the first formed prompt had it last, in a shortened wording, and the
// recording came back at 17 minutes for a 60-75 target. It is the measured lever with the number of parts and the
// five-step development (a stated target alone gave 17 minutes once before), so it is said first, in full, and a
// prompt cut off by the Customize box cannot lose it.
const lengthBlock = (tier, form) => `LENGTH (target ${tier.target} minutes, minimum ${tier.min} — a recording under ${tier.min} minutes has FAILED): this is a LONG-FORM episode. ${tier.beats} ${FORMS[form].part.toLowerCase()}s, ${tier.perBeat} real minutes EACH — stay inside one until it has had its minutes. Earn them by TELLING MORE of the book, never by repeating: another scene told in full, a second example or number, a sharper objection. Do NOT signal an ending ("to wrap up", "in short") before the ending this form names.`;
const spineFor = (engine, opening, tier, form) => `
${formBlock(form, tier)}

${SPEECH}

HARD RULES:
- English only (US audience). Two hosts in real conversation, in the roles this form gives them.
- ONLY facts from the book and its well-documented cases. NEVER invent quotes, numbers, studies or events; if unsure, stay general.
- NEVER mention "sources", "notebook", "documents" or AI; never break character.
- No generic praise: names, concrete scenes, numbers.

${openingBlock(opening)}

${PICTURE_FIRST[engine] || PICTURE_FIRST.antidote}
`.trim();

async function llmAngle() {
  const sys = `You design original analytical angles for a book-analysis podcast. Return STRICT JSON with keys:
- "thesis": one sharp, arguable thesis about the book (a claim, not a summary) — the spine of the whole discussion.
- "hook": the exact opening line the hosts should start on (provocative, mid-thought, under 25 words).
- "lens": the analytical lens (e.g. "structural craft", "power dynamics", "trauma and control", "genre subversion", "economics of the world") — pick one that fits THIS book and is not the obvious take.
- "beats": 8 SHORT beat descriptions (one tight sentence each — keep the whole prompt compact enough to fit NotebookLM's character limit), each a distinct specific claim to argue (not plot events), grounded in a real, concrete case/number from the book (never invented). 8 beats is required so the discussion reliably runs 45+ minutes without padding.
- "counterpoint": one honest criticism or tension worth raising.
- "closer": a reframing final line concept.
Make the angle SPECIFIC to this book and non-generic — it should be impossible to reuse for a different book.`;
  const user = `Book: "${TITLE}"${AUTHOR ? " by " + AUTHOR : ""}. Genre: ${GENRE}.\nReturn ONLY the JSON object.`;
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0.85,
      max_tokens: 2000,
    }),
  });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const j = await resp.json();
  const txt = stripThink(j.choices?.[0]?.message?.content);
  const a = txt.indexOf("{"), b = txt.lastIndexOf("}") + 1;
  if (a < 0 || b <= a) throw new Error("no JSON in response");
  return JSON.parse(txt.slice(a, b));
}

(async () => {
  // ── ENGINE DECISION FIRST (it shapes the prompt) ──────────────────────────
  // The engine is decided BEFORE the angle is authored, because it changes HOW
  // the prompt should be written: Vox wants beats built on specific real people
  // and documentary scenes (photoreal cut-outs); Antidote wants abstract/everyman
  // beats a vector rig can portray. Claude passes --engine + --engine-why; else
  // the coded heuristic decides. Recorded in book.json (pipeline source of truth).
  ensureBookDir(SLUG);

  // VTT-based engine analysis (STRONGEST signal — actual content, not just genre label)
  const vttPath = [abs.vtt(SLUG), `public/captions/${SLUG}.vtt`]
    .find((p) => fs.existsSync(p));
  const vttSignal = vttPath ? analyzeEngineFromVtt(fs.readFileSync(vttPath, "utf8")) : null;

  // BOOK PROFILE — the Step 0 decision. There is normally NO VTT here: this prompt
  // produces the audio, and the prompt is written FOR the engine, so the recording
  // inherits the choice. Claude knows the book; it states the facts that decide
  // the engine (lib/engine-fit.js analyzeBookProfile) instead of a genre label.
  //   --profile='{"kind":"fiction","world":"contemporary","era":2014,"realPeople":false,
  //               "format":"story","violence":"central","mustSee":["...","..."]}'
  //   (or --profile=<path to a JSON file>)
  const { analyzeBookProfile, validateProfile } = require("./lib/engine-fit");
  let profile = null, profileFit = null;
  if (args.profile) {
    try {
      const raw = fs.existsSync(args.profile) ? fs.readFileSync(args.profile, "utf8") : args.profile;
      profile = JSON.parse(raw);
    } catch (e) { console.error(`❌ --profile is not valid JSON: ${e.message}`); process.exit(1); }
    const errs = validateProfile(profile, { strict: true }); // a NEW decision: the 2026-10-29 fields that matter for this book are required
    if (errs.length) { console.error(`❌ --profile: ${errs.join("; ")}`); process.exit(1); }
    profileFit = analyzeBookProfile(profile);
  }

  // Every agent decides the same way: a profile (compared against
  // data/engine-profile-examples.json) or an explicit, justified engine. The genre
  // label alone decided "fiction → Antidote" for a WWII period novel.
  if (!profile && !(args.engine && args["engine-why"]) && !args["genre-only"]) {
    console.error(`❌ Step 0 needs the book profile (the audio will be recorded for the engine it picks).`);
    console.error(`   --profile='{"kind":"fiction|nonfiction","world":"real-historical|period|contemporary|speculative|ideas","era":1944,`);
    console.error(`              "realPeople":false,"format":"story|argument|mixed","violence":"none|some|central","minorHarm":false,"mustSee":["…","…","…"]}'`);
    console.error(`   Rubric + reference books: data/engine-profile-examples.json · skill: .claude/skills/notebooklm-prompt`);
    console.error(`   (or --engine=<vox|antidote> --engine-why="…"; --genre-only only when the book is truly unknown)`);
    process.exit(1);
  }

  let picked;
  if (args.engine) {
    picked = { engine: String(args.engine).toLowerCase(), rationale: args["engine-why"] || "Set explicitly by Claude at authoring time." };
    // An agent may decide against the rubric — that is ITS decision (the operator is never asked to pick the engine),
    // but it must be explainable: a real argument, recorded next to what the rubric said (book.json engineOverride).
    if (profileFit && profileFit.pick !== picked.engine && String(args["engine-why"] || "").trim().length < 40) {
      console.error(`❌ --engine=${picked.engine} overrides the rubric's ${profileFit.pick} (${profileFit.reasons.join("; ")}).`);
      console.error(`   Re-check the profile fields first (a wrong field is fixed, not overridden). If they are right, give the capability argument: --engine-why="<which mustSee items this engine can show and the other cannot>" (≥ 40 chars).`);
      process.exit(1);
    }
    if (profileFit && profileFit.pick !== picked.engine && profileFit.confidence === "strong") {
      console.warn(`\n⚠  The book profile points strongly to ${profileFit.pick.toUpperCase()} (${profileFit.reasons.join("; ")}), but --engine=${picked.engine}.`);
      console.warn(`   The audio will be recorded for ${picked.engine.toUpperCase()} — make sure that is intended.\n`);
    }
    // Warn if agent's choice contradicts strong VTT signal
    if (vttSignal && vttSignal.confidence === "strong" && vttSignal.pick !== picked.engine) {
      console.warn(`\n⚠  UYARI: VTT analizi ${vttSignal.pick.toUpperCase()} diyor (güçlü sinyal: ${vttSignal.antidoteScore} vs ${vttSignal.voxScore})`);
      console.warn(`   ama --engine=${picked.engine} geçildi. Emin misin? VTT gerçek içerik sinyalidir, genre etiketi değil.`);
      console.warn(`   İptal: --engine kaldır, VTT sinyaline güven.\n`);
    }
  } else if (profileFit) {
    picked = { engine: profileFit.pick, rationale: `Book profile (${profileFit.confidence}): ${profileFit.reasons.join("; ")}` +
      (profileFit.risks.length ? ` RISK: ${profileFit.risks.join("; ")}` : "") };
  } else if (vttSignal && vttSignal.confidence !== "weak") {
    // VTT signal overrides genre heuristic (it reads the ACTUAL content)
    // lib/engine-fit.js explains itself: what the viewer must see, and the risks.
    const rationale = `Narration fit (${vttSignal.confidence}): ${vttSignal.reasons.join("; ")}` +
      (vttSignal.risks.length ? ` RISK: ${vttSignal.risks.join("; ")}` : "");
    picked = { engine: vttSignal.pick, rationale };
  } else {
    // No VTT or weak signal → fall back to genre heuristic
    picked = decideEngine(GENRE, TITLE);
    if (vttSignal) picked.rationale += ` (VTT sinyali zayıf: ${vttSignal.antidoteScore} vs ${vttSignal.voxScore}, genre heuristiği kullanıldı.)`;
  }

  if (!["vox", "antidote"].includes(picked.engine)) {
    console.error(`❌ Bilinmeyen engine "${picked.engine}" — sadece: vox | antidote`);
    process.exit(1);
  }
  const manifestPath = abs.manifest(SLUG);
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch {}
  // cycle 18: the audio inherits the engine it was recorded for (CLAUDE.md "Step 0 decides the engine"). Once the
  // NotebookLM audio is in, switching the engine needs a new prompt AND a new recording — the operator's decision, so a
  // switch here is refused unless their words are recorded (a book's engine was flipped vox → antidote after recording).
  const audioIn = ["mp3", "m4a"].some((x) => fs.existsSync(path.join(__dirname, "..", "public", "audio", `${SLUG}.${x}`)));
  if (manifest.engine && manifest.engine !== picked.engine && audioIn) {
    const ok = typeof args["operator-approved"] === "string" && args["operator-approved"].trim();
    if (!ok) {
      console.error(`❌ ${SLUG}: the audio was recorded for engine "${manifest.engine}" — switching to "${picked.engine}" means a new prompt and a new recording. Operator decision only: re-run with --operator-approved="<the operator's words>" (and record the new audio).`);
      process.exit(2);
    }
    manifest.engineSwitchAfterAudio = [...(manifest.engineSwitchAfterAudio || []), { from: manifest.engine, to: picked.engine, at: new Date().toISOString(), operator: String(args["operator-approved"]).trim() }];
  }
  manifest = { slug: SLUG, title: TITLE, author: AUTHOR, genre: GENRE, ...manifest,
    engine: picked.engine, engineRationale: picked.rationale,
    // what the decision rested on — the outcomes ledger learns from Step 0 features
    engineDecidedBy: args.engine ? "claude-explicit" : profileFit ? "book-profile" : (vttSignal && vttSignal.confidence !== "weak") ? "vtt" : "genre-provisional",
    ...(profile ? { engineProfile: profile } : {}),
    // what the rubric said, always — so an override is visible and explainable later (never silently replaced)
    engineRubric: profileFit ? { pick: profileFit.pick, confidence: profileFit.confidence, voxScore: profileFit.voxScore, antidoteScore: profileFit.antidoteScore, reasons: profileFit.reasons, risks: profileFit.risks } : undefined,
    engineOverride: profileFit && args.engine && profileFit.pick !== picked.engine ? { from: profileFit.pick, to: picked.engine, why: String(args["engine-why"]) } : undefined,
    // New books get the per-book palette-tinted background by default (Vox). Existing
    // books lack this field → plain shared background, so they look unchanged.
    bgTint: manifest.bgTint ?? true };
  // The opening is this book's own (lib/opening-grammar.js): chosen once, farthest from the last 8 books, kept on a re-run.
  const TIER = lengthTier(args.pages || manifest.pages);
  if (TIER.pages) manifest.pages = TIER.pages;
  const asked = args.opening ? parseOpening(args.opening) : null;
  if (args.opening && !asked) { console.error(`❌ --opening="${args.opening}" — use hook/naming/promise from scripts/lib/opening-grammar.js`); process.exit(1); }
  const kind = (profile && profile.kind) || (manifest.engineProfile && manifest.engineProfile.kind) || null;
  const OPENING = asked || (validOpening(manifest.opening) && !args.reopen ? manifest.opening : pickOpening({ slug: SLUG, kind, recent: recentOpenings(SLUG) }));
  manifest.opening = { hook: OPENING.hook, naming: OPENING.naming, promise: OPENING.promise, at: (manifest.opening && !args.reopen && !asked && manifest.opening.at) || new Date().toISOString(), by: asked ? "agent" : "opening-grammar" };
  // The FORM of the body is this book's own too (lib/narrative-form.js): the agent chooses it from the book
  // (--form=<key> --form-why="…"), else the one that fits the kind and is farthest from the last 8 books; kept on a re-run.
  if (args.form && !FORMS[String(args.form)]) { console.error(`❌ --form="${args.form}" — one of:\n   ${formMenu(kind).join("\n   ")}`); process.exit(1); }
  if (args.form && String(args["form-why"] || "").trim().length < 30) { console.error(`❌ --form=${args.form} needs --form-why="<what in THIS book makes it a ${FORMS[args.form].label}>" (≥ 30 chars) — the form is chosen from the book, not from a list`); process.exit(1); }
  const keptForm = validForm(manifest.form) && !args.reform && !args.form ? manifest.form.key : null;
  const FORM = args.form ? String(args.form) : keptForm || pickForm({ slug: SLUG, kind, recent: recentForms(SLUG) });
  manifest.form = { key: FORM, part: FORMS[FORM].part, at: (keptForm && manifest.form.at) || new Date().toISOString(), by: args.form ? "agent" : (keptForm && manifest.form.by) || "narrative-form", ...(args.form ? { why: String(args["form-why"]).trim() } : keptForm && manifest.form.why ? { why: manifest.form.why } : {}), ...(keptForm && Array.isArray(manifest.form.parts) ? { parts: manifest.form.parts } : {}) };
  // The film's graphic hand (lib/book-skin.js): chosen once, farthest from the last 8 books, kept on a re-run.
  const askedSkin = args.skin ? parseSkin(args.skin) : null;
  if (args.skin && !askedSkin) { console.error(`❌ --skin="${args.skin}" — caption/plate/font from scripts/lib/book-skin.js (e.g. paper/sharp/serif)`); process.exit(1); }
  const SKIN = askedSkin || (validSkin(manifest.skin) && !args.reskin ? manifest.skin : pickSkin({ slug: SLUG, recent: recentSkins(SLUG) }));
  manifest.skin = { caption: SKIN.caption, plate: SKIN.plate, font: SKIN.font, at: (manifest.skin && !args.reskin && !askedSkin && manifest.skin.at) || new Date().toISOString(), by: askedSkin ? "agent" : "book-skin" };
  // the producer's own view of the book (operator's words, optional): the hosts argue with a real reader, not only with each other
  if (typeof args.take === "string" && args.take.trim()) manifest.take = { text: args.take.trim(), at: new Date().toISOString() };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const source = args.engine ? "Claude, açık" : profileFit ? "kitap profili" : (vttSignal && vttSignal.confidence !== "weak") ? "VTT analizi" : "genre heuristik (GEÇİCİ)";
  if (!args.engine && !profileFit) {
    console.warn(`\n⚠  Motor yalnızca tür etiketinden seçildi. Ses kaydı BU motor için yazılan prompt'la üretilecek —`);
    console.warn(`   sonradan değiştirmek yeni prompt + yeni ses + yeni VTT demek. Claude: kitabı bildiğin için profili yaz ve tekrar çalıştır:`);
    console.warn(`   --profile='{"kind":"fiction|nonfiction","world":"real-historical|period|contemporary|speculative|ideas","era":1900,`);
    console.warn(`              "realPeople":false,"format":"story|argument|mixed","violence":"none|some|central","mustSee":["…","…","…"]}'\n`);
  }
  console.log(`🎬 ENGINE KARARI → ${picked.engine.toUpperCase()} (${source})`);
  if (vttSignal) console.log(`   VTT skor: Antidote ${vttSignal.antidoteScore} vs Vox ${vttSignal.voxScore} (${vttSignal.confidence}) [${vttSignal.words} kelime]`);
  console.log(`   gerekçe: ${picked.rationale}`);
  console.log(`   (değiştir: --engine=${picked.engine === "vox" ? "antidote" : "vox"} --engine-why="...")`);
  console.log(`   → prompt'u bu motora göre yaz: ${picked.engine === "vox"
    ? "gerçek/isimlendirilebilir figürler + belgesel sahneler (Flux cut-out'a uygun)"
    : "soyut/everyman beat'ler (vektör rig gerçek kişi canlandıramaz)"}\n`);
  const ENGINE = picked.engine;
  console.log(`🎬 AÇILIŞ → ${OPENING.hook} / ${OPENING.naming} / ${OPENING.promise}  (son 8 kitaptan en uzak; değiştir: --opening=hook/naming/promise veya --reopen)`);
  console.log(`🎭 BİÇİM → ${FORM} (${FORMS[FORM].label}; ekranda "${FORMS[FORM].part} n / N")  ${manifest.form.by === "agent" ? "— ajan kitaptan seçti" : "— kitabın türüne uyan, son 8 kitaptan en uzak biçim"}`);
  if (manifest.form.by !== "agent") console.log(`   Kitaba bak ve uygun olanı SEN seç (--form=<key> --form-why="…"):\n   ${formMenu(kind).join("\n   ")}`);
  console.log(`🎨 GÖRÜNÜM → ${SKIN.caption}/${SKIN.plate}/${SKIN.font} (${describeSkin(SKIN)}) — son 8 kitaptan en uzak; değiştir: --skin=caption/plate/font veya --reskin`);
  console.log(manifest.take ? `🗣  YAPIMCININ GÖRÜŞÜ prompt'a yazıldı.` : `🗣  Yapımcının kendi görüşü yok (isteğe bağlı): --take="<operatörün kitap hakkında 2-5 cümlesi: nerede katılmıyor, neyi fazla buldu>"`);
  console.log(`⏱  UZUNLUK → ${TIER.target} dk, ${TIER.beats} beat${TIER.pages ? ` (${TIER.pages} sayfa)` : " (sayfa sayısı verilmedi: --pages=<n>; 300+ sayfa 60-75, 500+ sayfa 75-90 dk)"}
`);

  // Claude-first: the bespoke angle is authored by Claude directly (sharper &
  // more book-specific than llama). The NVIDIA path is dormant unless opted in
  // with USE_NVIDIA=1. When neither runs, we write the scaffold and Claude fills
  // in the angle (see the "AUTHOR" banner below).
  let angle = null;
  if (USE_NVIDIA) {
    for (let i = 1; i <= 3 && !angle; i++) {
      try { angle = await llmAngle(); } catch (e) { console.warn(`  angle attempt ${i} failed: ${e.message}`); }
    }
  }

  const body = angle
    ? `THE ANGLE (this is what makes this episode unique):
- Lens: ${angle.lens}
- Thesis to prove: ${angle.thesis}
- Open on this idea: "${angle.hook}"

THE ${FORMS[FORM].part}S OF THIS BOOK (one each, in order):
${(angle.beats || []).map((b, i) => `${i + 1}. ${b}`).join("\n")}

THE HONEST CRITICISM TO ARGUE: ${angle.counterpoint}

THE ENDING: ${angle.closer}`
    : `THE ANGLE:
- Build the discussion around one arguable thesis about how "${TITLE}" works as ${GENRE}, not a summary.`;

  const prompt = `You are two hosts doing a deep, original analysis of "${TITLE}"${AUTHOR ? ` by ${AUTHOR}` : ""}.

${lengthBlock(TIER, FORM)}

${body}

${manifest.take ? `A REAL READER'S VIEW (the producer of this film read the book and thinks this — one host brings it up as "a reader told us", and both argue with it honestly; do not flatter it):\n"${manifest.take.text}"\n\n` : ""}${spineFor(ENGINE, OPENING, TIER, FORM)}`;

  const md = `# NotebookLM prompt — ${TITLE}${AUTHOR ? " (" + AUTHOR + ")" : ""}

**Slug:** \`${SLUG}\` · **Genre:** ${GENRE} · **Engine:** ${ENGINE} · **Target:** ${TIER.target} min · **Opening:** ${OPENING.hook}/${OPENING.naming}/${OPENING.promise} · **Form:** ${FORM} · **Market:** US (English)

**Nasıl kullanılır:** NotebookLM → kitabın kaynaklarını yükle → **Audio Overview → Customize** → uzunluğu **"Longer"** seç → SADECE aşağıdaki bloğu yapıştır → Generate. (Blok kompakt tutuldu ki karakter limitinde kesilmesin. Ses **30 dakikayı geçiyorsa yeterlidir** (operatör kararı, 2026-11-18: 30 dk üstü her kayıt kabul; daha uzunu için uğraşılmaz); **30 dk'nın altına düşerse** tekrar üret — prompt ${TIER.beats} ${FORMS[FORM].part.toLowerCase()} + beş adımlı geliştirme ile ${TIER.target} dk hedefler. Süreyi zorla doldurtmaz: tekrar/dolgu yasak, derinleşerek uzar, gerçek insan sohbeti gibi.)

\`\`\`
${prompt}
\`\`\`

---
## Sonraki adımlar
1. Sesi **MP3** olarak indir → \`public/audio/${SLUG}.mp3\` (.m4a da çalışır, ama uzun bir kitapta GitHub'ın 100 MB dosya sınırını aşabilir; o zaman render worker'ları reddeder)
2. Videoyu YouTube'a (unlisted) yükle → otomatik altyazıyı **kelime zaman damgalı VTT** olarak indir → \`public/captions/${SLUG}.vtt\`
3. Bu oturumda yaz: **"dosyalar hazır, preview hazırla"** (skill \`preview-hazirla\`: kitabın kendi worktree'si, storyboard, kapılar, kör sessiz test). Final render ayrı, operatör onaylı bir adım.
`;

  fs.writeFileSync(OUT, md);
  console.log(`✓ ${OUT}`);
  console.log(`✓ ${rel.manifest(SLUG)} (engine: ${ENGINE})`);

  if (angle) {
    console.log(`  angle: NVIDIA/${MODEL} · lens: ${angle.lens}\n  thesis: ${String(angle.thesis).slice(0, 100)}...`);
  } else {
    console.log(`\n⚠  STEP 0 IS NOT DONE — this is a SCAFFOLD (\`node scripts/make-prompt.js --check --slug=${SLUG}\` says NOT READY until the angle is written).`);
    console.log(`⚠  AÇI YAZILMADI (scaffold) — CLAUDE ŞİMDİ YAZMALI (tercih edilen, en kaliteli yol):`);
    console.log(`   ${OUT} içindeki bloğu, kitaba özgü açıyla YENİDEN yaz:`);
    console.log(`     • non-obvious lens + tek arguable thesis + mid-thought cold-open`);
    console.log(`     • BİÇİM ${FORM} (${FORMS[FORM].label}): "THE ${FORMS[FORM].part}S OF THIS BOOK" altına ${TIER.beats} numaralı ${FORMS[FORM].part.toLowerCase()} yaz (her biri kitaptan somut sahne/kanıt/sayı), dürüst eleştiriyi ve bu biçimin bitişini kitabın kendi içeriğiyle yaz; iki sunucunun bu kitaptaki rollerini adlandır`);
    console.log(`     • FIRST MINUTE bu kitaba özgü seçildi (${OPENING.hook}/${OPENING.naming}/${OPENING.promise}): OPEN / NAME IT / PROMISE satırlarının altına kitabın KENDİ sahnesini, cümlesini ve vaadini yaz`);
    console.log(`     • PICTURE FIRST: her beat'in altına çizilebilir TEK resim yaz (nesne, kim ne yapıyor, ne değişiyor) — kitabın kendi sahnesinden`);
    console.log(`     • THE FORM / HOW EACH … IS DEVELOPED / SPEECH + LENGTH blokları korunur (${TIER.min} dk floor, ${TIER.target} hedef; dolgu/tekrar YOK, derinleşerek uzar), tam İngilizce, ~2.5–3.5k char`);
    console.log(`     • MOTORA GÖRE (${ENGINE}): ${ENGINE === "vox"
      ? "beat'leri gerçek/isimlendirilebilir figürler + belgesel sahneler üzerine kur (Flux cut-out'a uygun)"
      : "beat'leri soyut/everyman durumlar üzerine kur (vektör rig gerçek kişi canlandıramaz)"}`);
    console.log(`   (Modeli uyandırmak istersen: USE_NVIDIA=1 node scripts/make-prompt.js ...)`);
  }
})();
