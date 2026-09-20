/**
 * Bundled sample data so the app runs, and can be demonstrated, without an API
 * key. Everything here is illustrative: the merchants are real businesses but
 * the prices and stock levels are made up, product links point at merchant
 * home pages rather than invented product pages, and every response built from
 * this file is flagged `demo: true` so the UI can say so.
 */

import type { SearchExtraction, DiscoveryExtraction } from "../claude/schemas.js";
import { REGION_BY_KEY, resolveRegionKey } from "./regions.js";
import { VINTAGE_CHART } from "./vintage-chart.js";

const GUADO_AL_TASSO: SearchExtraction = {
  identity: {
    producer: "Tenuta Guado al Tasso (Antinori)",
    wineName: "Guado al Tasso",
    fullName: "Tenuta Guado al Tasso, Bolgheri Superiore",
    country: "Italy",
    appellation: "Bolgheri Superiore DOC",
    regionHint: "Bolgheri",
    style: "red",
    grapes: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot"],
    typicalPriceCad: 135,
    notes:
      "Antinori's Bolgheri flagship, from a 1,000-hectare estate on the Tuscan coast. A Bordeaux blend in the Super Tuscan mould — dense, cedar-scented and built to age two decades in strong years.",
    confidence: "high",
    correctedFrom: null,
    alternateSpellings: ["Guado al Tasso", "Guado Al Tasso Bolgheri Superiore"],
  },
  listings: [
    {
      vendorName: "Vino.com",
      vendorCountry: "Italy",
      vendorRegion: "Tuscany",
      vendorCity: "Florence",
      productUrl: "https://www.vino.com",
      vintage: 2019,
      bottleMl: 750,
      price: 78,
      currency: "EUR",
      inStock: true,
      quantityAvailable: 24,
      shippingNote: "Ships worldwide; case rates on six bottles or more.",
      quotedShipping: null,
      shipsToCanada: true,
      freeShippingOver: null,
      criticScore: 96,
      criticSource: "Wine Spectator",
      sourceUrl: "https://www.vino.com",
    },
    {
      vendorName: "Millesima",
      vendorCountry: "France",
      vendorRegion: "Nouvelle-Aquitaine",
      vendorCity: "Bordeaux",
      productUrl: "https://www.millesima.com",
      vintage: 2016,
      bottleMl: 750,
      price: 112,
      currency: "EUR",
      inStock: true,
      quantityAvailable: 6,
      shippingNote: "Ships to Canada; temperature-controlled option available.",
      quotedShipping: 95,
      shipsToCanada: true,
      freeShippingOver: null,
      criticScore: 97,
      criticSource: "Vinous",
      sourceUrl: "https://www.millesima.com",
    },
    {
      vendorName: "LCBO Vintages",
      vendorCountry: "Canada",
      vendorRegion: "Ontario",
      vendorCity: "Toronto",
      productUrl: "https://www.lcbo.com",
      vintage: 2020,
      bottleMl: 750,
      price: 149.95,
      currency: "CAD",
      inStock: true,
      quantityAvailable: 11,
      shippingNote: "Vintages Shop Online; free delivery to a store.",
      quotedShipping: null,
      shipsToCanada: true,
      freeShippingOver: null,
      criticScore: 94,
      criticSource: "James Suckling",
      sourceUrl: "https://www.lcbo.com",
    },
    {
      vendorName: "Wine Library",
      vendorCountry: "United States",
      vendorRegion: "New Jersey",
      vendorCity: "Springfield",
      productUrl: "https://www.winelibrary.com",
      vintage: 2019,
      bottleMl: 750,
      price: 99,
      currency: "USD",
      inStock: true,
      quantityAvailable: 3,
      shippingNote: "Does not ship alcohol to Canada.",
      quotedShipping: null,
      shipsToCanada: false,
      freeShippingOver: null,
      criticScore: 96,
      criticSource: "Wine Spectator",
      sourceUrl: "https://www.winelibrary.com",
    },
    {
      vendorName: "Xtrawine",
      vendorCountry: "Italy",
      vendorRegion: "Lombardy",
      vendorCity: "Milan",
      productUrl: "https://www.xtrawine.com",
      vintage: 2021,
      bottleMl: 750,
      price: 71,
      currency: "EUR",
      inStock: true,
      quantityAvailable: 40,
      shippingNote: "Free shipping over EUR 500.",
      quotedShipping: null,
      shipsToCanada: true,
      freeShippingOver: 500,
      criticScore: 95,
      criticSource: "James Suckling",
      sourceUrl: "https://www.xtrawine.com",
    },
    {
      vendorName: "Callmewine",
      vendorCountry: "Italy",
      vendorRegion: "Lombardy",
      vendorCity: "Milan",
      productUrl: "https://www.callmewine.com",
      vintage: 2014,
      bottleMl: 750,
      price: 62,
      currency: "EUR",
      inStock: true,
      quantityAvailable: 2,
      shippingNote: "Older stock, limited quantity.",
      quotedShipping: null,
      shipsToCanada: true,
      freeShippingOver: null,
      criticScore: 90,
      criticSource: "Wine Spectator",
      sourceUrl: "https://www.callmewine.com",
    },
    {
      vendorName: "Justerini & Brooks",
      vendorCountry: "United Kingdom",
      vendorRegion: "England",
      vendorCity: "London",
      productUrl: "https://www.justerinis.com",
      vintage: 2015,
      bottleMl: 1500,
      price: 210,
      currency: "GBP",
      inStock: true,
      quantityAvailable: 1,
      shippingNote: "Magnum, in bond. UK duty and VAT not included.",
      quotedShipping: null,
      shipsToCanada: true,
      freeShippingOver: null,
      criticScore: 96,
      criticSource: "Wine Advocate",
      sourceUrl: "https://www.justerinis.com",
    },
  ],
  sources: [
    { title: "Vino.com", url: "https://www.vino.com" },
    { title: "Millesima", url: "https://www.millesima.com" },
    { title: "LCBO", url: "https://www.lcbo.com" },
  ],
  researchSummary:
    "Sample data. Guado al Tasso trades between roughly EUR 60 and EUR 120 ex-cellar depending on vintage, with 2016 and 2019 commanding the strongest prices.",
};

