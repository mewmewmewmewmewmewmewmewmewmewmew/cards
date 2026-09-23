// Data layer for the Mew card catalog — ported verbatim in behaviour from
// mewmewmewmewmewmewmewmewmewmewmew/cards src/App.tsx (Google Apps Script + CSV).

export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyeuOPhbDRtfzwDes3xku0AQi4me0o2zgsSdEBMOKWArzai28lS-wHeOWuui8FI8pf81Q/exec";
export const TAB_MAPPINGS = { mew: "Japanese", cameo: "Cameo", intl: "Unique" };
export const APP_VERSION = "22.9";
export const CONFIG_CACHE_KEY = "mew_config_v1";
export const LOGO = "https://mew.cards/img/logo.png";

export const IMG_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 420'><rect width='100%' height='100%' fill='%23121212'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-family='sans-serif' font-size='14'>Image unavailable</text></svg>";

export function trackEvent(action, params) {
  try { window.gtag && window.gtag("event", action, params); } catch (e) {}
}

export function handleImgError(e) {
  const img = e.currentTarget;
  if (img.src !== IMG_FALLBACK) img.src = IMG_FALLBACK;
}

export function formatDate(dateString) {
  if (!dateString) return undefined;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (year < 1990 || year > 2050) return dateString;
  return `${year}-${month}-${day}`;
}

function parseBool(x) {
  if (!x) return undefined;
  const s = x.trim().toLowerCase();
  return s === "true" || s === "1" ? true : s === "false" || s === "0" ? false : undefined;
}

function normalizePC(value) {
  if (!value) return undefined;
  const t = value.trim().toUpperCase();
  if (!t) return undefined;
  if (t === "RAW") return "RAW";
  if (t === "N/A" || t === "NA") return "N/A";
  const m = t.match(/^PSA\s?(\d{1,2})$/);
  if (!m) return undefined;
  const g = Number.parseInt(m[1], 10);
  if (!Number.isFinite(g) || g < 1 || g > 10) return undefined;
  return `PSA${g}`;
}

function stripBOM(s) { return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s; }

function slugify(...parts) {
  const s = parts.filter(Boolean).join(" ").trim().toLowerCase();
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "row";
}

export function releaseTs(card) {
  if (card.release) {
    const t = Date.parse(card.release);
    if (!Number.isNaN(t)) return t;
  }
  if (Number.isFinite(card.year) && card.year > 0) return new Date(card.year, 0, 1).getTime();
  return Number.POSITIVE_INFINITY;
}

