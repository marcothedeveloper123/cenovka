import { computeCoverage } from './coverage.ts';
import type {
  AssembleMetrics,
  CanonicalDataset,
  CanonicalProduct,
  PricePoint,
  Product,
  Store,
} from './types.ts';

const STORES: Store[] = ['tesco', 'rohlik', 'kosik', 'lidl', 'billa', 'penny'];

export interface AssembleResult {
  dataset: CanonicalDataset;
  metrics: AssembleMetrics;
}

export function assemble(
  todays: Product[],
  prior: CanonicalDataset | null,
  date: string,
): AssembleResult {
  const priorByKey = indexByKey(prior?.products ?? []);
  const todayByKey = indexByKey(todays);

  const out: CanonicalProduct[] = [];
  const metrics = emptyMetrics(date, todays);

  for (const [k, t] of todayByKey) {
    metrics.perChain[t.store].today += 1;
    const previous = priorByKey.get(k);
    if (!previous) {
      metrics.appeared += 1;
      out.push({ ...t, priceHistory: [{ date, price: t.price }] });
      continue;
    }
    if (previous.price < t.price) metrics.priceUp += 1;
    else if (previous.price > t.price) metrics.priceDown += 1;
    out.push({ ...t, priceHistory: updateHistory(previous.priceHistory, t.price, date) });
  }

  for (const [k, prev] of priorByKey) {
    if (todayByKey.has(k)) continue;
    if (prev.available === false) {
      out.push(prev);
      continue;
    }
    metrics.disappeared += 1;
    out.push({ ...prev, available: false });
  }

  if (prior) {
    for (const p of prior.products) metrics.perChain[p.store].yesterday += 1;
  }

  return {
    dataset: { schema: 1, generatedAt: new Date().toISOString(), products: out },
    metrics,
  };
}

export function updateHistory(
  history: PricePoint[],
  price: number,
  date: string,
): PricePoint[] {
  const latest = history[0];
  if (!latest) return [{ date, price }];
  if (latest.date === date) {
    if (latest.price === price) return history;
    return [{ date, price }, ...history.slice(1)];
  }
  if (latest.price === price) return history;
  return [{ date, price }, ...history];
}

function indexByKey<T extends { store: Store; id: string }>(items: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) m.set(`${it.store}::${it.id}`, it);
  return m;
}

function emptyMetrics(date: string, todays: Product[]): AssembleMetrics {
  const perChain = {} as AssembleMetrics['perChain'];
  for (const s of STORES) perChain[s] = { today: 0, yesterday: 0 };
  return {
    date,
    perChain,
    priceUp: 0,
    priceDown: 0,
    appeared: 0,
    disappeared: 0,
    coverage: computeCoverage(todays),
  };
}
