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
import { cancelJob, findRunning, getJob, startJob } from "./jobs.js";
import {
  acknowledgeAlerts,
  addWatch,
  getWatch,
  listAlerts,
  listWatches,
  removeWatch,
  restoreSeeds,
  storePath,
  updateWatch,
} from "./store.js";
import { checkWatch, checkWatchlist, isDue } from "./watchlist.js";
import { DEFAULT_RULE, GRADE_ORDER, type Grade } from "./domain/watchlist-types.js";

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
    fx: {
      asOf: fx.asOf,
      source: fx.source,
      sourceLabel: fx.sourceLabel,
      stale: fx.stale,
      liveCurrencies: fx.liveCurrencies,
      overrides: fx.overrides,
      cadPerUnit: fx.cadPerUnit,
    },
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

    // A live search runs for minutes. Holding the HTTP request open that long
    // gets it killed by the browser, the OS or anything in between — which is
    // exactly what "Failed to fetch" was. Hand back a job and let the page
    // poll instead.
    const running = findRunning(`search:${key}`);
    if (running) {
      res.status(202).json({ job: running });
      return;
    }
    const job = startJob(`search:${key}`, async () => {
      const result = await searchWine(query, options);
      searchCache.set(key, result);
      return result;
    });
    res.status(202).json({ job });
  } catch (err) {
    next(err);
  }
});

/** Poll a running search. The job carries the finished result when done. */
app.get("/api/search/:jobId", (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "That search is no longer being tracked. Run it again." });
    return;
  }
  res.json({ job });
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

    const running = findRunning(`discover:${key}`);
    if (running) {
      res.status(202).json({ job: running });
      return;
    }
    const job = startJob(`discover:${key}`, async () => {
      const result = await discoverWines(options);
      discoverCache.set(key, result);
      return result;
    });
    res.status(202).json({ job });
  } catch (err) {
    next(err);
  }
});


/* ── Watchlist ───────────────────────────────────────────────────────────── */

