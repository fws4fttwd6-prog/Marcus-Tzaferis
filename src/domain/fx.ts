/**
 * Currency conversion to CAD.
 *
 * Vendors quote in EUR, GBP and USD; every comparison in this app happens in
 * Canadian dollars. Rates come from the ECB reference feed when the network
 * allows it, and fall back to a pinned table otherwise. A fallback rate is
 * always flagged as stale so the UI can say so rather than quietly lying.
 */

export type Currency =
  | "CAD" | "USD" | "EUR" | "GBP" | "CHF" | "AUD" | "NZD"
  | "SEK" | "DKK" | "NOK" | "JPY" | "HKD" | "SGD";

/**
 * Pinned fallback: units of CAD per 1 unit of the currency.
 * Refresh these occasionally — they are only used when the live feed is
 * unreachable, and the app labels any result built on them as stale.
 */
const FALLBACK_CAD_PER_UNIT: Record<Currency, number> = {
  CAD: 1,
  USD: 1.38,
  EUR: 1.52,
  GBP: 1.78,
  CHF: 1.58,
  AUD: 0.9,
  NZD: 0.83,
  SEK: 0.135,
  DKK: 0.204,
  NOK: 0.128,
  JPY: 0.0092,
  HKD: 0.177,
  SGD: 1.04,
};

const FALLBACK_AS_OF = "2026-01-01";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // six hours is plenty for wine shopping

export interface FxTable {
  /** CAD per one unit of the keyed currency. */
  cadPerUnit: Record<string, number>;
  asOf: string;
  source: "live" | "fallback" | "env";
  stale: boolean;
}

let cache: { table: FxTable; fetchedAt: number } | null = null;

function envOverrides(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const m = /^CELLAR_SCOUT_FX_([A-Z]{3})_CAD$/.exec(key);
    if (!m || !value) continue;
    const rate = Number(value);
    if (Number.isFinite(rate) && rate > 0) out[m[1]!] = rate;
  }
  return out;
}

function fallbackTable(): FxTable {
  return {
    cadPerUnit: { ...FALLBACK_CAD_PER_UNIT, ...envOverrides() },
    asOf: FALLBACK_AS_OF,
    source: Object.keys(envOverrides()).length ? "env" : "fallback",
    stale: true,
  };
}

/**
 * Fetch ECB reference rates via Frankfurter, expressed as CAD per unit.
 * Returns null on any failure — callers fall back rather than throw.
 */
async function fetchLive(signal?: AbortSignal): Promise<FxTable | null> {
  const symbols = Object.keys(FALLBACK_CAD_PER_UNIT).filter((c) => c !== "CAD");
  const url = `https://api.frankfurter.app/latest?from=CAD&to=${symbols.join(",")}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    signal?.addEventListener("abort", () => controller.abort(), { once: true });
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
    if (!body.rates) return null;

    // The feed gives units-per-CAD; we want CAD-per-unit.
    const cadPerUnit: Record<string, number> = { CAD: 1 };
    for (const [code, perCad] of Object.entries(body.rates)) {
      if (typeof perCad === "number" && perCad > 0) cadPerUnit[code] = 1 / perCad;
    }
    return {
      cadPerUnit: { ...FALLBACK_CAD_PER_UNIT, ...cadPerUnit, ...envOverrides() },
      asOf: body.date ?? new Date().toISOString().slice(0, 10),
      source: "live",
      stale: false,
    };
  } catch {
    return null;
  }
}

export async function getFxTable(options: { refresh?: boolean } = {}): Promise<FxTable> {
  const now = Date.now();
  if (!options.refresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.table;
  }
  const live = await fetchLive();
  const table = live ?? fallbackTable();
  cache = { table, fetchedAt: now };
  return table;
}

export function convertToCad(
  amount: number,
  currency: string,
  table: FxTable,
): { cad: number; rate: number; stale: boolean } {
  const code = (currency || "CAD").toUpperCase().trim();
  const rate = table.cadPerUnit[code];
  if (rate === undefined) {
    // Unknown currency: pass the number through and let the caller see stale=true.
    return { cad: amount, rate: 1, stale: true };
  }
  return { cad: Math.round(amount * rate * 100) / 100, rate, stale: table.stale };
}

/** Guess the currency a vendor quotes in, from their country. */
export function currencyForCountry(country: string | null | undefined): Currency {
  const c = (country ?? "").toLowerCase();
  if (/canada|^ca$/.test(c)) return "CAD";
  if (/united states|u\.?s\.?a?|^us$/.test(c)) return "USD";
  if (/united kingdom|england|scotland|wales|^uk$|^gb$/.test(c)) return "GBP";
  if (/switzerland|suisse|^ch$/.test(c)) return "CHF";
  if (/australia/.test(c)) return "AUD";
  if (/sweden/.test(c)) return "SEK";
  if (/denmark/.test(c)) return "DKK";
  if (/norway/.test(c)) return "NOK";
  if (/japan/.test(c)) return "JPY";
  if (/hong kong/.test(c)) return "HKD";
  if (/singapore/.test(c)) return "SGD";
  return "EUR";
}

/** Reset the in-process cache. Used by tests. */
export function __resetFxCache(): void {
  cache = null;
}
