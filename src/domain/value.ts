/**
 * The deal scorer.
 *
 * "Good value" is not "cheap". It is a quality signal divided by what the
 * bottle costs *delivered to Toronto*, judged against what that wine normally
 * trades for and whether it will be ready when you want to drink it. Each
 * component below is scored 0-100 on its own terms and then weighted, so a
 * score can always be taken apart and argued with.
 */

import { REGION_BY_KEY } from "../data/regions.js";
import type { DealScore, DrinkingIntent, PriceReference } from "./types.js";
import type { VintageAssessment } from "./vintage.js";

const WEIGHTS = {
  priceAdvantage: 0.38,
  vintageQuality: 0.24,
  criticSignal: 0.14,
  readiness: 0.12,
  qualityPerDollar: 0.12,
} as const;

export interface ScoreInput {
  landedPerBottleCad: number;
  shelfPriceCad: number;
  vintage: VintageAssessment | null;
  criticScore: number | null;
  criticSource: string | null;
  reference: PriceReference;
  intent: DrinkingIntent;
  regionKey: string | null;
  inStock: boolean | null;
  shipsToCanada: boolean | null;
  fxStale: boolean;
  landedConfidence: "quoted" | "estimated" | "rough";
  bottleMl: number;
}

export function scoreDeal(input: ScoreInput): DealScore {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const priceAdvantage = scorePriceAdvantage(input, reasons);
  const vintageQuality = scoreVintageQuality(input, reasons);
  const criticSignal = scoreCriticSignal(input, reasons);
  const readiness = scoreReadiness(input, reasons, warnings);
  const qualityPerDollar = scoreQualityPerDollar(input, reasons);

  const components = {
    priceAdvantage,
    vintageQuality,
    criticSignal,
    readiness,
    qualityPerDollar,
  };

  let score =
    components.priceAdvantage * WEIGHTS.priceAdvantage +
    components.vintageQuality * WEIGHTS.vintageQuality +
    components.criticSignal * WEIGHTS.criticSignal +
    components.readiness * WEIGHTS.readiness +
    components.qualityPerDollar * WEIGHTS.qualityPerDollar;

  // ---- Penalties that are about buying, not about the wine -----------------
  if (input.inStock === false) {
    score -= 22;
    warnings.push("Listed as out of stock — you cannot buy this, whatever it costs.");
  } else if (input.inStock === null) {
    // A price with no confirmed stock is the commonest trap in wine research:
    // old listings sit online for years. Worth less than a confirmed bottle.
    score -= 5;
    warnings.push("Stock is unconfirmed — check the listing is live before counting on it.");
  }
  if (input.shipsToCanada === false) {
    score -= 18;
    warnings.push("This vendor does not ship to Canada. You would need a forwarder.");
  } else if (input.shipsToCanada === null) {
    warnings.push("Shipping to Canada is unconfirmed — check before you count on this price.");
  }
  if (input.landedConfidence === "rough") {
    warnings.push(
      "Landed cost is estimated from standard rates, not a vendor quote. Treat it as ±20%.",
    );
  }
  if (input.fxStale) {
    warnings.push("Exchange rate is a pinned fallback, not today's rate.");
  }
  if (input.bottleMl !== 750) {
    reasons.push(`${input.bottleMl}ml format — compared on a per-750ml basis.`);
  }
  if (input.reference.benchmarkSource === "region-price-band") {
    warnings.push(
      "No market price found for this exact wine, so it is judged against its appellation's typical range.",
    );
  }
  if (input.reference.sampleSize > 0 && input.reference.sampleSize < 3) {
    warnings.push(
      `Only ${input.reference.sampleSize} comparable listing${input.reference.sampleSize === 1 ? "" : "s"} found — the benchmark is thin.`,
    );
  }

  score = clamp(Math.round(score), 0, 100);
  const grade = toGrade(score);

  return {
    score,
    grade,
    verdict: verdictFor(grade, input),
    components: {
      priceAdvantage: Math.round(priceAdvantage),
      vintageQuality: Math.round(vintageQuality),
      criticSignal: Math.round(criticSignal),
      readiness: Math.round(readiness),
      qualityPerDollar: Math.round(qualityPerDollar),
    },
    reasons: reasons.slice(0, 5),
    warnings,
  };
}