export function parseCSV(csv) {
  csv = stripBOM(csv || "");
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  while (i < csv.length) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') { if (csv[i + 1] === '"') { field += '"'; i += 2; continue; } inQuotes = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(field.trim()); field = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && csv[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = []; i++; continue;
    }
    field += ch; i++;
  }
  row.push(field.trim());
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => stripBOM(h).trim());
  const lc = headers.map((h) => h.toLowerCase());
  const findIdx = (name, aliases = []) => {
    let j = lc.indexOf(name.toLowerCase());
    if (j >= 0) return j;
    for (const a of aliases) { const k = lc.indexOf(a.toLowerCase()); if (k >= 0) return k; }
    return -1;
  };

  const I = {
    id: findIdx("id", ["card_id"]),
    nameEN: findIdx("name en", ["name"]),
    nameJP: findIdx("name jp", ["name_jp"]),
    notesEN: findIdx("notes en", ["notes"]),
    notesJP: findIdx("notes jp", ["notes_jp"]),
    originEN: findIdx("origin en", ["origin"]),
    originJP: findIdx("origin jp", ["origin_jp"]),
    number: findIdx("number", ["no", "card no", "card #"]),
    set: findIdx("set", ["set name", "series"]),
    year: findIdx("year"),
    release: findIdx("release", ["release date", "released"]),
    rarity: findIdx("rarity"),
    types: findIdx("types"),
    lang: findIdx("language", ["lang"]),
    image: findIdx("image front", ["image", "image_front", "image url", "image_url", "img", "image link"]),
    imageBack: findIdx("image back", ["image_back"]),
    illus: findIdx("illustrator", ["artist"]),
    era: findIdx("era"),
    isMew: findIdx("isMew", ["ismew"]),
    isCameo: findIdx("isCameo", ["iscameo"]),
    isIntl: findIdx("isIntl", ["isintrl", "international"]),
    edition: findIdx("edition"),
    psa8: findIdx("psa8"),
    psa9: findIdx("psa9"),
    psa10: findIdx("psa10"),
    bgsBL: findIdx("bgsBL", ["bgs bl", "bgs_black_label"]),
    pc: findIdx("pc"),
  };

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const get = (j) => (j >= 0 && j < cols.length ? cols[j] : "");
    const nameJPRaw = get(I.nameJP);
    const nameEN = get(I.nameEN) || nameJPRaw;
    if (!nameEN) continue;
    const typesField = get(I.types);
    const bgsBLRaw = get(I.bgsBL);
    const pop = {
      psa8: Number(get(I.psa8) || 0),
      psa9: Number(get(I.psa9) || 0),
      psa10: Number(get(I.psa10) || 0),
      bgsBL: bgsBLRaw === "" ? null : Number(bgsBLRaw),
    };
    const hasPop = pop.psa8 > 0 || pop.psa9 > 0 || pop.psa10 > 0 || pop.bgsBL !== null;
    const yearNum = Number.parseInt(get(I.year), 10);
    out.push({
      id: get(I.id) || slugify(nameEN, get(I.set), get(I.number), String(r)),
      nameEN,
      nameJP: nameJPRaw || undefined,
      notesEN: get(I.notesEN) || undefined,
      notesJP: get(I.notesJP) || undefined,
      originEN: get(I.originEN) || undefined,
      originJP: get(I.originJP) || undefined,
      number: get(I.number),
      set: get(I.set) || "",
      year: Number.isFinite(yearNum) ? yearNum : 0,
      rarity: get(I.rarity) || undefined,
      types: typesField ? typesField.split("|").map((t) => t.trim()).filter(Boolean) : [],
      language: get(I.lang) || undefined,
      image: get(I.image) || IMG_FALLBACK,
      imageBack: get(I.imageBack) || undefined,
      illustrator: get(I.illus) || undefined,
      era: get(I.era) || undefined,
      release: get(I.release) || undefined,
      isMew: parseBool(get(I.isMew)),
      isCameo: parseBool(get(I.isCameo)),
      isIntl: parseBool(get(I.isIntl)),
      edition: get(I.edition) || undefined,
      population: hasPop ? pop : undefined,
      pc: normalizePC(get(I.pc)),
    });
  }
  return out;
}

export function mergeCardsNoDedupe(groups) {
  const prefix = (f) => (f === "isMew" ? "mew" : f === "isCameo" ? "cameo" : "intl");
  const out = [];
  for (const g of groups) {
    const p = prefix(g.flag);
    g.cards.forEach((c, index) => {
      out.push({ ...c, id: slugify(p, c.nameEN, c.set, c.number, String(c.year), String(index)), [g.flag]: true });
    });
  }
  return out;
}

