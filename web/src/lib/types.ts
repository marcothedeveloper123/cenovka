// Frontend-shaped product / group, adapted from the canonical scraper output.

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

export interface PricePoint {
  date: string;
  price: number;
}

/** Product as rendered in the UI — flatter than the raw canonical record. */
export interface Product {
  id: string; // store::id
  store: Store;
  storeName: string;
  name: string;
  brand?: string;
  category?: string;
  categoryCanonical?: string;
  ean?: string;
  price: number;
  /** CZK / 100g, /100ml, or /ks; undefined when no qty/unit. */
  unitPrice?: number;
  unitPriceLabel?: '100g' | '100ml' | 'ks';
  unit?: Unit;
  quantity?: number;
  available: boolean;
  url: string;
  history: PricePoint[];
  /** Group id (cross-chain match) when known. */
  groupId?: string;
}

export interface MatchGroup {
  id: string;
  category?: string;
  unit?: string;
  quantity?: number;
  productKeys: string[]; // refs into Product.id
}

export interface Dataset {
  generatedAt: string;
  products: Product[];
  groups: MatchGroup[];
  scrapeLog?: ScrapeLog;
}

export interface ScrapeDay {
  products: number;
  errors: number;
  note?: string;
}

export interface ScrapeLog {
  schema: number;
  lastUpdated: string;
  perChain: Partial<Record<Store, Record<string, ScrapeDay>>>;
}
