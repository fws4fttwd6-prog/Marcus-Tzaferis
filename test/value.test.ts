import { describe, expect, it } from "vitest";
import { buildPriceReference, median, scoreDeal } from "../src/domain/value.js";
import { assessVintage } from "../src/domain/vintage.js";
import type { PriceReference } from "../src/domain/types.js";

const reference: PriceReference = {
  medianLandedCad: 200,
  medianShelfCad: 120,
  benchmarkCad: 200,
  benchmarkSource: "listings-median",
  sampleSize: 6,
};

const baseline = {
  landedPerBottleCad: 200,
  shelfPriceCad: 120,
  vintage: assessVintage("bolgheri", 2019, 2026),
  criticScore: 95,
  criticSource: "Vinous",
  reference,
  intent: "either" as const,
  regionKey: "bolgheri",
  inStock: true,
  shipsToCanada: true,
  fxStale: false,
  landedConfidence: "quoted" as const,
  bottleMl: 750,
};

describe("scoreDeal", () => {
  it("rewards a lower landed price, all else equal", () => {
    const cheap = scoreDeal({ ...baseline, landedPerBottleCad: 130 });
    const dear = scoreDeal({ ...baseline, landedPerBottleCad: 280 });
    expect(cheap.score).toBeGreaterThan(dear.score);
    expect(cheap.components.priceAdvantage).toBeGreaterThan(dear.components.priceAdvantage);
  });

  it("rewards a better vintage, all else equal", () => {
    const great = scoreDeal({ ...baseline, vintage: assessVintage("bolgheri", 2016, 2026) });
    const poor = scoreDeal({ ...baseline, vintage: assessVintage("bolgheri", 2014, 2026) });
    expect(great.components.vintageQuality).toBeGreaterThan(poor.components.vintageQuality);
  });

  it("is monotonic in price across the whole range", () => {
    const scores = [80, 120, 160, 200, 240, 300].map(
      (p) => scoreDeal({ ...baseline, landedPerBottleCad: p }).score,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });

  it("grades consistently with the numeric score", () => {
    const order = { "A+": 5, A: 4, B: 3, C: 2, D: 1 };
    const cheap = scoreDeal({ ...baseline, landedPerBottleCad: 90 });
    const dear = scoreDeal({ ...baseline, landedPerBottleCad: 320 });
    expect(order[cheap.grade]).toBeGreaterThan(order[dear.grade]);
  });

  it("reads readiness against what the buyer intends to do with it", () => {
    // A young Barolo: wrong for tonight, right for the cellar.
    const young = assessVintage("piedmont", 2021, 2026);
    const forNow = scoreDeal({ ...baseline, regionKey: "piedmont", vintage: young, intent: "drink-now" });
    const forCellar = scoreDeal({ ...baseline, regionKey: "piedmont", vintage: young, intent: "cellar" });
    expect(forCellar.components.readiness).toBeGreaterThan(forNow.components.readiness);
  });

  it("penalises a vendor that will not ship to Canada", () => {
    const ships = scoreDeal(baseline);
    const doesNot = scoreDeal({ ...baseline, shipsToCanada: false });
    expect(doesNot.score).toBeLessThan(ships.score);
    expect(doesNot.warnings.join(" ")).toMatch(/does not ship to Canada/);
  });

  it("ranks confirmed stock above unknown stock above no stock", () => {
    // A bottle you cannot buy is worth nothing however cheap it looks, and a
    // price with no confirmed stock is the commonest trap in wine research.
    const confirmed = scoreDeal({ ...baseline, inStock: true }).score;
    const unknown = scoreDeal({ ...baseline, inStock: null }).score;
    const gone = scoreDeal({ ...baseline, inStock: false }).score;
    expect(confirmed).toBeGreaterThan(unknown);
    expect(unknown).toBeGreaterThan(gone);
  });

  it("says out loud that an out-of-stock bottle cannot be bought", () => {
    const d = scoreDeal({ ...baseline, inStock: false });
    expect(d.warnings.join(" ")).toMatch(/cannot buy this/);
  });

  it("flags unconfirmed stock rather than passing it off as available", () => {
    const d = scoreDeal({ ...baseline, inStock: null });
    expect(d.warnings.join(" ")).toMatch(/Stock is unconfirmed/);
  });

  it("warns when the estimate rests on soft inputs", () => {
    const rough = scoreDeal({ ...baseline, landedConfidence: "rough", fxStale: true });
    const text = rough.warnings.join(" ");
    expect(text).toMatch(/±20%/);
    expect(text).toMatch(/pinned fallback/);
  });

  it("keeps the score inside 0-100 under hostile inputs", () => {
    const awful = scoreDeal({
      ...baseline,
      landedPerBottleCad: 100000,
      criticScore: 0,
      inStock: false,
      shipsToCanada: false,
      vintage: assessVintage("piedmont", 2002, 2026),
    });
    const perfect = scoreDeal({ ...baseline, landedPerBottleCad: 1, criticScore: 100 });
    expect(awful.score).toBeGreaterThanOrEqual(0);
    expect(perfect.score).toBeLessThanOrEqual(100);
  });

  it("survives knowing nothing about the wine", () => {
    const blind = scoreDeal({
      ...baseline,
      vintage: null,
      criticScore: null,
      criticSource: null,
      regionKey: null,
      reference: { ...reference, benchmarkSource: "none", benchmarkCad: 0, sampleSize: 0 },
    });
    expect(blind.score).toBeGreaterThanOrEqual(0);
    expect(blind.score).toBeLessThanOrEqual(100);
    expect(blind.verdict).toBeTruthy();
  });

  it("explains itself", () => {
    const d = scoreDeal({ ...baseline, landedPerBottleCad: 130 });
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.reasons.join(" ")).toMatch(/below the median landed price/);
  });
});

describe("buildPriceReference", () => {
  it("prefers the market's own median once the sample is big enough", () => {
    const ref = buildPriceReference({
      landedPricesCad: [100, 120, 140, 160],
      shelfPricesCad: [60, 70, 80, 90],
      researchTypicalCad: 500,
      regionKey: "bolgheri",
    });
    expect(ref.benchmarkSource).toBe("listings-median");
    expect(ref.benchmarkCad).toBe(130);
  });

  it("falls back to the researched market price on a thin sample", () => {
    const ref = buildPriceReference({
      landedPricesCad: [100],
      shelfPricesCad: [60],
      researchTypicalCad: 100,
      regionKey: "bolgheri",
    });
    expect(ref.benchmarkSource).toBe("research-typical-price");
    // Shelf price is grossed up so it is comparable to a landed cost.
    expect(ref.benchmarkCad).toBeGreaterThan(100);
  });

  it("falls back to the appellation's band when nothing else is known", () => {
    const ref = buildPriceReference({
      landedPricesCad: [],
      shelfPricesCad: [],
      researchTypicalCad: null,
      regionKey: "rioja",
    });
    expect(ref.benchmarkSource).toBe("region-price-band");
    expect(ref.benchmarkCad).toBeGreaterThan(0);
  });

  it("admits when it has no benchmark at all", () => {
    const ref = buildPriceReference({
      landedPricesCad: [],
      shelfPricesCad: [],
      researchTypicalCad: null,
      regionKey: null,
    });
    expect(ref.benchmarkSource).toBe("none");
  });
});

describe("median", () => {
  it("handles odd, even, empty and junk input", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([0, -5, NaN])).toBeNull();
  });
});
