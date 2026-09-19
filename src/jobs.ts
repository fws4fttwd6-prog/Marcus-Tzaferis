import { randomUUID } from "node:crypto";

/**
 * A minimal in-process job registry.
 *
 * Checking twenty wines means twenty live web searches, which can run for many
 * minutes — far longer than a browser will hold a request open. So the check
 * endpoint starts a job and returns its id, and the page polls for progress.
 * Jobs live in memory: restarting the server forgets them, which is fine,
 * because every result they produce was already written to the watchlist file
 * as it happened.
 */

export interface Job<T> {
  id: string;
  kind: string;
  status: "running" | "done" | "error" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  done: number;
  total: number;
  current: string | null;
  result: T | null;
  error: string | null;
}

const jobs = new Map<string, Job<unknown>>();
const controllers = new Map<string, AbortController>();
const KEEP_MS = 60 * 60 * 1000;

export function startJob<T>(
  kind: string,
  run: (report: (done: number, total: number, current: string) => void, signal: AbortSignal) => Promise<T>,
): Job<T> {
  const id = randomUUID().slice(0, 12);
  const controller = new AbortController();
  const job: Job<T> = {
    id,
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    done: 0,
    total: 0,
    current: null,
    result: null,
    error: null,
  };
  jobs.set(id, job as Job<unknown>);
  controllers.set(id, controller);

  const report = (done: number, total: number, current: string) => {
    job.done = done;
    job.total = total;
    job.current = current;
  };

  void run(report, controller.signal)
    .then((result) => {
      job.result = result;
      job.status = controller.signal.aborted ? "cancelled" : "done";
    })
    .catch((err: unknown) => {
      job.error = err instanceof Error ? err.message : String(err);
      job.status = "error";
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
      controllers.delete(id);
      setTimeout(() => jobs.delete(id), KEEP_MS).unref?.();
    });

  return job;
}

export function getJob(id: string): Job<unknown> | undefined {
  return jobs.get(id);
}

export function cancelJob(id: string): boolean {
  const controller = controllers.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** Only one check run at a time, so a double-click cannot double the bill. */
export function findRunning(kind: string): Job<unknown> | undefined {
  for (const job of jobs.values()) {
    if (job.kind === kind && job.status === "running") return job;
  }
  return undefined;
}