/** How far below the benchmark this landed price sits. */
function scorePriceAdvantage(input: ScoreInput, reasons: string[]): number {
  const benchmark = input.reference.benchmarkCad;
  if (!benchmark || benchmark <= 0) return 50;

  const delta = (benchmark - input.landedPerBottleCad) / benchmark;
  // -25% over the benchmark scores 0; +35% under it scores 100.
  const score = clamp(((delta + 0.25) / 0.6) * 100, 0, 100);

  const pct = Math.round(Math.abs(delta) * 100);
  if (delta >= 0.12) {
    reasons.push(
      `Lands ${pct}% below the ${describeBenchmark(input.reference)} of ${money(benchmark)}.`,
    );
  } else if (delta <= -0.12) {
    reasons.push(
      `Lands ${pct}% above the ${describeBenchmark(input.reference)} of ${money(benchmark)}.`,
    );
  } else {
    reasons.push(`Priced in line with the ${describeBenchmark(input.reference)}.`);
  }
  return score;
}

function scoreVintageQuality(input: ScoreInput, reasons: string[]): number {
  const v = input.vintage;
  if (!v || v.score === null) return 55;

  // 80 points is a poor year, 99 is legendary.
  const score = clamp(((v.score - 80) / 19) * 100, 0, 100);
  if (v.score >= 95) {
    reasons.push(`${v.year} is a landmark vintage here (${v.score}/100).`);
  } else if (v.score >= 91) {
    reasons.push(`${v.year} is a strong vintage (${v.score}/100).`);
  } else if (v.score < 86) {
    reasons.push(`${v.year} was a difficult year (${v.score}/100) — producer matters more than usual.`);
  }
  if (v.attentionDiscount >= 3 && v.score >= 90) {
    reasons.push(
      `Overshadowed by the neighbouring vintage, which is why it is cheaper than its quality warrants.`,
    );
  }
  return score;
}

function scoreCriticSignal(input: ScoreInput, reasons: string[]): number {
  if (input.criticScore === null) {
    // No critic score is not a mark against the wine; fall back to the vintage.
    const v = input.vintage?.score;
    return v === null || v === undefined ? 50 : clamp(((v - 82) / 16) * 100, 0, 100) * 0.85;
  }
  const s = input.criticScore;
  const score = clamp(((s - 85) / 13) * 100, 0, 100);
  if (s >= 95) {
    reasons.push(`Critically outstanding: ${s} points${input.criticSource ? ` (${input.criticSource})` : ""}.`);
  } else if (s >= 92) {
    reasons.push(`Well reviewed: ${s} points${input.criticSource ? ` (${input.criticSource})` : ""}.`);
  }
  return score;
}

/** Does the bottle suit when the buyer wants to open it? */
function scoreReadiness(input: ScoreInput, reasons: string[], warnings: string[]): number {
  const v = input.vintage;
  if (!v || !v.maturity) return 55;

  const table: Record<DrinkingIntent, Record<string, number>> = {
    "drink-now": {
      "at-peak": 100,
      mature: 88,
      approaching: 74,
      "in-window": 58,
      fading: 34,
      "too-young": 18,
    },
    cellar: {
      "too-young": 100,
      "in-window": 88,
      approaching: 72,
      "at-peak": 56,
      mature: 30,
      fading: 10,
    },
    either: {
      "at-peak": 100,
      "in-window": 86,
      approaching: 86,
      "too-young": 70,
      mature: 70,
      fading: 30,
    },
  };

  const score = table[input.intent][v.maturity] ?? 55;

  if (v.maturity === "at-peak") {
    reasons.push(`Drinking at its peak now (window ${v.window!.peakFrom}–${v.window!.peakTo}).`);
  } else if (v.maturity === "too-young" && v.yearsToPeak > 0) {
    const msg = `Needs about ${v.yearsToPeak} more year${v.yearsToPeak === 1 ? "" : "s"} before it hits its stride.`;
    if (input.intent === "drink-now") warnings.push(msg);
    else reasons.push(msg);
  } else if (v.maturity === "fading") {
    warnings.push(`Past its plateau (through roughly ${v.window!.to}) — buy only from cold storage.`);
  }
  return score;
}

/**
 * Quality per dollar judged against the appellation's own price band, so a
 * $35 Bierzo and a $350 Barolo can both be excellent value.
 */
