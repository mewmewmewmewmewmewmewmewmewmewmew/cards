/**
 * /api/snapshot — the saved ALT data (and PSA details) for one custom list, so viewing a list
 * never calls ALT: everyone reads the same saved copy, and only Refresh fetches new data.
 *   GET  ?id=<list id>          → { snap }  (null until the first refresh)
 *   POST { id, mode, password? } → { snap }  mode "all": every cert fresh from ALT (Refresh);
 *                                            mode "missing": only certs the copy doesn't have yet
 *                                            (after a list is made or edited);
 *                                            mode "psa": no ALT, only PSA details still missing
 *                                            (queued certs, e.g. after PSA's daily limit).
 * A list with a view password needs it (x-view-password header on GET, viewPassword in the POST
 * body) or the main password (x-password, password). Anyone who may see a list may refresh it, but a list refreshes at most once per COOLDOWN unless the request carries
 * LISTS_PASSWORD; "psa" waits PSA_RETRY after PSA said its daily limit was used up (10 min after it refused the
 * token or the request). Kept in MEW_KV
 * as "snap:<id>":
 *   { at, tried, results: { "<cert>|<grade>": ALT result }, psa: { [cert]: info }, psaToken, psaLimited, psaRetryAt, errors }
 */
import { lookupPsa } from "../_psa.js";
import { read, isMain, canView } from "../_lists.js";

const ALT = "https://cryptjapan-proxy.mew-860.workers.dev/alt-history";
const COOLDOWN = 15 * 60 * 1000;
const PSA_RETRY = 60 * 60 * 1000;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const snapKey = (id) => `snap:${id}`;

// Only what the page uses, so the saved copy stays small.
const trim = (r) => ({
  cert: String(r.cert), assetId: r.assetId, subject: r.subject, grade: r.grade, grader: r.grader,
  history: Array.isArray(r.history) ? r.history.map((p) => ({ date: p.date, value: p.value })) : null,
  sales: Array.isArray(r.sales) ? r.sales.map((s) => ({ date: s.date, price: s.price, ...(s.auctionHouse ? { auctionHouse: s.auctionHouse } : {}) })) : [],
  salesFilter: r.salesFilter, cachedAt: r.cachedAt, cache: r.cache, error: r.error,
  ...(r.population || r.pop ? { population: r.population || r.pop } : {}),
  ...(r.cardNumber ? { cardNumber: r.cardNumber } : {}), ...(r.set || r.setName ? { set: r.set || r.setName } : {}), ...(r.year ? { year: r.year } : {}),
});
const useful = (r) => !!r && ((Array.isArray(r.history) && r.history.length > 0) || (Array.isArray(r.sales) && r.sales.length > 0));

/** ALT results for certs at one grade, 20 per request (the Worker's limit); one retry per batch. */
async function fetchAlt(certs, grade, fresh, errors) {
  const out = new Map();
  let calls = 0;
  for (let i = 0; i < certs.length; i += 20) {
    const batch = certs.slice(i, i + 20);
    for (let attempt = 0; attempt < 2; attempt++) {
      calls++;
      try {
        const res = await fetch(`${ALT}?certs=${batch.join(",")}&sales=1&grade=${grade}&grader=PSA${fresh ? "&fresh=1" : ""}`, { headers: { origin: "https://mew.cards" } });
        const j = await res.json().catch(() => null);
        if (j && Array.isArray(j.results)) { j.results.forEach((r) => out.set(String(r.cert), r)); break; }
        if (attempt) errors.push(`ALT HTTP ${res.status}${j && j.error ? `: ${j.error}` : ""}`);
      } catch (e) { if (attempt) errors.push(`ALT network error: ${(e && e.message) || e}`); }
    }
  }
  return { out, calls };
}

export async function onRequestGet({ request, env }) {
  if (!env.MEW_KV) return json({ error: "The MEW_KV namespace isn't bound to this Pages project yet" }, 503);
  const id = new URL(request.url).searchParams.get("id") || "";
  const list = (await read(env)).find((l) => l.id === id);
  if (list && !(await canView(env, list, request.headers.get("x-password"))) && !(await canView(env, list, request.headers.get("x-view-password")))) return json({ error: "locked" }, 401);
  return json({ snap: id ? await env.MEW_KV.get(snapKey(id), "json") : null });
}

