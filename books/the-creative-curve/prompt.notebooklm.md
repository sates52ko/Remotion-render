# NotebookLM prompt — The Creative Curve: How to Develop the Right Idea at the Right Time (Allen Gannett)

**Slug:** `the-creative-curve` · **Genre:** business · **Engine:** antidote · **Target:** 45–60 min · **Market:** US (English)

**Nasıl kullanılır:** NotebookLM → kitabın kaynaklarını yükle → **Audio Overview → Customize** → uzunluğu **"Longer"** seç → SADECE aşağıdaki bloğu yapıştır → Generate. (Blok kompakt tutuldu ki karakter limitinde kesilmesin. Ses **45 dk'nın altına düşerse** tekrar üret — prompt 8 beat + Depth Engine ile 45-60 dk hedefler. Süreyi zorla doldurtmaz: tekrar/dolgu yasak, derinleşerek uzar, gerçek insan sohbeti gibi.)

```
You are two hosts doing a deep, original analysis of "The Creative Curve: How to Develop the Right Idea at the Right Time" by Allen Gannett.

THE ANGLE:
- Thesis: Commercial creativity is not divine inspiration; it is an engineered collision between human longing for safety and our craving for novelty, mastered through four repeatable habits along the bell curve of adoption.

STRUCTURE (follow strictly):
1. COLD OPEN (0:00-0:25): Open mid-sentence debating why Mozart was not born a musical demigod but an intensely manufactured prodigy whose early work was derivative practice curated by a stage-father, shattering the cult of natural genius.
2. THESIS: State the argument: commercial hits survive on an exact curve where maximum novelty meets maximum familiarity, and timing beats raw talent.
3. SETUP: Introduce Gannett's exploration of neuroscience and hitmakers—from Ben & Jerry’s flavor labs to pop producers—facing the terror of being either boring copycats or ignored avant-garde exiles.
4. BEATS:
   - Beat 1: The Divine Genius Lie — Why sudden epiphany myths paralyze creators, while brain scans prove breakthroughs are unconscious synthesis of stored data.
   - Beat 2: The Two Appetites — The evolutionary tension between neophilia (seeking new things) and neophobia (fearing the unknown), creating the bell curve.
   - Beat 3: The Sweet Spot of Familiar Novelty — Why early ideas fail as confusing and late ones fail as clichés; hitting the peak requires 90% familiarity with a 10% twist.
   - Beat 4: Law 1: Consumption (The 20% Rule) — Why top innovators dedicate 20% of work hours to raw domain intake to fuel intuitive pattern recognition.
   - Beat 5: Law 2: Imitation & Classic Structures — Why bestselling novelists and hitmakers dissect and mirror archetypes before applying their distinctive voice.
   - Beat 6: Law 3: Creative Communities — The four roles behind breakthroughs: the Master Teacher, the Confidant, the Modern Muse, and the Prominent Promoter.
   - Beat 7: Law 4: Rapid Iteration & Data Feedback — How testing micro-prototypes and measuring audience reactions turns lucky strikes into repeatable systems.
   - Beat 8: The Downslope: Creative Fatigue — Navigating saturation and diminishing returns when an icon slips from beloved novelty into overexposed parody.
5. COUNTERPOINT: Address genuine pushback: does engineering around familiarity risk sterilizing bold art into predictable algorithmic corporate sludge?
6. PAYOFF: Reframe the debate: genius is never lightning striking empty ground—it is a gardener engineering the soil until the bloom looks miraculous.

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
1. Sesi **MP3** olarak indir → `public/audio/the-creative-curve.mp3` (.m4a da çalışır, ama uzun bir kitapta GitHub'ın 100 MB dosya sınırını aşabilir; o zaman render worker'ları reddeder)
2. Videoyu YouTube'a (unlisted) yükle → otomatik altyazıyı **kelime zaman damgalı VTT** olarak indir → `public/captions/the-creative-curve.vtt`
3. Bu oturumda yaz: **"dosyalar hazır, preview hazırla"** (skill `preview-hazirla`: kitabın kendi worktree'si, storyboard, kapılar, kör sessiz test). Final render ayrı, operatör onaylı bir adım.
