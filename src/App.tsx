import React from "react";
import * as MewData from "./mew-data";

/* ------------------------------------------------------------------ *
 * Mew Catalog — React port of the "Mew Catalog Wall" design handoff.
 * The prototype's DCLogic class maps 1:1 onto a React class component;
 * its computed style objects are already in React inline-style format,
 * so they are reused verbatim. Behaviour (data/auth/filters) lives in
 * ./mew-data.js, a faithful port of the previous src/App.tsx logic.
 * ------------------------------------------------------------------ */

type Any = any;

const SORT_LABELS: Any = { date: "Date", name: "Name", number: "Number", set: "Set", illustrator: "Illustrator", psa10: "PSA 10 pop", bgsBL: "BGS BL pop" };
const SORT_LABELS_JA: Any = { date: "発売日", name: "名前", number: "番号", set: "セット", illustrator: "イラストレーター", psa10: "PSA10 個体数", bgsBL: "BGS BL 個体数" };
const COL_LABELS_JA: Any = { name: "カード", number: "番号", set: "セット", date: "発売", illustrator: "イラストレーター", psa10: "PSA10", bgsBL: "BGS BL" };
const META_JA: Any = { SET: "セット", RELEASE: "発売日", "ILLUS.": "イラストレーター", ERA: "年代", ORIGIN: "地域" };

// Scope / category icons (Mew silhouette, cameo double-card, intl globe).
const MewIcon: React.FC<{ w?: number; h?: number }> = ({ w = 30, h = 27 }) => (
  <svg width={w} height={h} viewBox="0 0 61.744 53.938" fill="currentColor" aria-hidden="true"><path d="M3.373,35.133c2.191-.468,3.589-.513,5.328-.63.656-.044,1.166-.153,1.29-.87.131-.761.149-1.127.565-1.416.402-.28.712-.241,1.99-.241,2.907,0,6.338,1.421,9.475,4.131-.093.057-.219.128-.303.182-2.007,1.287-2.886,2.411-2.663,3.781.207,1.273.761.897,1.79.228.372-.242,1.7-1.031,3.323-1.941.359.433.732.837,1.073,1.31-.136.062-.252.114-.394.179-4.27,1.955-5.557,3.55-5.042,4.219s2.47.771,3.087.463c.547-.272,2.618-1.629,3.909-2.367.675,1.195,2.672,3.629,4.292,5.255,2.513,2.523,7.311,5.897,16.188,5.548,3.581-.141,7.354-.504,10.166-3.815,2.091-2.464,2.778-5.186,2.091-9.156-1.267-7.297-12.595-12.873-21.697-19.128-2.357-3.01-7.524-4.706-11.089-5.92-4.682-1.595-6.82-2.909-7.563-5.865-.453-1.803-.978-2.418-1.177-2.778-.199-.36-.141-1.849-.058-2.83.061-.718.177-1.132-.463-1.08-.82.066-2.16.514-4.63.72-.443.037-.948.132-1.475.26-.772-1.308-1.551-2.466-1.869-2.421-.57.081-1.998,2.029-2.906,4.086-.335.142-.541.235-.541.235-3.242,2.006-2.933,8.18-3.087,9.651-.155,1.471-1.852,2.697,1.852,4.24,3.704,1.543,9.598-1.044,10.823-1.521,1.001-.39,1.189.334,2.118,1.703-.175,1.687-.43,3.094.066,3.906,0,0,.424.647,1.6-.008-.167,1.439-.192,2.859.158,3.688.566,1.338,1.389,1.081,2.058.721.669-.36.36-.72.36-1.286,0-.382-.309-1.144.043-2.241,1.879,1.958,3.713,3.938,3.713,4.556,0,1.02.262,2.965,1.863,4.907-.976.508-2.243,1.102-4.138,1.863-3.167-3.044-7.634-4.946-10.959-4.946-.472,0-1.548.032-2.564.159-1.616.202-2.916.647-4.43,1.325-1.005.451-2.679,1.635-3.219,2.1-.817.704-.244,1.32,1.046,1.044ZM28.149,41.549c1.202-.632,2.275-.944,3.696-1.395,2.196-.697,4.373-1.132,2.778-3.138-1.595-2.007.669-3.756,2.212-5.814,1.544-2.058,2.47-1.955,2.264-7.1-.009-.214-.048-.417-.081-.622,7.439,5.354,17.808,10.375,18.963,16.919h.002c.569,3.225.124,5.409-1.813,8.017-1.708,2.301-6.485,3.262-9.622,3.246-5.79-.031-9.875-1.538-12.849-3.799-2.835-2.155-4.864-5.089-5.55-6.314ZM25.461,37.635c1.363-.743,2.806-1.495,4.021-2.052.888.734,1.64,1.247,1.536,1.377-.175.218-1.444.743-4.435,2.091-.372-.572-.749-1.026-1.121-1.416Z"></path><polygon points="2.328 34.088 2.328 34.088 2.327 34.089 2.328 34.088"></polygon></svg>
);
const CameoIcon: React.FC<{ w?: number; h?: number }> = ({ w = 20, h = 20 }) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="2.4" y="2.6" width="12" height="16" rx="1.8" ry="1.8" fill="none" stroke="currentColor" strokeWidth="1.6"></rect><rect x="9.6" y="5.4" width="12" height="16" rx="1.8" ry="1.8" fillOpacity=".18" stroke="currentColor" strokeWidth="1.6"></rect><g><path d="M10.696,12.974c-.275.133-.602.312-.911.489.084.093.17.201.254.337.677-.321.965-.446,1.005-.498.024-.031-.147-.153-.348-.328Z" fill="none"></path><path d="M12.875,10.237c.047,1.226-.163,1.202-.513,1.692-.35.491-.862.907-.501,1.386.361.478-.132.582-.629.748-.322.107-.565.182-.837.333.155.292.615.991,1.257,1.505.644.515,1.528.857,2.749.893v-5.618c-.527-.363-1.062-.722-1.544-1.087.007.049.016.097.018.148Z" fill="none"></path><path d="M10.078,8.055c-1.06-.38-1.545-.693-1.713-1.398-.103-.43-.222-.576-.267-.662-.045-.086-.032-.441-.013-.674.014-.171.04-.27-.105-.257-.186.016-.489.122-1.049.172-.1.009-.215.031-.334.062-.175-.312-.351-.588-.423-.577-.129.019-.453.484-.658.974-.076.034-.123.056-.123.056-.734.478-.664,1.95-.699,2.3-.035.351-.419.643.419,1.011.839.368,2.174-.249,2.451-.362.227-.093.269.08.48.406-.04.402-.097.737.015.931,0,0,.096.154.362-.002-.038.343-.044.681.036.879.128.319.315.258.466.172.152-.086.082-.172.082-.307,0-.091-.07-.273.01-.534.426.467.841.939.841,1.086,0,.243.059.707.422,1.17-.221.121-.508.263-.937.444-.717-.726-1.729-1.179-2.482-1.179-.107,0-.351.008-.581.038-.366.048-.66.154-1.003.316-.228.107-.607.39-.729.5-.185.168-.055.315.237.249.496-.112.813-.122,1.207-.15.149-.01.264-.036.292-.207.03-.181.034-.269.128-.337.091-.067.161-.057.451-.057.658,0,1.436.339,2.146.985-.021.014-.05.031-.069.043-.455.307-.654.575-.603.901.047.303.172.214.405.054.084-.058.385-.246.753-.463.081.103.166.2.243.312-.031.015-.057.027-.089.043-.967.466-1.259.846-1.142,1.006s.559.184.699.11c.124-.065.593-.388.885-.564.153.285.605.865.972,1.253.533.563,1.531,1.295,3.307,1.318.018-.102.031-.206.031-.313v-.006c-1.221-.036-2.105-.378-2.749-.893-.642-.514-1.102-1.213-1.257-1.505.272-.151.515-.225.837-.333.497-.166.99-.27.629-.748-.361-.478.151-.895.501-1.386.35-.491.559-.466.513-1.692-.002-.051-.011-.099-.018-.148.482.365,1.017.725,1.544,1.087v-.467c-.603-.41-1.225-.82-1.81-1.243-.534-.717-1.704-1.122-2.512-1.411ZM10.04,13.8c-.084-.136-.17-.245-.254-.337.309-.177.636-.356.911-.489.201.175.371.297.348.328-.04.052-.327.177-1.005.498Z"></path></g></svg>
);
const IntlIcon: React.FC<{ w?: number; h?: number }> = ({ w = 16, h = 16 }) => (
  <svg width={w} height={h} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6.2"></circle><path d="M1.8 8h12.4M8 1.8c3 3.4 3 8.9 0 12.4M8 1.8c-3 3.4-3 8.9 0 12.4"></path></svg>
);

/** Small typographic chip (design system Chip component). */
const Chip: React.FC<{ tone?: string; size?: string; children?: React.ReactNode }> = ({ children, tone = "neutral", size = "md" }) => {
  const tones: Any = {
    neutral: { background: "transparent", color: "var(--text-muted)", borderColor: "var(--line-hairline)" },
    accent: { background: "var(--surface-tint)", color: "var(--text-accent)", borderColor: "var(--line-accent)" },
    solid: { background: "var(--pink-500)", color: "var(--ink)", borderColor: "var(--pink-500)" },
    inverse: { background: "var(--surface-inverse)", color: "var(--text-on-inverse)", borderColor: "var(--surface-inverse)" },
  };
  const t = tones[tone] ?? tones.neutral;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-data)", fontWeight: 500, fontSize: size === "sm" ? "var(--web-label)" : "var(--web-small)", letterSpacing: "0.04em", padding: size === "sm" ? "2px 7px" : "4px 10px", border: `1px solid ${t.borderColor}`, borderRadius: "var(--web-radius-pill)", background: t.background, color: t.color, whiteSpace: "nowrap" }}>{children}</span>
  );
};

/** Button/element that merges a hover style on pointer hover (replaces the prototype's style-hover). */
class HoverEl extends React.Component<Any, Any> {
  state = { h: false };
  render() {
    const { as, style, hoverStyle, children, ...rest } = this.props;
    const El: Any = as || "button";
    return (
      <El {...rest} style={{ ...style, ...(this.state.h && hoverStyle ? hoverStyle : null) }}
        onMouseEnter={() => this.setState({ h: true })}
        onMouseLeave={() => this.setState({ h: false })}>{children}</El>
    );
  }
}
const HOVER_PINK = { color: "var(--pink-700)" };
const HOVER_ROW = { background: "var(--surface-hover)" };
const HOVER_ACCENT = { color: "var(--text-accent)" };

class MewCatalog extends React.Component<Any, Any> {
  _rootEl: Any; _asideEl: Any; _wallEl: Any; _eraEl: Any; _sortEl: Any;
  _searchPanelEl: Any; _searchInputEl: Any;
  _ro: Any; _barRo: Any; _mq: Any; _theme: Any; _themePinned = false;
  _resize: Any; _key: Any; _hash: Any; _away: Any; _pageScroll: Any;
  _wallProg: Any; _wallWheel: Any; _wallMove: Any; _wallOut: Any;
  _wallTouchStart: Any; _wallTouchMove: Any; _swirlDelay: Any; _wallRefFn: Any; _touch: Any;

