/**
 * mute-ids.js — THE serialization of a mute-test id set (cycle 9 P0b, 2026-11-04). One contract for the sealer
 * (mute-test.js prep --seal), the verifier (lib/mute-verdict.js) and the manifest (lib/mute-manifest.js):
 *   idsSha(ids) = sha256( JSON.stringify( [...ids].sort() ) )   — byte-identical to what every seal on disk was written
 * with since 2026-10-20, so no existing seal changes meaning. A set is a set: order never decides a hash or a match.
 * Before: the manifest hashed the seal's ids in FILE order and compared them with sample.json's (frame-sorted) order,
 * so a valid sealed run read "seal: DOES NOT VERIFY" (mute-cloud-poc), and eadb0371 had to fix the verifier alone.
 */
const crypto = require("crypto");

const canon = (ids) => [...(ids || [])].sort();
const idsSha = (ids) => crypto.createHash("sha256").update(JSON.stringify(canon(ids))).digest("hex");
/** same members, each once (a duplicate is never "the same set") */
function sameIdSet(a, b) {
  const A = canon(a), B = canon(b);
  return A.length === B.length && new Set(A).size === A.length && A.every((x, i) => x === B[i]);
}
/** the ids a list holds more than once */
const duplicates = (ids) => [...new Set((ids || []).filter((x, i, all) => all.indexOf(x) !== i))];

module.exports = { canon, idsSha, sameIdSet, duplicates };
