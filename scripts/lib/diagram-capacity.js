/**
 * diagram-capacity.js — how many labels the Antidote Diagram component actually DRAWS per authored diagram type
 * (src/engines/antidote/components/Diagram.tsx). Past that number a label is dropped silently: a kept flow that
 * adds a 4th step renders exactly like the beat before it (dead), and the reader text showed a label the viewer
 * never sees (lolita 204 lost its payoff "Fake confession"; 15 labels on 10 beats across 5 books, 2026-10-23).
 *
 *   flow      ≤ 3 nodes            Diagram.tsx: spec.labels.slice(0, 3)
 *   sorter    ≤ 4 bins             Diagram.tsx: spec.labels.slice(0, 4)
 *   spectrum  exactly 2 poles      Diagram.tsx: poles[0], poles[1] (fewer than 2 -> the defaults LESS / MORE)
 *   matchWave exactly 1 label      Diagram.tsx: spec.labels[0] || "IN SYNC"
 *
 * storyboard.js merge refuses an authored diagram outside this; readcheck.js shows the reader only drawnLabels().
 * scripts/test-diagram-capacity.js fails if Diagram.tsx stops drawing these numbers.
 */
const CAPACITY = {
  flow: { min: 1, max: 3, unit: "nodes" },
  sorter: { min: 1, max: 4, unit: "bins" },
  spectrum: { min: 2, max: 2, unit: "poles" },
  matchWave: { min: 1, max: 1, unit: "label" },
};

/** The labels a viewer sees for this diagram, exactly as Diagram.tsx picks them (defaults included). */
function drawnLabels(type, labels) {
  const L = Array.isArray(labels) ? labels : [];
  if (type === "flow") return L.length ? L.slice(0, 3) : ["CAUSE", "EFFECT"];
  if (type === "sorter") return L.length ? L.slice(0, 4) : ["ONE", "TWO", "THREE"];
  if (type === "spectrum") return L.length >= 2 ? L.slice(0, 2) : ["LESS", "MORE"];
  if (type === "matchWave") return [L[0] || "IN SYNC"];
  return L;
}

/** null when every authored label is drawn; else the refusal text naming the limit and the two fixes. */
function capacityProblem(type, labels) {
  const c = CAPACITY[type];
  const n = Array.isArray(labels) ? labels.length : 0;
  if (!c || (n >= c.min && n <= c.max)) return null;
  const need = c.min === c.max ? `exactly ${c.max}` : `at most ${c.max}`;
  const lost = n > c.max ? ` — ${labels.slice(c.max).map((l) => `"${l}"`).join(", ")} would not be drawn` : ` — the screen would show ${drawnLabels(type, labels).map((l) => `"${l}"`).join(" / ")} instead`;
  return `diagram ${type} draws ${need} ${c.unit} (${n} given)${lost}. Spread the labels over the next beats (a new ${type} on the following beat picks up where this one ends) or rewrite the diagram to fit ${need} ${c.unit}.`;
}

module.exports = { CAPACITY, drawnLabels, capacityProblem };
