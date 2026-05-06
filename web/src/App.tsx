import { useEffect, useState } from 'react';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { TweaksPanel } from './components/TweaksPanel.tsx';
import { loadDataset } from './lib/data.ts';
import { useRoute, useTweaksEnabled } from './lib/route.ts';
import { useCart, useFavorites } from './lib/storage.ts';
import type { Dataset } from './lib/types.ts';
import { About } from './pages/About.tsx';
import { Cart } from './pages/Cart.tsx';
import { Compare } from './pages/Compare.tsx';
import { Data } from './pages/Data.tsx';
import { Favorites } from './pages/Favorites.tsx';
import { Home } from './pages/Home.tsx';
import { ProductDetail } from './pages/Product.tsx';
import { Search } from './pages/Search.tsx';
import { Trends } from './pages/Trends.tsx';

export function App(): React.ReactElement {
  const route = useRoute();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cart = useCart();
  const favs = useFavorites();
  const tweaksEnabled = useTweaksEnabled();

  useEffect(() => {
    loadDataset()
      .then(setDataset)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  let page: React.ReactElement;
  if (error) {
    page = (
      <div className="loading">
        <div className="meta" style={{ color: 'var(--up)' }}>CHYBA</div>
        <p style={{ marginTop: 8 }}>Nepodařilo se načíst data: {error}</p>
      </div>
    );
  } else if (!dataset) {
    page = <div className="loading">Načítám data…</div>;
  } else if (route.path === '/' || route.path === '') {
    page = <Home dataset={dataset} />;
  } else if (route.path === '/h') {
    page = <Search dataset={dataset} route={route} />;
  } else if (route.path.startsWith('/c/')) {
    const scopeParam = route.params.get('scope');
    const scope = scopeParam === 'bucket' || scopeParam === 'category' ? scopeParam : 'group';
    page = (
      <Compare
        dataset={dataset}
        groupId={decodeURIComponent(route.path.slice(3))}
        scope={scope}
      />
    );
  } else if (route.path.startsWith('/p/')) {
    page = <ProductDetail dataset={dataset} productId={decodeURIComponent(route.path.slice(3))} />;
  } else if (route.path === '/k') {
    page = <Cart dataset={dataset} />;
  } else if (route.path === '/f') {
    page = <Favorites dataset={dataset} />;
  } else if (route.path === '/d') {
    page = <Data dataset={dataset} />;
  } else if (route.path === '/o') {
    page = <About dataset={dataset} />;
  } else if (route.path === '/t') {
    page = <Trends dataset={dataset} />;
  } else {
    page = (
      <div className="loading">
        <div className="meta">PŘIPRAVUJEME</div>
        <p style={{ marginTop: 8 }}>
          Stránka <code>{route.path}</code> se teprve staví. Zatím zkuste{' '}
          <a href="#/" style={{ borderBottom: '1px solid currentColor' }}>domovskou stránku</a>.
        </p>
      </div>
    );
  }

  const initialQuery = route.path === '/h' ? route.params.get('q') ?? '' : '';

  return (
    <div className="app">
      <Header active={route.path} cartCount={cart.total} favCount={favs.count} initialQuery={initialQuery} />
      <main style={{ flex: 1 }}>{page}</main>
      <Footer />
      {tweaksEnabled && dataset && <TweaksPanel dataset={dataset} routePath={route.path} />}
    </div>
  );
}
