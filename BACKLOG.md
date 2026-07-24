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
**✅ FEATURE CLOSED 2026-07-24 (sw v26). Coverage 582/586 rendered cards; the remaining 4 are a documented permanent skip-set (below).**
Final close-out slice authored the whole authorable remainder in one pass (32 sentences) rather than another mid-slice, closing the feature:
- **+32 sentences** (550→582 rendered coverage): attack-noun, cell-phone, deaf-person, electric-fan, electronic-device, little-brother, little-sister, mean-spirited, month-long-period, movie-theater, old-thing, older-brother, older-sister, one-million, town-market, billion, centimeter, front, i-formal, long-distance, we, white, they, to-buy, to-call, program, soft, to-catch + the 4 tile-fixed words below. All machine-validated (hl a literal substring of s, pure-kana, terminal 。, key an `ok`-status image slug, hl==`byEn` kana for 31/32 — mean-spirited is a な-adjective stem, expected). Nanami audio for all 32.
- **4 tile defects FIXED** (words.json kana + regen audio): `transportation` うにゅ→うんゆ (運輸) · `yellow` きいいろい→きいろい (黄色い) · `toe` ゆび→あしのゆび (足の指; kanji 指→足の指 — ゆび=finger was a mistranslation, and ゆび.mp3 KEPT because "finger" legitimately shares it) · `alive` せいぜん→いきている (生前 "before death" was wrong-sense). All 4 PINNED in kana-smoke #8; うにゅ/きいいろい BANNED. せいぜん/ゆび NOT banned (valid words used elsewhere).
- **⚠ `front` is NOT a defect** — kana ぜんぶ resolves to kanji **前部** (front part, JMdict-backfilled), a legitimate reading of "front". The old BACKLOG note calling it 全部="all" mistranslation was WRONG and is retired. Authored normally.
- **Discovery/SURPRISE:** sentences.json had 565 keys but 15 were stale non-rendered slugs, so true rendered coverage was 550/586 (not 565) → 36 cards missing, not the assumed ~21. The "frontier near ceiling" belief was an artifact of counting sentences.json size instead of joining on `ok`-status image slugs. Correct coverage metric = join sentences keys against `imgs.filter(status=='ok' && file)` slugs.

**📌 PERMANENT SKIP-SET (4 — feature is CLOSED with these documented, each needs a Mike curriculum/content decision, not an authoring pass):**
- `to-have-sex` (セックス) — **inappropriate for a child-facing app; this card should probably be REMOVED from the deck entirely — flagged for Mike.**
- `city` (し) — a 1-character highlight (し) is pedagogically ambiguous (し is an ubiquitous mora/particle sound); better as とし/まち, a translation decision.
- `old` (おい) — ambiguous sense (甥 nephew / 老い aging) and collides with `old-thing`=ふるい; needs a sense decision.
- `blindess` (めのふじゆ（な）) — misspelled `en` ("blindess") + messy kana; needs a data-cleanup decision.

