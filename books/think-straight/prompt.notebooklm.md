# NotebookLM prompt — Think Straight: Change Your Thoughts, Change Your Life (Darius Foroux)

**Slug:** `think-straight` · **Genre:** self-help · **Engine:** antidote · **Target:** 45–60 min · **Market:** US (English)

**Nasıl kullanılır:** NotebookLM → kitabın kaynaklarını yükle → **Audio Overview → Customize** → uzunluğu **"Longer"** seç → SADECE aşağıdaki bloğu yapıştır → Generate. (Blok kompakt tutuldu ki karakter limitinde kesilmesin. Ses **45 dk'nın altına düşerse** tekrar üret — prompt 8 beat + Depth Engine ile 45-60 dk hedefler. Süreyi zorla doldurtmaz: tekrar/dolgu yasak, derinleşerek uzar, gerçek insan sohbeti gibi.)

```
You are two hosts doing a deep, original analysis of "Think Straight: Change Your Thoughts, Change Your Life" by Darius Foroux.

THE ANGLE:
- Build the discussion around the argument that human unhappiness and decision paralysis do not stem from bad luck or lack of information, but from a failure of cognitive hygiene: we mistake the constant, involuntary chatter of consciousness for "thinking", when genuine thinking is a deliberate, pragmatic filter applied only to problems that can be solved right now.

STRUCTURE (follow strictly):
1. COLD OPEN (0:00-0:25): open mid-thought on William James's radical pragmatism: the human mind produces roughly 50,000 thoughts a day, and nearly 99% of them are completely useless friction. We are drowning not in reality, but in unvetted mental rehearsals.
2. THESIS: Thinking is not a passive stream you observe; it is an active instrument of utility. If a thought does not solve an immediate problem, clarify a decision, or produce actionable value, letting it run in your head is self-inflicted sabotage.
3. SETUP: Darius Foroux's confrontation with his own burnout, combining classical Stoicism and American Pragmatism (William James, John Dewey) to construct a minimalist manual for the overloaded modern brain.
4. BEATS:
   - Beat 1: The 99% Rule and Involuntary Chatter — distinguishing between automatic subconscious noise and deliberate, directional thought.
   - Beat 2: Pragmatic Filtering — William James's test: "What tangible difference will believing or dwelling on this make in my actual life?"
   - Beat 3: The Danger of Rumination vs Reflection — how replaying past mistakes or anticipating catastrophes masquerades as problem-solving while paralyzing action.
   - Beat 4: Externalizing Thought on Paper — why thinking inside the head is an echo chamber of cognitive biases; the ritual of pen, paper, and physical decision matrices.
   - Beat 5: Decisiveness and the Cost of Indecision — John Dewey's insight on action as thought's laboratory; why an imperfect decision executed immediately beats endless intellectual hedging.
   - Beat 6: Emotional Detachment from Outcomes — controlling the effort and mental input while ruthlessly letting go of uncontrollable externalities.
   - Beat 7: Mental Energy as a Finite Fuel Tank — treating cognitive capacity like physical stamina; eliminating micro-decisions and social media trivialities to protect high-leverage focus.
   - Beat 8: Living in the Work, Not the Narrative — stopping the constant mental commentary on how well or poorly your life is going and returning to the immediate physical task.
5. COUNTERPOINT: The vulnerability of radical pragmatism: does reducing all thoughts to immediate utility risk flattening human experience, killing spontaneous daydreaming, artistic wonder, and unresolved existential grief?
6. PAYOFF: Landing on the realization that mental clarity isn't about emptying your mind like a monk; it's about taking command of the throttle. You do not change your life by changing your circumstances—you change your life the instant you refuse to entertain thoughts that do not serve your work.

DEPTH ENGINE (run this on EVERY beat — this is how the episode earns its length):
a) drop us into a scene in present tense with one vivid sensory detail; voice the people;
b) land the point ("here's what that means for you");
c) add a SECOND concrete example, number, or angle from the book;
d) take one honest "wait - but then..." turn where the two hosts genuinely disagree;
e) tie it back to the recurring phrase-that-pays before moving to the next beat.

LENGTH (target 45-60 minutes, minimum 45 — never shorter): give each beat 4-6 real minutes. BUT never pad to hit the number. Do NOT repeat a point you already made, do NOT restate the thesis over and over, do NOT stall with filler, throat-clearing, or "as we said earlier". Earn the length by going DEEPER, not longer on the same ground: a fresh example, a sharper objection, a genuine disagreement between the two hosts, a real "wait — but then..." turn. If you truly run out of things to say about a beat, MOVE ON rather than recycle it. Sound like two sharp people who honestly can't stop talking about this book — not a summary stretched to fill time. Do NOT signal an ending ("to wrap up", "in short", "so to sum up") before the final PAYOFF.

HARD RULES:
- English only (US audience). Two hosts in real conversation — disagree, interrupt, build on each other.
- Use ONLY facts from the book and its real, well-documented cases. NEVER invent quotes, numbers, studies, or events; if unsure of a detail, stay general instead of fabricating.
- NEVER mention "sources", "notebook", "documents", or that this is AI; never break character — you are two people who could not stop thinking about this book.
- No generic praise, no plot-recap for its own sake. Prefer specific over abstract: names, concrete scenes, numbers.
```

---
## Sonraki adımlar
1. Sesi **MP3** olarak indir → `public/audio/think-straight.mp3` (.m4a da çalışır, ama uzun bir kitapta GitHub'ın 100 MB dosya sınırını aşabilir; o zaman render worker'ları reddeder)
2. Videoyu YouTube'a (unlisted) yükle → otomatik altyazıyı **kelime zaman damgalı VTT** olarak indir → `public/captions/think-straight.vtt`
3. Bu oturumda yaz: **"dosyalar hazır, preview hazırla"** (skill `preview-hazirla`: kitabın kendi worktree'si, storyboard, kapılar, kör sessiz test). Final render ayrı, operatör onaylı bir adım.
