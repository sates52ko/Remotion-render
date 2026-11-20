/**
 * llm.js — central NVIDIA NIM (build.nvidia.com) config for the pipeline.
 *
 * SWITCH MODEL IN ONE PLACE — no code edits needed:
 *   NVIDIA_MODEL=qwen/qwen3-235b-instruct node scripts/make-book.js ...
 * or change DEFAULT_MODEL below. Every script (plan-vox, plan-meta, make-prompt)
 * reads MODEL from here.
 *
 * ⚠ Pick a strong *INSTRUCT* model, NOT a pure *reasoning* model.
 * These scripts demand STRICT JSON with a fixed token budget (2–4k). Reasoning
 * models (deepseek-r1, qwen "thinking" modes, etc.) spend that budget on a
 * <think> monologue and can (a) truncate before the JSON is emitted and
 * (b) put stray { } [ ] inside the reasoning that corrupt extraction. stripThink()
 * defends against (b); (a) you can only avoid by choosing an instruct model or
 * a non-thinking variant.
 *
 * Discover the exact, currently-available slug with:  node scripts/list-nim-models.js
 * (needs NVIDIA_API_KEY loaded). The slug on each catalog page is provider/model.
 */
const DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";
const MODEL = process.env.NVIDIA_MODEL || DEFAULT_MODEL;
const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

// ── who authors the creative work ────────────────────────────────────────────
// DEFAULT = Claude (higher quality: bespoke NotebookLM angle, hand-refined meta,
// hand-directed scenes). NVIDIA/llama is kept but DORMANT — it runs ONLY when
// explicitly opted in, so a stray NVIDIA_API_KEY in .env never silently takes over.
//   USE_NVIDIA=1 node scripts/make-book.js ...    ← wake the model path
// (plan-vox also accepts --use-llm; --no-llm always forces it off.)
const USE_NVIDIA =
  ["1", "true", "yes"].includes(String(process.env.USE_NVIDIA || "").toLowerCase()) &&
  !!process.env.NVIDIA_API_KEY;

// Normalize an LLM response down to just its JSON payload: drop any
// <think>…</think> preamble (reasoning models) and ```code fences``` first, so
// the caller's indexOf('{'|'[')…lastIndexOf('}'|']') slice lands on real JSON.
const stripThink = (s) =>
  String(s || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

module.exports = { MODEL, DEFAULT_MODEL, ENDPOINT, USE_NVIDIA, stripThink };
