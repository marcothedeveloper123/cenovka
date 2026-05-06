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
  return findByType(node, 'Product');
}

/** Recursively find the first object with @type === BreadcrumbList. */
export function findBreadcrumbList(node: unknown): Record<string, unknown> | null {
  return findByType(node, 'BreadcrumbList');
}

function findByType(node: unknown, type: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findByType(item, type);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj['@type'] === type) return obj;
    for (const v of Object.values(obj)) {
      const found = findByType(v, type);
      if (found) return found;
    }
  }
  return null;
}

/** Extract clean category names from a BreadcrumbList node. Drops "Home"/"Domů" leading entry. */
export function readBreadcrumb(html: string): string | undefined {
  for (const block of extractJsonLd(html)) {
    const list = findBreadcrumbList(block);
    if (!list) continue;
    const items = Array.isArray(list.itemListElement) ? list.itemListElement : [];
    const names: string[] = [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const node = it as Record<string, unknown>;
      const direct = typeof node.name === 'string' ? node.name : undefined;
      const item = node.item as Record<string, unknown> | undefined;
      const nested = typeof item?.name === 'string' ? item.name : undefined;
      const name = (direct ?? nested ?? '').trim();
      if (name && name !== 'Home' && name !== 'Domů') names.push(name);
    }
    if (names.length > 0) return names.join(' > ');
  }
  return undefined;
}
