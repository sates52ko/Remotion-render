# NotebookLM prompt — The Choice Factory: 25 behavioural biases that influence what we buy (Richard Shotton)

**Slug:** `the-choice-factory` · **Genre:** business · **Engine:** antidote · **Target:** 45–60 min · **Market:** US (English)

**Nasıl kullanılır:** NotebookLM → kitabın kaynaklarını yükle → **Audio Overview → Customize** → uzunluğu **"Longer"** seç → SADECE aşağıdaki bloğu yapıştır → Generate. (Blok kompakt tutuldu ki karakter limitinde kesilmesin. Ses **45 dk'nın altına düşerse** tekrar üret — prompt 8 beat + Depth Engine ile 45-60 dk hedefler. Süreyi zorla doldurtmaz: tekrar/dolgu yasak, derinleşerek uzar, gerçek insan sohbeti gibi.)

```
You are two hosts doing a deep, original analysis of "The Choice Factory: 25 behavioural biases that influence what we buy" by Richard Shotton.

THE ANGLE:
- We do not make rational calculations in buying decisions; our purchasing choices are predictable heuristic shortcuts triggered by context, friction, and framing that marketers exploit every day.

STRUCTURE (follow strictly):
1. COLD OPEN (0:00-0:25): open mid-thought on the observation of a shopper hesitating before a supermarket shelf, completely unaware that their decision between two jars of coffee was decided three seconds ago by physical placement and price contrast. No greetings, no "welcome back", no "today we're looking at".
2. THESIS: Human buying behaviour is an irrational factory of mental shortcuts, where context, social validation, and friction systematically override price and product logic.
3. SETUP: Richard Shotton tracks an ordinary consumer navigating 25 daily decision moments, pitting behavioral psychology experiments (Kahneman, Tversky, Cialdini) against actual commercial advertising campaigns and field trials.
4. BEATS: 8 beats, each ONE specific claim from the book. DEVELOP each beat fully before moving on — do NOT list them quickly:
   - Beat 1: The Fundamental Attribution Error — why marketers obsess over target demographic profiles while completely ignoring the real driver: the buyer's immediate emotional and physical context.
   - Beat 2: Social Proof and the Power of Numbers — how showing existing popularity transforms hesitation into herd compliance, from beer brands to hotel towel reuse.
   - Beat 3: Negative Social Proof — the danger of warning consumers that "too many people are doing something wrong", which inadvertently licenses the bad behaviour.
   - Beat 4: Distinctiveness and the Von Restorff Effect — how standing out from category convention triggers memory recall and purchases, while fitting in guarantees invisibility.
   - Beat 5: The Pratfall Effect and Admitting Flaws — why brands like Guinness and Avis that openly confess a weakness become dramatically more believable, trustworthy, and appealing.
   - Beat 6: Anchoring and Price Relativity — how the arbitrary first number presented shapes perceived value, making luxury watches and expensive wine act as price decoys.
   - Beat 7: Effort and Friction — why removing micro-barriers converts more sales than massive ad budgets, and how ease beats persuasion.
   - Beat 8: The Scarcity Principle and Loss Aversion — how the psychological fear of missing out triggers irrational purchasing urgency faster than any product benefit.
5. COUNTERPOINT: When does behavioural nudge become manipulative deception, and do these 25 heuristics hold up in the long run once consumers become aware of the psychological machinery?
6. PAYOFF: We never buy products for what they inherently are; we buy the mental relief of letting a cognitive shortcut make the choice for us.

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
1. Sesi **MP3** olarak indir → `public/audio/the-choice-factory.mp3` (.m4a da çalışır, ama uzun bir kitapta GitHub'ın 100 MB dosya sınırını aşabilir; o zaman render worker'ları reddeder)
2. Videoyu YouTube'a (unlisted) yükle → otomatik altyazıyı **kelime zaman damgalı VTT** olarak indir → `public/captions/the-choice-factory.vtt`
3. Bu oturumda yaz: **"dosyalar hazır, preview hazırla"** (skill `preview-hazirla`: kitabın kendi worktree'si, storyboard, kapılar, kör sessiz test). Final render ayrı, operatör onaylı bir adım.
