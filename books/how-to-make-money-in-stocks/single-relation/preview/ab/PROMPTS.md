# Single-relation A/B — how-to-make-money-in-stocks (agents only; never tell an agent which version is new)

## 1. Answer key (ONE fresh agent, before any description is read)

```
You write an answer key for a reading-comprehension check. Read ONLY C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/key-input.json (scenes: id, narration, previousNarration). Open no other file. For each scene write what the NARRATION says (previous only as context). Write C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/answer-key.json as {"items":[{"id","understanding":"one sentence: what this moment says","cause":"what acts / the cause, in plain words","effect":"what changes / the result","supportsCausality":true|false,"asserted":"what the narration actually asserts","notAsserted":[{"text","why"}] (hypotheticals, negations, questions, quoted opinions that are NOT asserted),"keyFacts":["2-4 short facts"],"wrong":["3 plausible WRONG readings, incl. reversed cause/effect"]}]}. Be literal to the narration; do not invent. Reply in ≤ 2 lines.
```

## 2. Describers (2 fresh sonnet agents, one prompt each, in parallel)

```
You are a viewer of animated explainer videos about books, watching with the SOUND OFF. Open ONLY these 2 images, one at a time (they are 2 unrelated scenes). Folder: C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/blind/
e833a0d09e.png, 3d67ac1326.png
Each shows three moments of the same short scene, left to right (frame 1, frame 2, frame 3). Do not open any other file. Describe each image on its own; do not let one scene inform another.
Write ONLY a JSON array of 2 objects, one per image, to C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/desc/D1.json , each object:
{"img":"<the image file name without .png>","sees":["frame 1: …","frame 2: …","frame 3: …"],
 "changed":"what changed between frame 1 and frame 3 (or 'nothing')",
 "cause":"what caused that change, as you understand it (or 'unclear')",
 "effect":"what the result / consequence is (or 'unclear')",
 "message":"in one sentence, what you think the narrator is saying here",
 "wouldConfuse":"anything that could mislead a viewer, or 'none'"}
Describe only what is visible; if something is unclear, say so. Reply with one line: "written".
```

```
You are a viewer of animated explainer videos about books, watching with the SOUND OFF. Open ONLY these 2 images, one at a time (they are 2 unrelated scenes). Folder: C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/blind/
c2f82235e9.png, 517fab3c2a.png
Each shows three moments of the same short scene, left to right (frame 1, frame 2, frame 3). Do not open any other file. Describe each image on its own; do not let one scene inform another.
Write ONLY a JSON array of 2 objects, one per image, to C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/desc/D2.json , each object:
{"img":"<the image file name without .png>","sees":["frame 1: …","frame 2: …","frame 3: …"],
 "changed":"what changed between frame 1 and frame 3 (or 'nothing')",
 "cause":"what caused that change, as you understand it (or 'unclear')",
 "effect":"what the result / consequence is (or 'unclear')",
 "message":"in one sentence, what you think the narrator is saying here",
 "wouldConfuse":"anything that could mislead a viewer, or 'none'"}
Describe only what is visible; if something is unclear, say so. Reply with one line: "written".
```

## 3. Judges — run `single-relation-ab.js judge`, then the prompts it appends below
(4 fresh judge agents — pass 2 judges are different agents from pass 1)

```
Open ONLY C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-in/p1-J1.task.json and follow its "instructions" for its "items". Open no other file. Output path: C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-out-p1/J1.json . Reply with one line: "written".
```

```
Open ONLY C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-in/p1-J2.task.json and follow its "instructions" for its "items". Open no other file. Output path: C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-out-p1/J2.json . Reply with one line: "written".
```

```
Open ONLY C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-in/p2-J1.task.json and follow its "instructions" for its "items". Open no other file. Output path: C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-out-p2/J1.json . Reply with one line: "written".
```

```
Open ONLY C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-in/p2-J2.task.json and follow its "instructions" for its "items". Open no other file. Output path: C:/Users/savas/Cursor/Remotion/wt-book-how-to-make-money-in-stocks/books/how-to-make-money-in-stocks/single-relation/preview/ab/judge-out-p2/J2.json . Reply with one line: "written".
```
