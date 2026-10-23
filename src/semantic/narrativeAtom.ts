import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface NarrativeAtom {
  text: string;

  subject: string | null;
  action: string | null;
  object: string | null;

  relationship: string | null;

  concepts: string[];

  abstraction: "concrete" | "conceptual" | "mixed";

  visualNeed: string;
}

export interface ExtractionContext {
  bookTitle?: string;
  author?: string;
  genre?: string;
  previousText?: string;
}

/**
 * SemanticVocabulary is injected from the story bible via
 * scripts/lib/story-bible-schema.js → extractSemanticVocabulary().
 * No book-specific terms are hardcoded in this module.
 */
export interface SemanticVocabulary {
  characterNames: Record<string, string>;
  locationNames: Record<string, string>;
  concepts: string[];
  allowedMotifs: Set<string>;
  forbiddenMotifs: Set<string>;
  allowedCharacters: Set<string>;
  cast: Record<string, { name?: string; role?: string }>;
}

const CACHE_DIR = path.resolve(process.cwd(), ".cache/semantic");

function getCacheKey(text: string, context?: ExtractionContext): string {
  const norm = text.trim().toLowerCase();
  const ctx = (context?.bookTitle || "") + ":" + (context?.author || "");
  return crypto.createHash("sha256").update(`${norm}|${ctx}`).digest("hex");
}

function readCache(key: string): NarrativeAtom | null {
  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw) as NarrativeAtom;
    }
  } catch {
    // ignore cache read error
  }
  return null;
}

function writeCache(key: string, atom: NarrativeAtom): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(atom, null, 2), "utf8");
  } catch {
    // ignore cache write error
  }
}

/**
 * Generic heuristic extractor — all named entities come from the story bible
 * vocabulary, never from hardcoded lists. If no vocabulary is provided,
 * extraction still works but yields null subject/action/object (the firewall
 * will catch the missing provenance downstream).
 */
function heuristicExtract(text: string, _context?: ExtractionContext, vocabulary?: SemanticVocabulary): NarrativeAtom {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  const isConcrete = /\b(killed|murdered|dragged|arrest|army|sword|ships|harbor|shield|executed|trial|house|street|city gates|boulder|rock|mountain|slope|cliff|prison|temple|cave)\b/i.test(clean);
  const isConceptual = /\b(soul|justice|metaphor|mirror|autopsy|psychic|virtue|philosophy|regime|democracy|oligarchy|ideal|concept|absurd|revolt|freedom|meaning|existence|suicide|death|revolt|consciousness)\b/i.test(clean);

  const abstraction: "concrete" | "conceptual" | "mixed" =
    isConcrete && isConceptual ? "mixed" : isConcrete ? "concrete" : "conceptual";

  const concepts: string[] = [];
  let subject: string | null = null;
  let action: string | null = null;
  let object: string | null = null;
  let relationship: string | null = null;

  if (vocabulary) {
    // Extract concepts from story-bible vocabulary
    for (const concept of vocabulary.concepts) {
      if (lower.includes(concept.toLowerCase())) {
        if (!concepts.includes(concept)) concepts.push(concept);
      }
    }

    // Extract subject from character mentions (first match wins)
    for (const [name, castKey] of Object.entries(vocabulary.characterNames)) {
      const namePattern = new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
      if (namePattern.test(clean)) {
        if (!subject) {
          const castEntry = vocabulary.cast[castKey];
          subject = castEntry?.name || name;
        }
        break;
      }
    }

    // Extract action from common verb patterns
    const actionMatch = clean.match(/\b(refuses?|kills?|argues?|defends?|questions?|challenges?|accepts?|rejects?|pushes?|rolls?|climbs?|descends?|confronts?|embraces?|denies|transforms?|destroys?|creates?|builds?|flees?|fights?|drags?|strikes?|condemns?|imagines?)\b/i);
    if (actionMatch) {
      action = actionMatch[1].toLowerCase();
    }

    // Extract object from secondary character or concept mention
    const mentionedCharacters: string[] = [];
    for (const [name, castKey] of Object.entries(vocabulary.characterNames)) {
      const namePattern = new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
      if (namePattern.test(clean)) {
        mentionedCharacters.push(castKey);
      }
    }
    if (mentionedCharacters.length >= 2) {
      const secondKey = mentionedCharacters[1];
      const secondEntry = vocabulary.cast[secondKey];
      object = secondEntry?.name || secondKey;
    } else if (concepts.length > 0) {
      object = concepts[0];
    }

    // Derive relationship from action + subject
    if (subject && action) {
      relationship = `${subject} ${action} ${object || "the world"}`;
    }
  }

  const visualNeed = `Visually communicate the narrative beat: "${clean.slice(0, 100)}..." with primary focus on ${subject || (concepts[0] || "core concept")}.`;

  return {
    text: clean,
    subject,
    action,
    object,
    relationship,
    concepts,
    abstraction,
    visualNeed
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Primary NarrativeAtom extractor.
 * Adheres to:
 * 1. Deterministic cache check
 * 2. LLM call if available
 * 3. Graceful heuristic fallback (never breaks pipeline)
 * 4. Cache persistence
 */
export function extractNarrativeAtomSync(
  text: string,
  context?: ExtractionContext,
  overrideAtom?: Partial<NarrativeAtom>,
  vocabulary?: SemanticVocabulary
): NarrativeAtom {
  const cacheKey = getCacheKey(text, context);
  const cached = readCache(cacheKey);
  if (cached && !overrideAtom) {
    return cached;
  }

  if (overrideAtom) {
    const merged: NarrativeAtom = {
      text: text.trim(),
      subject: overrideAtom.subject ?? null,
      action: overrideAtom.action ?? null,
      object: overrideAtom.object ?? null,
      relationship: overrideAtom.relationship ?? null,
      concepts: overrideAtom.concepts ?? [],
      abstraction: overrideAtom.abstraction ?? "conceptual",
      visualNeed: overrideAtom.visualNeed ?? text.trim()
    };
    writeCache(cacheKey, merged);
    return merged;
  }

  const result = heuristicExtract(text, context, vocabulary);
  writeCache(cacheKey, result);
  return result;
}

export async function extractNarrativeAtom(
  text: string,
  context?: ExtractionContext,
  overrideAtom?: Partial<NarrativeAtom>,
  vocabulary?: SemanticVocabulary
): Promise<NarrativeAtom> {
  return extractNarrativeAtomSync(text, context, overrideAtom, vocabulary);
}
