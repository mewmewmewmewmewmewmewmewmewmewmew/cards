/**
 * Shared by /api/lists and /api/snapshot: per-list view passwords. A list may carry viewHash (a
 * SHA-256 of its view password, never the password itself); then only that password or the main
 * LISTS_PASSWORD may see its certs and data. (Not a route: files starting with _ aren't served.)
 */
export const KEY = "custom-lists";
export const read = async (env) => (await env.MEW_KV.get(KEY, "json")) || [];

export async function hashPw(pw) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mew-list:${pw}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isMain = (env, pw) => !!env.LISTS_PASSWORD && pw === env.LISTS_PASSWORD;

/** May someone with `pw` see this list? Open lists: anyone. */
export async function canView(env, list, pw) {
  if (!list.viewHash) return true;
  if (!pw) return false;
  return isMain(env, pw) || (await hashPw(pw)) === list.viewHash;
}

/** A list as sent to a browser that may see it: no hash, just locked: true. */
export const shown = (l) => { const { viewHash, ...rest } = l; return viewHash ? { ...rest, locked: true } : rest; };
/** A locked list for everyone else: its name and size only. */
export const hidden = (l) => ({ id: l.id, name: l.name, at: l.at, locked: true, hidden: true, count: l.items.length, items: [] });
