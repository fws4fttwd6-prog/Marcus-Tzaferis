import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEED_WATCHLIST } from "./data/seed-watchlist.js";
import {
  DEFAULT_RULE,
  MAX_ALERTS,
  MAX_HISTORY,
  type Alert,
  type WatchItem,
  type WatchlistStoreShape,
} from "./domain/watchlist-types.js";

/**
 * Persistence for the watchlist.
 *
 * A JSON file, written atomically via a temp file and a rename, so an
 * interrupted write cannot leave a half-parsed watchlist behind. No database:
 * this is one person's wine list, it is read far more than written, and a
 * file you can open in an editor is worth more here than a schema.
 */

function dataDir(): string {
  return process.env.KRASI_DATA_DIR?.trim() || path.resolve(process.cwd(), "data");
}

function storePath(): string {
  return path.join(dataDir(), "watchlist.json");
}

function emptyStore(): WatchlistStoreShape {
  return { version: 1, watches: [], alerts: [] };
}

/** Stable id from the query, so re-seeding does not duplicate a wine. */
function watchIdFor(query: string): string {
  return createHash("sha1").update(query.toLowerCase().trim()).digest("hex").slice(0, 12);
}

export function buildSeedWatches(): WatchItem[] {
  const now = new Date().toISOString();
  return SEED_WATCHLIST.map((seed) => ({
    id: watchIdFor(seed.query),
    query: seed.query,
    label: seed.label,
    producer: seed.producer,
    country: seed.country,
    appellation: seed.appellation,
    vintage: null,
    quantity: seed.quantity ?? 6,
    intent: seed.intent ?? "either",
    rule: {
      ...DEFAULT_RULE,
      targetLandedCad: seed.targetLandedCad,
      minGrade: seed.minGrade ?? DEFAULT_RULE.minGrade,
    },
    notes: seed.notes ?? seed.targetNote,
    enabled: true,
    checkEveryHours: 24,
    tags: seed.tags,
    createdAt: now,
    lastCheckedAt: null,
    lastError: null,
    latest: null,
    history: [],
  }));
}

let cached: WatchlistStoreShape | null = null;
/** Serialises writes so two concurrent saves cannot interleave. */
let writeChain: Promise<unknown> = Promise.resolve();

export async function loadStore(): Promise<WatchlistStoreShape> {
  if (cached) return cached;
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as WatchlistStoreShape;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.watches)) {
      parsed.alerts ??= [];
      cached = parsed;
      return cached;
    }
    // A file we cannot understand is not something to silently overwrite.
    throw new Error("watchlist.json is present but not in a recognised format");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      if (err instanceof SyntaxError) {
        throw new Error(
          `${storePath()} is not valid JSON. Fix or move it; refusing to overwrite it.`,
        );
      }
      throw err;
    }
  }
  // First run: start from the curated list.
  cached = { ...emptyStore(), watches: buildSeedWatches() };
  await saveStore();
  return cached;
}

export async function saveStore(): Promise<void> {
  if (!cached) return;
  const snapshot = JSON.stringify(cached, null, 2);
  writeChain = writeChain.then(async () => {
    await mkdir(dataDir(), { recursive: true });
    const target = storePath();
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, snapshot, "utf8");
    await rename(temp, target);
  });
  await writeChain;
}

export function __resetStoreCache(): void {
  cached = null;
}

/* ── Watches ─────────────────────────────────────────────────────────────── */

export async function listWatches(): Promise<WatchItem[]> {
  return (await loadStore()).watches;
}

export async function getWatch(id: string): Promise<WatchItem | undefined> {
  return (await loadStore()).watches.find((w) => w.id === id);
}

