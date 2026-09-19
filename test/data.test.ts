import { describe, expect, it } from "vitest";
import { REGIONS, REGION_BY_KEY, resolveRegionKey, slug } from "../src/data/regions.js";
import { VINTAGE_CHART, VINTAGE_NOTES } from "../src/data/vintage-chart.js";

describe("region profiles", () => {
  it("have unique keys", () => {
    const keys = REGIONS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("have price bands in ascending order", () => {
    for (const r of REGIONS) {
      const [entry, mid, benchmark] = r.priceBandCad;
      expect(entry, r.key).toBeLessThan(mid);
      expect(mid, r.key).toBeLessThan(benchmark);
    }
  });

  it("have ageing curves in ascending order", () => {
    for (const r of REGIONS) {
      const [early, peak, end] = r.hold;
      expect(early, r.key).toBeLessThanOrEqual(peak);
      expect(peak, r.key).toBeLessThan(end);
    }
  });

  it("use slugified alias tokens so matching works", () => {
    for (const r of REGIONS) {
      for (const a of r.aka ?? []) expect(slug(a), `${r.key}:${a}`).toBe(a);
    }
  });
});

describe("vintage chart", () => {
  it("only charts regions that exist", () => {
    for (const key of Object.keys(VINTAGE_CHART)) {
      expect(REGION_BY_KEY.has(key), `chart key ${key}`).toBe(true);
    }
  });

  it("covers every region", () => {
    for (const r of REGIONS) {
      expect(VINTAGE_CHART[r.key], `missing chart for ${r.key}`).toBeDefined();
    }
  });

  it("holds plausible scores and years", () => {
    for (const [key, years] of Object.entries(VINTAGE_CHART)) {
      const entries = Object.entries(years);
      expect(entries.length, key).toBeGreaterThan(8);
      for (const [year, score] of entries) {
        const y = Number(year);
        expect(y, `${key} ${year}`).toBeGreaterThanOrEqual(1990);
        expect(y, `${key} ${year}`).toBeLessThanOrEqual(2030);
        expect(score, `${key} ${year}`).toBeGreaterThanOrEqual(50);
        expect(score, `${key} ${year}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("has no gaps in the middle of a region's run", () => {
    for (const [key, years] of Object.entries(VINTAGE_CHART)) {
      const ys = Object.keys(years).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i]! - ys[i - 1]!, `${key} gap before ${ys[i]}`).toBe(1);
      }
    }
  });

  it("only annotates years that are charted", () => {
    for (const [key, notes] of Object.entries(VINTAGE_NOTES)) {
      expect(VINTAGE_CHART[key], `notes for unknown region ${key}`).toBeDefined();
      for (const year of Object.keys(notes)) {
        expect(VINTAGE_CHART[key]![Number(year)], `note for uncharted ${key} ${year}`).toBeDefined();
      }
    }
  });
});

describe("resolveRegionKey", () => {
  it("matches appellations to chart regions", () => {
    expect(resolveRegionKey("Bolgheri Superiore DOC")).toBe("bolgheri");
    expect(resolveRegionKey("Barolo DOCG")).toBe("piedmont");
    expect(resolveRegionKey("Rioja Alta")).toBe("rioja");
    expect(resolveRegionKey("Pauillac")).toBe("bordeaux-left");
    expect(resolveRegionKey("Pomerol")).toBe("bordeaux-right");
    expect(resolveRegionKey("Châteauneuf-du-Pape")).toBe("rhone-south");
    expect(resolveRegionKey("Côte-Rôtie")).toBe("rhone-north");
  });

  it("prefers the longest alias so specific beats general", () => {
    // "montalcino" must win over a bare "chianti"-style substring match.
    expect(resolveRegionKey("Rosso di Montalcino")).toBe("brunello");
  });

  it("finds the region inside a full wine name", () => {
    expect(resolveRegionKey("Tenuta Guado al Tasso Bolgheri Superiore")).toBe("bolgheri");
  });

  it("returns null when nothing matches", () => {
    expect(resolveRegionKey("Marlborough Sauvignon Blanc")).toBeNull();
    expect(resolveRegionKey("")).toBeNull();
    expect(resolveRegionKey(null)).toBeNull();
  });
});
