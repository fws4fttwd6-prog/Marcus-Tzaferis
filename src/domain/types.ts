import type { LandedCost, ShippingZone } from "./landed-cost.js";
import type { VintageAssessment } from "./vintage.js";

export type Confidence = "high" | "medium" | "low";
export type DrinkingIntent = "drink-now" | "cellar" | "either";

/** What the app decided the user actually asked for. */
export interface WineIdentity {
  /** Exactly what the user typed. */
  query: string;
  producer: string;
  wineName: string;
  /** Producer + wine, tidied for display. */
  fullName: string;
  country: string;
  /** Human-readable appellation, e.g. "Bolgheri DOC Superiore". */
  appellation: string | null;
  /** Key into the region profile / vintage chart, when we could match one. */
  regionKey: string | null;
  regionLabel: string | null;
  style: "red" | "white" | "sparkling" | "sweet" | "rose" | "unknown";
  grapes: string[];
  /** Typical market price for a current release, 750ml, in CAD. */
  typicalPriceCad: number | null;
  /** One or two sentences on what the wine is and why it matters. */
  notes: string | null;
  confidence: Confidence;
  /** Spellings the search should also try — the user may have typed it by ear. */
  alternateSpellings: string[];
  /** Set when we corrected the user's spelling. */
  correctedFrom: string | null;
}

/** A single bottle offered for sale by a single vendor. */
export interface Listing {
  vendorName: string;
  vendorCountry: string | null;
  vendorRegion: string | null;
  vendorCity: string | null;
  productUrl: string | null;
  vintage: number | null;
  bottleMl: number;
  price: number;
  currency: string;
  inStock: boolean | null;
  quantityAvailable: number | null;
  /** Free-text shipping note lifted from the vendor's page. */
  shippingNote: string | null;
  /** Vendor's quoted shipping to Canada for the order, in their currency. */
  quotedShipping: number | null;
  shipsToCanada: boolean | null;
  freeShippingOver: number | null;
  criticScore: number | null;
  criticSource: string | null;
  sourceUrl: string | null;
}

export interface DealScore {
  /** 0-100. Higher is a better deal, not a better wine. */
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D";
  verdict: string;
  /** Component breakdown, each 0-100, so the score can be argued with. */
  components: {
    priceAdvantage: number;
    vintageQuality: number;
    criticSignal: number;
    readiness: number;
    qualityPerDollar: number;
  };
  /** Plain-English reasons, best first. */
  reasons: string[];
  /** Things that should give the buyer pause. */
  warnings: string[];
}

export interface ScoredListing extends Listing {
  id: string;
  priceCad: number;
  fxRate: number;
  fxStale: boolean;
  zone: ShippingZone;
  landed: LandedCost;
  landedPerBottleCad: number;
  /** Landed cost normalised to a 750ml equivalent, so magnums compare fairly. */
  landedPer750Cad: number;
  /** Landed cost per bottle at 1 / 3 / 6 / 12 bottles. */
  landedCurve: Array<{ quantity: number; perBottleCad: number; totalCad: number }>;
  vintageAssessment: VintageAssessment | null;
  deal: DealScore;
}

export interface PriceReference {
  /** Median landed price per bottle across everything we found, in CAD. */
  medianLandedCad: number | null;
  /** Median shelf price per bottle across everything we found, in CAD. */
  medianShelfCad: number | null;
  /** The benchmark the scorer actually used, and where it came from. */
  benchmarkCad: number;
  benchmarkSource:
    | "listings-median"
    | "research-typical-price"
    | "region-price-band"
    | "none";
  sampleSize: number;
}

export interface SearchOptions {
  quantity: number;
  intent: DrinkingIntent;
  maxPriceCad: number | null;
  vintage: number | null;
  includeOutOfStock: boolean;
  temperatureControlled: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  quantity: 6,
  intent: "either",
  maxPriceCad: null,
  vintage: null,
  includeOutOfStock: false,
  temperatureControlled: false,
};

export interface SearchResult {
  query: string;
  identity: WineIdentity;
  options: SearchOptions;
  listings: ScoredListing[];
  priceReference: PriceReference;
  vintageAdvice: import("./vintage.js").VintageAdvice | null;
  /** The app's own recommendation, in a sentence or two. */
  recommendation: string;
  /** Best listing ids, in order. */
  topPicks: string[];
  sources: Array<{ title: string; url: string }>;
  meta: {
    demo: boolean;
    model: string | null;
    fxAsOf: string;
    fxSource: string;
    searchedAt: string;
    elapsedMs: number;
    warnings: string[];
  };
}

export interface DiscoveryPick {
  id: string;
  producer: string;
  wineName: string;
  country: string;
  appellation: string | null;
  regionKey: string | null;
  regionLabel: string | null;
  vintage: number | null;
  /** Typical landed price in Toronto for one bottle, CAD. */
  estimatedLandedCad: number | null;
  /** Where it can be had, if the research turned up a vendor. */
  vendorName: string | null;
  vendorCountry: string | null;
  productUrl: string | null;
  price: number | null;
  currency: string | null;
  criticScore: number | null;
  criticSource: string | null;
  vintageScore: number | null;
  maturity: string | null;
  /** Why this is a value, in one or two sentences. */
  rationale: string;
  grapes: string[];
  style: string;
  deal: DealScore | null;
}

export interface DiscoveryResult {
  brief: string;
  picks: DiscoveryPick[];
  sources: Array<{ title: string; url: string }>;
  meta: SearchResult["meta"];
}
