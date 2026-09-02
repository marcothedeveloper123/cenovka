const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * A real browser's navigation headers. Tesco's Akamai began 403ing every product
 * page in Sep 2026 against a bare UA + Accept-Language; the discriminator is the
 * Client Hints trio (`sec-ch-ua*`) — the same request with everything else and
 * without those still 403s. Sent on every request because they are simply what a
 * browser sends; keep `sec-ch-ua` in step with the Chrome version in `UA`.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept-Language': 'cs-CZ,cs;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'sec-ch-ua': '"Chromium";v="124", "Not=A?Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'Upgrade-Insecure-Requests': '1',
};

export interface FetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  // An XHR is not a navigation: keep the Sec-Fetch trio consistent with that, or
  // the request looks like a browser lying about itself.
  const xhr = { ...BROWSER_HEADERS };
  delete xhr['Sec-Fetch-User'];
  delete xhr['Upgrade-Insecure-Requests'];
  const res = await fetchWithRetry(url, {
    ...opts,
    headers: {
      ...xhr,
      Accept: 'application/json',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      ...opts.headers,
    },
  });
  return res.json() as Promise<T>;
}

export async function fetchBuffer(url: string, opts: FetchOpts = {}): Promise<ArrayBuffer> {
  const res = await fetchWithRetry(url, opts);
  return res.arrayBuffer();
}

async function fetchWithRetry(url: string, opts: FetchOpts): Promise<Response> {
  const { headers, timeoutMs = 20_000, retries = 4 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { ...BROWSER_HEADERS, ...headers },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new HttpError(res.status, `${res.status} ${res.statusText} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        // Bigger backoff on 403/429 (rate-limited) than on transient errors.
        const isRateLimit = err instanceof HttpError && (err.status === 403 || err.status === 429);
        const base = isRateLimit ? 4_000 : 500;
        const backoffMs = base * 2 ** attempt;
        await sleep(backoffMs);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
