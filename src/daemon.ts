#!/usr/bin/env node
import "dotenv/config";
import { isDemoMode } from "./claude/client.js";
import { listWatches } from "./store.js";
import { checkWatchlist, isDue } from "./watchlist.js";

/**
 * Background checker.
 *
 * Wakes every few minutes, checks only what is actually due, and goes back to
 * sleep. The per-watch `checkEveryHours` does the real scheduling, so waking
 * often is cheap — it usually finds nothing to do and spends nothing.
 *
 * `npm run watch:daemon` to leave it running, or put `npm run watch:check` in
 * cron if you would rather the operating system did the waking.
 */

const WAKE_MINUTES = Number(process.env.KRASI_DAEMON_WAKE_MINUTES ?? 30);
const MAX_PER_RUN = Number(process.env.KRASI_DAEMON_MAX_PER_RUN ?? 10);

function stamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function runOnce(): Promise<void> {
  const watches = await listWatches();
  const due = watches.filter((w) => isDue(w));
  if (!due.length) {
    console.log(`${stamp()}  nothing due (${watches.length} watched)`);
    return;
  }

  console.log(`${stamp()}  ${due.length} due, checking up to ${MAX_PER_RUN}`);
  const { checked, alerts } = await checkWatchlist({
    limit: MAX_PER_RUN,
    onProgress: (done, total, label) => {
      if (label !== "done") console.log(`${stamp()}    [${done + 1}/${total}] ${label}`);
    },
  });

  const failed = checked.filter((c) => !c.ok);
  console.log(
    `${stamp()}  checked ${checked.length}, ${alerts.length} alert${alerts.length === 1 ? "" : "s"}` +
      (failed.length ? `, ${failed.length} failed` : ""),
  );
  for (const a of alerts) console.log(`${stamp()}  ALERT  ${a.watchLabel}: ${a.message}`);
  for (const f of failed) console.log(`${stamp()}  ERROR  ${f.label}: ${f.error}`);
}

const once = process.argv.includes("--once");

if (isDemoMode()) {
  console.error(
    "! No ANTHROPIC_API_KEY set. The checker would only ever record sample data, so it will not run.",
  );
  process.exit(1);
}

await runOnce();

if (!once) {
  console.log(`${stamp()}  sleeping; waking every ${WAKE_MINUTES} minutes. Ctrl-C to stop.`);
  setInterval(() => {
    void runOnce().catch((err: unknown) => {
      console.error(`${stamp()}  run failed:`, err instanceof Error ? err.message : err);
    });
  }, WAKE_MINUTES * 60_000);
}