  state: Any = {
    D: null, cards: [], status: "loading", progress: 0, imagesLoaded: false,
    authChecked: false, needPassword: false, unlocked: false, passwordInput: "", authing: false,
    q: "", searchOpen: false, mew: true, cameo: false, intl: false, listView: false, sortDesc: false, sortKey: "date", sortDir: null, sortMenuOpen: false,
    lang: (typeof navigator !== "undefined" && /^ja\b/i.test(navigator.language || "")) ? "JP" : "EN",
    theme: (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light",
    desaturate: false,
    view: "browse", ownerMode: false, selectedId: null, flipped: false,
    tab: "all", catMew: true, catCameo: true, catIntl: true, listId: null, gridMode: false, narrow: false, compact: true, rootH: 0, rootW: 0, barH: 0, wallAvail: 0, wallProgress: 0, pageProgress: 0, eras: [], eraMenuOpen: false, filtersOpen: false, mobileFilters: false,
  };

  componentWillUnmount() {
    if (this._ro) this._ro.disconnect();
    document.removeEventListener("pointerdown", this._away);
    window.removeEventListener("hashchange", this._hash);
    window.removeEventListener("scroll", this._pageScroll);
    if (this._mq && this._mq.removeEventListener && this._theme) this._mq.removeEventListener("change", this._theme);
    window.removeEventListener("resize", this._resize);
    document.removeEventListener("keydown", this._key);
  }

  async componentDidMount() {
    document.title = "Mew Catalog";
    this._resize = () => {
      const el = this._rootEl;
      const w = el ? el.getBoundingClientRect().width : window.innerWidth;
      const narrow = w > 0 && w <= 760;
      const rootW = Math.round(w || 0);
      if (rootW !== this.state.rootW) this.setState({ rootW });
      const vh = (typeof window !== "undefined" && window.innerHeight) || 900;
      const hh = el ? el.getBoundingClientRect().height : vh;
      const rootH = Math.round(Math.min(hh > 0 ? hh : vh, vh));
      const bar = this._asideEl || (el && el.querySelector("aside"));
      if (bar) {
        const bh = narrow ? Math.round(bar.getBoundingClientRect().height) : 0;
        if (Math.abs(bh - (this.state.barH || 0)) > 1) this.setState({ barH: bh });
      }
      const wEl = this._wallEl;
      if (wEl) {
        const top = wEl.getBoundingClientRect().top;
        const avail = Math.round(vh - top - (this.state.narrow ? (this.state.barH || 52) : 0));
        if (avail > 200 && Math.abs(avail - (this.state.wallAvail || 0)) > 2) this.setState({ wallAvail: avail });
      }
      if (narrow !== this.state.narrow || Math.abs(rootH - (this.state.rootH || 0)) > 4) this.setState({ narrow, rootH });
    };
    this._resize();
    if ((window as Any).ResizeObserver) {
      this._barRo = new ResizeObserver(this._resize);
      if (this._asideEl) this._barRo.observe(this._asideEl);
      this._ro = new ResizeObserver(this._resize);
      if (this._rootEl) this._ro.observe(this._rootEl);
    }
    window.addEventListener("resize", this._resize);
    this._key = (e: Any) => {
      if (e.key !== "Escape") return;
      if (this.state.eraMenuOpen) this.setState({ eraMenuOpen: false });
      else this.setState({ selectedId: null, flipped: false });
    };
    this._hash = () => {
      const owner = (location.hash || "").replace("#", "").toLowerCase() === "mew" || this.props.ownerMode === true;
      if (owner !== this.state.ownerMode) this.setState({ ownerMode: owner, view: owner ? this.state.view : "browse" });
    };
    this._pageScroll = () => {
      const de = document.documentElement;
      const max = de.scrollHeight - de.clientHeight;
      const p = max > 4 ? Math.min(1, Math.max(0, (window.scrollY || de.scrollTop || 0) / max)) : 0;
      if (Math.abs(p - (this.state.pageProgress || 0)) > 0.002) this.setState({ pageProgress: p });
    };
    window.addEventListener("scroll", this._pageScroll, { passive: true });
    this._pageScroll();
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq) {
      this._theme = (e: Any) => { if (!this._themePinned) this.setState({ theme: e.matches ? "dark" : "light" }); };
      if (mq.addEventListener) mq.addEventListener("change", this._theme);
      this._mq = mq;
    }
    window.addEventListener("hashchange", this._hash);
    this._hash();
    document.addEventListener("keydown", this._key);
    this._away = (e: Any) => {
      if (this.state.eraMenuOpen && !(this._eraEl && this._eraEl.contains(e.target))) this.setState({ eraMenuOpen: false });
      if (this.state.sortMenuOpen && !(this._sortEl && this._sortEl.contains(e.target))) this.setState({ sortMenuOpen: false });
      if (this.state.searchOpen && !this.state.q && !(this._searchPanelEl && this._searchPanelEl.contains(e.target))) this.setState({ searchOpen: false });
    };
    document.addEventListener("pointerdown", this._away);

    const D = MewData;
    this.setState({ D });
    let cached: Any = null;
    try { cached = localStorage.getItem(D.CONFIG_CACHE_KEY); } catch (e) {}
    if (cached === "private") this.setState({ needPassword: true, authChecked: true });
    else if (cached === "public") this.setState({ unlocked: true, authChecked: true });
    let needPassword = cached === "private";
    try {
      const cfg = await D.fetchConfig();
      needPassword = !!cfg.passwordEnabled;
      try { localStorage.setItem(D.CONFIG_CACHE_KEY, needPassword ? "private" : "public"); } catch (e) {}
      this.setState({ needPassword, authChecked: true, unlocked: needPassword ? false : true });
    } catch (e) {
      console.error("Failed to fetch config:", e);
      this.setState({ authChecked: true, unlocked: cached !== "private" });
    }
    if (!needPassword) this.load("");
  }

  async load(password: Any) {
    const D = this.state.D;
    try {
      const cards = await D.fetchAllSheets(password);
      this.setState({ cards, status: cards.length ? "loaded" : "fallback", unlocked: true, authing: false });
      this.preload(cards);
    } catch (e: Any) {
      if (e && e.message === "auth") this.setState({ passwordInput: "", authing: false, cards: [] });
      else { console.error(e); this.setState({ status: "fallback", authing: false, imagesLoaded: true }); }
    }
  }

  preload(cards: Any) {
    const urls = cards.map((c: Any) => c.image).filter(Boolean);
    cards.forEach((c: Any) => { if (c.imageBack) { const i = new Image(); i.src = c.imageBack; } });
    if (!urls.length) { this.setState({ imagesLoaded: true, progress: 100 }); return; }
    let done = 0;
    this.setState({ progress: 0, imagesLoaded: false });
    urls.forEach((u: Any) => {
      const img = new Image();
      const fin = (failed: Any) => {
        if (failed) this.setState((st: Any) => ({ cards: st.cards.map((c: Any) => (c.image === u ? { ...c, image: "" } : c)) }));
        done++;
        this.setState({ progress: Math.round((done / urls.length) * 100) });
        if (done === urls.length) setTimeout(() => this.setState({ imagesLoaded: true }), 350);
      };
      img.onload = () => fin(false); img.onerror = () => fin(true); img.src = u;
    });
  }

  name(c: Any) { const s = this.state; return s.lang === "JP" ? (c.nameJP || c.nameEN) : (c.nameEN || c.nameJP); }
  alt(c: Any) { const s = this.state; return s.lang === "JP" ? (c.nameEN || "") : (c.nameJP || ""); }

  pill(on: Any): Any {
    const n = this.state.narrow;
    return {
      cursor: "pointer", padding: n ? "0 7px" : "3px 9px", minHeight: n ? 26 : 0,
      display: "inline-flex", alignItems: "center", borderRadius: "var(--web-radius-sm)",
      fontFamily: "var(--font-body)", fontSize: n ? "var(--web-label)" : "var(--web-small)",
      whiteSpace: "nowrap",
      transition: "background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)",
      background: on ? "var(--pink-700)" : "transparent",
      color: on ? "var(--text-title)" : "var(--text-body)",
      border: `1px solid ${on ? "var(--pink-700)" : "var(--line-hairline)"}`,
      fontWeight: on ? 700 : 500,
    };
  }

