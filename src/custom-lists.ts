/**
 * Custom lists for /stats/custom: named lists of PSA certs (each at a grade), each opened at
 * /stats/custom/#<id> (an id you can edit). Kept on Cloudflare (/api/lists, functions/api, in the
 * MEW_KV namespace) so every device sees the same lists; a copy in localStorage opens the page at
 * once. Reading is open, changes need the LISTS_PASSWORD secret. A list can have its own view
 * password: then the server sends its certs and data only with that password or the main one.
 */
type Any = any;

export type Item = { cert: string; grade: number; name?: string };
/** color: its theme colour (#rrggbb, none = the site pink); locked: the list has a view password; hidden: this browser hasn't given it (no items sent, count = how many). */
export type List = { id: string; name: string; items: Item[]; at: number; color?: string; locked?: boolean; hidden?: boolean; count?: number };

const API = "/api/lists";
const CACHE = "mew_custom_lists_cache";
const LEGACY = "mew_custom_lists_v1"; // lists saved only in this browser (before /api/lists)
const NAMES = "mew_cert_names";
const PW = "mew_lists_pw";
const VIEW_PW = "mew_list_view_pw"; // { [list id]: its view password }

const okList = (l: Any) => l && typeof l.id === "string" && Array.isArray(l.items);
function readJSON(key: string, fallback: Any) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch (e) { return fallback; } }
function writeJSON(key: string, v: Any) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

/** The lists as last seen (instant), then the current ones from the server. */
export const readCached = (): List[] => (readJSON(CACHE, []) as Any[]).filter(okList);
export async function fetchLists(): Promise<List[]> {
  const res = await fetch(API, { cache: "no-store", headers: password() ? { "x-password": password() } : {} });
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

/**
 * Save a list; prevId when its id (link) changed, isNew for a new list. viewPassword sets or
 * changes its view password, removeViewPassword drops it (neither: it keeps the one it had).
 * Resolves to every list.
 */
export const saveList = (list: List & { viewPassword?: string; removeViewPassword?: boolean }, opts: { prevId?: string; isNew?: boolean } = {}) => change({ action: "save", list, ...opts });

/* ---------- view passwords ---------- */

/** Both passwords this browser knows for a list (its view password, the main one), as headers. */
const pwHeaders = (id: string): Record<string, string> => {
  const h: Record<string, string> = {};
  if (password()) h["x-password"] = password();
  if (savedViewPw(id)) h["x-view-password"] = savedViewPw(id);
  return h;
};

/** Open a locked list with its view password (or the main one); remembered for next time. */
export async function openList(id: string, pw: string): Promise<List> {
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "open", id, password: pw }) });
  const j = await res.json().catch(() => null);
  if (res.status === 401) throw new Error("Wrong password.");
  if (!res.ok || !j || !okList(j.list)) throw new Error((j && j.error) || `HTTP ${res.status}`);
  writeJSON(VIEW_PW, { ...(readJSON(VIEW_PW, {}) || {}), [id]: pw });
  return j.list;
}
/** A remembered view password for this list, if any (to open it without asking). */
export const savedViewPw = (id: string): string => (readJSON(VIEW_PW, {}) || {})[id] || "";
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
 * Certs from pasted text: any run of 7+ digits is a cert, and the grades after it on the line
 * ("12345678 9", "12345678 PSA 9", "12345678 9 10") list it once per grade; with none it's a
 * PSA 10. Anything else on the line is ignored. Repeats (same cert and grade) are dropped.
 */
export function parseCerts(text: string): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  const add = (cert: string, grade: number) => { const k = `${cert}|${grade}`; if (!seen.has(k)) { seen.add(k); out.push({ cert, grade }); } };
  for (const line of String(text || "").split(/\n/)) {
    let cert = "", grades: number[] = [];
    const flush = () => { if (cert) (grades.length ? grades : [10]).forEach((g) => add(cert, g)); cert = ""; grades = []; };
    for (const raw of line.split(/[\s,;|]+/).filter(Boolean)) {
      const t = raw.replace(/^#/, "");
      if (/^\d{7,12}$/.test(t)) { flush(); cert = t; continue; }
      const g = cert ? /^(?:psa|g)?(\d{1,2}(?:\.5)?)$/i.exec(t) : null;
      if (g && parseFloat(g[1]) >= 1 && parseFloat(g[1]) <= 10) grades.push(parseFloat(g[1]));
    }
    flush();
  }
  return out;
}

/** The list as editable text: one line per cert, with its grades unless it's only a PSA 10. */
export function certsText(items: Item[]) {
  const byCert = new Map<string, number[]>();
  items.forEach((it) => { if (!byCert.has(it.cert)) byCert.set(it.cert, []); byCert.get(it.cert)!.push(it.grade); });
  return [...byCert].map(([c, gs]) => (gs.length === 1 && gs[0] === 10 ? c : `${c} ${gs.join(" ")}`)).join("\n");
}

/* ---------- saved ALT data + PSA details per list (/api/snapshot) ---------- */

export type CertInfo = { year: number | null; set: string; number: string; subject: string; variety: string; grade: number | null; gradeText?: string; image?: string; imgTried?: boolean; notFound?: boolean };
/** results are keyed "<cert>|<grade>"; at = when the data was last fetched. */
export type Snap = { at: number; tried?: number; results: Record<string, Any>; psa: Record<string, CertInfo>; psaToken?: boolean; psaLimited?: boolean; psaProblem?: { status: number; text: string } | null; psaPhotosRefused?: { status: number; text: string } | null; psaRetryAt?: number; errors?: string[] };

