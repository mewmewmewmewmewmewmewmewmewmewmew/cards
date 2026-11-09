/**
 * /api/lists (Cloudflare Pages Function): the custom lists
 * behind /stats/custom, kept in the MEW_KV namespace (one JSON value), so every device sees the
 * same lists.
 *   GET  → { lists }
 *   POST { password, action: "save", list, prevId?, isNew? } → { lists }
 *   POST { password, action: "delete", id }                 → { lists }
 *   POST { password, action: "check" }                      → { ok: true }
 * Reading is open, except lists with a view password (see _lists.js): without it (or the main
 * password, sent as an x-password header) a browser gets only their name and size;
 *   POST { action: "open", id, password } → { list }  opens one with its view password.
 *   POST { password, action: "psaToken" }  → { token }  PSA_TOKEN, for PSA lookups in the browser.
 * Changes need the LISTS_PASSWORD secret. A saved list may carry viewPassword (set or change it)
 * or removeViewPassword; otherwise it keeps the one it had.
 */
import { KEY, read, hashPw, isMain, canView, shown, hidden } from "../_lists.js";
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const clean = (l) => ({
  id: String(l.id),
  name: String(l.name || "Untitled list").slice(0, 80),
  items: (Array.isArray(l.items) ? l.items : []).slice(0, 500)
    .filter((it) => it && /^\d{7,12}$/.test(String(it.cert)))
    .map((it) => ({ cert: String(it.cert), grade: Math.min(10, Math.max(1, Number(it.grade) || 10)), ...(it.name ? { name: String(it.name).slice(0, 120) } : {}), ...(it.label ? { label: String(it.label).slice(0, 40) } : {}) })),
  ...(/^#[0-9a-f]{6}$/i.test(String(l.color || "")) ? { color: String(l.color).toLowerCase() } : {}),
  at: Date.now(),
});

export async function onRequestGet({ request, env }) {
  if (!env.MEW_KV) return json({ error: "The MEW_KV namespace isn't bound to this Pages project yet" }, 503);
  const main = isMain(env, request.headers.get("x-password"));
  return json({ lists: (await read(env)).map((l) => (main || !l.viewHash ? shown(l) : hidden(l))) });
}

export async function onRequestPost({ request, env }) {
  if (!env.MEW_KV) return json({ error: "The MEW_KV namespace isn't bound to this Pages project yet" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  if (body && body.action === "open") {
    const l = (await read(env)).find((x) => x.id === body.id);
    if (!l) return json({ error: "No such list." }, 404);
    if (!(await canView(env, l, body.password))) return json({ error: "auth" }, 401);
    return json({ list: shown(l) });
  }
  if (!env.LISTS_PASSWORD) return json({ error: "LISTS_PASSWORD isn't set in Cloudflare yet" }, 503);
  if (!body || body.password !== env.LISTS_PASSWORD) return json({ error: "auth" }, 401);

  const lists = await read(env);
  if (body.action === "check") return json({ ok: true });
  // PSA answers browsers but not this server, so the owner's browser does the lookups with the
  // token kept here (only ever handed out with the main password).
  if (body.action === "psaToken") {
    const token = String(env.PSA_TOKEN || "").trim().replace(/^bearer\s+/i, "");
    return token ? json({ token }) : json({ error: "PSA_TOKEN isn't set in Cloudflare" }, 404);
  }
  if (body.action === "delete") {
    const next = lists.filter((l) => l.id !== body.id);
    await env.MEW_KV.put(KEY, JSON.stringify(next));
    await env.MEW_KV.delete(`snap:${body.id}`);
    return json({ lists: next.map(shown) });
  }
  if (body.action === "save") {
    const l = body.list && clean(body.list);
    if (!l || !ID.test(l.id)) return json({ error: "The link can only use a–z, 0–9 and dashes (up to 40)." }, 400);
    if (!l.items.length) return json({ error: "No certs in the list." }, 400);
    const prev = body.prevId && body.prevId !== l.id ? body.prevId : null;
    // A new list, or a renamed link, can't take an id another list already has.
    if ((prev || body.isNew) && lists.some((x) => x.id === l.id)) return json({ error: `#${l.id} is already used by another list.` }, 409);
    const before = lists.find((x) => x.id === (prev || l.id));
    const vp = String(body.list.viewPassword || "");
    if (vp) l.viewHash = await hashPw(vp);
    else if (!body.list.removeViewPassword && before && before.viewHash) l.viewHash = before.viewHash;
    const next = [l, ...lists.filter((x) => x.id !== l.id && x.id !== prev)];
    await env.MEW_KV.put(KEY, JSON.stringify(next));
    if (prev) {
      // A new link keeps the list's saved data.
      const snap = await env.MEW_KV.get(`snap:${prev}`);
      if (snap) { await env.MEW_KV.put(`snap:${l.id}`, snap); await env.MEW_KV.delete(`snap:${prev}`); }
    }
    return json({ lists: next.map(shown) });
  }
  return json({ error: "unknown action" }, 400);
}
