import React, { useEffect, useMemo, useState } from "react";
import CursorEffect from './CursorEffect';


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

// IMPROVEMENT: Add a date formatting utility
function formatDate(dateString: string | undefined): string | undefined {
  if (!dateString) {
    return undefined;
  }
  // Handles cases where the date might be a full string or just YYYY-MM-DD
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    // Return original string if it's not a valid date
    return dateString;
  }
  // Use UTC methods to avoid timezone issues where the date could be off by one day.
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');

  // Check for a plausible year, otherwise it might be a parsing error.
  if (year < 1990 || year > 2050) {
      return dateString;
  }

  return `${year}-${month}-${day}`;
}

// Force image fallback for hosts that block hotlinking
const IMG_FALLBACK = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 420'><rect width='100%' height='100%' fill='%23121212'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-family='sans-serif' font-size='14'>Image unavailable</text></svg>`;
function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget; if (img.src !== IMG_FALLBACK) img.src = IMG_FALLBACK;
}

// ------------------------------
// 3) Google Sheets loader (via Apps Script)
// ------------------------------
// IMPORTANT: Replace this placeholder with your own Google Apps Script URL.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxc3FK3fiSRtFEGPlChV07IdbOwGw59i_FM8J9V58m5z-U77eqdsqt3-LyKR-Low49guw/exec";
const TAB_MAPPINGS = { mew: "Japanese", cameo: "Cameo", intl: "Unique" } as const;

function parseBool(x: string | undefined): boolean | undefined {
  if (!x) return undefined;
  const s = x.trim().toLowerCase();
  return s === "true" || s === "1" ? true : s === "false" || s === "0" ? false : undefined;
}

