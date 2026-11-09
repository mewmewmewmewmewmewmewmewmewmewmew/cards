/**
 * /api/certs?certs=1,2,3 (Cloudflare Pages Function): what PSA
 * says about each cert (year, set, card number, name, variety, grade). Looked up once through
 * PSA's public API (the PSA_TOKEN secret, ~100 calls a day) and kept in MEW_KV for good, since a
 * cert never changes.
 * → { certs: { [cert]: info | { notFound: true } }, token: bool, limited?: true }
 */
const PSA = "https://api.psacard.com/publicapi/cert/GetByCertNumber/";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// "GEM MT 10" → 10, "MINT 9" → 9, "NM-MT 8.5" → 8.5
const gradeOf = (s) => { const m = /(\d+(?:\.5)?)\s*$/.exec(String(s || "")); return m ? Number(m[1]) : null; };

function infoOf(c) {
  return {
    year: /^\d{4}$/.test(String(c.Year || "").trim()) ? Number(c.Year) : null,
    set: String(c.Brand || "").trim(),
    number: String(c.CardNumber || "").trim(),
    subject: String(c.Subject || "").trim(),
    variety: String(c.Variety || "").trim(),
    grade: gradeOf(c.CardGrade || c.GradeDescription),
    gradeText: String(c.CardGrade || "").trim(),
    at: Date.now(),
  };
}

export async function onRequestGet({ request, env }) {
  const certs = [...new Set((new URL(request.url).searchParams.get("certs") || "").split(",").map((s) => s.trim()).filter((s) => /^\d{7,12}$/.test(s)))].slice(0, 60);
  if (!env.MEW_KV) return json({ certs: {}, token: !!env.PSA_TOKEN, error: "The MEW_KV namespace isn't bound to this Pages project yet" });
  const key = (c) => `psa-cert:${c}`;
  const out = {};
  await Promise.all(certs.map(async (c) => { const v = await env.MEW_KV.get(key(c), "json").catch(() => null); if (v) out[c] = v; }));
  const token = env.PSA_TOKEN;
  const missing = certs.filter((c) => !out[c]);
  if (!token || !missing.length) return json({ certs: out, token: !!token });

  let limited = false;
  for (const c of missing) {
    if (limited) break;
    try {
      const res = await fetch(PSA + c, { headers: { authorization: `bearer ${token}` } });
      if (res.status === 429 || res.status === 401 || res.status === 403) { limited = true; break; }
      if (res.status === 404) { out[c] = { notFound: true, at: Date.now() }; await env.MEW_KV.put(key(c), JSON.stringify(out[c])); continue; }
      if (!res.ok) continue;
      const j = await res.json().catch(() => null);
      const cert = j && j.PSACert;
      if (!cert) { if (j && /not found|invalid/i.test(String(j.ServerMessage || ""))) { out[c] = { notFound: true, at: Date.now() }; await env.MEW_KV.put(key(c), JSON.stringify(out[c])); } continue; }
      out[c] = infoOf(cert);
      await env.MEW_KV.put(key(c), JSON.stringify(out[c]));
    } catch (e) { /* try again on a later visit */ }
  }
  return json({ certs: out, token: true, ...(limited ? { limited: true } : {}) });
}
