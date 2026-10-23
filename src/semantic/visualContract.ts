import type { NarrativeAtom } from "./narrativeAtom.ts";
import type { SemanticVocabulary } from "./narrativeAtom.ts";
import { deriveVisualIntent, type VisualIntent } from "./visualIntent.ts";
import { evaluateSemanticStaging, buildVisualEvidence, type VisualEvidence } from "./stagingEvidence.ts";

export interface VisualContract {
  sceneId: string;
  narrationClaim: string;
  semanticCore: string;
  mustShow: string[];
  shouldShow: string[];
  mustNotShow: string[];
  intent: VisualIntent;
  /** P7 canonical staging representation (additive, backward compatible). */
  visualEvidence?: VisualEvidence;
}

export interface VisualEvaluation {
  subjectMatch: number;              // 0 - 1
  actionMatch: number;               // 0 - 1
  relationshipMatch: number;         // 0 - 1
  contextMatch: number;              // 0 - 1
  contradiction: number;             // 0 - 1 (1.0 = direct emotional/semantic contradiction)
  genericAssociationPenalty: number; // 0 - 1 (1.0 = lazy corporate/self-help template)
  finalScore: number;                // 0 - 100
  verdict: "PASS" | "REJECT";
  violations: string[];
  hardViolations: string[];
  reasons: string[];
}

// P2.0c/P2.1: exported so the config strip tool and the render gate
// (scripts/gate-p15.mjs) read this single source of truth. Adding a literal
// here immediately blocks it at render time.
export const FORBIDDEN_GENERIC_TEXTS = new Set([
  "CRITICAL DISTINCTION",
  "SYSTEM 1 VS SYSTEM 2",
  "THE 99% DEFAULT",
  "DOPAMINE LOOP",
  "1% COMPOUND",
  "CAREER LEVERAGE",
  "TASK FRICTION",
  "THE PASSENGER SEAT",
  "NO REAL",
  "BY THE REAL",
  "THE FIVE-ALARM TRAP",
  "THE HIDDEN MECHANISM",
  "THE ESSENTIAL 1%",
  "100+ DISTRACTIONS & NOISE",
]);

export function createVisualContractFromAtom(
  atom: NarrativeAtom,
  sceneId: string,
  extraForbidden?: string[],
  providedIntent?: VisualIntent
): VisualContract {
  const intent = providedIntent || deriveVisualIntent(atom);

  const mustShow: string[] = [];
  const shouldShow: string[] = [];
  const mustNotShow: string[] = [
    ...(extraForbidden || []),
    ...intent.forbiddenTropes
  ];

  if (atom.subject) mustShow.push(atom.subject.toLowerCase());
  if (atom.object) shouldShow.push(atom.object.toLowerCase());

  const semanticCore = atom.relationship || atom.action || atom.concepts.join(", ");

  const textLower = atom.text.toLowerCase();
  const isTragicOrViolent = /\b(war|veteran|trauma|shatters?|dead|corpse|murder|atomic|nuclear|starved|crash|wreckage|screaming|purge|crisis|fourteen-hour)\b/i.test(textLower);

  if (isTragicOrViolent || intent.domain === "morality_ethics" || intent.domain === "philosophy_ideas") {
    mustNotShow.push("heart", "celebrate", "happy", "party", "corporate_badge");
  }

  if (intent.forbiddenTropes.includes("unrelated_navigation_prop")) {
    mustNotShow.push("compass", "rudder", "anchor", "sextant");
  }

  mustNotShow.push("CRITICAL DISTINCTION", "SYSTEM 1 VS SYSTEM 2", "THE 99% DEFAULT");

  return {
    sceneId,
    narrationClaim: atom.text.trim(),
    semanticCore,
    mustShow,
    shouldShow,
    mustNotShow,
    intent,
    // P7: the canonical machine-readable staging obligation, derived from the
    // same atom+intent the contract itself came from (single semantic source).
    visualEvidence: buildVisualEvidence(atom, intent)
  };
}

/**
 * Visual Contract Gate Evaluator — fully generic, story-bible-driven.
 *
 * Character matching uses the vocabulary's characterNames map instead of
 * hardcoded book-specific names. If no vocabulary is provided, character
 * subject matching falls back to a generic 0.4 baseline.
 */
