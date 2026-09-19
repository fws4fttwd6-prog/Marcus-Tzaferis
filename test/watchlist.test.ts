import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_WATCHLIST } from "../src/data/seed-watchlist.js";
import { DEFAULT_RULE, type WatchItem, type WatchSnapshot } from "../src/domain/watchlist-types.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "krasi-test-"));
  process.env.KRASI_DATA_DIR = dir;
  process.env.KRASI_DEMO = "1";
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  const { __resetStoreCache } = await import("../src/store.js");
  __resetStoreCache();
  await rm(path.join(dir, "watchlist.json"), { force: true });
});

describe("seed watchlist", () => {
  it("covers everything that was asked for", () => {
    const labels = SEED_WATCHLIST.map((s) => s.label.toLowerCase()).join(" | ");
    for (const wanted of ["guado al tasso", "solaia", "sassicaia", "vega sicilia"]) {
      expect(labels, wanted).toContain(wanted);
    }
    const countries = new Set(SEED_WATCHLIST.map((s) => s.country));
    expect(countries).toContain("France");
    expect(countries).toContain("Italy");
    expect(countries).toContain("Spain");
  });

  it("has several Bolgheri and Super Tuscan bottles beyond the named ones", () => {
    const tuscans = SEED_WATCHLIST.filter((s) =>
      s.tags.some((t) => t === "Bolgheri" || t === "Super Tuscan"),
    );
    expect(tuscans.length).toBeGreaterThanOrEqual(8);
  });

  it("has real Bordeaux across both banks", () => {
    const bordeaux = SEED_WATCHLIST.filter((s) => s.tags.includes("Bordeaux"));
    expect(bordeaux.length).toBeGreaterThanOrEqual(6);
    expect(bordeaux.some((s) => s.tags.includes("Left Bank"))).toBe(true);
    expect(bordeaux.some((s) => s.tags.includes("Right Bank"))).toBe(true);
  });

  it("gives every wine a plausible target and an explanation for it", () => {
    for (const s of SEED_WATCHLIST) {
      expect(s.targetLandedCad, s.label).toBeGreaterThan(0);
      expect(s.targetLandedCad, s.label).toBeLessThan(5000);
      expect(s.targetNote.length, s.label).toBeGreaterThan(20);
      expect(s.query.length, s.label).toBeGreaterThan(5);
    }
  });

  it("has no duplicate queries", () => {
    const queries = SEED_WATCHLIST.map((s) => s.query.toLowerCase());
    expect(new Set(queries).size).toBe(queries.length);
  });
});

describe("store", () => {
  it("seeds itself on first load and persists", async () => {
    const { loadStore, listWatches, __resetStoreCache } = await import("../src/store.js");
    const store = await loadStore();
    expect(store.watches.length).toBe(SEED_WATCHLIST.length);

    __resetStoreCache();
    const reloaded = await listWatches();
    expect(reloaded.length).toBe(SEED_WATCHLIST.length);
    expect(reloaded.find((w) => w.label === "Sassicaia")).toBeDefined();
  });

  it("gives a wine a stable id so re-adding does not duplicate it", async () => {
    const { addWatch, listWatches } = await import("../src/store.js");
    const before = (await listWatches()).length;
    const a = await addWatch({ query: "Chateau Figeac Saint-Emilion" });
    const b = await addWatch({ query: "  chateau figeac saint-emilion  " });
    expect(a.id).toBe(b.id);
    expect((await listWatches()).length).toBe(before + 1);
  });

  it("updates a rule without discarding the rest of it", async () => {
    const { addWatch, updateWatch } = await import("../src/store.js");
    const w = await addWatch({ query: "Test Wine One", rule: { targetLandedCad: 100 } });
    const updated = await updateWatch(w.id, { rule: { dropPct: 20 } } as never);
    expect(updated!.rule.targetLandedCad).toBe(100);
    expect(updated!.rule.dropPct).toBe(20);
    expect(updated!.rule.minGrade).toBe(DEFAULT_RULE.minGrade);
  });

  it("removes a watch and its alerts together", async () => {
    const { addWatch, removeWatch, pushAlerts, listAlerts } = await import("../src/store.js");
    const w = await addWatch({ query: "Test Wine Two" });
    await pushAlerts([
      {
        watchId: w.id, watchLabel: w.label, kind: "target-hit", message: "hit",
        landedCad: 10, previousLandedCad: null, vendor: null, vendorCountry: null,
        url: null, vintage: null, grade: "A",
      },
    ]);
    expect((await listAlerts()).length).toBe(1);
    expect(await removeWatch(w.id)).toBe(true);
    expect((await listAlerts()).length).toBe(0);
  });

  it("restores seed wines that were removed, without touching the others", async () => {
    const { listWatches, removeWatch, restoreSeeds, updateWatch } = await import("../src/store.js");
    const watches = await listWatches();
    const keep = watches.find((w) => w.label === "Guado al Tasso")!;
    await updateWatch(keep.id, { rule: { targetLandedCad: 999 } } as never);
    await removeWatch(watches.find((w) => w.label === "Sassicaia")!.id);

    expect(await restoreSeeds()).toBe(1);
    const after = await listWatches();
    expect(after.find((w) => w.label === "Sassicaia")).toBeDefined();
    // The edited target must survive a restore.
    expect(after.find((w) => w.id === keep.id)!.rule.targetLandedCad).toBe(999);
  });

  it("acknowledges alerts", async () => {
    const { addWatch, pushAlerts, acknowledgeAlerts, listAlerts } = await import("../src/store.js");
    const w = await addWatch({ query: "Test Wine Three" });
    await pushAlerts(
      ["target-hit", "price-drop"].map((kind) => ({
        watchId: w.id, watchLabel: w.label, kind: kind as never, message: kind,
        landedCad: 1, previousLandedCad: null, vendor: null, vendorCountry: null,
        url: null, vintage: null, grade: null,
      })),
    );
    expect(await acknowledgeAlerts("all")).toBe(2);
    expect((await listAlerts({ unacknowledgedOnly: true })).length).toBe(0);
  });
});

