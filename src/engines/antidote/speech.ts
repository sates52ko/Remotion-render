/**
 * speech.ts — the narration drives the body (Film Flow slice 1, 2026-11-12).
 *
 * The rig's `talk` flapped its mouth on a sine wave, through pauses and all, and gestured on another sine. The film
 * already knows every word and when it is said (config.captions[].words, in frames): this module turns that into what
 * a speaking body does — the mouth opens on the words and closes in the gaps, the head and brows mark the start of a
 * phrase, and a hand stroke PEAKS on the stressed word (it starts before it). No loops: when nobody speaks, nothing moves.
 *
 * Pure functions of (words, frame): a frame rendered alone on any worker draws the same body. No remotion import, so
 * scripts/test-speech.js loads it directly.
 *
 * Adapted from AI-Video-Factory (MIT, Copyright (c) 2026 Ersin KOÇ): packages/video/src/beats.ts (speech beats, pulse,
 * stroke timing) and visemes.ts (letter-weighted mouth shapes; its letter table was tuned for Turkish, this one is for
 * English spelling). See THIRD_PARTY_NOTICES.md.
 */

export type Word = { w: string; s: number; e: number };
export type Beat = { frame: number; strength: number; phrase: boolean };
export type Speech = { words: Word[]; beats: Beat[]; phrases: Beat[]; strokes: Beat[]; fps: number };
export type Voice = {
  /** 0 → 1: somebody is saying a word on this frame */
  speaking: number;
  /** 0 closed → 1 wide open */
  mouth: number;
  /** 0 → 1 → 0 around the start of a phrase or a long word (head) */
  nod: number;
  /** 0 → 1 → 0 around the start of a phrase (brows) */
  brow: number;
  /** 0 → 1 → 0: a hand stroke that is at 1 ON the stressed word */
  stroke: number;
  /** which stroke this is (alternates the hand) */
  strokeIndex: number;
};

export const SILENT: Voice = { speaking: 0, mouth: 0, nod: 0, brow: 0, stroke: 0, strokeIndex: 0 };

// timing, in milliseconds (the source's constants)
export const PHRASE_GAP_MS = 250; // a word after a pause this long starts a phrase
export const BEAT_MIN_MS = 700; // two beats are never closer
export const STROKE_MIN_MS = 2200; // two hand strokes are never closer
export const LEAD_MS = 80; // the body moves a little before the word
export const NOD_MS = 380;
export const BROW_MS = 650;
export const STROKE = { prep: 350, hold: 500, retract: 450 };
export const REST_GAP_MS = 140; // a gap longer than this closes the mouth

/** How open the mouth is for a letter (0 closed … 1 wide). Lips meet on m / b / p. */
const OPEN: Record<string, number> = { a: 1, e: 0.72, i: 0.45, y: 0.45, o: 0.8, u: 0.5, w: 0.5, m: 0, b: 0, p: 0, f: 0.18, v: 0.18, l: 0.42 };
const VOWEL = /[aeiouy]/;
const openOf = (ch: string) => (ch in OPEN ? OPEN[ch] : 0.34);

