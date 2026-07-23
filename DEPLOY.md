# Kana Cards — cloud sync deploy (one-time, ~5 min)

Progress already works offline on every device (localStorage). This adds optional cloud
sync so a learner's progress **follows them across devices** — study "Emma" on the tablet,
pick up on the phone. Until you do the steps below, the app is unchanged: sync is OFF by
default and the code cannot break the working offline app.

The sync key is the **profile name** (not a device id), so give each learner a distinct
name and use the same spelling on every device ("Emma" ↔ "Emma").

---

## What you deploy: one Cloudflare Worker + one KV namespace (free tier is plenty)

Prereq: a free Cloudflare account. `npx wrangler` pulls the CLI on demand — no global install.

### 1. Create the KV namespace (once)
```bash
cd projects/kana-flashcards/worker
npx wrangler login                       # opens browser, authorize once
npx wrangler kv namespace create KANA_KV
```
Copy the `id = "…"` it prints.

### 2. Paste that id into `worker/wrangler.toml`
Replace `PASTE_KV_NAMESPACE_ID_HERE` with the id from step 1.

### 3. Deploy the Worker
```bash
npx wrangler deploy
```
Copy the URL it prints, e.g. `https://kana-sync.<you>.workers.dev`.

### 4. Turn sync on in the app
Edit `sync.js` (top of file), set the endpoint to your Worker URL:
```js
const SYNC_ENDPOINT = "https://kana-sync.<you>.workers.dev";  // was ""
const HOUSEHOLD     = "home";   // any shared word; keep it the same everywhere
```
Commit + push (GitHub Pages redeploys the static site automatically). Done.

Each phone will fetch the new `sync.js` on next load (service worker cache is bumped to
`kana-v3`, so it refreshes). From then on: every review pushes; every profile open pulls
and merges.

---

## Verify it works
```bash
curl https://kana-sync.<you>.workers.dev/api/health      # -> {"ok":true}
```
Then: study a few cards as "Emma" on device A, open "Emma" on device B — B shows A's
progress within a second (needs network on both; offline it just uses the local copy).

## Notes
- **No login.** Namespaced only by the `HOUSEHOLD` word — anyone who guesses your Worker
  URL *and* the household word could read/write decks. For kids' flashcard progress that's
  the tradeoff you asked for. To harden: set `HOUSEHOLD` to something non-obvious, and/or
  restrict CORS in `worker/worker.js` (`Access-Control-Allow-Origin`) to your Pages origin.
- **Merge is conflict-safe.** The Worker merges per-card (newest review wins) and returns
  the merged deck, so two devices editing at once never clobber each other.
- **Turning it back off:** set `SYNC_ENDPOINT = ""` again — the app reverts to pure offline,
  local progress intact.
- **Cost:** Cloudflare Workers + KV free tier (100k reads/day, 1k writes/day) dwarfs a
  family's usage. $0 expected.

_Verified: end-to-end two-device sim (`/tmp/kana-sync-e2e.mjs`, 15/15) — cross-device-by-name,
card-level merge, same-card conflict resolution, and the OFF path making zero network calls._
