/**
 * What a bottle actually costs once it reaches Toronto.
 *
 * A €45 bottle in Bordeaux is not a €45 bottle in Leaside. Freight, customs
 * duty, federal excise, the LCBO's cut and 13% HST all land on top, and the
 * freight component is per *shipment*, so the answer changes completely
 * between buying one bottle and buying a case. This module makes every one of
 * those charges an explicit, editable line item rather than a fudge factor.
 *
 * ── Accuracy warning ────────────────────────────────────────────────────────
 * The rates below were correct at the time of writing and they move:
 * federal excise is indexed every 1 April, and the LCBO revises its markup
 * schedules periodically. Treat the output as a well-informed estimate, not a
 * quote. `RATE_PROVENANCE` records where each number came from so you can
 * re-check it. Verify before committing to a large order.
 */

export const DESTINATION = {
  city: "Toronto",
  province: "Ontario",
  provinceCode: "ON",
  country: "Canada",
  hstRate: 0.13,
} as const;

export type ShippingZone =
  | "ontario"
  | "canada-other"
  | "usa"
  | "france"
  | "italy"
  | "spain"
  | "eu-other"
  | "uk"
  | "rest-of-world";

export interface ZoneProfile {
  zone: ShippingZone;
  label: string;
  /** Fixed cost of getting one shipment to Toronto, in CAD. */
  baseCad: number;
  /** Marginal cost per additional bottle in the same shipment, in CAD. */
  perBottleCad: number;
  /** Typical minimum order a merchant in this zone will ship overseas. */
  typicalMinBottles: number;
  transitDays: [number, number];
  /** True when the goods cross the Canadian border and attract import charges. */
  imported: boolean;
  /** Trade agreement that zeroes the customs duty, if any. */
  tradeAgreement?: string;
  notes: string;
}

export const ZONES: Record<ShippingZone, ZoneProfile> = {
  ontario: {
    zone: "ontario",
    label: "Ontario (LCBO, Vintages, local agents)",
    baseCad: 12,
    perBottleCad: 1.5,
    typicalMinBottles: 1,
    transitDays: [1, 7],
    imported: false,
    notes:
      "Price on the shelf is already all-in. Vintages Shop Online delivers to a store free, or to your door for a flat fee.",
  },
  "canada-other": {
    zone: "canada-other",
    label: "Elsewhere in Canada",
    baseCad: 28,
    perBottleCad: 2.5,
    typicalMinBottles: 1,
    transitDays: [3, 10],
    imported: false,
    notes:
      "No import charges, but shipping alcohol across provincial lines is legally grey — most Ontario-bound orders arrive, some are refused at the point of sale.",
  },
  usa: {
    zone: "usa",
    label: "United States",
    baseCad: 55,
    perBottleCad: 6,
    typicalMinBottles: 3,
    transitDays: [5, 15],
    imported: true,
    tradeAgreement: "CUSMA",
    notes:
      "Many US retailers will not ship alcohol to Canada at all. Those that do usually route through a broker, which adds a clearance fee.",
  },
  france: {
    zone: "france",
    label: "France",
    baseCad: 62,
    perBottleCad: 8,
    typicalMinBottles: 6,
    transitDays: [10, 25],
    imported: true,
    tradeAgreement: "CETA",
    notes:
      "French merchants ship cases readily. Ask for temperature-controlled transit between June and September.",
  },
  italy: {
    zone: "italy",
    label: "Italy",
    baseCad: 62,
    perBottleCad: 8,
    typicalMinBottles: 6,
    transitDays: [10, 25],
    imported: true,
    tradeAgreement: "CETA",
    notes:
      "Italian merchants often quote sharper case rates than French ones; six bottles is the usual minimum.",
  },
  spain: {
    zone: "spain",
    label: "Spain",
    baseCad: 60,
    perBottleCad: 8,
    typicalMinBottles: 6,
    transitDays: [10, 25],
    imported: true,
    tradeAgreement: "CETA",
    notes:
      "Spain has the cheapest ex-cellar prices of the three, so freight is a bigger share of the landed cost — order full cases.",
  },
  "eu-other": {
    zone: "eu-other",
    label: "Elsewhere in the EU",
    baseCad: 68,
    perBottleCad: 8.5,
    typicalMinBottles: 6,
    transitDays: [10, 25],
    imported: true,
    tradeAgreement: "CETA",
    notes: "German and Belgian merchants often hold deep back-vintage stock at keen prices.",
  },
  uk: {
    zone: "uk",
    label: "United Kingdom",
    baseCad: 70,
    perBottleCad: 8.5,
    typicalMinBottles: 6,
    transitDays: [10, 25],
    imported: true,
    notes:
      "UK merchants sell in-bond, which excludes UK duty and VAT — compare the in-bond price, not the duty-paid one.",
  },
  "rest-of-world": {
    zone: "rest-of-world",
    label: "Rest of world",
    baseCad: 90,
    perBottleCad: 10,
    typicalMinBottles: 6,
    transitDays: [14, 35],
    imported: true,
    notes: "Expect a customs broker fee on top of the charges below.",
  },
};

