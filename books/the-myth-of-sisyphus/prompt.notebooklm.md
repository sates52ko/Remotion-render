# NotebookLM prompt — The Myth of Sisyphus, and Other Essays (Albert Camus)

**Slug:** `the-myth-of-sisyphus` · **Genre:** philosophy · **Engine:** antidote · **Target:** 45–60 min · **Market:** US (English)

**Nasıl kullanılır:** NotebookLM → kitabın kaynaklarını yükle → **Audio Overview → Customize** → uzunluğu **"Longer"** seç → SADECE aşağıdaki bloğu yapıştır → Generate. (Blok kompakt tutuldu ki karakter limitinde kesilmesin. Ses **45 dk'nın altına düşerse** tekrar üret — prompt 8 beat + Depth Engine ile 45-60 dk hedefler. Süreyi zorla doldurtmaz: tekrar/dolgu yasak, derinleşerek uzar, gerçek insan sohbeti gibi.)

```
Two hosts. A 45-60 minute deep, original analysis of "The Myth of Sisyphus, and Other Essays" by Albert Camus. English only, natural US conversation - argue, interrupt, build on each other, think out loud.

ANGLE: Thesis to prove - Camus's absurdism is not despair or nihilism; it is an act of radical intellectual revolt and absolute presence. Stripping away the comforting illusion that life has a cosmic purpose is the only way to genuinely live it. The enemy is not the void; the enemy is "philosophical suicide" - inventing false heavens to escape hard reality. Phrase-that-pays: "Living without appeal."

COLD OPEN (0:00-0:25, mid-thought, no greeting): "The opening line isn't an academic puzzle. It's a knife: 'There is only one truly serious philosophical problem, and that is suicide.' Everything else is a child's game."

BEATS (4-6 min each; argue one claim + ground it in Camus's exact text):
1. The Collapse of the Stage Sets: Rising, tram, four hours in the office, meal, tram, sleep, Monday Tuesday Wednesday... until one day the "why" arises. The mechanical routine breaks, and the dense, terrifying strangeness of the world rushes in.
2. The Absurd Collision: The absurd is not the world, and it is not man; it is the friction between our desperate appetite for clarity and the cold silence of the universe.
3. The Trap of Philosophical Suicide: Kierkegaard, Chestov, and the existentialists who panic at the abyss and make a desperate "leap of faith." Camus calls this intellectual cowardice: murdering reason to manufacture comforting hope.
4. Revolt, Freedom, and Passion: Living without appeal. If there is no afterlife and no divine judge, the goal is not the "best" life by a moral scorecard, but the MOST life. Quantity of conscious experience over pious abstraction.
5. The Three Absurd Archetypes: Don Juan multiplying mortal loves instead of chasing eternity; the Actor burning through three lives in three hours knowing the curtain drops; the Conqueror fighting in history knowing all statues erode.
6. Kirillov's Lethal Experiment: Dostoevsky's engineer in Demons who kills himself to prove human autonomy and become God. Camus dissects why Kirillov is the tragic dead-end of pride, whereas the absurd man chooses the harder path: to live.
7. Kafka and the Seduction of Hope: The Castle and The Trial depict the crushing bureaucracy of human existence, yet Camus catches Kafka stumbling: smuggling in religious hope through the back door when despair gets too heavy.
8. The Mountain and the Descent: Sisyphus pushes the boulder up, it rolls down. The victory is not at the peak; it is during the silent walk back down to the plain. Sisyphus knows his fate, owns every grain of stone, and smiles. "One must imagine Sisyphus happy."

COUNTERPOINT: Push back honestly - does valuing "quantity of experience" risk moral apathy? If all experiences are equal under the absurd, how does Camus condemn tyranny without appealing to a moral framework he claims doesn't exist?

CLOSER: Sisyphus doesn't defeat the gods by escaping his punishment; he defeats them by claiming the boulder as his own. Defiance, not hope, is the ultimate victory.

STORYTELLING STYLE: Master-keynote storytelling. Drop us into vivid scenes in present tense (the man in the glass telephone booth talking silently, the scorching Algerian sun, the grit of stone on raw palms). Allow honest friction: "Wait - but if nothing matters, why get out of bed tomorrow?"

LENGTH (target 45-60 min, minimum 45): Give each beat 4-6 real minutes. Do not pad, stall, or repeat. Earn the runtime by going deeper into Camus's essays (Summer in Algiers, Return to Tipasa) and pushing each other's objections. Do not wrap up before the final payoff.

HARD RULES: English only. Use ONLY ideas and cases from the book - never fabricate. Never mention "sources", "notebook", or AI; you are two thinkers obsessed with Camus's work.
```

---
## Sonraki adımlar
1. Sesi indir → `public/audio/the-myth-of-sisyphus.m4a` (veya .mp3)
2. Videoyu YouTube'a (unlisted) yükle → otomatik altyazıyı **kelime zaman damgalı VTT** olarak indir → `public/captions/the-myth-of-sisyphus.vtt`
3. Tek komut:
```
node scripts/make-book.js --slug=the-myth-of-sisyphus --title="The Myth of Sisyphus, and Other Essays" --author="Albert Camus" --genre=philosophy
```