export async function addWatch(input: {
  query: string;
  label?: string;
  producer?: string | null;
  country?: string | null;
  appellation?: string | null;
  vintage?: number | null;
  quantity?: number;
  intent?: WatchItem["intent"];
  rule?: Partial<WatchItem["rule"]>;
  notes?: string | null;
  checkEveryHours?: number;
  tags?: string[];
}): Promise<WatchItem> {
  const store = await loadStore();
  const id = watchIdFor(input.query);
  const existing = store.watches.find((w) => w.id === id);
  if (existing) return existing;

  const watch: WatchItem = {
    id,
    query: input.query.trim(),
    label: (input.label?.trim() || input.query.trim()).slice(0, 80),
    producer: input.producer ?? null,
    country: input.country ?? null,
    appellation: input.appellation ?? null,
    vintage: input.vintage ?? null,
    quantity: input.quantity ?? 6,
    intent: input.intent ?? "either",
    rule: { ...DEFAULT_RULE, ...input.rule },
    notes: input.notes ?? null,
    enabled: true,
    checkEveryHours: input.checkEveryHours ?? 24,
    tags: input.tags ?? [],
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastError: null,
    latest: null,
    history: [],
  };
  store.watches.push(watch);
  await saveStore();
  return watch;
}

export async function updateWatch(
  id: string,
  patch: Partial<Omit<WatchItem, "id" | "createdAt" | "history">>,
): Promise<WatchItem | null> {
  const store = await loadStore();
  const watch = store.watches.find((w) => w.id === id);
  if (!watch) return null;
  Object.assign(watch, patch, { rule: { ...watch.rule, ...(patch.rule ?? {}) } });
  await saveStore();
  return watch;
}

export async function removeWatch(id: string): Promise<boolean> {
  const store = await loadStore();
  const before = store.watches.length;
  store.watches = store.watches.filter((w) => w.id !== id);
  store.alerts = store.alerts.filter((a) => a.watchId !== id);
  if (store.watches.length === before) return false;
  await saveStore();
  return true;
}

/** Re-add any seed wines that have been removed. Never touches existing ones. */
export async function restoreSeeds(): Promise<number> {
  const store = await loadStore();
  const have = new Set(store.watches.map((w) => w.id));
  const missing = buildSeedWatches().filter((w) => !have.has(w.id));
  store.watches.push(...missing);
  if (missing.length) await saveStore();
  return missing.length;
}

/* ── Alerts ──────────────────────────────────────────────────────────────── */

export async function listAlerts(options: { unacknowledgedOnly?: boolean } = {}): Promise<Alert[]> {
  const store = await loadStore();
  const alerts = options.unacknowledgedOnly
    ? store.alerts.filter((a) => !a.acknowledged)
    : store.alerts;
  return [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function pushAlerts(alerts: Omit<Alert, "id" | "createdAt" | "acknowledged">[]): Promise<Alert[]> {
  if (!alerts.length) return [];
  const store = await loadStore();
  const created = alerts.map((a) => ({
    ...a,
    id: randomUUID().slice(0, 12),
    createdAt: new Date().toISOString(),
    acknowledged: false,
  }));
  store.alerts.push(...created);
  if (store.alerts.length > MAX_ALERTS) {
    store.alerts = store.alerts.slice(-MAX_ALERTS);
  }
  await saveStore();
  return created;
}

export async function acknowledgeAlerts(ids: string[] | "all"): Promise<number> {
  const store = await loadStore();
  let n = 0;
  for (const a of store.alerts) {
    if (a.acknowledged) continue;
    if (ids === "all" || ids.includes(a.id)) {
      a.acknowledged = true;
      n++;
    }
  }
  if (n) await saveStore();
  return n;
}

export async function recordSnapshot(
  id: string,
  snapshot: WatchItem["latest"],
  error: string | null,
): Promise<void> {
  const store = await loadStore();
  const watch = store.watches.find((w) => w.id === id);
  if (!watch) return;
  watch.lastCheckedAt = new Date().toISOString();
  watch.lastError = error;
  if (snapshot) {
    watch.latest = snapshot;
    watch.history.push(snapshot);
    if (watch.history.length > MAX_HISTORY) {
      watch.history = watch.history.slice(-MAX_HISTORY);
    }
  }
  await saveStore();
}

export { storePath, dataDir };
