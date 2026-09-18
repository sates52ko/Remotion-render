// SRT / VTT Parser - converts subtitle files to caption objects

export interface Caption {
    index: number;
    startTime: number; // in seconds
    endTime: number;   // in seconds
    text: string;
    words?: Word[];
}

export interface Word {
    text: string;
    startTime: number;
    endTime: number;
}

/**
 * Parse SRT timestamp to seconds
 * Format: "00:01:23,456" -> 83.456
 */
const parseTimestamp = (timestamp: string): number => {
    const cleaned = timestamp.trim();
    // Handle both comma (SRT) and period (VTT) separators
    const [time, ms] = cleaned.split(/[,.]/);
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000;
};

/**
 * Parse SRT content to Caption array
 */
export const parseSRT = (srtContent: string): Caption[] => {
    const captions: Caption[] = [];

    // Normalize line endings and split by double newline
    const blocks = srtContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim()
        .split(/\n\n+/);

    for (const block of blocks) {
        const lines = block.split('\n').filter(line => line.trim());

        if (lines.length < 3) continue;

        const index = parseInt(lines[0], 10);
        if (isNaN(index)) continue;

        const timeParts = lines[1].split(' --> ');
        if (timeParts.length !== 2) continue;

        const startTime = parseTimestamp(timeParts[0].trim());
        const endTime = parseTimestamp(timeParts[1].trim());

        const text = lines.slice(2).join(' ').trim();

        // Generate word timings (linear interpolation)
        const words = generateWordTimings(text, startTime, endTime);

        captions.push({
            index,
            startTime,
            endTime,
            text,
            words,
        });
    }

    return captions;
};

/**
 * Parse YouTube-style VTT content to Caption array.
 *
 * YouTube VTT emits PAIRS of blocks for each caption segment:
 *   Block A – has inline <c> word-timing tags (the actual data)
 *   Block B – a "clean" duplicate 10ms later with plain text only
 *
 * Strategy:
 *   1. Only keep blocks that contain inline <c> tags (Block A).
 *   2. From each Block A, extract ONLY the new words (the first line
 *      is a repeat of the previous caption text; skip it).
 *   3. After parsing, sort by startTime and enforce strictly monotonic
 *      word timings so Remotion's interpolate() never crashes.
 */
export const parseVTT = (vttContent: string): Caption[] => {
    const captions: Caption[] = [];

    const blocks = vttContent
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split(/\n\n+/);

    let captionIdx = 0;

    for (const block of blocks) {
        const lines = block.trim().split('\n');

        // Find the timestamp line
        const timeLine = lines.find(l => l.includes('-->'));
        if (!timeLine) continue;

        const timeMatch = timeLine.match(
            /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/
        );
        if (!timeMatch) continue;

        const startTime = parseTimestamp(timeMatch[1]);
        const endTime = parseTimestamp(timeMatch[2]);

        // Skip tiny 10ms "snapshot" blocks (duration ≤ 0.02s)
        if (endTime - startTime <= 0.02) continue;

        // Gather text lines after the timestamp
        const timeLineIdx = lines.indexOf(timeLine);
        const textLines = lines.slice(timeLineIdx + 1);
        const rawText = textLines.join(' ');

        // Only process blocks that have inline <c> timing tags
        const hasInlineTiming = /<\d{2}:\d{2}:\d{2}\.\d{3}><c>/.test(rawText);
        if (!hasInlineTiming) continue;

        // ── Extract the NEW line (the line with <c> tags) ─────────────
        // YouTube VTT pattern: first text line = previous caption text,
        // second text line = new words with timing tags.
        // We only want the second line's words.
        const lastTextLine = textLines[textLines.length - 1] || rawText;

        const words: Word[] = [];
        const inlineTimingRegex = /<(\d{2}:\d{2}:\d{2}\.\d{3})><c>(.*?)<\/c>/g;
        let match;

        // Leading text before the first timing tag on this line
        const beforeFirstTag = lastTextLine.split(/<\d{2}:\d{2}:\d{2}\.\d{3}>/)[0]
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();
        if (beforeFirstTag) {
            words.push({
                text: beforeFirstTag,
                startTime: startTime,
                endTime: startTime + 0.1, // Small starting duration
            });
        }

        while ((match = inlineTimingRegex.exec(lastTextLine)) !== null) {
            const wordTime = parseTimestamp(match[1]);
            const wordText = match[2].replace(/<[^>]*>/g, '').trim();

            // Fix previous word's endTime
            if (words.length > 0) {
                words[words.length - 1].endTime = wordTime;
            }

            if (wordText) {
                words.push({
                    text: wordText,
                    startTime: wordTime,
                    endTime: endTime,
                });
            }
        }

        // Fix last word endTime
        if (words.length > 0) {
            words[words.length - 1].endTime = endTime;
        }

        // Build clean text from just the extracted words
        const cleanText = words.map(w => w.text).join(' ').trim();
        if (!cleanText) continue;

        captionIdx++;

        captions.push({
            index: captionIdx,
            startTime,
            endTime,
            text: cleanText,
            words,
        });
    }

    // ── Sort by startTime ────────────────────────────────────────────
    captions.sort((a, b) => a.startTime - b.startTime);

    // ── Enforce strictly monotonic word timings across ALL captions ──
    // Remotion's interpolate() requires strictly increasing inputRange.
    let lastWordEnd = 0;
    const EPSILON = 0.001; // 1ms bump
    for (const cap of captions) {
        if (!cap.words) continue;
        for (const w of cap.words) {
            if (w.startTime <= lastWordEnd) {
                w.startTime = lastWordEnd + EPSILON;
            }
            if (w.endTime <= w.startTime) {
                w.endTime = w.startTime + EPSILON;
            }
            lastWordEnd = w.endTime;
        }
        // Update caption-level times to match
        cap.startTime = cap.words[0].startTime;
        cap.endTime = cap.words[cap.words.length - 1].endTime;
    }

    return captions;
};

