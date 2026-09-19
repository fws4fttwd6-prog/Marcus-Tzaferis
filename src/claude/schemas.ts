import { z } from "zod";

/**
 * Schemas for the structured-extraction pass. Every field is `.nullable()`
 * rather than `.optional()`: strict JSON schemas want a value for each key,
 * and "we could not find this" is information worth keeping.
 */

export const ListingSchema = z.object({
  vendorName: z.string().describe("Retailer or merchant name, e.g. 'Millesima' or 'LCBO Vintages'"),
  vendorCountry: z.string().nullable().describe("Country the vendor ships from, in English"),
  vendorRegion: z.string().nullable().describe("State or province, if known"),
  vendorCity: z.string().nullable().describe("City the vendor ships from, if known"),
  productUrl: z.string().nullable().describe("Direct link to the product page"),
  vintage: z.number().int().nullable().describe("Vintage year; null for non-vintage"),
  bottleMl: z.number().int().describe("Bottle size in millilitres; 750 unless stated otherwise"),
  price: z.number().describe("Price for ONE bottle in the vendor's own currency"),
  currency: z.string().describe("ISO currency code of the price, e.g. EUR, USD, CAD, GBP"),
  inStock: z.boolean().nullable(),
  quantityAvailable: z.number().int().nullable(),
  shippingNote: z.string().nullable().describe("What the vendor says about shipping, verbatim if short"),
  quotedShipping: z
    .number()
    .nullable()
    .describe("Vendor's quoted shipping cost to Canada in their currency, if stated"),
  shipsToCanada: z.boolean().nullable(),
  freeShippingOver: z
    .number()
    .nullable()
    .describe("Order value above which the vendor ships free, in their currency"),
  criticScore: z
    .number()
    .nullable()
    .describe("Critic score on the 100-point scale for this exact wine and vintage"),
  criticSource: z.string().nullable().describe("Who gave that score, e.g. 'Vinous', 'Wine Advocate'"),
  sourceUrl: z.string().nullable().describe("The page this listing was read from"),
});

export const IdentitySchema = z.object({
  producer: z.string().describe("Estate or producer name, correctly spelled"),
  wineName: z.string().describe("The cuvée or wine name, without the producer"),
  fullName: z.string().describe("Producer and wine together, as it appears on the label"),
  country: z.string(),
  appellation: z.string().nullable().describe("Appellation as written on the label"),
  regionHint: z
    .string()
    .nullable()
    .describe("Broader wine region, e.g. 'Bolgheri', 'Barolo', 'Rioja', 'Left Bank Bordeaux'"),
  style: z.enum(["red", "white", "sparkling", "sweet", "rose", "unknown"]),
  grapes: z.array(z.string()).describe("Principal grape varieties"),
  typicalPriceCad: z
    .number()
    .nullable()
    .describe("Typical retail price of a current release, one 750ml bottle, in CAD"),
  notes: z.string().nullable().describe("One or two sentences on what this wine is and why it matters"),
  confidence: z.enum(["high", "medium", "low"]),
  correctedFrom: z
    .string()
    .nullable()
    .describe("The user's spelling, if it differed from the correct one; otherwise null"),
  alternateSpellings: z.array(z.string()),
});

export const SearchExtractionSchema = z.object({
  identity: IdentitySchema,
  listings: z.array(ListingSchema),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  /** The researcher's own read, before any scoring is applied. */
  researchSummary: z.string(),
});

export type SearchExtraction = z.infer<typeof SearchExtractionSchema>;

export const DiscoveryPickSchema = z.object({
  producer: z.string(),
  wineName: z.string(),
  country: z.string(),
  appellation: z.string().nullable(),
  regionHint: z.string().nullable(),
  vintage: z.number().int().nullable(),
  style: z.enum(["red", "white", "sparkling", "sweet", "rose", "unknown"]),
  grapes: z.array(z.string()),
  vendorName: z.string().nullable(),
  vendorCountry: z.string().nullable(),
  productUrl: z.string().nullable(),
  price: z.number().nullable().describe("Price for one bottle in the vendor's currency"),
  currency: z.string().nullable(),
  bottleMl: z.number().int().nullable(),
  criticScore: z.number().nullable(),
  criticSource: z.string().nullable(),
  rationale: z.string().describe("Why this is unusually good value, in one or two sentences"),
});

export const DiscoveryExtractionSchema = z.object({
  brief: z.string().describe("A short paragraph framing this week's picks"),
  picks: z.array(DiscoveryPickSchema),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

export type DiscoveryExtraction = z.infer<typeof DiscoveryExtractionSchema>;
