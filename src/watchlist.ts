import type { ScoredListing, SearchResult } from "./domain/types.js";
import {
  ALERT_LABEL,
  GRADE_ORDER,
  type Alert,
  type AlertKind,
  type Grade,
  type WatchItem,
  type WatchSnapshot,
} from "./domain/watchlist-types.js";
import { listWatches, pushAlerts, recordSnapshot } from "./store.js";
import { searchWine } from "./search.js";

/**
 * Checking the watchlist.
 *
 * Every check is a live web search, which costs real money and real time, so
 * nothing here runs speculatively: a watch is checked when it is due, or when
 * it is asked for by name. Checks run one at a time — twenty concurrent
 * searches is the fastest way to meet a rate limit.
 */

export function isDue(watch: WatchItem, now = Date.now()): boolean {
  if (!watch.enabled) return false;
  if (!watch.lastCheckedAt) return true;
  const elapsedHours = (now - Date.parse(watch.lastCheckedAt)) / 3_600_000;
  return elapsedHours >= watch.checkEveryHours;
}

function snapshotFrom(result: SearchResult): WatchSnapshot {
  const best = result.listings[0] ?? null;
  return {
    checkedAt: new Date().toISOString(),
    bestLandedCad: best ? best.landedPer750Cad : null,
    bestGrade: (best?.deal.grade ?? null) as Grade | null,
    bestScore: best?.deal.score ?? null,
    bestVendor: best?.vendorName ?? null,
    bestVendorCountry: best?.vendorCountry ?? null,
    bestVintage: best?.vintage ?? null,
    bestUrl: best?.productUrl ?? null,
    listingCount: result.listings.length,
    vintagesSeen: [
      ...new Set(result.listings.map((l) => l.vintage).filter((v): v is number => v !== null)),
    ].sort((a, b) => b - a),
    demo: result.meta.demo,
  };
}

type NewAlert = Omit<Alert, "id" | "createdAt" | "acknowledged">;

/**
 * Decide what, if anything, is worth telling the buyer about. Each rule fires
 * at most once per check, and a watch that has never been checked cannot
 * produce a price-drop or new-vintage alert — there is nothing to compare to.
 */
export function evaluateRules(
  watch: WatchItem,
  previous: WatchSnapshot | null,
  next: WatchSnapshot,
  bestListing: ScoredListing | null,
): NewAlert[] {
  const alerts: NewAlert[] = [];
  if (next.bestLandedCad === null) return alerts;

  const base = {
    watchId: watch.id,
    watchLabel: watch.label,
    landedCad: next.bestLandedCad,
    previousLandedCad: previous?.bestLandedCad ?? null,
    vendor: next.bestVendor,
    vendorCountry: next.bestVendorCountry,
    url: next.bestUrl,
    vintage: next.bestVintage,
    grade: next.bestGrade,
  };

  const where = next.bestVendor
    ? `${next.bestVendor}${next.bestVendorCountry ? ` (${next.bestVendorCountry})` : ""}`
    : "a merchant";
  const which = next.bestVintage ? `The ${next.bestVintage}` : "It";

  // 1. Target price hit.
  const target = watch.rule.targetLandedCad;
  if (target !== null && next.bestLandedCad <= target) {
    alerts.push({
      ...base,
      kind: "target-hit",
      message: `${which} is at $${next.bestLandedCad.toFixed(2)} landed from ${where} — at or below your $${target.toFixed(0)} target.`,
    });
  }

  // 2. Sharp drop since the last check. Suppressed when the target already
  //    fired, since that is the more useful of the two messages.
  const dropPct = watch.rule.dropPct;
  if (
    dropPct !== null &&
    previous?.bestLandedCad != null &&
    !alerts.some((a) => a.kind === "target-hit")
  ) {
    const fall = ((previous.bestLandedCad - next.bestLandedCad) / previous.bestLandedCad) * 100;
    if (fall >= dropPct) {
      alerts.push({
        ...base,
        kind: "price-drop",
        message: `Down ${fall.toFixed(0)}% since the last check — $${previous.bestLandedCad.toFixed(2)} to $${next.bestLandedCad.toFixed(2)} landed at ${where}.`,
      });
    }
  }

  // 3. Something graded well, whatever the absolute price.
  const minGrade = watch.rule.minGrade;
  if (
    minGrade !== null &&
    next.bestGrade !== null &&
    GRADE_ORDER[next.bestGrade] >= GRADE_ORDER[minGrade] &&
    !alerts.length
  ) {
    const reason = bestListing?.deal.reasons[0];
    alerts.push({
      ...base,
      kind: "great-deal",
      message: `Grades ${next.bestGrade} at $${next.bestLandedCad.toFixed(2)} landed from ${where}.${reason ? ` ${reason}` : ""}`,
    });
  }

  // 4. A vintage on the market that was not there last time.
  if (watch.rule.onNewVintage && previous) {
    const seen = new Set(previous.vintagesSeen);
    const fresh = next.vintagesSeen.filter((v) => !seen.has(v));
    if (fresh.length) {
      alerts.push({
        ...base,
        kind: "new-vintage",
        message: `${fresh.length === 1 ? "A vintage" : "Vintages"} now offered that weren't last time: ${fresh.join(", ")}.`,
      });
    }
  }

  // 5. Something to buy where there was nothing before.
  if (previous && previous.listingCount === 0 && next.listingCount > 0 && !alerts.length) {
    alerts.push({
      ...base,
      kind: "back-in-stock",
      message: `Back on the market — ${next.listingCount} listing${next.listingCount === 1 ? "" : "s"}, best $${next.bestLandedCad.toFixed(2)} landed at ${where}.`,
    });
  }

  return alerts;
}

