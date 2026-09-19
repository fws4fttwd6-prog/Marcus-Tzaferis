/**
 * Currency conversion to CAD.
 *
 * Vendors quote in EUR, GBP and USD; every comparison in this app happens in
 * Canadian dollars, so the exchange rate is load-bearing — at EUR/CAD 1.61
 * rather than 1.52, a EUR 80 bottle costs seven dollars more before a cent of
 * freight is added.
 *
 * Rates are fetched live from, in order of preference:
 *   1. the Bank of Canada's Valet API — the authoritative source for CAD, free
 *      and unauthenticated, published each business day by 16:30 ET;
 *   2. Frankfurter, which serves the ECB reference rates;
 *   3. the Exchange Rate API's open endpoint.
 *
 * If all three are unreachable the pinned table below is used and every result
 * built on it is flagged stale, so the UI says so rather than quietly lying.
 */

export type Currency =
  | "CAD" | "USD" | "EUR" | "GBP" | "CHF" | "AUD" | "NZD"
  | "SEK" | "DKK" | "NOK" | "JPY" | "HKD" | "SGD";

/**
 * Pinned fallback: Canadian dollars per 1 unit of the currency.
 *
 * Checked 2026-09-19. USD, EUR, GBP, CHF, AUD and JPY are direct market
 * quotes; SEK, NOK, DKK, HKD, SGD and NZD are crossed from EUR or USD and are
 * correspondingly less exact — none of them are currencies fine wine is
 * normally priced in.
 *
 * These only matter when every provider above is unreachable. Refresh them
 * when convenient; the app will tell you when it is relying on them.
 */
const FALLBACK_CAD_PER_UNIT: Record<Currency, number> = {
  CAD: 1,
  USD: 1.3998,
  EUR: 1.6063,
  GBP: 1.8742,
  CHF: 1.7003,
  AUD: 0.9947,
  NZD: 0.905,
  SEK: 0.1441,
  DKK: 0.2153,
  NOK: 0.1485,
  JPY: 0.00897,
  HKD: 0.1795,
  SGD: 1.0936,
};

const FALLBACK_AS_OF = "2026-09-19";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // six hours is plenty for wine shopping
const FETCH_TIMEOUT_MS = 8000;

export type FxSource = "bank-of-canada" | "ecb-frankfurter" | "exchangerate-api" | "fallback";

export interface FxTable {
  /** CAD per one unit of the keyed currency. */
  cadPerUnit: Record<string, number>;
  asOf: string;
  source: FxSource;
  /** Human-readable attribution for the UI. */
  sourceLabel: string;
  stale: boolean;
  /** Currencies whose rate came from the live feed rather than the pinned table. */
  liveCurrencies: string[];
  /** Set when a currency was pinned by an environment variable. */
  overrides: string[];
}

const SOURCE_LABEL: Record<FxSource, string> = {
  "bank-of-canada": "Bank of Canada",
  "ecb-frankfurter": "European Central Bank",
  "exchangerate-api": "Exchange Rate API",
  fallback: "pinned fallback",
};

let cache: { table: FxTable; fetchedAt: number } | null = null;

function envOverrides(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const m = /^KRASI_FX_([A-Z]{3})_CAD$/.exec(key);
    if (!m || !value) continue;
    const rate = Number(value);
    if (Number.isFinite(rate) && rate > 0) out[m[1]!] = rate;
  }
  return out;
}

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bank of Canada Valet. Its series are already quoted as CAD per foreign unit,
 * which is exactly the direction this app needs. It carries no DKK series, so
 * that one falls through to the pinned table.
 */
const BOC_SERIES: Partial<Record<Currency, string>> = {
  USD: "FXUSDCAD",
  EUR: "FXEURCAD",
  GBP: "FXGBPCAD",
  CHF: "FXCHFCAD",
  AUD: "FXAUDCAD",
  NZD: "FXNZDCAD",
  SEK: "FXSEKCAD",
  NOK: "FXNOKCAD",
  JPY: "FXJPYCAD",
  HKD: "FXHKDCAD",
  SGD: "FXSGDCAD",
};

