const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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
  const res = await fetchWithRetry(url, {
    ...opts,
    headers: { Accept: 'application/json', ...opts.headers },
  });
  return res.json() as Promise<T>;
}

export async function fetchBuffer(url: string, opts: FetchOpts = {}): Promise<ArrayBuffer> {
  const res = await fetchWithRetry(url, opts);
  return res.arrayBuffer();
}

async function fetchWithRetry(url: string, opts: FetchOpts): Promise<Response> {
  const { headers, timeoutMs = 20_000, retries = 2 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'cs-CZ,cs;q=0.9', ...headers },
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const backoffMs = 500 * 2 ** attempt;
        await sleep(backoffMs);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
