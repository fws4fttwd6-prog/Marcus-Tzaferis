/**
 * Terminal progress spinner for the long-running commands.
 */

export interface TickerStream {
  isTTY?: boolean;
  columns?: number;
  write(chunk: string): unknown;
}

/**
 * A live search runs for minutes with nothing to show. Without this the
 * terminal looks frozen, which is indistinguishable from broken.
 *
 * The whole line is clipped to the terminal width on every frame. If it
 * wraps, the carriage return only rewinds the final visual row and each
 * frame leaves the previous one behind — which turns a spinner into pages
 * of spam.
 */
export function startTicker(label: string, stream: TickerStream = process.stderr): () => void {
  if (!stream.isTTY) {
    stream.write(`${label}...\n`);
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const started = Date.now();
  let i = 0;

  const render = () => {
    const secs = Math.floor((Date.now() - started) / 1000);
    const elapsed =
      secs >= 60 ? `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s` : `${secs}s`;
    const width = Math.max(20, (stream.columns ?? 80) - 1);
    const line = `  ${frames[i++ % frames.length]}  ${label}  ${elapsed}`;
    stream.write("\r" + line.slice(0, width).padEnd(width));
  };

  render();
  const timer = setInterval(render, 120);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    const width = Math.max(20, (stream.columns ?? 80) - 1);
    stream.write("\r" + " ".repeat(width) + "\r");
  };
}
