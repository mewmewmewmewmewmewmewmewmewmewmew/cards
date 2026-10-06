import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toCanvas } from "html-to-image";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import * as D from "./mew-data";
import Loader from "./Loader";

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
// "reel": a reel cover: the 3:4 poster at the top of a 9:16 frame, big title below.
// "reelsafe": a reel: 9:16 with everything inside what a full-screen reel leaves visible.
// "cover2": a reel cover: the 9:16 poster, dimmed, with a big banner across it for the dates.
type Fmt = "1:1" | "3:4" | "9:16" | "reel" | "reelsafe" | "cover2";
const FORMATS: Array<[Fmt, string]> = [["1:1", "1:1"], ["3:4", "3:4"], ["9:16", "9:16"], ["reel", "Reel cover"], ["reelsafe", "Reel"], ["cover2", "Reel cover 2"]];
const SASH = { w: 1080 + 520, h: 460, cy: 960, rot: -8, blur: 26 }; // Reel cover 2's banner
const REEL_EXTRA = 1920 - 1440; // reel cover: the space under the 3:4 layout
// Reel: the 9:16 layout reworked for a reel playing full screen on a phone (measured from an
// iPhone screenshot). Instagram zooms 9:16 to fill the taller screen, cropping ~47px off each
// side; its header ("Your reels") covers the top ~250px and the like / comment / share buttons
// sit at the right from ~1460. The 9:16 layout keeps clear of the side crop and is centred
// vertically (equal space above and below; the header may overlap the top of the title); the
// bottom row stops short of the buttons.
const REEL_H = 1920 - 52 - 262; // the content height (from below the header to the usual bottom margin)
const REEL = { x: 64, y: Math.round((1920 - REEL_H) / 2), w: 952, h: REEL_H, buttons: 120 }; // centred vertically

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (v: number) => (Math.abs(v) < 100 ? usd2 : usd0).format(v);
const fmtPct = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;
const fmtDay = (iso: string, year = false) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
/** "09/28", "10/04" */
const fmtMD = (iso: string) => { const [, m, d] = iso.split("-"); return `${m}/${d}`; };
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
// A sale only counts as a move against a previous sale from the last ~6 months; a card that sells
// after a longer gap is a "comeback" (its % mostly reflects the time away, not this week).
const COMEBACK_DAYS = 182;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
/** "4mo", "1y", "2y 3mo" */
const gapLabel = (days: number) => {
  const m = Math.round(days / 30.44);
  if (m < 12) return `${m}mo`;
  const y = Math.floor(m / 12), r = m % 12;
  return r ? `${y}y ${r}mo` : `${y}y`;
};

function summarize(entries: Entry[], start: string, end: string, mode: Mode) {
  const before = addDays(start, -1);
  const comebacks: Any[] = [];
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
      if (inWeek.length && base !== null) {
        let baseDate = "";
        for (const p of s) { if (p.date < start) baseDate = p.date; else break; }
        const gap = daysBetween(baseDate, inWeek[inWeek.length - 1].date);
        if (gap > COMEBACK_DAYS) {
          const to0 = inWeek[inWeek.length - 1].value;
          comebacks.push({ card, cert, from: base, to: to0, pct: ((to0 - base) / base) * 100, lastDate: baseDate, gap });
          continue;
        }
        from = base; to = inWeek[inWeek.length - 1].value;
      }
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
  // Biggest gain in dollars (not percent): a big card's modest move can beat a cheap card's jump.
  const bigGain = up.slice().sort((a, b) => (b.to - b.from) - (a.to - a.from))[0] || null;
  comebacks.sort((a, b) => b.gap - a.gap); // longest time away first
  return { up, down, comebacks, index, idxPct, idxCards: indexSeries.length, volume, nSales: sales.length, avg: sales.length ? volume / sales.length : 0, traded: counts.size, biggest, busiest: busiest && busiest.n > 1 ? busiest : null, bigGain };
}

/* ---------- video timeline ----------
 * Normally the poster animates with CSS and a requestAnimationFrame count-up. While a video is
 * being made, the poster is driven by a clock instead (VT = ms since the start), so every frame
 * can be drawn at an exact moment. The curves match the CSS ones. */
const VT = React.createContext<number | null>(null);
const ease = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
/** The tiles' fade-up (CSS .wk-in: 600ms, 14px). */
const fadeAt = (vt: number | null, delay: number): React.CSSProperties => {
  if (vt === null) return {};
  const k = ease((vt - delay) / 600);
  return { opacity: k, transform: `translateY(${(14 * (1 - k)).toFixed(2)}px)` };
};
/** The bars' fill (CSS .wk-bar: 900ms). */
const barAt = (vt: number | null, delay: number): React.CSSProperties => (vt === null ? {} : { transform: `scaleX(${ease((vt - delay) / 900).toFixed(4)})` });
// (The top card no longer floats: it holds a still -4° tilt, set in CSS.)
const floatPhase = (_vt: number) => 0;
const floatAt = (_vt: number | null): React.CSSProperties => ({});
// The on-screen intro is done by 2.5s; the video plays it slowed down to fill 4s (the last frame
// is the finished poster).
const VIDEO_ANIM_MS = 2500, VIDEO_LEN_MS = 4000, VIDEO_FPS = 30;

// When the poster (this week / mode / size) appeared: every count-up is timed from here, so a
// number that gets re-created mid-animation carries on instead of starting again from 0.
const AnimStart = React.createContext<number>(0);
const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
/** 0→1 progress of a count-up starting `delay` ms after the poster appeared (re-renders until done). */
function useCountProgress(delay: number, ms = 1100) {
  const start = useContext(AnimStart);
  const at = () => (reducedMotion() ? 1 : ease((performance.now() - start - delay) / ms));
  const [, setTick] = useState(0);
  useEffect(() => {
    if (at() >= 1) return;
    let raf = 0;
    const tick = () => { setTick((x) => x + 1); if (at() < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, delay]); // eslint-disable-line react-hooks/exhaustive-deps
  return at();
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
  comeback: "#c49bff",                 // comebacks (back after 6mo+)
  gain: "#7ee2a8",                     // climbers list (fallers use down)
  gainGlow: "rgba(126,226,168,0.35)",
};
// The Mew logo in the title's top-right corner (height in px; the PNG is 200×211).
const LOGO = { h: { "1:1": 64, "3:4": 64, "9:16": 84, reel: 64, reelsafe: 64, cover2: 84 } as Record<string, number>, inset: 28 };
/** The logo recoloured in the poster's pink (made once, as a data URL). */
let tintedLogo: Promise<string> | null = null;
function getTintedLogo(): Promise<string> {
  if (!tintedLogo) {
    tintedLogo = new Promise((ok) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas");
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        const x = c.getContext("2d");
        if (!x) return ok("/assets/mew-logo.png");
        x.drawImage(im, 0, 0);
        x.globalCompositeOperation = "source-in";
        x.fillStyle = C.up; x.fillRect(0, 0, c.width, c.height);
        ok(c.toDataURL("image/png"));
      };
      im.onerror = () => ok("/assets/mew-logo.png");
      im.src = "/assets/mew-logo.png";
    });
  }
  return tintedLogo;
}
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
/**
 * The page's web fonts as embeddable CSS, limited to the pieces that cover the characters on the
 * poster. (The exporter otherwise inlines every piece of every font into every frame; the
 * Japanese body font alone comes in ~120 pieces, which ran browsers out of memory mid-video.)
 * Faces/weights the poster doesn't use are dropped too. Cached per character set.
 */
