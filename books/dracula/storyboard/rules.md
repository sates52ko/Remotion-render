# Storyboard authoring — Dracula (Bram Stoker) · Antidote engine

You art-direct an animated summary. The audio is a two-host analysis. For EVERY beat decide what a
viewer with the SOUND OFF must see to understand what is being said. A wrong picture is worse than
none. Everything you write is ENGLISH. Book context: `books/dracula/story-bible.json`.
Reference (approved, We Were Liars): `books/we-were-liars/art.json` — read 10 beats of it first.

## Output — one object per beat in your chunk, same order, same `i`
```json
{ "i": 12,
  "concept": "<icon>" | null,
  "diagram": null | { "type": "flow|sorter|spectrum|matchWave", "labels": ["..",".."], "values": [..]? } | { "type": "scorecard", "title": "..", "scorecard": {..} } | { "type": "refute", "labels": [], "refute": {..} } | { "type": "mechanism", "labels": [], "mechanism": {..} } | { "type": "causal", "labels": [], "causal": {..} },
  "callout": { "text": "2-5 words", "style": "reveal|highlight|strike|box|stack" } | null,
  "set": "<set>",                    // optional
  "shotOverride": "<shot>",          // optional, rarely
  "cast": ["<castKey>", "<castKey>"],// who is on screen, most important first
  "expression": "<expression>",      // first cast member's face
  "action": "<action>",              // first cast member's body
  "holds": "<object>",               // optional object in their hand
  "partnerExpression": "<expression>", // optional, two-person cast: the SECOND person's face (else neutral)
  "partnerAction": "<action>",       // optional, two-person cast: the SECOND person's body (else idle)
  "continue": true,                  // optional: only where this beat keeps the previous beat's stage (Sequences) — never false: leave it out
  "explainedBy": "one sentence: the event, comparison or relationship this picture shows",
  "noVisual": null | "why nothing in the vocabulary can show it",
  "storyboard": { "claim": "...", "concreteVisual": "the picture as DRAWN: who, what, where", "onScreenText": "the words on screen, or "none"",
                  "relationToPrevious": "...", "addedInformation": "... (write 'weak: ...' if honest)" } }
// all five storyboard fields are REQUIRED on every beat, written from the narration — never a copy of another field
// (a `told` beat needs only i, told, explainedBy and noVisual)
```

## The picture shows what is said — `told` beats (read this before anything else)
Measured on our films: when the narration names a company, a product, a person or a place, that thing was on screen
in 13–31 % of the scenes — the rest showed a figure and a text. So: **when the narration NAMES something, the viewer
SEES that thing, and what the narration says happens to it happens on screen, on the word.** For those beats you write
`told` INSTEAD of concept / cast / callout / diagram:

```json
{ "i": 12,
  "told": { "stage": { "layout": "versus", "who": ["microsoft", "google"] },
            "events": [ { "on": "king", "do": "crown", "who": "microsoft" },
                        { "on": "operating", "do": "label", "who": "microsoft", "text": "Operating systems" } ] },
  "explainedBy": "Microsoft is crowned the king of operating systems", "noVisual": null }
```

**This book's named things** (`storyboard/entities.json` — use these ids; you cannot add one: if the narration names
something that is missing, write the beat without it and say so in `noVisual`):
- `dracula` — COUNT DRACULA · person · person
- `jonathan` — JONATHAN HARKER · person · person
- `mina` — MINA HARKER · person · person
- `helsing` — VAN HELSING · person · person
- `seward` — DR. SEWARD · person · person
- `renfield` — RENFIELD · person · person
- `lucy` — LUCY WESTENRA · person · person
- `quincey` — QUINCEY MORRIS · person · person
- `transylvania` — CASTLE DRACULA · place · emblem · can be the stage's place (`at`)
- `whitby` — WHITBY HARBOUR · place · emblem · can be the stage's place (`at`)
- `carfax` — CARFAX ESTATE · place · emblem · can be the stage's place (`at`)
- `piccadilly` — PICCADILLY HOUSE · place · emblem · can be the stage's place (`at`)
- `demeter` — SCHOONER DEMETER · product · emblem (globe)
- `year1897` — 1897 · idea · emblem (book)
- `deed` — DEED TO CARFAX · object · the book's own drawing
- `atlas` — ATLAS WITH THREE RINGS · object · the book's own drawing
- `mirror` — SHAVING MIRROR · object · the book's own drawing
- `demeterlog` — DEMETER LOG · object · the book's own drawing
- `lucychart` — LUCY CHART · object · the book's own drawing
- `garlicwindow` — GARLIC WINDOW · object · the book's own drawing
- `lucymemo` — LUCY MEMORANDUM · object · the book's own drawing
- `typewriter` — MINA TYPEWRITER · object · the book's own drawing
- `receipts` — CARTER RECEIPTS · object · the book's own drawing
- `renfieldledger` — RENFIELD LEDGER · object · the book's own drawing
- `timetable` — BRADSHAW TIMETABLE · object · the book's own drawing
- `knives` — KNIVES IN THE SNOW · object · the book's own drawing
- `earthbox` — EARTH BOX · object · the book's own drawing
- `lucyroom` — LUCY BEDROOM · place · emblem · can be the stage's place (`at`)
- `asylum` — ASYLUM STUDY · place · emblem · can be the stage's place (`at`)

**This book's own drawings — use them; they are why a muted viewer understands the stage**
- A drawn thing is SEEN as itself (a ship is a ship, not a tile with a name). Prefer a stage of drawn things and
  people DOING something with them over a stage of emblems and labels.
- **A mechanism** (`"layout": "flow"`, two to four things): the things are ONE machine — large, in the order you
  give them, an arrow from each to the next (inflow → stock → outflow; cause → effect → cost). Use it when the
  narration explains how things act on each other; change their `state` on the words that say what happens.
- **People handle the things**: `{ "do": "change", "who": "<person>", "holds": "<thing id>" }` puts it in their hand;
  `{ "do": "give", "who": ["<from>", "<to>"], "what": "<thing id>" }` hands it over on the word; `take` picks up a
  thing that stands on stage. The narration's verb decides — never put a thing in a hand the narration does not.
- **Where it happens**: `"stage": { "layout": …, "who": […], "at": "<place id>" }` draws that place, pale, behind the
  stage (`transylvania`, `whitby`, `carfax`, `piccadilly`, `lucyroom`, `asylum`). A new `stage` without `at` is nowhere in particular; the event
  `at` changes the place while the things stay. Name the place only when the narration is there.
- **The same place behind a beat that is NOT told**: `"place": "<place id>"` on the beat (next to `set`) draws the
  book's own drawing of that place behind the cast instead of the generic set. Every beat whose narration happens
  somewhere the book drew gets it — a film that stands in "office" and "room" could be any book.

