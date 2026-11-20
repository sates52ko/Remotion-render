// authoring-integrity.js — REVIEW_REQUIRED signals for authored beats that pass merge by FORM but may not be real
// visual authoring (2026-10-29). Never a problem, never a FAIL, never a gate: merge prints them as warnings and records
// them in storyboard/merge-report.json; readcheck (Antidote) reads every beat blind and says which flagged beats were
// actually misread — a confirmed WRONG goes to the normal fix round (runbook §2b), a CORRECT read clears the flag.
//
// Why: the-magician-s-nephew (Vox, 261 beats), 2026-10-29 — after merge refused empty fields, all seven authored files
// were rewritten in 27 s: 56 empty onScreenText filled with the emphasis words, 4 missing concreteVisual filled with the
// claim ("Question card asking …" = the claim sentence). Merge then PASSED; nothing showed the 60 beats were never drawn.
// Lexical copies alone are NOT a signal: their-eyes-were-watching-god's own authors set onScreenText = emphasis on
// 176/323 beats on purpose. So the strongest signal is PROVENANCE — a field merge refused as missing, then filled with a
// copy of another field — and the others are narrow shapes (a claim restated as the "picture", a placeholder picture
// on a beat that does have a picture, the callout as the only carrier repeating the narration, words shown before
// they are said).
// Calibrated on 39 Antidote books' blind mute verdicts (2,680 stills, 2026-10-29): unflagged ADDS 63% / TEXT_ONLY 25% /
// WRONG 10%; ECHO_ONLY_CARRIER (n 127) ADDS 39% / TEXT_ONLY 45% / WRONG 6%; EARLY_TEXT (n 24) ADDS 38% / TEXT_ONLY 46% /
// WRONG 21%. Real signals, not verdicts: many flagged stills still read fine — hence REVIEW, never FAIL.

const STOP = new Set("the a an and or but of to in on at for with from by as is are was were be been it its this that these those he she they them his her their you your we our i me my not no so if then than into out up down over just very really about what which who whom how when where why there here all any some more most also can could would should will shall do does did has have had".split(" "));
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
const jaccard = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let n = 0; A.forEach((x) => B.has(x) && n++); return n / (A.size + B.size - n); };
// a "picture" that names no picture
const PLACEHOLDER = /^(text( only| statement| list only)?( on [\w ]+)?|quoted line|a plain transition card|n\/?a|tbd|todo|\.{1,3}|-)\.?$/i;
const CARD_OF_CLAIM = /^(a |an )?(quote|question|title|text|statement) card (stating|asking|saying|that|with)\b/i;
const QUIET = new Set([undefined, null, "idle", "talk", "think", "point"]);
const STANDING = new Set(["slump", "idle", "talk", "think", "point", "celebrate", "hold", "reach", "walk"]);
const BODY_EVENT = /\b(fell (down|over|off|to|onto)|falls? (down|over|off|to the (floor|ground))|falling (down|off|to the)|trip(s|ped)? (over|on) (a|the)\b|(is|was|gets|got|been) (pushed|shoved|knocked|thrown|slammed)|knock(s|ed)? (him|her|them|me|you) (down|over|out)|faint(s|ed)\b|collaps(es|ed) (on|to|onto) the|(lies|lying|lay) (on|in) the (floor|ground|lawn|ice|snow|street|grass)|(is|was|knocked) out cold|thrown to the)/i;
const BODY_FIGURATIVE = /\b(fall(s|ing)? (in love|into (a |deep )?depression|apart)|fell (in love|apart|asleep|silent)|trips? over (his|her|their|my|your) words)\b/i;

function fieldsOf(a, engine) {
  if (!a) return null;
  if (engine === "vox") {
    const d = a.design || {};
    const sb = d.storyboard || a.storyboard || {};
    return { sb, screen: [sb.onScreenText, d.kicker].filter((x) => x && norm(x) !== "none"), copies: [d.kicker, (d.emphasis || []).join(" "), sb.claim].filter(Boolean),
      hasPicture: !!((d.image && d.image.subject) || d.compare), stageCarries: true, callout: null };
  }
  const sb = a.storyboard || {};
  const cast = Array.isArray(a.cast) ? a.cast : null;
  const lone = !cast || cast.length <= 1;
  return { sb, screen: [a.callout && a.callout.text].filter(Boolean), copies: [a.callout && a.callout.text, sb.claim].filter(Boolean),
    hasPicture: !!(a.concept || a.diagram || (cast && cast.length) || a.holds),
    stageCarries: !!(a.concept || a.diagram || a.holds || a.stageRelationship || (cast && cast.length >= 2) || (cast && cast.length === 1 && !QUIET.has(a.action))),
    callout: a.callout && a.callout.text, lone };
}

