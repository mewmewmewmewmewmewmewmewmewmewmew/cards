/**
 * Exchange rates to USD for what you paid (Personal). Daily ECB reference rates from Frankfurter
 * (free, no key), for the currencies and date range your purchases need; saved in localStorage
 * for a day. rateOn() takes the latest published rate on or before a date (no rates on weekends).
 */
type Any = any;
export type Fx = { rates: Record<string, Record<string, number>>; dates: string[] } | null;

const KEY = "mew_fx_v1";
const DAY = 864e5;
const today = () => new Date().toISOString().slice(0, 10);

/** Rates (per 1 USD) for `currencies`, from `from` to today. */
export async function loadFx(currencies: string[], from: string): Promise<Fx> {
  const want = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== "USD"))].sort();
  if (!want.length) return { rates: {}, dates: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && Date.now() - saved.at < DAY && saved.from <= from && want.every((c) => saved.symbols.includes(c))) return saved.fx;
  } catch (e) {}
  const start = from < "1999-01-04" ? "1999-01-04" : from; // ECB series start
  const urls = [
    `https://api.frankfurter.dev/v1/${start}..${today()}?base=USD&symbols=${want.join(",")}`,
    `https://api.frankfurter.app/${start}..${today()}?from=USD&to=${want.join(",")}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const j: Any = await res.json();
      if (!j || !j.rates) continue;
      const fx = { rates: j.rates as Record<string, Record<string, number>>, dates: Object.keys(j.rates).sort() };
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), from, symbols: want, fx })); } catch (e) {}
      return fx;
    } catch (e) {}
  }
  return null;
}

/** Units of `currency` per 1 USD on (or just before) `date`; null when there's no rate. */
export function rateOn(fx: Fx, currency: string, date: string | null): number | null {
  if (currency === "USD") return 1;
  if (!fx || !fx.dates.length) return null;
  const d = date || today();
  let lo = 0, hi = fx.dates.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (fx.dates[mid] <= d) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  const at = best >= 0 ? fx.dates[best] : fx.dates[0]; // before the series: its first rate
  const r = fx.rates[at] && fx.rates[at][currency];
  return typeof r === "number" && r > 0 ? r : null;
}

/** What you paid, in USD (null = no price, or no rate for its currency). */
export function paidUSD(fx: Fx, paid: Any): number | null {
  if (!paid || !(paid.amount > 0)) return null;
  const r = rateOn(fx, paid.currency, paid.date);
  return r ? paid.amount / r : null;
}