**How it works**
- `on` is a word (or the first words of a phrase) of THIS beat's narration, spelled as in the chunk: the event LANDS
  on that word. Events are in the order the words are said. An event with no word uses `"at": 0` (the beat's start).
- **The stage is kept from beat to beat.** Write `stage` only when the things on stage change; in the next beat write
  only the new `events`. A beat without `told` ends the stage (the next told beat starts an empty one).
- A passage that talks about the same named things is a RUN of told beats — that is the normal case: the things stay,
  each beat makes one or two things HAPPEN to them. Never a beat where nothing changes.
- Layouts: `solo`, `versus`, `row`, `court`, `pairs`, `flow` — `versus` two things facing each other; `row` several side by side;
  `court` the first in the middle, the others around; `solo` one; `pairs` is set by `pair` itself.
- **`stage` lists EXACTLY who is on stage**: whoever you leave out walks off with their labels. So change it only
  when the narration turns to other things — not every beat. Inside a passage use `enter` / `exit` for one thing.
- **Extras expire by themselves:** a label stays for this beat and the next, an effect (burst, cross, coins) for its
  own beat, a stamp / cover and a set of rows a little longer. A thing has at most 2 labels (a third replaces
  the oldest). A crown and a world stay until you take them off. You never need to tidy up.
- **Keep a stage small: two or three things, four at most.** The compiler finds room (a person is drawn to fit under
  the title, a label goes beside its thing or — in a row — under it, a timeline lifts the things into a row of heads),
  but six people in a row are six small people.
- A **label** is a short noun phrase for a fact the narration states about that thing ("Operating systems") — not a
  sentence, not three keywords. Most beats need ONE event that shows the verb; a label is the exception, not the default.
- Titles are 2-5 words from the narration's own claim, never a label for the picture. At most 5 events in a beat.
- Every title and label is held to the screen-text rules at merge (no keyword soup, no fragments, nothing repeated
  across more than three beats).
- A person on a told stage does one thing at a time and stands still otherwise.
- **PEOPLE PLAY THE VERB.** When the narration says a person DOES something — to someone, with something — write
  `{ "on": "<the verb's word>", "do": "act", "who": "<person>", "verb": "<verb>", "target": "<id>" }`: they turn to the
  other, close the distance, the gesture lands on the word, the other reacts. A title that NAMES the action over two
  standing people is not the action ("TYPING IN MANIFOLD" over Mina standing beside a typewriter: write
  `"verb": "type", "target": "typewriter"` and she sits at it and types). Merge warns about a beat that has a person
  on stage and nobody doing anything.
- `change` + `action` takes only the rig's own actions: `idle`, `talk`, `point`, `celebrate`, `slump`, `think`, `walk`, `sit`, `hold`, `reach`, `offer`, `leave`, `flee`, `drink`, `lying`, `collapsed`, `falling`, `fighting`, `struggling`, `grabbing`, `place`, `take`, `embrace`, `lift`, `lifted`, `run`, `stop`, `chop`, `throw`, `sign`. Anything else
  (typing, reading, writing …) is NOT an action — the person would stand still: use `act`.

**Events**
| do | fields | what the viewer sees |
|---|---|---|
| `arrange` | layout, who[] | EXACTLY these on stage in a layout (they enter from their side; those already there move; anything not named leaves) |
| `enter / exit` | who | one thing comes on (everyone makes room) / leaves |
| `title` | text, box? (accent | ink | red) | 2-5 words at the top of the screen; one at a time |
| `label` | who, text | a property / product / fact of that thing, beside it (two at most; it leaves by itself after the next beat) |
| `crown / uncrown` | who | the leader, the winner, the biggest |
| `world` | who[] | each sits in its own world (a separate market, universe, camp) |
| `apart / together` | who[a, b] | they move away from each other / come to meet |
| `collide` | who[a, b] | they meet and clash (a burst, both shaken) |
| `burst` | who[a, b]? | an impact between them (or in the middle) |
| `cross` | who[a, b] | who | NO: no path between the two / this thing is ruled out |
| `stamp` | who, text | a verdict stamped on it: FORGERY, BANNED, SOLD |
| `cover / uncover` | who[] | it cannot see / is hidden (a bar across it) |
| `dim / restore` | who[] | it loses (fades and tilts) / it is back |
| `grow` | who[], to? | it gets bigger (to: 1.25 by default) |
| `shake` | who[] | it is hit / shocked |
| `coins` | who?, n? | money: paid, lost, at stake |
| `pair` | left, right, onRight? | one comparison row under the two things on stage: LEFT vs RIGHT (up to four rows) |
| `date` | text, side? (left | right) | a point on a timeline: "1791 · MOZART DIES" |
| `focus / wide` | who / — | the camera goes to one thing / comes back to the whole stage |
| `change` | who, look? action? holds? label? | the same PERSON differently: another action, a changed look, something in the hand — `holds` is the id of a DRAWN thing of this book (it is drawn in their hand) or one of the engine's hand props; `holds: "none"` empties the hand |
| `change` | who, state | the same DRAWN THING as what it has become (its states are listed with it above; `base` = as it was). It stays that way for the rest of the film |
| `give` | who[from, to], what | a person hands a drawn thing to another: it travels from hand to hand and lands on the word (it need not be on stage first) |
| `take` | who, what | a person picks up a drawn thing that stands on stage: it goes into their hand |
| `act` | who (a person), verb, target? | the person DOES it on the word — see **Verbs** below. This is how a person shows what the narration says they do |
| `at` | who (a place) | — | the stage is now AT that place: its drawing fades in behind everything (no `who`: the plain ground again) |
| `clear` | what? (titles | labels | rows) | take the extras off the stage (default: all of them) |
| `raw` | item | one bespoke drawn thing nothing else can show — rarely |

**Verbs** (`act`)
| verb | target | what the viewer sees | read by a muted viewer (measured) |
|---|---|---|---|
| `hit` | a person | walks up and strikes them — the fist lands on the word; the other is knocked back and stays so | not measured (lab clip only) |
| `bite` | a person | closes in, takes hold, the head goes down to the neck on the word; the other turns away, eyes shut, and sinks | not measured (lab clip: reads as one leaning onto the other) |
| `chase` | a person | the other runs for the far side of the stage, this one runs after them | not measured (lab clip only) |
| `hide` | a person or a thing | goes behind it and down — only the head shows over its edge | 1 of 2 |
| `type` | a drawn thing | SITS at it: a desk, the thing on the desk under the hands, a run of key strokes from the word on | 1 of 1 ("sitting at a typewriter, typing") |
| `read` | a drawn thing | the thing is in both hands in front of the chest, the head down to it | 0 of 1 (it shared its beat with a second verb; alone it reads as "holding an open book") |
| `write` | a drawn thing (optional) | sits at a desk and writes (on the target, if a drawn thing is named) | not measured (lab clip only) |
| `dig` | a person or a thing (optional) | bends and digs: three thrusts, the first on the word (beside the target, if one is named) | not measured (lab clip only) |
| `point` | a person or a thing | the arm goes out at it | 1 of 2 |
| `come` | a person or a thing | WALKS up to them and stands there on the word — from off the stage when not yet on it. A PHYSICAL arrival only | 5 of 6 WHILE WALKING — once arrived the person just stands |
| `fall` | a person or a thing (optional) | falls on the word and lies there | not measured (lab clip only) |

- **ONE verb per person per beat.** Two `act` events for the same person in one beat showed only the second; merge
  refuses it — give the second verb the next beat (a stage is carried), or choose the one the sentence is about.
- **`come` is a PHYSICAL arrival at a person or a thing on stage** — someone walks in and stands next to them. It is
  not for a figurative coming ("Dracula comes to London", "the story arrives at …"): that is where the stage IS
  (`"stage": { …, "at": "<place>" }`) or who is on it (`enter`). Merge warns about a `come` whose target is a place.
- **There is no verb for a glance.** `look` and eye contact were tried and read by nobody (0 of 2): the rig faces the
  viewer and a turned head is not seen. If the narration only says someone looks, watches or notices, stage what
  they look AT (a drawn thing, a state change, `focus`) — do not invent a verb for it.

**When not to use it:** a beat about an unnamed person's inner state, or a general idea with nothing named — author
it the usual way below. Never put a host or a stand-in figure on a told stage to "have someone there".

## The question for every beat (answer it BEFORE choosing anything)
"Which EVENT, COMPARISON or RELATIONSHIP makes this sentence's meaning visible?" — who does what to
whom; before vs after; this vs that; cause → effect; one side pressuring or controlling another.
Write the answer in `explainedBy`, then stage THAT answer:
- the cast DOING a readable action, with an object (`holds`) or with each other;
- a two-person relation (the asker and the one saying no; the one reaching out and the one turned away);
- a diagram when the claim is a structure (flow = cause → effect, sorter = parts, spectrum = degrees);
- relationship staging only where the narration states control through a message (section below).
The callout is a LABEL for the picture, not the carrier of the meaning. A face or a mood alone is not
an answer. There is no icon quota and no minimum number of objects: a wrong icon is worse than none.
Stage the answer ON THE BEAT THAT SAYS IT — read your `explainedBy` back and show what it names:
- an EVENT (someone does something): stage the deed — an action from the vocabulary, `take` / `embrace` with an
  `actionCue` on the word where it happens, the object in hand ("Actions that HAPPEN", below);
- a MECHANISM (how X works, how X leads to Y): the diagram, or the person working the object, on THIS beat — the
  one where the narration explains it, not the beat before or after;
- a CAUSE and its EFFECT: cause -> change -> result; when that takes more than one beat, keep the stage with
  `continue` and change only what the narration changes ("Sequences", below);
- a RELATIONSHIP: the two people do something TO each other (one asks and one refuses, one reaches out and one
  turns away, one holds on and one pulls back) with different faces; two people standing side by side only
  shows that two people exist.
Measured (sealed blind mute tests, 150 frames, 2026-10-22): a lone figure with a callout explained 0 of 43 beats,
a person with an icon 3 of 44, a diagram 4 of 8. The usual miss: the diagram sits on the neighbouring beat and
the beat that explains the mechanism shows a talking head. A face, a callout or a single figure stays right when
the sentence IS about a feeling, a reaction or plain commentary — show the mechanism when the narration has one;
never add a diagram, an action or a second person the narration does not have.
`cast: []` means no person on screen — use it deliberately (an object, a diagram, the callout). It is
final: no engine step adds a figure (expression/action/holds are then unused). Leaving `cast` OUT lets
the engine choose who stands there.
If nothing in the vocabulary can show the meaning, write the reason in `noVisual`, then use the
clearest text-led staging. Measured 2026-10-17 (audit/authoring-ab-2026-10-17): with this question,
blind judges preferred the new storyboard 24 to 3 on 17 weak beats; image ADDS 9 -> 20 of 34.

## Which tool for which passage (match what the NARRATION does — never use a tool for its own sake)
Read the passage the beat belongs to, then find its shape below. A row that matches is the measured way to show it;
a face + callout on such a passage is text-carried. When no row matches, stage the plain answer from the question
above. A tool fed with what the narration does not say is invention: merge refuses unsaid cues, numbers and verdicts.

| the narration ... | tool | why (blind, measured) | not when |
|---|---|---|---|
| states a claim, then says it is WRONG / a myth / not how it works, and gives the right model | `refute` diagram ("Negation, irony, fakery") | polarity UNCLEAR 3/3 -> CORRECT 3/3, ADDS 10/21 -> 19/21 (unlimited-memory 56-62) | it only doubts, asks, or lets both views stand |
| explains WHY an outcome comes out as it does: factors that persist and factors drawn again, often two trials | `mechanism` diagram ("Why a result happens") | EXPLAINS 0/15 -> 11/15 (thinking-fast-and-slow 207-211) | one cause and one effect (use `causal` or a flow) |
| tells a CHAIN: a start, a trigger, something that changes in between, a result (the thing carried may be renamed) | `causal` diagram ("A chain of causes") | ADDS 14/15, EXPLAINS 11/15, invented 0/3 (unhinged 127-131) | only two steps (a flow is enough) |
| describes something that REPEATS and whose result changes round by round (a habit, a reward schedule, a vicious or virtuous cycle, a pathology in phases that feeds itself) | `causal` with `loop` + `ledger` ("A loop that repeats") | ADDS 3/24 -> 20/24, EXPLAINS 0/24 -> 15/24, invented 3/3 -> 0/3 (unhinged 57-64) | the narration tells one pass and no return; never add rounds, outcomes or levels it does not state |
| walks through a weighted decision: criteria with weights, options graded on them, added up | `scorecard` diagram ("Diagrams") | the "add them up" beat WRONG 3/3 -> 0/3 (farsighted 306-311) | no criteria or grades are said (never invent weights or scores) |
| someone picks something up and keeps it on the next beats | `take` + `holds`, then `continue` with the same `holds` (carried state) | persistence 0/6 -> 6/6, WRONG 3/9 -> 0/9 (inside-out 195-197) | the object is only mentioned |
| someone drinks / sips / swallows | `drink` + `holds` + `actionCue` | read as DRINKS 3/3, was "holding a mug" 3/3 as take+hold (under-the-dome 52) | a figurative drink ("drinks in the view") |
| someone sets / puts an object down and it stays there | `place` + `holds` + `actionCue` | doer, action and object YYY, was NNN as a seated pose (dont-believe 77-81) | a figurative "put it aside" |
| someone walks out / leaves / goes upstairs | `leave` + `actionCue`, the next beat `continue` | action YYY, result kept YYY, was NNN as a walk in place (the-second-mountain 184-186) | a figure of speech ("you walk out thinking"); `flee` reads only as walking out (LIMIT) |
| a BODY falls, trips, faints, is pushed / thrown / knocked down, or lies on the floor — LITERALLY: a camera filming the scene would show it ("thrown to the earth by the blast", "fainted, out cold on the floor") | `falling` for the fall itself; `collapsed` for down on the floor, kept with `continue`; a push = the pusher beside the one who falls (`partnerAction`: `falling`) | falling read "falling backwards through the air" CORRECT/ADDS/EXPLAINS (lightning-thief); collapsed "lies flat on the floor" CORRECT; the same events staged standing / `slump` read WRONG (god-sees-the-truth, knave, burn) | a fall a camera could NOT film: one caused by failure, grief, money or time ("knocked off the mountain by failure", "falls into depression", "trips over his words", a career or market collapse) — stage that person's feeling, not a fall; `slump` is a POSTURE (defeat), never a fall |
| one person picks up / carries another somewhere | `lift` + `concept` = the destination, the next beat `continue` | doer, target, result YES 2/2, was WRONG 2/2 with roles reversed as a point (inside-out 196) | a hug, help standing up, a figurative lift |


## Vocabulary (nothing else renders)
- icons: crash, ledge, water, grave, medical, notes, phone, home, family, road, storm, star, heart, fire, tree, mask, mirror, key, law, photo, war, game, city, food, coin, door, lightbulb, puppeteer, chains, compass, boulder, crack, clock, balance, book, shield, trophy, hourglass, target, gift, inheritance, deed, atlas, mirror, demeterlog, lucychart, garlicwindow, lucymemo, typewriter, receipts, renfieldledger, timetable, knives, earthbox
- sets: none, horizon, office, street, room, stage, abstract, bedroom, library, forest, shore
- shots: wide, medium, closeUp, twoShot, overShoulder, insert, split, silhouette, lowAngle, crowd, illustration, diorama, beforeAfter
- expressions: neutral, happy, sad, surprised, worried, angry, smirk, blank, afraid
- actions: idle, talk, point, celebrate, slump, think, walk, sit, hold, reach, offer, leave, flee, drink, lying, collapsed, falling, fighting, struggling, grabbing, place, take, embrace, lift, lifted, run, stop, chop, throw, sign
- holds: book, phone, key, notes, letter, coin, cup, lightbulb, mask, photo, mirror, flower, compass, briefcase, shield, trophy, hourglass, target, magnifier, wallet, gift, cigarette, wrench, axe, shoe, pebble, ball, cash, pen
- cast (story-bible keys):
- `dracula` — Count Dracula (ancient Transylvanian noble and predatory biological monopoly invading London via real estate and maritime loopholes): an aristocratic pale man in his early fifties with sharp aquiline features, cold piercing eyes, swept-back iron-grey hair, heavy silver moustache, dressed in high-collared Victorian black frock coat and dark woollen cape
- `jonathan` — Jonathan Harker (earnest young English solicitor's clerk who discovers Dracula's true nature and audits the vampire's movements): a tidy English gentleman in his late twenties with neat sandy-brown parted hair, anxious intelligent grey eyes, wearing a dark charcoal wool three-piece suit with high stiff collar and silk cravat
- `mina` — Mina Harker (schoolmistress and analytical mastermind whose cross-indexed dossiers, shorthand, and reverse hypnosis dismantle Dracula): a poised determined twenty-six-year-old woman with pinned-up dark auburn hair, thoughtful brown eyes, wearing an austere high-necked dark navy Victorian day dress with crisp white collar and lace cuffs
- `helsing` — Abraham Van Helsing (Dutch polymath doctor and philosopher bridging advanced medicine and arcane folklore to coordinate the hunt): an authoritative broad-shouldered man in his late fifties with receding iron-grey hair, penetrating blue eyes behind wire spectacles, bushy eyebrows, dressed in a tailored dark tweed overcoat and wool waistcoat
- `seward` — Dr. John Seward (earnest superintendent of the Purfleet lunatic asylum who records patient Renfield and the vampire hunt on wax cylinders): a serious thoughtful physician in his early thirties with dark brown sideburns, tired strained eyes, wearing a dark brown tailored frock coat, dark vest and physician's pocket watch chain
- `renfield` — R. M. Renfield (asylum patient whose zoophagous consumption of flies, spiders, and birds mirrors Dracula's metabolic life-absorption): an intense dishevelled man in his late forties with erratic greying hair, wild manic eyes, hollow cheeks, wearing a rumpled grey institutional asylum jacket and collarless canvas shirt
- `lucy` — Lucy Westenra (aristocratic debutante whose somnambulism and gradual vampiric infection expose Victorian somatic vulnerability): a delicate pale twenty-year-old woman with golden blonde curls, vacant feverish blue eyes, wearing a flowing white Victorian nightgown with high lace trim
- `quincey` — Quincey Morris (wealthy adventurous American hunter from Texas who finances the expedition and delivers the fatal heart strike): a tall sunburnt athletic man in his late twenties with dark short hair, steady grey eyes, wearing a rugged brown leather travelling coat, wide-brimmed felt hat and sturdy leather holster

## The icon test (most important)
Pick a `concept` only if a muted viewer seeing that icon WITHOUT the callout would guess the right
meaning. The icon's LITERAL reading must be the beat's claim — a metaphor the viewer has to decode
is read literally (Fahrenheit 451: chains for "numbness" read as "links", a medical cross for an
execution read as "healthcare", a coin for "the price we pay" read as "debt"). NEVER because a word
matches ("treating this TEXT as" is not a phone; "romance is the wrong reading" is not a heart).
What viewers actually read (measured in mute tests — data/icon-readings.json):
- medical: reads as healthcare, a hospital, being treated. NEVER for: an execution, a lethal injection, an injury while fleeing, an overdose handled coldly (read as benign care, F451 x3)
- phone: reads as a MODERN smartphone. NEVER for: any world before ~2000: 1950s TV walls, radios, telephones (read as smartphone anxiety, F451)
- family: reads as abstract geometric shapes (blind viewers do not see a family). NEVER for: caregiving, a household, relatives (Southern Book Club: read as a lamp and shadows)
- star: reads as a glowing decorative star. NEVER for: a character introduction or anything specific (read as nothing, F451)
- heart: reads as love, romance
- fire: reads as fire, burning. NEVER for: a job described as 'cleaning' unless the fire itself is the subject
- mask: reads as a false public face, pretending
- mirror: reads as self-image, reflection. NEVER for: appearance, looks or vanity, judging yourself against others (read as appearance-checking, the-courage-to-be-disliked readcheck #17 #109 #229)
- game: reads as a chess knight: strategy, a calculated move (redrawn 2026-10-17; the old drawing was a trophy cup read as winning 3/3). NEVER for: winning, a prize, an award
- city: reads as a standing, intact city. NEVER for: a city being destroyed (it is drawn intact, F451)
- food: reads as a dinner plate with fork and knife, literal eating. NEVER for: a metaphor of consuming or enjoying anything else (read as dining, F451)
- coin: reads as literal cash on hand, plain endorsement of money. NEVER for: a vow about money, a doubt about money, or money-as-metaphor (die-with-zero readcheck: 2 misreads) — the attitude must come from the words and people, or the viewer reads endorsement
- door: reads as a CLOSED BOOK, a story (blind icon sheet: 3 of 3 named it a book, none a door). NEVER for: a door, a way in or out, exclusion, 'no way out' — viewers do not see a door until it is redrawn
- puppeteer: reads as one person controlling others
- chains: reads as bound, imprisoned, controlled (drawn intact). NEVER for: numbness, stupefaction, silenced writers, surrender to technology, links or continuity (F451 holdout1+2: 4 misreads, read as 'links' / 'history')
- boulder: reads as a heavy burden sitting in the path. NEVER for: an internalized or reflective weight, or stress that comes from home/family (read as a burden others dumped on you, the-courage-to-be-disliked readcheck #283; also mutes a 'this weight is not yours' reveal, #1)
- crack: reads as an abstract orange branching line (blind viewers do NOT see a crack). NEVER for: cultural rot, conflict, a breakdown of society (F451 holdout2+3: described 3x as an abstract branching structure)
- clock: reads as time, a deadline. NEVER for: speed, environmental distortion, a lack of mental silence (read as literal schedule time, F451 x2)
- balance: reads as weighing two sides, fairness, justice. NEVER for: a critique, a reframing, a verdict on society (an empty tipped scale read as nothing, F451)
- shield: reads as protection
- trophy: reads as status, a prize. NEVER for: weakness; sabotage, crisis, a rejected title or prize the narration refuses (burn-of-the-everflame framecheck 2026-10-16: read as winning 5x)
- hourglass: reads as time running out. NEVER for: an epidemic, a cost, a price paid (read as 'time passing', F451)
- target: reads as aiming at a goal, being targeted. NEVER for: where an idea came from, its origins (read as irrelevant, F451); a SPORT goal / match / penalty kick — it reads as ARCHERY (blind: "an arrow hitting a bullseye", "a target with an arrow, no people" for the 2006 World Cup penalty shootout and the goalie watching the kicker: 2 WRONG, The Art of Strategy A/B 2026-10-30)
- gift: reads as a present, giving away
- inheritance: reads as a will, an estate, an heir
- mirror: reads as self-image, reflection. NEVER for: appearance, looks or vanity, judging yourself against others (read as appearance-checking, the-courage-to-be-disliked readcheck #17 #109 #229)
If nothing reads literally: `concept: null` and stage your `explainedBy` answer on this beat (an action with
an object, two people in a visible relation, or a diagram); when the sentence narrates an event or a mechanism,
a face with a callout is the last resort.
A wrong icon is worse than none.
Icon behaviour (optional, author-chosen; the engine never adds one):
  - `"concept": "compass", "conceptMotion": "spin"`: spins fast and never settles — only when the narration says it spins / turns uselessly / keeps changing direction
  - `"concept": "chains", "conceptMotion": "break"`: STATE CHANGE: intact chains snap apart at the cue and stay broken — only when the narration says the bond / curse / chain is broken
  - `"concept": "phone", "conceptMotion": "light"`: STATE CHANGE: a dark phone screen lights up with a message at the cue and stays lit — only when the narration says the screen lights up / a message or notification arrives
  It starts on the callout's word, or on `"conceptMotionCue": "<phrase spoken in this beat>"` — put the cue on the word where the change HAPPENS. A STATE CHANGE shows the start state before the cue and the end state after it, on every frame. The start state is this beat (or the beat before it, with `continue`); the end state is kept: a continued beat with the same icon after a state change repeats the same `conceptMotion` (merge refuses otherwise — the icon would jump back to its start state). Without the field the icon keeps its default drawing. The label names the change; the icon must SHOW it.
Continuing a stage (optional): `"continue": true` means "this beat continues the previous beat's stage": no transition, and whoever/whatever was already on screen stays — the same cast member does not walk in again, the same icon does not pop in again, the same diagram is not rebuilt (only its NEW labels/values draw in). Use it inside a sequence when the next beat keeps the same set and the same person/object/diagram and only something changes (a face, an action, a held object, one more label). Never as a default, never on the first beat, and only with the same `set` as the previous beat; a new person in a continued beat still enters normally. A continued beat also KEEPS WHAT A DEED LEFT (the end state): a person set down in a destination stays in it, a person who sat down stays seated, a person who fell stays down — give them an upper-body action (talk, think, hold, reach, take…; a person who is down: only the face) and they do it in that state; an action that needs the legs (walk, fighting…) ends it — only when the narration says so: a person who is down gets up only on "gets up / stands up / rises…" (merge refuses a standing action otherwise), one who left stays gone until the narration brings them back, an object set down stays down until a `take`.
Actions that HAPPEN (optional): when the narration says someone DOES it (picks up, grabs, hugs), stage the deed, not a face + caption — check every such sentence before you reach for a face.
  - `"action": "take", "holds": "<object>"` — the object rests in front of the first cast member, who reaches for it; on the cue the hand closes on it and brings it in; it stays in hand ("grabs their phone", "picks up the letter").
  - `"action": "offer", "holds": "<object>"` — the hand holds the object OUT to someone's face, a little below the shoulder ("holds the cigarette to her lips", "gives him a sip of water", "feeds her"): cast the receiver second. `hold` keeps the object at one's own chest; `reach` touches an icon in front — neither reads as giving it to a person.
  - `"action": "drink", "holds": "<cup|glass|bottle|mug>", "actionCue": "<the word: drink / sip / swallows>"` — the person brings the object TO THEIR OWN MOUTH on that word, tips it, head back, eyes half closed, then lowers it to the chest. Keeps a carried seat (`continue` + a `sit` before). `take`/`hold` never show the drinking ("takes a drink" read only as "holding a mug").
  - `"action": "embrace", "cast": ["<who moves>", "<who is embraced>"]` — exactly two people: the first closes the gap, they hold each other from the cue, the partner embraces back ("launches herself into his arms", "they hug"). `"partnerExpression": "<face>"` gives the SECOND person's face (else neutral — the engine never invents a feeling). The FIRST cast member is the one who DOES it (reaches first, wraps high, drawn in front); the second receives — put the doer first.
  - `"action": "lift", "cast": ["<who lifts>", "<who is lifted>"], "concept": "<where she is set down>"` — only when the narration says one person PICKS UP / CARRIES another somewhere ("lifts her mother into the bathtub", "carries him to the bed"). On the cue the first steps in, lifts the second, carries her to the concept icon (a bathtub, bed, chair, car — an own icon if needed) and sets her down IN it; she stays there. Wide shot, set by the engine. Not for a hug, help standing up, or a figurative "lift" (spirits, a ban) — use embrace / a face / a diagram there. KEEP THE RESULT: the beat after a lift is `"continue": true` with the same two — she stays IN the destination and the lifter beside it, on the lift's shot or closer (`shotOverride`: twoShot / medium / lowAngle — reframed like a camera move); her new action is upper body or face only (idle, talk, think, hold, reach, take…; walk / lift would teleport her out — merge refuses). Drop `continue` only when time has passed. Measured (inside-out 196, blind 2 readers): doer, target, lift, bathtub, result YES 2/2; as authored (a point) WRONG 2/2 with roles reversed; embrace NEUTRAL 2/2 (no destination).
  - `"action": "leave", "actionCue": "<the word: walks out / leaves / goes upstairs / steps out>"` — the person WALKS OUT: on the word they turn and walk past the second cast member (if any) to the beat's `concept` icon (a door, the stairs, the elevator — drawn where the path ends) or off the frame, and are GONE. `"flee"` — the person RUNS AWAY from the second cast member (fast stride, forward lean, motion streaks) and is gone. Alone with the beat's icon, the icon is the THREAT: they run away from it, off the frame. LIMIT (measured, f451 235, blind 3 readers): who / path / gone read YES; on a medium shot the run read as "slides off the frame" 0/10 vs 10/10 on wide (cycle 6) — merge refuses a non-full-body shot. The run read as "walks out" and the threat as a passive watcher (fleeing FROM it: NO) — a still threat does not read as a chase. Use flee where the narration only needs "he ran off"; when the chase itself matters, stage the threat acting (another beat, a callout) — the engine does not yet make the threat pursue. KEEP THE RESULT: the next beat is `"continue": true` with whoever stayed behind (the one who left stays gone even if still listed; give them a new action only if they come back). Measured: a `walk` in place next to the partner read as "standing beside him" (the-second-mountain 185 NEUTRAL/NONE, long-way-down 190 WRONG, unhinged 95 WRONG). Not for a figurative "leaves the faith" — a face or a diagram there.
  - `"action": "place", "holds": "<object>", "actionCue": "<the word: sets it down / puts it down / drops / leaves it>"` — the reverse of take: the object is in the person's hand at the chest; on the word they lower it onto a small table the engine draws beside them, on the side AWAY from the other person, and the empty hand comes back; the object STAYS on the table. Measured (cycle 6, blind 20 readers): "sets it down on a table" 9/10, handed to the partner 0/10 (v1, at arm height toward the partner: 4/10 placed, 2/10 handed). KEEP THE RESULT: a continued beat repeats `"action": "place"` with the same `holds` (it is not replayed: the object stays down, the hand stays empty). Measured: "sets it down to mark his territory" staged as reach/hold read WRONG/TEXT_ONLY (lightning-thief 71); "put the tool down" as a seated person NEUTRAL/NONE.
  - GIVING / HANDING something over ("she hands him the shield", "gives her the key"): the giver holds it first
    (`"cast": ["<giver>", "<receiver>"], "action": "hold", "holds": "<object>"`); the beat that says the hand-over is
    a `continue` beat with the RECEIVER first: `"cast": ["<receiver>", "<giver>"], "action": "take", "holds": "<the same object>",
    "actionCue": "<the giving word>", "partnerAction": "reach"` (the giver's arm still held out). Measured (skin-in-the-game
    228-231, blind sequence strip at the hand-over): who gave, to whom and which object all read YES; one person holding
    the object while the other just stands there did not. The engine stages the pair facing each other and the object
    in the GIVER's outstretched hand until the cue, then in the receiver's. Give the two beats NO `concept` icon of the
    same object: it floats between their hands and reads as a second one (inside-out 29-30, blind: "two keys swapping
    hands" — whose hand PARTLY; without it YES). Keep the receiver's later beats `continue` + `"action": "hold"`.
  A held object is lifted clear of the captions automatically; a `closeUp` shows no hands — never frame an object beat as closeUp.
  Put `"actionCue": "<phrase spoken in this beat>"` on the word where the deed happens (else 40% into the beat). Who does it, to whom/what and when are yours; the engine adds nothing. In a `continue` beat after a take the same person keeps holding it (`"action": "hold", "holds": "<the same object>"`; merge refuses otherwise); a continued embrace repeats `"action": "embrace"` with the same two and is not replayed.
No single shared icon on more than 5% of the beats: an icon used for everything means nothing.

## This book's own icons (drawn for it — use them whenever the beat is ABOUT that thing)
- deed: DEED TO CARFAX — parchment deed / property deed / legal document
- atlas: ATLAS WITH THREE RINGS — map with rings / atlas map / open atlas
- mirror: SHAVING MIRROR — shaving mirror / hand mirror / small mirror
- demeterlog: DEMETER LOG — captains log / ships log / logbook
- lucychart: LUCY CHART — medical chart / temperature chart / clinical graph
- garlicwindow: GARLIC WINDOW — open window with garlic / window and garlic / garlic wreath
- lucymemo: LUCY MEMORANDUM — torn letter / written memorandum / suicide note
- typewriter: MINA TYPEWRITER — typewriter / portable typewriter / typing machine
- receipts: CARTER RECEIPTS — delivery receipt / shipping invoice / paper bill
- renfieldledger: RENFIELD LEDGER — account ledger / record book / notebook
- timetable: BRADSHAW TIMETABLE — railway timetable / train schedule / timetable book
- knives: KNIVES IN THE SNOW — crossed knives / bowie knife and kukri / knives
- earthbox: EARTH BOX — wooden crate / earth box / soil box

## The channel's worn icons — ask for THIS book's version
book, shield, chains, mask, clock, notes, target, door, balance, fire, home, lightbulb, mirror, coin, phone, heart, food, road
More than half of the channel's films show these same drawings. When a beat needs one, first ask what it IS in this
book — not "a door" but this book's door, not "a book" but the ledger the story turns on — and use the book's own
icon for it (the list above). If the book has none and the thing returns (3 beats or more), say so in your notes:
the lead agent draws it (entities.json "paths") and the beats name it. A worn icon is fine once or twice for a
passing figure of speech; it must not be what this film looks like.

## How staging reads (measured in mute tests)
- worried + talk: reads as SHOCKED (open mouth) — never for suppressed anger or quiet worry; use worried + slump or think (SBC #166)
- neutral face in closeUp: carries nothing — a close-up needs a face that IS the claim (SBC #88/#179/#220)
- neutral + idle, no icon: an empty frame: only the callout speaks — stage the person DOING the idea or give an icon (SBC: 24 beats)
- cast order: the FIRST cast member is drawn as the lead — put the person the sentence is ABOUT first (SBC #59 showed Carter on "the women do not feel safe")
- happy on the antagonist: reads as a FRIENDLY man — the muted viewer does not know he is the villain. Use smirk (charm with an edge) or angry for the threat; happy only for genuine warmth (SBC run6 #2/#78/#108)
- physical states the rig cannot draw: biting and a death scene with blood are still not drawn. Lying, collapsed, falling, fighting, struggling and grabbing ARE actions now (2026-09-28, rows below): never again stage "lies paralyzed on the floor" with standing people (SBC #189 read as nothing happening)
- action lying: reads as LYING DOWN on a bed (blind: "lying", "lying down" in wide and bust framing) — for in bed / ill / resting / lying awake. The rig's low bed is sometimes read as a bench or treadmill: put it in a room set
- action collapsed: reads as FALLEN / FAINTED — a body sprawled on the floor, eyes shut (blind: "fallen", "fainting") — for collapses, knocked out, found on the floor, dead
- causal relabel (strike-through): reads as "the FIRST name was WRONG" — the old tag struck through in red and a new one written (blind, thinking-fast-and-slow 294-299 sandbox, 2026-10-29: "STAR OFFICER" -> "EXTREME SUCCESS" read as "he was only a lucky extreme": WRONG on 3 of 6 readings of that beat across two arms, and named in 5 of 6 invented-story notes). Use a relabel only where the narration says the thing was REALLY something else (misattribution: fear -> attraction); a prediction that is merely restated or sharpened is not a relabel
- action slump: reads as a STANDING person, bowed — sad, defeated, tired (blind: "tilted/slumped… sad frown", NEUTRAL "sad pose generic" second-mountain run1 #14) — a POSTURE: never a fall, a push, a faint or a body on the floor (wonder 30 "fainted, out cold on the floor", fahrenheit-451 250 "thrown to the earth" were staged as slump; god-sees-the-truth run2 #10 "faints… collapses" staged standing read WRONG). For those: falling / collapsed (+ continue to stay down)
- action falling: reads as FALLING — tipped, airborne, flailing, motion streaks (blind: "falling") — for falls, trips, being pushed; afraid/surprised face
- action fighting: WITH a second cast member reads as FIGHTING (blind: "fighting", a scuffle with impact bursts); ALONE it reads as "fuming" — an angry man thrusting a fist. merge refuses it alone
- action grabbing: WITH a second cast member reads as GRABBING (blind: "grabs the startled boy by the arm"); the partner is drawn struggling. ALONE it reads as "walking". merge refuses it alone
- action struggling: WITH a second cast member (drawn grabbing) reads as BEING GRABBED and pulling away (blind: "grabbing", "flinches back"); ALONE it reads as "recoiling / startled". merge refuses it alone
- action reach: alone with no motif it reads as "waving" — reach needs its subject on screen (an icon or held object)
- crowd / multiple figures: the crowd shot repeats ONE person many times — viewers see ghost duplicates, never "a community"
- new faces (2026-09-26): angry = threat, rage, confrontation · smirk = sinister charm, manipulation, the predator smiling · blank = apathy, numbness, indifference ("pure apathy") · afraid = fear, terror (surprised is NOT fear: it reads as "wow")
- hair messy (cast look): its two tufts read as HORNS (blind: "horns", "devil horns") on 111/403 frames of messy-haired figures (28%, 23 books); every other hair style 4/1755. Never for a sympathetic or ordinary character — in the story bible give them short, curly, bun or long hair (mute data 2026-10-22)
- action place (Action 3.0): reads as SETTING IT DOWN on the table the engine draws beside the placer, away from the partner, and it stays there (blind 2026-11-02: placed 10/10, handed 0/10, object named 10/10; place 2.0 + narrow fixes). Before 2026-10-31 (no table, reach toward the partner) it read as HANDING it to him 0/5 put down — never stage a give with place. A held shield still reads as a small golden cup or trophy (5/5)
- action think: reads as POINTING or a raised-finger gesture (blind: "points", "gestures": 80-162 of 315 single-figure frames, 28 books) and as thinking only 16/315 (5%). Never to show that someone thinks, wonders or decides: put what the thought is about on screen (the icon or the held object). The "worried + talk" row's alternative "worried + think" carries the same risk: prefer worried + slump (mute data 2026-10-22)
- worried face: reads as WORRY (307/471, 65%) and almost never as fear (12/471, 3%) — for fear use afraid (afraid = fear, row above); worried is for concern, anxiety, unease (mute data 2026-10-22)
- holds notes: the held note is missed in 1 of 3 frames (named as a note, paper or card in 49/73, 21 books) — when the note itself matters, name it in the callout or make it the icon (mute data 2026-10-22)
- offer + cigarette at the lips: a thin white stick at a seated person's mouth read as A THERMOMETER / bathing (2/3, inside-out 197, P1 blind 2026-10-27) — the cigarette glyph now glows and smokes; still name the deed in the callout
- kept state after a lift: with "continue" the person set down stays IN the destination on the next beat (persistence YES 3/3 vs NO 3/3 as a new stage, inside-out 196-197, 2026-10-27) — a new stage pops her out of it
- holds pebble (C19): a small grey pebble held at chest height and looked at reads as A WATCH OR A PHONE (blind 2026-11-07, feel-good-productivity 224-225 sequence: 2/2 "watch or phone", the throw not seen) — a pebble is never read on its own in the hand; and a shoe taken off then gone in the next shot reads as "left behind or taken?" (2/2). That sequence kept A

## Why a result happens (cause -> mechanism -> effect)
When the narration explains WHY an outcome happens through what STAYS and what CHANGES between two tries (skill stays,
luck is drawn again; the anchor differs, the adjustment is too small …), do not show a face with the key word (TFS
199: "only DROPS carries meaning", TEXT_ONLY) or two loose buckets: build ONE `mechanism` diagram over the beats that
explain it, the later beats `"continue": true` with the same diagram:
`{"type": "mechanism", "labels": [], "scale": 1.3, "mechanism": {"outcome": "<what is measured: JUMP>", "factors":
[{"label": "SKILL", "persists": true}, {"label": "WIND", "persists": false}, {"label": "TIMING", "persists": false}],
"group": "<the drawn-again factors' name, if said: LUCK>", "trials": [{"label": "<first try, as said>", "levels":
["peak", "peak", "peak"]}, {"label": "<the next try>", "levels": ["peak", "normal", "normal"]}], "average": "<only if
the narration says average / normal>", "result": "<the effect in the narration's words>", "cues": {...}}}`.
Levels are words, never numbers: none, low, normal, high, peak — exactly what the narration states ("perfect
wind" = peak, "the wind will just be normal" = normal). BAD luck is a LOW level of the drawn-again factor ("unlucky
with a crosswind" = low; group "UNLUCKY"), never `minus`: drawn as taking away, it read as "the skill was damaged"
in 2 of 4 blind reads (TFS 211). Each beat names in `cues` ONLY
what its own words say: trial1, f0..f3 (each factor on the word naming it), group, trial2, carry (the persisting
factor slides across UNCHANGED, "SAME" — on "remains the same"), redraw (the others land at their new level, a die
rolls), average (the dashed line = the total at normal levels), settle (the arrow from the first total to the second
and the result — on the effect's own word, never before). The engine anchors every element to the spoken word and
stops if it is not spoken in that beat.

## A chain of causes (start → trigger → mechanism → change → result)
When the narration explains HOW one thing leads to another through steps — a psychological reaction (fear → adrenaline
→ the brain misreads it → attraction), a reflex or habit loop (a text arrives → a social bid → the instant yes), a body
or physical process, a decision and its consequence — do NOT show a face with the key word on it (unhinged 129:
"MISATTRIBUTION OF AROUSAL" on a startled face read WRONG/NONE; the-art-of-saying-no 23, a worried woman with a phone,
WRONG/NONE). Build ONE `causal` diagram over the beats that tell the chain, later beats `"continue": true` with the
same diagram:
`{"type": "causal", "labels": [], "scale": 1.25, "causal": {"stations": [{"label": "<as said>", "glyph": "<glyph>"}, …2-5
in CAUSAL order], "token": {"glyph": "<what is carried>", "tag": "<its first name, as said>", "tagTo": "<its new name,
only if the narration renames it>", "from": <station where it starts>}, "contrast": {"label": "<the condition without
the trigger, only if said>", "glyph": ".."}, "loop": {"to": <earlier station>, "label": ".."}, "cues": {"n0": "..", …}}}`.
Glyphs: bridge heart brain eye phone bolt drop danger person people coin clock speech check cross spark lock door fire
ice water plant gift. Stations go in CAUSE order even when the narration says the result first: name each station in
`cues` ONLY in the beat whose words say it — a station said early is drawn early and the stations between are dashed
"?" until their word (the viewer sees a WHY is missing). The TOKEN is the one thing carried through the chain (the
racing heart, the dose, the message): it is born on its word at `from` and travels only into stations already drawn.
`relabel` (on the word of the new name) strikes the token's tag through and writes `tagTo` — the same object, read
differently. `contrast` = what happens without the trigger (a flat line, nothing travels); `loop` (habit, vicious
circle) = the result feeds back, the token rides the arc on each loop word. Labels are the narration's words; no number
unless said. The engine anchors every element to the spoken word and stops if it is not spoken in that beat.

## A loop that repeats, with what each round leaves (feedback loops, habits, rewards)
When the narration explains a LOOP - something done again and again whose result changes from round to round (a
rat pressing a lever for food that comes only sometimes; a habit that pays less each time; a spike that flattens or
stays huge) - a loop arrow alone says nothing (unhinged 57-64 as a Skinner-box icon + callouts: ADDS 3/24,
EXPLAINS 0/24, 3 readers invented a damage story). Build the causal chain WITH A LEDGER over the beats (later beats
`continue`): every round writes one permanent column, so a still frame shows the history:
`"causal": {"stations": [lever, food ("mark": "?" when the outcome is not known in advance), brain ...], "loop": {"to": 0},
"token": {"glyph": "bolt", "tag": "<first name, as said>", "tagTo": ["<later names, as said: compulsively, mashing>"], "from": 0},
"ledger": {"label": "<the schedule's name, as said>", "labelTo": "<its later name, if said>", "meter": "<what the bars
measure, as said: DOPAMINE>", "bursts": [{"laps": [{"o": "reward|empty", "bar": "flat|stub|low|medium|high|max"}]} ...]},
"contrast": {"label": "<the other schedule, as said>", "glyph": "..", "bursts": [...]}, "cues": {...}}`.
Each `loop` cue word fires the NEXT burst (in order over the whole passage); laps run one after another and faster
after each `relabel` (the next name in tagTo). A lap: the token goes to the door - it opens on a pellet or on a
neutral empty (never a cross: "taking away" read as damage) - on to the brain with a reward, back along the arc.
`meter` (on its word) starts the bars; only laps from then on carry their authored `bar`, rising while the token
approaches the door (anticipation). `lane` (on the schedule's word) names the row before the first lap. `contrast`
+ `clap` cues run the other schedule's lane on the SAME scale (`csolved`: a check when the narration says it is
solved); `lrelabel` renames the row. Outcomes and levels are what the narration states (sometimes / unpredictably
= irregular runs, never a regular ABAB rhythm; "flattens" = a staircase down; "massive" = max after empties) - no
numbers. Measured (unhinged 57-64, blind, 3 readers): ADDS 3/24 -> 20/24, EXPLAINS 0/24 -> 15/24, WRONG 1 -> 0,
unpredictable NNN -> YYY, flattening PNN -> YYY, invented 3/3 -> 0/3.

## Negation, irony, fakery
When the narration says NOT / never / fake / scripted / pretend / hollow X, never stage X plainly
(F451: a warm embrace for "fake scripted validation" read as genuine warmth; a thoughtful face for
"he is NOT thinking about the ideas" read as valuing them). Stage the contrast instead: the empty
face beside the smiling screen, the forced smile (say so), the turned back.
A CLAIM THE NARRATION PUTS FORWARD, THEN REJECTS AND REPLACES (a "defense", a myth, "people say X — but
actually Y"): one `refute` diagram over the beats that do it, the later beats `"continue": true` with the same
diagram — never a struck callout (41 of 243 Antidote WRONG reads had a struck phrase on screen, read both ways).
`{"type": "refute", "labels": [], "scale": 1.3, "refute": {"owner": "THE DEFENSE SAYS", "claim": "<the claim, with a
function word>", "inputs": ["<2-4 parts>"], "hub": "<what they feed>", "output": "<what it claims to raise>",
"verdict": "<the narration's own rejecting words>", "reason": "<WHY, from the narration>", "truth": "<the correct
model's name>", "illusion": "<optional>", "cues": {...}}}` — each beat names in `cues` ONLY what happens in it, as a
phrase spoken in that beat: links / result (the claim builds), doubt ("But"), rejected ({"phrase": "entirely",
"occurrence": 1}: the claim greys and is stamped ON that word, never before), illusion, reason, bounce (the WHY: a
one-slot gate), truth (the correct model in the same parts), run (["phrase", …]: one spotlight hopping input to
input), lock / ring / off. The engine anchors every stance change to the spoken word itself and stops if it is not
spoken. Measured (unlimited-memory 56-62, blind 3+3 sequence / 2 per frame): claim, rejected, why and model YES 3/3
(baseline PARTLY / PARTLY / NO / PARTLY), WRONG 3/21 -> 0/21, ADDS 10/21 -> 19/21, EXPLAINS 0/21 -> 8/21.
Two people side by side must look clearly different (build, age, costume); two men in the same
uniform read as "identical men" — stage one of them.

## Staging the people (the picture must carry meaning, not only the text)
Put on screen the characters the sentence is ABOUT (not the host). Give them the face and body of the moment: grief -> sad + slump, fear -> afraid (worried reads as worry, not fear), revelation -> surprised, a forced polite smile over pain -> happy (say so), accusing -> point, grasping -> reach, arriving/leaving -> walk. Give them the object they handle (letter, photo, key, cup).
Two people: stage the SECOND person's reaction on purpose — `partnerExpression` (their face) and `partnerAction`
(their body, from the actions) on a two-person cast. What you leave out stays neutral / idle: the engine never gives
the partner a feeling of its own. Only a verb that reads as a pair moves the partner with it (fighting <-> fighting,
grabbing <-> struggling, embrace <-> embrace); merge refuses a partnerAction that contradicts the pair. There is no
gesture quota: when the narration has the other side react (refuses, listens, is accused, gives in), show it.

Physical situations are real poses — use them instead of standing people when the sentence is about the body. fighting / grabbing / struggling need TWO cast members (alone they read as fuming / walking / recoiling):
- `lying`: lying in bed / resting / ill / lying awake (the rig brings its own bed)
- `collapsed`: fainted / knocked out / dead / lies on the floor (eyes shut, bare floor)
- `falling`: falls / trips / is pushed / plunges
- `fighting`: a fight or an attack — the lead punches toward the second cast member, who fights back
- `struggling`: straining to break free / resisting / being held — the second cast member holds them (grabbing)
- `grabbing`: grabs / seizes / snatches someone or something — the second cast member struggles
Never happy over death or tragedy unless it is a fake smile.

## Callouts
2-5 words, the narrator's own concrete words from THIS beat; correct ASR spellings of names.
Every callout of 4+ words needs a function word (the/of/to/her/...), no keyword soup, max 7 words /
48 chars. `strike` = the narrator REJECTS the phrase; never for emphasis. No invented labels.
Every beat needs a callout OR a diagram OR an icon; pure banter ("Right.") may carry only staging.

## Relationship staging (optional; only where the relationship IS the claim)
Use it when the narration states that one side controls, steers or pressures another THROUGH A
MESSAGE (a story, a promise, demands, threats, warnings), and at least one of: the narration calls
the message a lie, rejects a method ("not with guns"), negates a reading ("this isn't about X"), or
the controlled side takes control back. Not for a mood, a hinted analogy, or anything not stated.
Set `"stageRelationship": true`, `"cast": []`, `"callout": null`, `"concept": null`, no diagram, no holds, and write
`"relationship"`. Every value needs an exact quote from THIS beat or its two neighbours as
`{ "beat": N, "quote": "..." }`; leave out any field no quote supports:
- `source` / `target`: `{ value, group, evidence }`; `group` is a key of story-bible `groups` (below).
- `relation`: `{ value, evidence }` ("keep them down" also lowers the controlled side; other relations draw no effect).
- `means`: `{ value, label: {beat, quote}, evidence }`; `label.quote` is the panel text and must be spoken in this beat.
  Add `falseMarker: {beat, quote}` ONLY if the narration says the message is a lie.
- `rejectedMethod`: `{ value, icon: "gun", scope: "<spoken phrase>", evidence }`.
- `negation`: `{ value: "<negated word>", icon: "text", scope: "<spoken phrase>", evidence }`.
- `counterAction`: `{ value, icon: "wheel", label: [{beat, quote}], cue: {beat, quote, keyword} }`.
- `modality`: `{ value: "asserted" | "advice" | "analogy" | "hypothetical", evidence }`; `speaker`: null unless quoted.
Each group must exist in `books/<slug>/story-bible.json` → `groups`: `{ role: "ruling"|"controlling"|"ruled"|"controlled",
label, body: "#RRGGBB", accent: "#RRGGBB", count?, evidence: { source, quote } }`. A group can be one person (count 1).
Then run `node scripts/gate-b-relationship.js --slug=<slug>` (a different model family checks every field).
merge refuses a staged beat without a current STAGE verdict; on FALLBACK, author the beat normally.
Use it on a handful of beats per book, not as a template.

## Diagrams (only where the narration states a structure — no quota either way)
Put the diagram on the beat that explains the structure (a mechanism, a cause -> effect, parts, degrees). A
diagram on a beat without a structure is noise; a structure left to a talking head is a missed explanation.
flow = cause -> effect (2-3 labels, 1-2 words each, from the narration); sorter = 2-4 buckets;
spectrum = [left, right] + values[0..1]; matchWave = two rhythms syncing, ONE label (what syncs).
What the screen draws: flow at most 3 labels, sorter at most 4, spectrum exactly 2 poles, matchWave exactly 1 —
merge refuses anything else (an extra label is not drawn; a spectrum without both poles shows LESS / MORE).
Spread more labels over the next beats (a new diagram picks up where this one ends). A diagram beat has
concept null, callout null and `cast: []`: the diagram fills the frame and shows nobody (merge refuses a
diagram beat with a cast). Avoid bare template words as labels (DENIAL, CHANGE, GROWTH) — use
the narrator's phrase ("Family denial").
A diagram can be BUILT across a passage — only when the narration itself builds a cause -> effect chain or a change
of state step by step (not for a list of separate points, a feeling or a story moment): put the first label(s) on
the beat where the structure starts, then keep
it with `"continue": true` and the same type on the next beats, adding ONE label per beat (flow up to 3, sorter
up to 4 — merge refuses more) or moving the marker (spectrum `values`) as the narration moves — earlier labels stay
where they are and only the new part draws in. Prefer this to a diagram on one beat followed by talking heads that
explain the same structure (burn 100-104: a sorter on 100, three faces, a flow on 104 — one growing diagram carries
the argument).
SCORECARD — a weighted decision or comparison the narration walks through (values / criteria with weights, options
graded on them, "multiply and add up"): `{"type": "scorecard", "title": "..", "labels": [], "scorecard": {"criteria":
[{"label", "weight": 0..1, "owner"?, "weightText"?}], "options": [{"label", "scores": [0..10 | null per criterion],
"scoreText"?: [..]}], "show": "weights"|"options"|"scores"|"totals", "winner"?: <option index>}}`. Build it with
`"continue": true` over the beats as the narration does: criteria first (`show: "weights"`, one more per beat), then
the options (`"options"`), then the grades (`"scores"`), then `"totals"` (each bar visibly shrinks to weight × score
and sums into a total bar). Bars carry the sizes; a NUMBER is printed only when the narration states it
(`weightText` "×0.4", `scoreText` "0"). Grade an option ONLY on the beat whose narration grades it — leave it
`null` until then (drawn "?"; while any option is ungraded NO option shows a total, so no result is implied early). Never
carry a grade or a result from a LATER beat into an earlier one, never invent one, and set `winner` only when the
narration says which option wins (farsighted 306-310: blind ADDS 4/10 → 7/10, "who weighs what" NO → YES).

## Sequences — explain ONE idea across several beats (plan them before the single beats)
Many passages develop one idea over 4-12 beats: a story the hosts tell (someone wakes up, gives in, pays the
price) or an argument with steps (it feels good -> but look at the cost -> so it backfires). A muted viewer
follows such a passage only if the picture DEVELOPS with it. Before authoring those beats one by one:
0. Make an idea map of your chunk first (for yourself, not a field): each passage as "beats a-b: <the one idea> —
   kept stage: <the growing diagram / the object that changes>", or "single beats" when every sentence there is its
   own point. Most chunks are mostly single beats; a chunk with no sequence is normal. Do not force a sequence: a
   passage of separate points stays single beats, and a
   feeling or a reaction stays a face. If the context entries before your chunk show a stage the idea is still
   using, your first beat may `continue` it (continue works across chunks); an idea that runs past your last beat
   ends on a beat the next author can continue.
   Measured (P1, 2026-10-23, blind strips): a diagram that grows with the argument explained it (burn 100-104: a
   flow gaining one label per beat — the cause chain read with nothing invented); the same two people kept across a
   story did NOT explain it when the thing the story turns on was never drawn (philosophy 172-177: the fox, never
   on screen — the mechanism was text only); a spectrum carried for two beats and then dropped for faces read only
   PARTLY (confidence-gap 161-164: the bird in the room was never drawn). So the kept stage must hold the thing that
   changes — the diagram, or the signature object (`motifs.json` icon) — not only the people reacting to it.
   When the narration CHANGES that object (it is buried, breaks, collapses, sprouts) and this book has an icon for
   each state (e.g. `figTree` → `figTreeBuried` → `figTreeSprouting`): the start state on the beat before, the
   after-state on the beat that SAYS the change, `"continue": true` — the new state draws in at the cut. Measured
   (P2-A, island 23-26 + 223-224): one static icon read the change NO/PARTLY, two state icons PARTLY/YES.
1. Name the passage's single idea in one sentence; each beat's `explainedBy` = that idea + what this beat adds.
2. Choose ONE stage that carries it and KEEP it while the idea lasts: the same person(s) (same cast keys), the
   same object (same `concept`/`holds`) or the same diagram (same type, one more label per beat), in the same
   `set`. Do not swap in a new icon, set or person each beat. Mark kept beats `"continue": true`.
3. Show start -> meaningful change -> result: from beat to beat change ONLY what the narration changes (the
   action, the face, what is held, one diagram label, the callout); `storyboard.relationToPrevious` states
   exactly that change.
4. The callout LABELS the change ("52 UNREAD", "NOT A SINGLE VECTOR LINE"); if only text can carry it, say so in
   `noVisual` (a vocabulary gap, reported, not hidden). Never invent events, numbers or objects.
5. The kept object must READ as the thing itself (the icon test): never keep an abstract stand-in across a
   sequence (a target icon for "the important task" was read as "the inbox-zero goal" in every beat it stayed —
   keeping a misread symbol spreads the misread). If no icon reads as the thing, keep the PERSON and change what
   they hold, do and feel; the change must be visible in the face, the action or the object, not only the text.
Measured 2026-10-19 (audit/sequence-lab-2026-10-19), blind pairwise, 2 judges each: fiction (burn 96-104, the old
version swapped people every beat) — new preferred 2/2, idea YES vs PARTLY, wrong beats 3 -> 1; non-fiction
(15-secrets 73-81, the old version already kept one person with rich faces) — OLD preferred 2/2 because the new one
kept an abstract target icon (rule 5). Use sequences to stop re-casting and rebuilding, not to replace faces.
An abstract idea mapped to a POSE alone (slump = failure, think = strategy) is mood, not explanation: give the
pose the object or the second person the narration names.

## Output
Return ONLY a JSON array for your chunk. Validate it parses and matches every `i`.