/**
 * Auto-detect format (SRT vs VTT) and parse accordingly.
 */
export const parseCaptions = (content: string): Caption[] => {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('WEBVTT')) {
        return parseVTT(content);
    }
    return parseSRT(content);
};

/**
 * Generate estimated word timings using length weighting
 */
const generateWordTimings = (text: string, startTime: number, endTime: number): Word[] => {
    const wordList = text.split(/\s+/).filter(w => w.length > 0);
    const duration = endTime - startTime;

    // Weight words by length so longer words take up proportionately more time
    const totalChars = wordList.reduce((sum, word) => sum + word.length, 0);

    let currentTime = startTime;
    return wordList.map((word) => {
        // Base duration by proportion of characters
        const wordRatio = totalChars > 0 ? (word.length / totalChars) : (1 / wordList.length);
        const wordDuration = wordRatio * duration;

        const sTime = currentTime;
        const eTime = currentTime + wordDuration;
        currentTime = eTime;

        return {
            text: word,
            startTime: sTime,
            endTime: eTime,
        };
    });
};

/**
 * Get the active caption at a specific time
 */
export const getCaptionAtTime = (captions: Caption[], timeInSeconds: number): Caption | null => {
    return captions.find(
        caption => timeInSeconds >= caption.startTime && timeInSeconds <= caption.endTime
    ) || null;
};

/**
 * Get active word index within a caption
 */
export const getActiveWordIndex = (caption: Caption, timeInSeconds: number): number => {
    if (!caption.words || caption.words.length === 0) return -1;

    for (let i = 0; i < caption.words.length; i++) {
        // give a tiny buffer for float precision
        if (timeInSeconds >= caption.words[i].startTime - 0.01 && timeInSeconds <= caption.words[i].endTime + 0.01) {
            return i;
        }
    }

    // if we are past the last word due to precision
    if (timeInSeconds > caption.words[caption.words.length - 1].endTime) {
        return caption.words.length - 1;
    }

    // if we are before the first word
    return 0;
};

// ─── @remotion/captions integration ───────────────────────────────────────────

import type { Caption as RemotionCaption } from '@remotion/captions';

/**
 * Convert our SRT-parsed Caption[] to @remotion/captions Caption[] format.
 *
 * @remotion/captions uses milliseconds and a `confidence` field.
 * Tokens = individual words with fromMs/toMs.
 *
 * Usage:
 *   import { parseSRT, srtToRemotionCaptions } from '../utils/srtParser';
 *   import { createTikTokStyleCaptions } from '@remotion/captions';
 *
 *   const srtCaptions = parseSRT(srtContent);
 *   const remotionCaptions = srtToRemotionCaptions(srtCaptions);
 *   const { pages } = createTikTokStyleCaptions({
 *       captions: remotionCaptions,
 *       combineTokensWithinMilliseconds: 1500,
 *   });
 */
export const srtToRemotionCaptions = (captions: Caption[]): RemotionCaption[] => {
    const result: RemotionCaption[] = [];

    for (const caption of captions) {
        if (caption.words && caption.words.length > 0) {
            // Emit one RemotionCaption per word so createTikTokStyleCaptions
            // can build proper word-level tokens for highlighting.
            // Leading space before every word except the first in each block
            // acts as the delimiter for @remotion/captions.
            caption.words.forEach((word, i) => {
                result.push({
                    text: i === 0 ? word.text : ` ${word.text}`,
                    startMs: Math.round(word.startTime * 1000),
                    endMs: Math.round(word.endTime * 1000),
                    timestampMs: Math.round(word.startTime * 1000),
                    confidence: 1,
                } satisfies RemotionCaption);
            });
        } else {
            // Fallback: no word timings available, emit block as a single entry
            result.push({
                text: caption.text,
                startMs: Math.round(caption.startTime * 1000),
                endMs: Math.round(caption.endTime * 1000),
                timestampMs: Math.round(caption.startTime * 1000),
                confidence: 1,
            } satisfies RemotionCaption);
        }
    }

    return result;
};

