/**
 * What PSA says about certs (year, set, card number, name, variety, grade), through PSA's public
 * API (the PSA_TOKEN secret, ~100 calls a day). Each answer is kept in MEW_KV for good, since a
 * cert never changes, so a cert is only ever looked up once. (Not a route: files starting with _
 * aren't served.)
 */
const PSA = "https://api.psacard.com/publicapi/cert/GetByCertNumber/";
const key = (c) => `psa-cert:${c}`;

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

/**
 * → { info: { [cert]: info | { notFound: true } }, token: bool, limited: bool }
 * At most `max` calls to PSA (a Pages Function may only make 50 outside requests); the rest are
 * looked up on a later refresh.
 */
export async function lookupPsa(env, certs, max = 40) {
  const info = {};
  await Promise.all(certs.map(async (c) => { const v = await env.MEW_KV.get(key(c), "json").catch(() => null); if (v) info[c] = v; }));
  const token = env.PSA_TOKEN;
  let limited = false;
  if (!token) return { info, token: false, limited };
  for (const c of certs.filter((c) => !info[c]).slice(0, Math.max(0, max))) {
    try {
      const res = await fetch(PSA + c, { headers: { authorization: `bearer ${token}` } });
      if (res.status === 429 || res.status === 401 || res.status === 403) { limited = true; break; }
      if (res.status === 404) { info[c] = { notFound: true, at: Date.now() }; await env.MEW_KV.put(key(c), JSON.stringify(info[c])); continue; }
      if (!res.ok) continue;
      const j = await res.json().catch(() => null);
      const cert = j && j.PSACert;
      if (!cert) { if (j && /not found|invalid/i.test(String(j.ServerMessage || ""))) { info[c] = { notFound: true, at: Date.now() }; await env.MEW_KV.put(key(c), JSON.stringify(info[c])); } continue; }
      info[c] = infoOf(cert);
      await env.MEW_KV.put(key(c), JSON.stringify(info[c]));
    } catch (e) { /* tried again on the next refresh */ }
  }
  return { info, token: true, limited };
}
