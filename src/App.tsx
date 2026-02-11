import React, { useEffect, useMemo, useState } from "react";

// --- Single-file React gallery for Pokémon cards (Mew-focused) ---
// Theme: Dark gray (#101010) with pink accents (#cb97a5)
// - Flags inferred by tab name ("Japanese" -> isMew, "Cameo" -> isCameo, "Unique" -> isIntl)
// - **No de-duplication** across tabs
// - CSP-safe fetching (docs.google.com only)
// - Robust CSV parser + test harness
//
// --- Improvements from User ---
// - Refactored data fetching to use Promise.allSettled for parallel requests.
// - Added error logging for failed sheet fetches for easier debugging.
// - Added keyboard accessibility to the detail modal (closes on 'Escape').
// - Replaced the text '✕' close button with a scalable SVG icon.
// - Added a 'clear' button to the search input.
// - Simplified the `applyFilters` logic for better readability.
// - Completed and enhanced the development test suite.
// - Fixed "duplicate key" error by generating guaranteed-unique IDs for cards.
// - Added language toggle for Japanese/English card names, notes, and origins.
// - Added card flip animation in detail modal for cards with a back image.
// - Added image preloader with a loading bar for a smoother initial experience.
// - Switched to Google Apps Script for secure data fetching from a private sheet.
//
// --- Gemini's Enhancements ---
// - Changed card flip trigger in detail modal from hover to click for touch-device compatibility.
// - Added a visual icon to indicate when a card is flippable.
// - Updated hardcoded `http://` image URLs to `https://` to prevent mixed-content warnings.
// - Simplified modal flip state management.
// - Added optional password protection via Google Apps Script and a new 'Config' sheet.
// - Redesigned password screen to be more minimal.
// - Unified loading/password screens to prevent logo movement and remove the unlock button.
// - Added logo pulse animation during password check and removed error text/placeholder.
// - Refactored authentication logic to ensure password check pulse animation works correctly.
// - Made the logo fade consistent across all loading phases.
// - Changed password field background to match page, and change on focus.
// - Made the password field non-focused on load by removing autoFocus.

// ------------------------------
// 1) Types & sample data
// ------------------------------
export type Edition = '1st' | 'Unlim';

export type PokeCard = {
  id: string;
  nameEN: string;
  nameJP?: string;
  number: string;
  set: string;
  year: number;
  rarity?: string;
  types: string[];
  language?: string;
  graded?: boolean;
  grade?: string;
  priceUSD?: number;
  image: string;
  imageBack?: string;
  notesEN?: string;
  notesJP?: string;
  illustrator?: string;
  era?: string;
  originEN?: string;
  originJP?: string;
  release?: string;
  population?: { psa8: number; psa9: number; psa10: number; bgsBL: number | null };
  isMew?: boolean;
  isCameo?: boolean;
  isIntl?: boolean;
  edition?: Edition;
  pc?: string;
};

// ------------------------------
// 2) Pure helpers
// ------------------------------
export type SortKey = "releaseAsc" | "releaseDesc" | "yearDesc" | "yearAsc" | "name" | "rarity";
export type FilterState = { q: string; mew: boolean; cameo: boolean; intl: boolean; sortBy: SortKey };

function applyFilters(cards: PokeCard[], f: FilterState): PokeCard[] {
  let items = [...cards];

  // 1. Filter by search query
  if (f.q.trim()) {
    const term = f.q.trim().toLowerCase();
    items = items.filter((c) =>
      [c.nameEN, c.nameJP, c.number, c.set, c.rarity, c.notesEN, c.notesJP, c.originEN, c.originJP]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }

  // 2. Filter by category toggles (Mew, Cameo, Intl)
  const anyTag = f.mew || f.cameo || f.intl;
  if (!anyTag) return [];

  items = items.filter(
    (c) => (f.mew && c.isMew) || (f.cameo && c.isCameo) || (f.intl && c.isIntl)
  );
  
  // 3. Apply sorting
  switch (f.sortBy) {
    case "releaseAsc": items.sort((a, b) => releaseTs(a) - releaseTs(b)); break;
    case "releaseDesc": items.sort((a, b) => releaseTs(b) - releaseTs(a)); break;
    case "yearAsc": items.sort((a, b) => a.year - b.year); break;
    case "name": items.sort((a, b) => a.nameEN.localeCompare(b.nameEN)); break;
    case "rarity": items.sort((a, b) => (a.rarity || "").localeCompare(b.rarity || "")); break;
    default: items.sort((a, b) => b.year - a.year);
  }
  return items;
}

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

function formatDate(dateString: string | undefined): string | undefined {
  if (!dateString) {
    return undefined;
  }
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return dateString;
  }
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');

  if (year < 1990 || year > 2050) {
      return dateString;
  }

  return `${year}-${month}-${day}`;
}

const IMG_FALLBACK = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 420'><rect width='100%' height='100%' fill='%23121212'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-family='sans-serif' font-size='14'>Image unavailable</text></svg>`;
function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget; if (img.src !== IMG_FALLBACK) img.src = IMG_FALLBACK;
}

// ------------------------------
// 3) Google Sheets loader (via Apps Script)
// ------------------------------
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyeuOPhbDRtfzwDes3xku0AQi4me0o2zgsSdEBMOKWArzai28lS-wHeOWuui8FI8pf81Q/exec";
const TAB_MAPPINGS = { mew: "Japanese", cameo: "Cameo", intl: "Unique" } as const;
const APP_VERSION = "18.1";

function parseBool(x: string | undefined): boolean | undefined {
  if (!x) return undefined;
  const s = x.trim().toLowerCase();
  return s === "true" || s === "1" ? true : s === "false" || s === "0" ? false : undefined;
}

function normalizePC(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return undefined;
  if (trimmed === "RAW") return "RAW";
  const match = trimmed.match(/^PSA\s?(\d{1,2})$/);
  if (!match) return undefined;
  const grade = Number.parseInt(match[1], 10);
  if (!Number.isFinite(grade) || grade < 1 || grade > 10) return undefined;
  return `PSA${grade}`;
}

