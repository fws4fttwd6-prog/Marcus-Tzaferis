import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REGIONS, REGION_BY_KEY } from "./data/regions.js";
import { getFxTable } from "./domain/fx.js";
import {
  DESTINATION,
  estimateLandedCost,
  landedCostCurve,
  RATES,
  RATE_PROVENANCE,
  ZONES,
  zoneForLocation,
  type ShippingZone,
} from "./domain/landed-cost.js";
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from "./domain/types.js";
import { vintageAdvice } from "./domain/vintage.js";
import { isDemoMode, modelId, ResearchError } from "./claude/client.js";
import { searchWine } from "./search.js";
import { DEFAULT_DISCOVER_OPTIONS, discoverWines, type DiscoverOptions } from "./discover.js";
import { TtlCache } from "./cache.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "..", "public");

const app = express();
app.use(express.json({ limit: "256kb" }));

const searchCache = new TtlCache<unknown>(30 * 60 * 1000, 60);
const discoverCache = new TtlCache<unknown>(60 * 60 * 1000, 20);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    demo: isDemoMode(),
    model: isDemoMode() ? null : modelId(),
    destination: DESTINATION,
    cached: { searches: searchCache.size, discoveries: discoverCache.size },
  });
});

app.get("/api/regions", (_req, res) => {
  res.json({
    destination: DESTINATION,
    regions: REGIONS.map((r) => ({
      key: r.key,
      label: r.label,
      country: r.country,
      area: r.area,
      style: r.style,
      priceBandCad: r.priceBandCad,
    })),
  });
});

app.get("/api/vintages/:regionKey", (req, res) => {
  const key = String(req.params.regionKey);
  const advice = vintageAdvice(key);
  if (!advice) {
    res.status(404).json({ error: `Unknown region "${key}".` });
    return;
  }
  res.json({ region: REGION_BY_KEY.get(key), ...advice });
});

app.get("/api/rates", async (_req, res) => {
  const fx = await getFxTable();
  res.json({
    destination: DESTINATION,
    fx: { asOf: fx.asOf, source: fx.source, stale: fx.stale, cadPerUnit: fx.cadPerUnit },
    rateCard: {
      exciseCadPerLitre: RATES.exciseCadPerLitre,
      mfnCustomsCadPerLitre: RATES.mfnCustomsCadPerLitre,
      lcboPrivateImportMarkup: RATES.lcboPrivateImportMarkup,
      lcboBottleLevyCad: RATES.lcboBottleLevyCad,
      containerDepositCad: RATES.containerDepositCad,
      lcboPrivateOrderAdminCad: RATES.lcboPrivateOrderAdminCad,
      customsBrokerageCad: RATES.customsBrokerageCad,
      hst: RATES.hst,
    },
    provenance: RATE_PROVENANCE,
    zones: Object.values(ZONES),
  });
});

/** Standalone landed-cost calculator, useful on its own. */
app.post("/api/landed-cost", async (req, res) => {
  const body = req.body ?? {};
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) {
    res.status(400).json({ error: "price must be a positive number" });
    return;
  }

  const fx = await getFxTable();
  const currency = String(body.currency ?? "CAD").toUpperCase();
  const rate = fx.cadPerUnit[currency];
  if (rate === undefined) {
    res.status(400).json({ error: `Unknown currency "${currency}".` });
    return;
  }

  const zone: ShippingZone =
    body.zone && zoneKeys.has(body.zone)
      ? (body.zone as ShippingZone)
      : zoneForLocation(body.country, body.region);

  const input = {
    bottlePriceCad: Math.round(price * rate * 100) / 100,
    zone,
    bottleMl: Number(body.bottleMl) > 0 ? Number(body.bottleMl) : 750,
    quotedShippingCad:
      body.quotedShipping !== undefined && body.quotedShipping !== null
        ? Number(body.quotedShipping) * rate
        : null,
    freeShippingOverCad:
      body.freeShippingOver !== undefined && body.freeShippingOver !== null
        ? Number(body.freeShippingOver) * rate
        : null,
    temperatureControlled: Boolean(body.temperatureControlled),
  };

  const quantity = clampInt(body.quantity, 1, 120, 6);
  res.json({
    input: { ...input, currency, priceOriginal: price, fxRate: rate },
    fx: { asOf: fx.asOf, source: fx.source, stale: fx.stale },
    landed: estimateLandedCost({ ...input, quantity }),
    curve: landedCostCurve(input, [1, 3, 6, 12, 24]),
  });
});

