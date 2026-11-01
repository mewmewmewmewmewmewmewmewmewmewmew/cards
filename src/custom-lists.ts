/**
 * Custom lists for /stats/custom: named lists of PSA certs (each at a grade), saved in this
 * browser's localStorage. A list can be shared as a link that carries the whole list in the URL
 * (#share=…), so it opens anywhere without an account.
 */
type Any = any;

export type Item = { cert: string; grade: number; name?: string };
export type List = { id: string; name: string; items: Item[]; at: number };

const KEY = "mew_custom_lists_v1";

export function readLists(): List[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((l: Any) => l && typeof l.id === "string" && Array.isArray(l.items)) : [];
  } catch (e) { return []; }
}
function writeLists(lists: List[]) { try { localStorage.setItem(KEY, JSON.stringify(lists)); } catch (e) {} }

export const getList = (id: string) => readLists().find((l) => l.id === id) || null;

/** Add or replace a list (newest first). */
export function saveList(list: List) {
  const rest = readLists().filter((l) => l.id !== list.id);
  writeLists([{ ...list, at: Date.now() }, ...rest]);
}
export function deleteList(id: string) { writeLists(readLists().filter((l) => l.id !== id)); }

/** Remember card names the ALT data gave us, so the hub can show them without fetching. */
export function rememberNames(id: string, names: Map<string, string>) {
  const lists = readLists();
  const l = lists.find((x) => x.id === id);
  if (!l) return;
  let changed = false;
  l.items.forEach((it) => { const n = names.get(it.cert); if (n && n !== it.name) { it.name = n; changed = true; } });
  if (changed) writeLists(lists);
}

export const newId = () => Math.random().toString(36).slice(2, 10);

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

/* ---------- share links ---------- */

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function shareUrl(list: List) {
  const data = { n: list.name, i: list.items.map((it) => (it.grade === 10 ? it.cert : [it.cert, it.grade])) };
  return `${location.origin}/stats/custom/#share=${b64(JSON.stringify(data))}`;
}
export function readShare(hash: string): { name: string; items: Item[] } | null {
  const m = /^#share=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!m) return null;
  try {
    const v = JSON.parse(unb64(m[1]));
    const items: Item[] = (Array.isArray(v.i) ? v.i : []).map((x: Any) => (Array.isArray(x) ? { cert: String(x[0]), grade: Number(x[1]) || 10 } : { cert: String(x), grade: 10 }))
      .filter((it: Item) => /^\d{7,12}$/.test(it.cert));
    return items.length ? { name: String(v.n || "Shared list").slice(0, 80), items } : null;
  } catch (e) { return null; }
}
