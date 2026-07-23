# Kana Cards — feature backlog

Requested by Mike's daughter, relayed by Mike 2026-07-23. **Normal backlog
work** — queued in `~/areas/research-queue.md` (the canonical backlog wake
sessions pull from); implement when the queue reaches it, ship increments,
`tg` Mike as each lands. "Don't implement now" meant not-in-that-session,
not gated-on-approval (Mike clarified 2026-07-23 15:29).

## 1. First-exposure teach mode (no quiz on first sight)
The FIRST time a card is ever shown to a profile, skip the quiz interaction:
show the back side (character + stroke order) immediately with a simple
"Continue" button — no draw canvas, no Good/Okay/Bad grading. Learning-science
rationale: you can't recall what you've never been taught; first exposure is
encoding, not retrieval. FSRS note: the teach view should register as the
card's initial learning step (or schedule it as `new→learning` with a neutral
grade), not as a review — otherwise first-sight stats poison the scheduler.

## 2. Kana reference section
A browsable "view all kana" chart — hiragana + katakana in the standard gojūon
grid (rows: あかさたなはまやらわ…), tap a kana to see its big form + animated
stroke order (KanjiVG data is already in the app). Entry point from the main
menu; useful both as a study aid and as the natural home for feature 1's
"what did I just learn" lookups.

## 3. Mini games
Fun modes alongside the FSRS deck, e.g.:
- **Card matching** (memory/concentration): flip pairs — kana ↔ romaji.
- Other candidates when we get there: kana whack-a-mole (tap the called kana),
  falling-kana catch, romaji→kana speed rounds.
Design constraint: games draw from the learner's SEEN kana (profile progress
already in localStorage) so play reinforces, never introduces unseen kana —
introduction stays feature 1's job.

## Notes
- All three fit the existing offline-first/no-backend architecture
  (localStorage per profile; no server needed).
- Same request pattern may apply later to word625-cards (teach-first mode
  especially) — consider porting once proven here.
