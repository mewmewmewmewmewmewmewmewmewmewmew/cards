import React, { useEffect, useMemo, useRef, useState } from "react";
import * as D from "./mew-data";

/* ------------------------------------------------------------------ *
 * /stats — PSA 10 value history for every card in the sheet.
 * Data: the sheet (same password gate as the catalog) gives each card's
 * cert numbers ("all cert" column); the ALT Worker turns a cert into
 * ~13 months of daily ALT valuations for that card at PSA 10.
 * Styling uses the Mew Catalog design tokens (src/ds/*.css).
 * ------------------------------------------------------------------ */

type Any = any;
type Pt = { date: string; value: number };

const RANGES: Array<[string, number]> = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["All", 0]];
const SORTS = ["value", "change", "name", "release"] as const;
type SortKey = typeof SORTS[number];

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (v: number) => (v < 100 ? usd2 : usd0).format(v);
const fmtPct = (p: number | null) => (p === null || !isFinite(p) ? "—" : `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`);
const pctOf = (pts: Pt[]) => (pts.length > 1 && pts[0].value > 0 ? ((pts[pts.length - 1].value - pts[0].value) / pts[0].value) * 100 : null);

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
/** Points on or after `days` before the series' last date (all points when days = 0). */
function inRange(h: Pt[], days: number) {
  if (!days || !h.length) return h;
  const cut = shiftDate(h[h.length - 1].date, days);
  return h.filter((p) => p.date >= cut);
}
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/* ---------- charts ---------- */

