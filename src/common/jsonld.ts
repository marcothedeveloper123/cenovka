/** Extract all JSON-LD blocks from an HTML page as parsed JS values. */
export function extractJsonLd(html: string): unknown[] {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g;
  const out: unknown[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1]!.trim()));
    } catch {
      // skip malformed blocks
    }
  }
  return out;
}

/** Recursively find the first object with @type === Product (handles @graph etc). */
export function findProduct(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProduct(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj['@type'] === 'Product') return obj;
    for (const v of Object.values(obj)) {
      const found = findProduct(v);
      if (found) return found;
    }
  }
  return null;
}
