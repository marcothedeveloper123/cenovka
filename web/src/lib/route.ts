import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

export function parseHash(): Route {
  const h = (window.location.hash || '#/').slice(1) || '/';
  const [path, qs] = h.split('?');
  return { path: path ?? '/', params: new URLSearchParams(qs ?? '') };
}

export function navigate(path: string, params?: Record<string, string>): void {
  let h = `#${path}`;
  if (params) {
    const sp = new URLSearchParams(params);
    const s = sp.toString();
    if (s) h += `?${s}`;
  }
  window.location.hash = h;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

/** Whether to render the developer Tweaks panel. Gated by `?tweaks=1`. */
export function useTweaksEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => new URL(window.location.href).searchParams.get('tweaks') === '1');
  useEffect(() => {
    const onChange = () => setEnabled(new URL(window.location.href).searchParams.get('tweaks') === '1');
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return enabled;
}
