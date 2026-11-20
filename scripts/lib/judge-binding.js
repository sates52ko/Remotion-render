/**
 * judge-binding.js — is this judge result the answer to THIS judge input, of THIS run? (cycle 9 P0b, 2026-11-04)
 *
 * Why: the tally counted whatever ids the result held — a short result shrank n (the bars scale with n), a duplicate id
 * counted twice, an unknown id crashed it; and nothing tied a result file to the judge run that asked for it (cycle 8:
 * parallel judges writing through shared /tmp helpers overwrote each other's files). Rules (any → EVIDENCE_INVALID,
 * neither PASS nor FAIL — the bars and thresholds are untouched):
 *   - judge-key ids == judge-input ids (the key the tally decodes with is the key of this input);
 *   - result ids == input ids exactly: none missing, none extra, none twice;
 *   - every answer uses the rubric's words (correctness CORRECT|NEUTRAL|WRONG, contribution ADDS|TEXT_ONLY|NONE), with
 *     both X and Y for a --vs run;
 *   - run token: judge writes judge-run.json { run, label, inputSha256 }; the result must echo { run, label } and the
 *     input must still be the one the token was issued for;
 *   - the stills were rendered from the config the run records (stills/.config-sha = sample-meta configSha256 prefix).
 * A run prepared before this (no judge-run.json) is LEGACY: the id-set rules still apply (objective corruption), the
 * token, rubric-word and stills-config rules are reported as signals, never INVALID:
 * an old seal or result is never re-judged by a rule it could not know (P0b correction, 2026-11-04).
 */
const CORRECTNESS = new Set(["CORRECT", "NEUTRAL", "WRONG"]);
const CONTRIBUTION = new Set(["ADDS", "TEXT_ONLY", "NONE"]);

function answerProblems(a, where) {
  if (!a || typeof a !== "object") return [`${where}: no answer`];
  const p = [];
  if (!CORRECTNESS.has(a.correctness)) p.push(`${where}: correctness "${a.correctness}" is not a rubric word`);
  if (!CONTRIBUTION.has(a.contribution)) p.push(`${where}: contribution "${a.contribution}" is not a rubric word`);
  return p;
}

/**
 * input: judge-input.json items; key: judge-key.json; result: judge-result.json; runFile: judge-run.json | null;
 * label; inputSha256 (of judge-input.json now); meta: sample-meta.json; stillsConfigSha (stills/.config-sha) | null.
 * → { ok, reasons[], signals[], legacy }
 */
function checkBinding({ input, key, result, runFile = null, label, inputSha256 = null, meta = {}, stillsConfigSha = null }) {
  const reasons = [], signals = [];
  const inIds = (Array.isArray(input) ? input : []).map((x) => x && x.id).filter(Boolean);
  const keyIds = Object.keys(key || {});
  const items = result && Array.isArray(result.items) ? result.items : null;
  if (!items) return { ok: false, reasons: ["judge-result.json has no items list"], signals, legacy: !runFile };
  const set = (a) => new Set(a);
  const minus = (a, b) => { const B = set(b); return [...set(a)].filter((x) => !B.has(x)); };
  if (minus(keyIds, inIds).length || minus(inIds, keyIds).length) reasons.push(`judge-key.json and judge-input.json name different items (key ${keyIds.length}, input ${inIds.length})`);
  const resIds = items.map((x) => x && x.id);
  const dup = [...set(resIds.filter((x, i) => resIds.indexOf(x) !== i))];
  const missing = minus(inIds, resIds), extra = minus(resIds, inIds);
  if (dup.length) reasons.push(`result answers ${dup.length} item(s) more than once (${dup.slice(0, 3).join(", ")})`);
  if (missing.length) reasons.push(`result is missing ${missing.length} of ${inIds.length} item(s) (${missing.slice(0, 3).join(", ")}) — a short result would shrink n and the bars`);
  if (extra.length) reasons.push(`result answers ${extra.length} item(s) this input never asked (${extra.slice(0, 3).join(", ")})`);
  // the rules a LEGACY run (no judge-run.json) could not know are reported for it, never counted against it: in 138 real
  // results a judge wrote a non-rubric contribution 3 times — re-tallying such an old run must not flip it to INVALID
  const strict = (msgs) => (runFile ? reasons : signals).push(...msgs.map((m) => (runFile ? m : `LEGACY (not counted): ${m}`)));
  const vs = keyIds.some((k) => key[k] && key[k].vs);
  const words = [];
  for (const it of items) {
    if (!it || !inIds.includes(it.id)) continue;
    const p = vs ? [...answerProblems(it.X, `${it.id}.X`), ...answerProblems(it.Y, `${it.id}.Y`)] : answerProblems(it.V, `${it.id}.V`);
    if (p.length) { words.push(...p.slice(0, 2)); if (words.length > 12) break; }
  }
  if (words.length) strict(words);
  // the run token
  if (runFile) {
    if (runFile.label !== label) reasons.push(`judge-run.json is for label "${runFile.label}", not "${label}"`);
    if (inputSha256 && runFile.inputSha256 && runFile.inputSha256 !== inputSha256) reasons.push("judge-input.json changed after its judge run was issued (another judge prep wrote over it)");
    if (result.run !== runFile.run) reasons.push(`result is not the answer to this judge run (run "${result.run || "—"}" ≠ "${runFile.run}")`);
    if (result.label !== undefined && result.label !== label) reasons.push(`result names label "${result.label}", not "${label}"`);
  } else signals.push("LEGACY: prepared before judge-run tokens (2026-11-04) — the result's run/label could not be checked");
  // the frames vs the film the run records
  if (stillsConfigSha && meta && meta.configSha256 && String(meta.configSha256).slice(0, 16) !== String(stillsConfigSha).trim()) {
    strict([`the stills were rendered from config ${String(stillsConfigSha).trim()}, the run records ${String(meta.configSha256).slice(0, 16)} — not the same film`]);
  }
  return { ok: reasons.length === 0, reasons, signals, legacy: !runFile };
}

module.exports = { checkBinding, CORRECTNESS, CONTRIBUTION };
