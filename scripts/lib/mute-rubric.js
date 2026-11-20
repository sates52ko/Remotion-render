// mute-rubric.js — the OFFICIAL mute-test rubric text, in one place (cycle 7, 2026-11-02).
// scripts/mute-test.js (the official procedure: PROMPTS §1 describer, §3 judge) and scripts/visual-ab.js (the cloud
// rater, --rubric=official) read the SAME strings, so a calibration compares raters, not wordings. Moved here
// word-for-word from mute-test.js; scripts/test-mute-rubric.js pins it (a wording change is an operator decision).
"use strict";

/** what the blind describer writes for each image (mute-test PROMPTS §1) */
const DESCRIBER_FIELDS = "For EACH image, write: \"text\" (every word printed on the image, exactly as written, or \"none\"), \"sees\" (literal description: people, what they do, their faces, objects, text, diagram, setting; 1-3 sentences), \"message\" (what the narrator is saying at this moment, one sentence, from the image only), \"confidence\" (low/medium/high), \"wouldConfuse\" (anything that could mislead, or \"none\").";

/** the judge's rubric (mute-test PROMPTS §3) */
const JUDGE_RULES = "For each item give:\nA. correctness — CORRECT (the viewer's understood message matches the narration), NEUTRAL (neither matches nor contradicts: just a person, abstract/empty), WRONG (suggests a different or opposite meaning: unrelated object, wrong emotion over tragedy, emphasis where the narration rejects, etc.).\nB. contribution — ADDS (the image itself — people's actions/expressions, objects, icons, not only copied text — conveys something the narration means), TEXT_ONLY (only on-screen text carries meaning), NONE.\nC. explains — YES only when contribution is ADDS AND the picture itself shows the narration's mechanism, relationship or cause→effect (who does what to whom, what leads to what), not just its subject or mood; otherwise NO.\nOne short reason each. Be strict and literal; do not reward a version for being prettier or busier.";

/** the official describer, for ONE image (the API rater sees one image per call) */
function describerOne() {
  return "You are a blind rater in a mute test. You will look at ONE still frame from an animated explainer video with NO audio and NO other context.\n" +
    DESCRIBER_FIELDS.replace("For EACH image, write:", "For this image, write:") +
    '\nReply with ONLY a JSON object: {"text":"...","sees":"...","message":"...","confidence":"...","wouldConfuse":"..."}';
}

/** the official judge, for ONE item: the narration and the description V = { sees, message, wouldConfuse } */
function judgeOne(narration, V) {
  return "You are an impartial judge in a mute test of an animated book-summary video.\n" +
    "The item has the narration spoken around a moment and a blind description (V) of what a viewer with the sound OFF saw.\n" +
    JUDGE_RULES +
    '\nReply with ONLY a JSON object: {"correctness":"...","why":"...","contribution":"...","whyC":"...","explains":"YES|NO"}\n\nITEM: ' +
    JSON.stringify({ narration, V: { sees: V.sees, message: V.message, wouldConfuse: V.wouldConfuse } });
}

module.exports = { DESCRIBER_FIELDS, JUDGE_RULES, describerOne, judgeOne };