/**
 * Editable rate card. Every number that touches money lives here.
 */
/**
 * EU and UK retail prices are quoted with that country's VAT included. VAT is
 * not charged on goods exported to Canada, so a German shelf price of EUR 145
 * is EUR 121.85 on an export invoice — and pricing the import off the shelf
 * figure overstates the landed cost by roughly a fifth. A merchant who sells
 * export-only, or quotes in bond, has already excluded it.
 */
export const VAT_BY_ZONE: Partial<Record<ShippingZone, number>> = {
  france: 0.20,
  italy: 0.22,
  spain: 0.21,
  "eu-other": 0.19,
  uk: 0.20,
};

export const RATES = {
  /** Federal excise duty per litre of wine over 7% abv. Indexed every 1 April. */
  exciseCadPerLitre: 0.745,
  /** MFN customs duty per litre where no trade agreement applies. */
  mfnCustomsCadPerLitre: 0.0187,
  /**
   * LCBO ad valorem markup applied to a personal/private import.
   * Substantially lower than the retail markup on general-list product, but
   * the schedule is revised periodically — the single most uncertain input here.
   */
  lcboPrivateImportMarkup: 0.396,
  /** Per-bottle LCBO service and levy charges. */
  lcboBottleLevyCad: 0.29,
  containerDepositCad: 0.2,
  /** Flat administrative charge on an LCBO private order. */
  lcboPrivateOrderAdminCad: 25,
  /** Broker/clearance fee typical of a non-LCBO courier import. */
  customsBrokerageCad: 35,
  hst: DESTINATION.hstRate,
  /** Trade agreements that zero the customs duty on wine. */
  dutyFreeAgreements: new Set(["CETA", "CUSMA"]),
} as const;

export const RATE_PROVENANCE: Record<string, string> = {
  exciseCadPerLitre:
    "Canada Revenue Agency excise duty rates on wine (>7% abv). Indexed to CPI each 1 April — re-check annually.",
  mfnCustomsCadPerLitre:
    "Canadian customs tariff, MFN rate on wine not exceeding 22.9% abv. Zero for CETA (EU) and CUSMA (US/Mexico) origin.",
  lcboPrivateImportMarkup:
    "LCBO private ordering / personal import markup on wine. The schedule changes — confirm with LCBO Private Ordering before a large order.",
  lcboBottleLevyCad: "LCBO environmental levy per container.",
  containerDepositCad: "Ontario Deposit Return Program, per container under 630ml equivalent.",
  hst: "Ontario Harmonized Sales Tax, 13%.",
};

export interface LandedCostInput {
  /** Vendor's shelf price for one bottle, in CAD (convert before calling). */
  bottlePriceCad: number;
  zone: ShippingZone;
  /** How many bottles in the one shipment. Freight is shared across them. */
  quantity: number;
  /** Bottle size in millilitres. */
  bottleMl?: number;
  /** Vendor's own quoted shipping for the whole order, in CAD, if known. */
  quotedShippingCad?: number | null;
  /** Some merchants ship free over a threshold; pass it to model that. */
  freeShippingOverCad?: number | null;
  temperatureControlled?: boolean;
  /**
   * True when `bottlePriceCad` is a consumer shelf price that includes the
   * seller's local VAT. Defaults to true for EU and UK zones, because that is
   * what a retail page shows. Set false for an in-bond or export-only quote.
   */
  priceIncludesVat?: boolean;
}

export interface CostLine {
  label: string;
  amountCad: number;
  detail?: string;
}