export function evaluateSceneVisualContract(
  scene: any,
  contract: VisualContract,
  meta?: any,
  vocabulary?: SemanticVocabulary
): VisualEvaluation {
  const violations: string[] = [];
  const hardViolations: string[] = [];
  const reasons: string[] = [];

  const characters = Array.isArray(scene.characters) ? scene.characters : [];
  const props = [...(Array.isArray(scene.props) ? scene.props.filter(Boolean) : [])];
  if (scene.motif) {
    const motifType = typeof scene.motif === 'string' ? scene.motif
      : (scene.motif.id || scene.motif.name || scene.motif.type || '');
    if (motifType) props.push({ type: motifType });
  }
  const texts = Array.isArray(scene.texts) ? scene.texts : [];
  const bgSet = (scene.bg && scene.bg.set) || "default";
  const intent = contract.intent;

  // 1. Check mustNotShow violations
  for (const p of props) {
    if (contract.mustNotShow.some(m => m.toLowerCase() === (p.type || "").toLowerCase())) {
      violations.push(`FORBIDDEN_PROP: Prop '${p.type}' is strictly forbidden for this narrative beat`);
      hardViolations.push(`FORBIDDEN_PROP: Prop '${p.type}' is strictly forbidden for this narrative beat`);
    }
  }

  for (const t of texts) {
    const rawText = (t.text || "").toUpperCase().trim();
    if (FORBIDDEN_GENERIC_TEXTS.has(rawText)) {
      violations.push(`GENERIC_TEMPLATE_TEXT: Detected banned template callout '${rawText}'`);
    }
  }

  // ── HARD CONSTRAINT 1: Sensory Color / Property Fidelity ───────────────────
  if (intent?.requiredAttributes?.primaryColorCue) {
    const cue = intent.requiredAttributes.primaryColorCue.toLowerCase();
    for (const ch of characters) {
      const castDef = meta?.meta?.cast?.[ch.role] || meta?.cast?.[ch.role] || scene._meta?.cast?.[ch.role] || {};
      const suitColor = (ch.variant?.suit || ch.suit || castDef.variant?.suit || "").toLowerCase();

      if (cue === "white") {
        const isWhite = suitColor.includes("white") || suitColor.includes("255,255,255") || suitColor.includes("#fff") || suitColor.includes("250,248,242");
        if (suitColor && !isWhite) {
          hardViolations.push(`SENSORY_COLOR_CONTRADICTION: Spoken '${cue}' attribute directly contradicted by character '${ch.role}' suit styling '${suitColor}'`);
        }
      }
    }

    for (const p of props) {
      const propColor = (p.color || "").toLowerCase();
      if (propColor) {
        if (cue === "crimson" || cue === "red") {
          const isRed = propColor.includes("dc143c") || propColor.includes("ff0000") || propColor.includes("red") || propColor.includes("crimson") || propColor.includes("220,20,60");
          if (!isRed) {
            hardViolations.push(`SENSORY_COLOR_CONTRADICTION: Spoken '${cue}' attribute directly contradicted by prop '${p.type}' color '${propColor}'`);
          }
        } else if (cue === "black") {
          const isBlack = propColor.includes("000000") || propColor.includes("1a1a1a") || propColor.includes("black") || propColor.includes("rgb(0,0,0)") || propColor.includes("#111");
          if (!isBlack) {
            hardViolations.push(`SENSORY_COLOR_CONTRADICTION: Spoken '${cue}' attribute directly contradicted by prop '${p.type}' color '${propColor}'`);
          }
        } else if (cue === "white") {
          const isWhite = propColor.includes("ffffff") || propColor.includes("white") || propColor.includes("255,255,255");
          if (!isWhite) {
            hardViolations.push(`SENSORY_COLOR_CONTRADICTION: Spoken '${cue}' attribute directly contradicted by prop '${p.type}' color '${propColor}'`);
          }
        }
      }
    }
  }

  // ── HARD CONSTRAINT 2: Era Anachronism ──────────────────────────────────────
  if (intent?.forbiddenTropes?.includes("heraldic_medieval_anachronism")) {
    const hasMedievalProp = props.some((p: any) => {
      const t = (p.type || "").toLowerCase();
      return t === "war" || t === "shield" || t === "sword";
    });
    if (hasMedievalProp) {
      hardViolations.push("ERA_ANACHRONISM: Modern 20th-century warfare trauma depicted with medieval heraldic crossed-swords/shield prop");
    }
  }

  // ── HARD CONSTRAINTS 3+4 via the ONE semantic judge (P7, spec item 3) ─────
  // HC3 (MISSING_STRUCTURAL_EQUIVALENCE) and HC4 (IDLE_ACTOR_WALLPAPER) now
  // delegate to the shared engine in stagingEvidence.ts — the exact engine the
  // production firewall runs. Triggers and historical pass paths are preserved
  // byte-for-byte (regression-guarded by the 30-case benchmark); what changed is
  // WHERE the predicates live, not what they fire on.
  {
    // `props` here is the motif-normalized view built above (scene.motif folded
    // in) — the judge must see exactly what the historical HC3/HC4 saw.
    const staging = evaluateSemanticStaging({ scene: { ...scene, props }, evidence: contract.visualEvidence || null, intent });
    hardViolations.push(...staging.hardViolations);
  }

  // ── HARD CONSTRAINT 5: Tone Inversion / Banned Tropes ──────────────────────
  if (intent?.forbiddenTropes) {
    if (intent.forbiddenTropes.includes("comic_lightbulb") && props.some((p: any) => /lightbulb|bulb/i.test(p.type || ""))) {
      hardViolations.push("COMIC_INVERSION: Comic lightbulb prop used during serious/somber narrative beat");
    }
    if (intent.forbiddenTropes.includes("celebrate_action") && characters.some((c: any) => c.action === "celebrate")) {
      hardViolations.push("EMOTIONAL_CONTRADICTION: Character is celebrating during tragic/somber beat");
    }
    if (intent.forbiddenTropes.includes("burning_or_destructive_action") && props.some((p: any) => /fire|flame|burn|destroy/i.test(p.type || ""))) {
      hardViolations.push("OUTCOME_REVERSAL: Guaranteed survival/safety claim depicted with burning or destruction of assets");
    }
  }

  // ── HARD CONSTRAINT 6: Asset Identity Mismatch ────────────────────────────
  {
    const narration = contract.narrationClaim.toLowerCase();
    const isViolentOrFatalNarration = /glasses|blind|eyes|stole|stolen|fatal(ly)?|flaw|violently|kill|die|death|murder|corpse|bleeding|attack|sever|grief|tears|weep|perish|hurt|struck|blow/i.test(narration);
    const hasCelebratoryProp = props.some((p: any) => /\b(gift|giftbox|party|confetti|balloon|cake|cocktail|champagne|present)\b/i.test(p.type || ""));
    if (isViolentOrFatalNarration && hasCelebratoryProp) {
      hardViolations.push("ASSET_IDENTITY_MISMATCH: Narration depicts violence/fatal vulnerability but prop is celebratory/festive");
    }
  }

  // ── HARD CONSTRAINT 7: Domain Leakage ─────────────────────────────────────
  {
    const hasCorporateProp = props.some((p: any) => /funneltrap|salesfunnel|kanban|pomodoro|orgchart|pipeline/i.test(p.type || ""));
    const hasCorporateBannerText = texts.some((t: any) => /DISTRACTIONS|ESSENTIAL 1%|HABIT LOOP|PRODUCTIVITY|KPI|ROI|CAREER LEVERAGE|THE PASSENGER SEAT|FIVE-ALARM TRAP|HIDDEN MECHANISM/i.test(t.text || ""));
    const isNonCorporateDomain = intent?.domain !== "society_institution";
    if (isNonCorporateDomain && (hasCorporateProp || hasCorporateBannerText)) {
      hardViolations.push("DOMAIN_LEAKAGE: Corporate/productivity visual in a non-institutional literary or psychological scene");
    }
    for (const t of texts) {
      const upper = (t.text || "").toUpperCase().trim();
      if (FORBIDDEN_GENERIC_TEXTS.has(upper)) {
        hardViolations.push(`FORBIDDEN_GENERIC_TEXT: Banned template callout '${upper}' present in scene`);
      }
    }
  }

  // ── HARD CONSTRAINT 8: Action Not Legible ─────────────────────────────────
  {
    const narration = contract.narrationClaim.toLowerCase();
    const isKineticNarration = /boulder drops?|drops? from the cliff|rock strikes?|strikes? .{0,25} blow|smashes|crushes|falls? from|plummets?|punches|slams|hurled|thrown from|absolute rage|furious roar|violently beats?|stabs|decapitat/i.test(narration);
    const propTypes = props.map((p: any) => (p.type || "").toLowerCase());
    const hasStaticIconProp = propTypes.some(t => /^(target|fire|flame|standee|icon|flag|chart|graph|trophy|badge|medal)$/.test(t));
    const hasKineticProp = propTypes.some(t => /strike|fall|smash|tumble|impact|shatter|struggle|flee|attack|charge|crash|boulder|rock/.test(t));
    const allPassive = characters.every((c: any) => /idle|talk|gesture|point|walk/.test(c.action || ""));
    if (isKineticNarration && hasStaticIconProp && !hasKineticProp && allPassive) {
      hardViolations.push("ACTION_NOT_LEGIBLE: Narration asserts violent/kinetic action but scene shows only static icon + passive character");
    }
  }

  // ── HARD CONSTRAINT 9: Visual Salience Failure ────────────────────────────
  {
    const narration = contract.narrationClaim.toLowerCase();
    const isCollectiveNarration = /pleads? with the assembly|assembly constantly|crowd|all the boys|gathering|chorus|citizens assembled|senate meets|the whole group|everyone present|mob/i.test(narration);
    const isSingleIsolatedActor = characters.length === 1 && /gesture|idle|talk/.test(characters[0]?.action || "");
    const hasCrowdProp = props.some((p: any) => /crowd|audience|assembly|group|mob|people|gathering|parliament/i.test(p.type || ""));
    if (isCollectiveNarration && isSingleIsolatedActor && !hasCrowdProp) {
      hardViolations.push("VISUAL_SALIENCE_FAILURE: Narration invokes collective assembly but scene shows single isolated actor with no crowd context");
    }
  }

  // ── HARD CONSTRAINT 10: Generic Metaphor Flatness ─────────────────────────
  {
    const narration = contract.narrationClaim.toLowerCase();
    const propTypes = props.map((p: any) => (p.type || "").toLowerCase());

    const isSeizurePower = /appropriat(e|es|ing)|seize(s|d)? (technology|power|control|weapons?)|raid .{0,30} camp|stole? (technology|weapons?|equipment)/i.test(narration);
    const hasChainsSymbol = propTypes.some(t => /chains?|brokenchain/i.test(t));
    if (isSeizurePower && hasChainsSymbol) {
      hardViolations.push("GENERIC_METAPHOR_FLATNESS: 'Chains' symbol semantically inverts technological seizure/appropriation claim");
    }

    const isDualityNarration = /generous one moment and absolutely ruthless|duality|two opposing drives|ruthless.{0,40}generous|generous.{0,40}ruthless/i.test(narration);
    const hasFunnelProp = propTypes.some(t => /funnel|funneltrap|salesfunnel/i.test(t));
    if (isDualityNarration && hasFunnelProp) {
      hardViolations.push("GENERIC_METAPHOR_FLATNESS: Corporate funnel prop does not depict internal human psychological duality");
    }
  }

  // 2. Contradiction Analysis
  let contradiction = 0.0;
  const isDarkBeat = /\b(war|veteran|scarred|dead|kill|atomic|nuclear|shatters?|monsters?|ruin|tragedy|corrupt|blood|purge|murder|terror|panic|brutal|fourteen-hour|suffer|crisis|collapsed)\b/i.test(contract.narrationClaim);

  for (const c of characters) {
    const expr = (c.expression || "").toLowerCase();
    const action = (c.action || "").toLowerCase();

    if (isDarkBeat && (expr === "happy" || action === "celebrate")) {
      contradiction = Math.max(contradiction, 0.9);
      violations.push(`EMOTIONAL_CONTRADICTION: Character '${c.role || c.id}' is ${expr}/${action} during a dark/tragic narrative beat`);
    }
  }

  // 3. Generic Association Penalty
  let genericAssociationPenalty = 0.0;
  for (const t of texts) {
    const upper = (t.text || "").toUpperCase().trim();
    if (FORBIDDEN_GENERIC_TEXTS.has(upper)) {
      genericAssociationPenalty = Math.max(genericAssociationPenalty, 0.85);
    }
  }

  const propTypes = props.map((p: any) => (p.type || "").toLowerCase());
  if (propTypes.includes("war") && propTypes.includes("heart")) {
    genericAssociationPenalty = Math.max(genericAssociationPenalty, 0.95);
    violations.push("LAZY_ICON_COMBINATION: Detected clichéd 'war -> heart' icon juxtaposition over serious trauma beat");
  }

  // 4. Subject Match — story-bible-driven character matching
  let subjectMatch = 0.4;
  const textClaim = contract.narrationClaim.toLowerCase();
  const charRoles = characters.map((c: any) => (c.role || c.id || "").toLowerCase());

  if (vocabulary) {
    // Match characters mentioned in narration against on-screen characters
    for (const [name, castKey] of Object.entries(vocabulary.characterNames)) {
      if (textClaim.includes(name.toLowerCase())) {
        if (charRoles.includes(castKey.toLowerCase()) || charRoles.includes(name.toLowerCase())) {
          subjectMatch += 0.4;
        } else if (characters.length > 0) {
          subjectMatch = Math.min(subjectMatch, 0.2);
          violations.push(`MISSING_PRIMARY_CHARACTER: '${name}' is explicitly mentioned but absent on screen`);
        }
        break;
      }
    }
  }

  subjectMatch = Math.max(0.0, Math.min(1.0, subjectMatch));

  // 5. Action Match
  let actionMatch = 0.5;
  const isPhysicalAction = /\b(steps onto|marches|shot down|crashes|seized|dragged|murders|disarm|pushes|rolls|climbs|falls|strikes)\b/i.test(textClaim);
  const isJustTalking = characters.every((c: any) => c.action === "talk" || c.action === "idle");

  if (isPhysicalAction && isJustTalking) {
    actionMatch = 0.2;
    reasons.push("Narration describes dramatic physical action, but on screen characters are passively talking/idling");
  } else if (!isPhysicalAction && isJustTalking) {
    actionMatch = 0.7;
  } else if (characters.some((c: any) => c.action === "point" || c.action === "gesture")) {
    actionMatch = 0.6;
  }

  // 6. Relationship Match
  let relationshipMatch = 0.5;
  if (propTypes.includes("heart") && textClaim.includes("veteran")) {
    relationshipMatch = 0.1;
  }

  // 7. Context Match
  let contextMatch = 0.5;
  if (textClaim.includes("beach") || textClaim.includes("island") || textClaim.includes("jungle")) {
    if (bgSet === "shipDeck") {
      contextMatch = 0.2;
      violations.push("SETTING_MISMATCH: Island/beach/jungle narration is staged inside 'shipDeck'");
      hardViolations.push("SETTING_MISMATCH: Island/beach/jungle narration is staged inside 'shipDeck'");
    } else {
      contextMatch = 0.8;
    }
  }

  if (bgSet === "neonCyberpunk" || bgSet === "modernBunker" || bgSet === "cleanOffice") {
    if (intent?.domain === "society_institution" || intent?.domain === "childhood_innocence" || intent?.domain === "morality_ethics" || intent?.domain === "philosophy_ideas" || intent?.domain === "warfare_violence") {
      violations.push("SETTING_MISMATCH: Anachronistic/incompatible background set for cognitive domain");
      hardViolations.push("SETTING_MISMATCH: Anachronistic/incompatible background set for cognitive domain");
    }
  }

  // Aggregate
  violations.push(...hardViolations);

  const positiveBase = (subjectMatch * 30) + (actionMatch * 25) + (relationshipMatch * 25) + (contextMatch * 20);
  const contradictionFactor = (1.0 - (contradiction * 0.75));
  const penalty = genericAssociationPenalty * 40;

  let finalScore = Math.round((positiveBase * contradictionFactor) - penalty);

  if (hardViolations.length > 0) {
    finalScore = Math.min(finalScore, Math.max(10, 50 - (hardViolations.length * 15)));
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  const verdict: "PASS" | "REJECT" =
    (finalScore >= 60 && contradiction < 0.5 && violations.length === 0 && hardViolations.length === 0) ? "PASS" : "REJECT";

  return {
    subjectMatch: Number(subjectMatch.toFixed(2)),
    actionMatch: Number(actionMatch.toFixed(2)),
    relationshipMatch: Number(relationshipMatch.toFixed(2)),
    contextMatch: Number(contextMatch.toFixed(2)),
    contradiction: Number(contradiction.toFixed(2)),
    genericAssociationPenalty: Number(genericAssociationPenalty.toFixed(2)),
    finalScore,
    verdict,
    violations,
    hardViolations,
    reasons
  };
}