app.post("/api/search", async (req, res, next) => {
  try {
    const query = String(req.body?.query ?? "").trim();
    if (!query) {
      res.status(400).json({ error: "Tell me which wine to look for." });
      return;
    }
    if (query.length > 200) {
      res.status(400).json({ error: "That wine name is implausibly long." });
      return;
    }

    const options: SearchOptions = {
      quantity: clampInt(req.body?.quantity, 1, 120, DEFAULT_SEARCH_OPTIONS.quantity),
      intent: ["drink-now", "cellar", "either"].includes(req.body?.intent)
        ? req.body.intent
        : DEFAULT_SEARCH_OPTIONS.intent,
      maxPriceCad: positiveOrNull(req.body?.maxPriceCad),
      vintage: yearOrNull(req.body?.vintage),
      includeOutOfStock: Boolean(req.body?.includeOutOfStock),
      temperatureControlled: Boolean(req.body?.temperatureControlled),
    };

    const key = JSON.stringify({ q: query.toLowerCase(), ...options });
    if (!req.body?.refresh) {
      const hit = searchCache.get(key);
      if (hit) {
        res.json({ ...(hit as object), cached: true });
        return;
      }
    }

    const result = await searchWine(query, options);
    searchCache.set(key, result);
    res.json({ ...result, cached: false });
  } catch (err) {
    next(err);
  }
});

app.post("/api/discover", async (req, res, next) => {
  try {
    const options: DiscoverOptions = {
      countries: Array.isArray(req.body?.countries) && req.body.countries.length
        ? req.body.countries.map(String).slice(0, 6)
        : DEFAULT_DISCOVER_OPTIONS.countries,
      minPriceCad: clampInt(req.body?.minPriceCad, 10, 5000, DEFAULT_DISCOVER_OPTIONS.minPriceCad),
      maxPriceCad: clampInt(req.body?.maxPriceCad, 15, 20000, DEFAULT_DISCOVER_OPTIONS.maxPriceCad),
      style: ["any", "red", "white", "sparkling", "sweet", "rose"].includes(req.body?.style)
        ? req.body.style
        : DEFAULT_DISCOVER_OPTIONS.style,
      count: clampInt(req.body?.count, 3, 15, DEFAULT_DISCOVER_OPTIONS.count),
      focus: req.body?.focus ? String(req.body.focus).slice(0, 200) : null,
      quantity: clampInt(req.body?.quantity, 1, 120, DEFAULT_DISCOVER_OPTIONS.quantity),
    };
    if (options.maxPriceCad <= options.minPriceCad) {
      options.maxPriceCad = options.minPriceCad + 50;
    }

    const key = JSON.stringify(options);
    if (!req.body?.refresh) {
      const hit = discoverCache.get(key);
      if (hit) {
        res.json({ ...(hit as object), cached: true });
        return;
      }
    }

    const result = await discoverWines(options);
    discoverCache.set(key, result);
    res.json({ ...result, cached: false });
  } catch (err) {
    next(err);
  }
});

app.use(express.static(publicDir, { extensions: ["html"] }));

// Anything else that is not an API path falls through to the single page.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ResearchError) {
    console.error("[research]", err.message, err.detail ?? "");
    res.status(502).json({ error: err.message, detail: err.detail ?? null });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[error]", message);
  const status =
    /api key|authentication|401/i.test(message) ? 401 : /rate limit|429/i.test(message) ? 429 : 500;
  res.status(status).json({
    error:
      status === 401
        ? "No usable Anthropic credentials. Set ANTHROPIC_API_KEY, or run without one for sample data."
        : status === 429
          ? "Anthropic rate limit hit. Wait a moment and try again."
          : "Something went wrong while searching.",
    detail: message,
  });
});

const zoneKeys = new Set(Object.keys(ZONES));

function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function positiveOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function yearOrNull(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const y = Math.round(n);
  return y >= 1900 && y <= new Date().getFullYear() + 2 ? y : null;
}

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    const mode = isDemoMode() ? "sample data (no API key)" : `live search via ${modelId()}`;
    console.log(`\n  Cellar Scout — shipping to ${DESTINATION.city}, ${DESTINATION.province}`);
    console.log(`  http://localhost:${port}`);
    console.log(`  Mode: ${mode}\n`);
  });
}

export { app };
