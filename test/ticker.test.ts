import { describe, expect, it, vi } from "vitest";
import { startTicker, type TickerStream } from "../src/ticker.js";

/**
 * The spinner rewinds with a carriage return, which only rewinds the final
 * visual row. If a frame is wider than the terminal it wraps, every frame
 * leaves the last one behind, and a five-minute search fills the screen with
 * hundreds of copies of the same sentence. That happened in real use, so the
 * width rule is tested rather than assumed.
 */
function fakeStream(columns: number): TickerStream & { frames: () => string[]; raw: () => string } {
  let buffer = "";
  return {
    isTTY: true,
    columns,
    write(chunk: string) {
      buffer += chunk;
      return true;
    },
    frames: () => buffer.split("\r").filter((f) => f.length > 0),
    raw: () => buffer,
  };
}

describe("startTicker", () => {
  it("never draws a frame wider than the terminal", () => {
    vi.useFakeTimers();
    for (const columns of [30, 40, 80, 200]) {
      const stream = fakeStream(columns);
      const stop = startTicker(
        "Searching merchants for Chateau Leoville Barton Saint-Julien 2019 and pricing to Toronto",
        stream,
      );
      vi.advanceTimersByTime(1000);
      stop();
      for (const frame of stream.frames()) {
        expect(frame.length, `at ${columns} columns: "${frame}"`).toBeLessThanOrEqual(columns);
      }
    }
    vi.useRealTimers();
  });

  it("emits no newline, which is what caused the spam", () => {
    vi.useFakeTimers();
    const stream = fakeStream(40);
    const stop = startTicker("Searching merchants for a wine with a very long name indeed", stream);
    vi.advanceTimersByTime(2000);
    stop();
    expect(stream.raw()).not.toContain("\n");
    vi.useRealTimers();
  });

  it("redraws over time and clears the line when stopped", () => {
    vi.useFakeTimers();
    const stream = fakeStream(60);
    const stop = startTicker("Searching", stream);
    vi.advanceTimersByTime(1000);
    const drawn = stream.frames().length;
    expect(drawn).toBeGreaterThan(3);
    stop();
    // The final write is blank padding, so nothing of the spinner survives.
    expect(stream.frames().at(-1)!.trim()).toBe("");
    vi.useRealTimers();
  });

  it("prints one plain line when output is not a terminal", () => {
    const stream = fakeStream(80);
    stream.isTTY = false;
    const stop = startTicker("Searching merchants", stream);
    stop();
    expect(stream.raw()).toBe("Searching merchants...\n");
  });

  it("copes with a stream that reports no width", () => {
    vi.useFakeTimers();
    const stream = fakeStream(80);
    stream.columns = undefined;
    const stop = startTicker("Searching", stream);
    vi.advanceTimersByTime(500);
    stop();
    for (const frame of stream.frames()) expect(frame.length).toBeLessThanOrEqual(80);
    vi.useRealTimers();
  });
});
