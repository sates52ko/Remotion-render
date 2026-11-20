/**
 * cast-slots.js — who stands in each character slot of an Antidote beat.
 *
 * A scene names a ROLE; the cast may be keyed by character NAME. `roleIndex`
 * maps one to the other, so `role: "protagonist"` resolves to `cast.patch` when
 * Claude has cast Patch as the protagonist. Falls back to the role key itself,
 * which is what every pre-3.1 config uses.
 *
 * TWINS (2026-10-17): a story bible whose roles are prose ("Diem's devoted mate,
 * a commander…") matches no director role, so every slot fell back to the same
 * key and a two-person shot drew the same person twice — a muted viewer reads
 * identical twins (burn-of-the-everflame 145/146/164/165/172/173, all dead or
 * WRONG). `castSlots` gives slot n>0 the next UNUSED cast key and, when nobody
 * distinct is left, drops an unauthored two-person shot to a one-person medium.
 * An AUTHORED cast (art.json `cast`) never goes through here — it reaches the
 * screen unchanged, duplicates included (storyboard invariant 1).
 */
const TWO_PERSON_SHOTS = new Set(["twoShot", "split", "overShoulder"]);

function roleIndex(cast) {
  const byRole = {};
  const keys = Object.keys(cast || {});
  for (const [key, member] of Object.entries(cast || {})) {
    const r = (member && member.role) || key;
    if (!byRole[r]) byRole[r] = key;
  }
  // `used` (optional): keys already on screen this beat. Without it (or empty)
  // the resolution is exactly the pre-2026-10-17 one; with it, a key already used
  // yields the next unused cast key, or null when nobody distinct is left.
  return (role, used) => {
    const pick = byRole[role] || (cast && cast[role] ? role : byRole.narrator || keys[0] || role);
    if (!used || !used.size || !used.has(pick)) return pick;
    const next = keys.find((k) => !used.has(k));
    return next === undefined ? null : next;
  };
}

/**
 * Resolve the director's `count` role slots to distinct cast keys.
 *   resolve       — the function roleIndex() returned
 *   roles         — d.cast.roles (missing entries mean "extra")
 *   count         — d.cast.count
 *   shot          — d.shot
 *   castAuthored  — art.json authored `cast` for this beat: legacy resolution,
 *                   untouched (the authored list overwrites the slots anyway)
 *   shotAuthored  — art.json authored `shotOverride`: the framing is kept
 * Returns { keys, shot, dropped } — `dropped` names the shot that was given up.
 */
function castSlots({ resolve, roles, count, shot, castAuthored = false, shotAuthored = false }) {
  const n = Math.max(0, count | 0);
  const want = (c) => (roles && roles[c]) || "extra";
  if (castAuthored) return { keys: Array.from({ length: n }, (_, c) => resolve(want(c))), shot, dropped: null };
  const keys = [];
  const used = new Set();
  for (let c = 0; c < n; c++) {
    const k = resolve(want(c), used);
    if (k === null || k === undefined) break;
    keys.push(k);
    used.add(k);
  }
  if (n >= 2 && keys.length < 2 && TWO_PERSON_SHOTS.has(shot) && !shotAuthored) {
    return { keys, shot: "medium", dropped: shot };
  }
  return { keys, shot, dropped: null };
}

/**
 * EMPTY AUTHORED CAST (2026-10-17): art.json `cast: []` means "nobody on screen"
 * (burn-of-the-everflame 162/176: the lead has no cast key, so a stand-in would put
 * the act on the wrong person). It used to take the legacy path, which filled every
 * director slot — a narrator, or Luther twice in an overShoulder. Now the beat ships
 * with no figure; a person-shot the author did not choose becomes one that is
 * built to work without people (`insert`: the callout/icon carries the frame).
 */
const PEOPLE_FREE_SHOTS = new Set(["insert", "beforeAfter", "chapterCard", "illustration", "diorama", "wide"]);
const isEmptyAuthoredCast = (artBeat) => !!artBeat && Array.isArray(artBeat.cast) && artBeat.cast.length === 0;
function castFreeShot(shot, { shotAuthored = false } = {}) {
  if (shotAuthored || PEOPLE_FREE_SHOTS.has(shot)) return shot;
  return "insert";
}

/** The lock seals only what the art file authored: an engine-chosen cast is not sealed. */
function lockedCast(artBeat, characters) {
  return artBeat && Array.isArray(artBeat.cast) ? (characters || []).map((ch) => ch.identity) : null;
}

module.exports = { TWO_PERSON_SHOTS, PEOPLE_FREE_SHOTS, roleIndex, castSlots, lockedCast, isEmptyAuthoredCast, castFreeShot };