export function applyFilters(cards, f) {
  let items = [...cards];
  if (f.q && f.q.trim()) {
    const term = f.q.trim().toLowerCase();
    items = items.filter((c) =>
      [c.nameEN, c.nameJP, c.number, c.set, c.rarity, c.notesEN, c.notesJP, c.originEN, c.originJP]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }
  if (!(f.mew || f.cameo || f.intl)) return [];
  items = items.filter((c) => (f.mew && c.isMew) || (f.cameo && c.isCameo) || (f.intl && c.isIntl));
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

export async function fetchConfig() {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=getConfig`);
  return res.json();
}

/** Returns merged cards, or throws Error("auth") on a bad password. */
export async function fetchAllSheets(password) {
  const sources = [
    { name: TAB_MAPPINGS.mew, flag: "isMew" },
    { name: TAB_MAPPINGS.cameo, flag: "isCameo" },
    { name: TAB_MAPPINGS.intl, flag: "isIntl" },
  ];
  const pw = password ? `&password=${encodeURIComponent(password)}` : "";
  try {
    const url = `${APPS_SCRIPT_URL}?action=getAll&sheets=${encodeURIComponent(sources.map((s) => s.name).join(","))}${pw}`;
    const text = await (await fetch(url)).text();
    if (text.startsWith("Error: Authentication Failed")) throw new Error("auth");
    const json = JSON.parse(text);
    if (json && json.sheets) {
      const groups = sources
        .map((s) => ({ cards: parseCSV(json.sheets[s.name] || ""), flag: s.flag }))
        .filter((g) => g.cards.length > 0);
      return mergeCardsNoDedupe(groups);
    }
  } catch (e) {
    if (e && e.message === "auth") throw e;
  }
  // Older deployments: one request per sheet.
  const results = await Promise.allSettled(
    sources.map((s) =>
      fetch(`${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(s.name)}${pw}`).then(async (res) => {
        const text = await res.text();
        if (text.startsWith("Error: Authentication Failed")) throw new Error("auth");
        if (!res.ok && !text.startsWith("Error:")) throw new Error(`Failed to fetch sheet "${s.name}"`);
        return text;
      })
    )
  );
  if (results.some((r) => r.status === "rejected" && r.reason && r.reason.message === "auth")) throw new Error("auth");
  const groups = results.reduce((acc, r, i) => {
    if (r.status === "fulfilled" && r.value) {
      const cards = parseCSV(r.value);
      if (cards.length) acc.push({ cards, flag: sources[i].flag });
    } else if (r.status === "rejected") {
      console.error(`Error fetching sheet "${sources[i].name}":`, r.reason);
    }
    return acc;
  }, []);
  return mergeCardsNoDedupe(groups);
}

const SCALE_FROM = 1996, SCALE_TO = 2025;
export function scaleColor(year) {
  const m = String(year == null ? SCALE_FROM : year).match(/\d{4}/);
  const y = parseInt(m ? m[0] : SCALE_FROM, 10);
  const t = Math.max(0, Math.min(1, (y - SCALE_FROM) / (SCALE_TO - SCALE_FROM)));
  return `rgb(255,${Math.round(214 - 91 * t)},${Math.round(233 - 51 * t)})`;
}

export function ownedStatsOf(cards) {
  const total = cards.filter((c) => c.pc !== "N/A").length;
  const psa10Cards = cards.filter((c) => c.pc === "PSA10");
  const lower = Array.from({ length: 9 }, (_, i) => `PSA${i + 1}`);
  return {
    total,
    psa10: psa10Cards.length,
    psa10Cards,
    psa19Cards: cards.filter((c) => lower.includes(c.pc || "")),
    needCards: cards.filter((c) => c.pc !== "PSA10" && c.pc !== "N/A"),
    allCards: cards,
  };
}

/** Small sample set for previewing the layout without the live sheet. */
export const SAMPLE_CARDS = [
  { id: "s1", nameJP: "ミュウ", nameEN: "Mew", number: "No. 151", set: "CoroCoro Promo", year: 1996, release: "1996-10-15", rarity: "Promo", era: "Base", illustrator: "Ken Sugimori", notesEN: "First CoroCoro promo; glossy stock", notesJP: "コロコロ初出のプロモ", image: "", population: { psa8: 412, psa9: 288, psa10: 41, bgsBL: 2 }, pc: "PSA10", isMew: true },
  { id: "s2", nameJP: "ミュウ", nameEN: "Mew", number: "115/165", set: "Pokémon Card 151", year: 2023, release: "2023-06-16", rarity: "SAR", era: "Scarlet & Violet", illustrator: "Shibuzoh.", notesEN: "Special art rare from the 151 set", image: "", population: { psa8: 18, psa9: 940, psa10: 3120, bgsBL: 14 }, pc: "PSA9", isMew: true },
  { id: "s3", nameJP: "ミュウex", nameEN: "Mew ex", number: "053/165", set: "Pokémon Card 151", year: 2023, release: "2023-06-16", rarity: "RR", era: "Scarlet & Violet", illustrator: "PLANETA Mochizuki", image: "", population: { psa8: 6, psa9: 210, psa10: 880, bgsBL: null }, isMew: true },
  { id: "s4", nameJP: "ミュウ", nameEN: "Mew", number: "008/012", set: "VS Series", year: 2001, release: "2001-12-01", rarity: "Rare", era: "Neo", illustrator: "Hironobu Yoshida", notesEN: "Vending-era reprint", image: "", population: { psa8: 96, psa9: 62, psa10: 9, bgsBL: null }, pc: "N/A", isMew: true },
  { id: "s5", nameJP: "ミュウ (幻)", nameEN: "Mew (Phantom)", number: "029/072", set: "Shining Fates", year: 2021, release: "2021-02-19", rarity: "SR", era: "Sword & Shield", illustrator: "Mitsuhiro Arita", image: "", population: { psa8: 22, psa9: 410, psa10: 1180, bgsBL: 5 }, pc: "PSA10", isMew: true },
  { id: "s6", nameJP: "ミュウツー & ミュウ", nameEN: "Mewtwo & Mew", number: "071/095", set: "Tag All Stars", year: 2019, release: "2019-10-04", rarity: "TAG TEAM GX", era: "Sun & Moon", illustrator: "Mitsuhiro Arita", notesEN: "Cameo appearance alongside Mewtwo", image: "", population: { psa8: 31, psa9: 520, psa10: 1440, bgsBL: 3 }, isCameo: true },
];
