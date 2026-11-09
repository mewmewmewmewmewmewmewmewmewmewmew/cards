/**
 * PSA details for certs (year, set, card number, name, variety, grade, slab photo), kept in MEW_KV
 * for good as "psa-cert:<cert>", since a cert never changes. PSA's API refuses requests from
 * servers that aren't approved, but answers browsers, so the lookups happen in the list owner's
 * browser (src/custom-lists.ts) and are saved here. (Not a route: files starting with _ aren't
 * served.)
 */
const key = (c) => `psa-cert:${c}`;

/** What's saved for these certs: { [cert]: info | { notFound: true } }. */
export async function readPsa(env, certs) {
  const info = {};
  await Promise.all(certs.map(async (c) => { const v = await env.MEW_KV.get(key(c), "json").catch(() => null); if (v) info[c] = v; }));
  return info;
}

const str = (v, n) => String(v === null || v === undefined ? "" : v).slice(0, n);

/** One cert's details as sent by a browser, kept to the known fields. */
export function cleanInfo(i) {
  if (!i || typeof i !== "object") return null;
  if (i.notFound) return { notFound: true, at: Date.now() };
  const year = Number(i.year);
  return {
    year: year >= 1990 && year <= 2100 ? year : null,
    set: str(i.set, 120), number: str(i.number, 40), subject: str(i.subject, 120), variety: str(i.variety, 120),
    grade: Number(i.grade) >= 1 && Number(i.grade) <= 10 ? Number(i.grade) : null, gradeText: str(i.gradeText, 40),
    ...(i.imgTried ? { imgTried: true, image: /^https:\/\//.test(String(i.image || "")) ? str(i.image, 500) : "" } : {}),
    at: Date.now(),
  };
}

export const savePsa = (env, cert, info) => env.MEW_KV.put(key(cert), JSON.stringify(info));