// beats: [{i, narration}] in order; authored: Map(i -> authored beat); prev: the previous merge-report (or null)
function integrityReview({ beats, authored, engine, prev }) {
  const out = [];
  const add = (i, code, field, why) => out.push({ i, code, field, why, signal: "REVIEW_REQUIRED" });
  // provenance: which fields did the LAST merge refuse as missing?
  const refused = new Map(); // i -> Set(field)
  for (const it of (prev && prev.items) || []) {
    const m = /^storyboard\.(\w+) missing/.exec(it.msg || "");
    if (m && it.i != null) { if (!refused.has(it.i)) refused.set(it.i, new Set()); refused.get(it.i).add(m[1]); }
  }
  beats.forEach((e, k) => {
    const a = authored.get(e.i), F = fieldsOf(a, engine);
    if (!F) return;
    const { sb } = F;
    // 1. filled after a refusal with a copy / a placeholder (the gate-filling pattern)
    for (const field of refused.get(e.i) || []) {
      const v = sb[field];
      if (!v) continue;
      // the other fields it may have been copied from (never the field itself: a refused claim is not "a copy of the claim")
      const others = F.copies.filter((x) => !(field === "claim" && x === sb.claim));
      const copy = others.find((x) => norm(x) && (norm(x) === norm(v) || (words(v).length >= 2 && jaccard(x, v) >= 0.8)));
      if (copy != null || PLACEHOLDER.test(String(v).trim()) || CARD_OF_CLAIM.test(String(v).trim()))
        add(e.i, "FILLED_AFTER_REFUSAL", field, `merge refused storyboard.${field} as missing; it is now "${String(v).slice(0, 60)}"${copy != null ? ` — a copy of "${String(copy).slice(0, 40)}"` : " — a placeholder"}, not an authored ${field === "concreteVisual" ? "picture" : "line"}`);
    }
    const cv = String(sb.concreteVisual || "").trim();
    // 2. a beat that stages a PICTURE whose "picture" is a card restating the claim. A text-led beat described as a
    // card is honest (their-eyes 3 "Text card with the thesis"), and so is a diagram described by its labels (TFS 184
    // "Flow: hard question then easy question") — word overlap with the claim flagged both, so it is not used.
    if (cv && F.hasPicture && CARD_OF_CLAIM.test(cv))
      add(e.i, "VISUAL_IS_CLAIM", "concreteVisual", `concreteVisual restates the claim ("${cv.slice(0, 60)}") — name what is DRAWN (who, what, where), or say the beat is text-led`);
    // 3. a placeholder picture on a beat that has a picture
    else if (cv && PLACEHOLDER.test(cv) && F.hasPicture)
      add(e.i, "PLACEHOLDER_VISUAL", "concreteVisual", `concreteVisual "${cv}" but the beat stages a picture — describe it, so the reviewer can check it against the narration`);
    // 4. Antidote: the callout is the only carrier and repeats the narration
    if (engine !== "vox" && F.callout && !F.stageCarries) {
      const c = norm(F.callout);
      if (words(F.callout).length >= 3 && norm(e.narration).includes(c))
        add(e.i, "ECHO_ONLY_CARRIER", "callout", `the callout "${F.callout}" repeats the narration and nothing else on screen carries the meaning (lone ${a.action || "figure"}, no object/icon/diagram) — text-carried`);
    }
    // 5. Antidote: the narration says a BODY falls / faints / is pushed / lies on the floor, the staged body stands
    // (P3 push/fall, 2026-10-29). 93 configs: 15 such beats, ~half real (wonder 30 fainted, fahrenheit-451 250 thrown,
    // under-the-dome 26 pushed to the floor, crime-and-punishment 92 falls to the floor) and half hypothetical or about
    // someone off stage — a review pointer, never a verdict; the blind readcheck now sees the drawn body, not its name.
    if (engine !== "vox" && a.cast && a.cast.length && STANDING.has(a.action || "idle") && BODY_EVENT.test(e.narration) && !BODY_FIGURATIVE.test(e.narration))
      add(e.i, "BODY_EVENT_STANDING", "action", `the narration says "${(e.narration.match(BODY_EVENT) || [""])[0]}" but the staged body is "${a.action || "idle"}" (standing) — a literal fall is \`falling\`, down on the floor is \`collapsed\` (+ continue), a push puts \`falling\` on the one pushed; keep it standing only if the event is hypothetical or happens to someone not on screen`);
    // 6. words on screen before the narration says them (an early result)
    for (const s of F.screen) {
      const W = [...new Set(words(s))];
      if (W.length < 2) continue;
      const here = new Set(words([beats[k - 2], beats[k - 1], e].filter(Boolean).map((b) => b.narration).join(" ")));
      const miss = W.filter((w) => !here.has(w));
      if (miss.length < 2 || miss.length < W.length / 2) continue;
      const ahead = beats.slice(k + 1, k + 4);
      const j = ahead.find((b) => { const A = new Set(words(b.narration)); return miss.every((w) => A.has(w)); });
      if (j) add(e.i, "EARLY_TEXT", engine === "vox" ? "onScreenText" : "callout", `"${s}" shows "${miss.join(" ")}" before the narration says it (beat ${j.i}) — move the text to that beat or use this beat's words`);
    }
  });
  return out;
}

module.exports = { integrityReview, jaccard, PLACEHOLDER, CARD_OF_CLAIM };
