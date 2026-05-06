export type Store =
  | 'tesco'
  | 'rohlik'
  | 'kosik'
  | 'lidl'
  | 'billa'
  | 'penny'
  | 'globus';

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
