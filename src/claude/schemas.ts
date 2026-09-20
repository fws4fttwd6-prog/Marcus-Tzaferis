import { z } from "zod";

/**
 * Schemas for the structured-extraction pass.
 *
 * Absent values are expressed two ways, for a reason. Numbers, booleans and
 * years use `.nullable()`, because there is no in-band value that means
 * "unknown" for them. Free text uses an empty string instead, transformed
 * back to `null` on parse, so the consuming code still sees `string | null`.
 *
 * That split is not stylistic. The API caps a response schema at 16
 * union-typed parameters — every `.nullable()` is one — and this schema had
 * 19, which it rejects outright with a 400. Keeping text out of the union
 * count holds it at 13 with room to grow.
 */

/**
 * Free text the model may not find. Stays a plain string here — zod cannot
 * represent a transform in JSON Schema — and `blankToNull` in the callers
 * turns "" back into null at the boundary.
 */
const maybeText = (description: string) =>
  z.string().describe(`${description}. Use an empty string if not stated.`);

export const ListingSchema = z.object({
  vendorName: z.string().describe("Retailer or merchant name, e.g. 'Millesima' or 'LCBO Vintages'"),
  vendorCountry: z.string().nullable().describe("Country the vendor ships from, in English"),
  vendorRegion: maybeText("State or province the vendor ships from"),
  vendorCity: maybeText("City the vendor ships from"),
  productUrl: maybeText("Direct link to the product page"),
  vintage: z.number().int().nullable().describe("Vintage year; null for non-vintage"),
  bottleMl: z.number().int().describe("Bottle size in millilitres; 750 unless stated otherwise"),
  price: z.number().describe("Price for ONE bottle in the vendor's own currency"),
  currency: z.string().describe("ISO currency code of the price, e.g. EUR, USD, CAD, GBP"),
  inStock: z.boolean().nullable(),
  quantityAvailable: z.number().int().nullable(),
  shippingNote: maybeText("What the vendor says about shipping, verbatim if short"),
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
  criticSource: maybeText("Who gave that score, e.g. 'Vinous' or 'Wine Advocate'"),
  sourceUrl: maybeText("The page this listing was read from"),
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
  vendorName: maybeText("Merchant offering it"),
  vendorCountry: maybeText("Country the merchant ships from"),
  productUrl: maybeText("Direct link to the product page"),
  price: z.number().nullable().describe("Price for one bottle in the vendor's currency"),
  currency: maybeText("ISO currency code of the price"),
  bottleMl: z.number().int().nullable(),
  criticScore: z.number().nullable(),
  criticSource: maybeText("Who gave that score"),
  rationale: z.string().describe("Why this is unusually good value, in one or two sentences"),
});

export const DiscoveryExtractionSchema = z.object({
  brief: z.string().describe("A short paragraph framing this week's picks"),
  picks: z.array(DiscoveryPickSchema),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

export type DiscoveryExtraction = z.infer<typeof DiscoveryExtractionSchema>;
