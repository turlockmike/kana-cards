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
  // The app now holds TWO decks per profile (mode = 'kana' | 'words'). Each mode syncs to its
  // own remote key so both round-trip. The kana key keeps its original shape (no suffix) so
  // any decks synced before consolidation still line up.
  function modes() {
    try { const m = window.KanaApp.modes; return Array.isArray(m) && m.length ? m : ['kana']; }
    catch (e) { return ['kana']; }
  }
  function modeSuffix(mode) { return mode && mode !== 'kana' ? '-' + mode : ''; }

  // (pid, mode) -> remote profile key (name slug; falls back to the pid if the name is empty)
  function remoteKey(pid, mode) {
    let base;
    try {
      const meta = window.KanaApp.loadMeta();
      const p = meta.profiles.find(x => x.id === pid);
      base = (p ? slug(p.name) : "") || pid;
    } catch (e) { base = pid; }
    return base + modeSuffix(mode);
  }
  function url(pid, mode) {
    return SYNC_ENDPOINT.replace(/\/+$/, "") +
      "/api/sync/" + encodeURIComponent(HOUSEHOLD) + "/" + encodeURIComponent(remoteKey(pid, mode));
  }

  // ---- push (debounced per profile+mode; fire-and-forget) ----
  const timers = {};
  function pushNow(pid, mode) {
    if (!ON()) return;
    let deck;
    try { deck = window.KanaApp.loadDeck(pid, mode); } catch (e) { return; }
    fetch(url(pid, mode), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deck),
      keepalive: true,
    }).catch(() => {}); // silent — offline is fine, localStorage already holds the truth
  }
  // app.js calls onSave(pid, deck, mode) after every local save.
  function onSave(pid, deck, mode) {
    if (!ON() || !pid) return;
    mode = mode || 'kana';
    const k = pid + '|' + mode;
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => pushNow(pid, mode), 1500); // coalesce bursts of grades
  }

  // ---- pull + merge BOTH decks (returns whether any local deck changed) ----
  async function pull(pid) {
    if (!ON() || !pid) return false;
    let anyChanged = false;
    for (const mode of modes()) {
      let remote;
      try {
        const res = await fetch(url(pid, mode), { method: "GET" });
        if (!res.ok) continue;
        remote = await res.json();
      } catch (e) { continue; } // unreachable -> stay on local copy
      if (!remote || !remote.cards || !remote.introduced) continue; // nothing stored yet

      let local, merged;
      try {
        local = window.KanaApp.loadDeck(pid, mode);
        merged = window.KanaApp.mergeDeck(local, remote, mode);
      } catch (e) { continue; }

      const changed = JSON.stringify(stripVolatile(merged)) !== JSON.stringify(stripVolatile(local));
      if (changed) {
        window.KanaApp.saveDeck(pid, mode, merged); // re-pushes the reconciled deck via onSave
        anyChanged = true;
      } else {
        pushNow(pid, mode); // local is ahead-or-equal; make sure remote has it
      }
    }
    return anyChanged;
  }
  function stripVolatile(d) {
    // compare card state + introduced set; ignore updatedAt/device churn
    return { cards: d.cards, introduced: (d.introduced || []).slice().sort(), reviews: d.reviews || 0 };
  }

  window.KanaSync = { onSave, pull, pushNow, enabled: ON, _slug: slug, _remoteKey: remoteKey };
})();