function stripBOM(s: string): string { return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

function slugify(...parts: Array<string | undefined>): string {
  const s = parts.filter(Boolean).join(" ").trim().toLowerCase();
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "row";
}

function releaseTs(card: PokeCard): number {
  if (card.release) {
    const t = Date.parse(card.release);
    if (!Number.isNaN(t)) return t;
  }
  if (Number.isFinite(card.year) && card.year > 0) {
    return new Date(card.year, 0, 1).getTime();
  }
  return Number.POSITIVE_INFINITY;
}

// ------------------------------
// 3.1) CSV parser (handles quotes, commas, CRLF)
// ------------------------------
function parseCSV(csv: string): PokeCard[] {
  csv = stripBOM(csv);
  const rows: string[][] = [];
  let i = 0, field = '', row: string[] = [], inQuotes = false;
  while (i < csv.length) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') { if (csv[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      field += ch; i++; continue;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field.trim()); field = ''; i++; continue; }
      if (ch === '\n' || ch === '\r') { if (ch === '\r' && csv[i + 1] === '\n') i++; row.push(field.trim()); field = ''; if (row.some(c => c.length > 0)) rows.push(row); row = []; i++; continue; }
      field += ch; i++; continue;
    }
  }
  row.push(field.trim());
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => stripBOM(h).trim());
  const lc = headers.map(h => h.toLowerCase());
  const findIdx = (name: string, aliases: string[] = []) => {
    const target = name.toLowerCase();
    let j = lc.indexOf(target); if (j >= 0) return j;
    for (const a of aliases) { const k = lc.indexOf(a.toLowerCase()); if (k >= 0) return k; }
    return -1;
  };

  const idxId = findIdx('id', ['card_id']);
  const idxNameEN = findIdx('name en', ['name']);
  const idxNameJP = findIdx('name jp', ['name_jp']);
  const idxNotesEN = findIdx('notes en', ['notes']);
  const idxNotesJP = findIdx('notes jp', ['notes_jp']);
  const idxOriginEN = findIdx('origin en', ['origin']);
  const idxOriginJP = findIdx('origin jp', ['origin_jp']);
  const idxNumber = findIdx('number', ['no', 'card no', 'card #']);
  const idxSet = findIdx('set', ['set name', 'series']);
  const idxYear = findIdx('year');
  const idxRelease = findIdx('release', ['release date', 'released']);
  const idxRarity = findIdx('rarity');
  const idxTypes = findIdx('types');
  const idxLang = findIdx('language', ['lang']);
  const idxImage = findIdx('image front', ['image', 'image_front', 'image url', 'image_url', 'img', 'image link']);
  const idxImageBack = findIdx('image back', ['image_back']);
  const idxIllus = findIdx('illustrator', ['artist']);
  const idxEra = findIdx('era');
  const idxIsMew = findIdx('isMew', ['ismew']);
  const idxIsCameo = findIdx('isCameo', ['iscameo']);
  const idxIsIntl = findIdx('isIntl', ['isintrl', 'international']);
  const idxEdition = findIdx('edition');
  const idxPSA8 = findIdx('psa8');
  const idxPSA9 = findIdx('psa9');
  const idxPSA10 = findIdx('psa10');
  const idxBGSBL = findIdx('bgsBL', ['bgs bl', 'bgs_black_label']);
  const idxPC = findIdx('pc');

  const out: PokeCard[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const get = (j: number) => (j >= 0 && j < cols.length ? cols[j] : '');
    const nameENRaw = get(idxNameEN);
    const nameJPRaw = get(idxNameJP);
    const nameEN = nameENRaw || nameJPRaw;
    const image = get(idxImage) || IMG_FALLBACK;
    if (!nameEN) continue;

    const typesField = get(idxTypes);
    const types = typesField ? typesField.split('|').map(t => t.trim()).filter(Boolean) : [];
    const bgsBLRaw = get(idxBGSBL);
    const pop = { 
        psa8: Number(get(idxPSA8) || 0), 
        psa9: Number(get(idxPSA9) || 0), 
        psa10: Number(get(idxPSA10) || 0), 
        bgsBL: bgsBLRaw === '' ? null : Number(bgsBLRaw)
    };
    const hasPsaData = pop.psa8 > 0 || pop.psa9 > 0 || pop.psa10 > 0;
    const hasBgsData = pop.bgsBL !== null;
    const maybePop = (hasPsaData || hasBgsData) ? pop : undefined;
    
    const edition = (get(idxEdition) as Edition) || undefined;
    const yearRaw = get(idxYear);
    const yearNum = Number.parseInt(yearRaw, 10);
    const id = get(idxId) || slugify(nameEN, get(idxSet), get(idxNumber), String(r));

    const card: PokeCard = {
      id,
      nameEN,
      nameJP: nameJPRaw || undefined,
      notesEN: get(idxNotesEN) || undefined,
      notesJP: get(idxNotesJP) || undefined,
      originEN: get(idxOriginEN) || undefined,
      originJP: get(idxOriginJP) || undefined,
      number: get(idxNumber),
      set: get(idxSet) || "",
      year: Number.isFinite(yearNum) ? yearNum : 0,
      rarity: get(idxRarity) || undefined,
      types,
      language: get(idxLang) || undefined,
      image,
      imageBack: get(idxImageBack) || undefined,
      illustrator: get(idxIllus) || undefined,
      era: get(idxEra) || undefined,
      release: get(idxRelease) || undefined,
      isMew: parseBool(get(idxIsMew)),
      isCameo: parseBool(get(idxIsCameo)),
      isIntl: parseBool(get(idxIsIntl)),
      edition,
      population: maybePop,
      pc: normalizePC(get(idxPC)),
    };
    out.push(card);
  }
  return out;
}

