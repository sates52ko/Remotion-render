# Own-drawing check — dracula (told v2)

Give this to a FRESH agent (model: sonnet) that has seen neither entities.json, the key file nor the book:

You are a blind rater. The folder C:\Users\savas\Cursor\Remotion\wt-book-dracula\books\dracula\storyboard\own-drawings holds 20 pictures, 01.png … 20.png, each a flat drawing from an animated explainer. Read them ONE AT A TIME, in order. For each, write in 1-3 words what it shows — the first thing a stranger would say (an object, an animal, a vehicle, a kind of place). Do not guess a story, do not open any other file. Write your answers to C:\Users\savas\Cursor\Remotion\wt-book-dracula\books\dracula\storyboard\own-drawings.answers.json as JSON: { "1": "<words>", "2": "<words>", … } and reply with the same lines.

Then: node scripts/own-icons-sheet.js --slug=dracula --judge=C:\Users\savas\Cursor\Remotion\wt-book-dracula\books\dracula\storyboard\own-drawings.answers.json
It compares each name with the readings accepted in entities.json ("reads") and writes own-drawings.verdict.json. Redraw every drawing read as something else and run this sheet again — a told beat that uses it is refused at merge. Never add the misreading to "reads".
