/**
 * causal.ts — MECHANISM 2.0: a CAUSAL CHAIN built from the narration (antidote-10x, 2026-10-28).
 *
 * The first mechanism (mechanism.ts) explains ONE shape of cause: an outcome stacked from factors that stay / are drawn
 * again. The commonest explanation in the mute corpus is a different shape — a psychological or physical CHAIN:
 * start → trigger → intermediate mechanism → change → result (n80 psychological cause→effect + n33 behavioural loops
 * of 202 mechanism beats, 2026-10-28 sweep: WRONG 20, dead 47, TEXT_ONLY 64 — a face with the key word). This draws it:
 *
 *   STATIONS   2..5 pictograms in CAUSAL order, left → right, each appearing ON the word that says it. The narration
 *              often says the result first and explains it after ("the men were more likely to call … why? because …"):
 *              a station said early is drawn early and every station between two drawn ones is a dashed "?" slot —
 *              the viewer sees there is a WHY still missing (temporal causal graph: causal order ≠ spoken order).
 *   TOKEN      the one thing that is CARRIED through the chain (the racing heart, the dose, the coin) — born at its
 *              station on its word, it travels arrow by arrow and only into a station that is already drawn, so it
 *              waits at a "?" (persistent state: the same object, never redrawn as a new one).
 *   RELABEL    the token keeps its body but its NAME changes ("FEAR" struck through → "ATTRACTION") — the change in the
 *              middle of the chain (misattribution, a reflex read as generosity, ice becoming water).
 *   CONTRAST   the control condition, optional: a dim second row whose start never sets anything going ("SOLID SAFE
 *              BRIDGE": flat line, no token) — what happens WITHOUT the trigger.
 *   LOOP       optional: the result feeds back into an earlier station (behavioural feedback loop); on each `loop` cue
 *              the token rides the back arrow and runs the chain again.
 * Pure: node proves frame by frame that nothing is drawn before its word. Elements an earlier beat of the chain reached
 * (`done`) are drawn settled. No frame = not drawn. Nothing is printed that the narration does not say.
 */
export type CausalGlyph =
  | "bridge" | "heart" | "brain" | "eye" | "phone" | "bolt" | "drop" | "danger" | "person" | "people" | "coin"
  | "clock" | "speech" | "check" | "cross" | "spark" | "lock" | "door" | "fire" | "ice" | "water" | "plant" | "gift"
  | "lever" | "pellet" | "rat";
export const CAUSAL_GLYPHS: CausalGlyph[] = ["bridge", "heart", "brain", "eye", "phone", "bolt", "drop", "danger", "person", "people", "coin",
  "clock", "speech", "check", "cross", "spark", "lock", "door", "fire", "ice", "water", "plant", "gift", "lever", "pellet", "rat"];

// meter / clap / csolved / lrelabel: MECHANISM 3.0, the loop's LEDGER (causalLedger.ts)
export type CausalEl = "n0" | "n1" | "n2" | "n3" | "n4" | "token" | "relabel" | "contrast" | "loop" | "meter" | "clap" | "csolved" | "lrelabel" | "lane";
export const CAUSAL_ELS: CausalEl[] = ["n0", "n1", "n2", "n3", "n4", "token", "relabel", "contrast", "loop", "meter", "clap", "csolved", "lrelabel", "lane"];
export type CausalCue = string | { phrase: string; occurrence?: number };

export type Causal = {
  /** mark "?": an outcome not known in advance (a door that may open on nothing); figure: a small glyph beside it */
  stations: { label: string; glyph: CausalGlyph; mark?: "?"; figure?: CausalGlyph }[]; // 2..5, causal order
  /** tagTo: one rename (Mechanism 2.0) or a series, one per `relabel` firing (press -> compulsively -> mashing) */
  token?: { glyph: CausalGlyph; tag?: string; tagTo?: string | string[]; from: number; relabelAt?: number };
  /** bursts (Mechanism 3.0): the contrast lane's laps, one burst per `clap` firing */
  contrast?: { label: string; glyph: CausalGlyph; result?: string; bursts?: import("./causalLedger").Burst[] };
  /** MECHANISM 3.0: the loop's ledger (causalLedger.ts) */
  ledger?: import("./causalLedger").Ledger;
  /** planner: how many loop / clap / relabel firings earlier beats of the chain already ran */
  before?: Partial<Record<"loop" | "clap" | "relabel", number>>;
  loop?: { to: number; label?: string };
  cues?: Partial<Record<CausalEl, CausalCue | CausalCue[]>>;
  /** planner: scene-local frame(s) per element of this beat (loop may fire several times) */
  at?: Partial<Record<CausalEl, number | number[]>>;
  /** planner: elements earlier beats of the chain already reached */
  done?: CausalEl[];
};

export const BUILD = 16, STEP = 22, RELABEL_LEN = 18, LOOP_LEN = 30;
const ramp = (x: number, len: number) => Math.max(0, Math.min(1, x / Math.max(1, len)));
export const stationEl = (k: number) => (`n${k}` as CausalEl);
const NEVER = Number.POSITIVE_INFINITY, SETTLED = -1e6;

