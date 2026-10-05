import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toCanvas } from "html-to-image";
import * as D from "./mew-data";

/* ------------------------------------------------------------------ *
 * Weekly view of /stats (/stats/#weekly) — a one-page infographic of the week's biggest PSA 10 moves.
 * The week is Monday–Sunday: the latest one ending on or before today,
 * so the page renews itself every Monday (arrows browse earlier weeks).
 * Same data and password as /stats: the sheet's certs ("all cert"), the
 * ALT Worker's PSA 10 sales or daily ALT value, minus cards hidden in
 * /stats' All view. Japanese Mews only (no Cameo or Intl).
 * The infographic is 1080 wide at 1:1, 3:4 or 9:16 (story), scaled to fit, and can be
 * copied or downloaded as a PNG for Instagram / X.
 * ------------------------------------------------------------------ */

type Any = any;
type Pt = { date: string; value: number; house?: string };
type Mode = "sales" | "alt";

const FMT_KEY = "mew_weekly_fmt";
// Poster formats (all 1080 wide): square post, portrait post, Instagram story.
type Fmt = "1:1" | "3:4" | "9:16";
const FORMATS: Array<[Fmt, string]> = [["1:1", "1:1"], ["3:4", "3:4"], ["9:16", "Story"]];

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

type Entry = { card: Any; cert: string; s: Pt[] };

/** Movers, index and sales stats for the week start..end (inclusive). */
function summarize(entries: Entry[], start: string, end: string, mode: Mode) {
  const before = addDays(start, -1);
  const days = Array.from({ length: 8 }, (_, i) => addDays(before, i)); // the day before + 7 days
  const movers: Any[] = [], sales: Any[] = [], indexSeries: Pt[][] = [];
  for (const { card, cert, s } of entries) {
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
  }
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
  return { up, down, index, idxPct, idxCards: indexSeries.length, volume, nSales: sales.length, avg: sales.length ? volume / sales.length : 0, traded: counts.size, biggest, busiest: busiest && busiest.n > 1 ? busiest : null };
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
  muted: "rgba(246,238,241,0.8)",
  faint: "rgba(246,238,241,0.6)",
  up: "#ff7eb6",
  upGlow: "rgba(255,126,182,0.45)",
  down: "#9fb4ff",
  downGlow: "rgba(159,180,255,0.35)",
  gain: "#7ee2a8",                     // climbers list (fallers use down)
  gainGlow: "rgba(126,226,168,0.35)",
};
const mono: React.CSSProperties = { fontFamily: "var(--font-data)", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 11 };

/**
 * A card image. Drawn as an <img> (the image export handles those far better than CSS
 * backgrounds, Safari especially), with the glow as a soft gradient behind it rather than a
 * blurred shadow, which exports cleanly.
 */
const Img: React.FC<{ src?: string; w: number; glow?: string }> = ({ src, w, glow }) => (
  <span style={{ flex: "0 0 auto", position: "relative", display: "block", width: w, aspectRatio: "63 / 88" }}>
    {glow && <span aria-hidden="true" style={{ position: "absolute", left: "-45%", right: "-45%", top: "-25%", bottom: "-35%", background: `radial-gradient(closest-side, ${glow}, transparent)`, pointerEvents: "none" }} />}
    {src
      ? <img src={src} data-card={src} alt="" draggable={false} style={{ position: "relative", display: "block", width: "100%", height: "100%", objectFit: "fill", borderRadius: "4.72% / 3.37%", background: "#241a1f", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }} />
      : <span style={{ position: "relative", display: "block", width: "100%", height: "100%", borderRadius: "4.72% / 3.37%", background: "#241a1f", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }} />}
  </span>
);

/**
 * Card images as data URLs, so the export never has to fetch them (that's where they went
 * missing). Tries the image host directly, then a CORS-friendly image proxy (wsrv.nl).
 */
