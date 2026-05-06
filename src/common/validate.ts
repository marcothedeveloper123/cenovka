import { classifyCategory } from './categories.ts';
import type { Product } from './types.ts';

const MIN_PRICE = 0.01;
const MAX_PRICE = 100_000;

const BRAND_ALIASES: Record<string, string> = {
  TESCO: 'Tesco',
  'TESCO FINEST': 'Tesco Finest',
  REXONA: 'Rexona',
  HIPP: 'Hipp',
};

export interface ValidationOutcome {
  product: Product | null;
  warnings: string[];
}

export function cleanProduct(raw: Product): ValidationOutcome {
  const warnings: string[] = [];
  const name = cleanString(raw.name);
  if (!name) {
    warnings.push('empty name');
    return { product: null, warnings };
  }

  if (!Number.isFinite(raw.price) || raw.price < MIN_PRICE) {
    warnings.push(`price ${raw.price} below floor ${MIN_PRICE}`);
    return { product: null, warnings };
  }
  if (raw.price > MAX_PRICE) {
    warnings.push(`price ${raw.price} above ceiling ${MAX_PRICE}`);
    return { product: null, warnings };
  }

  const brand = raw.brand ? canonicalBrand(cleanString(raw.brand) ?? raw.brand) : undefined;
  const category = raw.category ? cleanString(raw.category) : undefined;
  const categoryCanonical = classifyCategory(category, raw.store);
  const url = canonicalUrl(raw.url);

  let ean = raw.ean;
  if (ean !== undefined && !isValidEan(ean)) {
    warnings.push(`invalid EAN: ${ean}`);
    ean = undefined;
  } else if (ean !== undefined) {
    ean = normalizeEan(ean);
  }

  return {
    product: { ...raw, name, brand, category, categoryCanonical, url, ean },
    warnings,
  };
}

export function cleanString(input: string): string {
  return input
    .replace(/ /g, ' ') // non-breaking space → regular space
    .replace(/[​-‍﻿]/g, '') // zero-width chars
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalBrand(brand: string): string {
  const upper = brand.toUpperCase();
  return BRAND_ALIASES[upper] ?? brand;
}

function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    // strip tracking and session-y params
    const dropPrefixes = ['utm_', 'icid', 'gclid', 'fbclid', '_ga'];
    for (const k of [...u.searchParams.keys()]) {
      if (dropPrefixes.some((p) => k.toLowerCase().startsWith(p))) u.searchParams.delete(k);
    }
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * Strip leading zeros from a valid EAN/GTIN, then re-pad to 13 digits
 * (canonical EAN-13 length). This makes a Tesco GTIN-14 like
 * "08593837256846" equal to a Globus EAN-13 "8593837256846" — same product,
 * different padding.
 *
 * EAN-8 is left alone (it's a separate numbering scheme, not a padded EAN-13).
 */
export function normalizeEan(raw: string): string {
  if (raw.length === 8) return raw;
  const stripped = raw.replace(/^0+/, '');
  return stripped.padStart(13, '0');
}

/** GTIN-13 / EAN-13 / UPC-A / EAN-8 mod-10 check. */
export function isValidEan(raw: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(raw)) return false;
  const digits = raw.split('').map(Number);
  const check = digits[digits.length - 1]!;
  // Walk from the rightmost data digit leftward, alternating weights 3,1,3,1,...
  let sum = 0;
  for (let i = digits.length - 2; i >= 0; i--) {
    const weight = (digits.length - 2 - i) % 2 === 0 ? 3 : 1;
    sum += digits[i]! * weight;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}