async function fromBankOfCanada(): Promise<Partial<FxTable> | null> {
  const series = Object.values(BOC_SERIES).join(",");
  const body = (await getJson(
    `https://www.bankofcanada.ca/valet/observations/${series}/json?recent=1`,
  )) as { observations?: Array<Record<string, { v?: string } | string>> } | null;

  const observation = body?.observations?.[0];
  if (!observation) return null;

  const cadPerUnit: Record<string, number> = { CAD: 1 };
  for (const [code, name] of Object.entries(BOC_SERIES)) {
    const cell = observation[name!];
    const raw = typeof cell === "object" && cell !== null ? cell.v : undefined;
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) cadPerUnit[code] = value;
  }
  if (Object.keys(cadPerUnit).length < 4) return null;

  const date = typeof observation.d === "string" ? observation.d : undefined;
  return { cadPerUnit, asOf: date ?? today(), source: "bank-of-canada" };
}

/** Frankfurter serves ECB reference rates; it quotes units per CAD, so invert. */
async function fromFrankfurter(): Promise<Partial<FxTable> | null> {
  const symbols = Object.keys(FALLBACK_CAD_PER_UNIT).filter((c) => c !== "CAD");
  const body = (await getJson(
    `https://api.frankfurter.app/latest?from=CAD&to=${symbols.join(",")}`,
  )) as { date?: string; rates?: Record<string, number> } | null;
  if (!body?.rates) return null;

  const cadPerUnit: Record<string, number> = { CAD: 1 };
  for (const [code, perCad] of Object.entries(body.rates)) {
    if (typeof perCad === "number" && perCad > 0) cadPerUnit[code] = 1 / perCad;
  }
  if (Object.keys(cadPerUnit).length < 4) return null;
  return { cadPerUnit, asOf: body.date ?? today(), source: "ecb-frankfurter" };
}

/** Last resort live provider; also quotes units per CAD. */
async function fromExchangeRateApi(): Promise<Partial<FxTable> | null> {
  const body = (await getJson("https://open.er-api.com/v6/latest/CAD")) as
    | { time_last_update_utc?: string; rates?: Record<string, number> }
    | null;
  if (!body?.rates) return null;

  const cadPerUnit: Record<string, number> = { CAD: 1 };
  for (const code of Object.keys(FALLBACK_CAD_PER_UNIT)) {
    const perCad = body.rates[code];
    if (typeof perCad === "number" && perCad > 0) cadPerUnit[code] = 1 / perCad;
  }
  if (Object.keys(cadPerUnit).length < 4) return null;

  const asOf = body.time_last_update_utc
    ? new Date(body.time_last_update_utc).toISOString().slice(0, 10)
    : today();
  return { cadPerUnit, asOf, source: "exchangerate-api" };
}

const PROVIDERS = [fromBankOfCanada, fromFrankfurter, fromExchangeRateApi];

export async function getFxTable(options: { refresh?: boolean } = {}): Promise<FxTable> {
  const now = Date.now();
  if (!options.refresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.table;
  }

  const overrides = envOverrides();
  let table: FxTable | null = null;

  for (const provider of PROVIDERS) {
    const result = await provider();
    if (!result?.cadPerUnit) continue;
    const live = Object.keys(result.cadPerUnit).filter((c) => c !== "CAD");
    table = {
      // Pinned rates fill any gap the provider left, so a missing series never
      // becomes a missing conversion.
      cadPerUnit: { ...FALLBACK_CAD_PER_UNIT, ...result.cadPerUnit, ...overrides },
      asOf: result.asOf ?? today(),
      source: result.source ?? "fallback",
      sourceLabel: SOURCE_LABEL[result.source ?? "fallback"],
      stale: false,
      liveCurrencies: live,
      overrides: Object.keys(overrides),
    };
    break;
  }

  if (!table) {
    table = {
      cadPerUnit: { ...FALLBACK_CAD_PER_UNIT, ...overrides },
      asOf: FALLBACK_AS_OF,
      source: "fallback",
      sourceLabel: SOURCE_LABEL.fallback,
      stale: true,
      liveCurrencies: [],
      overrides: Object.keys(overrides),
    };
  }

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
  // A pinned rate is stale even when other currencies came back live.
  const stale = table.stale || (table.liveCurrencies.length > 0 && code !== "CAD" && !table.liveCurrencies.includes(code));
  return { cad: Math.round(amount * rate * 100) / 100, rate, stale };
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reset the in-process cache. Used by tests. */
export function __resetFxCache(): void {
  cache = null;
}
