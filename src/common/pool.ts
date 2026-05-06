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

/** Log progress every `everyN` items (and on completion) to stderr with a carriage return. */
export function consoleProgress(label: string, everyN = 250): MapPoolOptions['onProgress'] {
  return (done, total) => {
    if (done % everyN === 0 || done === total) {
      const line = `[${label}] ${done}/${total}${done === total ? '' : '...'}`;
      process.stderr.write(done === total ? `${line}\n` : `${line}\r`);
    }
  };
}
