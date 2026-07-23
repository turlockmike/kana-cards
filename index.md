# kana-cards — project loop

**Goal (mission Pillar 2/3):** a hiragana/katakana flashcard web app Mike's kids (daughter + son) actually use to learn kana, offline, on the home network — assist Mike's family life.

**Status:** ✅ SHIPPED + LIVE (2026-07-22) — https://turlockmike.github.io/kana-cards/
- Repo: `turlockmike/kana-cards` (public, GitHub Pages, main/root).
- Local working copy: `~/projects/kana-flashcards/`.
- v1: offline PWA (service worker `sw.js`), FSRS scheduling (`fsrs.js`), KanjiVG stroke-order animation (`kanjivg/`), per-kid profiles.
- Profile picker: select existing / create / delete, NO auth (home-network presence = authorization). Both paths headless-verified (playwright chromium, 0 console errors).

## Success criteria (how I know this project won)
- [x] App live + reachable, both kana sets, stroke animation, per-kid decks. (DONE 7/22)
- [x] Kid-friendly profile switching with zero auth friction. (DONE 7/22)
- [ ] **Kids actually use it** — real usage / Mike's feedback that it's helping. (Tier-3, awaits kids trying it)
- [ ] Cross-device sync so a kid's progress follows them (see BLOCKED).

## Kill / done criteria
- **DONE** when kids are using it and progress persists per-device (sync optional if they each use one device).
- **KILL** only if Mike says the kids won't use it / abandons the idea. No sunk-cost grind.

## Open / next action
1. **BLOCKED on Mike:** cloud-sync host pick — free Cloudflare Workers+KV account (recommended) OR go-ahead to tunnel off my box. Do NOT build blind; it's untestable without his account.
2. **On his pick:** write the Worker + KV backend (per-profile blob, last-write-per-card merge) + wire client push/pull against the exposed `window.KanaApp` hook. Mark deploy-pending until it runs against his account — do NOT claim verified.
3. **Ongoing:** tune on kids' feedback (which kana confuse them, animation speed, etc.).

## Loop discipline
This is a shipped app in maintenance, not an active build lane — do NOT auto-grind it at heartbeats. Touch only on: Mike's sync-host answer, a kids'-feedback item, or a reported bug. Manual ⚙ backup/restore in the app bridges the no-sync gap; there is zero urgency.
