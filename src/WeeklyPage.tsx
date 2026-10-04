import React, { useEffect, useMemo, useRef, useState } from "react";
import * as D from "./mew-data";

/* ------------------------------------------------------------------ *
 * /weekly — a one-page infographic of the week's biggest PSA 10 moves.
 * The week is Monday–Sunday: the latest one ending on or before today,
 * so the page renews itself every Monday (arrows browse earlier weeks).
 * Same data and password as /stats: the sheet's certs ("all cert"), the
 * ALT Worker's PSA 10 sales or daily ALT value, minus cards hidden in
 * /stats' All view, using /stats' Mew/Cameo/Intl scope.
 * ------------------------------------------------------------------ */

type Any = any;
type Pt = { date: string; value: number; house?: string };
type Mode = "sales" | "alt";

const STATS_CONFIG_KEY = "mew_stats_config_v1";
const MODE_KEY = "mew_stats_mode";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (v: number) => (Math.abs(v) < 100 ? usd2 : usd0).format(v);
const fmtPct = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
const fmtDay = (iso: string, year = false) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const todayISO = () => new Date().toISOString().slice(0, 10);
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The Sunday on or before `iso`. */
function sundayOf(iso: string) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -day);
}
/** ISO week number of the week ending on `sunday`. */
function weekNo(sunday: string) {
  const thu = new Date(`${addDays(sunday, -3)}T00:00:00Z`);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.floor((thu.getTime() - jan1) / 864e5 / 7) + 1;
}
function readScope() {
  try {
    const v = JSON.parse(localStorage.getItem("mew_stats_scope") || "null");
    if (v && ["mew", "cameo", "intl"].every((k) => typeof v[k] === "boolean")) return v;
  } catch (e) {}
  return { mew: true, cameo: false, intl: false };
}
function seriesOf(r: Any, mode: Mode): Pt[] {
  const raw = mode === "sales"
    ? ((r && r.sales) || []).map((s: Any) => ({ date: String(s.date || "").slice(0, 10), value: Number(s.price), house: s.auctionHouse || undefined }))
    : ((r && r.history) || []).map((p: Any) => ({ date: String(p.date || "").slice(0, 10), value: Number(p.value) }));
  return raw.filter((p: Pt) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && isFinite(p.value) && p.value > 0)
    .sort((a: Pt, b: Pt) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
function valueAt(series: Pt[], date: string) {
  let v: number | null = null;
  for (const p of series) { if (p.date <= date) v = p.value; else break; }
  return v;
}

/** Counts up to `to` once it's set (eases out over ~1s). */
function useCountUp(to: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

/* ---------- poster palette (always dark, whatever the site theme) ---------- */
const C = {
  bg: "#0d0a0c",
  panel: "rgba(255,255,255,0.04)",
  line: "rgba(255,255,255,0.09)",
  text: "#f6eef1",
  muted: "rgba(246,238,241,0.62)",
  faint: "rgba(246,238,241,0.38)",
  up: "#ff7eb6",
  upGlow: "rgba(255,126,182,0.45)",
  down: "#9fb4ff",
  downGlow: "rgba(159,180,255,0.35)",
};
const mono: React.CSSProperties = { fontFamily: "var(--font-data)", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 11 };

const Img: React.FC<{ src?: string; w: number; glow?: string; tilt?: number; style?: React.CSSProperties }> = ({ src, w, glow, tilt = 0, style }) => (
  <span style={{ flex: "0 0 auto", display: "block", width: w, aspectRatio: "63 / 88", borderRadius: "4.72% / 3.37%", background: "#241a1f", backgroundImage: src ? `url("${src}")` : "none", backgroundSize: "100% 100%", transform: tilt ? `rotate(${tilt}deg)` : undefined, boxShadow: glow ? `0 0 0 1px rgba(255,255,255,0.08), 0 18px 50px -10px ${glow}` : "0 0 0 1px rgba(255,255,255,0.08)", ...style }} />
);

const Tile: React.FC<{ label: string; children: React.ReactNode; delay?: number; style?: React.CSSProperties }> = ({ label, children, delay = 0, style }) => (
  <div className="wk-in" style={{ animationDelay: `${delay}ms`, padding: 18, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, minWidth: 0, ...style }}>
    <div style={{ ...mono, color: C.faint }}>{label}</div>
    {children}
  </div>
);

const Num: React.FC<{ v: number; fmt: (n: number) => string; style?: React.CSSProperties }> = ({ v, fmt, style }) => {
  const n = useCountUp(v);
  return <span style={style}>{fmt(n)}</span>;
};

/** Daily index across the week, as a glowing area line. */
const IndexLine: React.FC<{ pts: number[]; up: boolean }> = ({ pts, up }) => {
  if (pts.length < 2) return null;
  const W = 300, H = 90, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 8 - ((v - lo) / span) * (H - 16)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const col = up ? C.up : C.down;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 90, overflow: "visible" }} aria-hidden="true">
      <defs>
        <linearGradient id="wkfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity="0.35" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill="url(#wkfill)" />
      <path d={line} fill="none" stroke={col} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${col})` }} />
    </svg>
  );
};

export default function WeeklyPage() {
  const [phase, setPhase] = useState<"checking" | "password" | "loading" | "ready" | "error">("checking");
  const [pw, setPw] = useState("");
  const [cards, setCards] = useState<Any[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hist, setHist] = useState<Map<string, Any>>(new Map());
  const [mode, setModeState] = useState<Mode>(() => { try { return localStorage.getItem(MODE_KEY) === "alt" ? "alt" : "sales"; } catch (e) { return "sales"; } });
  const [narrow, setNarrow] = useState(() => window.innerWidth < 760);
  const lang = /^ja\b/i.test(navigator.language || "") ? "JP" : "EN";
  const latest = sundayOf(todayISO());
  const [end, setEnd] = useState(latest);
  const start = addDays(end, -6);
  const scope = useRef(readScope()).current;

  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch (e) {} D.trackEvent("weekly_mode", { mode: m }); };
  useEffect(() => { document.title = "mew cards · this week"; D.trackEvent("weekly_page_view"); document.documentElement.setAttribute("data-theme", "dark"); }, []);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 760);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const load = async (password: string) => {
    setPhase("loading");
    try {
      const all = await D.fetchAllSheets(password, { forStats: true });
      setCards(all);
      const hl = D.sheetExtras.hidden;
      setHidden(new Set(hl ? hl.all : []));
      const certs = [...new Set(all.map((c: Any) => D.certOf(c)).filter(Boolean))] as string[];
      await D.fetchAltHistories(certs, (m) => setHist(m));
      setPhase("ready");
    } catch (e: Any) {
      if (e && e.message === "auth") { setPw(""); setPhase("password"); }
      else { console.error(e); setPhase("error"); }
    }
  };
  useEffect(() => {
    let cached: Any = null;
    try { cached = localStorage.getItem(STATS_CONFIG_KEY); } catch (e) {}
    if (cached === "private") setPhase("password");
    D.fetchConfig().then((cfg) => {
      const need = !!(cfg && (cfg.statsPasswordEnabled || cfg.passwordEnabled));
      try { localStorage.setItem(STATS_CONFIG_KEY, need ? "private" : "public"); } catch (e) {}
      if (need) setPhase((p) => (p === "checking" ? "password" : p));
      else load("");
    }).catch(() => { if (cached !== "private") load(""); else setPhase("password"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = (c: Any) => (lang === "JP" ? (c.nameJP || c.nameEN) : (c.nameEN || c.nameJP));

  const week = useMemo(() => {
    const byCert = new Map<string, Any>();
    for (const c of cards) {
      const cert = D.certOf(c);
      if (!cert || hidden.has(cert)) continue;
      const prev = byCert.get(cert);
      if (!prev) byCert.set(cert, { ...c });
      else { if (c.isMew) prev.isMew = true; if (c.isCameo) prev.isCameo = true; if (c.isIntl) prev.isIntl = true; }
    }
    const before = addDays(start, -1);
    const days = Array.from({ length: 8 }, (_, i) => addDays(before, i)); // the day before + 7 days
    const movers: Any[] = [], sales: Any[] = [], indexSeries: Pt[][] = [];
    byCert.forEach((card, cert) => {
      if (!((scope.mew && card.isMew) || (scope.cameo && card.isCameo) || (scope.intl && card.isIntl))) return;
      const r = hist.get(cert);
      if (!r) return;
      const s = seriesOf(r, mode);
      if (!s.length) return;
      const inWeek = s.filter((p) => p.date >= start && p.date <= end);
      const base = valueAt(s, before);
      const last = valueAt(s, end);
      if (base !== null) indexSeries.push(s);
      if (mode === "sales") inWeek.forEach((p) => sales.push({ card, cert, ...p }));
      // A move: sales mode needs a sale this week (compared with the last sale before it, or with
      // the week's first sale); ALT value compares the value at the end of the week with the start.
      let from: number | null = null, to: number | null = null;
      if (mode === "sales") {
        if (inWeek.length && base !== null) { from = base; to = inWeek[inWeek.length - 1].value; }
        else if (inWeek.length > 1) { from = inWeek[0].value; to = inWeek[inWeek.length - 1].value; }
      } else if (base !== null && last !== null) { from = base; to = last; }
      if (from && to && from > 0 && from !== to) movers.push({ card, cert, from, to, pct: ((to - from) / from) * 100, n: inWeek.length });
    });
    const up = movers.filter((m) => m.pct > 0).sort((a, b) => b.pct - a.pct);
    const down = movers.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct);
    // Index: cards with a price before the week, each at its latest price as of each day.
    const index = days.map((d) => indexSeries.reduce((sum, s) => sum + (valueAt(s, d) || 0), 0));
    const idxPct = index[0] > 0 ? ((index[index.length - 1] - index[0]) / index[0]) * 100 : 0;
    const volume = sales.reduce((a, b) => a + b.value, 0);
    const biggest = sales.slice().sort((a, b) => b.value - a.value)[0] || null;
    const counts = new Map<string, Any>();
    sales.forEach((x) => { const c = counts.get(x.cert) || { card: x.card, cert: x.cert, n: 0, sum: 0 }; c.n++; c.sum += x.value; counts.set(x.cert, c); });
    const busiest = [...counts.values()].sort((a, b) => b.n - a.n || b.sum - a.sum)[0] || null;
    return { up, down, index, idxPct, idxCards: indexSeries.length, volume, nSales: sales.length, traded: counts.size, biggest, busiest: busiest && busiest.n > 1 ? busiest : null };
  }, [cards, hidden, hist, mode, start, end, scope]);

  /* ---------- gate / loading ---------- */
  if (phase !== "ready") {
    const totalCerts = new Set(cards.map((c: Any) => D.certOf(c)).filter(Boolean)).size;
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", background: "#101010" }}>
        <div style={{ position: "relative", width: 112, height: 112 }}>
          <div className="loading-swirl" aria-hidden="true" style={{ position: "absolute", inset: 0 }} />
          <img src="/assets/mew-logo.png" alt="Loading..." style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25 }} />
        </div>
        {phase === "password" && (
          <form onSubmit={(e) => { e.preventDefault(); if (pw) load(pw); }} style={{ position: "absolute", top: "50%", left: 0, right: 0, marginTop: 72, display: "flex", justifyContent: "center" }}>
            <input type="password" className="mew-gate-input" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Password" autoFocus
              style={{ height: 30, width: 96, padding: "0 10px", boxSizing: "border-box", borderRadius: 6, textAlign: "center", fontFamily: "var(--font-body)", fontSize: 13, letterSpacing: "0.25em", outline: "none" }} />
          </form>
        )}
        {phase === "loading" && totalCerts > 0 && (
          <div style={{ position: "absolute", top: "50%", marginTop: 76, ...mono, color: "rgba(203,151,165,0.8)" }}>reading {hist.size}/{totalCerts} cards</div>
        )}
        {phase === "error" && <div style={{ position: "absolute", top: "50%", marginTop: 76, ...mono, color: "rgba(203,151,165,0.8)" }}>Couldn't load. Refresh to try again.</div>}
        <div style={{ position: "absolute", bottom: 16, ...mono, fontSize: 10, color: "rgba(203,151,165,0.8)" }}>v{D.APP_VERSION}</div>
      </div>
    );
  }

  const sales = mode === "sales";
  const hero = week.up[0] || null;
  const climbers = week.up.slice(hero ? 1 : 0, 6);
  const fallers = week.down.slice(0, 5);
  const maxPct = Math.max(1, ...[...climbers, ...fallers].map((m) => Math.abs(m.pct)));
  const idxUp = week.idxPct >= 0;
  const pad = narrow ? 16 : 40;
  const nothing = !week.up.length && !week.down.length;

  const MoverRow: React.FC<{ m: Any; i: number; up: boolean; delay: number }> = ({ m, i, up, delay }) => (
    <div className="wk-in" style={{ animationDelay: `${delay}ms`, display: "grid", gridTemplateColumns: "18px 30px minmax(0,1fr) auto", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
      <span style={{ ...mono, color: C.faint }}>{i + (up && hero ? 2 : 1)}</span>
      <Img src={m.card.image} w={30} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(m.card)}</span>
        <span style={{ display: "block", marginTop: 4, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <span className="wk-bar" style={{ display: "block", height: "100%", width: `${(Math.abs(m.pct) / maxPct) * 100}%`, background: up ? C.up : C.down, boxShadow: `0 0 10px ${up ? C.upGlow : C.downGlow}`, animationDelay: `${delay + 150}ms` }} />
        </span>
        <span style={{ display: "block", marginTop: 3, fontFamily: "var(--font-data)", fontSize: 11, color: C.faint }}>{fmtUSD(m.from)} → {fmtUSD(m.to)}</span>
      </span>
      <span style={{ fontFamily: "var(--font-data)", fontWeight: 600, fontSize: 15, color: up ? C.up : C.down, textShadow: `0 0 12px ${up ? C.upGlow : C.downGlow}` }}>{fmtPct(m.pct)}</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "var(--font-body)", position: "relative", overflow: "hidden" }}>
      <style>{`
        .wk-in { animation: wkIn 600ms cubic-bezier(.2,.7,.2,1) both; }
        @keyframes wkIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .wk-bar { animation: wkBar 900ms cubic-bezier(.2,.7,.2,1) both; transform-origin: left; }
        @keyframes wkBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .wk-star { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #fff; animation: wkTw 3.2s ease-in-out infinite; }
        @keyframes wkTw { 0%,100% { opacity: .1; transform: scale(.6); } 50% { opacity: .9; transform: scale(1.3); } }
        .wk-float { animation: wkFl 6s ease-in-out infinite; }
        @keyframes wkFl { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(-2deg); } }
        .wk-nav { background: none; border: 1px solid ${C.line}; color: ${C.text}; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .wk-nav:disabled { opacity: .25; cursor: default; }
        .wk-nav:not(:disabled):hover { border-color: ${C.up}; color: ${C.up}; }
        @media (prefers-reduced-motion: reduce) { .wk-in, .wk-bar, .wk-star, .wk-float { animation: none !important; } }
      `}</style>
      {/* glow + stars */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(60% 50% at 85% 0%, rgba(255,126,182,0.22), transparent 70%), radial-gradient(50% 40% at 0% 100%, rgba(159,120,255,0.16), transparent 70%)` }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {Array.from({ length: 26 }, (_, i) => (
          <span key={i} className="wk-star" style={{ left: `${(i * 37.7) % 100}%`, top: `${(i * 53.3) % 100}%`, animationDelay: `${(i * 0.41) % 3.2}s`, opacity: 0.3 }} />
        ))}
      </div>

      <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto", padding: `${narrow ? 18 : 28}px ${pad}px 40px`, boxSizing: "border-box" }}>
        {/* top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <a href="/stats/" style={{ ...mono, color: C.muted, textDecoration: "none" }}>← Stats</a>
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {(["sales", "alt"] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} style={{ ...mono, fontSize: 10, cursor: "pointer", padding: "5px 10px", borderRadius: 6, border: `1px solid ${mode === m ? C.up : C.line}`, background: mode === m ? C.up : "transparent", color: mode === m ? "#1a0a12" : C.muted, fontWeight: 700 }}>{m === "sales" ? "Sales" : "ALT value"}</button>
            ))}
          </span>
        </div>

        {/* title */}
        <div className="wk-in" style={{ marginTop: narrow ? 22 : 30, display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...mono, color: C.up }}>Mew cards · weekly movers</div>
            <h1 style={{ margin: "6px 0 0", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: narrow ? 44 : 76, lineHeight: 0.95, letterSpacing: "-0.02em", background: `linear-gradient(90deg, #fff 0%, ${C.up} 60%, #c49bff 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              Week {weekNo(end)}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: narrow ? 0 : "auto", paddingBottom: 6 }}>
            <button type="button" className="wk-nav" onClick={() => setEnd(addDays(end, -7))} aria-label="Previous week">‹</button>
            <span style={{ fontFamily: "var(--font-data)", fontSize: 13, color: C.muted, minWidth: 150, textAlign: "center" }}>{fmtDay(start)} – {fmtDay(end, true)}</span>
            <button type="button" className="wk-nav" onClick={() => setEnd(addDays(end, 7))} disabled={end >= latest} aria-label="Next week">›</button>
          </div>
        </div>

        {/* index + stats */}
        <div style={{ marginTop: 22, display: "grid", gap: 12, gridTemplateColumns: narrow ? "1fr" : "1.25fr 1fr" }}>
          <Tile label={`${sales ? "Collection" : "ALT"} index · ${week.idxCards} cards`} delay={80}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
              <Num v={week.index[week.index.length - 1] || 0} fmt={(n) => usd0.format(n)} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: narrow ? 34 : 44, lineHeight: 1 }} />
              <span style={{ fontFamily: "var(--font-data)", fontWeight: 700, fontSize: 18, color: idxUp ? C.up : C.down, textShadow: `0 0 14px ${idxUp ? C.upGlow : C.downGlow}` }}>{idxUp ? "▲" : "▼"} {fmtPct(week.idxPct)}</span>
            </div>
            <div style={{ marginTop: 10 }}><IndexLine pts={week.index} up={idxUp} /></div>
          </Tile>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            {sales ? (
              <>
                <Tile label="Sales" delay={140}><Num v={week.nSales} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 34 }} /></Tile>
                <Tile label="Volume" delay={200}><Num v={week.volume} fmt={(n) => usd0.format(n)} style={{ display: "block", marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30 }} /></Tile>
                <Tile label="Cards traded" delay={260}><Num v={week.traded} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 34 }} /></Tile>
                <Tile label="Avg sale" delay={320}><Num v={week.nSales ? week.volume / week.nSales : 0} fmt={(n) => usd0.format(n)} style={{ display: "block", marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30 }} /></Tile>
              </>
            ) : (
              <>
                <Tile label="Going up" delay={140}><Num v={week.up.length} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 34, color: C.up }} /></Tile>
                <Tile label="Going down" delay={200}><Num v={week.down.length} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 34, color: C.down }} /></Tile>
              </>
            )}
          </div>
        </div>

        {nothing ? (
          <Tile label="Quiet week" delay={200} style={{ marginTop: 12, textAlign: "center", padding: 48 }}>
            <div style={{ marginTop: 10, fontSize: 15, color: C.muted }}>{sales ? "No price moves from sales this week. Try ALT value, or an earlier week." : "No ALT value moves this week."}</div>
          </Tile>
        ) : (
          <div style={{ marginTop: 12, display: "grid", gap: 12, gridTemplateColumns: narrow ? "1fr" : "1.1fr 1fr 1fr" }}>
            {/* hero: top climber */}
            {hero ? (
              <Tile label="Top climber" delay={260} style={{ position: "relative", overflow: "hidden", background: "linear-gradient(160deg, rgba(255,126,182,0.16), rgba(255,255,255,0.03) 60%)" }}>
                <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 14 }}>
                  <span className="wk-float" style={{ display: "block" }}><Img src={hero.card.image} w={narrow ? 110 : 130} glow={C.upGlow} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: narrow ? 40 : 48, lineHeight: 1, color: C.up, textShadow: `0 0 24px ${C.upGlow}` }}>{fmtPct(hero.pct)}</div>
                    <div style={{ marginTop: 10, fontWeight: 600, fontSize: 16, lineHeight: 1.25 }}>{name(hero.card)}</div>
                    <div style={{ marginTop: 4, fontFamily: "var(--font-data)", fontSize: 12, color: C.faint }}>{[hero.card.number, hero.card.year].filter(Boolean).join(" · ")}</div>
                    <div style={{ marginTop: 10, fontFamily: "var(--font-data)", fontSize: 13, color: C.muted }}>{fmtUSD(hero.from)} → <span style={{ color: C.text, fontWeight: 600 }}>{fmtUSD(hero.to)}</span></div>
                  </div>
                </div>
              </Tile>
            ) : <div />}
            <Tile label="Climbers" delay={320}>
              <div style={{ marginTop: 8 }}>
                {climbers.length ? climbers.map((m, i) => <MoverRow key={m.cert} m={m} i={i} up delay={380 + i * 60} />)
                  : <div style={{ marginTop: 8, fontSize: 13, color: C.faint }}>{hero ? "Just the one this week." : "Nothing went up."}</div>}
              </div>
            </Tile>
            <Tile label="Fallers" delay={380}>
              <div style={{ marginTop: 8 }}>
                {fallers.length ? fallers.map((m, i) => <MoverRow key={m.cert} m={m} i={i} up={false} delay={440 + i * 60} />)
                  : <div style={{ marginTop: 8, fontSize: 13, color: C.faint }}>Nothing went down.</div>}
              </div>
            </Tile>
          </div>
        )}

        {/* sale highlights */}
        {sales && (week.biggest || week.busiest) && (
          <div style={{ marginTop: 12, display: "grid", gap: 12, gridTemplateColumns: narrow || !week.busiest || !week.biggest ? "1fr" : "1fr 1fr" }}>
            {week.biggest && (
              <Tile label="Biggest sale" delay={500}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
                  <Img src={week.biggest.card.image} w={56} glow="rgba(196,155,255,0.35)" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, lineHeight: 1 }}>{fmtUSD(week.biggest.value)}</div>
                    <div style={{ marginTop: 6, fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(week.biggest.card)}</div>
                    <div style={{ marginTop: 2, fontFamily: "var(--font-data)", fontSize: 11, color: C.faint }}>{[fmtDay(week.biggest.date), week.biggest.house].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              </Tile>
            )}
            {week.busiest && (
              <Tile label="Most traded" delay={560}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
                  <Img src={week.busiest.card.image} w={56} glow="rgba(196,155,255,0.35)" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, lineHeight: 1 }}>{week.busiest.n} sales</div>
                    <div style={{ marginTop: 6, fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(week.busiest.card)}</div>
                    <div style={{ marginTop: 2, fontFamily: "var(--font-data)", fontSize: 11, color: C.faint }}>avg {fmtUSD(week.busiest.sum / week.busiest.n)}</div>
                  </div>
                </div>
              </Tile>
            )}
          </div>
        )}

        <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", ...mono, fontSize: 10, color: C.faint }}>
          <span>PSA 10 · {sales ? "vs. the last sale before the week" : "ALT daily value"} · renews every Monday</span>
          <span>mew.cards · v{D.APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}