export interface LandedCost {
  zone: ShippingZone;
  zoneLabel: string;
  quantity: number;
  bottleMl: number;
  lines: CostLine[];
  /** Total for the whole shipment. */
  totalCad: number;
  /** Total divided by bottle count — the number worth comparing. */
  perBottleCad: number;
  /** The per-bottle price on an export invoice, after any VAT is removed. */
  exportPricePerBottleCad: number;
  /** Seller's VAT removed per bottle; zero outside the EU and UK. */
  vatStrippedCad: number;
  /** Everything that is not the wine itself, per bottle. */
  overheadPerBottleCad: number;
  /** Overhead as a share of the shelf price. */
  overheadRatio: number;
  transitDays: [number, number];
  /** ± band on the estimate, reflecting how firm the inputs are. */
  confidence: "quoted" | "estimated" | "rough";
  uncertaintyPct: number;
  caveats: string[];
}

export function estimateLandedCost(input: LandedCostInput): LandedCost {
  const {
    bottlePriceCad,
    zone,
    quantity,
    bottleMl = 750,
    quotedShippingCad = null,
    freeShippingOverCad = null,
    temperatureControlled = false,
    priceIncludesVat,
  } = input;

  const qty = Math.max(1, Math.round(quantity));
  const profile = ZONES[zone];
  const lines: CostLine[] = [];
  const caveats: string[] = [];

  // Strip the seller's VAT before anything else: Canadian charges apply to the
  // export value, not to the price a local consumer would pay.
  const vatRate = VAT_BY_ZONE[zone] ?? 0;
  const stripVat = vatRate > 0 && (priceIncludesVat ?? true);
  const exportPricePerBottle = stripVat
    ? round2(bottlePriceCad / (1 + vatRate))
    : bottlePriceCad;

  const goods = exportPricePerBottle * qty;
  lines.push({
    label: "Wine",
    amountCad: goods,
    detail: stripVat
      ? `${qty} × ${money(exportPricePerBottle)} — ${money(bottlePriceCad)} shelf price less ${(vatRate * 100).toFixed(0)}% VAT, which is not charged on export`
      : `${qty} × ${money(bottlePriceCad)}`,
  });

  // ---- Freight -------------------------------------------------------------
  let freight: number;
  let freightDetail: string;
  if (quotedShippingCad !== null && quotedShippingCad !== undefined) {
    freight = quotedShippingCad;
    freightDetail = "vendor's quoted rate";
  } else if (freeShippingOverCad !== null && bottlePriceCad * qty >= freeShippingOverCad) {
    // The threshold is measured against what the customer is billed — the
    // shelf total including VAT — not against the ex-VAT export value.
    freight = 0;
    freightDetail = `free over ${money(freeShippingOverCad)}`;
  } else {
    freight = profile.baseCad + profile.perBottleCad * qty;
    freightDetail = `${money(profile.baseCad)} base + ${money(profile.perBottleCad)}/bottle`;
  }
  if (temperatureControlled && profile.imported) {
    const surcharge = 45 + 1.5 * qty;
    freight += surcharge;
    freightDetail += `, +${money(surcharge)} temperature-controlled`;
  }
  lines.push({ label: "Shipping to Toronto", amountCad: freight, detail: freightDetail });

  let total = goods + freight;

  // ---- Import charges ------------------------------------------------------
  if (profile.imported) {
    const litres = (bottleMl / 1000) * qty;

    const dutyFree =
      profile.tradeAgreement !== undefined &&
      RATES.dutyFreeAgreements.has(profile.tradeAgreement);
    const customs = dutyFree ? 0 : RATES.mfnCustomsCadPerLitre * litres;
    lines.push({
      label: "Customs duty",
      amountCad: customs,
      detail: dutyFree
        ? `zero under ${profile.tradeAgreement}`
        : `${money(RATES.mfnCustomsCadPerLitre)}/L × ${litres.toFixed(2)} L`,
    });

    const excise = RATES.exciseCadPerLitre * litres;
    lines.push({
      label: "Federal excise duty",
      amountCad: excise,
      detail: `${money(RATES.exciseCadPerLitre)}/L × ${litres.toFixed(2)} L`,
    });

    const dutyPaidValue = goods + freight + customs + excise;
    const markup = dutyPaidValue * RATES.lcboPrivateImportMarkup;
    lines.push({
      label: "LCBO private import markup",
      amountCad: markup,
      detail: `${(RATES.lcboPrivateImportMarkup * 100).toFixed(1)}% of duty-paid value`,
    });

    const levies = (RATES.lcboBottleLevyCad + RATES.containerDepositCad) * qty;
    lines.push({
      label: "Levies and deposit",
      amountCad: levies,
      detail: `${qty} × ${money(RATES.lcboBottleLevyCad + RATES.containerDepositCad)}`,
    });

    const admin = RATES.lcboPrivateOrderAdminCad + RATES.customsBrokerageCad;
    lines.push({
      label: "Private order and brokerage fees",
      amountCad: admin,
      detail: "LCBO private order admin + customs clearance",
    });

    total = dutyPaidValue + markup + levies + admin;

    caveats.push(
      "Ontario requires alcohol imported for personal use to be consigned through the LCBO. Budget for the private-ordering process rather than a courier to your door.",
    );
    caveats.push(
      "The LCBO markup is the softest number in this estimate. Confirm the current schedule with LCBO Private Ordering before a large order.",
    );
    if (stripVat) {
      caveats.push(
        `The merchant's shelf price includes ${(vatRate * 100).toFixed(0)}% VAT, removed here because it is not charged on export. Confirm they actually deduct it — not every retailer does for a private buyer.`,
      );
    }
  }

  // ---- HST -----------------------------------------------------------------
  const hst = total * RATES.hst;
  lines.push({
    label: `HST (${(RATES.hst * 100).toFixed(0)}%)`,
    amountCad: hst,
    detail: DESTINATION.province,
  });
  total += hst;

  if (!profile.imported && zone === "ontario") {
    caveats.push(
      "LCBO shelf prices already include markup and tax, so the only thing added here is delivery.",
    );
  }
  if (zone === "canada-other") {
    caveats.push(
      "Interprovincial shipping to Ontario is legally grey. Some retailers decline Ontario addresses.",
    );
  }
  if (qty < profile.typicalMinBottles) {
    caveats.push(
      `Merchants in ${profile.label} usually want at least ${profile.typicalMinBottles} bottles per shipment. Below that, freight per bottle is punishing.`,
    );
  }

  const confidence: LandedCost["confidence"] =
    quotedShippingCad !== null && quotedShippingCad !== undefined
      ? "quoted"
      : profile.imported
        ? "rough"
        : "estimated";
  const uncertaintyPct = confidence === "quoted" ? 8 : confidence === "estimated" ? 12 : 22;

  const perBottle = total / qty;
  return {
    zone,
    zoneLabel: profile.label,
    quantity: qty,
    bottleMl,
    lines: lines.map((l) => ({ ...l, amountCad: round2(l.amountCad) })),
    totalCad: round2(total),
    perBottleCad: round2(perBottle),
    exportPricePerBottleCad: exportPricePerBottle,
    vatStrippedCad: round2(bottlePriceCad - exportPricePerBottle),
    overheadPerBottleCad: round2(perBottle - exportPricePerBottle),
    overheadRatio: round2((perBottle - exportPricePerBottle) / Math.max(exportPricePerBottle, 0.01)),
    transitDays: profile.transitDays,
    confidence,
    uncertaintyPct,
    caveats,
  };
}

