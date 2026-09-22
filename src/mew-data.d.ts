// Types for the untyped data layer (src/mew-data.js). Loosely typed on purpose —
// the data layer is a faithful JS port from the design handoff.
export const APPS_SCRIPT_URL: string;
export const TAB_MAPPINGS: { mew: string; cameo: string; intl: string };
export const APP_VERSION: string;
export const CONFIG_CACHE_KEY: string;
export const LOGO: string;
export const IMG_FALLBACK: string;
export function trackEvent(action: string, params?: any): void;
export function handleImgError(e: any): void;
export function formatDate(dateString?: string): string | undefined;
export function releaseTs(card: any): number;
export function parseCSV(csv: string): any[];
export function mergeCardsNoDedupe(groups: any[]): any[];
export function applyFilters(cards: any[], f: any): any[];
export function fetchConfig(): Promise<any>;
export function fetchAllSheets(password: string): Promise<any[]>;
export function scaleColor(year: any): string;
export function ownedStatsOf(cards: any[]): any;
export const SAMPLE_CARDS: any[];
