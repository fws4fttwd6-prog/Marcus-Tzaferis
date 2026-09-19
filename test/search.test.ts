import { beforeAll, describe, expect, it } from "vitest";
import { __resetFxCache, convertToCad, currencyForCountry, getFxTable } from "../src/domain/fx.js";

beforeAll(() => {
  process.env.KRASI_DEMO = "1";
});

describe("fx", () => {
  it("falls back to pinned rates and says so", async () => {
    __resetFxCache();
    const table = await getFxTable();
    expect(table.cadPerUnit.CAD).toBe(1);
    expect(typeof table.asOf).toBe("string");
    if (table.source !== "live") expect(table.stale).toBe(true);
  });

  it("converts and reports the rate used", async () => {
    const table = await getFxTable();
    const { cad, rate } = convertToCad(100, "EUR", table);
    expect(rate).toBeGreaterThan(0);
    expect(cad).toBeCloseTo(100 * rate, 1);
  });

  it("passes an unknown currency through rather than inventing a rate", async () => {
    const table = await getFxTable();
    const r = convertToCad(100, "XYZ", table);
    expect(r.cad).toBe(100);
    expect(r.stale).toBe(true);
  });

  it("guesses a vendor's currency from their country", () => {
    expect(currencyForCountry("Canada")).toBe("CAD");
    expect(currencyForCountry("United States")).toBe("USD");
    expect(currencyForCountry("United Kingdom")).toBe("GBP");
    expect(currencyForCountry("Italy")).toBe("EUR");
  });
});

describe("searchWine, end to end on sample data", () => {
  it("identifies the wine, prices every listing and ranks by value", async () => {
    const { searchWine } = await import("../src/search.js");
    const result = await searchWine("Guido Al Taso", { quantity: 6 });

    expect(result.meta.demo).toBe(true);
    expect(result.identity.regionKey).toBe("bolgheri");
    expect(result.listings.length).toBeGreaterThan(3);

    // Ranked best-value first.
    for (let i = 1; i < result.listings.length; i++) {
      expect(result.listings[i - 1]!.deal.score).toBeGreaterThanOrEqual(result.listings[i]!.deal.score);
    }

    for (const l of result.listings) {
      // Importing always costs more than the shelf price, compared like for
      // like: landedPer750Cad is a 750ml equivalent, so the shelf price has
      // to be scaled the same way before the two can be set against each other.
      const shelfPer750 = l.priceCad * (750 / l.bottleMl);
      expect(l.landedPer750Cad).toBeGreaterThan(shelfPer750);
      expect(l.landed.lines.length).toBeGreaterThan(2);
      expect(l.landedCurve.length).toBe(4);
      expect(l.deal.score).toBeGreaterThanOrEqual(0);
      expect(l.deal.score).toBeLessThanOrEqual(100);
      expect(l.id).toMatch(/^[0-9a-f]{12}$/);
    }

    expect(result.recommendation).toContain("Best buy");
    expect(result.vintageAdvice?.regionKey).toBe("bolgheri");
    expect(result.meta.warnings.join(" ")).toMatch(/sample data/i);
  });

  it("compares a magnum on a per-750ml basis", async () => {
    const { searchWine } = await import("../src/search.js");
    const result = await searchWine("Guado al Tasso", { quantity: 6 });
    const magnum = result.listings.find((l) => l.bottleMl === 1500);
    expect(magnum).toBeDefined();
    expect(magnum!.landedPer750Cad).toBeLessThan(magnum!.landedPerBottleCad);
  });

  it("drops out-of-stock listings unless asked for them", async () => {
    const { searchWine } = await import("../src/search.js");
    const filtered = await searchWine("Guado al Tasso", { includeOutOfStock: false });
    expect(filtered.listings.every((l) => l.inStock !== false)).toBe(true);
  });

  it("honours a vintage filter", async () => {
    const { searchWine } = await import("../src/search.js");
    const result = await searchWine("Guado al Tasso", { vintage: 2019 });
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.listings.every((l) => l.vintage === 2019)).toBe(true);
  });

  it("charges less per bottle on a bigger order", async () => {
    const { searchWine } = await import("../src/search.js");
    const single = await searchWine("Guado al Tasso", { quantity: 1 });
    const dozen = await searchWine("Guado al Tasso", { quantity: 12 });
    const eu = (r: Awaited<ReturnType<typeof searchWine>>) =>
      r.listings.find((l) => l.vendorName === "Vino.com")!;
    expect(eu(dozen).landedPer750Cad).toBeLessThan(eu(single).landedPer750Cad);
  });

  it("still returns a usable answer for a wine it knows nothing about", async () => {
    const { searchWine } = await import("../src/search.js");
    const result = await searchWine("Some Unheard Of Bottle");
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.recommendation).toBeTruthy();
  });
});

describe("discoverWines, end to end on sample data", () => {
  it("returns scored picks ranked by value", async () => {
    const { discoverWines } = await import("../src/discover.js");
    const result = await discoverWines({ count: 3 });
    expect(result.picks.length).toBeGreaterThan(0);
    for (const p of result.picks) {
      expect(p.rationale).toBeTruthy();
      expect(p.estimatedLandedCad).toBeGreaterThan(0);
    }
    for (let i = 1; i < result.picks.length; i++) {
      expect(result.picks[i - 1]!.deal!.score).toBeGreaterThanOrEqual(result.picks[i]!.deal!.score);
    }
  });
});
