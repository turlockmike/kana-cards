/* Kana Cards — optional cloud sync client.
 *
 * ADDITIVE + OFFLINE-FIRST. localStorage stays the source of truth. If SYNC_ENDPOINT
 * is empty (the default) NOTHING here touches the network and the app behaves exactly
 * as it did before this file existed. Fill in the two constants below only after you
 * deploy the Worker (see DEPLOY.md).
 *
 * Progress follows the LEARNER, not the device: remote decks are keyed by the profile's
 * NAME (slugified), because each device makes its own random profile id. So "Emma" on the
 * tablet and "Emma" on the phone share one remote deck. Give each learner a distinct name.
 *
 * Wire-up: app.js calls  window.KanaSync.onSave(pid, deck)  after every local save, and
 *          window.KanaSync.pull(pid) -> Promise<bool changed>  on profile load. Both are
 *          no-ops when sync is off or the network is unreachable (silent degrade).
 */
(function () {
  "use strict";

  // ===== CONFIG — set these two after deploying the Worker (see DEPLOY.md) =====
  const SYNC_ENDPOINT = "";          // e.g. "https://kana-sync.<you>.workers.dev"  (empty = sync OFF)
  const HOUSEHOLD     = "home";      // any shared word; namespaces your family's decks
  // ============================================================================

  const ON = () => typeof SYNC_ENDPOINT === "string" && SYNC_ENDPOINT.length > 0;

  function slug(name) {
    return String(name || "").toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }
  // pid -> remote profile key (name slug; falls back to the pid if the name is empty)
  function remoteKey(pid) {
    try {
      const meta = window.KanaApp.loadMeta();
      const p = meta.profiles.find(x => x.id === pid);
      const s = p ? slug(p.name) : "";
      return s || pid;
    } catch (e) { return pid; }
  }
  function url(pid) {
    return SYNC_ENDPOINT.replace(/\/+$/, "") +
      "/api/sync/" + encodeURIComponent(HOUSEHOLD) + "/" + encodeURIComponent(remoteKey(pid));
  }

  // ---- push (debounced per profile; fire-and-forget) ----
  const timers = {};
  function pushNow(pid) {
    if (!ON()) return;
    let deck;
    try { deck = window.KanaApp.loadDeck(pid); } catch (e) { return; }
    fetch(url(pid), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deck),
      keepalive: true,
    }).catch(() => {}); // silent — offline is fine, localStorage already holds the truth
  }
  function onSave(pid) {
    if (!ON() || !pid) return;
    clearTimeout(timers[pid]);
    timers[pid] = setTimeout(() => pushNow(pid), 1500); // coalesce bursts of grades
  }

  // ---- pull + merge (returns whether local changed) ----
  async function pull(pid) {
    if (!ON() || !pid) return false;
    let remote;
    try {
      const res = await fetch(url(pid), { method: "GET" });
      if (!res.ok) return false;
      remote = await res.json();
    } catch (e) { return false; } // unreachable -> stay on local copy
    if (!remote || !remote.cards || !remote.introduced) return false; // nothing stored yet

    let local, merged;
    try {
      local = window.KanaApp.loadDeck(pid);
      merged = window.KanaApp.mergeDeck(local, remote);
    } catch (e) { return false; }

    // Only rewrite/notify if the merge actually differs from what's on disk.
    const changed = JSON.stringify(stripVolatile(merged)) !== JSON.stringify(stripVolatile(local));
    if (changed) {
      window.KanaApp.saveDeck(pid, merged); // this re-pushes the reconciled deck via onSave
    } else {
      pushNow(pid); // local is ahead-or-equal; make sure remote has it
    }
    return changed;
  }
  function stripVolatile(d) {
    // compare card state + introduced set; ignore updatedAt/device churn
    return { cards: d.cards, introduced: (d.introduced || []).slice().sort(), reviews: d.reviews || 0 };
  }

  window.KanaSync = { onSave, pull, pushNow, enabled: ON, _slug: slug, _remoteKey: remoteKey };
})();