function stripBOM(s: string): string { return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

function slugify(...parts: Array<string | undefined>): string {
  const s = parts.filter(Boolean).join(" ").trim().toLowerCase();
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "row";
}

// Release timestamp used for sorting; falls back to Jan 1 of `year` when `release` is missing/invalid
function releaseTs(card: PokeCard): number {
  if (card.release) {
    const t = Date.parse(card.release);
    if (!Number.isNaN(t)) return t;
  }
  if (Number.isFinite(card.year) && card.year > 0) {
    return new Date(card.year, 0, 1).getTime();
  }
  return Number.POSITIVE_INFINITY; // push unknowns to the end for ascending
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

  const out: PokeCard[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const get = (j: number) => (j >= 0 && j < cols.length ? cols[j] : '');
    const nameEN = get(idxNameEN);
    const image = get(idxImage);
    if (!nameEN || !image) continue;

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
      nameJP: get(idxNameJP) || undefined,
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
export default function App() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PokeCard | null>(null);
  const [mew, setMew] = useState(true);
  const [cameo, setCameo] = useState(false);
  const [intl, setIntl] = useState(false);
  const [remoteCards, setRemoteCards] = useState<PokeCard[] | null>(null);
  const [releaseSortDesc, setReleaseSortDesc] = useState(false);
  const [language, setLanguage] = useState<'EN' | 'JP'>('JP');
  
  const [dataStatus, setDataStatus] = useState<'loading' | 'loaded' | 'fallback'>('loading');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  useEffect(() => { document.title = "Japanese Mews"; }, []);

  useEffect(() => {

    const fetchAllSheets = async () => {
      const sources: { name: string, flag: 'isMew' | 'isCameo' | 'isIntl' }[] = [
        { name: TAB_MAPPINGS.mew, flag: 'isMew' },
        { name: TAB_MAPPINGS.cameo, flag: 'isCameo' },
        { name: TAB_MAPPINGS.intl, flag: 'isIntl' },
      ];

      const results = await Promise.allSettled(
        sources.map(s => fetch(`${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(s.name)}`).then(res => {
          if (!res.ok) throw new Error(`Failed to fetch sheet "${s.name}": ${res.statusText}`);
          return res.text();
        }))
      );
      
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
    };
    fetchAllSheets();
  }, []);

  const sourceCards = useMemo(() => remoteCards ?? [], [remoteCards]);

  useEffect(() => {
    if (dataStatus === 'loading' && sourceCards.length === 0) return;

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
  }, [sourceCards, dataStatus]);


  const filtered = useMemo(() => applyFilters(sourceCards, { q, mew, cameo, intl, sortBy: releaseSortDesc ? "releaseDesc" : "releaseAsc" }), [q, mew, cameo, intl, sourceCards, releaseSortDesc]);

  return (
    <>
      <CursorEffect />

      {!imagesLoaded ? (
        <div className="fixed inset-0 bg-[#101010] z-20 flex flex-col items-center justify-center gap-4 transition-opacity duration-300">
          <div className="relative h-28 w-28">
            <img
              src="http://mew.net/cards/logo.png"
              alt="Loading..."
              className="h-full w-full absolute top-0 left-0 opacity-30"
            />
            <img
              src="http://mew.net/cards/logo.png"
              alt="Loading..."
              className="h-full w-full absolute top-0 left-0 transition-all duration-300 ease-linear"
              style={{
                clipPath: `inset(${100 - loadingProgress}% 0 0 0)`
              }}
            />
          </div>
        </div>
      ) : (
        <div className="relative min-h-screen bg-[#101010] font-sans text-gray-100">
          <BackgroundGradient />
          <header className="sticky top-0 z-50 border-b border-[#2a2a2a]/60 bg-black/30 backdrop-blur">
            <div className="mx-auto max-w-7xl px-3 py-2">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src="http://mew.net/cards/logo.png" alt="Mew Cards Logo" className="h-8 w-8" />
                  <h1 className="text-base sm:text-lg font-semibold tracking-tight">Japanese Mews</h1>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Toggle label="Mew" active={mew} onClick={() => setMew(v => !v)} />
                    <Toggle label="Cameo" active={cameo} onClick={() => setCameo(v => !v)} />
                    <Toggle label="Intl" active={intl} onClick={() => setIntl(v => !v)} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setReleaseSortDesc(v => !v)}
                    aria-label={releaseSortDesc ? "Sort by date: new to old" : "Sort by date: old to new"}
                    className="text-[12px] text-gray-400 hover:text-gray-200 px-1 py-0.5 rounded outline-none focus:outline-none"
                  >
                    {releaseSortDesc ? "Date ▼" : "Date ▲"}
                  </button>
                  <div className="relative w-44 sm:w-60">
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
                        <div className="relative aspect-[63/88] w-full rounded-[4.2%] overflow-hidden bg-[#0f0f0f]">
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
          {selected && <DetailModal card={selected} onClose={() => setSelected(null)} language={language} setLanguage={setLanguage} />}
        </div>
      )}
    </>
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

const DetailModal: React.FC<{
  card: PokeCard;
  onClose: () => void;
  language: 'EN' | 'JP';
  setLanguage: React.Dispatch<React.SetStateAction<'EN' | 'JP'>>;
}> = ({ card, onClose, language, setLanguage }) => {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  
  // Reset flip state when card changes
  useEffect(() => {
    setRotation(0);
  }, [card.id]);

  const displayName = (language === 'JP' && card.nameJP) ? card.nameJP : card.nameEN;
  const displayNotes = (language === 'JP' && card.notesJP) ? card.notesJP : card.notesEN;
  const displayOrigin = (language === 'JP' && card.originJP) ? card.originJP : card.originEN;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-t-3xl sm:rounded-3xl border border-[#2a2a2a] bg-[#161616] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 rounded-full p-2 text-gray-400 hover:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-[#cb97a5]" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="flex flex-col items-center p-4 sm:p-6">
            <div
              className="w-full max-w-[520px] [perspective:2500px] [transform-style:preserve-3d]"
              onMouseEnter={() => { if (card.imageBack) { setRotation(r => r + 180); } }}
              onMouseLeave={() => { if (card.imageBack) { setRotation(r => r + 180); } }}
            >
              <div
                className="relative w-full aspect-[63/88] transition-transform duration-1000 [transform-style:preserve-3d]"
                style={{ transform: `rotateY(${rotation}deg)` }}
              >
                {/* Front */}
                <div className="absolute top-0 left-0 w-full h-full [backface-visibility:hidden] rounded-[4.2%] overflow-hidden bg-[#0f0f0f]">
                  <img src={card.image} alt={`${displayName} front`} className="h-full w-full object-fill" style={{ aspectRatio: "63/88" }} onError={handleImgError} referrerPolicy="strict-origin-when-cross-origin" />
                </div>
                {/* Back */}
                {card.imageBack && (
                  <div className="absolute top-0 left-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-[4.2%] overflow-hidden bg-[#0f0f0f]">
                    <img src={card.imageBack} alt={`${displayName} back`} className="h-full w-full object-fill" style={{ aspectRatio: "63/88" }} onError={handleImgError} referrerPolicy="strict-origin-when-cross-origin" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col space-y-3 p-4 pt-0 sm:p-6 sm:max-h-[80vh] sm:overflow-y-auto">
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