/**
 * For any query other than the worked example, synthesise a small, plainly
 * fictional set of listings anchored on the region's real price band, so the
 * scoring and landed-cost machinery can be exercised end to end.
 */
function genericExtraction(query: string): SearchExtraction {
  const regionKey = resolveRegionKey(query) ?? "chianti";
  const region = REGION_BY_KEY.get(regionKey)!;
  const [entry, mid] = region.priceBandCad;
  const years = Object.keys(VINTAGE_CHART[regionKey] ?? {})
    .map(Number)
    .filter((y) => y <= new Date().getFullYear() - 2)
    .sort((a, b) => b - a)
    .slice(0, 4);

  const euroMid = Math.round((mid / 1.52) * 0.72);
  const vendors = [
    { name: "Vino.com", country: "Italy", city: "Florence", currency: "EUR", factor: 0.82 },
    { name: "Millesima", country: "France", city: "Bordeaux", currency: "EUR", factor: 1.05 },
    { name: "Lavinia", country: "Spain", city: "Madrid", currency: "EUR", factor: 0.9 },
    { name: "LCBO Vintages", country: "Canada", city: "Toronto", currency: "CAD", factor: 1.0 },
  ];

  const listings = years.flatMap((year, yi) =>
    vendors.map((v, vi) => {
      const base = v.currency === "CAD" ? mid * 1.15 : euroMid;
      const price = Math.round(base * v.factor * (1 + yi * 0.06) * 100) / 100;
      return {
        vendorName: v.name,
        vendorCountry: v.country,
        vendorRegion: v.country === "Canada" ? "Ontario" : "",
        vendorCity: v.city,
        productUrl: "",
        vintage: year,
        bottleMl: 750,
        price,
        currency: v.currency,
        inStock: true,
        quantityAvailable: 6 + ((yi + vi) % 5) * 3,
        shippingNote: "Sample data — not a real listing.",
        quotedShipping: null,
        shipsToCanada: true,
        freeShippingOver: null,
        criticScore: (VINTAGE_CHART[regionKey]?.[year] ?? 90) - 1 + (vi % 3),
        criticSource: "sample",
        sourceUrl: "",
      };
    }),
  );

  return {
    identity: {
      producer: query.trim() || "Unknown producer",
      wineName: query.trim(),
      fullName: query.trim(),
      country: region.country,
      appellation: region.label,
      regionHint: region.label,
      style: region.style,
      grapes: [],
      typicalPriceCad: mid,
      notes: `Sample data for a ${region.label} wine. Set ANTHROPIC_API_KEY to search the live web instead.`,
      confidence: "low",
      correctedFrom: null,
      alternateSpellings: [],
    },
    listings,
    sources: [],
    researchSummary: `Sample data generated against the ${region.label} price band of $${entry}–$${mid}.`,
  };
}