export async function onRequestPost({ request, env }) {
  if (!env.MEW_KV) return json({ error: "The MEW_KV namespace isn't bound to this Pages project yet" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const lists = await read(env);
  const list = lists.find((l) => l.id === (body && body.id));
  if (!list) return json({ error: "No such list." }, 404);
  if (!(await canView(env, list, body.password)) && !(await canView(env, list, body.viewPassword))) return json({ error: "locked" }, 401);
  const owner = isMain(env, body.password);
  const prev = (await env.MEW_KV.get(snapKey(list.id), "json")) || { results: {}, psa: {} };
  const certs = [...new Set(list.items.map((it) => it.cert))];
  if (body.mode === "psa") {
    // The PSA queue: only certs still without PSA details, no ALT calls.
    const queued = certs.filter((c) => { const i = (prev.psa || {})[c]; return !i || (!i.notFound && !i.imgTried); });
    if (!queued.length || !env.PSA_TOKEN || (prev.psaRetryAt && Date.now() < prev.psaRetryAt)) return json({ snap: prev });
    const psa = await lookupPsa(env, queued, 45);
    const snap = { ...prev, psa: { ...(prev.psa || {}), ...psa.info }, psaToken: psa.token, psaLimited: psa.limited, psaProblem: psa.problem || null, psaPhotosRefused: psa.photosRefused || null, psaRetryAt: psa.limited ? Date.now() + (psa.problem && psa.problem.status !== 429 ? 10 * 60 * 1000 : PSA_RETRY) : 0 };
    await env.MEW_KV.put(snapKey(list.id), JSON.stringify(snap));
    await nameItems(env, lists, list, snap);
    return json({ snap });
  }
  if (!owner && prev.tried && Date.now() - prev.tried < COOLDOWN) {
    return json({ snap: prev, cooldown: Math.ceil((COOLDOWN - (Date.now() - prev.tried)) / 60000) });
  }

  const missingOnly = body.mode === "missing";
  const want = list.items.filter((it) => !missingOnly || !prev.results[`${it.cert}|${it.grade}`]);
  const errors = [];
  const results = {};
  // Keep only the list's current certs; a refresh that comes back empty keeps the earlier result.
  list.items.forEach((it) => { const k = `${it.cert}|${it.grade}`; if (prev.results[k]) results[k] = prev.results[k]; });
  let calls = 0;
  const byGrade = new Map();
  want.forEach((it) => { if (!byGrade.has(it.grade)) byGrade.set(it.grade, []); byGrade.get(it.grade).push(it.cert); });
  for (const [grade, certs] of byGrade) {
    const got = await fetchAlt(certs, grade, !missingOnly, errors);
    calls += got.calls;
    certs.forEach((c) => {
      const r = got.out.get(c), k = `${c}|${grade}`;
      if (r && (useful(r) || !results[k])) results[k] = trim(r);
    });
  }
  // PSA: anything not yet known (a cert is only ever looked up once); certs past PSA's daily
  // limit stay queued for a later visit or refresh.
  const psa = await lookupPsa(env, certs, 45 - calls);
  const snap = { at: want.length ? Date.now() : prev.at || Date.now(), tried: Date.now(), results, psa: psa.info, psaToken: psa.token, psaLimited: psa.limited, psaProblem: psa.problem || null, psaPhotosRefused: psa.photosRefused || null, psaRetryAt: psa.limited ? Date.now() + (psa.problem && psa.problem.status !== 429 ? 10 * 60 * 1000 : PSA_RETRY) : 0, errors };
  await env.MEW_KV.put(snapKey(list.id), JSON.stringify(snap));
  await nameItems(env, lists, list, snap);
  return json({ snap });
}

/** Card names for the hub (ALT's, else PSA's), saved on the list. */
async function nameItems(env, lists, list, snap) {
  let named = false;
  list.items.forEach((it) => {
    const r = snap.results[`${it.cert}|${it.grade}`], p = (snap.psa || {})[it.cert];
    const n = (r && r.subject) || (p && !p.notFound && p.subject);
    if (n && !it.name) { it.name = n; named = true; }
  });
  if (named) await env.MEW_KV.put("custom-lists", JSON.stringify(lists));
}