/**
 * Freight is shared across a shipment, so the honest answer to "what does this
 * cost me" depends on how many you buy. This returns the curve.
 */
export function landedCostCurve(
  input: Omit<LandedCostInput, "quantity">,
  quantities: number[] = [1, 3, 6, 12],
): Array<{ quantity: number; perBottleCad: number; totalCad: number }> {
  return quantities.map((quantity) => {
    const c = estimateLandedCost({ ...input, quantity });
    return { quantity, perBottleCad: c.perBottleCad, totalCad: c.totalCad };
  });
}

/** Map a vendor's country to a shipping zone. */
export function zoneForLocation(
  country: string | null | undefined,
  region?: string | null,
): ShippingZone {
  const c = (country ?? "").trim().toLowerCase();
  const r = (region ?? "").trim().toLowerCase();

  if (!c) return "rest-of-world";
  if (/canada|^ca$/.test(c)) {
    if (/ontario|^on$|toronto|ottawa|niagara/.test(r)) return "ontario";
    return "canada-other";
  }
  if (/united states|u\.?s\.?a?\.?$|^us$/.test(c)) return "usa";
  if (/france|^fr$/.test(c)) return "france";
  if (/italy|italia|^it$/.test(c)) return "italy";
  if (/spain|espa[nñ]a|^es$/.test(c)) return "spain";
  if (/united kingdom|england|scotland|wales|^uk$|^gb$|britain/.test(c)) return "uk";
  if (
    /germany|deutschland|belgium|netherlands|holland|austria|portugal|ireland|denmark|sweden|finland|poland|luxembourg|czech|hungary|greece|^de$|^be$|^nl$|^at$|^pt$/.test(
      c,
    )
  ) {
    return "eu-other";
  }
  return "rest-of-world";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
