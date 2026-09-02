import { useState } from 'react';
import { navigate } from '../lib/route.ts';

interface Props {
  active: string;
  cartCount: number;
  favCount: number;
  initialQuery?: string;
}

export function Header({ active, cartCount, favCount, initialQuery = '' }: Props): React.ReactElement {
  const [q, setQ] = useState(initialQuery);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate('/h', { q: q.trim() });
  };

  return (
    <header className="top">
      <div className="container top-row">
        <a href="#/" className="brand">
          <span className="brand-dot" />
          cenovka
        </a>

        <form className="top-search" onSubmit={onSubmit}>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="máslo, mléko, !price &lt; 50…"
            aria-label="Hledat"
          />
        </form>

        <nav className="nav">
          <a href="#/h" className={active === '/h' ? 'active' : ''}>Hledat</a>
          <a href="#/t" className={active === '/t' ? 'active' : ''}>Trendy</a>
          <a href="#/r" className={active === '/r' ? 'active' : ''}>Průměr&nbsp;ČR</a>
          <a href="#/d" className={active === '/d' ? 'active' : ''}>Data</a>
          <a href="#/o" className={active === '/o' ? 'active' : ''}>O&nbsp;projektu</a>
          <a
            href="#/f"
            className={`fav-pill ${active === '/f' || favCount > 0 ? 'active' : ''}`}
            aria-label="Oblíbené"
          >
            ★ <span className="count">{favCount}</span>
          </a>
          <a href="#/k" className="cart-pill" aria-label="Košík">
            Košík
            <span className="count">{cartCount}</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
