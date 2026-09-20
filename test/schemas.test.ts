import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import {
  DiscoveryExtractionSchema,
  SearchExtractionSchema,
} from "../src/claude/schemas.js";

/**
 * The Messages API rejects a response schema carrying more than 16
 * union-typed parameters — every `.nullable()` is one — with a 400 that only
 * shows up on a live call, never in a type check or a demo-mode run. This
 * suite makes that ceiling visible at test time instead.
 */
const UNION_LIMIT = 16;

function countUnionParams(node: unknown, path = "", hits: string[] = []): string[] {
  if (!node || typeof node !== "object") return hits;
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.type) || n.anyOf || n.oneOf) hits.push(path);
  if (n.properties && typeof n.properties === "object") {
    for (const [key, value] of Object.entries(n.properties)) {
      countUnionParams(value, `${path}.${key}`, hits);
    }
  }
  if (n.items) countUnionParams(n.items, `${path}[]`, hits);
  return hits;
}

function jsonSchemaOf(schema: Parameters<typeof zodOutputFormat>[0]): unknown {
  const format = zodOutputFormat(schema) as Record<string, any>;
  return format.schema ?? format.json_schema?.schema ?? format;
}

describe("extraction schemas", () => {
  it.each([
    ["search", SearchExtractionSchema],
    ["discovery", DiscoveryExtractionSchema],
  ])("keeps %s under the API's union-parameter limit", (name, schema) => {
    const hits = countUnionParams(jsonSchemaOf(schema as never));
    expect(
      hits.length,
      `${name} has ${hits.length} union-typed parameters (limit ${UNION_LIMIT}):\n${hits.join("\n")}\n` +
        `Use maybeText() for free-text fields instead of .nullable(), and restore nulls with blankToNull().`,
    ).toBeLessThanOrEqual(UNION_LIMIT);
  });

  it.each([
    ["search", SearchExtractionSchema],
    ["discovery", DiscoveryExtractionSchema],
  ])("can render %s to JSON Schema at all", (_name, schema) => {
    // zod refuses to serialise a transform, which would fail only at runtime.
    expect(() => jsonSchemaOf(schema as never)).not.toThrow();
  });

  it("parses a listing that found nothing, using the empty-string convention", () => {
    const parsed = SearchExtractionSchema.parse({
      identity: {
        producer: "Test", wineName: "Test", fullName: "Test Test", country: "Italy",
        appellation: null, regionHint: null, style: "red", grapes: [],
        typicalPriceCad: null, notes: null, confidence: "low",
        correctedFrom: null, alternateSpellings: [],
      },
      listings: [{
        vendorName: "A Merchant", vendorCountry: null, vendorRegion: "", vendorCity: "",
        productUrl: "", vintage: null, bottleMl: 750, price: 10, currency: "EUR",
        inStock: null, quantityAvailable: null, shippingNote: "", quotedShipping: null,
        shipsToCanada: null, freeShippingOver: null, criticScore: null,
        criticSource: "", sourceUrl: "",
      }],
      sources: [],
      researchSummary: "none",
    });
    expect(parsed.listings[0]!.vendorRegion).toBe("");
  });
});
