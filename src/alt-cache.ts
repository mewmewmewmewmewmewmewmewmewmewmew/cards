/**
 * Saved ALT results for /stats (IndexedDB: the data is too big for localStorage).
 * One record per cert + grade ("12345678|10"), plus the time of the last full refresh.
 * Everything here fails soft: without IndexedDB the page just fetches as before.
 */
type Any = any;

const DB = "mew-stats", STORE = "alt", META = "meta";
export const ALT_MAX_AGE = 12 * 60 * 60 * 1000; // refresh everything after 12h

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((ok, bad) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "k" });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: "k" });
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => bad(req.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
const done = (t: IDBTransaction) => new Promise<void>((ok, bad) => { t.oncomplete = () => ok(); t.onerror = () => bad(t.error); t.onabort = () => bad(t.error); });

export const keyOf = (cert: string, grade: number) => `${cert}|${grade}`;

/** Every saved result, and when the last full refresh finished (null = never). */
export async function readAll(): Promise<{ at: number | null; map: Map<string, Any> }> {
  const map = new Map<string, Any>();
  try {
    const d = await db();
    const t = d.transaction([STORE, META], "readonly");
    const rows: Any[] = await new Promise((ok, bad) => { const r = t.objectStore(STORE).getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => bad(r.error); });
    const meta: Any = await new Promise((ok) => { const r = t.objectStore(META).get("refreshed"); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
    rows.forEach((row) => map.set(row.k, row.r));
    return { at: meta && typeof meta.at === "number" ? meta.at : null, map };
  } catch (e) {
    return { at: null, map };
  }
}

/** A result worth keeping: anything but a failed lookup (those are retried next time). */
export const keepable = (r: Any) => !!r && (!r.error || (Array.isArray(r.history) && r.history.length > 0));

/** Save results (cert → result) for one grade; optionally mark a full refresh as finished. */
export async function save(results: Map<string, Any>, grade: number | ((cert: string) => number), refreshedAt?: number) {
  try {
    const d = await db();
    const t = d.transaction([STORE, META], "readwrite");
    const s = t.objectStore(STORE);
    results.forEach((r, cert) => { if (keepable(r)) s.put({ k: keyOf(cert, typeof grade === "function" ? grade(cert) : grade), r }); });
    if (refreshedAt) t.objectStore(META).put({ k: "refreshed", at: refreshedAt });
    await done(t);
  } catch (e) { /* storage full or unavailable: the page still works, it just fetches again */ }
}

/* ---------- the sheet (card list + hidden lists), saved like the ALT data ---------- */

export type SavedSheet = { at: number; cards: Any[]; hidden: { all: string[]; personal: string[] } | null; diag: Any };

export async function readSheet(): Promise<SavedSheet | null> {
  try {
    const d = await db();
    const t = d.transaction(META, "readonly");
    const v: Any = await new Promise((ok) => { const r = t.objectStore(META).get("sheet"); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
    return v && Array.isArray(v.cards) && v.cards.length ? (v as SavedSheet) : null;
  } catch (e) { return null; }
}

export async function saveSheet(v: Omit<SavedSheet, "at"> | null) {
  try {
    const d = await db();
    const t = d.transaction(META, "readwrite");
    if (v) t.objectStore(META).put({ k: "sheet", at: Date.now(), ...v });
    else t.objectStore(META).delete("sheet");
    await done(t);
  } catch (e) {}
}