/** first frame an element is drawn: -1e6 when an earlier beat reached it, +inf when not reached (yet) */
function startOf(c: Causal, e: CausalEl): number {
  if ((c.done || []).includes(e)) return SETTLED;
  const a = (c.at || {})[e];
  if (a == null) return NEVER;
  return Array.isArray(a) ? (a.length ? Math.min(...a) : NEVER) : a;
}
const firesOf = (c: Causal, e: CausalEl): number[] => {
  const a = (c.at || {})[e];
  return a == null ? [] : (Array.isArray(a) ? a : [a]).slice().sort((x, y) => x - y);
};

export type CausalState = {
  /** 0..1 appearance per station */
  station: number[];
  /** a station said BETWEEN two drawn ones but not yet itself: a dashed "?" slot */
  slot: boolean[];
  /** 0..1 per arrow k (station k → k+1): solid once both ends are drawn */
  arrow: number[];
  /** token: null = not born; pos = continuous station index (2.5 = half way from 2 to 3); back = 0..1 along the loop arc */
  token: null | { pos: number; back: number; born: number; tagShift: number };
  contrast: number;
  loop: number;
};

/**
 * Where the token is: born at `from`; it moves to station k+1 STEP frames after both (a) it arrived at k and (b) k+1 is
 * drawn; each loop cue sends it from the last station back along the arc (LOOP_LEN) to `loop.to`, and it runs forward
 * again through the (drawn) stations. Every time is a deterministic function of the anchored frames.
 */
function tokenPath(c: Causal): { t: number; pos: number; back: number }[] | null {
  if (!c.token) return null;
  const n = c.stations.length;
  const drawnAt = c.stations.map((_, k) => startOf(c, stationEl(k)));
  // born on its word, but never before its own station is drawn (a token in mid-air reads as a separate thing)
  const born = Math.max(startOf(c, "token"), drawnAt[c.token.from] ?? NEVER);
  if (born === NEVER) return null;
  const pts: { t: number; pos: number; back: number }[] = [{ t: born, pos: c.token.from, back: 0 }];
  let t = born, k = c.token.from;
  // the rename happens AT its station: the token waits there until the new name is written (blind order: the brain
  // misreads the heart, THEN the men call — not the other way round)
  const rs = startOf(c, "relabel");
  const holdAt = c.token.relabelAt, release = rs === NEVER ? NEVER : rs + RELABEL_LEN;
  const forward = (until: number) => {
    while (k < until) {
      let go = Math.max(t, drawnAt[k + 1]);
      if (holdAt === k && c.token && c.token.tagTo) go = Math.max(go, release);
      if (go === NEVER) return false;
      pts.push({ t: go, pos: k, back: 0 }, { t: go + STEP, pos: k + 1, back: 0 });
      t = go + STEP; k++;
    }
    return true;
  };
  forward(n - 1);
  if (c.loop) {
    for (const f of firesOf(c, "loop")) {
      if (k !== n - 1) break;
      const go = Math.max(t, f);
      pts.push({ t: go, pos: k, back: 0 }, { t: go + LOOP_LEN, pos: c.loop.to, back: 1 });
      t = go + LOOP_LEN; k = c.loop.to;
      if (!forward(n - 1)) break;
    }
  }
  return pts;
}

export function causalState(c: Causal, local: number): CausalState {
  const st = c.stations.map((_, k) => { const s = startOf(c, stationEl(k)); return s === NEVER ? 0 : local >= s ? ramp(local - s + 1, BUILD) : 0; });
  const drawn = st.map((x) => x > 0);
  const first = drawn.indexOf(true), last = drawn.lastIndexOf(true);
  const slot = c.stations.map((_, k) => !drawn[k] && first >= 0 && k > first && k < last);
  const arrow = c.stations.slice(0, -1).map((_, k) => Math.min(st[k], st[k + 1]));
  let token: CausalState["token"] = null;
  const P = tokenPath(c);
  if (P && local >= P[0].t) {
    let pos = P[0].pos, back = 0;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (local >= b.t) { pos = b.pos; back = 0; continue; }
      if (local > a.t && b.t > a.t) {
        const r = smooth((local - a.t) / (b.t - a.t));
        if (b.back) { back = r; pos = a.pos + (b.pos - a.pos) * r; } else pos = a.pos + (b.pos - a.pos) * r;
      }
      break;
    }
    const rs = startOf(c, "relabel");
    token = { pos, back: back > 0 && back < 1 ? back : 0, born: ramp(local - P[0].t + 1, BUILD), tagShift: rs === NEVER ? 0 : local >= rs ? ramp(local - rs + 1, RELABEL_LEN) : 0 };
  }
  const cs = startOf(c, "contrast"), ls = startOf(c, "loop");
  return {
    station: st, slot, arrow, token,
    contrast: cs === NEVER ? 0 : local >= cs ? ramp(local - cs + 1, BUILD) : 0,
    loop: ls === NEVER ? 0 : local >= ls ? ramp(local - ls + 1, BUILD) : 0,
  };
}
const smooth = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v); };

