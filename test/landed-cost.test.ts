import { describe, expect, it } from "vitest";
import {
  estimateLandedCost,
  landedCostCurve,
  RATES,
  zoneForLocation,
} from "../src/domain/landed-cost.js";

const base = { bottlePriceCad: 100, quantity: 6, bottleMl: 750 };

describe("estimateLandedCost", () => {
  it("adds up to the sum of its line items", () => {
    const c = estimateLandedCost({ ...base, zone: "italy" });
    const sum = c.lines.reduce((acc, l) => acc + l.amountCad, 0);
    expect(c.totalCad).toBeCloseTo(sum, 1);
  });

  it("costs more to import than to buy in Ontario", () => {
    const local = estimateLandedCost({ ...base, zone: "ontario" });
    const imported = estimateLandedCost({ ...base, zone: "italy" });
    expect(imported.perBottleCad).toBeGreaterThan(local.perBottleCad);
  });

  it("charges no import duty on an Ontario purchase", () => {
    const local = estimateLandedCost({ ...base, zone: "ontario" });
    const labels = local.lines.map((l) => l.label);
    expect(labels).not.toContain("Federal excise duty");
    expect(labels).not.toContain("LCBO private import markup");
  });

  it("zeroes customs duty under CETA but still charges excise", () => {
    const c = estimateLandedCost({ ...base, zone: "france" });
    const customs = c.lines.find((l) => l.label === "Customs duty")!;
    const excise = c.lines.find((l) => l.label === "Federal excise duty")!;
    expect(customs.amountCad).toBe(0);
    expect(customs.detail).toContain("CETA");
    expect(excise.amountCad).toBeCloseTo(RATES.exciseCadPerLitre * 0.75 * 6, 2);
  });

  it("charges MFN duty where no agreement applies", () => {
    const c = estimateLandedCost({ ...base, zone: "rest-of-world" });
    expect(c.lines.find((l) => l.label === "Customs duty")!.amountCad).toBeGreaterThan(0);
  });

  it("spreads freight, so per-bottle cost falls as quantity rises", () => {
    const curve = landedCostCurve({ bottlePriceCad: 60, zone: "spain" }, [1, 3, 6, 12]);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.perBottleCad).toBeLessThan(curve[i - 1]!.perBottleCad);
    }
    // And the effect is large enough to matter to a buying decision.
    expect(curve[0]!.perBottleCad - curve[3]!.perBottleCad).toBeGreaterThan(20);
  });

  it("applies HST to everything", () => {
    const c = estimateLandedCost({ ...base, zone: "ontario" });
    const hst = c.lines.find((l) => l.label.startsWith("HST"))!;
    expect(hst.amountCad).toBeCloseTo((c.totalCad / (1 + RATES.hst)) * RATES.hst, 1);
  });

  it("uses the vendor's quote over its own estimate", () => {
    const quoted = estimateLandedCost({ ...base, zone: "italy", quotedShippingCad: 20 });
    const guessed = estimateLandedCost({ ...base, zone: "italy" });
    expect(quoted.lines[1]!.amountCad).toBe(20);
    expect(quoted.totalCad).toBeLessThan(guessed.totalCad);
    expect(quoted.confidence).toBe("quoted");
    expect(guessed.confidence).toBe("rough");
  });

  it("honours a free-shipping threshold", () => {
    const c = estimateLandedCost({
      bottlePriceCad: 100,
      quantity: 6,
      zone: "italy",
      freeShippingOverCad: 500,
    });
    expect(c.lines[1]!.amountCad).toBe(0);
  });

  it("scales duty and excise with bottle size", () => {
    const magnum = estimateLandedCost({ ...base, zone: "italy", bottleMl: 1500 });
    const standard = estimateLandedCost({ ...base, zone: "italy", bottleMl: 750 });
    const exciseOf = (c: typeof magnum) =>
      c.lines.find((l) => l.label === "Federal excise duty")!.amountCad;
    // Line items are rounded to the cent, so allow a penny of drift.
    expect(exciseOf(magnum)).toBeCloseTo(exciseOf(standard) * 2, 1);
  });

  it("warns when the order is below the merchant's usual minimum", () => {
    const c = estimateLandedCost({ ...base, quantity: 1, zone: "france" });
    expect(c.caveats.join(" ")).toMatch(/at least 6 bottles/);
  });

  it("always explains Ontario's consignment rule on an import", () => {
    const c = estimateLandedCost({ ...base, zone: "spain" });
    expect(c.caveats.join(" ")).toMatch(/consigned through the LCBO/);
  });
});

describe("zoneForLocation", () => {
  it("maps countries to zones", () => {
    expect(zoneForLocation("France")).toBe("france");
    expect(zoneForLocation("Italy")).toBe("italy");
    expect(zoneForLocation("Spain")).toBe("spain");
    expect(zoneForLocation("United States")).toBe("usa");
    expect(zoneForLocation("United Kingdom")).toBe("uk");
    expect(zoneForLocation("Germany")).toBe("eu-other");
    expect(zoneForLocation("Chile")).toBe("rest-of-world");
  });

  it("separates Ontario from the rest of Canada", () => {
    expect(zoneForLocation("Canada", "Ontario")).toBe("ontario");
    expect(zoneForLocation("Canada", "Toronto")).toBe("ontario");
    expect(zoneForLocation("Canada", "British Columbia")).toBe("canada-other");
    expect(zoneForLocation("Canada", null)).toBe("canada-other");
  });

  it("falls back safely on missing data", () => {
    expect(zoneForLocation(null)).toBe("rest-of-world");
    expect(zoneForLocation("")).toBe("rest-of-world");
  });
});
