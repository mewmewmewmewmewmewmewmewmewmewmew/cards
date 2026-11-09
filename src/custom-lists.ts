/**
 * Custom lists for /stats/custom: named lists of PSA certs (each at a grade), each opened at
 * /stats/custom/#<id> (an id you can edit). Kept on Cloudflare (/api/lists, functions/api, in the
 * MEW_KV namespace) so every device sees the same lists; a copy in localStorage opens the page at
 * once. Reading is open, changes need the LISTS_PASSWORD secret. A list can have its own view
 * password: then the server sends its certs and data only with that password or the main one.
 */
type Any = any;

/** label: your own text for the card (e.g. its set number), typed after the cert. */
export type Item = { cert: string; grade: number; name?: string; label?: string };
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
 * Certs from pasted text: any run of 7+ digits is a cert; a grade may follow it on the same line
 * ("12345678 9", "12345678 PSA 9", "12345678, 9.5"). Without one it's PSA 10. Repeats are dropped.
 */
export function parseCerts(text: string): Item[] {
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const line of String(text || "").split(/\n/)) {
    // One cert on the line: an optional grade, then anything else is the card's label
    // ("12345678 9 205/165"). A grade only counts as a number on its own, so "5/34" is a label.
    if ((line.match(/\d{7,12}/g) || []).length === 1) {
      const m = /^\s*#?(\d{7,12})(?:[\s,;]+(?:psa\s*)?(\d{1,2}(?:\.5)?)(?=[\s,;]|$))?(?:[\s,;]+(.*))?$/i.exec(line);
      if (m) {
        const g = m[2] ? parseFloat(m[2]) : 10;
        const label = (m[3] || "").trim().slice(0, 40);
        if (!seen.has(m[1])) { seen.add(m[1]); out.push({ cert: m[1], grade: g >= 1 && g <= 10 ? g : 10, ...(label ? { label } : {}) }); }
        continue;
      }
    }
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

/** The list as editable text, one cert per line (grade shown when it isn't 10, then the label). */
export const certsText = (items: Item[]) => items.map((it) => [it.cert, it.grade === 10 ? "" : String(it.grade), it.label || ""].filter(Boolean).join(" ")).join("\n");

/* ---------- saved ALT data + PSA details per list (/api/snapshot) ---------- */

export type CertInfo = { year: number | null; set: string; number: string; subject: string; variety: string; grade: number | null; gradeText?: string; image?: string; imgTried?: boolean; notFound?: boolean };
/** results are keyed "<cert>|<grade>"; at = when the data was last fetched. */
export type Snap = { at: number; tried?: number; results: Record<string, Any>; psa: Record<string, CertInfo>; psaToken?: boolean; psaLimited?: boolean; psaProblem?: { status: number; text: string } | null; psaRetryAt?: number; errors?: string[] };

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
