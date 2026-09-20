import { describe, expect, it } from "vitest";
import { cancelJob, findRunning, getJob, startJob } from "../src/jobs.js";

const settle = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe("background jobs", () => {
  it("carries a finished result so the poller can collect it", async () => {
    const job = startJob("t:ok", async () => ({ listings: [1, 2, 3] }));
    expect(job.status).toBe("running");
    await settle();
    const done = getJob(job.id)!;
    expect(done.status).toBe("done");
    expect((done.result as { listings: number[] }).listings).toHaveLength(3);
  });

  it("records a failure instead of leaving the poller hanging", async () => {
    const job = startJob("t:bad", async () => {
      throw new Error("merchant refused");
    });
    await settle();
    const failed = getJob(job.id)!;
    expect(failed.status).toBe("error");
    expect(failed.error).toBe("merchant refused");
  });

  it("reports progress while running", async () => {
    let release: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = startJob("t:slow", async (report) => {
      report(2, 5, "Sassicaia");
      await gate;
      return "done";
    });
    await settle();
    const mid = getJob(job.id)!;
    expect(mid.status).toBe("running");
    expect(mid.done).toBe(2);
    expect(mid.total).toBe(5);
    expect(mid.current).toBe("Sassicaia");
    release!();
    await settle();
    expect(getJob(job.id)!.status).toBe("done");
  });

  it("finds a running job by kind, so a double-click does not start a second", async () => {
    let release: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = startJob("t:dupe", async () => {
      await gate;
      return 1;
    });
    expect(findRunning("t:dupe")?.id).toBe(job.id);
    release!();
    await settle();
    expect(findRunning("t:dupe")).toBeUndefined();
  });

  it("cancels a running job and ignores an unknown id", async () => {
    let release: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = startJob("t:cancel", async (_report, signal) => {
      await gate;
      return signal.aborted ? "aborted" : "finished";
    });
    expect(cancelJob(job.id)).toBe(true);
    release!();
    await settle();
    expect(getJob(job.id)!.status).toBe("cancelled");
    expect(cancelJob("nosuchjob")).toBe(false);
  });

  it("returns undefined for an id it never issued", () => {
    expect(getJob("deadbeef1234")).toBeUndefined();
  });
});