  viewIconStyle(on: Any): Any {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: this.state.narrow ? 44 : 24, height: this.state.narrow ? 44 : 24,
      padding: 0, cursor: "pointer", background: "transparent", border: "none",
      color: on ? "var(--pink-700)" : "var(--text-faint)",
      transition: "color var(--dur-fast) var(--ease)",
    };
  }

  anchorOf(el: Any): Any {
    if (!el) return null;
    const wrap = el.parentElement;
    if (!wrap) return null;
    const r = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const rail = el.closest ? el.closest("aside") : null;
    const railRight = rail ? rail.getBoundingClientRect().right : r.right;
    return { left: Math.round(Math.max(railRight, r.right) - wr.left + 8), top: Math.round(r.top - wr.top) };
  }

  railMenu(anchor: Any): Any {
    const w = 236, mh = 320;
    return {
      position: "absolute",
      top: anchor ? anchor.top : 0,
      left: anchor ? anchor.left : 80,
      right: "auto", marginTop: 0, width: w, minWidth: w, maxHeight: mh, overflowY: "auto",
    };
  }

  railCell(): Any {
    const s = this.state;
    if (!s.compact) return null;
    if (s.narrow) return {
      width: 44, height: 44, minHeight: 44, flex: "0 0 44px",
      margin: 0, padding: 0, borderRadius: 0,
      border: "none", borderTop: "none", borderBottom: "none", borderLeft: "none", borderRight: "none",
      background: "transparent", justifyContent: "center", gap: 0,
    };
    return {
      width: "calc(100% + 32px)", marginLeft: -16, marginRight: -16,
      height: 44, minHeight: 44, borderRadius: 0, padding: 0,
      borderTop: "none", borderLeft: "none", borderRight: "none",
      borderBottom: "1px solid var(--line-hairline)",
      justifyContent: "center", gap: 4,
    };
  }

  catIcon(on: Any): Any {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 32, height: 32,
      padding: 0, cursor: "pointer", background: "transparent", border: "none",
      color: on ? "var(--pink-700)" : "var(--text-muted)",
      transition: "color var(--dur-fast) var(--ease)",
    };
  }

  scopeIcon(on: Any): Any {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 40, height: 34, padding: 0, cursor: "pointer",
      border: "none",
      color: on ? "var(--pink-700)" : "var(--text-muted)",
      background: on ? "var(--surface-tint)" : "transparent",
      transition: "color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)",
      ...this.railCell(),
    };
  }

  menuRowStyle(on: Any): Any {
    return {
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
      cursor: "pointer", minHeight: this.state.narrow ? 44 : 32, padding: "0 8px",
      background: on ? "var(--surface-tint)" : "transparent", border: "none",
      borderRadius: "var(--web-radius-sm)",
      fontFamily: "var(--font-body)", fontSize: "var(--web-small)",
      fontWeight: on ? 600 : 400,
      color: on ? "var(--text-accent)" : "var(--text-body)",
    };
  }

  checkboxStyle(on: Any): Any {
    return {
      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      width: 15, height: 15, borderRadius: 2, fontSize: 10, lineHeight: 1,
      background: on ? "var(--pink-700)" : "transparent",
      border: `1px solid ${on ? "var(--pink-700)" : "var(--line-strong)"}`,
      color: "#fff",
    };
  }

  collectionVals(): Any {
    const s = this.state, D = s.D;
    if (!D) return { isCollection: false, collTabs: [], collRows: [], collList: true, collGrid: false,
      collSummary: "", collCountLabel: "", gridModeLabel: "Grid view", toggleGridMode: () => {} };
    const cja = s.lang === "JP";
    const st = D.ownedStatsOf(s.cards);
    const pool = s.tab === "psa10" ? st.psa10Cards : s.tab === "psa19" ? st.psa19Cards : s.tab === "need" ? st.needCards : st.allCards;
    const cards = pool.filter((c: Any) => (s.catMew && c.isMew) || (s.catCameo && c.isCameo) || (s.catIntl && c.isIntl));
    const sorted = [...cards].sort((a: Any, b: Any) => {
      if (s.tab === "all") return D.releaseTs(a) - D.releaseTs(b);
      if ((a.year || 0) !== (b.year || 0)) return (a.year || 0) - (b.year || 0);
      const nc = (a.number || "").localeCompare(b.number || "", undefined, { numeric: true, sensitivity: "base" });
      if (nc !== 0) return nc;
      return this.name(a).localeCompare(this.name(b), undefined, { sensitivity: "base" });
    });
    const mk = (label: Any, on: Any, onClick: Any) => ({ label, onClick, style: this.pill(on) });
    const gradeColor = (c: Any) => c.pc === "PSA10" ? "var(--text-accent)" : c.pc && c.pc !== "N/A" ? "var(--text-body)" : "var(--text-faint)";
    return {
      isCollection: s.view === "collection",
      psa10Count: st.psa10, totalCount: st.total,
      psa10BarStyle: { height: "100%", background: "var(--pink-700)", transition: "width var(--dur) var(--ease)", width: `${st.total ? Math.round((st.psa10 / st.total) * 100) : 0}%` },
      collSummary: cja
        ? `${st.total} 枚収録 · PSA10 ${st.psa10} 枚 · 未所持 ${st.needCards.length} 枚`
        : `${st.total} catalogued · ${st.psa10} at PSA 10 · ${st.needCards.length} still needed`,
      collTabs: [
        mk(cja ? "すべて" : "All", s.tab === "all", () => this.setState({ tab: "all" })),
        mk(cja ? "未所持" : "Need", s.tab === "need", () => this.setState({ tab: "need" })),
        mk("PSA 1–9", s.tab === "psa19", () => this.setState({ tab: "psa19" })),
        mk("PSA 10", s.tab === "psa10", () => this.setState({ tab: "psa10" })),
      ],
      toggleCatMew: () => this.setState({ catMew: !s.catMew }),
      toggleCatCameo: () => this.setState({ catCameo: !s.catCameo }),
      toggleCatIntl: () => this.setState({ catIntl: !s.catIntl }),
      catMewStyle: this.catIcon(s.catMew),
      catCameoStyle: this.catIcon(s.catCameo),
      catIntlStyle: this.catIcon(s.catIntl),
      collCountLabel: cja ? `${sorted.length} 枚` : `${sorted.length} ${sorted.length === 1 ? "card" : "cards"}`,
      gridModeLabel: cja ? (s.gridMode ? "リスト表示" : "グリッド表示") : (s.gridMode ? "List view" : "Grid view"),
      toggleGridMode: () => { D.trackEvent("stats_view_toggle", { view: s.gridMode ? "list" : "grid" }); this.setState({ gridMode: !s.gridMode }); },
      collList: !s.gridMode, collGrid: s.gridMode,
      collRows: sorted.map((c: Any) => ({
        id: c.id, name: this.name(c), set: c.set,
        year: c.year ? String(c.year) : "—",
        number: c.number && c.number !== "N/A" ? c.number : "—",
        grade: c.pc && c.pc !== "N/A" ? c.pc.replace("PSA", "PSA ") : "",
        gradeLine: c.pc && c.pc !== "N/A" ? c.pc.replace("PSA", "PSA ") : "Needed",
        image: c.image, hasImage: !!c.image, noImage: !c.image,
        gradeStyle: { fontFamily: "var(--font-data)", fontSize: "var(--web-small)", fontWeight: 600, color: gradeColor(c) },
        gradeLineStyle: { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.06em", color: gradeColor(c) },
        imgStyle: { position: "absolute", inset: 0, display: "block", backgroundImage: c.image ? `url("${c.image}")` : "none", backgroundSize: "100% 100%", backgroundPosition: "center", transition: "filter var(--dur) var(--ease), opacity var(--dur) var(--ease)", filter: (s.desaturate && c.pc !== "PSA10") ? "grayscale(1)" : "none", opacity: (s.desaturate && c.pc === "N/A") ? 0.3 : 1 },
        onClick: () => this.setState({ selectedId: c.id, flipped: false }),
      })),
    };
  }

  detailVals(): Any {
    const s = this.state, D = s.D;
    const c = s.selectedId ? s.cards.find((x: Any) => x.id === s.selectedId) : null;
    const base: Any = {
      hasSelection: !!c, closeDetail: () => this.setState({ selectedId: null, flipped: false }),
      stop: (e: Any) => e.stopPropagation(),
      overlayStyle: {
        position: "fixed", left: 0, right: 0, top: 0, bottom: s.narrow ? (s.barH || 53) : 0,
        boxSizing: "border-box",
        zIndex: s.narrow ? 140 : 120, display: "flex", justifyContent: "center",
        background: "rgba(20,19,23,.52)",
        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        alignItems: s.narrow ? "stretch" : "center",
        padding: s.narrow ? 0 : 32,
      },
      isNarrowDetail: !!s.narrow,
      detailPanelStyle: s.narrow
        ? { position: "relative", width: "100%", maxWidth: "none", height: "100%", maxHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
            background: "var(--surface-card)", border: "none", borderRadius: 0, boxShadow: "none",
            animation: "mewFadeUp 200ms var(--ease) both" }
        : { position: "relative", width: "100%", maxWidth: 1060, maxHeight: "100%", overflowY: "auto",
            background: "var(--surface-card)", border: "1px solid var(--line-hairline)",
            borderRadius: "var(--web-radius)", boxShadow: "var(--shadow-raised)",
            animation: "mewFadeUp 200ms var(--ease) both" },
      detailCloseStyle: {
        position: "fixed", top: 8, right: 8, zIndex: 160,
        width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
        border: "none", background: "transparent", cursor: "pointer",
        color: "var(--pink-700)", fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1,
      },
      detailGridStyle: {
        display: "grid", gap: s.narrow ? 16 : 36, alignItems: "start",
        padding: s.narrow ? "28px 16px 24px" : 32,
        gridTemplateColumns: s.narrow ? "minmax(0,1fr)" : "minmax(0,360px) minmax(0,1fr)",
      },
      detailImageWrapStyle: s.narrow
        ? { minWidth: 0, width: "calc(100% - 72px)", maxWidth: "min(100% - 72px, 46vh)", margin: "0 auto" }
        : { minWidth: 0 },
      detailBodyStyle: { display: "flex", flexDirection: "column", gap: s.narrow ? 16 : 22, minWidth: 0 },
    };
    if (!c || !D) {
      return { ...base, detailChips: [], detailMeta: [], popRows: [], hasBack: false, hasNotes: false, hasPop: false,
        detailImage: "", detailBack: "", detailName: "", detailAlt: "", detailNumber: "", detailNotes: "",
        flipInnerStyle: {}, flipWrapStyle: {}, flipCard: () => {}, hasImage: false, detailTitleStyle: {}, noImage: false, detailFrontStyle: {}, detailBackStyle: {} };
    }
    const date = D.formatDate(c.release) || (c.year ? String(c.year) : "");
    const notes = s.lang === "JP" ? (c.notesJP || c.notesEN) : (c.notesEN || c.notesJP);
    const origin = s.lang === "JP" ? (c.originJP || c.originEN) : (c.originEN || c.originJP);
    const chips: Any[] = [];
    if (c.era) chips.push({ label: c.era, tone: "neutral" });
    if (c.rarity) chips.push({ label: c.rarity, tone: "neutral" });
    if (c.edition) chips.push({ label: c.edition, tone: "accent" });
    if (c.set && c.set.includes("Promo")) chips.push({ label: "Promo", tone: "accent" });
    if (c.isCameo) chips.push({ label: "Cameo", tone: "neutral" });
    if (c.isIntl) chips.push({ label: "Intl", tone: "neutral" });
    if (s.ownerMode) {
      if (c.pc === "PSA10") chips.push({ label: "PSA 10 · in collection", tone: "solid" });
      else if (c.pc && c.pc !== "N/A") chips.push({ label: `${c.pc} · in collection`, tone: "accent" });
    }
    const metaJa = s.lang === "JP";
    const theme = s.theme || this.props.startTheme || "light";
    const meta = [["SET", c.set], ["RELEASE", date], ["ILLUS.", c.illustrator], ["ERA", c.era], ["ORIGIN", origin]]
      .filter((p) => p[1]).map((p) => ({ k: metaJa ? (META_JA[p[0] as Any] || p[0]) : p[0], v: p[1] }));
    const p = c.population;
    return {
      ...base,
      detailImage: c.image, detailBack: c.imageBack || "", hasBack: !!c.imageBack,
      hasImage: !!c.image, noImage: !c.image,
      detailFrontStyle: { position: "absolute", inset: 0, display: "block", backgroundSize: "100% 100%", backgroundPosition: "center", backfaceVisibility: "hidden", borderRadius: "4.72% / 3.37%", boxShadow: "var(--shadow-lift)", backgroundImage: c.image ? `url("${c.image}")` : "none" },
      detailBackStyle: { position: "absolute", inset: 0, display: "block", backgroundSize: "100% 100%", backgroundPosition: "center", backfaceVisibility: "hidden", borderRadius: "4.72% / 3.37%", boxShadow: "var(--shadow-lift)", backgroundImage: c.imageBack ? `url("${c.imageBack}")` : "none", transform: "rotateY(180deg)" },
      detailName: this.name(c), detailAlt: this.alt(c),
      detailNumber: c.number && c.number !== "N/A" ? c.number : "",
      detailChips: chips, detailMeta: meta,
      hasNotes: !!notes, detailNotes: notes || "",
      hasPop: !!p,
      popGridStyle: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "14px 24px", paddingTop: 12 },
      popRows: p ? [["PSA 8", p.psa8], ["PSA 9", p.psa9], ["PSA 10", p.psa10, "accent"], ["BGS BL", p.bgsBL, "ink"]].map(([grade, pop, emph]: Any) => {
        const ink = emph === "ink" ? (theme === "dark" ? "#FFFFFF" : "#000000") : null;
        return {
          grade, pop: typeof pop === "number" ? String(pop) : "—",
          rowStyle: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
          gradeStyle: {
            fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.1em",
            color: emph === "accent" ? "var(--text-accent)" : (ink || "var(--text-muted)"),
            fontWeight: emph ? 700 : 400,
          },
          popStyle: {
            fontFamily: "var(--font-body)", fontSize: "var(--web-body)", lineHeight: 1.2,
            fontWeight: 400,
            color: typeof pop !== "number" ? "var(--text-faint)" : (ink || "var(--text-title)"),
          },
        };
      }) : [],
      flipInnerStyle: {
        position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
        transition: "transform 700ms var(--ease)",
        transform: s.flipped ? "rotateY(180deg)" : "rotateY(0deg)",
      },
      flipWrapStyle: {
        borderRadius: "4.72% / 3.37%", overflow: "visible", border: "none",
        position: "relative", containerType: "inline-size",
        cursor: c.imageBack ? "pointer" : "default",
      },
      flipCard: () => { if (c.imageBack) this.setState({ flipped: !s.flipped }); },
      detailTitleStyle: {
        margin: "10px 0 0", fontFamily: "var(--font-body)", fontWeight: 700,
        fontSize: s.narrow ? "var(--web-h2)" : "var(--web-h1)",
        lineHeight: "var(--web-leading-tight)", color: "var(--text-title)", paddingRight: s.narrow ? 44 : 0,
      },
    };
  }

  renderVals(): Any {
    const s = this.state, D = s.D;
    const theme = s.theme || this.props.startTheme || "light";

    const sortDesc = s.sortDesc === null ? this.props.defaultSort === "newest" : s.sortDesc;
    const t = (k: Any) => () => this.setState({ [k]: !s[k] });
    const gated = !D || !s.authChecked || (s.needPassword && !s.unlocked) || (s.unlocked && !s.imagesLoaded);
    const ja = s.lang === "JP";
    const sortKey = s.sortKey || "date";
    const sortDir = s.sortDir === null ? (sortKey === "date" ? (sortDesc ? "desc" : "asc") : "desc") : s.sortDir;
    let filtered = D ? D.applyFilters(s.cards, { q: s.q, mew: s.mew, cameo: s.cameo, intl: s.intl, sortBy: "releaseAsc" }) : [];
    if (sortKey !== "date") {
      const num = (c: Any, k: Any) => { const v = c.population && c.population[k]; return typeof v === "number" && !Number.isNaN(v) ? v : -1; };
      const txt = (v: Any) => (v == null || v === "" ? "￿" : String(v));
      const cmp = sortKey === "illustrator" ? (a: Any, b: Any) => txt(a.illustrator).localeCompare(txt(b.illustrator))
        : sortKey === "name" ? (a: Any, b: Any) => txt(this.name(a)).localeCompare(txt(this.name(b)), "ja")
        : sortKey === "number" ? (a: Any, b: Any) => txt(a.number).localeCompare(txt(b.number), undefined, { numeric: true })
        : sortKey === "set" ? (a: Any, b: Any) => txt(a.set).localeCompare(txt(b.set))
        : sortKey === "psa10" ? (a: Any, b: Any) => num(a, "psa10") - num(b, "psa10")
        : (a: Any, b: Any) => num(a, "bgsBL") - num(b, "bgsBL");
      filtered = filtered.slice().sort(cmp);
    }
    if (sortDir === "desc") filtered = filtered.slice().reverse();
    const eraFirst = new Map();
    for (const c of s.cards) {
      if (!c.set) continue;
      const ts = D ? D.releaseTs(c) : 0;
      if (!eraFirst.has(c.set) || ts < eraFirst.get(c.set)) eraFirst.set(c.set, ts);
    }
    const eraNames = [...eraFirst.keys()].sort((a, b) => eraFirst.get(a) - eraFirst.get(b));
    const eraCounts = new Map();
    for (const c of filtered) if (c.set) eraCounts.set(c.set, (eraCounts.get(c.set) || 0) + 1);
    const picked = s.eras || [];
    if (picked.length) filtered = filtered.filter((c: Any) => picked.includes(c.set));
    const toggleEra = (name: Any) => () => {
      const next = picked.includes(name) ? picked.filter((x: Any) => x !== name) : [...picked, name];
      if (D) D.trackEvent("filter_toggle", { filter: "set", value: name, active: !picked.includes(name) });
      this.setState({ eras: next });
    };
    const narrow = s.narrow;
    const wallGap = 18, wallLift = narrow ? 20 : 34, wallCaption = 32;
    const wallH = Math.max(260, s.wallAvail || ((s.rootH || 900) - (narrow ? 150 : 166)));
    let wallRows = narrow ? 2 : 3, wallRowH = 0, wallColW = 0;
    for (; wallRows >= 1; wallRows--) {
      wallRowH = (wallH - wallLift * 2 - wallGap * (wallRows - 1)) / wallRows;
      wallColW = (wallRowH - wallCaption) * 63 / 88;
      if (wallColW >= (narrow ? 132 : 150) || wallRows === 1) break;
    }
    wallRowH = Math.floor(wallRowH); wallColW = Math.floor(wallColW);
    const listW = (s.rootW || 1200) - (narrow ? 32 : (s.compact ? 72 : 268) + 64);
    const hidden: Any = narrow
      ? { number: 1, set: 1, date: 1, illustrator: 1, bgsBL: 1 }
      : listW < 560 ? { set: 1, date: 1, illustrator: 1 }
      : listW < 700 ? { set: 1, date: 1 }
      : listW < 840 ? { set: 1 }
      : {};
    const track = (k: Any, tt: Any) => (hidden[k] ? "" : tt);
    const listCols = narrow
      ? "38px minmax(0,1fr) auto"
      : ["40px", "minmax(0,2fr)", track("number", "84px"), track("set", "minmax(0,1.4fr)"),
         track("date", "92px"), track("illustrator", "minmax(0,1.3fr)"), "62px", "62px"]
        .filter(Boolean).join(" ");
    const listCell = (key: Any): Any => ({
      display: key && hidden[key] ? "none" : "block",
      fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-muted)",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", alignSelf: "center",
    });
    const groupOf = (sortKey === "set" || sortKey === "date") ? (c: Any) => c.set || "Unlisted set"
      : sortKey === "illustrator" ? (c: Any) => c.illustrator || "Illustrator unknown"
      : null;
    // Count consecutive runs (date order can revisit a set), keyed by run start.
    const runCounts: number[] = [];
    if (groupOf) {
      let prev: Any = null, start = -1;
      filtered.forEach((c: Any, i: number) => { const g = groupOf(c); if (g !== prev) { start = i; prev = g; runCounts[start] = 0; } runCounts[start]++; });
    }
    let lastGroup: Any = null;
    const tiles = filtered.map((c: Any, idx: number) => {
      const dim = s.ownerMode && s.desaturate && c.pc !== "PSA10";
      const g = groupOf ? groupOf(c) : null;
      const newGroup = g !== null && g !== lastGroup;
      const firstGroup = newGroup && lastGroup === null;
      lastGroup = g;
      const p10 = c.population && typeof c.population.psa10 === "number" ? c.population.psa10 : null;
      const bgs = c.population && typeof c.population.bgsBL === "number" ? c.population.bgsBL : null;
      return {
        groupLabel: newGroup ? g : "",
        groupCount: newGroup ? `${runCounts[idx]}` : "",
        groupStyle: {
          gridColumn: "1 / -1", display: "flex", alignItems: "baseline", gap: 10,
          margin: firstGroup ? "6px 0 4px" : "38px 0 4px", padding: narrow ? "0 6px 8px" : "0 8px 8px",
          borderBottom: "1px solid var(--line-strong)",
          fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em",
          textTransform: "uppercase", color: "var(--text-accent)",
        },
        groupCountStyle: { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" },
        wallGroupStyle: {
          gridRow: "1 / -1", display: newGroup ? "flex" : "none",
          flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 12,
          width: narrow ? 46 : 62, height: "100%", paddingTop: 2,
          borderLeft: firstGroup ? "none" : "1px solid var(--line-strong)",
          marginLeft: firstGroup ? 0 : (narrow ? 6 : 14), paddingLeft: narrow ? 0 : 4,
        },
        wallGroupTextStyle: {
          writingMode: "vertical-rl", fontFamily: "var(--font-data)", fontSize: "var(--web-label)",
          letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-accent)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxHeight: "72%", paddingLeft: 8,
        },
        wallGroupCountStyle: {
          writingMode: "vertical-rl", fontFamily: "var(--font-data)", fontSize: "var(--web-label)",
          color: "var(--text-faint)", paddingLeft: 8,
        },
        illustrator: c.illustrator || "—",
        psa10Label: p10 === null ? "—" : String(p10),
        bgsLabel: bgs === null ? "—" : String(bgs),
        listMeta: [hidden.number && c.number && c.number !== "N/A" ? c.number : "", hidden.set ? c.set : "", hidden.date ? ((D && D.formatDate(c.release)) || (c.year ? String(c.year) : "")) : "", hidden.illustrator ? c.illustrator : ""].filter(Boolean).join(" · "),
        listMetaStyle: { display: Object.keys(hidden).length ? "block" : "none", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
        listNumStyle: { ...listCell("number"), color: "var(--pink-700)", fontWeight: 600 },
        listSetStyle: listCell("set"), listDateStyle: listCell("date"), listIllusStyle: listCell("illustrator"),
        listPsaStyle: { ...listCell(null), textAlign: narrow ? "right" : "left", color: p10 ? "var(--text-title)" : "var(--text-faint)" },
        listBgsStyle: { ...listCell("bgsBL"), color: bgs ? "var(--text-title)" : "var(--text-faint)" },
        listRowStyle: {
          display: "grid", gridTemplateColumns: listCols, gap: narrow ? 10 : 14, alignItems: "center",
          width: "100%", padding: narrow ? "8px 6px" : "7px 8px", textAlign: "left", cursor: "pointer",
          background: "transparent", border: "none", borderBottom: "1px solid var(--line-hairline)",
          transition: "background var(--dur-fast) var(--ease)",
        },
        listThumbStyle: {
          display: "block", width: narrow ? 38 : 40, aspectRatio: "63 / 88",
          borderRadius: "4.72% / 3.37%", background: "var(--surface-image)",
          backgroundImage: c.image ? `url("${c.image}")` : "none",
          backgroundSize: "100% 100%", backgroundPosition: "center",
          filter: dim ? "grayscale(1)" : "none", opacity: dim && c.pc === "N/A" ? 0.3 : 1,
        },
        id: c.id, title: this.name(c), subtitle: this.alt(c),
        number: c.number && c.number !== "N/A" ? c.number : "",
        set: [c.set, c.rarity, c.edition].filter(Boolean).join(" · "),
        date: (D && D.formatDate(c.release)) || (c.year ? String(c.year) : ""),
        year: c.year ? String(c.year) : "",
        imgStyle: {
          display: "block", width: "100%", height: "100%",
          backgroundImage: c.image ? `url("${c.image}")` : "none",
          backgroundSize: "100% 100%", backgroundPosition: "center",
          transition: "filter var(--dur) var(--ease), opacity var(--dur) var(--ease)",
          filter: dim ? "grayscale(1)" : "none", opacity: dim && c.pc === "N/A" ? 0.3 : 1,
        },
        noImage: !c.image,
        wallStyle: {
          display: "block", width: wallColW, padding: 0, textAlign: "left", cursor: "pointer", minWidth: 0,
          background: "transparent", border: "none",
          transition: "transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)",
        },
        onClick: () => {
          this.setState({ selectedId: c.id, flipped: false });
          if (D) D.trackEvent("card_click", { card_name: c.nameEN, card_set: c.set, card_number: c.number });
        },
      };
    });

    return {
      isSample: false,
      shellStyle: {
        display: "grid", alignItems: "start", minHeight: "100vh",
        gridTemplateColumns: s.narrow ? "minmax(0,1fr)" : (s.compact ? "72px minmax(0,1fr)" : "minmax(0,268px) minmax(0,1fr)"),
      },
      isNarrow: s.narrow,
      rootRef: (el: Any) => {
        if (!el || el === this._rootEl) return;
        this._rootEl = el;
        if (this._ro) { this._ro.disconnect(); this._ro.observe(el); }
        if (this._resize) this._resize();
      },
      showSubtitle: !(s.compact),
      compactSidebar: s.compact,
      sectionStyle: s.narrow ? { display: "contents" } : { display: "flex", flexDirection: "column", gap: 10 },
      showSearchField: !s.compact && !s.narrow,
      showSearchIcon: s.compact || s.narrow,
      searchFieldStyle: {
        display: "flex", alignItems: "center", gap: 8, boxSizing: "border-box",
        height: 40, padding: "0 12px",
        flex: s.narrow ? "0 1 150px" : "none", minWidth: 0, maxWidth: s.narrow ? 150 : "none",
        background: "var(--surface-card)", border: "1px solid var(--line-strong)",
        borderRadius: "var(--web-radius-sm)",
        transition: "background var(--dur) var(--ease), border-color var(--dur) var(--ease)",
      },
      scopeGroupStyle: s.narrow
        ? { position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }
        : { display: "flex", flexDirection: "column", gap: 0, width: "100%" },
      triggerTextStyle: {
        display: s.compact ? "none" : "block",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      },
      wideSidebar: !s.compact,
      searchOpen: s.searchOpen,
      dropWrapStyle: s.narrow
        ? { position: "fixed", top: 10, left: 56, zIndex: 60, display: (s.selectedId || s.view === "collection") ? "none" : "flex", width: 40 }
        : (s.compact ? { position: "relative", width: "100%", display: "flex", justifyContent: "center" } : { position: "relative" }),
      eraWrapStyle: s.narrow
        ? { position: "fixed", top: 10, left: 10, zIndex: 60, display: (s.selectedId || s.view === "collection") ? "none" : "flex", width: 40 }
        : (s.compact
            ? { position: "relative", width: "100%", display: "flex", justifyContent: "center" }
            : { position: "relative", display: "flex", flexDirection: "column", gap: 10 }),
      railSearchWrapStyle: s.narrow
        ? { position: "relative", display: "flex", width: 44, flex: "0 0 44px" }
        : { position: "relative", display: "flex", width: "100%" },
      searchRef: (el: Any) => { this._searchPanelEl = el; },
      searchInputRef: (el: Any) => { if (el && el !== this._searchInputEl) { this._searchInputEl = el; requestAnimationFrame(() => el.focus()); } },
      toggleSearchPanel: (e: Any) => {
        const el = (e && e.currentTarget) || null;
        this.setState({ searchOpen: !s.searchOpen, searchAnchor: s.narrow ? null : this.anchorOf(el), searchAnchorH: el ? Math.round((el.getBoundingClientRect().height - 36) / 2) : 0 });
      },
      compactSearchStyle: { ...this.scopeIcon(!!s.q || s.searchOpen), background: "transparent", borderBottom: "none", ...(s.narrow ? { width: "100%", maxWidth: 44 } : null) },
      searchPanelStyle: {
        ...this.railMenu(s.searchAnchor),
        ...(s.searchAnchor && !s.narrow ? { top: s.searchAnchor.top + (s.searchAnchorH || 0) } : null),
        ...(s.narrow ? { position: "fixed", top: "auto", left: 10, right: 10, width: "auto", minWidth: 0, bottom: (s.barH || 53) + 8, height: 40 } : null),
        display: "flex", alignItems: "center", gap: 8, zIndex: 40,
        height: 36, padding: "0 12px", boxSizing: "border-box", maxHeight: "none",
        background: "var(--surface-card)", border: "1px solid var(--line-strong)",
        borderRadius: "var(--web-radius-sm)", boxShadow: "var(--shadow-raised)",
      },
      mewIconStyle: { ...this.scopeIcon(s.mew), background: "transparent", ...(s.narrow ? {} : { height: 56, minHeight: 56 }) },
      cameoIconStyle: this.scopeIcon(s.cameo),
      intlIconStyle: this.scopeIcon(s.intl),
      eyebrowStyle: {
        display: "none",
      },
      asideStyle: s.narrow
        ? {
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 150,
            justifyContent: "space-between",
            display: "flex", flexDirection: "row", alignItems: "center", gap: 2,
            padding: "4px 6px calc(4px + env(safe-area-inset-bottom, 0px))",
            overflowX: "visible", overflowY: "visible", flexWrap: "nowrap",
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
            boxSizing: "border-box", background: "var(--surface-sunken)",
            borderTop: "1px solid var(--line-strong)",
          }
        : { position: "sticky", top: 0, zIndex: 130, alignSelf: "start", height: "100vh", overflowY: s.compact ? "visible" : "auto", display: "flex", flexDirection: "column", gap: s.compact ? 16 : 26, padding: s.compact ? "22px 16px 16px" : "28px 24px 24px", alignItems: s.compact ? "center" : "stretch", overflowX: "visible", boxSizing: "border-box", background: "var(--surface-sunken)", borderRight: "1px solid var(--line-strong)" },
      asideRef: (el: Any) => {
        if (this._asideEl === el) return;
        this._asideEl = el;
        if (el && this._barRo) { this._barRo.disconnect(); this._barRo.observe(el); }
        if (this._resize) this._resize();
      },
      collOverlayStyle: s.narrow
        ? {
            position: "fixed", left: 0, right: 0, top: 0, bottom: s.barH || 53,
            boxSizing: "border-box",
            zIndex: 140, display: "flex", background: "rgba(20,19,23,.52)",
            backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          }
        : { display: "contents" },
      collPanelStyle: s.narrow
        ? {
            position: "relative", width: "100%", height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
            background: "var(--surface-card)", paddingTop: 28,
            animation: "mewFadeUp 200ms var(--ease) both",
          }
        : { display: "contents" },
      collTitleStyle: {
        margin: 0, fontFamily: "var(--font-body)", fontWeight: 700,
        fontSize: "var(--web-h2)",
        lineHeight: 1.15, color: "var(--text-title)", paddingRight: s.narrow ? 44 : 0,
      },
      collSummaryStyle: {
        marginTop: 6, fontFamily: "var(--font-data)",
        fontSize: "var(--web-small)", color: "var(--text-muted)",
      },
      collControlsStyle: {
        marginTop: s.narrow ? 12 : 22, display: "flex", alignItems: "center",
        gap: s.narrow ? 8 : 14, flexWrap: "wrap",
        paddingBottom: s.narrow ? 8 : 14, borderBottom: "1px solid var(--line-hairline)",
      },
      collWrapStyle: {
        minWidth: 0, maxWidth: 900, marginLeft: "auto", marginRight: "auto",
        padding: s.narrow ? "0 16px 48px" : "0 32px 64px",
      },
      browseBarStyle: {
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12,
        paddingLeft: s.listView ? 0 : (s.narrow ? 16 : 32),
        paddingRight: s.listView ? 0 : (s.narrow ? 16 : 32),
      },
      mainStyle: { position: "relative", minWidth: 0, padding: s.narrow ? (s.listView ? "20px 16px 64px" : "20px 0 0") : (s.listView ? "28px 32px 80px" : "28px 0 0") },
      browseGrid: !s.listView, browseList: s.listView,
      showGridView: () => this.setState({ listView: false }),
      showListView: () => this.setState({ listView: true }),
      gridViewBtnStyle: this.viewIconStyle(!s.listView),
      listViewBtnStyle: this.viewIconStyle(s.listView),
      listHeadStyle: {
        display: "grid", gridTemplateColumns: listCols, gap: s.narrow ? 10 : 14,
        padding: s.narrow ? "0 6px 8px" : "0 8px 8px", borderBottom: "1px solid var(--line-strong)",
        fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)",
      },
      wallRef: this._wallRefFn || (this._wallRefFn = (el: Any) => {
        if (this._wallEl === el) return;
        if (this._wallEl && this._wallWheel) this._wallEl.removeEventListener("wheel", this._wallWheel);
        if (this._wallEl && this._wallProg) this._wallEl.removeEventListener("scroll", this._wallProg);
        if (this._wallEl && this._wallMove) { this._wallEl.removeEventListener("mousemove", this._wallMove); this._wallEl.removeEventListener("mouseout", this._wallOut); }
        if (this._wallEl && this._wallTouchStart) { this._wallEl.removeEventListener("touchstart", this._wallTouchStart); this._wallEl.removeEventListener("touchmove", this._wallTouchMove); }
        this._wallEl = el;
        if (!el) return;
        this._wallProg = () => {
          const max = el.scrollWidth - el.clientWidth;
          const p = max > 4 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0;
          if (Math.abs(p - (this.state.wallProgress || 0)) > 0.002) this.setState({ wallProgress: p });
        };
        el.addEventListener("scroll", this._wallProg, { passive: true });
        this._wallProg();
        this._wallWheel = (e: Any) => {
          if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          if (el.scrollWidth <= el.clientWidth) return;
          const at = e.deltaY < 0 ? el.scrollLeft <= 0 : el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
          if (at) return;
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", this._wallWheel, { passive: false });
        const touch = window.matchMedia && window.matchMedia("(hover: none)").matches;
        const reduced = touch || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        const MAX = 8;
        this._wallMove = (e: Any) => {
          if (reduced) return;
          const card = e.target.closest && e.target.closest("[data-wall-card]");
          const face = card && card.querySelector("[data-card-face]");
          if (!face) return;
          const r = face.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          const rx = (py - 0.5) * -MAX, ry = (px - 0.5) * MAX;
          face.style.transition = "box-shadow var(--dur) var(--ease)";
          face.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
          const glare = face.querySelector("[data-card-glare]");
          if (glare) {
            const mag = Math.min(1, Math.hypot(rx, ry) / MAX);
            const gx = 50 + (-ry / MAX) * 35, gy = 50 + (rx / MAX) * 35;
            const alpha = ((0.45 + 0.25 * mag) * 0.7).toFixed(2);
            glare.style.opacity = alpha;
            glare.style.background = `radial-gradient(650px circle at ${gx}% ${gy}%, rgba(255,255,255,${alpha}), transparent 40%)`;
          }
        };
        this._wallOut = (e: Any) => {
          const card = e.target.closest && e.target.closest("[data-wall-card]");
          const face = card && card.querySelector("[data-card-face]");
          if (!face) return;
          face.style.transition = "transform 150ms ease, box-shadow var(--dur) var(--ease)";
          face.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
          const glare = face.querySelector("[data-card-glare]");
          if (glare) glare.style.opacity = "0";
        };
        // Drag state lives on the instance: scrolling re-renders, which can
        // re-run this ref and re-bind listeners mid-gesture.
        const T = this._touch || (this._touch = { tx: 0, ty: 0, tl: 0, axis: null });
        this._wallTouchStart = (ev: Any) => {
          const tt = ev.touches[0];
          T.tx = tt.clientX; T.ty = tt.clientY; T.tl = el.scrollLeft; T.axis = null;
        };
        this._wallTouchMove = (ev: Any) => {
          const tt = ev.touches[0];
          const dx = tt.clientX - T.tx, dy = tt.clientY - T.ty;
          if (T.axis === null) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            T.axis = "wall";
          }
          const max = el.scrollWidth - el.clientWidth;
          if (max <= 0) return;
          const next = T.tl - dx - dy;
          if ((next < 0 && el.scrollLeft <= 0) || (next > max && el.scrollLeft >= max)) return;
          el.scrollLeft = Math.max(0, Math.min(max, next));
          if (ev.cancelable) ev.preventDefault();
        };
        el.addEventListener("touchstart", this._wallTouchStart, { passive: true });
        el.addEventListener("touchmove", this._wallTouchMove, { passive: false });
        el.addEventListener("mousemove", this._wallMove);
        el.addEventListener("mouseout", this._wallOut);
        if (this._resize) requestAnimationFrame(this._resize);
      }),
      scrollProgressStyle: s.listView
        ? {
            position: "fixed", top: 0, width: 2, zIndex: 8,
            left: s.narrow ? 0 : (s.compact ? 72 : 268),
            height: `${Math.round((s.pageProgress || 0) * 100)}%`,
            background: "var(--pink-700)", transition: "height 90ms linear", pointerEvents: "none",
          }
        : {
            position: "absolute", left: 0, top: 0, height: 2,
            width: `${Math.round((s.wallProgress || 0) * 100)}%`,
            background: "var(--pink-700)", transition: "width 90ms linear", pointerEvents: "none",
          },
      wallGridStyle: {
        height: wallH, boxSizing: "border-box",
        display: "grid", gap: wallGap, marginTop: narrow ? 14 : 20,
        paddingTop: wallLift, paddingBottom: wallLift,
        paddingLeft: narrow ? 16 : 32, paddingRight: narrow ? 16 : 32,
        gridAutoFlow: "column",
        gridTemplateRows: `repeat(${wallRows}, ${wallRowH}px)`,
        gridAutoColumns: "min-content",
        overflowX: "auto", overflowY: "hidden", overscrollBehaviorX: "contain", touchAction: narrow ? "none" : "auto",
        ...(filtered.length === 0 ? { display: "none" } : null),
      },
      collGridStyle: {
        display: "grid", gap: s.narrow ? 10 : 14, marginTop: s.narrow ? 16 : 22,
        gridTemplateColumns: `repeat(auto-fill, minmax(${s.narrow ? 96 : 112}px, 1fr))`,
      },
      collViewIconStyle: {
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        width: 32, height: 32, padding: 0, cursor: "pointer",
        background: "transparent", border: "none", color: "var(--text-muted)",
        transition: "color var(--dur-fast) var(--ease)",
      },
      collRowStyle: {
        display: "grid", alignItems: "center", gap: s.narrow ? 8 : 12, width: "100%", textAlign: "left",
        padding: s.narrow ? "1px 4px" : "4px 4px", lineHeight: 1.15, cursor: "pointer", background: "transparent", border: "none",
        borderBottom: "1px solid var(--line-hairline)",
        gridTemplateColumns: s.narrow ? "56px 44px minmax(0,1fr)" : "58px 46px minmax(0,0.9fr) minmax(0,1.7fr) minmax(0,1.4fr)",
      },
      showRowSet: !s.narrow, showRowNumber: !s.narrow,
      showFilters: true,
      filterStackStyle: s.narrow
        ? { display: "contents" }
        : { display: "flex", flexDirection: "column", gap: 0, flex: 1, width: "100%", justifyContent: "flex-end" },
      filterGroupStyle: s.narrow
        ? { display: "contents" }
        : {
            position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)",
            boxSizing: "border-box", padding: s.compact ? "0 16px" : "0 24px",
            display: "flex", flexDirection: "column", gap: 0,
            alignItems: s.compact ? "center" : "stretch",
          },
      langThemeRowStyle: s.narrow
        ? { display: "flex", alignItems: "center", gap: 2, flexShrink: 0, marginLeft: s.ownerMode ? 0 : "auto" }
        : {
            flexShrink: 0, minWidth: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: s.compact ? 2 : 8,
            flexWrap: s.compact ? "wrap" : "nowrap",
          },
      footerRowStyle: s.narrow ? { display: "flex", alignItems: "center", gap: 2, flexShrink: 0, marginLeft: "auto" } : {
        flexShrink: 0, minWidth: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: s.compact ? 2 : 8,
        flexWrap: s.compact ? "wrap" : "nowrap",
      },
      theme,
      langLabel: s.lang === "JP" ? "JA" : "EN",
      tSubtitle: s.lang === "JP" ? "ミュウ全収録 · カタログ" : "MEW COMPLETE CATALOG",
      tSample: s.lang === "JP" ? "サンプルデータ" : "SAMPLE DATA",
      tSearch: s.lang === "JP" ? "検索" : "Search",
      tScope: s.lang === "JP" ? "範囲" : "SCOPE",
      tEra: s.lang === "JP" ? "セット" : "SET",
      tSortBy: s.lang === "JP" ? "並び替え" : "SORT BY",
      tCollection: s.lang === "JP" ? "コレクション" : "COLLECTION",
      tMew: s.lang === "JP" ? "ミュウ" : "Mew",
      tCameo: s.lang === "JP" ? "カメオ" : "Cameo",
      tIntl: s.lang === "JP" ? "海外" : "Intl",
      tAllEras: s.lang === "JP" ? "すべてのセット" : "All sets",
      tDesat: s.lang === "JP" ? "未所持フィルター" : "NEED FILTER",
      tGrid: s.lang === "JP" ? "グリッド" : "GRID",
      tList: s.lang === "JP" ? "リスト" : "LIST",
      tLoading: s.lang === "JP" ? "読み込み中" : "LOADING CATALOG",
      tNoResults: s.lang === "JP" ? "該当なし" : "NO RESULTS",
      tNoResultsBody: s.lang === "JP" ? "現在の条件に一致するカードはありません。" : "No cards match the current scope and search.",
      tTracker: s.lang === "JP" ? "コレクション管理" : "Collection tracker",
      tPopCaption: s.lang === "JP" ? "個体数レポート" : "Population report",
      langTitle: s.lang === "JP" ? "Japanese names — switch to English" : "English names — switch to Japanese",
      themeTitle: theme === "dark" ? "Switch to light" : "Switch to dark",
      bulbStroke: theme === "dark" ? "var(--pink-700)" : "var(--text-faint)",
      iconBtnStyle: {
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        width: s.narrow ? 44 : 28, height: s.narrow ? 44 : 28, padding: 0, cursor: "pointer",
        background: "transparent", border: "none",
        color: theme === "dark" ? "var(--pink-700)" : "var(--text-muted)",
        transition: "color var(--dur-fast) var(--ease)",
      },
      railLabelStyle: {
        position: "absolute", left: "100%", top: "50%", marginTop: -13, marginLeft: 8, zIndex: 30,
        display: "block", height: 26, lineHeight: "26px", padding: "0 9px", whiteSpace: "nowrap",
        background: "var(--surface-card)", border: "1px solid var(--line-strong)",
        borderRadius: "var(--web-radius-sm)", boxShadow: "var(--shadow-raised)",
        fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-title)",
      },
      collIconStyle: {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: s.narrow ? 44 : 28, height: s.narrow ? 44 : 28, padding: 0, cursor: "pointer",
        background: "transparent", border: "none",
        color: s.view === "collection" ? "var(--pink-700)" : "var(--text-muted)",
        transition: "color var(--dur-fast) var(--ease)",
      },
      desatIconStyle: {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: s.narrow ? 44 : 28, height: s.narrow ? 44 : 28, padding: 0, cursor: "pointer",
        background: "transparent", border: "none",
        color: s.desaturate ? "var(--pink-700)" : "var(--text-muted)",
        transition: "color var(--dur-fast) var(--ease)",
      },
      langBtnStyle: {
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        height: s.narrow ? 44 : 28, minWidth: s.narrow ? 44 : 28, padding: 0, cursor: "pointer",
        background: "transparent", border: "none",
        fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em",
        color: "var(--text-muted)", transition: "color var(--dur-fast) var(--ease)",
      },
      gateBg: theme === "dark" ? "#101010" : "var(--surface-page)",
      swirlDelay: (this._swirlDelay || (this._swirlDelay = `${-((Date.now() % 5000) / 1000)}s`)),
      gateThemeSlotStyle: s.narrow
        ? { position: "absolute", right: 8, bottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }
        : { position: "absolute", left: 0, bottom: 20, width: 72, display: "flex", alignItems: "center", justifyContent: "center" },
      gateThemeBtnStyle: {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 44, height: 44, padding: 0, cursor: "pointer",
        background: "transparent", border: "none", color: theme === "dark" ? "rgba(255,255,255,.45)" : "var(--text-faint)",
        transition: "color var(--dur-fast) var(--ease)",
      },
      toggleTheme: () => { this._themePinned = true; this.setState({ theme: theme === "dark" ? "light" : "dark" }); },
      toggleLang: () => { const next = s.lang === "JP" ? "EN" : "JP"; if (D) D.trackEvent("language_toggle", { language: next }); this.setState({ lang: next }); },
      gated: this.props.showGate !== false ? gated : false,
      showPassword: this.props.showGate !== false && !!(s.needPassword && !s.unlocked && s.authChecked),
      progressImgStyle: { position: "absolute", inset: 0, width: "100%", height: "100%", transition: "clip-path 300ms linear", clipPath: `inset(${100 - s.progress}% 0 0 0)` },
      passwordInput: s.passwordInput,
      onPasswordChange: (e: Any) => this.setState({ passwordInput: e.target.value }),
      onPasswordSubmit: (e: Any) => { e.preventDefault(); if (s.passwordInput && !s.authing) { this.setState({ authing: true }); this.load(s.passwordInput); } },
      q: s.q, hasQuery: !!s.q,
      onSearch: (e: Any) => this.setState({ q: e.target.value }),
      clearSearch: () => this.setState({ q: "" }),
      isBrowse: s.view === "browse",
      goBrowse: () => this.setState({ view: "browse" }),
      toggleCollection: () => {
        const on = s.view === "collection";
        if (!on && D) D.trackEvent("stats_modal_open");
        this.setState({ view: on ? "browse" : "collection" });
      },
      ownerMode: s.ownerMode,
      toggleMew: t("mew"), toggleCameo: t("cameo"), toggleIntl: t("intl"), toggleDesaturate: t("desaturate"),
      eraOptions: eraNames.map((name) => {
        const on = picked.includes(name);
        return {
          label: name, count: eraCounts.get(name) || 0, onClick: toggleEra(name),
          mark: on ? "✓" : "", rowStyle: this.menuRowStyle(on), boxStyle: this.checkboxStyle(on),
          countStyle: { fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)" },
        };
      }),
      hasEras: eraNames.length > 1,
      eraMenuOpen: s.eraMenuOpen,
      eraRef: (el: Any) => { this._eraEl = el; },
      toggleEraMenu: (e: Any) => {
        const el = e && e.currentTarget;
        if (el && e.detail) el.blur();
        const host = el || this._eraEl;
        this.setState({ eraMenuOpen: !s.eraMenuOpen, eraAnchor: this.anchorOf(host) });
      },
      eraTriggerLabel: picked.length === 0 ? (ja ? "すべてのセット" : "All sets") : picked.length === 1 ? picked[0] : (ja ? `${picked.length} セット` : `${picked.length} sets`),
      eraTriggerStyle: {
        display: "flex", alignItems: "center", gap: s.compact ? 2 : 8,
        justifyContent: s.compact ? "center" : "space-between",
        width: "100%", boxSizing: "border-box", cursor: "pointer",
        height: s.narrow ? 44 : 34, padding: s.compact ? "0 4px" : "0 12px", textAlign: "left",
        background: "var(--surface-card)",
        border: s.compact ? "none" : `1px solid ${s.eraMenuOpen || picked.length ? "var(--pink-700)" : "var(--line-strong)"}`,
        color: s.compact ? ((s.eraMenuOpen || picked.length) ? "var(--pink-700)" : "var(--text-muted)") : "var(--text-title)",
        borderRadius: "var(--web-radius-sm)",
        fontFamily: "var(--font-data)", fontSize: "var(--web-small)",
        ...this.railCell(),
        ...(s.compact ? { background: "transparent" } : null),
        ...(s.compact && !s.narrow ? { width: 32, marginLeft: 0, marginRight: 0, flex: "0 0 32px" } : null),
        ...(s.narrow ? { width: 40, height: 40, minHeight: 40, flex: "0 0 40px", background: "transparent", border: "none", borderRadius: 0, padding: 0, justifyContent: "center" } : null),
      },
      eraCaretStyle: {
        display: s.compact ? "none" : "block",
        flexShrink: 0, fontSize: 11, color: "var(--text-muted)",
        transition: "transform var(--dur-fast) var(--ease)",
        transform: s.eraMenuOpen ? "rotate(180deg)" : "none",
      },
      eraMenuStyle: {
        position: "absolute", top: "100%", left: 0, right: 0,
        zIndex: 40, marginTop: 4,
        ...(s.compact && !s.narrow ? this.railMenu(s.eraAnchor) : null),
        ...(s.narrow ? { position: "fixed", top: 56, left: 10, right: "auto", width: "min(280px, calc(100vw - 20px))", zIndex: 70 } : null),
        maxHeight: 280, overflowY: "auto", padding: 4, boxSizing: "border-box",
        display: "flex", flexDirection: "column", gap: 1,
        background: "var(--surface-card)", border: "1px solid var(--line-strong)",
        borderRadius: "var(--web-radius-sm)", boxShadow: "var(--shadow-raised)",
      },
      eraAllRowStyle: this.menuRowStyle(picked.length === 0),
      eraAllBoxStyle: this.checkboxStyle(picked.length === 0),
      eraAllMark: picked.length === 0 ? "✓" : "",
      clearEras: () => this.setState({ eras: [], eraMenuOpen: false }),
      mewPillStyle: this.pill(s.mew), cameoPillStyle: this.pill(s.cameo),
      intlPillStyle: this.pill(s.intl),
      resultLabel: ja ? `${filtered.length} 枚` : `${filtered.length} ${filtered.length === 1 ? "card" : "cards"}`,
      sortLabel: `${(ja ? SORT_LABELS_JA : SORT_LABELS)[sortKey] || (ja ? "発売日" : "Date")} ${sortDir === "desc" ? "↓" : "↑"}`,
      listHeaders: [["name", "CARD"], ["number", "NUMBER"], ["set", "SET"], ["date", "RELEASED"], ["illustrator", "ILLUSTRATOR"], ["psa10", "PSA 10"], ["bgsBL", "BGS BL"]].map(([k, enLabel]) => {
        const on = k === sortKey;
        const label = ja ? (COL_LABELS_JA[k] || enLabel) : enLabel;
        return {
          label: on ? `${label} ${sortDir === "desc" ? "↓" : "↑"}` : label,
          onClick: () => this.setState(on
            ? { sortDir: sortDir === "desc" ? "asc" : "desc" }
            : { sortKey: k, sortDir: k === "psa10" || k === "bgsBL" ? "desc" : "asc" }),
          style: {
            display: hidden[k] ? "none" : "block", padding: 0, textAlign: "left", cursor: "pointer",
            background: "none", border: "none", whiteSpace: "nowrap",
            minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
            fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em",
            color: on ? "var(--text-accent)" : "var(--text-faint)",
            transition: "color var(--dur-fast) var(--ease)",
          },
        };
      }),
      sortMenuOpen: s.sortMenuOpen,
      sortRef: (el: Any) => { this._sortEl = el; },
      toggleSortMenu: (e: Any) => {
        const el = e && e.currentTarget;
        if (el && e.detail) el.blur();
        const host = el || this._sortEl;
        this.setState({ sortMenuOpen: !s.sortMenuOpen, sortAnchor: this.anchorOf(host) });
      },
      sortOptions: [["date", "Date"], ["set", "Set"], ["illustrator", "Illustrator"], ["name", "Name"], ["number", "Number"], ["psa10", "PSA 10 pop"], ["bgsBL", "BGS BL pop"]].map(([k, enLabel]) => {
        const on = k === sortKey;
        const label = ja ? (SORT_LABELS_JA[k] || enLabel) : enLabel;
        return {
          label, rowStyle: this.menuRowStyle(on),
          dir: on ? (sortDir === "desc" ? "↓" : "↑") : "",
          dirStyle: { fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: on ? "var(--text-accent)" : "var(--text-faint)" },
          onClick: () => this.setState(on
            ? { sortDir: sortDir === "desc" ? "asc" : "desc" }
            : { sortKey: k, sortDir: k === "date" ? "asc" : "desc", sortMenuOpen: false }),
        };
      }),
      sortTriggerStyle: {
        display: "flex", alignItems: "center", gap: s.compact ? 2 : 8,
        justifyContent: s.compact ? "center" : "space-between",
        width: "100%", boxSizing: "border-box", cursor: "pointer",
        height: s.narrow ? 44 : 34, padding: s.compact ? "0 4px" : "0 12px", textAlign: "left",
        background: "var(--surface-card)",
        border: s.compact ? "none" : `1px solid ${s.sortMenuOpen ? "var(--pink-700)" : "var(--line-strong)"}`,
        color: s.compact ? (s.sortMenuOpen ? "var(--pink-700)" : "var(--text-muted)") : "var(--text-title)",
        borderRadius: "var(--web-radius-sm)",
        fontFamily: "var(--font-data)", fontSize: "var(--web-small)",
        ...this.railCell(),
        ...(s.compact ? { background: "transparent" } : null),
        ...(s.narrow ? { width: 40, height: 40, minHeight: 40, flex: "0 0 40px", background: "transparent", border: "none", borderRadius: 0, padding: 0, justifyContent: "center" } : null),
      },
      sortCaretStyle: {
        display: s.compact ? "none" : "block",
        flexShrink: 0, fontSize: 11, color: "var(--text-muted)",
        transition: "transform var(--dur-fast) var(--ease)",
        transform: s.sortMenuOpen ? "rotate(180deg)" : "none",
      },
      sortMenuStyle: {
        position: "absolute", top: "100%", left: 0, right: 0,
        zIndex: 40, marginTop: 4,
        ...(s.compact && !s.narrow ? this.railMenu(s.sortAnchor) : null),
        ...(s.narrow ? { position: "fixed", top: 56, left: 10, right: "auto", width: "min(280px, calc(100vw - 20px))", zIndex: 70 } : null),
        padding: 4, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 1,
        background: "var(--surface-card)", border: "1px solid var(--line-strong)",
        borderRadius: "var(--web-radius-sm)", boxShadow: "var(--shadow-raised)",
      },
      tiles,
      isLoadingCards: s.cards.length === 0 && s.status === "loading",
      isEmpty: s.status !== "loading" && filtered.length === 0,
      ...this.detailVals(),
      ...this.collectionVals(),
    };
  }

  render() {
    const v: Any = this.renderVals();
    return (
      <div data-theme={v.theme} style={{ minHeight: "100vh", background: "var(--surface-page)", color: "var(--text-body)", fontFamily: "var(--font-body)" }}>
        {v.gated && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box", background: v.gateBg }}>
            <div style={{ position: "relative", width: 112, height: 112, flex: "0 0 auto" }}>
              <div className="loading-swirl" aria-hidden="true" style={{ position: "absolute", inset: 0, animationDelay: v.swirlDelay }}></div>
              <img src="/assets/mew-logo.png" alt="Loading..." style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0.25 }} />
              <img src="/assets/mew-logo.png" alt="Loading..." style={v.progressImgStyle} />
            </div>
            {v.showPassword && (
              <form onSubmit={v.onPasswordSubmit} style={{ position: "absolute", top: "50%", left: 0, right: 0, marginTop: 72, display: "flex", justifyContent: "center", animation: "mewFadeUp 400ms var(--ease) both" }}>
                <input type="password" className="mew-gate-input" value={v.passwordInput} onChange={v.onPasswordChange} aria-label="Password" style={{ height: 30, width: 96, padding: "0 10px", boxSizing: "border-box", borderRadius: 6, textAlign: "center", fontFamily: "var(--font-body)", fontSize: 13, letterSpacing: "0.25em", textIndent: "0.25em", outline: "none", transition: "background 150ms var(--ease), border-color 150ms var(--ease)" }} />
              </form>
            )}
            <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontFamily: "var(--font-data)", fontSize: 10, fontWeight: 600, color: "rgba(203, 151, 165, 0.8)" }}>v{MewData.APP_VERSION}</div>
            <div style={v.gateThemeSlotStyle}>
              <HoverEl onClick={v.toggleTheme} aria-label="Toggle theme" title={v.themeTitle} style={v.gateThemeBtnStyle} hoverStyle={HOVER_PINK}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"></path><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8.9.9 1.5l.1.7h5.2l.1-.7c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3Z" stroke={v.bulbStroke}></path></svg>
              </HoverEl>
            </div>
          </div>
        )}

        <div ref={v.rootRef} style={v.shellStyle}>
          <aside ref={v.asideRef} style={v.asideStyle}>
            <div style={v.eyebrowStyle}></div>

            {v.showSearchField && (
              <label data-search-field="1" style={v.searchFieldStyle}>
                <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>Q</span>
                <input value={v.q} onChange={v.onSearch} placeholder={v.tSearch} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-body)", fontSize: "var(--web-small)", color: "var(--text-title)" }} />
                {v.hasQuery && (
                  <HoverEl onClick={v.clearSearch} aria-label="Clear search" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-faint)" }} hoverStyle={HOVER_ACCENT}>×</HoverEl>
                )}
              </label>
            )}
            {v.showSearchIcon && (
              <div ref={v.searchRef} style={v.railSearchWrapStyle}>
                <button type="button" onClick={v.toggleSearchPanel} aria-label={v.tSearch} title={v.tSearch} style={v.compactSearchStyle}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.6"></circle><path d="M10.4 10.4 14.5 14.5" strokeLinecap="round"></path></svg>
                </button>
                {v.searchOpen && (
                  <label data-search-field="1" style={v.searchPanelStyle}>
                    <input value={v.q} onChange={v.onSearch} placeholder={v.tSearch} ref={v.searchInputRef} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-body)", fontSize: "var(--web-small)", color: "var(--text-title)" }} />
                    {v.hasQuery && (
                      <HoverEl onClick={v.clearSearch} aria-label="Clear search" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-faint)" }} hoverStyle={HOVER_PINK}>×</HoverEl>
                    )}
                  </label>
                )}
              </div>
            )}

            {v.showFilters && (
              <div style={v.filterStackStyle}>
                <div style={v.filterGroupStyle}>
                  <div style={v.sectionStyle}>
                    {v.wideSidebar && (
                      <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{v.tScope}</span>
                    )}
                    {v.compactSidebar && (
                      <div style={v.scopeGroupStyle}>
                        <button type="button" data-rail-tip="1" onClick={v.toggleMew} aria-label={v.tMew} style={v.mewIconStyle}>
                          <MewIcon />
                          <span data-rail-label="1" style={v.railLabelStyle}>{v.tMew}</span>
                        </button>
                        <button type="button" data-rail-tip="1" onClick={v.toggleCameo} aria-label={v.tCameo} style={v.cameoIconStyle}>
                          <CameoIcon />
                          <span data-rail-label="1" style={v.railLabelStyle}>{v.tCameo}</span>
                        </button>
                        <button type="button" data-rail-tip="1" onClick={v.toggleIntl} aria-label={v.tIntl} style={v.intlIconStyle}>
                          <IntlIcon />
                          <span data-rail-label="1" style={v.railLabelStyle}>{v.tIntl}</span>
                        </button>
                      </div>
                    )}
                    {v.wideSidebar && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button type="button" onClick={v.toggleMew} style={v.mewPillStyle}>{v.tMew}</button>
                        <button type="button" onClick={v.toggleCameo} style={v.cameoPillStyle}>{v.tCameo}</button>
                        <button type="button" onClick={v.toggleIntl} style={v.intlPillStyle}>{v.tIntl}</button>
                      </div>
                    )}
                  </div>

                  {v.hasEras && (
                    <div ref={v.eraRef} style={v.eraWrapStyle}>
                      {v.wideSidebar && (
                        <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{v.tEra}</span>
                      )}
                      <button type="button" data-rail-tip="1" onClick={v.toggleEraMenu} aria-haspopup="listbox" aria-label={v.tEra} style={v.eraTriggerStyle}>
                        <span style={v.triggerTextStyle}>{v.eraTriggerLabel}</span>
                        {v.compactSidebar && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v5h5"></path><path d="M3.05 13a9 9 0 1 0 2.5-6.36L3 8"></path><path d="M12 7v5l3.5 2"></path></svg>
                        )}
                        <span style={v.eraCaretStyle}>▾</span>
                        {v.compactSidebar && (<span data-rail-label="1" style={v.railLabelStyle}>{v.eraTriggerLabel}</span>)}
                      </button>
                      {v.eraMenuOpen && (
                        <div role="listbox" aria-multiselectable="true" className="mew-scroll" style={v.eraMenuStyle}>
                          <HoverEl onClick={v.clearEras} style={v.eraAllRowStyle} hoverStyle={HOVER_ROW}>
                            <span style={v.eraAllBoxStyle}>{v.eraAllMark}</span>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.tAllEras}</span>
                          </HoverEl>
                          {v.eraOptions.map((e: Any, i: number) => (
                            <HoverEl key={i} role="option" onClick={e.onClick} style={e.rowStyle} hoverStyle={HOVER_ROW}>
                              <span style={e.boxStyle}>{e.mark}</span>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
                              <span style={e.countStyle}>{e.count}</span>
                            </HoverEl>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={v.sectionStyle}>
                    {v.wideSidebar && (
                      <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{v.tSortBy}</span>
                    )}
                    <div ref={v.sortRef} style={v.dropWrapStyle}>
                      <button type="button" data-rail-tip="1" onClick={v.toggleSortMenu} aria-haspopup="listbox" aria-label={v.tSortBy} style={v.sortTriggerStyle}>
                        <span style={v.triggerTextStyle}>{v.sortLabel}</span>
                        {v.compactSidebar && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1.5" y="2.2" width="13" height="1.7" rx="0.85"></rect><rect x="3.3" y="6" width="9.4" height="1.7" rx="0.85"></rect><rect x="5.6" y="9.8" width="4.8" height="1.7" rx="0.85"></rect></svg>
                        )}
                        <span style={v.sortCaretStyle}>▾</span>
                        {v.compactSidebar && (<span data-rail-label="1" style={v.railLabelStyle}>{v.sortLabel}</span>)}
                      </button>
                      {v.sortMenuOpen && (
                        <div role="listbox" className="mew-scroll" style={v.sortMenuStyle}>
                          {v.sortOptions.map((o: Any, i: number) => (
                            <HoverEl key={i} role="option" onClick={o.onClick} style={o.rowStyle} hoverStyle={HOVER_ROW}>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                              <span style={o.dirStyle}>{o.dir}</span>
                            </HoverEl>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {v.ownerMode && (
                  <div style={v.footerRowStyle}>
                    <button type="button" data-rail-tip="1" onClick={v.toggleCollection} aria-label={v.tCollection} style={v.collIconStyle}>
                      <svg width="18" height="16" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9a9 9 0 0 1 18 0v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z"></path><path d="M3 12h18"></path><path d="M10.5 11h3v4h-3z"></path></svg>
                      <span data-rail-label="1" style={v.railLabelStyle}>{v.tCollection}</span>
                    </button>
                    <button type="button" data-rail-tip="1" onClick={v.toggleDesaturate} aria-label={v.tDesat} style={v.desatIconStyle}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.2"></circle><path d="M12 2.8a9.2 9.2 0 0 1 0 18.4Z" fill="currentColor" stroke="none"></path></svg>
                      <span data-rail-label="1" style={v.railLabelStyle}>{v.tDesat}</span>
                    </button>
                  </div>
                )}
                <div style={v.langThemeRowStyle}>
                  <HoverEl onClick={v.toggleLang} aria-label="Toggle language" title={v.langTitle} style={v.langBtnStyle} hoverStyle={HOVER_PINK}>{v.langLabel}</HoverEl>
                  <HoverEl onClick={v.toggleTheme} aria-label="Toggle theme" title={v.themeTitle} style={v.iconBtnStyle} hoverStyle={HOVER_PINK}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z"></path></svg>
                  </HoverEl>
                </div>
              </div>
            )}
          </aside>

          <main style={v.mainStyle}>
            <span style={v.scrollProgressStyle}></span>
            {v.isBrowse && (
              <div style={{ minWidth: 0 }}>
                <div style={v.browseBarStyle}>
                  <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-muted)" }}>{v.resultLabel}</span>
                  <HoverEl onClick={v.showGridView} aria-label="Grid view" title={v.tGrid} style={v.gridViewBtnStyle} hoverStyle={HOVER_PINK}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="7" height="7"></rect><rect x="9" y="0" width="7" height="7"></rect><rect x="0" y="9" width="7" height="7"></rect><rect x="9" y="9" width="7" height="7"></rect></svg>
                  </HoverEl>
                  <HoverEl onClick={v.showListView} aria-label="List view" title={v.tList} style={v.listViewBtnStyle} hoverStyle={HOVER_PINK}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="0" y="1" width="16" height="2"></rect><rect x="0" y="7" width="16" height="2"></rect><rect x="0" y="13" width="16" height="2"></rect></svg>
                  </HoverEl>
                </div>

                {v.browseList && (
                  <div style={{ paddingTop: 18 }}>
                    <div style={v.listHeadStyle}>
                      <span></span>
                      {v.listHeaders.map((hd: Any, i: number) => (
                        <HoverEl key={i} onClick={hd.onClick} style={hd.style} hoverStyle={HOVER_ACCENT}>{hd.label}</HoverEl>
                      ))}
                    </div>
                    {v.tiles.map((tl: Any) => (
                      <React.Fragment key={tl.id}>
                        {tl.groupLabel && (
                          <div style={tl.groupStyle}>
                            <span>{tl.groupLabel}</span>
                            <span style={tl.groupCountStyle}>{tl.groupCount}</span>
                          </div>
                        )}
                        <HoverEl onClick={tl.onClick} style={tl.listRowStyle} hoverStyle={HOVER_ROW}>
                          <span style={tl.listThumbStyle}></span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                            <span style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                              <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "var(--web-body)", color: "var(--text-title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tl.title}</span>
                            </span>
                            <span style={tl.listMetaStyle}>{tl.listMeta}</span>
                          </span>
                          <span style={tl.listNumStyle}>{tl.number}</span>
                          <span style={tl.listSetStyle}>{tl.set}</span>
                          <span style={tl.listDateStyle}>{tl.date}</span>
                          <span style={tl.listIllusStyle}>{tl.illustrator}</span>
                          <span style={tl.listPsaStyle}>{tl.psa10Label}</span>
                          <span style={tl.listBgsStyle}>{tl.bgsLabel}</span>
                        </HoverEl>
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {v.browseGrid && (
                  <div ref={v.wallRef} className="mew-scroll" style={v.wallGridStyle}>
                    {v.tiles.map((tl: Any) => (
                      <React.Fragment key={tl.id}>
                        {tl.groupLabel && (
                          <div style={tl.wallGroupStyle}>
                            <span style={tl.wallGroupTextStyle}>{tl.groupLabel}</span>
                            <span style={tl.wallGroupCountStyle}>{tl.groupCount}</span>
                          </div>
                        )}
                        <button type="button" data-wall-card="1" onClick={tl.onClick} style={tl.wallStyle}>
                          <span data-card-face="1" style={{ position: "relative", display: "block", containerType: "inline-size", aspectRatio: "63 / 88", background: "var(--surface-image)", borderRadius: "4.72% / 3.37%", overflow: "hidden" }}>
                            <span data-card-glare="1" style={{ position: "absolute", inset: 0, zIndex: 2, opacity: 0, mixBlendMode: "screen", pointerEvents: "none", transition: "opacity 150ms var(--ease)" }}></span>
                            <span role="img" aria-label={tl.title} style={tl.imgStyle}>{tl.noImage && (<span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>SCAN</span>)}</span>
                          </span>
                          <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "baseline", gap: 6, padding: "7px 8px 8px", background: "var(--surface-page)" }}>
                            <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--pink-700)", whiteSpace: "nowrap" }}>{tl.number}</span>
                            <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", color: "var(--text-faint)", marginLeft: "auto", whiteSpace: "nowrap" }}>{tl.year}</span>
                          </span>
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                )}
                {v.isLoadingCards && (
                  <div style={{ marginTop: 20, padding: "56px 24px", textAlign: "center", border: "1px dashed var(--line-strong)" }}>
                    <div style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{v.tLoading}</div>
                  </div>
                )}
                {v.isEmpty && (
                  <div style={{ marginTop: 20, padding: "56px 24px", textAlign: "center", border: "1px dashed var(--line-strong)" }}>
                    <div style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{v.tNoResults}</div>
                    <div style={{ marginTop: 8, fontFamily: "var(--font-body)", fontSize: "var(--web-body)", color: "var(--text-muted)" }}>{v.tNoResultsBody}</div>
                  </div>
                )}
              </div>
            )}

            {v.isCollection && (
              <div style={v.collOverlayStyle}>
                {v.isNarrowDetail && (
                  <button type="button" onClick={v.goBrowse} aria-label="Close" style={v.detailCloseStyle}>×</button>
                )}
                <div className="mew-scroll" style={v.collPanelStyle}>
                  <div style={v.collWrapStyle}>
                    <h1 style={v.collTitleStyle}>{v.tTracker}</h1>
                    <div style={v.collSummaryStyle}>{v.collSummary}</div>
                    <div style={v.collControlsStyle}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {v.collTabs.map((tb: Any, i: number) => (
                          <button key={i} type="button" onClick={tb.onClick} style={tb.style}>{tb.label}</button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button type="button" onClick={v.toggleCatMew} aria-label={v.tMew} title={v.tMew} style={v.catMewStyle}><MewIcon w={22} h={20} /></button>
                        <button type="button" onClick={v.toggleCatCameo} aria-label={v.tCameo} title={v.tCameo} style={v.catCameoStyle}><CameoIcon w={18} h={18} /></button>
                        <button type="button" onClick={v.toggleCatIntl} aria-label={v.tIntl} title={v.tIntl} style={v.catIntlStyle}><IntlIcon w={17} h={17} /></button>
                      </div>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-muted)" }}>{v.collCountLabel}</span>
                        <HoverEl onClick={v.toggleGridMode} aria-label={v.gridModeLabel} title={v.gridModeLabel} style={v.collViewIconStyle} hoverStyle={HOVER_PINK}>
                          {v.collList ? (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="7" height="7"></rect><rect x="9" y="0" width="7" height="7"></rect><rect x="0" y="9" width="7" height="7"></rect><rect x="9" y="9" width="7" height="7"></rect></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="0" y="1" width="16" height="2"></rect><rect x="0" y="7" width="16" height="2"></rect><rect x="0" y="13" width="16" height="2"></rect></svg>
                          )}
                        </HoverEl>
                      </div>
                    </div>
                    {v.collList && (
                      <div>
                        {v.collRows.map((r: Any) => (
                          <HoverEl key={r.id} onClick={r.onClick} style={v.collRowStyle} hoverStyle={HOVER_ROW}>
                            <span style={r.gradeStyle}>{r.grade}</span>
                            <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-faint)" }}>{r.year}</span>
                            {v.showRowNumber && (<span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.number}</span>)}
                            <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--web-body)", color: "var(--text-title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            {v.showRowSet && (<span style={{ fontFamily: "var(--font-body)", fontSize: "var(--web-small)", color: "var(--text-faint)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.set}</span>)}
                          </HoverEl>
                        ))}
                      </div>
                    )}
                    {v.collGrid && (
                      <div style={v.collGridStyle}>
                        {v.collRows.map((r: Any) => (
                          <button key={r.id} type="button" onClick={r.onClick} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 0, cursor: "pointer", background: "transparent", border: "none", textAlign: "left", minWidth: 0 }}>
                            <span style={{ position: "relative", display: "block", containerType: "inline-size", aspectRatio: "63 / 88", background: "var(--surface-image)", border: "1px solid var(--line-hairline)", borderRadius: "4.72% / 3.37%", overflow: "hidden" }}>
                              <span role="img" aria-label={r.name} style={r.imgStyle}></span>{r.noImage && (<span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>SCAN</span>)}
                            </span>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--web-small)", color: "var(--text-title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            <span style={r.gradeLineStyle}>{r.gradeLine}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {v.hasSelection && (
          <div onClick={v.closeDetail} style={v.overlayStyle}>
            {v.isNarrowDetail && (
              <button type="button" onClick={v.closeDetail} aria-label="Close" style={v.detailCloseStyle}>×</button>
            )}
            <div onClick={v.stop} className="mew-scroll" style={v.detailPanelStyle}>
              <div style={v.detailGridStyle}>
                <div style={v.detailImageWrapStyle}>
                  <div onClick={v.flipCard} style={v.flipWrapStyle}>
                    <div style={{ containerType: "inline-size", aspectRatio: "63 / 88", background: "var(--surface-card)", perspective: "2000px", overflow: "visible" }}>
                      <div style={v.flipInnerStyle}>
                        <span role="img" aria-label={v.detailName} style={v.detailFrontStyle}>{v.noImage && (<span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>SCAN</span>)}</span>
                        {v.hasBack && (<span role="img" aria-label="Reverse" style={v.detailBackStyle}></span>)}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={v.detailBodyStyle}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {v.detailChips.map((chip: Any, i: number) => (
                        <Chip key={i} tone={chip.tone} size="sm">{chip.label}</Chip>
                      ))}
                    </div>
                    <h1 style={v.detailTitleStyle}>{v.detailName}</h1>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--web-h3)", color: "var(--text-muted)" }}>{v.detailAlt}</span>
                      <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-small)", fontWeight: 600, color: "var(--text-accent)" }}>{v.detailNumber}</span>
                    </div>
                  </div>
                  <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px 24px", maxWidth: 560 }}>
                    {v.detailMeta.map((m: Any, i: number) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                        <dt style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>{m.k}</dt>
                        <dd style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: "var(--web-body)", color: "var(--text-title)" }}>{m.v}</dd>
                      </div>
                    ))}
                  </dl>
                  {v.hasNotes && (
                    <div style={{ padding: "14px 16px", background: "var(--surface-tint)", borderLeft: "2px solid var(--line-accent)" }}>
                      <div style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)" }}>備考</div>
                      <p style={{ margin: "6px 0 0", fontFamily: "var(--font-body)", fontSize: "var(--web-body)", lineHeight: "var(--web-leading)", color: "var(--text-body)", maxWidth: "62ch" }}>{v.detailNotes}</p>
                    </div>
                  )}
                  {v.hasPop && (
                    <div>
                      <div style={{ fontFamily: "var(--font-data)", fontSize: "var(--web-label)", letterSpacing: "0.12em", color: "var(--text-faint)", paddingBottom: 8, borderBottom: "1px solid var(--line-strong)" }}>{v.tPopCaption}</div>
                      <div style={v.popGridStyle}>
                        {v.popRows.map((p: Any, i: number) => (
                          <div key={i} style={p.rowStyle}>
                            <span style={p.gradeStyle}>{p.grade}</span>
                            <span style={p.popStyle}>{p.pop}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}

export default MewCatalog;
