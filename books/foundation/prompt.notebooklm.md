# NotebookLM prompt — Foundation (Isaac Asimov)

**Slug:** `foundation` · **Genre:** science fiction · **Engine:** antidote · **Target:** 45–60 min · **Market:** US (English)

**Nasıl kullanılır:** NotebookLM → kitabın kaynaklarını yükle → **Audio Overview → Customize** → uzunluğu **"Longer"** seç → SADECE aşağıdaki bloğu yapıştır → Generate. (Blok kompakt tutuldu ki karakter limitinde kesilmesin. Ses **45 dk'nın altına düşerse** tekrar üret — prompt 8 beat + Depth Engine ile 45-60 dk hedefler. Süreyi zorla doldurtmaz: tekrar/dolgu yasak, derinleşerek uzar, gerçek insan sohbeti gibi.)

```
You are two hosts doing a deep, original analysis of "Foundation" by Isaac Asimov.

THE ANGLE:
- THESIS: Asimov's Foundation is not about heroes. It is about a crowd that never sees its own future: a whole civilization is steered by a mathematician's prediction of masses, and the drama is what that does to the individuals who must act inside a plan they cannot read.

STRUCTURE (follow strictly):
1. COLD OPEN (0:00-0:25): open mid-thought on this: a galaxy-spanning empire is dying, and a man has already calculated the exact century its fall will take. No greetings, no "welcome back", no "today we're looking at".
2. THESIS: state the one argument this whole discussion will prove.
3. SETUP: Hari Seldon, a mathematician who founded psychohistory: a statistics of huge populations that can forecast events but not individuals. Trantor, the imperial capital that covers a whole world. The Encyclopedists, exiled to the far edge of the galaxy at Terminus to preserve knowledge for a thousand years of darkness. The stake: a Galactic Empire collapsing into barbarism, and a plan whose success depends on crises going the way Seldon predicted.
4. BEATS: 8 beats, each ONE specific claim from the book. Open each beat by asking, in one plain sentence, the question it answers. DEVELOP each beat fully before moving on — do NOT list them quickly.
   Beat 1: Seldon's recorded lecture in a dim hall, a hologram that speaks to people who cannot change what he says. Why a forecast of crowds beats individual cleverness.
   Beat 2: Terminus at the start. The Encyclopedists are supposed to be scholars, yet they become the most powerful people nearby. How technical skill becomes political power.
   Beat 3: Salvor Hardin's trick with the religion of the old world: the Foundation makes a belief in its own power work as power. Is belief a tool or a trap?
   Beat 4: The first Seldon crisis. Each crisis message is written to be read only at the right moment. What is it like to wait for a message you cannot open early?
   Beat 5: The trading kingdoms around Terminus, and the Foundation's trade in energy and goods. Who rules a region that depends on your machines?
   Beat 6: The Mule, a mutant who bends minds and emotions. One man breaks the statistical plan, and the book asks whether a plan built on masses survives one exceptional person.
   Beat 7: The hidden Second Foundation, a rival school nobody has found. Why the plan needs a secret counterweight.
   Beat 8: The end of the Empire seen from the edge. The old order decays while the Foundation keeps counting.
5. COUNTERPOINT: one honest criticism. Psychohistory treats people as numbers, the women and ordinary individuals barely get a voice, and the Mule's defeat can feel too convenient.
6. PAYOFF: land the thesis on a line that reframes everything said before: the plan works only because the people inside it keep acting as if they were free.

FIRST MINUTE (half the audience decides before 0:50):
- by 0:30 one host says the book's title and author, and says plainly that this is an analysis of the whole book, its ending included;
- by 0:50 name the three specific things the listener will understand by the end, then start the first one at once;
- in the first minute: no banter, no praise of the book, no talk about the conversation itself.

PICTURE FIRST (this becomes animation — give the artist something to draw): build every beat on ONE physical demonstration and say it out loud BEFORE its meaning: two things of different size side by side, a threshold where something flips, one thing changed while everything else stays fixed, steps that shrink, a before and an after. Name the object, who does what to it, and what changes. Return to the same picture when the beat ends. An idea with no picture is not ready to be said.

DEPTH ENGINE (run this on EVERY beat — this is how the episode earns its length):
a) drop us into a scene in present tense with one vivid sensory detail; voice the people;
b) land the point ("here's what that means for you");
c) add a SECOND concrete example, number, or angle from the book;
d) take one honest "wait - but then..." turn where the two hosts genuinely disagree;
e) tie it back to the recurring phrase-that-pays before moving to the next beat.

LENGTH (target 45-60 minutes, minimum 45 — never shorter): give each beat 4-6 real minutes, and earn them by going DEEPER, never by repeating: a fresh example, a sharper objection, a genuine disagreement between the two hosts. No filler, no restating the thesis, no "as we said earlier". Out of things to say about a beat? MOVE ON. Sound like two sharp people who can't stop talking about this book, not a summary stretched to fill time. Do NOT signal an ending ("to wrap up", "in short") before the final PAYOFF.

HARD RULES:
- English only (US audience). Two hosts in real conversation — disagree, interrupt, build on each other.
- Use ONLY facts from the book and its real, well-documented cases. NEVER invent quotes, numbers, studies, or events; if unsure of a detail, stay general instead of fabricating.
- NEVER mention "sources", "notebook", "documents", or that this is AI; never break character — you are two people who could not stop thinking about this book.
- No generic praise, no plot-recap for its own sake. Prefer specific over abstract: names, concrete scenes, numbers.
```

---
## Sonraki adımlar
1. Sesi **MP3** olarak indir → `public/audio/foundation.mp3` (.m4a da çalışır, ama uzun bir kitapta GitHub'ın 100 MB dosya sınırını aşabilir; o zaman render worker'ları reddeder)
2. Videoyu YouTube'a (unlisted) yükle → otomatik altyazıyı **kelime zaman damgalı VTT** olarak indir → `public/captions/foundation.vtt`
3. Bu oturumda yaz: **"dosyalar hazır, preview hazırla"** (skill `preview-hazirla`: kitabın kendi worktree'si, storyboard, kapılar, kör sessiz test). Final render ayrı, operatör onaylı bir adım.
