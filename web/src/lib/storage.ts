import { useEffect, useState } from 'react';

/** Reactive `localStorage`-backed JSON value. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // out of quota or private mode — ignore
    }
  }, [key, value]);
  return [value, setValue];
}

export function useFavorites(): {
  has: (groupId: string) => boolean;
  toggle: (groupId: string) => void;
  count: number;
} {
  const [favs, setFavs] = usePersisted<string[]>('cenovka-favs', []);
  return {
    has: (id) => favs.includes(id),
    toggle: (id) => setFavs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    count: favs.length,
  };
}

export function useCart(): {
  items: Record<string, number>;
  add: (groupId: string, qty?: number) => void;
  set: (groupId: string, qty: number) => void;
  remove: (groupId: string) => void;
  total: number;
} {
  const [items, setItems] = usePersisted<Record<string, number>>('cenovka-cart', {});
  return {
    items,
    add: (id, qty = 1) => setItems((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + qty })),
    set: (id, qty) =>
      setItems((prev) => {
        const next = { ...prev };
        if (qty <= 0) delete next[id];
        else next[id] = qty;
        return next;
      }),
    remove: (id) => setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    }),
    total: Object.values(items).reduce((a, b) => a + b, 0),
  };
}
