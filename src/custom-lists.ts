/**
 * Custom lists for /stats/custom: named lists of PSA certs (each at a grade), each opened at
 * /stats/custom/#<id> (an id you can edit). Kept on Netlify (/api/lists, Netlify Blobs) so every
 * device sees the same lists; a copy in localStorage opens the page at once. Reading is open,
 * changes need the lists password (LISTS_PASSWORD in Netlify).
 */
type Any = any;

export type Item = { cert: string; grade: number; name?: string };
export type List = { id: string; name: string; items: Item[]; at: number };

const API = "/api/lists";
const CACHE = "mew_custom_lists_cache";
const LEGACY = "mew_custom_lists_v1"; // lists saved only in this browser (before /api/lists)
const NAMES = "mew_cert_names";
const PW = "mew_lists_pw";

const okList = (l: Any) => l && typeof l.id === "string" && Array.isArray(l.items);
function readJSON(key: string, fallback: Any) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch (e) { return fallback; } }
function writeJSON(key: string, v: Any) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

/** The lists as last seen (instant), then the current ones from the server. */
export const readCached = (): List[] => (readJSON(CACHE, []) as Any[]).filter(okList);
export async function fetchLists(): Promise<List[]> {
  const res = await fetch(API, { cache: "no-store" });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !Array.isArray(j.lists)) throw new Error((j && j.error) || `HTTP ${res.status}`);
  const lists = j.lists.filter(okList);
  writeJSON(CACHE, lists);
  return lists;
}

/* ---------- changes (password) ---------- */

function password(): string {
  const own = readJSON(PW, "");
  if (typeof own === "string" && own) return own;
  const stats = readJSON("mew_stats_pw", null); // the /stats password, if it's the same one
  return stats && typeof stats.pw === "string" ? stats.pw : "";
}

async function change(body: Any): Promise<List[]> {
  let pw = password();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!pw) {
      const p = window.prompt("Password to change lists:");
      if (!p) throw new Error("cancelled");
      pw = p;
    }
    const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, password: pw }) });
    const j = await res.json().catch(() => null);
    if (res.status === 401) { writeJSON(PW, ""); pw = ""; continue; }
    if (!res.ok || !j) throw new Error((j && j.error) || `HTTP ${res.status}`);
    writeJSON(PW, pw);
    if (Array.isArray(j.lists)) { writeJSON(CACHE, j.lists); return j.lists; }
    return readCached();
  }
  throw new Error("Wrong password.");
}

/** Save a list; prevId when its id (link) changed, isNew for a new list. Resolves to every list. */
export const saveList = (list: List, opts: { prevId?: string; isNew?: boolean } = {}) => change({ action: "save", list, ...opts });
export const deleteList = (id: string) => change({ action: "delete", id });

/* ---------- lists from before the server (this browser only) ---------- */

export const readLegacy = (): List[] => (readJSON(LEGACY, []) as Any[]).filter(okList);
export const clearLegacy = () => { try { localStorage.removeItem(LEGACY); } catch (e) {} };

/* ---------- card names seen (for the hub, without fetching) ---------- */

export const knownNames = (): Record<string, string> => readJSON(NAMES, {}) || {};
export function rememberNames(names: Map<string, string>) {
  const all = knownNames();
  let changed = false;
  names.forEach((n, c) => { if (all[c] !== n) { all[c] = n; changed = true; } });
  if (changed) writeJSON(NAMES, all);
}

/* ---------- ids and certs ---------- */

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const newId = () => Math.random().toString(36).slice(2, 10);
/** A link id from a name: "Gold Stars" → "gold-stars" (random when the name has no a–z/0–9). */
export function slugify(name: string) {
  const s = String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || newId();
}
export const listUrl = (id: string) => `${location.origin}/stats/custom/#${id}`;

/**
 * Certs from pasted text: any run of 7+ digits is a cert; a grade may follow it on the same line
 * ("12345678 9", "12345678 PSA 9", "12345678, 9.5"). Without one it's PSA 10. Repeats are dropped.
 */
export function parseCerts(text: string): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const line of String(text || "").split(/\n/)) {
    const toks = line.split(/[\s,;|/]+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].replace(/^#/, "");
      if (!/^\d{7,12}$/.test(t)) continue;
      let grade = 10;
      let j = i + 1;
      if (toks[j] && /^psa$/i.test(toks[j])) j++;
      const g = toks[j] ? /^(?:psa|g)?(\d{1,2}(?:\.5)?)$/i.exec(toks[j]) : null;
      if (g && parseFloat(g[1]) >= 1 && parseFloat(g[1]) <= 10) { grade = parseFloat(g[1]); i = j; }
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ cert: t, grade });
    }
  }
  return out;
}

/** The list as editable text, one cert per line (grade shown when it isn't 10). */
export const certsText = (items: Item[]) => items.map((it) => (it.grade === 10 ? it.cert : `${it.cert} ${it.grade}`)).join("\n");

/* ---------- what PSA says about a cert (year, set, number…) ---------- */

export type CertInfo = { year: number | null; set: string; number: string; subject: string; variety: string; grade: number | null; gradeText?: string; notFound?: boolean };
const INFO = "mew_cert_info";

/** PSA details for certs (from /api/certs, kept here too); token false = PSA_TOKEN isn't set. */
export async function fetchCertInfo(certs: string[]): Promise<{ info: Record<string, CertInfo>; token: boolean; limited: boolean }> {
  const info: Record<string, CertInfo> = readJSON(INFO, {}) || {};
  const want = certs.filter((c) => !info[c]);
  let token = true, limited = false;
  for (let i = 0; i < want.length; i += 60) {
    try {
      const res = await fetch(`/api/certs?certs=${want.slice(i, i + 60).join(",")}`, { cache: "no-store" });
      const j = await res.json();
      if (j && j.certs) Object.assign(info, j.certs);
      if (j && j.token === false) token = false;
      if (j && j.limited) limited = true;
    } catch (e) { break; }
  }
  writeJSON(INFO, info);
  return { info, token, limited };
}