const dataUrls = new Map<string, Promise<string | null>>();
const blobToDataUrl = (b: Blob) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(b); });
function toDataUrl(url: string): Promise<string | null> {
  if (!/^https?:/i.test(url)) return Promise.resolve(null);
  let p = dataUrls.get(url);
  if (!p) {
    const get = async (u: string) => {
      const res = await fetch(u, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const b = await res.blob();
      if (!/^image\//.test(b.type)) throw new Error("not an image");
      return blobToDataUrl(b);
    };
    p = get(url)
      .catch(() => get(`https://wsrv.nl/?url=${encodeURIComponent(url)}&w=600&output=jpg&q=90`))
      .catch(() => null);
    dataUrls.set(url, p);
  }
  return p;
}
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

const Tile: React.FC<{ label: string; children: React.ReactNode; delay?: number; style?: React.CSSProperties; tag?: string; labelRight?: boolean }> = ({ label, children, delay = 0, style, tag, labelRight }) => (
  <div className="wk-in" data-tile={tag} style={{ animationDelay: `${delay}ms`, padding: 18, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, minWidth: 0, minHeight: 0, overflow: "hidden", ...style }}>
    <div data-label="1" style={{ ...mono, color: C.faint, textAlign: labelRight ? "right" : undefined }}>{label}</div>
    {children}
  </div>
);

/** Change from the week before, under a stat: green when up, red when down. */
const GREEN = "#4ade80", RED = "#f87171";
const Delta: React.FC<{ now: number; prev: number; money?: boolean; invert?: boolean }> = ({ now, prev, money, invert }) => {
  const d = now - prev;
  const good = invert ? d < 0 : d > 0;
  const col = d === 0 ? C.faint : good ? GREEN : RED;
  const abs = money ? usd0.format(Math.abs(Math.round(d))) : String(Math.abs(Math.round(d)));
  const pct = prev > 0 ? ` (${fmtPct((d / prev) * 100)})` : "";
  return (
    <div style={{ marginTop: 8, fontFamily: "var(--font-data)", fontSize: 13, fontWeight: 600, color: col, whiteSpace: "nowrap" }}>
      {d === 0 ? "same as last week" : <>{d > 0 ? "▲ +" : "▼ −"}{abs}{pct}<div style={{ marginTop: 2, fontSize: 11, color: C.faint, fontWeight: 400 }}>vs last week</div></>}
    </div>
  );
};

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

export type WeeklyProps = {
  cards: Any[];
  hist: Map<string, Any>;
  hidden: Set<string>;
  done: boolean;            // every cert's ALT data has loaded
  mode: Mode;
  setMode: (m: Mode) => void;
  lang: "EN" | "JP";
  onBack: () => void;
};

export default function WeeklyView({ cards, hist, hidden, done, mode, setMode, lang, onBack }: WeeklyProps) {
  const shotRef = useRef<HTMLDivElement>(null);
  const [shot, setShot] = useState<"" | "busy" | "copy-ok" | "copy-err" | "save-ok" | "save-err">("");
  const [note, setNote] = useState("");
  const [fmt, setFmtState] = useState<Fmt>(() => { try { const v = localStorage.getItem(FMT_KEY); return FORMATS.some(([f]) => f === v) ? (v as Fmt) : "1:1"; } catch (e) { return "1:1"; } });
  const setFmt = (f: Fmt) => { setFmtState(f); try { localStorage.setItem(FMT_KEY, f); } catch (e) {} };
  const [vw, setVw] = useState(() => [window.innerWidth, window.innerHeight]);
  const latest = sundayOf(todayISO());
  const [end, setEnd] = useState(latest);
  const start = addDays(end, -6);

  useEffect(() => {
    const prev = document.title;
    document.title = "JP Mews · weekly";
    D.trackEvent("weekly_page_view");
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, []);
  useEffect(() => {
    const on = () => setVw([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const name = (c: Any) => (lang === "JP" ? (c.nameJP || c.nameEN) : (c.nameEN || c.nameJP));

  // One series per Japanese Mew cert (minus hidden cards), then this week and the week before.
  const entries = useMemo(() => {
    const byCert = new Map<string, Any>();
    for (const c of cards) {
      const cert = D.certOf(c);
      if (!cert || hidden.has(cert)) continue;
      const prev = byCert.get(cert);
      if (!prev) byCert.set(cert, { ...c });
      else if (c.isMew) prev.isMew = true;
    }
    const out: Entry[] = [];
    byCert.forEach((card, cert) => {
      const s = card.isMew ? seriesOf(hist.get(cert), mode) : [];
      if (s.length) out.push({ card, cert, s });
    });
    return out;
  }, [cards, hidden, hist, mode]);
  const week = useMemo(() => summarize(entries, start, end, mode), [entries, start, end, mode]);
  const prevWeek = useMemo(() => summarize(entries, addDays(start, -7), addDays(end, -7), mode), [entries, start, end, mode]);

  // Load the poster's card images as data URLs (see toDataUrl).
  const [imgData, setImgData] = useState<Record<string, string>>({});
  const imgsReady = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const urls = new Set<string>();
    [...week.up.slice(0, 8), ...week.down.slice(0, 8)].forEach((m) => m.card.image && urls.add(m.card.image));
    if (week.biggest && week.biggest.card.image) urls.add(week.biggest.card.image);
    if (week.busiest && week.busiest.card.image) urls.add(week.busiest.card.image);
    const todo = [...urls].filter((u) => !imgData[u]);
    if (!todo.length) return;
    let live = true;
    imgsReady.current = Promise.all(todo.map((u) => toDataUrl(u).then((d) => {
      if (d && live) setImgData((cur) => (cur[u] ? cur : { ...cur, [u]: d }));
    })));
    return () => { live = false; };
  }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  const pic = (u?: string) => (u && imgData[u]) || u;

  // Phones save through the share sheet ("Save Image" puts it in Photos). Safari only allows
  // the share sheet straight from a tap, so the image is prepared ahead of time.
  const shareFiles = useMemo(() => {
    try {
      const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      const f = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      return !!(coarse && navigator.canShare && navigator.canShare({ files: [f] }));
    } catch (e) { return false; }
  }, []);
  const ready = useRef<{ key: string; blob: Blob } | null>(null);
  const shotKey = `${end}|${mode}|${fmt}|${lang}|${done}|${hidden.size}`;
  const makeRef = useRef<(() => Promise<Blob>) | null>(null);

  // The movers area gets whatever height is left in the poster. Measure it (in unscaled px) and
  // show only the rows that fit, and size the top climber's card to its tile, so nothing spills
  // into the row below whatever the fonts and names do.
  const moversRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const [ext, setExt] = useState<{ top: number; w: number; h: number; imgX: number; imgY: number; imgW: number } | null>(null);
  const [fit, setFit] = useState<{ key: string; rows: number; heroW: number; pad: number } | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => { try { (document as Any).fonts.ready.then(() => setFontsTick((t) => t + 1)); } catch (e) {} }, []);
  useLayoutEffect(() => {
    const box = moversRef.current;
    if (!box) return;
    const fitKey = `${shotKey}|${vw[0]}|${fontsTick}`;
    // Rows can tighten their padding (down to 4px) when that lets one more fit, then spread the
    // space that's left evenly, so the lists end flush with the bottom of their tiles.
    let rows = 99, pad = 99;
    box.querySelectorAll<HTMLElement>("[data-tile=list]").forEach((tile) => {
      const row = tile.querySelector<HTMLElement>("[data-row]");
      const label = tile.querySelector<HTMLElement>("[data-label]");
      if (!row || !label) return;
      const avail = tile.clientHeight - 36 - label.offsetHeight - 8; // padding, label, list margin
      const content = row.offsetHeight - 2 * (parseFloat(getComputedStyle(row).paddingTop) || 0);
      const n = Math.max(1, Math.floor((avail + 1) / (content + 8 + 1)));
      rows = Math.min(rows, n);
      pad = Math.min(pad, Math.floor(((avail + 1) / n - 1 - content) / 2));
    });
    pad = Math.max(4, Math.min(12, pad));
    let heroW = 0;
    const hero = box.querySelector<HTMLElement>("[data-tile=hero]");
    if (hero) {
      const label = hero.querySelector<HTMLElement>("[data-label]");
      const text = hero.querySelector<HTMLElement>("[data-hero-text]");
      if (label && text) {
        const avail = hero.clientHeight - 36 - label.offsetHeight - text.offsetHeight - 14 - 10; // padding, label, text, gap, tilt room
        heroW = Math.max(56, Math.floor(avail / (88 / 63)));
      }
    }
    if (rows === 99) { rows = 0; pad = 0; }
    // Story: the area for the top climber's big card, from below its box's label down to the
    // bottom of the climbers' (empty) #1 slot, in the left column.
    let nextExt: typeof ext = null;
    const sr = storyRef.current;
    const top = sr && sr.querySelector<HTMLElement>("[data-tile=hero-top]");
    const slot = box.querySelector<HTMLElement>("[data-slot]");
    const list = box.querySelector<HTMLElement>("[data-tile=list]");
    if (sr && top && slot && list) {
      const t = top.offsetTop + top.offsetHeight - 1;
      // Left-aligned like the rest of the box's content, reaching about halfway into the slot.
      const bottom = box.offsetTop + slot.offsetTop + slot.offsetHeight / 2;
      const w = list.offsetWidth;
      const regionTop = top.offsetTop + 44, regionBottom = bottom;
      const imgW = Math.max(60, Math.floor(Math.min(w - 120, ((regionBottom - regionTop) * 63) / 88)));
      nextExt = { top: t, w, h: Math.max(0, bottom - t), imgX: 30, imgY: Math.round(regionTop), imgW };
    }
    const same = (a: typeof ext, b: typeof ext) => (!a && !b) || (!!a && !!b && a.top === b.top && a.w === b.w && a.h === b.h && a.imgW === b.imgW && a.imgY === b.imgY);
    if (!same(ext, nextExt)) setExt(nextExt);
    if (!fit || fit.key !== fitKey || fit.rows !== rows || fit.heroW !== heroW || fit.pad !== pad) {
      setFit({ key: fitKey, rows, heroW, pad });
    }
  });
  useEffect(() => {
    if (!shareFiles || !done) return;
    ready.current = null;
    const key = shotKey;
    // After the intro animations have finished.
    const t = window.setTimeout(() => {
      if (!makeRef.current) return;
      makeRef.current().then((blob) => { if (key === shotKey) ready.current = { key, blob }; }).catch(() => {});
    }, 1800);
    return () => window.clearTimeout(t);
  }, [shotKey, shareFiles, done]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- still loading the ALT data ---------- */
  if (!done) {
    const totalCerts = new Set(cards.map((c: Any) => D.certOf(c)).filter(Boolean)).size;
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", background: "#101010" }}>
        <div style={{ position: "relative", width: 112, height: 112 }}>
          <div className="loading-swirl" aria-hidden="true" style={{ position: "absolute", inset: 0 }} />
          <img src="/assets/mew-logo.png" alt="Loading..." style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25 }} />
        </div>
        <div style={{ position: "absolute", top: "50%", marginTop: 76, ...mono, color: "rgba(203,151,165,0.8)" }}>reading {Math.min(hist.size, totalCerts)}/{totalCerts} cards</div>
        <button type="button" onClick={onBack} style={{ position: "absolute", top: 16, left: 16, ...mono, background: "none", border: "none", cursor: "pointer", color: "rgba(203,151,165,0.8)" }}>← Stats</button>
      </div>
    );
  }

  const sales = mode === "sales";
  // Poster formats: 1080 wide, height by ratio. The copied/downloaded image is the poster plus
  // a 4px edge, rendered from the unscaled layout at 2x with animations frozen in their end state.
  const W = 1080, EDGE = 4;
  const H = fmt === "9:16" ? 1920 : fmt === "3:4" ? 1440 : 1080;
  const SHOT_W = W + EDGE * 2, SHOT_H = H + EDGE * 2;
  const makeBlob = async () => {
    const node = shotRef.current;
    if (!node) throw new Error("no poster");
    await imgsReady.current; // card images loaded as data URLs
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    node.classList.add("wk-shot");
    try {
      // The poster is rendered without its card images (Safari leaves pictures out of this kind
      // of render, whatever their source), then each card is painted onto the canvas at its
      // place on the poster: same position, size, rounded corners and tilt.
      const PR = 2;
      const opts = { pixelRatio: PR, width: SHOT_W, height: SHOT_H, style: { transform: "none" }, backgroundColor: "#060506",
        filter: (n: HTMLElement) => !(n instanceof HTMLImageElement && n.dataset.card) };
      for (let i = 0; i < (isSafari ? 2 : 0); i++) await toCanvas(node, opts); // warm-up passes for Safari (fonts)
      const canvas = await toCanvas(node, opts);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      const box = node.getBoundingClientRect();
      const k = box.width / SHOT_W; // on-screen scale of the poster
      const imgs = [...node.querySelectorAll<HTMLImageElement>("img[data-card]")].filter((el) => getComputedStyle(el).visibility !== "hidden");
      // Load every image first, then paint them one at a time (each paint sets its own
      // transform and clip on the shared canvas).
      const loaded = await Promise.all(imgs.map(async (el) => {
        const src = el.dataset.card || "";
        const data = src.startsWith("data:") ? src : await toDataUrl(src);
        if (!data) return null;
        const im = new Image();
        im.src = data;
        try { await im.decode(); return im; } catch (e) { return null; }
      }));
      imgs.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const cx = ((r.left + r.right) / 2 - box.left) / k, cy = ((r.top + r.bottom) / 2 - box.top) / k;
        const w = el.offsetWidth, h = el.offsetHeight;
        const tilt = el.closest(".wk-float") ? (-4 * Math.PI) / 180 : 0;
        ctx.save();
        ctx.scale(PR, PR);
        ctx.translate(cx, cy);
        if (tilt) ctx.rotate(tilt);
        const rx = w * 0.0472, ry = h * 0.0337;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + rx, -h / 2);
        ctx.lineTo(w / 2 - rx, -h / 2); ctx.ellipse(w / 2 - rx, -h / 2 + ry, rx, ry, 0, -Math.PI / 2, 0);
        ctx.lineTo(w / 2, h / 2 - ry); ctx.ellipse(w / 2 - rx, h / 2 - ry, rx, ry, 0, 0, Math.PI / 2);
        ctx.lineTo(-w / 2 + rx, h / 2); ctx.ellipse(-w / 2 + rx, h / 2 - ry, rx, ry, 0, Math.PI / 2, Math.PI);
        ctx.lineTo(-w / 2, -h / 2 + ry); ctx.ellipse(-w / 2 + rx, -h / 2 + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = "#241a1f";
        ctx.fillRect(-w / 2, -h / 2, w, h);
        const im = loaded[i];
        if (im) ctx.drawImage(im, -w / 2, -h / 2, w, h);
        ctx.restore();
      });
      const b = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
      if (!b) throw new Error("no image");
      return b;
    } finally {
      node.classList.remove("wk-shot");
      node.classList.add("wk-still");
    }
  };
  const fileName = `jp-mews-week-${weekNo(end)}-${end}-${fmt.replace(":", "x")}.png`;
  const saveBlob = (b: Blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const flash = (which: "copy" | "save", st: "ok" | "err") => { setShot(`${which}-${st}`); window.setTimeout(() => setShot(""), 1800); };
  const copyShot = async () => {
    if (shot === "busy") return;
    setShot("busy");
    try {
      const CI = (window as Any).ClipboardItem;
      if (navigator.clipboard && navigator.clipboard.write && CI) {
        // Hand the clipboard a promise so Safari keeps the click's permission while the image renders.
        await navigator.clipboard.write([new CI({ "image/png": makeBlob() })]);
      } else {
        saveBlob(await makeBlob()); // no image clipboard here: download instead
      }
      D.trackEvent("weekly_copy", { week: end, mode, fmt });
      flash("copy", "ok");
    } catch (e) {
      console.error(e);
      flash("copy", "err");
    }
  };
  makeRef.current = makeBlob;
  const downloadShot = async () => {
    if (shot === "busy") return;
    setNote("");
    if (shareFiles) {
      // Phone: share sheet, where "Save Image" adds it to Photos. Uses the image prepared in the
      // background; if it isn't ready yet, make it now and ask for a second tap (Safari won't open
      // the share sheet after a wait).
      const hit = ready.current && ready.current.key === shotKey ? ready.current.blob : null;
      if (hit) {
        try {
          await navigator.share({ files: [new File([hit], fileName, { type: "image/png" })] });
          D.trackEvent("weekly_download", { week: end, mode, fmt, via: "share" });
          flash("save", "ok");
        } catch (e: Any) {
          if (e && e.name === "AbortError") return; // closed the share sheet
          console.error(e);
          flash("save", "err");
        }
        return;
      }
      setShot("busy");
      try {
        const blob = await makeBlob();
        ready.current = { key: shotKey, blob };
        try {
          await navigator.share({ files: [new File([blob], fileName, { type: "image/png" })] });
          D.trackEvent("weekly_download", { week: end, mode, fmt, via: "share" });
          flash("save", "ok");
        } catch (e: Any) {
          setShot("");
          if (e && e.name === "AbortError") return;
          setNote("Image ready. Tap the download button again to save it.");
        }
      } catch (e) {
        console.error(e);
        flash("save", "err");
      }
      return;
    }
    setShot("busy");
    try {
      saveBlob(await makeBlob());
      D.trackEvent("weekly_download", { week: end, mode, fmt });
      flash("save", "ok");
    } catch (e) {
      console.error(e);
      flash("save", "err");
    }
  };

  const story = fmt === "9:16", tall = fmt !== "1:1";
  const hero = week.up[0] || null;
  const rowsMax = 14; // the measured fit decides; this only bounds the first render
  const fitNow = fit && fit.key === `${shotKey}|${vw[0]}|${fontsTick}` ? fit : null;
  const rowsShown = fitNow && fitNow.rows ? Math.min(rowsMax, fitNow.rows) : rowsMax;
  // Both lists number from #1 so places line up; the top climber is #1 in the climbers list too
  // (in the story it's covered by the top climber's box, which reaches down into that slot).
  const climbers = week.up.slice(0, rowsShown);
  const fallers = week.down.slice(0, rowsShown);
  const heroMax = tall ? 170 : 140;
  const heroW = fitNow && fitNow.heroW ? Math.min(heroMax, fitNow.heroW) : heroMax;
  const maxPct = Math.max(1, ...[...climbers, ...fallers].map((m) => Math.abs(m.pct)));
  const idxUp = week.idxPct >= 0;
  const nothing = !week.up.length && !week.down.length;
  const scale = Math.min(1, (vw[0] - 24) / SHOT_W, Math.max(320, vw[1] - 76) / SHOT_H);
  const big: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 700, lineHeight: 1 };

  const MoverRow: React.FC<{ m: Any; i: number; up: boolean; delay: number; hidden?: boolean }> = ({ m, i, up, delay, hidden }) => (
    <div className="wk-in" data-row="1" data-slot={i === 0 && up ? "1" : undefined} style={{ visibility: hidden ? "hidden" : undefined, animationDelay: `${delay}ms`, display: "grid", gridTemplateColumns: "16px 34px minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: `${fitNow && fitNow.pad ? fitNow.pad : tall ? 8 : 10}px 0`, borderTop: i ? `1px solid ${C.line}` : "none" }}>
      <span style={{ ...mono, color: C.faint }}>{i + 1}</span>
      <Img src={pic(m.card.image)} w={34} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{name(m.card)}</span>
          {m.card.number && <span style={{ flex: "0 0 auto", fontFamily: "var(--font-data)", fontSize: 12, color: C.faint }}>{m.card.number}</span>}
        </span>
        <span style={{ display: "block", marginTop: 5, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <span className="wk-bar" style={{ display: "block", height: "100%", width: `${(Math.abs(m.pct) / maxPct) * 100}%`, background: up ? C.gain : C.down, boxShadow: `0 0 10px ${up ? C.gainGlow : C.downGlow}`, animationDelay: `${delay + 150}ms` }} />
        </span>
        <span style={{ display: "block", marginTop: 4, fontFamily: "var(--font-data)", fontSize: 12, color: C.faint }}>{fmtUSD(m.from)} <span style={{ color: up ? C.gain : C.down }}>→</span> {fmtUSD(m.to)}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={{ fontFamily: "var(--font-data)", fontWeight: 600, fontSize: 17, color: up ? C.gain : C.down, textShadow: `0 0 12px ${up ? C.gainGlow : C.downGlow}` }}>{fmtPct(m.pct)}</span>
        <span style={{ marginTop: 3, fontFamily: "var(--font-data)", fontSize: 12, color: C.text }}>{m.to >= m.from ? "+" : "−"}{usd0.format(Math.abs(m.to - m.from))}</span>
      </span>
    </div>
  );
  const Highlight: React.FC<{ label: string; img?: string; title: string; sub: string; line: string; delay: number }> = ({ label, img, title, sub, line, delay }) => (
    <Tile label={label} delay={delay}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12 }}>
        <Img src={pic(img)} w={58} glow="rgba(196,155,255,0.35)" />
        <div style={{ minWidth: 0 }}>
          <div style={{ ...big, fontSize: 32 }}>{title}</div>
          <div style={{ marginTop: 6, fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
          <div style={{ marginTop: 3, fontFamily: "var(--font-data)", fontSize: 12, color: C.faint }}>{line}</div>
        </div>
      </div>
    </Tile>
  );

  /* ---------- poster pieces, arranged per format below ---------- */
  const gradTitle: React.CSSProperties = { background: `linear-gradient(90deg, #fff 0%, ${C.up} 55%, #c49bff 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
  const kicker = <div style={{ ...mono, fontSize: story ? 16 : 13, color: C.up }}>PSA 10 · {sales ? "weekly movers" : "ALT value movers"}</div>;
  const dates = <div style={{ fontFamily: "var(--font-data)", fontSize: story ? 22 : 16, color: C.muted }}>{fmtDay(start)} – {fmtDay(end, true)}</div>;
  const title = story ? (
    <div className="wk-in" style={{ position: "relative" }}>
      {kicker}
      <h1 style={{ margin: "14px 0 0", ...big, fontSize: 120, letterSpacing: "-0.03em", lineHeight: 0.95, ...gradTitle }}>JP Mews<br />Week {weekNo(end)}</h1>
      <div style={{ marginTop: 18 }}>{dates}</div>
    </div>
  ) : (
    <div className="wk-in" style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        {kicker}
        <h1 style={{ margin: "8px 0 0", ...big, fontSize: 76, letterSpacing: "-0.02em", lineHeight: 1.0, ...gradTitle, whiteSpace: "nowrap" }}>JP Mews ・ Week {weekNo(end)}</h1>
      </div>
      <div style={{ marginLeft: "auto", textAlign: "right", paddingBottom: 8, flex: "0 0 auto" }}>{dates}</div>
    </div>
  );
  const indexTile = (
    <Tile label={`${sales ? "Collection" : "ALT"} index · ${week.idxCards} cards`} delay={80}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 8 }}>
        <Num v={week.index[week.index.length - 1] || 0} fmt={(n) => usd0.format(n)} style={{ ...big, fontSize: story ? 56 : 46 }} />
        <span style={{ fontFamily: "var(--font-data)", fontWeight: 700, fontSize: story ? 24 : 20, color: idxUp ? C.up : C.down, textShadow: `0 0 14px ${idxUp ? C.upGlow : C.downGlow}` }}>{idxUp ? "▲" : "▼"} {fmtPct(week.idxPct)}</span>
      </div>
      <div style={{ marginTop: 12 }}><IndexLine pts={week.index} up={idxUp} /></div>
    </Tile>
  );
  const statTiles = sales ? (
    <>
      <Tile label="Sales" delay={140}><Num v={week.nSales} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 12, ...big, fontSize: 40 }} /><Delta now={week.nSales} prev={prevWeek.nSales} /></Tile>
      <Tile label="Volume" delay={200}><Num v={week.volume} fmt={(n) => usd0.format(n)} style={{ display: "block", marginTop: 12, ...big, fontSize: 32 }} /><Delta now={week.volume} prev={prevWeek.volume} money /></Tile>
      <Tile label="Cards traded" delay={260}><Num v={week.traded} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 12, ...big, fontSize: 40 }} /><Delta now={week.traded} prev={prevWeek.traded} /></Tile>
      <Tile label="Avg sale" delay={320}><Num v={week.avg} fmt={(n) => usd0.format(n)} style={{ display: "block", marginTop: 12, ...big, fontSize: 32 }} /><Delta now={week.avg} prev={prevWeek.avg} money /></Tile>
    </>
  ) : (
    <>
      <Tile label="Going up" delay={140}><Num v={week.up.length} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 12, ...big, fontSize: 56, color: C.up }} /><Delta now={week.up.length} prev={prevWeek.up.length} /></Tile>
      <Tile label="Going down" delay={200}><Num v={week.down.length} fmt={(n) => String(Math.round(n))} style={{ display: "block", marginTop: 12, ...big, fontSize: 56, color: C.down }} /><Delta now={week.down.length} prev={prevWeek.down.length} invert /></Tile>
    </>
  );
  const heroBg = "linear-gradient(160deg, rgba(255,126,182,0.18), rgba(255,255,255,0.03) 65%)";
  // Story: the top climber's box spans the width; its card is drawn over it and reaches down
  // over the climbers list's empty #1 slot (the boxes themselves stay as they are).
  const heroTile = hero && (story ? (
    <Tile label="Top climber" tag="hero-top" delay={260} style={{ position: "relative", height: 230, boxSizing: "border-box", background: heroBg }}>
      <div style={{ display: "flex", alignItems: "center", height: "calc(100% - 14px)", paddingLeft: ext ? ext.imgX + ext.imgW + 40 - 18 : 220 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...big, fontSize: 84, color: C.up, textShadow: `0 0 28px ${C.upGlow}` }}>{fmtPct(hero.pct)}</div>
          <div style={{ marginTop: 16, fontWeight: 600, fontSize: 24, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name(hero.card)}</div>
          <div style={{ marginTop: 6, fontFamily: "var(--font-data)", fontSize: 16, color: C.muted }}>{fmtUSD(hero.from)} → <span style={{ color: C.text, fontWeight: 600 }}>{fmtUSD(hero.to)}</span></div>
        </div>
      </div>
    </Tile>
  ) : (
    <Tile label="Top climber" tag="hero" delay={260} style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", background: heroBg }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }}>
        <span className="wk-float" style={{ display: "block" }}><Img src={pic(hero.card.image)} w={heroW} glow={C.upGlow} /></span>
        <div data-hero-text="1" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: "100%" }}>
          <div style={{ ...big, fontSize: tall ? 60 : 54, color: C.up, textShadow: `0 0 24px ${C.upGlow}` }}>{fmtPct(hero.pct)}</div>
          <div style={{ maxWidth: "100%" }}>
            <div style={{ fontWeight: 600, fontSize: 18, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name(hero.card)}</div>
            <div style={{ marginTop: 4, fontFamily: "var(--font-data)", fontSize: 13, color: C.muted }}>{fmtUSD(hero.from)} → <span style={{ color: C.text, fontWeight: 600 }}>{fmtUSD(hero.to)}</span></div>
          </div>
        </div>
      </div>
    </Tile>
  ));
  const climbersTile = (
    <Tile label="Climbers" tag="list" delay={320} labelRight={story && !!hero}>
      <div style={{ marginTop: 8 }}>
        {climbers.length ? climbers.map((m, i) => <MoverRow key={m.cert} m={m} i={i} up delay={380 + i * 60} hidden={story && i === 0} />)
          : <div style={{ marginTop: 10, fontSize: 15, color: C.faint }}>Nothing went up.</div>}
      </div>
    </Tile>
  );
  const fallersTile = (
    <Tile label="Fallers" tag="list" delay={380}>
      <div style={{ marginTop: 8 }}>
        {fallers.length ? fallers.map((m, i) => <MoverRow key={m.cert} m={m} i={i} up={false} delay={440 + i * 60} />)
          : <div style={{ marginTop: 10, fontSize: 15, color: C.faint }}>Nothing went down.</div>}
      </div>
    </Tile>
  );
  const quiet = (
    <Tile label="Quiet week" delay={200} style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ marginTop: 12, fontSize: 20, color: C.muted }}>{sales ? "No price moves from sales this week." : "No ALT value moves this week."}</div>
    </Tile>
  );
  const highlights = sales && (week.biggest || week.busiest) && (
    <div style={{ position: "relative", display: "grid", gap: 16, gridTemplateColumns: week.busiest && week.biggest ? "1fr 1fr" : "1fr" }}>
      {week.biggest && <Highlight label="Biggest sale" delay={500} img={week.biggest.card.image} title={fmtUSD(week.biggest.value)} sub={name(week.biggest.card)} line={[fmtDay(week.biggest.date), week.biggest.house].filter(Boolean).join(" · ")} />}
      {week.busiest && <Highlight label="Most sold" delay={560} img={week.busiest.card.image} title={`${week.busiest.n} sales`} sub={name(week.busiest.card)} line={`avg ${fmtUSD(week.busiest.sum / week.busiest.n)}`} />}
    </div>
  );

  const pill = (on: boolean): React.CSSProperties => ({ ...mono, fontSize: 10, cursor: "pointer", padding: "7px 10px", borderRadius: 6, border: `1px solid ${on ? C.up : C.line}`, background: on ? C.up : "transparent", color: on ? "#1a0a12" : C.muted, fontWeight: 700 });
  const iconCol = (which: "copy" | "save") => (shot === `${which}-ok` ? GREEN : shot === `${which}-err` ? RED : C.text);
  const check = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

  return (
    <div style={{ minHeight: "100vh", background: "#060506", color: C.text, fontFamily: "var(--font-body)", display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 12px 24px", boxSizing: "border-box" }}>
      <style>{`
        .wk-in { animation: wkIn 600ms cubic-bezier(.2,.7,.2,1) both; }
        @keyframes wkIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .wk-bar { animation: wkBar 900ms cubic-bezier(.2,.7,.2,1) both; transform-origin: left; }
        @keyframes wkBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .wk-float { animation: wkFl 6s ease-in-out infinite; }
        @keyframes wkFl { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(-2deg); } }
        .wk-nav { background: none; border: 1px solid ${C.line}; color: ${C.text}; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
        .wk-nav:disabled { opacity: .25; cursor: default; }
        .wk-nav:not(:disabled):hover { border-color: ${C.up}; color: ${C.up}; }
        .wk-shot .wk-in, .wk-shot .wk-bar, .wk-shot .wk-float, .wk-still .wk-in, .wk-still .wk-bar { animation: none !important; }
        .wk-shot .wk-float { transform: rotate(-4deg); }
        @media (prefers-reduced-motion: reduce) { .wk-in, .wk-bar, .wk-float { animation: none !important; } }
      `}</style>

      {/* controls (outside the poster, so images of it stay clean) */}
      <div style={{ width: Math.max(SHOT_W * scale, Math.min(vw[0] - 24, 560)), display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={onBack} style={{ ...mono, color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer" }}>← Stats</button>
        <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <button type="button" className="wk-nav" onClick={() => setEnd(addDays(end, -7))} aria-label="Previous week">‹</button>
          <button type="button" className="wk-nav" onClick={() => setEnd(addDays(end, 7))} disabled={end >= latest} aria-label="Next week">›</button>
        </span>
        <span style={{ display: "flex", gap: 4 }}>
          {(["sales", "alt"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={pill(mode === m)}>{m === "sales" ? "Sales" : "ALT value"}</button>
          ))}
        </span>
        <span style={{ display: "flex", gap: 4 }}>
          {FORMATS.map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFmt(f)} aria-pressed={fmt === f} title={f === "9:16" ? "Instagram story" : f === "3:4" ? "Portrait post" : "Square post"} style={pill(fmt === f)}>{label}</button>
          ))}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="wk-nav" onClick={copyShot} disabled={shot === "busy"} aria-label="Copy image to clipboard" title={shot === "copy-err" ? "Couldn't copy" : "Copy image"} style={{ color: iconCol("copy") }}>
            {shot === "copy-ok" ? check : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>}
          </button>
          <button type="button" className="wk-nav" onClick={downloadShot} disabled={shot === "busy"} aria-label={shareFiles ? "Save image" : "Download image"} title={shot === "save-err" ? "Couldn't save" : shareFiles ? "Save image (share sheet → Save Image)" : "Download image"} style={{ color: iconCol("save") }}>
            {shot === "save-ok" ? check : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 20h14" /></svg>}
          </button>
        </span>
      </div>

      {note && <div role="status" style={{ width: SHOT_W * scale, marginTop: -4, marginBottom: 10, fontSize: 13, color: GREEN }}>{note}</div>}

      {/* the poster (inside a 4px edge, which is what gets copied / downloaded) */}
      <div style={{ width: SHOT_W * scale, height: SHOT_H * scale, flex: "0 0 auto" }}>
       <div ref={shotRef} style={{ width: SHOT_W, height: SHOT_H, padding: EDGE, boxSizing: "border-box", background: "#060506", transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <div key={`${end}-${mode}-${fmt}`} style={{ width: W, height: H, position: "relative", overflow: "hidden", background: C.bg, borderRadius: 28, boxSizing: "border-box", padding: story ? "76px 56px 80px" : 52, display: "flex", flexDirection: "column", gap: story ? 20 : 16 }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(60% ${story ? 30 : 50}% at 90% 0%, rgba(255,126,182,0.24), transparent 70%), radial-gradient(55% ${story ? 28 : 45}% at 0% 100%, rgba(159,120,255,0.18), transparent 70%)` }} />
          {title}
          {story ? (
            <>
              <div style={{ position: "relative", marginTop: 10 }}>{indexTile}</div>
              <div style={{ position: "relative", display: "grid", gap: 16, gridTemplateColumns: sales ? "repeat(4, 1fr)" : "1fr 1fr" }}>{statTiles}</div>
              {nothing ? quiet : (
                <>
                  <div ref={storyRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                    {heroTile}
                    <div ref={moversRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr", gridTemplateRows: "minmax(0, 1fr)" }}>{climbersTile}{fallersTile}</div>
                    {hero && ext && (
                      <>
                        <div className="wk-in" style={{ animationDelay: "300ms", position: "absolute", zIndex: 3, left: ext.imgX, top: ext.imgY }}>
                          <span className="wk-float" style={{ display: "block" }}><Img src={pic(hero.card.image)} w={ext.imgW} glow={C.upGlow} /></span>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
              {highlights}
            </>
          ) : (
            <>
              <div style={{ position: "relative", display: "grid", gap: 16, gridTemplateColumns: "1.3fr 1fr" }}>
                {indexTile}
                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>{statTiles}</div>
              </div>
              {nothing ? quiet : (
                <div ref={moversRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "grid", gap: 16, gridTemplateColumns: hero ? "1.05fr 1fr 1fr" : "1fr 1fr", gridTemplateRows: "minmax(0, 1fr)" }}>
                  {heroTile}{climbersTile}{fallersTile}
                </div>
              )}
              {highlights}
            </>
          )}
        </div>
       </div>
      </div>
    </div>
  );
}
