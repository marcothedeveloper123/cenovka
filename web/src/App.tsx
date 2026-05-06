import { useEffect, useState } from 'react';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { loadDataset } from './lib/data.ts';
import { useRoute } from './lib/route.ts';
import { useCart, useFavorites } from './lib/storage.ts';
import type { Dataset } from './lib/types.ts';
import { Home } from './pages/Home.tsx';
import { Search } from './pages/Search.tsx';

export function App(): React.ReactElement {
  const route = useRoute();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cart = useCart();
  const favs = useFavorites();

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
    </div>
  );
}