function mergeCardsNoDedupe(groups: Array<{ cards: PokeCard[]; flag: 'isMew' | 'isCameo' | 'isIntl' }>): PokeCard[] {
  const prefix = (flag: 'isMew' | 'isCameo' | 'isIntl') => flag === 'isMew' ? 'mew' : flag === 'isCameo' ? 'cameo' : 'intl';
  const out: PokeCard[] = [];
  for (const g of groups) {
    const p = prefix(g.flag);
    g.cards.forEach((c, index) => {
      const uniqueId = slugify(p, c.nameEN, c.set, c.number, String(c.year), String(index));
      out.push({ ...c, id: uniqueId, [g.flag]: true });
    });
  }
  return out;
}

// ------------------------------
// 3.2) 3D tilt + glare (hover)
// ------------------------------
const TiltCardButton: React.FC<{ ariaLabel: string; onClick: () => void; children: React.ReactNode }> = ({ ariaLabel, onClick, children }) => {
  const ref = React.useRef<HTMLButtonElement>(null);
  const glareRef = React.useRef<HTMLDivElement>(null);
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const reset = () => {
    const el = ref.current; if (!el) return;
    el.style.transition = 'transform 150ms ease';
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
    if (glareRef.current) glareRef.current.style.opacity = '0';
    window.setTimeout(() => { if (el) el.style.transition = ''; }, 160);
  };

  const onMove = (e: React.MouseEvent) => {
    if (prefersReduced) return;
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    const max = 24; // degrees of tilt
    const rx = (py - 0.5) * -max; // rotateX
    const ry = (px - 0.5) * max; // rotateY

    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;

    if (glareRef.current) {
      const tiltMag = Math.min(1, Math.hypot(rx, ry) / max);
      const gx = 50 + (-ry / max) * 35; // percent across X based on rotateY
      const gy = 50 + (rx / max) * 35; // percent down Y based on rotateX
      const baseAlpha = 0.45 + 0.25 * tiltMag;
      const alpha = (baseAlpha * 0.70).toFixed(2);
      glareRef.current.style.opacity = `${alpha}`;
      glareRef.current.style.background = `radial-gradient(650px circle at ${gx}% ${gy}%, rgba(255,255,255,${alpha}), transparent 40%)`;
    }
  };

  return (
    <button
      ref={ref}
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onMouseEnter={() => { const el = ref.current; if (el) el.style.willChange = 'transform'; }}
      className="group relative block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101010] focus-visible:ring-[#cb97a5] rounded-[4.2%]"
      style={{ transformStyle: 'preserve-3d' } as React.CSSProperties}
    >
      {children}
      <div ref={glareRef} className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen z-10 transition-opacity duration-150" />
    </button>
  );
};


// ------------------------------
// Background radial gradient (fixed)
// ------------------------------
const BackgroundGradient: React.FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 z-0"
    style={{
      background: `linear-gradient(to top left, rgba(203, 151, 165, 0.15), transparent 40%)`,
    }}
  />
);

