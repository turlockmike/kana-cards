# Kana Cards — feature backlog

Requested by Mike's daughter, relayed by Mike 2026-07-23. **Normal backlog
work** — queued in `~/areas/research-queue.md` (the canonical backlog wake
sessions pull from); implement when the queue reaches it, ship increments,
`tg` Mike as each lands. "Don't implement now" meant not-in-that-session,
not gated-on-approval (Mike clarified 2026-07-23 15:29).

## 1. First-exposure teach mode — ✅ SHIPPED & LIVE 2026-07-24
The FIRST time a card is ever shown to a profile, skip the quiz interaction:
show the back side (character + stroke order) immediately with a simple
"Continue" button — no draw canvas, no Good/Okay/Bad grading. Learning-science
rationale: you can't recall what you've never been taught; first exposure is
encoding, not retrieval. FSRS note: the teach view should register as the
card's initial learning step (or schedule it as `new→learning` with a neutral
grade), not as a review — otherwise first-sight stats poison the scheduler.

**DONE — do NOT rebuild.** `isFirstExposure(id)` = `!c.taught && reps===0`;
`renderCard` branches to `renderTeachCard` on first sight. Teach view: kana →
`#answer.show` strokebox (big kana + romaji + animated stroke order via shared
`animateStrokes`) + Continue; words → picture + kana + sentence (highlighted) +
audio (`playSequence`) + Continue. **NO English on the word teach view** (pedagogy
held). `continueBtn` → `teach()` which sets ONLY `c.taught=true` (never calls
FSRS.schedule), then re-queues the card at pos min(3,len) for the real quiz. So
FSRS state stays 'new' / reps stays 0 → the first real grade runs initS/initD,
first-sight never poisons the scheduler; learnedCount (reps>0 && S>=1) not inflated.
Verified: `node --check` OK · kana-smoke --selftest 7/7 + --live 12/12 GREEN · sw
v9→v10 · pushed origin ahead=0 · live sw=v10 + renderTeachCard confirmed deployed.

## 2. Kana reference section — ✅ SHIPPED & LIVE 2026-07-23 (commit 3f89ac9)
A browsable "view all kana" chart — hiragana + katakana in the standard gojūon
grid (rows: あかさたなはまやらわ…), tap a kana to see its big form + animated
stroke order (KanjiVG data is already in the app). Entry point from the main
menu; useful both as a study aid and as the natural home for feature 1's
"what did I just learn" lookups.

**DONE — do NOT rebuild.** `📖` button in `#modebar` → full-screen `#chartSheet`
overlay; Hiragana/Katakana tabs; gojūon grid (rows=consonant families,
cols=a/i/u/e/o, real gaps blank); tap kana → detail popover (big form + romaji +
type + animated KanjiVG stroke order + Replay/Back). Read-only, no FSRS/deck/profile
touched. Refactor landed: shared `animateStrokes(svg, strokes)` reused by study card
+ chart (this is the reuse hook feature #1's teach view should also call). Verified:
`node --check` OK · 71/71 kana placed once per type both scripts · kana-smoke
--selftest 7/7 + --live 12/12 GREEN · sw kana-v8→v9. Pushed origin ahead=0, deploy
confirmed live. This is now the browse-home feature #1 hooks into.

## 3. Mini games
Fun modes alongside the FSRS deck, e.g.:
- **Card matching** (memory/concentration): flip pairs — kana ↔ romaji.
- Other candidates when we get there: kana whack-a-mole (tap the called kana),
  falling-kana catch, romaji→kana speed rounds.
Design constraint: games draw from the learner's SEEN kana (profile progress
already in localStorage) so play reinforces, never introduces unseen kana —
introduction stays feature 1's job.

## 4. Words mode: example sentence + word→sentence→word audio (Mike 2026-07-23)
**STATUS 2026-07-23: slice-1 SHIPPED & LIVE (commit 41f1ca1).** First 50 words
(animals/beverages/food + core nouns, deck-order front) each have a JP-only example
sentence with the target word highlighted + per-sentence Neural-TTS audio; flip playback
is word→sentence→word. Data: `data/sentences.json` (slug-keyed `{s,hl,a}`); audio
`media/audio/<slug>_s.mp3`. Pipeline (author sentence → edge-tts-batch → sentences.json)
is reusable. **CARRY: remaining ~472 words** (slice-2 shipped 64 more, alphabetical
adjective→computer; sentences.json now 114/586). Author the next alphabetical slice
(after "computer") the same way. Audio-quality fix (32k→48k Nanami) already done (d0b2b50).

**⚠ AUTHORING NOTES (learned slice-2, save the next ~7 cycles the re-discovery):**
- **Deck order = `data/words.json`, alphabetical by `en`.** (There is NO `images.json`;
  older notes named it — that name is stale. `kana-smoke` only checks images.json's
  *presence*, it is not the deck.) The done-50 from slice-1 were category-scattered, not
  the alphabetical front — key by `en` slug, not by position.
- **6 words SKIPPED for a phrasing/data decision** (don't just re-hit them): `alive`
  (せいぜん odd), `billion` (abstract number), `blindess` (messy kana + typo'd `en`),
  `ceiling` (kana was でんじょう typo — NOW FIXED to てんじょう, safe to author),
  `centimeter` (awkward in a sentence), `city` (し too short/ambiguous a substring).
- **Deck data-quality: 4 corrupt kana entries FIXED 2026-07-23** (bridge/ceiling/chair/
  glass had HTML junk / entity / English annotation / a kana typo). Full-file scan is now
  CLEAN (0 junk kana, 0 missing audio, 595 entries). If authoring surfaces more, fix the
  kana + regen that word's audio in the same pass — `grep -nE '"kana": "[^"]*(<!--|&[a-z]+;|not |[A-Za-z])' data/words.json` is the detector.

Two coupled asks:
- **Audio quality is bad** — the current word audio (TTS?) sounds poor. Investigate
  the source (which voice/engine word625 uses) and improve it as part of this work.
- **Example-sentence card** — for each word, the card should show the word AND a
  natural sentence that uses it, with the target word **highlighted** in the sentence.
  Audio playback sequence: play the **word**, then the **sentence**, then the **word
  again**. (Rationale: hear the word in isolation, hear it in natural context, then
  re-anchor on the word — comprehensible-input style, no English.)
- Needs per-word example sentences (source: generate/curate JP sentences + their own
  audio; keep the NO-English pedagogy rule — sentence is JP only, word highlighted).
- Applies to Words mode specifically (word625 deck now inside the kana app).

## Verify step (run before/after every increment)
`kana-smoke --selftest` (static: JS syntax + the NO-English pedagogy oracle on the
word renderer + mode/deck-namespace integrity + data present; self-proving via a
mutation) and `kana-smoke --live` (key GitHub Pages paths 200 + sw cache version).
Built 2026-07-23 to replace the throwaway DOM-shim harness the consolidation used.
This IS the regression gate — the "no English on the word card" rule leaked once
(journal 2026-07-23 15:42); the pedagogy check now catches it automatically.

## Notes
- All three fit the existing offline-first/no-backend architecture
  (localStorage per profile; no server needed).
- Same request pattern may apply later to word625-cards (teach-first mode
  especially) — consider porting once proven here.
