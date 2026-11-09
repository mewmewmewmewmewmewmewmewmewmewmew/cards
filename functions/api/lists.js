/**
 * /api/lists on Cloudflare Pages (same API as netlify/functions/lists.mjs): the custom lists
 * behind /stats/custom, kept in the MEW_KV namespace (one JSON value), so every device sees the
 * same lists.
 *   GET  → { lists }
 *   POST { password, action: "save", list, prevId?, isNew? } → { lists }
 *   POST { password, action: "delete", id }                 → { lists }
 *   POST { password, action: "check" }                      → { ok: true }
 * Reading is open; changes need the LISTS_PASSWORD secret.
 */
const KEY = "custom-lists";
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const clean = (l) => ({
  id: String(l.id),
  name: String(l.name || "Untitled list").slice(0, 80),
  items: (Array.isArray(l.items) ? l.items : []).slice(0, 500)
    .filter((it) => it && /^\d{7,12}$/.test(String(it.cert)))
    .map((it) => ({ cert: String(it.cert), grade: Math.min(10, Math.max(1, Number(it.grade) || 10)), ...(it.name ? { name: String(it.name).slice(0, 120) } : {}) })),
  at: Date.now(),
});

const read = async (env) => (await env.MEW_KV.get(KEY, "json")) || [];

export async function onRequestGet({ env }) {
  if (!env.MEW_KV) return json({ error: "The MEW_KV namespace isn't bound to this Pages project yet" }, 503);
  return json({ lists: await read(env) });
}

export async function onRequestPost({ request, env }) {
  if (!env.MEW_KV) return json({ error: "The MEW_KV namespace isn't bound to this Pages project yet" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  if (!env.LISTS_PASSWORD) return json({ error: "LISTS_PASSWORD isn't set in Cloudflare yet" }, 503);
  if (!body || body.password !== env.LISTS_PASSWORD) return json({ error: "auth" }, 401);

  const lists = await read(env);
  if (body.action === "check") return json({ ok: true });
  if (body.action === "delete") {
    const next = lists.filter((l) => l.id !== body.id);
    await env.MEW_KV.put(KEY, JSON.stringify(next));
    return json({ lists: next });
  }
  if (body.action === "save") {
    const l = body.list && clean(body.list);
    if (!l || !ID.test(l.id)) return json({ error: "The link can only use a–z, 0–9 and dashes (up to 40)." }, 400);
    if (!l.items.length) return json({ error: "No certs in the list." }, 400);
    const prev = body.prevId && body.prevId !== l.id ? body.prevId : null;
    // A new list, or a renamed link, can't take an id another list already has.
    if ((prev || body.isNew) && lists.some((x) => x.id === l.id)) return json({ error: `#${l.id} is already used by another list.` }, 409);
    const next = [l, ...lists.filter((x) => x.id !== l.id && x.id !== prev)];
    await env.MEW_KV.put(KEY, JSON.stringify(next));
    return json({ lists: next });
  }
  return json({ error: "unknown action" }, 400);
}