// ------------------------------
// 4) Main component
// ------------------------------
export default function PokeCardGallery() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PokeCard | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"psa10" | "psa19" | "need" | "all">("all");
  const [isMobile, setIsMobile] = useState(false);
  const [statsSelected, setStatsSelected] = useState<PokeCard | null>(null);
  const [mew, setMew] = useState(true);
  const [cameo, setCameo] = useState(false);
  const [intl, setIntl] = useState(false);
  const [remoteCards, setRemoteCards] = useState<PokeCard[] | null>(null);
  const [releaseSortDesc, setReleaseSortDesc] = useState(false);
  const [language, setLanguage] = useState<'EN' | 'JP'>('JP');
  
  const [dataStatus, setDataStatus] = useState<'loading' | 'loaded' | 'fallback'>('loading');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [swirlEpoch] = useState(() => Date.now());
  const swirlDelay = useMemo(() => -((Date.now() - swirlEpoch) % 5000) / 1000, [swirlEpoch]);

  useEffect(() => { document.title = "Mew"; }, []);

  useEffect(() => {
    if (!showStats) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowStats(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showStats]);

  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.matchMedia("(max-width: 639px)").matches);
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  // Check if password is required on initial load
  useEffect(() => {
    const checkAuth = async () => {
        try {
            const res = await fetch(`${APPS_SCRIPT_URL}?action=getConfig`);
            const config = await res.json();
            if (config.passwordEnabled) {
                setPasswordRequired(true);
            } else {
                setIsAuthenticated(true);
            }
        } catch (error) {
            console.error("Failed to fetch config:", error);
            // Fallback to public if config fails to load
            setIsAuthenticated(true); 
        } finally {
            setAuthChecked(true);
        }
    };
    checkAuth();
  }, []);

  // This effect handles all data fetching, for both public and private galleries.
  useEffect(() => {
    // Don't run until we know if the gallery is public or private.
    if (!authChecked) return;
    
    const fetchAllSheets = async () => {
      const sources: { name: string, flag: 'isMew' | 'isCameo' | 'isIntl' }[] = [
        { name: TAB_MAPPINGS.mew, flag: 'isMew' },
        { name: TAB_MAPPINGS.cameo, flag: 'isCameo' },
        { name: TAB_MAPPINGS.intl, flag: 'isIntl' },
      ];

      const results = await Promise.allSettled(
        sources.map(s => {
          let url = `${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(s.name)}`;
          if (passwordRequired) {
              url += `&password=${encodeURIComponent(password)}`;
          }
          return fetch(url).then(async res => {
              const text = await res.text();
              if (text.startsWith("Error: Authentication Failed")) {
                  throw new Error("Authentication Failed");
              }
              if (!res.ok && !text.startsWith("Error:")) {
                  throw new Error(`Failed to fetch sheet "${s.name}": ${res.statusText}`);
              }
              return text;
          });
        })
      );
      
      const authFailed = results.some(r => r.status === 'rejected' && r.reason.message === "Authentication Failed");

      if (authFailed) {
          setPassword(""); // Clear incorrect password
          setRemoteCards(null);
          setIsAuthenticating(false); // Stop pulse on failure
          return;
      }

      // --- AUTHENTICATION SUCCESS ---
      const successfulGroups = results.reduce<Array<{ cards: PokeCard[]; flag: 'isMew' | 'isCameo' | 'isIntl' }>>((acc, result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          const cards = parseCSV(result.value);
          if (cards.length > 0) {
            acc.push({ cards, flag: sources[i].flag });
          }
        } else if (result.status === 'rejected') {
          console.error(`Error fetching sheet "${sources[i].name}":`, result.reason);
        }
        return acc;
      }, []);

      if (successfulGroups.length > 0) {
        setRemoteCards(mergeCardsNoDedupe(successfulGroups));
        setDataStatus('loaded');
      } else {
        setRemoteCards(null);
        setDataStatus('fallback');
      }
      setIsAuthenticated(true); // Grant access
    };
    
    // Run if it's a public gallery, or if a password has been submitted.
    if ((!passwordRequired && authChecked) || password) {
        fetchAllSheets();
    }
  }, [password, passwordRequired, authChecked]);


  const sourceCards = useMemo(() => remoteCards ?? [], [remoteCards]);

  useEffect(() => {
    if (dataStatus !== 'loaded' || !isAuthenticated) return;

    const imageUrls = sourceCards.flatMap(card => [card.image, card.imageBack]).filter(Boolean) as string[];
    if (imageUrls.length === 0) {
      setImagesLoaded(true);
      return;
    }

    let loadedCount = 0;
    const totalCount = imageUrls.length;
    setLoadingProgress(0);
    setImagesLoaded(false);

    imageUrls.forEach(url => {
      const img = new Image();
      img.src = url;
      const onFinish = () => {
        loadedCount++;
        const progress = Math.round((loadedCount / totalCount) * 100);
        setLoadingProgress(progress);
        if (loadedCount === totalCount) {
          setTimeout(() => setImagesLoaded(true), 400);
        }
      };
      img.onload = onFinish;
      img.onerror = onFinish;
    });
  }, [sourceCards, dataStatus, isAuthenticated]);


  const filtered = useMemo(() => applyFilters(sourceCards, { q, mew, cameo, intl, sortBy: releaseSortDesc ? "releaseDesc" : "releaseAsc" }), [q, mew, cameo, intl, sourceCards, releaseSortDesc]);

  const ownedStats = useMemo(() => {
    const total = sourceCards.length;
    const psa10Cards = sourceCards.filter((card) => card.pc === "PSA10");
    const psa10 = psa10Cards.length;
    const lowerGrades = Array.from({ length: 9 }, (_, i) => `PSA${i + 1}`);
    const psa19Cards = sourceCards.filter((card) => lowerGrades.includes(card.pc || ""));
    const needCards = sourceCards.filter((card) => card.pc !== "PSA10");
    return { total, psa10, psa10Cards, psa19Cards, needCards, allCards: sourceCards };
  }, [sourceCards]);

  const activeStatsCards = useMemo(() => {
    switch (detailsTab) {
      case "psa10":
        return ownedStats.psa10Cards;
      case "psa19":
        return ownedStats.psa19Cards;
      case "need":
        return ownedStats.needCards;
      default:
        return ownedStats.allCards;
    }
  }, [detailsTab, ownedStats]);

  useEffect(() => {
    if (activeStatsCards.length === 0) {
      setStatsSelected(null);
      return;
    }
    if (!statsSelected || !activeStatsCards.some((card) => card.id === statsSelected.id)) {
      setStatsSelected(activeStatsCards[0]);
    }
  }, [activeStatsCards, statsSelected]);

  const handlePasswordSubmit = (submittedPassword: string) => {
    setIsAuthenticating(true); // Start pulse
    setPassword(submittedPassword); // Set password to trigger data fetch effect
  };

  if (!authChecked || !imagesLoaded || (passwordRequired && !isAuthenticated)) {
    return (
      <LoadingScreen
        progress={loadingProgress}
        swirlDelay={swirlDelay}
        showPassword={passwordRequired && !isAuthenticated}
        onPasswordSubmit={handlePasswordSubmit}
        isAuthenticating={isAuthenticating}
      />
    );
  }

  return (
    <div className="relative min-h-screen bg-[#101010] font-sans text-gray-100">
      <BackgroundGradient />
      <header className="sticky top-0 z-40 border-b border-[#2a2a2a]/60 bg-black/30 backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 py-2">
          <div className="flex w-full flex-row flex-wrap items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <img src="https://mew.cards/img/logo.png" alt="Mew Cards Logo" className="h-8 w-8" />
              <div>
                <h1 className="text-base sm:text-lg font-semibold tracking-tight">Mew</h1>
                <div className="-mt-0.5 text-[11px] text-gray-400">Complete Japanese List</div>
              </div>
            </div>
            <div className="flex w-full flex-row flex-wrap items-center gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <div className="flex flex-wrap items-center gap-1">
                <Toggle label="Mew" active={mew} onClick={() => setMew(v => !v)} />
                <Toggle label="Cameo" active={cameo} onClick={() => setCameo(v => !v)} />
                <Toggle label="Intl" active={intl} onClick={() => setIntl(v => !v)} />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReleaseSortDesc(v => !v)}
                  aria-label={releaseSortDesc ? "Sort by date: new to old" : "Sort by date: old to new"}
                  className="hidden sm:inline-flex text-[12px] text-gray-400 hover:text-gray-200 px-1 py-0.5 rounded outline-none focus:outline-none"
                >
                  {releaseSortDesc ? "Date ▼" : "Date ▲"}
                </button>
                <div className="relative w-36 sm:w-60">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-8 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm px-3 pr-8 text-[13px] text-gray-200 placeholder:text-gray-400 shadow-sm outline-none focus:ring-2 focus:ring-[#cb97a5]" />
                {q && (
                  <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-500 hover:text-gray-200 hover:bg-[#2f2f2f]" aria-label="Clear search">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-8 pb-16">
        {filtered.length === 0 ? (
          <EmptyState />)
        : (
          <ul key={`sort:${releaseSortDesc ? "releaseDesc" : "releaseAsc"}`} className="grid grid-cols-2 gap-6 sm:gap-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((card) => {
              const displayName = (language === 'JP' && card.nameJP) ? card.nameJP : card.nameEN;
              return (
                <li key={card.id}>
                  <TiltCardButton onClick={() => setSelected(card)} ariaLabel={`Open details for ${displayName} ${card.set} ${card.number}`}>
                    <div className="relative aspect-[63/88] w-full overflow-hidden bg-[#0f0f0f]" style={{ borderRadius: "4.7% / 3.4%" }}>
                      <img src={card.image} alt={displayName} className="h-full w-full object-fill" style={{ aspectRatio: '63/88' }} onError={handleImgError} referrerPolicy="strict-origin-when-cross-origin" />
                    </div>
                  </TiltCardButton>
                  <div className="mt-1.5 flex h-5 items-center justify-between gap-1.5 px-1">
                    <span className="text-[10px] font-semibold text-[#cb97a5] truncate">
                      {card.number && card.number !== "N/A" ? card.number : ''}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {card.year ? <InfoPill label={String(card.year)} /> : null}
                      {card.rarity ? <InfoPill label={card.rarity} /> : null}
                      {card.edition ? <InfoPill label={card.edition} /> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <button
        type="button"
        onClick={() => setShowStats(true)}
        aria-label="Open owned card stats"
        className="fixed bottom-4 left-4 z-50 rounded-lg sm:rounded-none p-2 sm:p-1.5 bg-black/50 sm:bg-transparent border border-white/10 sm:border-transparent focus:outline-none"
      >
        <img
          src="https://mew.cards/img/logo.png"
          alt="Owned stats"
          className="h-4 w-4 opacity-50 grayscale transition-opacity duration-150 hover:opacity-100"
        />
      </button>
      {showStats && (
        <StatsModal
          onClose={() => setShowStats(false)}
          stats={ownedStats}
          onSelectCard={(card) => setStatsSelected(card)}
          selectedCard={statsSelected}
          onOpenCard={(card) => {
            setSelected(card);
            setShowStats(false);
          }}
          isMobile={isMobile}
          detailsTab={detailsTab}
          setDetailsTab={setDetailsTab}
        />
      )}
      {selected && <DetailModal card={selected} onClose={() => setSelected(null)} language={language} setLanguage={setLanguage} />}
    </div>
  );
}

// ------------------------------
// Reusable bits
// ------------------------------
const InfoPill: React.FC<{ label: string }> = ({ label }) => (
  <span className="rounded bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300 backdrop-blur-sm">
    {label}
  </span>
);

const Toggle: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={classNames(
      "rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm focus:outline-none focus:ring-1 transition-colors",
      active ? "border-[#cb97a5] bg-[#cb97a5]/15 text-[#cb97a5] ring-[#cb97a5]" : "border-gray-500 bg-transparent text-gray-300 hover:bg-[#cb97a5]/10 ring-transparent"
    )}
    aria-pressed={active}
  >{label}</button>
);

const Tag: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-gray-200 border-[#2a2a2a] bg-[#151515]">{label}</span>
);

const InfoBubble: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-gray-400 leading-tight">{label}</div>
    <div className="text-sm text-gray-200 leading-snug">{value || "—"}</div>
  </div>
);

const PopStat: React.FC<{ value: number | string; label: string; pill?: boolean }> = ({ value, label, pill }) => (
  <div className="text-center">
    <div className="text-2xl font-semibold text-gray-100 leading-none">{value}</div>
    <div className="mt-0.5 text-[11px] text-gray-400">{pill ? <span className="rounded bg-black px-2 py-0.5 font-semibold text-gray-100">{label}</span> : label}</div>
  </div>
);

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#2a2a2a] bg-[#121212] px-6 py-16 text-center text-gray-400">
    <div className="text-4xl">🔍</div>
    <div className="text-sm">No cards match your filters.</div>
  </div>
);

const StatsModal: React.FC<{
  onClose: () => void;
  stats: {
    total: number;
    psa10: number;
    psa10Cards: PokeCard[];
    psa19Cards: PokeCard[];
    needCards: PokeCard[];
    allCards: PokeCard[];
  };
  onSelectCard: (card: PokeCard) => void;
  selectedCard: PokeCard | null;
  onOpenCard: (card: PokeCard) => void;
  isMobile: boolean;
  detailsTab: "psa10" | "psa19" | "need" | "all";
  setDetailsTab: React.Dispatch<React.SetStateAction<"psa10" | "psa19" | "need" | "all">>;
}> = ({
  onClose,
  stats,
  onSelectCard,
  selectedCard,
  onOpenCard,
  isMobile,
  detailsTab,
  setDetailsTab,
}) => (
  <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
    <div className="relative w-full max-w-3xl h-[100dvh] overflow-hidden rounded-none sm:rounded-3xl border border-[#2a2a2a] bg-[#161616] shadow-2xl sm:h-[80vh]" onClick={(e) => e.stopPropagation()}>
      <div className="stats-scroll flex h-full max-h-[100dvh] flex-col overflow-y-auto px-5 pb-6 pt-2 sm:h-full sm:max-h-none sm:overflow-hidden sm:px-6 sm:pt-6">
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-gray-100">PSA10 {stats.total ? `${stats.psa10}/${stats.total}` : "0/0"}</div>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full progress-hatch"
            style={{
              backgroundColor: "#262626",
              backgroundImage: "repeating-linear-gradient(135deg, rgba(244,114,182,0.28) 0 2px, rgba(0,0,0,0) 2px 6px)",
            }}
          >
            <div
              className="h-full bg-emerald-300 transition-all"
              style={{ width: `${stats.total ? Math.round((stats.psa10 / stats.total) * 100) : 0}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-gray-400">
            Total cards: {stats.total} · PSA10 progress: {stats.total ? `${stats.psa10}/${stats.total}` : "0/0"}
          </div>
          {stats.total === 0 && (
            <div className="mt-3 text-xs text-gray-500">No cards loaded yet.</div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap">
          <div className="flex items-center gap-2 rounded-full border border-[#2a2a2a] bg-[#141414] p-1">
            <button
              type="button"
              onClick={() => setDetailsTab("all")}
              className={classNames(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                detailsTab === "all" ? "bg-[#cb97a5]/20 text-[#cb97a5]" : "text-gray-400 hover:text-gray-200"
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setDetailsTab("need")}
              className={classNames(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                detailsTab === "need" ? "bg-[#cb97a5]/20 text-[#cb97a5]" : "text-gray-400 hover:text-gray-200"
              )}
            >
              Need
            </button>
            <button
              type="button"
              onClick={() => setDetailsTab("psa19")}
              className={classNames(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                detailsTab === "psa19" ? "bg-[#cb97a5]/20 text-[#cb97a5]" : "text-gray-400 hover:text-gray-200"
              )}
            >
              PSA1-9
            </button>
            <button
              type="button"
              onClick={() => setDetailsTab("psa10")}
              className={classNames(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                detailsTab === "psa10" ? "bg-[#cb97a5]/20 text-[#cb97a5]" : "text-gray-400 hover:text-gray-200"
              )}
            >
              PSA10
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:flex-1 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] sm:overflow-hidden">
          <div className="stats-scroll stats-scroll-edge rounded-l-2xl rounded-r-none border border-[#2a2a2a] bg-[#141414] overflow-hidden pr-1 sm:min-h-0 sm:overflow-y-auto">
            <div className="space-y-4">
              {detailsTab === "psa10" && (
                <StatsList
                  cards={stats.psa10Cards}
                  onSelectCard={isMobile ? onOpenCard : onSelectCard}
                  selectedId={selectedCard?.id || null}
                  containerClassName="rounded-none border-0 bg-transparent p-4"
                />
              )}
              {detailsTab === "psa19" && (
                <StatsList
                  cards={stats.psa19Cards}
                  onSelectCard={isMobile ? onOpenCard : onSelectCard}
                  selectedId={selectedCard?.id || null}
                  containerClassName="rounded-none border-0 bg-transparent p-4"
                />
              )}
              {detailsTab === "need" && (
                <StatsList
                  cards={stats.needCards}
                  onSelectCard={isMobile ? onOpenCard : onSelectCard}
                  selectedId={selectedCard?.id || null}
                  containerClassName="rounded-none border-0 bg-transparent p-4"
                />
              )}
              {detailsTab === "all" && (
                <StatsList
                  cards={stats.allCards}
                  onSelectCard={isMobile ? onOpenCard : onSelectCard}
                  sortMode="release"
                  selectedId={selectedCard?.id || null}
                  containerClassName="rounded-none border-0 bg-transparent p-4"
                />
              )}
            </div>
          </div>
          <div className="hidden sm:flex sm:min-h-0 sm:flex-col">
            <StatsPreview card={selectedCard} onOpenCard={onOpenCard} />
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-3 w-full rounded-lg border border-[#cb97a5]/40 bg-[#cb97a5]/20 py-2 text-xs font-semibold text-[#f6d7df] sm:hidden"
        >
          Back to list
        </button>
      </div>
      <style>{`
        .stats-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(203, 151, 165, 0.45) rgba(20, 20, 20, 0.9);
        }
        .stats-scroll-edge {
          padding-right: 10px;
          margin-right: -10px;
        }
        .stats-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .stats-scroll::-webkit-scrollbar-track {
          background: rgba(20, 20, 20, 0.9);
        }
        .stats-scroll::-webkit-scrollbar-thumb {
          background: rgba(203, 151, 165, 0.45);
          border-radius: 999px;
          border: 2px solid rgba(20, 20, 20, 0.9);
        }
        .stats-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(203, 151, 165, 0.7);
        }
        .progress-hatch {
          background-size: 16px 16px;
          animation: hatchMove 1.5s linear infinite;
        }
        @keyframes hatchMove {
          from { background-position: 0 0; }
          to { background-position: 16px 0; }
        }
      `}</style>
    </div>
  </div>
);

const StatsList: React.FC<{
  cards: PokeCard[];
  onSelectCard: (card: PokeCard) => void;
  selectedId: string | null;
  sortMode?: "default" | "release";
  containerClassName?: string;
}> = ({ cards, onSelectCard, selectedId, sortMode = "default", containerClassName }) => (
  <div className={classNames("rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4", containerClassName)}>
    {cards.length === 0 ? (
      <div className="text-[11px] text-gray-500">None</div>
    ) : (
      <ul className="space-y-1">
        {[...cards]
          .sort((a, b) => {
            if (sortMode === "release") return releaseTs(a) - releaseTs(b);
            const yearA = a.year || 0;
            const yearB = b.year || 0;
            if (yearA !== yearB) return yearA - yearB;
            const numA = a.number || "";
            const numB = b.number || "";
            const numCmp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: "base" });
            if (numCmp !== 0) return numCmp;
            const nameA = a.nameJP || a.nameEN;
            const nameB = b.nameJP || b.nameEN;
            return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
          })
          .map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => onSelectCard(card)}
                className={classNames(
                  "grid w-full grid-cols-[40px_36px_52px_1fr] items-center gap-2 rounded-md px-1 py-1 text-left text-[10px] transition-colors sm:grid-cols-[52px_44px_64px_1fr] sm:text-[11px]",
                  selectedId === card.id
                    ? "bg-[#1f1f1f] text-gray-100"
                    : "text-gray-300 hover:bg-[#1b1b1b] hover:text-gray-100"
                )}
              >
                <span
                  className={classNames(
                    "text-[10px] font-semibold",
                    card.pc === "PSA10"
                      ? "text-emerald-300"
                      : card.pc
                        ? "text-rose-300"
                        : "text-gray-500"
                  )}
                >
                  {card.pc || ""}
                </span>
                <span className="text-gray-500">{card.year || "—"}</span>
                <span className="text-gray-500">{card.number || "—"}</span>
                <span className="text-gray-100">{card.nameJP || card.nameEN}</span>
              </button>
            </li>
          ))}
      </ul>
    )}
  </div>
);

const StatsPreview: React.FC<{ card: PokeCard | null; onOpenCard: (card: PokeCard) => void }> = ({ card, onOpenCard }) => (
  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-r-2xl rounded-l-none border border-[#2a2a2a] bg-[#141414] p-4">
    {!card ? (
      <div className="text-[11px] text-gray-500">Select a card to preview.</div>
    ) : (
      <div className="stats-scroll stats-scroll-edge flex-1 min-h-0 overflow-y-auto pr-2 space-y-3">
          <button
            type="button"
            onClick={() => onOpenCard(card)}
            className="relative w-full overflow-hidden border border-[#2a2a2a] bg-[#0f0f0f]"
            style={{ borderRadius: "4.7% / 3.4%" }}
            aria-label={`Open details for ${card.nameJP || card.nameEN}`}
          >
          <img
            src={card.image}
            alt={`${card.nameJP || card.nameEN} preview`}
            className="w-full h-auto object-contain"
            style={{ aspectRatio: "63 / 88" }}
            onError={handleImgError}
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </button>
        <div className="text-sm font-semibold text-gray-100 truncate">{card.nameJP || card.nameEN}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-gray-300">
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-500">Number</span>
            <span className="text-gray-100">{card.number || "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-500">Year</span>
            <span className="text-gray-100">{card.year ? String(card.year) : "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-500">Release</span>
            <span className="text-gray-100">{formatDate(card.release) || "—"}</span>
          </div>
          {card.rarity && (
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-500">Rarity</span>
              <span className="text-gray-100">{card.rarity}</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-500">Era</span>
            <span className="text-gray-100">{card.era || "—"}</span>
          </div>
          {card.edition && (
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-500">Edition</span>
              <span className="text-gray-100">{card.edition}</span>
            </div>
          )}
        </div>
        {(card.notesEN || card.notesJP) && (
          <div className="text-[11px] text-gray-300">
            <div className="text-gray-500">Notes</div>
            <div className="mt-1 text-gray-100 leading-snug">{card.notesEN || card.notesJP}</div>
          </div>
        )}
      </div>
    )}
  </div>
);

const LoadingScreen: React.FC<{
  progress: number;
  swirlDelay: number;
  showPassword?: boolean;
  onPasswordSubmit?: (password: string) => void;
  isAuthenticating?: boolean;
}> = ({ progress, swirlDelay, showPassword, onPasswordSubmit, isAuthenticating }) => {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input && !isAuthenticating && onPasswordSubmit) {
      onPasswordSubmit(input);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#101010] flex flex-col items-center justify-center gap-4 p-4">
      <div className="relative h-28 w-28">
        <div className="loading-swirl absolute inset-0" aria-hidden="true" style={{ animationDelay: `${swirlDelay}s` }} />
        <img
          src="https://mew.cards/img/logo.png"
          alt="Loading..."
          className="h-full w-full absolute top-0 left-0 opacity-25"
        />
        <img
          src="https://mew.cards/img/logo.png"
          alt="Loading..."
          className="h-full w-full absolute top-0 left-0 transition-all duration-300 ease-linear"
          style={{
            clipPath: `inset(${100 - progress}% 0 0 0)`
          }}
        />
      </div>
      {showPassword ? (
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 h-16 justify-start">
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-28 text-center h-10 rounded-lg border border-white/20 bg-[#101010] focus:bg-[#232323] px-3 text-sm text-gray-200 placeholder:text-gray-400 shadow-sm outline-none focus:ring-0 animate-password-in"
            placeholder=""
            disabled={isAuthenticating}
          />
          <div className="h-4" />
        </form>
      ) : (
        <div className="h-16" />
      )}
      <div className="pointer-events-none absolute bottom-4 left-4 text-[10px] font-semibold text-[#cb97a5]/80">v{APP_VERSION}</div>
      <style>{`
      @keyframes swirl {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes passwordIn {
        0% { opacity: 0; transform: translateY(6px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .loading-swirl {
        background: radial-gradient(circle at 30% 30%, rgba(255, 209, 221, 0.85), rgba(203, 151, 165, 0.35) 45%, rgba(16, 16, 16, 0) 70%);
        background-size: 200% 200%;
        opacity: 0.8;
        filter: blur(6px);
        animation: swirl 5s linear infinite;
        mask-image: url("https://mew.cards/img/logo.png");
        mask-size: contain;
        mask-repeat: no-repeat;
        mask-position: center;
        -webkit-mask-image: url("https://mew.cards/img/logo.png");
        -webkit-mask-size: contain;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position: center;
      }
      .animate-password-in {
        animation: passwordIn 500ms ease 150ms both;
      }
    `}</style>
    </div>
  );
};


const FlipIcon = () => (
  <div className="absolute bottom-2 right-2 z-20 rounded-full bg-black/50 p-2 text-white/80 backdrop-blur-sm">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
  </div>
);

const DetailModal: React.FC<{
  card: PokeCard;
  onClose: () => void;
  language: 'EN' | 'JP';
  setLanguage: React.Dispatch<React.SetStateAction<'EN' | 'JP'>>;
}> = ({ card, onClose, language, setLanguage }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  
  // Reset flip state when card changes
  useEffect(() => {
    setIsFlipped(false);
  }, [card.id]);

  const displayName = (language === 'JP' && card.nameJP) ? card.nameJP : card.nameEN;
  const displayNotes = (language === 'JP' && card.notesJP) ? card.notesJP : card.notesEN;
  const displayOrigin = (language === 'JP' && card.originJP) ? card.originJP : card.originEN;

  return (
  <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="relative h-[100dvh] w-full max-w-3xl overflow-y-auto sm:h-auto sm:max-h-[90vh] sm:overflow-hidden rounded-none sm:rounded-3xl border border-[#2a2a2a] bg-[#161616] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 rounded-full p-2 text-gray-400 hover:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-[#cb97a5]" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="flex flex-col items-center p-4 sm:p-6">
            <div
              className={classNames(
                  "relative w-full max-w-[520px] [perspective:2500px]",
                  card.imageBack && "cursor-pointer"
              )}
              onClick={() => { if (card.imageBack) setIsFlipped(f => !f); }}
            >
              <div
                className="relative w-full aspect-[63/88] transition-transform duration-700 [transform-style:preserve-3d]"
                style={{ transform: `rotateY(${isFlipped ? 180 : 0}deg)` }}
              >
                {/* Front */}
                <div className="absolute top-0 left-0 w-full h-full [backface-visibility:hidden] overflow-hidden bg-[#0f0f0f]" style={{ borderRadius: "4.7% / 3.4%" }}>
                  <img src={card.image} alt={`${displayName} front`} className="h-full w-full object-fill" style={{ aspectRatio: "63/88" }} onError={handleImgError} referrerPolicy="strict-origin-when-cross-origin" />
                </div>
                {/* Back */}
                {card.imageBack && (
                  <div className="absolute top-0 left-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-hidden bg-[#0f0f0f]" style={{ borderRadius: "4.7% / 3.4%" }}>
                    <img src={card.imageBack} alt={`${displayName} back`} className="h-full w-full object-fill" style={{ aspectRatio: "63/88" }} onError={handleImgError} referrerPolicy="strict-origin-when-cross-origin" />
                  </div>
                )}
              </div>
              {card.imageBack && !isFlipped && <FlipIcon />}
            </div>
          </div>
          <div className="flex flex-col space-y-3 p-4 pt-2 sm:p-6 sm:max-h-[80vh] sm:overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-4xl font-semibold text-gray-100 leading-tight">{displayName}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {card.number && card.number !== "N/A" && (
                    <p className="text-base font-semibold text-[#cb97a5]">{card.number}</p>
                  )}
                  {card.rarity && <Tag label={card.rarity} />}
                  {card.edition && (<span className="rounded bg-[#cb97a5]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#cb97a5]">{card.edition}</span>)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {card.set.includes("Promo") && (<span className="rounded bg-[#cb97a5]/15 px-2 py-0.5 text-[11px] font-semibold text-[#cb97a5]">Promo</span>)}
              {card.isIntl && (<span className="rounded bg-[#cb97a5]/15 px-2 py-0.5 text-[11px] font-semibold text-[#cb97a5]">Intl</span>)}
              {card.isCameo && (<span className="rounded bg-[#cb97a5]/15 px-2 py-0.5 text-[11px] font-semibold text-[#cb97a5]">Cameo</span>)}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-2 gap-2">
                <InfoBubble label="Release Date" value={formatDate(card.release) || (card.year ? String(card.year) : undefined)} />
                <InfoBubble label="Era" value={card.era} />
              </div>
              <InfoBubble label="Illustrator" value={card.illustrator} />
              {displayOrigin && <InfoBubble label="Origin" value={displayOrigin} />}
            </div>

            {displayNotes && <InfoBubble label="Notes" value={displayNotes} />}

            {card.population && (
              <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-3">
                <div className="grid grid-cols-4 gap-3">
                  <PopStat value={card.population.psa8} label="PSA8" />
                  <PopStat value={card.population.psa9} label="PSA9" />
                  <PopStat value={card.population.psa10} label="PSA10" />
                  <PopStat value={card.population.bgsBL === null ? '—' : card.population.bgsBL} label="BGS BL" pill />
                </div>
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-lg border border-[#cb97a5]/40 bg-[#cb97a5]/20 py-2 text-xs font-semibold text-[#f6d7df] sm:hidden"
            >
              Back to list
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLanguage(l => (l === 'JP' ? 'EN' : 'JP'))}
          aria-label="Toggle language"
          className="absolute bottom-4 right-4 z-20 rounded-full border border-[#cb97a5] bg-[#1a1a1a] px-2.5 py-1 text-xs font-medium text-gray-300 shadow-sm hover:bg-[#1f1f1f] focus:outline-none focus:bg-[#2f2f2f]"
        >
          {language}
        </button>
      </div>
    </div>
  );
};

// ------------------------------
// 5) Dev tests (run in browser console)
// ------------------------------
function runDevTests() {
  console.log("--- Running Dev Tests ---");
  const base: PokeCard[] = [
    { id: "a", nameEN: "Mew EN", nameJP: "ミュウ", number: "001", set: "Test", year: 2000, types: [], image: "a.png", isMew: true, edition: "1st" },
    { id: "b", nameEN: "Lugia Cameo", nameJP: "ルギア", number: "002", set: "Test", year: 2001, types: [], image: "b.png", isCameo: true },
    { id: "c", nameEN: "Mew Intl", number: "003", set: "Test", year: 2002, types: [], image: "c.png", isMew: true, isIntl: true, edition: "Unlim" },
  ];

  let out = applyFilters(base, { q: "ミュウ", mew: true, cameo: true, intl: true, sortBy: "yearDesc" });
  console.assert(out.length === 1 && out[0].id === 'a', "Test Failed: search by Japanese name");

  const csv = "name en,name jp,notes en,notes jp,origin en,origin jp,image front,image back\nCard1,カード1,Note1,ノート1,USA,米国,https://a.png,https://b.png\n";
  const parsed = parseCSV(csv);
  console.assert(parsed.length === 1 && parsed[0].nameEN === "Card1" && parsed[0].nameJP === "カード1", "Test Failed: parseCSV name en/jp");
  console.assert(parsed[0].notesEN === "Note1" && parsed[0].notesJP === "ノート1", "Test Failed: parseCSV notes en/jp");
  console.assert(parsed[0].originEN === "USA" && parsed[0].originJP === "米国", "Test Failed: parseCSV origin en/jp");
  console.assert(parsed[0].image === "https://a.png" && parsed[0].imageBack === "https://b.png", "Test Failed: parseCSV image front/back");
  
  console.log("--- All Tests Passed ---");
}

// To run tests, open the browser console and call runDevTests()
// runDevTests();