/* ── Rule evaluation ─────────────────────────────────────────────────────── */

function watch(rule: Partial<WatchItem["rule"]> = {}): WatchItem {
  return {
    id: "w1", query: "q", label: "Test Wine", producer: null, country: null,
    appellation: null, vintage: null, quantity: 6, intent: "either",
    rule: { ...DEFAULT_RULE, ...rule },
    notes: null, enabled: true, checkEveryHours: 24, tags: [],
    createdAt: new Date().toISOString(), lastCheckedAt: null, lastError: null,
    latest: null, history: [],
  };
}

function snap(over: Partial<WatchSnapshot> = {}): WatchSnapshot {
  return {
    checkedAt: new Date().toISOString(),
    bestLandedCad: 200, bestGrade: "B", bestScore: 60,
    bestVendor: "Vino.com", bestVendorCountry: "Italy", bestVintage: 2019,
    bestUrl: null, listingCount: 4, vintagesSeen: [2019, 2018], demo: false,
    ...over,
  };
}

describe("evaluateRules", () => {
  it("fires when the target is met", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: 200 }), null, snap({ bestLandedCad: 180 }), null,
    );
    expect(alerts.map((a) => a.kind)).toContain("target-hit");
    expect(alerts[0]!.message).toMatch(/at or below your \$200 target/);
  });

  it("does not fire when the price is above the target", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: 150, minGrade: null }), null, snap({ bestLandedCad: 180 }), null,
    );
    expect(alerts.some((a) => a.kind === "target-hit")).toBe(false);
  });

  it("fires on a sharp drop", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: null, dropPct: 10 }),
      snap({ bestLandedCad: 250 }),
      snap({ bestLandedCad: 200 }),
      null,
    );
    const drop = alerts.find((a) => a.kind === "price-drop");
    expect(drop).toBeDefined();
    expect(drop!.message).toMatch(/Down 20%/);
  });

  it("ignores a drop smaller than the threshold", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: null, dropPct: 25, minGrade: null }),
      snap({ bestLandedCad: 250 }),
      snap({ bestLandedCad: 230 }),
      null,
    );
    expect(alerts.length).toBe(0);
  });

  it("prefers the target message over the drop message", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: 210, dropPct: 5 }),
      snap({ bestLandedCad: 250 }),
      snap({ bestLandedCad: 200 }),
      null,
    );
    expect(alerts.some((a) => a.kind === "target-hit")).toBe(true);
    expect(alerts.some((a) => a.kind === "price-drop")).toBe(false);
  });

  it("fires on grade only when nothing better already fired", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const onlyGrade = evaluateRules(
      watch({ targetLandedCad: null, minGrade: "A" }), null, snap({ bestGrade: "A+" }), null,
    );
    expect(onlyGrade.map((a) => a.kind)).toEqual(["great-deal"]);

    const belowBar = evaluateRules(
      watch({ targetLandedCad: null, minGrade: "A" }), null, snap({ bestGrade: "B" }), null,
    );
    expect(belowBar.length).toBe(0);
  });

  it("reports a vintage that was not offered last time", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: null, minGrade: null }),
      snap({ vintagesSeen: [2018] }),
      snap({ vintagesSeen: [2020, 2019, 2018] }),
      null,
    );
    const fresh = alerts.find((a) => a.kind === "new-vintage");
    expect(fresh).toBeDefined();
    expect(fresh!.message).toMatch(/2020, 2019/);
  });

  it("stays quiet on a first-ever check apart from price and grade rules", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: null, minGrade: null }), null, snap(), null,
    );
    expect(alerts.length).toBe(0);
  });

  it("says nothing when there is nothing for sale", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: 500 }), null, snap({ bestLandedCad: null, listingCount: 0 }), null,
    );
    expect(alerts.length).toBe(0);
  });

  it("notices a wine coming back on the market", async () => {
    const { evaluateRules } = await import("../src/watchlist.js");
    const alerts = evaluateRules(
      watch({ targetLandedCad: null, minGrade: null, onNewVintage: false }),
      snap({ bestLandedCad: null, listingCount: 0, vintagesSeen: [] }),
      snap({ listingCount: 3 }),
      null,
    );
    expect(alerts.map((a) => a.kind)).toContain("back-in-stock");
  });
});

describe("isDue", () => {
  it("is due when never checked, and not when paused", async () => {
    const { isDue } = await import("../src/watchlist.js");
    expect(isDue(watch())).toBe(true);
    expect(isDue({ ...watch(), enabled: false })).toBe(false);
  });

  it("respects the interval", async () => {
    const { isDue } = await import("../src/watchlist.js");
    const now = Date.now();
    const recent = { ...watch(), lastCheckedAt: new Date(now - 3600_000).toISOString() };
    const old = { ...watch(), lastCheckedAt: new Date(now - 30 * 3600_000).toISOString() };
    expect(isDue(recent, now)).toBe(false);
    expect(isDue(old, now)).toBe(true);
  });
});
