import type { NarrativeAtom } from "./narrativeAtom.ts";

/**
 * Visual Archetypes: Generic composition patterns describing
 * what the visual must achieve on screen.
 */
export type VisualArchetype =
  | "contrast"               // Juxtaposing two opposed states or forces
  | "transformation"         // State A decaying or mutating into State B
  | "cause_effect"           // Condition/trigger leading directly to an outcome
  | "allegory_equivalence"   // Domain X structurally represents / mirrors Domain Y
  | "historical_grounding"   // Grounded historical trauma or concrete historical reality
  | "literary_critique"      // Meta-analysis of narrative framing, tropes, or cultural reception
  | "character_psychology"   // Internal cognitive dissonance, realization, denial, or dread
  | "tension_action"         // Immediate physical or interpersonal conflict
  | "static_reflection";     // Meditative or atmospheric pause

/**
 * Cognitive Domains: High-level subject domain of the claim.
 */
export type CognitiveDomain =
  | "psychology"
  | "politics_power"
  | "morality_ethics"
  | "warfare_violence"
  | "literature_meta"
  | "childhood_innocence"
  | "philosophy_ideas"
  | "society_institution";

export interface RequiredVisualAttributes {
  mood?: "somber" | "urgent" | "analytical" | "cynical" | "triumphant" | "ominous" | "ironic" | "neutral";
  visualRegister?: "cinematic_grounded" | "diagrammatic_editorial" | "metaphoric_stark";
  primaryColorCue?: string;        // Explicit color requirement mentioned in narration (e.g. "white")
  lightingOrTone?: "harsh" | "subdued" | "dramatic_contrast" | "neutral";
}

export interface VisualIntent {
  archetype: VisualArchetype;
  domain: CognitiveDomain;
  requiredAttributes: RequiredVisualAttributes;
  requiredActions: string[];        // Desired visual behaviors (e.g. ["show_two_contrasting_states"])
  forbiddenTropes: string[];        // Banned clichés and mismatched visual proxies
  semanticRequirements: string[];  // Invariants required for truth-to-narration
}

/**
 * Derives a generic, book-agnostic VisualIntent from a NarrativeAtom.
 * Translates narrative behavior into visual composition constraints.
 */