export async function fetchSnapshot(id: string): Promise<Snap | null> {
  const res = await fetch(`/api/snapshot?id=${encodeURIComponent(id)}`, { cache: "no-store", headers: pwHeaders(id) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error((j && j.error) || `HTTP ${res.status}`);
  return j.snap || null;
}

/**
 * Fetch new data for a list on the server: "all" (Refresh) or only the certs it doesn't have yet.
 * Sends the passwords this browser knows (no prompt): the main one skips the cooldown, and a
 * locked list needs one of them.
 * → { snap, cooldown? (minutes until anyone can refresh again) }
 */
export async function refreshSnapshot(id: string, mode: "all" | "missing" | "psa"): Promise<{ snap: Snap; cooldown?: number }> {
  const res = await fetch("/api/snapshot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, mode, password: password() || undefined, viewPassword: savedViewPw(id) || undefined }) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.snap) throw new Error((j && j.error) || `HTTP ${res.status}`);
  return j;
}

/** Ask for (and check) the lists password before opening a form. Throws when it's wrong or cancelled. */
export const checkPassword = () => change({ action: "check" });

/** Editing is unlocked on this device: the lists password has been accepted here. */
export const isUnlocked = () => { const own = readJSON(PW, ""); return typeof own === "string" && !!own; };
/** Lock editing again (forget the lists password on this device). */
export const lockEditing = () => writeJSON(PW, "");

/* ---------- PSA lookups, in the owner's browser ---------- */
// PSA's API answers browsers but refuses servers that aren't approved, so while editing is
// unlocked the page looks up certs itself (token from Cloudflare, given only with the lists
// password) and saves what it finds for everyone. ~100 calls a day; each cert costs one call for
// its details and one for its slab photo, once.

const PSA_API = "https://api.psacard.com/publicapi/cert/";
let psaTokenCache = "";
async function psaToken(): Promise<string> {
  if (psaTokenCache) return psaTokenCache;
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "psaToken", password: password() }) });
  const j = await res.json().catch(() => null);
  if (res.status === 404) throw new Error("no-token");
  if (!res.ok || !j || !j.token) throw new Error((j && j.error) || `HTTP ${res.status}`);
  psaTokenCache = j.token;
  return psaTokenCache;
}

const gradeOf = (s: Any) => { const m = /(\d+(?:\.5)?)\s*$/.exec(String(s || "")); return m ? Number(m[1]) : null; };
const clip = (t: string) => t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
type Problem = { status: number; text: string };

/**
 * Look up the certs that still need PSA details or a photo, and save the results with the list's
 * saved data. Resolves to the updated saved data (null when there was nothing to do).
 */
export async function fillPsa(id: string, certs: string[], have: Record<string, CertInfo>, max = 40): Promise<Snap | null> {
  const need = certs.filter((c) => { const i = have[c]; return !i || (!i.notFound && !i.imgTried); });
  if (!need.length || !isUnlocked()) return null;
  let token = "";
  const got: Record<string, CertInfo> = {};
  let problem: Problem | null = null, photosRefused: Problem | null = null, retryAt = 0;
  try { token = await psaToken(); } catch (e: Any) {
    problem = e && e.message === "no-token" ? { status: 0, text: "no-token" } : { status: 0, text: String((e && e.message) || e) };
  }
  let calls = 0;
  const get = async (path: string) => {
    calls++;
    const res = await fetch(PSA_API + path, { headers: { authorization: `bearer ${token}`, accept: "application/json" } });
    if (res.status === 429 || res.status === 401 || res.status === 403) return { refused: { status: res.status, text: clip(await res.text().catch(() => "")) } };
    return { status: res.status, ok: res.ok, json: res.ok ? await res.json().catch(() => null) : null } as Any;
  };
  for (const c of need) {
    if (!token || problem || calls >= max) break;
    try {
      let info: Any = have[c] ? { ...have[c] } : null;
      if (!info) {
        const r = await get(`GetByCertNumber/${c}`);
        if (r.refused) { problem = r.refused; break; }
        const pc = r.json && r.json.PSACert;
        if (r.status === 404 || (!pc && r.json && /not found|invalid/i.test(String(r.json.ServerMessage || "")))) { got[c] = { notFound: true } as CertInfo; continue; }
        if (!pc) continue;
        info = {
          year: /^\d{4}$/.test(String(pc.Year || "").trim()) ? Number(pc.Year) : null, set: String(pc.Brand || "").trim(), number: String(pc.CardNumber || "").trim(),
          subject: String(pc.Subject || "").trim(), variety: String(pc.Variety || "").trim(), grade: gradeOf(pc.CardGrade || pc.GradeDescription), gradeText: String(pc.CardGrade || "").trim(),
        };
      }
      if (!photosRefused && calls < max) {
        const r = await get(`GetImagesByCertNumber/${c}`);
        if (r.refused) { if (r.refused.status === 429) { problem = r.refused; got[c] = info; break; } photosRefused = r.refused; }
        else if (r.ok || r.status === 404) {
          const imgs = Array.isArray(r.json) ? r.json : r.json && typeof r.json === "object" ? ((Object.values(r.json).find(Array.isArray) as Any[]) || []) : [];
          const front = imgs.find((x: Any) => x && x.IsFrontImage && x.ImageURL) || imgs.find((x: Any) => x && x.ImageURL);
          info = { ...info, image: front ? String(front.ImageURL) : "", imgTried: true };
        }
      }
      got[c] = info;
    } catch (e) { /* tried again next time */ }
  }
  // Wait before asking PSA again: its daily limit (429), or a refusal / missing token.
  if (problem) retryAt = Date.now() + (problem.status === 429 ? 3 : 24) * 3600e3;
  const res = await fetch("/api/snapshot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, mode: "psaSave", password: password(), psa: got, problem, photosRefused, retryAt }) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.snap) throw new Error((j && j.error) || `HTTP ${res.status}`);
  return j.snap;
}
