# NotebookLM prompt — How to Make Money in Stocks (William J. O'Neil)

**Slug:** `how-to-make-money-in-stocks` · **Genre:** finance · **Engine:** antidote · **Target:** 45–60 min · **Market:** US (English)

**Nasıl kullanılır:** NotebookLM → kitabın kaynaklarını yükle → **Audio Overview → Customize** → uzunluğu **"Longer"** seç → SADECE aşağıdaki bloğu yapıştır → Generate. (Blok kompakt tutuldu ki karakter limitinde kesilmesin. Ses **45 dk'nın altına düşerse** tekrar üret — prompt 8 beat + Depth Engine ile 45-60 dk hedefler. Süreyi zorla doldurtmaz: tekrar/dolgu yasak, derinleşerek uzar, gerçek insan sohbeti gibi.)

```
You are two hosts doing a deep, original analysis of "How to Make Money in Stocks" by William J. O'Neil.

THE ANGLE:
- Thesis: William J. O'Neil's CAN SLIM system is not a traditional stock-picking guide; it is an uncompromising psychological framework designed to reverse natural human retail instincts by buying apparent market strength at all-time highs and ruthlessly cutting losses before ego destroys capital.

STRUCTURE (follow strictly):
1. COLD OPEN (0:00-0:25): open mid-thought on the counterintuitive paradox that 98% of retail investors buy stocks that look cheap and collapse, while winning institutional leaders look dangerously expensive and keep breaking out to new highs.
2. THESIS: State the argument clearly: the stock market is governed by supply, demand, and institutional footprint, meaning personal opinion and value-hunting are deadly; disciplined pattern recognition and strict mathematical risk control are the only edge.
3. SETUP: Introduce William J. O'Neil, founder of Investor's Business Daily (IBD), and his historical study of the greatest winning stocks from 1880 to 2008 that codified the 7-trait CAN SLIM formula.
4. BEATS:
   - Beat 1 (C & A): Current quarterly earnings acceleration (25-50%+) and annual earnings growth (minimum 25-50% over 3 years) as the non-negotiable fundamental engine.
   - Beat 2 (N): The New catalyst—new product, service, management, or new price highs emerging from proper chart consolidations.
   - Beat 3 (S): Supply and Demand—float size, share buybacks, and massive trading volume spikes (40-50%+) validating institutional accumulation.
   - Beat 4 (L): Leaders vs. Laggards—identifying top Relative Strength (RS 80+) market champions rather than sympathy plays or cheap sector laggards.
   - Beat 5 (I): Institutional Sponsorship—following the quiet footprint of top-rated mutual funds and institutional accumulation without becoming an overcrowded exit.
   - Beat 6 (M): Market Direction—why 3 out of 4 stocks follow the general market trend, and how to spot distribution days signaling a market top.
   - Beat 7 (Chart Anatomy): The Cup-with-Handle, Flat Base, and Double Bottom patterns—how handle shakeouts clear weak hands before the true breakout.
   - Beat 8 (The Golden Rule of Selling): The iron discipline of cutting every single loss at 7% to 8% without hesitation or rationalization, paired with taking 20-25% profits.
5. COUNTERPOINT: The vulnerability of CAN SLIM during choppy, range-bound, or algorithmic bear/whipsaw markets where false breakouts trigger repetitive 7% death-by-a-thousand-cuts paper losses.
6. PAYOFF: The final truth: surviving the stock market is never about being right about a company's narrative; it is about keeping your losses tiny and letting the market's mathematical tape dictate your portfolio.

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
1. Sesi **MP3** olarak indir → `public/audio/how-to-make-money-in-stocks.mp3` (.m4a da çalışır, ama uzun bir kitapta GitHub'ın 100 MB dosya sınırını aşabilir; o zaman render worker'ları reddeder)
2. Videoyu YouTube'a (unlisted) yükle → otomatik altyazıyı **kelime zaman damgalı VTT** olarak indir → `public/captions/how-to-make-money-in-stocks.vtt`
3. Bu oturumda yaz: **"dosyalar hazır, preview hazırla"** (skill `preview-hazirla`: kitabın kendi worktree'si, storyboard, kapılar, kör sessiz test). Final render ayrı, operatör onaylı bir adım.
