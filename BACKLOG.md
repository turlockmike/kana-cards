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

## 3. Mini games — ✅ CARD MATCHING SHIPPED & LIVE 2026-07-24 (commit 0e9c346)
Fun modes alongside the FSRS deck, e.g.:
- **Card matching** (memory/concentration): flip pairs — kana ↔ romaji. ✅ SHIPPED.
- Other candidates when we get there: kana whack-a-mole (tap the called kana),
  falling-kana catch, romaji→kana speed rounds. ← remaining game candidates (net-new).
Design constraint: games draw from the learner's SEEN kana (profile progress
already in localStorage) so play reinforces, never introduces unseen kana —
introduction stays feature 1's job.

**DONE (card matching) — do NOT rebuild.** `🎮` button in `#modebar` → full-screen
`#gameSheet` overlay (reuses `.charthead/.x`). Concentration board: pick K=min(6, seen)
kana → 2K tiles (K kana faces + K romaji faces), shuffled; flip two, match by kana id,
matched tiles lock green; Moves/Pairs counter; win screen (Play again / Done). Under
`GAME_MIN_KANA=4` seen → friendly "study first" gate, no board. **SEEN-ONLY invariant**
enforced at a single gated source: `isSeenKana(c) = c.taught || reps>0`; `gameKanaPool()`
= `KANA_IDS.filter(id=>isSeenKana(deck.cards[id]))` on the KANA deck (regardless of current
mode) — never surfaces un-taught kana. Verified: `node --check` OK · kana-smoke --selftest
**13/13** GREEN (new check #7 SEEN-only oracle + 3rd mutation proving it load-bearing) ·
pure-logic unit test (seen filter + 2-per-kana pairing) PASS · sw kana-v10→v11 · pushed
origin ahead=0 · live sw=v11 + gameKanaPool + gameBtn confirmed deployed. Remaining game
candidates (whack-a-mole / falling-kana / speed rounds) are net-new future increments.

## 4. Words mode: example sentence + word→sentence→word audio (Mike 2026-07-23)
**STATUS 2026-07-23: slice-1 SHIPPED & LIVE (commit 41f1ca1).** First 50 words
(animals/beverages/food + core nouns, deck-order front) each have a JP-only example
sentence with the target word highlighted + per-sentence Neural-TTS audio; flip playback
is word→sentence→word. Data: `data/sentences.json` (slug-keyed `{s,hl,a}`); audio
`media/audio/<slug>_s.mp3`. Pipeline (author sentence → edge-tts-batch → sentences.json)
is reusable. **CARRY: remaining ~372 words** (slice-4 shipped 50 more 2026-07-24;
sentences.json now **214/586**). Audio-quality fix (32k→48k Nanami) already done (d0b2b50).
- slice-4 = "electronic device" → "happy" alphabetical-by-`en` (the next 50 words MISSING a sentence).

**⚠ BOUNDARY MODEL — corrected slice-3 (do NOT re-inherit the stale "after <last word>" rule):**
`sentences.json` is **INSERTION-ORDER, not alphabetical** — the last-inserted key (e.g. "computer"
after slice-2) is NOT a contiguous alphabetical frontier. The ~478 words missing sentences are
**scattered across the whole alphabet**. Correct next-slice boundary = **"the next ~50 words that
are MISSING a sentence, taken alphabetically by `en`"** — reproducible, no dependence on which key
was inserted last. (slice-3 correctly ran "(little) sister" → "electric fan" this way.)

**⚠ AUTHORING NOTES (learned slice-2, save the next ~7 cycles the re-discovery):**
- **Deck order = `data/words.json`, alphabetical by `en`.** (There is NO `images.json`;
  older notes named it — that name is stale. `kana-smoke` only checks images.json's
  *presence*, it is not the deck.) The done-50 from slice-1 were category-scattered, not
  the alphabetical front — key by `en` slug, not by position.
- **6 words SKIPPED for a phrasing/data decision** (don't just re-hit them): `alive`
  (せいぜん odd), `billion` (abstract number), `blindess` (messy kana + typo'd `en`),
  `ceiling` (kana was でんじょう typo — NOW FIXED to てんじょう, safe to author),
  `centimeter` (awkward in a sentence), `city` (し too short/ambiguous a substring).
  **slice-4 added `front` to skip** — its kana is ぜんぶ ("all/everything", 全部), a WRONG
  translation for "front" (should be まえ 前). Left un-authored pending a deck-translation
  decision — do NOT force a sentence onto the wrong word.
- **slice-4 fixed 2 kana typos in-pass (words.json + regen word audio, Nanami):**
  `female` おんあ→おんな (女), `friday` きにょうび→きんようび (金曜日). Both were invalid kana.
- **Deck data-quality: 4 corrupt kana entries FIXED 2026-07-23** (bridge/ceiling/chair/
  glass had HTML junk / entity / English annotation / a kana typo). Full-file scan is now
  CLEAN (0 junk kana, 0 missing audio, 595 entries). If authoring surfaces more, fix the
  kana + regen that word's audio in the same pass — `grep -nE '"kana": "[^"]*(<!--|&[a-z]+;|not |[A-Za-z])' data/words.json` is the detector.
- **⚠ TWO DISTINCT CHECK-CLASSES — don't conflate (learned slice-4):** the junk-kana
  detector above catches corrupt *characters* (HTML/entities/latin/typos). It does NOT
  catch a **valid-kana WRONG translation** — kana that is clean but means the wrong word
  (`front`=ぜんぶ "all", should be まえ 前). Before authoring a slice, eyeball each word's
  en↔kana sense, not just its kana validity; when the kana clearly mistranslates `en`,
  **skip + flag** (as with `front`), never force a sentence onto the wrong word. Known
  loose-fits authored anyway (acceptable comprehensible-input, NOT wrong): `evening`=よる
  (=night), `feet`=フィート (the unit). A future `/workshop` could sweep words.json for
  wrong-translation entries — a semantic pass distinct from the character-level detector.
- **slice-5 added 2 more skips (h–m range):** `heart` — card-facing kana is ねつ (熱
  "fever/heat", WRONG translation; should be しんぞう 心臓 or heart-sense こころ). NOTE the
  card renders `byEn[en]` = LAST words.json entry for that `en`; "heart" has two entries
  (しんぞう + ねつ) and ねつ wins → the CARD itself shows the wrong reading. `kitchen` — card
  kana だいところ is a **missing-dakuten typo**, should be だいどころ (台所). Both skipped +
  flagged; both are words.json card-data defects the `/workshop` sweep should FIX (heart:
  drop/repair the ねつ entry; kitchen: だいところ→だいどころ + regen that word's audio).
- **⚠ AUTHORING = author for CARD-FACING kana, not the words.json row you eyeball.** The app
  keys cards by image slug and pulls kana via `byEn[en]` (last-wins on duplicate `en`), and
  keys the sentence by `en` too. So for duplicate-`en` words (`heart`, `light`, …) only ONE
  sentence renders, on the card whose kana = the LAST words.json entry. slice-5 authored
  `light`=かるい (the winning entry, "light-weight") — correct. Also skip words with `img=n`
  (no image → no card ever renders the sentence): slice-5 skipped `i (formal`, `long (distance`.
- **✅ FULL duplicate-`en` audit (slice-5 REFLECT — the whole last-wins defect class, sized).**
  Exactly **8** duplicate-`en` words exist; card shows the LAST row's kana for each. Audited all 8:
  | en | last-wins kana (card shows) | other row(s) | verdict |
  |---|---|---|---|
  | **heart** | ねつ (熱 fever) | しんぞう | ❌ **DEFECT — WRONG tx.** Fix: drop/repair ねつ so しんぞう wins |
  | hand | て | て | ✅ identical, fine |
  | back | うしろ (behind) | せ | ✅ valid sense |
  | light | かるい (light-weight) | ひかり, あかるい | ✅ valid sense |
  | orange | オレンジいろ | オレンジ | ✅ valid sense |
  | second | にかいめ (2nd time) | ふつか | ✅ valid sense |
  | short | せがひくい (short stature) | みじかい | ✅ valid sense |
  | thin | やせている (skinny) | うすい | ✅ valid sense |
  **Bottom line: only `heart` is a true mistranslation** (child would learn ねつ=fever as "heart" — pedagogically harmful). The other 7 last-wins picks are *valid alternate senses* of ambiguous English → leave (or optionally reorder to primary sense; NOT defects). So the `/workshop` sweep's duplicate-`en` fix-list is exactly ONE word: **heart**. (`kitchen` だいところ→だいどころ typo is a separate character-class fix.)

  **✅ FIXED 2026-07-24 (/workshop, commit 96c5d33, sw v15, live-verified).** `heart`: relabeled ねつ→`en:"fever"` (its true meaning 熱) → `byEn['heart']` now resolves しんぞう (live-confirmed). `kitchen`: だいところ→だいどころ (台所) + regenerated audio (Nanami; old typo mp3 removed; new `だいどころ.mp3` HTTP 200 live). **Engine fix, not just the instance:** `kana-smoke` check #8 SENSE GUARD pins the corrected en↔kana pairings via the app's own last-wins resolution + bans typo kana, so a mistranslation-via-last-wins can't silently reship. Mutation-proven load-bearing (`--selftest` now 15 checks / 4 mutations killed). The other 7 dups need no action (valid senses).

  **📌 CURRENT SKIP SET (authoritative — supersedes the scattered slice-4/5 notes above; the journal/plan skip-list is ADVISORY & stale-prone, so the truth is THIS list ∧ author-time `byEn` resolution).** Skip when authoring a slice:
  - `alive` (せいぜん = 生前 "before death" — mistranslation) · `front` (ぜんぶ 全部 "all" — mistranslation) · `old` (おい = old-age, ambiguous/loose — flagged slice-6)
  - `billion` (abstract number, phrasing decision) · `centimeter` (awkward) · `city` (し too short a substring) · `blindess` (typo'd `en` + messy kana)
  - `img=n` words (no card ever renders the sentence): `i (formal`, `long (distance`, + any paren-`en`/kanji-kana rows
  - **NO LONGER SKIP (fixed 2026-07-24, /workshop):** `heart`→しんぞう, `kitchen`→だいどころ, `fever`→ねつ — all three AUTHORED in slice-6; do NOT re-skip on a stale inherited list. Verify each candidate via `byEn[en]` at author-time (translation-sanity), which is the real guard against a stale skip-list.
  - **Lesson (slice-6 REFLECT):** a skip-list propagated by hand through the journal Next-action goes stale the moment /workshop fixes a word. Keep the canonical list HERE; ACT already resolves via `byEn` at author-time, which caught the staleness — trust that resolution over any inherited list.

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
**Teach-mode anti-poison oracle added 2026-07-24 (check #6 + 2nd mutation):**
`teach()` must set `c.taught=true` but NEVER call `FSRS.schedule` or mutate
`.reps/.S/.D` — else first-sight poisons the scheduler (feature #1's core
invariant). Now 10 checks, both mutations proven load-bearing.

## Notes
- All three fit the existing offline-first/no-backend architecture
  (localStorage per profile; no server needed).
- Same request pattern may apply later to word625-cards (teach-first mode
  especially) — consider porting once proven here.
