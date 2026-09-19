import { REGION_BY_KEY, type RegionProfile } from "../data/regions.js";
import { VINTAGE_CHART, VINTAGE_NOTES } from "../data/vintage-chart.js";

export type Maturity =
  | "too-young"
  | "approaching"
  | "in-window"
  | "at-peak"
  | "mature"
  | "fading";

export interface DrinkingWindow {
  from: number;
  peakFrom: number;
  peakTo: number;
  to: number;
}

export interface VintageAssessment {
  year: number;
  regionKey: string;
  /** 0-100 consensus vintage quality, or null when the chart has no entry. */
  score: number | null;
  window: DrinkingWindow | null;
  maturity: Maturity | null;
  /** Years until the wine enters its peak plateau; 0 if already there or past. */
  yearsToPeak: number;
  note: string | null;
  /**
   * How far this year sits below the best of its immediate neighbours.
   * A strong year next door to a hyped one tends to be underpriced — this is
   * the number that finds the sleepers.
   */
  attentionDiscount: number;
}

export function currentYear(): number {
  return new Date().getFullYear();
}

/** Consensus quality for a region/year, or null if uncharted. */
export function vintageScore(regionKey: string, year: number): number | null {
  const years = VINTAGE_CHART[regionKey];
  if (!years) return null;
  return years[year] ?? null;
}

/**
 * Drinking window, derived from the region's ageing curve stretched by how
 * good the year was. A 97-point Barolo keeps roughly 40% longer than an
 * 88-point one from the same cellar.
 */
export function drinkingWindow(
  region: RegionProfile,
  year: number,
  score: number,
): DrinkingWindow {
  const [earlyBase, peakBase, endBase] = region.hold;
  // 90 points is the reference year the `hold` curve describes.
  const stretch = clamp(1 + (score - 90) / 45, 0.6, 1.5);
  const from = year + Math.round(earlyBase * clamp(stretch, 0.75, 1.35));
  const peakFrom = year + Math.round(peakBase * stretch);
  const to = year + Math.round(endBase * stretch);
  // Plateau runs from peak to roughly two-thirds of the way to the end.
  const peakTo = Math.round(peakFrom + (to - peakFrom) * 0.6);
  return { from, peakFrom, peakTo: Math.max(peakTo, peakFrom), to: Math.max(to, peakFrom) };
}

export function maturityAt(window: DrinkingWindow, asOf: number): Maturity {
  if (asOf < window.from) return "too-young";
  if (asOf < window.peakFrom) {
    // Within two years of the plateau it is drinking well enough to open.
    return window.peakFrom - asOf <= 2 ? "approaching" : "in-window";
  }
  if (asOf <= window.peakTo) return "at-peak";
  if (asOf <= window.to) return "mature";
  return "fading";
}

export function assessVintage(
  regionKey: string,
  year: number,
  asOf: number = currentYear(),
): VintageAssessment {
  const region = REGION_BY_KEY.get(regionKey);
  const score = vintageScore(regionKey, year);
  const note = VINTAGE_NOTES[regionKey]?.[year] ?? null;

  if (!region || score === null) {
    return {
      year,
      regionKey,
      score,
      window: null,
      maturity: null,
      yearsToPeak: 0,
      note,
      attentionDiscount: 0,
    };
  }

  const window = drinkingWindow(region, year, score);
  const neighbours = [
    vintageScore(regionKey, year - 1),
    vintageScore(regionKey, year + 1),
  ].filter((n): n is number => n !== null);
  const bestNeighbour = neighbours.length ? Math.max(...neighbours) : score;

  return {
    year,
    regionKey,
    score,
    window,
    maturity: maturityAt(window, asOf),
    yearsToPeak: Math.max(0, window.peakFrom - asOf),
    note,
    attentionDiscount: Math.max(0, bestNeighbour - score),
  };
}

export interface VintageAdvice {
  regionKey: string;
  regionLabel: string;
  /** Every charted year for the region, newest first. */
  all: VintageAssessment[];
  /** Great years that are ready to drink now. */
  drinkNow: VintageAssessment[];
  /** Great years worth buying and laying down. */
  cellar: VintageAssessment[];
  /** Strong years overshadowed by a neighbouring hyped vintage. */
  sleepers: VintageAssessment[];
  /** Years to approach with caution regardless of price. */
  avoid: VintageAssessment[];
  summary: string;
}

/**
 * The "which year should I buy?" answer for a region: separates what is
 * ready now from what rewards patience, and flags the years the market
 * tends to skip over.
 */
export function vintageAdvice(
  regionKey: string,
  asOf: number = currentYear(),
): VintageAdvice | null {
  const region = REGION_BY_KEY.get(regionKey);
  const years = VINTAGE_CHART[regionKey];
  if (!region || !years) return null;

  const all = Object.keys(years)
    .map(Number)
    .filter((y) => y <= asOf)
    .sort((a, b) => b - a)
    .map((y) => assessVintage(regionKey, y, asOf));

  const scored = all.filter((v) => v.score !== null);

  // These two lists are shown side by side as a choice, so they must not
  // overlap: a year is either ready to open or still worth waiting on.
  const readyNow = (v: VintageAssessment) =>
    v.maturity === "at-peak" ||
    v.maturity === "mature" ||
    v.maturity === "approaching" ||
    (v.maturity === "in-window" && v.yearsToPeak < 3);

  const drinkNow = scored
    .filter((v) => v.score! >= 90 && readyNow(v))
    .sort((a, b) => b.score! - a.score!)
    .slice(0, 6);

  const cellar = scored
    .filter((v) => v.score! >= 92 && !readyNow(v) && v.maturity !== "fading")
    .sort((a, b) => b.score! - a.score!)
    .slice(0, 6);

  const sleepers = scored
    .filter((v) => v.score! >= 90 && v.attentionDiscount >= 3 && v.maturity !== "fading")
    .sort((a, b) => b.attentionDiscount - a.attentionDiscount || b.score! - a.score!)
    .slice(0, 5);

  const avoid = scored
    .filter((v) => v.score! < 85)
    .sort((a, b) => b.year - a.year)
    .slice(0, 5);

  return {
    regionKey,
    regionLabel: region.label,
    all,
    drinkNow,
    cellar,
    sleepers,
    avoid,
    summary: buildSummary(region, drinkNow, cellar, sleepers),
  };
}

function buildSummary(
  region: RegionProfile,
  drinkNow: VintageAssessment[],
  cellar: VintageAssessment[],
  sleepers: VintageAssessment[],
): string {
  const parts: string[] = [];
  if (drinkNow.length) {
    parts.push(
      `Open now: ${drinkNow.slice(0, 3).map((v) => `${v.year} (${v.score})`).join(", ")}.`,
    );
  }
  if (cellar.length) {
    parts.push(
      `Buy and hold: ${cellar.slice(0, 3).map((v) => `${v.year} (${v.score})`).join(", ")}.`,
    );
  }
  if (sleepers.length) {
    const s = sleepers[0]!;
    parts.push(
      `${s.year} scores ${s.score} but sits in the shadow of a stronger neighbour, so it usually trades below what it deserves.`,
    );
  }
  if (!parts.length) parts.push(`No charted vintages yet for ${region.label}.`);
  return parts.join(" ");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export const MATURITY_LABEL: Record<Maturity, string> = {
  "too-young": "Too young",
  approaching: "Almost ready",
  "in-window": "Drinkable, still climbing",
  "at-peak": "At peak",
  mature: "Mature",
  fading: "Past peak",
};