export interface CheckOutcome {
  watchId: string;
  label: string;
  ok: boolean;
  error: string | null;
  snapshot: WatchSnapshot | null;
  alerts: Alert[];
}

export async function checkWatch(watch: WatchItem): Promise<CheckOutcome> {
  const previous = watch.latest;
  try {
    const result = await searchWine(watch.query, {
      quantity: watch.quantity,
      intent: watch.intent,
      vintage: watch.vintage,
      includeOutOfStock: false,
    });
    const snapshot = snapshotFrom(result);
    const pending = evaluateRules(watch, previous, snapshot, result.listings[0] ?? null);
    await recordSnapshot(watch.id, snapshot, null);
    const alerts = await pushAlerts(pending);
    if (alerts.length) void notifyWebhook(alerts);
    return { watchId: watch.id, label: watch.label, ok: true, error: null, snapshot, alerts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSnapshot(watch.id, null, message);
    return { watchId: watch.id, label: watch.label, ok: false, error: message, snapshot: null, alerts: [] };
  }
}

export interface CheckRunOptions {
  /** Restrict to these watch ids. */
  ids?: string[];
  /** Check even watches that are not due yet. */
  force?: boolean;
  /** Stop after this many, so a run cannot cost more than expected. */
  limit?: number;
  onProgress?: (done: number, total: number, label: string) => void;
  signal?: AbortSignal;
}

export async function checkWatchlist(options: CheckRunOptions = {}): Promise<{
  checked: CheckOutcome[];
  skipped: number;
  alerts: Alert[];
}> {
  const all = await listWatches();
  const now = Date.now();

  let queue = all.filter((w) => (options.ids ? options.ids.includes(w.id) : true));
  const beforeDue = queue.length;
  if (!options.force && !options.ids) queue = queue.filter((w) => isDue(w, now));
  else if (!options.force) queue = queue.filter((w) => w.enabled);
  const skipped = beforeDue - queue.length;

  if (options.limit) queue = queue.slice(0, options.limit);

  const checked: CheckOutcome[] = [];
  const alerts: Alert[] = [];

  for (const [index, watch] of queue.entries()) {
    if (options.signal?.aborted) break;
    options.onProgress?.(index, queue.length, watch.label);
    const outcome = await checkWatch(watch);
    checked.push(outcome);
    alerts.push(...outcome.alerts);
  }
  options.onProgress?.(checked.length, queue.length, "done");

  return { checked, skipped, alerts };
}

/**
 * Optional outbound notification. Anything that accepts a JSON POST works —
 * Slack and Discord webhooks both read the `text` field.
 */
export async function notifyWebhook(alerts: Alert[]): Promise<void> {
  const url = process.env.KRASI_WEBHOOK_URL?.trim();
  if (!url || !alerts.length) return;

  const text = [
    `*Krasi Crazy* — ${alerts.length} alert${alerts.length === 1 ? "" : "s"}`,
    ...alerts.map((a) => `• *${a.watchLabel}* — ${ALERT_LABEL[a.kind]}: ${a.message}${a.url ? ` ${a.url}` : ""}`),
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, alerts }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    // A webhook that is down must never take the check run with it.
    console.error("[webhook]", err instanceof Error ? err.message : String(err));
  }
}

export function alertKindLabel(kind: AlertKind): string {
  return ALERT_LABEL[kind];
}
