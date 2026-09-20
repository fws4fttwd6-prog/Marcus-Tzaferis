import { createHash } from "node:crypto";
import { REGION_BY_KEY, resolveRegionKey } from "./data/regions.js";
import { convertToCad, getFxTable } from "./domain/fx.js";
import {
  estimateLandedCost,
  landedCostCurve,
  zoneForLocation,
} from "./domain/landed-cost.js";
import {
  DEFAULT_SEARCH_OPTIONS,
  type Listing,
  type ScoredListing,
  type SearchOptions,
  type SearchResult,
  type WineIdentity,
} from "./domain/types.js";
import { buildPriceReference, scoreDeal } from "./domain/value.js";
import { assessVintage, currentYear, MATURITY_LABEL, vintageAdvice } from "./domain/vintage.js";
import { isDemoMode, modelId } from "./claude/client.js";
import {
  VENDOR_EXTRACTION_INSTRUCTION,
  EXTRACTION_SYSTEM,
  VENDOR_RESEARCH_SYSTEM,
  vendorResearchPrompt,
} from "./claude/prompts.js";
import { extract, runResearch } from "./claude/research.js";
import { SearchExtractionSchema, type SearchExtraction } from "./claude/schemas.js";
import { demoSearchExtraction } from "./data/demo.js";