const fontCssCache = new Map<string, Promise<string>>();
const inRange = (cp: number, range: string) => range.split(",").some((part) => {
  const m = part.trim().replace(/^U\+/i, "");
  if (m.includes("?")) { const lo = parseInt(m.replace(/\?/g, "0"), 16), hi = parseInt(m.replace(/\?/g, "F"), 16); return cp >= lo && cp <= hi; }
  const [a, b] = m.split("-"); const lo = parseInt(a, 16), hi = b ? parseInt(b, 16) : lo;
  return cp >= lo && cp <= hi;
});
function posterFontCSS(node: HTMLElement): Promise<string> {
  const cps = [...new Set([...(node.textContent || "")].map((ch) => ch.codePointAt(0) || 0))].sort((a, b) => a - b);
  const key = cps.join(",");
  let p = fontCssCache.get(key);
  if (!p) {
    p = (async () => {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')];
      const out: string[] = [];
      for (const link of links) {
        const css = await (await fetch(link.href)).text();
        const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
        const keep = blocks.filter((b) => {
          const r = /unicode-range:\s*([^;}]+)/i.exec(b);
          return !r || cps.some((cp) => inRange(cp, r[1]));
        });
        const done = await Promise.all(keep.map(async (b) => {
          const u = /url\(([^)]+)\)/.exec(b);
          if (!u) return b;
          const url = u[1].replace(/["']/g, "");
          try {
            const blob = await (await fetch(url)).blob();
            const data: string = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(blob); });
            return b.replace(u[0], `url(${data})`);
          } catch (e) { return ""; }
        }));
        out.push(...done.filter(Boolean));
      }
      return out.join("\n");
    })().catch(() => "");
    fontCssCache.set(key, p);
  }
  return p;
}

const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

const Tile: React.FC<{ label: string; children: React.ReactNode; delay?: number; style?: React.CSSProperties; tag?: string; list?: string; labelRight?: boolean }> = ({ label, children, delay = 0, style, tag, list, labelRight }) => {
  const vt = useContext(VT);
  return (
  <div className="wk-in" data-tile={tag} data-list={list} style={{ animationDelay: `${delay}ms`, padding: 18, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, minWidth: 0, minHeight: 0, overflow: "hidden", ...style, ...fadeAt(vt, delay) }}>
    <div data-label="1" style={{ ...mono, color: C.faint, textAlign: labelRight ? "right" : undefined }}>{label}</div>
    {children}
  </div>
  );
};

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

