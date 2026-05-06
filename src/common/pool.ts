export interface MapPoolOptions {
  onProgress?: (done: number, total: number) => void;
}

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  opts: MapPoolOptions = {},
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
      done += 1;
      opts.onProgress?.(done, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Log progress every `everyN` items (and on completion) to stderr.
 *
 * On a TTY: a carriage return so the line redraws in place.
 * On a pipe/file (e.g. tee'd to a log): a newline per tick so `tail -f`
 * shows real-time progress instead of one giant blob.
 */
export function consoleProgress(label: string, everyN = 250): MapPoolOptions['onProgress'] {
  const isTty = Boolean((process.stderr as { isTTY?: boolean }).isTTY);
  return (done, total) => {
    if (done % everyN === 0 || done === total) {
      const stamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
      const line = `[${stamp}] [${label}] ${done}/${total}`;
      if (isTty && done !== total) process.stderr.write(`${line}...\r`);
      else process.stderr.write(`${line}\n`);
    }
  };
}