export async function searchWine(
  query: string,
  partialOptions: Partial<SearchOptions> = {},
  signal?: AbortSignal,
): Promise<SearchResult> {
  const startedAt = Date.now();
  const options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...partialOptions };
  const warnings: string[] = [];
  const demo = isDemoMode();

  let extraction: SearchExtraction;
  let sources: Array<{ title: string; url: string }> = [];

  if (demo) {
    extraction = demoSearchExtraction(query);
    sources = extraction.sources;
    warnings.push(
      "Running on bundled sample data. Set ANTHROPIC_API_KEY to search the live web.",
    );
  } else {
    const research = await runResearch({
      system: VENDOR_RESEARCH_SYSTEM,
      prompt: vendorResearchPrompt({
        query,
        today: new Date().toISOString().slice(0, 10),
        vintage: options.vintage,
        maxPriceCad: options.maxPriceCad,
        intent: options.intent,
      }),
      maxSearches: 16,
      effort: "high",
      signal,
    });

    extraction = await extract({
      schema: SearchExtractionSchema,
      system: EXTRACTION_SYSTEM,
      research: research.text,
      instruction: VENDOR_EXTRACTION_INSTRUCTION,
      signal,
    });
    sources = mergeSources(research.sources, extraction.sources);
  }

  // The extraction schema uses "" for text it could not find, to stay under
  // the API's cap on union-typed parameters. Restore nulls at the boundary so
  // nothing downstream has to know about that.
  const rawListings: Listing[] = extraction.listings.map((l) => ({
    ...l,
    vendorCountry: blankToNull(l.vendorCountry),
    vendorRegion: blankToNull(l.vendorRegion),
    vendorCity: blankToNull(l.vendorCity),
    productUrl: blankToNull(l.productUrl),
    shippingNote: blankToNull(l.shippingNote),
    criticSource: blankToNull(l.criticSource),
    sourceUrl: blankToNull(l.sourceUrl),
  }));

  const identity = buildIdentity(query, extraction);
  const fx = await getFxTable();
  if (fx.stale) {
    warnings.push(
      `Exchange rates are a pinned fallback dated ${fx.asOf}, not live. Converted prices are approximate.`,
    );
  }

  const asOf = currentYear();

  // ---- Price every listing in Toronto terms --------------------------------
  const priced = rawListings
    .filter((l) => Number.isFinite(l.price) && l.price > 0)
    .filter((l) => options.includeOutOfStock || l.inStock !== false)
    .filter((l) => options.vintage === null || l.vintage === options.vintage)
    .map((listing) => {
      const bottleMl = listing.bottleMl && listing.bottleMl > 0 ? listing.bottleMl : 750;
      const { cad: priceCad, rate, stale } = convertToCad(listing.price, listing.currency, fx);
      const zone = zoneForLocation(listing.vendorCountry, listing.vendorRegion);

      const quotedShippingCad =
        listing.quotedShipping !== null
          ? convertToCad(listing.quotedShipping, listing.currency, fx).cad
          : null;
      const freeShippingOverCad =
        listing.freeShippingOver !== null
          ? convertToCad(listing.freeShippingOver, listing.currency, fx).cad
          : null;

      const costInput = {
        bottlePriceCad: priceCad,
        zone,
        bottleMl,
        quotedShippingCad,
        freeShippingOverCad,
        temperatureControlled: options.temperatureControlled,
      };
      const landed = estimateLandedCost({ ...costInput, quantity: options.quantity });
      const curve = landedCostCurve(costInput, [1, 3, 6, 12]);

      const vintageAssessment =
        identity.regionKey && listing.vintage
          ? assessVintage(identity.regionKey, listing.vintage, asOf)
          : null;

      const per750 = landed.perBottleCad * (750 / bottleMl);

      return {
        listing,
        bottleMl,
        priceCad,
        rate,
        stale,
        zone,
        landed,
        curve,
        vintageAssessment,
        per750,
      };
    });

  if (!priced.length) {
    warnings.push(
      rawListings.length
        ? "Every listing found was filtered out by your options. Try widening them."
        : "No merchant listings were found for this wine.",
    );
  }

  // ---- Establish what a fair price actually is -----------------------------
  const reference = buildPriceReference({
    landedPricesCad: priced.map((p) => p.per750),
    shelfPricesCad: priced.map((p) => p.priceCad * (750 / p.bottleMl)),
    researchTypicalCad: identity.typicalPriceCad,
    regionKey: identity.regionKey,
  });

  // ---- Score ---------------------------------------------------------------
  const listings: ScoredListing[] = priced.map((p) => {
    const deal = scoreDeal({
      landedPerBottleCad: p.per750,
      shelfPriceCad: p.priceCad,
      vintage: p.vintageAssessment,
      criticScore: p.listing.criticScore,
      criticSource: p.listing.criticSource,
      reference,
      intent: options.intent,
      regionKey: identity.regionKey,
      inStock: p.listing.inStock,
      shipsToCanada: p.listing.shipsToCanada,
      fxStale: p.stale,
      landedConfidence: p.landed.confidence,
      bottleMl: p.bottleMl,
    });

    return {
      ...p.listing,
      bottleMl: p.bottleMl,
      id: listingId(p.listing),
      priceCad: p.priceCad,
      fxRate: p.rate,
      fxStale: p.stale,
      zone: p.zone,
      landed: p.landed,
      landedPerBottleCad: p.landed.perBottleCad,
      landedPer750Cad: Math.round(p.per750 * 100) / 100,
      landedCurve: p.curve,
      vintageAssessment: p.vintageAssessment,
      deal,
    };
  });

  listings.sort(
    (a, b) => b.deal.score - a.deal.score || a.landedPer750Cad - b.landedPer750Cad,
  );

  const advice = identity.regionKey ? vintageAdvice(identity.regionKey, asOf) : null;

  return {
    query,
    identity,
    options,
    listings,
    priceReference: reference,
    vintageAdvice: advice,
    recommendation: buildRecommendation(identity, listings, options, advice),
    topPicks: listings.slice(0, 3).map((l) => l.id),
    sources,
    meta: {
      demo,
      model: demo ? null : modelId(),
      fxAsOf: fx.asOf,
      fxSource: fx.source,
      searchedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      warnings,
    },
  };
}

function buildIdentity(query: string, extraction: SearchExtraction): WineIdentity {
  const raw = extraction.identity;
  const regionKey =
    resolveRegionKey(raw.regionHint) ??
    resolveRegionKey(raw.appellation) ??
    resolveRegionKey(raw.wineName) ??
    null;
  const region = regionKey ? REGION_BY_KEY.get(regionKey) : undefined;

  return {
    query,
    producer: raw.producer,
    wineName: raw.wineName,
    fullName: raw.fullName,
    country: raw.country,
    appellation: raw.appellation,
    regionKey,
    regionLabel: region?.label ?? raw.regionHint ?? null,
    style: raw.style,
    grapes: raw.grapes,
    typicalPriceCad: raw.typicalPriceCad,
    notes: raw.notes,
    confidence: raw.confidence,
    alternateSpellings: raw.alternateSpellings,
    correctedFrom:
      raw.correctedFrom && raw.correctedFrom.toLowerCase() !== raw.fullName.toLowerCase()
        ? raw.correctedFrom
        : null,
  };
}