export function deriveVisualIntent(atom: NarrativeAtom): VisualIntent {
  const text = atom.text.trim();
  const lower = text.toLowerCase();

  // ── 1. DOMAIN INFERENCE (Generic Lexical & Conceptual Mapping) ─────────────
  let domain: CognitiveDomain = "philosophy_ideas";

  if (/\b(transform into.*monsters|literal monsters|psychological denial|subconscious shield)\b/i.test(lower)) {
    domain = "psychology";
  } else if (/\b(philosophy|philosopher|philosophical|epistemology|truth|empirical|scientific inquiry)\b/i.test(lower)) {
    domain = "philosophy_ideas";
  } else if (/\b(book|novel|fable|story|tales|literature|author|readers?|published|middle school|hardy boys|yarns|adventure story|introduction|analysis|critics?|periodical|review|essay)\b/i.test(lower)) {
    domain = "literature_meta";
  } else if (/\b(panic|collective terror|psychic|dread|denial|trauma|subconscious|existential grief)\b/i.test(lower)) {
    domain = "psychology";
  } else if (/\b(institution|society|culture|class|community|economic|economy|currency|inflation|hyper-inflated|empire|mines?|laborers?|industrial|shifts?|agricultural|agriculture|harvest|breadbasket|drought)\b/i.test(lower)) {
    domain = "society_institution";
  } else if (/\b(child|children|boys|schoolboys?|school uniforms?|naughty|supervision|misbehaving|youth|young|infant|innocent)\b/i.test(lower)) {
    domain = "childhood_innocence";
  } else if (/\b(war|navy|veteran|combat|soldier|fleet|destroyer|bomber|german|allied|battle|military|officer|fortress|citadel|ramparts?|defenders?|siege|assault|conquered|gates?|weapons?|blood-stained|murder|coup|purge)\b/i.test(lower)) {
    domain = "warfare_violence";
  } else if (/\b(regime|democracy|tyranny|ruler|oligarchy|state|coercion|power|citizen|law|arrest|treaty|treaties|national security|diploma(cy|tic)|parliament|the party)\b/i.test(lower)) {
    domain = "politics_power";
  } else if (/\b(soul|ego|mind|monsters?|nightmare|illusion)\b/i.test(lower)) {
    domain = "psychology";
  } else if (/\b(justice|virtue|moral|evil|wicked|sin|righteous|goodness|ethics|code|banality of evil|invisibility)\b/i.test(lower)) {
    domain = "morality_ethics";
  } else if (/\b(cave|shadows|reason|logic|rational|intellect|theory|concept)\b/i.test(lower)) {
    domain = "philosophy_ideas";
  }

  // ── 2. ARCHETYPE INFERENCE (Relational & Propositional Dynamics) ───────────
  let archetype: VisualArchetype = "static_reflection";

  const hasEquivalence = /\b(mirrors|mirror|reflection|reflects|exact same|equivalent|parallel|identical|analogy|allegor(y|ies)|metaphor(s)?|symbol(s)?|is not an? [^;]+;?\s*it is)\b/i.test(lower) ||
    (atom.relationship && /mirror|equivalence|parallel|allegory/i.test(atom.relationship));

  const hasMetaCritique = domain === "literature_meta" ||
    /\b(cautionary tale|fable|trope|genre|reading|encounter this book|introduction to the novel|literary critics|critics in the|formulated the concept)\b/i.test(lower);

  const hasTransformation = /\b(decays? into|mutat(e|ing|es) into|decaying into|metamorphosis)\b/i.test(lower);

  const hasContrast = /\b(not|isn't|rather than|versus|vs|instead of|reframes|difference|contrasts?|on the other hand|whereas|while|but|yet|in contrast|as opposed to)\b/i.test(lower);

  const hasPsychologicalShatter = /\b(shatters?|realize|horror|dread|trauma|scarred|nightmare|illusion|denial|existential grief|subconscious shield|transform into literal monsters)\b/i.test(lower);

  const hasCausality = /\b(when|because|results in|leads to|causes|produces|transforms into|collapses into|collapsed)\b/i.test(lower);

  const hasHistorical = /\b(world war|veteran|historical|century|regime|19[0-9]{2}|18[0-9]{2}|ancient athens|sparta|coup of|in 404 bc)\b/i.test(lower);

  if (hasEquivalence) {
    archetype = "allegory_equivalence";
  } else if (hasMetaCritique) {
    archetype = "literary_critique";
  } else if (hasTransformation) {
    archetype = "transformation";
  } else if (hasContrast) {
    archetype = "contrast";
  } else if (hasPsychologicalShatter) {
    archetype = "character_psychology";
  } else if (hasCausality) {
    archetype = "cause_effect";
  } else if (hasHistorical) {
    archetype = "historical_grounding";
  } else if (atom.action && /\b(kills?|strikes?|flees?|drags?|arrests?|fights?)\b/i.test(atom.action)) {
    archetype = "tension_action";
  }

  // ── 3. MOOD & REGISTER INFERENCE ──────────────────────────────────────────
  const isTragicOrGrim = /\b(war|veteran|scarred|trauma|shatters?|horror|dead|corpse|kill|blood|burning|savagery|tyranny|destruction|monsters?|purge|murder|terror|panic|brutal|fourteen-hour|suffer|crisis|collapsed)\b/i.test(lower);
  const isAnalytical = domain === "literature_meta" || domain === "philosophy_ideas" || /\b(analysis|examines?|argues?|explores?|reframes?)\b/i.test(lower);
  const isIronic = /\b(isn't the rescue|pristine.*war|exact same war|fable.*supervision|ironclad guarantee)\b/i.test(lower);

  const mood: NonNullable<RequiredVisualAttributes["mood"]> = isIronic ? "ironic" : isTragicOrGrim ? "somber" : isAnalytical ? "analytical" : "neutral";
  const visualRegister = isAnalytical ? "diagrammatic_editorial" : isTragicOrGrim ? "metaphoric_stark" : "cinematic_grounded";

  // Check for explicit sensory property binding (e.g. "white uniform", "red blood")
  let primaryColorCue: string | undefined;
  const colorMatch = lower.match(/\b(white|red|black|gold|scarlet|crimson|silver|blue)\s+(uniform|cloth|dress|suit|shirt|shield|fire|blood|flag|gates?|iron gates?)\b/i);
  if (colorMatch) {
    primaryColorCue = colorMatch[1].toLowerCase();
  }

  const requiredAttributes: RequiredVisualAttributes = {
    mood,
    visualRegister,
    primaryColorCue,
    lightingOrTone: isTragicOrGrim ? "dramatic_contrast" : isAnalytical ? "neutral" : "subdued"
  };

  // ── 4. REQUIRED ACTIONS (What the visual MUST do) ──────────────────────────
  const requiredActions: string[] = [];

  if (archetype === "contrast") {
    requiredActions.push("show_two_opposing_states_or_polarities");
  } else if (archetype === "allegory_equivalence") {
    requiredActions.push("render_structural_parallel_between_domains");
  } else if (archetype === "transformation" || archetype === "cause_effect") {
    requiredActions.push("depict_trigger_to_consequence_flow");
  } else if (archetype === "character_psychology") {
    requiredActions.push("visualize_internal_tension_or_rupture");
  } else if (archetype === "literary_critique") {
    requiredActions.push("frame_story_through_editorial_or_literary_lens");
  } else if (archetype === "historical_grounding") {
    requiredActions.push("ground_in_authentic_historical_reality");
  }

  // ── 5. FORBIDDEN TROPES (Generic Anti-Patterns & Clichés) ──────────────────
  const forbiddenTropes: string[] = [];

  // Constraint A: Tone & Polarity Mismatch
  if (mood === "somber" || isTragicOrGrim) {
    forbiddenTropes.push(
      "comic_lightbulb",          // Upbeat eureka cliché trivializing grim realization
      "celebrate_action",         // Inappropriate party/dancing
      "cheerful_facial_expression",
      "heart_symbol",             // Clichéd romantic/happy symbol
      "party_confetti"
    );
  }

  // Constraint B: Idle Actor Wallpaper on Propositions
  if (atom.abstraction === "conceptual" || archetype !== "static_reflection" || domain === "psychology" || domain === "morality_ethics") {
    forbiddenTropes.push(
      "static_idle_actor_wallpaper", // Single actor standing doing nothing on conceptual claim
      "meaningless_abstract_blobs"   // Incomprehensible shapes without narrative encoding
    );
  }

  // Constraint C: Domain Cross-Bleed (e.g. Literature critique using ambient naval props)
  if (domain === "literature_meta") {
    forbiddenTropes.push(
      "ambient_setting_distraction", // Prop belonging to book setting rather than literary claim
      "unrelated_navigation_prop"    // Compass/rudder used when discussing books/reading
    );
  }

  // Constraint D: Historical / Era Anachronisms
  if (domain === "warfare_violence" && /\b(world war|19[0-9]{2}|modern|navy|veteran|destroyer)\b/i.test(lower)) {
    forbiddenTropes.push(
      "heraldic_medieval_anachronism", // Medieval knight swords/shields in 20th-century warfare
      "fairy_tale_weapons"
    );
  }

  // Constraint E: Inverted Outcome Meaning
  if (/\b(guarantee|safe|moral|win|always safe|shake him|unscathed|security|unbreached)\b/i.test(lower)) {
    forbiddenTropes.push(
      "burning_or_destructive_action", // Burning assets when narration claims guaranteed safety
      "total_collapse_motif"
    );
  }

  // ── 6. SEMANTIC REQUIREMENTS (Truth Invariants) ────────────────────────────
  const semanticRequirements: string[] = [
    "cognitive_domain_coherence"
  ];

  if (primaryColorCue) {
    semanticRequirements.push(`sensory_attribute_fidelity_${primaryColorCue}`);
  }

  if (archetype === "contrast" || archetype === "allegory_equivalence") {
    semanticRequirements.push("two_distinct_comparative_elements");
  }

  if (domain === "literature_meta") {
    semanticRequirements.push("distinguish_meta_commentary_from_story_world");
  }

  return {
    archetype,
    domain,
    requiredAttributes,
    requiredActions,
    forbiddenTropes,
    semanticRequirements
  };
}