// Trims the text box to the capitals so they sit dead centre in the pill (browsers without
// text-box-trim fall back to the font's own centring).
const PILL_TRIM = { textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as unknown as React.CSSProperties;

/** A small, quiet pill for the card's edition (e.g. 1st / UED) from the sheet's edition column. */
const Edition: React.FC<{ e?: string; size?: number }> = ({ e, size = 10 }) => (D.editionLabel(e) ? (
  <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", height: Math.round(size * 1.6), marginLeft: 6, padding: "0 5px", borderRadius: 4, border: "1px solid currentColor", fontFamily: "var(--font-data)", fontWeight: 500, fontSize: size, lineHeight: 1, letterSpacing: "0.04em", color: C.faint, verticalAlign: "middle", ...PILL_TRIM }}>{D.editionLabel(e)}</span>
) : null);

/** A number that counts up from 0 (after `delay` ms), on screen and in the video. */
const Num: React.FC<{ v: number; fmt: (n: number) => string; style?: React.CSSProperties; delay?: number; reserve?: boolean }> = ({ v, fmt, style, delay = 0, reserve }) => {
  const k = useCountProgress(delay);
  const vt = useContext(VT);
  const shown = fmt(v * (vt === null ? k : ease((vt - delay) / 1100)));
  if (!reserve) return <span style={style}>{shown}</span>;
  // Keeps the final number's width while counting, so nothing next to it shifts.
  return (
    <span style={{ ...style, position: "relative", display: style && style.display === "block" ? "block" : "inline-block" }}>
      <span style={{ visibility: "hidden" }}>{fmt(v)}</span>
      <span style={{ position: "absolute", right: 0, top: 0, whiteSpace: "nowrap" }}>{shown}</span>
    </span>
  );
};

/** Daily index across the week, as a glowing area line. */
const IndexLine: React.FC<{ pts: number[]; up: boolean; h?: number }> = ({ pts, up, h = 90 }) => {
  const vt = useContext(VT);
  if (pts.length < 2) return null;
  // In the video the line draws in from the left (with its tile, over ~1.2s).
  const shown = vt === null ? 1 : ease((vt - 80) / 1200);
  const W = 300, H = 90, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 8 - ((v - lo) / span) * (H - 16)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const col = up ? C.up : C.down;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: h, overflow: "visible", ...(shown < 1 ? { clipPath: `inset(-20px ${((1 - shown) * 100).toFixed(2)}% -20px -20px)` } : {}) }} aria-hidden="true">
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
  const [shot, setShot] = useState<"" | "busy" | "copy-ok" | "copy-err" | "save-ok" | "save-err" | "video-ok" | "video-err">("");
  const [vt, setVt] = useState<number | null>(null); // video clock while a video is being made
  const [videoPct, setVideoPct] = useState<number | null>(null);
  const imgCacheRef = useRef(new Map<string, HTMLImageElement | null>());
  const readyVideo = useRef<File | null>(null);
  const [note, setNote] = useState("");
  const [fmt, setFmtState] = useState<Fmt>(() => { try { const v = localStorage.getItem(FMT_KEY); return FORMATS.some(([f]) => f === v) ? (v as Fmt) : "1:1"; } catch (e) { return "1:1"; } });
  const setFmt = (f: Fmt) => { setFmtState(f); try { localStorage.setItem(FMT_KEY, f); } catch (e) {} };
  const [logoSrc, setLogoSrc] = useState("/assets/mew-logo.png");
  useEffect(() => { getTintedLogo().then(setLogoSrc); }, []);
  const [vw, setVw] = useState(() => [window.innerWidth, window.innerHeight]);
  const latest = sundayOf(todayISO());
  const [end, setEnd] = useState(latest);
  const start = addDays(end, -6);
  const animStart = useMemo(() => performance.now(), [end, mode, fmt]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (week.bigGain && week.bigGain.card.image) urls.add(week.bigGain.card.image);
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
  // The title shrinks to fit its line if a font renders it wider than planned.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleFit, setTitleFit] = useState<{ key: string; k: number } | null>(null);
  const [ext, setExt] = useState<{ top: number; w: number; h: number; imgX: number; imgY: number; imgW: number } | null>(null);
  const [fit, setFit] = useState<{ key: string; rows: Record<string, number>; pads: Record<string, number>; rowH: Record<string, number>; labelH: number; heroW: number } | null>(null);
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => { try { (document as Any).fonts.ready.then(() => setFontsTick((t) => t + 1)); } catch (e) {} }, []);
  useLayoutEffect(() => {
    const h = titleRef.current;
    const key = `${fmt}|${end}|${fontsTick}`;
    if (h) {
      const cur = titleFit && titleFit.key === key ? titleFit.k : 1;
      const need = h.scrollWidth > h.clientWidth + 1 ? Math.max(0.6, (cur * h.clientWidth) / h.scrollWidth) : cur;
      if (!titleFit || titleFit.key !== key || Math.abs(need - titleFit.k) > 0.005) setTitleFit({ key, k: need });
    }
  });
  useLayoutEffect(() => {
    const box = moversRef.current;
    if (!box) return;
    const fitKey = `${shotKey}|${vw[0]}|${fontsTick}`;
    // Rows can tighten their padding (down to 4px) when that lets one more fit, then spread the
    // space that's left evenly, so the lists end flush with the bottom of their tiles.
    // Each list is measured on its own (the comebacks and fallers share a column).
    const rows: Record<string, number> = {}, pads: Record<string, number> = {}, rowH: Record<string, number> = {};
    let labelH = 0;
    box.querySelectorAll<HTMLElement>("[data-tile=list]").forEach((tile) => {
      const name = tile.dataset.list || "list";
      const row = tile.querySelector<HTMLElement>("[data-row]");
      const label = tile.querySelector<HTMLElement>("[data-label]");
      if (!row || !label) return;
      const avail = tile.clientHeight - 36 - label.offsetHeight - 8; // padding, label, list margin
      const content = row.offsetHeight - 2 * (parseFloat(getComputedStyle(row).paddingTop) || 0);
      const n = Math.max(1, Math.min(fmt === "9:16" ? 10 : 99, Math.floor((avail + 1) / (content + 8 + 1)))); // story: top 10
      rows[name] = n;
      pads[name] = Math.max(4, Math.min(16, Math.floor(((avail + 1) / n - 1 - content) / 2)));
      rowH[name] = content + 2 * pads[name];
      labelH = label.offsetHeight;
    });
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
    const sameRec = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
    if (!fit || fit.key !== fitKey || !sameRec(fit.rows, rows) || !sameRec(fit.pads, pads) || !sameRec(fit.rowH, rowH) || fit.labelH !== labelH || fit.heroW !== heroW) {
      setFit({ key: fitKey, rows, pads, rowH, labelH, heroW });
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

  /* ---------- still loading the ALT data (normally /stats has already waited for it) ---------- */
  if (!done) {
    const totalCerts = new Set(cards.map((c: Any) => D.certOf(c)).filter(Boolean)).size;
    return <Loader progress={totalCerts ? (100 * Math.min(hist.size, totalCerts)) / totalCerts : 0} />;
  }

  const sales = mode === "sales";
  // Poster formats: 1080 wide, height by ratio. The copied/downloaded image is the poster plus
  // a 4px edge, rendered from the unscaled layout at 2x with animations frozen in their end state.
  const W = 1080, EDGE = 4;
  const H = fmt === "9:16" || fmt === "reel" || fmt === "reelsafe" || fmt === "cover2" ? 1920 : fmt === "3:4" ? 1440 : 1080;
  const SHOT_W = W + EDGE * 2, SHOT_H = H + EDGE * 2;
  // Paints the card images onto a canvas made from the poster (see makeBlob). `off` shifts
  // everything (the video drops the 4px edge); `at` is the video clock, for the top card's float.
  const imgCache = imgCacheRef.current;
  /**
   * Where each picture (cards, logo) lands in the exported image. The export is drawn without
   * pictures and they're painted on afterwards; their on-screen positions can't be trusted for
   * that (a phone's text-size / zoom settings change the on-screen layout but not the export's).
   * So a hidden copy of the poster is drawn the same way with every picture replaced by a block
   * of its own exact colour, and the blocks are found in the result. Positions are in poster px
   * (with the 4px edge); `sx, sy` is the on-screen centre at the time, so later animation
   * offsets (the video's fade-ins) can be added on.
   */
  type Loc = { x: number; y: number; sx: number; sy: number };
  const locatePictures = async (node: HTMLElement, fontEmbedCSS: string | undefined): Promise<Map<Element, Loc>> => {
    const out = new Map<Element, Loc>();
    const live = [...node.querySelectorAll<HTMLImageElement>("img[data-card], img[data-logo]")];
    if (!live.length) return out;
    const box = node.getBoundingClientRect();
    const k = box.width / SHOT_W;
    const clone = node.cloneNode(true) as HTMLElement;
    clone.style.transform = "none";
    clone.querySelectorAll("[data-overlay]").forEach((e) => e.remove()); // it would tint the blocks
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;";
    host.appendChild(clone);
    document.body.appendChild(host);
    try {
      const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      const imgs = [...clone.querySelectorAll<HTMLImageElement>("img[data-card], img[data-logo]")];
      imgs.forEach((el, i) => {
        el.src = BLANK; el.alt = "";
        // Codes 8 shades apart (red, then blue), so colour handling that nudges a shade can't mix them up.
        el.style.background = `rgb(${8 * (i % 32) + 4}, 254, ${8 * Math.floor(i / 32) + 4})`;
        el.style.boxShadow = "none"; el.style.opacity = "1"; el.style.borderRadius = "0";
      });
      const opts = { pixelRatio: 1, width: SHOT_W, height: SHOT_H, backgroundColor: "#060506", fontEmbedCSS };
      for (let i = 0; i < (isSafari ? 2 : 1); i++) await toCanvas(clone, opts); // fonts ready (they shape the layout)
      const c = await toCanvas(clone, opts);
      const ctx = c.getContext("2d");
      if (!ctx) return out;
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      c.width = 0; c.height = 0;
      const bb = new Map<number, [number, number, number, number]>();
      for (let y = 0; y < height; y++) {
        for (let x = 0, o = y * width * 4; x < width; x++, o += 4) {
          if (data[o + 1] < 250 || data[o + 3] !== 255) continue;
          const rr = data[o] - 4, bl = data[o + 2] - 4;
          if (Math.abs(rr - 8 * Math.round(rr / 8)) > 2 || Math.abs(bl - 8 * Math.round(bl / 8)) > 2) continue;
          const id = Math.round(rr / 8) + 32 * Math.round(bl / 8);
          const b = bb.get(id);
          if (!b) bb.set(id, [x, y, x, y]);
          else { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
        }
      }
      live.forEach((el, i) => {
        const b = bb.get(i);
        if (!b || b[2] - b[0] < 4) return;
        const r = el.getBoundingClientRect();
        out.set(el, { x: (b[0] + b[2] + 1) / 2, y: (b[1] + b[3] + 1) / 2, sx: ((r.left + r.right) / 2 - box.left) / k, sy: ((r.top + r.bottom) / 2 - box.top) / k });
      });
    } catch (e) { console.error(e); }
    finally { host.remove(); }
    return out;
  };
  /** The picture's centre in the export: located (see above) plus any movement since, else on-screen. */
  const centreOf = (el: Element, node: HTMLElement, locs: Map<Element, Loc> | null) => {
    const box = node.getBoundingClientRect();
    const k = box.width / SHOT_W;
    const r = el.getBoundingClientRect();
    const sx = ((r.left + r.right) / 2 - box.left) / k, sy = ((r.top + r.bottom) / 2 - box.top) / k;
    const l = locs && locs.get(el);
    return l ? { x: l.x + (sx - l.sx), y: l.y + (sy - l.sy) } : { x: sx, y: sy };
  };

  /** A cover overlay (Reel cover 2), drawn on top of everything; `at` = its spot in the canvas. */
  const paintOverlay = async (ctx: CanvasRenderingContext2D, node: HTMLElement, PR: number, at: number, fontEmbedCSS: string | undefined) => {
    const el = node.querySelector<HTMLElement>("[data-overlay]");
    if (!el) return;
    // The sash's blur (the export can't do backdrop blur): blur what's drawn so far, by scaling
    // it down and back up, and paint that inside the sash's (rotated) shape.
    const cv = ctx.canvas;
    const small = (src: CanvasImageSource, w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const x = c.getContext("2d")!; x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height); return c; };
    const f = Math.max(2, (SASH.blur * PR) / 3);
    const s1 = small(cv, cv.width / Math.sqrt(f), cv.height / Math.sqrt(f));
    const s2 = small(s1, cv.width / f, cv.height / f);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate((at + W / 2) * PR, (at + SASH.cy) * PR);
    ctx.rotate((SASH.rot * Math.PI) / 180);
    ctx.beginPath();
    ctx.rect((-SASH.w / 2) * PR, (-SASH.h / 2) * PR, SASH.w * PR, SASH.h * PR);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(s2, 0, 0, cv.width, cv.height);
    ctx.restore();
    s1.width = s2.width = 0;
    const c = await toCanvas(el, { pixelRatio: PR, width: W, height: H, fontEmbedCSS, style: { position: "static", transform: "none" } });
    ctx.drawImage(c, at * PR, at * PR);
    c.width = 0; c.height = 0;
  };

  // The corner logo, painted onto a canvas made from the poster (Safari leaves pictures out of
  // the HTML render). `off` shifts it (the video drops the 4px edge).
  const paintLogo = async (ctx: CanvasRenderingContext2D, node: HTMLElement, PR: number, off: number, locs: Map<Element, Loc> | null = null) => {
    const logoEl = node.querySelector<HTMLImageElement>("img[data-logo]");
    if (logoEl) {
      const src = logoEl.getAttribute("src") || "";
      const data = src.startsWith("data:") ? src : await toDataUrl(new URL(src, location.href).href);
      if (data) {
        const im = new Image(); im.src = data;
        try {
          await im.decode();
          const p = centreOf(logoEl, node, locs);
          const cx = p.x + off, cy = p.y + off;
          const sc = Number((logoEl.closest("[data-scale]") as HTMLElement | null)?.dataset.scale || 1);
          const w = logoEl.offsetWidth * sc, h = logoEl.offsetHeight * sc;
          ctx.save();
          ctx.scale(PR, PR);
          ctx.beginPath();
          const R = 28, x0 = EDGE + off, y0 = EDGE + off, x1 = EDGE + W + off, y1 = EDGE + H + off;
          ctx.moveTo(x0 + R, y0); ctx.arcTo(x1, y0, x1, y1, R); ctx.arcTo(x1, y1, x0, y1, R); ctx.arcTo(x0, y1, x0, y0, R); ctx.arcTo(x0, y0, x1, y0, R);
          ctx.clip();
          let alpha = 1;
          for (let e: HTMLElement | null = logoEl; e && e !== node; e = e.parentElement) alpha *= parseFloat(getComputedStyle(e).opacity || "1");
          ctx.globalAlpha = alpha;
          ctx.translate(cx, cy);
          ctx.drawImage(im, -w / 2, -h / 2, w, h);
          ctx.restore();
        } catch (e) {}
      }
    }
  };
  const paintCards = async (ctx: CanvasRenderingContext2D, node: HTMLElement, PR: number, off: number, at: number | null, locs: Map<Element, Loc> | null = null) => {
    const imgs = [...node.querySelectorAll<HTMLImageElement>("img[data-card]")].filter((el) => getComputedStyle(el).visibility !== "hidden");
    // Load every image first, then paint them one at a time (each paint sets its own
    // transform and clip on the shared canvas).
    const loaded = await Promise.all(imgs.map(async (el) => {
      const src = el.dataset.card || "";
      if (imgCache.has(src)) return imgCache.get(src) || null;
      const data = src.startsWith("data:") ? src : await toDataUrl(src);
      let im: HTMLImageElement | null = null;
      if (data) { im = new Image(); im.src = data; try { await im.decode(); } catch (e) { im = null; } }
      imgCache.set(src, im);
      return im;
    }));
    imgs.forEach((el, i) => {
      const p = centreOf(el, node, locs);
      const cx = p.x + off, cy = p.y + off;
      const sc = Number((el.closest("[data-scale]") as HTMLElement | null)?.dataset.scale || 1);
      const w = el.offsetWidth * sc, h = el.offsetHeight * sc;
      const floating = !!el.closest(".wk-float");
      const tilt = floating ? ((at === null ? -4 : -4 + 2 * floatPhase(at)) * Math.PI) / 180 : 0;
      // Fading tiles: the card takes the opacity of the boxes it sits in.
      let alpha = 1;
      for (let e: HTMLElement | null = el; e && e !== node; e = e.parentElement) alpha *= parseFloat(getComputedStyle(e).opacity || "1");
      if (alpha <= 0.001) return;
      ctx.save();
      ctx.globalAlpha = alpha;
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
  };

  // Video: the poster's intro animation, slowed to fill 4s and ending on the finished poster, as an MP4
  // (H.264, 1080 wide, 30fps) made in the browser with WebCodecs. Each animation frame is the
  // poster drawn at that moment of the clock; the hold reuses the last frame.
  const canVideo = typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
  const makeVideo = async () => {
    const node = shotRef.current;
    if (!node || shot === "busy") return;
    setNote("");
    if (!canVideo) { setNote("This browser can't make videos. Try Chrome, or Safari 16.4 or newer."); return; }
    setShot("busy");
    setVideoPct(0);
    let encoder: Any = null;
    try {
      await imgsReady.current;
      const VE = (window as Any).VideoEncoder, VF = (window as Any).VideoFrame;
      // H.264 first (what Instagram / X expect); VP9 in MP4 only where H.264 isn't available.
      let config: Any = null, muxCodec: "avc" | "vp9" = "avc";
      for (const [codec, mc] of [["avc1.640028", "avc"], ["avc1.4d0028", "avc"], ["avc1.42e028", "avc"], ["vp09.00.40.08", "vp9"]] as Array<[string, "avc" | "vp9"]>) {
        const c = { codec, width: W, height: H, bitrate: 8_000_000, framerate: VIDEO_FPS };
        try { const r = await VE.isConfigSupported(c); if (r && r.supported) { config = c; muxCodec = mc; break; } } catch (e) {}
      }
      if (!config) throw new Error("no video encoder");
      const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: muxCodec, width: W, height: H }, fastStart: "in-memory" });
      let failed: Any = null;
      encoder = new VE({ output: (chunk: Any, meta: Any) => muxer.addVideoChunk(chunk, meta), error: (e: Any) => { failed = e; } });
      encoder.configure(config);

      node.classList.add("wk-shot"); // CSS animations off: the clock drives the poster now
      const fontEmbedCSS = (await posterFontCSS(node)) || undefined;
      const out = document.createElement("canvas");
      out.width = W; out.height = H;
      const octx = out.getContext("2d");
      if (!octx) throw new Error("no canvas");
      const opts = { pixelRatio: 1, width: SHOT_W, height: SHOT_H, style: { transform: "none" }, backgroundColor: "#060506", fontEmbedCSS,
        filter: (n: HTMLElement) => !((n instanceof HTMLImageElement && (n.dataset.card || n.dataset.logo)) || (n.dataset && n.dataset.overlay)) };
      // One frame: the poster as it is now (clock at `t`, or null = finished, exactly as the
      // image export draws it), without the 4px edge.
      let locs: Map<Element, Loc> | null = null;
      const drawFrame = async (t: number | null) => {
        const frame = await toCanvas(node, opts);
        octx.fillStyle = "#060506";
        octx.fillRect(0, 0, W, H);
        octx.drawImage(frame, -EDGE, -EDGE);
        frame.width = 0; frame.height = 0; // free it now (browsers cap total canvas memory)
        await paintLogo(octx, node, 1, -EDGE, locs);
        await paintCards(octx, node, 1, -EDGE, t, locs);
        await paintOverlay(octx, node, 1, 0, fontEmbedCSS);
      };
      const step = 1e6 / VIDEO_FPS;
      const animFrames = Math.round((VIDEO_LEN_MS / 1000) * VIDEO_FPS) - 1;
      const total = animFrames + 1; // the last frame: the finished poster
      const encode = async (i: number) => {
        if (failed) throw failed;
        const f = new VF(out, { timestamp: Math.round(i * step), duration: Math.round(step) });
        encoder.encode(f, { keyFrame: i % (VIDEO_FPS * 2) === 0 });
        f.close();
        while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      };
      for (let i = 0; i < (isSafari ? 2 : 1); i++) await toCanvas(node, opts); // warm-up passes, so fonts are ready
      locs = await locatePictures(node, fontEmbedCSS); // in the finished layout, before the clock starts
      for (let i = 0; i < animFrames; i++) {
        const t = ((i * 1000) / VIDEO_FPS) * (VIDEO_ANIM_MS / VIDEO_LEN_MS); // the poster's clock, slowed
        flushSync(() => setVt(t));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await drawFrame(t);
        await encode(i);
        setVideoPct(Math.round((80 * (i + 1)) / animFrames));
      }
      // The held ending is the finished poster, drawn exactly as the image export draws it.
      flushSync(() => setVt(null));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await drawFrame(null);
      for (let i = animFrames; i < total; i++) {
        await encode(i);
        if (i % 30 === 0) setVideoPct(80 + Math.round((20 * (i - animFrames)) / (total - animFrames)));
      }
      await encoder.flush();
      muxer.finalize();
      const blob = new Blob([(muxer.target as ArrayBufferTarget).buffer], { type: "video/mp4" });
      const name = fileName.replace(/\.png$/, ".mp4");
      D.trackEvent("weekly_video", { week: end, mode, fmt });
      if (shareFiles) {
        const file = new File([blob], name, { type: "video/mp4" });
        try { await navigator.share({ files: [file] }); }
        catch (e: Any) {
          if (!(e && e.name === "AbortError")) {
            // Safari only opens the share sheet straight from a tap: keep the video for a second tap.
            readyVideo.current = file;
            setNote("Video ready. Tap the video button again to save it.");
          }
        }
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      setShot("video-ok"); window.setTimeout(() => setShot(""), 1800);
    } catch (e: Any) {
      console.error(e);
      setNote(`Couldn't make the video${e && e.message ? ` (${e.message})` : ""}.`);
      setShot("video-err"); window.setTimeout(() => setShot(""), 1800);
      try { if (encoder && encoder.state !== "closed") encoder.close(); } catch (e2) {}
    } finally {
      setVt(null);
      setVideoPct(null);
      node.classList.remove("wk-shot");
      node.classList.add("wk-still");
    }
  };
  const videoButton = async () => {
    const f = readyVideo.current;
    if (f && shareFiles) {
      readyVideo.current = null;
      setNote("");
      try { await navigator.share({ files: [f] }); } catch (e) {}
      return;
    }
    makeVideo();
  };

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
      const fontEmbedCSS = (await posterFontCSS(node)) || undefined;
      const opts = { pixelRatio: PR, width: SHOT_W, height: SHOT_H, style: { transform: "none" }, backgroundColor: "#060506", fontEmbedCSS,
        filter: (n: HTMLElement) => !((n instanceof HTMLImageElement && (n.dataset.card || n.dataset.logo)) || (n.dataset && n.dataset.overlay)) };
      for (let i = 0; i < (isSafari ? 2 : 1); i++) await toCanvas(node, opts); // warm-up passes, so fonts are ready
      const canvas = await toCanvas(node, opts);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      const locs = await locatePictures(node, fontEmbedCSS);
      await paintLogo(ctx, node, PR, 0, locs);
      await paintCards(ctx, node, PR, 0, null, locs);
      await paintOverlay(ctx, node, PR, EDGE, fontEmbedCSS);
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

  const reelSafe = fmt === "reelsafe";
  const story = fmt === "9:16" || reelSafe || fmt === "cover2", tall = fmt !== "1:1"; // the reel uses the stacked 9:16 layout
  const hero = week.up[0] || null;
  const rowsMax = story ? 10 : 14; // story shows the top 10; otherwise the measured fit decides
  const fitNow = fit && fit.key === `${shotKey}|${vw[0]}|${fontsTick}` ? fit : null;
  const rowsFor = (l: string) => (fitNow && fitNow.rows[l] ? Math.min(rowsMax, fitNow.rows[l]) : rowsMax);
  const padFor = (l: string) => (fitNow && fitNow.pads[l] ? fitNow.pads[l] : tall ? 8 : 10);
  // Both lists number from #1 so places line up; the top climber is #1 in the climbers list too
  // (in the story it's covered by the top climber's box, which reaches down into that slot).
  const climbers = week.up.slice(0, rowsFor("climbers"));
  // The right column is one list on the same row grid as the climbers: comebacks first (if any),
  // then a row-high "Fallers" heading, then the fallers, so every row lines up across.
  const slots = week.comebacks.length ? rowsFor("climbers") : rowsFor("fallers");
  const comebacks = week.comebacks.slice(0, Math.max(0, Math.min(week.comebacks.length, slots - 2)));
  const fallers = week.down.slice(0, comebacks.length ? Math.max(0, slots - comebacks.length - 1) : slots);
  const heroMax = tall ? 170 : 140;
  const heroW = fitNow && fitNow.heroW ? Math.min(heroMax, fitNow.heroW) : heroMax;
  const maxPct = Math.max(1, ...[...climbers, ...fallers].map((m) => Math.abs(m.pct)));
  const idxUp = week.idxPct >= 0;
  const nothing = !week.up.length && !week.down.length && !week.comebacks.length;
  const scale = Math.min(1, (vw[0] - 24) / SHOT_W, Math.max(320, vw[1] - 76) / SHOT_H);
  const big: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 700, lineHeight: 1 };

  // i: position in its list (0 = no divider above); n: the number shown (defaults to i + 1).
  const MoverRow: React.FC<{ m: Any; i: number; n?: number; up: boolean; delay: number; hidden?: boolean; list: string }> = ({ m, i, n, up, delay, hidden, list }) => (
    <div className="wk-in" data-row="1" data-slot={i === 0 && up ? "1" : undefined} style={{ visibility: hidden ? "hidden" : undefined, animationDelay: `${delay}ms`, display: "grid", gridTemplateColumns: "16px 34px minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: `${padFor(list)}px 0`, borderTop: i ? `1px solid ${C.line}` : "none", ...fadeAt(vt, delay) }}>
      <span style={{ ...mono, color: C.faint }}>{n ?? i + 1}</span>
      <Img src={pic(m.card.image)} w={34} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "3.2em", flex: "0 1 auto" }}>{name(m.card)}</span>
          {m.card.number && <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-data)", fontSize: 12, color: C.faint }}>{m.card.number}</span>}
          <Edition e={m.card.edition} />
        </span>
        <span style={{ display: "block", marginTop: 5, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <span className="wk-bar" style={{ display: "block", height: "100%", width: `${(Math.abs(m.pct) / maxPct) * 100}%`, background: up ? C.gain : C.down, boxShadow: `0 0 10px ${up ? C.gainGlow : C.downGlow}`, animationDelay: `${delay + 150}ms`, ...barAt(vt, delay + 150) }} />
        </span>
        <span style={{ display: "block", marginTop: 4, fontFamily: "var(--font-data)", fontSize: 12, color: C.faint }}>{fmtUSD(m.from)} <span style={{ color: up ? C.gain : C.down }}>→</span> {fmtUSD(m.to)}</span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={{ fontFamily: "var(--font-data)", fontWeight: 600, fontSize: 17, color: up ? C.gain : C.down, textShadow: `0 0 12px ${up ? C.gainGlow : C.downGlow}` }}><Num reserve v={m.pct} fmt={fmtPct} delay={delay} /></span>
        <span style={{ marginTop: 3, fontFamily: "var(--font-data)", fontSize: 12, color: C.text }}><Num reserve v={m.to - m.from} fmt={(n) => `${m.to >= m.from ? "+" : "−"}${usd0.format(Math.abs(n))}`} delay={delay} /></span>
      </span>
    </div>
  );
  // A card back on the market after more than ~6 months: shown apart from the climbers/fallers.
  const ComebackRow: React.FC<{ m: Any; i: number; delay: number }> = ({ m, i, delay }) => {
    return (
      <div className="wk-in" data-row="1" style={{ animationDelay: `${delay}ms`, display: "grid", gridTemplateColumns: "16px 34px minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: `${padFor("climbers")}px 0`, borderTop: i ? `1px solid ${C.line}` : "none", ...fadeAt(vt, delay) }}>
        <span style={{ ...mono, color: C.faint }}>{i + 1}</span>
        <Img src={pic(m.card.image)} w={34} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "3.2em", flex: "0 1 auto" }}>{name(m.card)}</span>
            {m.card.number && <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-data)", fontSize: 12, color: C.faint }}>{m.card.number}</span>}
            <Edition e={m.card.edition} />
          </span>
          <span style={{ display: "block", marginTop: 5, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <span className="wk-bar" style={{ display: "block", height: "100%", width: `${Math.min(100, (Math.abs(m.pct) / maxPct) * 100)}%`, background: C.comeback, animationDelay: `${delay + 150}ms`, ...barAt(vt, delay + 150) }} />
          </span>
          <span style={{ display: "block", marginTop: 4, fontFamily: "var(--font-data)", fontSize: 12, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fmtUSD(m.from)} <span style={{ color: C.comeback }}>→</span> {fmtUSD(m.to)}
          </span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontFamily: "var(--font-data)", fontWeight: 600, fontSize: 17, color: C.comeback }}><Num reserve v={m.pct} fmt={fmtPct} delay={delay} /></span>
          <span style={{ marginTop: 3, fontFamily: "var(--font-data)", fontSize: 12, color: C.text, whiteSpace: "nowrap" }}>after {gapLabel(m.gap)}</span>
        </span>
      </div>
    );
  };
  const Highlight: React.FC<{ label: string; img?: string; title: React.ReactNode; sub: string; line: string; delay: number }> = ({ label, img, title, sub, line, delay }) => (
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
  const kicker = <div style={{ ...mono, fontSize: story ? 18 : 14, color: C.up }}>Week {weekNo(end)}{sales ? "" : " · ALT value"}</div>;
  const dates = <div style={{ fontFamily: "var(--font-data)", fontSize: story ? 22 : 16, color: C.muted }}>{fmtDay(start)} – {fmtDay(end, true)}</div>;
  const tk = titleFit && titleFit.key === `${fmt}|${end}|${fontsTick}` ? titleFit.k : 1;
  const logoH = LOGO.h[fmt], logoW = Math.round((logoH * 200) / 211), beside = Math.max(0, logoW + (reelSafe ? 0 : LOGO.inset - 52) + 16); // room kept beside the logo
  // Tucked into the poster's top-right corner (into the padding), in the poster's pink.
  const logo = <img data-logo="1" src={logoSrc} alt="mew.cards" draggable={false} style={{ position: "absolute", top: reelSafe ? 0 : LOGO.inset - 52, right: reelSafe ? 0 : LOGO.inset - 52, height: logoH, width: logoW, opacity: 0.9 }} />;
  const title = story ? (
    <div className="wk-in" style={{ position: "relative", ...fadeAt(vt, 0) }}>
      {logo}
      {kicker}
      <h1 style={{ margin: "12px 0 0", maxWidth: `calc(100% - ${beside}px)`, ...big, fontSize: 104 * tk, letterSpacing: "-0.03em", lineHeight: 1.05, ...gradTitle, whiteSpace: "nowrap", overflow: "hidden" }} ref={titleRef}>JP Mews ・ PSA10</h1>
      <div style={{ marginTop: 18 }}>{dates}</div>
    </div>
  ) : (
    <div className="wk-in" style={{ position: "relative", ...fadeAt(vt, 0) }}>
      {logo}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingRight: beside }}>{kicker}{dates}</div>
      <h1 style={{ margin: "8px 0 0", maxWidth: `calc(100% - ${beside}px)`, ...big, fontSize: 70 * tk, letterSpacing: "-0.02em", lineHeight: 1.05, ...gradTitle, whiteSpace: "nowrap", overflow: "hidden" }} ref={titleRef}>JP Mews ・ PSA10</h1>
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
      <Tile label="Avg sale" delay={260}><Num v={week.avg} fmt={(n) => usd0.format(n)} style={{ display: "block", marginTop: 12, ...big, fontSize: 32 }} /><Delta now={week.avg} prev={prevWeek.avg} money /></Tile>
      <Tile label="Up vs down" delay={320}>
        <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 10, ...big, fontSize: 36 }}>
          <span style={{ color: C.gain }}><Num v={week.up.length} fmt={(n) => String(Math.round(n))} delay={320} /><span style={{ fontSize: 18 }}> ▲</span></span>
          <span style={{ color: C.faint, fontSize: 24 }}>/</span>
          <span style={{ color: C.down }}><Num v={week.down.length} fmt={(n) => String(Math.round(n))} delay={320} /><span style={{ fontSize: 18 }}> ▼</span></span>
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--font-data)", fontSize: 13, color: C.faint, whiteSpace: "nowrap" }}>last week {prevWeek.up.length} ▲ / {prevWeek.down.length} ▼</div>
      </Tile>
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
          <div style={{ ...big, fontSize: 84, color: C.up, textShadow: `0 0 28px ${C.upGlow}` }}><Num reserve v={hero.pct} fmt={fmtPct} delay={260} /></div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", columnGap: 10, fontWeight: 600, fontSize: 24, lineHeight: 1.25, whiteSpace: "nowrap" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(hero.card)}</span>
            {hero.card.number && <span style={{ fontFamily: "var(--font-data)", fontWeight: 400, fontSize: 16, color: C.faint }}>{hero.card.number}</span>}
            <Edition e={hero.card.edition} size={12} />
          </div>
          <div style={{ marginTop: 6, fontFamily: "var(--font-data)", fontSize: 16, color: C.muted }}>{fmtUSD(hero.from)} → <span style={{ color: C.text, fontWeight: 600 }}>{fmtUSD(hero.to)}</span></div>
        </div>
      </div>
    </Tile>
  ) : (
    <Tile label="Top climber" tag="hero" delay={260} style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", background: heroBg }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }}>
        <span className="wk-float" style={{ display: "block", ...floatAt(vt) }}><Img src={pic(hero.card.image)} w={heroW} glow={C.upGlow} /></span>
        <div data-hero-text="1" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: "100%" }}>
          <div style={{ ...big, fontSize: tall ? 60 : 54, color: C.up, textShadow: `0 0 24px ${C.upGlow}` }}><Num reserve v={hero.pct} fmt={fmtPct} delay={260} /></div>
          <div style={{ maxWidth: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4, fontWeight: 600, fontSize: 18, lineHeight: 1.25 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{name(hero.card)}</span>
              {hero.card.number && <span style={{ fontFamily: "var(--font-data)", fontWeight: 400, fontSize: 13, color: C.faint }}>{hero.card.number}</span>}
              <Edition e={hero.card.edition} />
            </div>
            <div style={{ marginTop: 4, fontFamily: "var(--font-data)", fontSize: 13, color: C.muted }}>{fmtUSD(hero.from)} → <span style={{ color: C.text, fontWeight: 600 }}>{fmtUSD(hero.to)}</span></div>
          </div>
        </div>
      </div>
    </Tile>
  ));
  const climbersTile = (
    <Tile label="Climbers" tag="list" list="climbers" delay={320} labelRight={story && !!hero}>
      <div style={{ marginTop: 8 }}>
        {climbers.length ? climbers.map((m, i) => <MoverRow key={m.cert} m={m} i={i} up list="climbers" delay={380 + i * 60} hidden={story && i === 0} />)
          : <div style={{ marginTop: 10, fontSize: 15, color: C.faint }}>Nothing went up.</div>}
      </div>
    </Tile>
  );
  const fallersRows = fallers.length ? fallers.map((m, i) => <MoverRow key={m.cert} m={m} i={i} up={false} list="fallers" delay={(comebacks.length ? 520 : 440) + i * 60} />)
    : <div style={{ marginTop: 10, fontSize: 15, color: C.faint }}>Nothing went down.</div>;
  // Two boxes. The gap between them is sized so the Fallers box's top edge, padding and label
  // take exactly one row of the climbers' grid, so every faller lines up with a climber.
  const rh = fitNow && fitNow.rowH.climbers ? fitNow.rowH.climbers : 0;
  // The boxes keep the usual 16px gap; the Fallers box's top padding absorbs the difference
  // (if a row is too short for that, the gap gives way instead).
  const GAP = 16;
  const fallersTop = rh ? rh - 26 - GAP - (fitNow ? fitNow.labelH : 13) : 18;
  const cbGap = fallersTop >= 6 ? GAP : Math.max(4, GAP + fallersTop - 6);
  const fallersPadTop = Math.max(6, fallersTop);
  const fallersTile = comebacks.length ? (
    <div style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: cbGap }}>
      <Tile label="Comebacks · 6mo+ since last sale" delay={380} style={{ flex: "0 0 auto" }}>
        <div style={{ marginTop: 8 }}>{comebacks.map((m, i) => <ComebackRow key={m.cert} m={m} i={i} delay={440 + i * 60} />)}</div>
      </Tile>
      <Tile label="Fallers" delay={460} style={{ flex: 1, paddingTop: fallersPadTop }}>
        <div style={{ marginTop: 8 }}>
          {fallers.length ? fallers.map((m, i) => <MoverRow key={m.cert} m={m} i={i} up={false} list="climbers" delay={520 + i * 60} />)
            : <div style={{ marginTop: 10, fontSize: 15, color: C.faint }}>Nothing went down.</div>}
        </div>
      </Tile>
    </div>
  ) : (
    <Tile label="Fallers" tag="list" list="fallers" delay={380}>
      <div style={{ marginTop: 8 }}>{fallersRows}</div>
    </Tile>
  );

  const quiet = (
    <Tile label="Quiet week" delay={200} style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ marginTop: 12, fontSize: 20, color: C.muted }}>{sales ? "No price moves from sales this week." : "No ALT value moves this week."}</div>
    </Tile>
  );
  const nHigh = (sales && week.biggest ? 1 : 0) + (sales && week.busiest ? 1 : 0) + (week.bigGain ? 1 : 0);
  const highlights = nHigh > 0 && (
    <div style={{ position: "relative", display: "grid", gap: 16, gridTemplateColumns: `repeat(${nHigh}, minmax(0, 1fr))`, paddingRight: reelSafe ? REEL.buttons : 0 }}>
      {sales && week.biggest && <Highlight label="Biggest sale" delay={500} img={week.biggest.card.image} title={<Num v={week.biggest.value} fmt={fmtUSD} delay={500} />} sub={name(week.biggest.card)} line={[fmtDay(week.biggest.date), week.biggest.house].filter(Boolean).join(" · ")} />}
      {week.bigGain && <Highlight label="Biggest gain" delay={560} img={week.bigGain.card.image} title={<Num v={week.bigGain.to - week.bigGain.from} fmt={(n) => `+${usd0.format(n)}`} delay={560} />} sub={name(week.bigGain.card)} line={`${fmtUSD(week.bigGain.from)} → ${fmtUSD(week.bigGain.to)}`} />}
      {sales && week.busiest && <Highlight label="Most sold" delay={620} img={week.busiest.card.image} title={<Num v={week.busiest.n} fmt={(n) => `${Math.round(n)} sales`} delay={620} />} sub={name(week.busiest.card)} line={`avg ${fmtUSD(week.busiest.sum / week.busiest.n)}`} />}
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
        .wk-float { transform: rotate(-4deg); } /* a still tilt (no float: the poster ends up as a picture) */
        .wk-nav { background: none; border: 1px solid ${C.line}; color: ${C.text}; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
        .wk-nav:disabled { opacity: .25; cursor: default; }
        .wk-nav:not(:disabled):hover { border-color: ${C.up}; color: ${C.up}; }
        .wk-shot .wk-in, .wk-shot .wk-bar, .wk-still .wk-in, .wk-still .wk-bar { animation: none !important; }
        @media (prefers-reduced-motion: reduce) { .wk-in, .wk-bar { animation: none !important; } }
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
            <button key={f} type="button" onClick={() => setFmt(f)} aria-pressed={fmt === f} title={f === "9:16" ? "Instagram story" : f === "3:4" ? "Portrait post" : f === "reel" ? "Reel cover: the 3:4 poster on a 9:16 frame, title below" : f === "reelsafe" ? "Reel: 9:16, kept clear of Instagram's crop and buttons" : f === "cover2" ? "Reel cover 2: the 9:16 poster with a big date banner" : "Square post"} style={pill(fmt === f)}>{label}</button>
          ))}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="wk-nav" onClick={copyShot} disabled={shot === "busy"} aria-label="Copy image to clipboard" title={shot === "copy-err" ? "Couldn't copy" : "Copy image"} style={{ color: iconCol("copy") }}>
            {shot === "copy-ok" ? check : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>}
          </button>
          <button type="button" className="wk-nav" onClick={downloadShot} disabled={shot === "busy"} aria-label={shareFiles ? "Save image" : "Download image"} title={shot === "save-err" ? "Couldn't save" : shareFiles ? "Save image (share sheet → Save Image)" : "Download image"} style={{ color: iconCol("save") }}>
            {shot === "save-ok" ? check : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 20h14" /></svg>}
          </button>
          <button type="button" className="wk-nav" onClick={videoButton} disabled={shot === "busy"} aria-label="Make video" title={shot === "video-err" ? "Couldn't make the video" : "Video of the intro animation (MP4)"}
            style={{ color: shot === "video-ok" ? GREEN : shot === "video-err" ? RED : C.text, width: videoPct !== null ? "auto" : undefined, padding: videoPct !== null ? "0 8px" : 0, gap: 6 }}>
            {shot === "video-ok" ? check : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10.5l5-3v9l-5-3" /></svg>}
            {videoPct !== null && <span style={{ ...mono, fontSize: 10 }}>{videoPct}%</span>}
          </button>
        </span>
      </div>

      {note && <div role="status" style={{ width: SHOT_W * scale, marginTop: -4, marginBottom: 10, fontSize: 13, color: GREEN }}>{note}</div>}

      {/* the poster (inside a 4px edge, which is what gets copied / downloaded) */}
      <div style={{ width: SHOT_W * scale, height: SHOT_H * scale, flex: "0 0 auto" }}>
       <AnimStart.Provider value={animStart}>
       <VT.Provider value={vt}>
       <div ref={shotRef} style={{ width: SHOT_W, height: SHOT_H, padding: EDGE, boxSizing: "border-box", background: "#060506", transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        {/* An explicit line height everywhere: the default ("normal") depends on the font, so a font
            drawn differently in the export would change row heights and card images (painted at
            their on-screen spots) would drift off their rows. */}
        <div key={`${end}-${mode}-${fmt}`} style={{ width: W, height: H, position: "relative", overflow: "hidden", background: C.bg, borderRadius: 28, lineHeight: 1.3 }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(60% ${story ? 30 : 50}% at 90% 0%, rgba(255,126,182,0.24), transparent 70%), radial-gradient(55% ${story ? 28 : 45}% at 0% 100%, rgba(159,120,255,0.18), transparent 70%)` }} />
          {fmt === "reel" && (
            // Reel cover: big text in the space under the poster, to catch the eye in the feed.
            <div className="wk-in" style={{ position: "absolute", left: 52, right: 52, bottom: 52, height: REEL_EXTRA - 52, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", ...fadeAt(vt, 200) }}>
              <div style={{ ...mono, fontSize: 40, letterSpacing: "0.16em", color: C.up, whiteSpace: "nowrap" }}>Weekly market report</div>
              <div style={{ marginTop: 18, ...big, fontSize: 150, letterSpacing: "-0.03em", lineHeight: 1, ...gradTitle, whiteSpace: "nowrap" }}>JP Mews</div>
              <div style={{ marginTop: 18, ...big, fontSize: 92, letterSpacing: "-0.02em", lineHeight: 1, color: C.text, whiteSpace: "nowrap" }}>{fmtMD(start)} – {fmtMD(end)}</div>
            </div>
          )}
          <div style={fmt === "reelsafe"
            ? { position: "absolute", left: REEL.x, top: REEL.y, width: REEL.w, height: REEL.h, display: "flex", flexDirection: "column", gap: 14 }
            : { position: "relative", width: W, height: fmt === "reel" ? 1440 : H, boxSizing: "border-box", padding: 52, display: "flex", flexDirection: "column", gap: 16 }}>
          {title}
          {story ? (
            <>
              <div style={{ position: "relative" }}>{indexTile}</div>
              <div style={{ position: "relative", display: "grid", gap: 16, gridTemplateColumns: sales ? "repeat(4, 1fr)" : "1fr 1fr" }}>{statTiles}</div>
              {nothing ? quiet : (
                <>
                  <div ref={storyRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                    {heroTile}
                    <div ref={moversRef} style={{ position: "relative", flex: 1, minHeight: 0, display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr", gridTemplateRows: "minmax(0, 1fr)" }}>{climbersTile}{fallersTile}</div>
                    {hero && ext && (
                      <>
                        <div className="wk-in" style={{ animationDelay: "300ms", position: "absolute", zIndex: 3, left: ext.imgX, top: ext.imgY, ...fadeAt(vt, 300) }}>
                          <span className="wk-float" style={{ display: "block", ...floatAt(vt) }}><Img src={pic(hero.card.image)} w={ext.imgW} glow={C.upGlow} /></span>
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
          {fmt === "cover2" && (
            // Reel cover 2: the poster dimmed behind a banner that leads with the dates. Exports
            // draw this layer last, on top of the painted card images.
            <div data-overlay="1" style={{ position: "absolute", left: 0, top: 0, width: W, height: H, ...fadeAt(vt, 200) }}>
              <div style={{ position: "absolute", inset: 0, background: "rgba(8,6,8,0.6)" }} />
              {/* a pink sash across the poster, tilted */}
              {/* a frosted sash: 30% white over a blur of the poster (exports draw the blur themselves) */}
              <div style={{ position: "absolute", left: (W - SASH.w) / 2, top: SASH.cy - SASH.h / 2, width: SASH.w, height: SASH.h, transform: `rotate(${SASH.rot}deg)`, transformOrigin: "50% 50%",
                // light pink glass: a pink tint with a soft white sheen toward the top edge
                background: "linear-gradient(170deg, rgba(255,240,247,0.86) 0%, rgba(255,212,232,0.80) 40%, rgba(255,182,216,0.76) 100%)",
                backdropFilter: `blur(${SASH.blur}px)`, WebkitBackdropFilter: `blur(${SASH.blur}px)`,
                borderTop: "2px solid rgba(255,230,242,0.75)", borderBottom: "2px solid rgba(255,180,215,0.55)", boxSizing: "border-box",
                boxShadow: "0 0 60px rgba(255,126,182,0.28)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#4a0f2e", textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}>
                <div style={{ ...mono, fontSize: 40, fontWeight: 700, letterSpacing: "0.2em", color: "#c2306f", whiteSpace: "nowrap" }}>Weekly market report</div>
                <div style={{ marginTop: 20, ...big, fontSize: 150, letterSpacing: "-0.03em", lineHeight: 1, color: "#4a0f2e", whiteSpace: "nowrap" }}>{fmtMD(start)} – {fmtMD(end)}</div>
                <div style={{ marginTop: 20, ...big, fontSize: 72, letterSpacing: "-0.02em", lineHeight: 1, color: "#8a1f52", whiteSpace: "nowrap" }}>JP Mews ・ PSA10</div>
              </div>
            </div>
          )}
        </div>
       </div>
       </VT.Provider>
       </AnimStart.Provider>
      </div>
    </div>
  );
}