app.get("/api/watchlist", async (_req, res, next) => {
  try {
    const [watches, alerts] = await Promise.all([listWatches(), listAlerts()]);
    res.json({
      watches,
      alerts,
      unacknowledged: alerts.filter((a) => !a.acknowledged).length,
      dueCount: watches.filter((w) => isDue(w)).length,
      storePath: storePath(),
      running: findRunning("watchlist-check") ?? null,
      defaultRule: DEFAULT_RULE,
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/watchlist", async (req, res, next) => {
  try {
    const query = String(req.body?.query ?? "").trim();
    if (!query) {
      res.status(400).json({ error: "Which wine should I watch?" });
      return;
    }
    const watch = await addWatch({
      query,
      label: req.body?.label ? String(req.body.label) : undefined,
      producer: req.body?.producer ?? null,
      country: req.body?.country ?? null,
      appellation: req.body?.appellation ?? null,
      vintage: yearOrNull(req.body?.vintage),
      quantity: clampInt(req.body?.quantity, 1, 120, 6),
      intent: ["drink-now", "cellar", "either"].includes(req.body?.intent) ? req.body.intent : "either",
      checkEveryHours: clampInt(req.body?.checkEveryHours, 1, 720, 24),
      notes: req.body?.notes ? String(req.body.notes).slice(0, 400) : null,
      tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String).slice(0, 8) : [],
      rule: {
        targetLandedCad: positiveOrNull(req.body?.targetLandedCad),
        minGrade: isGrade(req.body?.minGrade) ? req.body.minGrade : DEFAULT_RULE.minGrade,
        dropPct: positiveOrNull(req.body?.dropPct) ?? DEFAULT_RULE.dropPct,
        onNewVintage: req.body?.onNewVintage === undefined ? true : Boolean(req.body.onNewVintage),
      },
    });
    res.status(201).json(watch);
  } catch (err) {
    next(err);
  }
});

app.patch("/api/watchlist/:id", async (req, res, next) => {
  try {
    const patch: Record<string, unknown> = {};
    if (req.body?.label !== undefined) patch.label = String(req.body.label).slice(0, 80);
    if (req.body?.notes !== undefined) patch.notes = req.body.notes ? String(req.body.notes).slice(0, 400) : null;
    if (req.body?.enabled !== undefined) patch.enabled = Boolean(req.body.enabled);
    if (req.body?.quantity !== undefined) patch.quantity = clampInt(req.body.quantity, 1, 120, 6);
    if (req.body?.vintage !== undefined) patch.vintage = yearOrNull(req.body.vintage);
    if (req.body?.checkEveryHours !== undefined) {
      patch.checkEveryHours = clampInt(req.body.checkEveryHours, 1, 720, 24);
    }
    if (["drink-now", "cellar", "either"].includes(req.body?.intent)) patch.intent = req.body.intent;

    const rule: Record<string, unknown> = {};
    if (req.body?.targetLandedCad !== undefined) rule.targetLandedCad = positiveOrNull(req.body.targetLandedCad);
    if (req.body?.dropPct !== undefined) rule.dropPct = positiveOrNull(req.body.dropPct);
    if (req.body?.minGrade !== undefined) rule.minGrade = isGrade(req.body.minGrade) ? req.body.minGrade : null;
    if (req.body?.onNewVintage !== undefined) rule.onNewVintage = Boolean(req.body.onNewVintage);
    if (Object.keys(rule).length) patch.rule = rule;

    const watch = await updateWatch(String(req.params.id), patch as never);
    if (!watch) {
      res.status(404).json({ error: "No such watch." });
      return;
    }
    res.json(watch);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/watchlist/:id", async (req, res, next) => {
  try {
    const ok = await removeWatch(String(req.params.id));
    res.status(ok ? 200 : 404).json({ ok });
  } catch (err) {
    next(err);
  }
});

app.post("/api/watchlist/restore-seeds", async (_req, res, next) => {
  try {
    res.json({ restored: await restoreSeeds() });
  } catch (err) {
    next(err);
  }
});

/** One wine, checked synchronously — a single search finishes inside a request. */
app.post("/api/watchlist/:id/check", async (req, res, next) => {
  try {
    const watch = await getWatch(String(req.params.id));
    if (!watch) {
      res.status(404).json({ error: "No such watch." });
      return;
    }
    res.json(await checkWatch(watch));
  } catch (err) {
    next(err);
  }
});

/** Everything due, in the background — too slow to hold a request open. */
app.post("/api/watchlist/check", (req, res) => {
  const already = findRunning("watchlist-check");
  if (already) {
    res.status(409).json({ error: "A check is already running.", job: already });
    return;
  }
  const force = Boolean(req.body?.force);
  const limit = req.body?.limit ? clampInt(req.body.limit, 1, 100, 25) : undefined;
  const job = startJob("watchlist-check", (report, signal) =>
    checkWatchlist({ force, limit, signal, onProgress: report }),
  );
  res.status(202).json({ job });
});

app.get("/api/watchlist/check/:jobId", (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "No such job. It may have finished over an hour ago." });
    return;
  }
  res.json({ job });
});

app.delete("/api/watchlist/check/:jobId", (req, res) => {
  res.json({ cancelled: cancelJob(String(req.params.jobId)) });
});

app.post("/api/alerts/ack", async (req, res, next) => {
  try {
    const ids = req.body?.ids === "all" ? "all" : Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    res.json({ acknowledged: await acknowledgeAlerts(ids) });
  } catch (err) {
    next(err);
  }
});

/** Poll a running discovery sweep. */
app.get("/api/discover/:jobId", (req, res) => {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "That sweep is no longer being tracked. Run it again." });
    return;
  }
  res.json({ job });
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

function isGrade(value: unknown): value is Grade {
  return typeof value === "string" && value in GRADE_ORDER;
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
    console.log(`\n  Krasi Crazy — shipping to ${DESTINATION.city}, ${DESTINATION.province}`);
    console.log(`  http://localhost:${port}`);
    console.log(`  Mode: ${mode}\n`);
  });
}

export { app };
