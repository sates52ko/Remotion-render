// storyboard.js prep: where the author chunks are cut.
// CHUNK BOUNDARIES (2026-10-20, plan P1): a fixed cut every `size` beats split one idea between two authors
// (burn 39|40: "that compass ... just spins uselessly" | "But for Luther, that spinning needle is his only tether").
// The cut now lands on a nearby MEANING TRANSITION inside size ± slack: never after a beat that does not end a
// sentence, never before a beat that opens with a continuation word; among the allowed cuts the one whose two sides
// share the fewest content words (a topic-shift opener counts as a shift), ties -> nearest to `size`. Deterministic.
// No allowed cut in the window -> the fixed cut, reported. The size bound stays: no chunk exceeds size + slack.
const CHUNK_STOP = new Set(("the a an and or but so of to in on at for with as is are was were be been it its this that these those we you they i " +
  "he she him her his their our your my me us them just like really very much more most about into from than then now here there what how " +
  "why who when which where not no yes can could would should will do does did have has had get got going okay right yeah mean know think " +
  "say said one also even still because if over out up down").split(" "));
const CONTINUES = /^\s*(and|but|so|because|which|who|whom|whose|that|or|then|yet|while|when|where|as|to|of|with|plus|nor|than|until|unless|since|although|though)\b/i;
const SHIFT_OPENER = /^\s*["“]?\s*(okay|ok|now|alright|all right|let's|let us|next|moving on|so let's|another|first|second|third|finally|here's|turning to)\b/i;
function chunkRanges(beats, size) {
  const slack = Math.max(4, Math.round(size * 0.2));
  const narr = (k) => String((beats[k] && (beats[k].narration || beats[k].text)) || "");
  const words = (from, to) => new Set(beats.slice(Math.max(0, from), Math.max(0, to)).flatMap((b, j) => narr(from + j).toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/)).filter((w) => w.length > 3 && !CHUNK_STOP.has(w)));
  const sentenceEnds = (k) => /[.!?]["'”’)\]]*\s*$/.test(narr(k).trim());
  const allowed = (c) => sentenceEnds(c - 1) && !CONTINUES.test(narr(c)) && !/^\s*[a-z]/.test(narr(c));
  const score = (c) => {
    const L = words(c - 2, c), R = words(c, c + 2);
    const inter = [...L].filter((w) => R.has(w)).length, uni = new Set([...L, ...R]).size || 1;
    return inter / uni - (SHIFT_OPENER.test(narr(c)) ? 0.15 : 0);
  };
  const chunks = [], moves = [];
  let start = 0;
  while (start < beats.length) {
    if (beats.length - start <= size + slack) { chunks.push([start, beats.length - 1]); break; }
    const fixed = start + size;
    let best = null;
    for (let c = start + size - slack; c <= start + size + slack; c++) {
      if (c <= start || c >= beats.length || !allowed(c)) continue;
      const sc = score(c), d = Math.abs(c - fixed);
      if (!best || sc < best.sc - 1e-9 || (Math.abs(sc - best.sc) <= 1e-9 && d < best.d)) best = { c, sc, d };
    }
    const cut = best ? best.c : fixed;
    if (cut !== fixed) moves.push({ fixed, at: cut, why: allowed(fixed) ? "a clearer topic shift nearby" : "the fixed cut split a sentence or an idea" });
    else if (!best) moves.push({ fixed, at: fixed, why: "no clean cut within ±" + slack + " — kept the fixed cut" });
    chunks.push([start, cut - 1]);
    start = cut;
  }
  return { chunks, moves };
}

module.exports = { chunkRanges };
