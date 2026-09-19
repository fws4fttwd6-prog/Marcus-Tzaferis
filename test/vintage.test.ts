import { describe, expect, it } from "vitest";
import { REGION_BY_KEY } from "../src/data/regions.js";
import {
  assessVintage,
  drinkingWindow,
  maturityAt,
  vintageAdvice,
  vintageScore,
} from "../src/domain/vintage.js";

const barolo = REGION_BY_KEY.get("piedmont")!;

describe("drinkingWindow", () => {
  it("orders the window correctly", () => {
    const w = drinkingWindow(barolo, 2016, 99);
    expect(w.from).toBeLessThanOrEqual(w.peakFrom);
    expect(w.peakFrom).toBeLessThanOrEqual(w.peakTo);
    expect(w.peakTo).toBeLessThanOrEqual(w.to);
  });

  it("gives better vintages a longer life", () => {
    const great = drinkingWindow(barolo, 2016, 99);
    const modest = drinkingWindow(barolo, 2016, 84);
    expect(great.to).toBeGreaterThan(modest.to);
    expect(great.peakFrom).toBeGreaterThan(modest.peakFrom);
  });

  it("respects each region's own ageing curve", () => {
    const rias = REGION_BY_KEY.get("rias-baixas")!;
    const albarino = drinkingWindow(rias, 2022, 92);
    const nebbiolo = drinkingWindow(barolo, 2022, 92);
    expect(albarino.to - 2022).toBeLessThan(nebbiolo.to - 2022);
  });
});

describe("maturityAt", () => {
  const w = { from: 2026, peakFrom: 2032, peakTo: 2044, to: 2052 };

  it("classifies each stage", () => {
    expect(maturityAt(w, 2024)).toBe("too-young");
    expect(maturityAt(w, 2027)).toBe("in-window");
    expect(maturityAt(w, 2031)).toBe("approaching");
    expect(maturityAt(w, 2035)).toBe("at-peak");
    expect(maturityAt(w, 2048)).toBe("mature");
    expect(maturityAt(w, 2060)).toBe("fading");
  });
});

describe("assessVintage", () => {
  it("reads the chart", () => {
    expect(vintageScore("piedmont", 2016)).toBe(99);
    expect(assessVintage("piedmont", 2016, 2026).score).toBe(99);
  });

  it("returns a null score rather than throwing for uncharted years", () => {
    const v = assessVintage("piedmont", 1901, 2026);
    expect(v.score).toBeNull();
    expect(v.window).toBeNull();
    expect(v.maturity).toBeNull();
  });

  it("flags a strong year standing next to a stronger one", () => {
    // Barolo 2015 (93) sits beside 2016 (99) — the classic overlooked year.
    const v = assessVintage("piedmont", 2015, 2026);
    expect(v.attentionDiscount).toBe(6);
  });

  it("gives no discount to the best year in its run", () => {
    expect(assessVintage("piedmont", 2016, 2026).attentionDiscount).toBe(0);
  });
});

describe("vintageAdvice", () => {
  it("separates ready-now from cellar-worthy without overlap", () => {
    const advice = vintageAdvice("bordeaux-left", 2026)!;
    expect(advice).not.toBeNull();
    const now = new Set(advice.drinkNow.map((v) => v.year));
    for (const v of advice.cellar) expect(now.has(v.year)).toBe(false);
  });

  it("never recommends a future vintage", () => {
    const advice = vintageAdvice("piedmont", 2026)!;
    for (const v of advice.all) expect(v.year).toBeLessThanOrEqual(2026);
  });

  it("only calls a year a sleeper if it is actually good", () => {
    for (const key of ["piedmont", "bordeaux-left", "rioja"]) {
      const advice = vintageAdvice(key, 2026)!;
      for (const s of advice.sleepers) {
        expect(s.score!).toBeGreaterThanOrEqual(90);
        expect(s.attentionDiscount).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("returns null for an unknown region", () => {
    expect(vintageAdvice("atlantis")).toBeNull();
  });
});
