/**
 * Helpers for reading Nuxt 3's `__NUXT_DATA__` payload, which is a flat array
 * where object/array values are stored as integer indices back into the array.
 * Some fields are literal numbers (prices, weights) — schema-awareness is the
 * caller's responsibility.
 */

export type NuxtArray = readonly unknown[];

export function extractNuxtArray(html: string): NuxtArray | null {
  const m = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]!);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readString(arr: NuxtArray, ref: unknown): string | undefined {
  const v = lookup(arr, ref);
  return typeof v === 'string' ? v : undefined;
}

export function readNumber(arr: NuxtArray, ref: unknown): number | undefined {
  const v = lookup(arr, ref);
  return typeof v === 'number' ? v : undefined;
}

export function readObject(arr: NuxtArray, ref: unknown): Record<string, unknown> | undefined {
  const v = lookup(arr, ref);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

export function readList(arr: NuxtArray, ref: unknown): unknown[] | undefined {
  const v = lookup(arr, ref);
  return Array.isArray(v) ? (v as unknown[]) : undefined;
}

function lookup(arr: NuxtArray, ref: unknown): unknown {
  if (typeof ref !== 'number' || !Number.isInteger(ref)) return undefined;
  if (ref < 0 || ref >= arr.length) return undefined;
  return arr[ref];
}

/** Find the first object in the payload that has all the required keys. */
export function findFirstWithKeys(
  arr: NuxtArray,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  for (const item of arr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    if (keys.every((k) => k in obj)) return obj;
  }
  return undefined;
}
