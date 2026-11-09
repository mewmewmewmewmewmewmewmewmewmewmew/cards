/**
 * What PSA says about certs (year, set, card number, name, variety, grade), through PSA's public
 * API (the PSA_TOKEN secret, ~100 calls a day). Each answer is kept in MEW_KV for good, since a
 * cert never changes, so a cert is only ever looked up once. (Not a route: files starting with _
 * aren't served.)
 */
const PSA = "https://api.psacard.com/publicapi/cert/GetByCertNumber/";
const PSA_IMAGES = "https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/";
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
 * Each cert costs two calls once: its details, then PSA's photo of the slab (info.image, the front;
 * imgTried marks that it was asked, as older certs often have no photo). At most `max` calls to
 * PSA (a Pages Function may only make 50 outside requests); the rest are looked up later.
 */
export async function lookupPsa(env, certs, max = 40) {
  const info = {};
  await Promise.all(certs.map(async (c) => { const v = await env.MEW_KV.get(key(c), "json").catch(() => null); if (v) info[c] = v; }));
  const token = env.PSA_TOKEN;
  let limited = false;
  if (!token) return { info, token: false, limited };
  let calls = 0;
  const get = async (url) => {
    calls++;
    const res = await fetch(url, { headers: { authorization: `bearer ${token}` } });
    if (res.status === 429 || res.status === 401 || res.status === 403) { limited = true; return { stop: true }; }
    return { status: res.status, ok: res.ok, json: res.ok ? await res.json().catch(() => null) : null };
  };
  const save = (c) => env.MEW_KV.put(key(c), JSON.stringify(info[c]));
  for (const c of certs) {
    if (limited || calls >= max) break;
    try {
      if (!info[c]) {
        const r = await get(PSA + c);
        if (r.stop) break;
        const cert = r.json && r.json.PSACert;
        if (r.status === 404 || (!cert && r.json && /not found|invalid/i.test(String(r.json.ServerMessage || "")))) { info[c] = { notFound: true, at: Date.now() }; await save(c); continue; }
        if (!cert) continue; // tried again later
        info[c] = infoOf(cert);
        await save(c);
      }
      // PSA's photo of the slab (the front), once per cert.
      if (!info[c].notFound && !info[c].imgTried && calls < max) {
        const r = await get(PSA_IMAGES + c);
        if (r.stop) break;
        if (!r.ok && r.status !== 404) continue;
        // A list of { IsFrontImage, ImageURL } (or the same list inside an object).
        const imgs = Array.isArray(r.json) ? r.json : r.json && typeof r.json === "object" ? (Object.values(r.json).find(Array.isArray) || []) : [];
        const front = imgs.find((x) => x && x.IsFrontImage && x.ImageURL) || imgs.find((x) => x && x.ImageURL);
        info[c] = { ...info[c], image: front ? String(front.ImageURL) : "", imgTried: true };
        await save(c);
      }
    } catch (e) { /* tried again later */ }
  }
  return { info, token: true, limited };
}
