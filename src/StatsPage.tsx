import React, { useEffect, useMemo, useRef, useState } from "react";
import * as D from "./mew-data";
import { MewIcon, CameoIcon, IntlIcon } from "./icons";

/* ------------------------------------------------------------------ *
 * /stats — PSA 10 prices for every card in the sheet.
 * Data: the sheet (same password gate as the catalog) gives each card's
 * cert numbers ("all cert" column); the ALT Worker turns a cert into the
 * card's PSA 10 sales (sales=1) and ALT's ~13-month daily valuation.
 * A toggle switches the whole page between actual sales and ALT value.
 * Styling uses the Mew Catalog design tokens (src/ds/*.css).
 * ------------------------------------------------------------------ */

type Any = any;
type Pt = { date: string; value: number; house?: string };
type Mode = "sales" | "alt";

const RANGES: Array<[string, number]> = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["All", 0]];
const SORTS = ["value", "change", "name", "release"] as const;
type SortKey = typeof SORTS[number];
const MODE_KEY = "mew_stats_mode";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (v: number) => (v < 100 ? usd2 : usd0).format(v);
const fmtPct = (p: number | null) => (p === null || !isFinite(p) ? "—" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`);
const pctOf = (pts: Pt[]) => (pts.length > 1 && pts[0].value > 0 ? ((pts[pts.length - 1].value - pts[0].value) / pts[0].value) * 100 : null);
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const tsOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const todayISO = () => new Date().toISOString().slice(0, 10);

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
/** Last value on or before `date` (series ascending), or null. */
function valueAt(series: Pt[], date: string) {
  let v: number | null = null;
  for (const p of series) { if (p.date <= date) v = p.value; else break; }
  return v;
}
/** Ascending points for one API result in the chosen mode. */
function seriesOf(r: Any, mode: Mode): Pt[] {
  const raw = mode === "sales"
    ? ((r && r.sales) || []).map((s: Any) => ({ date: String(s.date || "").slice(0, 10), value: Number(s.price), house: s.auctionHouse || undefined }))
    : ((r && r.history) || []).map((p: Any) => ({ date: String(p.date || "").slice(0, 10), value: Number(p.value) }));
  return raw.filter((p: Pt) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && isFinite(p.value) && p.value > 0)
    .sort((a: Pt, b: Pt) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ---------- charts (x is spaced by date, so irregular sales read correctly) ---------- */

function bounds(pts: Pt[]) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { if (p.value < lo) lo = p.value; if (p.value > hi) hi = p.value; }
  const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
}
function geometry(pts: Pt[], domain: [string, string], W: number, H: number, step: boolean) {
  const t0 = tsOf(domain[0]), t1 = tsOf(domain[1]), span = t1 - t0;
  const { lo, hi } = bounds(pts);
  const xOf = (d: string) => (span > 0 ? Math.min(1, Math.max(0, (tsOf(d) - t0) / span)) : 0.5) * W;
  const yOf = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const xy = pts.map((p) => [xOf(p.date), yOf(p.value)]);
  let line = "";
  xy.forEach(([x, y], i) => {
    if (!i) line += `M${x.toFixed(2)},${y.toFixed(2)}`;
    else if (step) line += `H${x.toFixed(2)}V${y.toFixed(2)}`;
    else line += `L${x.toFixed(2)},${y.toFixed(2)}`;
  });
  if (step && xy.length) line += `H${W}`;
  const x0 = xy.length ? xy[0][0] : 0, xN = step ? W : xy.length ? xy[xy.length - 1][0] : 0;
  const area = xy.length > 1 ? `${line}L${xN.toFixed(2)},${H}L${x0.toFixed(2)},${H}Z` : "";
  const dots = xy.map(([x, y]) => `M${x.toFixed(2)},${y.toFixed(2)}h0`).join("");
  return { lo, hi, xOf, yOf, line, area, dots, t0, span };
}

const Sparkline: React.FC<{ pts: Pt[]; domain: [string, string]; dots?: boolean; height?: number }> = ({ pts, domain, dots, height = 40 }) => {
  if (!pts.length || (!dots && pts.length < 2)) return <div style={{ height }} />;
  const W = 100, H = 40, g = geometry(pts, domain, W, H, false);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" overflow="visible" style={{ display: "block", width: "100%", height }} aria-hidden="true">
      {g.area && <path d={g.area} fill="var(--pink-700)" fillOpacity="0.08" />}
      {pts.length > 1 && <path d={g.line} fill="none" stroke="var(--pink-700)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      {dots && <path d={g.dots} fill="none" stroke="var(--pink-700)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
};

const LineChart: React.FC<{ pts: Pt[]; domain: [string, string]; height: number; step?: boolean; dots?: boolean; empty: string }> = ({ pts, domain, height, step = false, dots = false, empty }) => {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!pts.length || (!dots && pts.length < 2)) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--line-strong)", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{empty}</div>;
  }
  const W = 1000, H = 300, g = geometry(pts, domain, W, H, step);
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const target = g.t0 + t * g.span;
    let best = 0, bestD = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(tsOf(p.date) - target); if (d < bestD) { bestD = d; best = i; } });
    setHover(best);
  };
  const hp = hover === null ? null : pts[hover];
  const hx = hp ? (g.xOf(hp.date) / W) * 100 : 0;
  const hy = hp ? (g.yOf(hp.value) / H) * 100 : 0;
  const label: React.CSSProperties = { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" };
  return (
    <div>
      <div ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove}
        style={{ position: "relative", height, touchAction: "pan-y", cursor: "crosshair" }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" overflow="visible" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
          {g.area && <path d={g.area} fill="var(--pink-700)" fillOpacity="0.07" />}
          {pts.length > 1 && <path d={g.line} fill="none" stroke="var(--pink-700)" strokeWidth={dots ? 1.5 : 2} strokeOpacity={dots ? 0.6 : 1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          {dots && <path d={g.dots} fill="none" stroke="var(--pink-700)" strokeWidth="7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        <span style={{ ...label, position: "absolute", left: 0, top: 0 }}>{fmtUSD(g.hi)}</span>
        <span style={{ ...label, position: "absolute", left: 0, bottom: 0 }}>{fmtUSD(g.lo)}</span>
        {hp && (
          <>
            <span style={{ position: "absolute", top: 0, bottom: 0, left: `${hx}%`, width: 1, background: "var(--line-strong)", pointerEvents: "none" }} />
            <span style={{ position: "absolute", left: `${hx}%`, top: `${hy}%`, width: 9, height: 9, margin: "-5px 0 0 -5px", borderRadius: "50%", background: "var(--pink-700)", border: "2px solid var(--surface-card)", pointerEvents: "none" }} />
            <span style={{ position: "absolute", top: -6, left: `${hx}%`, transform: `translate(${hx > 70 ? "-100%" : hx < 30 ? "0" : "-50%"}, -100%)`, padding: "4px 8px", whiteSpace: "nowrap", background: "var(--surface-card)", border: "1px solid var(--line-strong)", borderRadius: "var(--web-radius-sm)", boxShadow: "var(--shadow-raised)", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-title)", pointerEvents: "none" }}>
              {fmtUSD(hp.value)} <span style={{ color: "var(--text-faint)" }}>· {fmtDate(hp.date)}{hp.house ? ` · ${hp.house}` : ""}</span>
            </span>
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={label}>{fmtDate(domain[0])}</span>
        <span style={label}>{fmtDate(domain[1])}</span>
      </div>
    </div>
  );
};

/* ---------- small UI pieces ---------- */

const pill = (on: boolean): React.CSSProperties => ({
  cursor: "pointer", padding: "3px 9px", borderRadius: "var(--web-radius-sm)",
  fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.08em", whiteSpace: "nowrap",
  background: on ? "var(--pink-700)" : "transparent", color: on ? "var(--text-title)" : "var(--text-body)",
  border: `1px solid ${on ? "var(--pink-700)" : "var(--line-hairline)"}`, fontWeight: on ? 700 : 500,
  transition: "background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)",
});
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", height: 28, minWidth: 28, padding: 0, cursor: "pointer", background: "transparent", border: "none", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em" };
const eyebrow: React.CSSProperties = { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)", textTransform: "uppercase" };
const faint: React.CSSProperties = { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" };

const Change: React.FC<{ pct: number | null; size?: string }> = ({ pct, size = "var(--web-small)" }) => (
  <span style={{ fontFamily: "var(--font-data)", fontSize: size, fontWeight: 600, color: pct !== null && pct > 0 ? "var(--text-accent)" : "var(--text-muted)" }}>
    {pct !== null && pct > 0 ? "▲ " : pct !== null && pct < 0 ? "▼ " : ""}{fmtPct(pct)}
  </span>
);

/* ---------- page ---------- */

export default function StatsPage() {
  const [theme, setTheme] = useState<string>(() => (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [lang, setLang] = useState<"EN" | "JP">(() => (/^ja\b/i.test(navigator.language || "") ? "JP" : "EN"));
  const [mode, setModeState] = useState<Mode>(() => { try { return localStorage.getItem(MODE_KEY) === "alt" ? "alt" : "sales"; } catch (e) { return "sales"; } });
  const [narrow, setNarrow] = useState(() => window.innerWidth < 700);
  const [phase, setPhase] = useState<"checking" | "password" | "loading" | "ready" | "error">("checking");
  const [pw, setPw] = useState("");
  const [cards, setCards] = useState<Any[]>([]);
  const [hist, setHist] = useState<Map<string, Any>>(new Map());
  const [histDone, setHistDone] = useState(false);
  const [diag, setDiag] = useState<Any>(null);
  const [sheets, setSheets] = useState<Any>({});
  const [range, setRange] = useState(365);
  const [sort, setSort] = useState<SortKey>("value");
  const [selected, setSelected] = useState<string | null>(null);
  const [allSales, setAllSales] = useState(false);
  // Same scopes and defaults as the catalog: Japanese Mew on, Cameo and Intl (Unique tab) off.
  const [scope, setScope] = useState({ mew: true, cameo: false, intl: false });
  const toggleScope = (k: "mew" | "cameo" | "intl") => {
    D.trackEvent("filter_toggle", { filter: k, active: !scope[k], page: "stats" });
    setScope({ ...scope, [k]: !scope[k] });
  };

  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
    D.trackEvent("stats_mode", { mode: m });
  };

  useEffect(() => { document.title = "mew cards · stats"; D.trackEvent("stats_page_view"); }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => { setAllSales(false); }, [selected, mode]);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 700);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const load = async (password: string) => {
    setPhase("loading");
    try {
      const all = await D.fetchAllSheets(password);
      setCards(all);
      setSheets({ ...D.sheetDiag });
      setPhase("ready");
      const certs = all.map((c: Any) => D.certOf(c)).filter(Boolean) as string[];
      setDiag({ requests: 0, ok: 0, errors: [] });
      await D.fetchAltHistories(certs, (m, d) => { setHist(m); setDiag({ ...d, errors: [...d.errors] }); });
      setHistDone(true);
    } catch (e: Any) {
      if (e && e.message === "auth") { setPw(""); setPhase("password"); }
      else { console.error(e); setPhase("error"); }
    }
  };

  useEffect(() => {
    let cached: Any = null;
    try { cached = localStorage.getItem(D.CONFIG_CACHE_KEY); } catch (e) {}
    if (cached === "private") setPhase("password");
    D.fetchConfig().then((cfg) => {
      const need = !!(cfg && cfg.passwordEnabled);
      try { localStorage.setItem(D.CONFIG_CACHE_KEY, need ? "private" : "public"); } catch (e) {}
      if (need) setPhase((p) => (p === "checking" ? "password" : p));
      else load("");
    }).catch(() => { if (cached !== "private") load(""); else setPhase("password"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = (c: Any) => (lang === "JP" ? (c.nameJP || c.nameEN) : (c.nameEN || c.nameJP));
  const today = todayISO();

  // One row per cert (the sheet can list the same card in more than one tab).
  const rows = useMemo(() => {
    // A cert listed in more than one tab keeps every tab's scope flag.
    const byCert = new Map<string, Any>();
    const noCert: Any[] = [];
    const inScope = (c: Any) => (scope.mew && c.isMew) || (scope.cameo && c.isCameo) || (scope.intl && c.isIntl);
    for (const c of cards) {
      const cert = D.certOf(c);
      if (!cert) { if (inScope(c)) noCert.push(c); continue; }
      const prev = byCert.get(cert);
      if (!prev) byCert.set(cert, { ...c });
      else { if (c.isMew) prev.isMew = true; if (c.isCameo) prev.isCameo = true; if (c.isIntl) prev.isIntl = true; }
    }
    const charted: Any[] = [], failed: Any[] = [], pending: Any[] = [];
    byCert.forEach((card, cert) => {
      if (!inScope(card)) return;
      const r = hist.get(cert);
      if (!r) { pending.push({ card, cert }); return; }
      const series = seriesOf(r, mode);
      if (!series.length) {
        failed.push({ card, cert, error: mode === "sales" ? (r.salesError || r.error || "no PSA 10 sales on ALT") : (r.error || "no value history") });
        return;
      }
      const last = series[series.length - 1];
      const value = last.value;
      const start = range ? shiftDate(today, range) : series[0].date;
      const pts = series.filter((p) => p.date >= start);
      const anchor = valueAt(series, start);
      const base = anchor !== null ? anchor : pts.length > 1 ? pts[0].value : null;
      const change = base && base > 0 ? ((value - base) / base) * 100 : null;
      charted.push({ card, cert, r, series, pts, last, value, change, domain: [start, today] as [string, string] });
    });
    const cmp: Record<SortKey, (a: Any, b: Any) => number> = {
      value: (a, b) => b.value - a.value,
      change: (a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity),
      name: (a, b) => name(a.card).localeCompare(name(b.card), "ja"),
      release: (a, b) => D.releaseTs(a.card) - D.releaseTs(b.card),
    };
    charted.sort(cmp[sort]);
    return { charted, failed, pending, noCert };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, hist, range, sort, lang, mode, today, scope]);

  // Collection total: each card's value as of each day (its last sale, or ALT value), summed
  // over every charted card. Before a card's first data point it counts at that first value,
  // so cards don't appear as jumps and the line always ends at the headline total.
  const total = useMemo(() => {
    const series = rows.charted.map((x: Any) => x.series as Pt[]);
    const value = rows.charted.reduce((s: number, x: Any) => s + (x.value || 0), 0);
    if (!series.length) return { pts: [] as Pt[], backfilled: 0, value, start: today };
    const start = range ? shiftDate(today, range) : series.reduce((m: string, h: Pt[]) => (h[0].date < m ? h[0].date : m), today);
    const dates = new Set<string>([start, today]);
    series.forEach((h: Pt[]) => h.forEach((p) => { if (p.date > start && p.date <= today) dates.add(p.date); }));
    const sorted = [...dates].sort();
    const idx = series.map(() => 0), lastV = series.map((h: Pt[]) => h[0].value);
    const pts = sorted.map((date) => {
      let sum = 0;
      series.forEach((h: Pt[], k: number) => {
        while (idx[k] < h.length && h[idx[k]].date <= date) { lastV[k] = h[idx[k]].value; idx[k]++; }
        sum += lastV[k];
      });
      return { date, value: sum };
    });
    return { pts, backfilled: series.filter((h: Pt[]) => h[0].date > start).length, value, start };
  }, [rows, range, today]);

  const sel = selected ? rows.charted.find((x: Any) => x.cert === selected) : null;
  // Loading progress and the Data check count every cert, whatever the scope toggles show.
  const allCerts = useMemo(() => new Set(cards.map((c: Any) => D.certOf(c)).filter(Boolean)), [cards]);
  const totalCerts = allCerts.size;
  const loadedCerts = [...allCerts].filter((c) => hist.has(c as string)).length;
  const noScope = !scope.mew && !scope.cameo && !scope.intl;
  const sales = mode === "sales";

  /* ---------- gate ---------- */
  if (phase !== "ready" && phase !== "error") {
    return (
      <div data-theme={theme} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", background: theme === "dark" ? "#101010" : "var(--surface-page)" }}>
        <div style={{ position: "relative", width: 112, height: 112, flex: "0 0 auto" }}>
          <div className="loading-swirl" aria-hidden="true" style={{ position: "absolute", inset: 0 }} />
          <img src="/assets/mew-logo.png" alt="Loading..." style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25 }} />
        </div>
        {phase === "password" && (
          <form onSubmit={(e) => { e.preventDefault(); if (pw) load(pw); }} style={{ position: "absolute", top: "50%", left: 0, right: 0, marginTop: 72, display: "flex", justifyContent: "center", animation: "mewFadeUp 400ms var(--ease) both" }}>
            <input type="password" className="mew-gate-input" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Password" autoFocus
              style={{ height: 30, width: 96, padding: "0 10px", boxSizing: "border-box", borderRadius: 6, textAlign: "center", fontFamily: "var(--font-body)", fontSize: 13, letterSpacing: "0.25em", textIndent: "0.25em", outline: "none" }} />
          </form>
        )}
        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 600, color: "rgba(203, 151, 165, 0.8)" }}>v{D.APP_VERSION}</div>
      </div>
    );
  }

  const pad = narrow ? 16 : 32;
  const headTitle = sel ? name(sel.card) : "Collection at PSA 10";
  const headValue = sel ? sel.value : total.value;
  const headChange = sel ? sel.change : pctOf(total.pts);
  const chartEmpty = sales ? "NO SALES IN THIS RANGE" : "NOT ENOUGH DATA";
  const salesList: Pt[] = sel && sales ? [...sel.series].reverse() : [];

  return (
    <div data-theme={theme} style={{ minHeight: "100vh", background: "var(--surface-page)", color: "var(--text-body)", fontFamily: "var(--font-body)" }}>
      {!histDone && totalCerts > 0 && (
        <span style={{ position: "fixed", top: 0, left: 0, height: 2, zIndex: 50, background: "var(--pink-700)", width: `${Math.round((loadedCerts / totalCerts) * 100)}%`, transition: "width 200ms linear" }} />
      )}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: `${narrow ? 20 : 28}px ${pad}px 64px`, boxSizing: "border-box" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <a href="/" style={{ ...eyebrow, color: "var(--text-muted)", textDecoration: "none" }}>← Catalog</a>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            <button type="button" onClick={() => setLang(lang === "JP" ? "EN" : "JP")} data-hover-pink="1" style={iconBtn} aria-label="Toggle language">{lang === "JP" ? "JA" : "EN"}</button>
            <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} data-hover-pink="1" style={iconBtn} aria-label="Toggle theme">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z" /></svg>
            </button>
          </div>
        </div>
        <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: narrow ? "var(--web-h2)" : "var(--web-h1)", lineHeight: "var(--web-leading-tight)", color: "var(--text-title)" }}>PSA 10 value</h1>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div role="group" aria-label="Price source" style={{ display: "flex", gap: 4 }}>
            <button type="button" aria-pressed={sales} onClick={() => setMode("sales")} style={pill(sales)}>Sales</button>
            <button type="button" aria-pressed={!sales} onClick={() => setMode("alt")} style={pill(!sales)}>ALT value</button>
          </div>
          <div role="group" aria-label="Scope" style={{ display: "flex", alignItems: "center", gap: 2, paddingLeft: 8, borderLeft: "1px solid var(--line-hairline)" }}>
            {([["mew", "Mew", <MewIcon key="m" w={22} h={20} />], ["cameo", "Cameo", <CameoIcon key="c" w={18} h={18} />], ["intl", "Intl", <IntlIcon key="i" w={17} h={17} />]] as Array<["mew" | "cameo" | "intl", string, React.ReactNode]>).map(([k, label, icon]) => (
              <button key={k} type="button" onClick={() => toggleScope(k)} aria-pressed={scope[k]} aria-label={label} title={label}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, padding: 0, cursor: "pointer", background: "transparent", border: "none", color: scope[k] ? "var(--pink-700)" : "var(--text-muted)", transition: "color var(--dur-fast) var(--ease)" }}>
                {icon}
              </button>
            ))}
          </div>
          <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-muted)" }}>
            {sales ? "recorded PSA 10 sales" : "ALT's daily valuation"} · USD{histDone ? "" : ` · loading ${loadedCerts}/${totalCerts}`}
          </span>
        </div>

        {phase === "error" && (
          <div style={{ marginTop: 24, padding: "40px 24px", textAlign: "center", border: "1px dashed var(--line-strong)", ...eyebrow }}>Couldn't load the catalog. Refresh to try again.</div>
        )}

        {/* main chart */}
        {phase === "ready" && (
          <section style={{ marginTop: narrow ? 20 : 28, padding: narrow ? 16 : 24, background: "var(--surface-card)", border: "1px solid var(--line-hairline)", borderRadius: "var(--web-radius)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={eyebrow}>{sel ? `${sel.card.number || ""} ${sel.card.set || ""}`.trim() || "Card" : "Total"}</span>
                  {sel && <button type="button" onClick={() => setSelected(null)} style={{ ...eyebrow, cursor: "pointer", background: "none", border: "none", padding: 0, color: "var(--pink-700)" }}>× Back to total</button>}
                </div>
                <div style={{ marginTop: 4, fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "var(--web-h3)", color: "var(--text-title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headTitle}</div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "var(--web-h1)", lineHeight: 1, color: "var(--text-title)" }}>{fmtUSD(headValue || 0)}</span>
                  <Change pct={headChange} />
                </div>
                <div style={{ ...faint, marginTop: 6 }}>
                  {sel ? (
                    <>
                      {sales ? `last sale ${fmtDate(sel.last.date)}${sel.last.house ? ` · ${sel.last.house}` : ""} · ${sel.series.length} sale${sel.series.length === 1 ? "" : "s"} · ` : ""}
                      cert {sel.cert}{sel.r.grade && parseFloat(sel.r.grade) !== 10 ? ` · grade ${sel.r.grade}` : ""}
                      {sel.r.assetId && <> · <a href={`https://alt.xyz/itm/${sel.r.assetId}/research`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-accent)" }}>ALT ↗</a></>}
                    </>
                  ) : (
                    `${rows.charted.length} cards · ${sales ? "each counts at its latest sale" : "sum of ALT values"}${total.backfilled ? ` · ${total.backfilled} with no ${sales ? "sale" : "data"} before ${fmtDate(total.start)} count at their first ${sales ? "sale" : "value"} until then` : ""}`
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {RANGES.map(([label, d]) => (
                  <button key={label} type="button" onClick={() => setRange(d)} style={pill(range === d)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              {sel
                ? <LineChart pts={sel.pts} domain={sel.domain} height={narrow ? 180 : 260} dots={sales} empty={chartEmpty} />
                : <LineChart pts={total.pts} domain={[total.start, today]} height={narrow ? 180 : 260} step={sales} empty={chartEmpty} />}
            </div>
            {salesList.length > 0 && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--line-hairline)", paddingTop: 10 }}>
                {(allSales ? salesList : salesList.slice(0, 10)).map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: narrow ? "92px 1fr auto" : "120px 110px 1fr", gap: 12, padding: "5px 0", borderBottom: "1px solid var(--line-hairline)", fontFamily: "var(--font-data)", fontSize: "var(--web-small)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{fmtDate(s.date)}</span>
                    <span style={{ color: "var(--text-title)", fontWeight: 600, textAlign: narrow ? "right" : "left", order: narrow ? 3 : 0 }}>{fmtUSD(s.value)}</span>
                    <span style={{ color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.house || ""}</span>
                  </div>
                ))}
                {salesList.length > 10 && (
                  <button type="button" onClick={() => setAllSales(!allSales)} style={{ ...eyebrow, marginTop: 10, cursor: "pointer", background: "none", border: "none", padding: 0, color: "var(--pink-700)" }}>
                    {allSales ? "Show fewer" : `Show all ${salesList.length} sales`}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* card grid */}
        {phase === "ready" && (
          <>
            <div style={{ marginTop: narrow ? 24 : 36, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingBottom: 12, borderBottom: "1px solid var(--line-hairline)" }}>
              <span style={{ ...eyebrow, marginRight: 4 }}>Sort</span>
              {SORTS.map((k) => (
                <button key={k} type="button" onClick={() => setSort(k)} style={pill(sort === k)}>{k[0].toUpperCase() + k.slice(1)}</button>
              ))}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-muted)" }}>{rows.charted.length} cards</span>
            </div>
            <div style={{ marginTop: 16, display: "grid", gap: narrow ? 10 : 14, gridTemplateColumns: `repeat(auto-fill, minmax(${narrow ? 150 : 220}px, 1fr))` }}>
              {rows.charted.map((x: Any) => {
                const on = x.cert === selected;
                return (
                  <button key={x.cert} type="button" onClick={() => { setSelected(on ? null : x.cert); if (!on) window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, textAlign: "left", cursor: "pointer", minWidth: 0, background: on ? "var(--surface-tint)" : "var(--surface-card)", border: `1px solid ${on ? "var(--pink-700)" : "var(--line-hairline)"}`, borderRadius: "var(--web-radius)", transition: "border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)" }}>
                    <span style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                      <span style={{ flex: "0 0 auto", width: 34, aspectRatio: "63 / 88", borderRadius: "4.72% / 3.37%", background: "var(--surface-image)", backgroundImage: x.card.image ? `url("${x.card.image}")` : "none", backgroundSize: "100% 100%" }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: "var(--web-small)", color: "var(--text-title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(x.card)}</span>
                        <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--pink-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[x.card.number, x.card.year || ""].filter(Boolean).join(" · ")}</span>
                      </span>
                    </span>
                    <Sparkline pts={x.pts} domain={x.domain} dots={sales} />
                    <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", fontWeight: 600, color: "var(--text-title)" }}>{fmtUSD(x.value)}</span>
                      <Change pct={x.change} size="var(--web-label)" />
                    </span>
                    {sales && <span style={{ ...faint, marginTop: -4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>last sale {fmtDate(x.last.date)}</span>}
                  </button>
                );
              })}
              {histDone && rows.charted.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "40px 24px", textAlign: "center", border: "1px dashed var(--line-strong)" }}>
                  <div style={eyebrow}>{noScope ? "No scope selected" : "No cards to chart"}</div>
                  <div style={{ marginTop: 8, fontSize: "var(--web-small)", color: "var(--text-muted)" }}>
                    {noScope ? "Turn on Mew, Cameo or Intl above." : sales ? "None of these cards has a recorded PSA 10 sale. Try ALT value, or another scope." : "None of these cards has ALT value history."}
                  </div>
                </div>
              )}
              {rows.pending.map((x: Any) => (
                <div key={x.cert} style={{ padding: 10, minHeight: 116, border: "1px dashed var(--line-hairline)", borderRadius: "var(--web-radius)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: "var(--web-small)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(x.card)}</span>
                  <span style={eyebrow}>Loading…</span>
                </div>
              ))}
            </div>

            {histDone && (() => {
              // Opens by itself only when no cert has data in this mode at all (not because of the scope toggles).
              const empty = ![...hist.values()].some((r: Any) => seriesOf(r, mode).length > 0);
              const tabs = Object.keys(sheets);
              const anyCertCol = tabs.some((t) => sheets[t].certColumn);
              const errs = diag ? Object.entries((diag.errors as string[]).reduce((m: Any, e) => { m[e] = (m[e] || 0) + 1; return m; }, {})) : [];
              const netErr = diag && (diag.errors as string[]).some((e) => e.startsWith("network error"));
              const withSales = [...hist.values()].filter((r: Any) => r && Array.isArray(r.sales) && r.sales.length).length;
              const withHist = [...hist.values()].filter((r: Any) => r && Array.isArray(r.history) && r.history.length).length;
              const mismatch = [...hist.values()].filter((r: Any) => r && /filtered as/.test(String(r.salesError || ""))).length;
              const line: React.CSSProperties = { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", lineHeight: 1.6, color: "var(--text-body)", overflowWrap: "anywhere" };
              const hint: React.CSSProperties = { ...line, color: "var(--text-accent)" };
              return (
                <details key={String(empty)} open={empty} style={{ marginTop: 32, borderTop: "1px solid var(--line-hairline)", paddingTop: 14 }}>
                  <summary style={{ ...eyebrow, cursor: "pointer" }}>Data check</summary>
                  <div style={{ marginTop: 10, display: "grid", gap: 2 }}>
                    <div style={line}>Sheet · {cards.length} rows</div>
                    {tabs.map((t) => {
                      const s = sheets[t];
                      return (
                        <div key={t} style={line}>
                          {t}: {s.missing ? "tab not returned by the sheet script"
                            : !s.headers.length ? "tab is empty"
                            : s.certColumn ? `"All Cert" column found · ${s.withCert} of ${s.rows} rows have a cert`
                            : `no "All Cert" column · columns are ${s.headers.join(", ")}`}
                        </div>
                      );
                    })}
                    <div style={line}>Certs to look up · {totalCerts}</div>
                    {diag && <div style={line}>ALT API · {diag.requests} request{diag.requests === 1 ? "" : "s"}, {diag.ok} answered{errs.length ? "" : ", no errors"}</div>}
                    {errs.map(([e, n]) => <div key={e} style={line}>  {e}{(n as number) > 1 ? ` ×${n}` : ""}</div>)}
                    {diag && <div style={line}>With sales · {withSales} of {totalCerts} · with ALT value · {withHist} of {totalCerts}</div>}
                    {mismatch > 0 && <div style={line}>Wrong-grade sales filter from the API · {mismatch} (their sales are left out)</div>}
                    {!anyCertCol && tabs.length > 0 && <div style={hint}>The page looks for a column named "All Cert" (or "Cert", "Certs", "Cert Number") in the {tabs.join(", ")} tabs.</div>}
                    {netErr && <div style={hint}>The browser couldn't reach the API. If it works from elsewhere, the Worker may be refusing requests from this site (CORS or an origin allowlist).</div>}
                  </div>
                </details>
              );
            })()}

            {(rows.failed.length > 0 || rows.noCert.length > 0) && histDone && (
              <details key={`nc-${rows.charted.length === 0}`} open={rows.charted.length === 0} style={{ marginTop: 16, borderTop: "1px solid var(--line-hairline)", paddingTop: 14 }}>
                <summary style={{ ...eyebrow, cursor: "pointer" }}>Not charted · {rows.failed.length + rows.noCert.length}</summary>
                <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                  {rows.failed.map((x: Any) => (
                    <div key={x.cert} style={{ display: "flex", gap: 12, fontSize: "var(--web-small)" }}>
                      <span style={{ color: "var(--text-title)", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(x.card)}</span>
                      <span style={faint}>cert {x.cert} · {x.error}</span>
                    </div>
                  ))}
                  {rows.noCert.map((c: Any) => (
                    <div key={c.id} style={{ display: "flex", gap: 12, fontSize: "var(--web-small)" }}>
                      <span style={{ color: "var(--text-title)", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(c)}</span>
                      <span style={faint}>no cert in sheet</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <p style={{ marginTop: 32, maxWidth: "62ch", fontSize: "var(--web-small)", lineHeight: "var(--web-leading)", color: "var(--text-muted)" }}>
              {sales
                ? "Sales are PSA 10 sales recorded by ALT. A card's value is its most recent sale, and the total adds up each card's latest sale as of each day. Rarer cards can go months between sales, so their value can lag the market."
                : "ALT value is ALT's modelled valuation for each card at PSA 10, not individual sales. ALT keeps about 13 months of daily history, and the last few days often repeat while ALT carries its latest value forward."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
