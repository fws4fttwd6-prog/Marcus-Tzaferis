import { createHash } from "node:crypto";
import { REGION_BY_KEY, resolveRegionKey } from "./data/regions.js";
import { convertToCad, getFxTable } from "./domain/fx.js";
import { estimateLandedCost, zoneForLocation } from "./domain/landed-cost.js";
import type { DiscoveryPick, DiscoveryResult } from "./domain/types.js";
import { buildPriceReference, scoreDeal } from "./domain/value.js";
import { assessVintage, currentYear, MATURITY_LABEL } from "./domain/vintage.js";
import { isDemoMode, modelId } from "./claude/client.js";
import {
  DISCOVERY_EXTRACTION_INSTRUCTION,
  DISCOVERY_SYSTEM,
  discoveryPrompt,
  EXTRACTION_SYSTEM,
} from "./claude/prompts.js";
import { extract, runResearch } from "./claude/research.js";
import { DiscoveryExtractionSchema, type DiscoveryExtraction } from "./claude/schemas.js";
import { demoDiscoveryExtraction } from "./data/demo.js";
import { blankToNull } from "./search.js";

export interface DiscoverOptions {
  countries: string[];
  minPriceCad: number;
  maxPriceCad: number;
  style: "any" | "red" | "white" | "sparkling" | "sweet" | "rose";
  count: number;
  focus: string | null;
  /** How many bottles a landed-cost estimate should assume. */
  quantity: number;
}

export const DEFAULT_DISCOVER_OPTIONS: DiscoverOptions = {
  countries: ["France", "Italy", "Spain"],
  minPriceCad: 30,
  maxPriceCad: 120,
  style: "any",
  count: 8,
  focus: null,
  quantity: 6,
};

export async function discoverWines(
  partial: Partial<DiscoverOptions> = {},
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  const startedAt = Date.now();
  const options: DiscoverOptions = { ...DEFAULT_DISCOVER_OPTIONS, ...partial };
  const warnings: string[] = [];
  const demo = isDemoMode();

  let extraction: DiscoveryExtraction;
  let sources: Array<{ title: string; url: string }> = [];

  if (demo) {
    extraction = demoDiscoveryExtraction();
    sources = extraction.sources;
    warnings.push("Running on bundled sample data. Set ANTHROPIC_API_KEY to search the live web.");
  } else {
    const research = await runResearch({
      system: DISCOVERY_SYSTEM,
      prompt: discoveryPrompt({
        today: new Date().toISOString().slice(0, 10),
        countries: options.countries,
        minPriceCad: options.minPriceCad,
        maxPriceCad: options.maxPriceCad,
        style: options.style,
        count: options.count,
        focus: options.focus,
      }),
      maxSearches: 18,
      effort: "high",
      signal,
    });

    extraction = await extract({
      schema: DiscoveryExtractionSchema,
      system: EXTRACTION_SYSTEM,
      research: research.text,
      instruction: DISCOVERY_EXTRACTION_INSTRUCTION,
      signal,
    });
    sources = mergeSources(research.sources, extraction.sources);
  }

  const fx = await getFxTable();
  if (fx.stale) {
    warnings.push(`Exchange rates are a pinned fallback dated ${fx.asOf}, not live.`);
  }
  const asOf = currentYear();

  const picks: DiscoveryPick[] = extraction.picks.map((rawIn) => {
    const raw = {
      ...rawIn,
      vendorName: blankToNull(rawIn.vendorName),
      vendorCountry: blankToNull(rawIn.vendorCountry),
      productUrl: blankToNull(rawIn.productUrl),
      currency: blankToNull(rawIn.currency),
      criticSource: blankToNull(rawIn.criticSource),
    };
    const regionKey =
      resolveRegionKey(raw.regionHint) ?? resolveRegionKey(raw.appellation) ?? null;
    const region = regionKey ? REGION_BY_KEY.get(regionKey) : undefined;

    const vintageAssessment =
      regionKey && raw.vintage ? assessVintage(regionKey, raw.vintage, asOf) : null;

    let estimatedLandedCad: number | null = null;
    let deal = null;

    if (raw.price !== null && raw.price > 0 && raw.currency) {
      const bottleMl = raw.bottleMl && raw.bottleMl > 0 ? raw.bottleMl : 750;
      const { cad: priceCad, stale } = convertToCad(raw.price, raw.currency, fx);
      const zone = zoneForLocation(raw.vendorCountry ?? raw.country);
      const landed = estimateLandedCost({
        bottlePriceCad: priceCad,
        zone,
        quantity: options.quantity,
        bottleMl,
      });
      const per750 = landed.perBottleCad * (750 / bottleMl);
      estimatedLandedCad = Math.round(per750 * 100) / 100;

      // Judged against its own appellation's band, since there is no basket of
      // competing listings for a one-off discovery pick.
      const reference = buildPriceReference({
        landedPricesCad: [],
        shelfPricesCad: [],
        researchTypicalCad: null,
        regionKey,
      });

      deal = scoreDeal({
        landedPerBottleCad: per750,
        shelfPriceCad: priceCad,
        vintage: vintageAssessment,
        criticScore: raw.criticScore,
        criticSource: raw.criticSource,
        reference,
        intent: "either",
        regionKey,
        inStock: null,
        shipsToCanada: null,
        fxStale: stale,
        landedConfidence: landed.confidence,
        bottleMl,
      });
    }

    return {
      id: createHash("sha1")
        .update(`${raw.producer}|${raw.wineName}|${raw.vintage ?? "nv"}`)
        .digest("hex")
        .slice(0, 12),
      producer: raw.producer,
      wineName: raw.wineName,
      country: raw.country,
      appellation: raw.appellation,
      regionKey,
      regionLabel: region?.label ?? raw.regionHint ?? null,
      vintage: raw.vintage,
      estimatedLandedCad,
      vendorName: raw.vendorName,
      vendorCountry: raw.vendorCountry,
      productUrl: raw.productUrl,
      price: raw.price,
      currency: raw.currency,
      criticScore: raw.criticScore,
      criticSource: raw.criticSource,
      vintageScore: vintageAssessment?.score ?? null,
      maturity: vintageAssessment?.maturity ? MATURITY_LABEL[vintageAssessment.maturity] : null,
      rationale: raw.rationale,
      grapes: raw.grapes,
      style: raw.style,
      deal,
    };
  });

  picks.sort((a, b) => (b.deal?.score ?? 0) - (a.deal?.score ?? 0));

  return {
    brief: extraction.brief,
    picks,
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