<details><summary>Historical slice log (superseded by the close-out above)</summary>

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
- **Deck order = `data/words.json`, alphabetical by `en`.** (⚠ CORRECTED 2026-07-24:
  `media/img/images.json` DOES exist and IS the deck's render frontier — app.js builds
  cards from its 586 slugs and keys sentences by slug. The old "there is NO images.json"
  claim was FALSE and is retired; only a `data/images.json` never existed. The correct
  missing-key join is on images.json's own **`slug`** field — it is the hyphenated form
  ("to-buy") that == the sentence key DIRECTLY. Do NOT join on `en`: en is the SPACE/paren
  form ("to catch", "to buy") that does NOT round-trip to the hyphenated key, so an en-based
  diff is contaminated (proven slice-11: naive `img.en − keys` = wrong missing set). Every
  images.json row carries both fields; `slug` is the clean join key. (Superseded the
  slice-10 REFLECT note that said "join on en" — that was backwards.))
  The done-50 from slice-1 were category-scattered, not the alphabetical front — key by `en`
  slug, not by position.
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
  - **✅ FIXED 2026-07-24 (heartbeat, commit see git log, sw v19, live-verified) — `program` プロクラム→プログラム AND `soft` やらかい→やわらかい.** Both readings corrected in words.json (last-wins `byEn` confirmed), word audio regenerated (Nanami; old typo mp3 removed → live 404, new mp3 live 200), and **both typo kana added to kana-smoke #8 PIN+BAN** (`PIN[soft]=やわらかい`, `PIN[program]=プログラム`; `BAN_KANA∋やらかい,プロクラム`) — mutation-proven a regression re-embeds neither. No longer skip either at author-time.
  - **⚠ VALID-CHARS-WRONG-READING TYPO CLASS is RECURRING, not a one-off (broadened slice-8 REFLECT — was "missing-dakuten", too narrow).** THREE confirmed instances, ALL NOW FIXED: `kitchen` だいところ→だいどころ (missing-dakuten, slice-4) · `program` プロクラム→プログラム (missing-dakuten, slice-7, fixed 7/24) · `soft` やらかい→やわらかい (missing-MORA, slice-8, fixed 7/24). The unifying class is **kana where every character is individually valid but the word READS wrong** — a dropped ゛ (dakuten) OR a dropped mora (わ). The junk-detector passes them because no char is illegal. **4th instance `to-catch` キャチ → キャッチ (missing SOKUON っ) — FIXED 7/24 slice-9 REFLECT (sw v21, live-verified: キャッチ renders, キャチ audio 404, PIN[to catch]=キャッチ + BAN キャチ in #8, en key confirmed = `to catch`).** **Class status: 2 known-open as of slice-11 REFLECT 7/24 — `transportation` うにゅ→うんゆ (運輸) + `yellow` きいいろい→きいろい (黄色い), both surfaced by the per-slice eyeball. (kitchen/program/soft/to-catch all FIXED earlier.) missing-dakuten + missing-mora + missing-sokuon are all the SAME class (valid chars, wrong reading). Per-slice eyeball keeps finding UNKNOWN-tail instances (2 more this slice) → this CONFIRMS the systematic all-rows-vs-dictionary scan (queued /workshop) is the convergent fix, not per-slice whack-a-mole; it should test char-count/sokuon/dakuten against expected transliteration across all 586 rows.** **Author-time guard for every slice: eyeball each candidate's kana against its expected reading** — for katakana loanwords compare vs the English↔katakana transliteration; for native words sanity-check the mora count/dakuten against the kanji you'd expect. The guard is unchanged — only its NAME was too narrow (a missing-mora slips a "missing-dakuten"-labelled check). Systematic fix (all rows vs a dictionary/ban-list, catching both sub-classes) is queued for /workshop; until then this per-slice eyeball is the guard.
  - **Lesson (slice-6 REFLECT):** a skip-list propagated by hand through the journal Next-action goes stale the moment /workshop fixes a word. Keep the canonical list HERE; ACT already resolves via `byEn` at author-time, which caught the staleness — trust that resolution over any inherited list.
  - **📍 slice-12 frontier (ALPHABETICAL TAIL IS DONE — remaining 21 are the SKIP-pending-fix set, NOT a contiguous range).** slice-11 finished the alphabetical tail (to-turn→zero), so 565/586; the last 21 missing are words that were SKIPPED because their WORD TILE needs a /workshop fix FIRST. **Do the word-tile repairs before authoring their sentences**, else the card teaches a broken tile. Skip-pending set to date: `toe` (word kana ゆび=finger → mistranslation, needs correct 足の指/つまさき) · `transportation` (うにゅ→うんゆ 運輸, valid-chars-wrong-reading) · `yellow` (きいいろい→きいろい 黄色い, valid-chars-wrong-reading) · `we`/`white`/`they`/`to-buy`/`to-call` (kanji-in-kana-field tiles 私たち/白い/…). Once /workshop repairs those tiles, a final slice authors their sentences → deck reaches 586. **ENUMERATE LIVE** — join missing keys on `media/img/images.json`'s **`slug`** field (== the sentence key directly; do NOT join on `en`, which is the space/paren form that won't round-trip — see corrected note above). Author-time: pure-kana check + valid-chars-wrong-reading eyeball + `byEn` resolution.
  - **📌 slice-10 SHIPPED & LIVE 2026-07-24 (sw v22, +50, 464→514/586).** Range **to-fly → to-touch** (verbs). **SKIPPED `to-have-sex`** (セックス — inappropriate for a child-facing app; pulled `to-touch` to keep 50). Join was done via `media/img/images.json` `en` field (NOT slug string-munging — the space/hyphen mismatch made the naive words.json-vs-sentences diff wrong; documented for slice-11). All 50 machine-validated: hl a literal substring of s, zero kanji/latin in s, terminal 。, every key an image slug, hl == word's `byEn` kana for 49/50.
  - **⚠ NEW /workshop word-tile flag (surfaced slice-10): `to-think` word kana is `思う` (KANJI in a kana field), not a pure-kana reading.** The sentence was authored correctly with pure kana `おもう` (hl=おもう), but the WORD TILE renders 思う. This is the kanji-in-kana-field class the plan warned about (買う/電話/あの人たち). /workshop should sweep words.json for kanji in the `kana` field and repair to pure kana + regen that word's audio. Detector: `grep -nE '"kana": "[^"]*[一-鿿]' data/words.json`. **FULL class sized 2026-07-24 = exactly 8 rows:** `目`(→め), `あの人たち`(→あのひとたち), `私たち`(→わたしたち), `白い`(→しろい), `買う`(→かう), `電話`(→でんわ), `私`(→わたし), `思う`(→おもう). These 8 are a bounded, one-pass /workshop fix (repair kana + regen each word's Nanami audio + optionally pin in kana-smoke #8). Distinct from the valid-chars-wrong-reading class (0 known-open).
  - **✅ ALL 8 FIXED 2026-07-24 (heartbeat, sw v24, kana-smoke 16 checks).** words.json repaired: `目`→め, `あの人たち`→あのひとたち, `私たち`→わたしたち, `白い`→しろい, `買う`→かう, `電話`→でんわ, `私`→わたし, `思う`→おもう (kana + audio field). 8 Nanami word-audio regenerated (edge-tts-batch, ja-JP-NanamiNeural), 8 orphaned kanji-named mp3 removed. **ENGINE FIX (not just instances):** kana-smoke sense-guard now carries a CLASS-level guard — any CJK ideograph (一-鿿) in a `kana` field is caught RED — with a 5th selftest mutation (inject 目 → expect RED) proving it load-bearing. Detector `grep -nE '"kana": "[^"]*[一-鿿]' data/words.json` → 0. The whole kanji-in-kana-field class can no longer reship. These 8 tiles' SENTENCES can now be authored safely (part of the slice-12 skip-pending set: we/white/they/to-buy/to-call unblocked).

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

</details>

## 5. Words mode: kanji on the card back (Mike 2026-07-24) — ✅ SHIPPED & LIVE (sw v25)
Mike: "the back of the vocab card should show both the kana version and the kanji version if it exists."
- words.json gained an optional `kanji` field; card back (renderWordCard + teach card)
  shows `<div class="kanji">` under the kana when present. CSS 34px / .82 opacity.
- **Backfill source = JMdict, NEVER weights.** `~/projects/japanese-reader/data/jmdict-eng.json`,
  matched on BOTH kana reading AND English gloss so homophones can't cross-assign
  (かく "to draw" → 描く, not 書く). 412/595 assigned; 3 ambiguous verbs hand-set
  (泣く/描く/競走); loanwords + bare-numeral forms (８０, Ｔシャツ) correctly left kana-only.
- **Guard:** kana-smoke inverse check — a present `kanji` field MUST contain a real CJK
  ideograph and differ from the kana (else mis-populated) + a selftest mutation. 17 checks.
- **Remaining (future):** 183 words have no kanji — most are genuine loanwords (correct),
  but a tail may just be JMdict gloss-mismatches. A wider pass (fuzzy gloss / secondary
  readings) could recover a few more, but ONLY via JMdict, never hand-typed.

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
