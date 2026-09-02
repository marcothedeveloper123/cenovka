/**
 * Consecutive-failure circuit breaker.
 *
 * Guards a long crawl against a systematic block. Tesco's Akamai started 403ing
 * every product page in Sep 2026; because `fetchWithRetry` spends ~60 s on the
 * 403 backoff ladder before giving up, the scrape burned a full 180-minute CI
 * runner to produce 500 failures and an empty file. A breaker turns that into a
 * loud failure in minutes.
 *
 * Only *consecutive* failures trip it: a crawl of 20k pages is expected to hit
 * scattered 404s and timeouts, and those reset on the next success.
 */
export class CircuitBreaker {
  #consecutive = 0;
  #total = 0;
  // Not a parameter property: `node --experimental-strip-types` runs in
  // strip-only mode and rejects those (they need code generation, not erasure).
  readonly threshold: number;

  constructor(threshold: number) {
    if (threshold < 1) throw new RangeError('threshold must be >= 1');
    this.threshold = threshold;
  }

  /** True once `threshold` failures have occurred with no success between them. */
  get tripped(): boolean {
    return this.#consecutive >= this.threshold;
  }

  /** Failures since the last success. */
  get consecutive(): number {
    return this.#consecutive;
  }

  /** Failures over the breaker's whole life, tripped or not. */
  get total(): number {
    return this.#total;
  }

  success(): void {
    this.#consecutive = 0;
  }

  failure(): void {
    this.#consecutive += 1;
    this.#total += 1;
  }
}
