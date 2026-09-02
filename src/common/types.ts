export type Store =
  | 'tesco'
  | 'rohlik'
  | 'kosik'
  | 'lidl'
  | 'billa'
  | 'penny'
  | 'globus'
  | 'kaufland';

export type Unit = 'g' | 'ml' | 'ks' | 'wash' | 'm' | 'cm';

export interface Product {
  store: Store;
  id: string;
  name: string;
  brand?: string;
  category?: string;
  /** Canonical cross-chain category id (see common/categories.ts). */
  categoryCanonical?: import('./categories.ts').CanonicalCategory;
  price: number;
  currency: 'CZK';
  unit?: Unit;
  quantity?: number;
  ean?: string;
  isBio?: boolean;
  isBudget?: boolean;
  available: boolean;
  url: string;
  scrapedAt: string;
}

export interface ScrapeResult {
  store: Store;
  startedAt: string;
  finishedAt: string;
  products: Product[];
  errors: Array<{ url: string; error: string }>;
}

export interface PricePoint {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface CanonicalProduct extends Product {
  priceHistory: PricePoint[]; // newest first
}

/**
 * A month of the ČSÚ reference series. Deliberately not `PricePoint`: that
 * type's `date` is documented as YYYY-MM-DD and this data is monthly, so
 * reusing it would let a day-granularity consumer silently mis-plot it.
 */
export interface MonthlyPrice {
  month: string; // YYYY-MM
  price: number;
}

/** One Czech Statistical Office representative item (national average price). */
export interface ReferenceItem {
  /** ČSÚ code in the current (from-2026) scheme. */
  code: string;
  /** Label exactly as published, e.g. "Máslo [1 kg]". */
  label: string;
  /** Label with the bracketed packaging removed, e.g. "Máslo". */
  name: string;
  /** The bracketed packaging, e.g. "1 kg". */
  packaging: string;
  unit?: Unit;
  quantity?: number;
  /** COICOP class (first 5 digits of `code`), for grouping. */
  coicop: string;
  history: MonthlyPrice[]; // newest first
}

export interface ReferenceDataset {
  schema: 1;
  source: 'csu';
  generatedAt: string;
  items: ReferenceItem[];
}

export interface CanonicalDataset {
  schema: 1;
  generatedAt: string;
  products: CanonicalProduct[];
}

export interface AssembleMetrics {
  date: string;
  perChain: Record<Store, { today: number; yesterday: number }>;
  priceUp: number;
  priceDown: number;
  appeared: number;
  disappeared: number;
  coverage: import('./coverage.ts').CoverageReport;
}
