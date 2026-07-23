/* Kana Cards — cloud sync Worker (Cloudflare Workers + KV).
 *
 * Endpoints (household + profile are opaque path segments; NO login, per home-network use):
 *   GET  /api/sync/:household/:profile  -> returns the stored deck JSON (or {} if none)
 *   POST /api/sync/:household/:profile  -> merges the posted deck into the stored one, returns the merge
 *   GET  /api/health                    -> {ok:true}
 *
 * The server is the merge point: on POST it card-level merges incoming with stored
 * (newest per card by `.last`, reviews = max) — mirrors the client mergeDeck — so two
 * devices pushing concurrently never clobber each other. Deck-level LWW falls out of this.
 *
 * Storage: KV binding `KANA_KV`. Key = `deck:${household}:${profile}`.
 * The app stays offline-first: this Worker is purely additive. If it's down/unset, the
 * client degrades silently and localStorage remains the source of truth.
 */

const CORS = {
  // Tighten to your GitHub Pages origin if you like, e.g. 'https://<user>.github.io'.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Card-level merge — identical policy to the client's mergeDeck (newest .last wins).
function mergeDeck(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = {
    cards: {},
    introduced: [],
    reviews: Math.max(a.reviews || 0, b.reviews || 0),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
    device: b.device || a.device || null,
  };
  const ids = new Set([...(a.introduced || []), ...(b.introduced || [])]);
  for (const id of ids) {
    const ca = a.cards ? a.cards[id] : null;
    const cb = b.cards ? b.cards[id] : null;
    out.cards[id] = !ca ? cb : !cb ? ca : ((cb.last || 0) >= (ca.last || 0) ? cb : ca);
    out.introduced.push(id);
  }
  return out;
}

function validDeck(d) {
  return d && typeof d === 'object' && d.cards && typeof d.cards === 'object' && Array.isArray(d.introduced);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api','sync',household,profile]

    if (parts[0] === 'api' && parts[1] === 'health') return json({ ok: true });

    if (parts[0] !== 'api' || parts[1] !== 'sync' || parts.length !== 4) {
      return json({ error: 'not found' }, 404);
    }
    if (!env.KANA_KV) return json({ error: 'KV binding KANA_KV not configured' }, 500);

    const household = decodeURIComponent(parts[2]).slice(0, 64);
    const profile = decodeURIComponent(parts[3]).slice(0, 64);
    if (!household || !profile) return json({ error: 'bad key' }, 400);
    const key = `deck:${household}:${profile}`;

    if (request.method === 'GET') {
      const stored = await env.KANA_KV.get(key, 'json');
      return json(stored || {});
    }

    if (request.method === 'POST') {
      let incoming;
      try { incoming = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
      if (!validDeck(incoming)) return json({ error: 'bad deck shape' }, 400);
      const stored = await env.KANA_KV.get(key, 'json');
      const merged = mergeDeck(stored, incoming);
      await env.KANA_KV.put(key, JSON.stringify(merged));
      return json(merged);
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