export function demoSearchExtraction(query: string): SearchExtraction {
  const q = query.toLowerCase().replace(/[^a-z]/g, "");
  // Tolerant match so the misspelling in the worked example still lands.
  if (/gu[ai]do?a?lt[ao]ss?o|guadoaltasso|guidoaltaso/.test(q)) {
    return structuredClone(GUADO_AL_TASSO);
  }
  return genericExtraction(query);
}

export function demoDiscoveryExtraction(): DiscoveryExtraction {
  return {
    brief:
      "Sample data. With an API key set, this panel searches the live web for wines trading below what their quality deserves.",
    picks: [
      {
        producer: "Produttori del Barbaresco",
        wineName: "Barbaresco",
        country: "Italy",
        appellation: "Barbaresco DOCG",
        regionHint: "Barbaresco",
        vintage: 2019,
        style: "red" as const,
        grapes: ["Nebbiolo"],
        vendorName: "Vino.com",
        vendorCountry: "Italy",
        productUrl: "https://www.vino.com",
        price: 38,
        currency: "EUR",
        bottleMl: 750,
        criticScore: 93,
        criticSource: "sample",
        rationale:
          "A co-operative that out-punches most single estates, in a vintage the market skipped over in favour of 2016.",
      },
      {
        producer: "Descendientes de J. Palacios",
        wineName: "Pétalos del Bierzo",
        country: "Spain",
        appellation: "Bierzo DO",
        regionHint: "Bierzo",
        vintage: 2021,
        style: "red" as const,
        grapes: ["Mencía"],
        vendorName: "Lavinia",
        vendorCountry: "Spain",
        productUrl: "https://www.lavinia.es",
        price: 17,
        currency: "EUR",
        bottleMl: 750,
        criticScore: 92,
        criticSource: "sample",
        rationale:
          "Old-vine Mencía from one of Spain's best winemaking families, at a price set by the appellation's obscurity rather than the wine's quality.",
      },
      {
        producer: "Domaine de la Butte",
        wineName: "Bourgueil Mi-Pente",
        country: "France",
        appellation: "Bourgueil AOC",
        regionHint: "Bourgueil",
        vintage: 2020,
        style: "red" as const,
        grapes: ["Cabernet Franc"],
        vendorName: "Millesima",
        vendorCountry: "France",
        productUrl: "https://www.millesima.com",
        price: 26,
        currency: "EUR",
        bottleMl: 750,
        criticScore: 92,
        criticSource: "sample",
        rationale:
          "Cabernet Franc with the structure of a cru Bordeaux, priced as a Loire country wine.",
      },
    ],
    sources: [],
  };
}