function scoreQualityPerDollar(input: ScoreInput, reasons: string[]): number {
  const region = input.regionKey ? REGION_BY_KEY.get(input.regionKey) : undefined;
  const quality =
    input.criticScore ??
    input.vintage?.score ??
    88; // neutral assumption when we know nothing

  if (!region) {
    // Without a band, use a blunt quality-per-dollar curve.
    const ratio = (quality - 80) / Math.max(input.landedPerBottleCad, 1);
    return clamp(ratio * 900, 0, 100);
  }

  const [entry, mid, benchmark] = region.priceBandCad;
  const price = input.landedPerBottleCad;

  // Where does this price sit in the appellation's range? 0 = entry, 1 = benchmark.
  const pricePosition = clamp(
    price <= mid
      ? ((price - entry) / Math.max(mid - entry, 1)) * 0.5
      : 0.5 + ((price - mid) / Math.max(benchmark - mid, 1)) * 0.5,
    0,
    1.4,
  );
  // And where does the quality sit? 86 -> 0, 98 -> 1.
  const qualityPosition = clamp((quality - 86) / 12, 0, 1);

  const score = clamp(50 + (qualityPosition - pricePosition) * 110, 0, 100);

  if (qualityPosition - pricePosition > 0.25) {
    reasons.push(
      `Punches above its price band — ${region.label} bottles of this quality usually start nearer ${money(mid)}.`,
    );
  }
  return score;
}

function describeBenchmark(ref: PriceReference): string {
  switch (ref.benchmarkSource) {
    case "listings-median":
      return `median landed price across ${ref.sampleSize} listings`;
    case "research-typical-price":
      return "typical market price";
    case "region-price-band":
      return "appellation's typical price";
    default:
      return "reference price";
  }
}

function toGrade(score: number): DealScore["grade"] {
  if (score >= 82) return "A+";
  if (score >= 71) return "A";
  if (score >= 58) return "B";
  if (score >= 44) return "C";
  return "D";
}

function verdictFor(grade: DealScore["grade"], input: ScoreInput): string {
  const price = money(input.landedPerBottleCad);
  switch (grade) {
    case "A+":
      return `Exceptional value at ${price} landed — buy it.`;
    case "A":
      return `Strong value at ${price} landed.`;
    case "B":
      return `Fair — roughly what it should cost at ${price} landed.`;
    case "C":
      return `Full price at ${price} landed. Worth it only if you want this exact bottle.`;
    case "D":
      return `Poor value at ${price} landed. Look elsewhere.`;
  }
}

/**
 * Work out what price to judge listings against: the market's own median if we
 * have enough of a sample, then the researched typical price, then the
 * appellation's mid band as a last resort.
 */
export function buildPriceReference(args: {
  landedPricesCad: number[];
  shelfPricesCad: number[];
  researchTypicalCad: number | null;
  regionKey: string | null;
}): PriceReference {
  const medianLanded = median(args.landedPricesCad);
  const medianShelf = median(args.shelfPricesCad);
  const sampleSize = args.landedPricesCad.length;

  if (sampleSize >= 3 && medianLanded !== null) {
    return {
      medianLandedCad: medianLanded,
      medianShelfCad: medianShelf,
      benchmarkCad: medianLanded,
      benchmarkSource: "listings-median",
      sampleSize,
    };
  }

  if (args.researchTypicalCad && args.researchTypicalCad > 0) {
    // The researched figure is a shelf price; add a typical import overhead so
    // it is comparable to a landed cost.
    return {
      medianLandedCad: medianLanded,
      medianShelfCad: medianShelf,
      benchmarkCad: Math.round(args.researchTypicalCad * 1.55 * 100) / 100,
      benchmarkSource: "research-typical-price",
      sampleSize,
    };
  }

  if (medianLanded !== null) {
    return {
      medianLandedCad: medianLanded,
      medianShelfCad: medianShelf,
      benchmarkCad: medianLanded,
      benchmarkSource: "listings-median",
      sampleSize,
    };
  }

  const region = args.regionKey ? REGION_BY_KEY.get(args.regionKey) : undefined;
  if (region) {
    return {
      medianLandedCad: null,
      medianShelfCad: null,
      benchmarkCad: Math.round(region.priceBandCad[1] * 1.55 * 100) / 100,
      benchmarkSource: "region-price-band",
      sampleSize,
    };
  }

  return {
    medianLandedCad: null,
    medianShelfCad: null,
    benchmarkCad: 0,
    benchmarkSource: "none",
    sampleSize,
  };
}

export function median(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  const m = xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
  return Math.round(m * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
