# Readcheck — the-creative-curve (273 beats, 2 blind readers)

Launch every blind reader in ONE message (parallel, model: sonnet). Readers must be fresh agents that did not author the storyboard. Then:

    node scripts/readcheck.js judge --slug=the-creative-curve

### Blind reader 1
You are a blind rater. Read ONLY C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\visible-1.json — do not open any other file in the repository.
Each entry describes exactly what a viewer with the SOUND OFF sees on screen during one moment of an animated explainer video: the people (how they look, their face, body pose, what they hold), an icon (as drawn), the place, the words on screen, a diagram. You do not know the book.
For EACH entry write "guess": what is the narrator saying at this moment, one sentence, from these elements only; and "misleading": the element most likely to send a viewer the wrong way, or "none".
Write ONLY a JSON array [{"id":"b001","guess":"...","misleading":"..."}, ...] to C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\guess-1.json. Validate it parses and has 140 entries. Reply with one line: "written 140".

### Blind reader 2
You are a blind rater. Read ONLY C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\visible-2.json — do not open any other file in the repository.
Each entry describes exactly what a viewer with the SOUND OFF sees on screen during one moment of an animated explainer video: the people (how they look, their face, body pose, what they hold), an icon (as drawn), the place, the words on screen, a diagram. You do not know the book.
For EACH entry write "guess": what is the narrator saying at this moment, one sentence, from these elements only; and "misleading": the element most likely to send a viewer the wrong way, or "none".
Write ONLY a JSON array [{"id":"b001","guess":"...","misleading":"..."}, ...] to C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\guess-2.json. Validate it parses and has 133 entries. Reply with one line: "written 133".

## Judges (fresh agents, model: sonnet, parallel). Then: node scripts/readcheck.js tally --slug=the-creative-curve

### Judge 1
Read ONLY C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\judge-1.json. Each item has the narration spoken at a moment, what was on screen, and what a blind viewer (sound off) guessed the narrator was saying.
For each item decide "correctness": CORRECT (the guess carries the narration's meaning), NEUTRAL (vague, neither right nor contradicting), WRONG (the viewer would believe something different or opposite); "blame": which on-screen element caused a non-CORRECT reading (icon / people / face / body / words / diagram / place / nothing-fits), and "why" in one sentence.
Judge meaning, not wording. Write ONLY a JSON array [{"id":"b001","correctness":"...","blame":"...","why":"..."}, ...] to C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\verdict-1.json. Validate it parses and has 140 entries. Reply with one line: "written 140".

### Judge 2
Read ONLY C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\judge-2.json. Each item has the narration spoken at a moment, what was on screen, and what a blind viewer (sound off) guessed the narrator was saying.
For each item decide "correctness": CORRECT (the guess carries the narration's meaning), NEUTRAL (vague, neither right nor contradicting), WRONG (the viewer would believe something different or opposite); "blame": which on-screen element caused a non-CORRECT reading (icon / people / face / body / words / diagram / place / nothing-fits), and "why" in one sentence.
Judge meaning, not wording. Write ONLY a JSON array [{"id":"b001","correctness":"...","blame":"...","why":"..."}, ...] to C:\Users\savas\Cursor\Remotion\wt-book-the-creative-curve\books\the-creative-curve\storyboard\readcheck\verdict-2.json. Validate it parses and has 133 entries. Reply with one line: "written 133".
