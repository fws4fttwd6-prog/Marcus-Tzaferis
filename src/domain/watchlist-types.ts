import type { DrinkingIntent } from "./types.js";

/**
 * Why an alert fired. Each maps to one rule in `WatchRule`, except
 * `new-vintage` and `back-in-stock`, which fire on a change in what the
 * merchants are offering rather than on a price threshold.
 */
export type AlertKind =
  | "target-hit"
  | "price-drop"
  | "great-deal"
  | "new-vintage"
  | "back-in-stock";

export type Grade = "A+" | "A" | "B" | "C" | "D";

export interface WatchRule {
  /** Alert when the best landed price falls to or below this, in CAD. */
  targetLandedCad: number | null;
  /** Alert when any listing grades at or above this. */
  minGrade: Grade | null;
  /** Alert when the best landed price falls by at least this much since the last check. */
  dropPct: number | null;
  /** Alert when a vintage appears that was not offered at the last check. */
  onNewVintage: boolean;
}

export const DEFAULT_RULE: WatchRule = {
  targetLandedCad: null,
  minGrade: "A",
  dropPct: 10,
  onNewVintage: true,
};

/** What one check found, kept so prices can be tracked over time. */
export interface WatchSnapshot {
  checkedAt: string;
  bestLandedCad: number | null;
  bestGrade: Grade | null;
  bestScore: number | null;
  bestVendor: string | null;
  bestVendorCountry: string | null;
  bestVintage: number | null;
  bestUrl: string | null;
  listingCount: number;
  vintagesSeen: number[];
  /** True when the snapshot came from sample data rather than a live search. */
  demo: boolean;
}

export interface WatchItem {
  id: string;
  /** What gets typed into the search. */
  query: string;
  /** What gets shown in the list. */
  label: string;
  producer: string | null;
  country: string | null;
  appellation: string | null;
  /** Null watches every vintage; a year narrows it to one. */
  vintage: number | null;
  quantity: number;
  intent: DrinkingIntent;
  rule: WatchRule;
  notes: string | null;
  enabled: boolean;
  /** How often this watch is due for a check. */
  checkEveryHours: number;
  tags: string[];
  createdAt: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  latest: WatchSnapshot | null;
  /** Oldest first, capped so the file cannot grow without bound. */
  history: WatchSnapshot[];
}

export interface Alert {
  id: string;
  watchId: string;
  watchLabel: string;
  kind: AlertKind;
  message: string;
  createdAt: string;
  acknowledged: boolean;
  landedCad: number | null;
  previousLandedCad: number | null;
  vendor: string | null;
  vendorCountry: string | null;
  url: string | null;
  vintage: number | null;
  grade: Grade | null;
}

export interface WatchlistStoreShape {
  version: 1;
  watches: WatchItem[];
  alerts: Alert[];
}

export const MAX_HISTORY = 180;
export const MAX_ALERTS = 300;

export const GRADE_ORDER: Record<Grade, number> = { "A+": 5, A: 4, B: 3, C: 2, D: 1 };

export const ALERT_LABEL: Record<AlertKind, string> = {
  "target-hit": "Target price hit",
  "price-drop": "Price drop",
  "great-deal": "Graded a strong deal",
  "new-vintage": "New vintage offered",
  "back-in-stock": "Back in stock",
};