const syllables = (w: string) => (w.toLowerCase().replace(/[^a-z]/g, "").replace(/e\b/, "").match(/[aeiouy]+/g) || []).length;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Every word of the film in order (captions can repeat a word at a line break: kept once). */
export function wordsOf(captions: Array<{ words?: Word[] }> | undefined): Word[] {
  const out: Word[] = [];
  for (const c of captions || []) for (const w of c.words || []) {
    if (!w || !(w.e > w.s) || !String(w.w || "").trim()) continue;
    const last = out[out.length - 1];
    if (last && w.s < last.e && w.w === last.w) continue;
    out.push({ w: String(w.w), s: w.s, e: w.e });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** Phrase starts (after a pause) are strong beats; a long word inside a phrase is a weak one. */
export function speechBeats(words: Word[], fps: number): Beat[] {
  const ms = (f: number) => (f / fps) * 1000;
  const raw: Beat[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const phrase = !prev || ms(w.s - prev.e) >= PHRASE_GAP_MS;
    if (phrase) raw.push({ frame: w.s, strength: 1, phrase: true });
    else if (syllables(w.w) >= 4) raw.push({ frame: w.s, strength: 0.6, phrase: false });
  });
  const out: Beat[] = [];
  for (const b of raw) {
    const last = out[out.length - 1];
    if (last && ms(b.frame - last.frame) < BEAT_MIN_MS) { if (b.strength > last.strength) out[out.length - 1] = b; continue; }
    out.push(b);
  }
  return out;
}

/** Hand strokes: phrase starts only, well apart. */
export function strokeBeats(beats: Beat[], fps: number): Beat[] {
  const out: Beat[] = [];
  for (const b of beats) {
    if (!b.phrase) continue;
    const last = out[out.length - 1];
    if (last && ((b.frame - last.frame) / fps) * 1000 < STROKE_MIN_MS) continue;
    out.push(b);
  }
  return out;
}

export function buildSpeech(captions: Array<{ words?: Word[] }> | undefined, fps: number): Speech {
  const words = wordsOf(captions), beats = speechBeats(words, fps);
  return { words, beats, phrases: beats.filter((b) => b.phrase), strokes: strokeBeats(beats, fps), fps };
}

/** index of the last item whose `key` is ≤ x (-1 when none) */
function lastAtOrBefore<T>(xs: T[], x: number, key: (t: T) => number): number {
  let lo = 0, hi = xs.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (key(xs[mid]) <= x) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at;
}

/** The mouth for one word at `frame`: its letters share the word's time, vowels longer than consonants. */
function mouthInWord(w: Word, frame: number): number {
  const letters = w.w.toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return 0.3;
  const weights = [...letters].map((ch) => (VOWEL.test(ch) ? 1.6 : 1));
  const total = weights.reduce((s, x) => s + x, 0);
  const at = ((frame - w.s) / Math.max(1, w.e - w.s)) * total;
  let acc = 0;
  for (let i = 0; i < letters.length; i++) {
    const next = acc + weights[i];
    if (at < next || i === letters.length - 1) {
      // glide from the previous letter's shape so the mouth never jumps
      const k = smooth((at - acc) / weights[i] / 0.6);
      const prev = i > 0 ? openOf(letters[i - 1]) : 0.15;
      return prev + (openOf(letters[i]) - prev) * k;
    }
    acc = next;
  }
  return 0;
}

/** A bump that starts LEAD_MS before the beat and lasts `ms`. */
function pulse(beats: Beat[], frame: number, fps: number, ms: number): number {
  const lead = (LEAD_MS / 1000) * fps, dur = (ms / 1000) * fps;
  const i = lastAtOrBefore(beats, frame + lead, (b) => b.frame);
  if (i < 0) return 0;
  const k = (frame + lead - beats[i].frame) / dur;
  return k >= 0 && k <= 1 ? Math.sin(Math.PI * k) * beats[i].strength : 0;
}

/** The hand: prepares before the word, is fully out ON it, holds, retracts. */
function strokeAt(strokes: Beat[], frame: number, fps: number): { stroke: number; index: number } {
  const f = (ms: number) => (ms / 1000) * fps;
  const prep = f(STROKE.prep), hold = f(STROKE.hold), retract = f(STROKE.retract);
  // the stroke whose window [beat - prep, beat + hold + retract] holds this frame
  const i = lastAtOrBefore(strokes, frame + prep, (b) => b.frame);
  if (i < 0) return { stroke: 0, index: 0 };
  const d = frame - strokes[i].frame;
  if (d < -prep || d > hold + retract) return { stroke: 0, index: i };
  if (d < 0) return { stroke: smooth((d + prep) / prep), index: i };
  if (d <= hold) return { stroke: 1, index: i };
  return { stroke: 1 - smooth((d - hold) / retract), index: i };
}

/** The mouth shape the words ask for on `frame`, and whether a word is being said. */
function rawMouth(speech: Speech, frame: number): { mouth: number; speaking: number } {
  const { words, fps } = speech;
  const i = lastAtOrBefore(words, frame, (w) => w.s);
  if (i < 0) return { mouth: 0, speaking: 0 };
  const w = words[i], next = words[i + 1];
  if (frame < w.e) return { mouth: mouthInWord(w, frame), speaking: 1 };
  // between two words: stay a little open through a short gap, close through a pause
  const gap = next ? ((next.s - w.e) / fps) * 1000 : Infinity;
  if (gap <= REST_GAP_MS) return { mouth: 0.22, speaking: 1 };
  return { mouth: 0.22 * (1 - smooth((frame - w.e) / ((REST_GAP_MS / 1000) * fps))), speaking: 0 };
}

/** What a speaking body does on `frame` (absolute film frame). */
export function voiceAt(speech: Speech | null | undefined, frame: number): Voice {
  if (!speech || !speech.words.length) return SILENT;
  const { beats, phrases, strokes, fps } = speech;
  // a jaw has weight: the shape is eased over the neighbouring frames, so a fast word never flickers
  const now = rawMouth(speech, frame);
  const mouth = (rawMouth(speech, frame - 1).mouth + 2 * now.mouth + rawMouth(speech, frame + 1).mouth) / 4;
  const speaking = now.speaking;
  const st = strokeAt(strokes, frame, fps);
  return { speaking, mouth, nod: pulse(beats, frame, fps, NOD_MS), brow: pulse(phrases, frame, fps, BROW_MS), stroke: st.stroke, strokeIndex: st.index };
}
