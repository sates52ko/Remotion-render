#!/usr/bin/env node
/**
 * list-nim-models.js — print the models your NVIDIA_API_KEY can actually call,
 * so you pick a real slug before setting NVIDIA_MODEL (a wrong slug = HTTP 404).
 *
 * Usage:
 *   NVIDIA_API_KEY=nvapi-... node scripts/list-nim-models.js            # all ids
 *   NVIDIA_API_KEY=nvapi-... node scripts/list-nim-models.js instruct   # filter substring
 *
 * The current default the pipeline uses is printed at the top (scripts/lib/llm.js).
 */
const { MODEL, DEFAULT_MODEL } = require("./lib/llm");

const key = process.env.NVIDIA_API_KEY;
if (!key) {
  console.error("❌ NVIDIA_API_KEY yok. Yükle: `set -a; . ./.env; set +a` (veya inline ver) ve tekrar dene.");
  process.exit(1);
}
const filter = (process.argv[2] || "").toLowerCase();

(async () => {
  const resp = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    console.error(`❌ HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const j = await resp.json();
  const ids = (j.data || []).map((m) => m.id).filter(Boolean).sort();
  const shown = filter ? ids.filter((id) => id.toLowerCase().includes(filter)) : ids;

  console.log(`\ncurrent default (lib/llm.js): ${DEFAULT_MODEL}`);
  console.log(`active (NVIDIA_MODEL or default): ${MODEL}\n`);
  console.log(`${shown.length}/${ids.length} model${filter ? ` matching "${filter}"` : ""}:\n`);
  shown.forEach((id) => console.log("  " + id));
  console.log(`\nSwitch with:  NVIDIA_MODEL=<slug> node scripts/make-book.js ...`);
  console.log(`(pick an INSTRUCT model, not a reasoning/thinking one — see lib/llm.js)\n`);
})();
