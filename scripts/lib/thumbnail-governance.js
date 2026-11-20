"use strict";

// Channel-level guardrails. A thumbnail is metadata, so its promise must be
// both distinct in the browse feed and supportable by the actual video copy.
const fs = require("fs");
const path = require("path");

const GENERIC_HOOKS = new Set([
  "the hidden truth", "the real secret", "the big secret", "the turning point",
  "the real enemy", "who wins", "power corrupts", "who controls you",
  "who should rule", "the fatal choice", "don't be fooled", "they lied to us",
]);
const SENSATIONAL_TERMS = /\b(shocking|insane|unbelievable|exposed|destroyed|banned|secret|they hid|they lied)\b/i;
const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "this", "that", "your", "you", "why", "who", "what", "when", "how", "vs"]);

const normalize = (value = "") => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const words = (value = "") => normalize(value).split(" ").filter((word) => word.length > 2 && !STOP_WORDS.has(word));

function loadChannelHistory(root, excludeSlug) {
  const booksDir = path.join(root, "books");
  if (!fs.existsSync(booksDir)) return [];
  return fs.readdirSync(booksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== excludeSlug)
    .map((entry) => {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(booksDir, entry.name, "youtube-meta.json"), "utf8"));
        const thumb = meta.thumbnail || {};
        return { slug: entry.name, hook: thumb.hook || "", layout: thumb.layout || "", angle: thumb.angle || "", style: thumb.style || "", title: meta.title || "" };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function distinctiveness(hook, layout, angle, history) {
  const hookKey = normalize(hook);
  const exactHookRepeat = history.some((item) => normalize(item.hook) === hookKey);
  const recent = history.slice(-12);
  const layoutUses = recent.filter((item) => item.layout === layout).length;
  const angleUses = recent.filter((item) => item.angle === angle).length;
  return {
    exactHookRepeat,
    layoutUses,
    angleUses,
    score: Math.max(0, 1 - (exactHookRepeat ? 0.8 : 0) - layoutUses * 0.06 - angleUses * 0.04),
  };
}

function assessHook({ hook, evidence = "", title = "", history = [], layout = "", angle = "" }) {
  const normalized = normalize(hook);
  const hookWords = words(hook);
  const evidenceWords = new Set(words(evidence));
  const titleWords = new Set(words(title));
  const groundedWords = hookWords.filter((word) => evidenceWords.has(word));
  const titleOverlap = hookWords.filter((word) => titleWords.has(word));
  const novelty = distinctiveness(hook, layout, angle, history);
  const reasons = [];
  if (!hook || hook.trim().split(/\s+/).length > 5) reasons.push("Hook must be 1–5 words.");
  if (GENERIC_HOOKS.has(normalized)) reasons.push("Generic hook; replace it with a book-specific promise.");
  if (SENSATIONAL_TERMS.test(hook)) reasons.push("Sensational claim needs explicit editorial approval.");
  if (novelty.exactHookRepeat) reasons.push("Exact hook already appears elsewhere on the channel.");
  if (hookWords.length >= 2 && groundedWords.length === 0) reasons.push("No meaningful hook word is evidenced by the title, description, or chapters.");
  if (hookWords.length && titleOverlap.length / hookWords.length > 0.75) reasons.push("Hook merely repeats the title.");
  return {
    ok: reasons.length === 0,
    reasons,
    groundedWords,
    novelty,
    evidence: evidence.slice(0, 240),
  };
}

module.exports = { loadChannelHistory, distinctiveness, assessHook, normalize };