function pathFor(pts: Pt[], w: number, h: number, lo: number, hi: number) {
  const span = hi - lo || 1;
  return pts.map((p, i) => {
    const x = pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w;
    const y = h - ((p.value - lo) / span) * h;
    return `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join("");
}
function bounds(pts: Pt[]) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { if (p.value < lo) lo = p.value; if (p.value > hi) hi = p.value; }
  const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
}

const Sparkline: React.FC<{ pts: Pt[]; height?: number }> = ({ pts, height = 40 }) => {
  if (pts.length < 2) return <div style={{ height }} />;
  const W = 100, H = 40, { lo, hi } = bounds(pts), line = pathFor(pts, W, H, lo, hi);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height }} aria-hidden="true">
      <path d={`${line}L${W},${H}L0,${H}Z`} fill="var(--pink-700)" fillOpacity="0.08" />
      <path d={line} fill="none" stroke="var(--pink-700)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
};

const LineChart: React.FC<{ pts: Pt[]; height: number }> = ({ pts, height }) => {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (pts.length < 2) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed var(--line-strong)", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>NOT ENOUGH DATA</div>;
  }
  const W = 1000, H = 300, { lo, hi } = bounds(pts), line = pathFor(pts, W, H, lo, hi);
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(t * (pts.length - 1)));
  };
  const hp = hover === null ? null : pts[hover];
  const hx = hover === null ? 0 : (hover / (pts.length - 1)) * 100;
  const hy = hp ? (1 - (hp.value - lo) / (hi - lo || 1)) * 100 : 0;
  const label: React.CSSProperties = { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" };
  return (
    <div>
      <div ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onPointerDown={onMove}
        style={{ position: "relative", height, touchAction: "pan-y", cursor: "crosshair" }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
          <path d={`${line}L${W},${H}L0,${H}Z`} fill="var(--pink-700)" fillOpacity="0.07" />
          <path d={line} fill="none" stroke="var(--pink-700)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <span style={{ ...label, position: "absolute", left: 0, top: 0 }}>{fmtUSD(hi)}</span>
        <span style={{ ...label, position: "absolute", left: 0, bottom: 0 }}>{fmtUSD(lo)}</span>
        {hp && (
          <>
            <span style={{ position: "absolute", top: 0, bottom: 0, left: `${hx}%`, width: 1, background: "var(--line-strong)", pointerEvents: "none" }} />
            <span style={{ position: "absolute", left: `${hx}%`, top: `${hy}%`, width: 9, height: 9, margin: "-5px 0 0 -5px", borderRadius: "50%", background: "var(--pink-700)", border: "2px solid var(--surface-card)", pointerEvents: "none" }} />
            <span style={{ position: "absolute", top: -6, left: `${hx}%`, transform: `translate(${hx > 70 ? "-100%" : hx < 30 ? "0" : "-50%"}, -100%)`, padding: "4px 8px", whiteSpace: "nowrap", background: "var(--surface-card)", border: "1px solid var(--line-strong)", borderRadius: "var(--web-radius-sm)", boxShadow: "var(--shadow-raised)", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-title)", pointerEvents: "none" }}>
              {fmtUSD(hp.value)} <span style={{ color: "var(--text-faint)" }}>· {fmtDate(hp.date)}</span>
            </span>
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={label}>{fmtDate(pts[0].date)}</span>
        <span style={label}>{fmtDate(pts[pts.length - 1].date)}</span>
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

const Change: React.FC<{ pct: number | null; size?: string }> = ({ pct, size = "var(--web-small)" }) => (
  <span style={{ fontFamily: "var(--font-data)", fontSize: size, fontWeight: 600, color: pct !== null && pct > 0 ? "var(--text-accent)" : "var(--text-muted)" }}>
    {pct !== null && pct > 0 ? "▲ " : pct !== null && pct < 0 ? "▼ " : ""}{fmtPct(pct)}
  </span>
);

/* ---------- page ---------- */

export default function StatsPage() {
  const [theme, setTheme] = useState<string>(() => (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [lang, setLang] = useState<"EN" | "JP">(() => (/^ja\b/i.test(navigator.language || "") ? "JP" : "EN"));
  const [narrow, setNarrow] = useState(() => window.innerWidth < 700);
  const [phase, setPhase] = useState<"checking" | "password" | "loading" | "ready" | "error">("checking");
  const [pw, setPw] = useState("");
  const [cards, setCards] = useState<Any[]>([]);
  const [hist, setHist] = useState<Map<string, Any>>(new Map());
  const [histDone, setHistDone] = useState(false);
  const [range, setRange] = useState(365);
  const [sort, setSort] = useState<SortKey>("value");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { document.title = "mew cards · stats"; D.trackEvent("stats_page_view"); }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
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
      setPhase("ready");
      const certs = all.map((c: Any) => D.certOf(c)).filter(Boolean) as string[];
      await D.fetchAltHistories(certs, (m) => setHist(m));
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

  // One row per cert (the sheet can list the same card in more than one tab).
  const rows = useMemo(() => {
    const byCert = new Map<string, Any>();
    const noCert: Any[] = [];
    for (const c of cards) {
      const cert = D.certOf(c);
      if (!cert) { noCert.push(c); continue; }
      if (!byCert.has(cert)) byCert.set(cert, c);
    }
    const charted: Any[] = [], failed: Any[] = [], pending: Any[] = [];
    byCert.forEach((card, cert) => {
      const r = hist.get(cert);
      if (!r) pending.push({ card, cert });
      else if (!r.history || !r.history.length) failed.push({ card, cert, error: r.error || "No history" });
      else {
        const pts = inRange(r.history as Pt[], range);
        charted.push({ card, cert, r, pts, value: r.currentValue ?? r.history[r.history.length - 1].value, change: pctOf(pts) });
      }
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
  }, [cards, hist, range, sort, lang]);

  // Collection total over the range, from the cards whose history covers the whole range,
  // so a card whose series starts mid-range can't show up as a jump in the total.
  const total = useMemo(() => {
    const series = rows.charted.map((x: Any) => x.r.history as Pt[]);
    if (!series.length) return { pts: [] as Pt[], used: 0, value: 0 };
    const lastDate = series.reduce((m: string, h: Pt[]) => (h[h.length - 1].date > m ? h[h.length - 1].date : m), "");
    const start = range ? shiftDate(lastDate, range) : series.reduce((m: string, h: Pt[]) => (h[0].date < m ? h[0].date : m), lastDate);
    const used = series.filter((h: Pt[]) => h[0].date <= start);
    const dates = new Set<string>();
    used.forEach((h: Pt[]) => h.forEach((p) => { if (p.date >= start) dates.add(p.date); }));
    const sorted = [...dates].sort();
    const idx = used.map(() => 0), last = used.map(() => NaN);
    const pts = sorted.map((date) => {
      let sum = 0;
      used.forEach((h: Pt[], k: number) => {
        while (idx[k] < h.length && h[idx[k]].date <= date) { last[k] = h[idx[k]].value; idx[k]++; }
        sum += isNaN(last[k]) ? 0 : last[k];
      });
      return { date, value: sum };
    });
    const value = rows.charted.reduce((s: number, x: Any) => s + (x.value || 0), 0);
    return { pts, used: used.length, value };
  }, [rows, range]);

  const sel = selected ? rows.charted.find((x: Any) => x.cert === selected) : null;
  const totalCerts = rows.charted.length + rows.failed.length + rows.pending.length;
  const loadedCerts = rows.charted.length + rows.failed.length;

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
  const headPts = sel ? sel.pts : total.pts;

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
        <div style={{ marginTop: 6, fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-muted)" }}>
          ALT valuation · daily · USD{histDone ? "" : ` · loading ${loadedCerts}/${totalCerts}`}
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
                  <Change pct={pctOf(headPts)} />
                </div>
                <div style={{ marginTop: 6, fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" }}>
                  {sel
                    ? <>cert {sel.cert}{sel.r.grade && sel.r.grade !== "10.0" ? ` · grade ${sel.r.grade} series` : ""}{sel.r.assetId && <> · <a href={`https://alt.xyz/itm/${sel.r.assetId}/research`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-accent)" }}>ALT ↗</a></>}</>
                    : `${rows.charted.length} cards · line and change use the ${total.used} with history back to ${total.pts.length ? fmtDate(total.pts[0].date) : "the range start"}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {RANGES.map(([label, d]) => (
                  <button key={label} type="button" onClick={() => setRange(d)} style={pill(range === d)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <LineChart pts={headPts} height={narrow ? 180 : 260} />
            </div>
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
                    <Sparkline pts={x.pts} />
                    <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", fontWeight: 600, color: "var(--text-title)" }}>{fmtUSD(x.value)}</span>
                      <Change pct={x.change} size="var(--web-label)" />
                    </span>
                  </button>
                );
              })}
              {rows.pending.map((x: Any) => (
                <div key={x.cert} style={{ padding: 10, minHeight: 116, border: "1px dashed var(--line-hairline)", borderRadius: "var(--web-radius)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: "var(--web-small)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(x.card)}</span>
                  <span style={eyebrow}>Loading…</span>
                </div>
              ))}
            </div>

            {(rows.failed.length > 0 || rows.noCert.length > 0) && histDone && (
              <details style={{ marginTop: 32, borderTop: "1px solid var(--line-hairline)", paddingTop: 14 }}>
                <summary style={{ ...eyebrow, cursor: "pointer" }}>Not charted · {rows.failed.length + rows.noCert.length}</summary>
                <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                  {rows.failed.map((x: Any) => (
                    <div key={x.cert} style={{ display: "flex", gap: 12, fontSize: "var(--web-small)" }}>
                      <span style={{ color: "var(--text-title)", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(x.card)}</span>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" }}>cert {x.cert} · {x.error}</span>
                    </div>
                  ))}
                  {rows.noCert.map((c: Any) => (
                    <div key={c.id} style={{ display: "flex", gap: 12, fontSize: "var(--web-small)" }}>
                      <span style={{ color: "var(--text-title)", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(c)}</span>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" }}>no cert in sheet</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <p style={{ marginTop: 32, maxWidth: "62ch", fontSize: "var(--web-small)", lineHeight: "var(--web-leading)", color: "var(--text-muted)" }}>
              Values are ALT's modelled valuation for each card at PSA 10, not individual sales. ALT keeps about 13 months of daily history, and the last few days often repeat while ALT carries its latest value forward.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