/** every word a causal chain can print (screen-text / readcheck / gates read them like any label) */
export const causalLabels = (c: Causal): string[] =>
  [...(c.stations || []).map((s) => s.label), c.token && c.token.tag, ...(c.token && c.token.tagTo != null ? ([] as string[]).concat(c.token.tagTo) : []),
    c.contrast && c.contrast.label, c.contrast && c.contrast.result, c.loop && c.loop.label,
    c.ledger && c.ledger.label, c.ledger && c.ledger.labelTo, c.ledger && c.ledger.meter]
    .filter((x): x is string => typeof x === "string" && !!x);

const GLYPH_WORDS: Record<CausalGlyph, string> = {
  bridge: "a swaying bridge", heart: "a racing heart", brain: "a brain", eye: "an eye", phone: "a phone", bolt: "a lightning bolt",
  drop: "a drop", danger: "a warning sign", person: "a person", people: "two people", coin: "a coin", clock: "a clock",
  speech: "a speech bubble", check: "a check mark", cross: "a cross", spark: "a spark", lock: "a lock", door: "a door",
  fire: "a flame", ice: "an ice cube", water: "water", plant: "a sprouting plant", gift: "a gift",
  lever: "a lever", pellet: "a food pellet", rat: "a rat",
};

/** what a viewer can see once these elements are reached, in words (readcheck) — only what is drawn */
export function causalSeen(c: Causal, reached: Set<CausalEl>): string {
  const has = (e: CausalEl) => reached.has(e);
  const drawn = c.stations.map((_, k) => has(stationEl(k)));
  const first = drawn.indexOf(true), last = drawn.lastIndexOf(true);
  const row = c.stations.map((s, k) => (drawn[k] ? `[${GLYPH_WORDS[s.glyph]} "${s.label}"]` : k > first && k < last ? "[dashed box with a big \"?\"]" : null)).filter(Boolean);
  const parts = [`a left-to-right chain of arrows: ${row.join(" → ") || "(nothing yet)"}`];
  if (c.token && has("token")) {
    const tagTo1 = Array.isArray(c.token.tagTo) ? c.token.tagTo[c.token.tagTo.length - 1] : c.token.tagTo;
    const tag = c.token.tag ? (has("relabel") && tagTo1 ? `label "${c.token.tag}" crossed out, now "${tagTo1}"` : `labelled "${c.token.tag}"`) : "";
    let at = c.token.from;
    while (at + 1 < c.stations.length && drawn[at + 1]) at++;
    parts.push(`${GLYPH_WORDS[c.token.glyph]}${tag ? ` (${tag})` : ""} travels along the arrows from "${c.stations[c.token.from].label}" to "${c.stations[at].label}"`);
  }
  if (c.contrast && has("contrast")) parts.push(`below, greyed: [${GLYPH_WORDS[c.contrast.glyph]} "${c.contrast.label}"] with a flat line — nothing travels${c.contrast.result ? ` → "${c.contrast.result}"` : ""}`);
  // MECHANISM 3.0: the ledger the laps have written (reached.counts from readcheck: loop / clap firings so far)
  const L = (c as Causal & { ledger?: { bursts: { laps: { o: "reward" | "empty"; bar?: string }[] }[] } }).ledger;
  const counts = (reached as Set<CausalEl> & { counts?: Record<string, number> }).counts || {};
  if (L) {
    const mainLaps = L.bursts.slice(0, counts.loop || 0).flatMap((b) => b.laps);
    const cb = (c.contrast as { bursts?: { laps: { o: "reward" | "empty"; bar?: string }[] }[] } | undefined)?.bursts || [];
    const conLaps = cb.slice(0, counts.clap || 0).flatMap((b) => b.laps);
    // (inline, not imported: node scripts load this file by type-stripping, where an extensionless import fails)
    const tile = (o: string) => (o === "reward" ? "pellet" : "empty");
    const lg = L as { label?: string; labelTo?: string; meter?: string };
    const bits = [`below the loop, a row of tiles growing by one per lap (${mainLaps.map((l) => tile(l.o)).join(", ") || "none yet"})`];
    if (lg.label) bits.push(`row name "${has("lrelabel" as CausalEl) && lg.labelTo ? `${lg.label}" crossed out, now "${lg.labelTo}` : lg.label}"`);
    if (has("meter" as CausalEl)) bits.push(`a bar above each tile since "${lg.meter || "the meter"}" appeared (${mainLaps.filter((l) => l.bar).map((l) => l.bar).join(", ")})`);
    if (conLaps.length) bits.push(`a greyed second row: ${conLaps.map((l) => tile(l.o)).join(", ")} with bars ${conLaps.map((l) => l.bar || "-").join(", ")}${has("csolved" as CausalEl) ? ", a check mark beside it" : ""}`);
    parts.push(bits.join("; "));
  }
  if (c.loop && has("loop")) parts.push(`an arrow curves back from "${c.stations[c.stations.length - 1].label}" to "${c.stations[c.loop.to].label}"${c.loop.label ? ` ("${c.loop.label}")` : ""} — the chain runs again`);
  return parts.join("; ");
}
