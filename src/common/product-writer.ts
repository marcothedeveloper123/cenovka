import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Product } from './types.ts';

export interface ProductWriter {
  /** Append a single product as one JSONL line. Safe to call concurrently. */
  write(p: Product): void;
  /** Flush and close the stream. */
  close(): Promise<void>;
  /** Count of products written so far. */
  readonly count: number;
}

/**
 * Open a JSONL writer at `path`, truncating any prior content. Writes are
 * atomic per call (Node's WriteStream serializes them); safe to share across
 * mapPool workers.
 */
export async function openProductWriter(path: string): Promise<ProductWriter> {
  await mkdir(dirname(path), { recursive: true });
  const stream: WriteStream = createWriteStream(path, { flags: 'w' });
  let count = 0;
  return {
    get count() {
      return count;
    },
    write(p: Product) {
      stream.write(`${JSON.stringify(p)}\n`);
      count += 1;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });
    },
  };
}