function buildRecommendation(
  identity: WineIdentity,
  listings: ScoredListing[],
  options: SearchOptions,
  advice: ReturnType<typeof vintageAdvice>,
): string {
  if (!listings.length) {
    return `Nothing currently offered for ${identity.fullName} matched your filters. Widening the vintage range or allowing out-of-stock listings usually turns something up.`;
  }

  const best = listings[0]!;
  const parts: string[] = [];

  const vintageLabel = best.vintage ? `the ${best.vintage}` : "the non-vintage bottling";
  parts.push(
    `Best buy is ${vintageLabel} from ${best.vendorName}${
      best.vendorCountry ? ` in ${best.vendorCountry}` : ""
    }, landing at about $${best.landedPer750Cad.toFixed(2)} a bottle in Toronto on a ${options.quantity}-bottle order.`,
  );

  if (best.inStock === false) {
    parts.push("It is listed as out of stock, so treat that price as indicative only.");
  } else if (best.inStock === null) {
    parts.push(
      "Stock was not confirmed on the page, so check it is actually available before making the trip.",
    );
  }

  if (best.vintageAssessment?.score) {
    const v = best.vintageAssessment;
    parts.push(
      `${v.year} scores ${v.score} in ${identity.regionLabel ?? "the region"}${
        v.maturity ? ` and is ${MATURITY_LABEL[v.maturity].toLowerCase()}` : ""
      }.`,
    );
  }

  // Only worth saying when a *different* merchant looks cheaper on the shelf
  // and turns out dearer delivered — that is the point being made. Comparing
  // two listings from the same merchant, or one that is genuinely cheaper
  // both ways, produces a sentence that contradicts itself.
  const cheapestShelf = [...listings].sort(
    (a, b) => a.priceCad * (750 / a.bottleMl) - b.priceCad * (750 / b.bottleMl),
  )[0]!;
  if (
    cheapestShelf.id !== best.id &&
    cheapestShelf.vendorName !== best.vendorName &&
    cheapestShelf.landedPer750Cad > best.landedPer750Cad
  ) {
    parts.push(
      `${cheapestShelf.vendorName} looks cheaper on the shelf, but delivered it works out to $${cheapestShelf.landedPer750Cad.toFixed(2)} — which is why shelf price alone is misleading.`,
    );
  }

  const ontario = listings.find((l) => l.zone === "ontario");
  if (ontario && ontario.id !== best.id) {
    parts.push(
      `If you would rather not deal with importing, ${ontario.vendorName} has it in Ontario at $${ontario.landedPer750Cad.toFixed(2)} all-in.`,
    );
  }

  if (advice?.sleepers.length) {
    const s = advice.sleepers[0]!;
    if (!listings.some((l) => l.vintage === s.year)) {
      parts.push(
        `Worth watching for: the ${s.year}, which scores ${s.score} but trades below its quality because the neighbouring vintage took the attention.`,
      );
    }
  }

  return parts.join(" ");
}

function mergeSources(
  a: Array<{ title: string; url: string }>,
  b: Array<{ title: string; url: string }>,
): Array<{ title: string; url: string }> {
  const seen = new Map<string, string>();
  for (const s of [...a, ...b]) {
    if (s.url && !seen.has(s.url)) seen.set(s.url, s.title || s.url);
  }
  return [...seen.entries()].map(([url, title]) => ({ title, url }));
}

/** "" is how the extraction schema spells "not found". */
export function blankToNull(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t === "" ? null : t;
}

function listingId(l: { vendorName: string; vintage: number | null; productUrl: string | null }): string {
  return createHash("sha1")
    .update(`${l.vendorName}|${l.vintage ?? "nv"}|${l.productUrl ?? ""}`)
    .digest("hex")
    .slice(0, 12);
}
