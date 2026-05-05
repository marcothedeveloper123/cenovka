import { extractJsonLd, findProduct } from './jsonld.ts';

export interface ParsedJsonLdProduct {
  name: string;
  sku: string;
  price: number;
  brand?: string;
  category?: string;
  ean?: string;
  available: boolean;
}

/** Find the first JSON-LD Product on a page and return its core fields. */
export function readProductJsonLd(html: string): ParsedJsonLdProduct | null {
  for (const block of extractJsonLd(html)) {
    const node = findProduct(block);
    if (!node) continue;
    const parsed = readNode(node);
    if (parsed) return parsed;
  }
  return null;
}

function readNode(node: Record<string, unknown>): ParsedJsonLdProduct | null {
  const name = String(node.name ?? '').trim();
  const sku = String(node.sku ?? '').trim();
  if (!name || !sku) return null;

  const offer = pickOffer(node.offers);
  if (!offer) return null;
  const price = Number(offer.price);
  if (!Number.isFinite(price)) return null;

  return {
    name,
    sku,
    price,
    brand: readBrand(node.brand),
    category: typeof node.category === 'string' ? node.category : undefined,
    ean: readEanCandidate(node),
    available: isInStock(offer.availability),
  };
}

function pickOffer(raw: unknown): { price?: unknown; availability?: unknown } | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as never) : null;
  }
  if (typeof raw === 'object') return raw as never;
  return null;
}

function readBrand(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw !== 'object' || !('name' in (raw as object))) return undefined;
  const n = (raw as Record<string, unknown>).name;
  return typeof n === 'string' ? n : undefined;
}

function readEanCandidate(node: Record<string, unknown>): string | undefined {
  const raw = node.gtin13 ?? node.gtin12 ?? node.gtin;
  return typeof raw === 'string' ? raw : undefined;
}

function isInStock(raw: unknown): boolean {
  if (typeof raw !== 'string') return true;
  return raw.toLowerCase().includes('instock');
}
